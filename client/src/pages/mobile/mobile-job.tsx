import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import MobileShell from "./mobile-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Wrench, MapPin, Clock, ChevronRight, CheckCircle2, Circle, Plus, Search, Loader2, AlertTriangle, CalendarIcon } from "lucide-react";
import { format, isToday } from "date-fns";
import { getLocalStartOfDay, getLocalEndOfDay, toLocalTime } from "@/lib/timezone";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CrmWorkOrder, CrmCustomer, CrmUser, CrmProperty } from "@shared/schema";

interface WorkOrderWithDetails extends CrmWorkOrder {
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
  const { toast } = useToast();
  const today = new Date();
  const todayStart = getLocalStartOfDay(today).toISOString();
  const todayEnd = getLocalEndOfDay(today).toISOString();
  
  // For supervisor future jobs view - show next 30 days
  const futureEnd = new Date();
  futureEnd.setDate(futureEnd.getDate() + 30);
  const futureEndStr = getLocalEndOfDay(futureEnd).toISOString();

  // Create Work Order Dialog State
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<CrmProperty | null>(null);
  const [woTitle, setWoTitle] = useState("");
  const [woDescription, setWoDescription] = useState("");
  const [visitType, setVisitType] = useState<string>("SERVICE");
  const [workSubtype, setWorkSubtype] = useState<string>("");
  const [priority, setPriority] = useState<string>("normal");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string>("");
  const [selectedEndTime, setSelectedEndTime] = useState<string>("");
  const [conflictError, setConflictError] = useState<string | null>(null);

  const { data: currentUser, isLoading: userLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const isSupervisor = currentUser?.role === 'supervisor';

  // Supervisors see future jobs (next 30 days), others see today only
  const queryDateEnd = isSupervisor ? futureEndStr : todayEnd;
  
  const { data: workOrders = [], isLoading: ordersLoading } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders", { dateFrom: todayStart, dateTo: queryDateEnd, techId: (currentUser?.role === 'tech' || currentUser?.role === 'sales' || currentUser?.role === 'supervisor') ? currentUser?.id : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: todayStart,
        dateTo: queryDateEnd,
      });
      // Tech, sales, and supervisor roles only see their own jobs on the Jobs tab
      if ((currentUser?.role === 'tech' || currentUser?.role === 'sales' || currentUser?.role === 'supervisor') && currentUser?.id) {
        params.set('techId', currentUser.id);
      }
      const res = await fetch(`/api/crm/work-orders?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work orders");
      const data = await res.json();
      return data.workOrders || [];
    },
    enabled: !!currentUser,
  });

  // Search customers for work order creation
  const { data: searchedCustomers = [] } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", { search: customerSearch }],
    queryFn: async () => {
      if (!customerSearch.trim()) return [];
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(customerSearch)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.customers || [];
    },
    enabled: customerSearch.length >= 2,
    staleTime: 30 * 1000,
  });

  // Fetch properties for selected customer
  const { data: customerProperties = [] } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", { customerId: selectedCustomer?.id }],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const res = await fetch(`/api/crm/properties?customerId=${selectedCustomer.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCustomer?.id,
  });

  // Generate time options for dropdowns (8:00 AM to 8:00 PM in 30-minute increments)
  const startTimeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 8; hour <= 19; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const h24 = hour.toString().padStart(2, '0');
        const m = min.toString().padStart(2, '0');
        const value = `${h24}:${m}`;
        const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const label = `${h12}:${m.padStart(2, '0')} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  }, []);

  const endTimeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let min = 0; min < 60; min += 30) {
        if (hour === 8 && min === 0) continue; // Start at 8:30 AM for end time
        if (hour === 20 && min === 30) continue; // Stop at 8:00 PM
        const h24 = hour.toString().padStart(2, '0');
        const m = min.toString().padStart(2, '0');
        const value = `${h24}:${m}`;
        const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const label = `${h12}:${m.padStart(2, '0')} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  }, []);

  const filteredEndTimeOptions = useMemo(() => {
    if (!selectedStartTime) return endTimeOptions;
    return endTimeOptions.filter(opt => opt.value > selectedStartTime);
  }, [endTimeOptions, selectedStartTime]);

  // Update selectedSlot when date and times are selected, and clear any conflict error
  useEffect(() => {
    // Clear conflict error when user changes time selection
    setConflictError(null);
    
    if (selectedDate && selectedStartTime && selectedEndTime) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const startISO = new Date(`${dateStr}T${selectedStartTime}:00`).toISOString();
      const endISO = new Date(`${dateStr}T${selectedEndTime}:00`).toISOString();
      setSelectedSlot({ start: startISO, end: endISO });
    } else {
      setSelectedSlot(null);
    }
  }, [selectedDate, selectedStartTime, selectedEndTime]);

  // Work subtypes based on visit type
  const workSubtypes: Record<string, string[]> = {
    SERVICE: ["NO_AC", "NO_HEAT", "WATER_LEAK", "ELECTRICAL", "THERMOSTAT", "NOISE", "ODOR", "MAINTENANCE", "OTHER"],
    INSTALL: ["NEW_SYSTEM", "REPLACEMENT", "UPGRADE", "DUCTWORK", "OTHER"],
    MAINTENANCE: ["PM_VISIT", "FILTER_CHANGE", "INSPECTION", "CLEANING", "OTHER"],
    SALES: ["ESTIMATE", "CONSULTATION", "FOLLOW_UP", "OTHER"],
  };

  // Create work order mutation
  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer || !selectedProperty || !currentUser) {
        throw new Error("Missing required fields");
      }
      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId: selectedCustomer.id,
        propertyId: selectedProperty.id,
        title: woTitle.trim(),
        description: woDescription.trim(),
        visitType,
        workSubtype: workSubtype || null,
        priority,
        assignedTechId: currentUser.id, // Self-assign
        scheduledStart: selectedSlot?.start || null,
        scheduledEnd: selectedSlot?.end || null,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: (data: { id?: string }) => {
      setShowCreateDialog(false);
      resetCreateForm();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({ title: "Work order created", description: "The job has been scheduled to you" });
      if (data?.id) {
        navigate(`/mobile/job/${data.id}`);
      }
    },
    onError: (error: any) => {
      // Check for scheduling conflict from backend 409 response
      const isConflict = 
        error?.data?.error === "SCHEDULING_CONFLICT" ||
        error?.message?.includes("SCHEDULING_CONFLICT") ||
        error?.message?.includes("Scheduling conflict") ||
        error?.status === 409;
      
      if (isConflict) {
        setConflictError("You already have a job scheduled at this time. Please choose a different time slot.");
      } else {
        toast({ 
          title: "Failed to create work order", 
          description: error?.data?.message || error?.message || "Please try again",
          variant: "destructive" 
        });
      }
    },
  });

  const resetCreateForm = () => {
    setCustomerSearch("");
    setSelectedCustomer(null);
    setSelectedProperty(null);
    setWoTitle("");
    setWoDescription("");
    setVisitType("SERVICE");
    setWorkSubtype("");
    setPriority("normal");
    setSelectedDate(undefined);
    setSelectedSlot(null);
    setSelectedStartTime("");
    setSelectedEndTime("");
    setConflictError(null);
  };

  // Auto-select property if customer only has one
  useEffect(() => {
    if (customerProperties.length === 1 && !selectedProperty) {
      setSelectedProperty(customerProperties[0]);
    }
  }, [customerProperties, selectedProperty]);

  const handleCreateSubmit = () => {
    if (!selectedCustomer || !selectedProperty || !woTitle.trim() || !woDescription.trim()) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (!selectedSlot) {
      toast({ title: "Please select a date and time slot", variant: "destructive" });
      return;
    }
    setConflictError(null);
    createWorkOrderMutation.mutate();
  };

  const activeJob = useMemo(() => {
    return workOrders.find(wo => 
      wo.status === "on_site" || wo.status === "en_route" || wo.status === "dispatched"
    );
  }, [workOrders]);

  // For supervisors: show all jobs (today + future), for others: only today
  const displayedJobs = useMemo(() => {
    return workOrders
      .filter(wo => {
        if (!wo.scheduledStart) return false;
        // For non-supervisors, filter to today only
        if (!isSupervisor) {
          const localStart = toLocalTime(wo.scheduledStart);
          return isToday(localStart);
        }
        return true; // Supervisors see all fetched jobs (today + next 30 days)
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
  }, [workOrders, isSupervisor]);

  // Group jobs by date for supervisors
  const groupedJobsByDate = useMemo(() => {
    if (!isSupervisor) return null;
    
    const groups: { dateKey: string; dateLabel: string; jobs: WorkOrderWithDetails[] }[] = [];
    const dateMap = new Map<string, WorkOrderWithDetails[]>();
    
    // Group jobs by date
    displayedJobs.forEach(job => {
      if (!job.scheduledStart) return;
      const localDate = toLocalTime(job.scheduledStart);
      const dateKey = format(localDate, "yyyy-MM-dd");
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(job);
    });
    
    // Sort each date group by time and convert to array
    const sortedDateKeys = Array.from(dateMap.keys()).sort();
    
    sortedDateKeys.forEach(dateKey => {
      const jobs = dateMap.get(dateKey)!;
      // Sort jobs within each date by scheduled start time
      jobs.sort((a, b) => {
        const aStart = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
        const bStart = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
        return aStart - bStart;
      });
      
      // Create readable date label
      const date = new Date(dateKey + "T12:00:00");
      const isTodayDate = isToday(date);
      const dateLabel = isTodayDate 
        ? `Today • ${format(date, "EEE, MMM d")}`
        : format(date, "EEE • MMM d");
      
      groups.push({ dateKey, dateLabel, jobs });
    });
    
    return groups;
  }, [displayedJobs, isSupervisor]);

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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-[#711419]" />
            <h1 className="text-xl font-semibold text-slate-800">
              {isSupervisor ? "My Jobs" : "Today's Jobs"}
            </h1>
          </div>
          {isSupervisor && (
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="bg-[#711419] hover:bg-[#5a1014]"
              data-testid="button-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Job
            </Button>
          )}
        </div>

        {displayedJobs.length === 0 ? (
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
        ) : isSupervisor && groupedJobsByDate ? (
          <div className="space-y-4">
            {groupedJobsByDate.map((group) => (
              <div key={group.dateKey} data-testid={`date-group-${group.dateKey}`}>
                <div className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-3 py-2 -mx-4 mb-3">
                  <h2 className="font-semibold text-sm text-slate-700 uppercase tracking-wide">
                    {group.dateLabel}
                  </h2>
                </div>
                <div className="space-y-3">
                  {group.jobs.map((job) => {
                    const colors = statusColors[job.status] || statusColors.scheduled;
                    const jobTypeStyle = getJobTypeColor(job.visitType);
                    const address = job.property?.address1 || "";
                    const cityState = [job.property?.city, job.property?.state]
                      .filter(Boolean).join(", ");
                    const isCompleted = job.status === "completed";
                    
                    return (
                      <Card 
                        key={job.id} 
                        className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${colors.stripe} ${colors.bg} ${colors.border} ${isCompleted ? "opacity-75" : ""}`}
                        onClick={() => navigate(`/mobile/job/${job.id}`)}
                        data-testid={`job-card-${job.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {isCompleted ? (
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                              ) : (
                                <Circle className="h-6 w-6 text-slate-300" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className={`font-semibold ${isCompleted ? "text-slate-500 line-through" : "text-slate-900"}`}>
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
                                    {format(toLocalTime(job.scheduledStart), "h:mm a")}
                                    {job.scheduledEnd && ` - ${format(toLocalTime(job.scheduledEnd), "h:mm a")}`}
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
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedJobs.map((job) => {
              const colors = statusColors[job.status] || statusColors.scheduled;
              const jobTypeStyle = getJobTypeColor(job.visitType);
              const address = job.property?.address1 || "";
              const cityState = [job.property?.city, job.property?.state]
                .filter(Boolean).join(", ");
              
              const isCompleted = job.status === "completed";
              
              return (
                <Card 
                  key={job.id} 
                  className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${colors.stripe} ${colors.bg} ${colors.border} ${isCompleted ? "opacity-75" : ""}`}
                  onClick={() => navigate(`/mobile/job/${job.id}`)}
                  data-testid={`job-card-${job.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {isCompleted ? (
                          <CheckCircle2 className="h-6 w-6 text-green-600" />
                        ) : (
                          <Circle className="h-6 w-6 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className={`font-semibold ${isCompleted ? "text-slate-500 line-through" : "text-slate-900"}`}>
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
                              {format(toLocalTime(job.scheduledStart), "h:mm a")}
                              {job.scheduledEnd && ` - ${format(toLocalTime(job.scheduledEnd), "h:mm a")}`}
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

      {/* Create Work Order Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { 
        setShowCreateDialog(open); 
        if (!open) resetCreateForm(); 
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Job</DialogTitle>
            <DialogDescription>
              Create a work order and schedule it for yourself
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Customer Search */}
            <div className="space-y-2">
              <Label>Customer *</Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-800">{selectedCustomer.name}</p>
                    {selectedCustomer.phone && (
                      <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setSelectedProperty(null);
                      setCustomerSearch("");
                    }}
                    data-testid="button-change-customer"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search customers..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-customer-search"
                    />
                  </div>
                  {searchedCustomers.length > 0 && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {searchedCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerSearch("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-100 border-b last:border-b-0"
                          data-testid={`customer-option-${customer.id}`}
                        >
                          <p className="font-medium text-sm">{customer.name}</p>
                          {customer.phone && (
                            <p className="text-xs text-slate-500">{customer.phone}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Property Selection */}
            {selectedCustomer && (
              <div className="space-y-2">
                <Label>Property *</Label>
                {customerProperties.length === 0 ? (
                  <p className="text-sm text-slate-500">No properties found for this customer</p>
                ) : customerProperties.length === 1 ? (
                  <div className="p-3 bg-slate-50 border rounded-lg">
                    <p className="font-medium text-sm">{customerProperties[0].address1}</p>
                    <p className="text-xs text-slate-500">
                      {[customerProperties[0].city, customerProperties[0].state, customerProperties[0].zip].filter(Boolean).join(", ")}
                    </p>
                  </div>
                ) : (
                  <Select
                    value={selectedProperty?.id || ""}
                    onValueChange={(val) => {
                      const prop = customerProperties.find(p => p.id === val);
                      setSelectedProperty(prop || null);
                    }}
                  >
                    <SelectTrigger data-testid="select-property">
                      <SelectValue placeholder="Select a property" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerProperties.map((prop) => (
                        <SelectItem key={prop.id} value={prop.id}>
                          {prop.address1} - {prop.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="Brief job title..."
                value={woTitle}
                onChange={(e) => setWoTitle(e.target.value)}
                data-testid="input-wo-title"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="What needs to be done..."
                value={woDescription}
                onChange={(e) => setWoDescription(e.target.value)}
                rows={3}
                data-testid="input-wo-description"
              />
            </div>

            {/* Visit Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={visitType} onValueChange={(val) => { setVisitType(val); setWorkSubtype(""); }}>
                  <SelectTrigger data-testid="select-visit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SERVICE">Service</SelectItem>
                    <SelectItem value="INSTALL">Install</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                    <SelectItem value="SALES">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subtype</Label>
                <Select value={workSubtype} onValueChange={setWorkSubtype}>
                  <SelectTrigger data-testid="select-work-subtype">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {workSubtypes[visitType]?.map((st) => (
                      <SelectItem key={st} value={st}>
                        {formatSubtype(st)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Schedule - Date Picker and Time Slots */}
            <div className="space-y-3">
              <Label>Schedule *</Label>
              
              {/* Date Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="button-date-picker"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setSelectedStartTime("");
                      setSelectedEndTime("");
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Time Selection Dropdowns */}
              {selectedDate && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Start Time</Label>
                      <Select 
                        value={selectedStartTime} 
                        onValueChange={(val) => {
                          setSelectedStartTime(val);
                          if (selectedEndTime && val >= selectedEndTime) {
                            setSelectedEndTime("");
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-start-time">
                          <SelectValue placeholder="Select start" />
                        </SelectTrigger>
                        <SelectContent>
                          {startTimeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">End Time</Label>
                      <Select 
                        value={selectedEndTime} 
                        onValueChange={setSelectedEndTime}
                        disabled={!selectedStartTime}
                      >
                        <SelectTrigger data-testid="select-end-time">
                          <SelectValue placeholder="Select end" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredEndTimeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected Time Display */}
              {selectedSlot && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>
                    {format(new Date(selectedSlot.start), "h:mm a")} - {format(new Date(selectedSlot.end), "h:mm a")}
                  </span>
                </div>
              )}
            </div>

            {/* Conflict Error */}
            {conflictError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{conflictError}</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createWorkOrderMutation.isPending || !selectedCustomer || !selectedProperty || !woTitle.trim() || !woDescription.trim() || !selectedSlot}
              className="bg-[#711419] hover:bg-[#5a1014]"
              data-testid="button-submit-create"
            >
              {createWorkOrderMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Creating...
                </>
              ) : (
                "Create & Schedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileShell>
  );
}
