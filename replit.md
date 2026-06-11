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
-   **Authentication**: SMS Magic Link via Twilio, developer backdoor, Employee Portal with username/password (scrypt-hashed). CRM staff can additionally sign in with Google OAuth — the verified Google email is matched against the active `crm_users` allowlist (no auto-provisioning). New authorized emails are added under Settings → Users & Roles; leaving the password blank creates a Google-only account. Endpoints: `GET /api/crm/auth/google` (start) and `GET /api/crm/auth/google/callback` (callback). Google sign-ins are recorded in `crm_audit_log` with `method: "google"`.

### Key Design Decisions
-   **Monorepo**: Shared TypeScript types and Zod schemas.
-   **Pricing Engine**: Google Sheets as source of truth with server-side and client-side caching. Sophisticated formulas for overhead, profit, financing, and warranty.
-   **Quote Generation**: Text-based output with server-side calculations, editable drafts, toggleable detailed breakdowns, and AI-powered generation using OpenAI GPT-5.2.
-   **CRM & Sales Funnel**: Kanban-style pipeline for leads with configurable types and a two-dimensional classification system (Lead Temperature, Customer Driver). Supports lead management, follow-up tracking, and CSV import/export.
-   **Task Management System**: Comprehensive task tracking with configurable task types, role-based permissions, and integration with customer, lead, and project entities. Features include:
    -   **Subtasks**: Checklist items within tasks with optional due dates, inline add/edit UI, completion toggles, and calendar integration
    -   **Task Comments**: @mention support for team collaboration with notifications linking back to tasks
    -   **Calendar View**: Shows both tasks and dated subtasks with drag/drop rescheduling
-   **Project & Work Order Management**: Projects for high-value scopes with pipeline statuses; Work Orders for scheduled visits with dispatch statuses. Features a Dispatch Board focused on Work Orders.
-   **Quotes and Invoices System**: Integrated CRM quotes and invoices with status workflows. Supports deposit-required quotes with dual payment options (Stripe/financing).
-   **Job Costing System**: Tracks project profitability with live calculations, materials catalog, labor entry tracking, and configurable overhead/commission percentages.
-   **Customer Database**: FieldEdge CSV import, Google Sheets two-way sync, customer lookup.
-   **Processes and Systems Module**: Searchable, voice-guided wiki with Tiptap editor and PDF export.
-   **Maintenance Agreements System**: Flexible billing frequencies, configurable visits, regional reminders, auto-creation from paid invoices, and a payment-based lifecycle with statuses like pending, active, grace_period, and expired.
-   **Protection & Care Plans**: Installation Protection Bundles are fixed-price quote add-ons in a dedicated "Protection Plans" Items category (`crmItemCategoryEnum` value `protection`); four bundles (Basic/Standard/Advanced/Elite) are seeded with coverage details in the description. Three monthly "Care" plans (Essential/Priority/Elite) are seeded as `customAgreementTypes` templates (frequency `monthly`; `visitsPerPeriod` holds the per-year visit count with the real annual cadence noted in the description). Idempotent check-by-name seeds run at startup in `server/index.ts` (`runProtectionAndCarePlanSeeds`).
-   **Service Call Checklists**: Dynamic, service type-mapped intake questionnaires with AI summarization (OpenAI GPT-3.5) and required question enforcement.
-   **Customer Portal**: Self-service portal for customers to view invoices, agreements, and service history via magic link login.
-   **User Roles**: Granular CRM roles (Owner, Admin, Supervisor, Sales, Tech) with distinct access levels for desktop and mobile, including enhanced mobile capabilities for Supervisors.
-   **Mobile Technician PWA**: Offline-first architecture for field technicians featuring daily agenda, job details, photo capture, background sync, time tracking, and customer messaging.
-   **Security**: Environment variable-based secrets, httpOnly cookies, and strict customer-scoped data filtering.
-   **Vector Store Knowledge Base**: Optional OpenAI vector store integration for enhanced AI quote generation.
-   **Messaging Dashboard**: Three-panel Textline-style messaging interface for customer communications, accessible by mobile techs.
-   **Automated SMS Notifications**: System for sending automated SMS alerts to customers via Textline for maintenance reminders, invoice payments, and work order status updates.
-   **Time Tracking System**: Technicians clock in/out from the mobile app, with entries stored and editable by Admins.
-   **QuickBooks Online Integration**: Full bidirectional OAuth 2.0 sync for customers, invoices, and payments, featuring a hierarchical class assignment system based on customer and property types, and an admin UI for managing classes and chart of accounts.
-   **Customer Files & Photos**: Upload and manage files/photos per customer via object storage presigned URLs. Files split into Photos (image grid with preview lightbox) and Documents (list with download). Uploaded files also appear in the customer timeline as `file` entries with image thumbnails.
    -   Table: `customer_files`
    -   API: `/api/crm/customers/:id/files` (GET/POST), `/api/crm/customers/:id/files/:fileId` (DELETE)
    -   Component: `CustomerFilesTab` in `crm-customer-detail.tsx`
-   **Tagged Comments System**: Directed internal notes that can be left on any CRM page. Users tag one or more team members; only tagged users and the author see the comment. Comments appear as floating bubbles on the relevant page with a resolve flow. Integrates with the notification system (type: "tagged_comment"). Accessed via the floating tool menu (wrench icon) in bottom-right corner, which also provides access to Search and Ask AI.
    -   Tables: `crm_tagged_comments`, `crm_tagged_comment_recipients`
    -   API: `/api/crm/tagged-comments` (POST, GET), `/api/crm/tagged-comments/count`, `/api/crm/tagged-comments/:commentId/resolve`, `/api/crm/tagged-comments/lookup/:commentId`
-   **E-Signature Module (CRM → Operations → Signatures)**: DocuSign-like flow. CRM users upload a PDF, add recipients, and place fields (signature, initials, name, date, text) on the PDF by selecting a recipient + field type and clicking/dragging on the rendered pages. Sending generates per-recipient unique tokens, emails secure signing links via Resend, and locks the document from edits. Recipients sign through a public token page (`/sign/:token`) with a canvas signature pad; when all recipients have signed, the PDF is flattened with pdf-lib (signature images + drawn text) and stored as the signed copy. Field coordinates are stored as 0..1 fractions from the top-left. Submit endpoint validates field types server-side (signature/initials must be image data URLs).
    -   Tables: `signature_documents`, `signature_recipients`, `signature_fields`
    -   API (CRM): `/api/crm/signature-documents` (GET/POST), `/api/crm/signature-documents/:id` (GET/PATCH/DELETE), `.../recipients` (POST), `.../recipients/:recipientId` (DELETE), `.../fields` (PUT replace), `.../send` (POST)
    -   API (public, token-based, no auth): `/api/sign/:token` (GET), `/api/sign/:token/file` (GET — streams PDF), `/api/sign/:token/submit` (POST)
    -   Routes: `server/esign-routes.ts`; PDF flatten/upload: `server/services/esign-pdf.ts`
    -   Pages: `client/src/pages/crm/crm-esign.tsx` (list), `crm-esign-editor.tsx` (builder), `client/src/pages/public/sign.tsx` (signer); `client/src/components/esign/signature-pad.tsx`
-   **Dynamic Salesbook Flipbook**: Self-hosted flipbook viewer using `react-pageflip` with two sections: (1) static Chandler intro pages 1–12 as optimized JPEGs from `public/salesbook-pages/`, and (2) dynamic product pages rendered live from `pricebook_packages` DB data. Dynamic pages cover all unit types (SGA, SHP, STA, GP, PHP, Mini-Split, Ducting), Elite upgrade bundles, and Crawlspace services. Each unit type gets a category divider, tier overview with pricing matrix, and per-tonnage product detail pages showing all package levels (Best/Better/Good/Budget) with equipment images, model info, and pricing (monthly + total). TOC auto-generated from section dividers.
    -   Tables: `salesbook_bookmarks`, `pricebook_packages`, `crawlspace_tiers`
    -   API: `/api/salesbook/data` (GET — returns static pages + live packages + crawlspace tiers), `/api/salesbook/bookmarks` (GET/POST/PATCH/DELETE), `/api/salesbook/pages`
    -   Components: `client/src/components/salesbook-pages.tsx` (all dynamic page components + section builder)
    -   Pages: `client/src/pages/price-book.tsx` (public flipbook viewer at `/salesbook`), `client/src/pages/crm/crm-salesbook.tsx` (CRM-embedded viewer at `/crm/salesbook`), `client/src/pages/crm/crm-settings-salesbook.tsx` (bookmark admin)
    -   Public link: `/salesbook` — no login required, full flipbook with TOC, zoom, fullscreen. Changes in the CRM auto-update here since it uses the same data API.

## External Dependencies
-   **Google Sheets API**: Parts pricing, application settings, customer data sync.
-   **Resend**: Email notifications for CRM quotes and tracking.
-   **Trello API**: Workflow management.
-   **Neon Database**: PostgreSQL hosting.
-   **OpenAI API**: Whisper, GPT, Vector Stores.
-   **Twilio**: SMS Magic Link authentication.
-   **Geoapify API**: Address autocomplete, reverse geocoding.
-   **react-pdf**: PDF viewing.
-   **jsPDF**: PDF export generation.
-   **Replit App Storage (@google-cloud/storage)**: Cloud file storage for attachments.