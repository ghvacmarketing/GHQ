import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useState, useEffect, Component, type ReactNode } from "react";
import type { Announcement } from "@shared/schema";
import { Loader2 } from "lucide-react";
import Home from "@/pages/home";
import QuoteGenerator from "@/pages/quote-generator";
import QuoteEdit from "@/pages/quote-edit";
import QuotesHistory from "@/pages/quotes-history";
import ProcessesSystems from "@/pages/processes-systems";
import ProcessBuilderManual from "@/pages/process-builder-manual";
import ProcessBuilderVoice from "@/pages/process-builder-voice";
import PriceBook from "@/pages/price-book";
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
import AnnouncementModal from "@/components/AnnouncementModal";
import GlobalPasswordGate from "@/components/GlobalPasswordGate";

// Lazy-load CRM pages to reduce initial bundle size
const CrmLogin = lazy(() => import("@/pages/crm/crm-login"));
const CrmDashboard = lazy(() => import("@/pages/crm/crm-dashboard"));
const CrmDispatch = lazy(() => import("@/pages/crm/crm-dispatch"));
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
const CrmProjects = lazy(() => import("@/pages/crm/crm-projects"));
const CrmProjectDetail = lazy(() => import("@/pages/crm/crm-project-detail"));
const CrmProspectFunnel = lazy(() => import("@/pages/crm/crm-prospect-funnel"));
const CrmMarketing = lazy(() => import("@/pages/crm/crm-marketing"));
const CrmItems = lazy(() => import("@/pages/crm/crm-items"));
const CrmInstallWorksheet = lazy(() => import("@/pages/crm/crm-install-worksheet"));
const CrmProposalBuilder = lazy(() => import("@/pages/crm/crm-proposal-builder"));

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

// Global loading spinner for initial app load
function GlobalLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background" data-testid="global-loader">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground">Loading GHVAC Tools...</p>
    </div>
  );
}

// CRM-specific loading placeholder
function CrmLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background" data-testid="crm-loader">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground">Loading GHQ CRM...</p>
    </div>
  );
}

// Wrapper for lazy-loaded CRM pages
function CrmWrapper({ children }: { children: ReactNode }) {
  return <Suspense fallback={<CrmLoader />}>{children}</Suspense>;
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
      <Route path="/" component={Home} />
      <Route path="/quote" component={QuoteGenerator} />
      <Route path="/quote/edit/:id" component={QuoteEdit} />
      <Route path="/history" component={QuotesHistory} />
      <Route path="/price-book" component={PriceBook} />
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
      <Route path="/crm/dispatch">{() => <CrmWrapper><CrmDispatch /></CrmWrapper>}</Route>
      <Route path="/crm/work-orders/:id">{() => <CrmWrapper><CrmWorkOrderDetail /></CrmWrapper>}</Route>
      <Route path="/crm/work-orders">{() => <CrmWrapper><CrmWorkOrders /></CrmWrapper>}</Route>
      <Route path="/crm/accounts/new">{() => <CrmWrapper><CrmAccountCreate /></CrmWrapper>}</Route>
      <Route path="/crm/accounts/:id">{() => <CrmWrapper><CrmAccountDetail /></CrmWrapper>}</Route>
      <Route path="/crm/customers/:id">{() => <CrmWrapper><CrmCustomerDetail /></CrmWrapper>}</Route>
      <Route path="/crm/customers">{() => <CrmWrapper><CrmCustomers /></CrmWrapper>}</Route>
      <Route path="/crm/invoices/new">{() => <CrmWrapper><CrmInvoiceCreate /></CrmWrapper>}</Route>
      <Route path="/crm/invoices/:id">{() => <CrmWrapper><CrmInvoiceDetail /></CrmWrapper>}</Route>
      <Route path="/crm/invoices">{() => <CrmWrapper><CrmInvoices /></CrmWrapper>}</Route>
      <Route path="/crm/quotes/install-worksheet/:id">{() => <CrmWrapper><CrmInstallWorksheet /></CrmWrapper>}</Route>
      <Route path="/crm/quotes/proposal/:customerId">{() => <CrmWrapper><CrmProposalBuilder /></CrmWrapper>}</Route>
      <Route path="/crm/quotes/proposal">{() => <CrmWrapper><CrmProposalBuilder /></CrmWrapper>}</Route>
      <Route path="/crm/quotes/new">{() => <CrmWrapper><CrmQuoteCreate /></CrmWrapper>}</Route>
      <Route path="/crm/quotes/:id">{() => <CrmWrapper><CrmQuoteDetail /></CrmWrapper>}</Route>
      <Route path="/crm/quotes">{() => <CrmWrapper><CrmQuotes /></CrmWrapper>}</Route>
      <Route path="/crm/agreements">{() => <CrmWrapper><CrmAgreements /></CrmWrapper>}</Route>
      <Route path="/crm/projects/:id">{() => <CrmWrapper><CrmProjectDetail /></CrmWrapper>}</Route>
      <Route path="/crm/projects">{() => <CrmWrapper><CrmProjects /></CrmWrapper>}</Route>
      <Route path="/crm/prospect-funnel">{() => <CrmWrapper><CrmProspectFunnel /></CrmWrapper>}</Route>
      <Route path="/crm/marketing">{() => <CrmWrapper><CrmMarketing /></CrmWrapper>}</Route>
      <Route path="/crm/items">{() => <CrmWrapper><CrmItems /></CrmWrapper>}</Route>
      <Route path="/crm">{() => <CrmWrapper><CrmDashboard /></CrmWrapper>}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [showAnnouncement, setShowAnnouncement] = useState(false);

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
