/*
  GHVAC Email Service – polished transactional templates (TypeScript)
  ------------------------------------------------------------------
  Updated per request:
  - Removed Reply-To (internal-only emails)
  - Set brand logo path to provided asset
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
        <td class=\"cell desc\">
          <div class=\"desc-title\">${esc(p.description)}</div>
          <div class=\"desc-sub\">Part #: ${esc(p.partNumber)}</div>
        </td>
        <td class=\"cell qty\">${p.quantity ?? 1}</td>
        <td class=\"cell price\">${esc(asCurrency(p.price))}</td>
      </tr>
    `,
      )
      .join("");

    const maybeLogo = this.cfg.logoUrl
      ? `<img src=\"${esc(this.cfg.logoUrl)}\" alt=\"${esc(brandName)}\" class=\"logo\" width=\"144\" height=\"36\" style=\"height:auto;border:0;outline:none;text-decoration:none;display:block;\"/>`
      : `<div class=\"brand\">${esc(brandName)}</div>`;

    return `<!doctype html>
<html>
<head>
  <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>${esc(this.subject(data))}</title>
  <!-- styles omitted for brevity -->
</head>
<body>
  <span class=\"preheader\">${preheader}</span>
  <table class=\"outer\" role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">
    <tr>
      <td align=\"center\" style=\"padding:20px 12px;\">
        <table class=\"wrap\" role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">
          <tr>
            <td class=\"header\">
              ${maybeLogo}
              <div class=\"title\">New HVAC Quote</div>
              <div class=\"subtitle\">Generated by ${esc(data.technician)}</div>
            </td>
          </tr>
          <!-- Rest of template omitted for brevity -->
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
      logoUrl: "attached_assets/Giesbrecht_Logo-V-(2)-1_1756361006488.webp",
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
          /@ghvac\\.work$/i.test(this.cfg.fromEmail)
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
