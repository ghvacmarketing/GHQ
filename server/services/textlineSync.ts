import { textlineClient } from "../textlineClient";
import { storage } from "../storage";

/**
 * Background Textline sync — the reliability layer under the webhook.
 *
 * Every interval it lists the most recently active Textline conversations and,
 * for any with activity newer than what we have locally, pulls the full thread
 * and upserts BOTH inbound and outbound messages (deduped by post uuid). This
 * catches: webhook misses/misconfiguration, texts sent from the Textline app
 * itself, and anything else the real-time path drops.
 */

let running = false;
let firstRun = true;

function toDate(ts: unknown): Date | null {
  if (ts == null) return null;
  if (typeof ts === "number") return new Date(ts < 1e12 ? ts * 1000 : ts);
  const d = new Date(String(ts));
  return isNaN(d.getTime()) ? null : d;
}

export async function syncTextlineOnce(): Promise<{ conversations: number; newMessages: number }> {
  if (!textlineClient.isConfigured()) return { conversations: 0, newMessages: 0 };

  const { conversations, error } = await textlineClient.getConversations(0, 30);
  if (error) {
    console.error("[TextlineSync] list error:", error);
    return { conversations: 0, newMessages: 0 };
  }

  let newMessages = 0;

  for (const conv of conversations) {
    try {
      const phone = conv.phone_number;
      if (!phone) continue;
      const cleanPhone = phone.replace(/\D/g, "");

      let local = conv.uuid
        ? await storage.getMessagingConversationByExternalId(conv.uuid, "textline")
        : undefined;
      if (!local) local = await storage.getMessagingConversationByPhone(cleanPhone);

      // Skip threads with no activity since our last message — cheap check
      // that keeps the poll light. Disabled on the first run so historical
      // threads whose lastMessageAt was stamped without importing messages
      // get healed once at boot.
      const remoteActivity = toDate(conv.last_message_at) || toDate(conv.updated_at);
      if (!firstRun && local?.lastMessageAt && remoteActivity && remoteActivity <= new Date(local.lastMessageAt)) {
        continue;
      }

      const { messages } = await textlineClient.getConversationMessagesByPhone(phone);
      if ((!messages || messages.length === 0) && !local) continue;

      if (!local) {
        const customer = await storage.getCrmCustomerByPhone(cleanPhone);
        local = await storage.createMessagingConversation({
          customerId: customer?.id || null,
          phoneNumber: cleanPhone,
          customerName: conv.contact_name || customer?.name || null,
          subject: conv.contact_name || customer?.name || cleanPhone,
          externalSource: "textline" as any,
          externalConversationId: conv.uuid || null,
          status: "open" as any,
        });
      } else if (conv.uuid && !local.externalConversationId) {
        await storage.updateMessagingConversation(local.id, {
          externalSource: "textline" as any,
          externalConversationId: conv.uuid,
        });
      }

      const existing = await storage.getMessagesForConversation(local.id);
      const known = new Set(existing.map((m) => m.externalMessageId).filter(Boolean));

      let newInbound = 0;
      let newest: Date | null = local.lastMessageAt ? new Date(local.lastMessageAt) : null;
      for (const m of messages || []) {
        if (!m.uuid || known.has(m.uuid)) continue;
        const at = toDate(m.created_at) || new Date();
        await storage.createMessage({
          conversationId: local.id,
          direction: m.direction as any,
          channel: "sms" as any,
          body: m.body,
          externalMessageId: m.uuid,
          status: "delivered" as any,
          sentAt: at,
        });
        newMessages++;
        if (m.direction === "inbound") newInbound++;
        if (!newest || at > newest) newest = at;
      }

      if (newInbound > 0 || (newest && (!local.lastMessageAt || newest > new Date(local.lastMessageAt)))) {
        await storage.updateMessagingConversation(local.id, {
          lastMessageAt: newest || new Date(),
          ...(newInbound > 0
            ? { unreadInboundCount: (local.unreadInboundCount || 0) + newInbound, status: "open" as any }
            : {}),
        });
      }
    } catch (e) {
      console.error("[TextlineSync] conversation sync error:", e);
    }
  }

  firstRun = false;
  return { conversations: conversations.length, newMessages };
}

export function startTextlineBackgroundSync(intervalSeconds = 30): void {
  if (!textlineClient.isConfigured()) {
    console.log("[TextlineSync] TEXTLINE_API_KEY not set - background sync disabled");
    return;
  }
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await syncTextlineOnce();
      if (r.newMessages > 0) {
        console.log(`[TextlineSync] Imported ${r.newMessages} new message(s) across ${r.conversations} conversations`);
      }
    } catch (e) {
      console.error("[TextlineSync] run error:", e);
    } finally {
      running = false;
    }
  };
  setInterval(run, intervalSeconds * 1000);
  setTimeout(run, 5000);
  console.log(`[TextlineSync] Background sync every ${intervalSeconds}s`);
}
