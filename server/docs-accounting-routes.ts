import type { Express, Request, Response } from "express";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  docFolders,
  docFiles,
  acctAccounts,
  acctExpenses,
  crmInvoices,
  crmPayments,
  DOC_CATEGORIES,
} from "@shared/schema";
import { requireCrmAuth, requireCrmAdmin, getCurrentCrmUser } from "./crm-auth";

// ── Documents app (company Drive) + Accounting app (QB-style) API ────────────
export function registerDocsAndAccountingRoutes(app: Express): void {
  // ══════════════ DOCUMENTS ══════════════

  app.get("/api/docs/folders", requireCrmAuth, async (_req: Request, res: Response) => {
    try {
      const folders = await db.select().from(docFolders).orderBy(docFolders.name);
      res.json(folders);
    } catch (e) {
      console.error("docs/folders", e);
      res.status(500).json({ message: "Failed to load folders" });
    }
  });

  // Each Documents category tab is backed by a protected root folder; ensure
  // they all exist and return { categoryKey: folderId }.
  app.get("/api/docs/category-roots", requireCrmAuth, async (_req: Request, res: Response) => {
    try {
      const existing = await db.select().from(docFolders).where(sql`${docFolders.category} IS NOT NULL`);
      const map: Record<string, string> = {};
      for (const c of DOC_CATEGORIES) {
        let folder = existing.find((f) => f.category === c.key);
        if (!folder) {
          [folder] = await db.insert(docFolders).values({ name: c.label, category: c.key }).returning();
        }
        map[c.key] = folder.id;
      }
      res.json(map);
    } catch (e) {
      console.error("docs/category-roots", e);
      res.status(500).json({ message: "Failed to load category folders" });
    }
  });

  app.get("/api/docs/stats", requireCrmAuth, async (_req: Request, res: Response) => {
    try {
      const [fileRow] = await db
        .select({
          files: sql<number>`count(*) filter (where ${docFiles.trashedAt} is null)`,
          archived: sql<number>`count(*) filter (where ${docFiles.trashedAt} is not null)`,
          totalSize: sql<number>`coalesce(sum(${docFiles.size}) filter (where ${docFiles.trashedAt} is null), 0)`,
        })
        .from(docFiles);
      const [folderRow] = await db.select({ folders: sql<number>`count(*)` }).from(docFolders);
      res.json({
        files: Number(fileRow?.files ?? 0),
        archived: Number(fileRow?.archived ?? 0),
        totalSize: Number(fileRow?.totalSize ?? 0),
        folders: Number(folderRow?.folders ?? 0),
      });
    } catch (e) {
      console.error("docs/stats", e);
      res.status(500).json({ message: "Failed to load stats" });
    }
  });

  app.post("/api/docs/folders", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      const { name, parentId } = req.body as { name?: string; parentId?: string | null };
      if (!name?.trim()) return res.status(400).json({ message: "Folder name is required" });
      const [folder] = await db
        .insert(docFolders)
        .values({ name: name.trim(), parentId: parentId || null, createdBy: user?.id ?? null })
        .returning();
      res.status(201).json(folder);
    } catch (e) {
      console.error("docs/folders POST", e);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.patch("/api/docs/folders/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const [existing] = await db.select().from(docFolders).where(eq(docFolders.id, req.params.id));
      if (!existing) return res.status(404).json({ message: "Folder not found" });
      if (existing.category) return res.status(400).json({ message: "Category folders can't be renamed or moved" });
      const { name, parentId } = req.body as { name?: string; parentId?: string | null };
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ message: "Folder name is required" });
        set.name = name.trim();
      }
      if (parentId !== undefined) {
        if (parentId === req.params.id) return res.status(400).json({ message: "A folder can't be its own parent" });
        set.parentId = parentId || null;
      }
      const [folder] = await db.update(docFolders).set(set).where(eq(docFolders.id, req.params.id)).returning();
      if (!folder) return res.status(404).json({ message: "Folder not found" });
      res.json(folder);
    } catch (e) {
      console.error("docs/folders PATCH", e);
      res.status(500).json({ message: "Failed to update folder" });
    }
  });

  app.delete("/api/docs/folders/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const [target] = await db.select().from(docFolders).where(eq(docFolders.id, req.params.id));
      if (!target) return res.status(404).json({ message: "Folder not found" });
      if (target.category) return res.status(400).json({ message: "Category folders can't be deleted" });
      const [child] = await db.select({ id: docFolders.id }).from(docFolders).where(eq(docFolders.parentId, req.params.id)).limit(1);
      if (child) return res.status(400).json({ message: "Folder has subfolders — move or delete them first" });
      const [file] = await db
        .select({ id: docFiles.id })
        .from(docFiles)
        .where(and(eq(docFiles.folderId, req.params.id), isNull(docFiles.trashedAt)))
        .limit(1);
      if (file) return res.status(400).json({ message: "Folder isn't empty — move or trash its files first" });
      // Any trashed files inside drop to the drive root so Trash still lists them
      await db.update(docFiles).set({ folderId: null }).where(eq(docFiles.folderId, req.params.id));
      await db.delete(docFolders).where(eq(docFolders.id, req.params.id));
      res.json({ ok: true });
    } catch (e) {
      console.error("docs/folders DELETE", e);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  // view=folder (default: folderId or root) | starred | trash | search (q=)
  app.get("/api/docs/files", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const view = String(req.query.view || "folder");
      const q = String(req.query.q || "").trim();
      const folderId = String(req.query.folderId || "");
      let where;
      if (view === "starred") where = and(eq(docFiles.starred, true), isNull(docFiles.trashedAt));
      else if (view === "trash") where = sql`${docFiles.trashedAt} IS NOT NULL`;
      else if (view === "search" && q) where = and(ilike(docFiles.name, `%${q}%`), isNull(docFiles.trashedAt));
      else if (folderId) where = and(eq(docFiles.folderId, folderId), isNull(docFiles.trashedAt));
      else where = and(isNull(docFiles.folderId), isNull(docFiles.trashedAt));
      const files = await db.select().from(docFiles).where(where).orderBy(desc(docFiles.updatedAt)).limit(500);
      res.json(files);
    } catch (e) {
      console.error("docs/files", e);
      res.status(500).json({ message: "Failed to load files" });
    }
  });

  app.post("/api/docs/files", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      const { name, url, objectPath, contentType, size, folderId } = req.body as Record<string, any>;
      if (!name || !url) return res.status(400).json({ message: "name and url are required" });
      const [file] = await db
        .insert(docFiles)
        .values({
          name: String(name),
          url: String(url),
          objectPath: objectPath || null,
          contentType: contentType || null,
          size: Number.isFinite(Number(size)) ? Number(size) : null,
          folderId: folderId || null,
          uploadedBy: user?.id ?? null,
        })
        .returning();
      res.status(201).json(file);
    } catch (e) {
      console.error("docs/files POST", e);
      res.status(500).json({ message: "Failed to save file" });
    }
  });

  app.patch("/api/docs/files/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const { name, folderId, starred, trashed } = req.body as Record<string, any>;
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) {
        if (!String(name).trim()) return res.status(400).json({ message: "Name is required" });
        set.name = String(name).trim();
      }
      if (folderId !== undefined) set.folderId = folderId || null;
      if (starred !== undefined) set.starred = !!starred;
      if (trashed !== undefined) set.trashedAt = trashed ? new Date() : null;
      const [file] = await db.update(docFiles).set(set).where(eq(docFiles.id, req.params.id)).returning();
      if (!file) return res.status(404).json({ message: "File not found" });
      res.json(file);
    } catch (e) {
      console.error("docs/files PATCH", e);
      res.status(500).json({ message: "Failed to update file" });
    }
  });

  app.delete("/api/docs/files/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      await db.delete(docFiles).where(eq(docFiles.id, req.params.id));
      res.json({ ok: true });
    } catch (e) {
      console.error("docs/files DELETE", e);
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  // ══════════════ ACCOUNTING ══════════════

  app.get("/api/accounting/summary", requireCrmAdmin, async (_req: Request, res: Response) => {
    try {
      // Revenue = completed payments received, grouped by month (last 6)
      const revenueRows: any = await db.execute(sql`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, SUM(amount)::numeric AS total
        FROM crm_payments
        WHERE status = 'completed' AND created_at > now() - interval '6 months'
        GROUP BY 1 ORDER BY 1`);
      const expenseRows: any = await db.execute(sql`
        SELECT to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month, SUM(amount)::numeric AS total
        FROM acct_expenses
        WHERE expense_date > now() - interval '6 months'
        GROUP BY 1 ORDER BY 1`);

      // A/R: open invoice balances, aged by due date
      const arRows: any = await db.execute(sql`
        SELECT
          COALESCE(SUM(balance_due), 0)::numeric AS total,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date IS NULL OR due_date > now()), 0)::numeric AS current,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date <= now() AND due_date > now() - interval '30 days'), 0)::numeric AS d30,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date <= now() - interval '30 days' AND due_date > now() - interval '60 days'), 0)::numeric AS d60,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date <= now() - interval '60 days'), 0)::numeric AS d90,
          COUNT(*) FILTER (WHERE balance_due > 0)::int AS open_count
        FROM crm_invoices
        WHERE status NOT IN ('draft', 'void', 'paid') AND balance_due > 0`);

      const recentExpenses = await db
        .select({
          id: acctExpenses.id,
          expenseDate: acctExpenses.expenseDate,
          vendor: acctExpenses.vendor,
          amount: acctExpenses.amount,
          accountName: acctAccounts.name,
        })
        .from(acctExpenses)
        .leftJoin(acctAccounts, eq(acctExpenses.accountId, acctAccounts.id))
        .orderBy(desc(acctExpenses.expenseDate))
        .limit(8);

      res.json({
        revenueByMonth: revenueRows.rows ?? [],
        expensesByMonth: expenseRows.rows ?? [],
        ar: arRows.rows?.[0] ?? { total: 0, current: 0, d30: 0, d60: 0, d90: 0, open_count: 0 },
        recentExpenses,
      });
    } catch (e) {
      console.error("accounting/summary", e);
      res.status(500).json({ message: "Failed to load summary" });
    }
  });

  app.get("/api/accounting/accounts", requireCrmAdmin, async (_req: Request, res: Response) => {
    try {
      const accounts = await db.select().from(acctAccounts).orderBy(acctAccounts.sortOrder, acctAccounts.code);
      res.json(accounts);
    } catch (e) {
      res.status(500).json({ message: "Failed to load accounts" });
    }
  });

  app.post("/api/accounting/accounts", requireCrmAdmin, async (req: Request, res: Response) => {
    try {
      const { code, name, type } = req.body as Record<string, any>;
      if (!name?.trim() || !type) return res.status(400).json({ message: "name and type are required" });
      const [acct] = await db
        .insert(acctAccounts)
        .values({ code: code?.trim() || null, name: name.trim(), type, sortOrder: 50 })
        .returning();
      res.status(201).json(acct);
    } catch (e) {
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.patch("/api/accounting/accounts/:id", requireCrmAdmin, async (req: Request, res: Response) => {
    try {
      const { code, name, isActive } = req.body as Record<string, any>;
      const set: Record<string, unknown> = {};
      if (code !== undefined) set.code = code?.trim() || null;
      if (name !== undefined) set.name = String(name).trim();
      if (isActive !== undefined) set.isActive = !!isActive;
      const [acct] = await db.update(acctAccounts).set(set).where(eq(acctAccounts.id, req.params.id)).returning();
      if (!acct) return res.status(404).json({ message: "Account not found" });
      res.json(acct);
    } catch (e) {
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  app.get("/api/accounting/expenses", requireCrmAdmin, async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || "").trim();
      const accountId = String(req.query.accountId || "");
      const conds = [] as any[];
      if (q) conds.push(or(ilike(acctExpenses.vendor, `%${q}%`), ilike(acctExpenses.memo, `%${q}%`)));
      if (accountId) conds.push(eq(acctExpenses.accountId, accountId));
      const rows = await db
        .select({
          id: acctExpenses.id,
          expenseDate: acctExpenses.expenseDate,
          vendor: acctExpenses.vendor,
          accountId: acctExpenses.accountId,
          accountName: acctAccounts.name,
          amount: acctExpenses.amount,
          paymentMethod: acctExpenses.paymentMethod,
          memo: acctExpenses.memo,
        })
        .from(acctExpenses)
        .leftJoin(acctAccounts, eq(acctExpenses.accountId, acctAccounts.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(acctExpenses.expenseDate))
        .limit(300);
      res.json(rows);
    } catch (e) {
      console.error("accounting/expenses", e);
      res.status(500).json({ message: "Failed to load expenses" });
    }
  });

  app.post("/api/accounting/expenses", requireCrmAdmin, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      const { expenseDate, vendor, accountId, amount, paymentMethod, memo } = req.body as Record<string, any>;
      const amt = Number(amount);
      if (!vendor?.trim() || !Number.isFinite(amt) || amt <= 0 || !expenseDate) {
        return res.status(400).json({ message: "vendor, amount, and date are required" });
      }
      const [row] = await db
        .insert(acctExpenses)
        .values({
          expenseDate: new Date(expenseDate),
          vendor: vendor.trim(),
          accountId: accountId || null,
          amount: String(amt.toFixed(2)),
          paymentMethod: paymentMethod || "card",
          memo: memo?.trim() || null,
          createdBy: user?.id ?? null,
        })
        .returning();
      res.status(201).json(row);
    } catch (e) {
      console.error("accounting/expenses POST", e);
      res.status(500).json({ message: "Failed to save expense" });
    }
  });

  app.patch("/api/accounting/expenses/:id", requireCrmAdmin, async (req: Request, res: Response) => {
    try {
      const { expenseDate, vendor, accountId, amount, paymentMethod, memo } = req.body as Record<string, any>;
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (expenseDate !== undefined) set.expenseDate = new Date(expenseDate);
      if (vendor !== undefined) set.vendor = String(vendor).trim();
      if (accountId !== undefined) set.accountId = accountId || null;
      if (amount !== undefined) {
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "Invalid amount" });
        set.amount = String(amt.toFixed(2));
      }
      if (paymentMethod !== undefined) set.paymentMethod = paymentMethod;
      if (memo !== undefined) set.memo = memo?.trim() || null;
      const [row] = await db.update(acctExpenses).set(set).where(eq(acctExpenses.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Expense not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: "Failed to update expense" });
    }
  });

  app.delete("/api/accounting/expenses/:id", requireCrmAdmin, async (req: Request, res: Response) => {
    try {
      await db.delete(acctExpenses).where(eq(acctExpenses.id, req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });
}
