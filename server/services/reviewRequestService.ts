import { db } from "../db";
import { crmWorkOrders, crmCustomers, marketingCampaigns } from "@shared/schema";
import { eq, and, sql, lt, or, isNull } from "drizzle-orm";
import { subMonths, subHours } from "date-fns";
import { toZonedTime, format } from "date-fns-tz";
import { storage } from "../storage";
import {
  sendAutomatedSms,
  hasNotificationBeenSent,
  getSmsTemplate,
} from "./smsNotificationService";

const APP_TIMEZONE = "America/New_York";

const DEFAULT_REVIEW_TEMPLATE = "Thanks for choosing GHVAC! We'd love your feedback - please leave us a Google review: {reviewLink} - GHVAC";

const REVIEW_COOLDOWN_MONTHS = 6;
const REVIEW_DELAY_HOURS = 2;

export interface ReviewRequestResult {
  workOrderId: string;
  customerName: string;
  smsSent: boolean;
  error?: string;
  skippedReason?: string;
}

export interface ReviewRequestSummary {
  processedAt: Date;
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  results: ReviewRequestResult[];
}

async function getReviewRequestTemplate(): Promise<string> {
  const template = await getSmsTemplate("sms_template_review_request");
  return template || DEFAULT_REVIEW_TEMPLATE;
}

async function getGoogleReviewLink(): Promise<string | null> {
  const setting = await storage.getSetting("google_review_link");
  return setting?.value || null;
}

async function isReviewAutomationEnabled(): Promise<boolean> {
  const setting = await storage.getSetting("review_automation_enabled");
  return setting?.value !== "false";
}

async function updateCampaignStats(sentCount: number): Promise<void> {
  try {
    const automationEnabled = await isReviewAutomationEnabled();
    
    const existingCampaign = await db
      .select()
      .from(marketingCampaigns)
      .where(and(
        eq(marketingCampaigns.name, "Google Review Requests"),
        eq(marketingCampaigns.type, "review_request")
      ))
      .limit(1);

    if (existingCampaign.length === 0) {
      await db.insert(marketingCampaigns).values({
        name: "Google Review Requests",
        type: "review_request",
        description: "Automated review requests sent 2 hours after work order completion",
        isActive: automationEnabled,
        totalSent: sentCount,
        lastSentAt: sentCount > 0 ? new Date() : null,
      });
    } else {
      await db.update(marketingCampaigns)
        .set({
          totalSent: sql`${marketingCampaigns.totalSent} + ${sentCount}`,
          lastSentAt: sentCount > 0 ? new Date() : existingCampaign[0].lastSentAt,
          isActive: automationEnabled,
          updatedAt: new Date(),
        })
        .where(eq(marketingCampaigns.id, existingCampaign[0].id));
    }
  } catch (error) {
    console.error("[ReviewRequest] Error updating campaign stats:", error);
  }
}

export async function syncCampaignActiveStatus(): Promise<void> {
  try {
    const automationEnabled = await isReviewAutomationEnabled();
    
    await db.update(marketingCampaigns)
      .set({
        isActive: automationEnabled,
        updatedAt: new Date(),
      })
      .where(and(
        eq(marketingCampaigns.name, "Google Review Requests"),
        eq(marketingCampaigns.type, "review_request")
      ));
  } catch (error) {
    console.error("[ReviewRequest] Error syncing campaign status:", error);
  }
}

export async function processReviewRequests(): Promise<ReviewRequestSummary> {
  const summary: ReviewRequestSummary = {
    processedAt: new Date(),
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  try {
    const automationEnabled = await isReviewAutomationEnabled();
    if (!automationEnabled) {
      console.log("[ReviewRequest] Review automation is disabled");
      return summary;
    }

    const reviewLink = await getGoogleReviewLink();
    if (!reviewLink) {
      console.log("[ReviewRequest] No Google review link configured");
      return summary;
    }

    const automatedSmsSetting = await storage.getSetting("automated_sms_enabled");
    if (automatedSmsSetting && automatedSmsSetting.value === "false") {
      console.log("[ReviewRequest] Automated SMS is disabled globally");
      return summary;
    }

    const now = new Date();
    const twoHoursAgo = subHours(now, REVIEW_DELAY_HOURS);
    const fourHoursAgo = subHours(now, REVIEW_DELAY_HOURS + 2);
    const sixMonthsAgo = subMonths(now, REVIEW_COOLDOWN_MONTHS);

    const completedWorkOrders = await db
      .select({
        workOrderId: crmWorkOrders.id,
        workOrderNumber: crmWorkOrders.workOrderNumber,
        completedAt: crmWorkOrders.completedAt,
        customerId: crmWorkOrders.customerId,
        customerName: crmCustomers.name,
        customerPhone: crmCustomers.phone,
        lastReviewRequestAt: crmCustomers.lastReviewRequestAt,
      })
      .from(crmWorkOrders)
      .innerJoin(crmCustomers, eq(crmWorkOrders.customerId, crmCustomers.id))
      .where(
        and(
          eq(crmWorkOrders.status, "completed"),
          lt(crmWorkOrders.completedAt, twoHoursAgo),
          sql`${crmWorkOrders.completedAt} > ${fourHoursAgo}`,
          or(
            isNull(crmCustomers.lastReviewRequestAt),
            lt(crmCustomers.lastReviewRequestAt, sixMonthsAgo)
          )
        )
      );

    console.log(`[ReviewRequest] Found ${completedWorkOrders.length} work orders eligible for review request`);

    const template = await getReviewRequestTemplate();
    const messageBody = template.replace("{reviewLink}", reviewLink);

    for (const wo of completedWorkOrders) {
      const result: ReviewRequestResult = {
        workOrderId: wo.workOrderId,
        customerName: wo.customerName || "Unknown",
        smsSent: false,
      };

      summary.processed++;

      try {
        const alreadySent = await hasNotificationBeenSent(
          "review_request",
          wo.workOrderId,
          "work_order"
        );

        if (alreadySent) {
          result.skippedReason = "Review request already sent for this work order";
          summary.skipped++;
          summary.results.push(result);
          continue;
        }

        if (!wo.customerPhone) {
          result.skippedReason = "No phone number on file";
          result.error = "No phone number";
          summary.skipped++;
          summary.results.push(result);
          continue;
        }

        if (!wo.customerId) {
          result.skippedReason = "No customer linked";
          result.error = "No customer ID";
          summary.skipped++;
          summary.results.push(result);
          continue;
        }

        const smsResult = await sendAutomatedSms({
          customerId: wo.customerId,
          phoneNumber: wo.customerPhone,
          messageBody,
          notificationType: "review_request",
          workOrderId: wo.workOrderId,
        });

        if (smsResult.success) {
          result.smsSent = true;
          summary.sent++;

          await db.update(crmCustomers)
            .set({ lastReviewRequestAt: new Date() })
            .where(eq(crmCustomers.id, wo.customerId));

          console.log(`[ReviewRequest] Review request sent for WO ${wo.workOrderNumber} to ${wo.customerPhone}`);
        } else {
          result.error = smsResult.errorMessage;
          summary.errors++;
          console.error(`[ReviewRequest] Failed to send for WO ${wo.workOrderNumber}:`, smsResult.errorMessage);
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : "Unknown error";
        summary.errors++;
        console.error(`[ReviewRequest] Error processing WO ${wo.workOrderId}:`, err);
      }

      summary.results.push(result);
    }

    await updateCampaignStats(summary.sent);

    console.log(`[ReviewRequest] Summary: ${summary.processed} processed, ${summary.sent} sent, ${summary.skipped} skipped, ${summary.errors} errors`);
  } catch (err) {
    console.error("[ReviewRequest] Error in processReviewRequests:", err);
  }

  return summary;
}

let reviewRequestInterval: NodeJS.Timeout | null = null;

export function startReviewRequestScheduler(): void {
  if (reviewRequestInterval) {
    clearInterval(reviewRequestInterval);
  }

  const INTERVAL_MS = 15 * 60 * 1000;

  reviewRequestInterval = setInterval(async () => {
    try {
      await processReviewRequests();
    } catch (error) {
      console.error("[ReviewRequest] Scheduler error:", error);
    }
  }, INTERVAL_MS);

  console.log("[ReviewRequest] Scheduler started (runs every 15 minutes)");

  setTimeout(async () => {
    try {
      await processReviewRequests();
    } catch (error) {
      console.error("[ReviewRequest] Initial run error:", error);
    }
  }, 5000);
}

export function stopReviewRequestScheduler(): void {
  if (reviewRequestInterval) {
    clearInterval(reviewRequestInterval);
    reviewRequestInterval = null;
    console.log("[ReviewRequest] Scheduler stopped");
  }
}
