import { db } from "../server/db";
import { crmCustomers, crmProperties } from "../shared/schema";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

interface CsvRow {
  "Display Name": string;
  "Customer Type": string;
  "Full Address": string;
  "Phone": string;
  "Email": string;
  "Lead Source": string;
}

function parseAddress(fullAddress: string): { address1: string; city: string; state: string; zip: string } {
  if (!fullAddress || fullAddress.trim() === "-") {
    return { address1: "", city: "", state: "", zip: "" };
  }

  const parts = fullAddress.split(" - ");
  const address1 = parts[0]?.trim() || "";
  const cityStateZip = parts[1]?.trim() || "";

  const stateZipMatch = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
  if (stateZipMatch) {
    return {
      address1,
      city: stateZipMatch[1]?.trim() || "",
      state: stateZipMatch[2]?.toUpperCase() || "",
      zip: stateZipMatch[3] || "",
    };
  }

  return { address1, city: cityStateZip, state: "", zip: "" };
}

function cleanPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return phone;
}

function cleanName(name: string): string {
  return name.replace(/^"|"$/g, "").replace(/""/g, '"').trim();
}

async function importCustomers() {
  console.log("Starting CRM customer import (batch mode)...");

  const csvPath = "./attached_assets/Customers_2025-12-27_1766879795675.csv";
  const csvContent = readFileSync(csvPath, "utf-8");

  const records: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  console.log(`Found ${records.length} records in CSV`);

  const seenNames = new Set<string>();
  const customerBatch: { name: string; email: string | null; phone: string | null; notes: string | null; addressParts: ReturnType<typeof parseAddress> }[] = [];

  for (const row of records) {
    const name = cleanName(row["Display Name"]);
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);

    const email = row["Email"]?.trim() || null;
    const phone = cleanPhone(row["Phone"]) || null;
    const customerType = row["Customer Type"]?.trim() || null;
    const leadSource = row["Lead Source"]?.trim() || null;
    const addressParts = parseAddress(row["Full Address"]);

    customerBatch.push({
      name,
      email,
      phone,
      notes: [customerType, leadSource].filter(Boolean).join(" | ") || null,
      addressParts,
    });
  }

  console.log(`Unique customers to import: ${customerBatch.length}`);

  const BATCH_SIZE = 100;
  let imported = 0;

  for (let i = 0; i < customerBatch.length; i += BATCH_SIZE) {
    const batch = customerBatch.slice(i, i + BATCH_SIZE);

    const customers = await db
      .insert(crmCustomers)
      .values(batch.map(c => ({ name: c.name, email: c.email, phone: c.phone, notes: c.notes })))
      .onConflictDoNothing()
      .returning();

    const propertyInserts = customers
      .map((cust, idx) => {
        const addr = batch[idx].addressParts;
        if (addr.address1) {
          return { customerId: cust.id, address1: addr.address1, city: addr.city, state: addr.state, zip: addr.zip };
        }
        return null;
      })
      .filter(Boolean) as { customerId: string; address1: string; city: string; state: string; zip: string }[];

    if (propertyInserts.length > 0) {
      await db.insert(crmProperties).values(propertyInserts).onConflictDoNothing();
    }

    imported += customers.length;
    console.log(`Imported ${imported} customers...`);
  }

  console.log("\n=== Import Complete ===");
  console.log(`Total imported: ${imported}`);
}

importCustomers()
  .then(() => {
    console.log("Import finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
  });
