import { db } from "../db";
import { and, eq, inArray, isNull, lte, gte, sql } from "drizzle-orm";
import {
  crmCampaigns,
  crmCampaignEnrollments,
  crmCampaignSends,
  crmCustomers,
  crmEmailMessages,
  crmMessagingMessages,
  crmNotifications,
  crmFollowUps,
  crmUsers,
  type CrmCampaign,
  type CrmCampaignEnrollment,
  type CrmUser,
} from "@shared/schema";
import { storage } from "../storage";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { sendAutomatedSms } from "./smsNotificationService";
import { sendEmail as gmailSendEmail } from "./gmailService";
import {
  CAMPAIGN_DELAY_MS,
  campaignChannelNeeds,
  type AudienceFilters,
  type CampaignAudience,
  type CampaignSettings,
  type CampaignStep,
} from "@shared/campaigns";

// ─────────────────────────────────────────────────────────────────────────────
// Outbound campaign engine.
//
// Campaigns enroll an audience snapshot at launch; each enrollment is a tiny
// state machine (current step + nextActionAt) processed by a 60s scheduler
// tick, mirroring automationEngine's DB-queue pattern. Before every step we
// check the CRM's inbound stores for a reply (Textline SMS in
// crm_messaging_messages, Gmail sync in crm_email_messages) so sequences can
// stop or skip steps the moment a customer responds.
//
// Unlike the automation engine's hard "explicitly true" gate, campaigns are
// deliberately launched by a person, so they send unless a channel is
// explicitly killed (automated_sms_enabled / automated_email_enabled = "false").
// ─────────────────────────────────────────────────────────────────────────────

export interface AudienceCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  customerType: string | null;
  customerStatus: string | null;
  tags: string[];
  city: string | null;
}

export interface AudiencePreview {
  total: number;
  sendable: number;
  missingEmail: number;
  missingPhone: number;
  sample: AudienceCustomer[];
}

function segmentConditions(f: AudienceFilters): ReturnType<typeof sql>[] {
  const conds: ReturnType<typeof sql>[] = [];
  const inList = (vals: string[]) => sql.join(vals.map((v) => sql`${v.toLowerCase()}`), sql`, `);

  if (f.customerType?.length) {
    conds.push(sql`LOWER(${crmCustomers.customerType}) IN (${inList(f.customerType)})`);
  }
  if (f.customerStatus?.length) {
    conds.push(sql`LOWER(${crmCustomers.customerStatus}) IN (${inList(f.customerStatus)})`);
  }
  if (f.tags?.length) {
    conds.push(sql`${crmCustomers.tags}::jsonb ?| array[${sql.join(f.tags.map((t) => sql`${t}`), sql`, `)}]::text[]`);
  }
  if (f.cities?.length) {
    conds.push(sql`EXISTS (SELECT 1 FROM crm_properties p WHERE p.customer_id = ${crmCustomers.id} AND LOWER(p.city) IN (${inList(f.cities)}))`);
  }
  if (f.zips?.length) {
    conds.push(sql`EXISTS (SELECT 1 FROM crm_properties p WHERE p.customer_id = ${crmCustomers.id} AND p.zip IN (${sql.join(f.zips.map((z) => sql`${z}`), sql`, `)}))`);
  }
  if (f.leadSources?.length) {
    conds.push(sql`LOWER(COALESCE(${crmCustomers.leadSource}, '')) IN (${inList(f.leadSources)})`);
  }
  if (f.hasAgreement === "yes") {
    conds.push(sql`EXISTS (SELECT 1 FROM crm_agreements a WHERE a.customer_id = ${crmCustomers.id} AND a.status = 'active')`);
  } else if (f.hasAgreement === "no") {
    conds.push(sql`NOT EXISTS (SELECT 1 FROM crm_agreements a WHERE a.customer_id = ${crmCustomers.id} AND a.status = 'active')`);
  }
  if (f.protectionPlan === "yes") {
    conds.push(sql`${crmCustomers.protectionPlanLevel} IS NOT NULL`);
  } else if (f.protectionPlan === "no") {
    conds.push(sql`${crmCustomers.protectionPlanLevel} IS NULL`);
  }
  if (f.lastJobWithinDays) {
    const since = new Date(Date.now() - f.lastJobWithinDays * 86_400_000);
    conds.push(sql`EXISTS (SELECT 1 FROM crm_work_orders w WHERE w.customer_id = ${crmCustomers.id} AND w.status = 'completed' AND w.completed_at >= ${since})`);
  }
  if (f.lastJobOlderThanDays) {
    const since = new Date(Date.now() - f.lastJobOlderThanDays * 86_400_000);
    // Win-back semantics: has been serviced before, but not recently.
    conds.push(sql`EXISTS (SELECT 1 FROM crm_work_orders w WHERE w.customer_id = ${crmCustomers.id} AND w.status = 'completed')`);
    conds.push(sql`NOT EXISTS (SELECT 1 FROM crm_work_orders w WHERE w.customer_id = ${crmCustomers.id} AND w.status = 'completed' AND w.completed_at >= ${since})`);
  }
  if (f.minLifetimeRevenue) {
    conds.push(sql`(SELECT COALESCE(SUM(i.total::numeric), 0) FROM crm_invoices i WHERE i.customer_id = ${crmCustomers.id} AND i.status IN ('paid','partial')) >= ${f.minLifetimeRevenue}`);
  }
  return conds;
}

/** Resolve an audience definition to concrete customers (deduped by contact). */
export async function resolveAudience(audience: CampaignAudience): Promise<AudienceCustomer[]> {
  const segments = (audience.segments || []).filter((s) => s?.filters);
  if (segments.length === 0) return [];

  const segmentClauses = segments.map((s) => {
    const conds = segmentConditions(s.filters);
    if (conds.length === 0) return sql`TRUE`;
    return sql`(${sql.join(conds, sql` AND `)})`;
  });

  const where: ReturnType<typeof sql>[] = [sql`(${sql.join(segmentClauses, sql` OR `)})`];
  if (audience.excludeCustomerIds?.length) {
    where.push(sql`${crmCustomers.id} NOT IN (${sql.join(audience.excludeCustomerIds.map((id) => sql`${id}`), sql`, `)})`);
  }
  if (audience.excludeContactedWithinDays && audience.excludeContactedWithinDays > 0) {
    const since = new Date(Date.now() - audience.excludeContactedWithinDays * 86_400_000);
    where.push(sql`NOT EXISTS (SELECT 1 FROM crm_campaign_sends s WHERE s.customer_id = ${crmCustomers.id} AND s.status = 'sent' AND s.channel IN ('email','sms') AND s.sent_at >= ${since})`);
  }

  const rows = await db
    .select({
      id: crmCustomers.id,
      name: crmCustomers.name,
      email: crmCustomers.email,
      phone: crmCustomers.phone,
      customerType: crmCustomers.customerType,
      customerStatus: crmCustomers.customerStatus,
      tags: crmCustomers.tags,
      city: sql<string | null>`(SELECT p.city FROM crm_properties p WHERE p.customer_id = ${crmCustomers.id} LIMIT 1)`,
    })
    .from(crmCustomers)
    .where(and(...where))
    .orderBy(crmCustomers.name)
    .limit(5000);

  // De-dupe by shared contact info so one household never gets double-sent.
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  const out: AudienceCustomer[] = [];
  for (const r of rows) {
    const emailKey = r.email?.trim().toLowerCase() || null;
    const phoneKey = r.phone ? r.phone.replace(/\D/g, "").slice(-10) : null;
    if (emailKey && seenEmail.has(emailKey)) continue;
    if (phoneKey && phoneKey.length >= 10 && seenPhone.has(phoneKey)) continue;
    if (emailKey) seenEmail.add(emailKey);
    if (phoneKey && phoneKey.length >= 10) seenPhone.add(phoneKey);
    out.push({ ...r, tags: (r.tags as string[]) || [] });
  }
  return out;
}

export async function previewAudience(audience: CampaignAudience, steps: CampaignStep[]): Promise<AudiencePreview> {
  const customers = await resolveAudience(audience);
  const { needsEmail, needsPhone } = campaignChannelNeeds(steps);
  const missingEmail = needsEmail ? customers.filter((c) => !c.email).length : 0;
  const missingPhone = needsPhone ? customers.filter((c) => !c.phone).length : 0;
  const sendable = customers.filter((c) => (!needsEmail && !needsPhone) || (needsEmail && !!c.email) || (needsPhone && !!c.phone)).length;
  return { total: customers.length, sendable, missingEmail, missingPhone, sample: customers.slice(0, 30) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Launch
// ─────────────────────────────────────────────────────────────────────────────

function stepDelayMs(step: Pick<CampaignStep, "delay" | "delayUnit">): number {
  return (step.delay || 0) * (CAMPAIGN_DELAY_MS[step.delayUnit] || CAMPAIGN_DELAY_MS.days);
}

export async function launchCampaign(campaignId: string): Promise<{ enrolled: number; skipped: number }> {
  const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, campaignId));
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    throw new Error(`Campaign is ${campaign.status} — only drafts can be launched`);
  }
  const steps = (campaign.steps as CampaignStep[]) || [];
  if (steps.length === 0) throw new Error("Campaign has no steps");

  const settings = campaign.settings as CampaignSettings;
  const startAt =
    settings?.schedule?.startMode === "scheduled" && settings.schedule.startAt
      ? new Date(settings.schedule.startAt)
      : new Date();
  const base = startAt.getTime() < Date.now() ? new Date() : startAt;
  const firstDue = new Date(base.getTime() + stepDelayMs(steps[0]));

  // Re-launching an edited scheduled campaign: nothing has sent yet, so wipe
  // the stale enrollments and re-resolve the audience with the new settings.
  if (campaign.status === "scheduled") {
    await db.delete(crmCampaignEnrollments).where(and(
      eq(crmCampaignEnrollments.campaignId, campaign.id),
      isNull(crmCampaignEnrollments.firstSentAt),
    ));
  }

  const { needsEmail, needsPhone } = campaignChannelNeeds(steps);
  const customers = await resolveAudience(campaign.audience as CampaignAudience);

  let enrolled = 0;
  let skipped = 0;
  const values = customers.map((c) => {
    const sendable = (!needsEmail && !needsPhone) || (needsEmail && !!c.email) || (needsPhone && !!c.phone);
    if (sendable) enrolled += 1;
    else skipped += 1;
    return {
      campaignId: campaign.id,
      customerId: c.id,
      customerName: c.name,
      email: c.email,
      phone: c.phone,
      status: (sendable ? "active" : "skipped") as CrmCampaignEnrollment["status"],
      currentStepIndex: 0,
      nextActionAt: sendable ? firstDue : null,
      detail: sendable ? null : JSON.stringify([{ t: new Date().toISOString(), event: "skipped: no usable contact info" }]),
    };
  });

  if (values.length === 0) throw new Error("Audience is empty — adjust the filters before launching");
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(crmCampaignEnrollments).values(values.slice(i, i + 500)).onConflictDoNothing();
  }

  const scheduled = base.getTime() > Date.now() + 60_000;
  // If nobody is actually sendable the campaign would sit "active" forever —
  // close it out immediately (the skipped enrollments record why).
  const finalStatus = enrolled === 0 ? "completed" : scheduled ? "scheduled" : "active";
  await db.update(crmCampaigns).set({
    status: finalStatus,
    startAt: base,
    launchedAt: new Date(),
    completedAt: enrolled === 0 ? new Date() : null,
    audienceCount: customers.length,
    updatedAt: new Date(),
  }).where(eq(crmCampaigns.id, campaign.id));

  return { enrolled, skipped };
}

/**
 * Reconcile a launched campaign's enrollments after an audience edit.
 *
 * Deliberately ADDITIVE: new matches are enrolled at step 0, but existing
 * enrollments are only ever stopped when the customer sits in the audience's
 * explicit excludeCustomerIds list. Stopping on general filter mismatch is a
 * footgun — the exclude-recently-contacted rule matches this campaign's own
 * sends, and an accidentally-emptied filter would silently kill every
 * in-flight sequence.
 */
export async function syncCampaignAudience(campaignId: string): Promise<{ added: number; removed: number }> {
  const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, campaignId));
  if (!campaign || !campaign.launchedAt) return { added: 0, removed: 0 };

  const audience = campaign.audience as CampaignAudience;
  const steps = (campaign.steps as CampaignStep[]) || [];
  const { needsEmail, needsPhone } = campaignChannelNeeds(steps);
  const customers = await resolveAudience(audience);

  const existing = await db
    .select({ id: crmCampaignEnrollments.id, customerId: crmCampaignEnrollments.customerId, status: crmCampaignEnrollments.status })
    .from(crmCampaignEnrollments)
    .where(eq(crmCampaignEnrollments.campaignId, campaignId));
  const existingCustomerIds = new Set(existing.map((x) => x.customerId));

  // A scheduled campaign hasn't started — new enrollees join the original
  // cohort's timeline, not "now".
  const base = campaign.startAt && campaign.startAt.getTime() > Date.now() ? campaign.startAt.getTime() : Date.now();
  const firstDue = new Date(base + (steps[0] ? stepDelayMs(steps[0]) : 0));
  let added = 0;
  const values = customers
    .filter((c) => !existingCustomerIds.has(c.id))
    .map((c) => {
      const sendable = (!needsEmail && !needsPhone) || (needsEmail && !!c.email) || (needsPhone && !!c.phone);
      if (sendable) added += 1;
      return {
        campaignId,
        customerId: c.id,
        customerName: c.name,
        email: c.email,
        phone: c.phone,
        status: (sendable ? "active" : "skipped") as CrmCampaignEnrollment["status"],
        currentStepIndex: 0,
        nextActionAt: sendable ? firstDue : null,
        detail: sendable ? null : JSON.stringify([{ t: new Date().toISOString(), event: "skipped: no usable contact info" }]),
      };
    });
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(crmCampaignEnrollments).values(values.slice(i, i + 500)).onConflictDoNothing();
  }

  // Only explicit, per-person exclusions stop an in-flight sequence.
  const excluded = new Set(audience.excludeCustomerIds || []);
  const toStop = existing.filter((x) => x.status === "active" && excluded.has(x.customerId));
  if (toStop.length > 0) {
    await db.update(crmCampaignEnrollments)
      .set({ status: "stopped", nextActionAt: null, updatedAt: new Date() })
      .where(inArray(crmCampaignEnrollments.id, toStop.map((x) => x.id)));
  }

  if (customers.length > 0) {
    await db.update(crmCampaigns)
      .set({ audienceCount: customers.length, updatedAt: new Date() })
      .where(eq(crmCampaigns.id, campaignId));
  }

  return { added, removed: toStop.length };
}

/** Cancel a campaign: stop every in-flight enrollment. */
export async function cancelCampaign(campaignId: string): Promise<void> {
  await db.update(crmCampaignEnrollments)
    .set({ status: "stopped", nextActionAt: null, updatedAt: new Date() })
    .where(and(eq(crmCampaignEnrollments.campaignId, campaignId), eq(crmCampaignEnrollments.status, "active")));
  await db.update(crmCampaigns)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(crmCampaigns.id, campaignId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reply detection
// ─────────────────────────────────────────────────────────────────────────────

async function detectReply(e: CrmCampaignEnrollment): Promise<{ channel: "sms" | "email"; at: Date } | null> {
  if (!e.firstSentAt) return null;

  // SMS: any inbound message in the conversation we sent through (or, as a
  // fallback, any conversation matching the customer's phone digits).
  try {
    let conversationId = e.conversationId;
    if (!conversationId && e.phone) {
      const conv = await storage.getMessagingConversationByPhone(e.phone);
      conversationId = conv?.id ?? null;
    }
    if (conversationId) {
      const [reply] = await db
        .select({ at: sql<string>`COALESCE(${crmMessagingMessages.sentAt}, ${crmMessagingMessages.createdAt})` })
        .from(crmMessagingMessages)
        .where(and(
          eq(crmMessagingMessages.conversationId, conversationId),
          eq(crmMessagingMessages.direction, "inbound"),
          sql`COALESCE(${crmMessagingMessages.sentAt}, ${crmMessagingMessages.createdAt}) > ${e.firstSentAt}`,
        ))
        .limit(1);
      if (reply) return { channel: "sms", at: new Date(reply.at) };
    }
  } catch (err) {
    console.error("[Campaigns] SMS reply check failed:", err);
  }

  // Email: any inbound Gmail-synced message from the customer's address after
  // our first send (covers replies landing in any connected user's mailbox).
  try {
    if (e.email) {
      const [reply] = await db
        .select({ at: crmEmailMessages.sentAt })
        .from(crmEmailMessages)
        .where(and(
          eq(crmEmailMessages.direction, "inbound"),
          sql`LOWER(${crmEmailMessages.fromEmail}) = ${e.email.trim().toLowerCase()}`,
          gte(crmEmailMessages.sentAt, e.firstSentAt),
        ))
        .limit(1);
      if (reply?.at) return { channel: "email", at: reply.at };
    }
  } catch (err) {
    console.error("[Campaigns] email reply check failed:", err);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step execution
// ─────────────────────────────────────────────────────────────────────────────

function fill(t: string, name: string | null | undefined): string {
  const full = name || "there";
  return (t || "")
    .replace(/\{name\}/gi, full)
    .replace(/\{firstName\}/gi, full.split(" ")[0]);
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain, personal-looking HTML — campaign emails should read like one-to-one mail. */
function renderEmailHtml(text: string): string {
  const paragraphs = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">${paragraphs}</div>`;
}

async function killSwitchOn(channel: "sms" | "email"): Promise<boolean> {
  const key = channel === "sms" ? "automated_sms_enabled" : "automated_email_enabled";
  return (await storage.getSetting(key))?.value === "false";
}

let senderCache: { userId: string; user: CrmUser | null; at: number } | null = null;
async function getSenderUser(userId: string | null): Promise<CrmUser | null> {
  if (!userId) return null;
  if (senderCache && senderCache.userId === userId && Date.now() - senderCache.at < 60_000) return senderCache.user;
  const [user] = await db.select().from(crmUsers).where(eq(crmUsers.id, userId));
  senderCache = { userId, user: user ?? null, at: Date.now() };
  return user ?? null;
}

async function sendCampaignEmail(campaign: CrmCampaign, e: CrmCampaignEnrollment, step: CampaignStep): Promise<string> {
  if (!e.email) return "skipped: no email address";
  if (await killSwitchOn("email")) return "deferred: email kill switch (automated_email_enabled = false)";
  const subject = fill(step.subject || "A message from GHVAC", e.customerName);
  const body = fill(step.body || "", e.customerName);

  // Preferred: send from the campaign owner's connected Gmail so replies land
  // in their CRM Mail inbox (which is also how email reply detection works).
  const sender = await getSenderUser(campaign.createdById);
  if (sender?.gmailRefreshTokenEnc) {
    try {
      await gmailSendEmail(sender, { to: [e.email], subject, html: renderEmailHtml(body) });
      return "sent";
    } catch (err: any) {
      console.error("[Campaigns] Gmail send failed:", err?.message || err);
      // fall through to Resend
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) return "failed: no email sender (connect Gmail or set RESEND_API_KEY/FROM_EMAIL)";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: e.email, subject, text: body }),
  });
  return res.ok ? "sent" : `failed: resend ${res.status}`;
}

async function sendCampaignSms(e: CrmCampaignEnrollment, step: CampaignStep): Promise<{ result: string; conversationId?: string }> {
  if (!e.phone) return { result: "skipped: no phone number" };
  if (await killSwitchOn("sms")) return { result: "deferred: sms kill switch (automated_sms_enabled = false)" };
  const r = await sendAutomatedSms({
    customerId: e.customerId,
    phoneNumber: e.phone,
    messageBody: fill(step.body || "", e.customerName),
    notificationType: "campaign",
  });
  return r.success ? { result: "sent", conversationId: r.conversationId } : { result: `failed: ${r.errorMessage || "sms error"}` };
}

async function notifyUsers(userIds: string[], title: string, preview: string | null, customerId: string): Promise<void> {
  for (const userId of userIds) {
    await db.insert(crmNotifications).values({
      userId,
      type: "system" as any,
      title,
      preview,
      entityType: "customer",
      entityId: customerId,
    }).catch(() => {});
  }
}

async function recipientsForCampaign(campaign: CrmCampaign): Promise<string[]> {
  if (campaign.createdById) return [campaign.createdById];
  const users = await db.select({ id: crmUsers.id }).from(crmUsers).where(eq(crmUsers.isActive, true)).limit(10);
  return users.map((u) => u.id);
}

async function createFollowUpTask(campaign: CrmCampaign, e: CrmCampaignEnrollment, title: string, notes: string): Promise<string> {
  try {
    await db.insert(crmFollowUps).values({
      customerId: e.customerId,
      followUpType: "call",
      dueAt: new Date(),
      notes: `${title}${notes ? ` — ${notes}` : ""} (campaign: ${campaign.name})`,
      assignedUserId: campaign.createdById ?? null,
      createdBy: campaign.createdById ?? null,
    });
    await notifyUsers(await recipientsForCampaign(campaign), title, e.customerName ? `Re: ${e.customerName}` : null, e.customerId);
    return "sent";
  } catch (err: any) {
    console.error("[Campaigns] follow-up create failed:", err);
    return `failed: ${err?.message || "task error"}`;
  }
}

/** One-off test of an email step, sent to the CRM user building the campaign. */
export async function sendTestStepEmail(user: CrmUser, step: CampaignStep): Promise<string> {
  const to = user.gmailAddress || user.email;
  if (!to) return "failed: your account has no email address";
  const subject = `[Test] ${fill(step.subject || "A message from GHVAC", user.name)}`;
  const body = fill(step.body || "", user.name);
  if (user.gmailRefreshTokenEnc) {
    try {
      await gmailSendEmail(user, { to: [to], subject, html: renderEmailHtml(body) });
      return "sent";
    } catch (err: any) {
      console.error("[Campaigns] Gmail test send failed:", err?.message || err);
    }
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) return "failed: no email sender configured (connect Gmail in Mail, or set RESEND_API_KEY)";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  return res.ok ? "sent" : `failed: resend ${res.status}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────────────────────────────────────

// Quiet hours and the daily-cap day boundary run in the business's timezone,
// matching the rest of the app (routes.ts APP_TIMEZONE) — the server itself
// runs UTC on Render.
const BUSINESS_TZ = "America/New_York";

function inQuietHours(): boolean {
  const h = toZonedTime(new Date(), BUSINESS_TZ).getHours();
  return h >= 21 || h < 8;
}

/** UTC instant of the next 8:00am in business time. */
function quietHoursEndUtc(): Date {
  const zoned = toZonedTime(new Date(), BUSINESS_TZ);
  const end = new Date(zoned);
  end.setHours(8, 0, 0, 0);
  if (zoned.getHours() >= 8) end.setDate(end.getDate() + 1); // evening → tomorrow 8am
  return fromZonedTime(end, BUSINESS_TZ);
}

/** UTC instant of business-time midnight today. */
function businessDayStartUtc(): Date {
  const zoned = toZonedTime(new Date(), BUSINESS_TZ);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, BUSINESS_TZ);
}

function appendEvent(detail: string | null, event: Record<string, unknown>): string {
  let events: unknown[] = [];
  try { events = JSON.parse(detail || "[]"); } catch { /* ignore */ }
  if (!Array.isArray(events)) events = [];
  events.push({ t: new Date().toISOString(), ...event });
  return JSON.stringify(events.slice(-50));
}

/** Push an enrollment's next attempt forward without touching its step. */
async function deferEnrollment(id: string, until: Date): Promise<void> {
  await db.update(crmCampaignEnrollments)
    .set({ nextActionAt: until, updatedAt: new Date() })
    .where(eq(crmCampaignEnrollments.id, id));
}

async function sendsToday(campaignId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmCampaignSends)
    .where(and(
      eq(crmCampaignSends.campaignId, campaignId),
      eq(crmCampaignSends.status, "sent"),
      inArray(crmCampaignSends.channel, ["email", "sms"]),
      gte(crmCampaignSends.sentAt, businessDayStartUtc()),
    ));
  return row?.n ?? 0;
}

export async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const [remaining] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmCampaignEnrollments)
    .where(and(eq(crmCampaignEnrollments.campaignId, campaignId), eq(crmCampaignEnrollments.status, "active")));
  if ((remaining?.n ?? 0) === 0) {
    await db.update(crmCampaigns)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(crmCampaigns.id, campaignId), eq(crmCampaigns.status, "active")));
  }
}

async function handleReply(campaign: CrmCampaign, e: CrmCampaignEnrollment, reply: { channel: "sms" | "email"; at: Date }): Promise<void> {
  const settings = campaign.settings as CampaignSettings;
  const stop = settings?.reply?.stopSequence !== false;

  const newDetail = appendEvent(e.detail, { event: `reply detected (${reply.channel})${stop ? " — sequence stopped" : ""}` });
  // repliedAt IS NULL makes this idempotent — an overlapping process can't
  // double-count the reply or double-notify. nextActionAt is only cleared
  // (stop) — never written back, which would rewind another process's claim
  // lease into the due window.
  const patch: Record<string, unknown> = {
    status: stop ? "replied" : e.status,
    repliedAt: reply.at,
    replyChannel: reply.channel,
    detail: newDetail,
    updatedAt: new Date(),
  };
  if (stop) patch.nextActionAt = null;
  const updated = await db.update(crmCampaignEnrollments).set(patch as any)
    .where(and(eq(crmCampaignEnrollments.id, e.id), isNull(crmCampaignEnrollments.repliedAt)))
    .returning({ id: crmCampaignEnrollments.id });
  if (updated.length === 0) return;
  // Keep the in-memory row in sync — the non-stop path continues processing it.
  e.repliedAt = reply.at;
  e.replyChannel = reply.channel;
  e.detail = newDetail;

  await db.update(crmCampaigns)
    .set({ totalReplied: sql`${crmCampaigns.totalReplied} + 1`, updatedAt: new Date() })
    .where(eq(crmCampaigns.id, campaign.id));

  if (settings?.reply?.notifyTeam !== false) {
    await notifyUsers(
      await recipientsForCampaign(campaign),
      `${e.customerName || "A customer"} replied to "${campaign.name}"`,
      `Replied by ${reply.channel === "sms" ? "text" : "email"} — open the conversation to respond`,
      e.customerId,
    );
  }
  if (settings?.reply?.createFollowUp) {
    await createFollowUpTask(campaign, e, "Respond to campaign reply", `Replied by ${reply.channel}`);
  }
  if (stop) await maybeCompleteCampaign(campaign.id);
}

/** Scheduler tick: promote scheduled campaigns, then process due enrollments. */
let tickRunning = false;
export async function processDueCampaignEnrollments(): Promise<void> {
  if (tickRunning) return; // a slow tick (network sends) must not overlap the next
  tickRunning = true;
  try {
    await db.update(crmCampaigns)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(crmCampaigns.status, "scheduled"), lte(crmCampaigns.startAt, new Date())));

    const tickStart = new Date();
    // Join on campaign status so paused/scheduled campaigns' due rows never
    // occupy the 50-row window and starve other campaigns.
    const due = await db
      .select({ enrollment: crmCampaignEnrollments, campaign: crmCampaigns })
      .from(crmCampaignEnrollments)
      .innerJoin(crmCampaigns, eq(crmCampaignEnrollments.campaignId, crmCampaigns.id))
      .where(and(
        eq(crmCampaignEnrollments.status, "active"),
        lte(crmCampaignEnrollments.nextActionAt, tickStart),
        eq(crmCampaigns.status, "active"),
      ))
      .orderBy(crmCampaignEnrollments.nextActionAt)
      .limit(50);
    if (due.length === 0) return;

    const capExhausted = new Set<string>();

    for (const { enrollment: e, campaign } of due) {
      // Each enrollment is isolated: one failure must not abort the batch.
      try {
        const settings = campaign.settings as CampaignSettings;
        const steps = (campaign.steps as CampaignStep[]) || [];
        const step = steps[e.currentStepIndex];

        // Reply check happens before anything else so a response always wins.
        if (!e.repliedAt) {
          const reply = await detectReply(e);
          if (reply) {
            await handleReply(campaign, e, reply); // mutates e on success
            if (settings?.reply?.stopSequence !== false) continue;
          }
        }

        // Sequence finished? (status guard keeps overlapping processes from
        // double-counting)
        if (!step) {
          const closed = await db.update(crmCampaignEnrollments)
            .set({ status: "completed", nextActionAt: null, updatedAt: new Date() })
            .where(and(eq(crmCampaignEnrollments.id, e.id), eq(crmCampaignEnrollments.status, "active")))
            .returning({ id: crmCampaignEnrollments.id });
          if (closed.length > 0) {
            await db.update(crmCampaigns)
              .set({ totalCompleted: sql`${crmCampaigns.totalCompleted} + 1`, updatedAt: new Date() })
              .where(eq(crmCampaigns.id, campaign.id));
          }
          await maybeCompleteCampaign(campaign.id);
          continue;
        }

        // Customer-facing sends respect quiet hours + the daily cap; internal
        // task steps always run. Deferrals push nextActionAt forward so the
        // rows leave the due window instead of clogging it.
        const customerFacing = step.type === "email" || step.type === "sms";
        if (customerFacing && settings?.schedule?.quietHours !== false && inQuietHours()) {
          await deferEnrollment(e.id, quietHoursEndUtc());
          continue;
        }
        if (customerFacing && (settings?.schedule?.dailySendCap ?? 0) > 0) {
          if (capExhausted.has(campaign.id) || (await sendsToday(campaign.id)) >= settings.schedule.dailySendCap) {
            capExhausted.add(campaign.id);
            await deferEnrollment(e.id, new Date(Date.now() + 3_600_000)); // retry hourly until the day rolls over
            continue;
          }
        }

        // Atomic claim: lease the row before sending. Guards overlapping
        // processes and turns a crash between send and finalize into "one
        // retry after the lease expires" instead of a 60s duplicate loop.
        const claimed = await db.update(crmCampaignEnrollments)
          .set({ nextActionAt: new Date(Date.now() + 15 * 60_000), updatedAt: new Date() })
          .where(and(
            eq(crmCampaignEnrollments.id, e.id),
            eq(crmCampaignEnrollments.status, "active"),
            lte(crmCampaignEnrollments.nextActionAt, tickStart),
          ))
          .returning({ id: crmCampaignEnrollments.id });
        if (claimed.length === 0) continue; // another process got it first

        // Per-step condition: skip if they've already replied.
        let result: string;
        let conversationId: string | undefined;
        if (step.onlyIf === "no_reply" && e.repliedAt) {
          result = "skipped: customer already replied";
        } else if (step.type === "email") {
          result = await sendCampaignEmail(campaign, e, step);
        } else if (step.type === "sms") {
          const r = await sendCampaignSms(e, step);
          result = r.result;
          conversationId = r.conversationId;
        } else {
          result = await createFollowUpTask(campaign, e, fill(step.title || "Campaign follow-up", e.customerName), fill(step.body || "", e.customerName));
        }

        // A kill switch is temporary — hold the step instead of consuming it.
        if (result.startsWith("deferred")) {
          await deferEnrollment(e.id, new Date(Date.now() + 3_600_000));
          continue;
        }

        const status = result === "sent" ? "sent" : result.startsWith("failed") ? "failed" : "skipped";
        await db.insert(crmCampaignSends).values({
          campaignId: campaign.id,
          enrollmentId: e.id,
          customerId: e.customerId,
          stepId: step.id,
          stepIndex: e.currentStepIndex,
          channel: step.type,
          status,
          detail: result === "sent" ? null : result,
        }).catch((err) => console.error("[Campaigns] send log failed:", err));

        // Advance to the next step (genuine failures advance too — a dead
        // email address shouldn't wedge the sequence; the send log records
        // what happened). The status guard stops us resurrecting a row a
        // concurrent cancel stopped between our claim and now.
        const nextIndex = e.currentStepIndex + 1;
        const nextStep = steps[nextIndex];
        const now = new Date();
        const sent = status === "sent" && customerFacing;
        const finalized = await db.update(crmCampaignEnrollments).set({
          currentStepIndex: nextIndex,
          firstSentAt: sent && !e.firstSentAt ? now : e.firstSentAt,
          lastSentAt: sent ? now : e.lastSentAt,
          conversationId: conversationId ?? e.conversationId,
          status: nextStep ? "active" : "completed",
          nextActionAt: nextStep ? new Date(now.getTime() + stepDelayMs(nextStep)) : null,
          detail: appendEvent(e.detail, { step: e.currentStepIndex, type: step.type, result }),
          updatedAt: now,
        }).where(and(eq(crmCampaignEnrollments.id, e.id), eq(crmCampaignEnrollments.status, "active")))
          .returning({ id: crmCampaignEnrollments.id });

        const counters: Record<string, unknown> = { updatedAt: now };
        if (sent) {
          // The send happened regardless of what the enrollment row became.
          counters.totalSent = sql`${crmCampaigns.totalSent} + 1`;
          counters.lastSendAt = now;
        }
        if (status === "failed") counters.totalFailed = sql`${crmCampaigns.totalFailed} + 1`;
        if (!nextStep && finalized.length > 0) counters.totalCompleted = sql`${crmCampaigns.totalCompleted} + 1`;
        await db.update(crmCampaigns).set(counters as any).where(eq(crmCampaigns.id, campaign.id));
        if (!nextStep) await maybeCompleteCampaign(campaign.id);
      } catch (err) {
        console.error(`[Campaigns] enrollment ${e.id} errored this tick:`, err);
      }
    }
  } catch (err) {
    console.error("[Campaigns] processDueCampaignEnrollments error:", err);
  } finally {
    tickRunning = false;
  }
}

let schedulerStarted = false;
export function startCampaignScheduler(intervalMs = 60_000): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log("[Campaigns] scheduler started");
  setInterval(() => { processDueCampaignEnrollments(); }, intervalMs);
}
