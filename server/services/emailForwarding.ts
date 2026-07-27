import { db } from "../db";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  crmEmailForwardRules,
  crmEmailForwardLog,
  crmEmailMessages,
  crmUsers,
  type CrmEmailForwardRule,
  type CrmEmailMessage,
  type CrmUser,
} from "@shared/schema";
import { sendEmail as gmailSendEmail, getAttachmentBytes, type OutgoingAttachment } from "./gmailService";

/** Auto-forwarding pass, run right after each Gmail background sync: for every
 *  active rule, any newly-synced inbound message whose sender matches is
 *  re-sent from the mailbox owner's own Gmail to the rule's recipients. The
 *  per-rule log makes each message forward exactly once, and only mail that
 *  arrived AFTER the rule was created is ever considered — creating a rule
 *  never floods the recipients with the mailbox's history. */
export async function runEmailForwardingPass(): Promise<void> {
  const rules = await db.select().from(crmEmailForwardRules).where(eq(crmEmailForwardRules.active, true));
  if (rules.length === 0) return;

  const userIds = Array.from(new Set(rules.map((r) => r.userId)));
  const users = await db.select().from(crmUsers).where(inArray(crmUsers.id, userIds));
  const userById = new Map(users.map((u) => [u.id, u]));

  for (const rule of rules) {
    const user = userById.get(rule.userId);
    if (!user?.gmailRefreshTokenEnc) continue;
    const recipients = (rule.forwardTo || []).filter((e) => e && e.includes("@"));
    if (recipients.length === 0) continue;
    try {
      await forwardForRule(user, rule, recipients);
    } catch (e) {
      console.error(`[MailForward] rule ${rule.id} (${rule.matchFrom}) failed:`, (e as Error).message);
    }
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function forwardForRule(user: CrmUser, rule: CrmEmailForwardRule, recipients: string[]): Promise<void> {
  const match = rule.matchFrom.trim().toLowerCase();
  const isDomainRule = !match.includes("@");
  const since = rule.createdAt ?? new Date(0);

  const candidates = await db
    .select()
    .from(crmEmailMessages)
    .where(
      and(
        eq(crmEmailMessages.userId, user.id),
        eq(crmEmailMessages.direction, "inbound"),
        gt(crmEmailMessages.sentAt, since),
      ),
    )
    .orderBy(desc(crmEmailMessages.sentAt))
    .limit(200);

  const matching = candidates.filter((m) => {
    const from = (m.fromEmail || "").toLowerCase();
    return isDomainRule ? from.endsWith(`@${match}`) : from === match;
  });
  if (matching.length === 0) return;

  const already = await db
    .select({ gmailMessageId: crmEmailForwardLog.gmailMessageId })
    .from(crmEmailForwardLog)
    .where(
      and(
        eq(crmEmailForwardLog.ruleId, rule.id),
        inArray(crmEmailForwardLog.gmailMessageId, matching.map((m) => m.gmailMessageId)),
      ),
    );
  const done = new Set(already.map((a) => a.gmailMessageId));
  const fresh = matching.filter((m) => !done.has(m.gmailMessageId)).reverse(); // oldest first

  for (const msg of fresh) {
    await forwardMessage(user, rule, msg, recipients);
  }
}

async function forwardMessage(user: CrmUser, rule: CrmEmailForwardRule, msg: CrmEmailMessage, recipients: string[]): Promise<void> {
  // Re-fetch attachment bytes from Gmail and carry them along.
  const attachments: OutgoingAttachment[] = [];
  for (const a of msg.attachments || []) {
    try {
      const bytes = await getAttachmentBytes(user, msg.gmailMessageId, a.attachmentId);
      attachments.push({ filename: a.filename, mimeType: a.mimeType, contentBase64: bytes.toString("base64") });
    } catch (e) {
      console.error(`[MailForward] attachment fetch failed (${a.filename}):`, (e as Error).message);
    }
  }

  const stamp = msg.sentAt
    ? new Date(msg.sentAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })
    : "";
  const fromLine = `${msg.fromName ? `${escapeHtml(msg.fromName)} ` : ""}&lt;${escapeHtml(msg.fromEmail || "")}&gt;`;
  const header = [
    `<div style="color:#64748b;font-size:12px;margin-bottom:12px;line-height:1.5">`,
    `---------- Forwarded message ----------<br/>`,
    `From: ${fromLine}<br/>`,
    stamp ? `Date: ${escapeHtml(stamp)} ET<br/>` : "",
    `Subject: ${escapeHtml(msg.subject || "")}<br/>`,
    `To: ${escapeHtml((msg.toEmails || []).join(", "))}`,
    `</div>`,
  ].join("");
  const body = msg.bodyHtml
    || `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(msg.bodyText || msg.snippet || "")}</pre>`;

  await gmailSendEmail(user, {
    to: recipients,
    subject: `Fwd: ${msg.subject || "(no subject)"}`,
    html: header + body,
    attachments,
  });

  await db
    .insert(crmEmailForwardLog)
    .values({ ruleId: rule.id, gmailMessageId: msg.gmailMessageId, subject: msg.subject || null })
    .onConflictDoNothing();
  await db
    .update(crmEmailForwardRules)
    .set({ forwardCount: sql`${crmEmailForwardRules.forwardCount} + 1`, lastForwardedAt: new Date() })
    .where(eq(crmEmailForwardRules.id, rule.id));
  console.log(`[MailForward] "${msg.subject}" (${msg.fromEmail}) → ${recipients.join(", ")}`);
}
