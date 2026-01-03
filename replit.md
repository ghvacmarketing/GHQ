# HVAC Service Pricing & Quoting App

## Overview
This mobile-first web application, rebranded as "GHVAC Tools," streamlines HVAC service operations by enabling technicians to generate professional quotes on-site. Key features include no-authentication access to pricing, part selection from Google Sheets, custom component addition, and automated quote generation. It integrates with Trello for follow-ups and parts ordering, sends email notifications, and includes a "Processes and Systems" module for searchable, voice-guided operational procedures. The application aims to enhance field efficiency and service management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite
- **UI**: Radix UI, shadcn/ui, Tailwind CSS (theming), mobile-first, responsive, PWA support
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **Database**: PostgreSQL with Drizzle ORM (Neon Database)
- **API**: RESTful endpoints
- **Authentication**: SMS Magic Link via Twilio (phone whitelist), developer backdoor, future extensibility.

### Key Design Decisions
- **Monorepo**: Shared TypeScript types and Zod schemas, unified build.
- **Pricing**: Google Sheets as source of truth with server-side in-memory caching (24-hour TTL) and client-side session caching for performance and reduced API usage. Includes custom parts and real-time updates.
- **Admin Settings Optimization**: Split into `AdminLogin` and `AdminDashboard` for faster initial render and prefetching of data post-authentication.
- **Quote Generation**: Text-based output with server-side calculation of subtotals, labor, tax, and totals. Includes sophisticated pricing formulas considering overhead, profit, financing, and commission, plus detailed warranty logic for GHVAC-covered parts. Quotes are editable only when in "draft" status. Toggleable detailed breakdown of calculations is available.
- **Developer Tools**: Admin-accessible section displaying live quote calculation formulas with values from Google Sheets settings.
- **Processes and Systems Module**: Searchable wiki supporting manual and voice-guided (OpenAI Whisper/GPT) process creation. Features a Tiptap rich text editor for descriptions (with inline images, links, file references), PDF export (jsPDF), and robust backward compatibility for legacy content.
- **PDF Management**: Secure storage and viewing of Price Book PDFs in PostgreSQL.
- **Announcement System**: Admin-configurable modal for user notifications with Markdown support.
- **Sales Prospects**: CRM pipeline with lead management, notes, tasks, CSV import/export, phone/email validation, Geoapify address autocomplete, and HTML5 geolocation.
- **Prospect Sales Funnel**: Kanban-style sales pipeline for tracking prospects through stages (New → Contacted → Quote Sent → Negotiating → Won/Lost). Features:
  - `crmFollowUps` table for scheduling and tracking follow-up interactions (call, email, visit, text)
  - Customer fields: salesStage, interestLevel (hot/warm/cold), assignedSalesRepId, nextFollowUpAt, convertedAt
  - Customer creation form includes "Track in Sales Funnel" toggle with initial stage/interest and optional follow-up scheduling
  - Sales Funnel page (`/crm/prospect-funnel`) with Kanban columns, prospect cards showing follow-up status, overdue badges
  - Auto-sync of customer's nextFollowUpAt to earliest pending follow-up
  - Quick actions for stage advancement and follow-up creation
- **Installation Pipeline**: Kanban board for tracking installation jobs, integrating with sales leads. Features drag-and-drop, optimistic updates, and mobile-first design.
- **Projects vs Work Orders Architecture**: Separated scheduling from pipeline tracking:
  - **Projects** (`crmProjects`): Big-ticket scope containers ($5k+) with pipeline statuses (Lead → Proposal Sent → Approved → In Progress → Completed → Closed → Archived). Project types: INSTALL, DUCT, COMMERCIAL, MAINTENANCE_AGREEMENT, MAJOR_REPAIR. Can contain multiple Work Orders.
  - **Work Orders** (`crmWorkOrders`): Scheduled visits/appointments with dispatch statuses (Scheduled → Dispatched → En Route → On Site → Completed). Visit types: SERVICE, INSTALL, MAINTENANCE, SALES. Can exist independently or be linked to Projects. Each work order belongs to a customer and property. Tracks billing disposition (invoice_created, no_charge, billed_elsewhere).
  - Projects and Work Orders are independent but linkable - Work Orders have optional `projectId` foreign key.
  - Dispatch Board shows Work Orders only. Projects page shows the pipeline view with filtering.
- **Quotes and Invoices System**: Integrated quoting and invoicing for CRM:
  - **CRM Quotes** (`crmQuotes`): Proposals attached to a "scope container" - either a Work Order (service/maintenance) or a Project (big-ticket jobs). Status workflow: draft → sent → accepted/declined/expired. Auto-generates quote numbers (Q-YYYYMMDD-XXX). Line items stored in `crmQuoteLineItems`.
  - **CRM Invoices** (`crmInvoices`): Always tied to Work Orders (visits). Status workflow: draft → sent → paid/void. Tracks payment method, amount paid, balance due. Auto-generates invoice numbers (INV-YYYYMMDD-XXX). Line items stored in `crmInvoiceLineItems`. Project invoices are rollups from work order invoices.
  - **Service Flow**: WO #1 diagnostic → create Quote if repair needed → if accepted, add to WO #1 or create WO #2 → Invoice on completion.
  - **Project Flow**: Project contains Quotes (proposals) → when accepted, schedule Work Orders → Invoices generated from Work Orders roll up to project totals.
  - **UI**: Work Order detail page shows linked Quotes and Invoice sections. Project detail page has tabs for Overview, Work Orders, Quotes, Invoices, and Timeline.
- **Project Timeline**: Aggregates all project activities (notes, photos, files, status changes, financial updates, approvals) with chronological display. Features type filtering, date range filtering, pinned items section, daily grouping, and work order linkage. Activity types include: note, photo, file, status_change, financial, approval, work_order_created, work_order_completed, quote_sent, quote_accepted, invoice_sent, invoice_paid. Stored in `projectActivities` table.
- **Customer Database**: FieldEdge CSV import system with checksum-based upsert for syncing customer data. Auto-syncs from Google Sheets every 10 minutes with two-way sync (add, update, delete). Integrates customer lookup into lead forms and quote generation.
- **AI Quote Generation**: Uses OpenAI GPT-5.2 with structured outputs (strict json_schema) for consistent, sales-ready quotes. Features conversation memory with rolling summaries (last 10 messages stored in database), and optional knowledge base integration via vector store file_search to enhance product descriptions from uploaded sales PDFs.
- **Vector Store Knowledge Base**: Optional feature that uploads sales books and product documentation to OpenAI vector stores for enhanced quote generation. Gracefully degrades when API is not available. Admin endpoints for file management.
- **Security**: Requires `SESSION_SECRET` and `ADMIN_API_KEY` environment variables. Implements a `GLOBAL_PASSWORD` gate for application-wide access control, configurable via environment variables.
- **CRM User Roles**: Four distinct roles with different access levels:
  - **Owner**: Full access to everything (desktop CRM + mobile app). Current user: Ryo.
  - **Admin**: Desktop CRM access only. Current user: Kylee.
  - **Sales**: Desktop CRM + mobile access with manager-level features (can delete customers, access discounts). Current users: Chandler, Ernest.
  - **Tech**: Mobile app access only. Current users: Brian, Christopher, Tucker.
  - Route guards enforce access: `crm-route-guard.tsx` blocks tech from desktop, `mobile-shell.tsx` blocks admin from mobile.
- **Employee Portal**: Separate authentication system with username/password login (scrypt-hashed passwords). Supports Employee and Admin roles with server-side permission enforcement. Employees can only view their own data (profile, compensation, paystubs, documents). Admins can create/deactivate users, set pay rates with effective dates, upload paystubs, and view audit logs. Features 8-hour session timeout and PostgreSQL-backed sessions.
- **Maintenance Agreements System**: Comprehensive maintenance contract management with:
  - **Three key dates**: Contract date (signing), Invoice date (same as contract), Appointment date (1 month after contract for payment grace period)
  - **Regional reminders**: Configurable reminder days per region/county (e.g., Jefferson County on 1st, Richmond County on 15th)
  - **Visit tracking**: Auto-generates 2 visits per year, 6 months apart from appointment date
  - **Database tables**: `maintenance_regions` (county name, reminder day), `maintenance_visits` (agreement ID, visit number, target date, work order link, status), `customAgreementTypes` (reusable templates)
  - **Smart form**: When contract date is set, auto-fills invoice date, appointment date (+1 month), start date, and end date (+1 year)
  - **Default pricing**: $229/year with auto-renew enabled
  - **Work order integration**: Visits can be linked to work orders for scheduling. Work order completion auto-syncs to maintenance visits (marks complete, updates nextServiceDate)
  - **Custom Agreement Types**: Admin-configurable templates for non-HVAC services (crawlspace inspections, plumbing checks, etc.). Auto-creates billable items in Maintenance category. Dynamic work subtypes under MAINTENANCE include "Preventative Maintenance" + all active custom agreement types.
  - **Customer Profile Maintenance Status**: Shows "X of Y visits complete" summary with pending visit details via `/api/crm/customers/:id/agreements` endpoint
- **Service Call Checklists**: Dynamic intake questionnaires for service work orders with:
  - **Database tables**: `serviceCallChecklists` (template per service type), `checklistQuestions` (questions with order/required flags), `workOrderChecklistResponses` (answers linked to work order)
  - **Service type mapping**: Work subtypes map to checklist templates (NO_HEAT, NO_AC, WATER_LEAK, OTHER)
  - **Dynamic form**: When creating SERVICE work order, checklist questions appear based on work subtype
  - **AI summarization**: OpenAI GPT-3.5 generates technician-friendly summary from answers (with text fallback)
  - **Required question enforcement**: Frontend validation (button disabled) + mutation guard + server-side rejection
  - **Admin UI**: `/crm/checklists` page for managing templates and questions (admin-only CRUD, all CRM users can read)
  - **Technician view**: Work order detail page shows AI summary and all checklist answers
  - **Default checklists seeded**: NO_HEAT (9 questions), NO_AC (8 questions), WATER_LEAK (6 questions)

## External Dependencies
- **Google Sheets API**: Parts pricing and application settings.
- **Resend**: Email notifications for CRM quote delivery with professional HTML templates and email tracking via `quoteEmailLogs` table.
- **Trello API**: Workflow management.
- **Neon Database**: PostgreSQL hosting.
- **OpenAI API (Whisper & GPT)**: Voice transcription, intelligent text formatting/extraction, and AI-powered quote generation using GPT-5.2 with structured outputs, conversation memory, and optional vector store knowledge base integration.
- **Twilio**: SMS Magic Link authentication.
- **Geoapify API**: Address autocomplete and reverse geocoding.
- **react-pdf**: PDF viewing.
- **jsPDF**: PDF export generation.
- **Replit App Storage**: Cloud file storage with presigned URL uploads via `@google-cloud/storage`. Attachments table tracks file metadata with references to projects, activities, and work orders.
- **Mobile Technician PWA**: Progressive Web App for field technicians at `/mobile` routes with:
  - **Offline-first architecture**: Service worker caches work orders, customer data, and UI for offline access
  - **Daily agenda**: Shows technician's scheduled work orders for today with status badges and customer info
  - **Job detail**: Full work order view with status updates, quick actions (call, text, navigate), notes, and photo capture
  - **Background sync**: Queues changes made offline (status updates, notes) and syncs when back online with conflict-safe merge logic
  - **Pending changes indicator**: Shows amber badges for work orders with unsynced changes
  - **Optimistic updates**: UI updates immediately when making changes, with "Pending sync" badges for offline content
  - **Key files**: `client/src/pages/mobile/`, `client/src/lib/offline-queue.ts`, `client/src/hooks/use-online-status.tsx`, `client/public/service-worker.js`