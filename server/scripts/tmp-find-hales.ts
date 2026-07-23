import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const docs: any = await db.execute(sql`
    SELECT id, title, status, original_object_path, signed_object_path, page_count, created_at, sent_at, completed_at
    FROM signature_documents
    WHERE title ILIKE '%hales%' OR title ILIKE '%meter%upsize%'
    ORDER BY created_at DESC`);
  for (const r of docs.rows ?? []) console.log(JSON.stringify(r, null, 1));
  console.log("count:", docs.rows?.length ?? 0);
  process.exit(0);
}
main().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
