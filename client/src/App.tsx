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
import CrmGate from "@/pages/crm/crm-gate";
import CrmLogin from "@/pages/crm/crm-login";
import CrmDashboard from "@/pages/crm/crm-dashboard";
import CrmDispatch from "@/pages/crm/crm-dispatch";
import CrmCustomers from "@/pages/crm/crm-customers";
import CrmCustomerDetail from "@/pages/crm/crm-customer-detail";
import NotFound from "@/pages/not-found";
import AnnouncementModal from "@/components/AnnouncementModal";
import GlobalPasswordGate from "@/components/GlobalPasswordGate";
import { lazy, Suspense, useState, useEffect } from "react";
import type { Announcement } from "@shared/schema";

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
      <Route path="/crm/gate" component={CrmGate} />
      <Route path="/crm/login" component={CrmLogin} />
      <Route path="/crm/dispatch" component={CrmDispatch} />
      <Route path="/crm/customers/:id" component={CrmCustomerDetail} />
      <Route path="/crm/customers" component={CrmCustomers} />
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GlobalPasswordGate>
          <AppContent />
        </GlobalPasswordGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
