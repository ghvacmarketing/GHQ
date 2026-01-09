import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { crmInvoices, crmInvoiceLineItems, crmQuotes, crmAgreements, maintenanceVisits } from '@shared/schema';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { autoSyncInvoice, autoSyncPayment } from './services/quickbooksService';

async function generateDepositInvoiceNumber(): Promise<string> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, "");
  const prefix = `DEP-${dateStr}-`;
  
  const todayInvoices = await db.select({ invoiceNumber: crmInvoices.invoiceNumber })
    .from(crmInvoices)
    .where(sql`${crmInvoices.invoiceNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(crmInvoices.invoiceNumber))
    .limit(1);
  
  let nextNum = 1;
  if (todayInvoices.length > 0) {
    const lastNum = parseInt(todayInvoices[0].invoiceNumber.slice(-3)) || 0;
    nextNum = lastNum + 1;
  }
  
  return `${prefix}${String(nextNum).padStart(3, "0")}`;
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // First, let the stripe-replit-sync library process the webhook
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Now, do our custom processing for invoice/quote payments
    try {
      const stripe = await getUncachableStripeClient();
      const event = JSON.parse(payload.toString());

      console.log(`Received webhook ${event.id}: ${event.type} for ${event.data?.object?.id || 'unknown'}`);

      // Handle checkout.session.completed for invoice and quote payments
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Check if payment was successful
        if (session.payment_status !== 'paid') {
          console.log(`[Webhook] Checkout session ${session.id} not paid, status: ${session.payment_status}`);
          return;
        }

        // Get the full session with line items and metadata from payment link
        let metadata = session.metadata || {};
        
        // If metadata is empty, try to get it from the payment link
        if (!metadata.type && session.payment_link) {
          try {
            const paymentLink = await stripe.paymentLinks.retrieve(session.payment_link as string);
            metadata = paymentLink.metadata || {};
          } catch (e) {
            console.log(`[Webhook] Could not retrieve payment link metadata:`, e);
          }
        }

        const paymentType = metadata.type;
        const paymentIntentId = typeof session.payment_intent === 'string' 
          ? session.payment_intent 
          : session.payment_intent?.id || null;

        console.log(`[Webhook] Processing checkout.session.completed - type: ${paymentType}, paymentIntent: ${paymentIntentId}`);

        // Handle invoice payments
        if (paymentType === 'invoice_payment' && metadata.invoiceId) {
          const invoiceId = metadata.invoiceId;
          console.log(`[Webhook] Processing invoice payment for invoice ${invoiceId}`);

          const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId));
          
          if (invoice && invoice.status !== 'paid') {
            const amountPaid = session.amount_total ? session.amount_total / 100 : parseFloat(invoice.balanceDue?.toString() || "0");
            const now = new Date();

            await db.update(crmInvoices)
              .set({
                status: 'paid',
                amountPaid: amountPaid.toFixed(2),
                balanceDue: "0.00",
                paidAt: now,
              })
              .where(eq(crmInvoices.id, invoiceId));

            console.log(`[Webhook] Invoice ${invoice.invoiceNumber} marked as paid - amount: $${amountPaid}`);

            // Check for linked maintenance agreement and activate if this is the initial invoice
            const [linkedAgreement] = await db.select()
              .from(crmAgreements)
              .where(eq(crmAgreements.initialInvoiceId, invoiceId))
              .limit(1);

            if (linkedAgreement && linkedAgreement.status === "pending" && linkedAgreement.isInitialCycle) {
              await db.update(crmAgreements)
                .set({
                  status: "active",
                  activationDate: now.toISOString().split('T')[0], // Date column expects YYYY-MM-DD string
                  isInitialCycle: false,
                  updatedAt: now
                })
                .where(eq(crmAgreements.id, linkedAgreement.id));

              console.log(`[Webhook] Activated maintenance agreement ${linkedAgreement.agreementNumber} after initial invoice payment`);

              // Cancel any pending visits and create new visits for the active cycle
              const pendingVisits = await db.select()
                .from(maintenanceVisits)
                .where(and(
                  eq(maintenanceVisits.agreementId, linkedAgreement.id),
                  eq(maintenanceVisits.status, "pending")
                ));

              if (pendingVisits.length > 0) {
                await db.update(maintenanceVisits)
                  .set({ status: "cancelled", updatedAt: now })
                  .where(inArray(maintenanceVisits.id, pendingVisits.map(v => v.id)));

                console.log(`[Webhook] Cancelled ${pendingVisits.length} pending visits for agreement ${linkedAgreement.agreementNumber}`);
              }
            }
          } else if (!invoice) {
            console.log(`[Webhook] Invoice ${invoiceId} not found`);
          } else {
            console.log(`[Webhook] Invoice ${invoice.invoiceNumber} already marked as paid`);
          }
        }

        // Handle quote deposit payments
        if (paymentType === 'quote_deposit' && metadata.quoteId) {
          const quoteId = metadata.quoteId;
          const selectedOption = metadata.selectedOption || null;
          console.log(`[Webhook] Processing quote deposit for quote ${quoteId}, selected option: ${selectedOption}`);

          const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, quoteId));
          
          if (quote) {
            const depositAmount = session.amount_total ? session.amount_total / 100 : 0;
            const now = new Date();

            // Auto-accept the quote when deposit is paid (signature was captured before payment)
            // Only auto-accept if quote has a signature (means they signed before paying)
            const shouldAutoAccept = quote.signatureImage && quote.signerName && quote.status !== 'accepted';

            await db.update(crmQuotes)
              .set({
                depositAmount: depositAmount.toFixed(2),
                depositPaidAt: now,
                selectedOption: selectedOption || quote.selectedOption,
                // Auto-accept if signature was already captured - set signedAt and acceptedAt now
                ...(shouldAutoAccept ? { 
                  status: 'accepted' as const,
                  signedAt: now,
                  acceptedAt: now,
                } : {}),
              })
              .where(eq(crmQuotes.id, quoteId));

            if (shouldAutoAccept) {
              console.log(`[Webhook] Quote ${quote.quoteNumber} auto-accepted after deposit payment - amount: $${depositAmount}, option: ${selectedOption}`);
            } else {
              console.log(`[Webhook] Quote ${quote.quoteNumber} deposit recorded - amount: $${depositAmount}, option: ${selectedOption}`);
            }

            // Create a deposit invoice automatically (with idempotency check)
            try {
              // Skip if deposit invoice was already created (handles Stripe webhook retries)
              if (quote.depositInvoiceId) {
                console.log(`[Webhook] Deposit invoice already exists for quote ${quoteId}, skipping creation`);
              } else {
              const depositInvoiceNumber = await generateDepositInvoiceNumber();
              
              // Get the selected option details for description if in options mode
              let depositDescription = `Deposit for Quote #${quote.quoteNumber}`;
              if (selectedOption && quote.quoteMode === "options") {
                depositDescription = `Deposit for ${selectedOption} - Quote #${quote.quoteNumber}`;
              }

              // Create the deposit invoice - marked as paid since we just received payment
              const [depositInvoice] = await db.insert(crmInvoices).values({
                invoiceNumber: depositInvoiceNumber,
                customerId: quote.accountId || null,
                propertyId: quote.siteId || null,
                projectId: quote.projectId || null,
                workOrderId: quote.jobId || null,
                quoteId: quote.id,
                status: "paid" as const,
                subtotal: depositAmount.toFixed(2),
                laborTotal: "0",
                total: depositAmount.toFixed(2),
                amountPaid: depositAmount.toFixed(2),
                balanceDue: "0.00",
                paidAt: now,
                notes: depositDescription,
                isDepositInvoice: true,
              }).returning();

              console.log(`[Webhook] Created deposit invoice ${depositInvoiceNumber} for $${depositAmount}`);

              // Create a line item for the deposit
              await db.insert(crmInvoiceLineItems).values({
                invoiceId: depositInvoice.id,
                description: depositDescription,
                quantity: "1",
                unitPrice: depositAmount.toFixed(2),
                lineTotal: depositAmount.toFixed(2),
                sortOrder: 0,
              });

              // Link the deposit invoice back to the quote
              await db.update(crmQuotes)
                .set({ depositInvoiceId: depositInvoice.id })
                .where(eq(crmQuotes.id, quoteId));

              // Auto-sync to QuickBooks if connected (fire and forget)
              autoSyncInvoice(depositInvoice.id).catch(err => {
                console.error(`[Webhook] Failed to sync deposit invoice to QuickBooks:`, err);
              });

              // Also sync the payment
              if (paymentIntentId) {
                autoSyncPayment(depositInvoice.id, paymentIntentId).catch(err => {
                  console.error(`[Webhook] Failed to sync deposit payment to QuickBooks:`, err);
                });
              }
              }

            } catch (invoiceError) {
              console.error(`[Webhook] Failed to create deposit invoice for quote ${quoteId}:`, invoiceError);
              // Don't fail the webhook - deposit is still recorded on the quote
            }
          } else {
            console.log(`[Webhook] Quote ${quoteId} not found`);
          }
        }
      }
    } catch (error) {
      // Don't throw - we still want to return 200 to Stripe
      console.error('[Webhook] Error processing custom webhook logic:', error);
    }
  }
}
