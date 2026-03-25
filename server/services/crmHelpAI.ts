import OpenAI from "openai";
import { db } from "../db";
import { crmWorkOrders, crmAgreements, crmCustomers, crmProjects, crmInvoices, crmQuotes } from "@shared/schema";
import { eq, gte, lte, and, or, sql, desc, isNull, isNotNull } from "drizzle-orm";
import { addDays, subDays, format, startOfDay, endOfDay } from "date-fns";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
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
          name: crmAgreements.name,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
          nextVisitDate: crmAgreements.nextVisitDate,
          expirationDate: crmAgreements.expirationDate,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(eq(crmAgreements.status, "active"))
        .orderBy(crmAgreements.nextVisitDate)
        .limit(15);
      context.activeAgreements = active;

      const pending = await db
        .select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          name: crmAgreements.name,
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
          name: crmAgreements.name,
          status: crmAgreements.status,
          customerName: crmCustomers.name,
          expirationDate: crmAgreements.expirationDate,
        })
        .from(crmAgreements)
        .leftJoin(crmCustomers, eq(crmAgreements.customerId, crmCustomers.id))
        .where(
          and(
            eq(crmAgreements.status, "active"),
            lte(crmAgreements.expirationDate, next30Days),
            gte(crmAgreements.expirationDate, now)
          )
        )
        .orderBy(crmAgreements.expirationDate)
        .limit(10);
      context.expiringAgreements = expiring;
    }

    if (needs.includes("invoices")) {
      const unpaid = await db
        .select({
          id: crmInvoices.id,
          invoiceNumber: crmInvoices.invoiceNumber,
          totalAmount: crmInvoices.totalAmount,
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
          totalAmount: crmInvoices.totalAmount,
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
          totalAmount: crmQuotes.totalAmount,
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
  const today = format(new Date(), "EEEE, MMMM d, yyyy");
  
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
- **Paid**: Payment has been received and recorded
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
- **Scheduled**: Appointment is booked, waiting for dispatch
- **Dispatched**: Assigned to a technician
- **En Route**: Technician is traveling to the job site (auto-SMS sent to customer)
- **On Site**: Technician has arrived (auto-SMS sent to customer)
- **Completed**: Work is finished

### Work Order Types
- **Service**: Repair, diagnostic, troubleshooting visit
- **Install**: Equipment installation
- **Maintenance**: Scheduled tune-up or preventive maintenance
- **Crawlspace**: Encapsulation or moisture control work

### Service Call Checklists
- Dynamic questionnaires based on service type
- Technicians complete checklists during the visit
- AI summarizes checklist responses for customer records
- Required questions must be answered before completing

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
The work order status changes to "Completed". If linked to a maintenance agreement, the visit is marked complete. No automatic invoice is created - you create invoices separately.

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
- Save/update actions in the panel appear as minimal text links (not large buttons)

### Unassigned Queue details
- Shows all work orders with no assigned technician
- Includes online bookings from /book as well as manually created work orders left unassigned
- Scroll the queue independently from the timeline
- Max visible height is limited; the queue scrolls if there are many items

### No auto-dispatch / no auto-assignment
There is **no** automatic dispatch, auto-assignment, or round-robin routing in the Dispatch Board. All assignment is done manually by dragging cards.

---

## CRM NAVIGATION

### Sidebar pages (what actually exists)
Every page in the CRM sidebar — these are the only pages that exist:

| Page | URL |
|------|-----|
| Dashboard | /crm/dashboard |
| Dispatch Board | /crm/dispatch |
| Phone | /crm/phone |
| Messaging | /crm/messaging |
| Notifications | /crm/notifications |
| Customers | /crm/customers |
| Agreements | /crm/agreements |
| Quotes | /crm/quotes |
| Invoices | /crm/invoices |
| Work Orders | /crm/work-orders |
| Projects | /crm/projects |
| Mobile View | /crm/mobile |
| Settings | /crm/settings |

### Settings sub-sections (what actually exists inside Settings)
The Settings page at /crm/settings contains these sub-sections only:
- **Users & Roles** — manage team members, assign roles (Owner/Admin/Supervisor/Sales/Tech)
- **Time Logs** — view, edit, and export technician time clock entries
- **Checklists** — configure service call questionnaires by service type
- **Pricebook** — manage equipment and service pricing from Google Sheets
- **Packages** — configure maintenance package tiers (e.g., crawlspace tiers)
- **Materials Catalog** — manage materials and parts pricing
- **Payment Settings** — configure Stripe, financing link (GreenSky URL), and payment options
- **Import Data** — import customer or equipment data from CSV
- **Fleet Tracking** — Bouncie GPS vehicle tracking integration
- **System** — system-level configuration (QuickBooks sync, AI settings, etc.)

### Public-facing pages (outside the CRM)
- **Online Booking**: {domain}/book — customer-facing booking form (not in the sidebar, no login needed)
- **Customer Portal**: {domain}/portal — customers view invoices/agreements (accessed via magic link)
- **Quote Viewer**: {domain}/quote/{id} — customer views and accepts/declines a quote
- **Invoice Viewer**: {domain}/invoice/{id} — customer views and pays an invoice

---

## FEATURES THAT DO NOT EXIST IN THIS CRM

**IMPORTANT: The following features do NOT exist. If asked about them, clearly say they are not part of this system.**

- ❌ No "Settings → Online Booking" or "Settings → Customer Portal" page
- ❌ No "Settings → Auto-assignment" or "Settings → Dispatch Rules" page
- ❌ No "Settings → Widgets" page
- ❌ No "Public booking URL" field or "booking link" field anywhere in Settings
- ❌ No auto-assignment, round-robin, or auto-dispatch of work orders
- ❌ No "Settings → Integrations" page (integrations are configured at the system level, not via a settings page)
- ❌ No customer-facing mobile app (there is a technician PWA, not a customer app)
- ❌ No "portal settings" or "portal customization" page
- ❌ No "email templates" settings page
- ❌ No drag-and-drop calendar for projects (projects appear on calendar by date range, but are not draggable there)

`;


export interface CrmHelpResponse {
  answer: string;
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
  hasLiveData?: boolean;
}

const helpCache = new Map<string, { result: CrmHelpResponse; timestamp: number; hasLiveData: boolean }>();
const CACHE_TTL_STATIC = 1000 * 60 * 60; // 1 hour for static help questions
const CACHE_TTL_LIVE = 1000 * 60 * 5; // 5 minutes for live data questions

export async function askCrmHelp(question: string, conversationHistory?: Array<{role: 'user'|'assistant', content: string}>): Promise<CrmHelpResponse> {
  const normalizedQuestion = question.toLowerCase().trim();
  
  // Detect what live data might be needed
  const dataNeeds = await detectDataNeed(question);
  const needsLiveData = dataNeeds.length > 0;
  const cacheTTL = needsLiveData ? CACHE_TTL_LIVE : CACHE_TTL_STATIC;
  
  // Skip cache for follow-up questions (they depend on prior context)
  const isFollowUp = conversationHistory && conversationHistory.length > 0;
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
    
    const systemPrompt = `You are GHVAC's CRM help assistant. You can answer questions about how the CRM system works AND provide information about current business data like upcoming work orders, agreements, invoices, and projects.

${CRM_FUNCTIONALITY_KNOWLEDGE}
${liveDataSection}

Rules:
1. Answer questions about CRM functionality using the knowledge base
2. For questions about current data (upcoming appointments, agreements, invoices, etc.), use the LIVE DATA section
3. Use plain language, avoid jargon
4. Give specific, actionable answers with real data when available
5. If asked about specific records, provide the details from live data
6. Keep answers concise but informative
7. If live data shows no results, say so clearly

CRITICAL ACCURACY RULE: Only describe features, settings pages, navigation paths, and URLs that are explicitly documented in the knowledge base above. If something is not listed there — especially settings pages, admin panels, or configuration screens — do NOT invent or assume it exists. Respond with: "That feature or settings page doesn't appear to exist in this CRM based on my documentation. You may want to check with your admin." NEVER invent settings pages, URLs, configuration screens, or features that are not documented above. Pay special attention to the "FEATURES THAT DO NOT EXIST" section — if a user asks about one of those items, clearly state it does not exist in this system.

Return JSON with:
- answer: Your helpful response (string) - include specific data when relevant
- relatedTopics: Array of 1-3 related feature areas the user might want to know about
- confidence: "high" if directly from data/knowledge base, "medium" if inferred, "low" if uncertain`;
    
    // Build message array: system + prior turns + current question
    const priorTurns: Array<{role: 'user'|'assistant', content: string}> = conversationHistory ?? [];
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...priorTurns,
        { role: "user", content: question }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log("[CRM Help AI] No content in response - finish_reason:", response.choices[0]?.finish_reason);
      return {
        answer: "I couldn't process your question. Please try rephrasing it.",
        relatedTopics: [],
        confidence: "low"
      };
    }

    const parsed = JSON.parse(content);
    
    const result: CrmHelpResponse = {
      answer: parsed.answer || "I don't have information about that feature.",
      relatedTopics: Array.isArray(parsed.relatedTopics) ? parsed.relatedTopics.slice(0, 3) : [],
      confidence: parsed.confidence || "medium",
      hasLiveData: needsLiveData,
    };

    helpCache.set(normalizedQuestion, { result, timestamp: Date.now(), hasLiveData: needsLiveData });
    
    return result;
  } catch (error) {
    console.error("[CRM Help AI] Error:", error);
    return {
      answer: "I encountered an error processing your question. Please try again.",
      relatedTopics: [],
      confidence: "low"
    };
  }
}
