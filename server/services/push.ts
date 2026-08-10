import http2 from "http2";
import crypto from "crypto";
import { db } from "../db";
import { crmNotifications, pushDeviceTokens } from "@shared/schema";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

/** APNs push for the iOS shell app — no SDK, just HTTP/2 + an ES256 JWT.
 *
 *  Config (Render env):
 *    APNS_AUTH_KEY   — contents of the APNs auth key .p8 (BEGIN PRIVATE KEY…)
 *    APNS_KEY_ID     — the key's 10-char id
 *    APPLE_TEAM_ID   — 47JHV3522G (Giesbrecht HVAC's team)
 *    APNS_TOPIC      — bundle id, defaults to app.ghvac.tools
 *    APNS_SANDBOX    — "1" to use the sandbox gateway (dev builds)
 *
 *  Delivery model: rather than instrumenting every crm_notifications insert
 *  (they're scattered across dozens of call sites), a small bridge polls for
 *  new rows every 20s and fans each one out to the user's registered devices.
 *  Lock-screen latency is therefore ≤ ~20s, which is fine for CRM events.
 */

const APNS_TOPIC = () => process.env.APNS_TOPIC || "app.ghvac.tools";
const APNS_HOST = () =>
  process.env.APNS_SANDBOX === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";

export function pushConfigured(): boolean {
  return !!(process.env.APNS_AUTH_KEY && process.env.APNS_KEY_ID && process.env.APPLE_TEAM_ID);
}

// APNs provider JWTs are valid 20–60 min; refresh at 45.
let jwtCache: { at: number; token: string } | null = null;
function apnsJwt(): string {
  if (jwtCache && Date.now() - jwtCache.at < 45 * 60 * 1000) return jwtCache.token;
  const b64 = (s: string | Buffer) =>
    Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }));
  const payload = b64(JSON.stringify({ iss: process.env.APPLE_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const key = crypto.createPrivateKey(String(process.env.APNS_AUTH_KEY).replace(/\\n/g, "\n"));
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  jwtCache = { at: Date.now(), token: `${header}.${payload}.${b64(sig)}` };
  return jwtCache.token;
}

/** Send one alert (or a silent badge-only update when alert is null) to one
 *  device. Resolves to "ok", "gone" (dead token — the caller should delete
 *  it), or "error". The badge is the user's REAL unread count, not a
 *  hardcoded 1. */
function apnsSend(
  deviceToken: string,
  alert: { title: string; body?: string; link?: string; notificationId?: string } | null,
  badge: number,
): Promise<"ok" | "gone" | "error"> {
  return new Promise((resolve) => {
    try {
      const client = http2.connect(APNS_HOST());
      client.on("error", () => resolve("error"));
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${apnsJwt()}`,
        "apns-topic": APNS_TOPIC(),
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0;
      let body = "";
      req.on("response", (h) => { status = Number(h[":status"] || 0); });
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        client.close();
        if (status === 200) return resolve("ok");
        if (status === 410 || /BadDeviceToken|Unregistered/i.test(body)) return resolve("gone");
        console.error(`[push] APNs ${status}: ${body.slice(0, 200)}`);
        resolve("error");
      });
      req.on("error", () => { client.close(); resolve("error"); });
      req.end(
        JSON.stringify(
          alert
            ? {
                aps: { alert: { title: alert.title, body: alert.body || "" }, sound: "default", badge },
                link: alert.link || null,
                // Tapping the banner marks THIS row read in GHQ (the client
                // PATCHes it before following the link)
                notificationId: alert.notificationId || null,
              }
            : { aps: { badge } }, // badge-only: updates the icon, no banner
        ),
      );
    } catch (e) {
      console.error("[push] send failed:", (e as any)?.message || e);
      resolve("error");
    }
  });
}

/** The user's live unread-notification count — what the icon badge shows. */
async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(crmNotifications)
    .where(and(eq(crmNotifications.userId, userId), eq(crmNotifications.isRead, false)));
  return Number(row?.n || 0);
}

/** Push an alert to every device a CRM user has registered. */
export async function sendPushToUser(userId: string, alert: { title: string; body?: string; link?: string; notificationId?: string }): Promise<void> {
  if (!pushConfigured()) return;
  const devices = await db.select().from(pushDeviceTokens).where(eq(pushDeviceTokens.userId, userId));
  if (devices.length === 0) return;
  const badge = await unreadCount(userId);
  const dead: string[] = [];
  for (const d of devices) {
    const r = await apnsSend(d.token, alert, badge);
    if (r === "gone") dead.push(d.token);
  }
  if (dead.length > 0) await db.delete(pushDeviceTokens).where(inArray(pushDeviceTokens.token, dead));
}

/** Re-sync the icon badge to the real unread count (silent — no banner).
 *  Debounced per user: mark-all-read fires one PATCH per row and we want
 *  ONE badge update at the end, not a countdown. */
const badgeSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function queueBadgeSync(userId: string): void {
  if (!pushConfigured()) return;
  const prior = badgeSyncTimers.get(userId);
  if (prior) clearTimeout(prior);
  badgeSyncTimers.set(
    userId,
    setTimeout(async () => {
      badgeSyncTimers.delete(userId);
      try {
        const devices = await db.select().from(pushDeviceTokens).where(eq(pushDeviceTokens.userId, userId));
        if (devices.length === 0) return;
        const badge = await unreadCount(userId);
        const dead: string[] = [];
        for (const d of devices) {
          const r = await apnsSend(d.token, null, badge);
          if (r === "gone") dead.push(d.token);
        }
        if (dead.length > 0) await db.delete(pushDeviceTokens).where(inArray(pushDeviceTokens.token, dead));
      } catch (e) {
        console.error("[push] badge sync failed:", (e as any)?.message || e);
      }
    }, 1_500),
  );
}

/** Deep link for a notification row. These pushes land ONLY on phones, so
 *  the links are MOBILE routes — the old /crm/... desktop paths made every
 *  tap bounce back to the agenda instead of the thing the push was about. */
function notificationLink(n: { entityType: string | null; entityId: string | null }): string | undefined {
  if (!n.entityType || !n.entityId) return undefined;
  const map: Record<string, string> = {
    customer: `/mobile/customers/${n.entityId}`,
    work_order: `/mobile/job/${n.entityId}`,
    quote: `/mobile/quotes/${n.entityId}`,
    invoice: `/mobile/invoices/${n.entityId}`,
    task: `/mobile/tasks?task=${n.entityId}`,
  };
  return map[n.entityType];
}

let bridgeStarted = false;
export function startPushNotificationBridge(): void {
  if (bridgeStarted) return;
  bridgeStarted = true;
  if (!pushConfigured()) {
    console.log("[push] APNS_AUTH_KEY/APNS_KEY_ID/APPLE_TEAM_ID not set — native push disabled");
    return;
  }
  // The cursor advances on EPOCH MS (driver-agnostic: createdAt may come
  // back as a Date or a naive string depending on the driver), and a sent-id
  // set makes re-sends impossible no matter what the timestamps do — a
  // string-vs-Date comparison here once silently never advanced the cursor
  // and re-pushed every row since boot on every tick.
  let lastSeenMs = Date.now();
  const pushed = new Set<string>();
  setInterval(async () => {
    try {
      // Small overlap window: the id set already dedupes, and it protects
      // against sub-second cursor rounding dropping a row entirely.
      const rows = await db
        .select()
        .from(crmNotifications)
        .where(and(gt(crmNotifications.createdAt, new Date(lastSeenMs - 5_000)), isNull(crmNotifications.pushedAt)))
        .limit(200);
      for (const n of rows) {
        const t = n.createdAt ? new Date(n.createdAt as unknown as string | Date).getTime() : 0;
        if (Number.isFinite(t) && t > lastSeenMs) lastSeenMs = t;
        if (pushed.has(n.id)) continue;
        pushed.add(n.id);
        // Atomic cross-instance claim: during a deploy TWO instances run
        // this bridge — only the one that stamps pushed_at gets to send.
        const claimed = await db
          .update(crmNotifications)
          .set({ pushedAt: new Date() })
          .where(and(eq(crmNotifications.id, n.id), isNull(crmNotifications.pushedAt)))
          .returning({ id: crmNotifications.id });
        if (claimed.length === 0) continue;
        await sendPushToUser(n.userId, {
          title: n.title,
          body: n.preview || undefined,
          link: notificationLink(n),
          notificationId: n.id,
        }).catch(() => {});
      }
      if (pushed.size > 4_000) {
        // Keep the newest half (insertion order) — bounded memory, and the
        // dropped ids are long past the cursor window anyway.
        const keep = Array.from(pushed).slice(-2_000);
        pushed.clear();
        keep.forEach((id) => pushed.add(id));
      }
    } catch (e) {
      console.error("[push] bridge tick failed:", (e as any)?.message || e);
    }
  }, 3_000);
  console.log("[push] notification bridge running (APNs, 3s cadence)");
}
