import { textlineClient } from "../../textlineClient";

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
      // Textline's API takes each attachment as a public URL only — their
      // servers fetch the bytes. /objects/ paths are publicly served
      // (unguessable UUIDs), so hand over absolute URLs.
      const publicBase = (process.env.PUBLIC_APP_URL || "https://www.ghvac.app").replace(/\/$/, "");
      let textlineAttachments: Array<{ url: string }> | undefined;
      if (request.attachments && request.attachments.length > 0) {
        textlineAttachments = request.attachments
          .filter((att) => !!att?.url)
          .map((att) => ({ url: att.url.startsWith("/") ? publicBase + att.url : att.url }));
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
