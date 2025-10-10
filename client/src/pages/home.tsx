import { Link } from "wouter";
import { FileText, History, Settings, BookOpen, Shield, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { useQuery } from "@tanstack/react-query";
import type { Quote } from "@shared/schema";

export default function Home() {
  const { data: quotesData } = useQuery({
    queryKey: ['/api/quotes'],
  });

  const { data: processes = [] } = useQuery({
    queryKey: ['/api/processes'],
  });

  const quotes = quotesData?.quotes || [];

  const actions = [
    {
      title: "New Quote",
      description: "Generate a professional HVAC quote on-site",
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
      title: "Processes & Systems",
      description: "Access saved procedures and guides",
      icon: BookOpen,
      href: "/processes",
      testId: "link-processes"
    },
    {
      title: "Settings",
      description: "Configure parts catalog and categories",
      icon: Settings,
      href: "/settings",
      testId: "link-settings"
    },
    {
      title: "Admin",
      description: "System configuration and integrations",
      icon: Shield,
      href: "/admin",
      testId: "link-admin"
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
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
                  { label: "Processes and Systems", path: "/processes" },
                ]}
              />
              <p className="text-xs text-muted-foreground hidden sm:block">Field Technician Tool</p>
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
          </div>
        </div>
      </header>

      {/* In Development Banner */}
      <Alert className="mx-4 mt-4 border-orange-500/50 bg-orange-500/10" data-testid="alert-in-development">
        <AlertCircle className="h-4 w-4 text-orange-500" />
        <AlertDescription className="text-orange-600 dark:text-orange-400">
          This application is currently in development. Some features may be incomplete or subject to change.
        </AlertDescription>
      </Alert>

      {/* Dashboard */}
      <main className="container mx-auto px-4 py-6 max-w-md md:max-w-2xl lg:max-w-5xl">
        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-primary/5 border-primary/20" data-testid="card-total-quotes">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Quotes</p>
                  <p className="text-2xl font-bold text-primary" data-testid="text-total-quotes">{quotes.length}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20" data-testid="card-total-processes">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Processes</p>
                  <p className="text-2xl font-bold text-primary" data-testid="text-total-processes">{processes.length}</p>
                </div>
                <BookOpen className="h-8 w-8 text-primary/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20" data-testid="card-recent-activity">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Recent</p>
                  <p className="text-2xl font-bold text-primary" data-testid="text-recent-count">
                    {quotes.filter(q => {
                      if (!q.createdAt) return false;
                      const weekAgo = new Date();
                      weekAgo.setDate(weekAgo.getDate() - 7);
                      return new Date(q.createdAt) > weekAgo;
                    }).length}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-primary/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20" data-testid="card-quick-access">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Quick Access</p>
                  <p className="text-2xl font-bold text-primary">{actions.length}</p>
                </div>
                <Shield className="h-8 w-8 text-primary/40" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Cards */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-quick-actions-title">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actions.map((action) => (
              <Link key={action.href} href={action.href}>
                <Card 
                  className="transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer group"
                  data-testid={action.testId}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110">
                        <action.icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1" data-testid={`text-${action.testId}-title`}>
                          {action.title}
                        </h3>
                        <p className="text-sm text-muted-foreground" data-testid={`text-${action.testId}-description`}>
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
      </main>
    </div>
  );
}
