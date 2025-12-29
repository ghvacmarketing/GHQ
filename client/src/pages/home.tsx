import { Link } from "wouter";
import { FileText, History, Settings, BookOpen, Book, UserCog, Wrench, ClipboardList, Phone, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MobileNav from "@/components/mobile-nav";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { Quote, Lead, PortalUser } from "@shared/schema";
import { useMemo } from "react";
import { isThisWeek, subDays, isAfter } from "date-fns";

export default function Home() {
  const { data: quotesData, isLoading: isLoadingQuotes } = useQuery<{ quotes: Quote[] }>({
    queryKey: ['/api/quotes'],
  });

  const { data: leadsData, isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ['/api/leads'],
  });

  const { data: portalUser } = useQuery<PortalUser | null>({
    queryKey: ['/api/employee-portal/me'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const isLoggedIntoPortal = !!portalUser?.id;

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

    const thirtyDaysAgo = subDays(new Date(), 30);
    const wonDealsLast30Days = leads.filter(l => {
      if (l.status !== 'Won') return false;
      if (l.closedAt) {
        const closedDate = new Date(l.closedAt);
        return isAfter(closedDate, thirtyDaysAgo);
      }
      return false;
    }).length;

    const activePipelineLeads = leads.filter(l => !l.won && !l.lost);
    const pipelineValue = activePipelineLeads.reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0);

    return { pendingQuotes, activeLeads, installsThisWeek, wonDealsLast30Days, pipelineValue };
  }, [quotes, leads]);

  const isLoadingStats = isLoadingQuotes || isLoadingLeads;

  const sellActions = [
    {
      title: "New Service Quote",
      description: "Generate a quick quote",
      icon: FileText,
      href: "/quote",
      testId: "link-new-quote"
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

  const adminActions = [
    {
      title: "Phone",
      description: "Manage voicemails and daily call logs",
      icon: Phone,
      href: "/voicemails",
      testId: "link-phone"
    },
    {
      title: "Settings",
      description: "Configure app settings",
      icon: Settings,
      href: "/admin",
      testId: "link-admin-settings"
    },
  ];

  const installServiceActions = [
    {
      title: "Installation Department",
      description: "Track installation job pipeline",
      icon: Wrench,
      href: "/installation",
      testId: "link-installation"
    },
    {
      title: "Service Department",
      description: "Track service job pipeline",
      icon: Wrench,
      href: "/service-pipeline",
      testId: "link-service"
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
    {
      title: "Quote History",
      description: "View and manage all your quotes",
      icon: History,
      href: "/history",
      testId: "link-quote-history"
    },
    {
      title: "Proposal History",
      description: "View saved proposals and quotes",
      icon: FileText,
      href: "/proposal-history",
      testId: "link-proposal-history"
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <MobileNav />
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <span className="text-sm sm:text-base font-semibold truncate">Home</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Link href="/crm/login">
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-crm"
                title="CRM"
              >
                <Briefcase className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={isLoggedIntoPortal ? "/employee-portal" : "/employee-portal/login"}>
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-employee-portal"
              >
                <Users className="h-4 w-4" />
              </Button>
            </Link>
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

        <div className="mb-8" data-testid="summary-stats">
          <div className="flex flex-col items-center gap-3">
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="text-center hidden md:block" data-testid="card-metric-quotes">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Pending Quotes</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-12 mx-auto" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="stat-pending-quotes">
                      {summaryStats.pendingQuotes}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="text-center" data-testid="card-metric-pipeline">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Pipeline Value</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-20 mx-auto" />
                  ) : (
                    <div className="text-2xl sm:text-3xl font-bold" data-testid="stat-pipeline-value">
                      ${summaryStats.pipelineValue.toLocaleString()}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="text-center hidden md:block" data-testid="card-metric-leads">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Active Leads</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-12 mx-auto" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="stat-active-leads">
                      {summaryStats.activeLeads}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="w-full grid grid-cols-2 gap-3 md:hidden">
              <Card className="text-center" data-testid="card-metric-quotes-mobile">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Pending Quotes</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-12 mx-auto" />
                  ) : (
                    <div className="text-2xl font-bold">
                      {summaryStats.pendingQuotes}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="text-center" data-testid="card-metric-leads-mobile">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Active Leads</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-12 mx-auto" />
                  ) : (
                    <div className="text-2xl font-bold">
                      {summaryStats.activeLeads}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="w-full grid grid-cols-2 gap-3">
              <Card className="text-center" data-testid="card-metric-installs">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Installs This Week</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-12 mx-auto" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="stat-installs-week">
                      {summaryStats.installsThisWeek}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="text-center" data-testid="card-metric-won">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Won (30 days)</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingStats ? (
                    <Skeleton className="h-8 w-12 mx-auto" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="stat-won-deals">
                      {summaryStats.wonDealsLast30Days}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3" data-testid="text-sales-section">
              Sales
            </h2>
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
                          <action.icon className="h-5 w-5 text-primary-foreground" />
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3" data-testid="text-install-section">
              Install & Service
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {installServiceActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card 
                    className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group"
                    data-testid={action.testId}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white border-2 border-[#E3E3E3] flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                          <action.icon className="h-5 w-5 text-primary" />
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3" data-testid="text-reference-section">
              Reference
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {referenceActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card 
                    className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group"
                    data-testid={action.testId}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                          <action.icon className="h-5 w-5 text-primary" />
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3" data-testid="text-admin-section">
              Admin
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {adminActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card 
                    className="transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group"
                    data-testid={action.testId}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                          <action.icon className="h-5 w-5 text-primary" />
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

        </div>
      </main>
    </div>
  );
}
