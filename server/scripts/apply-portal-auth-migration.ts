// One-off: apply migrations/0004_portal_item_visibility.sql to the DATABASE_URL DB.
// Run with: npx tsx --env-file=.env server/scripts/apply-portal-auth-migration.ts
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: url });

  const file = join(__dirname, "..", "..", "migrations", process.argv[2] || "0004_portal_item_visibility.sql");
  const contents = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = contents
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    console.log(">", stmt.split("\n")[0].slice(0, 90));
    await pool.query(stmt);
  }
  await pool.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
