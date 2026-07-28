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
import { Wrench, MapPin, Clock, ChevronRight, CheckCircle2, Circle, Plus, Search, Loader2, AlertTriangle, CalendarIcon, HardHat } from "lucide-react";
import { format, isToday } from "date-fns";
import { getLocalStartOfDay, getLocalEndOfDay, toLocalTime } from "@/lib/timezone";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WheelTimePicker } from "@/components/mobile/wheel-time-picker";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
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
  en_route: "Traveling",
  on_site: "Working",
  completed: "Completed",
  cancelled: "Cancelled",
};

const jobTypeColors: Record<string, { bg: string; border: string; text: string }> = {
  SERVICE: { bg: "bg-sky-100", border: "border-sky-200", text: "text-sky-900" },
  MAINTENANCE: { bg: "bg-emerald-100", border: "border-emerald-200", text: "text-emerald-900" },
  INSTALL: { bg: "bg-blue-100", border: "border-blue-200", text: "text-blue-900" },
  SALES: { bg: "bg-indigo-100", border: "border-indigo-200", text: "text-indigo-900" },
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

// Timeline-style job card (reference-screenshot driven): time gutter on the
// left, flat card with an uppercase category row, bold job title, and a muted
// customer · address line. The next actionable job gets a maroon accent
// outline + "Up next". showDate swaps the right slot to the calendar date for
// multi-day lists.
function JobCard({
  job, onOpen, showDate = false, highlight = false,
}: { job: WorkOrderWithDetails; onOpen: () => void; showDate?: boolean; highlight?: boolean }) {
  const isCompleted = job.status === "completed";
  const isCancelled = job.status === "cancelled";
  const start = job.scheduledStart ? toLocalTime(job.scheduledStart) : null;
  const category = job.workSubtype ? formatSubtype(job.workSubtype) : (job.visitType || "Job");
  const address = [job.property?.address1, job.property?.city].filter(Boolean).join(", ");

  const timeStr = start ? format(start, showDate ? "MMM d, h:mm a" : "h:mm a") : null;
  const statusWord = isCompleted
    ? "Closed"
    : isCancelled
      ? "Cancelled"
      : job.status === "on_site"
        ? "Working"
        : job.status === "en_route"
          ? "Traveling"
          : highlight
            ? "Up next"
            : null;
  const rightLabel = statusWord ? (timeStr ? `${statusWord} · ${timeStr}` : statusWord) : (timeStr || "Scheduled");
  const rightAccent = highlight || job.status === "on_site" || job.status === "en_route";

  return (
    <div data-testid={`job-card-${job.id}`}>
      <button
        onClick={onOpen}
        className={`w-full min-w-0 rounded-[4px] border p-4 text-left transition-transform active:scale-[0.99] ${
          highlight ? "border-[#711419] bg-white" : "border-slate-300/70 bg-slate-100/80"
        } ${isCompleted || isCancelled ? "opacity-70" : ""}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{category}</span>
          {job.priority === "high" && !isCompleted && (
            <span className="rounded-[3px] bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              High
            </span>
          )}
          <span
            className={`ml-auto flex shrink-0 items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider ${
              rightAccent ? "text-[#711419]" : "text-slate-400"
            }`}
          >
            {rightLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
        <h3 className={`mt-1.5 line-clamp-2 text-[15px] font-semibold ${isCompleted ? "text-slate-500" : "text-slate-900"}`}>
          {job.title || `${job.visitType ? job.visitType.charAt(0) + job.visitType.slice(1).toLowerCase() : "Service"} visit`}
        </h3>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {job.customer?.name || "Unknown customer"}
          {address && ` · ${address}`}
        </p>
      </button>
    </div>
  );
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

  // Today | Upcoming | History
  const [jobsView, setJobsView] = useState<"today" | "upcoming" | "history">("today");
  const [historySearch, setHistorySearch] = useState("");

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
  const [assignTechId, setAssignTechId] = useState<string>(""); // "" = assign to myself
  const [dateOpen, setDateOpen] = useState(false);
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

  // Supervisor, tech, and sales can all see future jobs
  const canViewFutureJobs = currentUser?.role === 'supervisor' || currentUser?.role === 'tech' || currentUser?.role === 'sales' || currentUser?.role === 'admin' || currentUser?.role === 'owner';

  // Supervisor, tech, and sales see future jobs (next 30 days), others see today only
  const queryDateEnd = canViewFutureJobs ? futureEndStr : todayEnd;
  
  const { data: workOrders = [], isLoading: ordersLoading } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders", { dateFrom: todayStart, dateTo: queryDateEnd, techId: (currentUser?.role === 'tech' || currentUser?.role === 'sales') ? currentUser?.id : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: todayStart,
        dateTo: queryDateEnd,
      });
      // Tech and sales fetch only their own; supervisors/owner fetch everyone
      // (their own list + the tech roster below both come from one query).
      if ((currentUser?.role === 'tech' || currentUser?.role === 'sales') && currentUser?.id) {
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

  // Scheduling increment comes from the shared dispatch-board setting so the
  // mobile picker snaps to the same grid as the board (15 or 30 minutes).
  const { data: dispatchSettings } = useQuery<{ stepMinutes: number }>({
    queryKey: ["/api/crm/dispatch-settings"],
    enabled: !!currentUser,
  });
  const stepMinutes = dispatchSettings?.stepMinutes === 15 ? 15 : 30;

  // Add minutes to an "HH:mm" string, capped at end of day.
  const addMinutesTo = (hhmm: string, minutes: number) => {
    const [h, m] = hhmm.split(":").map(Number);
    const t = Math.min(h * 60 + m + minutes, 23 * 60 + 30);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };

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
        workSubtype: workSubtype || "OTHER", // subtype is required by the schema; default when left blank
        priority,
        assignedTechId: assignTechId || currentUser.id, // default: self-assign
        scheduledStart: selectedSlot?.start || null,
        scheduledEnd: selectedSlot?.end || null,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: (data: { id?: string }) => {
      const assigneeName = assignTechId && assignTechId !== currentUser?.id
        ? boardTechs.find((t) => t.id === assignTechId)?.name
        : null;
      setShowCreateDialog(false);
      resetCreateForm();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({
        title: "Work order created",
        description: assigneeName ? `The job has been scheduled to ${assigneeName}` : "The job has been scheduled to you",
      });
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
      
      // Check for no maintenance agreement error
      const noAgreement = 
        error?.data?.error === "NO_MAINTENANCE_AGREEMENT" ||
        error?.message?.includes("NO_MAINTENANCE_AGREEMENT");
      
      if (isConflict) {
        setConflictError(assignTechId && assignTechId !== currentUser?.id
          ? "That teammate already has a job scheduled at this time. Please choose a different time slot."
          : "You already have a job scheduled at this time. Please choose a different time slot.");
      } else if (noAgreement) {
        toast({ 
          title: "No Maintenance Agreement", 
          description: error?.data?.details || "This property does not have an active maintenance agreement. Please select a different visit type.",
          variant: "destructive" 
        });
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
    setAssignTechId("");
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

  // Collapsible per-tech roster (supervisor and owner)
  const { data: boardTechs = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ["/api/crm/technicians"],
    enabled: !!currentUser && (currentUser.role === 'supervisor' || currentUser.role === 'admin' || currentUser.role === 'owner'),
  });
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);

  const handleCreateSubmit = () => {
    if (!selectedCustomer || !selectedProperty || !woTitle.trim() || !woDescription.trim()) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (!selectedSlot) {
      toast({ title: "Please select a date and time slot", variant: "destructive" });
      return;
    }
    if (selectedEndTime <= selectedStartTime) {
      toast({ title: "End time must be after the start time", variant: "destructive" });
      return;
    }
    setConflictError(null);
    createWorkOrderMutation.mutate();
  };

  // The main list is ALWAYS the signed-in user's own jobs.
  const myJobs = useMemo(
    () => workOrders.filter((wo) => wo.assignedTechId === currentUser?.id),
    [workOrders, currentUser?.id],
  );
  const isSupervisorPlus = currentUser?.role === 'supervisor' || currentUser?.role === 'admin' || currentUser?.role === 'owner';

  // Legacy deep-link: job creation now lives on its own page (/mobile/job/new).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      navigate("/mobile/job/new", { replace: true });
    }
  }, [navigate]);

  // For users who can view future jobs: show all jobs (today + future), for others: only today
  const displayedJobs = useMemo(() => {
    return myJobs
      .filter(wo => {
        if (!wo.scheduledStart) return false;
        // For those who can't view future jobs, filter to today only
        if (!canViewFutureJobs) {
          const localStart = toLocalTime(wo.scheduledStart);
          return isToday(localStart);
        }
        return true; // Users with future view permission see all fetched jobs (today + next 30 days)
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
  }, [myJobs, canViewFutureJobs]);

  // My past jobs — fetched only when the History view opens (last 12 months)
  const historyStart = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return getLocalStartOfDay(d).toISOString();
  }, []);
  const { data: historyOrders = [], isLoading: historyLoading } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders", "history", currentUser?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: historyStart, dateTo: todayStart });
      if (currentUser?.id) params.set("techId", currentUser.id);
      const res = await fetch(`/api/crm/work-orders?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job history");
      const data = await res.json();
      return data.workOrders || [];
    },
    enabled: jobsView === "history" && !!currentUser,
  });

  // History grouped by month (newest first), filtered by the search box
  const historyGroups = useMemo(() => {
    const needle = historySearch.trim().toLowerCase();
    const filtered = historyOrders.filter((j) => {
      if (!needle) return true;
      return [j.customer?.name, j.title, j.workSubtype, j.property?.address1, j.property?.city]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle));
    });
    const map = new Map<string, WorkOrderWithDetails[]>();
    for (const j of filtered) {
      const d = j.scheduledStart ? toLocalTime(j.scheduledStart) : j.createdAt ? new Date(j.createdAt) : null;
      const key = d ? format(d, "yyyy-MM") : "0000-00";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, jobs]) => ({
        key,
        label: key === "0000-00" ? "Undated" : format(new Date(`${key}-15T12:00:00`), "MMMM yyyy"),
        jobs: jobs.sort(
          (a, b) =>
            new Date(b.scheduledStart || b.createdAt || 0).getTime() -
            new Date(a.scheduledStart || a.createdAt || 0).getTime(),
        ),
      }));
  }, [historyOrders, historySearch]);

  // Group jobs by date for users who can view future jobs
  const groupedJobsByDate = useMemo(() => {
    if (!canViewFutureJobs) return null;
    
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
  }, [displayedJobs, canViewFutureJobs]);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  // Chronological agenda order (the timeline gutter reads top-to-bottom);
  // the first job still awaiting action gets the "Up next" accent.
  const todayJobs = displayedJobs
    .filter((j) => j.scheduledStart && format(toLocalTime(j.scheduledStart), "yyyy-MM-dd") === todayKey)
    .sort(
      (a, b) => new Date(a.scheduledStart || 0).getTime() - new Date(b.scheduledStart || 0).getTime(),
    );
  const upNextId = todayJobs.find((j) => !["completed", "cancelled"].includes(j.status))?.id;
  const upcomingGroups = (groupedJobsByDate || []).filter((g) => g.dateKey > todayKey);

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

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-job-page">
        {/* Today | Upcoming | History switcher centered, New Job pinned right */}
        <div className="relative flex items-center justify-center">
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(["today", "upcoming", "history"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setJobsView(v)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all ${
                  jobsView === v ? "bg-white text-[#711419] shadow-sm" : "text-slate-500"
                }`}
                data-testid={`jobs-view-${v}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {jobsView === "today" && (
          todayJobs.length === 0 ? (
            <Card className="rounded-[4px] border-slate-300/70 shadow-none">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No jobs scheduled today</p>
                <p className="text-sm text-slate-500 mt-1">Check Upcoming for what's ahead</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {todayJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  highlight={job.id === upNextId}
                  onOpen={() => navigate(`/mobile/job/${job.id}`)}
                />
              ))}
            </div>
          )
        )}

        {jobsView === "upcoming" && (
          upcomingGroups.length === 0 ? (
            <Card className="rounded-[4px] border-slate-300/70 shadow-none">
              <CardContent className="py-8 text-center">
                <CalendarIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">Nothing scheduled ahead</p>
                <p className="text-sm text-slate-500 mt-1">Jobs booked for the next 30 days land here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {upcomingGroups.map((group) => (
                <div key={group.dateKey} data-testid={`date-group-${group.dateKey}`}>
                  <div className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-3 py-2 -mx-4 mb-3">
                    <h2 className="font-semibold text-sm text-slate-700 uppercase tracking-wide">
                      {group.dateLabel}
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {group.jobs.map((job) => (
                      <JobCard key={job.id} job={job} onOpen={() => navigate(`/mobile/job/${job.id}`)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {jobsView === "history" && (
          <div className="space-y-4" data-testid="jobs-history">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search past jobs..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-100 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none"
                data-testid="history-search"
              />
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#711419]" />
              </div>
            ) : historyGroups.length === 0 ? (
              <Card className="rounded-[4px] border-slate-300/70 shadow-none">
                <CardContent className="py-8 text-center">
                  <Clock className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">
                    {historySearch.trim() ? "No past jobs match that search" : "No past jobs yet"}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Your last 12 months of jobs show here</p>
                </CardContent>
              </Card>
            ) : (
              historyGroups.map((group) => (
                <div key={group.key} data-testid={`history-group-${group.key}`}>
                  <div className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-3 py-2 -mx-4 mb-3">
                    <h2 className="font-semibold text-sm text-slate-700 uppercase tracking-wide">{group.label}</h2>
                  </div>
                  <div className="space-y-3">
                    {group.jobs.map((job) => (
                      <JobCard key={job.id} job={job} showDate onOpen={() => navigate(`/mobile/job/${job.id}`)} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* All technicians — supervisor & owner: tap a card to see their day (Today view only) */}
        {jobsView === "today" && isSupervisorPlus && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">All Technicians</h3>
              <span className="text-xs font-medium text-slate-400">
                {boardTechs.filter((t) => t.id !== currentUser?.id).length} techs
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2" data-testid="jobs-tech-roster">
              {boardTechs.filter((t) => t.id !== currentUser?.id).map((tech) => {
                const techJobs = workOrders
                  .filter((wo) => wo.assignedTechId === tech.id && wo.scheduledStart && isToday(toLocalTime(wo.scheduledStart)))
                  .sort((x, y) => new Date(x.scheduledStart!).getTime() - new Date(y.scheduledStart!).getTime());
                const hasJobs = techJobs.length > 0;
                return (
                  <button
                    key={tech.id}
                    onClick={() => { if (hasJobs) setSelectedTechId(tech.id); }}
                    className={`flex flex-col items-center gap-1.5 rounded-[4px] border border-slate-300/70 bg-white px-2 py-4 shadow-none transition-all ${
                      hasJobs ? "active:scale-[0.98]" : "opacity-60"
                    }`}
                    data-testid={`jobs-tech-${tech.id}`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-[3px] border border-[#711419]/20 bg-[#711419]/5 text-[#711419]">
                      <HardHat className="h-5 w-5" />
                    </span>
                    <span className="max-w-full truncate text-sm font-semibold text-slate-800">{tech.name}</span>
                    <span className="text-xs text-slate-400">{techJobs.length} job{techJobs.length !== 1 ? "s" : ""} today</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tech day bottom sheet — opens when tapping a tech that has jobs today */}
      {(() => {
        const tech = boardTechs.find((t) => t.id === selectedTechId);
        const techJobs = selectedTechId
          ? workOrders
              .filter((wo) => wo.assignedTechId === selectedTechId && wo.scheduledStart && isToday(toLocalTime(wo.scheduledStart)))
              .sort((x, y) => new Date(x.scheduledStart!).getTime() - new Date(y.scheduledStart!).getTime())
          : [];
        return (
          <DraggableSheet
            open={!!selectedTechId}
            onOpenChange={(o) => { if (!o) setSelectedTechId(null); }}
            title={tech ? `${tech.name}'s day` : "Tech's day"}
            testid="jobs-tech-sheet"
          >
            <div className="space-y-2 pb-2">
              {techJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => { setSelectedTechId(null); navigate(`/mobile/job/${job.id}`); }}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-3 text-left shadow-sm transition-all active:scale-[0.99]"
                  data-testid={`jobs-roster-job-${job.id}`}
                >
                  <span className="text-xs font-semibold tabular-nums text-slate-500">
                    {job.scheduledStart ? format(toLocalTime(job.scheduledStart), "h:mm a") : "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {job.customer?.name || job.title || "Job"}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </DraggableSheet>
        );
      })()}

      {/* Create Work Order — big bottom sheet */}
      <DraggableSheet
        tall
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) resetCreateForm();
        }}
        title="Create New Job"
        testid="sheet-new-job"
      >
          <h2 className="text-lg font-semibold text-slate-900">New job</h2>
          <p className="mt-0.5 mb-3 text-sm text-slate-500">
            Create a work order and assign it to yourself or a teammate.
          </p>

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
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assign to */}
            <div className="space-y-2">
              <Label>Assign to</Label>
              <Select value={assignTechId || "me"} onValueChange={(val) => setAssignTechId(val === "me" ? "" : val)}>
                <SelectTrigger data-testid="select-assign-tech">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Myself{currentUser?.name ? ` (${currentUser.name})` : ""}</SelectItem>
                  {boardTechs
                    .filter((t) => t.id !== currentUser?.id)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Schedule - Date Picker and Time Slots */}
            <div className="space-y-3">
              <Label>Schedule *</Label>
              
              {/* Date Picker */}
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
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
                      // Wheels always show a value, so seed a default 1-hour window.
                      setSelectedStartTime((t) => t || "09:00");
                      setSelectedEndTime((t) => t || "10:00");
                      if (date) setDateOpen(false); // picking a date closes the calendar
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Time selection — alarm-style wheels snapping to the shared increment */}
              {selectedDate && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Start Time</Label>
                    <WheelTimePicker
                      value={selectedStartTime}
                      stepMinutes={stepMinutes}
                      onChange={(v) => {
                        setSelectedStartTime(v);
                        // Default the end to 1 hour after the start. 60 min is a
                        // clean multiple of both 15- and 30-min boards, so it
                        // always lands on a valid slot.
                        setSelectedEndTime(addMinutesTo(v, 60));
                      }}
                      testId="wheel-start-time"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">End Time</Label>
                    <WheelTimePicker
                      value={selectedEndTime}
                      stepMinutes={stepMinutes}
                      onChange={setSelectedEndTime}
                      testId="wheel-end-time"
                    />
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

          <Button
            onClick={handleCreateSubmit}
            disabled={createWorkOrderMutation.isPending || !selectedCustomer || !selectedProperty || !woTitle.trim() || !woDescription.trim() || !selectedSlot}
            className="mt-3 h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold hover:bg-[#5a1014]"
            data-testid="button-submit-create"
          >
            {createWorkOrderMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-1.5" />
                Creating...
              </>
            ) : (
              "Create & Schedule"
            )}
          </Button>
      </DraggableSheet>
    </MobileShell>
  );
}
