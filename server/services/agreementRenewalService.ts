import { db } from "../db";
import { crmAgreements, crmInvoices, crmInvoiceLineItems, crmCustomers, invoiceEmailLogs, type CrmAgreement, type CrmInvoice, type CrmInvoiceLineItem } from "@shared/schema";
import { eq, and, sql, lte, isNotNull } from "drizzle-orm";
import { sendCrmInvoiceEmail } from "./crmInvoiceEmail";
import { toZonedTime, format } from "date-fns-tz";
import { addYears, addMonths, addWeeks } from "date-fns";

const APP_TIMEZONE = "America/New_York";

interface RenewalResult {
  agreementId: string;
  agreementNumber: string;
  customerName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  emailSent: boolean;
  error?: string;
}

export interface DailyRenewalSummary {
  processedAt: Date;
  agreementsProcessed: number;
  invoicesCreated: number;
  emailsSent: number;
  errors: number;
  results: RenewalResult[];
}

function getNextInvoiceDate(currentDate: Date, frequency: string): Date {
  switch (frequency) {
    case "weekly":
      return addWeeks(currentDate, 1);
    case "monthly":
      return addMonths(currentDate, 1);
    case "annual":
    default:
      return addYears(currentDate, 1);
  }
}

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(crmInvoices);
  const count = (result[0]?.count || 0) + 1;
  return `INV-${year}-${String(count).padStart(5, "0")}`;
}

export async function processSingleAgreementRenewal(agreement: CrmAgreement): Promise<RenewalResult> {
  const result: RenewalResult = {
    agreementId: agreement.id,
    agreementNumber: agreement.agreementNumber,
    customerName: agreement.customerName,
    emailSent: false,
  };

  try {
    let customerEmail: string | null = null;
    
    if (agreement.customerId) {
      const customer = await db
        .select({ email: crmCustomers.email, name: crmCustomers.name })
        .from(crmCustomers)
        .where(eq(crmCustomers.id, agreement.customerId))
        .limit(1);
      
      if (customer[0]?.email) {
        customerEmail = customer[0].email;
      }
    }

    const invoiceNumber = await generateInvoiceNumber();
    const price = agreement.price || "0";
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const [invoice] = await db.insert(crmInvoices).values({
      invoiceNumber,
      customerId: agreement.customerId,
      propertyId: agreement.propertyId,
      status: "sent",
      subtotal: price,
      laborTotal: "0",
      total: price,
      amountPaid: "0",
      balanceDue: price,
      dueDate,
      sentAt: new Date(),
      notes: `Annual renewal invoice for ${agreement.agreementPlan} - Agreement #${agreement.agreementNumber}`,
    }).returning();

    result.invoiceId = invoice.id;
    result.invoiceNumber = invoice.invoiceNumber;

    const lineItemDescription = `${agreement.agreementPlan} - Annual Renewal (${agreement.numberOfSystems} system${agreement.numberOfSystems > 1 ? "s" : ""})`;
    
    await db.insert(crmInvoiceLineItems).values({
      invoiceId: invoice.id,
      lineType: "service",
      description: lineItemDescription,
      quantity: "1",
      unitPrice: price,
      lineTotal: price,
      sortOrder: 0,
    });

    const lineItems: CrmInvoiceLineItem[] = [{
      id: "temp",
      invoiceId: invoice.id,
      lineType: "service",
      description: lineItemDescription,
      partNumber: null,
      quantity: "1",
      unitPrice: price,
      lineTotal: price,
      sortOrder: 0,
      itemId: null,
      isDiscountLine: false,
      discountKind: null,
      createdAt: new Date(),
    }];

    if (customerEmail) {
      const emailResult = await sendCrmInvoiceEmail(
        invoice,
        lineItems,
        customerEmail,
        agreement.customerName,
        `Your ${agreement.agreementPlan} agreement is due for renewal. This invoice covers your continued service for the next year.`,
        "System (Auto-Renewal)"
      );

      if (emailResult.success) {
        result.emailSent = true;
        
        await db.insert(invoiceEmailLogs).values({
          invoiceId: invoice.id,
          direction: "outgoing",
          fromEmail: emailResult.fromEmail || "invoices@ghvacinc.com",
          recipientEmail: customerEmail,
          recipientName: agreement.customerName,
          subject: emailResult.subject || `Your Invoice from Giesbrecht HVAC - ${invoiceNumber}`,
          htmlContent: emailResult.htmlContent,
          textContent: emailResult.textContent,
          status: "sent",
          sentBy: "system-auto-renewal",
          sentAt: new Date(),
        });
      } else {
        console.error(`[AgreementRenewal] Failed to send email for agreement ${agreement.agreementNumber}:`, emailResult.error);
      }
    } else {
      console.log(`[AgreementRenewal] No email on file for agreement ${agreement.agreementNumber} - invoice created but not emailed`);
    }

    const currentNextInvoiceDate = agreement.nextInvoiceDate ? new Date(agreement.nextInvoiceDate) : new Date();
    const newNextInvoiceDate = getNextInvoiceDate(currentNextInvoiceDate, agreement.frequency);
    
    await db.update(crmAgreements)
      .set({
        nextInvoiceDate: format(newNextInvoiceDate, "yyyy-MM-dd"),
        updatedAt: new Date(),
      })
      .where(eq(crmAgreements.id, agreement.id));

    console.log(`[AgreementRenewal] Processed agreement ${agreement.agreementNumber}: Invoice ${invoiceNumber} created, next invoice date: ${format(newNextInvoiceDate, "yyyy-MM-dd")}`);
    
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error";
    console.error(`[AgreementRenewal] Error processing agreement ${agreement.agreementNumber}:`, err);
    return result;
  }
}

export async function processAgreementRenewals(): Promise<DailyRenewalSummary> {
  const summary: DailyRenewalSummary = {
    processedAt: new Date(),
    agreementsProcessed: 0,
    invoicesCreated: 0,
    emailsSent: 0,
    errors: 0,
    results: [],
  };

  try {
    const today = format(toZonedTime(new Date(), APP_TIMEZONE), "yyyy-MM-dd");
    console.log(`[AgreementRenewal] Processing renewals for date: ${today}`);

    const dueAgreements = await db
      .select()
      .from(crmAgreements)
      .where(
        and(
          eq(crmAgreements.status, "active"),
          eq(crmAgreements.autoRenew, true),
          isNotNull(crmAgreements.nextInvoiceDate),
          lte(crmAgreements.nextInvoiceDate, today)
        )
      );

    console.log(`[AgreementRenewal] Found ${dueAgreements.length} agreements due for renewal`);

    for (const agreement of dueAgreements) {
      const result = await processSingleAgreementRenewal(agreement);
      summary.results.push(result);
      summary.agreementsProcessed++;
      
      if (result.invoiceId) {
        summary.invoicesCreated++;
      }
      if (result.emailSent) {
        summary.emailsSent++;
      }
      if (result.error) {
        summary.errors++;
      }
    }

    console.log(`[AgreementRenewal] Summary: ${summary.agreementsProcessed} processed, ${summary.invoicesCreated} invoices created, ${summary.emailsSent} emails sent, ${summary.errors} errors`);
    
    return summary;
  } catch (err) {
    console.error("[AgreementRenewal] Fatal error during renewal processing:", err);
    throw err;
  }
}

let renewalInterval: NodeJS.Timeout | null = null;

export function scheduleAgreementRenewals(): void {
  processAgreementRenewals().catch(err => {
    console.error("[AgreementRenewal] Error in initial run:", err);
  });

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  renewalInterval = setInterval(() => {
    processAgreementRenewals().catch(err => {
      console.error("[AgreementRenewal] Error in scheduled run:", err);
    });
  }, TWENTY_FOUR_HOURS);

  console.log("[AgreementRenewal] Daily renewal job scheduled (runs every 24 hours)");
}

export function stopAgreementRenewals(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
    console.log("[AgreementRenewal] Scheduled job stopped");
  }
}
