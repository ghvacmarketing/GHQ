/**
 * Textline API Client
 * Documentation: https://textline.docs.apiary.io/
 */

const TEXTLINE_BASE_URL = "https://application.textline.com";

export interface TextlineMessage {
  uuid: string;
  body: string;
  direction: "inbound" | "outbound";
  created_at: string;
  delivered_at?: string;
  read_at?: string;
  author?: {
    uuid: string;
    name: string;
    email?: string;
  };
  attachments?: Array<{
    uuid: string;
    url: string;
    filename: string;
    content_type: string;
  }>;
}

export interface TextlineConversation {
  uuid: string;
  phone_number: string;
  contact_name?: string;
  contact_email?: string;
  status: string;
  group_uuid?: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  messages?: TextlineMessage[];
}

export interface TextlineContact {
  uuid: string;
  phone_number: string;
  name?: string;
  email?: string;
  custom_fields?: Record<string, string>;
  tags?: string[];
}

export interface TextlineDepartment {
  uuid: string;
  name: string;
  phone_number: string;
}

export interface SendMessageOptions {
  phoneNumber: string;
  body: string;
  groupUuid?: string;
  attachments?: Array<{
    contentType: string;
    filename: string;
    base64Data: string;
  }>;
}

export interface SendMessageResult {
  success: boolean;
  conversationUuid?: string;
  messageUuid?: string;
  errorMessage?: string;
}

class TextlineClient {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.TEXTLINE_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error("Textline API key not configured");
    }
    return {
      "X-TGP-ACCESS-TOKEN": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * Send a message to a phone number
   * Creates a new conversation if one doesn't exist
   */
  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      return { success: false, errorMessage: "Textline API key not configured" };
    }

    try {
      const body: Record<string, any> = {
        phone_number: options.phoneNumber,
        comment: {
          body: options.body,
        },
      };

      if (options.groupUuid) {
        body.group_uuid = options.groupUuid;
      }

      // Handle attachments if provided
      if (options.attachments && options.attachments.length > 0) {
        body.comment.attachments = options.attachments.map(att => ({
          content_type: att.contentType,
          filename: att.filename,
          data: att.base64Data,
        }));
      }

      const response = await fetch(`${TEXTLINE_BASE_URL}/api/conversations.json`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[Textline] Send message error:", data);
        return {
          success: false,
          errorMessage: data.errors?.base?.[0] || data.error || "Failed to send message",
        };
      }

      return {
        success: true,
        conversationUuid: data.conversation?.uuid,
        messageUuid: data.post?.uuid,
      };
    } catch (error: any) {
      console.error("[Textline] Send message exception:", error);
      return {
        success: false,
        errorMessage: error.message || "Network error",
      };
    }
  }

  /**
   * Get all conversations with pagination
   */
  async getConversations(page: number = 0, perPage: number = 50): Promise<{
    conversations: TextlineConversation[];
    hasMore: boolean;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { conversations: [], hasMore: false, error: "Textline API key not configured" };
    }

    try {
      const response = await fetch(
        `${TEXTLINE_BASE_URL}/api/conversations.json?page=${page}&per_page=${perPage}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("[Textline] Get conversations error:", data);
        return {
          conversations: [],
          hasMore: false,
          error: data.error || "Failed to fetch conversations",
        };
      }

      // Debug: log the raw conversation structure
      if (data.conversations?.length > 0) {
        console.log("[Textline] Raw conversation sample:", JSON.stringify(data.conversations[0], null, 2));
      }

      // Map the response - phone_number might be in different locations
      const mappedConversations = (data.conversations || []).map((conv: any) => ({
        uuid: conv.uuid,
        phone_number: conv.phone_number || conv.contact?.phone_number || conv.customer?.phone_number || null,
        contact_name: conv.contact_name || conv.contact?.name || conv.customer?.name || null,
        contact_email: conv.contact_email || conv.contact?.email || conv.customer?.email || null,
        status: conv.status,
        group_uuid: conv.group_uuid,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        last_message_at: conv.last_message_at,
      }));

      return {
        conversations: mappedConversations,
        hasMore: (data.conversations?.length || 0) >= perPage,
      };
    } catch (error: any) {
      console.error("[Textline] Get conversations exception:", error);
      return {
        conversations: [],
        hasMore: false,
        error: error.message || "Network error",
      };
    }
  }

  /**
   * Get a specific conversation by UUID
   */
  async getConversation(uuid: string): Promise<{
    conversation: TextlineConversation | null;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { conversation: null, error: "Textline API key not configured" };
    }

    try {
      const response = await fetch(`${TEXTLINE_BASE_URL}/api/conversations/${uuid}.json`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          conversation: null,
          error: data.error || "Failed to fetch conversation",
        };
      }

      return { conversation: data.conversation };
    } catch (error: any) {
      console.error("[Textline] Get conversation exception:", error);
      return {
        conversation: null,
        error: error.message || "Network error",
      };
    }
  }

  /**
   * Get conversation by phone number
   */
  async getConversationByPhone(phoneNumber: string): Promise<{
    conversation: TextlineConversation | null;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { conversation: null, error: "Textline API key not configured" };
    }

    try {
      const response = await fetch(
        `${TEXTLINE_BASE_URL}/api/conversations/phone_number/${encodeURIComponent(phoneNumber)}.json`,
        {
          method: "GET",
          headers: this.getHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          return { conversation: null }; // No conversation exists for this number
        }
        return {
          conversation: null,
          error: data.error || "Failed to fetch conversation",
        };
      }

      return { conversation: data.conversation };
    } catch (error: any) {
      console.error("[Textline] Get conversation by phone exception:", error);
      return {
        conversation: null,
        error: error.message || "Network error",
      };
    }
  }

  /**
   * Resolve (close) a conversation
   */
  async resolveConversation(uuid: string, disposition?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Textline API key not configured" };
    }

    try {
      const body: Record<string, any> = {};
      if (disposition) {
        body.disposition = disposition;
      }

      const response = await fetch(`${TEXTLINE_BASE_URL}/api/conversations/${uuid}/resolve.json`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Failed to resolve conversation" };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[Textline] Resolve conversation exception:", error);
      return { success: false, error: error.message || "Network error" };
    }
  }

  /**
   * Get departments (groups)
   */
  async getDepartments(): Promise<{
    departments: TextlineDepartment[];
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { departments: [], error: "Textline API key not configured" };
    }

    try {
      const response = await fetch(`${TEXTLINE_BASE_URL}/api/groups.json`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { departments: [], error: data.error || "Failed to fetch departments" };
      }

      return { departments: data.groups || [] };
    } catch (error: any) {
      console.error("[Textline] Get departments exception:", error);
      return { departments: [], error: error.message || "Network error" };
    }
  }

  /**
   * Create or update a customer in Textline address book
   */
  async upsertCustomer(phoneNumber: string, data: {
    name?: string;
    email?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    contactUuid?: string;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Textline API key not configured" };
    }

    try {
      // First try to find existing customer
      const searchResponse = await fetch(
        `${TEXTLINE_BASE_URL}/api/customers.json?phone_number=${encodeURIComponent(phoneNumber)}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        }
      );

      const searchData = await searchResponse.json();
      const existingCustomer = searchData.customers?.[0];

      const body: Record<string, any> = {
        phone_number: phoneNumber,
      };
      if (data.name) body.name = data.name;
      if (data.email) body.email = data.email;
      if (data.notes) body.notes = data.notes;

      let response;
      if (existingCustomer) {
        // Update existing customer
        response = await fetch(`${TEXTLINE_BASE_URL}/api/customers/${existingCustomer.uuid}.json`, {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        });
      } else {
        // Create new customer
        response = await fetch(`${TEXTLINE_BASE_URL}/api/customers.json`, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        });
      }

      const responseData = await response.json();

      if (!response.ok) {
        return { success: false, error: responseData.error || "Failed to upsert customer" };
      }

      return {
        success: true,
        contactUuid: responseData.customer?.uuid,
      };
    } catch (error: any) {
      console.error("[Textline] Upsert customer exception:", error);
      return { success: false, error: error.message || "Network error" };
    }
  }

  /**
   * Get messages for a conversation
   * Textline returns posts when you fetch a single conversation via /api/conversations/{uuid}.json
   */
  async getConversationMessages(conversationUuid: string): Promise<{
    messages: TextlineMessage[];
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { messages: [], error: "Textline API key not configured" };
    }

    try {
      // Textline API: GET /api/conversations/{uuid}/comments.json to fetch messages
      const url = `${TEXTLINE_BASE_URL}/api/conversations/${conversationUuid}/comments.json`;
      console.log("[Textline] Fetching messages from:", url);
      
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      // Check content type before parsing
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[Textline] Non-JSON response:", response.status, text.substring(0, 200));
        return {
          messages: [],
          error: `API returned non-JSON response (${response.status}): ${text.substring(0, 100)}`,
        };
      }

      const data = await response.json();

      if (!response.ok) {
        console.error("[Textline] Get conversation/messages error:", data);
        return {
          messages: [],
          error: data.error || data.errors || "Failed to fetch conversation messages",
        };
      }

      // Textline /comments.json returns "comments" array directly
      const posts = data.comments || data.conversation?.posts || data.posts || [];
      console.log("[Textline] Fetched", posts.length, "messages for conversation", conversationUuid);
      
      const mappedMessages: TextlineMessage[] = posts.map((post: any) => ({
        uuid: post.uuid,
        body: post.body || "",
        direction: post.direction || (post.author ? "outbound" : "inbound"),
        created_at: post.created_at,
        delivered_at: post.delivered_at,
        read_at: post.read_at,
        author: post.author ? {
          uuid: post.author.uuid,
          name: post.author.name || post.author.email,
          email: post.author.email,
        } : undefined,
        attachments: post.attachments?.map((att: any) => ({
          uuid: att.uuid,
          url: att.url,
          filename: att.filename,
          content_type: att.content_type,
        })),
      }));

      return { messages: mappedMessages };
    } catch (error: any) {
      console.error("[Textline] Get messages exception:", error);
      return { messages: [], error: error.message || "Network error" };
    }
  }

  /**
   * Send a message to an existing conversation by UUID
   */
  async sendMessageToConversation(conversationUuid: string, messageBody: string): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      return { success: false, errorMessage: "Textline API key not configured" };
    }

    try {
      const body = {
        comment: {
          body: messageBody,
        },
      };

      // Textline API: POST /api/conversations/{uuid}/comments.json to send a message
      const url = `${TEXTLINE_BASE_URL}/api/conversations/${conversationUuid}/comments.json`;
      console.log("[Textline] Sending message to:", url);
      
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      // Check content type before parsing
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[Textline] Send message non-JSON response:", response.status, text.substring(0, 200));
        return {
          success: false,
          errorMessage: `API returned non-JSON response (${response.status})`,
        };
      }

      const data = await response.json();

      if (!response.ok) {
        console.error("[Textline] Send message to conversation error:", data);
        return {
          success: false,
          errorMessage: data.error || data.errors?.base?.[0] || "Failed to send message",
        };
      }

      // Response contains the created comment
      console.log("[Textline] Message sent successfully:", data.comment?.uuid || data.uuid);
      return {
        success: true,
        conversationUuid: data.conversation?.uuid || conversationUuid,
        messageUuid: data.comment?.uuid || data.uuid,
      };
    } catch (error: any) {
      console.error("[Textline] Send message exception:", error);
      return { success: false, errorMessage: error.message || "Network error" };
    }
  }
}

export const textlineClient = new TextlineClient();
