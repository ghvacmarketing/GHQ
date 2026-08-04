/** The Gibbs feature knowledge base — everything Gibbs knows about how the
 *  CRM works (as opposed to live data, which comes from lookup tools).
 *
 *  KEEPING THIS FRESH: whenever a feature ships, renames, or is removed,
 *  update this file — and run `npm run audit:gibbs` to catch drift (it
 *  cross-checks the sidebar nav and routes against this text). A page
 *  missing here means Gibbs will deny it exists.
 */

export const CRM_FUNCTIONALITY_KNOWLEDGE = `
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
- **Custom Install**: High-value installation proposals ($5k+); takes an online deposit (see Online payment & deposits)
- **Service Quote** (quick quote): Repair proposals — NO online payment/deposit; collected by invoice or in person
- **Proposal**: Formal project proposals; takes an online deposit
- **Custom Service**: Non-standard service work; takes an online deposit

### Internal costs vs customer line items
- A quote's line items are split: CUSTOMER line items (what the customer sees) and INTERNAL COSTS (labor, warranty reserve, worksheet cost build-up) shown in a separate amber "Internal costs" card on the quote detail page with a gross-margin readout
- Internal costs NEVER appear on customer-facing surfaces: the public quote link, quote emails, the PDF, or presentation mode. A custom (worksheet) quote shows the customer one line — the package at its sell price
- In presentation mode the presenter can deliberately reveal the Internal costs panel with the "Internal costs" toggle button (top-right, next to Exit); it always resets to hidden
- Lines can be MOVED between sections after creation: in the Internal costs card each row has a "Show to customer" (eye) action that promotes it into the customer-facing list; customer rows have a "Move to internal costs" (eye-off) action. On custom quotes the sell price never changes when lines move — it stays the worksheet's price

### Multi-option quote totals (goals/analytics)
- An options-mode quote counts toward quoted pipeline at its HIGHEST-priced option (plus shared items); once accepted/sold it counts at the option the customer actually chose plus shared items — never the sum of all options

### Quote PDF
- Custom and quick quotes print with the same professional template as invoices: brand header, thick maroon rule, PREPARED FOR block, bordered items table, totals with Total in brand color. Internal costs never print

### Quote Acceptance Flow
1. Quote is created and sent to customer
2. Customer reviews via email link
3. Customer clicks Accept/Decline
4. If accepted:
   - Quote status → "Accepted"
   - If linked to project, project expectedValue is updated
   - For multi-option quotes the stored total switches to the selected option
   - Optional: Auto-create work order or invoice

### Financing Display
- Install quotes show dual payment options:
  1. Pay deposit via Stripe
  2. Apply for financing (GreenSky link)
- Financing link is configurable in CRM Settings > Payment Settings

### Online payment & deposits (HOW IT ACTUALLY WORKS — be precise)
- Online payment through the live quote page exists for THREE quote types
  only: Custom Install, Proposal, and Custom Service. Quick/service quotes
  have NO online payment — those are collected by invoice or in person.
- The online flow is sign-then-pay: the customer signs on the quote page
  (name + signature) FIRST, then gets a secure Stripe link for the
  DEPOSIT — never the full total up front.
- The deposit percentage is a COMPANY SETTING, not a fixed rule: CRM →
  Settings → Payments → "Default Deposit Percentage". 50% is only the
  default when nothing has been saved there. NEVER say "all quotes require
  a 50% deposit" — the accurate answer is "deposits apply to the three
  payable quote types at whatever percentage Settings → Payments is set to
  (currently defaulting to 50%)."
- On a multi-option quote the deposit is calculated from the option the
  customer selected (plus shared items), never the sum of all options.
- The remaining balance is billed by invoice afterwards; invoices always
  collect the FULL balance due — there is no deposit splitting on invoices.
- A quote accepted verbally or in person takes no deposit through the
  system — deposits belong to the online Stripe flow.
- E-signature documents are their own thing: each e-sign document can
  request its own deposit — a percent of the total OR an exact dollar
  amount — chosen when the document is built. Independent of the quote
  deposit setting.

### Card convenience fee (COMPANY POLICY)
- Credit card payments carry a 3% convenience fee ON THE AMOUNT CHARGED to
  the card (e.g. with the deposit set at 50%, a $10,000 quote takes a
  $5,000 deposit; by card that's $5,000 + 3% = $5,150). Bank transfer
  (ACH), cash, and check have NO fee — steer customers to bank transfer
  when they ask how to avoid the fee.
- Online payments (invoice pay page + quote deposits) offer both methods,
  disclose the fee up front, and automatically add the fee as its own line
  item on the invoice so totals match the Stripe charge exactly. For
  phone/in-person card payments, staff add the catalog item "Card payment
  convenience fee (3%)" manually.
- The full current policy lives in the Documents app → Gibbs folder →
  "Payments & fees policy" — read it with company_docs before answering
  detailed fee questions (that document wins if it differs from this note)

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
- Self-service portal for customers at {domain}/portal — styled like the mobile app (bottom tab bar: Home, Quotes, Invoices, History, Profile)
- Home shows a greeting, open-invoice/pending-quote/agreement stats, upcoming appointments, and a "Need service?" request form; Maintenance Agreements and Environment Monitoring (sensors) live under "More"
- Customers log in with phone number or email + password; first-time signup verifies their phone by SMS code; forgot-password also works by SMS code (legacy magic links still validate)
- Customers can self-manage name/email/phone/password from the Profile tab; address changes are requested and reviewed by the office

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

## NOTIFICATION CENTER

### Settings > Notifications (URL: /crm/settings/notifications)
Admin-only org-wide notification oversight: a feed of EVERY notification the system has sent anyone (work orders assigned, payments, mentions, task assignments...) with filters by person, type, and search; a registered-devices counter showing whose phones can receive mobile push; and a "Send a notification" composer — pick everyone or one person, write a title + optional message, and it lands in their in-app notification drawer AND as a push notification on any phone with the GHQ app (delivered by the APNs bridge within ~20 seconds).

---

## COMPANYCAM INTEGRATION

### What is the CompanyCam integration?
CompanyCam projects sync into the CRM as photo AND video references (Settings > CompanyCam, URL: /crm/settings/companycam). Projects are matched to CRM customers by ADDRESS (street number must match) or by CUSTOMER NAME (the project name matches exactly one customer — ties between same-named customers only resolve if the street number also agrees); each matched project's photos/videos appear in that customer's Files/Photos everywhere in the CRM and mobile app. The media stays hosted on CompanyCam's CDN — nothing bulky is copied into the database.

### How it works
- Instant: CompanyCam webhooks (photo.created, video.created) push new media into the CRM within seconds; a 15-minute background reconciliation sync (plus a "Sync now" button) catches anything missed, auto-matches projects to customers, and imports photo/video references
- Projects the auto-matcher isn't sure about show as "unmatched" in TWO places: the settings page, and the Media page's "Unmatched" tab (Media > Unmatched) which lists each unmatched CompanyCam project as a card with its name, address, item count and creators, previews its photos/videos live from CompanyCam, and (for owner/admin/supervisor) offers "Create customer" (pre-filled from the project's name/address — creates the CRM customer, links the project, and imports everything in one click), "Match existing" (search + link), or Ignore
- Two-way: new photos uploaded in the CRM/mobile app for a linked customer are pushed up to the matching CompanyCam project automatically
- Deletes never propagate in either direction
- Requires the COMPANYCAM_API_TOKEN environment variable on the server

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

### Call Log
The Phone page keeps a shared day-by-day call log: each entry records who called (any name — the caller doesn't have to be a CRM customer), what the call was about, an optional phone number, a category tag (service, install, sales, maintenance, billing, other), and whether it's billable. Entries can carry follow-up tasks.

### Logging a call through Gibbs
Gibbs can add an entry to TODAY's call log as an approval-gated action (log_call) — useful when someone on the road answers the phone and dictates what the call was about right after hanging up ("log a call from Mrs. Jenkins, her heat pump is icing up again"). Gibbs prepares the entry (caller, summary, optional phone/tag/billable) and nothing is saved until the user approves the card. The entry lands on the Phone page's log for today under the approving user's name.

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

### Dispatch Board view tabs
- Day / Week / Month — the schedule grid
- **Techs** — live read of everyone's time clock for the selected day: who's on the clock right now (category + since when), stacked bars and per-category totals across the mobile time categories (Job site, Drive, Shop, Training, Meeting, Break, Other), who's clocked out, and who hasn't clocked in
- **Trucks** — live fleet map (Bouncie GPS)

### Gibbs folder in Documents
The Documents app has a "Gibbs" folder: a readable "Gibbs knowledge & policies" page (auto-generated each deploy) plus a Markdown subfolder holding the raw knowledge file and the team-editable "Payments & fees policy" document Gibbs reads live.

### Mobile Work Orders directory
- Mobile → More → Work Orders (/mobile/work-orders): search EVERY work order company-wide by job title or customer name, filter by visit type (Service / Maintenance / Install / Sales — metal badge pills), tap through to the job's detail page

### Mobile Guide
- Mobile → More → Guide (/mobile/guide): a built-in guide to the mobile app (tabs, the + create button, Gibbs, back-swipe and hold gestures) plus a badge reference explaining every metal badge — roles, visit types, time-clock categories, customer types, message contacts, and the avatar-with-role-badge composition

### Mobile media capture & markup
- On the mobile Media page, tapping one of today's jobs opens the camera immediately (photo or video)
- Captured photos open in a Markup editor first — draw freehand, arrows, and text stamps in several colors (CompanyCam-style) — then upload; videos upload as-is

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
- **Package Pricing** (/crm/settings/packages) — configure maintenance package tiers and pricing
- **Dispatch Board** — set the dispatch grid time increment and choose which staff appear on the board
- **Proposal Templates** — reusable proposal templates with merge fields and image library

**Financial**
- **Payment Settings** — configure Stripe, financing link (GreenSky URL), and payment options
- **Usage & Costs** (/crm/settings/costs, owner/admin only) — internal cost tracker: month-to-date estimated spend across AI (Gibbs tokens + Whisper voice minutes, self-metered per call), Render hosting plan, Neon database storage, plus manual flat monthly costs for services without APIs (e.g. Textline); 30-day AI spend chart and a Refresh Providers button
- **Materials Catalog** — manage materials and parts pricing
- **QuickBooks Integration** — QuickBooks Online sync settings and class mapping

**Data & System**
- **Import Data** — import customer or equipment data from CSV
- **Fleet Tracking** — Bouncie GPS vehicle tracking integration
- **CompanyCam** — address-matched CompanyCam project/photo sync (two-way references)
- **Salesbook Directory** — manage the table of contents entries for the digital salesbook
- **Customer Portal** — control whether portal profile edits sync straight into the CRM or wait for review
- **Appearance** — light/dark theme for the CRM
- **System Tools** — system-level configuration and utilities

### Public-facing pages (outside the CRM)
- **Online Booking**: {domain}/book — customer-facing booking form (not in the sidebar, no login needed)
- **Customer Portal**: {domain}/portal — customers view/pay invoices, review quotes, and see agreements + service history (phone/email + password login)
- **Quote Viewer**: {domain}/quote/{id} — customer views and accepts/declines a quote
- **Invoice Viewer**: {domain}/invoice/{id} — customer views and pays an invoice
- **Salesbook**: {domain}/price-book — digital flipbook for sales presentations (no login needed)

---

## MEDIA (PHOTO & FILE GALLERY)
The Media page (/crm/photos, sidebar: Admin → Media) is a live company-wide gallery of every photo and file uploaded against customers — job photos from techs, documents, checklist photos. It refreshes automatically every 10 seconds ("Live" indicator). Features: search by file name/customer/uploader; tabs for All, Photos, Documents, Checklist Photos, Recent; Grid or List views with thumbnail zoom; filters by customer, uploader, and date range; Google-Photos-style multi-select with bulk Download and bulk Delete; full-screen lightbox viewer for images and PDFs; an Upload button that attaches files to a chosen customer.

## MAIL (GMAIL INBOX)
The Mail page (/crm/mail, part of Inbox) is a full Gmail client inside the CRM via Google Workspace OAuth — each user connects their own Gmail with the Connect Gmail button. Thread list with unread dots and Inbox/Unread/Sent folders, auto-sync every few seconds, customer identity strip linking to the CRM record (or a "Not in CRM" badge), sanitized HTML bodies with inline images and attachment viewing, Archive/Delete, inline reply with attachments, and a Gmail-style Compose panel with To/Cc/Bcc autocomplete over CRM customers. A Messages | Mail switcher at the top moves between SMS and email. The forward-arrow button in the Mail header opens Auto-forwarding rules: "mail from sender X arriving in user Y's mailbox re-sends automatically to addresses Z" (e.g. Neighborly Software notifications in Chandler's mailbox forward to Earnest and Gefa). Rules run server-side every few minutes even with the CRM closed, forward each message exactly once (attachments included), can be paused or deleted, and show a recently-forwarded list; admins/owner manage them, everyone can view.

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

## PROPOSAL BUILDER
The Proposal Builder (/crm/quotes/proposal, launched from Quotes) is a step-by-step wizard for building install proposals in front of the customer. Steps: pick the unit/system type → tonnage (skipped for Mini-Split, Ducting, and Crawlspace work) → equipment tier from the price book → review the package. It generates a professional proposal (AI-formatted: package description, what's-included by category, line items, warranties & terms, financing text, next steps) that can be presented, saved as a quote, and printed as a PDF. Templates for the written portions are managed in Settings → Proposal Templates (merge fields + image library).
KEY CONCEPT — the Elite package: turning Elite ON adds the Elite bundle to the proposal and activates a 20% DISCOUNT on the system price. The Elite core bundles are: (1) 10-Year Labor Warranty ($1,000 — all labor covered, no service call fees), (2) 10-Year Maintenance Plan ($2,290 — annual tune-ups, priority scheduling, filter replacements), (3) Install Upgrade Bundle (priced by tonnage, $1,000–$5,000 — new copper lineset, proper condensate drainage, low-voltage wiring upgrade). The pitch: maximum protection and longevity for the new system, and the 20% equipment discount offsets much of the bundle cost.

## CARE PLANS & PROTECTION BUNDLES
Monthly CARE PLANS (maintenance agreement sign-ups, billed monthly):
- **Essential Care** — $14/mo: 1 tune-up visit per year, 10% member parts discount, no priority service. Basic protection + compliance.
- **Priority Care** — $21/mo: 2 tune-up visits per year, 15% member parts discount, priority service. The core recommended plan.
- **Elite Care** — $30/mo: 2–3 tune-up visits per year, 20% member parts discount, TOP priority service. The premium full-service membership. Benefits of going Elite over the lower tiers: the most visits (catch problems early), the deepest parts discount, and jumping the line when scheduling is tight (which matters most in peak summer/winter).
One-time INSTALLATION PROTECTION BUNDLES (fixed-price add-ons sold with installs):
- **Elite Protection (10 Yr)** — $1,200: 10-year coverage, 3 maintenance visits, 20% parts discount, priority scheduling. Maximum protection + longevity.
- **Advanced Protection (5 Yr)** — $800: 5-year coverage, 2 maintenance visits, 15% parts discount, priority scheduling.
- **Standard Protection (2 Yr)** — $400: 2-year coverage, 1 maintenance visit, 10% parts discount.
- **Basic Protection (1 Yr)** — $200: 1-year coverage, no scheduled visits, 5% parts discount.

## FEATURES THAT DO NOT EXIST IN THIS CRM

**IMPORTANT: The following features do NOT exist. If asked about them, clearly say they are not part of this system.**

- ❌ No "Settings → Online Booking" page
- ❌ No auto-assignment, round-robin, or auto-dispatch of work orders (Settings → Dispatch Board only sets the grid increment and who appears on the board)
- ❌ No "Settings → Widgets" page
- ❌ No "Public booking URL" field or "booking link" field anywhere in Settings
- ❌ The booking link requires no configuration — it is always {domain}/book

`;
