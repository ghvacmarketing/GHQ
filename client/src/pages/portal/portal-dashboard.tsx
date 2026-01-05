import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ClipboardCheck, Wrench, ArrowRight, DollarSign } from "lucide-react";
import { PortalLayout } from "./portal-layout";

interface PortalCustomer {
  id: number;
  name: string;
  email: string | null;
}

interface PortalDashboardData {
  customer: {
    id: string;
    name: string;
  };
  invoicesSummary: {
    openCount: number;
    openTotal: string;
    totalCount: number;
  };
  agreementsSummary: {
    active: number;
    total: number;
  };
  recentService: {
    title: string;
    date: string | null;
  } | null;
}

export default function PortalDashboard() {
  const [, setLocation] = useLocation();

  const { data: customer, isLoading: customerLoading, error: customerError } = useQuery<PortalCustomer>({
    queryKey: ["/api/portal/auth/me"],
    retry: false,
  });

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery<PortalDashboardData>({
    queryKey: ["/api/portal/dashboard"],
    enabled: !!customer,
    retry: false,
  });

  useEffect(() => {
    if (customerError) {
      setLocation("/portal/login");
    }
  }, [customerError, setLocation]);

  if (customerLoading) {
    return (
      <PortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (!customer) {
    return null;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <PortalLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900" data-testid="text-welcome">
            Welcome, {customer.name}
          </h1>
          <p className="text-slate-500 mt-1">View your account information and history</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="shadow-sm hover:shadow-md transition-shadow" data-testid="card-open-invoices">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Open Invoices</CardTitle>
                <div className="p-2 bg-amber-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-900" data-testid="text-open-invoices-count">
                    {dashboardData?.invoicesSummary?.openCount || 0}
                  </p>
                  <p className="text-sm text-slate-500" data-testid="text-open-invoices-total">
                    {formatCurrency(parseFloat(dashboardData?.invoicesSummary?.openTotal || "0"))} total
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow" data-testid="card-agreements">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Maintenance Agreements</CardTitle>
                <div className="p-2 bg-green-100 rounded-lg">
                  <ClipboardCheck className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-900" data-testid="text-agreements-active">
                    {dashboardData?.agreementsSummary?.active || 0}
                  </p>
                  <p className="text-sm text-slate-500" data-testid="text-agreements-total">
                    {dashboardData?.agreementsSummary?.total || 0} total agreements
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow" data-testid="card-recent-service">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Recent Service</CardTitle>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Wrench className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : dashboardData?.recentService ? (
                <>
                  <p className="text-lg font-semibold text-slate-900" data-testid="text-recent-service-date">
                    {formatDate(dashboardData.recentService.date)}
                  </p>
                  <p className="text-sm text-slate-500 truncate" data-testid="text-recent-service-description">
                    {dashboardData.recentService.title || "Service completed"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400">No recent service</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/portal/invoices">
              <Button
                variant="outline"
                className="w-full justify-between h-auto py-4 border-slate-200 hover:border-[#711419] hover:text-[#711419]"
                data-testid="button-view-invoices"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  View Invoices
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/portal/agreements">
              <Button
                variant="outline"
                className="w-full justify-between h-auto py-4 border-slate-200 hover:border-[#711419] hover:text-[#711419]"
                data-testid="button-view-agreements"
              >
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  View Agreements
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/portal/service-history">
              <Button
                variant="outline"
                className="w-full justify-between h-auto py-4 border-slate-200 hover:border-[#711419] hover:text-[#711419]"
                data-testid="button-view-service-history"
              >
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Service History
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
