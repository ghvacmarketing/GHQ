import { Resend } from "resend";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

const brandDefaults = {
  name: "Giesbrecht HVAC",
  color: "#711419",
  logoUrl: "https://images.squarespace-cdn.com/content/v1/65b2790c0b83175df7337294/93a31506-d2ae-4e07-958b-c86d0c49f7cd/GHVAC-icons.png?format=200w",
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
  subject?: string;
}

export interface CrmQuoteEmailOptions {
  senderEmail?: string;
  senderName?: string;
  quoteViewUrl?: string;
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
  const logoUrl = brandDefaults.logoUrl;

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
  
  console.log("[CRM Email] Sending quote email FROM:", fromEmail, "TO:", recipientEmail);

  const subject = `Your Quote from ${brandName} - ${quote.quoteNumber}`;
  const html = buildHtmlBody(quote, lineItems, personalMessage, sentBy, options?.quoteViewUrl);
  const text = buildTextBody(quote, lineItems, personalMessage, sentBy, options?.quoteViewUrl);

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [recipientEmail],
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
      fromEmail,
      subject,
    };
  } catch (err) {
    console.error("Error sending CRM quote email:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

function buildTextBody(
  quote: CrmQuote,
  lineItems: CrmQuoteLineItem[],
  personalMessage?: string,
  sentBy?: string,
  quoteViewUrl?: string
): string {
  const lines: string[] = [];
  lines.push(`${brandDefaults.name} - Quote ${quote.quoteNumber}`);
  lines.push("");

  if (personalMessage) {
    lines.push("Message from our team:");
    lines.push(personalMessage);
    lines.push("");
  }

  lines.push(`Customer: ${quote.customerName}`);
  if (quote.serviceAddress) {
    lines.push(`Service Address: ${quote.serviceAddress}`);
  }
  lines.push(`Quote Date: ${formatDate(quote.createdAt)}`);
  if (quote.validUntil) {
    lines.push(`Valid Until: ${formatDate(quote.validUntil)}`);
  }
  lines.push("");

  if (quote.title) {
    lines.push(`Quote Title: ${quote.title}`);
  }
  if (quote.description) {
    lines.push(`Description: ${quote.description}`);
    lines.push("");
  }

  lines.push("Line Items:");
  if (lineItems.length > 0) {
    lineItems.forEach((item) => {
      const qty = parseFloat(item.quantity || "1");
      const price = asCurrency(item.lineTotal);
      lines.push(`- ${item.description} (Qty: ${qty}) - ${price}`);
    });
  } else {
    lines.push("- No items listed");
  }
  lines.push("");

  lines.push(`Subtotal: ${asCurrency(quote.subtotal)}`);
  if (quote.laborTotal && parseFloat(quote.laborTotal) > 0) {
    lines.push(`Labor: ${asCurrency(quote.laborTotal)}`);
  }
  lines.push(`TOTAL: ${asCurrency(quote.total)}`);
  lines.push("");

  if (quoteViewUrl) {
    lines.push("VIEW & SIGN YOUR QUOTE ONLINE:");
    lines.push(quoteViewUrl);
    lines.push("");
    lines.push("Click the link above to view the full quote details and electronically sign to accept.");
    lines.push("");
  }

  lines.push("To accept this quote or ask questions, please contact us at (830) 626-0408.");
  lines.push("");
  lines.push("Thank you for choosing Giesbrecht HVAC!");
  if (sentBy) {
    lines.push(`Sent by: ${sentBy}`);
  }

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
  const logoUrl = brandDefaults.logoUrl;

  const lineItemsHtml = lineItems.length > 0
    ? lineItems.map((item) => {
        const qty = parseFloat(item.quantity || "1");
        return `
          <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;">
              <div style="font-weight:600;color:#111827;">${esc(item.description)}</div>
              ${item.partNumber ? `<div style="font-size:12px;color:#6b7280;">Part #: ${esc(item.partNumber)}</div>` : ""}
            </td>
            <td style="padding:12px 10px;text-align:center;border-bottom:1px solid #e5e7eb;color:#6b7280;font-family:Arial,sans-serif;">${qty}</td>
            <td style="padding:12px 14px;text-align:right;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:600;font-family:Arial,sans-serif;">${esc(asCurrency(item.lineTotal))}</td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="3" style="padding:18px;text-align:center;color:#6b7280;font-style:italic;font-family:Arial,sans-serif;">No items listed</td></tr>`;

  const personalMessageHtml = personalMessage
    ? `
      <tr>
        <td style="padding:0 20px 20px 20px;">
          <div style="background:#f0f9ff;border:1px solid #bae6fd;padding:16px;border-radius:10px;">
            <div style="font-weight:700;color:#0369a1;font-family:Arial,sans-serif;margin-bottom:8px;">A message from our team:</div>
            <div style="color:#0c4a6e;font-family:Arial,sans-serif;line-height:1.6;">${esc(personalMessage)}</div>
          </div>
        </td>
      </tr>`
    : "";

  const validUntilHtml = quote.validUntil
    ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">Valid until: ${formatDate(quote.validUntil)}</div>`
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
  <title>Quote ${esc(quote.quoteNumber)} from ${esc(brandName)}</title>
  <style type="text/css">${headCss}</style>
</head>
<body style="margin:0;padding:0;font-family:Arial,Segoe UI,Roboto,Helvetica,sans-serif;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="container" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(16,24,40,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:${brandColor};padding:24px 20px;text-align:center;">
              <img src="${esc(logoUrl)}" alt="${esc(brandName)}" width="120" style="height:auto;border:0;display:inline-block;"/>
              <h1 style="margin:16px 0 0 0;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.3px;">Your HVAC Quote</h1>
            </td>
          </tr>

          <!-- Quote Info -->
          <tr>
            <td class="px-24" style="padding:24px 20px 16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-size:13px;color:#6b7280;">Quote Number</div>
                    <div style="font-size:18px;font-weight:800;color:#111827;margin-top:2px;">${esc(quote.quoteNumber)}</div>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="font-size:13px;color:#6b7280;">Date</div>
                    <div style="font-size:15px;color:#111827;margin-top:2px;">${formatDate(quote.createdAt)}</div>
                    ${validUntilHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Customer Info -->
          <tr>
            <td class="px-24" style="padding:0 20px 20px 20px;">
              <div style="background:#f9fafb;padding:16px;border-radius:10px;">
                <div style="font-weight:700;color:#374151;font-family:Arial,sans-serif;margin-bottom:8px;">Prepared For</div>
                <div style="font-size:16px;font-weight:600;color:#111827;">${esc(quote.customerName)}</div>
                ${quote.serviceAddress ? `<div style="font-size:14px;color:#6b7280;margin-top:4px;">${esc(quote.serviceAddress)}</div>` : ""}
              </div>
            </td>
          </tr>

          ${personalMessageHtml}

          <!-- Title/Description -->
          ${quote.title || quote.description ? `
          <tr>
            <td class="px-24" style="padding:0 20px 20px 20px;">
              ${quote.title ? `<h2 style="margin:0 0 8px 0;font-size:18px;font-weight:800;color:#111827;">${esc(quote.title)}</h2>` : ""}
              ${quote.description ? `<p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">${esc(quote.description)}</p>` : ""}
            </td>
          </tr>` : ""}

          <!-- Line Items -->
          <tr>
            <td class="px-24" style="padding:0 20px 20px 20px;">
              <h3 style="margin:0 0 12px 0;font-size:16px;font-weight:800;color:#111827;">Quote Details</h3>
              <table role="table" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr style="background:#e5e7eb;">
                    <th style="padding:12px 14px;text-align:left;font-weight:700;color:#374151;font-size:13px;">Description</th>
                    <th style="padding:12px 10px;text-align:center;font-weight:700;color:#374151;font-size:13px;">Qty</th>
                    <th style="padding:12px 14px;text-align:right;font-weight:700;color:#374151;font-size:13px;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemsHtml}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td class="px-24" style="padding:0 20px 24px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:16px;">
                <tr>
                  <td style="padding:8px 14px;color:#374151;font-family:Arial,sans-serif;">Subtotal</td>
                  <td style="padding:8px 14px;text-align:right;color:#374151;font-family:Arial,sans-serif;">${esc(asCurrency(quote.subtotal))}</td>
                </tr>
                ${quote.laborTotal && parseFloat(quote.laborTotal) > 0 ? `
                <tr>
                  <td style="padding:8px 14px;color:#374151;font-family:Arial,sans-serif;">Labor</td>
                  <td style="padding:8px 14px;text-align:right;color:#374151;font-family:Arial,sans-serif;">${esc(asCurrency(quote.laborTotal))}</td>
                </tr>` : ""}
                <tr style="border-top:2px solid #e5e7eb;">
                  <td style="padding:14px;font-weight:900;font-size:16px;color:${brandColor};font-family:Arial,sans-serif;">Total</td>
                  <td style="padding:14px;text-align:right;font-weight:900;font-size:20px;color:${brandColor};font-family:Arial,sans-serif;">${esc(asCurrency(quote.total))}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td class="px-24" style="padding:0 20px 24px 20px;text-align:center;">
              ${quoteViewUrl ? `
              <p style="margin:0 0 16px 0;font-size:14px;color:#4b5563;">Ready to move forward? Click below to view the full quote and sign electronically to accept.</p>
              <a href="${esc(quoteViewUrl)}" style="display:inline-block;background:${brandColor};color:#ffffff;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;margin-bottom:12px;">View & Sign Quote</a>
              <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">Or call us: <a href="tel:+18306260408" style="color:${brandColor};font-weight:600;text-decoration:none;">(830) 626-0408</a></p>
              ` : `
              <p style="margin:0 0 16px 0;font-size:14px;color:#4b5563;">Ready to move forward? Contact us to accept this quote or if you have any questions.</p>
              <a href="tel:+18306260408" style="display:inline-block;background:${brandColor};color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Call Us: (830) 626-0408</a>
              `}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:20px;text-align:center;">
              <p style="margin:0;font-weight:700;color:#111827;font-size:14px;">${esc(brandName)}</p>
              <p style="margin:6px 0 0 0;font-size:12px;color:#6b7280;">Professional HVAC Service Solutions</p>
              ${sentBy ? `<p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">Sent by: ${esc(sentBy)}</p>` : ""}
              <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">This is a transactional message regarding your requested quote.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
