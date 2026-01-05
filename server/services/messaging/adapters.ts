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
}

export interface OutboundMessageResult {
  success: boolean;
  externalMessageId?: string;
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
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async sendMessage(request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    throw new Error("Textline integration not yet implemented");
  }
  
  async getDeliveryStatus(externalMessageId: string): Promise<"queued" | "sent" | "delivered" | "failed"> {
    throw new Error("Textline integration not yet implemented");
  }
}

export function getMessagingAdapter(): MessagingAdapter {
  const textlineApiKey = process.env.TEXTLINE_API_KEY;
  
  if (textlineApiKey) {
    return new TextlineMessagingAdapter(textlineApiKey);
  }
  
  return new LocalMessagingAdapter();
}
