# HVAC Service Pricing & Quoting App

## Overview
GHVAC Tools is a mobile-first web application designed to optimize HVAC service operations. It enables technicians to generate professional quotes on-site, offering features like no-authentication pricing access, dynamic part selection, custom component addition, and automated quote generation. The application integrates with Trello for follow-ups and parts ordering, provides email notifications, and includes a "Processes and Systems" module for searchable, voice-guided operational procedures. Its core purpose is to enhance field efficiency, streamline service management, and provide a comprehensive CRM solution for sales, installations, and maintenance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
-   **Frontend**: React 18 (TypeScript, Vite), Radix UI, shadcn/ui, Tailwind CSS, Wouter, TanStack Query. Mobile-first, responsive PWA.
-   **Backend**: Node.js, Express.js (TypeScript, ES modules).
-   **Database**: PostgreSQL with Drizzle ORM (Neon Database).
-   **API**: RESTful.
-   **Authentication**: SMS Magic Link via Twilio, developer backdoor, Employee Portal with username/password (scrypt-hashed).

### Key Design Decisions
-   **Monorepo**: Shared TypeScript types and Zod schemas.
-   **Pricing Engine**: Google Sheets as source of truth with server-side and client-side caching. Sophisticated formulas for overhead, profit, financing, and warranty.
-   **Quote Generation**: Text-based output with server-side calculations, editable drafts, and toggleable detailed breakdowns. AI-powered quote generation using OpenAI GPT-5.2 with structured outputs and conversation memory.
-   **CRM & Sales Funnel**: Kanban-style pipeline for prospects (New → Contacted → Quote Sent → Negotiating → Won/Lost), lead management, follow-up tracking, CSV import/export, and address auto-completion.
-   **Project & Work Order Management**:
    -   **Projects**: High-value scope containers ($5k+) with pipeline statuses (Lead → Proposal Sent → Approved → In Progress → Completed → Closed → Archived). Can contain multiple Work Orders.
    -   **Work Orders**: Scheduled visits/appointments with dispatch statuses (Scheduled → Dispatched → En Route → On Site → Completed). Can be independent or linked to Projects.
    -   **Dispatch Board**: Focuses on Work Orders.
-   **Quotes and Invoices System**: Integrated CRM quotes attached to Work Orders or Projects with status workflows (draft → sent → accepted/declined/expired). CRM Invoices tied to Work Orders with status workflows (draft → sent → paid/void).
-   **Project Timeline**: Aggregates all project activities (notes, photos, files, status changes, financial updates) chronologically.
-   **Customer Database**: FieldEdge CSV import, Google Sheets two-way sync, customer lookup integration.
-   **Processes and Systems Module**: Searchable, voice-guided wiki with Tiptap editor, PDF export, and backward compatibility.
-   **Maintenance Agreements System**: Flexible billing frequencies (weekly, monthly, annual), configurable visits, regional reminders, auto-creation from paid invoices, and **payment-based lifecycle**. Statuses: pending (awaiting first payment), active (fully operational), grace_period (renewal invoice sent, 30-day window), expired (grace period passed), cancelled. Billing preferences: auto_invoice (automatic renewal invoicing), pay_on_visit (technician collects on site), prepaid (paid upfront). Key behaviors:
    -   New agreements start as `pending` with `isInitialCycle=true`; no automatic invoices sent until manually triggered via "Send First Invoice" button
    -   When first invoice is paid: agreement activates, `activationDate` is recorded, `isInitialCycle` flips to false
    -   Auto-renewal only applies to active, non-initial, auto_invoice agreements; daily job checks `nextInvoiceDate`, sends renewal, sets 30-day grace period
    -   When renewal invoice is paid: pending visits are cancelled and new visits created for the new cycle
    -   Agreements with unpaid grace periods past 30 days are marked expired
    -   Admins can manually trigger renewal processing via the "Process Renewals" button on the Agreements page
-   **Service Call Checklists**: Dynamic, service type-mapped intake questionnaires for work orders with AI summarization (OpenAI GPT-3.5) and required question enforcement. Admin UI for template management.
-   **Customer Portal**: Self-service portal for customers to view invoices, agreements, and service history via magic link login.
-   **User Roles**: Granular CRM roles (Owner, Admin, Supervisor, Sales, Tech) with distinct access levels for desktop and mobile applications. Supervisor role has admin-level desktop access plus enhanced mobile with "All Techs / My Jobs" toggle to view all technicians' work orders, self-assign capability ("Assign to Me" button), and ability to edit their assigned work orders directly from mobile. Only the Owner can change user roles.
-   **Mobile Technician PWA**: Offline-first architecture for field technicians with daily agenda, job details, photo capture, background sync for offline changes, time tracking clock in/out, and messaging with customer search.
-   **Security**: Environment variable-based secrets (`SESSION_SECRET`, `ADMIN_API_KEY`, `GLOBAL_PASSWORD`), httpOnly cookies, and strict customer-scoped data filtering.
-   **Vector Store Knowledge Base**: Optional OpenAI vector store integration for enhanced AI quote generation from uploaded sales documents.
-   **Messaging Dashboard**: Textline-style three-panel messaging interface for customer communications. Left panel shows conversation inbox with filters/search, center panel displays message thread with chat bubbles and composer, right panel shows contact sidebar with assignment, tags, and quick actions. Built with adapter pattern for future Textline integration via webhooks. Mobile techs can also access messaging via `/mobile/messages` with contact search.
-   **Time Tracking System**: Technicians clock in/out from mobile app (`/mobile/time`). Entries stored in `crm_time_entries` table with tech ID, timestamps, optional work order link, and notes. Admins view/edit all entries via CRM Settings > Time Logs (`/crm/settings/time-logs`) with filters, CSV export, and adjustment capabilities.

## External Dependencies
-   **Google Sheets API**: Parts pricing, application settings, customer data sync.
-   **Resend**: Email notifications for CRM quotes and tracking.
-   **Trello API**: Workflow management.
-   **Neon Database**: PostgreSQL hosting.
-   **OpenAI API**: Whisper (voice transcription), GPT (intelligent text formatting, AI quote generation, AI checklist summarization), Vector Stores (knowledge base).
-   **Twilio**: SMS Magic Link authentication.
-   **Geoapify API**: Address autocomplete, reverse geocoding.
-   **react-pdf**: PDF viewing.
-   **jsPDF**: PDF export generation.
-   **Replit App Storage (@google-cloud/storage)**: Cloud file storage for attachments.