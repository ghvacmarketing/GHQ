import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LogOut,
  Users,
  Briefcase,
  FileText,
  MessageSquare,
  Settings,
  DollarSign,
  Calendar,
  Loader2,
  Home,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";

export default function CrmDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/crm/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      sessionStorage.removeItem("crm_gate_passed");
      window.location.href = "/crm/login";
    },
    onError: () => {
      toast({ title: "Logout failed", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto p-4 space-y-6">
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "manager":
        return "secondary";
      case "dispatcher":
        return "outline";
      case "sales":
        return "default";
      case "tech":
        return "secondary";
      default:
        return "outline";
    }
  };

  const stats = [
    { label: "Customers", value: "—", icon: Users, color: "text-blue-600" },
    { label: "Jobs Today", value: "—", icon: Calendar, color: "text-green-600" },
    { label: "Open Invoices", value: "—", icon: FileText, color: "text-orange-600" },
    { label: "Pending Payments", value: "—", icon: DollarSign, color: "text-red-600" },
  ];

  const navItems = [
    { label: "Customers", icon: Users, href: "/crm/customers", color: "bg-blue-50 hover:bg-blue-100 text-blue-700" },
    { label: "Jobs", icon: Briefcase, href: "/crm/jobs", color: "bg-green-50 hover:bg-green-100 text-green-700" },
    { label: "Invoices", icon: FileText, href: "/crm/invoices", color: "bg-orange-50 hover:bg-orange-100 text-orange-700" },
    { label: "Messages", icon: MessageSquare, href: "/crm/messages", color: "bg-purple-50 hover:bg-purple-100 text-purple-700" },
    { label: "Settings", icon: Settings, href: "/crm/settings", color: "bg-slate-50 hover:bg-slate-100 text-slate-700" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-home">
                <Home className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-bold text-indigo-600" data-testid="text-crm-title">
              GHVAC CRM
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm font-medium" data-testid="text-user-name">
                {currentUser.name}
              </span>
              <Badge variant={getRoleBadgeVariant(currentUser.role)} className="capitalize" data-testid="badge-user-role">
                {currentUser.role}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LogOut className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Logout</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="sm:hidden flex items-center gap-2 mb-4">
          <span className="text-sm font-medium" data-testid="text-user-name-mobile">
            {currentUser.name}
          </span>
          <Badge variant={getRoleBadgeVariant(currentUser.role)} className="capitalize">
            {currentUser.role}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-grid">
          {stats.map((stat) => (
            <Card key={stat.label} className="border shadow-sm" data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-slate-50 ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid={`stat-value-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Quick Access</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="nav-grid">
            {navItems.map((item) => (
              <Card
                key={item.label}
                className={`border cursor-pointer transition-all hover:shadow-md ${item.color}`}
                onClick={() => navigate(item.href)}
                data-testid={`nav-card-${item.label.toLowerCase()}`}
              >
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <item.icon className="h-8 w-8 mb-2" />
                  <span className="font-medium">{item.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Coming Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Full CRM functionality including customer management, job scheduling, invoicing, and messaging will be available soon.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
