import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import QuoteGenerator from "@/pages/quote-generator";
import SettingsPage from "@/pages/settings";
import QuotesHistory from "@/pages/quotes-history";
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
      <Route path="/" component={QuoteGenerator} />
      <Route path="/history" component={QuotesHistory} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/admin" component={AdminSettingsWrapper} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Router />
    </QueryClientProvider>
  );
}

export default App;
