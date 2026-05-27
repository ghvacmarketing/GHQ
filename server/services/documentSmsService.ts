import { getMessagingAdapter } from "./messaging/adapters";
import { storage } from "../storage";
import type { SmsNotificationType, InsertCrmMessagingMessage } from "@shared/schema";

const DEFAULT_TEMPLATES: Record<string, string> = {
  sms_template_quote: "Hi {customerName}! Your quote #{quoteNumber} for {totalAmount} is ready. View it here: {viewLink}\n\n- GHVAC",
  sms_template_invoice_send: "Hi {customerName}! Your invoice #{invoiceNumber} for {amount} is ready. Pay here: {paymentLink}\n\n- GHVAC",
  sms_template_invoice_paid: "Hi {customerName}! Your invoice #{invoiceNumber} for {amount} has been paid in full. Thank you! View your receipt here: {viewLink}\n\n- GHVAC",
};

const templateCache: Map<string, { value: string; timestamp: number }> = new Map();
const CACHE_TTL_MS = 60000;

async function getDocumentSmsTemplate(templateKey: string): Promise<string> {
  const cached = templateCache.get(templateKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const setting = await storage.getSetting(templateKey);
    const value = setting?.value || DEFAULT_TEMPLATES[templateKey] || "";
    templateCache.set(templateKey, { value, timestamp: Date.now() });
    return value;
  } catch (error) {
    console.error(`[DocumentSmsService] Error fetching template ${templateKey}:`, error);
    return DEFAULT_TEMPLATES[templateKey] || "";
  }
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

    const adapter = getMessagingAdapter();
    
    let conversation = await storage.getMessagingConversationByPhone(phoneNumber);
    
    if (!conversation) {
      conversation = await storage.createMessagingConversation({
        customerId,
        phoneNumber,
        subject: "Quote Notification",
        externalSource: "textline",
        status: "open",
      });
    }

    const sendResult = await adapter.sendMessage({
      conversationId: conversation.id,
      body: messageBody,
      channel: "sms",
      recipientPhone: phoneNumber,
    });

    if (!sendResult.success) {
      await storage.createSmsNotificationLog({
        customerId,
        notificationType: "quote_sent" as SmsNotificationType,
        quoteId,
        conversationId: conversation.id,
        phoneNumber,
        messageBody,
        status: "failed",
        errorMessage: sendResult.errorMessage,
        sentAt: new Date(),
      });

      console.error(`[DocumentSmsService] Failed to send quote SMS for quote ${quoteNumber}:`, sendResult.errorMessage);
      return {
        success: false,
        errorMessage: sendResult.errorMessage,
      };
    }

    if (sendResult.externalConversationId && sendResult.externalConversationId !== conversation.externalConversationId) {
      await storage.updateMessagingConversation(conversation.id, {
        externalConversationId: sendResult.externalConversationId,
      });
    }

    const messageData: InsertCrmMessagingMessage = {
      conversationId: conversation.id,
      direction: "outbound",
      channel: "sms",
      body: messageBody,
      sentAt: new Date(),
      externalMessageId: sendResult.externalMessageId,
      status: "sent",
    };
    
    const savedMessage = await storage.createMessage(messageData);

    await storage.createSmsNotificationLog({
      customerId,
      notificationType: "quote_sent" as SmsNotificationType,
      quoteId,
      messageId: sendResult.externalMessageId,
      conversationId: conversation.id,
      phoneNumber,
      messageBody,
      status: "sent",
      sentAt: new Date(),
    });

    console.log(`[DocumentSmsService] Quote SMS sent successfully for quote ${quoteNumber}`);
    return {
      success: true,
      messageId: savedMessage.id,
      conversationId: conversation.id,
    };
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
  isPaid?: boolean;
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
    isPaid,
  } = params;

  try {
    const templateKey = isPaid ? "sms_template_invoice_paid" : "sms_template_invoice_send";
    let template = await getDocumentSmsTemplate(templateKey);
    if (!template) {
      template = DEFAULT_TEMPLATES[templateKey];
    }

    const messageBody = template
      .replace("{customerName}", customerName)
      .replace("{invoiceNumber}", invoiceNumber)
      .replace("{amount}", formatCurrency(amount))
      .replace("{paymentLink}", paymentLink)
      .replace("{viewLink}", paymentLink);

    const adapter = getMessagingAdapter();
    
    let conversation = await storage.getMessagingConversationByPhone(phoneNumber);
    
    if (!conversation) {
      conversation = await storage.createMessagingConversation({
        customerId,
        phoneNumber,
        subject: "Invoice Notification",
        externalSource: "textline",
        status: "open",
      });
    }

    const sendResult = await adapter.sendMessage({
      conversationId: conversation.id,
      body: messageBody,
      channel: "sms",
      recipientPhone: phoneNumber,
    });

    if (!sendResult.success) {
      await storage.createSmsNotificationLog({
        customerId,
        notificationType: "invoice_sent" as SmsNotificationType,
        invoiceId,
        conversationId: conversation.id,
        phoneNumber,
        messageBody,
        status: "failed",
        errorMessage: sendResult.errorMessage,
        sentAt: new Date(),
      });

      console.error(`[DocumentSmsService] Failed to send invoice SMS for invoice ${invoiceNumber}:`, sendResult.errorMessage);
      return {
        success: false,
        errorMessage: sendResult.errorMessage,
      };
    }

    if (sendResult.externalConversationId && sendResult.externalConversationId !== conversation.externalConversationId) {
      await storage.updateMessagingConversation(conversation.id, {
        externalConversationId: sendResult.externalConversationId,
      });
    }

    const messageData: InsertCrmMessagingMessage = {
      conversationId: conversation.id,
      direction: "outbound",
      channel: "sms",
      body: messageBody,
      sentAt: new Date(),
      externalMessageId: sendResult.externalMessageId,
      status: "sent",
    };
    
    const savedMessage = await storage.createMessage(messageData);

    await storage.createSmsNotificationLog({
      customerId,
      notificationType: "invoice_sent" as SmsNotificationType,
      invoiceId,
      messageId: sendResult.externalMessageId,
      conversationId: conversation.id,
      phoneNumber,
      messageBody,
      status: "sent",
      sentAt: new Date(),
    });

    console.log(`[DocumentSmsService] Invoice SMS sent successfully for invoice ${invoiceNumber}`);
    return {
      success: true,
      messageId: savedMessage.id,
      conversationId: conversation.id,
    };
  } catch (error: any) {
    console.error("[DocumentSmsService] Error sending invoice SMS:", error);
    return {
      success: false,
      errorMessage: error.message || "Unknown error occurred",
    };
  }
}
