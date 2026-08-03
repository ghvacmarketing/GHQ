import { Resend } from "resend";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";
import { storage } from "../storage";

const brandDefaults = {
  name: "Giesbrecht HVAC",
  color: "#711419",
};

const EMAIL_TEMPLATE_DEFAULTS = {
  subject: "Your Quote from {brand_name} - {quote_number}",
  intro: "Thank you for considering {brand_name} for your HVAC needs. We've prepared a detailed quote for you to review.",
  signature: "Thank you for choosing {brand_name}. We look forward to serving you!",
};

async function getEmailTemplate(key: string, defaultValue: string): Promise<string> {
  const setting = await storage.getSetting(key);
  return setting?.value || defaultValue;
}

function replacePlaceholders(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    // Case-insensitive replacement to handle any casing of placeholders
    result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
  }
  return result;
}

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

function descriptionToEmailSafeHtml(description: string): string {
  return description
    .replace(/<h1([^>]*)>/gi, '<h1$1 style="text-align:center;font-size:20px;font-weight:700;color:#1e293b;margin:16px 0 8px 0;font-family:Arial,sans-serif;">')
    .replace(/<h2([^>]*)>/gi, '<h2$1 style="font-size:16px;font-weight:700;color:#711419;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:18px 0 8px 0;font-family:Arial,sans-serif;">')
    .replace(/<h3([^>]*)>/gi, '<h3$1 style="font-size:14px;font-weight:700;color:#1e293b;margin:14px 0 6px 0;font-family:Arial,sans-serif;">')
    .replace(/<p([^>]*)>/gi, '<p$1 style="font-size:14px;color:#374151;line-height:1.6;margin:8px 0;font-family:Arial,sans-serif;">')
    .replace(/<ul([^>]*)>/gi, '<ul$1 style="margin:8px 0;padding-left:24px;">')
    .replace(/<ol([^>]*)>/gi, '<ol$1 style="margin:8px 0;padding-left:24px;">')
    .replace(/<li([^>]*)>/gi, '<li$1 style="font-size:14px;color:#374151;line-height:1.7;margin:3px 0;font-family:Arial,sans-serif;">')
    .replace(/<hr([^>]*)>/gi, '<hr$1 style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">')
    .replace(/<strong([^>]*)>/gi, '<strong$1 style="font-weight:700;">')
    .replace(/<b([^>]*)>/gi, '<b$1 style="font-weight:700;">');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n---\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  isManual?: boolean;
}

/** The rendered quote email (subject/html/text) — shared by the Resend path
 *  and the send-from-the-user's-own-Gmail path. */
export async function buildQuoteEmailContent(
  quote: CrmQuote,
  lineItems: CrmQuoteLineItem[],
  personalMessage?: string,
  sentBy?: string,
  options?: { quoteViewUrl?: string }
): Promise<{ subject: string; html: string; text: string }> {
  // Filter out labor/internal line items from client-facing email — and
  // anything explicitly flagged not customer-visible (worksheet cost lines).
  let clientVisibleItems = lineItems.filter(item =>
    item.customerVisible === true || (item.customerVisible !== false && item.lineType !== "labor" && item.lineType !== "other")
  );
  // Custom quotes are all internal cost build-up — the customer's email shows
  // one line: the package at its sell price.
  if (clientVisibleItems.length === 0 && parseFloat(quote.total || "0") > 0) {
    clientVisibleItems = [{
      id: `sell-${quote.id}`,
      quoteId: quote.id,
      lineType: "install",
      description: quote.title || "Complete installation as specified",
      quantity: "1",
      unitPrice: quote.total,
      lineTotal: quote.total,
    } as CrmQuoteLineItem];
  }

  // Calculate quote total for placeholder replacement
  const quoteTotal = clientVisibleItems.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);

  const subjectTemplate = await getEmailTemplate("email_template_quote_subject", EMAIL_TEMPLATE_DEFAULTS.subject);
  const introTemplate = await getEmailTemplate("email_template_quote_intro", EMAIL_TEMPLATE_DEFAULTS.intro);
  const signatureTemplate = await getEmailTemplate("email_template_quote_signature", EMAIL_TEMPLATE_DEFAULTS.signature);

  const placeholderData: Record<string, string> = {
    brand_name: brandDefaults.name,
    quote_number: quote.quoteNumber || "",
    customer_name: quote.customerName || "Valued Customer",
    quote_total: asCurrency(quoteTotal),
  };

  const subject = replacePlaceholders(subjectTemplate, placeholderData);
  const introText = replacePlaceholders(introTemplate, placeholderData);
  const signatureText = replacePlaceholders(signatureTemplate, placeholderData);

  const html = buildHtmlBody(quote, clientVisibleItems, personalMessage, sentBy, options?.quoteViewUrl, introText, signatureText);
  const text = buildTextBody(quote, clientVisibleItems, personalMessage, sentBy, options?.quoteViewUrl, introText, signatureText);
  return { subject, html, text };
}

export async function sendCrmQuoteEmail(
  quote: CrmQuote,
  lineItems: CrmQuoteLineItem[],
  recipientEmail: string,
  personalMessage?: string,
  sentBy?: string,
  options?: CrmQuoteEmailOptions
): Promise<CrmQuoteEmailResult> {
  if (!options?.isManual) {
    const emailSetting = await storage.getSetting("automated_email_enabled");
    if (emailSetting && emailSetting.value === "false") {
      console.log("[CRM Email] Automated emails are disabled (skipped for manual sends)");
      return { success: false, error: "Automated emails are disabled" };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fallbackEmail = process.env.FROM_EMAIL || "quotes@ghvac.work";
  const brandName = brandDefaults.name;
  const brandColor = brandDefaults.color;

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

  const { subject, html, text } = await buildQuoteEmailContent(quote, lineItems, personalMessage, sentBy, {
    quoteViewUrl: options?.quoteViewUrl,
  });

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
  quoteViewUrl?: string,
  introText?: string,
  signatureText?: string
): string {
  const lines: string[] = [];
  lines.push(`${brandDefaults.name}`);
  lines.push("Professional Heating & Cooling Solutions");
  lines.push("");
  lines.push("----------------------------------------");
  lines.push("");
  lines.push(`Quote Number: ${quote.quoteNumber || ""}`);
  lines.push(`Date Prepared: ${formatDate(quote.createdAt)}`);
  lines.push(`Service Type: ${formatQuoteType(quote.quoteType)}`);
  if (quote.validUntil) {
    lines.push(`Valid Until: ${formatDate(quote.validUntil)}`);
  }
  lines.push("");
  lines.push("----------------------------------------");
  lines.push("");
  lines.push("Your quote is ready");
  lines.push("");
  lines.push(`Prepared For: ${quote.customerName || "Valued Customer"}`);
  if (quote.serviceAddress) {
    lines.push(`Service Location: ${quote.serviceAddress}`);
  }
  lines.push("");
  lines.push(introText || "Thank you for considering Giesbrecht HVAC for your HVAC needs. We've prepared a detailed quote for you to review.");
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

  lines.push("----------------------------------------");
  lines.push("");
  lines.push("Questions? Call us at (706) 826-0644 or just reply to this email.");
  lines.push("");
  if (signatureText) {
    lines.push(signatureText);
    lines.push("");
  }
  lines.push("Giesbrecht HVAC");
  lines.push("(706) 826-0644");
  lines.push("1530 Crescent Ct, Augusta, GA");
  lines.push("");
  lines.push("Licensed & Insured | Serving Augusta, GA and surrounding areas");

  return lines.join("\n");
}

function formatQuoteType(quoteType?: string | null): string {
  if (!quoteType) return "HVAC Service";
  switch (quoteType.toLowerCase()) {
    case "quick": return "Service Quote";
    case "proposal": return "Installation Proposal";
    case "custom_install": return "Custom Installation";
    case "custom_service": return "Custom Service";
    default: return "HVAC Service";
  }
}

function buildHtmlBody(
  quote: CrmQuote,
  lineItems: CrmQuoteLineItem[],
  personalMessage?: string,
  sentBy?: string,
  quoteViewUrl?: string,
  introText?: string,
  signatureText?: string
): string {
  const brandName = brandDefaults.name;
  const brandColor = brandDefaults.color;

  const serviceType = formatQuoteType(quote.quoteType);
  const quoteDate = formatDate(quote.createdAt);
  const validUntilDate = quote.validUntil ? formatDate(quote.validUntil) : null;
  const serviceAddress = quote.serviceAddress;

  const headCss = `
    :root { color-scheme: light only; }
    body { margin:0; padding:0; }
    table { border-collapse:collapse; }
    @media only screen and (max-width: 600px) {
      .container { width:100% !important; border-left:none !important; border-right:none !important; }
      .px-24 { padding-left:16px !important; padding-right:16px !important; }
      .stack { display:block !important; width:100% !important; padding:0 0 10px 0 !important; }
    }
  `;

  // Industrial GHQ style: squared 4px corners, hairline slate borders, the
  // maroon reserved for the accent bar, tag, and button. Calm sentence-case
  // copy (no shouting) reads better and scores better with spam filters.
  const label = `margin:0 0 4px 0;color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;font-family:Arial,Helvetica,sans-serif;`;
  const value = `margin:0;color:#0f172a;font-size:15px;font-weight:700;font-family:Arial,Helvetica,sans-serif;`;
  const card = `background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;`;

  return `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quote from ${esc(brandName)}</title>
  <style type="text/css">${headCss}</style>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#eef1f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="container" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">

          <!-- Maroon accent bar -->
          <tr>
            <td style="height:4px;background:${brandColor};font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header — brand left, squared QUOTE tag right -->
          <tr>
            <td class="px-24" style="padding:22px 24px 18px 24px;border-bottom:1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;color:#0f172a;font-size:20px;font-weight:800;letter-spacing:-0.2px;font-family:Arial,Helvetica,sans-serif;">${esc(brandName)}</p>
                    <p style="margin:5px 0 0 0;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;font-family:Arial,Helvetica,sans-serif;">Heating &amp; Cooling &middot; Wrens, GA</p>
                  </td>
                  <td style="vertical-align:middle;text-align:right;">
                    <span style="display:inline-block;border:1px solid ${brandColor};color:${brandColor};padding:6px 12px;border-radius:3px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;font-family:Arial,Helvetica,sans-serif;">Quote</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Reference block -->
          <tr>
            <td class="px-24" style="padding:20px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${card}">
                <tr>
                  <td style="padding:14px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:50%;vertical-align:top;">
                          <p style="${label}">Quote number</p>
                          <p style="${value}">${esc(quote.quoteNumber || "")}</p>
                        </td>
                        <td style="width:50%;vertical-align:top;text-align:right;">
                          <p style="${label}">Date prepared</p>
                          <p style="${value}font-size:14px;">${esc(quoteDate)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:12px;vertical-align:top;">
                          <p style="${label}">Service type</p>
                          <p style="${value}font-size:14px;">${esc(serviceType)}</p>
                        </td>
                        ${validUntilDate ? `
                        <td style="padding-top:12px;vertical-align:top;text-align:right;">
                          <p style="${label}">Valid until</p>
                          <p style="${value}font-size:14px;">${esc(validUntilDate)}</p>
                        </td>
                        ` : "<td></td>"}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td class="px-24" style="padding:22px 24px 4px 24px;">
              <h2 style="margin:0;color:#0f172a;font-size:19px;font-weight:700;letter-spacing:-0.2px;font-family:Arial,Helvetica,sans-serif;">Your quote is ready</h2>
              <p style="margin:9px 0 0 0;color:#475569;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
                ${esc(introText || "Thank you for considering " + brandName + " for your HVAC needs. We've prepared a detailed quote for you to review.")}
              </p>
            </td>
          </tr>

          <!-- Customer and service location -->
          <tr>
            <td class="px-24" style="padding:16px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="stack" style="width:${serviceAddress ? '50%' : '100%'};vertical-align:top;padding-right:${serviceAddress ? '6px' : '0'};">
                    <div style="${card}padding:13px 16px;">
                      <p style="${label}">Prepared for</p>
                      <p style="${value}font-size:15px;">${esc(quote.customerName || "Valued Customer")}</p>
                    </div>
                  </td>
                  ${serviceAddress ? `
                  <td class="stack" style="width:50%;vertical-align:top;padding-left:6px;">
                    <div style="${card}padding:13px 16px;">
                      <p style="${label}">Service location</p>
                      <p style="margin:0;color:#0f172a;font-size:13px;font-weight:600;line-height:1.45;font-family:Arial,Helvetica,sans-serif;">${esc(serviceAddress)}</p>
                    </div>
                  </td>
                  ` : ""}
                </tr>
              </table>
            </td>
          </tr>

          ${personalMessage ? `
          <!-- Personal note from the sender -->
          <tr>
            <td class="px-24" style="padding:16px 24px 0 24px;">
              <div style="border-left:3px solid ${brandColor};background:#f8fafc;padding:12px 14px;">
                <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">${esc(personalMessage)}</p>
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- View quote button -->
          <tr>
            <td class="px-24" style="padding:24px 24px 8px 24px;text-align:center;">
              ${quoteViewUrl ? `
              <a href="${esc(quoteViewUrl)}" style="display:inline-block;background:${brandColor};color:#ffffff;padding:15px 52px;border-radius:4px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.02em;font-family:Arial,Helvetica,sans-serif;">View your quote</a>
              <p style="margin:10px 0 0 0;color:#94a3b8;font-size:12px;font-family:Arial,Helvetica,sans-serif;">Opens your quote in the browser — no account needed.</p>
              ` : `
              <a href="tel:+17068260644" style="display:inline-block;background:${brandColor};color:#ffffff;padding:14px 36px;border-radius:4px;text-decoration:none;font-weight:700;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Call us: (706) 826-0644</a>
              `}
            </td>
          </tr>

          <!-- Questions -->
          <tr>
            <td class="px-24" style="padding:16px 24px 24px 24px;">
              <div style="border:1px solid #cbd5e1;border-radius:4px;padding:13px 16px;">
                <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
                  <strong style="color:#0f172a;">Questions?</strong> Call us at <a href="tel:+17068260644" style="color:${brandColor};font-weight:700;text-decoration:none;">(706)&nbsp;826-0644</a> or just reply to this email &mdash; it comes straight to us.
                </p>
              </div>
              ${signatureText ? `
              <p style="margin:16px 0 0 0;color:#475569;font-size:13px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">${esc(signatureText)}</p>
              ` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:18px 24px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-weight:700;color:#0f172a;font-size:13px;font-family:Arial,Helvetica,sans-serif;">${esc(brandName)}</p>
              <p style="margin:6px 0 0 0;font-size:12px;color:#64748b;font-family:Arial,Helvetica,sans-serif;">(706) 826-0644 &middot; 1530 Crescent Ct, Augusta, GA</p>
              <p style="margin:8px 0 0 0;font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;">Licensed &amp; insured &middot; Serving Augusta, GA and surrounding areas</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
