# GHVAC Tools CRM Knowledge Base

## Company Overview
GHVAC Tools is a comprehensive HVAC service management platform designed for field technicians and sales teams. The system streamlines quoting, customer management, project tracking, maintenance agreements, and work order dispatch.

---

## Pricing Engine

### Source of Truth
All pricing data comes from Google Sheets with server-side and client-side caching for fast access.

### Pricing Formula Components
1. **Base Material Cost** - Raw equipment/parts cost
2. **Overhead Multiplier** - Covers operational costs (typically 1.3-1.5x)
3. **Profit Margin** - Standard profit percentage (varies by category)
4. **Financing Markup** - Additional cost when customer chooses financing
5. **Warranty Inclusions** - Extended warranty costs for Elite packages

### Elite Package Pricing
- Elite packages receive a **20% discount** on the combined total
- Elite includes: 10-Year Maintenance, Labor Warranty, Install Bundle, Ducting
- Elite discount is calculated: `subtotal * 0.20`
- Final Elite price: `subtotal - eliteDiscount`

### Financing Terms
- Standard financing: 67 months
- Monthly payment calculation: `totalPrice / 67`
- Financing options displayed for deposits on install quotes

### Discount Policy
- Maximum 10% discount without manager approval
- Elite package discount (20%) is separate from discretionary discounts

---

## Customer Types

### Residential Customers
- Single-family homes, condos, apartments
- Property type defaults to "residential"
- Income routing to "Residential" sub-accounts

### Commercial Customers
- Businesses, offices, retail spaces
- Property type defaults to "commercial"
- Income routing to "Commercial" sub-accounts

### Property Managers
- Manage multiple properties (residential and/or commercial)
- Must manually select property type for each location
- Each property can have different service requirements

---

## Service Categories

### Service Calls
- Diagnostic and repair visits
- Troubleshooting existing systems
- Categorized as "Service" for accounting

### Installations
- New equipment installations
- System replacements and upgrades
- Categorized as "Install" for accounting

### Maintenance
- Scheduled preventive maintenance
- Maintenance agreement visits
- Categorized as "Maintenance" for accounting

### Crawlspace Services
- Encapsulation, moisture control
- Specialized installation category
- Routes to "Install - Crawlspace" for accounting

---

## Quote Types

### Custom Install Quotes
- High-value installation proposals ($5k+)
- Deposit required before work begins
- Displays financing options (Stripe deposit or financing application)
- Typically linked to Projects

### Service Quotes
- Repair and diagnostic proposals
- May or may not require deposits
- Often linked to Work Orders

### Proposal Quotes
- Formal proposals for larger scope work
- Customer acceptance triggers project creation
- Tracks proposal sent date, acceptance, and expiration

### Custom Service Quotes
- Non-standard service work
- Flexible pricing structure
- Can include special terms

---

## Projects

### Project Statuses
1. **Lead** - Initial inquiry, not yet qualified
2. **Proposal Sent** - Quote/proposal delivered to customer
3. **Approved** - Customer accepted, work authorized
4. **In Progress** - Active work underway
5. **Completed** - All work finished
6. **Closed** - Finalized and invoiced
7. **Archived** - Historical record

### Project Scheduling
- Projects can have start and end dates
- Displayed on calendar view as continuous bars
- Scheduled projects appear in Overview section

### Project Value Tracking
- Expected value from accepted quotes
- Actual value from completed invoices
- Pipeline value for forecasting

### Project Timeline
- Chronological activity feed
- Notes, photos, files, status changes
- Financial updates and milestones

---

## Work Orders

### Work Order Statuses
1. **Scheduled** - Appointment set
2. **Dispatched** - Assigned to technician
3. **En Route** - Technician traveling to site
4. **On Site** - Technician at location
5. **Completed** - Work finished

### Work Order Features
- Can be independent or linked to Projects
- Service call checklists with AI summarization
- Photo capture and documentation
- Time tracking for technicians

### Dispatch Board
- Calendar view of all work orders
- Drag-and-drop scheduling
- Technician assignment

---

## Maintenance Agreements

### Billing Frequencies
- Weekly
- Monthly
- Annual

### Agreement Statuses
1. **Pending** - Awaiting first payment
2. **Active** - Fully operational
3. **Grace Period** - Renewal invoice sent (30-day window)
4. **Expired** - Grace period passed
5. **Cancelled** - Customer cancelled

### Payment Types
- **Auto Invoice** - Automatic renewal invoicing
- **Pay on Visit** - Technician collects on site

### Agreement Lifecycle
- New agreements start as "pending" with `isInitialCycle=true`
- First invoice payment activates the agreement
- Sets `activationDate` and flips `isInitialCycle` to false
- Renewals create new visit schedules automatically

---

## Invoicing

### Invoice Statuses
1. **Draft** - Being prepared
2. **Sent** - Delivered to customer
3. **Paid** - Payment received
4. **Void** - Cancelled

### Payment Methods
- Stripe integration for card payments
- Financing applications (GreenSky default)
- Manual payment recording

### QuickBooks Integration
- Bidirectional sync with QuickBooks Online
- Customers, invoices, and payments synced
- Class assignment for P&L tracking

---

## QuickBooks Classes

### Class Structure
Classes route revenue to proper income accounts in QuickBooks:

| Category | Residential | Commercial |
|----------|-------------|------------|
| Service | Service - Residential | Service - Commercial |
| Install | Install - Residential | Install - Commercial |
| Maintenance | Maintenance - Residential | Maintenance - Commercial |
| Discount | Discount - Promotional | Discount - Maintenance |

Special: **Install - Crawlspace** for encapsulation work

### Class Assignment Rules
1. Property type (residential/commercial) determines class suffix
2. Category (service/install/maintenance) determines class prefix
3. Property managers must manually select property type per location
4. Line items can be overridden in advanced mode

---

## User Roles

### Owner
- Full system access
- Can change user roles
- Financial visibility

### Admin
- Full CRM access
- Cannot change roles
- Manage settings

### Supervisor
- Admin-level desktop access
- Enhanced mobile access
- Can view all technicians' work orders
- Self-assign capability

### Sales
- Customer and quote management
- Limited settings access
- Pipeline visibility

### Tech (Technician)
- Mobile app access
- View assigned work orders
- Photo capture and time tracking

---

## Mobile Features (Technician PWA)

### Daily Agenda
- View assigned work orders
- Job details and history

### On-Site Tools
- Photo capture with location data
- Checklist completion
- Time clock in/out
- Customer messaging

### Offline Support
- Background sync for offline changes
- Queue management for poor connectivity

---

## Communication Features

### Messaging Dashboard
- Three-panel interface (inbox, thread, contact)
- Conversation history with customers
- Tags and assignment

### SMS Notifications
- Maintenance reminders (10-day and 5-day)
- Invoice payment links
- Work order status updates (en route, on site)

### Email Notifications
- Quote delivery
- Invoice sending
- Agreement renewals

---

## Equipment Categories

### HVAC Systems
- Air conditioners
- Heat pumps
- Furnaces
- Ductless mini-splits
- Package units

### Air Quality
- Dehumidifiers (e.g., Aprilaire E070)
- Air purifiers
- UV lights
- Whole-home filtration

### Ductwork
- New duct installations
- Duct modifications
- Duct sealing

### Crawlspace
- Encapsulation systems
- Moisture barriers
- Drainage solutions

---

## Common Equipment Brands
- Trane
- Carrier
- Lennox
- Rheem
- Goodman
- Daikin
- Aprilaire (air quality)

---

## Tonnage Reference
HVAC system sizing by tonnage:
- 1.5 ton: ~600-900 sq ft
- 2.0 ton: ~901-1,200 sq ft
- 2.5 ton: ~1,201-1,500 sq ft
- 3.0 ton: ~1,501-1,800 sq ft
- 3.5 ton: ~1,801-2,100 sq ft
- 4.0 ton: ~2,101-2,400 sq ft
- 5.0 ton: ~2,401-3,000 sq ft

---

## Quote Generation Best Practices

### Professional Tone
- Use positive, benefit-focused language
- Highlight value, not just features
- Address customer pain points

### Elite Package Positioning
- Emphasize long-term savings
- Highlight comprehensive coverage
- Show peace of mind benefits

### Financing Presentation
- Always show monthly payment option
- Make large purchases accessible
- Compare to everyday expenses

### Call to Action
- Clear next steps
- Contact information
- Urgency without pressure

---

## Common Customer Questions

### "Why is this so expensive?"
- Explain quality of equipment and installation
- Break down what's included
- Compare long-term value vs cheap alternatives
- Highlight warranty and support

### "Can I get a discount?"
- Maximum 10% without manager approval
- Elite package already includes 20% savings
- Financing makes payments manageable

### "How long will this last?"
- Quality systems: 15-20+ years
- Maintenance agreements extend lifespan
- Warranty protects investment

### "When can you start?"
- Check project calendar for availability
- Consider lead times for equipment
- Discuss scheduling flexibility

---

## Integration Points

### Google Sheets
- Pricing data source
- Customer data sync
- Application settings

### Stripe
- Payment processing
- Deposit collection
- Invoice payments

### QuickBooks Online
- Financial sync
- Customer records
- Invoice/payment tracking

### Textline (Future)
- SMS messaging
- Customer communications

### Geoapify
- Address autocomplete
- Reverse geocoding

---

## Online Booking

### Booking URL
The online booking page is at **{your-domain}/book** — simply append "/book" to the app's domain. There is **no settings page** for this. The URL works automatically with no configuration.

### What the form collects
- Name, phone, email, service address
- Service type and preferred time

### Where bookings go
- Creates a Work Order (status: Scheduled)
- Lands in **Dispatch Board → Unassigned Queue → "Needs Scheduling"**
- No auto-assignment — must be manually assigned on the Dispatch Board

---

## Dispatch Board

### Access
Sidebar → Dispatch Board → /crm/dispatch

### Views
Day, Week, Month, Trucks

### Day View
- Timeline grid: 6 AM to 10 PM, 30-minute slots
- Each row = one technician
- **Unassigned Queue** sits below the timeline — all work orders with no assigned tech
- Drag cards from the queue onto a technician row to assign them
- Click a card → detail side panel opens on the right; the board shrinks to make room

### Side Panel Status Colors
- Amber = Pending/Scheduled
- Blue = Dispatched/En Route/Traveling
- Green = On Site/Working
- Slate = Completed
- Rose = Cancelled

### No auto-dispatch
There is no automatic assignment, round-robin, or auto-dispatch. All assignment is manual.

---

## CRM Navigation

### Sidebar pages (complete list)
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

### Settings sub-sections (real list)
- Users & Roles
- Time Logs
- Checklists
- Pricebook
- Packages
- Materials Catalog
- Payment Settings
- Import Data
- Fleet Tracking
- System

### Public pages (no login)
- Booking form: {domain}/book
- Customer portal: {domain}/portal (magic link)
- Quote viewer: {domain}/quote/{id}
- Invoice viewer: {domain}/invoice/{id}

---

## Features That Do NOT Exist

The following do not exist in this CRM — do not direct users to them:
- No "Settings → Online Booking" or "Settings → Customer Portal" page
- No "Settings → Auto-assignment" or "Settings → Dispatch Rules" page
- No "Settings → Widgets" page
- No "Public booking URL" field in settings
- No auto-assignment, round-robin, or auto-dispatch of work orders
- The booking link requires no configuration — it is always {domain}/book
