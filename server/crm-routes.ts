import { Router, Request, Response } from "express";
import { db } from "./db";
import {
  crmUsers,
  crmSessions,
  crmCustomers,
  crmJobs,
  crmJobAssignments,
  crmJobStatusEvents,
  crmJobNotes,
  crmProperties,
  crmProjects,
  crmWorkOrders,
  crmInvoices,
  crmQuotes,
  insertCrmCustomerSchema,
  insertCrmJobSchema,
  CrmJobStatus,
  CrmUser,
} from "@shared/schema";
import { eq, and, inArray, desc, sql, gte, lte, count, sum, isNull } from "drizzle-orm";
import {
  requireCrmAuth,
  requireCrmRole,
  requireCrmAdmin,
  requireCrmSalesOrAbove,
  hashPassword,
  comparePasswords,
  generateSessionToken,
  logCrmAudit,
  isSalesOrAbove,
} from "./crm-auth-middleware";
import { z } from "zod";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid email or password format" });
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(crmUsers)
      .where(eq(crmUsers.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: "Account is disabled" });
    }

    const isValid = await comparePasswords(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await db.insert(crmSessions).values({
      userId: user.id,
      sessionToken,
      userAgent: req.headers["user-agent"] || null,
      ipAddress: req.ip || null,
      expiresAt,
    });

    await logCrmAudit(user.id, "login", "user", user.id, {}, req.ip);

    res.cookie("crm_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });

    const { passwordHash, ...userWithoutPassword } = user;
    return res.json({
      message: "Login successful",
      user: userWithoutPassword,
      token: sessionToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/auth/logout", requireCrmAuth, async (req: Request, res: Response) => {
  try {
    if (req.crmSessionId) {
      await db.delete(crmSessions).where(eq(crmSessions.id, req.crmSessionId));
    }

    await logCrmAudit(req.crmUser?.id || null, "logout", "user", req.crmUser?.id || null, {}, req.ip);

    res.clearCookie("crm_session", { path: "/" });
    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/auth/me", requireCrmAuth, async (req: Request, res: Response) => {
  if (!req.crmUser) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { passwordHash, ...userWithoutPassword } = req.crmUser;
  return res.json({ user: userWithoutPassword });
});

router.get("/customers", requireCrmAuth, async (req: Request, res: Response) => {
  try {
    const user = req.crmUser!;

    if (isSalesOrAbove(user.role)) {
      const customers = await db.select().from(crmCustomers).orderBy(desc(crmCustomers.createdAt));
      return res.json(customers);
    }

    if (user.role === "tech") {
      // Optimized: Single query using JOINs instead of 3 separate queries
      const customersResult = await db
        .selectDistinct({
          id: crmCustomers.id,
          name: crmCustomers.name,
          companyName: crmCustomers.companyName,
          email: crmCustomers.email,
          phone: crmCustomers.phone,
          address: crmCustomers.address,
          city: crmCustomers.city,
          state: crmCustomers.state,
          zip: crmCustomers.zip,
          customerType: crmCustomers.customerType,
          customerStatus: crmCustomers.customerStatus,
          tags: crmCustomers.tags,
          notes: crmCustomers.notes,
          createdAt: crmCustomers.createdAt,
          updatedAt: crmCustomers.updatedAt,
          sourceSystem: crmCustomers.sourceSystem,
          sourceId: crmCustomers.sourceId,
          assignedSalesRepId: crmCustomers.assignedSalesRepId,
        })
        .from(crmCustomers)
        .innerJoin(crmJobs, eq(crmJobs.customerId, crmCustomers.id))
        .innerJoin(crmJobAssignments, eq(crmJobAssignments.jobId, crmJobs.id))
        .where(eq(crmJobAssignments.techUserId, user.id))
        .orderBy(desc(crmCustomers.createdAt));

      return res.json(customersResult);
    }

    return res.status(403).json({ message: "Forbidden" });
  } catch (error) {
    console.error("Get customers error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/customers", requireCrmAuth, requireCrmSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const parsed = insertCrmCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid customer data", errors: parsed.error.errors });
    }

    const [customer] = await db.insert(crmCustomers).values(parsed.data).returning();

    await logCrmAudit(
      req.crmUser!.id,
      "customer_create",
      "customer",
      customer.id,
      { afterJson: customer },
      req.ip
    );

    return res.status(201).json(customer);
  } catch (error) {
    console.error("Create customer error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/customers/:id", requireCrmAuth, async (req: Request, res: Response) => {
  try {
    const user = req.crmUser!;
    const customerId = req.params.id;

    const [customer] = await db
      .select()
      .from(crmCustomers)
      .where(eq(crmCustomers.id, customerId))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (isSalesOrAbove(user.role)) {
      return res.json(customer);
    }

    if (user.role === "tech") {
      const assignments = await db
        .select({ jobId: crmJobAssignments.jobId })
        .from(crmJobAssignments)
        .where(eq(crmJobAssignments.techUserId, user.id));

      const jobIds = assignments.map((a) => a.jobId);
      if (jobIds.length === 0) {
        return res.status(403).json({ message: "Forbidden - Not assigned to any jobs for this customer" });
      }

      const jobs = await db
        .select()
        .from(crmJobs)
        .where(and(inArray(crmJobs.id, jobIds), eq(crmJobs.customerId, customerId)));

      if (jobs.length === 0) {
        return res.status(403).json({ message: "Forbidden - Not assigned to any jobs for this customer" });
      }

      return res.json(customer);
    }

    return res.status(403).json({ message: "Forbidden" });
  } catch (error) {
    console.error("Get customer error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/jobs", requireCrmAuth, async (req: Request, res: Response) => {
  try {
    const user = req.crmUser!;

    if (isSalesOrAbove(user.role)) {
      const jobs = await db.select().from(crmJobs).orderBy(desc(crmJobs.createdAt));
      return res.json(jobs);
    }

    if (user.role === "tech") {
      const assignments = await db
        .select({ jobId: crmJobAssignments.jobId })
        .from(crmJobAssignments)
        .where(eq(crmJobAssignments.techUserId, user.id));

      if (assignments.length === 0) {
        return res.json([]);
      }

      const jobIds = assignments.map((a) => a.jobId);
      const jobs = await db
        .select()
        .from(crmJobs)
        .where(inArray(crmJobs.id, jobIds))
        .orderBy(desc(crmJobs.createdAt));

      return res.json(jobs);
    }

    return res.status(403).json({ message: "Forbidden" });
  } catch (error) {
    console.error("Get jobs error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/jobs", requireCrmAuth, requireCrmSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const parsed = insertCrmJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid job data", errors: parsed.error.errors });
    }

    const [job] = await db.insert(crmJobs).values(parsed.data as any).returning();

    await db.insert(crmJobStatusEvents).values({
      jobId: job.id,
      status: job.status,
      userId: req.crmUser!.id,
      notes: "Job created",
    });

    await logCrmAudit(
      req.crmUser!.id,
      "job_create",
      "job",
      job.id,
      { afterJson: job },
      req.ip
    );

    return res.status(201).json(job);
  } catch (error) {
    console.error("Create job error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/jobs/:id/assign", requireCrmAuth, requireCrmSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;
    const { techUserId, startAt, endAt } = req.body;

    if (!techUserId) {
      return res.status(400).json({ message: "techUserId is required" });
    }

    const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, jobId)).limit(1);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const [tech] = await db.select().from(crmUsers).where(eq(crmUsers.id, techUserId)).limit(1);
    if (!tech) {
      return res.status(404).json({ message: "Technician not found" });
    }

    const [assignment] = await db
      .insert(crmJobAssignments)
      .values({
        jobId,
        techUserId,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      })
      .returning();

    await logCrmAudit(
      req.crmUser!.id,
      "job_assign",
      "job_assignment",
      assignment.id,
      { jobId, techUserId, afterJson: assignment },
      req.ip
    );

    return res.status(201).json(assignment);
  } catch (error) {
    console.error("Assign job error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

const statusUpdateSchema = z.object({
  status: z.enum(["new", "scheduled", "dispatched", "en_route", "on_site", "completed", "invoiced", "paid", "cancelled"]),
  notes: z.string().optional(),
});

router.post("/jobs/:id/status", requireCrmAuth, async (req: Request, res: Response) => {
  try {
    const user = req.crmUser!;
    const jobId = req.params.id;

    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid status data", errors: parsed.error.errors });
    }

    const { status, notes } = parsed.data;

    const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, jobId)).limit(1);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (!isSalesOrAbove(user.role) && user.role === "tech") {
      const assignments = await db
        .select()
        .from(crmJobAssignments)
        .where(and(eq(crmJobAssignments.jobId, jobId), eq(crmJobAssignments.techUserId, user.id)));

      if (assignments.length === 0) {
        return res.status(403).json({ message: "Forbidden - Not assigned to this job" });
      }
    }

    const beforeStatus = job.status;

    const [updatedJob] = await db
      .update(crmJobs)
      .set({
        status,
        updatedAt: new Date(),
        completedAt: status === "completed" ? new Date() : job.completedAt,
      })
      .where(eq(crmJobs.id, jobId))
      .returning();

    await db.insert(crmJobStatusEvents).values({
      jobId,
      status,
      userId: user.id,
      notes,
    });

    await logCrmAudit(
      user.id,
      "job_status_change",
      "job",
      jobId,
      { beforeJson: { status: beforeStatus }, afterJson: { status } },
      req.ip
    );

    return res.json(updatedJob);
  } catch (error) {
    console.error("Update job status error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/users", requireCrmAuth, requireCrmAdmin, async (req: Request, res: Response) => {
  try {
    const users = await db.select({
      id: crmUsers.id,
      name: crmUsers.name,
      email: crmUsers.email,
      phone: crmUsers.phone,
      role: crmUsers.role,
      isActive: crmUsers.isActive,
      createdAt: crmUsers.createdAt,
    }).from(crmUsers).orderBy(desc(crmUsers.createdAt));

    return res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(["owner", "admin", "sales", "tech"]),
});

router.post("/users", requireCrmAuth, requireCrmAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid user data", errors: parsed.error.errors });
    }

    const { password, ...userData } = parsed.data;
    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(crmUsers)
      .values({
        ...userData,
        email: userData.email.toLowerCase(),
        passwordHash,
      })
      .returning();

    await logCrmAudit(
      req.crmUser!.id,
      "user_create",
      "user",
      user.id,
      { afterJson: { ...user, passwordHash: "[REDACTED]" } },
      req.ip
    );

    const { passwordHash: _, ...userWithoutPassword } = user;
    return res.status(201).json(userWithoutPassword);
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email already exists" });
    }
    console.error("Create user error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/users/:id/deactivate", requireCrmAuth, requireCrmAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    const [user] = await db.select().from(crmUsers).where(eq(crmUsers.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [updated] = await db
      .update(crmUsers)
      .set({ isActive: false })
      .where(eq(crmUsers.id, userId))
      .returning();

    await db.delete(crmSessions).where(eq(crmSessions.userId, userId));

    await logCrmAudit(
      req.crmUser!.id,
      "user_deactivate",
      "user",
      userId,
      { beforeJson: { isActive: user.isActive }, afterJson: { isActive: false } },
      req.ip
    );

    const { passwordHash, ...userWithoutPassword } = updated;
    return res.json(userWithoutPassword);
  } catch (error) {
    console.error("Deactivate user error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Dashboard summary cache
let dashboardSummaryCache: { data: any; timestamp: number } | null = null;
const DASHBOARD_CACHE_TTL_MS = 30000; // 30 seconds

router.get("/dashboard/summary", requireCrmAuth, async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (dashboardSummaryCache && (now - dashboardSummaryCache.timestamp) < DASHBOARD_CACHE_TTL_MS) {
      return res.json(dashboardSummaryCache.data);
    }

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Run all queries in parallel for speed
    const [
      openProjectsResult,
      completedThisMonthResult,
      pendingInvoicesResult,
      revenueThisMonthResult,
      recentWorkOrders,
      recentInvoices,
      recentQuotes
    ] = await Promise.all([
      // Open projects count
      db.select({ count: count() })
        .from(crmProjects)
        .where(and(
          inArray(crmProjects.status, ["lead", "proposal_sent", "approved", "in_progress"])
        )),
      // Completed projects this month
      db.select({ count: count() })
        .from(crmProjects)
        .where(and(
          eq(crmProjects.status, "completed"),
          gte(crmProjects.updatedAt, startOfMonth),
          lte(crmProjects.updatedAt, endOfMonth)
        )),
      // Pending invoices (sent but not paid)
      db.select({ count: count() })
        .from(crmInvoices)
        .where(eq(crmInvoices.status, "sent")),
      // Revenue this month (paid invoices)
      db.select({ total: sum(crmInvoices.amountPaid) })
        .from(crmInvoices)
        .where(and(
          eq(crmInvoices.status, "paid"),
          gte(crmInvoices.paidAt, startOfMonth),
          lte(crmInvoices.paidAt, endOfMonth)
        )),
      // Next 10 work orders (scheduled)
      db.select()
        .from(crmWorkOrders)
        .where(inArray(crmWorkOrders.status, ["scheduled", "dispatched"]))
        .orderBy(crmWorkOrders.scheduledStart)
        .limit(10),
      // Last 10 invoices
      db.select()
        .from(crmInvoices)
        .orderBy(desc(crmInvoices.createdAt))
        .limit(10),
      // Last 10 quotes
      db.select()
        .from(crmQuotes)
        .orderBy(desc(crmQuotes.createdAt))
        .limit(10),
    ]);

    const summary = {
      stats: {
        openProjects: openProjectsResult[0]?.count ?? 0,
        completedThisMonth: completedThisMonthResult[0]?.count ?? 0,
        pendingInvoices: pendingInvoicesResult[0]?.count ?? 0,
        revenueThisMonth: Number(revenueThisMonthResult[0]?.total ?? 0),
      },
      recentWorkOrders,
      recentInvoices,
      recentQuotes,
      cachedAt: new Date().toISOString(),
    };

    dashboardSummaryCache = { data: summary, timestamp: now };
    return res.json(summary);
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return res.status(500).json({ message: "Failed to load dashboard summary" });
  }
});

export default router;
