import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireCrmAuth, getCurrentCrmUser } from "../crm-auth";
import { runReport, type ReportSpec } from "./engine";
import { listSources } from "./sources";
import { CATALOG } from "./catalog";

const REPORT_ROLES = ["owner", "admin", "supervisor"];

async function requireReportAccess(req: Request, res: Response): Promise<boolean> {
  const user = await getCurrentCrmUser(req);
  if (!user || !REPORT_ROLES.includes(user.role)) {
    res.status(403).json({ message: "Reports are limited to admins." });
    return false;
  }
  (req as any).reportUser = user;
  return true;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registerReportingRoutes(app: Express): void {
  // The full catalog + source/field metadata (drives the custom builder too)
  app.get("/api/reporting/catalog", requireCrmAuth, async (req, res) => {
    if (!(await requireReportAccess(req, res))) return;
    res.json({
      categories: CATALOG,
      sources: listSources().map((s) => ({
        key: s.key,
        label: s.label,
        description: s.description,
        defaultDateField: s.defaultDateField,
        fields: Object.entries(s.fields).map(([key, f]) => ({
          key,
          label: f.label,
          type: f.type,
          groupable: !!f.groupable,
          agg: f.agg ?? null,
        })),
      })),
    });
  });

  // Execute a report spec
  app.post("/api/reporting/run", requireCrmAuth, async (req, res) => {
    if (!(await requireReportAccess(req, res))) return;
    try {
      const result = await runReport(req.body as ReportSpec);
      res.json(result);
    } catch (e: any) {
      console.error("reporting/run", e);
      res.status(400).json({ message: e?.message || "Failed to run report" });
    }
  });

  // CSV export of a spec
  app.post("/api/reporting/export.csv", requireCrmAuth, async (req, res) => {
    if (!(await requireReportAccess(req, res))) return;
    try {
      const { spec, filename } = req.body as { spec: ReportSpec; filename?: string };
      const result = await runReport(spec);
      const lines = [
        result.columns.map((c) => csvEscape(c.label)).join(","),
        ...result.rows.map((r) => result.columns.map((c) => csvEscape(r[c.key])).join(",")),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${(filename || "report").replace(/[^a-zA-Z0-9-_]/g, "_")}.csv"`);
      res.send(lines.join("\n"));
    } catch (e: any) {
      console.error("reporting/export", e);
      res.status(400).json({ message: e?.message || "Failed to export report" });
    }
  });

  // ── Saved reports (custom builder output; shareable, pinnable) ──
  app.get("/api/reporting/saved", requireCrmAuth, async (req, res) => {
    if (!(await requireReportAccess(req, res))) return;
    const user = (req as any).reportUser;
    try {
      const r: any = await db.execute(sql`
        SELECT s.*, u.name AS "createdByName"
        FROM report_saved s LEFT JOIN crm_users u ON u.id = s.created_by
        WHERE s.created_by = ${user.id} OR s.shared = true
        ORDER BY s.pinned DESC, s.created_at DESC`);
      res.json(r.rows ?? []);
    } catch (e) {
      console.error("reporting/saved", e);
      res.status(500).json({ message: "Failed to load saved reports" });
    }
  });

  app.post("/api/reporting/saved", requireCrmAuth, async (req, res) => {
    if (!(await requireReportAccess(req, res))) return;
    const user = (req as any).reportUser;
    try {
      const { name, spec, shared, pinned, scheduleEmail, scheduleFrequency } = req.body || {};
      if (!name || !spec?.source) return res.status(400).json({ message: "name and spec are required" });
      const r: any = await db.execute(sql`
        INSERT INTO report_saved (name, spec, created_by, shared, pinned, schedule_email, schedule_frequency)
        VALUES (${String(name).slice(0, 120)}, ${JSON.stringify(spec)}::jsonb, ${user.id}, ${!!shared}, ${!!pinned},
                ${scheduleEmail ? String(scheduleEmail).slice(0, 200) : null},
                ${scheduleFrequency ? String(scheduleFrequency).slice(0, 20) : null})
        RETURNING *`);
      res.status(201).json(r.rows?.[0]);
    } catch (e) {
      console.error("reporting/saved POST", e);
      res.status(500).json({ message: "Failed to save report" });
    }
  });

  app.patch("/api/reporting/saved/:id", requireCrmAuth, async (req, res) => {
    if (!(await requireReportAccess(req, res))) return;
    const user = (req as any).reportUser;
    try {
      const { name, spec, shared, pinned, scheduleEmail, scheduleFrequency } = req.body || {};
      const r: any = await db.execute(sql`
        UPDATE report_saved SET
          name = COALESCE(${name ? String(name).slice(0, 120) : null}, name),
          spec = COALESCE(${spec ? JSON.stringify(spec) : null}::jsonb, spec),
          shared = COALESCE(${shared === undefined ? null : !!shared}, shared),
          pinned = COALESCE(${pinned === undefined ? null : !!pinned}, pinned),
          schedule_email = ${scheduleEmail === undefined ? sql.raw("schedule_email") : scheduleEmail || null},
          schedule_frequency = ${scheduleFrequency === undefined ? sql.raw("schedule_frequency") : scheduleFrequency || null}
        WHERE id = ${req.params.id} AND (created_by = ${user.id} OR ${user.role} = 'owner')
        RETURNING *`);
      if (!r.rows?.length) return res.status(404).json({ message: "Not found" });
      res.json(r.rows[0]);
    } catch (e) {
      console.error("reporting/saved PATCH", e);
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  app.delete("/api/reporting/saved/:id", requireCrmAuth, async (req, res) => {
    if (!(await requireReportAccess(req, res))) return;
    const user = (req as any).reportUser;
    try {
      const r: any = await db.execute(sql`
        DELETE FROM report_saved
        WHERE id = ${req.params.id} AND (created_by = ${user.id} OR ${user.role} = 'owner')
        RETURNING id`);
      if (!r.rows?.length) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("reporting/saved DELETE", e);
      res.status(500).json({ message: "Failed to delete report" });
    }
  });
}
