import { db } from "../server/db";
import { crmCustomers } from "../shared/schema";
import * as fs from "fs";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";

async function importCustomers() {
  const csvPath = "./attached_assets/Customers_2025-12-29_1767049469179.csv";
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relaxQuotes: true,
    relaxColumnCount: true,
  });

  console.log(`Found ${records.length} records to import`);
  
  const batchSize = 500;
  let imported = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    const values = batch.map((record: any) => {
      const displayName = record["Display Name"]?.replace(/^"|"$/g, '').trim() || "";
      const customerType = record["Customer Type"]?.trim() || null;
      const fullAddress = record["Full Address"]?.trim() || null;
      const phone = record["Phone"]?.trim() || null;
      const email = record["Email"]?.trim() || null;
      const leadSource = record["Lead Source"]?.trim() || null;
      const customerStatus = record["Customer Status"]?.trim() || "Customer";
      
      return {
        id: uuidv4(),
        name: displayName,
        customerType: customerType || null,
        customerStatus: customerStatus,
        phone: phone || null,
        email: email || null,
        fullAddress: fullAddress || null,
        leadSource: leadSource || null,
        createdAt: new Date(),
      };
    });
    
    await db.insert(crmCustomers).values(values);
    imported += batch.length;
    console.log(`Imported ${imported}/${records.length} customers...`);
  }
  
  console.log(`\nImport complete! Total: ${imported} customers`);
  process.exit(0);
}

importCustomers().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
