import { Resend } from "resend";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

const brandDefaults = {
  name: "Giesbrecht HVAC",
  color: "#711419",
};

function asCurrency(v: string | number, locale = "en-US", currency = "USD") {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

function formatDate(d?: string | Date | null) {
  const date = d ? new Date(d) : new Date();
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface CrmQuoteEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
  htmlContent?: string;
  textContent?: string;
  fromEmail?: string;
  replyToEmail?: string;
  subject?: string;
}

export interface CrmQuoteEmailOptions {
  senderEmail?: string;
  senderName?: string;
  quoteViewUrl?: string;
  replyToEmail?: string;
}

export async function sendCrmQuoteEmail(
  quote: CrmQuote,
  lineItems: CrmQuoteLineItem[],
  recipientEmail: string,
  personalMessage?: string,
  sentBy?: string,
  options?: CrmQuoteEmailOptions
): Promise<CrmQuoteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fallbackEmail = process.env.FROM_EMAIL || "quotes@ghvac.work";
  const brandName = brandDefaults.name;
  const brandColor = brandDefaults.color;

  // Debug: log first 15 chars of API key to verify correct key is loaded
  console.log("[CRM Email] API Key prefix:", apiKey ? apiKey.substring(0, 15) + "..." : "NOT SET");

  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured");
    return { success: false, error: "Email service not configured" };
  }

  const resend = new Resend(apiKey);

  // Use sender's email if provided and domain is verified, otherwise fall back to default
  let fromEmail = fallbackEmail;
  console.log("[CRM Email] Options received:", { 
    senderEmail: options?.senderEmail, 
    senderName: options?.senderName,
    fallbackEmail 
  });
  
  if (options?.senderEmail) {
    // Format: "Name <email@domain.com>" for better email display
    if (options.senderName) {
      fromEmail = `${options.senderName} <${options.senderEmail}>`;
    } else {
      fromEmail = options.senderEmail;
    }
  }
  
  // Use quotes@ghvacinc.com as the standard From address
  const standardFromEmail = "quotes@ghvacinc.com";
  const replyToEmail = options?.replyToEmail;
  
  console.log("[CRM Email] Sending quote email FROM:", standardFromEmail, "REPLY-TO:", replyToEmail, "TO:", recipientEmail);

  // Filter out labor/internal line items from client-facing email
  const clientVisibleItems = lineItems.filter(item => 
    item.lineType !== "labor" && item.lineType !== "other"
  );

  const subject = `Your Quote from ${brandName} - ${quote.quoteNumber}`;
  const html = buildHtmlBody(quote, clientVisibleItems, personalMessage, sentBy, options?.quoteViewUrl);
  const text = buildTextBody(quote, clientVisibleItems, personalMessage, sentBy, options?.quoteViewUrl);

  try {
    const { data, error } = await resend.emails.send({
      from: standardFromEmail,
      to: [recipientEmail],
      replyTo: replyToEmail || undefined,
      subject,
      html,
      text,
      headers: { "X-Entity-Ref-ID": `crm-quote-${quote.id}` },
    });

    if (error) {
      console.error("Resend error sending quote email:", error);
      return { success: false, error: (error as any).message || "Failed to send email" };
    }

    console.log("CRM Quote email sent successfully:", data?.id);
    return { 
      success: true, 
      messageId: data?.id,
      htmlContent: html,
      textContent: text,
      fromEmail: standardFromEmail,
      replyToEmail,
      subject,
    };
  } catch (err) {
    console.error("Error sending CRM quote email:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

interface OptionGroup {
  tag: string;
  items: CrmQuoteLineItem[];
  total: number;
}

const PACKAGE_LEVEL_ORDER = ["Best", "Better", "Good", "Budget"];

function getOptionSortOrder(tag: string): number {
  const lowerTag = tag.toLowerCase();
  for (let i = 0; i < PACKAGE_LEVEL_ORDER.length; i++) {
    const level = PACKAGE_LEVEL_ORDER[i].toLowerCase();
    if (lowerTag === level || lowerTag.startsWith(level)) {
      return i;
    }
  }
  return PACKAGE_LEVEL_ORDER.length;
}

function groupLineItemsByOption(lineItems: CrmQuoteLineItem[]): OptionGroup[] {
  const groups = new Map<string, CrmQuoteLineItem[]>();
  
  lineItems.forEach(item => {
    const tag = item.optionTag;
    if (!tag) return;
    if (!groups.has(tag)) {
      groups.set(tag, []);
    }
    groups.get(tag)!.push(item);
  });
  
  return Array.from(groups.entries())
    .map(([tag, items]) => ({
      tag,
      items,
      total: items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0),
    }))
    .sort((a, b) => getOptionSortOrder(a.tag) - getOptionSortOrder(b.tag));
}

function buildTextBody(
  quote: CrmQuote,
  lineItems: CrmQuoteLineItem[],
  personalMessage?: string,
  sentBy?: string,
  quoteViewUrl?: string
): string {
  const lines: string[] = [];
  lines.push(`${brandDefaults.name}`);
  lines.push("");

  if (personalMessage) {
    lines.push(personalMessage);
    lines.push("");
  }

  if (quoteViewUrl) {
    lines.push("VIEW YOUR QUOTE:");
    lines.push(quoteViewUrl);
    lines.push("");
  }

  lines.push("Questions? Contact us at (706) 826-0644.");
  lines.push("");
  lines.push("Thank you for choosing Giesbrecht HVAC!");

  return lines.join("\n");
}

function buildHtmlBody(
  quote: CrmQuote,
  lineItems: CrmQuoteLineItem[],
  personalMessage?: string,
  sentBy?: string,
  quoteViewUrl?: string
): string {
  const brandName = brandDefaults.name;
  const brandColor = brandDefaults.color;

  const personalMessageHtml = personalMessage
    ? `
      <tr>
        <td class="px-24" style="padding:0 20px 16px 20px;">
          <div style="font-size:15px;color:#374151;font-family:Arial,sans-serif;line-height:1.6;">${esc(personalMessage)}</div>
        </td>
      </tr>`
    : "";

  const headCss = `
    :root { color-scheme: light only; }
    body { margin:0; padding:0; }
    table { border-collapse:collapse; }
    @media only screen and (max-width: 600px) {
      .container { width:100% !important; border-radius:0 !important; }
      .px-24 { padding-left:14px !important; padding-right:14px !important; }
    }
  `;

  return `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quote from ${esc(brandName)}</title>
  <style type="text/css">${headCss}</style>
</head>
<body style="margin:0;padding:0;font-family:Arial,Segoe UI,Roboto,Helvetica,sans-serif;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="container" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(16,24,40,0.08);">

          <!-- Header with text branding -->
          <tr>
            <td style="background:${brandColor};padding:28px 20px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:0.5px;">${esc(brandName)}</h1>
              <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Professional Heating & Cooling Solutions</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td class="px-24" style="padding:24px 20px 16px 20px;">
              <h2 style="margin:0;color:#111827;font-size:20px;font-weight:600;">Your Quote is Ready!</h2>
              <p style="margin:10px 0 0 0;color:#6b7280;font-size:14px;line-height:1.5;">
                Thank you for considering ${esc(brandName)} for your HVAC needs. We've prepared a detailed quote for you to review.
              </p>
            </td>
          </tr>

          <!-- Prepared For -->
          <tr>
            <td class="px-24" style="padding:0 20px 16px 20px;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
                <p style="margin:0 0 4px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Prepared For</p>
                <p style="margin:0;color:#1e293b;font-size:16px;font-weight:600;">${esc(quote.customerName || "Valued Customer")}</p>
              </div>
            </td>
          </tr>

          ${personalMessageHtml}

          <!-- View Quote Button -->
          <tr>
            <td class="px-24" style="padding:8px 20px 24px 20px;text-align:center;">
              ${quoteViewUrl ? `
              <a href="${esc(quoteViewUrl)}" style="display:inline-block;background:${brandColor};color:#ffffff;padding:16px 48px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 2px 4px rgba(113,20,25,0.3);">View Your Quote</a>
              ` : `
              <a href="tel:+17068260644" style="display:inline-block;background:${brandColor};color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Call Us: (706) 826-0644</a>
              `}
            </td>
          </tr>

          <!-- Info section -->
          <tr>
            <td class="px-24" style="padding:0 20px 24px 20px;">
              <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
                  <strong>Questions?</strong> We're here to help! Call us at <a href="tel:+17068260644" style="color:#92400e;font-weight:600;">(706) 826-0644</a> or reply to this email.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:24px 20px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-weight:700;color:#111827;font-size:15px;">${esc(brandName)}</p>
              <p style="margin:8px 0 0 0;font-size:13px;color:#6b7280;">(706) 826-0644</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Serving Augusta, GA and surrounding areas</p>
              <p style="margin:12px 0 0 0;font-size:11px;color:#9ca3af;">Licensed &amp; Insured | Quality Service Since Day One</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
