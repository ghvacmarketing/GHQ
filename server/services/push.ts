import http2 from "http2";
import crypto from "crypto";
import { db } from "../db";
import { crmNotifications, pushDeviceTokens } from "@shared/schema";
import { eq, gt, inArray } from "drizzle-orm";

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

/** Send one alert to one device. Resolves to "ok", "gone" (dead token — the
 *  caller should delete it), or "error". */
function apnsSend(
  deviceToken: string,
  alert: { title: string; body?: string; link?: string },
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
        JSON.stringify({
          aps: { alert: { title: alert.title, body: alert.body || "" }, sound: "default", badge: 1 },
          link: alert.link || null,
        }),
      );
    } catch (e) {
      console.error("[push] send failed:", (e as any)?.message || e);
      resolve("error");
    }
  });
}

/** Push an alert to every device a CRM user has registered. */
export async function sendPushToUser(userId: string, alert: { title: string; body?: string; link?: string }): Promise<void> {
  if (!pushConfigured()) return;
  const devices = await db.select().from(pushDeviceTokens).where(eq(pushDeviceTokens.userId, userId));
  const dead: string[] = [];
  for (const d of devices) {
    const r = await apnsSend(d.token, alert);
    if (r === "gone") dead.push(d.token);
  }
  if (dead.length > 0) await db.delete(pushDeviceTokens).where(inArray(pushDeviceTokens.token, dead));
}

/** Deep link for a notification row — mirrors the web notification drawer. */
function notificationLink(n: { entityType: string | null; entityId: string | null }): string | undefined {
  if (!n.entityType || !n.entityId) return undefined;
  const map: Record<string, string> = {
    customer: "/crm/customers",
    work_order: "/crm/work-orders",
    quote: "/crm/quotes",
    invoice: "/crm/invoices",
    project: "/crm/projects",
    task: "/crm/tasks",
  };
  const base = map[n.entityType];
  return base ? `${base}/${n.entityId}` : undefined;
}

let bridgeStarted = false;
export function startPushNotificationBridge(): void {
  if (bridgeStarted) return;
  bridgeStarted = true;
  if (!pushConfigured()) {
    console.log("[push] APNS_AUTH_KEY/APNS_KEY_ID/APPLE_TEAM_ID not set — native push disabled");
    return;
  }
  let lastSeen = new Date();
  setInterval(async () => {
    try {
      const rows = await db
        .select()
        .from(crmNotifications)
        .where(gt(crmNotifications.createdAt, lastSeen))
        .limit(200);
      if (rows.length === 0) return;
      lastSeen = rows.reduce((m, r) => (r.createdAt && r.createdAt > m ? r.createdAt : m), lastSeen);
      for (const n of rows) {
        await sendPushToUser(n.userId, {
          title: n.title,
          body: n.preview || undefined,
          link: notificationLink(n),
        }).catch(() => {});
      }
    } catch (e) {
      console.error("[push] bridge tick failed:", (e as any)?.message || e);
    }
  }, 3_000);
  console.log("[push] notification bridge running (APNs, 3s cadence)");
}
