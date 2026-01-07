import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { crmInvoices, crmQuotes } from '@shared/schema';
import { eq } from 'drizzle-orm';

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

            await db.update(crmQuotes)
              .set({
                depositAmount: depositAmount.toFixed(2),
                depositPaidAt: now,
                selectedOption: selectedOption || quote.selectedOption,
              })
              .where(eq(crmQuotes.id, quoteId));

            console.log(`[Webhook] Quote ${quote.quoteNumber} deposit recorded - amount: $${depositAmount}, option: ${selectedOption}`);
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
