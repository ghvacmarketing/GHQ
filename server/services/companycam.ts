import { db } from "../db";
import {
  companycamProjectLinks,
  companycamPushedPhotos,
  crmCustomers,
  crmProperties,
  crmUsers,
  customerFiles,
} from "@shared/schema";
import { eq, sql, like } from "drizzle-orm";

/** CompanyCam integration — reference sync, never binary import.
 *
 *  Pull: projects are matched to CRM customers BY ADDRESS (street number is
 *  the anchor); each matched project's photos land in customer_files as
 *  reference rows (url = CompanyCam CDN, objectPath = "companycam:<id>" as
 *  the dedupe key) so every existing gallery surface shows them with zero UI
 *  changes. VIDEOS come along the same way (objectPath =
 *  "companycam-video:<id>", contentType video/*, thumbUrl = poster frame) —
 *  the bytes stay on CompanyCam's CDN. Deletes never propagate in either
 *  direction.
 *
 *  Push: new CRM photo uploads for a linked customer are sent up to the
 *  matching CompanyCam project via URL ingest (/objects is public); the
 *  returned photo id is recorded so the next pull skips it (no boomerang).
 */

const CC_BASE = "https://api.companycam.com/v2";

export function companycamConfigured(): boolean {
  return !!process.env.COMPANYCAM_API_TOKEN;
}

async function ccFetch(path: string): Promise<any> {
  const res = await fetch(`${CC_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.COMPANYCAM_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CompanyCam ${path} -> ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function ccPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${CC_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COMPANYCAM_API_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CompanyCam POST ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function ccPut(path: string, body: any): Promise<any> {
  const res = await fetch(`${CC_BASE}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.COMPANYCAM_API_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CompanyCam PUT ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

type CcProject = {
  id: string;
  name: string | null;
  archived: boolean;
  status: string;
  photo_count: number | null;
  address: {
    street_address_1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  } | null;
};

type CcPhoto = {
  id: string;
  project_id: string;
  creator_id: string | null;
  creator_name: string | null;
  captured_at: number | null; // unix seconds
  created_at?: number | null;
  status?: string;
  uris: Array<{ type: string; uri: string; url?: string }>;
};

async function fetchAllProjects(): Promise<CcProject[]> {
  const all: CcProject[] = [];
  for (let page = 1; page <= 50; page++) {
    const rows: CcProject[] = await ccFetch(`/projects?per_page=100&page=${page}`);
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

async function fetchProjectPhotos(projectId: string): Promise<CcPhoto[]> {
  const all: CcPhoto[] = [];
  for (let page = 1; page <= 100; page++) {
    const rows: CcPhoto[] = await ccFetch(`/projects/${projectId}/photos?per_page=100&page=${page}`);
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

/** Same shape as photos: id, creator, captured_at, uris[]. Videos stay on
 *  CompanyCam's CDN — we only import reference rows, never the bytes. */
type CcVideo = {
  id: string;
  project_id: string;
  creator_id: string | null;
  creator_name: string | null;
  captured_at: number | null;
  created_at?: number | null;
  status?: string;
  uris: Array<{ type: string; uri: string; url?: string }>;
};

async function fetchProjectVideos(projectId: string): Promise<CcVideo[]> {
  const all: CcVideo[] = [];
  for (let page = 1; page <= 50; page++) {
    const rows: CcVideo[] = await ccFetch(`/projects/${projectId}/videos?per_page=100&page=${page}`);
    if (!Array.isArray(rows)) break;
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

/** Content type from a CDN url's extension — CompanyCam videos are mp4/mov. */
function videoContentType(uri: string): string {
  const ext = (uri.split("?")[0].split(".").pop() || "").toLowerCase();
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "video/mp4";
}

// ---- Address matching ---------------------------------------------------

const STREET_ABBREV: Record<string, string> = {
  road: "rd", street: "st", drive: "dr", lane: "ln", avenue: "ave", court: "ct",
  circle: "cir", highway: "hwy", boulevard: "blvd", place: "pl", terrace: "ter",
  parkway: "pkwy", north: "n", south: "s", east: "e", west: "w", trail: "trl",
};

function normalizeAddress(raw: string): { number: string | null; tokens: string[] } {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .split(" ")
    .map((t) => STREET_ABBREV[t] || t)
    .filter(Boolean);
  const number = tokens.find((t) => /^\d+$/.test(t)) || null;
  return { number, tokens: tokens.filter((t) => !/^\d+$/.test(t)) };
}

/** 0-100. The street NUMBER is the anchor — without a matching number the
 *  score is capped low so "123 Main St" never auto-matches "456 Main St". */
export function addressMatchScore(ccAddress: string, crmAddress: string): number {
  const a = normalizeAddress(ccAddress);
  const b = normalizeAddress(crmAddress);
  if (a.tokens.length === 0 || b.tokens.length === 0) return 0;
  const setB = new Set(b.tokens);
  let overlap = 0;
  for (const t of a.tokens) if (setB.has(t)) overlap++;
  const tokenScore = (2 * overlap) / (a.tokens.length + setB.size);
  if (!a.number || !b.number) return Math.round(tokenScore * 40);
  if (a.number !== b.number) return Math.round(tokenScore * 25);
  return Math.round(40 + tokenScore * 60); // number matches: 40 base + token quality
}

// ---- Sync ---------------------------------------------------------------

export interface CompanycamSyncResult {
  projects: number;
  autoMatched: number;
  unmatched: number;
  photosImported: number;
  errors: string[];
}

let syncRunning = false;

export async function syncCompanycam(): Promise<CompanycamSyncResult> {
  if (!companycamConfigured()) throw new Error("COMPANYCAM_API_TOKEN is not set");
  if (syncRunning) throw new Error("A CompanyCam sync is already running");
  syncRunning = true;
  const result: CompanycamSyncResult = { projects: 0, autoMatched: 0, unmatched: 0, photosImported: 0, errors: [] };
  try {
    const [projects, customers, properties, existingLinks] = await Promise.all([
      fetchAllProjects(),
      db.select({ id: crmCustomers.id, name: crmCustomers.name, fullAddress: crmCustomers.fullAddress }).from(crmCustomers),
      db.select({ customerId: crmProperties.customerId, address1: crmProperties.address1, city: crmProperties.city }).from(crmProperties),
      db.select().from(companycamProjectLinks),
    ]);
    result.projects = projects.length;
    const linkById = new Map(existingLinks.map((l) => [l.ccProjectId, l]));

    // Every address a customer answers to (their own + their properties)
    const candidateAddresses: Array<{ customerId: string; address: string }> = [];
    for (const c of customers) {
      if (c.fullAddress) candidateAddresses.push({ customerId: c.id, address: c.fullAddress });
    }
    for (const p of properties) {
      if (p.customerId && p.address1) {
        candidateAddresses.push({ customerId: p.customerId, address: `${p.address1} ${p.city || ""}` });
      }
    }

    for (const proj of projects) {
      const addrParts = [proj.address?.street_address_1, proj.address?.city, proj.address?.state].filter(Boolean);
      const ccAddress = addrParts.join(", ");
      const existing = linkById.get(proj.id);

      let customerId = existing?.customerId ?? null;
      let matchType = existing?.matchType ?? "unmatched";
      let matchScore = existing?.matchScore ?? null;

      // Only auto-(re)match links the user hasn't touched (manual/ignored stick)
      if (matchType === "unmatched" || matchType === "auto") {
        let best: { customerId: string; score: number } | null = null;
        if (ccAddress) {
          for (const cand of candidateAddresses) {
            const score = addressMatchScore(proj.address?.street_address_1 || ccAddress, cand.address);
            if (!best || score > best.score) best = { customerId: cand.customerId, score };
          }
        }
        if (best && best.score >= 70) {
          customerId = best.customerId;
          matchType = "auto";
          matchScore = best.score;
          result.autoMatched++;
        } else {
          customerId = null;
          matchType = "unmatched";
          matchScore = best?.score ?? null;
          result.unmatched++;
        }
      }

      if (existing) {
        await db
          .update(companycamProjectLinks)
          .set({
            ccProjectName: proj.name || null,
            ccAddress: ccAddress || null,
            customerId,
            matchType,
            matchScore,
            photoCount: proj.photo_count ?? 0,
            archived: !!proj.archived,
            lastSyncedAt: new Date(),
          })
          .where(eq(companycamProjectLinks.ccProjectId, proj.id));
      } else {
        await db.insert(companycamProjectLinks).values({
          ccProjectId: proj.id,
          ccProjectName: proj.name || null,
          ccAddress: ccAddress || null,
          customerId,
          matchType,
          matchScore,
          photoCount: proj.photo_count ?? 0,
          archived: !!proj.archived,
          lastSyncedAt: new Date(),
        });
      }

      if (customerId && matchType !== "ignored") {
        try {
          result.photosImported += await importProjectPhotos(proj.id, customerId, proj.name || "CompanyCam");
        } catch (e: any) {
          result.errors.push(`photos for ${proj.name || proj.id}: ${e?.message || e}`);
        }
      }
    }
    console.log(
      `[CompanyCam] sync done: ${result.projects} projects, ${result.autoMatched} auto-matched, ${result.unmatched} unmatched, ${result.photosImported} photos imported`,
    );
    return result;
  } finally {
    syncRunning = false;
  }
}

/** CompanyCam creators and CRM users are the same people. Matching order:
 *  1. EMAIL — CompanyCam's user list carries emails that mirror the CRM's
 *     (chandler@ghvacinc.com etc.); normalized compare, apostrophes stripped.
 *  2. Exact normalized full-name match.
 *  3. Unique FIRST-NAME match — most CRM accounts are first-name only
 *     ("Chandler") while CompanyCam has full names ("Chandler Giesbrecht");
 *     match only when exactly one CRM user owns that first name. */
const normEmail = (e: string) => e.toLowerCase().replace(/'/g, "").trim();
const normName = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

let ccUserCache: { at: number; byId: Map<string, { email: string | null; name: string }> } | null = null;
async function ccUsersById(): Promise<Map<string, { email: string | null; name: string }>> {
  if (ccUserCache && Date.now() - ccUserCache.at < 10 * 60 * 1000) return ccUserCache.byId;
  const byId = new Map<string, { email: string | null; name: string }>();
  try {
    for (let page = 1; page <= 10; page++) {
      const rows: any[] = await ccFetch(`/users?per_page=100&page=${page}`);
      for (const u of rows) {
        byId.set(String(u.id), {
          email: u.email_address || null,
          name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
        });
      }
      if (rows.length < 100) break;
    }
  } catch {
    // users endpoint hiccup — name matching still works
  }
  ccUserCache = { at: Date.now(), byId };
  return byId;
}

let crmUserCache: {
  at: number;
  users: Array<{ id: string; norm: string; first: string; email: string | null }>;
} | null = null;
async function crmUserList() {
  if (crmUserCache && Date.now() - crmUserCache.at < 10 * 60 * 1000) return crmUserCache.users;
  const rows = await db.select({ id: crmUsers.id, name: crmUsers.name, email: crmUsers.email }).from(crmUsers);
  crmUserCache = {
    at: Date.now(),
    users: rows
      .filter((u) => u.name)
      .map((u) => {
        const norm = normName(u.name);
        return { id: u.id, norm, first: norm.split(" ")[0] || "", email: u.email ? normEmail(u.email) : null };
      }),
  };
  return crmUserCache.users;
}

async function matchCreatorToUser(creatorId: string | null, creatorName: string | null): Promise<string | null> {
  const users = await crmUserList();

  if (creatorId) {
    const ccUser = (await ccUsersById()).get(String(creatorId));
    if (ccUser?.email) {
      const em = normEmail(ccUser.email);
      const byEmail = users.find((u) => u.email === em);
      if (byEmail) return byEmail.id;
    }
    if (!creatorName && ccUser?.name) creatorName = ccUser.name;
  }

  if (!creatorName?.trim()) return null;
  const norm = normName(creatorName);
  if (!norm) return null;
  const exact = users.find((u) => u.norm === norm);
  if (exact) return exact.id;
  const first = norm.split(" ")[0];
  const byFirst = users.filter((u) => u.first === first);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

/** Import one project's photos AND videos as reference rows on the customer.
 *  Returns the number of NEW rows. Also backfills uploader attribution on
 *  rows imported before creator matching existed. */
export async function importProjectPhotos(ccProjectId: string, customerId: string, projectName: string): Promise<number> {
  // Videos are best-effort: an accounts-without-video plan (or an API shape
  // change) must never block the photo import.
  const [photos, videos] = await Promise.all([
    fetchProjectPhotos(ccProjectId),
    fetchProjectVideos(ccProjectId).catch((e) => {
      console.error(`[CompanyCam] video fetch failed for project ${ccProjectId}:`, e?.message || e);
      return [] as CcVideo[];
    }),
  ]);

  // "companycam%" covers both key shapes: companycam:<id> and companycam-video:<id>
  const existing = await db
    .select({ id: customerFiles.id, objectPath: customerFiles.objectPath, uploadedBy: customerFiles.uploadedBy, thumbUrl: customerFiles.thumbUrl })
    .from(customerFiles)
    .where(like(customerFiles.objectPath, "companycam%"));
  const have = new Map(existing.map((r) => [r.objectPath, r]));

  const pushed = await db.select({ ccPhotoId: companycamPushedPhotos.ccPhotoId }).from(companycamPushedPhotos);
  const pushedIds = new Set(pushed.map((r) => r.ccPhotoId));

  let imported = 0;
  for (const photo of photos) {
    if (photo.status && photo.status !== "active") continue;
    const key = `companycam:${photo.id}`;
    if (pushedIds.has(photo.id)) continue;
    const webUri = photo.uris.find((u) => u.type === "web")?.uri || null;
    const existingRow = have.get(key);
    if (existingRow) {
      // Backfill uploader attribution and grid thumbnails on rows that
      // predate those features (one combined update when needed).
      const patch: Record<string, unknown> = {};
      if (!existingRow.uploadedBy) {
        const userId = await matchCreatorToUser(photo.creator_id, photo.creator_name);
        if (userId) patch.uploadedBy = userId;
      }
      if (!existingRow.thumbUrl && webUri) patch.thumbUrl = webUri;
      if (Object.keys(patch).length > 0) {
        await db.update(customerFiles).set(patch).where(eq(customerFiles.id, existingRow.id));
      }
      continue;
    }
    const original = photo.uris.find((u) => u.type === "original") || photo.uris[0];
    if (!original?.uri) continue;
    const capturedAt = photo.captured_at || photo.created_at || null;
    await db.insert(customerFiles).values({
      customerId,
      name: `CompanyCam ${projectName}${capturedAt ? ` ${new Date(capturedAt * 1000).toISOString().slice(0, 10)}` : ""}.jpg`,
      url: original.uri,
      thumbUrl: webUri,
      objectPath: key,
      contentType: "image/jpeg",
      size: null,
      uploadedBy: await matchCreatorToUser(photo.creator_id, photo.creator_name),
      createdAt: capturedAt ? new Date(capturedAt * 1000) : new Date(),
    });
    imported++;
  }

  for (const video of videos) {
    if (video.status && video.status !== "active") continue;
    const key = `companycam-video:${video.id}`;
    if (have.has(key)) continue;
    const uris = Array.isArray(video.uris) ? video.uris : [];
    const source = uris.find((u) => u.type === "original") || uris.find((u) => u.type === "web") || uris[0];
    if (!source?.uri) continue;
    // Poster frame for grids — any image-ish uri CompanyCam provides.
    const thumb = uris.find((u) => u.type === "thumbnail")?.uri || uris.find((u) => u.type === "poster")?.uri || null;
    const capturedAt = video.captured_at || video.created_at || null;
    await db.insert(customerFiles).values({
      customerId,
      name: `CompanyCam ${projectName} video${capturedAt ? ` ${new Date(capturedAt * 1000).toISOString().slice(0, 10)}` : ""}.mp4`,
      url: source.uri,
      thumbUrl: thumb,
      objectPath: key,
      contentType: videoContentType(source.uri),
      size: null,
      uploadedBy: await matchCreatorToUser(video.creator_id, video.creator_name),
      createdAt: capturedAt ? new Date(capturedAt * 1000) : new Date(),
    });
    imported++;
  }

  if (imported > 0) {
    await db
      .update(companycamProjectLinks)
      .set({ importedCount: sql`COALESCE(${companycamProjectLinks.importedCount}, 0) + ${imported}` })
      .where(eq(companycamProjectLinks.ccProjectId, ccProjectId));
  }
  return imported;
}

/** Push a freshly uploaded CRM photo up to the customer's linked CompanyCam
 *  project (fire-and-forget from the upload route). Records the returned
 *  photo id so the next pull skips it. */
export async function pushPhotoToCompanycam(customerId: string, fileId: string, fileUrl: string, capturedAt?: Date): Promise<void> {
  if (!companycamConfigured()) return;
  try {
    const [link] = await db
      .select()
      .from(companycamProjectLinks)
      .where(eq(companycamProjectLinks.customerId, customerId))
      .limit(1);
    if (!link || link.matchType === "ignored") return;

    const publicBase = process.env.PUBLIC_BASE_URL || "https://www.ghvac.app";
    const absolute = fileUrl.startsWith("http") ? fileUrl : `${publicBase}${fileUrl}`;
    // Never push CompanyCam-sourced references back at CompanyCam
    if (absolute.includes("companycam")) return;

    const created = await ccPost(`/projects/${link.ccProjectId}/photos`, {
      photo: {
        uri: absolute,
        captured_at: Math.floor((capturedAt?.getTime() || Date.now()) / 1000),
      },
    });
    if (created?.id) {
      await db.insert(companycamPushedPhotos).values({ ccPhotoId: String(created.id), customerFileId: fileId }).onConflictDoNothing();
      console.log(`[CompanyCam] pushed photo ${fileId} -> project ${link.ccProjectId} (cc id ${created.id})`);
    }
  } catch (e: any) {
    // Push is best-effort — a CompanyCam hiccup must never break an upload.
    console.error("[CompanyCam] push failed:", e?.message || e);
  }
}

/** Near-realtime pull: CompanyCam's photo.created / video.created webhooks
 *  poke us with ids. The payload is treated as UNTRUSTED — we re-fetch the
 *  resource from the API with our own token and import only what's really
 *  there, so a spoofed POST can at worst trigger a legitimate import. */
let lastWebhookFullSync = 0;
async function handleWebhookMedia(projId: string): Promise<void> {
  const [link] = await db.select().from(companycamProjectLinks).where(eq(companycamProjectLinks.ccProjectId, projId));
  if (link?.customerId && link.matchType !== "ignored") {
    const imported = await importProjectPhotos(projId, link.customerId, link.ccProjectName || "CompanyCam");
    if (imported > 0) console.log(`[CompanyCam] webhook imported ${imported} item(s) for project ${projId}`);
    return;
  }
  // Unknown or unmatched project (e.g. brand new job) — run a full sync so it
  // gets address-matched, debounced to once a minute.
  if (Date.now() - lastWebhookFullSync > 60_000) {
    lastWebhookFullSync = Date.now();
    await syncCompanycam().catch((e) => console.error("[CompanyCam] webhook-triggered sync failed:", e?.message || e));
  }
}

export async function handleWebhookPhoto(photoId: string, projectId: string | null): Promise<void> {
  if (!companycamConfigured()) return;
  const photo: any = await ccFetch(`/photos/${photoId}`).catch(() => null);
  if (!photo?.id) return;
  const projId = String(photo.project_id || projectId || "");
  if (!projId) return;
  await handleWebhookMedia(projId);
}

export async function handleWebhookVideo(videoId: string, projectId: string | null): Promise<void> {
  if (!companycamConfigured()) return;
  const video: any = await ccFetch(`/videos/${videoId}`).catch(() => null);
  // Some plans 404 the videos API — fall back to the payload's project id so
  // a video event still triggers a project import attempt.
  const projId = String(video?.project_id || projectId || "");
  if (!projId) return;
  await handleWebhookMedia(projId);
}

/** Webhook scopes we need registered. */
const WEBHOOK_SCOPES = ["photo.created", "video.created"];

/** Make sure our webhook is registered, ENABLED, and carries every scope we
 *  rely on (idempotent; re-enables/upgrades a stale registration in place).
 *  Called at boot and again on every reconciliation tick — a failed boot-time
 *  registration used to leave photos arriving only on the hourly sync. */
async function ensureWebhook(): Promise<void> {
  try {
    const publicBase = process.env.PUBLIC_BASE_URL || "https://www.ghvac.app";
    const target = `${publicBase}/api/webhooks/companycam`;
    const hooks: any[] = await ccFetch("/webhooks");
    const ours = hooks.find((h) => h.url === target);
    if (ours) {
      const scopes: string[] = Array.isArray(ours.scopes) ? ours.scopes : [];
      const missingScopes = WEBHOOK_SCOPES.filter((s) => !scopes.includes(s));
      if (ours.enabled && missingScopes.length === 0) return;
      await ccPut(`/webhooks/${ours.id}`, {
        webhook: { url: target, scopes: Array.from(new Set([...scopes, ...WEBHOOK_SCOPES])), enabled: true },
      });
      console.log(`[CompanyCam] webhook updated (enabled=${ours.enabled} -> true, added scopes: ${missingScopes.join(", ") || "none"})`);
      return;
    }
    await ccPost("/webhooks", { webhook: { url: target, scopes: WEBHOOK_SCOPES, enabled: true } });
    console.log(`[CompanyCam] registered webhook (${WEBHOOK_SCOPES.join(", ")}) -> ${target}`);
  } catch (e: any) {
    console.error("[CompanyCam] webhook registration failed:", e?.message || e);
  }
}

/** Boot-time scheduler: first sync shortly after start, then every 15 minutes
 *  (the webhook handles the instant pulls; this is the reconciliation pass —
 *  and it re-verifies the webhook registration each tick, so a boot-time
 *  registration failure heals itself instead of degrading to slow pulls). */
export function scheduleCompanycamSync(): void {
  if (!companycamConfigured()) {
    console.log("[CompanyCam] no token configured — sync disabled");
    return;
  }
  setTimeout(() => {
    ensureWebhook();
    syncCompanycam().catch((e) => console.error("[CompanyCam] initial sync failed:", e?.message || e));
  }, 30_000);
  setInterval(() => {
    ensureWebhook();
    syncCompanycam().catch((e) => console.error("[CompanyCam] scheduled sync failed:", e?.message || e));
  }, 15 * 60 * 1000);
}
