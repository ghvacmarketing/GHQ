import { db } from "./db";
import { crmWebhookEvents, WebhookProvider } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface WebhookIngestionResult {
  status: "created" | "duplicate";
  eventId?: string;
}

export async function ingestWebhookEvent(
  provider: WebhookProvider,
  providerEventId: string,
  payload: Record<string, unknown>
): Promise<WebhookIngestionResult> {
  try {
    const [existing] = await db
      .select()
      .from(crmWebhookEvents)
      .where(eq(crmWebhookEvents.providerEventId, providerEventId))
      .limit(1);

    if (existing) {
      return { status: "duplicate" };
    }

    const [created] = await db
      .insert(crmWebhookEvents)
      .values({
        provider,
        providerEventId,
        payloadJson: payload,
      })
      .returning();

    return { status: "created", eventId: created.id };
  } catch (error: any) {
    if (error.code === "23505") {
      return { status: "duplicate" };
    }
    throw error;
  }
}

export async function markWebhookProcessed(eventId: string): Promise<void> {
  await db
    .update(crmWebhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(crmWebhookEvents.id, eventId));
}
