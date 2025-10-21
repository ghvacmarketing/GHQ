# HVAC Service Pricing & Quoting App

## Overview

This is a mobile-first web application designed for HVAC technicians to generate professional quotes on-site and manage service processes. The app follows a simple, no-authentication approach for MVP deployment, allowing techs to immediately access pricing data, select parts from integrated Google Sheets, add custom components, and generate copyable quotes for FieldEdge or messaging platforms. The system automatically handles email notifications to managers and creates Trello cards for follow-up and parts ordering. Additionally, the Processes and Systems module provides a searchable wiki for saved processes with manual and voice-guided creation options, plus PDF export functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript running on Vite for fast development and hot reloading
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent, accessible design
- **Styling**: Tailwind CSS with CSS variables for theming support (light/dark modes)
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Mobile-First Design**: Responsive layout optimized for field technician use on mobile devices

### Backend Architecture
- **Runtime**: Node.js with Express.js server framework
- **Language**: TypeScript with ES modules for type safety and modern JavaScript features
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Storage Pattern**: In-memory storage implementation with interface for easy database migration
- **API Design**: RESTful endpoints following standard HTTP conventions

### Data Storage Solutions
- **Primary Database**: PostgreSQL configured via Drizzle with schema-first approach
- **ORM**: Drizzle ORM with schema validation using Zod for runtime type checking
- **Migration System**: Drizzle Kit for database migrations and schema management
- **Connection**: Neon Database serverless PostgreSQL for cloud deployment

### Authentication and Authorization
- **Current State**: No authentication system (MVP requirement for field simplicity)
- **Future Consideration**: Designed with extensible architecture for adding auth when needed
- **Session Management**: Connect-pg-simple ready for future session storage implementation

### External Service Integrations

#### Google Sheets Integration
- **Purpose**: Single source of truth for parts pricing and application settings
- **Implementation**: Server-side Google Sheets API integration for security
- **Data Flow**: Real-time pricing updates, parts catalog management, and configuration control
- **Benefits**: Non-technical staff can update pricing without app deployment

#### Email Service Integration
- **Provider**: SendGrid as primary with generic fallback support
- **Functionality**: Automatic quote notifications to managers/admins
- **Configuration**: Environment variable-driven for deployment flexibility
- **Template System**: HTML email generation with quote details and formatting

#### Trello Integration
- **Purpose**: Automated workflow management for parts ordering and customer follow-up
- **Card Creation**: Automatic creation of order cards and follow-up tasks
- **Board Management**: Configurable lists for different workflow stages
- **API Integration**: Server-side Trello API calls for security and reliability

### Key Design Decisions

#### Monorepo Structure
- **Shared Schema**: Common TypeScript types and Zod schemas between client and server
- **Unified Build**: Single deployment artifact with client built into server's static assets
- **Path Aliases**: Consistent import paths across client (`@/`) and shared (`@shared/`) code

#### Mobile-First Approach
- **Touch-Optimized**: Large buttons and touch targets for field use
- **Offline Consideration**: Query caching strategy for intermittent connectivity
- **Performance**: Optimized bundle size and lazy loading for mobile networks
- **Progressive Web App (PWA)**: Full PWA support with installable app experience
  - Service worker for offline functionality and caching
  - Web app manifest with GHVAC branding and icon
  - Installable on iOS, Android, and desktop devices
  - Standalone app mode with custom splash screen and app icon

#### Pricing Architecture
- **Google Sheets Source**: All pricing data sourced from Google Sheets for business user control
- **Server-Side Caching**: Parts data cached server-side with refresh endpoints
- **Real-Time Updates**: Ability to refresh pricing data without app restart
- **Custom Parts**: Support for adding parts not in the main catalog

#### Quote Generation System
- **Text-Based Output**: Generates copyable text quotes for integration with existing tools
- **Calculation Engine**: Server-side calculation of subtotals, labor, tax, and totals
- **Warranty Logic**: GHVAC installation history affects pricing calculations
- **Status Tracking**: Quote lifecycle management (draft, pending, accepted)

#### Processes and Systems Module
- **Wiki Interface**: Searchable knowledge base for saved processes organized by categories
- **Process Builder**: Two creation methods:
  - **Manual Entry**: Form-based creation with name, description, category, rationale, and dynamic step management
  - **Voice-Guided**: Speech-to-text process creation with prompted questions using OpenAI's Whisper transcription
- **PDF Export**: Generate professional PDF documents from processes using jsPDF
- **Process Structure**: 
  - Name and description
  - Category for organization
  - Rationale explaining why the process is necessary
  - Step-by-step instructions with numbered guidance
- **Data Model**: PostgreSQL table with JSON column for flexible step storage

#### Development and Deployment
- **Hot Reloading**: Vite integration with Express for development efficiency
- **Type Safety**: End-to-end TypeScript with strict compiler settings
- **Build Process**: ESBuild for server bundling and Vite for client optimization
- **Environment Configuration**: Comprehensive environment variable support for all integrations

## Recent Changes

### October 21, 2025
- **Process Builders Complete Redesign**: Both manual and voice process builders completely overhauled for simplified, AI-powered workflows
  - **Manual Builder Redesign**: 
    - Replaced one-step-at-a-time input with large textarea for pasting or typing all steps at once
    - Added "Paste" button for quick clipboard access
    - Added "Format with AI" button that intelligently parses and formats messy text into clean numbered steps
    - Added 1-5 cleanup intensity slider for user calibration (1 = minimal cleanup, 5 = maximum polish)
    - AI processes comma-separated lists, plain language, or any format into structured steps
    - Shows editable preview with all formatted steps before saving
    - Users can edit any step content before finalizing
  - **Voice Builder Redesign**:
    - Replaced multi-step sequential prompts with single continuous recording session
    - Shows clear instructions upfront explaining what to say (name, description, category, steps)
    - One "Record Full Process" button captures entire process in natural speech
    - Added 1-5 cleanup intensity slider matching manual builder
    - AI extracts all 4 fields (name, description, category, steps) from one recording using OpenAI Whisper + GPT
    - Shows editable preview of extracted data before saving
    - Users can refine any field or step before finalizing
  - **Backend AI Services**:
    - Added POST `/api/format-text` endpoint: accepts raw text and cleanup level, returns formatted steps array
    - Added POST `/api/voice/transcribe-full-process` endpoint: accepts audio file and cleanup level, extracts full process
    - Both endpoints use OpenAI GPT-3.5-turbo for intelligent formatting and extraction
    - Voice endpoint uses Whisper for transcription, then GPT for structured extraction
  - **Schema Update**: Made `rationale` field optional (previously required) to streamline simplified builders
  - **User Experience**: "Fast-ball to 90%" philosophy - AI does heavy lifting, users polish the final 10%
  - **Data Flow**: AI extraction → editable preview → user refinement → save to database
  - **Routes**: Manual builder at `/processes/new`, Voice builder at `/processes/new/voice`

### October 11, 2025
- **App Rebranding**: Changed application name to "GHVAC Tools" across all interfaces
  - Updated PWA manifest name from "GHVAC Quote Generator" to "GHVAC Tools"
  - Updated HTML meta tags and Apple app title to "GHVAC Tools"
  - Home page hero section displays "GHVAC Tools" branding
- **Process Management Security**: Restricted process deletion to admin settings only
  - Removed delete button from process detail view in Processes & Systems page
  - Delete functionality now only available in Admin Settings with password protection
  - Technicians can view, edit, and export processes but cannot delete them
  - **Server-Side Authentication**: DELETE /api/processes/:id endpoint requires admin password in request body
  - Returns 401 Unauthorized when password is missing or incorrect
  - Prevents unauthorized deletions even if UI controls are bypassed
- **PDF Export Enhancement**: Verified and tested PDF export functionality for processes
  - Uses jsPDF library to generate professional PDF documents
  - Exports include: process name, category, description, and step-by-step instructions
  - Footer with "Generated by GHVAC Processes & Systems" branding
- **PDF Viewer Improvements**: Enhanced Price Book PDF viewer with simple zoom controls
  - Added +/- zoom buttons (50%-300% range) for reliable cross-platform zooming
  - Removed complex touch/wheel zoom gestures for better mobile reliability
  - Displays zoom percentage between buttons
- **Homepage Redesign**: Replaced stats boxes with clean "GHVAC Tools" hero section
  - Removed Total Quotes, Processes, Recent Activity, and Quick Access stat cards
  - Added large hero text with tagline for professional appearance
  - Maintained all existing action cards (New Quote, Quote History, Price Book, Processes & Systems, Admin)
- **Price Book Feature**: Secure PDF storage and viewing system for pricing catalog
  - Created dedicated `/price-book` route with native-looking PDF viewer using react-pdf
  - PDF displays with zoom controls (50%-300%) and page navigation
  - **Secure Database Storage**: PDFs stored in PostgreSQL (Base64 encoded) for privacy instead of public URLs
  - **File Upload System**: Admin interface with file upload, validation, and password protection
  - **Security Implementation**: 
    - Server-side authentication endpoint (`/api/admin/login`) validates password against `ADMIN_PASSWORD` env var
    - Password validation moved entirely to server (no credentials in client bundle)
    - Scoped body size limits: 50MB for PDF upload, 1MB for all other endpoints
    - Conditional middleware to prevent DoS attacks while allowing large PDF uploads
  - **Upload Validation**: File type checking, size limits (50MB max), Base64 format validation
  - Clean error states when no PDF is configured or load fails
- **API Architecture Enhancement**: Separated app configuration from Google Sheets pricing
  - Added `/api/app-settings` endpoints for database-backed user settings
  - Added `/api/price-book/upload`, `/api/price-book/pdf`, `/api/price-book/pdf` (DELETE) for secure PDF management
  - Preserved `/api/settings` for Google Sheets pricing data (read-only)
  - Clear separation prevents endpoint conflicts and maintains data clarity
  - Settings and PDF files tables in PostgreSQL for persistent storage

### October 10, 2025
- **Home Landing Page**: Created elegant landing page with shortcuts to all main pages
  - Gradient card-based design with icons for each section (New Quote, Quote History, Processes & Systems, Settings, Admin)
  - Mobile-first responsive layout with hover animations
  - Set as default route at `/` (root path)
  - Updated all navigation dropdowns to include Home link
- **Routing Updates**: 
  - Home page now at `/` (was Quote Generator)
  - Quote Generator moved to `/quote`
  - All navigation menus updated with Home link and correct paths
  - Updated "New Quote" button in Quote History to link to `/quote`
- **Category Management System**: Complete configurable category system for processes
  - PostgreSQL categories table with default categories (Maintenance, Repair, Installation, Troubleshooting, Safety)
  - Settings page UI for adding, editing, and deleting categories
  - All process forms (manual, voice, edit) use dynamic category dropdowns
  - Voice builder includes "Skip to Type" functionality for all fields including category selection
- **Processes and Systems Module**: Built comprehensive process management system
  - Created searchable wiki interface with category filtering
  - Implemented dual creation modes: manual form entry and voice-guided builder
  - Added PDF export functionality using jsPDF library
  - Integrated with existing voice transcription service for speech-to-text process creation
  - Database schema extended with processes table including JSON-based step storage
- **Navigation Updates**: Renamed "Process Builder" to "Processes and Systems" across all navigation menus