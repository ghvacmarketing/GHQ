import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

### Billing Preferences
- **Auto Invoice**: System automatically generates and sends renewal invoices. Customer pays remotely.
- **Pay on Visit**: Technician collects payment during the maintenance visit. No automatic invoicing.

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
- **Lead**: Initial inquiry, qualifying the opportunity
- **Proposal Sent**: Quote/proposal delivered to customer
- **Approved**: Customer accepted, work is authorized
- **In Progress**: Active work underway
- **Completed**: All work finished
- **Closed**: Finalized, invoiced, and archived

### Project Scheduling
- Projects can have start and end dates
- Displayed on the calendar view as continuous bars
- Scheduled projects appear in the Overview section

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

### "What happens when I mark a work order as complete?"
The work order status changes to "Completed". If linked to a maintenance agreement, the visit is marked complete. No automatic invoice is created - you create invoices separately.

### "Why isn't my agreement sending automatic invoices?"
Check: 1) Status must be "Active" (not Pending), 2) isInitialCycle must be false, 3) Billing preference must be "Auto Invoice" not "Pay on Visit", 4) nextInvoiceDate must be reached.

### "How do I collect payment for a maintenance visit?"
Two options: 1) For auto_invoice agreements, invoices are sent automatically. 2) For pay_on_visit agreements, the technician collects payment on-site and records it manually.

### "What's the difference between a Work Order and a Project?"
Work Orders are individual appointments/visits. Projects are larger scope containers ($5k+) that can contain multiple work orders. Use projects for multi-phase installations; use work orders for single visits.

### "How do I convert a quote to an invoice?"
After the quote is accepted: 1) Go to the quote detail page, 2) Click "Create Invoice from Quote", 3) Review and adjust line items if needed, 4) Save and send the invoice.
`;

export interface CrmHelpResponse {
  answer: string;
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
}

const helpCache = new Map<string, { result: CrmHelpResponse; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour cache

export async function askCrmHelp(question: string): Promise<CrmHelpResponse> {
  const normalizedQuestion = question.toLowerCase().trim();
  
  const cached = helpCache.get(normalizedQuestion);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are GHVAC's CRM help assistant. Answer questions about how the CRM system works using the knowledge base below. Be concise, helpful, and specific.

${CRM_FUNCTIONALITY_KNOWLEDGE}

Rules:
1. Only answer questions about CRM functionality - redirect other questions
2. Use plain language, avoid jargon
3. Give specific, actionable answers
4. If unsure, say so and suggest where to find help
5. Keep answers under 200 words unless explaining a complex process

Return JSON with:
- answer: Your helpful response (string)
- relatedTopics: Array of 1-3 related feature areas the user might want to know about
- confidence: "high" if directly covered in knowledge base, "medium" if inferred, "low" if uncertain`
        },
        {
          role: "user",
          content: question
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
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
    };

    helpCache.set(normalizedQuestion, { result, timestamp: Date.now() });
    
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
