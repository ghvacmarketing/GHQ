import { Router } from "express";
import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { db } from "./db";
import { crmQuotes, crmInvoices, crmQuoteLineItems } from "@shared/schema";
import { surchargeFor, surchargeLabel, type PaymentMethod } from "@shared/payment-fees";
import { eq } from "drizzle-orm";

const router = Router();

// Default deposit percentage for install quotes
const DEFAULT_DEPOSIT_PERCENTAGE = 50;

// Get deposit percentage from settings (with default fallback)
async function getDepositPercentage(): Promise<number> {
  const setting = await storage.getSetting('stripe_deposit_percentage');
  if (setting) {
    const parsed = parseInt(setting.value, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
      return parsed;
    }
  }
  return DEFAULT_DEPOSIT_PERCENTAGE;
}

// Quote types that allow payment links (matches actual database values)
const PAYMENT_LINK_TYPES = ["custom_install", "proposal", "custom_service"];

// Generate a payment link for a quote (specific types only, with deposit)
router.post("/api/stripe/quote/:quoteId/payment-link", async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { depositOverride, selectedOption, signatureImage, signerName } = req.body;
    // Chosen payment method drives the surcharge and which method the link allows.
    const paymentMethod: PaymentMethod = req.body?.paymentMethod === "ach" ? "ach" : "card";

    // Validate signature is provided - required before generating payment link
    if (!signatureImage || !signerName?.trim()) {
      return res.status(400).json({ 
        error: "Signature and name are required before proceeding to payment",
        requiresSignature: true
      });
    }

    // Get the quote
    let [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, quoteId));
    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Ensure the quote has a viewToken — it may be null if the quote was never emailed.
    // Without it the Stripe return URL would be /q/null and the customer gets "Not Found".
    if (!quote.viewToken) {
      const { nanoid } = await import("nanoid");
      const newToken = nanoid(8);
      await db.update(crmQuotes).set({ viewToken: newToken }).where(eq(crmQuotes.id, quoteId));
      quote = { ...quote, viewToken: newToken };
    }

    // Get client IP for signature tracking
    const signerIp = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'unknown';
    const now = new Date();

    // Store signature data but don't set signedAt yet - that will be set when payment succeeds
    // This prevents abandoned payments from appearing as "signed" in audit logs
    await db.update(crmQuotes)
      .set({
        signatureImage,
        signerName: signerName.trim(),
        signerIp,
        updatedAt: now,
        ...(selectedOption ? { selectedOption } : {}),
      })
      .where(eq(crmQuotes.id, quoteId));

    // Only allow payment links for specific quote types
    if (!PAYMENT_LINK_TYPES.includes(quote.quoteType?.toLowerCase() || '')) {
      return res.status(400).json({ 
        error: "Payment links are only available for Custom Install, Proposal Builder, and Custom Service quotes",
        quoteType: quote.quoteType 
      });
    }

    // Determine the total to use for deposit calculation
    let total = parseFloat(quote.total?.toString() || "0");
    let optionDescription = quote.title || 'HVAC Installation';
    
    // If a selectedOption is provided, calculate deposit from that option's total only
    if (selectedOption) {
      const lineItems = await db.select().from(crmQuoteLineItems).where(eq(crmQuoteLineItems.quoteId, quoteId));
      const optionItems = lineItems.filter(item => item.optionTag === selectedOption);
      
      if (optionItems.length > 0) {
        // Sum the line totals for the selected option
        total = optionItems.reduce((sum, item) => sum + parseFloat(item.lineTotal?.toString() || "0"), 0);
        optionDescription = `${selectedOption} - ${quote.title || 'HVAC Installation'}`;
      }
    }

    if (total <= 0) {
      return res.status(400).json({ error: "Quote total must be greater than 0" });
    }

    // Surcharge the price for the chosen payment method (passes the processing
    // fee to the customer), then take the deposit from the surcharged total.
    const surchargeAmount = surchargeFor(paymentMethod, total);
    const surchargedTotal = total + surchargeAmount;

    // Calculate deposit amount (minimum 50 cents per Stripe's requirement)
    const depositPct = depositOverride || await getDepositPercentage();
    const depositAmount = Math.max(50, Math.round((surchargedTotal * depositPct / 100) * 100)); // Convert to cents

    const methodLabel = paymentMethod === "ach" ? "bank transfer (ACH)" : "credit/debit card";
    const stripe = await getUncachableStripeClient();

    // Create a Payment Link with Stripe, restricted to the chosen method.
    const paymentLink = await stripe.paymentLinks.create({
      payment_method_types: paymentMethod === "ach" ? ["us_bank_account"] : ["card"],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Deposit for Quote #${quote.quoteNumber}`,
              description: `${depositPct}% deposit for ${optionDescription} — includes ${surchargeLabel(paymentMethod)} ${methodLabel} processing fee`,
            },
            unit_amount: depositAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        type: 'quote_deposit',
        depositPercentage: depositPct.toString(),
        selectedOption: selectedOption || '',
        paymentMethod,
        surchargeAmount: surchargeAmount.toFixed(2),
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}/q/${quote.viewToken}?payment=success`,
        },
      },
    });

    // Store the payment link ID on the quote for later verification
    await db.update(crmQuotes)
      .set({ stripePaymentLinkId: paymentLink.id })
      .where(eq(crmQuotes.id, quoteId));

    res.json({
      paymentLinkUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
      depositAmount: depositAmount / 100, // Return in dollars
      depositPercentage: depositPct,
      quoteTotal: total,
      paymentMethod,
      surchargeAmount,
      surchargedTotal,
    });
  } catch (error: any) {
    console.error("Error creating quote payment link:", error);
    res.status(500).json({ error: error.message || "Failed to create payment link" });
  }
});

// Generate a payment link for an invoice (full amount)
router.post("/api/stripe/invoice/:invoiceId/payment-link", async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Get the invoice
    const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId));
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Check if invoice is already paid or voided - prevent double payment
    if (invoice.status === "paid") {
      return res.status(400).json({ error: "This invoice has already been paid", alreadyPaid: true });
    }
    if (invoice.status === "void") {
      return res.status(400).json({ error: "This invoice has been voided" });
    }
    // Drafts aren't customer-facing yet - don't let one be paid
    if (invoice.status === "draft") {
      return res.status(400).json({ error: "This invoice isn't finalized yet" });
    }

    // Use balance due if available, otherwise use total
    const amountDue = parseFloat(invoice.balanceDue?.toString() || invoice.total?.toString() || "0");
    if (amountDue <= 0) {
      return res.status(400).json({ error: "Invoice has no balance due" });
    }

    const stripe = await getUncachableStripeClient();

    // Ensure invoice has a viewToken for short URLs
    let viewToken = invoice.viewToken;
    if (!viewToken) {
      const { nanoid } = await import("nanoid");
      viewToken = nanoid(8);
      await db.update(crmInvoices)
        .set({ viewToken, updatedAt: new Date() })
        .where(eq(crmInvoices.id, invoice.id));
    }

    // Create a Payment Link for the full balance
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice #${invoice.invoiceNumber}`,
              description: `Payment for HVAC Service Invoice`,
            },
            unit_amount: Math.max(50, Math.round(amountDue * 100)), // Convert to cents, minimum $0.50
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        type: 'invoice_payment',
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}/i/${viewToken}?payment=success`,
        },
      },
    });

    // Store the payment link ID and URL on the invoice for later verification and tracking
    await db.update(crmInvoices)
      .set({ 
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
      })
      .where(eq(crmInvoices.id, invoiceId));

    // Build tracking URL using request host for non-Replit environments
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers.host || process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
    const baseUrl = `${protocol}://${host}`;
    const trackingUrl = `${baseUrl}/api/public/invoice/${invoiceId}/pay`;

    res.json({
      paymentLinkUrl: trackingUrl, // Use tracking URL instead of direct Stripe URL
      directStripeUrl: paymentLink.url, // Also provide direct URL for admin reference
      paymentLinkId: paymentLink.id,
      amountDue,
      invoiceTotal: parseFloat(invoice.total?.toString() || "0"),
    });
  } catch (error: any) {
    console.error("Error creating invoice payment link:", error);
    res.status(500).json({ error: error.message || "Failed to create payment link" });
  }
});

// Verify and record payment for an invoice
router.post("/api/stripe/invoice/:invoiceId/verify-payment", async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Get the invoice
    const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId));
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // If already marked as paid, return success
    if (invoice.status === "paid") {
      return res.json({
        success: true,
        alreadyPaid: true,
        paidAt: invoice.paidAt,
        amountPaid: invoice.amountPaid,
      });
    }

    const stripe = await getUncachableStripeClient();
    const now = new Date();
    const paymentLinkId = (invoice as any).stripePaymentLinkId;

    // Method 1: Check via Payment Link if we have the ID stored
    if (paymentLinkId) {
      const sessions = await stripe.checkout.sessions.list({
        payment_link: paymentLinkId,
        limit: 10,
      });

      for (const session of sessions.data) {
        if (session.payment_status !== 'paid') continue;

        const paymentIntentId = typeof session.payment_intent === 'string' 
          ? session.payment_intent 
          : session.payment_intent?.id || null;
          
        if (paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['charges.data'],
          });
          
          // Check if payment is valid and cleared
          if (paymentIntent.status !== 'succeeded' || (paymentIntent.amount_received ?? 0) <= 0) {
            continue;
          }
          
          // Check for refunds
          const wasRefunded =
            (paymentIntent.amount_refunded ?? 0) > 0 ||
            paymentIntent.charges?.data?.some((charge) =>
              charge.refunded || (charge.amount_refunded ?? 0) > 0 || charge.status !== 'succeeded'
            );
          
          if (wasRefunded) {
            continue;
          }
          
          const amountPaidNum = (paymentIntent.amount_received ?? session.amount_total ?? 0) / 100;
          const total = parseFloat(invoice.total?.toString() || "0");
          const previouslyPaid = parseFloat(invoice.amountPaid?.toString() || "0");
          const newAmountPaid = previouslyPaid + amountPaidNum;
          const newBalanceDue = Math.max(0, total - newAmountPaid);
          const isPaidInFull = newBalanceDue <= 0;
          
          await db.update(crmInvoices)
            .set({
              status: isPaidInFull ? "paid" : "sent",
              paidAt: isPaidInFull ? now : null,
              amountPaid: newAmountPaid.toFixed(2),
              balanceDue: newBalanceDue.toFixed(2),
              paymentMethod: "stripe",
              paymentReference: paymentIntentId,
            })
            .where(eq(crmInvoices.id, invoiceId));

          return res.json({
            success: true,
            paidAt: isPaidInFull ? now : null,
            amountPaid: newAmountPaid,
            balanceDue: newBalanceDue,
            isPaidInFull,
            stripePaymentIntentId: paymentIntentId,
          });
        }
      }
    }

    // Method 2: Fallback - search PaymentIntents by metadata
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 20,
      expand: ['data.charges.data'],
    });

    for (const pi of paymentIntents.data) {
      if (pi.metadata?.invoiceId !== invoiceId || pi.metadata?.type !== 'invoice_payment') {
        continue;
      }
      
      if (pi.status !== 'succeeded' || (pi.amount_received ?? 0) <= 0) {
        continue;
      }
      
      const wasRefunded =
        (pi.amount_refunded ?? 0) > 0 ||
        pi.charges?.data?.some((charge) =>
          charge.refunded || (charge.amount_refunded ?? 0) > 0 || charge.status !== 'succeeded'
        );
      
      if (wasRefunded) {
        continue;
      }
      
      const amountPaidNum = (pi.amount_received ?? pi.amount) / 100;
      const total = parseFloat(invoice.total?.toString() || "0");
      const previouslyPaid = parseFloat(invoice.amountPaid?.toString() || "0");
      const newAmountPaid = previouslyPaid + amountPaidNum;
      const newBalanceDue = Math.max(0, total - newAmountPaid);
      const isPaidInFull = newBalanceDue <= 0;
      
      await db.update(crmInvoices)
        .set({
          status: isPaidInFull ? "paid" : "sent",
          paidAt: isPaidInFull ? now : null,
          amountPaid: newAmountPaid.toFixed(2),
          balanceDue: newBalanceDue.toFixed(2),
          paymentMethod: "stripe",
          paymentReference: pi.id,
        })
        .where(eq(crmInvoices.id, invoiceId));

      return res.json({
        success: true,
        paidAt: isPaidInFull ? now : null,
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        isPaidInFull,
        stripePaymentIntentId: pi.id,
      });
    }

    // No payment found
    res.json({ 
      success: false, 
      message: "No successful payment found for this invoice. Payment may still be processing." 
    });
  } catch (error: any) {
    console.error("Error verifying invoice payment:", error);
    res.status(500).json({ error: error.message || "Failed to verify payment" });
  }
});

// Get/set deposit percentage setting
router.get("/api/stripe/settings/deposit-percentage", async (_req, res) => {
  const percentage = await getDepositPercentage();
  res.json({ depositPercentage: percentage });
});

router.post("/api/stripe/settings/deposit-percentage", async (req, res) => {
  try {
    const { percentage } = req.body;
    if (typeof percentage !== 'number' || percentage < 1 || percentage > 100) {
      return res.status(400).json({ error: "Percentage must be between 1 and 100" });
    }

    await storage.setSetting('stripe_deposit_percentage', percentage.toString());
    res.json({ depositPercentage: percentage });
  } catch (error: any) {
    console.error("Error setting deposit percentage:", error);
    res.status(500).json({ error: error.message || "Failed to save setting" });
  }
});

// Verify and record deposit payment for a quote
router.post("/api/stripe/quote/:quoteId/verify-deposit", async (req, res) => {
  try {
    const { quoteId } = req.params;

    // Get the quote
    const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, quoteId));
    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // If already marked as paid, return success
    if (quote.depositPaidAt) {
      return res.json({ 
        success: true, 
        depositPaidAt: quote.depositPaidAt,
        depositAmount: parseFloat(quote.depositAmount || "0"),
        selectedOption: quote.selectedOption || null,
        alreadyPaid: true 
      });
    }

    const stripe = await getUncachableStripeClient();
    const now = new Date();

    // Use the stored Payment Link ID if available for direct lookup
    const paymentLinkId = quote.stripePaymentLinkId;
    
    if (paymentLinkId) {
      // Find Checkout Sessions created from this specific Payment Link
      // The payment_link filter returns only sessions from this specific link
      let checkoutSessions;
      try {
        checkoutSessions = await stripe.checkout.sessions.list({
          payment_link: paymentLinkId,
          limit: 100, // Max allowed, typically only 1 session per link
        });
      } catch (paymentLinkError: any) {
        // Payment link doesn't exist (e.g., from a different Stripe account)
        // Clear the invalid payment link ID and continue to fallback
        console.log(`Payment link ${paymentLinkId} not found, clearing and using fallback`);
        await db.update(crmQuotes)
          .set({ stripePaymentLinkId: null })
          .where(eq(crmQuotes.id, quoteId));
        checkoutSessions = { data: [] };
      }

      // Find a valid paid session (check status and payment status)
      for (const session of checkoutSessions.data) {
        // Only accept sessions that are complete and paid
        if (session.payment_status === 'paid' && session.status === 'complete') {
          const paymentIntentId = typeof session.payment_intent === 'string' 
            ? session.payment_intent 
            : session.payment_intent?.id || null;
          
          // Verify the PaymentIntent hasn't been refunded
          if (paymentIntentId) {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
              expand: ['charges.data'],
            });
            
            // Check if the payment is valid and cleared
            if (paymentIntent.status !== 'succeeded' || (paymentIntent.amount_received ?? 0) <= 0) {
              continue; // Not a cleared payment
            }
            
            // Check for refunds - examine both intent-level and charge-level refunds
            const wasRefunded =
              (paymentIntent.amount_refunded ?? 0) > 0 ||
              paymentIntent.charges?.data?.some((charge) =>
                charge.refunded || (charge.amount_refunded ?? 0) > 0 || charge.status !== 'succeeded'
              );
            
            if (wasRefunded) {
              continue; // Deposit was reversed (partial or full)
            }
            
            const depositAmountNum = (paymentIntent.amount_received ?? session.amount_total ?? 0) / 100;
            const sessionSelectedOption = (session.metadata?.selectedOption as string) || null;
            
            await db.update(crmQuotes)
              .set({
                depositPaidAt: now,
                depositAmount: depositAmountNum.toFixed(2),
                stripePaymentIntentId: paymentIntentId,
                ...(sessionSelectedOption && { selectedOption: sessionSelectedOption }),
              })
              .where(eq(crmQuotes.id, quoteId));

            return res.json({
              success: true,
              depositPaidAt: now,
              depositAmount: depositAmountNum,
              selectedOption: sessionSelectedOption,
              stripePaymentIntentId: paymentIntentId,
            });
          }
        }
      }
    }

    // Fallback: Check if there's a PaymentIntent with matching metadata (for older quotes)
    // Only used when stripePaymentLinkId is not set
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 20,
      expand: ['data.charges.data'],
    });

    // Find a valid payment that hasn't been refunded
    for (const pi of paymentIntents.data) {
      // Check metadata match first
      if (pi.metadata?.quoteId !== quoteId || pi.metadata?.type !== 'quote_deposit') {
        continue;
      }
      
      // Check if payment is valid and cleared
      if (pi.status !== 'succeeded' || (pi.amount_received ?? 0) <= 0) {
        continue;
      }
      
      // Check for refunds - same logic as primary path
      const wasRefunded =
        (pi.amount_refunded ?? 0) > 0 ||
        pi.charges?.data?.some((charge) =>
          charge.refunded || (charge.amount_refunded ?? 0) > 0 || charge.status !== 'succeeded'
        );
      
      if (wasRefunded) {
        continue; // Deposit was reversed, skip
      }
      
      const depositAmountNum = (pi.amount_received ?? pi.amount) / 100;
      const piSelectedOption = (pi.metadata?.selectedOption as string) || null;
      
      await db.update(crmQuotes)
        .set({
          depositPaidAt: now,
          depositAmount: depositAmountNum.toFixed(2),
          stripePaymentIntentId: pi.id,
          ...(piSelectedOption && { selectedOption: piSelectedOption }),
        })
        .where(eq(crmQuotes.id, quoteId));

      return res.json({
        success: true,
        depositPaidAt: now,
        depositAmount: depositAmountNum,
        selectedOption: piSelectedOption,
        stripePaymentIntentId: pi.id,
      });
    }

    // No payment found
    res.json({ 
      success: false, 
      message: "No successful payment found for this quote. Payment may still be processing." 
    });
  } catch (error: any) {
    console.error("Error verifying quote deposit:", error);
    res.status(500).json({ error: error.message || "Failed to verify deposit payment" });
  }
});

// Get Stripe publishable key for frontend
router.get("/api/stripe/config", async (_req, res) => {
  try {
    const { getStripePublishableKey } = await import("./stripeClient");
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error: any) {
    console.error("Error getting Stripe config:", error);
    res.status(500).json({ error: error.message || "Failed to get Stripe config" });
  }
});

// Send payment link via SMS
router.post("/api/stripe/send-payment-link-sms", async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: "Phone number and message are required" });
    }

    // Format phone number if needed
    let phoneNumber = to.replace(/\D/g, '');
    if (!phoneNumber.startsWith('1') && phoneNumber.length === 10) {
      phoneNumber = '1' + phoneNumber;
    }
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }

    // Check if Twilio is configured
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(503).json({ 
        error: "SMS service not configured. Please set up Twilio credentials." 
      });
    }

    // Send SMS via Twilio API
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
        body: new URLSearchParams({
          To: phoneNumber,
          From: fromNumber,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Twilio API error:', errorData);
      return res.status(500).json({ error: "Failed to send SMS" });
    }

    const data = await response.json();
    console.log('Payment link SMS sent:', data.sid);
    res.json({ success: true, messageSid: data.sid });
  } catch (error: any) {
    console.error("Error sending payment link SMS:", error);
    res.status(500).json({ error: error.message || "Failed to send SMS" });
  }
});

export default router;
