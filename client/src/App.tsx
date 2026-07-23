import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useState, useEffect, Component, type ReactNode } from "react";
import type { Announcement } from "@shared/schema";
import { Loader2 } from "lucide-react";
import redLogoUrl from "@assets/redlogo.webp";
import Home from "@/pages/home";
import LandingSelect from "@/pages/landing-select";
import Privacy from "@/pages/privacy";
import QuoteGenerator from "@/pages/quote-generator";
import QuoteEdit from "@/pages/quote-edit";
import QuotesHistory from "@/pages/quotes-history";
import ProcessesSystems from "@/pages/processes-systems";
const PublicSalesbook = lazy(() => import("@/pages/price-book"));
const SalesbookPrint = lazy(() => import("@/pages/salesbook-print"));
import ProcessBuilderManual from "@/pages/process-builder-manual";
import ProcessBuilderVoice from "@/pages/process-builder-voice";
import SalesProspects from "@/pages/sales-prospects";
import CreateLeadPage from "@/pages/create-lead";
import Installation from "@/pages/installation";
import ServicePipeline from "@/pages/service-pipeline";
import ProposalBuilder from "@/pages/proposal-builder";
import Voicemails from "@/pages/voicemails";
import ProposalHistory from "@/pages/proposal-history";
import EmployeePortal from "@/pages/employee-portal";
import EmployeePortalLogin from "@/pages/employee-portal-login";
import EmployeePortalAdmin from "@/pages/employee-portal-admin";
import NotFound from "@/pages/not-found";
import BookOnline from "@/pages/public/book-online";
import AnnouncementModal from "@/components/AnnouncementModal";
import GlobalPasswordGate from "@/components/GlobalPasswordGate";
import IdleLogout from "@/components/IdleLogout";

// CRM Route Guard (blocks tech users from desktop CRM)
import CrmRouteGuard from "@/components/crm/crm-route-guard";

// Lazy-load CRM pages to reduce initial bundle size
const CrmLogin = lazy(() => import("@/pages/crm/crm-login"));
const CrmDispatch = lazy(() => import("@/pages/crm/crm-dispatch"));
const CrmAnalytics = lazy(() => import("@/pages/crm/crm-analytics"));
const CrmCustomers = lazy(() => import("@/pages/crm/crm-customers"));
const CrmCustomerDetail = lazy(() => import("@/pages/crm/crm-customer-detail"));
const CrmAccountCreate = lazy(() => import("@/pages/crm/crm-account-create"));
const CrmAccountDetail = lazy(() => import("@/pages/crm/crm-account-detail"));
const CrmWorkOrders = lazy(() => import("@/pages/crm/crm-work-orders"));
const CrmWorkOrderDetail = lazy(() => import("@/pages/crm/crm-work-order-detail"));
const CrmInvoices = lazy(() => import("@/pages/crm/crm-invoices"));
const CrmInvoiceCreate = lazy(() => import("@/pages/crm/crm-invoice-create"));
const CrmInvoiceDetail = lazy(() => import("@/pages/crm/crm-invoice-detail"));
const CrmQuotes = lazy(() => import("@/pages/crm/crm-quotes"));
const CrmQuoteCreate = lazy(() => import("@/pages/crm/crm-quote-create"));
const CrmQuoteDetail = lazy(() => import("@/pages/crm/crm-quote-detail"));
const CrmAgreements = lazy(() => import("@/pages/crm/crm-agreements"));
const CrmAgreementCreate = lazy(() => import("@/pages/crm/crm-agreement-create"));
const CrmProjects = lazy(() => import("@/pages/crm/crm-projects"));
const CrmInstallPlanner = lazy(() => import("@/pages/crm/crm-install-planner"));
const CrmPhonePop = lazy(() => import("@/pages/crm/crm-phone-pop"));
const CrmProjectDetail = lazy(() => import("@/pages/crm/crm-project-detail"));
const CrmProspectFunnel = lazy(() => import("@/pages/crm/crm-prospect-funnel"));
const CrmAddProspect = lazy(() => import("@/pages/crm/crm-add-prospect"));
const CrmMarketing = lazy(() => import("@/pages/crm/crm-marketing"));
const CrmMarketingBuilder = lazy(() => import("@/pages/crm/crm-marketing-builder"));
const CrmAutomatedMessages = lazy(() => import("@/pages/crm/crm-automated-messages"));
const CrmItems = lazy(() => import("@/pages/crm/crm-items"));
const CrmInstallWorksheet = lazy(() => import("@/pages/crm/crm-install-worksheet"));
const CrmProposalBuilder = lazy(() => import("@/pages/crm/crm-proposal-builder"));
const CrmProposalPreview = lazy(() => import("@/pages/crm/crm-proposal-preview"));
const CrmPhone = lazy(() => import("@/pages/crm/crm-phone"));
const CrmChecklists = lazy(() => import("@/pages/crm/crm-checklists"));
const CrmRebatePrograms = lazy(() => import("@/pages/crm/crm-rebate-programs"));
const CrmRebateCase = lazy(() => import("@/pages/crm/crm-rebate-case"));
const CrmSettings = lazy(() => import("@/pages/crm/crm-settings"));
const CrmSettingsUsers = lazy(() => import("@/pages/crm/crm-settings-users"));
const CrmSettingsSubtypes = lazy(() => import("@/pages/crm/crm-settings-subtypes"));
const CrmSettingsSalesbook = lazy(() => import("@/pages/crm/crm-settings-salesbook"));
const CrmSettingsLeadTypes = lazy(() => import("@/pages/crm/crm-settings-lead-types"));
const CrmSettingsLeadClassification = lazy(() => import("@/pages/crm/crm-settings-lead-classification"));
const CrmSettingsTime = lazy(() => import("@/pages/crm/crm-settings-time"));
const CrmSettingsPayments = lazy(() => import("@/pages/crm/crm-settings-payments"));
const CrmSettingsDispatch = lazy(() => import("@/pages/crm/crm-settings-dispatch"));
const CrmSettingsCustomerPortal = lazy(() => import("@/pages/crm/crm-settings-customer-portal"));
const CrmPhotoGallery = lazy(() => import("@/pages/crm/crm-photo-gallery"));
const CrmSettingsAppearance = lazy(() => import("@/pages/crm/crm-settings-appearance"));
const CrmSettingsSystemTools = lazy(() => import("@/pages/crm/crm-settings-system-tools"));
const CrmSettingsQuickBooks = lazy(() => import("@/pages/crm/crm-settings-quickbooks"));
const CrmSettingsImport = lazy(() => import("@/pages/crm/crm-settings-import"));
const CrmSettingsFleet = lazy(() => import("@/pages/crm/crm-settings-fleet"));
const CrmSettingsPackages = lazy(() => import("@/pages/crm/crm-settings-packages"));
const CrmSettingsMaterialsCatalog = lazy(() => import("@/pages/crm/crm-settings-materials-catalog"));
const CrmSettingsProposalTemplates = lazy(() => import("@/pages/crm/crm-settings-proposal-templates"));
const CrmBusinessDashboard = lazy(() => import("@/pages/crm/crm-business-dashboard"));
const CrmGoalsTracker = lazy(() => import("@/pages/crm/crm-goals-tracker"));
const CrmMessaging = lazy(() => import("@/pages/crm/crm-messaging"));
const CrmMail = lazy(() => import("@/pages/crm/crm-mail"));
const DocumentsApp = lazy(() => import("@/pages/documents-app"));
const AccountingApp = lazy(() => import("@/pages/accounting-app"));
const CrmNotifications = lazy(() => import("@/pages/crm/crm-notifications"));
const CrmMyTasks = lazy(() => import("@/pages/crm/crm-my-tasks"));
const CrmTaskBoard = lazy(() => import("@/pages/crm/crm-task-board"));
const CrmSalesbook = lazy(() => import("@/pages/crm/crm-salesbook"));
const CrmEsign = lazy(() => import("@/pages/crm/crm-esign"));
const CrmEsignEditor = lazy(() => import("@/pages/crm/crm-esign-editor"));

// Lazy-load Mobile pages to reduce initial bundle size
const MobileAgenda = lazy(() => import("@/pages/mobile/mobile-agenda"));
const MobileJobDetail = lazy(() => import("@/pages/mobile/mobile-job-detail"));
const MobileTime = lazy(() => import("@/pages/mobile/mobile-time"));
const MobilePhotos = lazy(() => import("@/pages/mobile/mobile-photos"));
const MobileJob = lazy(() => import("@/pages/mobile/mobile-job"));
const MobileProfile = lazy(() => import("@/pages/mobile/mobile-profile"));
const MobileQuoteDetail = lazy(() => import("@/pages/mobile/mobile-quote-detail"));
const MobileQuotePresent = lazy(() => import("@/pages/mobile/mobile-quote-present"));
const MobileInvoiceDetail = lazy(() => import("@/pages/mobile/mobile-invoice-detail"));
const MobileMessages = lazy(() => import("@/pages/mobile/mobile-messages"));
const MobileCustomers = lazy(() => import("@/pages/mobile/mobile-customers"));
const MobileCustomerDetail = lazy(() => import("@/pages/mobile/mobile-customer-detail"));

// Lazy-load Customer Portal pages
const PortalLogin = lazy(() => import("@/pages/portal/portal-login"));
const PortalDashboard = lazy(() => import("@/pages/portal/portal-dashboard"));
const PortalInvoices = lazy(() => import("@/pages/portal/portal-invoices"));
const PortalInvoiceDetail = lazy(() => import("@/pages/portal/portal-invoice-detail"));
const PortalQuotes = lazy(() => import("@/pages/portal/portal-quotes"));
const PortalAgreements = lazy(() => import("@/pages/portal/portal-agreements"));
const PortalServiceHistory = lazy(() => import("@/pages/portal/portal-service-history"));
const PortalSensors = lazy(() => import("@/pages/portal/portal-sensors"));
const PortalProfile = lazy(() => import("@/pages/portal/portal-profile"));

// Lazy-load Public pages (no auth required)
const PublicQuoteView = lazy(() => import("@/pages/public/quote-view"));
const PublicInvoiceView = lazy(() => import("@/pages/public/invoice-view"));
const PublicSign = lazy(() => import("@/pages/public/sign"));

// Global Error Boundary to prevent blank screens
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("App Error:", error, errorInfo);
    // Auto-recover from stale-deploy chunk failures. A new deploy changes the
    // hashed asset filenames, so an already-open tab (or one served a stale
    // shell by the service worker) can fail to lazy-load a route chunk. Reload
    // once to pull the fresh index.html/assets instead of showing an error.
    const text = `${error?.name || ""} ${error?.message || ""}`;
    const isChunkError =
      /ChunkLoadError|Loading chunk|dynamically imported module|module script failed|error loading dynamically/i.test(
        text,
      );
    if (isChunkError && !sessionStorage.getItem("chunk-reload-attempted")) {
      sessionStorage.setItem("chunk-reload-attempted", "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-foreground mb-4">Something went wrong</h1>
            <p className="text-muted-foreground mb-6">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              data-testid="button-reload"
            >
              Refresh Page
            </button>
            {this.state.error && (
              <details className="mt-4 text-left text-sm text-muted-foreground">
                <summary className="cursor-pointer">Error details</summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Branded full-screen loader for the initial app load.
function GlobalLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background" data-testid="global-loader">
      <div className="relative mb-6 flex items-center justify-center">
        <span className="absolute h-24 w-24 rounded-full bg-[#711419]/10 blur-2xl animate-pulse" />
        <img
          src={redLogoUrl}
          alt="Giesbrecht HVAC"
          className="relative h-14 w-14 rounded-2xl object-contain animate-[pulse_2.2s_ease-in-out_infinite]"
        />
      </div>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-[#711419] animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#711419] animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#711419] animate-bounce" />
      </div>
      <p className="mt-5 text-sm font-medium tracking-wide text-foreground">Giesbrecht HVAC</p>
      <p className="mt-0.5 text-xs uppercase tracking-[0.25em] text-muted-foreground">GHQ</p>
    </div>
  );
}

// CRM inter-page loading placeholder. Kept intentionally quiet: a subtle,
// fading spinner on the app background (no full-screen "Loading…" banner) so
// navigating between pages feels like a smooth transition, not a page reload.
// No visible loader when switching between CRM pages — chunks are cached after
// first load, so a fallback just flashes. Render nothing for a seamless switch.
function CrmLoader() {
  return null;
}

// Wrapper for lazy-loaded CRM pages
function CrmWrapper({ children }: { children: ReactNode }) {
  return <Suspense fallback={<CrmLoader />}>{children}</Suspense>;
}

// Wrapper for protected CRM pages (blocks tech users)
function ProtectedCrmWrapper({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<CrmLoader />}>
      <CrmRouteGuard>{children}</CrmRouteGuard>
    </Suspense>
  );
}

// Mobile-specific loading placeholder
function MobileLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50" data-testid="mobile-loader">
      <Loader2 className="h-8 w-8 animate-spin text-[#711419] mb-4" />
      <p className="text-slate-500">Loading...</p>
    </div>
  );
}

// Wrapper for lazy-loaded Mobile pages
function MobileWrapper({ children }: { children: ReactNode }) {
  return <Suspense fallback={<MobileLoader />}>{children}</Suspense>;
}

// Portal-specific loading placeholder
function PortalLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf9f7]" data-testid="portal-loader">
      <Loader2 className="h-8 w-8 animate-spin text-[#711419] mb-4" />
      <p className="text-slate-500">Loading Customer Portal...</p>
    </div>
  );
}

// Wrapper for lazy-loaded Portal pages
function PortalWrapper({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PortalLoader />}>{children}</Suspense>;
}

// Lazy load admin settings to reduce initial bundle size
const AdminSettings = lazy(() => import("@/pages/admin-settings"));

function AdminSettingsWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-muted-foreground">Loading admin settings...</div>}>
      <AdminSettings />
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingSelect} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/tools" component={Home} />
      <Route path="/book" component={BookOnline} />
      <Route path="/book-online" component={BookOnline} />
      <Route path="/quote" component={QuoteGenerator} />
      <Route path="/quote/edit/:id" component={QuoteEdit} />
      <Route path="/history" component={QuotesHistory} />
      <Route path="/salesbook/print">{() => <Suspense fallback={<GlobalLoader />}><SalesbookPrint /></Suspense>}</Route>
      <Route path="/salesbook">{() => <Suspense fallback={<GlobalLoader />}><PublicSalesbook /></Suspense>}</Route>
      <Route path="/price-book">{() => { window.location.replace("/salesbook"); return <GlobalLoader />; }}</Route>
      <Route path="/processes" component={ProcessesSystems} />
      <Route path="/processes/new" component={ProcessBuilderManual} />
      <Route path="/processes/new/voice" component={ProcessBuilderVoice} />
      <Route path="/sales-prospects" component={SalesProspects} />
      <Route path="/sales-prospects/create" component={CreateLeadPage} />
      <Route path="/installation" component={Installation} />
      <Route path="/service-pipeline" component={ServicePipeline} />
      <Route path="/proposal" component={ProposalBuilder} />
      <Route path="/voicemails" component={Voicemails} />
      <Route path="/proposal-history" component={ProposalHistory} />
      <Route path="/admin" component={AdminSettingsWrapper} />
      <Route path="/employee-portal/login" component={EmployeePortalLogin} />
      <Route path="/employee-portal/admin" component={EmployeePortalAdmin} />
      <Route path="/employee-portal" component={EmployeePortal} />
      <Route path="/crm/login">{() => <CrmWrapper><CrmLogin /></CrmWrapper>}</Route>
      <Route path="/crm/dispatch">{() => <ProtectedCrmWrapper><CrmDispatch /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/analytics">{() => <ProtectedCrmWrapper><CrmAnalytics /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/rebate-programs/:id">{() => <ProtectedCrmWrapper><CrmRebateCase /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/rebate-programs">{() => <ProtectedCrmWrapper><CrmRebatePrograms /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/work-orders/:id">{() => <ProtectedCrmWrapper><CrmWorkOrderDetail /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/work-orders">{() => <ProtectedCrmWrapper><CrmWorkOrders /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/accounts/new">{() => <ProtectedCrmWrapper><CrmAccountCreate /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/accounts/:id">{() => <ProtectedCrmWrapper><CrmAccountDetail /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/phone-pop">{() => <ProtectedCrmWrapper><CrmPhonePop /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/customers/:id">{() => <ProtectedCrmWrapper><CrmCustomerDetail /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/customers">{() => <ProtectedCrmWrapper><CrmCustomers /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/invoices/new">{() => <ProtectedCrmWrapper><CrmInvoiceCreate /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/invoices/:id">{() => <ProtectedCrmWrapper><CrmInvoiceDetail /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/invoices">{() => <ProtectedCrmWrapper><CrmInvoices /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/quotes/install-worksheet/:id">{() => <ProtectedCrmWrapper><CrmInstallWorksheet /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/quotes/proposal/:customerId">{() => <ProtectedCrmWrapper><CrmProposalBuilder /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/quotes/proposal">{() => <ProtectedCrmWrapper><CrmProposalBuilder /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/proposal-preview">{() => <ProtectedCrmWrapper><CrmProposalPreview /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/quotes/new">{() => <ProtectedCrmWrapper><CrmQuoteCreate /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/quotes/:id">{() => <ProtectedCrmWrapper><CrmQuoteDetail /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/quotes">{() => <ProtectedCrmWrapper><CrmQuotes /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/agreements/new">{() => <ProtectedCrmWrapper><CrmAgreementCreate /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/agreements">{() => <ProtectedCrmWrapper><CrmAgreements /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/install-planner">{() => <ProtectedCrmWrapper><CrmInstallPlanner /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/projects/:id">{() => <ProtectedCrmWrapper><CrmProjectDetail /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/projects">{() => <ProtectedCrmWrapper><CrmProjects /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/prospect-funnel">{() => <ProtectedCrmWrapper><CrmProspectFunnel /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/add-prospect">{() => <ProtectedCrmWrapper><CrmAddProspect /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/marketing/messages">{() => <ProtectedCrmWrapper><CrmAutomatedMessages /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/marketing/new">{() => <ProtectedCrmWrapper><CrmMarketingBuilder /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/marketing/edit/:id">{() => <ProtectedCrmWrapper><CrmMarketingBuilder /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/marketing">{() => <ProtectedCrmWrapper><CrmMarketing /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/items">{() => <ProtectedCrmWrapper><CrmItems /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/esign/:id">{() => <ProtectedCrmWrapper><CrmEsignEditor /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/esign">{() => <ProtectedCrmWrapper><CrmEsign /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/phone">{() => <ProtectedCrmWrapper><CrmPhone /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/checklists">{() => <ProtectedCrmWrapper><CrmChecklists /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/users">{() => <ProtectedCrmWrapper><CrmSettingsUsers /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/subtypes">{() => <ProtectedCrmWrapper><CrmSettingsSubtypes /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/salesbook">{() => <ProtectedCrmWrapper><CrmSettingsSalesbook /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/lead-types">{() => <ProtectedCrmWrapper><CrmSettingsLeadTypes /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/lead-classification">{() => <ProtectedCrmWrapper><CrmSettingsLeadClassification /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/time-logs">{() => <ProtectedCrmWrapper><CrmSettingsTime /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/payments">{() => <ProtectedCrmWrapper><CrmSettingsPayments /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/dispatch">{() => <ProtectedCrmWrapper><CrmSettingsDispatch /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/customer-portal">{() => <ProtectedCrmWrapper><CrmSettingsCustomerPortal /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/photos">{() => <ProtectedCrmWrapper><CrmPhotoGallery /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/appearance">{() => <ProtectedCrmWrapper><CrmSettingsAppearance /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/system-tools">{() => <ProtectedCrmWrapper><CrmSettingsSystemTools /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/quickbooks">{() => <ProtectedCrmWrapper><CrmSettingsQuickBooks /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/import">{() => <ProtectedCrmWrapper><CrmSettingsImport /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/fleet">{() => <ProtectedCrmWrapper><CrmSettingsFleet /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/packages">{() => <ProtectedCrmWrapper><CrmSettingsPackages /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/materials-catalog">{() => <ProtectedCrmWrapper><CrmSettingsMaterialsCatalog /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings/proposal-templates">{() => <ProtectedCrmWrapper><CrmSettingsProposalTemplates /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/settings">{() => <ProtectedCrmWrapper><CrmSettings /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/dashboard">{() => <ProtectedCrmWrapper><CrmBusinessDashboard /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/reports">{() => <ProtectedCrmWrapper><CrmGoalsTracker /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/messaging">{() => <ProtectedCrmWrapper><CrmMessaging /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/mail">{() => <ProtectedCrmWrapper><CrmMail /></ProtectedCrmWrapper>}</Route>
      <Route path="/documents" component={DocumentsApp} />
      <Route path="/accounting" component={AccountingApp} />
      <Route path="/marketing/messages">{() => <ProtectedCrmWrapper><CrmAutomatedMessages /></ProtectedCrmWrapper>}</Route>
      <Route path="/marketing/new">{() => <ProtectedCrmWrapper><CrmMarketingBuilder /></ProtectedCrmWrapper>}</Route>
      <Route path="/marketing/edit/:id">{() => <ProtectedCrmWrapper><CrmMarketingBuilder /></ProtectedCrmWrapper>}</Route>
      <Route path="/marketing">{() => <ProtectedCrmWrapper><CrmMarketing /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/notifications">{() => <ProtectedCrmWrapper><CrmNotifications /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/salesbook">{() => <ProtectedCrmWrapper><CrmSalesbook /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/tasks/board">{() => <ProtectedCrmWrapper><CrmTaskBoard /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm/tasks/mine">{() => <ProtectedCrmWrapper><CrmMyTasks /></ProtectedCrmWrapper>}</Route>
      <Route path="/crm">{() => <ProtectedCrmWrapper><CrmBusinessDashboard /></ProtectedCrmWrapper>}</Route>
      <Route path="/mobile/job/:id">{() => <MobileWrapper><MobileJobDetail /></MobileWrapper>}</Route>
      <Route path="/mobile/job">{() => <MobileWrapper><MobileJob /></MobileWrapper>}</Route>
      <Route path="/mobile/quotes/:id/present">{() => <MobileWrapper><MobileQuotePresent /></MobileWrapper>}</Route>
      <Route path="/mobile/quotes/:id">{() => <MobileWrapper><MobileQuoteDetail /></MobileWrapper>}</Route>
      <Route path="/mobile/invoices/:id">{() => <MobileWrapper><MobileInvoiceDetail /></MobileWrapper>}</Route>
      <Route path="/mobile/time">{() => <MobileWrapper><MobileTime /></MobileWrapper>}</Route>
      <Route path="/mobile/photos">{() => <MobileWrapper><MobilePhotos /></MobileWrapper>}</Route>
      <Route path="/mobile/messages">{() => <MobileWrapper><MobileMessages /></MobileWrapper>}</Route>
      <Route path="/mobile/customers/:id">{() => <MobileWrapper><MobileCustomerDetail /></MobileWrapper>}</Route>
      <Route path="/mobile/customers">{() => <MobileWrapper><MobileCustomers /></MobileWrapper>}</Route>
      <Route path="/mobile/profile">{() => <MobileWrapper><MobileProfile /></MobileWrapper>}</Route>
      <Route path="/mobile">{() => <MobileWrapper><MobileAgenda /></MobileWrapper>}</Route>
      <Route path="/portal/login">{() => <PortalWrapper><PortalLogin /></PortalWrapper>}</Route>
      <Route path="/portal/dashboard">{() => <PortalWrapper><PortalDashboard /></PortalWrapper>}</Route>
      <Route path="/portal/invoices">{() => <PortalWrapper><PortalInvoices /></PortalWrapper>}</Route>
      <Route path="/portal/invoice/:id">{() => <Suspense fallback={<GlobalLoader />}><PortalInvoiceDetail /></Suspense>}</Route>
      <Route path="/portal/quotes">{() => <PortalWrapper><PortalQuotes /></PortalWrapper>}</Route>
      <Route path="/portal/agreements">{() => <PortalWrapper><PortalAgreements /></PortalWrapper>}</Route>
      <Route path="/portal/service-history">{() => <PortalWrapper><PortalServiceHistory /></PortalWrapper>}</Route>
      <Route path="/portal/sensors">{() => <PortalWrapper><PortalSensors /></PortalWrapper>}</Route>
      <Route path="/portal/profile">{() => <PortalWrapper><PortalProfile /></PortalWrapper>}</Route>
      <Route path="/quote/:token">{() => <Suspense fallback={<GlobalLoader />}><PublicQuoteView /></Suspense>}</Route>
      <Route path="/q/:token">{() => <Suspense fallback={<GlobalLoader />}><PublicQuoteView /></Suspense>}</Route>
      <Route path="/i/:token">{() => <Suspense fallback={<GlobalLoader />}><PublicInvoiceView /></Suspense>}</Route>
      <Route path="/sign/:token">{() => <Suspense fallback={<GlobalLoader />}><PublicSign /></Suspense>}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // App mounted successfully — clear the chunk-error reload guard so a future
  // stale-deploy failure can trigger a fresh one-time recovery reload.
  useEffect(() => {
    sessionStorage.removeItem("chunk-reload-attempted");
  }, []);

  // Fetch active announcement (no auth check)
  const { data: announcement } = useQuery<Announcement | null>({
    queryKey: ['/api/announcement'],
  });

  // Check if announcement should be shown
  useEffect(() => {
    if (announcement) {
      const dismissalKey = `ghvac-announcement-dismissed-v${announcement.version}`;
      const isDismissed = localStorage.getItem(dismissalKey);
      
      if (!isDismissed) {
        setShowAnnouncement(true);
      }
    }
  }, [announcement]);

  const handleDismiss = () => {
    setShowAnnouncement(false);
  };

  return (
    <>
      <Toaster />
      <IdleLogout />
      <Router />
      <AnnouncementModal
        announcement={announcement || null}
        open={showAnnouncement}
        onDismiss={handleDismiss}
      />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<GlobalLoader />}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <GlobalPasswordGate>
              <AppContent />
            </GlobalPasswordGate>
          </TooltipProvider>
        </QueryClientProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
