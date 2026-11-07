import { Resend } from "resend";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db";
import { crmQuotes, crmUsers } from "@shared/schema";
import { storage } from "../storage";

/** Internal "quote approved" alert — fires whenever ANY quote is approved,
 *  whatever the path: manual accept in the CRM, the customer signing on the
 *  public quote page, a deposit payment auto-accepting, or an in-person
 *  menu-quote acceptance. Recipients come from the
 *  `quote_approval_notify_emails` setting (Settings → Payments); when the
 *  setting has never been saved, every active owner/admin with an email is
 *  notified. Saving an empty list turns the alert off. Always best-effort —
 *  a notify failure must never break the approval itself. */

export const QUOTE_APPROVAL_EMAILS_KEY = "quote_approval_notify_emails";

export type ApprovalMethod = "manual" | "portal_signature" | "deposit_paid" | "in_person";

const METHOD_LABEL: Record<ApprovalMethod, string> = {
  manual: "accepted manually in the CRM",
  portal_signature: "signed by the customer on the quote page",
  deposit_paid: "accepted — the customer paid the deposit online",
  in_person: "accepted by the customer in person",
};

/** The stored recipient list, or null when the setting was never saved
 *  (callers then fall back to the owner/admin default). "" = saved empty =
 *  alerts deliberately off. */
export async function getStoredApprovalEmails(): Promise<string[] | null> {
  const s = await storage.getSetting(QUOTE_APPROVAL_EMAILS_KEY);
  if (!s) return null;
  return s.value
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function getDefaultApprovalEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: crmUsers.email })
    .from(crmUsers)
    .where(and(eq(crmUsers.isActive, true), inArray(crmUsers.role, ["owner", "admin"])));
  return Array.from(new Set(rows.map((r) => (r.email || "").trim()).filter((e) => e.includes("@"))));
}

export async function getEffectiveApprovalEmails(): Promise<string[]> {
  const stored = await getStoredApprovalEmails();
  return stored !== null ? stored : await getDefaultApprovalEmails();
}

// The deposit flow can report an approval twice within seconds (webhook +
// client-side verify); one alert per quote per boot-window is plenty.
const recentlyNotified = new Map<string, number>();
const DEDUPE_MS = 6 * 60 * 60 * 1000;

const money = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function notifyQuoteApproved(
  quoteId: string,
  method: ApprovalMethod,
  opts: { approvedBy?: string | null; depositAmount?: string | number | null } = {},
): Promise<void> {
  try {
    const last = recentlyNotified.get(quoteId);
    if (last && Date.now() - last < DEDUPE_MS) return;
    recentlyNotified.set(quoteId, Date.now());
    // Keep the dedupe map from growing unbounded.
    if (recentlyNotified.size > 500) {
      const cutoff = Date.now() - DEDUPE_MS;
      Array.from(recentlyNotified.entries()).forEach(([k, t]) => {
        if (t < cutoff) recentlyNotified.delete(k);
      });
    }

    const recipients = await getEffectiveApprovalEmails();
    if (recipients.length === 0) return; // alerts turned off (or no office emails)

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[quote-approval] RESEND_API_KEY not set — approval alert skipped");
      return;
    }

    const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, quoteId));
    if (!quote) return;

    const title = quote.title || `Quote ${quote.quoteNumber}`;
    const subject = `Quote approved — ${quote.customerName || "Customer"} · ${quote.quoteNumber}`;
    const quoteUrl = `https://www.ghvac.app/crm/quotes/${quote.id}`;
    const lines: Array<[string, string]> = [
      ["Customer", quote.customerName || "—"],
      ["Quote", `${quote.quoteNumber}${quote.title ? ` — ${quote.title}` : ""}`],
      ...(quote.selectedOption ? ([["Selected option", quote.selectedOption]] as Array<[string, string]>) : []),
      ["Total", money(quote.total)],
      ...(opts.depositAmount ? ([["Deposit paid", money(opts.depositAmount)]] as Array<[string, string]>) : []),
      ["How", METHOD_LABEL[method] + (opts.approvedBy ? ` by ${opts.approvedBy}` : "")],
    ];

    const rowsHtml = lines
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${esc(v)}</td></tr>`,
      )
      .join("");
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
  <div style="height:4px;background:#711419;"></div>
  <div style="padding:20px 24px;">
    <p style="margin:0;color:#0f172a;font-size:17px;font-weight:800;">Quote approved 🎉</p>
    <p style="margin:6px 0 14px 0;color:#475569;font-size:13px;">${esc(title)} was just approved.</p>
    <table role="presentation" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    <a href="${esc(quoteUrl)}" style="display:inline-block;margin-top:16px;background:#711419;color:#ffffff;padding:10px 22px;border-radius:4px;text-decoration:none;font-weight:700;font-size:13px;">Open the quote</a>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:10px 24px;">
    <p style="margin:0;color:#94a3b8;font-size:11px;">Internal alert · recipients are set in CRM Settings → Payments → Quote approval alerts</p>
  </div>
</div>`;
    const text = [
      `Quote approved — ${title}`,
      ...lines.map(([k, v]) => `${k}: ${v}`),
      `Open: ${quoteUrl}`,
    ].join("\n");

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "quotes@ghvacinc.com",
      to: recipients,
      subject,
      html,
      text,
      headers: { "X-Entity-Ref-ID": `quote-approved-${quote.id}` },
    });
    if (error) {
      console.error("[quote-approval] Resend error:", (error as any)?.message || error);
    } else {
      console.log(`[quote-approval] alert sent for ${quote.quoteNumber} (${method}) to ${recipients.join(", ")}`);
    }
  } catch (e: any) {
    console.error("[quote-approval] notify failed:", e?.message || e);
  }
}
