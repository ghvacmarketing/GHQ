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
 *  changes. Deletes never propagate in either direction.
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

/** CompanyCam creators and CRM users are the same people — match the photo's
 *  creator_name to a crm_user so galleries credit the right tech. Exact
 *  normalized full-name match first, then first+last token containment. */
let userMatchCache: { at: number; users: Array<{ id: string; norm: string; tokens: string[] }> } | null = null;
async function matchCreatorToUser(creatorName: string | null): Promise<string | null> {
  if (!creatorName?.trim()) return null;
  if (!userMatchCache || Date.now() - userMatchCache.at > 10 * 60 * 1000) {
    const rows = await db.select({ id: crmUsers.id, name: crmUsers.name }).from(crmUsers);
    userMatchCache = {
      at: Date.now(),
      users: rows
        .filter((u) => u.name)
        .map((u) => {
          const norm = u.name.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
          return { id: u.id, norm, tokens: norm.split(" ") };
        }),
    };
  }
  const norm = creatorName.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return null;
  const exact = userMatchCache.users.find((u) => u.norm === norm);
  if (exact) return exact.id;
  const tokens = norm.split(" ");
  const contained = userMatchCache.users.filter(
    (u) => tokens.length >= 2 && tokens.every((t) => u.tokens.includes(t)),
  );
  return contained.length === 1 ? contained[0].id : null;
}

/** Import one project's photos as reference rows on the customer. Returns the
 *  number of NEW rows. Also backfills uploader attribution on rows imported
 *  before creator matching existed. */
export async function importProjectPhotos(ccProjectId: string, customerId: string, projectName: string): Promise<number> {
  const photos = await fetchProjectPhotos(ccProjectId);

  const existing = await db
    .select({ id: customerFiles.id, objectPath: customerFiles.objectPath, uploadedBy: customerFiles.uploadedBy })
    .from(customerFiles)
    .where(like(customerFiles.objectPath, "companycam:%"));
  const have = new Map(existing.map((r) => [r.objectPath, r]));

  const pushed = await db.select({ ccPhotoId: companycamPushedPhotos.ccPhotoId }).from(companycamPushedPhotos);
  const pushedIds = new Set(pushed.map((r) => r.ccPhotoId));

  let imported = 0;
  for (const photo of photos) {
    if (photo.status && photo.status !== "active") continue;
    const key = `companycam:${photo.id}`;
    if (pushedIds.has(photo.id)) continue;
    const existingRow = have.get(key);
    if (existingRow) {
      // Backfill the uploader on rows that predate creator matching
      if (!existingRow.uploadedBy) {
        const userId = await matchCreatorToUser(photo.creator_name);
        if (userId) await db.update(customerFiles).set({ uploadedBy: userId }).where(eq(customerFiles.id, existingRow.id));
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
      objectPath: key,
      contentType: "image/jpeg",
      size: null,
      uploadedBy: await matchCreatorToUser(photo.creator_name),
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

/** Near-realtime pull: CompanyCam's photo.created webhook pokes us with ids.
 *  The payload is treated as UNTRUSTED — we re-fetch the photo from the API
 *  with our own token and import only what's really there, so a spoofed POST
 *  can at worst trigger a legitimate import. */
let lastWebhookFullSync = 0;
export async function handleWebhookPhoto(photoId: string, projectId: string | null): Promise<void> {
  if (!companycamConfigured()) return;
  const photo: any = await ccFetch(`/photos/${photoId}`).catch(() => null);
  if (!photo?.id) return;
  const projId = String(photo.project_id || projectId || "");
  if (!projId) return;

  const [link] = await db.select().from(companycamProjectLinks).where(eq(companycamProjectLinks.ccProjectId, projId));
  if (link?.customerId && link.matchType !== "ignored") {
    const imported = await importProjectPhotos(projId, link.customerId, link.ccProjectName || "CompanyCam");
    if (imported > 0) console.log(`[CompanyCam] webhook imported ${imported} photo(s) for project ${projId}`);
    return;
  }
  // Unknown or unmatched project (e.g. brand new job) — run a full sync so it
  // gets address-matched, debounced to once a minute.
  if (Date.now() - lastWebhookFullSync > 60_000) {
    lastWebhookFullSync = Date.now();
    await syncCompanycam().catch((e) => console.error("[CompanyCam] webhook-triggered sync failed:", e?.message || e));
  }
}

/** Make sure our photo.created webhook is registered (idempotent). */
async function ensureWebhook(): Promise<void> {
  try {
    const publicBase = process.env.PUBLIC_BASE_URL || "https://www.ghvac.app";
    const target = `${publicBase}/api/webhooks/companycam`;
    const hooks: any[] = await ccFetch("/webhooks");
    if (hooks.some((h) => h.url === target && h.enabled)) return;
    await ccPost("/webhooks", { webhook: { url: target, scopes: ["photo.created"], enabled: true } });
    console.log(`[CompanyCam] registered photo.created webhook -> ${target}`);
  } catch (e: any) {
    console.error("[CompanyCam] webhook registration failed:", e?.message || e);
  }
}

/** Boot-time scheduler: first sync shortly after start, then hourly (the
 *  webhook handles the instant pulls; this is the reconciliation pass). */
export function scheduleCompanycamSync(): void {
  if (!companycamConfigured()) {
    console.log("[CompanyCam] no token configured — sync disabled");
    return;
  }
  setTimeout(() => {
    ensureWebhook();
    syncCompanycam().catch((e) => console.error("[CompanyCam] initial sync failed:", e?.message || e));
  }, 30_000);
  setInterval(() => syncCompanycam().catch((e) => console.error("[CompanyCam] hourly sync failed:", e?.message || e)), 60 * 60 * 1000);
}
