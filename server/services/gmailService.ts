import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  crmUsers,
  crmEmailThreads,
  crmEmailMessages,
  crmCustomers,
  type CrmUser,
} from "@shared/schema";
import { decryptToken } from "./tokenCrypto";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify", // read, send, and mark read/unread
  "https://www.googleapis.com/auth/userinfo.email",
];

// Gmail can use its OWN OAuth client (a Workspace "Internal" one) so it doesn't
// disturb the CRM Google-login client. Falls back to the login client if unset.
export function gmailClientId(): string | undefined {
  return process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}
export function gmailClientSecret(): string | undefined {
  return process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
}

export function isGmailOAuthConfigured(): boolean {
  return Boolean(gmailClientId() && gmailClientSecret());
}

function oauthClient(): OAuth2Client {
  return new OAuth2Client(gmailClientId(), gmailClientSecret());
}

// ── base64url helpers ────────────────────────────────────────────────────────
function b64urlDecode(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Exchange a stored refresh token for a fresh access token. Throws a tagged
// error if the grant is revoked so callers can flip the user to disconnected.
async function getAccessToken(user: CrmUser): Promise<string> {
  if (!user.gmailRefreshTokenEnc) throw new Error("gmail_not_connected");
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptToken(user.gmailRefreshTokenEnc) });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("gmail_no_access_token");
    return token;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("invalid_grant")) {
      await disconnectGmail(user.id);
      throw new Error("gmail_revoked");
    }
    throw e;
  }
}

async function gmailFetch(user: CrmUser, path: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken(user);
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? {} : res.json();
}

// ── connection management ────────────────────────────────────────────────────
export async function disconnectGmail(userId: string): Promise<void> {
  await db
    .update(crmUsers)
    .set({ gmailRefreshTokenEnc: null, gmailAddress: null, gmailConnectedAt: null, gmailHistoryId: null })
    .where(eq(crmUsers.id, userId));
}

// ── header parsing ───────────────────────────────────────────────────────────
type Header = { name: string; value: string };
function header(headers: Header[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}
// "Jane Doe <jane@x.com>, bob@y.com" → [{name,email}]
function parseAddressList(raw: string): { name: string; email: string }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      // "Jane Doe <jane@x.com>" → name + address inside angle brackets.
      const angle = trimmed.match(/^(.*?)<([^<>\s]+@[^<>\s]+)>\s*$/);
      if (angle) {
        const name = angle[1].trim().replace(/^"|"$/g, "").trim();
        return { name, email: angle[2].trim().toLowerCase() };
      }
      // Bare address with no display name: "jane@x.com".
      const bare = trimmed.match(/^([^<>\s]+@[^<>\s]+)$/);
      if (bare) return { name: "", email: bare[1].toLowerCase() };
      return null;
    })
    .filter((x): x is { name: string; email: string } => !!x && !!x.email);
}

// Walk the MIME tree pulling out html/plain bodies + attachment metadata.
function extractBody(payload: any): { html: string | null; text: string | null; attachments: any[] } {
  let html: string | null = null;
  let text: string | null = null;
  const attachments: any[] = [];
  const walk = (part: any) => {
    if (!part) return;
    const mime = part.mimeType || "";
    const filename = part.filename || "";
    if (filename && part.body?.attachmentId) {
      attachments.push({ filename, mimeType: mime, size: part.body.size || 0, attachmentId: part.body.attachmentId });
    } else if (mime === "text/html" && part.body?.data) {
      html = (html || "") + b64urlDecode(part.body.data).toString("utf8");
    } else if (mime === "text/plain" && part.body?.data) {
      text = (text || "") + b64urlDecode(part.body.data).toString("utf8");
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  return { html, text, attachments };
}

// ── sync ─────────────────────────────────────────────────────────────────────
export async function syncUser(user: CrmUser): Promise<{ threads: number }> {
  if (!user.gmailRefreshTokenEnc || !user.gmailSyncEnabled) return { threads: 0 };

  // Recent inbox + sent messages (id + threadId only)
  const list = await gmailFetch(
    user,
    `/messages?maxResults=50&q=${encodeURIComponent("(in:inbox OR in:sent) newer_than:90d")}`,
  );
  const refs: { id: string; threadId: string }[] = list.messages || [];
  if (refs.length === 0) return { threads: 0 };

  // Only fetch threads that contain a message we haven't stored yet
  const seenIds = refs.map((r) => r.id);
  const existing = seenIds.length
    ? await db
        .select({ gmailMessageId: crmEmailMessages.gmailMessageId })
        .from(crmEmailMessages)
        .where(and(eq(crmEmailMessages.userId, user.id), inArray(crmEmailMessages.gmailMessageId, seenIds)))
    : [];
  const have = new Set(existing.map((e) => e.gmailMessageId));
  const staleThreadIds = Array.from(new Set(refs.filter((r) => !have.has(r.id)).map((r) => r.threadId)));

  let count = 0;
  for (const gmailThreadId of staleThreadIds) {
    try {
      await syncThread(user, gmailThreadId);
      count++;
    } catch (e) {
      console.error(`[Gmail] thread sync failed (${gmailThreadId}):`, (e as Error).message);
    }
  }
  return { threads: count };
}

export async function syncThread(user: CrmUser, gmailThreadId: string): Promise<string> {
  const thread = await gmailFetch(user, `/threads/${gmailThreadId}?format=full`);
  const messages: any[] = thread.messages || [];
  if (messages.length === 0) throw new Error("empty thread");

  const myEmail = (user.gmailAddress || user.email || "").toLowerCase();
  const participantSet = new Set<string>();
  const nameByEmail = new Map<string, string>(); // best display name seen per email
  let subject = "";
  let lastMs = 0;
  let anyUnread = false;
  let anyInbox = false;
  let anySent = false;

  // Upsert the thread row first so messages can reference it
  const [threadRow] = await db
    .insert(crmEmailThreads)
    .values({ userId: user.id, gmailThreadId, subject: "", snippet: thread.messages[0]?.snippet || "" })
    .onConflictDoUpdate({
      target: [crmEmailThreads.userId, crmEmailThreads.gmailThreadId],
      set: { updatedAt: new Date() },
    })
    .returning();

  for (const m of messages) {
    const headers: Header[] = m.payload?.headers || [];
    const labels: string[] = m.labelIds || [];
    const from = parseAddressList(header(headers, "From"))[0] || { name: "", email: "" };
    const to = parseAddressList(header(headers, "To"));
    const cc = parseAddressList(header(headers, "Cc"));
    const bcc = parseAddressList(header(headers, "Bcc"));
    const subj = header(headers, "Subject");
    if (!subject) subject = subj;
    const isSent = labels.includes("SENT") || from.email === myEmail;
    const isUnread = labels.includes("UNREAD");
    const internalMs = Number(m.internalDate || 0);
    if (internalMs > lastMs) { lastMs = internalMs; subject = subj || subject; }
    if (isUnread) anyUnread = true;
    if (labels.includes("INBOX")) anyInbox = true;
    if (isSent) anySent = true;
    [from, ...to, ...cc].forEach((a) => {
      if (a.email && a.email !== myEmail) {
        participantSet.add(a.email);
        // Prefer a real display name; don't overwrite one we already have.
        if (a.name && !nameByEmail.has(a.email)) nameByEmail.set(a.email, a.name);
      }
    });
    const { html, text, attachments } = extractBody(m.payload);

    await db
      .insert(crmEmailMessages)
      .values({
        threadId: threadRow.id,
        userId: user.id,
        gmailMessageId: m.id,
        gmailThreadId,
        direction: isSent ? "outbound" : "inbound",
        fromEmail: from.email || null,
        fromName: from.name || null,
        toEmails: to.map((x) => x.email),
        ccEmails: cc.map((x) => x.email),
        bccEmails: bcc.map((x) => x.email),
        subject: subj || null,
        snippet: m.snippet || null,
        bodyHtml: html,
        bodyText: text,
        hasAttachments: attachments.length > 0,
        attachments,
        isUnread,
        messageIdHeader: header(headers, "Message-ID") || null,
        sentAt: internalMs ? new Date(internalMs) : null,
      })
      .onConflictDoUpdate({
        target: [crmEmailMessages.userId, crmEmailMessages.gmailMessageId],
        // Refresh addresses too so rows synced before the parser fix self-heal.
        set: {
          isUnread,
          fromEmail: from.email || null,
          fromName: from.name || null,
          toEmails: to.map((x) => x.email),
          ccEmails: cc.map((x) => x.email),
          bccEmails: bcc.map((x) => x.email),
        },
      });
  }

  // Match a customer by any external participant email
  let customerId: string | null = threadRow.customerId ?? null;
  if (!customerId && participantSet.size > 0) {
    const [cust] = await db
      .select({ id: crmCustomers.id })
      .from(crmCustomers)
      .where(inArray(crmCustomers.email, Array.from(participantSet)))
      .limit(1);
    customerId = cust?.id ?? null;
  }

  const participantList = Array.from(participantSet);
  await db
    .update(crmEmailThreads)
    .set({
      subject: subject || null,
      snippet: messages[messages.length - 1]?.snippet || null,
      participants: participantList,
      participantNames: participantList.map((e) => nameByEmail.get(e) ?? null),
      lastMessageAt: lastMs ? new Date(lastMs) : null,
      isUnread: anyUnread,
      inInbox: anyInbox,
      isSent: anySent,
      customerId,
      updatedAt: new Date(),
    })
    .where(eq(crmEmailThreads.id, threadRow.id));

  return threadRow.id;
}

// ── send ─────────────────────────────────────────────────────────────────────
export interface OutgoingAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string; // raw base64 (no data: prefix)
}
interface SendOpts {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  gmailThreadId?: string | null; // reply within this thread
  inReplyTo?: string | null; // Message-ID header of the message being replied to
  references?: string | null;
  attachments?: OutgoingAttachment[];
}
function buildMime(from: string, o: SendOpts): string {
  const headers: string[] = [
    `From: ${from}`,
    `To: ${o.to.join(", ")}`,
    ...(o.cc?.length ? [`Cc: ${o.cc.join(", ")}`] : []),
    ...(o.bcc?.length ? [`Bcc: ${o.bcc.join(", ")}`] : []),
    `Subject: ${o.subject}`,
    ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`] : []),
    ...(o.references ? [`References: ${o.references}`] : []),
    "MIME-Version: 1.0",
  ];

  const atts = (o.attachments || []).filter((a) => a && a.contentBase64);
  if (atts.length === 0) {
    return [
      ...headers,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      o.html,
    ].join("\r\n");
  }

  // multipart/mixed: HTML body first, then each file as a base64 attachment
  const boundary = `ghq_${randomBytes(12).toString("hex")}`;
  const parts: string[] = [];
  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/html; charset="UTF-8"');
  parts.push("Content-Transfer-Encoding: 7bit");
  parts.push("");
  parts.push(o.html);
  for (const a of atts) {
    const name = a.filename.replace(/["\r\n]/g, "");
    const b64 = a.contentBase64.replace(/^data:[^;]+;base64,/, "").replace(/[\r\n]/g, "");
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${a.mimeType || "application/octet-stream"}; name="${name}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-Disposition: attachment; filename="${name}"`);
    parts.push("");
    parts.push(b64.replace(/(.{76})/g, "$1\r\n")); // wrap per RFC 2045
  }
  parts.push(`--${boundary}--`);

  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

export async function sendEmail(user: CrmUser, o: SendOpts): Promise<{ gmailThreadId: string }> {
  const from = user.gmailAddress || user.email;
  const raw = b64urlEncode(Buffer.from(buildMime(from, o), "utf8"));
  const body: any = { raw };
  if (o.gmailThreadId) body.threadId = o.gmailThreadId;
  const sent = await gmailFetch(user, `/messages/send`, { method: "POST", body: JSON.stringify(body) });
  // Pull the new message into our store immediately so the UI shows it
  try {
    await syncThread(user, sent.threadId);
  } catch (e) {
    console.error("[Gmail] post-send sync failed:", (e as Error).message);
  }
  return { gmailThreadId: sent.threadId };
}

// ── attachment download ──────────────────────────────────────────────────────
export async function getAttachmentBytes(user: CrmUser, gmailMessageId: string, attachmentId: string): Promise<Buffer> {
  const json = await gmailFetch(user, `/messages/${gmailMessageId}/attachments/${attachmentId}`);
  if (!json?.data) throw new Error("attachment has no data");
  return b64urlDecode(json.data);
}

// ── mark read ────────────────────────────────────────────────────────────────
export async function markThreadRead(user: CrmUser, threadRowId: string): Promise<void> {
  const msgs = await db
    .select()
    .from(crmEmailMessages)
    .where(and(eq(crmEmailMessages.threadId, threadRowId), eq(crmEmailMessages.isUnread, true)));
  for (const m of msgs) {
    try {
      await gmailFetch(user, `/messages/${m.gmailMessageId}/modify`, {
        method: "POST",
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      });
    } catch (e) {
      console.error("[Gmail] mark read failed:", (e as Error).message);
    }
  }
  await db.update(crmEmailMessages).set({ isUnread: false }).where(eq(crmEmailMessages.threadId, threadRowId));
  await db.update(crmEmailThreads).set({ isUnread: false }).where(eq(crmEmailThreads.id, threadRowId));
}

// Archive: remove the thread from the Gmail inbox (keeps it in All Mail).
export async function archiveThread(user: CrmUser, threadRowId: string): Promise<void> {
  const [thread] = await db
    .select()
    .from(crmEmailThreads)
    .where(and(eq(crmEmailThreads.id, threadRowId), eq(crmEmailThreads.userId, user.id)));
  if (!thread) throw new Error("thread_not_found");
  await gmailFetch(user, `/threads/${thread.gmailThreadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
  });
  await db.update(crmEmailThreads).set({ inInbox: false, updatedAt: new Date() }).where(eq(crmEmailThreads.id, threadRowId));
}

// Delete: move the whole thread to Gmail Trash and drop it from the CRM.
export async function trashThread(user: CrmUser, threadRowId: string): Promise<void> {
  const [thread] = await db
    .select()
    .from(crmEmailThreads)
    .where(and(eq(crmEmailThreads.id, threadRowId), eq(crmEmailThreads.userId, user.id)));
  if (!thread) throw new Error("thread_not_found");
  await gmailFetch(user, `/threads/${thread.gmailThreadId}/trash`, { method: "POST" });
  // Cascade delete removes the messages via the FK relation.
  await db.delete(crmEmailThreads).where(eq(crmEmailThreads.id, threadRowId));
}

// ── one-time backfill: derive thread participant display names from stored
// message From headers (threads synced before participant_names existed show
// mangled email-derived names in the UI until this runs) ─────────────────────
export async function backfillThreadNames(): Promise<void> {
  try {
    const threads = await db.select().from(crmEmailThreads);
    let fixed = 0;
    for (const t of threads) {
      const participants = (t.participants || []) as string[];
      if (participants.length === 0) continue;
      const names = ((t.participantNames || []) as (string | null)[]);
      const hasAnyName = names.some((n) => n);
      if (hasAnyName && names.length === participants.length) continue;

      const msgs = await db
        .select({ fromEmail: crmEmailMessages.fromEmail, fromName: crmEmailMessages.fromName })
        .from(crmEmailMessages)
        .where(eq(crmEmailMessages.threadId, t.id));
      const nameByEmail = new Map<string, string>();
      for (const m of msgs) {
        if (m.fromEmail && m.fromName && !nameByEmail.has(m.fromEmail)) nameByEmail.set(m.fromEmail, m.fromName);
      }
      if (nameByEmail.size === 0) continue;
      const newNames = participants.map((e) => nameByEmail.get(e) ?? null);
      if (!newNames.some((n) => n)) continue;
      await db.update(crmEmailThreads).set({ participantNames: newNames }).where(eq(crmEmailThreads.id, t.id));
      fixed++;
    }
    if (fixed > 0) console.log(`[Gmail] Backfilled display names on ${fixed} thread(s)`);
  } catch (e) {
    console.error("[Gmail] thread-name backfill failed:", (e as Error).message);
  }
}

// ── background sync ──────────────────────────────────────────────────────────
let gmailInterval: NodeJS.Timeout | null = null;
export function startGmailBackgroundSync(intervalMinutes = 3): void {
  if (gmailInterval) clearInterval(gmailInterval);
  if (!isGmailOAuthConfigured()) {
    console.log("[Gmail] GOOGLE_CLIENT_ID/SECRET not set — email sync disabled");
    return;
  }
  console.log(`[Gmail] Starting background sync every ${intervalMinutes} minute(s)`);
  const run = async () => {
    try {
      const users = await db.select().from(crmUsers).where(eq(crmUsers.gmailSyncEnabled, true));
      for (const u of users) {
        if (!u.gmailRefreshTokenEnc) continue;
        try {
          await syncUser(u);
        } catch (e) {
          console.error(`[Gmail] sync failed for ${u.email}:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error("[Gmail] background sync loop error:", (e as Error).message);
    }
  };
  setTimeout(run, 20000);
  gmailInterval = setInterval(run, intervalMinutes * 60 * 1000);
}
