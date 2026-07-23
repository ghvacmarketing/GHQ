import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const keys = ["ca4423e5-6b8c-4d74-b524-edf563f19aaf", "a6e1945d-6b0a-4295-9e01-0ee0b5366875"];
  for (const k of keys) {
    const r: any = await db.execute(sql`SELECT key, content_type, length(data) AS bytes FROM object_store WHERE key = ${k} OR key LIKE ${"%" + k + "%"} LIMIT 3`);
    console.log(k, "->", JSON.stringify(r.rows ?? []));
  }
  const total: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM object_store`);
  console.log("object_store rows:", total.rows?.[0]?.n);
  const sample: any = await db.execute(sql`SELECT key, content_type, length(data) AS bytes FROM object_store ORDER BY key LIMIT 5`);
  console.log("sample keys:", JSON.stringify(sample.rows ?? [], null, 1));
  process.exit(0);
}
main().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
