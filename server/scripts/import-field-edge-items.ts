import { db, pool } from "../db";
import { crmItems } from "@shared/schema";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";

interface CsvRow {
  "Item Name": string;
  Description: string;
  "Mfg Part #": string;
  Category: string;
  Rate: string;
  "Item Type": string;
}

function cleanDescription(raw: string, sourceCategory: string): string | null {
  let desc = (raw || "").replace(/\\CR/g, "\n").trim();
  const cat = (sourceCategory || "").trim();
  if (cat) {
    desc = desc ? `${desc}\n\nCategory: ${cat}` : `Category: ${cat}`;
  }
  return desc || null;
}

function parseRate(raw: string): string {
  const n = parseFloat((raw || "0").trim());
  if (!isFinite(n)) return "0";
  return n.toFixed(2);
}

async function main() {
  const csvPath = path.resolve(
    process.cwd(),
    "attached_assets/Items_2026-06-16_1781639420696.csv",
  );
  const fileContent = readFileSync(csvPath, "utf-8");
  const records: CsvRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: false,
  });

  console.log(`Parsed ${records.length} rows from CSV`);

  const rows = records
    .map((r) => {
      const name = (r["Item Name"] || "").trim();
      if (!name) return null;
      const isDiscount = (r["Item Type"] || "").trim().toLowerCase() === "discount";
      return {
        name,
        description: cleanDescription(r.Description, r.Category),
        category: "field_edge" as const,
        itemType: (isDiscount ? "discount" : "parts") as "discount" | "parts",
        partNumber: (r["Mfg Part #"] || "").trim() || null,
        rate: parseRate(r.Rate),
        isDiscount,
        isActive: true,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Idempotent + all-or-nothing: clear existing Field Edge items, then re-insert
  const chunkSize = 200;
  let inserted = 0;
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(crmItems)
      .where(eq(crmItems.category, "field_edge"))
      .returning({ id: crmItems.id });
    console.log(`Removed ${deleted.length} existing field_edge items`);

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await tx.insert(crmItems).values(chunk);
      inserted += chunk.length;
    }
  });
  console.log(`Inserted ${inserted} field_edge items`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
