import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useMemo } from "react";
import MobileShell from "./mobile-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, MapPin, Clock, ChevronRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import type { CrmWorkOrder, CrmCustomer, CrmUser, CrmProperty } from "@shared/schema";

interface DispatchWorkOrder extends CrmWorkOrder {
  customer: CrmCustomer | null;
  tech: CrmUser | null;
  property?: CrmProperty | null;
}

const statusColors: Record<string, { bg: string; border: string; text: string; stripe: string }> = {
  scheduled: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", stripe: "border-l-blue-500" },
  dispatched: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", stripe: "border-l-purple-500" },
  en_route: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", stripe: "border-l-amber-500" },
  on_site: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", stripe: "border-l-orange-500" },
  completed: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", stripe: "border-l-green-500" },
  cancelled: { bg: "bg-red-50", border: "border-red-200", text: "text-red-500", stripe: "border-l-red-500" },
};

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  cancelled: "Cancelled",
};

const jobTypeColors: Record<string, { bg: string; border: string; text: string }> = {
  SERVICE: { bg: "bg-sky-100", border: "border-sky-200", text: "text-sky-900" },
  MAINTENANCE: { bg: "bg-emerald-100", border: "border-emerald-200", text: "text-emerald-900" },
  INSTALL: { bg: "bg-amber-100", border: "border-amber-200", text: "text-amber-900" },
  SALES: { bg: "bg-rose-100", border: "border-rose-200", text: "text-rose-900" },
};

function getJobTypeColor(jobType: string | null | undefined): { bg: string; border: string; text: string } {
  if (!jobType) return jobTypeColors.SERVICE;
  const upperType = jobType.toUpperCase();
  if (upperType.includes("SERVICE")) return jobTypeColors.SERVICE;
  if (upperType.includes("MAINTENANCE")) return jobTypeColors.MAINTENANCE;
  if (upperType.includes("INSTALL")) return jobTypeColors.INSTALL;
  if (upperType.includes("SALES")) return jobTypeColors.SALES;
  return jobTypeColors.SERVICE;
}

function formatSubtype(subtype: string | null | undefined): string {
  if (!subtype) return "";
  return subtype.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export default function MobileJob() {
  const [, navigate] = useLocation();

  const { data: currentUser, isLoading: userLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: workOrders = [], isLoading: ordersLoading } = useQuery<DispatchWorkOrder[]>({
    queryKey: ["/api/crm/dispatch/work-orders"],
    enabled: !!currentUser,
  });

  const myWorkOrders = useMemo(() => {
    if (!currentUser) return [];
    return workOrders.filter(wo => wo.assignedTechId === currentUser.id);
  }, [workOrders, currentUser]);

  const activeJob = useMemo(() => {
    return myWorkOrders.find(wo => 
      wo.status === "on_site" || wo.status === "en_route" || wo.status === "dispatched"
    );
  }, [myWorkOrders]);

  const todaysJobs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return myWorkOrders
      .filter(wo => {
        if (!wo.scheduledStart) return false;
        const start = new Date(wo.scheduledStart);
        return start >= today && start < tomorrow;
      })
      .sort((a, b) => {
        const statusOrder: Record<string, number> = { on_site: 0, en_route: 1, dispatched: 2, scheduled: 3, completed: 4 };
        const aOrder = statusOrder[a.status] ?? 5;
        const bOrder = statusOrder[b.status] ?? 5;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aStart = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
        const bStart = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
        return aStart - bStart;
      });
  }, [myWorkOrders]);

  useEffect(() => {
    if (activeJob) {
      navigate(`/mobile/job/${activeJob.id}`);
    }
  }, [activeJob, navigate]);

  if (userLoading || ordersLoading) {
    return (
      <MobileShell>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#711419]" />
        </div>
      </MobileShell>
    );
  }

  if (!currentUser) {
    return (
      <MobileShell>
        <div className="p-4 text-center">
          <p className="text-slate-600">Please log in to view your jobs</p>
        </div>
      </MobileShell>
    );
  }

  if (activeJob) {
    return (
      <MobileShell>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#711419]" />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-job-page">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="h-6 w-6 text-[#711419]" />
          <h1 className="text-xl font-semibold text-slate-800">Today's Jobs</h1>
        </div>

        {todaysJobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No jobs scheduled</p>
              <p className="text-sm text-slate-500 mt-1">Check your agenda for upcoming work</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => navigate("/mobile")}
                data-testid="button-view-agenda"
              >
                View Agenda
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {todaysJobs.map((job) => {
              const colors = statusColors[job.status] || statusColors.scheduled;
              const jobTypeStyle = getJobTypeColor(job.visitType);
              const address = job.property?.address1 || "";
              const cityState = [job.property?.city, job.property?.state]
                .filter(Boolean).join(", ");
              
              return (
                <Card 
                  key={job.id} 
                  className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${colors.stripe} ${colors.bg} ${colors.border}`}
                  onClick={() => navigate(`/mobile/job/${job.id}`)}
                  data-testid={`job-card-${job.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-slate-900">
                            {job.customer?.name || "Unknown Customer"}
                          </h3>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
                            {statusLabels[job.status] || job.status}
                          </span>
                        </div>
                        
                        {(address || cityState) && (
                          <div className="flex items-start gap-1.5 text-sm text-slate-600">
                            <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
                            <span className="line-clamp-2">
                              {address}{address && cityState ? ", " : ""}{cityState}
                            </span>
                          </div>
                        )}
                        
                        {job.scheduledStart && (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Clock className="h-4 w-4 text-slate-400" />
                            <span>
                              {format(new Date(job.scheduledStart), "h:mm a")}
                              {job.scheduledEnd && ` - ${format(new Date(job.scheduledEnd), "h:mm a")}`}
                            </span>
                          </div>
                        )}
                        
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {job.visitType && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${jobTypeStyle.bg} ${jobTypeStyle.text} ${jobTypeStyle.border}`}>
                              {job.visitType}
                              {job.workSubtype && ` - ${formatSubtype(job.workSubtype)}`}
                            </span>
                          )}
                          {job.priority === "urgent" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500 text-white border border-red-600">
                              Urgent
                            </span>
                          )}
                          {job.priority === "high" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500 text-white border border-orange-600">
                              High Priority
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
