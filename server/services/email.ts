/*
  GHVAC Email Service – Gmail-compatible transactional templates
  ------------------------------------------------------------------
  Complete HTML email template with inline styles for maximum compatibility
*/

import { Resend } from "resend";

// -----------------------------
// Types
// -----------------------------
export interface EmailConfig {
  serviceProvider: "resend" | "generic";
  apiKey: string;
  fromEmail: string;
  managerEmail: string;
  brandName?: string;
  brandColor?: string;
  logoUrl?: string;
  bccManagerByDefault?: boolean;
  dryRun?: boolean;
}

export interface QuoteEmailData {
  customerName: string;
  technician: string;
  total: string | number;
  quoteText?: string;
  quoteId: string;
  jobNotes?: string;
  parts: Array<{
    id: string;
    partNumber: string;
    description: string;
    price: string | number;
    quantity?: number;
  }>;
  subtotal: string | number;
  labor: string | number;
  tax: string | number;
  status?: "draft" | "pending" | "approved" | "revised" | string;
  createdAt?: string | Date;
}

// -----------------------------
// Utilities
// -----------------------------
const brandDefaults = {
  name: "Giesbrecht HVAC",
  color: "#711419",
};

function asCurrency(v: string | number, locale = "en-US", currency = "USD") {
  const n =
    typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    n,
  );
}

function formatDate(d?: string | Date) {
  const date = d ? new Date(d) : new Date();
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusPillColor(status?: string, brandColor = brandDefaults.color) {
  const s = (status || "draft").toLowerCase();
  const map: Record<string, { bg: string; fg: string }> = {
    draft: { bg: "#F3F4F6", fg: "#374151" },
    pending: { bg: "#FEF3C7", fg: "#92400E" },
    approved: { bg: "#ECFDF5", fg: "#065F46" },
    revised: { bg: "#E0E7FF", fg: "#3730A3" },
  };
  return map[s] || { bg: brandColor + "22", fg: brandColor };
}

// -----------------------------
// Template Builder
// -----------------------------
export class QuoteEmailTemplate {
  constructor(private cfg: EmailConfig) {}

  subject(data: QuoteEmailData) {
    return `New HVAC Quote – ${data.customerName} – ${asCurrency(data.total)}`;
  }

  preheader(data: QuoteEmailData) {
    const partsCount = data.parts?.length || 0;
    return `${data.technician} created quote ${data.quoteId} • ${partsCount} item${partsCount === 1 ? "" : "s"} • Total ${asCurrency(data.total)}`;
  }

  textBody(data: QuoteEmailData) {
    const lines: string[] = [];
    const brand = this.cfg.brandName || brandDefaults.name;
    lines.push(`${brand} – Quote ${data.quoteId}`);
    lines.push(`Customer: ${data.customerName}`);
    lines.push(`Technician: ${data.technician}`);
    lines.push(`Status: ${data.status || "draft"}`);
    lines.push(`Created: ${formatDate(data.createdAt)}`);
    lines.push("");
    lines.push("Items:");
    if (data.parts?.length) {
      data.parts.forEach((p) => {
        lines.push(
          `- ${p.description} (Part #${p.partNumber}) x${p.quantity ?? 1} – ${asCurrency(p.price)}`,
        );
      });
    } else {
      lines.push("- No parts listed");
    }
    lines.push("");
    lines.push(`Subtotal: ${asCurrency(data.subtotal)}`);
    lines.push(`Labor:    ${asCurrency(data.labor)}`);
    lines.push(`Tax:      ${asCurrency(data.tax)}`);
    lines.push(`Total:    ${asCurrency(data.total)}`);
    if (data.jobNotes) {
      lines.push("");
      lines.push("Job Notes:");
      lines.push(data.jobNotes);
    }
    if (data.quoteText) {
      lines.push("");
      lines.push("Summary:");
      lines.push(data.quoteText);
    }
    lines.push("");
    lines.push("This is a transactional message.");
    return lines.join("\n");
  }

  htmlBody(data: QuoteEmailData) {
    const brandName = this.cfg.brandName || brandDefaults.name;
    const brandColor = this.cfg.brandColor || brandDefaults.color;
    const pill = statusPillColor(data.status, brandColor);
    const preheader = esc(this.preheader(data));

    const partsRows = (data.parts || [])
      .map(
        (p) => `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;">
          <div style="font-weight:600;color:#1f2937;margin-bottom:4px;">${esc(p.description)}</div>
          <div style="font-size:13px;color:#6b7280;">Part #: ${esc(p.partNumber)}</div>
        </td>
        <td style="padding:12px;text-align:center;border-bottom:1px solid #e5e7eb;color:#6b7280;font-family:Arial,sans-serif;">${p.quantity ?? 1}</td>
        <td style="padding:12px;text-align:right;border-bottom:1px solid #e5e7eb;color:#1f2937;font-weight:600;font-family:Arial,sans-serif;">${esc(asCurrency(p.price))}</td>
      </tr>
    `,
      )
      .join("");

    const maybeLogo = this.cfg.logoUrl
      ? `<img src="${esc(this.cfg.logoUrl)}" alt="${esc(brandName)}" width="144" height="36" style="height:auto;border:0;outline:none;text-decoration:none;display:block;"/>`
      : `<div style="font-size:20px;font-weight:600;color:white;">${esc(brandName)}</div>`;

    const maybeJobNotes = data.jobNotes ? `
      <tr>
        <td style="padding:0 24px 24px 24px;">
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:0 4px 4px 0;">
            <strong style="color:#92400e;font-family:Arial,sans-serif;">Job Notes:</strong><br>
            <span style="color:#78350f;font-family:Arial,sans-serif;line-height:1.5;">${esc(data.jobNotes)}</span>
          </div>
        </td>
      </tr>
    ` : '';

    const noPartsRow = partsRows || `<tr><td colspan="3" style="padding:20px;text-align:center;color:#6b7280;font-style:italic;font-family:Arial,sans-serif;">No parts listed</td></tr>`;

    return `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(this.subject(data))}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
  <div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:20px 0;">
        
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:600px;">
          
          <!-- Header -->
          <tr>
            <td style="background:${brandColor};padding:30px;text-align:center;color:white;">
              ${maybeLogo}
              <h1 style="margin:8px 0 0 0;color:white;font-size:24px;font-weight:600;font-family:Arial,sans-serif;">New HVAC Quote</h1>
              <p style="margin:8px 0 0 0;color:rgba(255,255,255,0.9);font-size:16px;font-family:Arial,sans-serif;">Generated by ${esc(data.technician)}</p>
            </td>
          </tr>
          
          <!-- Customer & Total Header -->
          <tr>
            <td style="padding:24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="margin:0 0 4px 0;font-size:14px;color:#6b7280;font-family:Arial,sans-serif;">Customer:</div>
                    <h2 style="margin:0 0 8px 0;font-size:22px;color:#1f2937;font-weight:600;font-family:Arial,sans-serif;">${esc(data.customerName)}</h2>
                    <span style="background:${pill.bg};color:${pill.fg};padding:6px 12px;border-radius:4px;font-size:12px;text-transform:capitalize;font-family:Arial,sans-serif;">${esc(data.status || 'draft')}</span>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="font-size:32px;font-weight:700;color:${brandColor};font-family:Arial,sans-serif;">${esc(asCurrency(data.total))}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Meta Information -->
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <div style="border-bottom:2px solid #f3f4f6;padding-bottom:16px;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="color:#6b7280;font-size:14px;padding-right:15px;font-family:Arial,sans-serif;">Tech: ${esc(data.technician)}</td>
                    <td style="color:#6b7280;font-size:14px;padding-right:15px;font-family:Arial,sans-serif;">${formatDate(data.createdAt)}</td>
                    <td style="color:#6b7280;font-size:14px;font-family:Arial,sans-serif;">${data.parts?.length || 0} part${(data.parts?.length || 0) !== 1 ? 's' : ''}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          
          ${maybeJobNotes}
          
          <!-- Parts & Services -->
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <h3 style="margin:0 0 16px 0;font-size:18px;color:#1f2937;font-weight:600;font-family:Arial,sans-serif;">Parts & Services</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;overflow:hidden;">
                <tr style="background:#f3f4f6;">
                  <th style="padding:12px;text-align:left;font-weight:600;color:#374151;font-family:Arial,sans-serif;">Description</th>
                  <th style="padding:12px;text-align:center;font-weight:600;color:#374151;font-family:Arial,sans-serif;">Qty</th>
                  <th style="padding:12px;text-align:right;font-weight:600;color:#374151;font-family:Arial,sans-serif;">Price</th>
                </tr>
                ${noPartsRow}
              </table>
            </td>
          </tr>
          
          <!-- Quote Summary -->
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <h3 style="margin:0 0 16px 0;font-size:18px;color:#1f2937;font-weight:600;font-family:Arial,sans-serif;">Quote Summary</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;padding:16px;">
                <tr>
                  <td style="padding:8px 0;color:#374151;font-family:Arial,sans-serif;">Parts Subtotal:</td>
                  <td style="padding:8px 0;text-align:right;color:#374151;font-family:Arial,sans-serif;">${esc(asCurrency(data.subtotal))}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                  <td style="padding:8px 0;color:#374151;font-family:Arial,sans-serif;">Labor:</td>
                  <td style="padding:8px 0;text-align:right;color:#374151;font-family:Arial,sans-serif;">${esc(asCurrency(data.labor))}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                  <td style="padding:8px 0;color:#374151;font-family:Arial,sans-serif;">Tax:</td>
                  <td style="padding:8px 0;text-align:right;color:#374151;font-family:Arial,sans-serif;">${esc(asCurrency(data.tax))}</td>
                </tr>
                <tr style="border-top:2px solid #e5e7eb;">
                  <td style="padding:12px 0 8px 0;font-weight:600;font-size:16px;color:${brandColor};font-family:Arial,sans-serif;">Total:</td>
                  <td style="padding:12px 0 8px 0;text-align:right;font-weight:600;font-size:16px;color:${brandColor};font-family:Arial,sans-serif;">${esc(asCurrency(data.total))}</td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:20px;text-align:center;color:#6b7280;">
              <p style="margin:0;font-weight:600;color:#374151;font-family:Arial,sans-serif;">${esc(brandName)}</p>
              <p style="margin:4px 0 0 0;font-size:14px;font-family:Arial,sans-serif;">Professional Service Solutions</p>
              <p style="margin:8px 0 0 0;font-size:12px;font-family:Arial,sans-serif;">Quote ID: ${esc(data.quoteId)}</p>
            </td>
          </tr>
          
        </table>
        
      </td>
    </tr>
  </table>
  
</body>
</html>`;
  }
}

// -----------------------------
// Email Service
// -----------------------------
export class EmailService {
  private cfg: EmailConfig;
  private resend: Resend;
  private builder: QuoteEmailTemplate;

  constructor() {
    this.cfg = {
      serviceProvider:
        (process.env.EMAIL_SERVICE as EmailConfig["serviceProvider"]) ||
        "resend",
      apiKey: process.env.RESEND_API_KEY || "",
      fromEmail: process.env.FROM_EMAIL || "quotes@ghvac.work",
      managerEmail: process.env.MANAGER_EMAIL || "manager@ghvac.com",
      brandName: process.env.BRAND_NAME || "Giesbrecht HVAC",
      brandColor: process.env.BRAND_COLOR || "#711419",
      logoUrl: "https://images.squarespace-cdn.com/content/v1/65b2790c0b83175df7337294/93a31506-d2ae-4e07-958b-c86d0c49f7cd/GHVAC-icons.png?format=200w",
      bccManagerByDefault:
        (process.env.BCC_MANAGER_BY_DEFAULT || "true") === "true",
      dryRun: (process.env.DRY_RUN_EMAIL || "false") === "true",
    };

    this.resend = new Resend(this.cfg.apiKey);
    this.builder = new QuoteEmailTemplate(this.cfg);
  }

  async sendQuoteNotification(
    quoteData: QuoteEmailData,
    recipients?: string[],
  ): Promise<boolean> {
    try {
      const subject = this.builder.subject(quoteData);
      const html = this.builder.htmlBody(quoteData);
      const text = this.builder.textBody(quoteData);
      const to = recipients?.length ? recipients : [this.cfg.managerEmail];

      if (this.cfg.dryRun) {
        console.log("[DRY RUN] Would send email", {
          subject,
          to,
          bcc: this.cfg.bccManagerByDefault ? this.cfg.managerEmail : undefined,
        });
        return true;
      }

      if (this.cfg.serviceProvider === "resend") {
        return await this.sendWithResend({ subject, html, text, to });
      } else {
        return await this.sendWithGeneric({ subject, html, text, to });
      }
    } catch (err) {
      console.error("Error sending quote notification:", err);
      return false;
    }
  }

  private async sendWithResend({
    subject,
    html,
    text,
    to,
  }: {
    subject: string;
    html: string;
    text: string;
    to: string[];
  }): Promise<boolean> {
    try {
      const payload: Parameters<typeof this.resend.emails.send>[0] = {
        from: this.cfg.fromEmail,
        to,
        subject,
        html,
        text,
        bcc: this.cfg.bccManagerByDefault ? [this.cfg.managerEmail] : undefined,
        headers: {
          "X-Entity-Ref-ID": `quote-${Date.now()}`,
        },
      };

      const { data, error } = await this.resend.emails.send(payload);

      if (error) {
        console.error("Resend error:", error);

        if (
          (error as any).name === "validation_error" &&
          /@ghvac\.work$/i.test(this.cfg.fromEmail)
        ) {
          console.log("Retrying with fallback domain delivered@resend.dev ...");
          const { data: data2, error: error2 } = await this.resend.emails.send({
            ...payload,
            from: "delivered@resend.dev",
            subject: subject + " [Fallback]",
          });
          if (error2) {
            console.error("Fallback send also failed:", error2);
            return false;
          }
          console.log("Email sent via fallback:", data2?.id);
          return true;
        }
        return false;
      }

      console.log("Email sent successfully:", data?.id);
      return true;
    } catch (err) {
      console.error("Resend transport error:", err);
      return false;
    }
  }

  private async sendWithGeneric({
    subject,
    html,
    text,
    to,
  }: {
    subject: string;
    html: string;
    text: string;
    to: string[];
  }): Promise<boolean> {
    console.log("[GENERIC EMAIL] Would send:", {
      subject,
      to,
      textPreview: text.slice(0, 140) + "…",
    });
    return true;
  }
}

export const emailService = new EmailService();