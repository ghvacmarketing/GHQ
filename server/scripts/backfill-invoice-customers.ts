import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { pool } from "../db";

interface InvoiceRow {
  Customer: string;
  "WO #": string;
  "Invoice #": string;
  [key: string]: string;
}

interface CrmCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

function normalizePhone(phone: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
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
  
  const firstWord = cleaned.split(/[\s,]+/)[0];
  if (firstWord && firstWord.length > 2) {
    variants.push(normalizeNameForMatching(firstWord));
  }
  
  return [...new Set(variants)].filter(v => v.length > 0);
}

function findBestMatch(
  csvCustomerName: string, 
  crmCustomers: CrmCustomer[]
): { customer: CrmCustomer; confidence: number } | null {
  const variants = generateNameVariants(csvCustomerName);
  
  let bestMatch: CrmCustomer | null = null;
  let bestConfidence = 0;
  
  for (const customer of crmCustomers) {
    const crmNameNorm = normalizeNameForMatching(customer.name);
    
    for (const variant of variants) {
      if (crmNameNorm === variant) {
        return { customer, confidence: 100 };
      }
      
      if (crmNameNorm.includes(variant) || variant.includes(crmNameNorm)) {
        const score = Math.min(variant.length, crmNameNorm.length) / 
                      Math.max(variant.length, crmNameNorm.length) * 80;
        if (score > bestConfidence) {
          bestConfidence = score;
          bestMatch = customer;
        }
      }
      
      const variantWords = variant.split(' ').filter(w => w.length > 2);
      const crmWords = crmNameNorm.split(' ').filter(w => w.length > 2);
      const matchingWords = variantWords.filter(w => crmWords.includes(w));
      if (matchingWords.length >= 2) {
        const score = (matchingWords.length / Math.max(variantWords.length, crmWords.length)) * 70;
        if (score > bestConfidence) {
          bestConfidence = score;
          bestMatch = customer;
        }
      }
    }
  }
  
  if (bestMatch && bestConfidence >= 50) {
    return { customer: bestMatch, confidence: bestConfidence };
  }
  
  return null;
}

export async function backfillInvoiceCustomers(
  csvPath: string,
  dryRun: boolean = false
): Promise<{
  total: number;
  matched: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  console.log(`[Backfill] Starting invoice customer backfill (dry-run: ${dryRun})`);
  console.log(`[Backfill] Reading CSV: ${csvPath}`);
  
  const fileContent = readFileSync(csvPath, "utf-8");
  const records: InvoiceRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  
  console.log(`[Backfill] Parsed ${records.length} invoice records from CSV`);
  
  const invoiceToCustomer = new Map<string, string>();
  for (const row of records) {
    const invoiceNum = row["Invoice #"]?.trim();
    const customerName = row.Customer?.trim();
    if (invoiceNum && customerName) {
      invoiceToCustomer.set(invoiceNum.toLowerCase(), customerName);
    }
  }
  
  console.log(`[Backfill] Built mapping for ${invoiceToCustomer.size} invoices`);
  
  const client = await pool.connect();
  
  try {
    const crmResult = await client.query(
      `SELECT id, name, phone, email FROM crm_customers`
    );
    const crmCustomers: CrmCustomer[] = crmResult.rows;
    console.log(`[Backfill] Loaded ${crmCustomers.length} CRM customers for matching`);
    
    const unlinkedResult = await client.query(
      `SELECT id, invoice_number, field_edge_wo_number 
       FROM crm_invoices 
       WHERE customer_id IS NULL`
    );
    
    console.log(`[Backfill] Found ${unlinkedResult.rows.length} unlinked invoices`);
    
    let matched = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    const customerMatchCache = new Map<string, { customer: CrmCustomer; confidence: number } | null>();
    
    for (const invoice of unlinkedResult.rows) {
      const invoiceNum = (invoice.invoice_number || '').toLowerCase();
      const csvCustomerName = invoiceToCustomer.get(invoiceNum);
      
      if (!csvCustomerName) {
        skipped++;
        continue;
      }
      
      let matchResult = customerMatchCache.get(csvCustomerName);
      if (matchResult === undefined) {
        matchResult = findBestMatch(csvCustomerName, crmCustomers);
        customerMatchCache.set(csvCustomerName, matchResult);
      }
      
      if (matchResult) {
        matched++;
        
        if (!dryRun) {
          try {
            const propResult = await client.query(
              `SELECT id FROM crm_properties WHERE customer_id = $1 LIMIT 1`,
              [matchResult.customer.id]
            );
            const propertyId = propResult.rows[0]?.id || null;
            
            await client.query(
              `UPDATE crm_invoices 
               SET customer_id = $1, property_id = $2, updated_at = NOW()
               WHERE id = $3`,
              [matchResult.customer.id, propertyId, invoice.id]
            );
            updated++;
          } catch (err: any) {
            errors.push(`Invoice ${invoiceNum}: ${err.message}`);
          }
        } else {
          updated++;
        }
      } else {
        skipped++;
      }
      
      if ((matched + skipped) % 1000 === 0) {
        console.log(`[Backfill] Progress: ${matched} matched, ${skipped} skipped`);
      }
    }
    
    console.log(`[Backfill] Complete: ${matched} matched, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);
    
    return {
      total: unlinkedResult.rows.length,
      matched,
      updated,
      skipped,
      errors
    };
  } finally {
    client.release();
  }
}

export async function backfillWorkOrderCustomers(
  csvPath: string,
  dryRun: boolean = false
): Promise<{
  total: number;
  matched: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  console.log(`[Backfill] Starting work order customer backfill (dry-run: ${dryRun})`);
  console.log(`[Backfill] Reading CSV: ${csvPath}`);
  
  const fileContent = readFileSync(csvPath, "utf-8");
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  
  console.log(`[Backfill] Parsed ${records.length} work order records from CSV`);
  
  const woToCustomer = new Map<string, string>();
  for (const row of records) {
    const woNum = row["WO#"]?.trim();
    const customerName = row.Customer?.trim();
    if (woNum && customerName) {
      woToCustomer.set(woNum, customerName);
    }
  }
  
  console.log(`[Backfill] Built mapping for ${woToCustomer.size} work orders`);
  
  const client = await pool.connect();
  
  try {
    const crmResult = await client.query(
      `SELECT id, name, phone, email FROM crm_customers`
    );
    const crmCustomers: CrmCustomer[] = crmResult.rows;
    console.log(`[Backfill] Loaded ${crmCustomers.length} CRM customers for matching`);
    
    const unlinkedResult = await client.query(
      `SELECT id, field_edge_wo_number 
       FROM crm_work_orders 
       WHERE customer_id IS NULL AND field_edge_wo_number IS NOT NULL`
    );
    
    console.log(`[Backfill] Found ${unlinkedResult.rows.length} unlinked work orders`);
    
    let matched = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    const customerMatchCache = new Map<string, { customer: CrmCustomer; confidence: number } | null>();
    
    for (const wo of unlinkedResult.rows) {
      const woNum = wo.field_edge_wo_number;
      const csvCustomerName = woToCustomer.get(woNum);
      
      if (!csvCustomerName) {
        skipped++;
        continue;
      }
      
      let matchResult = customerMatchCache.get(csvCustomerName);
      if (matchResult === undefined) {
        matchResult = findBestMatch(csvCustomerName, crmCustomers);
        customerMatchCache.set(csvCustomerName, matchResult);
      }
      
      if (matchResult) {
        matched++;
        
        if (!dryRun) {
          try {
            const propResult = await client.query(
              `SELECT id FROM crm_properties WHERE customer_id = $1 LIMIT 1`,
              [matchResult.customer.id]
            );
            const propertyId = propResult.rows[0]?.id || null;
            
            await client.query(
              `UPDATE crm_work_orders 
               SET customer_id = $1, property_id = $2, updated_at = NOW()
               WHERE id = $3`,
              [matchResult.customer.id, propertyId, wo.id]
            );
            updated++;
          } catch (err: any) {
            errors.push(`WO ${woNum}: ${err.message}`);
          }
        } else {
          updated++;
        }
      } else {
        skipped++;
      }
      
      if ((matched + skipped) % 1000 === 0) {
        console.log(`[Backfill] Progress: ${matched} matched, ${skipped} skipped`);
      }
    }
    
    console.log(`[Backfill] Complete: ${matched} matched, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);
    
    return {
      total: unlinkedResult.rows.length,
      matched,
      updated,
      skipped,
      errors
    };
  } finally {
    client.release();
  }
}

const dryRun = process.argv.includes('--dry-run');
const invoiceCsv = 'attached_assets/Invoices_2026-01-11_1768098863640.csv';
const woCsv = 'attached_assets/Work_Orders_2026-01-11_1768098866873.csv';

(async () => {
  try {
    console.log('=== Work Order Backfill ===');
    const woResult = await backfillWorkOrderCustomers(woCsv, dryRun);
    console.log('Work Order Results:', woResult);
    
    console.log('\n=== Invoice Backfill ===');
    const invResult = await backfillInvoiceCustomers(invoiceCsv, dryRun);
    console.log('Invoice Results:', invResult);
    
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
})();
