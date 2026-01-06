import { Router } from "express";
import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { db } from "./db";
import { crmQuotes, crmInvoices } from "@shared/schema";
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

// Generate a payment link for a quote (install quotes only, with deposit)
router.post("/api/stripe/quote/:quoteId/payment-link", async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { depositOverride } = req.body; // Optional override for deposit percentage

    // Get the quote
    const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, quoteId));
    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Only allow payment links for install quotes
    if (quote.quoteCategory !== 'install') {
      return res.status(400).json({ 
        error: "Payment links are only available for install quotes",
        quoteCategory: quote.quoteCategory 
      });
    }

    const total = parseFloat(quote.total?.toString() || "0");
    if (total <= 0) {
      return res.status(400).json({ error: "Quote total must be greater than 0" });
    }

    // Calculate deposit amount
    const depositPct = depositOverride || await getDepositPercentage();
    const depositAmount = Math.round((total * depositPct / 100) * 100); // Convert to cents

    const stripe = await getUncachableStripeClient();

    // Create a Payment Link with Stripe
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Deposit for Quote #${quote.quoteNumber}`,
              description: `${depositPct}% deposit for ${quote.title || 'HVAC Installation'}`,
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
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}/portal/quote/${quote.viewToken}?payment=success`,
        },
      },
    });

    res.json({
      paymentLinkUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
      depositAmount: depositAmount / 100, // Return in dollars
      depositPercentage: depositPct,
      quoteTotal: total,
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

    // Use balance due if available, otherwise use total
    const amountDue = parseFloat(invoice.balanceDue?.toString() || invoice.total?.toString() || "0");
    if (amountDue <= 0) {
      return res.status(400).json({ error: "Invoice has no balance due" });
    }

    const stripe = await getUncachableStripeClient();

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
            unit_amount: Math.round(amountDue * 100), // Convert to cents
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
          url: `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}/portal/invoice/${invoice.id}?payment=success`,
        },
      },
    });

    res.json({
      paymentLinkUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
      amountDue,
      invoiceTotal: parseFloat(invoice.total?.toString() || "0"),
    });
  } catch (error: any) {
    console.error("Error creating invoice payment link:", error);
    res.status(500).json({ error: error.message || "Failed to create payment link" });
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
