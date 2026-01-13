import { storage } from "../storage";
import { getMessagingAdapter } from "./messaging/adapters";
import type { SmsNotificationType, InsertCrmMessagingMessage } from "@shared/schema";

// Default SMS templates - used as fallback when database values are not set
const DEFAULT_TEMPLATES: Record<string, string> = {
  sms_template_maintenance_10_day: "Hi! Your scheduled maintenance visit is coming up in 10 days. Please call us to confirm your appointment. - GHVAC",
  sms_template_maintenance_5_day: "Reminder: Your maintenance visit is in 5 days. Please call to schedule if you haven't already. - GHVAC",
  sms_template_work_order_en_route: "Your GHVAC technician is on the way! They should arrive shortly.",
  sms_template_work_order_on_site: "Your GHVAC technician has arrived and is ready to help!",
  sms_template_invoice: "Your invoice #{invoiceNumber} is ready. Pay online: {paymentLink} - GHVAC",
  sms_template_quote: "Hi {customerName}! Your quote #{quoteNumber} for {totalAmount} is ready. View it here: {viewLink} - GHVAC",
  sms_template_invoice_send: "Hi {customerName}! Your invoice #{invoiceNumber} for {amount} is ready. Pay here: {paymentLink} - GHVAC",
};

const templateCache: Map<string, { value: string; timestamp: number }> = new Map();
const CACHE_TTL_MS = 60000;

export async function getSmsTemplate(templateKey: string): Promise<string> {
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
    console.error(`[SmsNotificationService] Error fetching template ${templateKey}:`, error);
    return DEFAULT_TEMPLATES[templateKey] || "";
  }
}

export async function getMaintenance10DayTemplate(): Promise<string> {
  return getSmsTemplate("sms_template_maintenance_10_day");
}

export async function getMaintenance5DayTemplate(): Promise<string> {
  return getSmsTemplate("sms_template_maintenance_5_day");
}

export async function getWorkOrderEnRouteTemplate(): Promise<string> {
  return getSmsTemplate("sms_template_work_order_en_route");
}

export async function getWorkOrderOnSiteTemplate(): Promise<string> {
  return getSmsTemplate("sms_template_work_order_on_site");
}

export async function getInvoiceSmsTemplate(invoiceNumber: string, paymentLink: string): Promise<string> {
  const template = await getSmsTemplate("sms_template_invoice");
  return template
    .replace("{invoiceNumber}", invoiceNumber)
    .replace("{paymentLink}", paymentLink);
}

export function clearTemplateCache(): void {
  templateCache.clear();
}

export interface SendAutomatedSmsParams {
  customerId: string;
  phoneNumber: string;
  messageBody: string;
  notificationType: SmsNotificationType;
  maintenanceVisitId?: string;
  workOrderId?: string;
  invoiceId?: string;
  quoteId?: string;
}

export interface SendAutomatedSmsResult {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  errorMessage?: string;
}

export async function sendAutomatedSms(params: SendAutomatedSmsParams): Promise<SendAutomatedSmsResult> {
  const {
    customerId,
    phoneNumber,
    messageBody,
    notificationType,
    maintenanceVisitId,
    workOrderId,
    invoiceId,
    quoteId,
  } = params;

  try {
    const automatedSmsSetting = await storage.getSetting("automated_sms_enabled");
    if (automatedSmsSetting && automatedSmsSetting.value === "false") {
      return {
        success: false,
        errorMessage: "Automated SMS is disabled",
      };
    }

    const adapter = getMessagingAdapter();
    
    let conversation = await storage.getMessagingConversationByPhone(phoneNumber);
    
    if (!conversation) {
      conversation = await storage.createMessagingConversation({
        customerId,
        phoneNumber,
        subject: "Automated Notification",
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
        notificationType,
        maintenanceVisitId,
        workOrderId,
        invoiceId,
        quoteId,
        conversationId: conversation.id,
        phoneNumber,
        messageBody,
        status: "failed",
        errorMessage: sendResult.errorMessage,
        sentAt: new Date(),
      });

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
      notificationType,
      maintenanceVisitId,
      workOrderId,
      invoiceId,
      quoteId,
      messageId: sendResult.externalMessageId,
      conversationId: conversation.id,
      phoneNumber,
      messageBody,
      status: "sent",
      sentAt: new Date(),
    });

    return {
      success: true,
      messageId: savedMessage.id,
      conversationId: conversation.id,
    };
  } catch (error: any) {
    console.error("[SmsNotificationService] Error sending automated SMS:", error);
    
    try {
      await storage.createSmsNotificationLog({
        customerId,
        notificationType,
        maintenanceVisitId,
        workOrderId,
        invoiceId,
        quoteId,
        phoneNumber,
        messageBody,
        status: "failed",
        errorMessage: error.message || "Unknown error",
        sentAt: new Date(),
      });
    } catch (logError) {
      console.error("[SmsNotificationService] Failed to log error:", logError);
    }

    return {
      success: false,
      errorMessage: error.message || "Unknown error occurred",
    };
  }
}

export async function hasNotificationBeenSent(
  notificationType: SmsNotificationType,
  referenceId: string,
  referenceType: 'maintenance_visit' | 'work_order' | 'invoice'
): Promise<boolean> {
  try {
    const existingNotification = await storage.getSmsNotificationByReference(
      notificationType,
      referenceId,
      referenceType
    );
    
    return existingNotification !== undefined && existingNotification.status === "sent";
  } catch (error) {
    console.error("[SmsNotificationService] Error checking notification status:", error);
    return false;
  }
}
