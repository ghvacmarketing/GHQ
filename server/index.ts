import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { startBackgroundSyncScheduler } from "./services/quickbooksService";
import { scheduleBookingReminders } from "./services/bookingEmail";
import { startGoveeBackgroundSync } from "./services/goveeService";

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

    // Set up the managed Stripe webhook against our public host. REPLIT_DOMAINS
    // is honored only as a legacy override; in production the real domain is the
    // default so the webhook still self-configures after the Replit teardown.
    // In local dev (no public host) there's nothing routable to register.
    const publicHost =
      process.env.PUBLIC_DOMAIN ||
      process.env.REPLIT_DOMAINS?.split(',')[0] ||
      (process.env.NODE_ENV === 'production' ? 'www.ghvac.app' : null);
    if (publicHost) {
      const webhookUrl = `https://${publicHost}/api/stripe/webhook`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(webhookUrl);
        console.log('Stripe webhook configured:', result?.webhook?.url || webhookUrl);
      } catch (webhookError) {
        console.log('Stripe webhook setup skipped (may already exist):', webhookUrl);
      }
    } else {
      console.log('No public host in dev - skipping webhook configuration');
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

// Digital Asset Links — lets the Android (Play Store) app verify it owns this
// domain so it runs full-screen with no browser URL bar. After PWABuilder/Play
// generates the app, paste the signing-key SHA-256 fingerprint(s) into the
// ANDROID_APP_FINGERPRINTS env var (comma-separated) — no code change needed.
// Registered here (before the SPA catch-all) so it isn't served the HTML shell.
app.get("/.well-known/assetlinks.json", (_req, res) => {
  // Must match the Play Console package name (and the iOS bundle id).
  const packageName = process.env.ANDROID_PACKAGE_NAME || "app.ghvac.tools";
  const fingerprints = (process.env.ANDROID_APP_FINGERPRINTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  res.json(
    fingerprints.length
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [],
  );
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
  if (
    req.path === '/api/crm/mail/send' ||
    req.path === '/api/crm/help' ||
    /^\/api\/mobile\/messaging\/conversations\/[^/]+\/messages$/.test(req.path)
  ) {
    // Email attachments, Gibbs photo uploads, and MMS photos (base64) can be
    // large — the default 1mb JSON cap would 413 them.
    express.json({ limit: '30mb' })(req, res, next);
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

async function runEmailForwardingMigration() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_email_forward_rules (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
        match_from text NOT NULL,
        forward_to json NOT NULL DEFAULT '[]',
        active boolean NOT NULL DEFAULT true,
        created_by_id varchar,
        forward_count integer NOT NULL DEFAULT 0,
        last_forwarded_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_email_forward_log (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id varchar NOT NULL REFERENCES crm_email_forward_rules(id) ON DELETE CASCADE,
        gmail_message_id text NOT NULL,
        subject text,
        forwarded_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_email_forward_log_uniq ON crm_email_forward_log (rule_id, gmail_message_id)`);
    // Seed the requested rule: Neighborly Software notifications arriving in
    // Chandler's mailbox forward to Earnest and Gefa. Idempotent — only if a
    // Chandler account exists and no Neighborly rule exists yet.
    await db.execute(sql`
      INSERT INTO crm_email_forward_rules (user_id, match_from, forward_to)
      SELECT id, 'no-reply@neighborlysoftware.com', '["earnest@ghvacinc.com","gefa@ghvacinc.com"]'::json
      FROM crm_users
      WHERE lower(email) LIKE 'chandler%' AND is_active = true
        AND NOT EXISTS (SELECT 1 FROM crm_email_forward_rules WHERE match_from = 'no-reply@neighborlysoftware.com')
      LIMIT 1
    `);
  } catch (err) {
    console.error("Email forwarding migration error (non-fatal):", err);
  }
}

async function runSessionRevocationMigration() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE crm_sessions ADD COLUMN IF NOT EXISTS revoked_at timestamp`);
    await db.execute(sql`ALTER TABLE crm_sessions ADD COLUMN IF NOT EXISTS revoked_reason text`);
    await db.execute(sql`ALTER TABLE crm_sessions ADD COLUMN IF NOT EXISTS device_class text`);
  } catch (err) {
    console.error("Session revocation migration error (non-fatal):", err);
  }
}

async function runTaggedCommentMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE crm_tagged_comments ADD COLUMN IF NOT EXISTS author_dismissed boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE crm_tagged_comment_recipients ADD COLUMN IF NOT EXISTS resolved_by_id varchar`);
    await db.execute(sql`ALTER TABLE crm_tagged_comment_recipients ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false`);
    // Push-claim stamp — the APNs bridge marks rows it sends so overlapping
    // server instances (deploys) can never both push the same notification.
    await db.execute(sql`ALTER TABLE crm_notifications ADD COLUMN IF NOT EXISTS pushed_at timestamp`);
    // Menu quotes: optional (customer-toggleable) line items + which ones
    // were picked at the in-person signing.
    await db.execute(sql`ALTER TABLE crm_quote_line_items ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS accepted_line_item_ids jsonb`);
    // SMS duplicates: the Textline webhook races the send paths, so the same
    // outbound text could insert twice. Purge existing dupes (keep the
    // earliest row per external id), then enforce uniqueness so every future
    // race collapses into one row (createMessage inserts ON CONFLICT DO NOTHING).
    await db.execute(sql`
      DELETE FROM crm_messaging_messages a
        USING crm_messaging_messages b
        WHERE a.external_message_id IS NOT NULL
          AND b.external_message_id = a.external_message_id
          AND b.id <> a.id
          AND (b.created_at < a.created_at
               OR (b.created_at = a.created_at AND b.id < a.id))
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS crm_messaging_messages_external_id_uniq
        ON crm_messaging_messages (external_message_id)
        WHERE external_message_id IS NOT NULL
    `);
    // Repair deposits recorded BEFORE the contract-deposit fix (2026-08-07):
    // verify-deposit used to store the CHARGED amount (incl. the card/ACH
    // convenience fee), so balance invoices under-billed. Rewrite paid Stripe
    // deposits back to the 50% contract amount — but only rows sitting in the
    // fee-inflation band above it (>50%, ≤ ~5% over), so already-correct rows
    // and any custom/manual deposits are never touched. Idempotent: repaired
    // rows land at exactly 50% and stop matching.
    await db.execute(sql`
      UPDATE crm_quotes
         SET deposit_amount = ROUND(total::numeric * 0.5, 2)
       WHERE deposit_paid_at IS NOT NULL
         AND stripe_payment_link_id IS NOT NULL
         AND total IS NOT NULL AND total::numeric > 0
         AND deposit_amount IS NOT NULL
         AND deposit_amount::numeric > ROUND(total::numeric * 0.5, 2) + 0.01
         AND deposit_amount::numeric <= ROUND(total::numeric * 0.5, 2) * 1.05 + 1
    `);
  } catch (err) {
    console.error("Tagged comment migration error (non-fatal):", err);
  }
}

async function runInstallPlannerMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE install_plan_blocks ADD COLUMN IF NOT EXISTS crew_id varchar`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS install_crews (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now()
      )
    `);
    // Crew assignments must point at install_crews; clear anything else
    // (e.g. legacy assignments to dispatch-board user ids). Idempotent.
    await db.execute(sql`
      UPDATE install_plan_blocks SET crew_id = NULL
      WHERE crew_id IS NOT NULL AND crew_id NOT IN (SELECT id FROM install_crews)
    `);
    // Dispatch blackouts (painted "block out time" ranges per technician).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS dispatch_blackouts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tech_id varchar NOT NULL,
        start_at timestamp NOT NULL,
        end_at timestamp NOT NULL,
        reason text,
        created_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS dispatch_blackouts_tech_idx ON dispatch_blackouts (tech_id, start_at)`);
    // Govee per-sensor calibration offsets (match the Govee app's calibrated values).
    await db.execute(sql`ALTER TABLE govee_sensors ADD COLUMN IF NOT EXISTS temp_offset_f numeric(5,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE govee_sensors ADD COLUMN IF NOT EXISTS humidity_offset numeric(5,2) NOT NULL DEFAULT 0`);
    // ── Cost tracker (Settings → Usage & Costs) ──
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_usage_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL,
        kind text NOT NULL,
        model text NOT NULL,
        input_tokens integer NOT NULL DEFAULT 0,
        output_tokens integer NOT NULL DEFAULT 0,
        audio_seconds real NOT NULL DEFAULT 0,
        cost_micro bigint NOT NULL DEFAULT 0,
        source text,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON ai_usage_events (created_at)`);
    // Per-user cost breakdown: who ran each Gibbs exchange.
    await db.execute(sql`ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS user_id varchar`);
    // Prompt-cache accounting: cached prefix reads (10% price) and writes
    // (125%) are stored apart from regular input tokens.
    await db.execute(sql`ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS cache_read_tokens integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS cache_write_tokens integer NOT NULL DEFAULT 0`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS provider_usage_snapshots (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL,
        snapshot_date date NOT NULL,
        metric text NOT NULL,
        value numeric,
        cost_micro bigint NOT NULL DEFAULT 0,
        raw jsonb,
        created_at timestamp DEFAULT now(),
        UNIQUE (provider, snapshot_date, metric)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS manual_provider_costs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        label text NOT NULL,
        monthly_cost_cents integer NOT NULL,
        notes text,
        created_at timestamp DEFAULT now()
      )
    `);
    // Per-line customer visibility on quotes. One-time backfill INSIDE the
    // column-added guard: existing worksheet (custom_install) quotes stored
    // raw internal costs as line items — hide them all from customer-facing
    // surfaces. Guarded so later boots never overwrite user toggles.
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'crm_quote_line_items' AND column_name = 'customer_visible'
        ) THEN
          ALTER TABLE crm_quote_line_items ADD COLUMN customer_visible boolean DEFAULT true;
          UPDATE crm_quote_line_items SET customer_visible = false
            WHERE quote_id IN (SELECT id FROM crm_quotes WHERE quote_type = 'custom_install');
        END IF;
      END $$;
    `);
  } catch (err) {
    console.error("Install planner migration error (non-fatal):", err);
  }
}

async function runChecklistPhotoStepsMigration() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS checklist_photo_steps (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        checklist_id varchar NOT NULL REFERENCES service_call_checklists(id) ON DELETE CASCADE,
        label text NOT NULL,
        instructions text,
        is_required boolean NOT NULL DEFAULT true,
        linked_question_id varchar REFERENCES checklist_questions(id) ON DELETE SET NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE crm_work_orders ADD COLUMN IF NOT EXISTS assigned_checklist_id varchar`);
    await db.execute(sql`ALTER TABLE checklist_questions ADD COLUMN IF NOT EXISTS section text`);
    await db.execute(sql`ALTER TABLE crm_agreements ADD COLUMN IF NOT EXISTS details text`);
  } catch (err) {
    console.error("Checklist photo steps migration error (non-fatal):", err);
  }
}

async function runAiConversationMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
        title text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id varchar NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        role text NOT NULL,
        content text NOT NULL,
        related_topics json DEFAULT '[]'::json,
        proposed_action json,
        action_status text,
        action_result json,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx ON ai_conversations(user_id, updated_at)`);
    await db.execute(sql`ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS is_copilot boolean NOT NULL DEFAULT false`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages(conversation_id, created_at)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_spaces (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
        name text NOT NULL,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS space_id varchar`);
    await db.execute(sql`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS attachments json`);
  } catch (err) {
    console.error("AI conversation migration error (non-fatal):", err);
  }
}

async function runGmailMigration() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS gmail_address text`);
    await db.execute(sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS gmail_refresh_token_enc text`);
    await db.execute(sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS gmail_connected_at timestamp`);
    await db.execute(sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS gmail_history_id text`);
    await db.execute(sql`ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS gmail_sync_enabled boolean NOT NULL DEFAULT true`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_email_threads (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
        gmail_thread_id text NOT NULL,
        subject text,
        snippet text,
        participants json DEFAULT '[]'::json,
        last_message_at timestamp,
        is_unread boolean NOT NULL DEFAULT false,
        in_inbox boolean NOT NULL DEFAULT true,
        is_sent boolean NOT NULL DEFAULT false,
        customer_id varchar REFERENCES crm_customers(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE crm_email_threads ADD COLUMN IF NOT EXISTS participant_names json DEFAULT '[]'::json`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_email_threads_user_thread_idx ON crm_email_threads(user_id, gmail_thread_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_email_threads_user_last_idx ON crm_email_threads(user_id, last_message_at)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_email_messages (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id varchar NOT NULL REFERENCES crm_email_threads(id) ON DELETE CASCADE,
        user_id varchar NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
        gmail_message_id text NOT NULL,
        gmail_thread_id text NOT NULL,
        direction text NOT NULL,
        from_email text,
        from_name text,
        to_emails json DEFAULT '[]'::json,
        cc_emails json DEFAULT '[]'::json,
        bcc_emails json DEFAULT '[]'::json,
        subject text,
        snippet text,
        body_html text,
        body_text text,
        has_attachments boolean NOT NULL DEFAULT false,
        attachments json DEFAULT '[]'::json,
        is_unread boolean NOT NULL DEFAULT false,
        message_id_header text,
        sent_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_email_messages_gmail_idx ON crm_email_messages(user_id, gmail_message_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_email_messages_thread_idx ON crm_email_messages(thread_id)`);
  } catch (err) {
    console.error("Gmail migration error (non-fatal):", err);
  }
}

async function runDocsAndAccountingMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS doc_folders (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        parent_id varchar,
        created_by varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS doc_files (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        folder_id varchar,
        name text NOT NULL,
        url text NOT NULL,
        object_path text,
        content_type text,
        size integer,
        starred boolean NOT NULL DEFAULT false,
        trashed_at timestamp,
        uploaded_by varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS doc_files_folder_idx ON doc_files(folder_id)`);
    await db.execute(sql`ALTER TABLE doc_folders ADD COLUMN IF NOT EXISTS category text`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pin_comments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        path text NOT NULL,
        anchor_testid text,
        anchor_index integer DEFAULT 0,
        x_pct double precision DEFAULT 0,
        y_pct double precision DEFAULT 0,
        abs_x double precision DEFAULT 0,
        abs_y double precision DEFAULT 0,
        body text NOT NULL,
        mentions jsonb DEFAULT '[]'::jsonb,
        created_by varchar,
        resolved boolean NOT NULL DEFAULT false,
        resolved_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pin_comments_path_idx ON pin_comments(path)`);
    await db.execute(sql`ALTER TABLE pin_comments ADD COLUMN IF NOT EXISTS edited_at timestamp`);
    await db.execute(sql`ALTER TABLE crm_time_entries ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'job'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companycam_project_links (
        cc_project_id varchar PRIMARY KEY,
        cc_project_name text,
        cc_address text,
        customer_id varchar REFERENCES crm_customers(id) ON DELETE SET NULL,
        match_type text NOT NULL DEFAULT 'unmatched',
        match_score integer,
        photo_count integer DEFAULT 0,
        imported_count integer DEFAULT 0,
        archived boolean DEFAULT false,
        last_synced_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS thumb_url text`);
    await db.execute(sql`ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS latitude text`);
    await db.execute(sql`ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS longitude text`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companycam_pushed_photos (
        cc_photo_id varchar PRIMARY KEY,
        customer_file_id varchar,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companycam_deleted_media (
        object_path varchar PRIMARY KEY,
        deleted_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        title text NOT NULL,
        message text,
        created_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_device_tokens (
        token text PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
        platform text NOT NULL DEFAULT 'ios',
        created_at timestamp DEFAULT now(),
        last_seen_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mkt_templates (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        subject text,
        design jsonb NOT NULL DEFAULT '{}'::jsonb,
        html text,
        created_by varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE mkt_templates ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'email'`);
    await db.execute(sql`ALTER TABLE mkt_templates ADD COLUMN IF NOT EXISTS body text`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mkt_audiences (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        filters jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);
    // Starter audiences — seeded once, only while the table is empty, so
    // deleting one doesn't resurrect it on the next boot.
    await db.execute(sql`
      INSERT INTO mkt_audiences (name, filters)
      SELECT v.name, v.filters::jsonb FROM (VALUES
        ('All customers', '{"record":"customers","include":[],"exclude":[]}'),
        ('Residential customers', '{"record":"customers","include":[{"field":"customerType","op":"eq","value":"residential"}],"exclude":[]}'),
        ('Commercial customers', '{"record":"customers","include":[{"field":"customerType","op":"eq","value":"commercial"}],"exclude":[]}'),
        ('Prospects (not yet customers)', '{"record":"customers","include":[{"field":"customerStatus","op":"eq","value":"prospect"}],"exclude":[]}'),
        ('Agreement members', '{"record":"customers","include":[{"field":"hasAgreement","op":"eq","value":"yes"}],"exclude":[]}'),
        ('No active agreement', '{"record":"customers","include":[{"field":"hasAgreement","op":"eq","value":"no"}],"exclude":[]}'),
        ('Protection plan members', '{"record":"customers","include":[{"field":"protectionPlan","op":"eq","value":"yes"}],"exclude":[]}'),
        ('Open quotes (sent, undecided)', '{"record":"quotes","include":[{"field":"status","op":"eq","value":"sent"}],"exclude":[]}')
      ) AS v(name, filters)
      WHERE NOT EXISTS (SELECT 1 FROM mkt_audiences)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mkt_campaigns (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        template_id varchar,
        audience_id varchar,
        subject text,
        status text NOT NULL DEFAULT 'draft',
        scheduled_at timestamp,
        sent_at timestamp,
        recipient_count integer DEFAULT 0,
        sent_count integer DEFAULT 0,
        failed_count integer DEFAULT 0,
        created_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mkt_lead_sources (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        monthly_cost_cents integer NOT NULL DEFAULT 0,
        notes text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS mkt_lead_sources_lower_name_idx ON mkt_lead_sources ((lower(name)))
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS report_saved (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        spec jsonb NOT NULL,
        created_by varchar,
        shared boolean NOT NULL DEFAULT false,
        pinned boolean NOT NULL DEFAULT false,
        schedule_email text,
        schedule_frequency text,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS acct_accounts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        code text,
        name text NOT NULL,
        type text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS acct_expenses (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_date timestamp NOT NULL,
        vendor text NOT NULL,
        account_id varchar,
        amount decimal(10,2) NOT NULL,
        payment_method text DEFAULT 'card',
        memo text,
        receipt_url text,
        created_by varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    // Seed a starter HVAC chart of accounts once
    const existing: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM acct_accounts`);
    const n = Number(existing?.rows?.[0]?.n ?? 0);
    if (n === 0) {
      await db.execute(sql`
        INSERT INTO acct_accounts (code, name, type, sort_order) VALUES
        ('4000','Service Revenue','income',1),
        ('4100','Installation Revenue','income',2),
        ('4200','Maintenance Agreements','income',3),
        ('5000','Equipment & Parts','expense',10),
        ('5100','Materials & Supplies','expense',11),
        ('5200','Subcontractors','expense',12),
        ('6000','Payroll','expense',20),
        ('6100','Vehicle & Fuel','expense',21),
        ('6200','Insurance','expense',22),
        ('6300','Office & Software','expense',23),
        ('6400','Marketing & Advertising','expense',24),
        ('6500','Rent & Utilities','expense',25),
        ('6600','Tools & Equipment','expense',26),
        ('6900','Other Expenses','expense',29)
      `);
      console.log("[Accounting] Seeded starter chart of accounts");
    }
  } catch (err) {
    console.error("Docs/Accounting migration error (non-fatal):", err);
  }
}

async function runCampaignMigrations() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_campaigns (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'draft',
        template_key text,
        audience json NOT NULL,
        steps json NOT NULL,
        settings json NOT NULL,
        start_at timestamp,
        launched_at timestamp,
        completed_at timestamp,
        audience_count integer NOT NULL DEFAULT 0,
        total_sent integer NOT NULL DEFAULT 0,
        total_replied integer NOT NULL DEFAULT 0,
        total_completed integer NOT NULL DEFAULT 0,
        total_failed integer NOT NULL DEFAULT 0,
        last_send_at timestamp,
        created_by_id varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_campaigns_status_idx ON crm_campaigns(status)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_campaign_enrollments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id varchar NOT NULL,
        customer_id varchar NOT NULL,
        customer_name text,
        email text,
        phone text,
        status text NOT NULL DEFAULT 'active',
        current_step_index integer NOT NULL DEFAULT 0,
        next_action_at timestamp,
        first_sent_at timestamp,
        last_sent_at timestamp,
        replied_at timestamp,
        reply_channel text,
        conversation_id varchar,
        detail text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_campaign_enrollments_due_idx ON crm_campaign_enrollments(status, next_action_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_campaign_enrollments_campaign_idx ON crm_campaign_enrollments(campaign_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_campaign_enrollments_customer_idx ON crm_campaign_enrollments(customer_id)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS crm_campaign_enrollments_unique_idx ON crm_campaign_enrollments(campaign_id, customer_id)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_campaign_sends (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id varchar NOT NULL,
        enrollment_id varchar NOT NULL,
        customer_id varchar NOT NULL,
        step_id text,
        step_index integer NOT NULL,
        channel text NOT NULL,
        status text NOT NULL,
        detail text,
        sent_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_campaign_sends_campaign_step_idx ON crm_campaign_sends(campaign_id, step_index)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS crm_campaign_sends_customer_idx ON crm_campaign_sends(customer_id, sent_at)`);
  } catch (err) {
    console.error("Campaign migration error (non-fatal):", err);
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
  await runSessionRevocationMigration();
  await runEmailForwardingMigration();
  await runTaggedCommentMigrations();
  await runInstallPlannerMigrations();
  await runChecklistPhotoStepsMigration();
  await runAiConversationMigrations();
  await runGmailMigration();
  await runDocsAndAccountingMigrations();
  await runCampaignMigrations();
  await runSalesbookMigrations();
  await runProposalTemplateMigrations();
  await runAgreementVisitFrequencyMigration();
  await runProtectionAndCarePlanSeeds();
  await runWaterHeaterSeeds();
  try {
    const { seedNoCoolChecklist } = await import("./seed-no-cool-checklist");
    await seedNoCoolChecklist();
  } catch (err) {
    console.error("No-cool checklist seed import error (non-fatal):", err);
  }
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
  const listenOptions: { port: number; host: string; reusePort?: boolean } = {
    port,
    host: "0.0.0.0",
  };
  // SO_REUSEPORT is not supported on Windows (throws ENOTSUP); only enable it
  // on platforms that support it (e.g. Linux/Replit).
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }
  server.listen(listenOptions, () => {
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

    // Start Govee sensor polling (humidity/temperature) every minute
    startGoveeBackgroundSync(1);

    // CompanyCam reference sync (address-matched projects -> customer photos)
    import("./services/companycam")
      .then(({ scheduleCompanycamSync }) => scheduleCompanycamSync())
      .catch((err) => console.error("CompanyCam scheduler import failed:", err));

    // Native app push: fan crm_notifications out to registered iOS devices
    import("./services/push")
      .then(({ startPushNotificationBridge }) => startPushNotificationBridge())
      .catch((err) => console.error("Push bridge import failed:", err));

    // Multi-option quotes: self-heal stored totals (best option while unsold,
    // selected option once sold) — legacy rows stored the sum of all options.
    import("./services/quoteTotals")
      .then(({ recomputeAllOptionsQuoteTotals }) => recomputeAllOptionsQuoteTotals())
      .catch((err) => console.error("Quote totals backfill import failed:", err));

    // Daily provider cost snapshots (Settings → Usage & Costs)
    import("./services/cost-tracker")
      .then(({ scheduleCostSnapshots }) => scheduleCostSnapshots())
      .catch((err) => console.error("Cost tracker scheduler import failed:", err));

    // Gmail (Workspace) two-way inbox sync for connected CRM users
    import("./services/gmailService")
      .then(({ startGmailBackgroundSync, backfillThreadNames }) => {
        startGmailBackgroundSync(3);
        backfillThreadNames();
      })
      .catch((e) => console.error("Gmail sync start failed:", e));

    // Documents → Gibbs folder: knowledge read-out (regenerated each boot)
    // + one-time policy seeds Gibbs reads live via company_docs; also seeds
    // the card-convenience-fee catalog item for manual card payments
    import("./services/gibbsDocs")
      .then(({ seedGibbsDocs, seedFeeCatalogItem }) => {
        seedGibbsDocs();
        seedFeeCatalogItem();
      })
      .catch((e) => console.error("Gibbs docs seed failed:", e));

    // Textline message sync every 30s — keeps inbound AND outbound SMS
    // flowing into the CRM even when the webhook misses
    import("./services/textlineSync")
      .then(({ startTextlineBackgroundSync }) => startTextlineBackgroundSync(30))
      .catch((e) => console.error("Failed to start Textline sync:", e));

    // Start marketing automation scheduler (processes due automation runs).
    // All sends are gated behind the automated_sms/email_enabled settings.
    import("./services/automationEngine")
      .then(({ startAutomationScheduler }) => startAutomationScheduler(60_000))
      .catch((err) => console.error("Automation scheduler failed to start:", err));

    // Outbound campaign scheduler (drip sequences with reply detection).
    import("./services/campaignEngine")
      .then(({ startCampaignScheduler }) => startCampaignScheduler(60_000))
      .catch((err) => console.error("Campaign scheduler failed to start:", err));
  });
})();
