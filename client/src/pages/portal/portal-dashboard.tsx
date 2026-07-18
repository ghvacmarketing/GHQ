import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, ClipboardCheck, Wrench, ArrowRight, DollarSign, Receipt, Droplets,
  CalendarDays, CalendarPlus, Loader2, Truck,
} from "lucide-react";
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
  quotesSummary: {
    pendingCount: number;
    pendingTotal: string;
    totalCount: number;
  };
  recentService: {
    title: string;
    date: string | null;
  } | null;
}

interface PortalAppointments {
  workOrders: Array<{
    id: string;
    orderNumber: string | null;
    title: string | null;
    status: string;
    visitType: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
  }>;
  maintenanceVisits: Array<{
    id: string;
    visitNumber: number;
    totalVisitsInCycle: number;
    targetDate: string;
    status: string;
    agreementPlan: string | null;
  }>;
}

const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  dispatched: "Technician assigned",
  en_route: "Technician en route",
  on_site: "Technician on site",
};

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

  const { data: appointments, isLoading: appointmentsLoading } = useQuery<PortalAppointments>({
    queryKey: ["/api/portal/appointments"],
    enabled: !!customer,
    retry: false,
  });

  const { toast } = useToast();
  const [requestMessage, setRequestMessage] = useState("");
  const [preferredTime, setPreferredTime] = useState("");

  const serviceRequest = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/service-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: requestMessage, preferredTime }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to submit request");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Request sent", description: "Our office will reach out shortly to get you scheduled." });
      setRequestMessage("");
      setPreferredTime("");
    },
    onError: (e: Error) => toast({ title: "Request failed", description: e.message, variant: "destructive" }),
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

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Date TBD";
    return new Date(dateString).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

          <Card className="shadow-sm hover:shadow-md transition-shadow" data-testid="card-quotes">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Pending Quotes</CardTitle>
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Receipt className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-900" data-testid="text-pending-quotes-count">
                    {dashboardData?.quotesSummary?.pendingCount || 0}
                  </p>
                  <p className="text-sm text-slate-500" data-testid="text-pending-quotes-total">
                    {formatCurrency(parseFloat(dashboardData?.quotesSummary?.pendingTotal || "0"))} pending
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

        {/* Upcoming appointments + request service */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-sm" data-testid="card-upcoming-appointments">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-[#711419]" />
                Upcoming Appointments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appointmentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : (appointments?.workOrders?.length || 0) === 0 && (appointments?.maintenanceVisits?.length || 0) === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center" data-testid="text-no-appointments">
                  Nothing scheduled right now.
                </p>
              ) : (
                <ul className="space-y-2">
                  {appointments?.workOrders?.map((wo) => (
                    <li
                      key={wo.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"
                      data-testid={`appointment-${wo.id}`}
                    >
                      <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                        <Truck className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {wo.title || wo.visitType || "Service visit"}
                        </p>
                        <p className="text-sm text-slate-500">
                          {formatDateTime(wo.scheduledStart)}
                          <span className="ml-2 text-xs text-emerald-600">
                            {WORK_ORDER_STATUS_LABELS[wo.status] || wo.status}
                          </span>
                        </p>
                      </div>
                    </li>
                  ))}
                  {appointments?.maintenanceVisits?.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"
                      data-testid={`visit-${v.id}`}
                    >
                      <div className="p-2 bg-green-100 rounded-lg shrink-0">
                        <ClipboardCheck className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          Maintenance visit {v.visitNumber} of {v.totalVisitsInCycle}
                          {v.agreementPlan ? ` — ${v.agreementPlan}` : ""}
                        </p>
                        <p className="text-sm text-slate-500">
                          Target: {formatDate(v.targetDate)}
                          {v.status === "pending" && (
                            <span className="ml-2 text-xs text-amber-600">Call us to schedule</span>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm" data-testid="card-request-service">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarPlus className="h-5 w-5 text-[#711419]" />
                Need Service?
              </CardTitle>
              <CardDescription>
                Book online and pick a time, or send us a note and we'll call you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <a href="/book-online" target="_blank" rel="noopener">
                <Button className="w-full text-white" style={{ backgroundColor: "#711419" }} data-testid="button-book-online">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Book a Visit Online
                </Button>
              </a>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">or request a callback</span></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-request">What's going on?</Label>
                <Textarea
                  id="service-request"
                  rows={2}
                  placeholder="e.g. AC isn't cooling upstairs..."
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  data-testid="input-service-request"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferred-time">Preferred day/time (optional)</Label>
                <Input
                  id="preferred-time"
                  placeholder="e.g. weekday mornings"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  data-testid="input-preferred-time"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => serviceRequest.mutate()}
                disabled={serviceRequest.isPending || !requestMessage.trim()}
                className="w-full"
                data-testid="button-send-service-request"
              >
                {serviceRequest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <Link href="/portal/quotes">
              <Button
                variant="outline"
                className="w-full justify-between h-auto py-4 border-slate-200 hover:border-[#711419] hover:text-[#711419]"
                data-testid="button-view-quotes"
              >
                <span className="flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  View Quotes
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
            <Link href="/portal/sensors">
              <Button
                variant="outline"
                className="w-full justify-between h-auto py-4 border-slate-200 hover:border-[#711419] hover:text-[#711419]"
                data-testid="button-view-sensors"
              >
                <span className="flex items-center gap-2">
                  <Droplets className="h-4 w-4" />
                  Environment Monitoring
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
