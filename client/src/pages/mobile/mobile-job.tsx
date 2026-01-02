import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useMemo } from "react";
import MobileShell from "./mobile-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, MapPin, Phone, Clock, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import type { CrmWorkOrder, CrmCustomer, CrmUser } from "@shared/schema";

interface DispatchWorkOrder extends CrmWorkOrder {
  customer: CrmCustomer | null;
  tech: CrmUser | null;
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
        return start >= today && start < tomorrow && wo.status !== "completed";
      })
      .sort((a, b) => {
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700",
      dispatched: "bg-amber-100 text-amber-700",
      en_route: "bg-purple-100 text-purple-700",
      on_site: "bg-green-100 text-green-700",
      completed: "bg-slate-100 text-slate-600",
    };
    const labels: Record<string, string> = {
      scheduled: "Scheduled",
      dispatched: "Dispatched",
      en_route: "En Route",
      on_site: "On Site",
      completed: "Completed",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || "bg-slate-100 text-slate-600"}`}>
        {labels[status] || status}
      </span>
    );
  };

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
              <p className="text-slate-600 font-medium">No active jobs</p>
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
            {todaysJobs.map((job) => (
              <Card 
                key={job.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/mobile/job/${job.id}`)}
                data-testid={`job-card-${job.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(job.status)}
                        {job.priority === "urgent" && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            Urgent
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-slate-800 truncate">
                        {job.title || job.visitType || "Work Order"}
                      </h3>
                      <p className="text-sm text-slate-600 truncate">
                        {job.customer?.name || "Unknown Customer"}
                      </p>
                      {job.scheduledStart && (
                        <div className="flex items-center gap-1 mt-2 text-sm text-slate-500">
                          <Clock className="h-4 w-4" />
                          {format(new Date(job.scheduledStart), "h:mm a")}
                          {job.scheduledEnd && ` - ${format(new Date(job.scheduledEnd), "h:mm a")}`}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
