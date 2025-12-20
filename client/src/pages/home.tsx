import { Link } from "wouter";
import { FileText, History, Settings, BookOpen, Shield, Book, UserCog, Wrench, ClipboardList, Users, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import { useQuery } from "@tanstack/react-query";
import type { Quote, Lead } from "@shared/schema";
import { useMemo } from "react";
import { isThisWeek } from "date-fns";

export default function Home() {
  const { data: quotesData, isLoading: isLoadingQuotes } = useQuery<{ quotes: Quote[] }>({
    queryKey: ['/api/quotes'],
  });

  const { data: leadsData, isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ['/api/leads'],
  });

  const quotes = quotesData?.quotes || [];
  const leads = leadsData || [];

  const summaryStats = useMemo(() => {
    const pendingQuotes = quotes.filter(q => q.status === 'draft' || q.status === 'sent').length;
    const activeLeads = leads.filter(l => l.status === 'New' || l.status === 'Contacted' || l.status === 'Qualified').length;
    
    const installationLeads = leads.filter(lead => {
      if (lead.status !== "Won") return false;
      const tags = lead.tags as string[] | null;
      if (!tags || !Array.isArray(tags)) return false;
      return tags.some(tag => tag.toLowerCase() === "installation");
    });
    
    const installsThisWeek = installationLeads.filter(lead => {
      if (lead.installDate) {
        const date = new Date(lead.installDate);
        return isThisWeek(date);
      }
      return false;
    }).length;

    const wonDeals = leads.filter(l => l.status === 'Won').length;

    return { pendingQuotes, activeLeads, installsThisWeek, wonDeals };
  }, [quotes, leads]);

  const isLoadingStats = isLoadingQuotes || isLoadingLeads;

  const sellActions = [
    {
      title: "New Quote",
      description: "Generate a quick quote",
      icon: FileText,
      href: "/quote",
      testId: "link-new-quote"
    },
    {
      title: "Quote History",
      description: "View and manage all your quotes",
      icon: History,
      href: "/history",
      testId: "link-quote-history"
    },
    {
      title: "Proposal Builder",
      description: "Build proposals with customers step-by-step",
      icon: ClipboardList,
      href: "/proposal",
      testId: "link-proposal-builder"
    },
    {
      title: "Sales Prospects",
      description: "Track leads and follow-up activities",
      icon: UserCog,
      href: "/sales-prospects",
      testId: "link-sales-prospects"
    },
  ];

  const installActions = [
    {
      title: "Installation Pipeline",
      description: "Track installation job pipeline",
      icon: Wrench,
      href: "/installation",
      testId: "link-installation"
    },
  ];

  const referenceActions = [
    {
      title: "Price Book",
      description: "View current pricing and parts catalog",
      icon: Book,
      href: "/price-book",
      testId: "link-price-book"
    },
    {
      title: "Processes & Systems",
      description: "Access saved procedures and guides",
      icon: BookOpen,
      href: "/processes",
      testId: "link-processes"
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <NavDropdown 
                currentPageTitle="Home"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation", path: "/installation" },
                  { label: "Proposal Builder", path: "/proposal" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => window.location.href = '/admin'}
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-md md:max-w-2xl lg:max-w-4xl">
        <div className="text-center mb-8" data-testid="hero-section">
          <h1 className="text-3xl md:text-4xl font-bold text-primary mb-1" data-testid="text-hero-title">
            GHVAC Tools
          </h1>
          <p className="text-muted-foreground text-sm">Field technician solutions</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8" data-testid="summary-stats">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-3 text-center">
              {isLoadingStats ? (
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-bold text-blue-700" data-testid="stat-pending-quotes">
                  {summaryStats.pendingQuotes}
                </p>
              )}
              <p className="text-xs text-blue-600 font-medium">Pending Quotes</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-3 text-center">
              {isLoadingStats ? (
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-bold text-green-700" data-testid="stat-active-leads">
                  {summaryStats.activeLeads}
                </p>
              )}
              <p className="text-xs text-green-600 font-medium">Active Leads</p>
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="p-3 text-center">
              {isLoadingStats ? (
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-bold text-orange-700" data-testid="stat-installs-week">
                  {summaryStats.installsThisWeek}
                </p>
              )}
              <p className="text-xs text-orange-600 font-medium">Installs This Week</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-3 text-center">
              {isLoadingStats ? (
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-bold text-purple-700" data-testid="stat-won-deals">
                  {summaryStats.wonDeals}
                </p>
              )}
              <p className="text-xs text-purple-600 font-medium">Won Deals</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-sell-section">
                Sell
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sellActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card 
                    className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group"
                    data-testid={action.testId}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                          <action.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm" data-testid={`text-${action.testId}-title`}>
                            {action.title}
                          </h3>
                          <p className="text-xs text-muted-foreground truncate" data-testid={`text-${action.testId}-description`}>
                            {action.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-install-section">
                Install
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {installActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card 
                    className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group"
                    data-testid={action.testId}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                          <action.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm" data-testid={`text-${action.testId}-title`}>
                            {action.title}
                          </h3>
                          <p className="text-xs text-muted-foreground truncate" data-testid={`text-${action.testId}-description`}>
                            {action.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Book className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-reference-section">
                Reference
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {referenceActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card 
                    className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group"
                    data-testid={action.testId}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-500 flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                          <action.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm" data-testid={`text-${action.testId}-title`}>
                            {action.title}
                          </h3>
                          <p className="text-xs text-muted-foreground truncate" data-testid={`text-${action.testId}-description`}>
                            {action.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t">
            <Link href="/admin">
              <Card 
                className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group max-w-xs"
                data-testid="link-admin"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-400 flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                      <Shield className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground text-sm" data-testid="text-link-admin-title">
                        Admin Settings
                      </h3>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
