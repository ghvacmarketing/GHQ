import { pool, db } from "../db";
import { crmCustomers } from "@shared/schema";
import type { CrmCustomerType } from "@shared/schema";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";

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

// Normalized 10-digit phone identity for dedup. Returns "" for invalid numbers
// (anything that isn't exactly 10 digits, or 11 digits starting with 1).
function phoneKey(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return "";
}

function formatPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return stripQuotes(raw || "");
}

// Mirror the FieldEdge service: "Last, First" -> "First Last", strip junk leaders
function formatDisplayName(rawName: string): string {
  const name = stripQuotes(rawName || "").trim();
  if (!name) return "";
  let clean = name.replace(/^["'&\s]+/, "").replace(/["']+$/, "").trim();
  if (clean.includes(",")) {
    const parts = clean.split(",").map((p) => p.trim());
    if (parts.length >= 2 && parts[1]) {
      return `${parts[1]} ${parts[0]}`.trim();
    }
  }
  return clean || name;
}

function mapType(raw: string): CrmCustomerType {
  const t = stripQuotes(raw || "").toLowerCase();
  if (t.includes("commercial")) return "commercial";
  if (t.includes("property")) return "property_manager";
  return "residential";
}

async function main() {
  console.log(`[Import CRM Customers] Reading ${CSV_PATH}`);
  const fileContent = readFileSync(CSV_PATH, "utf-8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  console.log(`[Import CRM Customers] Parsed ${records.length} rows`);

  // Build dedup sets from existing crm_customers (phone + email)
  const existing = await db
    .select({ phone: crmCustomers.phone, email: crmCustomers.email })
    .from(crmCustomers);

  const existingPhones = new Set<string>();
  const existingEmails = new Set<string>();
  for (const e of existing) {
    const p = phoneKey(e.phone || "");
    if (p.length === 10) existingPhones.add(p);
    const em = (e.email || "").trim().toLowerCase();
    if (em) existingEmails.add(em);
  }

  const toInsert: typeof crmCustomers.$inferInsert[] = [];
  const batchPhones = new Set<string>();
  const batchEmails = new Set<string>();

  let noName = 0;
  let noContact = 0;
  let alreadyInCrm = 0;
  let dupInBatch = 0;

  for (const record of records) {
    const displayName = stripQuotes(record["Display Name"] || "");
    if (!displayName) {
      noName++;
      continue;
    }

    const pKey = phoneKey(record["Phone"] || "");
    const email = stripQuotes(record["Email"] || "").toLowerCase();
    const hasPhone = pKey.length === 10;
    const hasEmail = !!email;

    // Per the user's choice: only import the contactable rows
    if (!hasPhone && !hasEmail) {
      noContact++;
      continue;
    }

    // Skip if already present in the CRM by phone or email
    if ((hasPhone && existingPhones.has(pKey)) || (hasEmail && existingEmails.has(email))) {
      alreadyInCrm++;
      continue;
    }

    // Skip duplicates within the CSV itself
    if ((hasPhone && batchPhones.has(pKey)) || (hasEmail && batchEmails.has(email))) {
      dupInBatch++;
      continue;
    }
    if (hasPhone) batchPhones.add(pKey);
    if (hasEmail) batchEmails.add(email);

    const name = formatDisplayName(displayName);
    if (!name.trim()) {
      noName++;
      continue;
    }
    const fullAddress = stripQuotes(record["Full Address"] || "") || null;
    const leadSource = stripQuotes(record["Lead Source"] || "") || null;

    const sourceId = `csv-${createHash("sha256")
      .update(`${name.toLowerCase()}|${pKey}|${email}`)
      .digest("hex")
      .slice(0, 16)}`;

    toInsert.push({
      name,
      email: stripQuotes(record["Email"] || "") || null,
      phone: hasPhone ? formatPhone(record["Phone"] || "") : null,
      customerType: mapType(record["Customer Type"] || ""),
      customerStatus: "Customer" as CrmCustomerStatus,
      fullAddress,
      leadSource,
      sourceSystem: "csv_import_2026_06_22",
      sourceId,
    });
  }

  console.log(
    `[Import CRM Customers] Eligible to insert: ${toInsert.length} | skipped — noName: ${noName}, noContact: ${noContact}, alreadyInCrm: ${alreadyInCrm}, dupInBatch: ${dupInBatch}`,
  );

  let created = 0;
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const inserted = await db.insert(crmCustomers).values(chunk).returning({ id: crmCustomers.id });
    created += inserted.length;
    console.log(`[Import CRM Customers] Inserted ${created}/${toInsert.length}`);
  }

  console.log(`[Import CRM Customers] Done: ${created} created`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[Import CRM Customers] Failed:", err);
    await pool.end();
    process.exit(1);
  });
