import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { pool } from "../db";

interface CrmCustomer {
  id: string;
  name: string;
}

function normalizeNameForMatching(name: string): string {
  return name
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function reverseCommaSeparatedName(name: string): string {
  const cleaned = name.replace(/^["']+|["']+$/g, '').trim();
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map(p => p.trim());
    if (parts.length >= 2 && parts[1]) {
      return `${parts[1]} ${parts[0]}`.trim();
    }
  }
  return cleaned;
}

function generateNameVariants(rawName: string): string[] {
  const variants: string[] = [];
  const cleaned = rawName.replace(/^["']+|["']+$/g, '').trim();
  variants.push(normalizeNameForMatching(cleaned));
  const reversed = reverseCommaSeparatedName(rawName);
  variants.push(normalizeNameForMatching(reversed));
  const withoutAnd = cleaned.replace(/\s*&\s*/g, ' and ');
  variants.push(normalizeNameForMatching(withoutAnd));
  const andToAmpersand = cleaned.replace(/\s+and\s+/gi, ' & ');
  variants.push(normalizeNameForMatching(andToAmpersand));
  return [...new Set(variants)].filter(v => v.length > 0);
}

async function main() {
  console.log('[Batch Backfill] Starting...');
  
  const invoiceCsv = 'attached_assets/Invoices_2026-01-11_1768098863640.csv';
  const woCsv = 'attached_assets/Work_Orders_2026-01-11_1768098866873.csv';
  
  const invoiceContent = readFileSync(invoiceCsv, "utf-8");
  const invoiceRecords = parse(invoiceContent, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  
  const woContent = readFileSync(woCsv, "utf-8");
  const woRecords = parse(woContent, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  
  const invoiceToCustomer = new Map<string, string>();
  for (const row of invoiceRecords) {
    const num = row["Invoice #"]?.trim();
    const name = row.Customer?.trim();
    if (num && name) invoiceToCustomer.set(num.toLowerCase(), name);
  }
  
  const woToCustomer = new Map<string, string>();
  for (const row of woRecords) {
    const num = row["WO#"]?.trim();
    const name = row.Customer?.trim();
    if (num && name) woToCustomer.set(num, name);
  }
  
  console.log(`[Batch Backfill] Invoice mapping: ${invoiceToCustomer.size}, WO mapping: ${woToCustomer.size}`);
  
  const client = await pool.connect();
  
  try {
    const crmResult = await client.query(`SELECT id, name FROM crm_customers`);
    const customers: CrmCustomer[] = crmResult.rows;
    console.log(`[Batch Backfill] Loaded ${customers.length} CRM customers`);
    
    const customerByNormName = new Map<string, string>();
    for (const c of customers) {
      const norm = normalizeNameForMatching(c.name);
      if (!customerByNormName.has(norm)) customerByNormName.set(norm, c.id);
    }
    
    const csvNameToCustomerId = new Map<string, string>();
    const allCsvNames = new Set([...invoiceToCustomer.values(), ...woToCustomer.values()]);
    
    console.log(`[Batch Backfill] Matching ${allCsvNames.size} unique customer names...`);
    
    for (const csvName of allCsvNames) {
      const variants = generateNameVariants(csvName);
      for (const v of variants) {
        const customerId = customerByNormName.get(v);
        if (customerId) {
          csvNameToCustomerId.set(csvName, customerId);
          break;
        }
      }
      if (!csvNameToCustomerId.has(csvName)) {
        for (const v of variants) {
          for (const [norm, id] of customerByNormName) {
            if (norm.includes(v) || v.includes(norm)) {
              csvNameToCustomerId.set(csvName, id);
              break;
            }
          }
          if (csvNameToCustomerId.has(csvName)) break;
        }
      }
    }
    
    console.log(`[Batch Backfill] Matched ${csvNameToCustomerId.size}/${allCsvNames.size} customer names`);
    
    console.log('[Batch Backfill] Updating work orders...');
    const woResult = await client.query(
      `SELECT id, field_edge_wo_number FROM crm_work_orders WHERE customer_id IS NULL AND field_edge_wo_number IS NOT NULL`
    );
    
    let woUpdated = 0;
    for (const wo of woResult.rows) {
      const csvName = woToCustomer.get(wo.field_edge_wo_number);
      if (!csvName) continue;
      const customerId = csvNameToCustomerId.get(csvName);
      if (!customerId) continue;
      
      await client.query(
        `UPDATE crm_work_orders SET customer_id = $1, updated_at = NOW() WHERE id = $2`,
        [customerId, wo.id]
      );
      woUpdated++;
    }
    console.log(`[Batch Backfill] Updated ${woUpdated} work orders`);
    
    console.log('[Batch Backfill] Updating invoices...');
    const invResult = await client.query(
      `SELECT id, invoice_number FROM crm_invoices WHERE customer_id IS NULL`
    );
    
    let invUpdated = 0;
    for (const inv of invResult.rows) {
      const csvName = invoiceToCustomer.get(inv.invoice_number?.toLowerCase());
      if (!csvName) continue;
      const customerId = csvNameToCustomerId.get(csvName);
      if (!customerId) continue;
      
      await client.query(
        `UPDATE crm_invoices SET customer_id = $1, updated_at = NOW() WHERE id = $2`,
        [customerId, inv.id]
      );
      invUpdated++;
      
      if (invUpdated % 500 === 0) {
        console.log(`[Batch Backfill] Invoice progress: ${invUpdated}`);
      }
    }
    console.log(`[Batch Backfill] Updated ${invUpdated} invoices`);
    
    console.log('[Batch Backfill] Complete!');
  } finally {
    client.release();
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
