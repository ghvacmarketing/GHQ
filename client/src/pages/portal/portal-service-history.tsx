import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Wrench, Calendar, CheckCircle } from "lucide-react";
import { PortalLayout } from "./portal-layout";

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
  en_route: { label: "En Route", className: "bg-purple-100 text-purple-700 border-purple-200" },
  on_site: { label: "On Site", className: "bg-orange-100 text-orange-700 border-orange-200" },
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
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/portal/dashboard">
            <Button variant="ghost" size="sm" className="text-slate-600" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900" data-testid="text-page-title">
            Service History
          </h1>
          <p className="text-slate-500 mt-1">View your past and upcoming service visits</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : workOrders.length === 0 ? (
          <Card className="shadow-sm" data-testid="status-no-history">
            <CardContent className="py-12 text-center">
              <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No service history found</p>
              <p className="text-sm text-slate-400 mt-2">Your completed service visits will appear here</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {workOrders.map((wo) => {
              const status = statusConfig[wo.status] || statusConfig.scheduled;
              const isCompleted = wo.status === "completed";
              return (
                <Card key={wo.id} className="shadow-sm hover:shadow-md transition-shadow" data-testid={`card-work-order-${wo.id}`}>
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${isCompleted ? "bg-green-100" : "bg-blue-100"}`}>
                          {isCompleted ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <Wrench className="h-5 w-5 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900" data-testid={`text-wo-title-${wo.id}`}>
                            {wo.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-500">
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-wo-type-${wo.id}`}>
                              {visitTypeLabels[wo.visitType] || wo.visitType}
                            </Badge>
                            {wo.orderNumber && (
                              <span data-testid={`text-wo-number-${wo.id}`}>#{wo.orderNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-2 text-sm text-slate-500">
                            <Calendar className="h-3 w-3" />
                            <span data-testid={`text-wo-date-${wo.id}`}>
                              {isCompleted && wo.completedAt 
                                ? `Completed ${formatDate(wo.completedAt)}`
                                : wo.scheduledStart 
                                  ? `Scheduled ${formatDate(wo.scheduledStart)} ${formatTime(wo.scheduledStart)}`
                                  : "Not scheduled"
                              }
                            </span>
                          </div>
                          {wo.summary && (
                            <p className="mt-2 text-sm text-slate-600 line-clamp-2" data-testid={`text-wo-summary-${wo.id}`}>
                              {wo.summary}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={status.className} data-testid={`badge-wo-status-${wo.id}`}>
                        {status.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
