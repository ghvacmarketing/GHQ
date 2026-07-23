import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "./db";
import { requireCrmAuth, getCurrentCrmUser } from "./crm-auth";

/**
 * Marketing engine v1 — templates (block-based email builder), audiences
 * (saved CRM customer filters), and campaigns (template × audience → Resend).
 */

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.MARKETING_FROM_EMAIL || process.env.FROM_EMAIL || "quotes@ghvac.work";

// ── Template rendering: block design → email-safe HTML ──────────────────────
type Block = {
  id: string;
  type: "heading" | "paragraph" | "button" | "image" | "divider" | "spacer" | "list";
  props: Record<string, any>;
};
type Design = {
  blocks: Block[];
  styles: { font?: string; textColor?: string; accent?: string; contentBg?: string; pageBg?: string; width?: number };
};

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderTemplateHtml(design: Design): string {
  const st = design.styles || {};
  const font = st.font || "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  const textColor = st.textColor || "#1f2937";
  const accent = st.accent || "#711419";
  const contentBg = st.contentBg || "#ffffff";
  const pageBg = st.pageBg || "#f1f3f4";
  const width = Math.min(Math.max(st.width || 600, 320), 800);

  const blockHtml = (b: Block): string => {
    const p = b.props || {};
    switch (b.type) {
      case "heading": {
        const size = p.level === 2 ? 22 : p.level === 3 ? 18 : 28;
        const bg = p.banner ? ` background:${esc(p.bannerColor || accent)}; padding:24px; text-align:center;` : "";
        const color = p.banner ? "#ffffff" : textColor;
        return `<tr><td style="padding:${p.banner ? "0" : "8px 32px"};"><div style="${bg}"><h1 style="margin:0;font-size:${size}px;line-height:1.25;color:${color};font-family:${font};">${esc(p.text || "")}</h1></div></td></tr>`;
      }
      case "paragraph":
        return `<tr><td style="padding:8px 32px;"><p style="margin:0;font-size:15px;line-height:1.6;color:${textColor};font-family:${font};">${esc(p.text || "").replace(/\n/g, "<br/>")}</p></td></tr>`;
      case "button": {
        const align = p.align || "center";
        return `<tr><td style="padding:16px 32px;text-align:${align};"><a href="${esc(p.href || "https://www.ghvac.app")}" style="display:inline-block;background:${esc(p.color || accent)};color:#ffffff;font-family:${font};font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;">${esc(p.text || "Click here")}</a></td></tr>`;
      }
      case "image":
        return `<tr><td style="padding:8px 32px;"><img src="${esc(p.src || "")}" alt="${esc(p.alt || "")}" style="display:block;width:100%;max-width:100%;border-radius:4px;"/></td></tr>`;
      case "divider":
        return `<tr><td style="padding:16px 32px;"><div style="border-top:1px solid #e5e7eb;"></div></td></tr>`;
      case "spacer":
        return `<tr><td style="height:${Number(p.height) || 24}px;"></td></tr>`;
      case "list": {
        const items = String(p.items || "").split("\n").filter(Boolean)
          .map((it) => `<li style="margin:4px 0;">${esc(it)}</li>`).join("");
        return `<tr><td style="padding:8px 32px;"><ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;color:${textColor};font-family:${font};">${items}</ul></td></tr>`;
      }
      default:
        return "";
    }
  };

  return `<!doctype html><html><body style="margin:0;padding:0;background:${pageBg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${pageBg};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" style="width:${width}px;max-width:100%;background:${contentBg};border-radius:8px;overflow:hidden;">
<tr><td style="height:16px;"></td></tr>
${(design.blocks || []).map(blockHtml).join("\n")}
<tr><td style="height:24px;"></td></tr>
</table>
<p style="font-family:${font};font-size:12px;color:#9ca3af;margin-top:16px;">Giesbrecht HVAC · Reply STOP to opt out.</p>
</td></tr></table></body></html>`;
}

function mergeFields(text: string, customer: { name?: string | null; email?: string | null }): string {
  const first = (customer.name || "").trim().split(/\s+/)[0] || "there";
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, first)
    .replace(/\{\{\s*name\s*\}\}/g, customer.name || "there")
    .replace(/\{\{\s*company\s*\}\}/g, "Giesbrecht HVAC")
    .replace(/\{\{\s*email\s*\}\}/g, customer.email || "");
}

// ── Audience filters: whitelisted fields → SQL over crm_customers ───────────
type AudienceFilter = { field: string; op: string; value: string };

function audienceWhere(filters: AudienceFilter[]): any {
  const conds: any[] = [sql`c.email IS NOT NULL AND c.email <> ''`];
  for (const f of filters || []) {
    const v = String(f.value ?? "");
    switch (f.field) {
      case "customerType":
        conds.push(f.op === "neq" ? sql`COALESCE(c.customer_type,'Residential') <> ${v}` : sql`COALESCE(c.customer_type,'Residential') = ${v}`);
        break;
      case "customerStatus":
        conds.push(f.op === "neq" ? sql`COALESCE(c.customer_status,'customer') <> ${v}` : sql`COALESCE(c.customer_status,'customer') = ${v}`);
        break;
      case "leadSource":
        conds.push(sql`COALESCE(c.lead_source,'') ILIKE ${"%" + v + "%"}`);
        break;
      case "city":
        conds.push(sql`COALESCE(c.city,'') ILIKE ${"%" + v + "%"}`);
        break;
      case "hasAgreement":
        conds.push(v === "yes"
          ? sql`EXISTS (SELECT 1 FROM crm_agreements a WHERE a.customer_id = c.id AND a.status IN ('active','pending'))`
          : sql`NOT EXISTS (SELECT 1 FROM crm_agreements a WHERE a.customer_id = c.id AND a.status IN ('active','pending'))`);
        break;
      case "createdAfter":
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) conds.push(sql`c.created_at >= ${v}::date`);
        break;
      case "createdBefore":
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) conds.push(sql`c.created_at < ${v}::date + interval '1 day'`);
        break;
    }
  }
  let where = conds[0];
  for (let i = 1; i < conds.length; i++) where = sql`${where} AND ${conds[i]}`;
  return where;
}

export function registerMarketingRoutes(app: Express): void {
  // ── Templates ──
  app.get("/api/marketing/templates", requireCrmAuth, async (_req, res) => {
    try {
      const r: any = await db.execute(sql`
        SELECT t.*, u.name AS "createdByName" FROM mkt_templates t
        LEFT JOIN crm_users u ON u.id = t.created_by
        ORDER BY t.updated_at DESC`);
      res.json(r.rows ?? []);
    } catch (e) { console.error("mkt templates", e); res.status(500).json({ message: "Failed to load templates" }); }
  });

  app.post("/api/marketing/templates", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      const { name, subject, design } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
      const html = renderTemplateHtml(design || { blocks: [], styles: {} });
      const r: any = await db.execute(sql`
        INSERT INTO mkt_templates (name, subject, design, html, created_by)
        VALUES (${String(name).slice(0, 160)}, ${subject ? String(subject).slice(0, 300) : null},
                ${JSON.stringify(design || {})}::jsonb, ${html}, ${user?.id ?? null})
        RETURNING *`);
      res.status(201).json(r.rows?.[0]);
    } catch (e) { console.error("mkt templates POST", e); res.status(500).json({ message: "Failed to save template" }); }
  });

  app.patch("/api/marketing/templates/:id", requireCrmAuth, async (req, res) => {
    try {
      const { name, subject, design } = req.body || {};
      const html = design ? renderTemplateHtml(design) : null;
      const r: any = await db.execute(sql`
        UPDATE mkt_templates SET
          name = COALESCE(${name ? String(name).slice(0, 160) : null}, name),
          subject = ${subject === undefined ? sql.raw("subject") : subject ? String(subject).slice(0, 300) : null},
          design = COALESCE(${design ? JSON.stringify(design) : null}::jsonb, design),
          html = COALESCE(${html}, html),
          updated_at = now()
        WHERE id = ${req.params.id} RETURNING *`);
      if (!r.rows?.length) return res.status(404).json({ message: "Not found" });
      res.json(r.rows[0]);
    } catch (e) { console.error("mkt templates PATCH", e); res.status(500).json({ message: "Failed to update template" }); }
  });

  app.delete("/api/marketing/templates/:id", requireCrmAuth, async (req, res) => {
    try {
      await db.execute(sql`DELETE FROM mkt_templates WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (e) { console.error("mkt templates DELETE", e); res.status(500).json({ message: "Failed to delete template" }); }
  });

  // ── Audiences ──
  app.get("/api/marketing/audiences", requireCrmAuth, async (_req, res) => {
    try {
      const r: any = await db.execute(sql`SELECT * FROM mkt_audiences ORDER BY created_at DESC`);
      const rows = r.rows ?? [];
      // live counts
      for (const row of rows) {
        try {
          const c: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM crm_customers c WHERE ${audienceWhere(row.filters || [])}`);
          row.count = c.rows?.[0]?.n ?? 0;
        } catch { row.count = null; }
      }
      res.json(rows);
    } catch (e) { console.error("mkt audiences", e); res.status(500).json({ message: "Failed to load audiences" }); }
  });

  app.post("/api/marketing/audiences/preview", requireCrmAuth, async (req, res) => {
    try {
      const filters = (req.body?.filters ?? []) as AudienceFilter[];
      const where = audienceWhere(filters);
      const count: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM crm_customers c WHERE ${where}`);
      const sample: any = await db.execute(sql`SELECT c.name, c.email FROM crm_customers c WHERE ${where} ORDER BY c.created_at DESC LIMIT 8`);
      res.json({ count: count.rows?.[0]?.n ?? 0, sample: sample.rows ?? [] });
    } catch (e) { console.error("mkt audience preview", e); res.status(500).json({ message: "Failed to preview audience" }); }
  });

  app.post("/api/marketing/audiences", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      const { name, filters } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
      const r: any = await db.execute(sql`
        INSERT INTO mkt_audiences (name, filters, created_by)
        VALUES (${String(name).slice(0, 160)}, ${JSON.stringify(filters || [])}::jsonb, ${user?.id ?? null})
        RETURNING *`);
      res.status(201).json(r.rows?.[0]);
    } catch (e) { console.error("mkt audiences POST", e); res.status(500).json({ message: "Failed to save audience" }); }
  });

  app.delete("/api/marketing/audiences/:id", requireCrmAuth, async (req, res) => {
    try {
      await db.execute(sql`DELETE FROM mkt_audiences WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (e) { console.error("mkt audiences DELETE", e); res.status(500).json({ message: "Failed to delete audience" }); }
  });

  // ── Campaigns ──
  app.get("/api/marketing/campaigns", requireCrmAuth, async (_req, res) => {
    try {
      const r: any = await db.execute(sql`
        SELECT cp.*, t.name AS "templateName", a.name AS "audienceName", u.name AS "createdByName"
        FROM mkt_campaigns cp
        LEFT JOIN mkt_templates t ON t.id = cp.template_id
        LEFT JOIN mkt_audiences a ON a.id = cp.audience_id
        LEFT JOIN crm_users u ON u.id = cp.created_by
        ORDER BY cp.created_at DESC`);
      res.json(r.rows ?? []);
    } catch (e) { console.error("mkt campaigns", e); res.status(500).json({ message: "Failed to load campaigns" }); }
  });

  app.post("/api/marketing/campaigns", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      const { name, templateId, audienceId, subject } = req.body || {};
      if (!name?.trim() || !templateId || !audienceId) {
        return res.status(400).json({ message: "Name, template and audience are required" });
      }
      const r: any = await db.execute(sql`
        INSERT INTO mkt_campaigns (name, template_id, audience_id, subject, status, created_by)
        VALUES (${String(name).slice(0, 160)}, ${templateId}, ${audienceId},
                ${subject ? String(subject).slice(0, 300) : null}, 'draft', ${user?.id ?? null})
        RETURNING *`);
      res.status(201).json(r.rows?.[0]);
    } catch (e) { console.error("mkt campaigns POST", e); res.status(500).json({ message: "Failed to create campaign" }); }
  });

  app.delete("/api/marketing/campaigns/:id", requireCrmAuth, async (req, res) => {
    try {
      await db.execute(sql`DELETE FROM mkt_campaigns WHERE id = ${req.params.id} AND status = 'draft'`);
      res.json({ ok: true });
    } catch (e) { console.error("mkt campaigns DELETE", e); res.status(500).json({ message: "Failed to delete campaign" }); }
  });

  // Send: resolve audience → merge fields → Resend, throttled
  app.post("/api/marketing/campaigns/:id/send", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || !["owner", "admin", "supervisor"].includes(user.role)) {
        return res.status(403).json({ message: "Sending campaigns is limited to admins." });
      }
      if (!resend) return res.status(503).json({ message: "RESEND_API_KEY isn't configured on the server." });

      const cr: any = await db.execute(sql`
        SELECT cp.*, t.design AS template_design, t.subject AS template_subject
        FROM mkt_campaigns cp JOIN mkt_templates t ON t.id = cp.template_id
        WHERE cp.id = ${req.params.id}`);
      const campaign = cr.rows?.[0];
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (campaign.status === "sending" || campaign.status === "sent") {
        return res.status(400).json({ message: `Campaign is already ${campaign.status}.` });
      }
      const ar: any = await db.execute(sql`SELECT filters FROM mkt_audiences WHERE id = ${campaign.audience_id}`);
      const filters = (ar.rows?.[0]?.filters ?? []) as AudienceFilter[];
      const rec: any = await db.execute(sql`
        SELECT c.id, c.name, c.email FROM crm_customers c WHERE ${audienceWhere(filters)} LIMIT 2000`);
      const recipients = (rec.rows ?? []).filter((r2: any) => r2.email);
      if (recipients.length === 0) return res.status(400).json({ message: "The audience has no customers with email addresses." });

      const subject = campaign.subject || campaign.template_subject || campaign.name;
      const baseHtml = renderTemplateHtml(campaign.template_design || { blocks: [], styles: {} });

      await db.execute(sql`UPDATE mkt_campaigns SET status = 'sending', recipient_count = ${recipients.length} WHERE id = ${campaign.id}`);
      res.json({ ok: true, queued: recipients.length });

      // Fire-and-forget throttled send (2/sec keeps well under Resend limits)
      void (async () => {
        let sent = 0;
        let failed = 0;
        for (const r2 of recipients) {
          try {
            const { error } = await resend.emails.send({
              from: FROM_EMAIL,
              to: r2.email,
              subject: mergeFields(subject, r2),
              html: mergeFields(baseHtml, r2),
            });
            if (error) failed++; else sent++;
          } catch {
            failed++;
          }
          await new Promise((ok) => setTimeout(ok, 500));
        }
        await db.execute(sql`
          UPDATE mkt_campaigns SET status = 'sent', sent_at = now(), sent_count = ${sent}, failed_count = ${failed}
          WHERE id = ${campaign.id}`);
        console.log(`[Marketing] Campaign ${campaign.id} finished: ${sent} sent, ${failed} failed`);
      })();
    } catch (e) {
      console.error("mkt campaign send", e);
      res.status(500).json({ message: "Failed to send campaign" });
    }
  });

  // Test send to one address
  app.post("/api/marketing/templates/:id/test-send", requireCrmAuth, async (req, res) => {
    try {
      if (!resend) return res.status(503).json({ message: "RESEND_API_KEY isn't configured on the server." });
      const { to } = req.body || {};
      if (!to) return res.status(400).json({ message: "to is required" });
      const tr: any = await db.execute(sql`SELECT * FROM mkt_templates WHERE id = ${req.params.id}`);
      const t = tr.rows?.[0];
      if (!t) return res.status(404).json({ message: "Template not found" });
      const html = renderTemplateHtml(t.design || { blocks: [], styles: {} });
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: String(to),
        subject: `[TEST] ${mergeFields(t.subject || t.name, { name: "Test Customer", email: String(to) })}`,
        html: mergeFields(html, { name: "Test Customer", email: String(to) }),
      });
      if (error) return res.status(500).json({ message: `Resend error: ${(error as any)?.message || "unknown"}` });
      res.json({ ok: true });
    } catch (e) { console.error("mkt test send", e); res.status(500).json({ message: "Failed to send test" }); }
  });
}
