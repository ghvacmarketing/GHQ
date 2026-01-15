import { Resend } from "resend";
import type { CrmInvoice, CrmInvoiceLineItem } from "@shared/schema";
import { crmInvoices } from "@shared/schema";
import { getUncachableStripeClient } from "../stripeClient";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

const brandDefaults = {
  name: "Giesbrecht HVAC",
  color: "#711419",
  logoUrl: "https://images.squarespace-cdn.com/content/v1/65b2790c0b83175df7337294/93a31506-d2ae-4e07-958b-c86d0c49f7cd/GHVAC-icons.png?format=200w",
};

const EMAIL_TEMPLATE_DEFAULTS = {
  subject: "Your Invoice from {brand_name} - {invoice_number}",
  intro: "Please find your invoice details below. Thank you for your business.",
  signature: "Thank you for choosing {brand_name}. We appreciate your business!",
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

export interface CrmInvoiceEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
  htmlContent?: string;
  textContent?: string;
  fromEmail?: string;
  replyToEmail?: string;
  subject?: string;
  paymentLinkUrl?: string;
}

// Ensure invoice has a viewToken for short URLs
async function ensureViewToken(invoice: CrmInvoice): Promise<string> {
  if (invoice.viewToken) {
    return invoice.viewToken;
  }
  const { nanoid } = await import("nanoid");
  const viewToken = nanoid(8);
  await db.update(crmInvoices)
    .set({ viewToken, updatedAt: new Date() })
    .where(eq(crmInvoices.id, invoice.id));
  return viewToken;
}

// Generate a Stripe payment link for an invoice and store its ID for later deactivation
async function generatePaymentLink(invoice: CrmInvoice): Promise<string | null> {
  try {
    const balanceDue = parseFloat(invoice.balanceDue?.toString() || invoice.total?.toString() || "0");
    if (balanceDue <= 0) {
      return null; // No balance due, no payment link needed
    }

    // Ensure we have a viewToken for short URLs
    const viewToken = await ensureViewToken(invoice);

    const stripe = await getUncachableStripeClient();
    
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice #${invoice.invoiceNumber}`,
              description: `Payment for HVAC Service Invoice`,
            },
            unit_amount: Math.round(balanceDue * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        type: 'invoice_payment',
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}/i/${viewToken}?payment=success`,
        },
      },
    });

    // Store the payment link ID on the invoice so it can be deactivated when marked as paid
    await db.update(crmInvoices)
      .set({ stripePaymentLinkId: paymentLink.id })
      .where(eq(crmInvoices.id, invoice.id));
    console.log(`[CRM Invoice Email] Stored payment link ID ${paymentLink.id} on invoice ${invoice.invoiceNumber}`);

    return paymentLink.url;
  } catch (error) {
    console.error("Error generating payment link for invoice:", error);
    return null;
  }
}

export interface CrmInvoiceEmailOptions {
  senderEmail?: string;
  senderName?: string;
  replyToEmail?: string;
}

export async function sendCrmInvoiceEmail(
  invoice: CrmInvoice,
  lineItems: CrmInvoiceLineItem[],
  recipientEmail: string,
  customerName: string,
  personalMessage?: string,
  sentBy?: string,
  options?: CrmInvoiceEmailOptions
): Promise<CrmInvoiceEmailResult> {
  const emailSetting = await storage.getSetting("automated_email_enabled");
  if (emailSetting && emailSetting.value === "false") {
    console.log("[CRM Invoice Email] Automated emails are disabled");
    return { success: false, error: "Automated emails are disabled" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const brandName = brandDefaults.name;

  console.log("[CRM Invoice Email] API Key prefix:", apiKey ? apiKey.substring(0, 15) + "..." : "NOT SET");

  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured");
    return { success: false, error: "Email service not configured" };
  }

  const resend = new Resend(apiKey);

  const standardFromEmail = "invoices@ghvacinc.com";
  const replyToEmail = options?.replyToEmail;
  
  console.log("[CRM Invoice Email] Sending invoice email FROM:", standardFromEmail, "REPLY-TO:", replyToEmail, "TO:", recipientEmail);

  // Generate payment link for invoices with balance due
  let paymentLinkUrl: string | null = null;
  try {
    paymentLinkUrl = await generatePaymentLink(invoice);
    if (paymentLinkUrl) {
      console.log("[CRM Invoice Email] Payment link generated:", paymentLinkUrl);
    }
  } catch (paymentLinkError) {
    console.error("[CRM Invoice Email] Failed to generate payment link, continuing without it:", paymentLinkError);
  }
  
  // Fetch email templates
  const subjectTemplate = await getEmailTemplate("email_template_invoice_subject", EMAIL_TEMPLATE_DEFAULTS.subject);
  const introTemplate = await getEmailTemplate("email_template_invoice_intro", EMAIL_TEMPLATE_DEFAULTS.intro);
  const signatureTemplate = await getEmailTemplate("email_template_invoice_signature", EMAIL_TEMPLATE_DEFAULTS.signature);
  
  // Calculate balance due for placeholder replacement
  const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");
  const dueDateFormatted = invoice.dueDate ? formatDate(invoice.dueDate) : "";
  
  // Prepare placeholder data
  const placeholderData: Record<string, string> = {
    brand_name: brandName,
    invoice_number: invoice.invoiceNumber || "",
    customer_name: customerName,
    balance_due: asCurrency(balanceDue),
    due_date: dueDateFormatted,
  };
  
  // Replace placeholders in templates
  const subject = replacePlaceholders(subjectTemplate, placeholderData);
  const introText = replacePlaceholders(introTemplate, placeholderData);
  const signatureText = replacePlaceholders(signatureTemplate, placeholderData);
  
  const html = buildHtmlBody(invoice, lineItems, customerName, personalMessage, sentBy, paymentLinkUrl, introText, signatureText);
  const text = buildTextBody(invoice, lineItems, customerName, personalMessage, sentBy, paymentLinkUrl, introText, signatureText);

  try {
    const { data, error } = await resend.emails.send({
      from: standardFromEmail,
      to: [recipientEmail],
      replyTo: replyToEmail || undefined,
      subject,
      html,
      text,
      headers: { "X-Entity-Ref-ID": `crm-invoice-${invoice.id}` },
    });

    if (error) {
      console.error("Resend error sending invoice email:", error);
      return { success: false, error: (error as any).message || "Failed to send email" };
    }

    console.log("CRM Invoice email sent successfully:", data?.id);
    return { 
      success: true, 
      messageId: data?.id,
      htmlContent: html,
      textContent: text,
      fromEmail: standardFromEmail,
      replyToEmail,
      subject,
      paymentLinkUrl: paymentLinkUrl || undefined,
    };
  } catch (err) {
    console.error("Error sending CRM invoice email:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

function buildTextBody(
  invoice: CrmInvoice,
  lineItems: CrmInvoiceLineItem[],
  customerName: string,
  personalMessage?: string,
  sentBy?: string,
  paymentLinkUrl?: string | null,
  introText?: string,
  signatureText?: string
): string {
  const lines: string[] = [];
  lines.push(`${brandDefaults.name} - Invoice ${invoice.invoiceNumber}`);
  lines.push("");

  lines.push(introText || "Please find your invoice details below. Thank you for your business.");
  lines.push("");

  if (personalMessage) {
    lines.push("Message from our team:");
    lines.push(personalMessage);
    lines.push("");
  }

  lines.push(`Customer: ${customerName}`);
  lines.push(`Invoice Date: ${formatDate(invoice.createdAt)}`);
  if (invoice.dueDate) {
    lines.push(`Due Date: ${formatDate(invoice.dueDate)}`);
  }
  lines.push("");

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

  lines.push(`Subtotal: ${asCurrency(invoice.subtotal)}`);
  if (invoice.laborTotal && parseFloat(invoice.laborTotal) > 0) {
    lines.push(`Labor: ${asCurrency(invoice.laborTotal)}`);
  }
  lines.push(`TOTAL: ${asCurrency(invoice.total)}`);
  lines.push("");

  const amountPaid = parseFloat(invoice.amountPaid || "0");
  if (amountPaid > 0) {
    lines.push(`Amount Paid: ${asCurrency(amountPaid)}`);
  }
  
  const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");
  if (balanceDue > 0) {
    lines.push(`BALANCE DUE: ${asCurrency(balanceDue)}`);
  } else {
    lines.push("PAID IN FULL");
  }
  lines.push("");

  if (paymentLinkUrl) {
    lines.push(`PAY ONLINE: ${paymentLinkUrl}`);
    lines.push("");
  }

  lines.push("To pay or ask questions about this invoice, please contact us at (706) 826-0644.");
  lines.push("");
  lines.push(signatureText || "Thank you for choosing Giesbrecht HVAC!");
  lines.push("");
  lines.push("Giesbrecht HVAC");
  lines.push("(706) 826-0644");
  lines.push("1530 Crescent Ct, Augusta, GA");
  if (sentBy) {
    lines.push("");
    lines.push(`Sent by: ${sentBy}`);
  }

  return lines.join("\n");
}

function buildHtmlBody(
  invoice: CrmInvoice,
  lineItems: CrmInvoiceLineItem[],
  customerName: string,
  personalMessage?: string,
  sentBy?: string,
  paymentLinkUrl?: string | null,
  introText?: string,
  signatureText?: string
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

  const dueDateHtml = invoice.dueDate
    ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">Due: ${formatDate(invoice.dueDate)}</div>`
    : "";

  const amountPaid = parseFloat(invoice.amountPaid || "0");
  const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");

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
  <title>Invoice ${esc(invoice.invoiceNumber)} from ${esc(brandName)}</title>
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
              <h1 style="margin:16px 0 0 0;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.3px;">Your Invoice</h1>
            </td>
          </tr>

          <!-- Invoice Info -->
          <tr>
            <td class="px-24" style="padding:24px 20px 16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-size:13px;color:#6b7280;">Invoice Number</div>
                    <div style="font-size:18px;font-weight:800;color:#111827;margin-top:2px;">${esc(invoice.invoiceNumber)}</div>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="font-size:13px;color:#6b7280;">Date</div>
                    <div style="font-size:15px;color:#111827;margin-top:2px;">${formatDate(invoice.createdAt)}</div>
                    ${dueDateHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Customer Info -->
          <tr>
            <td class="px-24" style="padding:0 20px 20px 20px;">
              <div style="background:#f9fafb;padding:16px;border-radius:10px;">
                <div style="font-weight:700;color:#374151;font-family:Arial,sans-serif;margin-bottom:8px;">Bill To</div>
                <div style="font-size:16px;font-weight:600;color:#111827;">${esc(customerName)}</div>
              </div>
            </td>
          </tr>

          ${personalMessageHtml}

          <!-- Line Items -->
          <tr>
            <td class="px-24" style="padding:0 20px 20px 20px;">
              <h3 style="margin:0 0 12px 0;font-size:16px;font-weight:800;color:#111827;">Invoice Details</h3>
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
                  <td style="padding:8px 14px;text-align:right;color:#374151;font-family:Arial,sans-serif;">${esc(asCurrency(invoice.subtotal))}</td>
                </tr>
                ${invoice.laborTotal && parseFloat(invoice.laborTotal) > 0 ? `
                <tr>
                  <td style="padding:8px 14px;color:#374151;font-family:Arial,sans-serif;">Labor</td>
                  <td style="padding:8px 14px;text-align:right;color:#374151;font-family:Arial,sans-serif;">${esc(asCurrency(invoice.laborTotal))}</td>
                </tr>` : ""}
                <tr style="border-top:2px solid #e5e7eb;">
                  <td style="padding:14px;font-weight:900;font-size:16px;color:${brandColor};font-family:Arial,sans-serif;">Total</td>
                  <td style="padding:14px;text-align:right;font-weight:900;font-size:20px;color:${brandColor};font-family:Arial,sans-serif;">${esc(asCurrency(invoice.total))}</td>
                </tr>
                ${amountPaid > 0 ? `
                <tr>
                  <td style="padding:8px 14px;color:#22c55e;font-family:Arial,sans-serif;">Amount Paid</td>
                  <td style="padding:8px 14px;text-align:right;color:#22c55e;font-family:Arial,sans-serif;">-${esc(asCurrency(amountPaid))}</td>
                </tr>` : ""}
                <tr style="border-top:2px solid #e5e7eb;">
                  <td style="padding:14px;font-weight:900;font-size:16px;color:${balanceDue > 0 ? '#dc2626' : '#22c55e'};font-family:Arial,sans-serif;">
                    ${balanceDue > 0 ? 'Balance Due' : 'Status'}
                  </td>
                  <td style="padding:14px;text-align:right;font-weight:900;font-size:20px;color:${balanceDue > 0 ? '#dc2626' : '#22c55e'};font-family:Arial,sans-serif;">
                    ${balanceDue > 0 ? esc(asCurrency(balanceDue)) : 'PAID IN FULL'}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pay Now Button (if balance due and payment link available) -->
          ${paymentLinkUrl && balanceDue > 0 ? `
          <tr>
            <td class="px-24" style="padding:0 20px 16px 20px;text-align:center;">
              <a href="${esc(paymentLinkUrl)}" style="display:inline-block;background:#22c55e;color:#ffffff;padding:18px 48px;border-radius:10px;text-decoration:none;font-weight:800;font-size:18px;box-shadow:0 4px 14px rgba(34,197,94,0.3);">Pay Now - ${esc(asCurrency(balanceDue))}</a>
              <p style="margin:12px 0 0 0;font-size:13px;color:#6b7280;">Secure payment powered by Stripe</p>
            </td>
          </tr>
          ` : ""}

          <!-- CTA -->
          <tr>
            <td class="px-24" style="padding:0 20px 24px 20px;text-align:center;">
              <p style="margin:0 0 16px 0;font-size:14px;color:#4b5563;">Questions about this invoice? Contact us anytime.</p>
              <a href="tel:+17068260644" style="display:inline-block;background:${brandColor};color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Call Us: (706) 826-0644</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:20px;text-align:center;">
              <p style="margin:0;font-weight:700;color:#111827;font-size:14px;">${esc(brandName)}</p>
              <p style="margin:6px 0 0 0;font-size:13px;color:#6b7280;">(706) 826-0644</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#6b7280;">1530 Crescent Ct, Augusta, GA</p>
              ${sentBy ? `<p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">Sent by: ${esc(sentBy)}</p>` : ""}
              <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">This is a transactional message regarding your invoice.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
