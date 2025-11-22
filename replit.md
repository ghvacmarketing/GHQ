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
- **Google Sheets Caching** (Added Nov 2025):
  - **Server-side in-memory cache** with 24-hour TTL for optimal performance
  - **Client-side session cache** via React Query (staleTime: Infinity)
  - First load fetches from Google Sheets, subsequent loads served from cache (instant)
  - Manual "Refresh Data" button in admin to force fresh fetch
  - **Resilient cache restoration**: If refresh fails (API error, timeout, etc.), previous cache is preserved and served
  - Cache only expires after 24 hours or successful refresh
  - Cache metadata displayed in admin UI showing last sync time and age
  - Dramatically reduces Google Sheets API quota usage and improves load times
  - **NO FALLBACK DEFAULTS**: System will throw error if Google Sheets sync fails AND no cache exists, preventing incorrect quotes with outdated pricing
- **Admin Settings Performance Optimization** (Added Nov 2025):
  - Split admin page into lightweight `AdminLogin` component (instant render) and heavy `AdminDashboard` component (loads after auth)
  - Login page now renders instantly (<50ms) without query setup overhead
  - All admin data prefetches in parallel immediately upon successful login
  - Dashboard appears with cached data already loaded (instant for repeat visits)
  - Removed redundant authentication checks from queries since AdminDashboard only renders after auth verification
- **Quote Generation**: Text-based output, server-side calculation (subtotals, labor, tax, totals), warranty logic. The `laborHours` field is persisted in the database to ensure accurate recalculation when editing quotes.
- **Pricing Formula** (Updated Nov 2025):
  - **Selling Price = Direct Cost ÷ (1 - (Overhead% + Profit% + Financing% + Commission%))**
  - Direct Cost = Parts + Material Shrinkage + Labor + Labor Benefits + Sales Tax + Warranty Reserve
  - All percentages (overhead, profit, financing, commission) are included in the divisor to calculate selling price
  - This ensures all costs and margins are properly accounted for in the final customer price
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
  - **Rich Text Editor** (Added Nov 2025): Process descriptions use Tiptap rich text editor with mobile-friendly toolbar for formatting (bold, italic, headings, lists), inline images (base64-encoded, 5MB limit), links, and file references to attached documents. File references are clickable and open the full-screen viewer. Editor has enhanced border visibility (border-2 with muted-foreground/30) for better UX. Process list cards display plain text previews using stripHtml() to avoid showing raw HTML tags. Helpful info tip guides users to paste markdown-formatted text from AI tools or other sources for easy content creation.
  - **Backward Compatibility System** (Added Nov 2025): Comprehensive conversion and preservation logic for legacy content:
    - `containsHtmlTags()`: Detects actual HTML tags (p, div, span, strong, em, a, br, h1-6, ul, ol, li, etc.) vs plain text with angle brackets
    - `convertToHtml()`: Converts legacy markdown/plain text to HTML for Tiptap rendering
      - Preserves legacy inline HTML like "Inspect <strong>filter</strong> monthly"
      - Escapes plain text with angle brackets like "Replace <filter> monthly" or "L1 < L2 > L3"
      - Converts markdown links [text](url) to HTML <a> tags with proper escaping
      - Converts plain URLs to clickable links
      - Handles special characters (<, >, &, ", ') correctly
    - `stripHtml()`: Strips HTML for PDF export while preserving structure
      - Returns plain text as-is if no HTML tags detected (preserves angle brackets in legacy content)
      - Converts structural tags to text equivalents: <p> → \n\n, <br> → \n, <li> → •
      - Appends link URLs in parentheses: "text (url)"
      - Normalizes whitespace in multi-line links to prevent PDF formatting issues
    - Ensures all legacy content (plain text, markdown, inline HTML) renders correctly in both view and edit modes
    - Preserves formatting in PDF exports while maintaining readability
- **PDF Management**: Secure storage and viewing of Price Book PDFs in PostgreSQL, admin-controlled upload with password protection and size validation.
- **App Configuration**: Separate API endpoints for Google Sheets pricing and database-backed application settings.
- **Announcement System**: Admin-configurable modal for user notifications with version tracking via localStorage. Supports full CRUD operations (create, edit, delete) with automatic active/inactive management. Markdown support for links (plain URLs and [text](url) format) with URL sanitization for security.
- **Sales Prospects** (Added Nov 2025): Full CRM pipeline with lead management, notes, actions, tasks, and CSV import/export. Enhanced form validation including:
  - **Phone Formatting**: Auto-formats to (XXX) XXX-XXXX as user types with real-time validation
  - **Email Validation**: Regex-based validation with visual error feedback
  - **Address Autocomplete**: Integrated with Geoapify API for dropdown address suggestions (requires VITE_GEOAPIFY_API_KEY env var)
  - **Geolocation**: HTML5 Geolocation + reverse geocoding to auto-populate address from current location
  - **Date Handling**: Zod schema transforms accept both string and Date formats for projectedCloseDate, closedAt, and lastImportedAt fields
- **Security**: SESSION_SECRET environment variable is required at startup to prevent use of insecure default secrets.

## External Dependencies

- **Google Sheets API**: For parts pricing and application settings.
- **SendGrid**: For email notifications.
- **Trello API**: For automated workflow management (parts ordering, follow-ups).
- **Neon Database**: Serverless PostgreSQL hosting.
- **OpenAI API (Whisper & GPT)**: For voice transcription, intelligent text formatting, and extraction in the Processes module.
- **Twilio**: For SMS Magic Link authentication.
- **Geoapify API**: For address autocomplete and reverse geocoding in Sales Prospects. Requires `VITE_GEOAPIFY_API_KEY` environment variable. Free tier: 3,000 requests/day. Sign up at https://www.geoapify.com/
- **react-pdf**: For PDF viewing.
- **jsPDF**: For generating PDF exports of processes.