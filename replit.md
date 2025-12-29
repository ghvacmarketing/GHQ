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
- **Installation Pipeline**: Kanban board for tracking installation jobs, integrating with sales leads. Features drag-and-drop, optimistic updates, and mobile-first design.
- **Projects vs Work Orders Architecture**: Separated scheduling from pipeline tracking:
  - **Projects** (`crmProjects`): Big-ticket scope containers ($5k+) with pipeline statuses (Lead → Proposal Sent → Approved → In Progress → Completed → Closed → Archived). Project types: INSTALL, DUCT, COMMERCIAL, MAINTENANCE_AGREEMENT, MAJOR_REPAIR. Can contain multiple Work Orders.
  - **Work Orders** (`crmWorkOrders`): Scheduled visits/appointments with dispatch statuses (Scheduled → Dispatched → En Route → On Site → Completed). Visit types: SERVICE, INSTALL, MAINTENANCE, SALES. Can exist independently or be linked to Projects. Each work order belongs to a customer and property.
  - Projects and Work Orders are independent but linkable - Work Orders have optional `projectId` foreign key.
  - Dispatch Board shows Work Orders only. Projects page shows the pipeline view with filtering.
- **Customer Database**: FieldEdge CSV import system with checksum-based upsert for syncing customer data. Auto-syncs from Google Sheets every 10 minutes with two-way sync (add, update, delete). Integrates customer lookup into lead forms and quote generation.
- **AI Quote Generation**: Uses OpenAI GPT-5.2 with structured outputs (strict json_schema) for consistent, sales-ready quotes. Features conversation memory with rolling summaries (last 10 messages stored in database), and optional knowledge base integration via vector store file_search to enhance product descriptions from uploaded sales PDFs.
- **Vector Store Knowledge Base**: Optional feature that uploads sales books and product documentation to OpenAI vector stores for enhanced quote generation. Gracefully degrades when API is not available. Admin endpoints for file management.
- **Security**: Requires `SESSION_SECRET` and `ADMIN_API_KEY` environment variables. Implements a `GLOBAL_PASSWORD` gate for application-wide access control, configurable via environment variables.
- **Employee Portal**: Separate authentication system with username/password login (scrypt-hashed passwords). Supports Employee and Admin roles with server-side permission enforcement. Employees can only view their own data (profile, compensation, paystubs, documents). Admins can create/deactivate users, set pay rates with effective dates, upload paystubs, and view audit logs. Features 8-hour session timeout and PostgreSQL-backed sessions.

## External Dependencies
- **Google Sheets API**: Parts pricing and application settings.
- **SendGrid**: Email notifications.
- **Trello API**: Workflow management.
- **Neon Database**: PostgreSQL hosting.
- **OpenAI API (Whisper & GPT)**: Voice transcription, intelligent text formatting/extraction, and AI-powered quote generation using GPT-5.2 with structured outputs, conversation memory, and optional vector store knowledge base integration.
- **Twilio**: SMS Magic Link authentication.
- **Geoapify API**: Address autocomplete and reverse geocoding.
- **react-pdf**: PDF viewing.
- **jsPDF**: PDF export generation.