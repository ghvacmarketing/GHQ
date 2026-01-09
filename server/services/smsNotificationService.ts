import { storage } from "../storage";
import { getMessagingAdapter } from "./messaging/adapters";
import type { SmsNotificationType, InsertCrmMessagingMessage } from "@shared/schema";

export const SMS_TEMPLATES = {
  MAINTENANCE_REMINDER_10_DAY: "Hi! Your scheduled maintenance visit is coming up in 10 days. Please call us to confirm your appointment. - GHVAC",
  MAINTENANCE_REMINDER_5_DAY: "Reminder: Your maintenance visit is in 5 days. Please call to schedule if you haven't already. - GHVAC",
  WORK_ORDER_EN_ROUTE: "Your GHVAC technician is on the way! They should arrive shortly.",
  WORK_ORDER_ON_SITE: "Your GHVAC technician has arrived and is ready to help!",
  INVOICE_SMS_TEMPLATE: (invoiceNumber: string, paymentLink: string) => 
    `Your invoice #${invoiceNumber} is ready. Pay online: ${paymentLink} - GHVAC`,
} as const;

export interface SendAutomatedSmsParams {
  customerId: string;
  phoneNumber: string;
  messageBody: string;
  notificationType: SmsNotificationType;
  maintenanceVisitId?: string;
  workOrderId?: string;
  invoiceId?: string;
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
