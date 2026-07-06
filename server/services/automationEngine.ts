import { db } from "../db";
import { and, eq, lte, gte, sql } from "drizzle-orm";
import { automationCampaigns, automationRuns, crmNotifications, crmUsers } from "@shared/schema";
import { storage } from "../storage";
import { sendAutomatedSms } from "./smsNotificationService";
import type {
  AutomationCondition, AutomationAction, AutomationTiming, AutomationSafeguards,
} from "@shared/automation";

// Fields the caller resolves so conditions can be evaluated without extra queries.
export interface AutomationContext {
  customerId?: string | null;
  customerName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  entityType?: string;
  entityId?: string;
  // dot-path values, e.g. { "customer.type": "residential", "invoice.total": 1250 }
  fields?: Record<string, string | number | null | undefined>;
}

const DELAY_MS: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

// ── The hard safety gate ─────────────────────────────────────────────────────
// A channel only sends when its setting is EXPLICITLY "true". Unset or "false"
// => blocked (dry-run). This is stricter than the rest of the app on purpose so
// nothing goes out while marketing is still being built.
async function channelEnabled(channel: "sms" | "email" | "review"): Promise<boolean> {
  const val = async (k: string) => (await storage.getSetting(k))?.value;
  if (channel === "sms") return (await val("automated_sms_enabled")) === "true";
  if (channel === "email") return (await val("automated_email_enabled")) === "true";
  // review requests go out over SMS, so both must be on
  return (await val("review_automation_enabled")) === "true" && (await val("automated_sms_enabled")) === "true";
}

function getField(ctx: AutomationContext, key: string): string | number | null | undefined {
  return ctx.fields?.[key];
}

function evaluateConditions(conditions: AutomationCondition[] | null | undefined, ctx: AutomationContext): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => {
    const raw = getField(ctx, c.field);
    const actual = raw == null ? "" : String(raw).toLowerCase();
    const expected = (c.value ?? "").toLowerCase();
    switch (c.operator) {
      case "equals": return actual === expected;
      case "not_equals": return actual !== expected;
      case "contains": return actual.includes(expected);
      case "is_empty": return actual === "";
      case "is_not_empty": return actual !== "";
      case "greater_than": return Number(raw) > Number(c.value);
      case "less_than": return Number(raw) < Number(c.value);
      default: return false;
    }
  });
}

// Cooldown + monthly cap, using automation_runs history (status = sent).
async function passesSafeguards(campaignId: string, ctx: AutomationContext, sg: AutomationSafeguards | null): Promise<{ ok: boolean; reason?: string }> {
  if (!ctx.customerId || !sg) return { ok: true };
  if (sg.cooldownDays && sg.cooldownDays > 0) {
    const since = new Date(Date.now() - sg.cooldownDays * 86_400_000);
    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(automationRuns)
      .where(and(
        eq(automationRuns.campaignId, campaignId),
        eq(automationRuns.customerId, ctx.customerId),
        eq(automationRuns.status, "sent"),
        gte(automationRuns.processedAt, since),
      ));
    if ((recent?.n ?? 0) > 0) return { ok: false, reason: `cooldown (${sg.cooldownDays}d)` };
  }
  if (sg.maxPerCustomerPerMonth && sg.maxPerCustomerPerMonth > 0) {
    const monthStart = new Date(Date.now() - 30 * 86_400_000);
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(automationRuns)
      .where(and(
        eq(automationRuns.campaignId, campaignId),
        eq(automationRuns.customerId, ctx.customerId),
        eq(automationRuns.status, "sent"),
        gte(automationRuns.processedAt, monthStart),
      ));
    if ((count?.n ?? 0) >= sg.maxPerCustomerPerMonth) return { ok: false, reason: "monthly cap" };
  }
  return { ok: true };
}

function inQuietHours(): boolean {
  const h = new Date().getHours();
  return h >= 21 || h < 8;
}

/** Called from CRM endpoints when an event happens. Enqueues matching runs. */
export async function runAutomationTrigger(triggerType: string, ctx: AutomationContext): Promise<void> {
  try {
    const active = await db.select().from(automationCampaigns).where(eq(automationCampaigns.isActive, true));
    const matching = active.filter((c) => (c.trigger as any)?.type === triggerType);
    for (const c of matching) {
      if (!evaluateConditions(c.conditions as AutomationCondition[], ctx)) continue;
      const guard = await passesSafeguards(c.id, ctx, c.safeguards as AutomationSafeguards);
      const timing = (c.timing as AutomationTiming) || { delay: 0, delayUnit: "hours", businessHoursOnly: true };
      const dueAt = new Date(Date.now() + (timing.delay || 0) * (DELAY_MS[timing.delayUnit] || DELAY_MS.hours));
      await db.insert(automationRuns).values({
        campaignId: c.id,
        triggerType,
        customerId: ctx.customerId ?? null,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        dueAt,
        status: guard.ok ? "pending" : "skipped",
        detail: guard.ok ? JSON.stringify({ ctx }) : `Skipped: ${guard.reason}`,
        processedAt: guard.ok ? null : new Date(),
      });
      await db.update(automationCampaigns)
        .set({ totalTriggered: sql`${automationCampaigns.totalTriggered} + 1`, lastRunAt: new Date() })
        .where(eq(automationCampaigns.id, c.id));
    }
  } catch (err) {
    console.error("[Automation] runAutomationTrigger error:", err);
  }
}

async function dispatchAction(action: AutomationAction, ctx: AutomationContext): Promise<string> {
  const cfg = action.config || {};
  const fill = (t: string) => (t || "")
    .replace(/\{name\}/gi, ctx.customerName || "there")
    .replace(/\{firstName\}/gi, (ctx.customerName || "there").split(" ")[0]);

  switch (action.type) {
    case "send_sms": {
      if (!(await channelEnabled("sms"))) return "DRY-RUN sms (automated_sms_enabled != true)";
      if (!ctx.phoneNumber || !ctx.customerId) return "skipped sms (no phone/customer)";
      const r = await sendAutomatedSms({ customerId: ctx.customerId, phoneNumber: ctx.phoneNumber, messageBody: fill(cfg.template || ""), notificationType: "review_request" as any });
      return r.success ? "sent sms" : `sms failed: ${r.errorMessage}`;
    }
    case "review_request": {
      if (!(await channelEnabled("review"))) return "DRY-RUN review (review/sms not enabled)";
      if (!ctx.phoneNumber || !ctx.customerId) return "skipped review (no phone/customer)";
      const link = (await storage.getSetting("google_review_link"))?.value || "";
      const tmpl = (await storage.getSetting("sms_template_review_request"))?.value || "Thanks for choosing us! We'd love a quick review: {reviewLink}";
      const body = fill(tmpl).replace(/\{reviewLink\}/gi, link);
      const r = await sendAutomatedSms({ customerId: ctx.customerId, phoneNumber: ctx.phoneNumber, messageBody: body, notificationType: "review_request" as any });
      return r.success ? "sent review request" : `review failed: ${r.errorMessage}`;
    }
    case "send_email": {
      if (!(await channelEnabled("email"))) return "DRY-RUN email (automated_email_enabled != true)";
      if (!ctx.email) return "skipped email (no address)";
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.FROM_EMAIL;
      if (!apiKey || !from) return "skipped email (not configured)";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: ctx.email, subject: fill(cfg.subject || "A message from GHVAC"), text: fill(cfg.body || "") }),
      });
      return res.ok ? "sent email" : `email failed (${res.status})`;
    }
    case "notify_team":
    case "create_task": {
      // Internal only — never leaves the CRM, so always allowed.
      const admins = await db.select({ id: crmUsers.id }).from(crmUsers).where(and(eq(crmUsers.isActive, true))).limit(25);
      const title = action.type === "create_task" ? (cfg.title || "Automation follow-up") : (cfg.message || "Automation notification");
      for (const u of admins) {
        await db.insert(crmNotifications).values({
          userId: u.id, type: "system" as any, title,
          preview: ctx.customerName ? `Re: ${ctx.customerName}` : null,
          entityType: ctx.entityType, entityId: ctx.entityId,
        }).catch(() => {});
      }
      return `posted internal ${action.type}`;
    }
    case "add_tag":
      return "add_tag not yet supported";
    default:
      return "unknown action";
  }
}

/** Scheduler tick: process runs that are due. */
export async function processDueAutomationRuns(): Promise<void> {
  try {
    const due = await db.select().from(automationRuns)
      .where(and(eq(automationRuns.status, "pending"), lte(automationRuns.dueAt, new Date())))
      .limit(50);
    for (const run of due) {
      const [campaign] = await db.select().from(automationCampaigns).where(eq(automationCampaigns.id, run.campaignId));
      if (!campaign || !campaign.isActive) {
        await db.update(automationRuns).set({ status: "skipped", detail: "campaign inactive/removed", processedAt: new Date() }).where(eq(automationRuns.id, run.id));
        continue;
      }
      const sg = campaign.safeguards as AutomationSafeguards | null;
      if (sg?.quietHours && inQuietHours()) continue; // leave pending; retry after quiet hours

      let ctx: AutomationContext = {};
      try { ctx = JSON.parse(run.detail || "{}").ctx || {}; } catch { /* ignore */ }
      ctx.customerId = ctx.customerId ?? run.customerId ?? undefined;
      ctx.entityType = ctx.entityType ?? run.entityType ?? undefined;
      ctx.entityId = ctx.entityId ?? run.entityId ?? undefined;

      const results: string[] = [];
      for (const action of (campaign.actions as AutomationAction[]) || []) {
        results.push(`${action.type}: ${await dispatchAction(action, ctx)}`);
      }
      // Count the run as completed if any action actually sent/posted (not a
      // dry-run, skip, or failure).
      const anySent = results.some((r) => /:\s*(sent|posted)/i.test(r));
      await db.update(automationRuns).set({
        status: anySent ? "sent" : "skipped",
        detail: results.join(" | "),
        processedAt: new Date(),
      }).where(eq(automationRuns.id, run.id));
      if (anySent) {
        await db.update(automationCampaigns).set({ totalCompleted: sql`${automationCampaigns.totalCompleted} + 1` }).where(eq(automationCampaigns.id, campaign.id));
      }
    }
  } catch (err) {
    console.error("[Automation] processDueAutomationRuns error:", err);
  }
}

let schedulerStarted = false;
export function startAutomationScheduler(intervalMs = 60_000): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log("[Automation] scheduler started");
  setInterval(() => { processDueAutomationRuns(); }, intervalMs);
}
