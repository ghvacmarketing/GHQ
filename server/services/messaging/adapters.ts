import { textlineClient } from "../../textlineClient";
import { ObjectStorageService } from "../../replit_integrations/object_storage/objectStorage";

export interface MessageAttachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
}

export interface OutboundMessageRequest {
  conversationId: string;
  body: string;
  channel: "sms" | "mms" | "email";
  attachments?: MessageAttachment[];
  externalConversationId?: string;
  recipientPhone?: string;
}

export interface OutboundMessageResult {
  success: boolean;
  externalMessageId?: string;
  externalConversationId?: string;
  status: "queued" | "sent" | "failed";
  errorMessage?: string;
}

export interface InboundMessageEvent {
  externalConversationId: string;
  externalMessageId: string;
  body: string;
  channel: "sms" | "mms";
  senderPhone: string;
  attachments?: MessageAttachment[];
  receivedAt: Date;
}

export interface MessagingAdapter {
  name: string;
  sendMessage(request: OutboundMessageRequest): Promise<OutboundMessageResult>;
  getDeliveryStatus?(externalMessageId: string): Promise<"queued" | "sent" | "delivered" | "failed">;
}

export class LocalMessagingAdapter implements MessagingAdapter {
  name = "local";
  
  async sendMessage(request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    return {
      success: true,
      status: "sent",
    };
  }
}

export class TextlineMessagingAdapter implements MessagingAdapter {
  name = "textline";
  
  async sendMessage(request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    // Always prefer phone number-based sending as it's more reliable
    // The phone number approach finds or creates the conversation automatically
    if (request.recipientPhone) {
      // Turn any /objects/... attachments into base64 so Textline sends them
      // as an MMS. Bytes are read from our own object store (Neon/disk/GCS).
      let textlineAttachments: Array<{ contentType: string; filename: string; base64Data: string }> | undefined;
      if (request.attachments && request.attachments.length > 0) {
        const objectStore = new ObjectStorageService();
        textlineAttachments = [];
        for (const att of request.attachments) {
          if (!att?.url) continue;
          try {
            const bytes = await objectStore.readObjectBytes(att.url);
            textlineAttachments.push({
              contentType: att.mimeType || "application/octet-stream",
              filename: att.filename || "attachment",
              base64Data: bytes.toString("base64"),
            });
          } catch (err) {
            console.error("[Textline] Failed to read attachment bytes for", att.url, err);
          }
        }
        if (textlineAttachments.length === 0) textlineAttachments = undefined;
      }

      const result = await textlineClient.sendMessage({
        phoneNumber: request.recipientPhone,
        body: request.body,
        attachments: textlineAttachments,
      });

      if (!result.success) {
        return {
          success: false,
          status: "failed",
          errorMessage: result.errorMessage,
        };
      }

      return {
        success: true,
        status: "sent",
        externalMessageId: result.messageUuid,
        externalConversationId: result.conversationUuid,
      };
    }

    // No phone number available - cannot send
    return {
      success: false,
      status: "failed",
      errorMessage: "No recipient phone number provided",
    };
  }
  
  async getDeliveryStatus(externalMessageId: string): Promise<"queued" | "sent" | "delivered" | "failed"> {
    // Textline doesn't provide a direct message status endpoint
    // Status updates come via webhooks
    return "sent";
  }
}

export function getMessagingAdapter(): MessagingAdapter {
  if (textlineClient.isConfigured()) {
    return new TextlineMessagingAdapter();
  }
  
  return new LocalMessagingAdapter();
}
