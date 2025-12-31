# Backend Logic Flowcharts

This directory contains Mermaid flowcharts documenting the backend architecture and logic flows.

## Files

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
- **AI:** OpenAI (GPT-3.5-turbo, Whisper)
- **Email:** Resend
- **Storage:** Google Cloud Storage

### Key Flows
- **Authentication:** Dual system for employees and CRM users
- **Customer Management:** CRUD operations with audit logging
- **Work Order Dispatch:** Full lifecycle from scheduling to completion
- **Quote Generation:** AI-assisted proposal creation
- **Invoicing:** Creation, sending, and payment tracking
- **Project Pipeline:** Status-based project management

### Role Hierarchy
1. **owner** (100) - Full system access
2. **manager** (80) - Admin-level access
3. **dispatcher** (60) - Job and dispatch management
4. **sales** (40) - Customer and quote management
5. **tech** (20) - Assigned work and status updates
6. **viewer** (10) - Read-only access
