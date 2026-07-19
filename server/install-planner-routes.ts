import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { requireCrmAuth, getCurrentCrmUser } from "./crm-auth";
import { installPlanBlocks, installCrews, crmProjects, crmCustomers } from "@shared/schema";

const CREWS_SETTING_KEY = "install_planner_crews_per_day";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRange(start: unknown, end: unknown): start is string {
  return (
    typeof start === "string" &&
    typeof end === "string" &&
    DATE_RE.test(start) &&
    DATE_RE.test(end) &&
    end >= start // lexicographic works for ISO dates
  );
}

async function getCrewsPerDay(): Promise<number | null> {
  const s = await storage.getSetting(CREWS_SETTING_KEY);
  if (!s) return null;
  const n = parseInt(s.value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Attach the customer name to each block for display.
async function enrich(blocks: (typeof installPlanBlocks.$inferSelect)[]) {
  const custIds = Array.from(new Set(blocks.map((b) => b.customerId).filter(Boolean))) as string[];
  const custs = custIds.length
    ? await db.select({ id: crmCustomers.id, name: crmCustomers.name }).from(crmCustomers).where(inArray(crmCustomers.id, custIds))
    : [];
  const map = new Map(custs.map((c) => [c.id, c.name]));
  return blocks.map((b) => ({ ...b, customerName: b.customerId ? map.get(b.customerId) ?? null : null }));
}

export function registerInstallPlannerRoutes(app: Express): void {
  // ── Install crews (planner-managed crew list, separate from dispatch users) ──
  app.get("/api/crm/install-planner/crews", requireCrmAuth, async (_req: Request, res: Response) => {
    try {
      const rows = await db.select().from(installCrews).orderBy(installCrews.sortOrder, installCrews.createdAt);
      res.json(rows);
    } catch (e) {
      console.error("[install-planner] crews list error:", e);
      res.status(500).json({ message: "Failed to load crews" });
    }
  });

  app.post("/api/crm/install-planner/crews", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "A crew name is required" });
      const [row] = await db.insert(installCrews).values({ name: name.slice(0, 100) }).returning();
      res.status(201).json(row);
    } catch (e) {
      console.error("[install-planner] crew create error:", e);
      res.status(500).json({ message: "Failed to create crew" });
    }
  });

  app.patch("/api/crm/install-planner/crews/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "A crew name is required" });
      const [row] = await db.update(installCrews)
        .set({ name: name.slice(0, 100) })
        .where(eq(installCrews.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (e) {
      console.error("[install-planner] crew rename error:", e);
      res.status(500).json({ message: "Failed to rename crew" });
    }
  });

  app.delete("/api/crm/install-planner/crews/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      // Unassign the crew's holds rather than orphaning them.
      await db.update(installPlanBlocks).set({ crewId: null }).where(eq(installPlanBlocks.crewId, req.params.id));
      const r = await db.delete(installCrews).where(eq(installCrews.id, req.params.id)).returning();
      res.json({ success: r.length > 0 });
    } catch (e) {
      console.error("[install-planner] crew delete error:", e);
      res.status(500).json({ message: "Failed to delete crew" });
    }
  });

  // List blocks overlapping [from, to] (defaults to everything if omitted).
  app.get("/api/crm/install-planner", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const useRange = DATE_RE.test(from) && DATE_RE.test(to);
      const rows = useRange
        ? await db.select().from(installPlanBlocks)
            .where(and(lte(installPlanBlocks.startDate, to), gte(installPlanBlocks.endDate, from)))
            .orderBy(installPlanBlocks.startDate)
        : await db.select().from(installPlanBlocks).orderBy(desc(installPlanBlocks.startDate));
      res.json({ blocks: await enrich(rows), crewsPerDay: await getCrewsPerDay() });
    } catch (e) {
      console.error("[install-planner] list error:", e);
      res.status(500).json({ message: "Failed to load planner" });
    }
  });

  // Create a tentative block.
  app.post("/api/crm/install-planner", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ message: "A name is required" });
      if (!isValidRange(b.startDate, b.endDate)) return res.status(400).json({ message: "Valid start and end dates are required" });

      const [row] = await db.insert(installPlanBlocks).values({
        title: String(b.title).slice(0, 200),
        status: "tentative",
        startDate: b.startDate,
        endDate: b.endDate,
        customerId: b.customerId || null,
        quoteId: b.quoteId || null,
        crewId: b.crewId || null,
        estimatedValue: b.estimatedValue != null && b.estimatedValue !== "" ? String(b.estimatedValue) : null,
        confidence: ["high", "medium", "low"].includes(b.confidence) ? b.confidence : null,
        notes: b.notes ? String(b.notes).slice(0, 2000) : null,
        color: b.color || null,
        createdBy: user?.id ?? null,
      } as any).returning();
      res.status(201).json(row);
    } catch (e) {
      console.error("[install-planner] create error:", e);
      res.status(500).json({ message: "Failed to create block" });
    }
  });

  // Update a block (dates, name, links, status, etc.).
  app.patch("/api/crm/install-planner/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (b.title !== undefined) updates.title = String(b.title).slice(0, 200);
      if (b.startDate !== undefined && DATE_RE.test(b.startDate)) updates.startDate = b.startDate;
      if (b.endDate !== undefined && DATE_RE.test(b.endDate)) updates.endDate = b.endDate;
      if (b.customerId !== undefined) updates.customerId = b.customerId || null;
      if (b.quoteId !== undefined) updates.quoteId = b.quoteId || null;
      if (b.crewId !== undefined) updates.crewId = b.crewId || null;
      if (b.estimatedValue !== undefined) updates.estimatedValue = b.estimatedValue === "" || b.estimatedValue == null ? null : String(b.estimatedValue);
      if (b.confidence !== undefined) updates.confidence = ["high", "medium", "low"].includes(b.confidence) ? b.confidence : null;
      if (b.notes !== undefined) updates.notes = b.notes ? String(b.notes).slice(0, 2000) : null;
      if (b.color !== undefined) updates.color = b.color || null;
      // Allow marking lost / re-opening; "sold" goes through the /sell endpoint.
      if (b.status === "lost") { updates.status = "lost"; updates.lostAt = new Date(); }
      if (b.status === "tentative") { updates.status = "tentative"; updates.lostAt = null; }

      if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
        return res.status(400).json({ message: "End date can't be before the start date" });
      }
      const [row] = await db.update(installPlanBlocks).set(updates).where(eq(installPlanBlocks.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (e) {
      console.error("[install-planner] update error:", e);
      res.status(500).json({ message: "Failed to update block" });
    }
  });

  app.delete("/api/crm/install-planner/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const r = await db.delete(installPlanBlocks).where(eq(installPlanBlocks.id, req.params.id)).returning();
      res.json({ success: r.length > 0 });
    } catch (e) {
      console.error("[install-planner] delete error:", e);
      res.status(500).json({ message: "Failed to delete block" });
    }
  });

  // Mark a block SOLD → create a new INSTALL project (or link an existing one),
  // carrying over the name, customer, dates, and value. Marks it approved.
  app.post("/api/crm/install-planner/:id/sell", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      const [block] = await db.select().from(installPlanBlocks).where(eq(installPlanBlocks.id, req.params.id));
      if (!block) return res.status(404).json({ message: "Not found" });
      if (block.status === "sold") return res.status(400).json({ message: "This install has already been sold." });

      const now = new Date();
      const start = new Date(`${block.startDate}T00:00:00`);
      const end = new Date(`${block.endDate}T00:00:00`);
      const linkProjectId = req.body?.projectId || block.projectId || null;

      let project;
      if (linkProjectId) {
        // Link to an existing project: set its schedule + mark approved.
        const [existing] = await db.select().from(crmProjects).where(eq(crmProjects.id, linkProjectId));
        if (!existing) return res.status(404).json({ message: "Linked project not found" });
        const set: Record<string, any> = { startDate: start, endDate: end, approvedAt: existing.approvedAt || now, updatedAt: now };
        if (!existing.expectedValue && block.estimatedValue) set.expectedValue = block.estimatedValue;
        // Advance a still-pre-sale project into fulfillment.
        if (existing.status === "lead" || existing.status === "proposal_sent") set.status = "equipment_ordered";
        [project] = await db.update(crmProjects).set(set).where(eq(crmProjects.id, linkProjectId)).returning();
      } else {
        // Create a new INSTALL project in the fulfillment pipeline.
        [project] = await db.transaction(async (tx) => {
          const [m] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(project_number), 999)` }).from(crmProjects);
          const nextNum = (m?.maxNum || 999) + 1;
          return tx.insert(crmProjects).values({
            projectNumber: nextNum,
            customerId: block.customerId || null,
            projectType: "INSTALL",
            status: "equipment_ordered",
            title: block.title,
            expectedValue: block.estimatedValue || null,
            startDate: start,
            endDate: end,
            approvedAt: now,
          } as any).returning();
        });
      }

      const [updatedBlock] = await db.update(installPlanBlocks)
        .set({ status: "sold", projectId: project.id, soldAt: now, updatedAt: now })
        .where(eq(installPlanBlocks.id, block.id))
        .returning();

      res.json({ block: updatedBlock, project });
    } catch (e) {
      console.error("[install-planner] sell error:", e);
      res.status(500).json({ message: "Failed to convert to a project" });
    }
  });

  // Crews-per-day capacity setting (used only for the planner's over-capacity hints).
  app.put("/api/crm/install-planner/settings", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const n = parseInt(req.body?.crewsPerDay, 10);
      if (req.body?.crewsPerDay === "" || req.body?.crewsPerDay == null) {
        await storage.setSetting(CREWS_SETTING_KEY, "");
        return res.json({ crewsPerDay: null });
      }
      if (!Number.isFinite(n) || n < 1 || n > 50) return res.status(400).json({ message: "Enter 1–50 crews" });
      await storage.setSetting(CREWS_SETTING_KEY, String(n));
      res.json({ crewsPerDay: n });
    } catch (e) {
      console.error("[install-planner] settings error:", e);
      res.status(500).json({ message: "Failed to save setting" });
    }
  });
}
