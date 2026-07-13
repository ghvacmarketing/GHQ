#!/usr/bin/env node
/**
 * Additive migration: create install_plan_blocks (Install Planner tentative holds).
 * Idempotent. Runs against DEV (DATABASE_URL) and PROD (NEON_DATABASE_URL).
 *
 * Run:  npx tsx --env-file=.env scripts/add-install-planner-table.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as any;

const DDL = `
CREATE TABLE IF NOT EXISTS install_plan_blocks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'tentative',
  start_date date NOT NULL,
  end_date date NOT NULL,
  customer_id varchar,
  quote_id varchar,
  project_id varchar,
  estimated_value numeric(10,2),
  confidence text,
  notes text,
  color text,
  created_by varchar,
  sold_at timestamp,
  lost_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS install_plan_blocks_date_idx ON install_plan_blocks (start_date, end_date);
`;

async function migrate(label: string, url: string | undefined) {
  if (!url) {
    console.log(`• ${label}: no connection string — skipping`);
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(DDL);
    console.log(`✅ ${label}: install_plan_blocks ready`);
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
