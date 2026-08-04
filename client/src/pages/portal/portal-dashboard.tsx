import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ClipboardCheck, Wrench, ChevronRight, DollarSign, Receipt, Droplets,
  CalendarDays, Loader2, Truck, Phone, LogOut,
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

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/portal/auth/logout");
    } catch (e) {
    }
    setLocation("/portal/login");
  };

  if (customerLoading) {
    return (
      <PortalLayout>
        <div className="space-y-5">
          <div className="skeleton-shimmer h-9 w-56 rounded-[4px] bg-slate-200" />
          <div className="grid grid-cols-2 gap-3">
            <div className="skeleton-shimmer h-28 rounded-[4px] bg-slate-200" />
            <div className="skeleton-shimmer h-28 rounded-[4px] bg-slate-200" />
            <div className="skeleton-shimmer h-28 rounded-[4px] bg-slate-200" />
            <div className="skeleton-shimmer h-28 rounded-[4px] bg-slate-200" />
          </div>
          <div className="skeleton-shimmer h-40 rounded-[4px] bg-slate-200" />
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

  const firstName = customer.name?.trim().split(/\s+/)[0] || "";
  const now = new Date();

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Greeting header — same voice as the app's agenda */}
        <div className="flex items-center justify-between" data-testid="portal-greeting-header">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-welcome">
              {greetingForHour(now.getHours())}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-sm text-slate-500">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>
          {/* Call + logout share one frosted bubble */}
          <div className="liquid-glass flex items-center rounded-full">
            <a
              href="tel:+17068260644"
              className="flex h-11 w-12 items-center justify-center rounded-l-full text-slate-600 transition-transform active:scale-95"
              style={{ WebkitTapHighlightColor: "transparent" }}
              aria-label="Call Giesbrecht HVAC"
              data-testid="button-call"
            >
              <Phone className="h-5 w-5" />
            </a>
            <span className="h-6 w-px bg-slate-200" aria-hidden />
            <button
              onClick={handleLogout}
              className="flex h-11 w-12 items-center justify-center rounded-r-full text-slate-600 transition-transform active:scale-95"
              style={{ WebkitTapHighlightColor: "transparent" }}
              aria-label="Log out"
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Stat tiles — tap through to the matching tab */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/portal/invoices">
            <div className="h-full rounded-[4px] border border-slate-300/70 bg-white p-3.5 transition-transform active:scale-[0.98]" data-testid="card-open-invoices">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Open Invoices</p>
                <span className="rounded-[3px] bg-amber-100 p-1.5">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                </span>
              </div>
              {dashboardLoading ? (
                <div className="skeleton-shimmer mt-2 h-8 w-20 rounded-[4px] bg-slate-200" />
              ) : (
                <>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900" data-testid="text-open-invoices-count">
                    {dashboardData?.invoicesSummary?.openCount || 0}
                  </p>
                  <p className="text-xs text-slate-500" data-testid="text-open-invoices-total">
                    {formatCurrency(parseFloat(dashboardData?.invoicesSummary?.openTotal || "0"))} total
                  </p>
                </>
              )}
            </div>
          </Link>

          <Link href="/portal/quotes">
            <div className="h-full rounded-[4px] border border-slate-300/70 bg-white p-3.5 transition-transform active:scale-[0.98]" data-testid="card-quotes">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pending Quotes</p>
                <span className="rounded-[3px] bg-[#711419]/[0.08] p-1.5">
                  <Receipt className="h-4 w-4 text-[#711419]" />
                </span>
              </div>
              {dashboardLoading ? (
                <div className="skeleton-shimmer mt-2 h-8 w-20 rounded-[4px] bg-slate-200" />
              ) : (
                <>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900" data-testid="text-pending-quotes-count">
                    {dashboardData?.quotesSummary?.pendingCount || 0}
                  </p>
                  <p className="text-xs text-slate-500" data-testid="text-pending-quotes-total">
                    {formatCurrency(parseFloat(dashboardData?.quotesSummary?.pendingTotal || "0"))} pending
                  </p>
                </>
              )}
            </div>
          </Link>

          <Link href="/portal/agreements">
            <div className="h-full rounded-[4px] border border-slate-300/70 bg-white p-3.5 transition-transform active:scale-[0.98]" data-testid="card-agreements">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Maintenance</p>
                <span className="rounded-[3px] bg-green-100 p-1.5">
                  <ClipboardCheck className="h-4 w-4 text-green-600" />
                </span>
              </div>
              {dashboardLoading ? (
                <div className="skeleton-shimmer mt-2 h-8 w-20 rounded-[4px] bg-slate-200" />
              ) : (
                <>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900" data-testid="text-agreements-active">
                    {dashboardData?.agreementsSummary?.active || 0}
                  </p>
                  <p className="text-xs text-slate-500" data-testid="text-agreements-total">
                    {dashboardData?.agreementsSummary?.total || 0} total agreements
                  </p>
                </>
              )}
            </div>
          </Link>

          <Link href="/portal/service-history">
            <div className="h-full rounded-[4px] border border-slate-300/70 bg-white p-3.5 transition-transform active:scale-[0.98]" data-testid="card-recent-service">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recent Service</p>
                <span className="rounded-[3px] bg-[#711419]/[0.08] p-1.5">
                  <Wrench className="h-4 w-4 text-[#711419]" />
                </span>
              </div>
              {dashboardLoading ? (
                <div className="skeleton-shimmer mt-2 h-8 w-20 rounded-[4px] bg-slate-200" />
              ) : dashboardData?.recentService ? (
                <>
                  <p className="mt-1.5 text-lg font-bold text-slate-900" data-testid="text-recent-service-date">
                    {formatDate(dashboardData.recentService.date)}
                  </p>
                  <p className="truncate text-xs text-slate-500" data-testid="text-recent-service-description">
                    {dashboardData.recentService.title || "Service completed"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-400">No recent service</p>
              )}
            </div>
          </Link>
        </div>

        {/* Upcoming appointments */}
        <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid="card-upcoming-appointments">
          <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Upcoming appointments
          </p>
          <div className="p-3.5">
            {appointmentsLoading ? (
              <div className="space-y-2">
                <div className="skeleton-shimmer h-14 rounded-[4px] bg-slate-200" />
                <div className="skeleton-shimmer h-14 rounded-[4px] bg-slate-200" />
              </div>
            ) : (appointments?.workOrders?.length || 0) === 0 && (appointments?.maintenanceVisits?.length || 0) === 0 ? (
              <p className="py-3 text-center text-sm text-slate-400" data-testid="text-no-appointments">
                Nothing scheduled right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {appointments?.workOrders?.map((wo) => (
                  <li
                    key={wo.id}
                    className="flex items-start gap-3 rounded-[4px] border border-slate-300/70 border-l-4 border-l-[#711419] p-3"
                    data-testid={`appointment-${wo.id}`}
                  >
                    <div className="shrink-0 rounded-[3px] bg-[#711419]/[0.08] p-2">
                      <Truck className="h-4 w-4 text-[#711419]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {wo.title || wo.visitType || "Service visit"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDateTime(wo.scheduledStart)}
                        <span className="ml-2 text-xs font-medium text-emerald-600">
                          {WORK_ORDER_STATUS_LABELS[wo.status] || wo.status}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
                {appointments?.maintenanceVisits?.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-start gap-3 rounded-[4px] border border-slate-300/70 border-l-4 border-l-emerald-500 p-3"
                    data-testid={`visit-${v.id}`}
                  >
                    <div className="shrink-0 rounded-[3px] bg-green-100 p-2">
                      <ClipboardCheck className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        Maintenance visit {v.visitNumber} of {v.totalVisitsInCycle}
                        {v.agreementPlan ? ` — ${v.agreementPlan}` : ""}
                      </p>
                      <p className="text-sm text-slate-500">
                        Target: {formatDate(v.targetDate)}
                        {v.status === "pending" && (
                          <span className="ml-2 text-xs font-medium text-amber-600">Call us to schedule</span>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Request service */}
        <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid="card-request-service">
          <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Need service?
          </p>
          <div className="space-y-4 p-3.5">
            <a href="/book-online" target="_blank" rel="noopener" className="block">
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
                data-testid="button-book-online"
              >
                <CalendarDays className="h-4 w-4" />
                Book a Visit Online
              </button>
            </a>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-wider"><span className="bg-white px-2 text-slate-500">or request a callback</span></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-request">What's going on?</Label>
              <Textarea
                id="service-request"
                rows={2}
                placeholder="e.g. AC isn't cooling upstairs..."
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                className="rounded-[4px] text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400"
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
                className="h-12 rounded-[4px] text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400"
                data-testid="input-preferred-time"
              />
            </div>
            <button
              onClick={() => serviceRequest.mutate()}
              disabled={serviceRequest.isPending || !requestMessage.trim()}
              className="flex h-12 w-full items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-base font-semibold text-slate-700 transition-transform active:scale-[0.98] disabled:opacity-50"
              data-testid="button-send-service-request"
            >
              {serviceRequest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
            </button>
          </div>
        </div>

        {/* The pages that aren't tabs */}
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
          <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            More
          </p>
          <Link href="/portal/agreements">
            <div className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-colors active:bg-slate-50" data-testid="button-view-agreements">
              <span className="rounded-[3px] bg-green-100 p-2">
                <ClipboardCheck className="h-4 w-4 text-green-600" />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-900">Maintenance Agreements</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          </Link>
          <Link href="/portal/sensors">
            <div className="flex w-full items-center gap-3 border-t border-slate-200/80 px-3.5 py-3.5 text-left transition-colors active:bg-slate-50" data-testid="button-view-sensors">
              <span className="rounded-[3px] bg-sky-100 p-2">
                <Droplets className="h-4 w-4 text-sky-600" />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-900">Environment Monitoring</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          </Link>
        </div>

        <p className="pb-2 text-center text-xs text-slate-400">
          Questions? Call us at{" "}
          <a href="tel:+17068260644" className="font-medium text-[#711419]" data-testid="link-phone">
            (706) 826-0644
          </a>
        </p>
      </div>
    </PortalLayout>
  );
}
