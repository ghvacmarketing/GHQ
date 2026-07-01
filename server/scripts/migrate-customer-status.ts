// One-time migration: rename the converted-customer status value from the old
// "client" to "customer" so the stored data matches the UI (which only ever
// labels it "Customer") and the customers-tab filter (which queries "customer").
// Also normalizes any capitalized "Customer" to the canonical lowercase.
import { db, pool } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const before = await db.execute(
    sql`SELECT customer_status AS status, COUNT(*)::int AS n
        FROM crm_customers GROUP BY customer_status ORDER BY n DESC`,
  );
  console.log("[migrate] before:", before.rows);

  const clientRes = await db.execute(
    sql`UPDATE crm_customers SET customer_status = 'customer', updated_at = NOW()
        WHERE customer_status = 'client'`,
  );
  console.log(`[migrate] 'client' -> 'customer': ${clientRes.rowCount ?? 0} rows`);

  const capRes = await db.execute(
    sql`UPDATE crm_customers SET customer_status = 'customer'
        WHERE customer_status = 'Customer'`,
  );
  console.log(`[migrate] 'Customer' -> 'customer': ${capRes.rowCount ?? 0} rows`);

  // Align the column default with the new canonical value (harmless if unset).
  try {
    await db.execute(sql`ALTER TABLE crm_customers ALTER COLUMN customer_status SET DEFAULT 'customer'`);
    console.log("[migrate] column default set to 'customer'");
  } catch (e: any) {
    console.log("[migrate] default alter skipped:", e?.message);
  }

  const after = await db.execute(
    sql`SELECT customer_status AS status, COUNT(*)::int AS n
        FROM crm_customers GROUP BY customer_status ORDER BY n DESC`,
  );
  console.log("[migrate] after:", after.rows);

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("[migrate] FAILED:", e);
  process.exit(1);
});
