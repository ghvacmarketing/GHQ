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

### October 11, 2025
- **Homepage Redesign**: Replaced stats boxes with clean "GHVAC Tools" hero section
  - Removed Total Quotes, Processes, Recent Activity, and Quick Access stat cards
  - Added large hero text with tagline for professional appearance
  - Maintained all existing action cards (New Quote, Quote History, Price Book, Processes & Systems, Admin)
- **Price Book Feature**: New PDF viewer page for pricing catalog
  - Created dedicated `/price-book` route with native-looking PDF viewer using react-pdf
  - PDF displays with zoom controls (50%-300%) and page navigation
  - Admin settings configuration for PDF URL in System Configuration section
  - Database-backed settings storage for flexible app configuration
  - Clean error states when no PDF is configured or load fails
- **API Architecture Enhancement**: Separated app configuration from Google Sheets pricing
  - Added `/api/app-settings` endpoints for database-backed user settings (PDF URLs, etc.)
  - Preserved `/api/settings` for Google Sheets pricing data (read-only)
  - Clear separation prevents endpoint conflicts and maintains data clarity
  - Settings table in PostgreSQL for persistent app configuration

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