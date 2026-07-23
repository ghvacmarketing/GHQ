import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const fields: any = await db.execute(sql`
    SELECT f.id, f.page, f.type, f.x, f.y, f.width, f.height,
           CASE WHEN f.value LIKE 'data:%' THEN 'data-url (' || length(f.value) || ' chars)' ELSE f.value END AS value,
           f.completed_at, r.name AS recipient
    FROM signature_fields f
    JOIN signature_recipients r ON r.id = f.recipient_id
    WHERE f.document_id = 'adcaa054-8cfa-4d4c-bb32-02367225496a'
    ORDER BY f.page, f.y`);
  for (const row of fields.rows ?? []) console.log(JSON.stringify(row));
  console.log("fields:", fields.rows?.length ?? 0);
  process.exit(0);
}
main().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
