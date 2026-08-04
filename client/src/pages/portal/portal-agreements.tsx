import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { StatusDot } from "@/components/ui/status-dot";
import { ArrowLeft, ClipboardCheck, Calendar, RefreshCw, CheckCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { PortalLayout, PortalHeader } from "./portal-layout";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";

interface MaintenanceVisit {
  id: string;
  visitNumber: number;
  cycleYear: number;
  targetDate: string;
  completedAt: string | null;
  status: "pending" | "scheduled" | "completed" | "cancelled";
}

interface PortalAgreement {
  id: string;
  agreementNumber: string;
  agreementPlan: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  price: string;
  frequency: string;
  visitsPerPeriod: number;
  nextServiceDate: string | null;
  visits: MaintenanceVisit[];
  completedVisits: number;
  totalVisits: number;
  remainingVisits: number;
}

interface AgreementsResponse {
  agreements: PortalAgreement[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700 border-green-200" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-700 border-slate-200" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700 border-red-200" },
};

const visitStatusConfig: Record<string, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-green-100 text-green-700" },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
};

export default function PortalAgreements() {
  const [, setLocation] = useLocation();
  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set());

  const { data: customer, error: customerError } = useQuery<{ id: string; name: string }>({
    queryKey: ["/api/portal/auth/me"],
    retry: false,
  });

  const { data: agreementsData, isLoading } = useQuery<AgreementsResponse>({
    queryKey: ["/api/portal/agreements"],
    enabled: !!customer,
    retry: false,
  });

  const agreements = agreementsData?.agreements || [];

  useEffect(() => {
    if (customerError) {
      setLocation("/portal/login");
    }
  }, [customerError, setLocation]);

  const toggleAgreement = (id: string) => {
    setExpandedAgreements(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(parseFloat(amount || "0"));
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatFrequency = (frequency: string) => {
    const labels: Record<string, string> = {
      weekly: "Weekly",
      monthly: "Monthly",
      annual: "Annual",
    };
    return labels[frequency] || frequency;
  };

  return (
    <PortalLayout>
      {/* Not a tab — a frosted back bubble returns Home, like the app's sub-pages */}
      <button
        onClick={() => setLocation("/portal/dashboard")}
        className="liquid-glass mb-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-transform active:scale-95"
        aria-label="Back to dashboard"
        data-testid="button-back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <PortalHeader title="Maintenance Agreements" subtitle="Your service plans and visit coverage" />

      {isLoading ? (
        <div className="space-y-2.5">
          <div className="skeleton-shimmer h-44 rounded-[4px] bg-slate-200" />
          <div className="skeleton-shimmer h-44 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.08s" } as React.CSSProperties} />
        </div>
      ) : agreements.length === 0 ? (
        <div className="rounded-[4px] border border-slate-300/70 bg-white py-12 text-center" data-testid="status-no-agreements">
          <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No maintenance agreements found</p>
          <p className="mt-1 text-xs text-slate-400">Contact us to set up a maintenance plan for your HVAC system</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {agreements.map((agreement) => {
            const status = statusConfig[agreement.status] || statusConfig.pending;
            const isExpanded = expandedAgreements.has(agreement.id);
            const progressPercent = agreement.totalVisits > 0
              ? (agreement.completedVisits / agreement.totalVisits) * 100
              : 0;

            return (
              <div key={agreement.id} className="rounded-[4px] border border-slate-300/70 border-l-4 border-l-emerald-500 bg-white p-3.5" data-testid={`card-agreement-${agreement.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="shrink-0 rounded-[3px] bg-green-100 p-2">
                      <ClipboardCheck className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900" data-testid={`text-agreement-plan-${agreement.id}`}>
                        {agreement.agreementPlan}
                      </p>
                      <p className="text-xs text-slate-500" data-testid={`text-agreement-number-${agreement.id}`}>
                        {agreement.agreementNumber}
                      </p>
                    </div>
                  </div>
                  <StatusDot pill={status.className} data-testid={`badge-agreement-status-${agreement.id}`}>
                    {status.label}
                  </StatusDot>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Billing</p>
                    <p className="flex items-center gap-1 font-medium" data-testid={`text-agreement-price-${agreement.id}`}>
                      <RefreshCw className="h-3 w-3" />
                      {formatCurrency(agreement.price)}/{formatFrequency(agreement.frequency).toLowerCase()}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Visits Included</p>
                    <p className="font-medium" data-testid={`text-agreement-visits-${agreement.id}`}>
                      {agreement.visitsPerPeriod} per {formatFrequency(agreement.frequency).toLowerCase()}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Coverage Period</p>
                    <p className="flex items-center gap-1 font-medium" data-testid={`text-agreement-period-${agreement.id}`}>
                      <Calendar className="h-3 w-3" />
                      {formatDate(agreement.startDate)} - {formatDate(agreement.endDate)}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Next Service</p>
                    <p className="font-medium" data-testid={`text-agreement-next-service-${agreement.id}`}>
                      {agreement.nextServiceDate ? formatDate(agreement.nextServiceDate) : "Not scheduled"}
                    </p>
                  </div>
                </div>

                {/* Visit Tracking Summary */}
                {agreement.totalVisits > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium" data-testid={`text-completed-visits-${agreement.id}`}>
                          {agreement.completedVisits} of {agreement.totalVisits} visits completed
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Clock className="h-4 w-4" />
                        <span data-testid={`text-remaining-visits-${agreement.id}`}>
                          {agreement.remainingVisits} remaining
                        </span>
                      </div>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>
                )}

                {/* Expandable Visit History */}
                {agreement.visits.length > 0 && (
                  <Collapsible open={isExpanded} onOpenChange={() => toggleAgreement(agreement.id)}>
                    <CollapsibleTrigger asChild>
                      <button
                        className="mt-2 flex h-10 w-full items-center justify-between rounded-[4px] px-2 text-sm font-medium text-slate-600 transition-colors active:bg-slate-50"
                        data-testid={`button-toggle-visits-${agreement.id}`}
                      >
                        <span>View Visit History</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="space-y-2 rounded-[4px] border border-slate-200 bg-slate-50 p-2.5">
                        {agreement.visits.map((visit) => {
                          const visitStatus = visitStatusConfig[visit.status] || visitStatusConfig.pending;
                          return (
                            <div
                              key={visit.id}
                              className="flex items-center justify-between rounded-[4px] border border-slate-200 bg-white p-3"
                              data-testid={`visit-row-${visit.id}`}
                            >
                              <div className="flex items-center gap-3">
                                {visit.status === "completed" ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Clock className="h-4 w-4 text-slate-400" />
                                )}
                                <div>
                                  <p className="text-sm font-medium" data-testid={`text-visit-number-${visit.id}`}>
                                    Visit #{visit.visitNumber}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {visit.status === "completed" && visit.completedAt
                                      ? `Completed ${formatDate(visit.completedAt)}`
                                      : `Scheduled for ${formatDate(visit.targetDate)}`}
                                  </p>
                                </div>
                              </div>
                              <StatusDot pill={`text-xs ${visitStatus.className}`}>
                                {visitStatus.label}
                              </StatusDot>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PortalLayout>
  );
}
