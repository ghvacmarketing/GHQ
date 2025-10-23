import { Switch, Route, useLocation } from "wouter";
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
// import Login from "@/pages/login";
// import AuthVerify from "@/pages/auth-verify";
import NotFound from "@/pages/not-found";
import AnnouncementModal from "@/components/AnnouncementModal";
import { lazy, Suspense, useState, useEffect } from "react";
import type { Announcement } from "@shared/schema";
import { Loader2 } from "lucide-react";

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
      {/* <Route path="/login" component={Login} /> */}
      {/* <Route path="/auth/verify/:token" component={AuthVerify} /> */}
      <Route path="/" component={Home} />
      <Route path="/quote" component={QuoteGenerator} />
      <Route path="/quote/edit/:id" component={QuoteEdit} />
      <Route path="/history" component={QuotesHistory} />
      <Route path="/price-book" component={PriceBook} />
      <Route path="/processes" component={ProcessesSystems} />
      <Route path="/processes/new" component={ProcessBuilderManual} />
      <Route path="/processes/new/voice" component={ProcessBuilderVoice} />
      <Route path="/sales-prospects" component={SalesProspects} />
      <Route path="/admin" component={AdminSettingsWrapper} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [location, navigate] = useLocation();

  // Check authentication status
  const { data: authStatus, isLoading: authLoading, isError } = useQuery<{
    authenticated: boolean;
    user?: { phoneNumber: string; name: string } | null;
    replitAccess?: boolean;
  }>({
    queryKey: ['/api/auth/status'],
    retry: false,
  });

  // Fetch active announcement
  const { data: announcement } = useQuery<Announcement | null>({
    queryKey: ['/api/announcement'],
    enabled: authStatus?.authenticated === true, // Only fetch when authenticated
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

  // Redirect to login if not authenticated (except for public routes)
  useEffect(() => {
    if (!authLoading) {
      const isPublicRoute = location === '/login' || location.startsWith('/auth/verify');
      
      // If error or explicitly not authenticated, redirect to login
      if ((isError || !authStatus?.authenticated) && !isPublicRoute) {
        navigate('/login');
      }
    }
  }, [authStatus, authLoading, isError, location, navigate]);

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

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
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
