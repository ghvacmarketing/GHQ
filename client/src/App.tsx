import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import CrmLogin from "@/pages/crm/crm-login";
import CrmDashboard from "@/pages/crm/crm-dashboard";
import CrmDispatch from "@/pages/crm/crm-dispatch";
import CrmCustomers from "@/pages/crm/crm-customers";
import CrmCustomerDetail from "@/pages/crm/crm-customer-detail";
import CrmAccountCreate from "@/pages/crm/crm-account-create";
import CrmAccountDetail from "@/pages/crm/crm-account-detail";
import CrmWorkOrders from "@/pages/crm/crm-work-orders";
import CrmWorkOrderDetail from "@/pages/crm/crm-work-order-detail";
import CrmInvoices from "@/pages/crm/crm-invoices";
import CrmQuotes from "@/pages/crm/crm-quotes";
import CrmAgreements from "@/pages/crm/crm-agreements";
import CrmProjects from "@/pages/crm/crm-projects";
import CrmProjectDetail from "@/pages/crm/crm-project-detail";
import NotFound from "@/pages/not-found";
import AnnouncementModal from "@/components/AnnouncementModal";
import GlobalPasswordGate from "@/components/GlobalPasswordGate";
import { lazy, Suspense, useState, useEffect, Component, type ReactNode } from "react";
import type { Announcement } from "@shared/schema";
import { Loader2 } from "lucide-react";

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
      <Route path="/crm/login" component={CrmLogin} />
      <Route path="/crm/dispatch" component={CrmDispatch} />
      <Route path="/crm/work-orders/:id" component={CrmWorkOrderDetail} />
      <Route path="/crm/work-orders" component={CrmWorkOrders} />
      <Route path="/crm/accounts/new" component={CrmAccountCreate} />
      <Route path="/crm/accounts/:id" component={CrmAccountDetail} />
      <Route path="/crm/customers/:id" component={CrmCustomerDetail} />
      <Route path="/crm/customers" component={CrmCustomers} />
      <Route path="/crm/invoices" component={CrmInvoices} />
      <Route path="/crm/quotes" component={CrmQuotes} />
      <Route path="/crm/agreements" component={CrmAgreements} />
      <Route path="/crm/projects/:id" component={CrmProjectDetail} />
      <Route path="/crm/projects" component={CrmProjects} />
      <Route path="/crm" component={CrmDashboard} />
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
