import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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
import NotFound from "@/pages/not-found";
import { lazy, Suspense } from "react";

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
      <Route path="/admin" component={AdminSettingsWrapper} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
