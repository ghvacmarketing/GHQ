import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { db, pool } from "../db";
import { crmCustomers, crmWorkOrders, crmInvoices, crmProperties } from "@shared/schema";
import { eq, ilike, or, sql, isNull as drizzleIsNull } from "drizzle-orm";
import type { WorkOrderVisitType, BillingDisposition, CrmInvoiceStatus } from "@shared/schema";

interface WorkOrderRow {
  Customer: string;
  "WO#": string;
  "Purchase Order": string;
  Invoice: string;
  Quote: string;
  Task: string;
  Status: string;
  "Appointment Date": string;
  "Scheduled Date": string;
  Technician: string;
}

interface InvoiceRow {
  Customer: string;
  "WO #": string;
  "PO #": string;
  "Invoice #": string;
  Date: string;
  "Due Date": string;
  Total: string;
  Balance: string;
  "Invoice Pay Status": string;
  Salesperson: string;
  Printed: string;
  Emailed: string;
}

function cleanCustomerName(name: string): string {
  return name
    .replace(/^["]+|["]+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();
}

function parseFieldEdgeDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === "") return null;
  
  const parts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (parts) {
    let [, year, month, day, hour, minute, ampm] = parts;
    let hourNum = parseInt(hour);
    if (ampm?.toUpperCase() === "PM" && hourNum < 12) hourNum += 12;
    if (ampm?.toUpperCase() === "AM" && hourNum === 12) hourNum = 0;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hourNum, parseInt(minute));
  }
  
  const simple = new Date(dateStr);
  return isNaN(simple.getTime()) ? null : simple;
}

function mapTaskToVisitType(task: string): { visitType: WorkOrderVisitType; workSubtype: string } {
  const taskLower = task.toLowerCase();
  
  if (taskLower.includes("tune-up") || taskLower.includes("maintenance")) {
    return { visitType: "MAINTENANCE", workSubtype: task };
  }
  if (taskLower.includes("install") || taskLower.includes("change-out") || taskLower.includes("new construction") || taskLower.includes("trim-out")) {
    return { visitType: "INSTALL", workSubtype: task };
  }
  if (taskLower.includes("sales") || taskLower.includes("proposal") || taskLower.includes("consultation") || taskLower.includes("video presentation")) {
    return { visitType: "SALES", workSubtype: task };
  }
  return { visitType: "SERVICE", workSubtype: task };
}

function mapInvoiceStatus(fieldEdgeStatus: string): "draft" | "sent" | "paid" | "void" {
  const status = fieldEdgeStatus.toUpperCase();
  if (status === "PAID") return "paid";
  if (status === "OVERDUE") return "sent";
  if (status === "NON-BILLABLE") return "void";
  return "sent";
}

async function findCustomerByNameWithClient(
  client: any, 
  customerName: string
): Promise<{ customerId: string | null; propertyId: string | null }> {
  const cleanName = cleanCustomerName(customerName);
  
  const customerResult = await client.query(
    `SELECT id, name FROM crm_customers 
     WHERE name ILIKE $1 OR name ILIKE $2 
     LIMIT 5`,
    [`%${cleanName}%`, `%${cleanName.split(" ")[0]}%`]
  );
  
  if (customerResult.rows.length === 0) {
    return { customerId: null, propertyId: null };
  }
  
  let bestMatch = customerResult.rows[0];
  let bestScore = 0;
  
  for (const customer of customerResult.rows) {
    const displayName = (customer.name || "").toLowerCase();
    const searchName = cleanName.toLowerCase();
    
    if (displayName === searchName) {
      bestMatch = customer;
      bestScore = 100;
      break;
    }
    
    const score = displayName.includes(searchName) ? 50 : 
                  searchName.includes(displayName) ? 40 : 0;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = customer;
    }
  }
  
  let propertyId: string | null = null;
  if (bestMatch.id) {
    const propResult = await client.query(
      `SELECT id FROM crm_properties WHERE customer_id = $1 LIMIT 1`,
      [bestMatch.id]
    );
    
    if (propResult.rows.length > 0) {
      propertyId = propResult.rows[0].id;
    }
  }
  
  return { customerId: bestMatch.id, propertyId };
}

export async function importFieldEdgeWorkOrders(csvPath: string): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const fileContent = readFileSync(csvPath, "utf-8");
  const records: WorkOrderRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const customerCache = new Map<string, { customerId: string | null; propertyId: string | null }>();
  
  console.log(`[FieldEdge Import] Starting work order import of ${records.length} records`);
  
  const client = await pool.connect();
  
  try {
    const existingWoNumbers = new Set<string>();
    const existingWosResult = await client.query(
      `SELECT field_edge_wo_number FROM crm_work_orders WHERE field_edge_wo_number IS NOT NULL`
    );
    existingWosResult.rows.forEach((wo: any) => {
      if (wo.field_edge_wo_number) existingWoNumbers.add(wo.field_edge_wo_number);
    });
    
    let nextWorkOrderNumber = 100000;
    const maxWoResult = await client.query(`SELECT MAX(work_order_number) as max FROM crm_work_orders`);
    if (maxWoResult.rows[0]?.max) {
      nextWorkOrderNumber = parseInt(maxWoResult.rows[0].max) + 1;
    }
    
    for (const row of records) {
      try {
        const woNumber = row["WO#"]?.trim();
        
        if (!woNumber || woNumber === "") {
          skipped++;
          continue;
        }
        
        if (existingWoNumbers.has(woNumber)) {
          skipped++;
          continue;
        }
        
        const customerName = row.Customer;
        let customerData = customerCache.get(customerName);
        if (!customerData) {
          customerData = await findCustomerByNameWithClient(client, customerName);
          customerCache.set(customerName, customerData);
        }
        
        const { visitType, workSubtype } = mapTaskToVisitType(row.Task || "Service Call");
        const scheduledDate = parseFieldEdgeDate(row["Scheduled Date"] || row["Appointment Date"]);
        const billingDisp = row.Invoice ? "invoice_created" : "no_charge";
        
        await client.query(
          `INSERT INTO crm_work_orders (
            customer_id, property_id, work_order_number, visit_type, work_subtype,
            title, status, scheduled_start, completed_at, is_historical, field_edge_wo_number,
            billing_disposition
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            customerData.customerId, customerData.propertyId, nextWorkOrderNumber++,
            visitType, workSubtype, row.Task || "Historical Work Order", "completed",
            scheduledDate, scheduledDate, true, woNumber, billingDisp
          ]
        );
        
        existingWoNumbers.add(woNumber);
        imported++;
        
        if (imported % 500 === 0) {
          console.log(`[FieldEdge Import] Work orders progress: ${imported} imported, ${skipped} skipped`);
        }
      } catch (err: any) {
        errors.push(`WO ${row["WO#"]}: ${err.message}`);
        if (errors.length <= 10) {
          console.error(`[FieldEdge Import] Error importing WO ${row["WO#"]}:`, err.message);
        }
      }
    }
  } finally {
    client.release();
  }
  
  console.log(`[FieldEdge Import] Work order import complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
  
  return { imported, skipped, errors };
}

export async function importFieldEdgeInvoices(csvPath: string): Promise<{
  imported: number;
  skipped: number;
  linked: number;
  errors: string[];
}> {
  const fileContent = readFileSync(csvPath, "utf-8");
  const records: InvoiceRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  
  let imported = 0;
  let skipped = 0;
  let linked = 0;
  const errors: string[] = [];
  const customerCache = new Map<string, { customerId: string | null; propertyId: string | null }>();
  
  console.log(`[FieldEdge Import] Starting invoice import of ${records.length} records`);
  
  const client = await pool.connect();
  
  try {
    const existingInvoiceNumbers = new Set<string>();
    const existingInvResult = await client.query(
      `SELECT field_edge_invoice_number FROM crm_invoices WHERE field_edge_invoice_number IS NOT NULL`
    );
    existingInvResult.rows.forEach((inv: any) => {
      if (inv.field_edge_invoice_number) existingInvoiceNumbers.add(inv.field_edge_invoice_number);
    });
    
    const workOrderMap = new Map<string, string>();
    const woResult = await client.query(
      `SELECT id, field_edge_wo_number FROM crm_work_orders WHERE is_historical = true AND field_edge_wo_number IS NOT NULL`
    );
    woResult.rows.forEach((wo: any) => {
      if (wo.field_edge_wo_number) workOrderMap.set(wo.field_edge_wo_number, wo.id);
    });
    
    for (const row of records) {
      try {
        const invoiceNumber = row["Invoice #"]?.trim();
        
        if (!invoiceNumber || invoiceNumber === "") {
          skipped++;
          continue;
        }
        
        if (existingInvoiceNumbers.has(invoiceNumber)) {
          skipped++;
          continue;
        }
        
        const customerName = row.Customer;
        let customerData = customerCache.get(customerName);
        if (!customerData) {
          customerData = await findCustomerByNameWithClient(client, customerName);
          customerCache.set(customerName, customerData);
        }
        
        const woNumber = row["WO #"]?.trim();
        const workOrderId = woNumber ? workOrderMap.get(woNumber) : null;
        
        const invoiceDate = parseFieldEdgeDate(row.Date);
        const dueDate = parseFieldEdgeDate(row["Due Date"]);
        const total = parseFloat(row.Total?.replace(/[,$]/g, "") || "0");
        const balance = parseFloat(row.Balance?.replace(/[,$]/g, "") || "0");
        const amountPaid = total - balance;
        
        const status = mapInvoiceStatus(row["Invoice Pay Status"] || "OVERDUE");
        const paidAt = status === "paid" ? invoiceDate : null;
        const notes = `Imported from FieldEdge. Original status: ${row["Invoice Pay Status"]}. Salesperson: ${row.Salesperson || "N/A"}`;
        
        await client.query(
          `INSERT INTO crm_invoices (
            invoice_number, customer_id, property_id, work_order_id, status,
            subtotal, total, balance_due, amount_paid, due_date, sent_at, paid_at,
            is_historical, field_edge_invoice_number, field_edge_wo_number, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            invoiceNumber, customerData.customerId, customerData.propertyId, workOrderId, status,
            total.toFixed(2), total.toFixed(2), balance.toFixed(2), amountPaid.toFixed(2), dueDate, invoiceDate, paidAt,
            true, invoiceNumber, woNumber || null, notes
          ]
        );
        
        existingInvoiceNumbers.add(invoiceNumber);
        imported++;
        
        if (workOrderId) {
          linked++;
          await client.query(
            `UPDATE crm_work_orders SET invoice_id = $1 WHERE id = $2`,
            [invoiceNumber, workOrderId]
          );
        }
        
        if (imported % 500 === 0) {
          console.log(`[FieldEdge Import] Invoice progress: ${imported} imported, ${linked} linked, ${skipped} skipped`);
        }
      } catch (err: any) {
        errors.push(`Invoice ${row["Invoice #"]}: ${err.message}`);
        if (errors.length <= 10) {
          console.error(`[FieldEdge Import] Error importing Invoice ${row["Invoice #"]}:`, err.message);
        }
      }
    }
  } finally {
    client.release();
  }
  
  console.log(`[FieldEdge Import] Invoice import complete: ${imported} imported, ${linked} linked to WOs, ${skipped} skipped, ${errors.length} errors`);
  
  return { imported, skipped, linked, errors };
}

export async function runFullFieldEdgeImport(): Promise<{
  workOrders: { imported: number; skipped: number; errors: string[] };
  invoices: { imported: number; skipped: number; linked: number; errors: string[] };
}> {
  console.log("[FieldEdge Import] Starting full import...");
  
  const workOrderResult = await importFieldEdgeWorkOrders("attached_assets/Work_Orders_2026-01-11_1768098866873.csv");
  
  const invoiceResult = await importFieldEdgeInvoices("attached_assets/Invoices_2026-01-11_1768098863640.csv");
  
  console.log("[FieldEdge Import] Full import complete!");
  console.log(`  Work Orders: ${workOrderResult.imported} imported, ${workOrderResult.skipped} skipped`);
  console.log(`  Invoices: ${invoiceResult.imported} imported, ${invoiceResult.linked} linked, ${invoiceResult.skipped} skipped`);
  
  return {
    workOrders: workOrderResult,
    invoices: invoiceResult,
  };
}
