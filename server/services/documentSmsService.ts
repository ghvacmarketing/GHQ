import { sendAutomatedSms, getSmsTemplate } from "./smsNotificationService";
import type { SmsNotificationType } from "@shared/schema";

const DEFAULT_TEMPLATES: Record<string, string> = {
  sms_template_quote: "Hi {customerName}! Your quote #{quoteNumber} for {totalAmount} is ready. View it here: {viewLink} - GHVAC",
  sms_template_invoice_send: "Hi {customerName}! Your invoice #{invoiceNumber} for {amount} is ready. Pay here: {paymentLink} - GHVAC",
};

async function getDocumentSmsTemplate(templateKey: string): Promise<string> {
  const template = await getSmsTemplate(templateKey);
  return template || DEFAULT_TEMPLATES[templateKey] || "";
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return String(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

export interface SendQuoteSmsParams {
  customerId: string;
  phoneNumber: string;
  customerName: string;
  quoteId: string;
  quoteNumber: string;
  totalAmount: string | number;
  viewLink: string;
}

export interface SendQuoteSmsResult {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  errorMessage?: string;
}

export async function sendQuoteSms(params: SendQuoteSmsParams): Promise<SendQuoteSmsResult> {
  const {
    customerId,
    phoneNumber,
    customerName,
    quoteId,
    quoteNumber,
    totalAmount,
    viewLink,
  } = params;

  try {
    let template = await getDocumentSmsTemplate("sms_template_quote");
    if (!template) {
      template = DEFAULT_TEMPLATES.sms_template_quote;
    }

    const messageBody = template
      .replace("{customerName}", customerName)
      .replace("{quoteNumber}", quoteNumber)
      .replace("{totalAmount}", formatCurrency(totalAmount))
      .replace("{viewLink}", viewLink);

    const result = await sendAutomatedSms({
      customerId,
      phoneNumber,
      messageBody,
      notificationType: "quote_sent" as SmsNotificationType,
      quoteId,
    });

    if (result.success) {
      console.log(`[DocumentSmsService] Quote SMS sent successfully for quote ${quoteNumber}`);
    } else {
      console.error(`[DocumentSmsService] Failed to send quote SMS for quote ${quoteNumber}:`, result.errorMessage);
    }

    return result;
  } catch (error: any) {
    console.error("[DocumentSmsService] Error sending quote SMS:", error);
    return {
      success: false,
      errorMessage: error.message || "Unknown error occurred",
    };
  }
}

export interface SendInvoiceSmsParams {
  customerId: string;
  phoneNumber: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: string | number;
  paymentLink: string;
}

export interface SendInvoiceSmsResult {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  errorMessage?: string;
}

export async function sendInvoiceSms(params: SendInvoiceSmsParams): Promise<SendInvoiceSmsResult> {
  const {
    customerId,
    phoneNumber,
    customerName,
    invoiceId,
    invoiceNumber,
    amount,
    paymentLink,
  } = params;

  try {
    let template = await getDocumentSmsTemplate("sms_template_invoice_send");
    if (!template) {
      template = DEFAULT_TEMPLATES.sms_template_invoice_send;
    }

    const messageBody = template
      .replace("{customerName}", customerName)
      .replace("{invoiceNumber}", invoiceNumber)
      .replace("{amount}", formatCurrency(amount))
      .replace("{paymentLink}", paymentLink);

    const result = await sendAutomatedSms({
      customerId,
      phoneNumber,
      messageBody,
      notificationType: "invoice_sent" as SmsNotificationType,
      invoiceId,
    });

    if (result.success) {
      console.log(`[DocumentSmsService] Invoice SMS sent successfully for invoice ${invoiceNumber}`);
    } else {
      console.error(`[DocumentSmsService] Failed to send invoice SMS for invoice ${invoiceNumber}:`, result.errorMessage);
    }

    return result;
  } catch (error: any) {
    console.error("[DocumentSmsService] Error sending invoice SMS:", error);
    return {
      success: false,
      errorMessage: error.message || "Unknown error occurred",
    };
  }
}
