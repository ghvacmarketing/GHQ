import { db } from "../db";
import { maintenanceVisits, crmAgreements, crmCustomers } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { toZonedTime, format } from "date-fns-tz";
import { addDays } from "date-fns";
import {
  sendAutomatedSms,
  hasNotificationBeenSent,
  getMaintenance10DayTemplate,
  getMaintenance5DayTemplate,
} from "./smsNotificationService";

const APP_TIMEZONE = "America/New_York";

interface ReminderResult {
  visitId: string;
  agreementNumber: string;
  customerName: string;
  reminderType: "10_day" | "5_day";
  smsSent: boolean;
  error?: string;
}

export interface DailyReminderSummary {
  processedAt: Date;
  remindersProcessed: number;
  smsSent: number;
  skipped: number;
  errors: number;
  results: ReminderResult[];
}

async function processRemindersForDate(
  targetDateStr: string,
  reminderType: "10_day" | "5_day",
  notificationType: "maintenance_reminder_10_day" | "maintenance_reminder_5_day",
  messageTemplate: string
): Promise<ReminderResult[]> {
  const results: ReminderResult[] = [];

  try {
    const visitsToRemind = await db
      .select({
        visitId: maintenanceVisits.id,
        agreementId: maintenanceVisits.agreementId,
        targetDate: maintenanceVisits.targetDate,
        visitStatus: maintenanceVisits.status,
        agreementNumber: crmAgreements.agreementNumber,
        agreementStatus: crmAgreements.status,
        customerId: crmAgreements.customerId,
        customerName: crmAgreements.customerName,
        customerPhone: crmCustomers.phone,
      })
      .from(maintenanceVisits)
      .innerJoin(crmAgreements, eq(maintenanceVisits.agreementId, crmAgreements.id))
      .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
      .where(
        and(
          eq(maintenanceVisits.status, "pending"),
          eq(crmAgreements.status, "active"),
          eq(maintenanceVisits.targetDate, targetDateStr)
        )
      );

    console.log(`[MaintenanceReminder] Found ${visitsToRemind.length} visits for ${reminderType} reminders (target: ${targetDateStr})`);

    for (const visit of visitsToRemind) {
      const result: ReminderResult = {
        visitId: visit.visitId,
        agreementNumber: visit.agreementNumber,
        customerName: visit.customerName,
        reminderType,
        smsSent: false,
      };

      try {
        const alreadySent = await hasNotificationBeenSent(
          notificationType,
          visit.visitId,
          "maintenance_visit"
        );

        if (alreadySent) {
          console.log(`[MaintenanceReminder] ${reminderType} reminder already sent for visit ${visit.visitId}`);
          results.push(result);
          continue;
        }

        if (!visit.customerPhone) {
          console.log(`[MaintenanceReminder] No phone number for customer ${visit.customerName} (agreement ${visit.agreementNumber})`);
          result.error = "No phone number on file";
          results.push(result);
          continue;
        }

        if (!visit.customerId) {
          console.log(`[MaintenanceReminder] No customer ID for agreement ${visit.agreementNumber}`);
          result.error = "No customer ID linked";
          results.push(result);
          continue;
        }

        const smsResult = await sendAutomatedSms({
          customerId: visit.customerId,
          phoneNumber: visit.customerPhone,
          messageBody: messageTemplate,
          notificationType,
          maintenanceVisitId: visit.visitId,
        });

        if (smsResult.success) {
          result.smsSent = true;
          console.log(`[MaintenanceReminder] ${reminderType} reminder sent for visit ${visit.visitId} to ${visit.customerPhone}`);
        } else {
          result.error = smsResult.errorMessage;
          console.error(`[MaintenanceReminder] Failed to send ${reminderType} reminder for visit ${visit.visitId}:`, smsResult.errorMessage);
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : "Unknown error";
        console.error(`[MaintenanceReminder] Error processing visit ${visit.visitId}:`, err);
      }

      results.push(result);
    }
  } catch (err) {
    console.error(`[MaintenanceReminder] Error querying visits for ${reminderType} reminders:`, err);
  }

  return results;
}

export async function processMaintenanceReminders(): Promise<DailyReminderSummary> {
  const summary: DailyReminderSummary = {
    processedAt: new Date(),
    remindersProcessed: 0,
    smsSent: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  try {
    const today = toZonedTime(new Date(), APP_TIMEZONE);
    const todayStr = format(today, "yyyy-MM-dd");
    
    const tenDaysFromNow = addDays(today, 10);
    const tenDaysStr = format(tenDaysFromNow, "yyyy-MM-dd");
    
    const fiveDaysFromNow = addDays(today, 5);
    const fiveDaysStr = format(fiveDaysFromNow, "yyyy-MM-dd");

    console.log(`[MaintenanceReminder] Processing reminders for date: ${todayStr}`);
    console.log(`[MaintenanceReminder] Looking for visits on: ${tenDaysStr} (10-day) and ${fiveDaysStr} (5-day)`);

    const tenDayTemplate = await getMaintenance10DayTemplate();
    const tenDayResults = await processRemindersForDate(
      tenDaysStr,
      "10_day",
      "maintenance_reminder_10_day",
      tenDayTemplate
    );

    const fiveDayTemplate = await getMaintenance5DayTemplate();
    const fiveDayResults = await processRemindersForDate(
      fiveDaysStr,
      "5_day",
      "maintenance_reminder_5_day",
      fiveDayTemplate
    );

    summary.results = [...tenDayResults, ...fiveDayResults];
    
    for (const result of summary.results) {
      summary.remindersProcessed++;
      if (result.smsSent) {
        summary.smsSent++;
      } else if (result.error) {
        summary.errors++;
      } else {
        summary.skipped++;
      }
    }

    console.log(`[MaintenanceReminder] Summary: ${summary.remindersProcessed} processed, ${summary.smsSent} SMS sent, ${summary.skipped} skipped, ${summary.errors} errors`);
    
    return summary;
  } catch (err) {
    console.error("[MaintenanceReminder] Fatal error during reminder processing:", err);
    throw err;
  }
}

let reminderInterval: NodeJS.Timeout | null = null;

export function scheduleMaintenanceReminders(): void {
  processMaintenanceReminders().catch(err => {
    console.error("[MaintenanceReminder] Error in initial run:", err);
  });

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  reminderInterval = setInterval(() => {
    processMaintenanceReminders().catch(err => {
      console.error("[MaintenanceReminder] Error in scheduled run:", err);
    });
  }, TWENTY_FOUR_HOURS);

  console.log("[MaintenanceReminder] Daily reminder job scheduled");
}

export function stopMaintenanceReminders(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log("[MaintenanceReminder] Scheduled job stopped");
  }
}
