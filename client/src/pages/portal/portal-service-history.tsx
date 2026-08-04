import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { StatusDot } from "@/components/ui/status-dot";
import { Wrench, Calendar, CheckCircle } from "lucide-react";
import { PortalLayout, PortalHeader } from "./portal-layout";

interface PortalWorkOrder {
  id: string;
  orderNumber: string | null;
  title: string;
  status: string;
  visitType: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  completedAt: string | null;
  summary: string | null;
}

interface ServiceHistoryResponse {
  workOrders: PortalWorkOrder[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-green-100 text-green-700 border-green-200" },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700 border-blue-200" },
  dispatched: { label: "Dispatched", className: "bg-amber-100 text-amber-700 border-amber-200" },
  en_route: { label: "Traveling", className: "bg-purple-100 text-purple-700 border-purple-200" },
  on_site: { label: "Working", className: "bg-orange-100 text-orange-700 border-orange-200" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

const visitTypeLabels: Record<string, string> = {
  SERVICE: "Service",
  INSTALL: "Installation",
  MAINTENANCE: "Maintenance",
  SALES: "Sales Visit",
};

export default function PortalServiceHistory() {
  const [, setLocation] = useLocation();

  const { data: customer, error: customerError } = useQuery<{ id: string; name: string }>({
    queryKey: ["/api/portal/auth/me"],
    retry: false,
  });

  const { data: historyData, isLoading } = useQuery<ServiceHistoryResponse>({
    queryKey: ["/api/portal/service-history"],
    enabled: !!customer,
    retry: false,
  });

  const workOrders = historyData?.workOrders || [];

  useEffect(() => {
    if (customerError) {
      setLocation("/portal/login");
    }
  }, [customerError, setLocation]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <PortalLayout>
      <PortalHeader title="Service History" subtitle="Your past and upcoming visits" />

      {isLoading ? (
        <div className="space-y-2.5" data-testid="history-skeleton">
          <div className="skeleton-shimmer h-24 rounded-[4px] bg-slate-200" />
          <div className="skeleton-shimmer h-24 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.08s" } as React.CSSProperties} />
          <div className="skeleton-shimmer h-24 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.16s" } as React.CSSProperties} />
        </div>
      ) : workOrders.length === 0 ? (
        <div className="rounded-[4px] border border-slate-300/70 bg-white py-12 text-center" data-testid="status-no-history">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No service history yet</p>
          <p className="mt-1 text-xs text-slate-400">Your completed service visits will appear here</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {workOrders.map((wo) => {
            const status = statusConfig[wo.status] || statusConfig.scheduled;
            const isCompleted = wo.status === "completed";
            return (
              <div
                key={wo.id}
                className={`rounded-[4px] border border-slate-300/70 border-l-4 bg-white p-3.5 ${isCompleted ? "border-l-emerald-500" : "border-l-[#711419]"}`}
                data-testid={`card-work-order-${wo.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`shrink-0 rounded-[3px] p-2 ${isCompleted ? "bg-green-100" : "bg-[#711419]/[0.08]"}`}>
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Wrench className="h-4 w-4 text-[#711419]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900" data-testid={`text-wo-title-${wo.id}`}>
                        {wo.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <span className="font-semibold uppercase tracking-wide" data-testid={`badge-wo-type-${wo.id}`}>
                          {visitTypeLabels[wo.visitType] || wo.visitType}
                        </span>
                        {wo.orderNumber && <span data-testid={`text-wo-number-${wo.id}`}> · #{wo.orderNumber}</span>}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        <span data-testid={`text-wo-date-${wo.id}`}>
                          {isCompleted && wo.completedAt
                            ? `Completed ${formatDate(wo.completedAt)}`
                            : wo.scheduledStart
                              ? `Scheduled ${formatDate(wo.scheduledStart)} ${formatTime(wo.scheduledStart)}`
                              : "Not scheduled"
                          }
                        </span>
                      </p>
                      {wo.summary && (
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600" data-testid={`text-wo-summary-${wo.id}`}>
                          {wo.summary}
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusDot pill={status.className} data-testid={`badge-wo-status-${wo.id}`}>
                    {status.label}
                  </StatusDot>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PortalLayout>
  );
}
