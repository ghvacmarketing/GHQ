# Backend Logic Flowcharts

This directory contains Mermaid flowcharts documenting the backend architecture and logic flows.

## Master Architecture

**00-master-application-architecture.mmd** - Complete application architecture overview showing all systems, integrations, and data flows in one comprehensive diagram

## Detailed Flowcharts

Each flowchart is in a separate `.mmd` file that can be rendered in Mermaid-compatible viewers:

1. **01-main-request-flow.mmd** - HTTP request flow through Express server
2. **02-employee-auth.mmd** - Employee Portal authentication (Passport.js)
3. **03-crm-auth.mmd** - CRM token-based authentication and middleware
4. **04-customer-management.mmd** - Customer create and retrieve operations
5. **05-work-order-dispatch.mmd** - Work order lifecycle and status transitions
6. **06-quote-generation.mmd** - AI-powered quote generation and sending
7. **07-voice-transcription.mmd** - Voice-to-text with OpenAI Whisper
8. **08-customer-sync.mmd** - Google Sheets customer synchronization
9. **09-invoice-payment.mmd** - Invoice creation, sending, and payment processing
10. **10-project-pipeline.mmd** - Project management and activity tracking
11. **11-database-architecture.mmd** - Database entity relationships
12. **12-external-integrations.mmd** - Third-party API integrations
13. **13-role-based-access.mmd** - Permission hierarchy and access control
14. **14-quickbooks-integration.mmd** - QuickBooks OAuth and sync flows (NEW)
15. **15-customer-portal.mmd** - Customer self-service portal (NEW)
16. **16-messaging-system.mmd** - SMS/Textline integration and automation (NEW)
17. **17-mobile-api.mmd** - Mobile tech app endpoints (NEW)
18. **18-background-services.mmd** - Scheduled jobs and automation (NEW)

## How to View

### Option 1: Mermaid Live Editor
1. Go to https://mermaid.live
2. Copy the contents of any `.mmd` file
3. Paste into the editor

### Option 2: VS Code
1. Install the "Mermaid Preview" extension
2. Open any `.mmd` file
3. Click the preview icon

### Option 3: GitHub
View the full documentation with all flowcharts embedded:
- See `docs/backend-flowchart.md` in the GitHub repository

### Option 4: Command Line
```bash
# Install mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# Generate PNG from any flowchart
mmdc -i 01-main-request-flow.mmd -o main-request-flow.png
```

## Backend Architecture Overview

### Technology Stack
- **Framework:** Express.js with TypeScript
- **Database:** PostgreSQL (Neon) with Drizzle ORM
- **Authentication:**
  - Employee Portal: Passport.js with sessions
  - CRM: Token-based with 8-hour sessions
  - Customer Portal: Token-based with 24-hour sessions
  - Mobile: JWT tokens with 30-day expiry
- **AI:** OpenAI (GPT-3.5-turbo, Whisper, Embeddings)
- **Email:** Resend
- **SMS:** Textline integration
- **Storage:** Google Cloud Storage
- **Payment Processing:** Stripe
- **Integrations:** QuickBooks Online, FieldEdge, Bouncie, Google Sheets

### Key Flows
- **Authentication:** Triple system for employees, CRM users, and customers
- **Customer Management:** CRUD operations with audit logging
- **Work Order Dispatch:** Full lifecycle from scheduling to completion with mobile support
- **Quote Generation:** AI-assisted proposal creation
- **Invoicing:** Creation, sending, payment tracking, and QuickBooks sync
- **Project Pipeline:** Status-based project management with activity timeline
- **Messaging:** Automated SMS notifications and two-way conversations
- **Customer Portal:** Self-service access to invoices, quotes, and service history
- **Mobile App:** Tech work order management with GPS tracking and time clock
- **Background Services:** Automated syncs, renewals, reminders, and review requests

### Role Hierarchy
1. **owner** (100) - Full system access
2. **manager** (80) - Admin-level access
3. **dispatcher** (60) - Job and dispatch management
4. **sales** (40) - Customer and quote management
5. **tech** (20) - Assigned work and status updates
6. **viewer** (10) - Read-only access

### New Features (2024-2026)
- **QuickBooks Integration:** OAuth-based sync for customers, invoices, and payments
- **Customer Portal:** Self-service dashboard with invoice/quote viewing
- **SMS/Textline:** Automated notifications and two-way messaging
- **Mobile Tech App:** Work order management with GPS tracking and time clock
- **FieldEdge Sync:** Auto-importing customer data from Google Sheets
- **Pricebook Management:** Real-time package pricing sync
- **Service Checklists:** AI-powered summaries of field service calls
- **Goals & Performance:** Monthly tracking dashboard for sales and tech performance
- **Bouncie Integration:** Real-time vehicle tracking for fleet management
- **Review Automation:** Automated Google review requests after job completion
- **Background Services:** 9+ automated jobs for syncs, renewals, and reminders

### Total API Coverage
- **468 Total Routes** across all modules
- **200+ CRM Endpoints** for core business operations
- **60+ Integration Endpoints** for external services
- **30+ QuickBooks Endpoints** for accounting sync
- **10+ Mobile Endpoints** for tech app
- **8+ Customer Portal Endpoints** for self-service
