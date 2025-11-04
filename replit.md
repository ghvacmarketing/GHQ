# HVAC Service Pricing & Quoting App

## Overview

This is a mobile-first web application designed for HVAC technicians to generate professional quotes on-site and manage service processes. It features a no-authentication approach for immediate access to pricing data, part selection from integrated Google Sheets, custom component addition, and generation of copyable quotes. The system automates email notifications to managers and creates Trello cards for follow-up and parts ordering. A "Processes and Systems" module provides a searchable wiki for saved procedures, with manual and voice-guided creation options, and PDF export functionality. The app is rebranded as "GHVAC Tools" and aims to streamline field operations and improve service efficiency.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite
- **UI**: Radix UI, shadcn/ui, Tailwind CSS (with theming)
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **Design**: Mobile-first, responsive, PWA support (service worker, manifest)

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **Database**: PostgreSQL with Drizzle ORM (Neon Database for cloud)
- **API**: RESTful endpoints
- **Storage Pattern**: In-memory storage with interface for future database migration
- **Authentication**: Designed for future extensibility, currently uses SMS Magic Link authentication with Twilio and a phone whitelist, and a developer backdoor using `REPLIT_ACCESS_TOKEN`.

### Key Design Decisions
- **Monorepo**: Shared TypeScript types and Zod schemas, unified build, path aliases.
- **Pricing**: Google Sheets as source of truth, server-side caching, real-time updates, custom parts support.
- **Quote Generation**: Text-based output, server-side calculation (subtotals, labor, tax, totals), warranty logic. The `laborHours` field is persisted in the database to ensure accurate recalculation when editing quotes.
- **Pricing Formula** (Updated Nov 2025):
  - **Selling Price = Direct Cost ÷ (1 - Overhead%)**
  - Direct Cost = Parts + Material Shrinkage + Labor + Labor Benefits + Sales Tax + Warranty Reserve
  - Only overhead is applied as markup to calculate selling price
  - Profit, financing, and commission are calculated FROM the selling price for transparency but are NOT added to the customer's total
  - These informational breakdowns show where revenue is allocated but do not inflate the price
- **Warranty Calculation Logic** (Updated Nov 2025): 
  - GHVAC covers specific parts at 100%: control board, evaporator coil, and compressor (identified by description matching)
  - Dual selling price calculation: (1) Full Selling Price with ALL parts for transparency, (2) Customer Selling Price excluding GHVAC-covered parts
  - Warranty coverage percentages (25%-90% by year) represent what the customer PAYS, not what they save
  - Customer total = Customer Selling Price × Warranty Coverage %
  - This ensures proper accounting of markup, overhead, tax, and profit on GHVAC-covered components
- **Quote Editing Protection**: Quotes can only be edited when status is "draft" and not pushed to Trello. Non-editable quotes display a warning banner with context-aware messaging and disable all form fields to prevent accidental changes. This ensures data integrity for quotes being tracked in external systems.
- **Quote Breakdown Display**: Toggleable detailed breakdown in quote summary showing all intermediate calculations. Default view displays simple summary (subtotal, labor, tax, total). Expandable view reveals complete calculation breakdown including parts subtotal, free parts, material shrinkage, labor benefits, warranty reserve, direct cost, overhead allocation, profit allocation, financing cost, and commission. Works identically in both quote creation and edit flows.
- **Developer Tools**: Admin-accessible section displaying live quote calculation formulas with actual values from current Google Sheets settings. Shows step-by-step calculation logic including material costs, labor calculations, taxes, warranty reserve, and selling price formula with all percentage allocations (overhead, profit, financing, commission). Explicitly labeled as "Live Formula" to clarify values come from Google Sheets, not hard-coded constants.
- **Processes and Systems Module**: Searchable wiki, manual and voice-guided process creation (using OpenAI Whisper for transcription and GPT for formatting/extraction with configurable cleanup intensity), PDF export (jsPDF), PostgreSQL storage with JSON column for steps.
- **PDF Management**: Secure storage and viewing of Price Book PDFs in PostgreSQL, admin-controlled upload with password protection and size validation.
- **App Configuration**: Separate API endpoints for Google Sheets pricing and database-backed application settings.
- **Announcement System**: Admin-configurable modal for user notifications with version tracking via localStorage. Supports full CRUD operations (create, edit, delete) with automatic active/inactive management. Markdown support for links (plain URLs and [text](url) format) with URL sanitization for security.
- **Security**: SESSION_SECRET environment variable is required at startup to prevent use of insecure default secrets.

## External Dependencies

- **Google Sheets API**: For parts pricing and application settings.
- **SendGrid**: For email notifications.
- **Trello API**: For automated workflow management (parts ordering, follow-ups).
- **Neon Database**: Serverless PostgreSQL hosting.
- **OpenAI API (Whisper & GPT)**: For voice transcription, intelligent text formatting, and extraction in the Processes module.
- **Twilio**: For SMS Magic Link authentication.
- **react-pdf**: For PDF viewing.
- **jsPDF**: For generating PDF exports of processes.