import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { startBackgroundSyncScheduler } from "./services/quickbooksService";
import { fieldEdgeCustomerService } from "./services/fieldedge-customers";
import { scheduleBookingReminders } from "./services/bookingEmail";

const app = express();

// Enable gzip compression for all responses
app.use(compression({
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression for all other requests
    return compression.filter(req, res);
  },
  level: 6, // Compression level (1-9, 6 is balanced)
}));

// Initialize Stripe schema and sync on startup (runs in background)
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set - skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    // Set up managed webhook if REPLIT_DOMAINS is available
    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
      const webhookUrl = `${webhookBaseUrl}/api/stripe/webhook`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(webhookUrl);
        console.log('Stripe webhook configured:', result?.webhook?.url || webhookUrl);
      } catch (webhookError) {
        console.log('Stripe webhook setup skipped (may already exist):', webhookUrl);
      }
    } else {
      console.log('REPLIT_DOMAINS not set - skipping webhook configuration');
    }

    // Sync in background so server starts immediately
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Initialize Stripe (don't await - let server start)
initStripe();

// Immediate health check endpoint - must be first to pass Cloud Run health checks
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Stripe webhook route - MUST be before express.json() middleware
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('Stripe webhook: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Stripe webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// Conditional JSON parsing - skip for PDF upload route and webhook routes that need raw body
app.use((req, res, next) => {
  if (req.path === '/api/price-book/upload') {
    return next(); // Skip global JSON parsing for PDF upload
  }
  if (req.path === '/api/webhooks/resend/inbound') {
    // Webhook needs raw body for signature verification
    express.raw({ type: 'application/json' })(req, res, next);
    return;
  }
  express.json({ limit: '1mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Serve attached_assets at /assets path for equipment images
import path from "path";
const assetsPath = path.resolve(import.meta.dirname, "..", "attached_assets");
app.use("/assets", express.static(assetsPath));

// Serve converted salesbook page images
const salesbookPagesPath = path.resolve(import.meta.dirname, "..", "public", "salesbook-pages");
app.use("/salesbook-pages", express.static(salesbookPagesPath, { maxAge: '30d' }));

async function runTaggedCommentMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE crm_tagged_comments ADD COLUMN IF NOT EXISTS author_dismissed boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE crm_tagged_comment_recipients ADD COLUMN IF NOT EXISTS resolved_by_id varchar`);
    await db.execute(sql`ALTER TABLE crm_tagged_comment_recipients ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false`);
  } catch (err) {
    console.error("Tagged comment migration error (non-fatal):", err);
  }
}

async function runSalesbookMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS salesbook_bookmarks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        label text NOT NULL,
        page_number integer NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now()
      )
    `);
  } catch (err) {
    console.error("Salesbook migration error (non-fatal):", err);
  }
}

async function runProposalTemplateMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS proposal_templates (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        body text NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now()
      )
    `);
    const { DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_BODY } = await import("@shared/default-template");
    const countResult = await db.execute(sql`SELECT count(*)::int as cnt FROM proposal_templates`);
    const rows = countResult.rows ?? countResult;
    const count = Number(Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>).cnt : 0);
    if (count === 0) {
      await db.execute(sql`
        INSERT INTO proposal_templates (id, name, body, is_default)
        VALUES (gen_random_uuid(), ${DEFAULT_TEMPLATE_NAME}, ${DEFAULT_TEMPLATE_BODY}, true)
      `);
      console.log("[ProposalTemplates] Seeded default Installation Agreement template");
    }

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS proposal_template_images (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        url text NOT NULL,
        created_at timestamp DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customer_files (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id varchar NOT NULL,
        name text NOT NULL,
        url text NOT NULL,
        object_path text,
        content_type text,
        size integer,
        uploaded_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);
  } catch (err) {
    console.error("Proposal template migration error (non-fatal):", err);
  }
}

async function runAgreementVisitFrequencyMigration() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    // Decouple visit cadence from billing cadence: add a nullable visit_frequency
    // column to both the agreement templates and the agreements themselves.
    // Idempotent so it runs safely on every environment (dev + production).
    await db.execute(
      sql`ALTER TABLE custom_agreement_types ADD COLUMN IF NOT EXISTS visit_frequency text`,
    );
    await db.execute(
      sql`ALTER TABLE crm_agreements ADD COLUMN IF NOT EXISTS visit_frequency text`,
    );
  } catch (err) {
    console.error("Agreement visit-frequency migration error (non-fatal):", err);
  }
}

async function runProtectionAndCarePlanSeeds() {
  try {
    const { db } = await import("./db");
    const { crmItems, customAgreementTypes } = await import("@shared/schema");
    const { eq, and, isNull, sql } = await import("drizzle-orm");

    // 1. Installation Protection Bundles (one-time, fixed-price add-ons)
    const protectionBundles = [
      {
        name: "Elite Protection (10 Yr)",
        rate: "1200.00",
        description:
          "Maximum protection + longevity. 10-year coverage. Includes 3 maintenance visits total, 20% parts discount, and priority scheduling.",
      },
      {
        name: "Advanced Protection (5 Yr)",
        rate: "800.00",
        description:
          "Balanced value + protection. 5-year coverage. Includes 2 maintenance visits total, 15% parts discount, and priority scheduling.",
      },
      {
        name: "Standard Protection (2 Yr)",
        rate: "400.00",
        description:
          "Minimum recommended coverage. 2-year coverage. Includes 1 maintenance visit, 10% parts discount, and standard scheduling.",
      },
      {
        name: "Basic Protection (1 Yr)",
        rate: "200.00",
        description:
          "Entry-level support. 1-year coverage. No scheduled visits, 5% parts discount, and standard scheduling.",
      },
    ];

    for (const bundle of protectionBundles) {
      const existing = await db
        .select({ id: crmItems.id })
        .from(crmItems)
        .where(eq(crmItems.name, bundle.name));
      if (existing.length === 0) {
        await db.insert(crmItems).values({
          name: bundle.name,
          description: bundle.description,
          category: "protection",
          itemType: "service",
          rate: bundle.rate,
          isActive: true,
        });
        console.log(`[ProtectionPlans] Seeded bundle item: ${bundle.name}`);
      }
    }

    // 2. Monthly Care plan templates (maintenance agreement sign-ups, billed monthly)
    const carePlans = [
      {
        name: "Essential Care",
        defaultPrice: "14.00",
        visitsPerPeriod: 1,
        description:
          "Basic protection + compliance. Billed monthly. Includes 1 tune-up visit per year, 10% member parts discount, no priority service.",
      },
      {
        name: "Priority Care",
        defaultPrice: "21.00",
        visitsPerPeriod: 2,
        description:
          "Core recommended plan. Billed monthly. Includes 2 tune-up visits per year, 15% member parts discount, and priority service.",
      },
      {
        name: "Elite Care",
        defaultPrice: "30.00",
        visitsPerPeriod: 3,
        description:
          "Premium full-service membership. Billed monthly. Includes 2–3 tune-up visits per year, 20% member parts discount, and top priority service.",
      },
    ];

    for (const plan of carePlans) {
      const existing = await db
        .select({ id: customAgreementTypes.id })
        .from(customAgreementTypes)
        .where(eq(customAgreementTypes.name, plan.name));
      if (existing.length === 0) {
        await db.insert(customAgreementTypes).values({
          name: plan.name,
          description: plan.description,
          // Billed monthly, but tune-up visits are spread across the year.
          frequency: "monthly",
          visitFrequency: "annual",
          visitsPerPeriod: plan.visitsPerPeriod,
          defaultPrice: plan.defaultPrice,
          isActive: true,
        });
        console.log(`[CarePlans] Seeded care plan template: ${plan.name}`);
      } else {
        // Backfill visitFrequency for previously-seeded Care plans (idempotent).
        await db
          .update(customAgreementTypes)
          .set({ visitFrequency: "annual" })
          .where(
            and(
              eq(customAgreementTypes.name, plan.name),
              isNull(customAgreementTypes.visitFrequency),
            ),
          );
      }
    }

    // 2b. Monthly Care plans as catalog Items (so they can be added to quotes/invoices).
    // Mirrors the agreement templates above; billed monthly, category "maintenance".
    for (const plan of carePlans) {
      const existing = await db
        .select({ id: crmItems.id })
        .from(crmItems)
        .where(eq(crmItems.name, plan.name));
      if (existing.length === 0) {
        await db.insert(crmItems).values({
          name: plan.name,
          description: plan.description,
          category: "maintenance",
          itemType: "service",
          rate: plan.defaultPrice,
          isActive: true,
        });
        console.log(`[CarePlans] Seeded care plan item: ${plan.name}`);
      }
    }

    // 3. Backfill existing agreements that predate the visit/billing-cadence split.
    // Propagate each agreement's linked template visit cadence to the agreement
    // itself where it hasn't been set yet. This fixes already-created monthly-billed
    // Care plan agreements whose yearly tune-ups would otherwise be spaced within a
    // single month (effectiveVisitFrequency() falls back to the monthly "frequency").
    // Idempotent: only touches rows where visit_frequency IS NULL.
    await db.execute(sql`
      UPDATE crm_agreements a
      SET visit_frequency = t.visit_frequency
      FROM custom_agreement_types t
      WHERE a.custom_agreement_type_id = t.id
        AND a.visit_frequency IS NULL
        AND t.visit_frequency IS NOT NULL
    `);
  } catch (err) {
    console.error("Protection & care plan seed error (non-fatal):", err);
  }
}

async function runWaterHeaterSeeds() {
  try {
    const { db } = await import("./db");
    const { pricebookPackages } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    // Water heater products for the salesbook (single-tier, non-tonnage).
    // tonnage is used purely as a stable display-order key. packageLevel is the
    // stable variant code that the WATER_HEATER_SPECS warranty/feature config is
    // keyed off of (keep these in sync with client/src/components/salesbook-pages.tsx).
    const waterHeaters = [
      { tonnage: "1", packageLevel: "Tankless",    outdoorName: "On Demand Tankless",       outdoorBrand: "Navien", outdoorModel: "NAVNPE240S2",     monthlyPayment: 10100, totalInvestment: 676300 },
      { tonnage: "2", packageLevel: "Natural Gas", outdoorName: "50 Gallon Natural Gas",    outdoorBrand: "Rheem",  outdoorModel: "RHPROG5036PRH60", monthlyPayment: 4700,  totalInvestment: 309100 },
      { tonnage: "3", packageLevel: "Propane",     outdoorName: "50 Gallon Liquid Propane", outdoorBrand: "Rheem",  outdoorModel: "RHPROG5038NRH60", monthlyPayment: 4000,  totalInvestment: 264500 },
      { tonnage: "4", packageLevel: "Electric",    outdoorName: "50 Gallon Electric",       outdoorBrand: "Rheem",  outdoorModel: "RHPROE50T2RH95",  monthlyPayment: 3900,  totalInvestment: 255400 },
    ];

    for (const wh of waterHeaters) {
      const existing = await db
        .select({ id: pricebookPackages.id })
        .from(pricebookPackages)
        .where(
          and(
            eq(pricebookPackages.unitType, "Water Heater"),
            eq(pricebookPackages.tier, "Standard"),
            eq(pricebookPackages.tonnage, wh.tonnage),
            eq(pricebookPackages.packageLevel, wh.packageLevel),
          ),
        );
      if (existing.length === 0) {
        await db.insert(pricebookPackages).values({
          unitType: "Water Heater",
          tier: "Standard",
          tonnage: wh.tonnage,
          packageLevel: wh.packageLevel,
          monthlyPayment: wh.monthlyPayment,
          totalInvestment: wh.totalInvestment,
          outdoorBrand: wh.outdoorBrand,
          outdoorModel: wh.outdoorModel,
          outdoorName: wh.outdoorName,
          isActive: true,
        });
        console.log(`[WaterHeaters] Seeded package: ${wh.outdoorName}`);
      }
    }
  } catch (err) {
    console.error("Water heater seed error (non-fatal):", err);
  }
}

(async () => {
  await runTaggedCommentMigrations();
  await runSalesbookMigrations();
  await runProposalTemplateMigrations();
  await runAgreementVisitFrequencyMigration();
  await runProtectionAndCarePlanSeeds();
  await runWaterHeaterSeeds();
  try {
    const { ensureSalesbookConverted } = await import("./services/salesbook-converter");
    ensureSalesbookConverted();
  } catch (err) {
    console.error("Salesbook conversion error (non-fatal):", err);
  }
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    if (app.get("env") !== "development") {
      import("./services/salesbook-pdf")
        .then(({ prewarmSalesbookPdf }) => prewarmSalesbookPdf())
        .catch((err) => console.error("Salesbook PDF prewarm import failed:", err));
    }
    
    // Validate required environment variables after server starts (allows health checks to pass)
    if (!process.env.SESSION_SECRET) {
      console.error("⚠️ WARNING: SESSION_SECRET environment variable is not set.");
      console.error("   Session management will not work correctly without it.");
      console.error("   Please set SESSION_SECRET to a secure random string.");
    }
    
    // Start QuickBooks background sync scheduler
    startBackgroundSyncScheduler();

    // Start booking email reminder scheduler (checks every 30 min for 2-hour reminders)
    scheduleBookingReminders();
    
    // Start FieldEdge customer cache with 5-minute refresh
    fieldEdgeCustomerService.startAutoRefresh(5);
  });
})();
