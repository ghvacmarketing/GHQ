import OpenAI from "openai";
import { claudeConfigured, claudeChat, claudeChatWithTools, claudeErrorHint, stripJsonFences, type ClaudeTool } from "./claude";
import { db } from "../db";
import { crmWorkOrders, crmAgreements, crmCustomers, crmProjects, crmInvoices, crmQuotes, crmUsers, tasks, docFiles, docFolders } from "@shared/schema";
import { eq, gte, lte, and, or, sql, desc, isNull, isNotNull, ilike, ne } from "drizzle-orm";
import { addDays, subDays, format, startOfDay, endOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// All business scheduling happens in the shop's local timezone.
const BUSINESS_TIMEZONE = "America/New_York";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "sk-not-configured",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

interface LiveDataContext {
  upcomingWorkOrders?: any[];
  todaysWorkOrders?: any[];
  activeAgreements?: any[];
  pendingAgreements?: any[];
  expiringAgreements?: any[];
  recentInvoices?: any[];
  unpaidInvoices?: any[];
  openProjects?: any[];
  recentQuotes?: any[];
  stats?: {
    totalCustomers: number;
    activeAgreements: number;
    scheduledWorkOrders: number;
    unpaidInvoices: number;
  };
}

async function detectDataNeed(question: string): Promise<string[]> {
  const lowerQ = question.toLowerCase();
  const needs: string[] = [];
  
  if (lowerQ.includes("work order") || lowerQ.includes("appointment") || lowerQ.includes("schedule") || 
      lowerQ.includes("upcoming") || lowerQ.includes("today") || lowerQ.includes("tomorrow") ||
      lowerQ.includes("this week") || lowerQ.includes("next week")) {
    needs.push("workOrders");
  }
  if (lowerQ.includes("agreement") || lowerQ.includes("maintenance") || lowerQ.includes("contract") ||
      lowerQ.includes("expir") || lowerQ.includes("renew")) {
    needs.push("agreements");
  }
  if (lowerQ.includes("invoice") || lowerQ.includes("unpaid") || lowerQ.includes("payment") ||
      lowerQ.includes("owed") || lowerQ.includes("outstanding") || lowerQ.includes("bill")) {
    needs.push("invoices");
  }
  if (lowerQ.includes("project") || lowerQ.includes("install") || lowerQ.includes("job")) {
    needs.push("projects");
  }
  if (lowerQ.includes("quote") || lowerQ.includes("proposal") || lowerQ.includes("estimate")) {
    needs.push("quotes");
  }
  if (lowerQ.includes("how many") || lowerQ.includes("total") || lowerQ.includes("count") || 
      lowerQ.includes("stats") || lowerQ.includes("overview") || lowerQ.includes("summary")) {
    needs.push("stats");
  }
  
  return needs.length > 0 ? needs : ["stats"];
}

async function fetchLiveData(needs: string[]): Promise<LiveDataContext> {
  const context: LiveDataContext = {};
  const now = new Date();
  const today = startOfDay(now);
  const endToday = endOfDay(now);
  const nextWeek = addDays(now, 7);
  const next30Days = addDays(now, 30);
  
  try {
    if (needs.includes("workOrders")) {
      const upcoming = await db
        .select({
          id: crmWorkOrders.id,
          workOrderNumber: crmWorkOrders.workOrderNumber,
          title: crmWorkOrders.title,
          status: crmWorkOrders.status,
          scheduledStart: crmWorkOrders.scheduledStart,
          visitType: crmWorkOrders.visitType,
          customerName: crmCustomers.name,
        })
        .from(crmWorkOrders)
        .leftJoin(crmCustomers, eq(crmWorkOrders.customerId, crmCustomers.id))
        .where(
          and(
            gte(crmWorkOrders.scheduledStart, now),
            lte(crmWorkOrders.scheduledStart, next30Days)
          )
        )
        .orderBy(crmWorkOrders.scheduledStart)
        .limit(20);
      context.upcomingWorkOrders = upcoming;

      const todays = await db
        .select({
          id: crmWorkOrders.id,
          workOrderNumber: crmWorkOrders.workOrderNumber,
          title: crmWorkOrders.title,
          status: crmWorkOrders.status,
          scheduledStart: crmWorkOrders.scheduledStart,
          visitType: crmWorkOrders.visitType,
          customerName: crmCustomers.name,
        })
        .from(crmWorkOrders)
        .leftJoin(crmCustomers, eq(crmWorkOrders.customerId, crmCustomers.id))
        .where(
          and(
            gte(crmWorkOrders.scheduledStart, today),
            lte(crmWorkOrders.scheduledStart, endToday)
          )
        )
        .orderBy(crmWorkOrders.scheduledStart)
        .limit(20);
      context.todaysWorkOrders = todays;
    }

    if (needs.includes("agreements")) {
      const active = await db
        .select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          name: crmAgreements.agreementPlan,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
          nextVisitDate: crmAgreements.nextServiceDate,
          expirationDate: crmAgreements.endDate,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(eq(crmAgreements.status, "active"))
        .orderBy(crmAgreements.nextServiceDate)
        .limit(15);
      context.activeAgreements = active;

      const pending = await db
        .select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          name: crmAgreements.agreementPlan,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(eq(crmAgreements.status, "pending"))
        .limit(10);
      context.pendingAgreements = pending;

      const expiring = await db
        .select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          name: crmAgreements.agreementPlan,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
          expirationDate: crmAgreements.endDate,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(
          and(
            eq(crmAgreements.status, "active"),
            // endDate is a date column (string), so compare with YYYY-MM-DD
            lte(crmAgreements.endDate, next30Days.toISOString().slice(0, 10)),
            gte(crmAgreements.endDate, now.toISOString().slice(0, 10))
          )
        )
        .orderBy(crmAgreements.endDate)
        .limit(10);
      context.expiringAgreements = expiring;
    }

    if (needs.includes("invoices")) {
      const unpaid = await db
        .select({
          id: crmInvoices.id,
          invoiceNumber: crmInvoices.invoiceNumber,
          totalAmount: crmInvoices.total,
          status: crmInvoices.status,
          customerName: crmCustomers.name,
          sentAt: crmInvoices.sentAt,
        })
        .from(crmInvoices)
        .leftJoin(crmCustomers, eq(crmInvoices.customerId, crmCustomers.id))
        .where(eq(crmInvoices.status, "sent"))
        .orderBy(desc(crmInvoices.sentAt))
        .limit(15);
      context.unpaidInvoices = unpaid;

      const recent = await db
        .select({
          id: crmInvoices.id,
          invoiceNumber: crmInvoices.invoiceNumber,
          totalAmount: crmInvoices.total,
          status: crmInvoices.status,
          customerName: crmCustomers.name,
        })
        .from(crmInvoices)
        .leftJoin(crmCustomers, eq(crmInvoices.customerId, crmCustomers.id))
        .orderBy(desc(crmInvoices.createdAt))
        .limit(10);
      context.recentInvoices = recent;
    }

    if (needs.includes("projects")) {
      const open = await db
        .select({
          id: crmProjects.id,
          title: crmProjects.title,
          status: crmProjects.status,
          projectType: crmProjects.projectType,
          startDate: crmProjects.startDate,
          endDate: crmProjects.endDate,
          expectedValue: crmProjects.expectedValue,
          customerName: crmCustomers.name,
        })
        .from(crmProjects)
        .leftJoin(crmCustomers, eq(crmProjects.customerId, crmCustomers.id))
        .where(
          or(
            eq(crmProjects.status, "lead"),
            eq(crmProjects.status, "proposal_sent"),
            eq(crmProjects.status, "equipment_ordered"),
            eq(crmProjects.status, "equipment_arrived"),
            eq(crmProjects.status, "in_progress")
          )
        )
        .orderBy(crmProjects.startDate)
        .limit(15);
      context.openProjects = open;
    }

    if (needs.includes("quotes")) {
      const recent = await db
        .select({
          id: crmQuotes.id,
          quoteNumber: crmQuotes.quoteNumber,
          title: crmQuotes.title,
          status: crmQuotes.status,
          totalAmount: crmQuotes.total,
          customerName: crmCustomers.name,
        })
        .from(crmQuotes)
        .leftJoin(crmCustomers, eq(crmQuotes.customerId, crmCustomers.id))
        .orderBy(desc(crmQuotes.createdAt))
        .limit(10);
      context.recentQuotes = recent;
    }

    if (needs.includes("stats")) {
      const [customerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmCustomers);
      const [agreementCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmAgreements).where(eq(crmAgreements.status, "active"));
      const [woCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmWorkOrders).where(and(eq(crmWorkOrders.status, "scheduled"), gte(crmWorkOrders.scheduledStart, now)));
      const [invoiceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmInvoices).where(eq(crmInvoices.status, "sent"));
      
      context.stats = {
        totalCustomers: customerCount?.count || 0,
        activeAgreements: agreementCount?.count || 0,
        scheduledWorkOrders: woCount?.count || 0,
        unpaidInvoices: invoiceCount?.count || 0,
      };
    }
  } catch (error) {
    console.error("[CRM Help AI] Error fetching live data:", error);
  }

  return context;
}

function formatLiveDataForPrompt(context: LiveDataContext): string {
  const sections: string[] = [];
  // The server runs in UTC — format "today" in the shop's timezone or evening
  // questions get tomorrow's date.
  const today = formatInTimeZone(new Date(), BUSINESS_TIMEZONE, "EEEE, MMMM d, yyyy");
  
  sections.push(`\n\n## LIVE DATA (as of ${today})\n`);
  
  if (context.stats) {
    sections.push(`### Current Stats
- Total Customers: ${context.stats.totalCustomers}
- Active Maintenance Agreements: ${context.stats.activeAgreements}
- Scheduled Work Orders: ${context.stats.scheduledWorkOrders}
- Unpaid Invoices: ${context.stats.unpaidInvoices}`);
  }

  if (context.todaysWorkOrders && context.todaysWorkOrders.length > 0) {
    sections.push(`### Today's Work Orders (${context.todaysWorkOrders.length} scheduled)`);
    context.todaysWorkOrders.forEach(wo => {
      const time = wo.scheduledStart ? format(new Date(wo.scheduledStart), "h:mm a") : "TBD";
      sections.push(`- ${wo.workOrderNumber || wo.title}: ${wo.customerName || "Unknown"} at ${time} (${wo.status})`);
    });
  }

  if (context.upcomingWorkOrders && context.upcomingWorkOrders.length > 0) {
    sections.push(`### Upcoming Work Orders (next 30 days)`);
    context.upcomingWorkOrders.slice(0, 10).forEach(wo => {
      const date = wo.scheduledStart ? format(new Date(wo.scheduledStart), "MMM d") : "TBD";
      sections.push(`- ${wo.workOrderNumber || wo.title}: ${wo.customerName || "Unknown"} on ${date} (${wo.visitType || wo.status})`);
    });
    if (context.upcomingWorkOrders.length > 10) {
      sections.push(`... and ${context.upcomingWorkOrders.length - 10} more`);
    }
  }

  if (context.activeAgreements && context.activeAgreements.length > 0) {
    sections.push(`### Active Maintenance Agreements (${context.activeAgreements.length} total)`);
    context.activeAgreements.slice(0, 8).forEach(a => {
      const nextVisit = a.nextVisitDate ? format(new Date(a.nextVisitDate), "MMM d") : "Not scheduled";
      sections.push(`- ${a.agreementNumber || a.name}: ${a.customerName || "Unknown"} - Next visit: ${nextVisit}`);
    });
  }

  if (context.pendingAgreements && context.pendingAgreements.length > 0) {
    sections.push(`### Pending Agreements (awaiting first payment): ${context.pendingAgreements.length}`);
    context.pendingAgreements.forEach(a => {
      sections.push(`- ${a.agreementNumber || a.name}: ${a.customerName || "Unknown"}`);
    });
  }

  if (context.expiringAgreements && context.expiringAgreements.length > 0) {
    sections.push(`### Agreements Expiring Soon (next 30 days)`);
    context.expiringAgreements.forEach(a => {
      const exp = a.expirationDate ? format(new Date(a.expirationDate), "MMM d") : "TBD";
      sections.push(`- ${a.agreementNumber || a.name}: ${a.customerName || "Unknown"} - Expires: ${exp}`);
    });
  }

  if (context.unpaidInvoices && context.unpaidInvoices.length > 0) {
    sections.push(`### Unpaid Invoices (${context.unpaidInvoices.length} outstanding)`);
    context.unpaidInvoices.slice(0, 8).forEach(inv => {
      const amount = inv.totalAmount ? `$${parseFloat(inv.totalAmount).toFixed(2)}` : "TBD";
      sections.push(`- ${inv.invoiceNumber}: ${inv.customerName || "Unknown"} - ${amount}`);
    });
  }

  if (context.openProjects && context.openProjects.length > 0) {
    sections.push(`### Open Projects (${context.openProjects.length} in progress)`);
    context.openProjects.slice(0, 8).forEach(p => {
      const value = p.expectedValue ? `$${parseFloat(p.expectedValue).toLocaleString()}` : "TBD";
      sections.push(`- ${p.title}: ${p.customerName || "Unknown"} (${p.status}) - ${value}`);
    });
  }

  if (context.recentQuotes && context.recentQuotes.length > 0) {
    sections.push(`### Recent Quotes`);
    context.recentQuotes.slice(0, 5).forEach(q => {
      const amount = q.totalAmount ? `$${parseFloat(q.totalAmount).toFixed(2)}` : "TBD";
      sections.push(`- ${q.quoteNumber || q.title}: ${q.customerName || "Unknown"} - ${amount} (${q.status})`);
    });
  }

  return sections.join("\n");
}

import { CRM_FUNCTIONALITY_KNOWLEDGE } from "./crm-knowledge";

// An action the AI PROPOSES but can never execute itself. The client renders
// an approval card; only an explicit user click on Approve sends it to
// /api/crm/ai/execute-action, which re-validates against a strict whitelist
// and runs under the approving user's session with an audit log.
export interface ProposedAction {
  type: "create_task" | "create_work_order" | "send_sms" | "send_email" | "create_customer";
  summary: string;
  params: Record<string, unknown>;
}

export interface CrmHelpResponse {
  answer: string;
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
  hasLiveData?: boolean;
  /** First proposed action — kept for backward compatibility. */
  proposedAction?: ProposedAction | null;
  /** ALL proposed actions — one spoken request can carry several ("create a
   *  work order for X and a task to Y"). Max 5. */
  proposedActions?: ProposedAction[];
}

// ── Live CRM lookup tools ────────────────────────────────────────────────
// Read-only tools the model can call mid-answer, so a question about ANY
// customer, invoice, schedule, or record gets answered from live data instead
// of "I don't know". Everything is capped and read-only; writes still go
// through the approval-gated proposedActions flow.
const CRM_TOOLS: ClaudeTool[] = [
  {
    name: "customer_profile",
    description: "Full live profile for one customer by (partial) name: contact info, agreements, recent invoices with balances, recent work orders, recent quotes. Use for ANY question about a specific customer.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Customer name or part of it" } }, required: ["name"] },
  },
  {
    name: "list_work_orders",
    description: "Live work orders with optional filters. Use for schedule questions, job status, or what a technician is doing.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "scheduled | dispatched | en_route | on_site | completed | cancelled" },
        techName: { type: "string", description: "Filter to a technician by (partial) name" },
        date: { type: "string", description: "YYYY-MM-DD — jobs scheduled that Eastern calendar day" },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "list_invoices",
    description: "Live invoices; filter to unpaid or by customer. Use for money, balance, and accounts-receivable questions.",
    input_schema: {
      type: "object",
      properties: {
        unpaidOnly: { type: "boolean" },
        customerName: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "list_quotes",
    description: "Live quotes, optionally filtered by status.",
    input_schema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } }, required: [] },
  },
  {
    name: "list_agreements",
    description: "Live maintenance agreements, optionally by status (pending | active | grace_period | expired | cancelled).",
    input_schema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } }, required: [] },
  },
  {
    name: "list_tasks",
    description: "Internal team tasks (open tasks by default).",
    input_schema: { type: "object", properties: { includeCompleted: { type: "boolean" }, limit: { type: "number" } }, required: [] },
  },
  {
    name: "business_stats",
    description: "Company-wide live totals: customer count, active agreements, upcoming scheduled work orders, unpaid invoice count and total balance due.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "company_docs",
    description: "Search and READ the company's internal documents (the Documents app): brand guides, SOPs, policies, pricing sheets, call scripts, warranty terms. Use for questions about who Giesbrecht HVAC is, company policy, procedures, branding, or 'how do we do X here'. Text files and PDFs are read in full.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Words from the document name; empty lists the most recent documents" } },
      required: [],
    },
  },
];

/** Extract readable text from a stored document (text-ish directly; PDFs via
 *  poppler's pdftotext, which ships in the production image). */
async function readDocText(objectPath: string, contentType: string, fileName: string): Promise<string | null> {
  const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
  const svc = new ObjectStorageService();
  const bytes = await svc.readObjectBytes(objectPath);
  const ct = (contentType || "").toLowerCase();
  const isText = /text\/|json|csv|markdown|xml/.test(ct) || /\.(txt|md|csv|json)$/i.test(fileName);
  const isPdf = ct.includes("pdf") || /\.pdf$/i.test(fileName);
  if (isText) return bytes.toString("utf-8");
  if (isPdf) {
    const fsMod = await import("fs");
    const osMod = await import("os");
    const pathMod = await import("path");
    const { execFileSync } = await import("child_process");
    const tmp = pathMod.join(osMod.tmpdir(), `gibbs-doc-${Date.now()}.pdf`);
    try {
      fsMod.writeFileSync(tmp, bytes);
      return execFileSync("pdftotext", ["-layout", tmp, "-"], { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    } finally {
      try {
        fsMod.unlinkSync(tmp);
      } catch {}
    }
  }
  return null;
}

async function executeCrmTool(name: string, input: Record<string, unknown>): Promise<string> {
  const lim = Math.min(Math.max(Number(input?.limit) || 20, 1), 50);

  if (name === "customer_profile") {
    const q = String(input?.name || "").trim();
    if (!q) return "No customer name given.";
    const matches = await db
      .select({ id: crmCustomers.id, name: crmCustomers.name, phone: crmCustomers.phone, email: crmCustomers.email, fullAddress: crmCustomers.fullAddress, customerStatus: crmCustomers.customerStatus })
      .from(crmCustomers)
      .where(ilike(crmCustomers.name, `%${q}%`))
      .limit(5);
    if (matches.length === 0) return `No customer matching "${q}".`;
    const c = matches[0];
    const [agreements, invoices, workOrders, quotes] = await Promise.all([
      db.select({ plan: crmAgreements.agreementPlan, status: crmAgreements.status, price: crmAgreements.price, frequency: crmAgreements.frequency, nextServiceDate: crmAgreements.nextServiceDate })
        .from(crmAgreements).where(eq(crmAgreements.customerId, c.id)),
      db.select({ invoiceNumber: crmInvoices.invoiceNumber, status: crmInvoices.status, total: crmInvoices.total, balanceDue: crmInvoices.balanceDue, dueDate: crmInvoices.dueDate })
        .from(crmInvoices).where(eq(crmInvoices.customerId, c.id)).orderBy(desc(crmInvoices.createdAt)).limit(10),
      db.select({ workOrderNumber: crmWorkOrders.workOrderNumber, title: crmWorkOrders.title, status: crmWorkOrders.status, scheduledStart: crmWorkOrders.scheduledStart })
        .from(crmWorkOrders).where(eq(crmWorkOrders.customerId, c.id)).orderBy(desc(crmWorkOrders.createdAt)).limit(10),
      db.select({ quoteNumber: crmQuotes.quoteNumber, title: crmQuotes.title, status: crmQuotes.status, total: crmQuotes.total })
        .from(crmQuotes).where(eq(crmQuotes.customerId, c.id)).orderBy(desc(crmQuotes.createdAt)).limit(10),
    ]);
    return JSON.stringify({
      customer: c,
      otherNameMatches: matches.slice(1).map((m) => m.name),
      agreements,
      recentInvoices: invoices,
      recentWorkOrders: workOrders,
      recentQuotes: quotes,
    });
  }

  if (name === "list_work_orders") {
    const conds: any[] = [];
    if (input?.status) conds.push(eq(crmWorkOrders.status, String(input.status) as any));
    if (input?.date) {
      // Eastern calendar day → UTC window (EDT offset; close enough for dispatch)
      const dayStart = new Date(`${String(input.date)}T04:00:00Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
      conds.push(gte(crmWorkOrders.scheduledStart, dayStart));
      conds.push(lte(crmWorkOrders.scheduledStart, dayEnd));
    }
    let techId: string | undefined;
    if (input?.techName) {
      const [tech] = await db.select({ id: crmUsers.id }).from(crmUsers).where(ilike(crmUsers.name, `%${String(input.techName)}%`)).limit(1);
      if (!tech) return `No technician matching "${input.techName}".`;
      techId = tech.id;
      conds.push(eq(crmWorkOrders.assignedTechId, tech.id));
    }
    const rows = await db
      .select({
        workOrderNumber: crmWorkOrders.workOrderNumber,
        title: crmWorkOrders.title,
        status: crmWorkOrders.status,
        visitType: crmWorkOrders.visitType,
        scheduledStart: crmWorkOrders.scheduledStart,
        customerName: crmCustomers.name,
        techName: crmUsers.name,
      })
      .from(crmWorkOrders)
      .leftJoin(crmCustomers, eq(crmWorkOrders.customerId, crmCustomers.id))
      .leftJoin(crmUsers, eq(crmWorkOrders.assignedTechId, crmUsers.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(crmWorkOrders.scheduledStart))
      .limit(lim);
    return JSON.stringify({ workOrders: rows, techFiltered: !!techId });
  }

  if (name === "list_invoices") {
    const conds: any[] = [];
    if (input?.unpaidOnly) conds.push(and(ne(crmInvoices.status, "paid" as any), ne(crmInvoices.status, "void" as any), ne(crmInvoices.status, "draft" as any)));
    if (input?.customerName) {
      const [cust] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(ilike(crmCustomers.name, `%${String(input.customerName)}%`)).limit(1);
      if (!cust) return `No customer matching "${input.customerName}".`;
      conds.push(eq(crmInvoices.customerId, cust.id));
    }
    const rows = await db
      .select({
        invoiceNumber: crmInvoices.invoiceNumber,
        customerName: crmCustomers.name,
        status: crmInvoices.status,
        total: crmInvoices.total,
        balanceDue: crmInvoices.balanceDue,
        dueDate: crmInvoices.dueDate,
      })
      .from(crmInvoices)
      .leftJoin(crmCustomers, eq(crmInvoices.customerId, crmCustomers.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(crmInvoices.createdAt))
      .limit(lim);
    return JSON.stringify({ invoices: rows });
  }

  if (name === "list_quotes") {
    const rows = await db
      .select({ quoteNumber: crmQuotes.quoteNumber, title: crmQuotes.title, customerName: crmCustomers.name, status: crmQuotes.status, total: crmQuotes.total })
      .from(crmQuotes)
      .leftJoin(crmCustomers, eq(crmQuotes.customerId, crmCustomers.id))
      .where(input?.status ? eq(crmQuotes.status, String(input.status) as any) : undefined)
      .orderBy(desc(crmQuotes.createdAt))
      .limit(lim);
    return JSON.stringify({ quotes: rows });
  }

  if (name === "list_agreements") {
    const rows = await db
      .select({ agreementNumber: crmAgreements.agreementNumber, customerName: crmAgreements.customerName, plan: crmAgreements.agreementPlan, status: crmAgreements.status, price: crmAgreements.price, frequency: crmAgreements.frequency, nextServiceDate: crmAgreements.nextServiceDate, nextInvoiceDate: crmAgreements.nextInvoiceDate })
      .from(crmAgreements)
      .where(input?.status ? eq(crmAgreements.status, String(input.status) as any) : undefined)
      .orderBy(desc(crmAgreements.updatedAt))
      .limit(lim);
    return JSON.stringify({ agreements: rows });
  }

  if (name === "list_tasks") {
    const rows = await db
      .select({ title: tasks.title, status: tasks.status, dueAt: tasks.dueAt, assignedTo: crmUsers.name })
      .from(tasks)
      .leftJoin(crmUsers, eq(tasks.assignedToUserId, crmUsers.id))
      .where(input?.includeCompleted ? undefined : ne(tasks.status, "completed" as any))
      .orderBy(desc(tasks.createdAt))
      .limit(lim);
    return JSON.stringify({ tasks: rows });
  }

  if (name === "business_stats") {
    const now = new Date();
    const [customers] = await db.select({ n: sql<number>`count(*)::int` }).from(crmCustomers);
    const [activeAgreements] = await db.select({ n: sql<number>`count(*)::int` }).from(crmAgreements).where(eq(crmAgreements.status, "active" as any));
    const [upcomingWos] = await db.select({ n: sql<number>`count(*)::int` }).from(crmWorkOrders).where(and(eq(crmWorkOrders.status, "scheduled" as any), gte(crmWorkOrders.scheduledStart, now)));
    const [unpaid] = await db
      .select({ n: sql<number>`count(*)::int`, due: sql<number>`coalesce(sum(${crmInvoices.balanceDue}::numeric), 0)::float` })
      .from(crmInvoices)
      .where(and(ne(crmInvoices.status, "paid" as any), ne(crmInvoices.status, "void" as any), ne(crmInvoices.status, "draft" as any)));
    return JSON.stringify({
      totalCustomers: customers?.n ?? 0,
      activeAgreements: activeAgreements?.n ?? 0,
      upcomingScheduledWorkOrders: upcomingWos?.n ?? 0,
      unpaidInvoices: unpaid?.n ?? 0,
      totalBalanceDue: unpaid?.due ?? 0,
    });
  }

  if (name === "company_docs") {
    const q = String(input?.query || "").trim();
    const rows = await db
      .select({
        name: docFiles.name,
        url: docFiles.url,
        objectPath: docFiles.objectPath,
        contentType: docFiles.contentType,
        folderName: docFolders.name,
      })
      .from(docFiles)
      .leftJoin(docFolders, eq(docFiles.folderId, docFolders.id))
      .where(q ? and(ilike(docFiles.name, `%${q}%`), isNull(docFiles.trashedAt)) : isNull(docFiles.trashedAt))
      .orderBy(desc(docFiles.updatedAt))
      .limit(q ? 6 : 15);
    if (rows.length === 0) {
      return q
        ? `No documents matching "${q}" in the Documents app.`
        : "No documents uploaded to the Documents app yet.";
    }
    const results: Array<Record<string, unknown>> = [];
    for (const f of rows.slice(0, 3)) {
      const entry: Record<string, unknown> = { name: f.name, folder: f.folderName || null };
      const objectPath = f.objectPath || (f.url?.startsWith("/objects/") ? f.url : null);
      if (objectPath) {
        try {
          const text = await readDocText(objectPath, f.contentType || "", f.name);
          entry.content = text
            ? text.trim().slice(0, 8000)
            : "(binary file — content not readable; upload key docs as .txt/.md/.pdf so Gibbs can read them)";
        } catch (e: any) {
          entry.content = `(couldn't read: ${e?.message || "error"})`;
        }
      } else {
        entry.content = "(stored externally — content not readable)";
      }
      results.push(entry);
    }
    return JSON.stringify({
      documents: results,
      alsoAvailable: rows.slice(3).map((f) => f.name),
    });
  }

  return `Unknown tool: ${name}`;
}

const helpCache = new Map<string, { result: CrmHelpResponse; timestamp: number; hasLiveData: boolean }>();
const CACHE_TTL_STATIC = 1000 * 60 * 60; // 1 hour for static help questions
const CACHE_TTL_LIVE = 1000 * 60 * 5; // 5 minutes for live data questions

export async function askCrmHelp(
  question: string,
  conversationHistory?: Array<{role: 'user'|'assistant', content: string}>,
  images?: string[],
): Promise<CrmHelpResponse> {
  const normalizedQuestion = question.toLowerCase().trim();
  const hasImages = !!images && images.length > 0;

  // Detect what live data might be needed
  const dataNeeds = await detectDataNeed(question);
  const needsLiveData = dataNeeds.length > 0;
  const cacheTTL = needsLiveData ? CACHE_TTL_LIVE : CACHE_TTL_STATIC;

  // Skip cache for follow-up questions (they depend on prior context) and for
  // photo questions (the answer depends on the image, not just the text).
  const isFollowUp = (conversationHistory && conversationHistory.length > 0) || hasImages;
  if (!isFollowUp) {
    const cached = helpCache.get(normalizedQuestion);
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return cached.result;
    }
  }

  try {
    console.log("[CRM Help AI] Processing question:", question, "Data needs:", dataNeeds);
    
    // Fetch live data if needed
    let liveDataSection = "";
    if (needsLiveData) {
      const liveData = await fetchLiveData(dataNeeds);
      liveDataSection = formatLiveDataForPrompt(liveData);
      console.log("[CRM Help AI] Fetched live data for:", dataNeeds.join(", "));
    }
    
    const systemPrompt = `You are Gibbs — the AI teammate at Giesbrecht HVAC, a family HVAC company based in Wrens, Georgia serving the Augusta–Wrens area. Your name comes from Giesbrecht; if someone asks who or what you are, that's your answer. You know the CRM inside out, you can see live business data, and you're also a seasoned HVAC pro who can talk shop.

VOICE — sound like one of us, not like software: plain-spoken, warm, practical, small-town Georgia professional. Direct answers, real numbers, no corporate fluff. Talk to techs like techs, to the office like a helpful coworker. When company documents (brand guide, SOPs) are available via the company_docs tool, let them shape how you talk about the company.

Right now it is ${formatInTimeZone(new Date(), BUSINESS_TIMEZONE, "EEEE, MMMM d, yyyy 'at' h:mm a")} Eastern time (${BUSINESS_TIMEZONE}) — resolve every relative date the user says ("today", "tomorrow", "next Tuesday", "10 AM") against this clock.

Users can attach photos (equipment, model/serial plates, thermostats, job sites, error codes). When a photo is attached, read it carefully — identify make/model/serial numbers, describe visible issues, diagnose what you can see — and fold what you find into your answer or into the params of any action they asked you to prepare.

${CRM_FUNCTIONALITY_KNOWLEDGE}
${liveDataSection}

Voice and formatting — these matter as much as accuracy:
1. Talk like a helpful coworker, not a manual. Natural, warm, direct. It's fine to open with a short conversational beat ("Looks like a busy morning —") when it fits, but never pad.
2. PLAIN TEXT ONLY. Absolutely no markdown: no asterisks, no bold markers, no # headings, no backticks, no "*" or "-" bullet symbols. If you need a list, write short lines starting with a number and a period (1. 2. 3.) or just flowing sentences.
3. Keep it tight. Lead with the answer in the first sentence, then only the details that matter. Two short paragraphs beat one long one.
4. Use real data from LIVE DATA when the question is about current business — name names, dates, and dollar amounts. If live data shows nothing, say so plainly ("Nothing on the books for tomorrow yet.").
5. Speak the user's language — plain words over jargon, and mirror how they phrased things.
6. When a natural next step exists, end with it in one sentence ("Want me to pull up who's overdue?").

ACCURACY RULES — different standards for different kinds of questions:
1. CRM features & navigation: STRICT. Only describe pages, settings screens, and workflows documented in the knowledge base above. NEVER invent CRM screens, URLs, or settings. If a CRM feature isn't documented, say so plainly — and honor the "FEATURES THAT DO NOT EXIST" section.
2. Live business data (customers, schedules, balances, records): NEVER guess — use the lookup tools and answer with real numbers, names, and dates.
3. Company identity, policy, and procedure ("how do we do X here", brand voice, SOPs, warranty terms): check the company_docs tool for the real documents before answering; ground your answer in what they say.
4. Everything else — general HVAC and trade knowledge (diagnostics, equipment, refrigerants, sizing, airflow, heat pumps, best practices), business advice, writing help, and ordinary general questions: answer confidently and completely from your own expertise, like the seasoned pro you are. NEVER refuse these just because they aren't in the CRM docs — being useful beats being narrow.
5. SALES & VALUE QUESTIONS ("how does the Elite package benefit a customer", "why would someone want this plan on their 3-ton heat pump", "what would you recommend"): this is where you SHINE generatively. Use the documented package facts (prices, visits, discounts, warranty terms) as your anchors, then ELABORATE like an expert salesperson-technician — connect each feature to a concrete outcome for that customer's equipment. Example: for Elite Care on a 3-ton heat pump — heat pumps run year-round so 2–3 tune-ups keep coils clean and the charge right (efficiency, capacity, compressor life), the 20% parts discount matters because heat pumps see double the runtime of AC-only systems, and top priority service means no week-long waits in July or January. NEVER answer these with "the documentation doesn't list benefits" — the facts are documented, the reasoning is your job.

PROPOSING ACTIONS (strict rules):
You can PREPARE a few kinds of actions for the user to approve, but you can NEVER execute anything yourself. Only include proposedActions when the user EXPLICITLY asks you to create something ("create a task to...", "make a work order for..."). Many users dictate by voice, so transcripts can be loosely worded, run-on, or missing punctuation — treat any imperative that names the thing to create ("put a work order on Brian's schedule for...", "set up a job for...", "schedule a service call at...") as an explicit creation request, even mid-conversation in a thread that was previously about something else. Never propose an action for informational questions.
MULTIPLE REQUESTS IN ONE MESSAGE: voice users often ask for several things in one breath ("create a work order for the Smiths tomorrow at 10, add a task to order filters, and who hasn't paid?"). Handle ALL of them: answer every question asked, and include one proposedActions entry PER thing to create — never silently drop or merge requests. Say in your answer what each prepared action is.
ADJUSTMENTS TO A PENDING PROPOSAL: if the user refines or corrects something you proposed before they approved it ("assign it to Rio", "make it 10:30 instead", "change it to maintenance"), respond with a NEW complete proposedActions entry carrying ALL the params — the original details PLUS their change (e.g. add "assignTo": "Rio" to the same work order). The new card is what they approve, right there. NEVER say the change will be applied later, at approval time, or "the system will match it" — put it in the card now so they can approve immediately. In your answer, say the action is prepared and waiting for their approval — never say it's done. If details are missing (like which customer), ask for them instead of proposing.
Pass customerName exactly as the user said or typed it, even if it looks misspelled — the server fuzzy-matches it against the CRM and will ask the user to pick when it isn't sure. Never refuse an action just because the name looks off.
Action types and their params:
1. create_task — params: { "title": string (required), "description": string (optional), "dueDate": "YYYY-MM-DD" (optional) }
2. create_work_order — params: { "customerName": string (required, the customer's name as it appears in LIVE DATA or as the user gave it), "title": string (required), "description": string (required), "visitType": "SERVICE" | "MAINTENANCE" | "INSTALL" | "SALES" (optional, default SERVICE), "workSubtype": string (optional — for SERVICE use one of: No Cool, No Heat, Water Leak, Electrical, Thermostat, Airflow, Noise, IAQ, Other; for MAINTENANCE: Preventative Maintenance; for INSTALL: Full System, Changeout, Add Ducts, Replace Ducts, IAQ Install, Mini-split, Crawlspace; for SALES: Comfort Consultation), "assignTo": string (optional — a technician's name if the user asked to assign it to someone), "scheduledStart": "YYYY-MM-DDTHH:mm" (optional — the visit's wall-clock time in Eastern time exactly as the user means it, NO timezone suffix and NO "Z"; e.g. tomorrow at 10 AM = "${formatInTimeZone(addDays(new Date(), 1), BUSINESS_TIMEZONE, "yyyy-MM-dd")}T10:00") }
3. send_sms — texts a customer through the CRM's messaging line. params: { "customerName": string (required), "message": string (required — write the COMPLETE, ready-to-send text exactly as it should go out: friendly, professional, concise, signed "— Giesbrecht HVAC"; no placeholders like [time] unless the user left the detail out) }
4. send_email — emails someone from the approving user's connected Gmail. Recipient — set EXACTLY ONE: pass "customerName" when the user names a customer (the CRM looks up the email on their file; it errors if none is on file), OR pass "toEmail" when the user gives a literal email address (use it verbatim, never invent one). params: { "customerName": string (optional — the customer whose on-file email to use), "toEmail": string (optional — an actual email address the user provided), "subject": string (required), "body": string (required — the COMPLETE plain-text email body, ready to send: professional and warm, proper greeting and sign-off as Giesbrecht HVAC, no markdown, no placeholders unless a detail is genuinely unknown) }
5. create_customer — adds a new customer to the CRM. Before proposing, check for the same name in LIVE DATA (customer_profile) — if they already exist, say so instead of proposing a duplicate. Include every detail the user gave. params: { "name": string (required — the customer's full name), "phone": string (optional), "email": string (optional), "fullAddress": string (optional — street, city, state ZIP on one line), "customerType": "residential" | "commercial" (optional, default residential), "leadSource": string (optional — where they came from if mentioned, e.g. Google, referral, door hanger), "notes": string (optional — anything else worth keeping, e.g. "has an old gas furnace, interested in a heat pump") }
When the user says things like "text John that we're running 30 minutes late" or "email Sarah a reminder about her maintenance visit", DRAFT the full message for them and propose the action — the message text shows on the approval card so they review the exact wording before anything sends. Nothing is ever sent without their approval.

Return JSON with:
- answer: Your response as PLAIN conversational text (no markdown characters at all)
- relatedTopics: Array of 1-3 short natural follow-up QUESTIONS the user might tap next (e.g. "How do renewals work?", "Who hasn't paid yet?") — phrased as questions, max ~6 words each
- confidence: "high" if directly from data/knowledge base, "medium" if inferred, "low" if uncertain
- proposedActions: OMIT this field entirely unless the user explicitly asked you to create something. When present: an ARRAY with one entry per thing to create (max 5) — [{ "type": "create_task" | "create_work_order" | "send_sms" | "send_email" | "create_customer", "summary": one plain sentence describing exactly what will be created, "params": {...} }, ...]`;
    
    // Build message array: system + prior turns + current question.
    // Claude is preferred when ANTHROPIC_API_KEY is set; OpenAI is the fallback.
    const priorTurns: Array<{role: 'user'|'assistant', content: string}> = conversationHistory ?? [];

    // Attached photos ride the current question as vision content blocks.
    const imageBlocks = (images ?? [])
      .map((dataUrl) => {
        const match = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
        return match ? { mediaType: match[1].toLowerCase(), data: match[2] } : null;
      })
      .filter((b): b is { mediaType: string; data: string } => b !== null);

    let content: string | null | undefined;
    let finishReason: string | undefined;
    if (claudeConfigured()) {
      const userTurn = imageBlocks.length > 0
        ? {
            role: "user" as const,
            content: [
              ...imageBlocks.map((b) => ({ type: "image", source: { type: "base64", media_type: b.mediaType, data: b.data } })),
              { type: "text", text: question },
            ],
          }
        : { role: "user" as const, content: question };
      content = stripJsonFences(
        await claudeChatWithTools({
          system:
            systemPrompt +
            "\n\nLIVE LOOKUP TOOLS: you have read-only tools that query the CRM database live (customer_profile, list_work_orders, list_invoices, list_quotes, list_agreements, list_tasks, business_stats, company_docs). If a question involves any specific customer, schedule, balance, or record that isn't already in LIVE DATA above, USE A TOOL to look it up rather than saying you don't know or guessing. Never invent numbers, dates, or names — look them up. BUT be efficient: use the fewest lookups that answer the question, and for action proposals (create/send) ONE customer lookup is usually all you need — once you have enough, stop looking and answer. If a lookup fails twice, answer with what you have and say what you couldn't verify.\n\nYour FINAL message must be ONLY the JSON object — the very first character is { and the very last is }, with no text before or after it.",
          messages: [...priorTurns, userTurn],
          tools: CRM_TOOLS,
          executeTool: executeCrmTool,
          maxTokens: 3500,
          maxIterations: 8,
        }),
      );
    } else {
      const userTurn: any = imageBlocks.length > 0
        ? {
            role: "user",
            content: [
              ...imageBlocks.map((b) => ({ type: "image_url", image_url: { url: `data:${b.mediaType};base64,${b.data}` } })),
              { type: "text", text: question },
            ],
          }
        : { role: "user", content: question };
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...priorTurns,
          userTurn
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      finishReason = response.choices[0]?.finish_reason;
      content = response.choices[0]?.message?.content;
    }
    if (!content) {
      console.log("[CRM Help AI] No content in response - finish_reason:", finishReason);
      return {
        answer: "I couldn't process your question. Please try rephrasing it.",
        relatedTopics: [],
        confidence: "low"
      };
    }

    // Long answers frequently break strict JSON: prose wrapped around the
    // object, or literal newlines/tabs INSIDE string values. Walk the string
    // and escape control characters only within string literals.
    const repairJson = (raw: string): string => {
      let out = "";
      let inStr = false;
      let esc = false;
      for (const ch of raw) {
        if (inStr) {
          if (esc) {
            out += ch;
            esc = false;
          } else if (ch === "\\") {
            out += ch;
            esc = true;
          } else if (ch === '"') {
            inStr = false;
            out += ch;
          } else if (ch === "\n") {
            out += "\\n";
          } else if (ch === "\r") {
            // drop
          } else if (ch === "\t") {
            out += "\\t";
          } else {
            out += ch;
          }
        } else {
          if (ch === '"') inStr = true;
          out += ch;
        }
      }
      return out;
    };

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Attempt 2: outermost object (strips prose around the JSON).
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      const sliced = start !== -1 && end > start ? content.slice(start, end + 1) : null;
      if (sliced) {
        try {
          parsed = JSON.parse(sliced);
        } catch {
          // Attempt 3: repair control characters inside string values.
          try {
            parsed = JSON.parse(repairJson(sliced));
          } catch {
            parsed = undefined;
          }
        }
      }
    }
    if (!parsed) {
      console.log("[CRM Help AI] JSON parse failed (finish_reason:", finishReason, ") - content length:", content.length, "- head:", JSON.stringify(content.slice(0, 300)));
      // If JSON was truncated, extract whatever answer text we got; if the
      // model skipped JSON entirely and just wrote prose, USE the prose.
      // A real answer in the wrong wrapper beats an apology every time.
      const partial = content.match(/"answer"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*}|$)/)?.[1];
      const prose = !content.includes('"answer"') ? content.trim() : null;
      return {
        answer: partial
          ? partial.replace(/\\n/g, "\n").replace(/\\"/g, '"')
          : prose && prose.length > 0
            ? prose
            : "I ran into a problem formatting my response. Please try asking a more specific question.",
        relatedTopics: [],
        confidence: partial || prose ? "medium" : "low"
      };
    }
    
    // Whitelist-check every proposed action shape here too — anything that
    // isn't exactly a known type with an object params is dropped on the
    // floor. The model may return proposedActions (array) or the legacy
    // singular proposedAction.
    const rawActions: any[] = Array.isArray(parsed.proposedActions)
      ? parsed.proposedActions
      : parsed.proposedAction
        ? [parsed.proposedAction]
        : [];
    const proposedActions: ProposedAction[] = [];
    for (const pa of rawActions.slice(0, 5)) {
      if (
        pa &&
        typeof pa === "object" &&
        (pa.type === "create_task" || pa.type === "create_work_order" || pa.type === "send_sms" || pa.type === "send_email" || pa.type === "create_customer") &&
        typeof pa.summary === "string" &&
        pa.params &&
        typeof pa.params === "object" &&
        !Array.isArray(pa.params)
      ) {
        proposedActions.push({ type: pa.type, summary: pa.summary.slice(0, 300), params: pa.params });
      }
    }

    const result: CrmHelpResponse = {
      answer: parsed.answer || "I don't have information about that feature.",
      relatedTopics: Array.isArray(parsed.relatedTopics) ? parsed.relatedTopics.slice(0, 3) : [],
      confidence: parsed.confidence || "medium",
      hasLiveData: needsLiveData,
      proposedAction: proposedActions[0] ?? null,
      proposedActions,
    };

    // Never cache responses that carry proposed actions or answered a photo —
    // each ask should be freshly generated, and a stale cached proposal (or a
    // photo-specific answer keyed by text alone) must not resurface.
    if (proposedActions.length === 0 && !hasImages) {
      helpCache.set(normalizedQuestion, { result, timestamp: Date.now(), hasLiveData: needsLiveData });
    }

    return result;
  } catch (error: any) {
    console.error("[CRM Help AI] Error:", error);
    // Surface the real upstream failure so the chat shows what's actually
    // wrong (rejected key, no billing credit, model access) instead of a
    // generic apology the user can't act on.
    const status = error?.status ?? error?.response?.status;
    const detail = error?.error?.message || error?.message || "unknown error";
    const hint = claudeConfigured()
      ? claudeErrorHint(status, detail)
      : status === 401 ? "OpenAI rejected the API key — double-check OPENAI_API_KEY in Render (no quotes or spaces)."
      : status === 429 ? "The OpenAI account has no available quota — add billing credits at platform.openai.com."
      : status === 404 ? "This API key can't access the gpt-4o-mini model."
      : null;
    throw new Error(hint ? `${hint} (${detail})` : detail);
  }
}
