import { pool } from "../db";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import path from "path";
import { createHmac } from "crypto";

const CSV_PATH = path.resolve(
  process.cwd(),
  "attached_assets/Customers_2026-06-22_1782156825254.csv",
);

function stripQuotes(str: string): string {
  const trimmed = (str || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function formatPhone(raw: string): string {
  let phone = stripQuotes(raw || "");
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) {
      phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      phone = `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
  }
  return phone;
}

async function main() {
  console.log(`[Import Customers] Reading ${CSV_PATH}`);
  const fileContent = readFileSync(CSV_PATH, "utf-8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  console.log(`[Import Customers] Parsed ${records.length} rows`);

  const customerList: any[] = [];
  let parseSkipped = 0;

  for (const record of records) {
    const displayName = stripQuotes(record["Display Name"] || "");
    if (!displayName) {
      parseSkipped++;
      continue;
    }

    const phone = formatPhone(record["Phone"] || "");

    customerList.push({
      displayName,
      customerType: stripQuotes(record["Customer Type"] || "") || null,
      fullAddress: stripQuotes(record["Full Address"] || "") || null,
      phone: phone || null,
      email: stripQuotes(record["Email"] || "") || null,
      leadSource: stripQuotes(record["Lead Source"] || "") || null,
      checksum: createHmac("sha256", "customer-row")
        .update(
          JSON.stringify({
            displayName,
            customerType: record["Customer Type"] || "",
            fullAddress: record["Full Address"] || "",
            phone: phone || "",
            email: record["Email"] || "",
            leadSource: record["Lead Source"] || "",
          }),
        )
        .digest("hex"),
    });
  }

  console.log(
    `[Import Customers] ${customerList.length} valid rows, ${parseSkipped} empty rows skipped`,
  );

  const result = await storage.batchImportCustomers(customerList);

  console.log(
    `[Import Customers] Done: ${result.created} created, ${result.updated} updated (refreshed), ${result.skipped} skipped (already identical), ${result.errors} errors`,
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[Import Customers] Failed:", err);
    await pool.end();
    process.exit(1);
  });
