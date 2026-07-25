import OpenAI from "openai";
import { claudeConfigured, claudeChat, claudeErrorHint, stripJsonFences } from "./claude";
import { db } from "../db";
import { crmWorkOrders, crmAgreements, crmCustomers, crmProjects, crmInvoices, crmQuotes } from "@shared/schema";
import { eq, gte, lte, and, or, sql, desc, isNull, isNotNull } from "drizzle-orm";
import { addDays, subDays, format, startOfDay, endOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// All business scheduling happens in the shop's local timezone.
const BUSINESS_TIMEZONE = "America/New_York";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "sk-not-configured",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

interface LiveDataContext {
  upcomingWorkOrders?: any[];
  todaysWorkOrders?: any[];
  activeAgreements?: any[];
  pendingAgreements?: any[];
  expiringAgreements?: any[];
  recentInvoices?: any[];
  unpaidInvoices?: any[];
  openProjects?: any[];
  recentQuotes?: any[];
  stats?: {
    totalCustomers: number;
    activeAgreements: number;
    scheduledWorkOrders: number;
    unpaidInvoices: number;
  };
}

async function detectDataNeed(question: string): Promise<string[]> {
  const lowerQ = question.toLowerCase();
  const needs: string[] = [];
  
  if (lowerQ.includes("work order") || lowerQ.includes("appointment") || lowerQ.includes("schedule") || 
      lowerQ.includes("upcoming") || lowerQ.includes("today") || lowerQ.includes("tomorrow") ||
      lowerQ.includes("this week") || lowerQ.includes("next week")) {
    needs.push("workOrders");
  }
  if (lowerQ.includes("agreement") || lowerQ.includes("maintenance") || lowerQ.includes("contract") ||
      lowerQ.includes("expir") || lowerQ.includes("renew")) {
    needs.push("agreements");
  }
  if (lowerQ.includes("invoice") || lowerQ.includes("unpaid") || lowerQ.includes("payment") ||
      lowerQ.includes("owed") || lowerQ.includes("outstanding") || lowerQ.includes("bill")) {
    needs.push("invoices");
  }
  if (lowerQ.includes("project") || lowerQ.includes("install") || lowerQ.includes("job")) {
    needs.push("projects");
  }
  if (lowerQ.includes("quote") || lowerQ.includes("proposal") || lowerQ.includes("estimate")) {
    needs.push("quotes");
  }
  if (lowerQ.includes("how many") || lowerQ.includes("total") || lowerQ.includes("count") || 
      lowerQ.includes("stats") || lowerQ.includes("overview") || lowerQ.includes("summary")) {
    needs.push("stats");
  }
  
  return needs.length > 0 ? needs : ["stats"];
}

async function fetchLiveData(needs: string[]): Promise<LiveDataContext> {
  const context: LiveDataContext = {};
  const now = new Date();
  const today = startOfDay(now);
  const endToday = endOfDay(now);
  const nextWeek = addDays(now, 7);
  const next30Days = addDays(now, 30);
  
  try {
    if (needs.includes("workOrders")) {
      const upcoming = await db
        .select({
          id: crmWorkOrders.id,
          workOrderNumber: crmWorkOrders.workOrderNumber,
          title: crmWorkOrders.title,
          status: crmWorkOrders.status,
          scheduledStart: crmWorkOrders.scheduledStart,
          visitType: crmWorkOrders.visitType,
          customerName: crmCustomers.name,
        })
        .from(crmWorkOrders)
        .leftJoin(crmCustomers, eq(crmWorkOrders.customerId, crmCustomers.id))
        .where(
          and(
            gte(crmWorkOrders.scheduledStart, now),
            lte(crmWorkOrders.scheduledStart, next30Days)
          )
        )
        .orderBy(crmWorkOrders.scheduledStart)
        .limit(20);
      context.upcomingWorkOrders = upcoming;

      const todays = await db
        .select({
          id: crmWorkOrders.id,
          workOrderNumber: crmWorkOrders.workOrderNumber,
          title: crmWorkOrders.title,
          status: crmWorkOrders.status,
          scheduledStart: crmWorkOrders.scheduledStart,
          visitType: crmWorkOrders.visitType,
          customerName: crmCustomers.name,
        })
        .from(crmWorkOrders)
        .leftJoin(crmCustomers, eq(crmWorkOrders.customerId, crmCustomers.id))
        .where(
          and(
            gte(crmWorkOrders.scheduledStart, today),
            lte(crmWorkOrders.scheduledStart, endToday)
          )
        )
        .orderBy(crmWorkOrders.scheduledStart)
        .limit(20);
      context.todaysWorkOrders = todays;
    }

    if (needs.includes("agreements")) {
      const active = await db
        .select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          name: crmAgreements.agreementPlan,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
          nextVisitDate: crmAgreements.nextServiceDate,
          expirationDate: crmAgreements.endDate,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(eq(crmAgreements.status, "active"))
        .orderBy(crmAgreements.nextServiceDate)
        .limit(15);
      context.activeAgreements = active;

      const pending = await db
        .select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          name: crmAgreements.agreementPlan,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(eq(crmAgreements.status, "pending"))
        .limit(10);
      context.pendingAgreements = pending;

      const expiring = await db
        .select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          name: crmAgreements.agreementPlan,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
          expirationDate: crmAgreements.endDate,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(
          and(
            eq(crmAgreements.status, "active"),
            // endDate is a date column (string), so compare with YYYY-MM-DD
            lte(crmAgreements.endDate, next30Days.toISOString().slice(0, 10)),
            gte(crmAgreements.endDate, now.toISOString().slice(0, 10))
          )
        )
        .orderBy(crmAgreements.endDate)
        .limit(10);
      context.expiringAgreements = expiring;
    }

    if (needs.includes("invoices")) {
      const unpaid = await db
        .select({
          id: crmInvoices.id,
          invoiceNumber: crmInvoices.invoiceNumber,
          totalAmount: crmInvoices.total,
          status: crmInvoices.status,
          customerName: crmCustomers.name,
          sentAt: crmInvoices.sentAt,
        })
        .from(crmInvoices)
        .leftJoin(crmCustomers, eq(crmInvoices.customerId, crmCustomers.id))
        .where(eq(crmInvoices.status, "sent"))
        .orderBy(desc(crmInvoices.sentAt))
        .limit(15);
      context.unpaidInvoices = unpaid;

      const recent = await db
        .select({
          id: crmInvoices.id,
          invoiceNumber: crmInvoices.invoiceNumber,
          totalAmount: crmInvoices.total,
          status: crmInvoices.status,
          customerName: crmCustomers.name,
        })
        .from(crmInvoices)
        .leftJoin(crmCustomers, eq(crmInvoices.customerId, crmCustomers.id))
        .orderBy(desc(crmInvoices.createdAt))
        .limit(10);
      context.recentInvoices = recent;
    }

    if (needs.includes("projects")) {
      const open = await db
        .select({
          id: crmProjects.id,
          title: crmProjects.title,
          status: crmProjects.status,
          projectType: crmProjects.projectType,
          startDate: crmProjects.startDate,
          endDate: crmProjects.endDate,
          expectedValue: crmProjects.expectedValue,
          customerName: crmCustomers.name,
        })
        .from(crmProjects)
        .leftJoin(crmCustomers, eq(crmProjects.customerId, crmCustomers.id))
        .where(
          or(
            eq(crmProjects.status, "lead"),
            eq(crmProjects.status, "proposal_sent"),
            eq(crmProjects.status, "equipment_ordered"),
            eq(crmProjects.status, "equipment_arrived"),
            eq(crmProjects.status, "in_progress")
          )
        )
        .orderBy(crmProjects.startDate)
        .limit(15);
      context.openProjects = open;
    }

    if (needs.includes("quotes")) {
      const recent = await db
        .select({
          id: crmQuotes.id,
          quoteNumber: crmQuotes.quoteNumber,
          title: crmQuotes.title,
          status: crmQuotes.status,
          totalAmount: crmQuotes.total,
          customerName: crmCustomers.name,
        })
        .from(crmQuotes)
        .leftJoin(crmCustomers, eq(crmQuotes.customerId, crmCustomers.id))
        .orderBy(desc(crmQuotes.createdAt))
        .limit(10);
      context.recentQuotes = recent;
    }

    if (needs.includes("stats")) {
      const [customerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmCustomers);
      const [agreementCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmAgreements).where(eq(crmAgreements.status, "active"));
      const [woCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmWorkOrders).where(and(eq(crmWorkOrders.status, "scheduled"), gte(crmWorkOrders.scheduledStart, now)));
      const [invoiceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(crmInvoices).where(eq(crmInvoices.status, "sent"));
      
      context.stats = {
        totalCustomers: customerCount?.count || 0,
        activeAgreements: agreementCount?.count || 0,
        scheduledWorkOrders: woCount?.count || 0,
        unpaidInvoices: invoiceCount?.count || 0,
      };
    }
  } catch (error) {
    console.error("[CRM Help AI] Error fetching live data:", error);
  }

  return context;
}

function formatLiveDataForPrompt(context: LiveDataContext): string {
  const sections: string[] = [];
  // The server runs in UTC — format "today" in the shop's timezone or evening
  // questions get tomorrow's date.
  const today = formatInTimeZone(new Date(), BUSINESS_TIMEZONE, "EEEE, MMMM d, yyyy");
  
  sections.push(`\n\n## LIVE DATA (as of ${today})\n`);
  
  if (context.stats) {
    sections.push(`### Current Stats
- Total Customers: ${context.stats.totalCustomers}
- Active Maintenance Agreements: ${context.stats.activeAgreements}
- Scheduled Work Orders: ${context.stats.scheduledWorkOrders}
- Unpaid Invoices: ${context.stats.unpaidInvoices}`);
  }

  if (context.todaysWorkOrders && context.todaysWorkOrders.length > 0) {
    sections.push(`### Today's Work Orders (${context.todaysWorkOrders.length} scheduled)`);
    context.todaysWorkOrders.forEach(wo => {
      const time = wo.scheduledStart ? format(new Date(wo.scheduledStart), "h:mm a") : "TBD";
      sections.push(`- ${wo.workOrderNumber || wo.title}: ${wo.customerName || "Unknown"} at ${time} (${wo.status})`);
    });
  }

  if (context.upcomingWorkOrders && context.upcomingWorkOrders.length > 0) {
    sections.push(`### Upcoming Work Orders (next 30 days)`);
    context.upcomingWorkOrders.slice(0, 10).forEach(wo => {
      const date = wo.scheduledStart ? format(new Date(wo.scheduledStart), "MMM d") : "TBD";
      sections.push(`- ${wo.workOrderNumber || wo.title}: ${wo.customerName || "Unknown"} on ${date} (${wo.visitType || wo.status})`);
    });
    if (context.upcomingWorkOrders.length > 10) {
      sections.push(`... and ${context.upcomingWorkOrders.length - 10} more`);
    }
  }

  if (context.activeAgreements && context.activeAgreements.length > 0) {
    sections.push(`### Active Maintenance Agreements (${context.activeAgreements.length} total)`);
    context.activeAgreements.slice(0, 8).forEach(a => {
      const nextVisit = a.nextVisitDate ? format(new Date(a.nextVisitDate), "MMM d") : "Not scheduled";
      sections.push(`- ${a.agreementNumber || a.name}: ${a.customerName || "Unknown"} - Next visit: ${nextVisit}`);
    });
  }

  if (context.pendingAgreements && context.pendingAgreements.length > 0) {
    sections.push(`### Pending Agreements (awaiting first payment): ${context.pendingAgreements.length}`);
    context.pendingAgreements.forEach(a => {
      sections.push(`- ${a.agreementNumber || a.name}: ${a.customerName || "Unknown"}`);
    });
  }

  if (context.expiringAgreements && context.expiringAgreements.length > 0) {
    sections.push(`### Agreements Expiring Soon (next 30 days)`);
    context.expiringAgreements.forEach(a => {
      const exp = a.expirationDate ? format(new Date(a.expirationDate), "MMM d") : "TBD";
      sections.push(`- ${a.agreementNumber || a.name}: ${a.customerName || "Unknown"} - Expires: ${exp}`);
    });
  }

  if (context.unpaidInvoices && context.unpaidInvoices.length > 0) {
    sections.push(`### Unpaid Invoices (${context.unpaidInvoices.length} outstanding)`);
    context.unpaidInvoices.slice(0, 8).forEach(inv => {
      const amount = inv.totalAmount ? `$${parseFloat(inv.totalAmount).toFixed(2)}` : "TBD";
      sections.push(`- ${inv.invoiceNumber}: ${inv.customerName || "Unknown"} - ${amount}`);
    });
  }

  if (context.openProjects && context.openProjects.length > 0) {
    sections.push(`### Open Projects (${context.openProjects.length} in progress)`);
    context.openProjects.slice(0, 8).forEach(p => {
      const value = p.expectedValue ? `$${parseFloat(p.expectedValue).toLocaleString()}` : "TBD";
      sections.push(`- ${p.title}: ${p.customerName || "Unknown"} (${p.status}) - ${value}`);
    });
  }

  if (context.recentQuotes && context.recentQuotes.length > 0) {
    sections.push(`### Recent Quotes`);
    context.recentQuotes.slice(0, 5).forEach(q => {
      const amount = q.totalAmount ? `$${parseFloat(q.totalAmount).toFixed(2)}` : "TBD";
      sections.push(`- ${q.quoteNumber || q.title}: ${q.customerName || "Unknown"} - ${amount} (${q.status})`);
    });
  }

  return sections.join("\n");
}

const CRM_FUNCTIONALITY_KNOWLEDGE = `
# GHVAC CRM System - Complete Feature Guide

## INVOICES

### Invoice Types
- **Standard Invoice**: Regular invoice for completed work
- **Maintenance Invoice**: Auto-generated for maintenance agreement renewals

### Invoice Statuses
- **Draft**: Invoice is being prepared, not visible to customer
- **Sent**: Invoice has been emailed/texted to customer, awaiting payment
- **Viewed**: Customer has opened/viewed the invoice but not yet paid
- **Paid**: Payment has been received and recorded in full
- **Partial**: Partial payment has been received, balance still due
- **Void**: Invoice cancelled, no longer valid

### Auto Pay / Auto Invoice
When creating or editing an invoice, the "Auto Pay" or "Auto Invoice" option means:
- The system will automatically generate and send renewal invoices for maintenance agreements
- For maintenance agreements with "auto_invoice" billing preference, the system checks daily for agreements due for renewal
- When nextInvoiceDate is reached, a new invoice is automatically created and emailed to the customer
- This eliminates manual invoice creation for recurring maintenance customers

### Invoice Payment Methods
- **Stripe**: Customer pays via credit card through secure payment link
- **Manual Payment**: Record check, cash, or other payment methods
- **Financing**: Customer applied for financing (GreenSky or other provider)

### Invoice Portal
- Customers receive a unique link to view and pay their invoice online
- Portal shows invoice details, line items, and total
- Payment button links to Stripe checkout
- Portal tracks when customer views the invoice

---

## MAINTENANCE AGREEMENTS

### Agreement Statuses
- **Pending**: New agreement awaiting first payment. No visits scheduled yet.
- **Active**: Agreement is fully operational. Customer has paid, visits are scheduled.
- **Grace Period**: Renewal invoice was sent, customer has 30 days to pay before expiration.
- **Expired**: Grace period passed without payment. Agreement is no longer active.
- **Cancelled**: Agreement was manually cancelled.

### Billing Preferences (IMPORTANT: Choose when creating agreement)
When creating a new maintenance agreement, you must choose a billing preference:

- **Auto Invoice (autopay)**: 
  * System automatically generates and sends renewal invoices when due
  * Customer receives invoice via email with payment link
  * Payment is collected remotely via Stripe
  * Best for: Customers who prefer to pay online without technician involvement
  * Renewal invoices are sent automatically based on nextInvoiceDate
  
- **Pay on Visit**: 
  * NO automatic invoicing - technician collects payment in person
  * Payment is collected during the actual maintenance visit
  * Best for: Customers who prefer to pay cash/check on-site
  * No emails or automatic billing sent to customer

### Which Billing Preference Should I Choose?
- Choose **Auto Invoice** if the customer wants hands-off automatic billing and will pay by credit card online
- Choose **Pay on Visit** if the customer prefers to pay cash, check, or in-person during the maintenance appointment

### Agreement Lifecycle
1. Agreement created → Status: "Pending", isInitialCycle: true
2. Admin clicks "Send First Invoice" → Invoice sent to customer
3. Customer pays first invoice → Status changes to "Active", activationDate recorded, isInitialCycle: false
4. When nextInvoiceDate arrives (for auto_invoice only):
   - System generates renewal invoice automatically
   - Status changes to "Grace Period" (30-day window)
5. Customer pays renewal → New maintenance visits scheduled for next cycle
6. If 30 days pass without payment → Status: "Expired"

### Visits
- Maintenance visits are scheduled based on agreement frequency
- Visits have statuses: Scheduled, Completed, Cancelled
- Technicians see visits on their mobile app agenda
- When a visit is completed, it's marked done and logged

### Important Notes
- "Send First Invoice" button only appears for pending agreements with isInitialCycle=true
- Renewal processing only runs for active, non-initial, auto_invoice agreements
- Admin can manually trigger "Process Renewals" from the Agreements page

---

## WORK ORDERS

### Work Order Statuses
- **New**: Newly created, not yet scheduled
- **Scheduled**: Appointment is booked, waiting for dispatch
- **Dispatched**: Assigned to a technician
- **En Route**: Technician is traveling to the job site (auto-SMS sent to customer)
- **On Site**: Technician has arrived (auto-SMS sent to customer)
- **Completed**: Work is finished
- **Invoiced**: Work order has been invoiced
- **Paid**: Invoice for work order has been paid
- **Cancelled**: Work order was cancelled

### Work Order Types (Visit Types)
- **Service**: Repair, diagnostic, troubleshooting visit
- **Install**: Equipment installation (includes crawlspace encapsulation as a subtype)
- **Maintenance**: Scheduled tune-up or preventive maintenance
- **Sales**: Sales-related visit or consultation

### Work Order Subtypes
- Configurable via Settings > Work Order Subtypes
- Allows further categorization within each work order type (e.g., "Diagnostic", "Repair", "Tune-Up" under Service)
- Subtypes help with reporting and filtering

### Service Call Checklists
- Dynamic questionnaires based on service type
- Technicians complete checklists during the visit
- AI summarizes checklist responses for customer records
- Required questions must be answered before completing
- Checklists are configured in Settings > Service Checklists

### Linking to Projects
- Work orders can be standalone or linked to a project
- Project-linked work orders contribute to project progress
- Multiple work orders can belong to one project

---

## PROJECTS

### Project Statuses (Pipeline)
- **New (Lead)**: Initial inquiry, qualifying the opportunity
- **Proposal Sent**: Quote/proposal delivered to customer
- **Equipment Ordered**: Equipment has been ordered for the project
- **Equipment Arrived**: Equipment received, ready for installation
- **In Progress**: Active work underway
- **Completed**: All work finished
- **Closed**: Finalized, invoiced, and archived
- **Cancelled**: Project was cancelled

### Project Status Flow
Projects follow this simplified flow: New → Equipment Ordered → Equipment Arrived → In Progress → Completed → Closed

### Project Scheduling
- Projects REQUIRE start and end dates when created
- Displayed on the calendar view as continuous colored bars
- All projects appear on the Calendar tab by date range

### Project Value
- **Expected Value**: Populated when a quote is accepted
- **Actual Value**: Sum of paid invoices linked to the project

### Project Timeline
- Shows all activity chronologically
- Notes, photos, files, status changes
- Financial updates and milestones

---

## QUOTES

### Quote Statuses
- **Draft**: Being prepared, not sent to customer
- **Sent**: Delivered to customer via email
- **Accepted**: Customer approved the quote
- **Declined**: Customer rejected the quote
- **Expired**: Quote validity period passed
- **Converted**: Quote has been converted into an invoice or project

### Quote Types
- **Custom Install**: High-value installation proposals ($5k+), deposit required
- **Service Quote**: Repair proposals
- **Proposal**: Formal project proposals
- **Custom Service**: Non-standard service work

### Quote Acceptance Flow
1. Quote is created and sent to customer
2. Customer reviews via email link
3. Customer clicks Accept/Decline
4. If accepted:
   - Quote status → "Accepted"
   - If linked to project, project expectedValue is updated
   - Optional: Auto-create work order or invoice

### Financing Display
- Install quotes show dual payment options:
  1. Pay deposit via Stripe
  2. Apply for financing (GreenSky link)
- Financing link is configurable in CRM Settings > Payment Settings

---

## CUSTOMERS

### Customer Types
- **Residential**: Single-family homes, condos, apartments
- **Commercial**: Businesses, offices, retail spaces
- **Property Manager**: Manages multiple properties

### Properties
- Customers can have multiple service properties
- Each property has its own address and property type
- Property type (residential/commercial) affects QuickBooks class assignment

### Customer Portal
- Self-service portal for customers
- View invoices, agreements, service history
- Access via magic link login (no password needed)

---

## TAGGED COMMENTS & PAGE NOTES

### What are Tagged Comments?
Tagged comments (also called "page notes") let any CRM user leave context-specific notes or comments on ANY page in the CRM. Think of them like sticky notes attached to a specific page.

### How to Use
- Look for the **comment icon** (speech bubble) in the bottom-right corner of any CRM page
- Click it to open the comments panel for that specific page
- Type a note and optionally **tag/mention** another user by selecting them
- Tagged users receive a **notification** alerting them to the comment

### Key Features
- Comments are page-specific — a comment on the Invoices page stays on that page
- Tagged users see the comment in their **Notifications** panel
- Comments can be **resolved** (marked as handled) or **dismissed**
- Great for team collaboration: "Hey @John, check this customer's agreement" or "Reminder: follow up on this quote"

### Where to Find Tagged Comments
- The **Notifications** page (/crm/notifications) shows all comments where you were tagged
- Each page shows its own comments when you open the comments panel

---

## LEAD FUNNEL (PROSPECT MANAGEMENT)

### What is the Lead Funnel?
The Lead Funnel (sidebar: "Lead Funnel", URL: /crm/prospect-funnel) is a Kanban-style sales pipeline for managing prospects and leads through the sales process.

### Lead Classification
Leads are classified on two dimensions:
- **Lead Temperature**: Hot, Warm, Cold — indicates urgency/likelihood of closing
- **Customer Driver**: What motivated the customer (e.g., equipment failure, upgrade, new construction)

### Lead Types
- Configurable in Settings > Lead Types
- Define custom categories for incoming leads (e.g., "Website Inquiry", "Referral", "Repeat Customer")

### Prospect Lifecycle
1. New prospect enters the funnel (manually created or from online booking)
2. Classified by temperature and driver
3. Follow-ups are scheduled and tracked
4. Prospect converts to a quote/project or is marked as lost

### Follow-up System
- Each prospect can have scheduled follow-ups with due dates
- Follow-up types: Call, Text, Email, Visit
- Follow-ups appear in the prospect detail and can include notes
- Overdue follow-ups are highlighted for attention

### Prospect Metrics
- Active prospects count
- Pending actions / overdue follow-ups
- Potential revenue in pipeline
- Conversion rates and sales leaderboard

---

## ITEMS (LINE ITEMS)

### What is the Items Page?
The Items page (sidebar: "Items", URL: /crm/items) is a centralized catalog of all line items used across quotes, invoices, and work orders.

### Purpose
- Manage reusable line items with descriptions and default pricing
- When creating a quote or invoice, you can pull items from this catalog
- Keeps pricing consistent across the team
- Items can be equipment, labor, materials, or services

---

## GOALS & REVENUE TRACKING

### What is the Goals Page?
The Goals page (sidebar: "Goals", URL: /crm/reports) tracks daily and month-to-date (MTD) revenue performance against targets.

### Revenue Categories Tracked
- **Service Revenue**: Income from service/repair work orders
- **Install Revenue**: Income from equipment installations
- **Maintenance Revenue**: Income from maintenance agreements

### Features
- Set monthly revenue goals per category
- Track daily progress toward monthly targets
- View team-wide and individual technician performance
- Visual progress bars and charts showing MTD vs. goal
- Goals are pre-populated for all 12 months of the year

---

## MARKETING

### What is the Marketing Page?
The Marketing page (sidebar: "Marketing", URL: /crm/marketing) provides tools for customer outreach and marketing campaigns.

### Features
- Manage marketing campaigns and customer communications
- Track campaign performance and customer engagement

---

## SALESBOOK (DIGITAL PRICE BOOK)

### What is the Salesbook?
The Salesbook (URL: /price-book) is a digital, interactive flipbook that sales reps use during in-home consultations. It replaces the old printed/PDF sales binder.

### How It Works
- Pages 1-12 are static introductory pages (company info, certifications, warranties, etc.)
- After page 12, the book dynamically generates product pages from the live pricebook database
- Products are organized by unit type (Air Conditioner, Heat Pump, Gas Furnace, etc.) with tier groupings (Best, Better, Good, Budget)

### Product Pages Show
- Equipment model numbers and images
- Pricing by tonnage/size
- Monthly payment options
- Tier-specific features and benefits
- Elite bundle options and crawlspace encapsulation tiers

### Navigation
- Table of Contents panel on the left for quick navigation
- Zoom controls for in-home presentations on tablets
- Page flip animation for natural book-like feel

### Salesbook Directory
- Admins manage the table of contents in Settings > Salesbook Directory
- Each entry has a section name and page number
- Entries can be reordered by dragging, edited inline, or removed
- The directory entries appear as the "Contents" panel in the salesbook viewer

### Important
- The salesbook is public-facing (no login required) — designed for sales reps to show customers
- Product data comes from the pricebook database and updates automatically when prices change

---

## ANNOUNCEMENTS

### What are Announcements?
Announcements are company-wide messages that appear as modals/banners for all CRM users when they log in.

### How They Work
- Admins create announcements with a title and message
- Announcements appear as a modal or banner when users access the CRM
- Useful for company updates, policy changes, or important notices

---

## REVIEW REQUESTS (AUTOMATED)

### What are Review Requests?
The system automatically sends Google review requests to customers after service is completed.

### How It Works
- A background scheduler runs every 15 minutes checking for recently completed work orders
- When a qualifying work order is found, the system sends a review request via SMS to the customer
- The message includes a link to leave a Google review
- Customers are not asked for a review more than once every 6 months (cooldown period)
- This is automated — no manual action required
- Can be enabled/disabled globally in system settings

---

## WEATHER IMPACT TRACKING

### What is Weather Impact?
A background system that correlates local weather data with inbound call volume to help predict demand.

### Features
- Tracks daily high/low/average temperatures
- Correlates with call volume and work order creation
- Helps anticipate busy periods (e.g., first hot day of summer = AC service spike)
- Data refreshes automatically every 6 hours

---

## FLEET TRACKING (BOUNCIE GPS)

### What is Fleet Tracking?
Integration with Bouncie GPS devices for real-time vehicle tracking of company trucks.

### Features
- See live location of all company vehicles on a map
- Assign vehicles to specific technicians
- Track vehicle movement and trip history
- Configure in Settings > Fleet Tracking
- Syncs automatically every 5 minutes

---

## QUICKBOOKS INTEGRATION

### What Syncs
- **Customers**: Bidirectional sync with QuickBooks Online
- **Invoices**: Created in CRM, synced to QuickBooks
- **Payments**: Recorded in either system, synced both ways

### QuickBooks Classes
Classes route revenue to proper income accounts for P&L reporting:
- Service - Residential / Service - Commercial
- Install - Residential / Install - Commercial
- Maintenance - Residential / Maintenance - Commercial
- Install - Crawlspace (special category)
- Discount - Promotional / Discount - Maintenance

### Class Assignment
- Based on property type (residential/commercial) + category (service/install/maintenance)
- Property managers must manually select property type per location
- Advanced mode allows per-line-item class override

### Income Accounts
- Parent accounts: Service, Install, Maintenance, Discount
- Sub-accounts under each: Residential, Commercial
- Revenue routes to appropriate sub-account based on class

### QuickBooks Settings
- Managed in Settings > QuickBooks Integration
- Control sync frequency, class mapping, and account assignments

---

## USER ROLES

### Role Permissions
- **Owner**: Full access, can change user roles
- **Admin**: Full CRM access, cannot change roles
- **Supervisor**: Admin-level desktop + enhanced mobile (view all techs, self-assign)
- **Sales**: Customer/quote management, pipeline visibility
- **Tech**: Mobile app only, view assigned work orders

### Mobile App Access
- Techs and Supervisors use the mobile PWA
- Daily agenda shows assigned work orders
- Photo capture, time tracking, checklist completion
- Offline mode with background sync

---

## MESSAGING

### Dashboard Features
- Three-panel interface: Inbox, Thread, Contact sidebar
- View all customer conversations
- Filter by tags, assignment, status

### Automated SMS
- Maintenance reminders (10-day and 5-day before visit)
- Invoice payment links when auto-invoice is sent
- Work order status updates (en route, on site)
- Review requests after work order completion

---

## PHONE

### What is the Phone Page?
The Phone page (sidebar: "Phone", URL: /crm/phone) provides integrated calling features for the CRM.

---

## NOTIFICATIONS

### What is the Notifications Page?
The Notifications page (sidebar: "Notifications", URL: /crm/notifications) shows all alerts and notifications for the current user.

### Notification Types
- Tagged comments where you were mentioned
- Work order status changes
- Quote acceptance/decline alerts
- Agreement renewal reminders
- System alerts and announcements

---

## TIME TRACKING

### Clock In/Out
- Technicians clock in/out from mobile app
- Optional: Link time entry to specific work order
- Add notes to time entries

### Admin View
- CRM Settings > Time Logs
- Filter by technician, date range
- Edit/adjust entries
- Export to CSV

---

## COMMON QUESTIONS

### "What's the difference between auto invoice and pay per visit / pay on visit?"
When creating a maintenance agreement, you choose how payments are collected:
- **Auto Invoice (autopay)**: The system automatically sends invoices and the customer pays online via credit card. No technician involvement needed for payment.
- **Pay on Visit (pay per visit)**: The technician collects payment in person during the maintenance appointment. No automatic invoices are sent. Use this for customers who prefer to pay cash or check on-site.

### "What happens when I mark a work order as complete?"
The work order status changes to "Completed". If linked to a maintenance agreement, the visit is marked complete. No automatic invoice is created - you create invoices separately. An automated Google review request may be sent to the customer via SMS shortly after completion (if not already requested in the past 6 months).

### "Why isn't my agreement sending automatic invoices?"
Check: 1) Status must be "Active" (not Pending), 2) isInitialCycle must be false, 3) Billing preference must be "Auto Invoice" not "Pay on Visit", 4) nextInvoiceDate must be reached.

### "How do I collect payment for a maintenance visit?"
Two options: 1) For auto_invoice agreements, invoices are sent automatically and customer pays online. 2) For pay_on_visit agreements, the technician collects payment on-site and records it manually.

### "What's the difference between a Work Order and a Project?"
Work Orders are individual appointments/visits. Projects are larger scope containers ($5k+) that can contain multiple work orders. Use projects for multi-phase installations; use work orders for single visits.

### "How do I convert a quote to an invoice?"
After the quote is accepted: 1) Go to the quote detail page, 2) Click "Create Invoice from Quote", 3) Review and adjust line items if needed, 4) Save and send the invoice.

### "How do I create a new project?"
Go to Projects page, click "New Project", fill in the customer, title, project type, start date, and end date. All projects require date ranges so they appear on the calendar.

### "What are the project statuses?"
Projects follow this flow: New → Equipment Ordered → Equipment Arrived → In Progress → Completed → Closed. When you add equipment info to a new project, it automatically moves to "Equipment Ordered".

### "How do the commenting/tasks on any page work?"
These are **Tagged Comments** (page notes). Click the comment icon (speech bubble) in the bottom-right corner of any CRM page. You can leave notes specific to that page and tag/mention other users. Tagged users get a notification. Comments can be resolved when handled. It's like leaving a sticky note on any page for your team.

### "How do I track my sales goals?"
Go to the Goals page (sidebar: "Goals"). It shows daily and month-to-date revenue for Service, Install, and Maintenance categories. You can set monthly targets and track progress. The page shows both team-wide and individual performance.

### "How do I manage prospects/leads?"
Use the Lead Funnel page (sidebar: "Lead Funnel"). It's a Kanban board where you can track prospects through your sales pipeline. Classify leads by temperature (Hot/Warm/Cold) and driver. Schedule follow-ups with due dates to stay on top of each prospect.

### "Where is the salesbook / price book?"
The Salesbook is at /price-book (or click "Price Book" from the main app). It's a digital flipbook for in-home sales presentations. Pages 1-12 are intro/company pages, then it shows live product pricing from the database. Use the table of contents to jump to specific sections.

---

## ONLINE BOOKING

### How customers book online
The online booking page is available at **{your-domain}/book** — simply append "/book" to the app's domain (e.g., https://yourcompany.ghvactools.com/book). There is NO settings page, admin panel, or configuration required for this URL — it works automatically.

### What the booking form collects
- Customer name, phone number, email address
- Service address
- Service type (service call, maintenance, install inquiry, etc.)
- Preferred appointment time / scheduling notes

### Where bookings go after submission
- A new Work Order is automatically created with status **Scheduled**
- The work order lands in the **Dispatch Board → Unassigned Queue** under "Needs Scheduling"
- There is **no auto-assignment** or round-robin — all online bookings must be manually assigned by an admin dragging them onto a technician slot
- An admin will see the new unassigned work order the next time they open the Dispatch Board

### Important: No settings page for booking
There is **no** "Settings → Online Booking", "Settings → Customer Portal", or "Settings → Booking Link" page. The booking link is always {domain}/book and requires no configuration.

---

## DISPATCH BOARD

### Overview
The Dispatch Board is the scheduling hub for all technician work orders. Access it via Dispatch Board in the CRM sidebar (URL: /crm/dispatch).

### Views
- **Day view**: The primary scheduling view — a timeline grid showing all technicians as rows and time slots as columns (6 AM to 10 PM in 30-minute increments)
- **Week view**: Compact overview of the entire week
- **Month view**: High-level calendar view
- **Trucks view**: Vehicle-focused view

### Day View — How scheduling works
1. The timeline shows one row per technician
2. **Unassigned Queue** sits below the timeline grid — it lists all work orders that have no technician assigned, grouped by stage (e.g., "Needs Scheduling")
3. Drag a work order card from the unassigned queue up onto a technician's row at the desired time slot to assign it
4. Once placed on the timeline, the work order is assigned to that technician for that time

### Side Panel
- Clicking any work order card (in the queue or on the timeline) opens a **detail side panel** on the right side of the board
- The board automatically shrinks to make room for the panel — the panel is not an overlay
- The panel header color indicates the work order status:
  - **Amber**: Pending / Scheduled
  - **Blue**: Dispatched / En Route / Traveling
  - **Green**: On Site / Working
  - **Slate/Gray**: Completed
  - **Rose/Red**: Cancelled

### Unassigned Queue details
- Shows all work orders with no assigned technician
- Includes online bookings from /book as well as manually created work orders left unassigned

### No auto-dispatch / no auto-assignment
There is **no** automatic dispatch, auto-assignment, or round-robin routing in the Dispatch Board. All assignment is done manually by dragging cards.

---

## CRM NAVIGATION

### Sidebar pages (what actually exists)
Every page in the CRM sidebar:

| Section | Page | URL |
|---------|------|-----|
| Main | Dashboard | /crm/dashboard |
| Main | Dispatch Board | /crm/dispatch |
| Main | Phone | /crm/phone |
| Main | Inbox — Messages (SMS) | /crm/messaging |
| Main | Inbox — Mail (Gmail) | /crm/mail |
| Admin | Customers | /crm/customers |
| Admin | Agreements | /crm/agreements |
| Admin | Quotes | /crm/quotes |
| Admin | Invoices | /crm/invoices |
| Admin | Media (photo & file gallery) | /crm/photos |
| Operations | Work Orders | /crm/work-orders |
| Operations | Environment Monitoring | /crm/analytics |
| Operations | Projects | /crm/projects |
| Operations | Activity (Tasks) | /crm/tasks/board |
| Operations | Rebate Programs | /crm/rebate-programs |
| Operations | Signatures (e-sign) | /crm/esign |
| Operations | Items | /crm/items |
| Sales | Lead Funnel | /crm/prospect-funnel |
| Sales | Salesbook | /crm/salesbook |
| Other | Goals | /crm/reports |
| Other | Settings | /crm/settings |

Not in the sidebar but real CRM pages: Notifications (/crm/notifications, bell icon), Install Planner (/crm/install-planner), Checklist Canvas (/crm/checklists, reached from Settings → Service Checklists), Marketing Automations (/crm/marketing).

### The GHQ app suite (beyond the CRM)
The signed-in home screen at / greets the user and shows role-filtered app tiles:
- **CRM** (/crm) — everything above
- **Field** (/mobile) — the tech mobile app: agenda, jobs, photos, time clock
- **Documents** (/documents) — company file manager: Drive/Library folders, categories, upload by drag-and-drop, star/rename/move/archive, image & PDF preview, storage stats
- **Accounting** (/accounting) — owner/admin/supervisor only: dashboard KPIs (MTD revenue/expenses/net, A/R with aging), statements (P&L, Revenue, Expenses, A/R Aging, Top Customers), an expense ledger, a chart of accounts, and the Reports workspace (Report Builder, Custom Builder with data source/columns/group-by/filters, Saved Reports with CSV export, print, sharing, pinning, recurring email). /reports redirects here.
- **Marketing** (/marketing) — owner/admin/supervisor/sales: Dashboard, Campaigns (drip-sequence wizard: template → audience → sequence → launch), Audiences (segment builder over live CRM data with include/exclude filters and live count preview), Templates (Email/SMS/call-script gallery with a block-based visual email editor and merge fields like {{first_name}}, test-send), Automations, and Lead Sources (live CRM attribution with cost/ROI). Integrations, Performance, and Settings tabs are still "Coming online" placeholders.
- **Customer Portal** — customer-facing

### Settings sub-sections (what actually exists inside Settings)
The Settings page at /crm/settings contains these sub-sections:

**Team**
- **Users & Roles** — manage team members, assign roles (Owner/Admin/Supervisor/Sales/Tech)
- **Time Logs** — view, edit, and export technician time clock entries

**Sales & Operations**
- **Lead Types** — configure lead categories for the sales funnel
- **Lead Classification** — set up lead temperature and driver classifications
- **Work Order Subtypes** — customize work order sub-categories
- **Service Checklists** — configure service call questionnaires by service type (opens the Checklist Canvas)
- **Package Pricing** — configure maintenance package tiers and pricing
- **Dispatch Board** — set the dispatch grid time increment and choose which staff appear on the board
- **Proposal Templates** — reusable proposal templates with merge fields and image library

**Financial**
- **Payment Settings** — configure Stripe, financing link (GreenSky URL), and payment options
- **Materials Catalog** — manage materials and parts pricing
- **QuickBooks Integration** — QuickBooks Online sync settings and class mapping

**Data & System**
- **Import Data** — import customer or equipment data from CSV
- **Fleet Tracking** — Bouncie GPS vehicle tracking integration
- **Salesbook Directory** — manage the table of contents entries for the digital salesbook
- **Customer Portal** — control whether portal profile edits sync straight into the CRM or wait for review
- **Appearance** — light/dark theme for the CRM
- **System Tools** — system-level configuration and utilities

### Public-facing pages (outside the CRM)
- **Online Booking**: {domain}/book — customer-facing booking form (not in the sidebar, no login needed)
- **Customer Portal**: {domain}/portal — customers view invoices/agreements (accessed via magic link)
- **Quote Viewer**: {domain}/quote/{id} — customer views and accepts/declines a quote
- **Invoice Viewer**: {domain}/invoice/{id} — customer views and pays an invoice
- **Salesbook**: {domain}/price-book — digital flipbook for sales presentations (no login needed)

---

## MEDIA (PHOTO & FILE GALLERY)
The Media page (/crm/photos, sidebar: Admin → Media) is a live company-wide gallery of every photo and file uploaded against customers — job photos from techs, documents, checklist photos. It refreshes automatically every 10 seconds ("Live" indicator). Features: search by file name/customer/uploader; tabs for All, Photos, Documents, Checklist Photos, Recent; Grid or List views with thumbnail zoom; filters by customer, uploader, and date range; Google-Photos-style multi-select with bulk Download and bulk Delete; full-screen lightbox viewer for images and PDFs; an Upload button that attaches files to a chosen customer.

## MAIL (GMAIL INBOX)
The Mail page (/crm/mail, part of Inbox) is a full Gmail client inside the CRM via Google Workspace OAuth — each user connects their own Gmail with the Connect Gmail button. Thread list with unread dots and Inbox/Unread/Sent folders, auto-sync every few seconds, customer identity strip linking to the CRM record (or a "Not in CRM" badge), sanitized HTML bodies with inline images and attachment viewing, Archive/Delete, inline reply with attachments, and a Gmail-style Compose panel with To/Cc/Bcc autocomplete over CRM customers. A Messages | Mail switcher at the top moves between SMS and email.

## SIGNATURES (E-SIGN)
The Signatures page (/crm/esign, sidebar: Operations → Signatures) is an in-house e-signature tool. Overview tab shows stats (total/draft/out-for-signature/completed, completion rate, average time to sign, deposits collected); List/Card views show status pills, signing progress, and deposit badges. "New Document" uploads a PDF and opens the editor, where you add color-coded recipients and place Signature, Initials, Full Name, Date, Text, and Payment fields on the pages, optionally set a deposit amount, then Send emails the recipients. Completed documents download as signed PDFs.

## ENVIRONMENT MONITORING
The Environment Monitoring page (/crm/analytics, sidebar: Operations) is a live humidity/temperature dashboard fed by Govee sensors installed at customer properties (e.g. crawlspaces). Overall health status (normal/watch/high/critical/offline), a "Sync now" button, open alerts that can spawn service work orders straight into the dispatch queue, and device mapping that ties each sensor to a customer property. Sensor detail shows live readings, risk badge, a reading-history trend chart with threshold lines, and a Create Work Order button.

## REBATE PROGRAMS
The Rebate Programs page (/crm/rebate-programs, sidebar: Operations) tracks HEAR and HER utility/government rebate cases. Search by client/address/case number; quick filters (All, In Progress, Waiting on Customer, Scope Needed, Approved, Closed); table shows case #, customer, program, status, priority, assignee, workflow step, rebate amount, application date. "New Case" requires the Neighborly case number, then links an existing CRM customer (auto-fills contact info) or manual details.

## CHECKLIST CANVAS
The Checklist Canvas (/crm/checklists, reached from Settings → Service Checklists) is a node-based visual editor for authoring the checklists techs complete in the field. Pick a work order type → subtype → checklist, then edit on a pannable/zoomable canvas: ordered question steps grouped into collapsible sections, drag to reorder, plus free-floating photo steps (label, instructions, required toggle) that can be linked to specific questions with drag connectors.

## INSTALL PLANNER
The Install Planner (/crm/install-planner) is a capacity-planning board for tentative and sold installs. Calendar view: drag across days to create a hold, drag/resize blocks, cross month boundaries. Timeline view: Gantt-style bars per crew, draggable across dates and crews; crews can be added/renamed/deleted. Blocks carry confidence (High/Medium/Low, dashed) or Sold (solid green) styling; a "Crews/day" setting caps daily capacity. Each block links a CRM customer with dates, crew, estimated value, and notes; a "Sell" action converts a hold to Sold.

## FEATURES THAT DO NOT EXIST IN THIS CRM

**IMPORTANT: The following features do NOT exist. If asked about them, clearly say they are not part of this system.**

- ❌ No "Settings → Online Booking" page
- ❌ No auto-assignment, round-robin, or auto-dispatch of work orders (Settings → Dispatch Board only sets the grid increment and who appears on the board)
- ❌ No "Settings → Widgets" page
- ❌ No "Public booking URL" field or "booking link" field anywhere in Settings
- ❌ The booking link requires no configuration — it is always {domain}/book

`;


// An action the AI PROPOSES but can never execute itself. The client renders
// an approval card; only an explicit user click on Approve sends it to
// /api/crm/ai/execute-action, which re-validates against a strict whitelist
// and runs under the approving user's session with an audit log.
export interface ProposedAction {
  type: "create_task" | "create_work_order";
  summary: string;
  params: Record<string, unknown>;
}

export interface CrmHelpResponse {
  answer: string;
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
  hasLiveData?: boolean;
  /** First proposed action — kept for backward compatibility. */
  proposedAction?: ProposedAction | null;
  /** ALL proposed actions — one spoken request can carry several ("create a
   *  work order for X and a task to Y"). Max 5. */
  proposedActions?: ProposedAction[];
}

const helpCache = new Map<string, { result: CrmHelpResponse; timestamp: number; hasLiveData: boolean }>();
const CACHE_TTL_STATIC = 1000 * 60 * 60; // 1 hour for static help questions
const CACHE_TTL_LIVE = 1000 * 60 * 5; // 5 minutes for live data questions

export async function askCrmHelp(
  question: string,
  conversationHistory?: Array<{role: 'user'|'assistant', content: string}>,
  images?: string[],
): Promise<CrmHelpResponse> {
  const normalizedQuestion = question.toLowerCase().trim();
  const hasImages = !!images && images.length > 0;

  // Detect what live data might be needed
  const dataNeeds = await detectDataNeed(question);
  const needsLiveData = dataNeeds.length > 0;
  const cacheTTL = needsLiveData ? CACHE_TTL_LIVE : CACHE_TTL_STATIC;

  // Skip cache for follow-up questions (they depend on prior context) and for
  // photo questions (the answer depends on the image, not just the text).
  const isFollowUp = (conversationHistory && conversationHistory.length > 0) || hasImages;
  if (!isFollowUp) {
    const cached = helpCache.get(normalizedQuestion);
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return cached.result;
    }
  }

  try {
    console.log("[CRM Help AI] Processing question:", question, "Data needs:", dataNeeds);
    
    // Fetch live data if needed
    let liveDataSection = "";
    if (needsLiveData) {
      const liveData = await fetchLiveData(dataNeeds);
      liveDataSection = formatLiveDataForPrompt(liveData);
      console.log("[CRM Help AI] Fetched live data for:", dataNeeds.join(", "));
    }
    
    const systemPrompt = `You are Gibbs — the GHQ assistant at Giesbrecht HVAC: a sharp, friendly teammate who knows the CRM inside out and can see live business data (upcoming work orders, agreements, invoices, quotes, projects). Your name is Gibbs (from Giesbrecht); if someone asks who or what you are, that's your answer.

Right now it is ${formatInTimeZone(new Date(), BUSINESS_TIMEZONE, "EEEE, MMMM d, yyyy 'at' h:mm a")} Eastern time (${BUSINESS_TIMEZONE}) — resolve every relative date the user says ("today", "tomorrow", "next Tuesday", "10 AM") against this clock.

Users can attach photos (equipment, model/serial plates, thermostats, job sites, error codes). When a photo is attached, read it carefully — identify make/model/serial numbers, describe visible issues, diagnose what you can see — and fold what you find into your answer or into the params of any action they asked you to prepare.

${CRM_FUNCTIONALITY_KNOWLEDGE}
${liveDataSection}

Voice and formatting — these matter as much as accuracy:
1. Talk like a helpful coworker, not a manual. Natural, warm, direct. It's fine to open with a short conversational beat ("Looks like a busy morning —") when it fits, but never pad.
2. PLAIN TEXT ONLY. Absolutely no markdown: no asterisks, no bold markers, no # headings, no backticks, no "*" or "-" bullet symbols. If you need a list, write short lines starting with a number and a period (1. 2. 3.) or just flowing sentences.
3. Keep it tight. Lead with the answer in the first sentence, then only the details that matter. Two short paragraphs beat one long one.
4. Use real data from LIVE DATA when the question is about current business — name names, dates, and dollar amounts. If live data shows nothing, say so plainly ("Nothing on the books for tomorrow yet.").
5. Speak the user's language — plain words over jargon, and mirror how they phrased things.
6. When a natural next step exists, end with it in one sentence ("Want me to pull up who's overdue?").

CRITICAL ACCURACY RULE: Only describe features, settings pages, navigation paths, and URLs that are explicitly documented in the knowledge base above. If something is not listed there — especially settings pages, admin panels, or configuration screens — do NOT invent or assume it exists. Respond with: "I don't have specific information about that in this CRM — it may not exist or may not be documented." NEVER invent settings pages, URLs, configuration screens, or features that are not documented above. Pay special attention to the "FEATURES THAT DO NOT EXIST" section — if a user asks about one of those items, clearly state it does not exist in this system.

PROPOSING ACTIONS (strict rules):
You can PREPARE two kinds of actions for the user to approve, but you can NEVER execute anything yourself. Only include proposedActions when the user EXPLICITLY asks you to create something ("create a task to...", "make a work order for..."). Many users dictate by voice, so transcripts can be loosely worded, run-on, or missing punctuation — treat any imperative that names the thing to create ("put a work order on Brian's schedule for...", "set up a job for...", "schedule a service call at...") as an explicit creation request, even mid-conversation in a thread that was previously about something else. Never propose an action for informational questions.
MULTIPLE REQUESTS IN ONE MESSAGE: voice users often ask for several things in one breath ("create a work order for the Smiths tomorrow at 10, add a task to order filters, and who hasn't paid?"). Handle ALL of them: answer every question asked, and include one proposedActions entry PER thing to create — never silently drop or merge requests. Say in your answer what each prepared action is. In your answer, say the action is prepared and waiting for their approval — never say it's done. If details are missing (like which customer), ask for them instead of proposing.
Pass customerName exactly as the user said or typed it, even if it looks misspelled — the server fuzzy-matches it against the CRM and will ask the user to pick when it isn't sure. Never refuse an action just because the name looks off.
Action types and their params:
1. create_task — params: { "title": string (required), "description": string (optional), "dueDate": "YYYY-MM-DD" (optional) }
2. create_work_order — params: { "customerName": string (required, the customer's name as it appears in LIVE DATA or as the user gave it), "title": string (required), "description": string (required), "visitType": "SERVICE" | "MAINTENANCE" | "INSTALL" | "SALES" (optional, default SERVICE), "workSubtype": string (optional — for SERVICE use one of: No Cool, No Heat, Water Leak, Electrical, Thermostat, Airflow, Noise, IAQ, Other; for MAINTENANCE: Preventative Maintenance; for INSTALL: Full System, Changeout, Add Ducts, Replace Ducts, IAQ Install, Mini-split, Crawlspace; for SALES: Comfort Consultation), "assignTo": string (optional — a technician's name if the user asked to assign it to someone), "scheduledStart": "YYYY-MM-DDTHH:mm" (optional — the visit's wall-clock time in Eastern time exactly as the user means it, NO timezone suffix and NO "Z"; e.g. tomorrow at 10 AM = "${formatInTimeZone(addDays(new Date(), 1), BUSINESS_TIMEZONE, "yyyy-MM-dd")}T10:00") }

Return JSON with:
- answer: Your response as PLAIN conversational text (no markdown characters at all)
- relatedTopics: Array of 1-3 short natural follow-up QUESTIONS the user might tap next (e.g. "How do renewals work?", "Who hasn't paid yet?") — phrased as questions, max ~6 words each
- confidence: "high" if directly from data/knowledge base, "medium" if inferred, "low" if uncertain
- proposedActions: OMIT this field entirely unless the user explicitly asked you to create something. When present: an ARRAY with one entry per thing to create (max 5) — [{ "type": "create_task" | "create_work_order", "summary": one plain sentence describing exactly what will be created, "params": {...} }, ...]`;
    
    // Build message array: system + prior turns + current question.
    // Claude is preferred when ANTHROPIC_API_KEY is set; OpenAI is the fallback.
    const priorTurns: Array<{role: 'user'|'assistant', content: string}> = conversationHistory ?? [];

    // Attached photos ride the current question as vision content blocks.
    const imageBlocks = (images ?? [])
      .map((dataUrl) => {
        const match = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
        return match ? { mediaType: match[1].toLowerCase(), data: match[2] } : null;
      })
      .filter((b): b is { mediaType: string; data: string } => b !== null);

    let content: string | null | undefined;
    let finishReason: string | undefined;
    if (claudeConfigured()) {
      const userTurn = imageBlocks.length > 0
        ? {
            role: "user" as const,
            content: [
              ...imageBlocks.map((b) => ({ type: "image", source: { type: "base64", media_type: b.mediaType, data: b.data } })),
              { type: "text", text: question },
            ],
          }
        : { role: "user" as const, content: question };
      content = stripJsonFences(
        await claudeChat({
          system: systemPrompt + "\n\nRespond with ONLY the JSON object — no prose around it.",
          messages: [...priorTurns, userTurn],
          maxTokens: 2000,
        }),
      );
    } else {
      const userTurn: any = imageBlocks.length > 0
        ? {
            role: "user",
            content: [
              ...imageBlocks.map((b) => ({ type: "image_url", image_url: { url: `data:${b.mediaType};base64,${b.data}` } })),
              { type: "text", text: question },
            ],
          }
        : { role: "user", content: question };
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...priorTurns,
          userTurn
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      finishReason = response.choices[0]?.finish_reason;
      content = response.choices[0]?.message?.content;
    }
    if (!content) {
      console.log("[CRM Help AI] No content in response - finish_reason:", finishReason);
      return {
        answer: "I couldn't process your question. Please try rephrasing it.",
        relatedTopics: [],
        confidence: "low"
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.log("[CRM Help AI] JSON parse failed (finish_reason:", finishReason, ") - content length:", content.length);
      // If JSON was truncated, extract whatever text we got and return it
      const partial = content.match(/"answer"\s*:\s*"([\s\S]*?)(?:"|$)/)?.[1];
      return {
        answer: partial ? partial.replace(/\\n/g, "\n").replace(/\\"/g, '"') : "I ran into a problem formatting my response. Please try asking a more specific question.",
        relatedTopics: [],
        confidence: "low"
      };
    }
    
    // Whitelist-check every proposed action shape here too — anything that
    // isn't exactly a known type with an object params is dropped on the
    // floor. The model may return proposedActions (array) or the legacy
    // singular proposedAction.
    const rawActions: any[] = Array.isArray(parsed.proposedActions)
      ? parsed.proposedActions
      : parsed.proposedAction
        ? [parsed.proposedAction]
        : [];
    const proposedActions: ProposedAction[] = [];
    for (const pa of rawActions.slice(0, 5)) {
      if (
        pa &&
        typeof pa === "object" &&
        (pa.type === "create_task" || pa.type === "create_work_order") &&
        typeof pa.summary === "string" &&
        pa.params &&
        typeof pa.params === "object" &&
        !Array.isArray(pa.params)
      ) {
        proposedActions.push({ type: pa.type, summary: pa.summary.slice(0, 300), params: pa.params });
      }
    }

    const result: CrmHelpResponse = {
      answer: parsed.answer || "I don't have information about that feature.",
      relatedTopics: Array.isArray(parsed.relatedTopics) ? parsed.relatedTopics.slice(0, 3) : [],
      confidence: parsed.confidence || "medium",
      hasLiveData: needsLiveData,
      proposedAction: proposedActions[0] ?? null,
      proposedActions,
    };

    // Never cache responses that carry proposed actions or answered a photo —
    // each ask should be freshly generated, and a stale cached proposal (or a
    // photo-specific answer keyed by text alone) must not resurface.
    if (proposedActions.length === 0 && !hasImages) {
      helpCache.set(normalizedQuestion, { result, timestamp: Date.now(), hasLiveData: needsLiveData });
    }

    return result;
  } catch (error: any) {
    console.error("[CRM Help AI] Error:", error);
    // Surface the real upstream failure so the chat shows what's actually
    // wrong (rejected key, no billing credit, model access) instead of a
    // generic apology the user can't act on.
    const status = error?.status ?? error?.response?.status;
    const detail = error?.error?.message || error?.message || "unknown error";
    const hint = claudeConfigured()
      ? claudeErrorHint(status, detail)
      : status === 401 ? "OpenAI rejected the API key — double-check OPENAI_API_KEY in Render (no quotes or spaces)."
      : status === 429 ? "The OpenAI account has no available quota — add billing credits at platform.openai.com."
      : status === 404 ? "This API key can't access the gpt-4o-mini model."
      : null;
    throw new Error(hint ? `${hint} (${detail})` : detail);
  }
}
