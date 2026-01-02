import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, isToday, startOfDay, endOfDay } from "date-fns";
import { MapPin, Clock, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MobileShell from "./mobile-shell";
import type { CrmWorkOrder, CrmCustomer, CrmProperty } from "@shared/schema";

interface WorkOrderWithDetails extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-700 border-slate-300" },
  dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700 border-blue-300" },
  en_route: { label: "En Route", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  on_site: { label: "On Site", className: "bg-green-100 text-green-700 border-green-300" },
  completed: { label: "Completed", className: "bg-slate-200 text-slate-600 border-slate-400" },
};

function formatScheduledTime(start: string | Date | null, end: string | Date | null): string {
  if (!start) return "Not scheduled";
  const startDate = new Date(start);
  const startTime = format(startDate, "h:mm a");
  if (!end) return startTime;
  const endDate = new Date(end);
  const endTime = format(endDate, "h:mm a");
  return `${startTime} - ${endTime}`;
}

function getPropertyAddress(property: CrmProperty | null): string {
  if (!property) return "No address";
  const parts = [property.address1, property.city, property.state].filter(Boolean);
  return parts.join(", ") || "No address";
}

export default function MobileAgenda() {
  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();

  const { data: workOrders, isLoading } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders", { start: todayStart, end: todayEnd }],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: todayStart,
        end: todayEnd,
      });
      const res = await fetch(`/api/crm/work-orders?${params}`);
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return res.json();
    },
  });

  const todaysOrders = workOrders?.filter((wo) => {
    if (!wo.scheduledStart) return false;
    return isToday(new Date(wo.scheduledStart));
  }) ?? [];

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-agenda">
        <div className="text-center mb-6" data-testid="agenda-date-header">
          <h2 className="text-2xl font-bold text-slate-800">
            {format(today, "EEEE")}
          </h2>
          <p className="text-slate-500">
            {format(today, "MMMM d, yyyy")}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3" data-testid="agenda-loading">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : todaysOrders.length === 0 ? (
          <div 
            className="flex flex-col items-center justify-center py-16 text-center"
            data-testid="agenda-empty"
          >
            <ClipboardList className="h-16 w-16 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-1">No Jobs Today</h3>
            <p className="text-slate-400 text-sm">You have no work orders scheduled for today.</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="agenda-list">
            {todaysOrders.map((workOrder) => {
              const status = statusConfig[workOrder.status] || statusConfig.scheduled;
              const customerName = workOrder.customer?.name || "Unknown Customer";
              const address = getPropertyAddress(workOrder.property);

              return (
                <Link
                  key={workOrder.id}
                  href={`/mobile/job/${workOrder.id}`}
                  data-testid={`work-order-card-${workOrder.id}`}
                >
                  <Card className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 
                          className="font-semibold text-slate-800 truncate flex-1 mr-2"
                          data-testid={`customer-name-${workOrder.id}`}
                        >
                          {customerName}
                        </h3>
                        <Badge 
                          variant="outline" 
                          className={`shrink-0 ${status.className}`}
                          data-testid={`status-badge-${workOrder.id}`}
                        >
                          {status.label}
                        </Badge>
                      </div>

                      <div className="flex items-center text-sm text-slate-500 mb-1.5">
                        <MapPin className="h-4 w-4 mr-1.5 text-slate-400 shrink-0" />
                        <span className="truncate" data-testid={`address-${workOrder.id}`}>
                          {address}
                        </span>
                      </div>

                      <div className="flex items-center text-sm text-slate-500 mb-1.5">
                        <Clock className="h-4 w-4 mr-1.5 text-slate-400 shrink-0" />
                        <span data-testid={`time-${workOrder.id}`}>
                          {formatScheduledTime(workOrder.scheduledStart, workOrder.scheduledEnd)}
                        </span>
                      </div>

                      {workOrder.workSubtype && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {workOrder.visitType} - {workOrder.workSubtype}
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
