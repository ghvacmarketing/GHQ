import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import QuoteGenerator from "@/pages/quote-generator";
import SettingsPage from "@/pages/settings";
import AdminSettings from "@/pages/admin-settings";
import QuotesHistory from "@/pages/quotes-history";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={QuoteGenerator} />
      <Route path="/history" component={QuotesHistory} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/admin" component={AdminSettings} />
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
