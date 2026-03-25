import { Resend } from "resend";
import { db } from "../db";
import { crmWorkOrders, crmCustomers, settings } from "@shared/schema";
import { eq, and, isNull, gte, lte } from "drizzle-orm";
import { addMinutes } from "date-fns";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "quotes@ghvac.work";
const BRAND_COLOR = process.env.BRAND_COLOR || "#711419";
const BRAND_NAME = process.env.BRAND_NAME || "Giesbrecht HVAC";
const LOGO_URL = "https://images.squarespace-cdn.com/content/v1/65b2790c0b83175df7337294/93a31506-d2ae-4e07-958b-c86d0c49f7cd/GHVAC-icons.png?format=200w";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseHtml(title: string, preheader: string, body: string): string {
  return `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light only; }
    body { margin:0; padding:0; background:#f3f4f6; font-family:Arial,sans-serif; }
    @media only screen and (max-width:600px) {
      .container { width:100% !important; border-radius:0 !important; }
      .px { padding-left:14px !important; padding-right:14px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;overflow:hidden;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 0;">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0"
          style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(16,24,40,0.08);max-width:580px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_COLOR};padding:18px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${LOGO_URL}" alt="${esc(BRAND_NAME)}" width="90" style="height:auto;border:0;display:block;" />
                  </td>
                  <td style="vertical-align:middle;text-align:right;">
                    <div style="font-size:16px;font-weight:900;color:#fff;letter-spacing:0.2px;">${esc(title)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${body}

          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;font-family:Arial,sans-serif;">
              <strong style="color:#111827;">${esc(BRAND_NAME)}</strong><br/>
              Professional HVAC Service &amp; Installation<br/>
              <span style="font-size:11px;margin-top:6px;display:block;">This is an automated message — please do not reply to this email.</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function getTemplateSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
    return row?.value || defaultValue;
  } catch {
    return defaultValue;
  }
}

function applyPlaceholders(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), template);
}

interface BookingEmailParams {
  customerName: string;
  email: string;
  workOrderNumber: number;
  serviceType: string;
  preferredDate: string;
  preferredTimeSlot: string;
  address?: string;
}

interface BookingEmailTemplates {
  confirmSubject: string;
  confirmIntro: string;
  confirmNextSteps: string;
  remindSubject: string;
  remindIntro: string;
}

async function fetchBookingEmailTemplates(p: BookingEmailParams): Promise<BookingEmailTemplates> {
  const firstName = p.customerName.split(" ")[0];
  const vars: Record<string, string> = {
    brand_name: BRAND_NAME,
    customer_name: p.customerName,
    customer_first_name: firstName,
    work_order_number: String(p.workOrderNumber),
    service_type: p.serviceType,
    time_window: p.preferredTimeSlot,
  };

  const [confirmSubject, confirmIntro, confirmNextSteps, remindSubject, remindIntro] = await Promise.all([
    getTemplateSetting("email_template_booking_confirm_subject", `Booking Confirmed — ${BRAND_NAME} #${p.workOrderNumber}`),
    getTemplateSetting("email_template_booking_confirm_intro", `Thanks for booking with ${BRAND_NAME}. Here's a summary of your appointment request. Our team will reach out shortly to confirm the final time.`),
    getTemplateSetting("email_template_booking_confirm_next_steps", "Our scheduling team will call or text you within 1 business day to confirm your appointment time. Please have your system make/model handy if possible."),
    getTemplateSetting("email_template_booking_remind_subject", `Reminder: Your appointment is today — ${BRAND_NAME}`),
    getTemplateSetting("email_template_booking_remind_intro", `Hi ${firstName}, just a friendly reminder that your ${BRAND_NAME} technician is scheduled to arrive during your time window today.`),
  ]);

  return {
    confirmSubject: applyPlaceholders(confirmSubject, vars),
    confirmIntro: applyPlaceholders(confirmIntro, vars),
    confirmNextSteps: applyPlaceholders(confirmNextSteps, vars),
    remindSubject: applyPlaceholders(remindSubject, vars),
    remindIntro: applyPlaceholders(remindIntro, vars),
  };
}

function buildConfirmationHtml(p: BookingEmailParams, tmpl: BookingEmailTemplates): string {
  const body = `
  <!-- Greeting -->
  <tr>
    <td class="px" style="padding:28px 24px 10px;">
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:900;">We got your request, ${esc(p.customerName.split(" ")[0])}!</h2>
      <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.55;">${esc(tmpl.confirmIntro)}</p>
    </td>
  </tr>

  <!-- Details Card -->
  <tr>
    <td class="px" style="padding:16px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Booking Reference</div>
            <div style="font-size:18px;font-weight:900;color:${BRAND_COLOR};margin-top:4px;">#${p.workOrderNumber}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Service</div>
            <div style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${esc(p.serviceType)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Preferred Date</div>
            <div style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${esc(p.preferredDate)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;${p.address ? "border-bottom:1px solid #e5e7eb;" : ""}">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Preferred Time Window</div>
            <div style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${esc(p.preferredTimeSlot)}</div>
          </td>
        </tr>
        ${p.address ? `
        <tr>
          <td style="padding:14px 20px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Service Address</div>
            <div style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${esc(p.address)}</div>
          </td>
        </tr>` : ""}
      </table>
    </td>
  </tr>

  <!-- What's Next -->
  <tr>
    <td class="px" style="padding:8px 24px 28px;">
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
        <div style="font-weight:800;color:#92400e;font-size:13px;">What happens next?</div>
        <div style="margin-top:6px;color:#78350f;font-size:13px;line-height:1.6;">${esc(tmpl.confirmNextSteps)}</div>
      </div>
    </td>
  </tr>`;

  return baseHtml(
    "Booking Confirmation",
    `Your ${p.serviceType} request is confirmed — Booking #${p.workOrderNumber}`,
    body,
  );
}

function buildReminderHtml(p: BookingEmailParams, tmpl: BookingEmailTemplates): string {
  const body = `
  <!-- Greeting -->
  <tr>
    <td class="px" style="padding:28px 24px 10px;">
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:900;">Your appointment is in ~2 hours</h2>
      <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.55;">${esc(tmpl.remindIntro)}</p>
    </td>
  </tr>

  <!-- Details Card -->
  <tr>
    <td class="px" style="padding:16px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Service</div>
            <div style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${esc(p.serviceType)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Arrival Window</div>
            <div style="font-size:15px;font-weight:900;color:${BRAND_COLOR};margin-top:4px;">${esc(p.preferredTimeSlot)}</div>
          </td>
        </tr>
        ${p.address ? `
        <tr>
          <td style="padding:14px 20px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:700;">Service Address</div>
            <div style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${esc(p.address)}</div>
          </td>
        </tr>` : ""}
      </table>
    </td>
  </tr>

  <!-- Tips -->
  <tr>
    <td class="px" style="padding:8px 24px 28px;">
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 16px;">
        <div style="font-weight:800;color:#065f46;font-size:13px;">To help us serve you faster</div>
        <ul style="margin:8px 0 0;padding-left:18px;color:#047857;font-size:13px;line-height:1.7;">
          <li>Ensure access to your HVAC unit (indoor &amp; outdoor)</li>
          <li>Have any previous service records handy</li>
          <li>Note the make/model of your system if possible</li>
        </ul>
      </div>
    </td>
  </tr>`;

  return baseHtml(
    "Appointment Reminder",
    `Your ${p.serviceType} is today — technician arriving ${p.preferredTimeSlot}`,
    body,
  );
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!resend) {
    console.warn("[BookingEmail] RESEND_API_KEY not configured — skipping email to", to);
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
      headers: { "X-Entity-Ref-ID": `booking-${Date.now()}` },
    });
    if (error) {
      console.error("[BookingEmail] Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[BookingEmail] Send failed:", err);
    return false;
  }
}

export async function sendBookingConfirmation(params: {
  workOrderId: string;
  workOrderNumber: number;
  customerName: string;
  email: string;
  serviceType: string;
  preferredDate: string;
  preferredTimeSlot: string;
  address?: string;
}): Promise<boolean> {
  const { workOrderId, email, customerName, workOrderNumber, serviceType, preferredDate, preferredTimeSlot, address } = params;

  const emailParams: BookingEmailParams = { customerName, email, workOrderNumber, serviceType, preferredDate, preferredTimeSlot, address };
  const tmpl = await fetchBookingEmailTemplates(emailParams);
  const html = buildConfirmationHtml(emailParams, tmpl);
  const text = `Hi ${customerName},\n\nYour ${serviceType} booking is confirmed!\n\nBooking #${workOrderNumber}\nDate: ${preferredDate}\nTime: ${preferredTimeSlot}\n\n${tmpl.confirmNextSteps}\n\n${BRAND_NAME}`;

  const sent = await sendEmail(email, tmpl.confirmSubject, html, text);
  if (sent) {
    await db.update(crmWorkOrders)
      .set({ bookingConfirmationSentAt: new Date() })
      .where(eq(crmWorkOrders.id, workOrderId));
    console.log(`[BookingEmail] Confirmation sent to ${email} for WO #${workOrderNumber}`);
  }
  return sent;
}

export async function sendBookingReminder(params: {
  workOrderId: string;
  workOrderNumber: number;
  customerName: string;
  email: string;
  serviceType: string;
  preferredDate: string;
  preferredTimeSlot: string;
  address?: string;
}): Promise<boolean> {
  const { workOrderId, email, customerName, workOrderNumber, serviceType, preferredDate, preferredTimeSlot, address } = params;

  const emailParams: BookingEmailParams = { customerName, email, workOrderNumber, serviceType, preferredDate, preferredTimeSlot, address };
  const tmpl = await fetchBookingEmailTemplates(emailParams);
  const html = buildReminderHtml(emailParams, tmpl);
  const text = `${tmpl.remindIntro}\n\nArrival window: ${preferredTimeSlot}\n\nPlease ensure access to your HVAC unit. We look forward to helping you!\n\n${BRAND_NAME}`;

  const sent = await sendEmail(email, tmpl.remindSubject, html, text);
  if (sent) {
    await db.update(crmWorkOrders)
      .set({ bookingReminderSentAt: new Date() })
      .where(eq(crmWorkOrders.id, workOrderId));
    console.log(`[BookingEmail] Reminder sent to ${email} for WO #${workOrderNumber}`);
  }
  return sent;
}

async function processBookingReminders(): Promise<void> {
  const now = new Date();
  const windowStart = addMinutes(now, 110);
  const windowEnd = addMinutes(now, 130);

  try {
    const upcoming = await db
      .select({
        id: crmWorkOrders.id,
        workOrderNumber: crmWorkOrders.workOrderNumber,
        title: crmWorkOrders.title,
        scheduledStart: crmWorkOrders.scheduledStart,
        preferredTimeSlot: crmWorkOrders.preferredTimeSlot,
        bookingReminderSentAt: crmWorkOrders.bookingReminderSentAt,
        customerId: crmWorkOrders.customerId,
      })
      .from(crmWorkOrders)
      .where(
        and(
          eq(crmWorkOrders.bookingSource, "online"),
          isNull(crmWorkOrders.bookingReminderSentAt),
          gte(crmWorkOrders.scheduledStart, windowStart),
          lte(crmWorkOrders.scheduledStart, windowEnd),
        )
      );

    if (upcoming.length === 0) return;

    console.log(`[BookingEmail] Found ${upcoming.length} appointment(s) needing 2-hour reminder`);

    for (const wo of upcoming) {
      if (!wo.customerId) continue;

      const [customer] = await db
        .select({ name: crmCustomers.name, email: crmCustomers.email })
        .from(crmCustomers)
        .where(eq(crmCustomers.id, wo.customerId));

      if (!customer?.email) {
        console.warn(`[BookingEmail] No email for customer of WO #${wo.workOrderNumber} — skipping reminder`);
        continue;
      }

      const serviceType = wo.title?.includes("Consultation") ? "Comfort Consultation" : "HVAC Service Call";
      const preferredSlotDisplay = wo.preferredTimeSlot || "your scheduled time window";
      const preferredDateDisplay = wo.scheduledStart
        ? wo.scheduledStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : "today";

      await sendBookingReminder({
        workOrderId: wo.id,
        workOrderNumber: wo.workOrderNumber,
        customerName: customer.name || "Valued Customer",
        email: customer.email,
        serviceType,
        preferredDate: preferredDateDisplay,
        preferredTimeSlot: preferredSlotDisplay,
      });
    }
  } catch (err) {
    console.error("[BookingEmail] Error processing reminders:", err);
  }
}

let reminderInterval: NodeJS.Timeout | null = null;

export function scheduleBookingReminders(): void {
  if (reminderInterval) return;
  processBookingReminders().catch(console.error);
  reminderInterval = setInterval(() => {
    processBookingReminders().catch(console.error);
  }, 30 * 60 * 1000);
  console.log("[BookingEmail] Reminder scheduler started (checks every 30 min)");
}

export function stopBookingReminders(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
