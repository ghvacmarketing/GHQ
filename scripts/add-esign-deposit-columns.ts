#!/usr/bin/env node
/**
 * Additive migration: add deposit / payment-link columns to signature_documents.
 * Idempotent (ADD COLUMN IF NOT EXISTS). Runs against both the DEV database
 * (DATABASE_URL) and the PROD database (NEON_DATABASE_URL) when present.
 *
 * Run:  npx tsx --env-file=.env scripts/add-esign-deposit-columns.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as any;

const COLUMNS: Array<[string, string]> = [
  ["deposit_enabled", "boolean NOT NULL DEFAULT false"],
  ["deposit_mode", "text"],
  ["contract_total_cents", "integer"],
  ["deposit_percentage", "integer"],
  ["deposit_amount_cents", "integer"],
  ["stripe_payment_link_id", "text"],
  ["stripe_payment_link_url", "text"],
  ["deposit_paid_at", "timestamp"],
  ["stripe_payment_intent_id", "text"],
];

async function migrate(label: string, url: string | undefined) {
  if (!url) {
    console.log(`• ${label}: no connection string set — skipping`);
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    for (const [name, type] of COLUMNS) {
      await pool.query(
        `ALTER TABLE signature_documents ADD COLUMN IF NOT EXISTS ${name} ${type}`,
      );
    }
    console.log(`✅ ${label}: signature_documents deposit columns ensured`);
  } finally {
    await pool.end();
  }
}

async function main() {
  await migrate("DEV (DATABASE_URL)", process.env.DATABASE_URL);
  await migrate("PROD (NEON_DATABASE_URL)", process.env.NEON_DATABASE_URL);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
