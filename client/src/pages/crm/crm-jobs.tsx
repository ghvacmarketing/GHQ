import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Plus,
  CalendarIcon,
  Loader2,
  MoreVertical,
  Clock,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmJob, CrmCustomer } from "@shared/schema";
import { cn } from "@/lib/utils";

type JobWithDetails = CrmJob & {
  customerName: string;
  assignedTechId: string | null;
  assignedTechName: string | null;
};

type JobsResponse = {
  jobs: JobWithDetails[];
  total: number;
  page: number;
  limit: number;
};

type DispatchResponse = {
  technicians: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
  jobs: any[];
  date: string;
};

type CustomersResponse = {
  customers: CrmCustomer[];
  total: number;
  page: number;
  limit: number;
};

const ITEMS_PER_PAGE = 50;

type FilterTab = "all" | "upcoming" | "past" | "completed" | "incomplete" | "cancelled";

const filterTabConfig: Record<FilterTab, { label: string; status?: string; dateFilter?: string }> = {
  all: { label: "All Jobs" },
  upcoming: { label: "Upcoming", dateFilter: "upcoming" },
  past: { label: "Past", dateFilter: "past" },
  completed: { label: "Complete", status: "completed" },
  incomplete: { label: "Incomplete" },
  cancelled: { label: "Canceled", status: "cancelled" },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  invoiced: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  paid: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  high: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  urgent: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const statusLabels: Record<string, string> = {
  new: "New",
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

const JOB_TYPES = ["SERVICE", "INSTALL", "MAINTENANCE", "ESTIMATE", "WARRANTY"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function CrmJobs() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
  const [jobType, setJobType] = useState<string>("SERVICE");
  const [priority, setPriority] = useState<string>("normal");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedJobForSchedule, setSelectedJobForSchedule] = useState<JobWithDetails | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(new Date());
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDuration, setScheduleDuration] = useState(60);
  const [scheduleTechId, setScheduleTechId] = useState<string>("unassigned");

  const debouncedSearch = useDebounce(searchInput, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeTab]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    
    const tabConfig = filterTabConfig[activeTab];
    
    if (tabConfig.status) {
      params.set("status", tabConfig.status);
    } else if (activeTab === "incomplete") {
      params.set("status", "all");
    }
    
    if (tabConfig.dateFilter) {
      params.set("dateFilter", tabConfig.dateFilter);
    }
    
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, activeTab, page]);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/crm/jobs", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/jobs?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: dispatchData } = useQuery<DispatchResponse>({
    queryKey: ["/api/crm/dispatch"],
    queryFn: async () => {
      const res = await fetch("/api/crm/dispatch", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch technicians");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", debouncedCustomerSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedCustomerSearch) params.set("search", debouncedCustomerSearch);
      params.set("limit", "10");
      const res = await fetch(`/api/crm/customers?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser && createDialogOpen && customerSearchOpen,
  });

  const technicians = dispatchData?.technicians?.filter(t => t.role === "tech") || [];

  const createJobMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      jobType: string;
      priority: string;
      description: string;
      scheduledStart: string;
      scheduledEnd: string;
      assignedTechId: string | null;
    }) => {
      const jobRes = await apiRequest("POST", "/api/crm/jobs", {
        customerId: data.customerId,
        jobType: data.jobType,
        priority: data.priority,
        description: data.description,
        scheduledStart: data.scheduledStart,
        scheduledEnd: data.scheduledEnd,
      });
      const job = await jobRes.json();
      
      let assignmentFailed = false;
      if (data.assignedTechId) {
        try {
          await apiRequest("POST", `/api/crm/jobs/${job.id}/assign`, {
            techUserId: data.assignedTechId,
            startAt: data.scheduledStart,
            endAt: data.scheduledEnd,
          });
        } catch (error) {
          assignmentFailed = true;
        }
      }
      
      return { job, assignmentFailed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      if (result.assignmentFailed) {
        toast({
          title: "Job created",
          description: "The job was created but technician assignment failed. Please assign manually.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Job created",
          description: "The job has been created successfully.",
        });
      }
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create job",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/crm/jobs/${jobId}`, { status });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      toast({
        title: "Status updated",
        description: "Job status has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const assignTechMutation = useMutation({
    mutationFn: async ({ jobId, techId }: { jobId: string; techId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/crm/jobs/${jobId}`, { 
        assignedTechId: techId 
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to assign technician");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      toast({
        title: "Technician assigned",
        description: "Job has been assigned successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign technician",
        variant: "destructive",
      });
    },
  });

  const scheduleJobMutation = useMutation({
    mutationFn: async (data: {
      jobId: string;
      scheduledStart: string;
      scheduledEnd: string;
      assignedTechId: string | null;
    }) => {
      const res = await apiRequest("PATCH", `/api/crm/jobs/${data.jobId}`, {
        scheduledStart: data.scheduledStart,
        scheduledEnd: data.scheduledEnd,
        assignedTechId: data.assignedTechId,
        status: "scheduled",
      });
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 409) {
          throw new Error("This technician already has a job scheduled during this time. Please choose a different time or technician.");
        }
        throw new Error(errorData.message || "Failed to schedule job");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      toast({
        title: "Job scheduled",
        description: "The job has been scheduled successfully.",
      });
      handleCloseScheduleDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Scheduling conflict",
        description: error.message || "Failed to schedule job",
        variant: "destructive",
      });
    },
  });

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setCustomerSearch("");
    setSelectedCustomer(null);
    setJobType("SERVICE");
    setPriority("normal");
    setAssignedTechId("unassigned");
    setStartDate(new Date());
    setStartTime("09:00");
    setDuration(60);
    setDescription("");
    setCustomerSearchOpen(false);
  };

  const handleOpenScheduleDialog = (job: JobWithDetails) => {
    setSelectedJobForSchedule(job);
    if (job.scheduledStart) {
      const start = new Date(job.scheduledStart);
      setScheduleDate(start);
      setScheduleTime(format(start, "HH:mm"));
    } else {
      setScheduleDate(new Date());
      setScheduleTime("09:00");
    }
    if (job.scheduledStart && job.scheduledEnd) {
      const start = new Date(job.scheduledStart);
      const end = new Date(job.scheduledEnd);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
      setScheduleDuration(durationMinutes > 0 ? durationMinutes : 60);
    } else {
      setScheduleDuration(60);
    }
    setScheduleTechId(job.assignedTechId || "unassigned");
    setScheduleDialogOpen(true);
  };

  const handleCloseScheduleDialog = () => {
    setScheduleDialogOpen(false);
    setSelectedJobForSchedule(null);
    setScheduleDate(new Date());
    setScheduleTime("09:00");
    setScheduleDuration(60);
    setScheduleTechId("unassigned");
  };

  const handleScheduleSubmit = () => {
    if (!selectedJobForSchedule || !scheduleDate) return;

    const [hours, minutes] = scheduleTime.split(":").map(Number);
    const scheduledStart = new Date(scheduleDate);
    scheduledStart.setHours(hours, minutes, 0, 0);
    
    const scheduledEnd = new Date(scheduledStart);
    scheduledEnd.setMinutes(scheduledEnd.getMinutes() + scheduleDuration);

    scheduleJobMutation.mutate({
      jobId: selectedJobForSchedule.id,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
      assignedTechId: scheduleTechId === "unassigned" ? null : scheduleTechId,
    });
  };

  const descriptionError = description.trim() === "" ? "Description is required" : null;
  const durationError = duration < 15 ? "Duration must be at least 15 minutes" : null;
  const customerError = !selectedCustomer ? "Customer is required" : null;
  const dateError = !startDate ? "Start date is required" : null;
  
  const isFormValid = selectedCustomer && startDate && description.trim() !== "" && duration >= 15;

  const handleSubmit = () => {
    if (!selectedCustomer) {
      toast({
        title: "Error",
        description: "Please select a customer",
        variant: "destructive",
      });
      return;
    }

    if (!startDate) {
      toast({
        title: "Error",
        description: "Please select a start date",
        variant: "destructive",
      });
      return;
    }

    if (description.trim() === "") {
      toast({
        title: "Error",
        description: "Please enter a description",
        variant: "destructive",
      });
      return;
    }

    if (duration < 15) {
      toast({
        title: "Error",
        description: "Duration must be at least 15 minutes",
        variant: "destructive",
      });
      return;
    }

    const [hours, minutes] = startTime.split(":").map(Number);
    const scheduledStart = new Date(startDate);
    scheduledStart.setHours(hours, minutes, 0, 0);
    
    const scheduledEnd = new Date(scheduledStart);
    scheduledEnd.setMinutes(scheduledEnd.getMinutes() + duration);

    createJobMutation.mutate({
      customerId: selectedCustomer.id,
      jobType,
      priority,
      description: description.trim(),
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
      assignedTechId: assignedTechId === "unassigned" ? null : assignedTechId,
    });
  };

  const jobs = useMemo(() => {
    let result = jobsData?.jobs || [];
    if (activeTab === "incomplete") {
      result = result.filter(job => !["completed", "invoiced", "paid", "cancelled"].includes(job.status));
    }
    return result;
  }, [jobsData?.jobs, activeTab]);

  const total = activeTab === "incomplete" ? jobs.length : (jobsData?.total || 0);
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const formatDateDisplay = (dateStr: string | Date | null) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "MMM d, yyyy h:mm a");
    } catch {
      return "—";
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-jobs-title">
              Jobs
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              <span className="font-medium text-slate-700" data-testid="text-jobs-count">
                Total: {total.toLocaleString()}
              </span>
            </p>
          </div>
          <Button
            variant="default"
            className="gap-2"
            data-testid="button-create-job"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create Job
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
          <TabsList className="grid w-full grid-cols-6" data-testid="tabs-job-filter">
            {Object.entries(filterTabConfig).map(([key, config]) => (
              <TabsTrigger key={key} value={key} data-testid={`tab-${key}`}>
                {config.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by customer name or job type..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                data-testid="input-search-jobs"
              />
            </div>

            {jobsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Briefcase className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="font-medium" data-testid="text-no-jobs">No jobs found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Date</TableHead>
                        <TableHead>Job Type</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Assigned Tech</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead className="w-[50px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => {
                        const statusStyle = statusColors[job.status] || statusColors.new;
                        const priorityStyle = priorityColors[job.priority || "normal"] || priorityColors.normal;
                        
                        return (
                          <TableRow
                            key={job.id}
                            className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => navigate(`/crm/jobs/${job.id}`)}
                            data-testid={`row-job-${job.id}`}
                          >
                            <TableCell className="font-medium" data-testid={`text-job-date-${job.id}`}>
                              {formatDateDisplay(job.scheduledStart)}
                            </TableCell>
                            <TableCell data-testid={`text-job-type-${job.id}`}>
                              {job.jobType || "—"}
                            </TableCell>
                            <TableCell data-testid={`text-job-customer-${job.id}`}>
                              {job.customerName}
                            </TableCell>
                            <TableCell data-testid={`text-job-tech-${job.id}`}>
                              {job.assignedTechName || "Unassigned"}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                                data-testid={`badge-job-status-${job.id}`}
                              >
                                {statusLabels[job.status] || job.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border} capitalize`}
                                data-testid={`badge-job-priority-${job.id}`}
                              >
                                {job.priority || "normal"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={`button-job-actions-${job.id}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleOpenScheduleDialog(job)}
                                    data-testid={`action-schedule-${job.id}`}
                                  >
                                    <Clock className="mr-2 h-4 w-4" />
                                    Schedule
                                  </DropdownMenuItem>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger data-testid={`action-assign-tech-${job.id}`}>
                                      <UserCheck className="mr-2 h-4 w-4" />
                                      Assign Tech
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem
                                        onClick={() => assignTechMutation.mutate({ jobId: job.id, techId: null })}
                                        data-testid={`assign-tech-unassigned-${job.id}`}
                                      >
                                        Unassigned
                                      </DropdownMenuItem>
                                      {technicians.map((tech) => (
                                        <DropdownMenuItem
                                          key={tech.id}
                                          onClick={() => assignTechMutation.mutate({ jobId: job.id, techId: tech.id })}
                                          data-testid={`assign-tech-${tech.id}-${job.id}`}
                                        >
                                          {tech.name}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger data-testid={`action-change-status-${job.id}`}>
                                      Change Status
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {["new", "scheduled", "dispatched", "en_route", "on_site", "completed", "cancelled"].map((status) => (
                                        <DropdownMenuItem
                                          key={status}
                                          onClick={() => updateStatusMutation.mutate({ jobId: job.id, status })}
                                          disabled={job.status === status}
                                          data-testid={`status-${status}-${job.id}`}
                                        >
                                          <Badge 
                                            variant="outline" 
                                            className={`${statusColors[status]?.bg} ${statusColors[status]?.text} ${statusColors[status]?.border} mr-2`}
                                          >
                                            {statusLabels[status]}
                                          </Badge>
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/crm/jobs/${job.id}`);
                                    }}
                                    data-testid={`action-open-job-${job.id}`}
                                  >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Open Job
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-slate-500" data-testid="text-pagination-info">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Job</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer-search">Customer *</Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 border rounded-md bg-slate-50">
                  <div>
                    <p className="font-medium" data-testid="text-selected-customer">{selectedCustomer.name}</p>
                    {selectedCustomer.phone && (
                      <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedCustomer(null)}
                    data-testid="button-clear-customer"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerSearchOpen}
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-customer-search"
                    >
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      Search customers...
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search by name, phone, or address..."
                        value={customerSearch}
                        onValueChange={setCustomerSearch}
                        data-testid="input-customer-search"
                      />
                      <CommandList>
                        {customersLoading ? (
                          <div className="py-6 text-center text-sm">
                            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                            Searching...
                          </div>
                        ) : (customersData?.customers?.length || 0) === 0 ? (
                          <CommandEmpty>No customers found.</CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {customersData?.customers?.map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={customer.id}
                                onSelect={() => {
                                  setSelectedCustomer(customer);
                                  setCustomerSearchOpen(false);
                                  setCustomerSearch("");
                                }}
                                className="cursor-pointer"
                                data-testid={`customer-option-${customer.id}`}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{customer.name}</span>
                                  {customer.phone && (
                                    <span className="text-sm text-slate-500">{customer.phone}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="job-type">Job Type *</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger data-testid="select-job-type">
                    <SelectValue placeholder="Select job type" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map((type) => (
                      <SelectItem key={type} value={type} data-testid={`job-type-${type}`}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize" data-testid={`priority-${p}`}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech">Primary Tech</Label>
              <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                <SelectTrigger data-testid="select-tech">
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned" data-testid="tech-unassigned">
                    Unassigned
                  </SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id} data-testid={`tech-${tech.id}`}>
                      {tech.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                      data-testid="button-start-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time *</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  data-testid="input-start-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes) *</Label>
              <Input
                id="duration"
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                className={durationError ? "border-red-500" : ""}
                data-testid="input-duration"
              />
              {durationError && (
                <p className="text-sm text-red-500" data-testid="error-duration">{durationError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Work order description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={descriptionError ? "border-red-500" : ""}
                data-testid="textarea-description"
              />
              {descriptionError && (
                <p className="text-sm text-red-500" data-testid="error-description">{descriptionError}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseDialog}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createJobMutation.isPending || !isFormValid}
              data-testid="button-submit-create"
            >
              {createJobMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Job"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={(open) => !open && handleCloseScheduleDialog()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Schedule Job</DialogTitle>
          </DialogHeader>
          
          {selectedJobForSchedule && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-slate-50 rounded-md border">
                <p className="text-sm text-slate-500">Customer</p>
                <p className="font-medium" data-testid="text-schedule-customer">{selectedJobForSchedule.customerName}</p>
                <p className="text-sm text-slate-500 mt-1">Job Type: {selectedJobForSchedule.jobType || "—"}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-tech">Technician</Label>
                <Select value={scheduleTechId} onValueChange={setScheduleTechId}>
                  <SelectTrigger data-testid="select-schedule-tech">
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned" data-testid="schedule-tech-unassigned">
                      Unassigned
                    </SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id} data-testid={`schedule-tech-${tech.id}`}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !scheduleDate && "text-muted-foreground"
                        )}
                        data-testid="button-schedule-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduleDate ? format(scheduleDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-time">Time</Label>
                  <Input
                    id="schedule-time"
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    data-testid="input-schedule-time"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-duration">Duration (minutes)</Label>
                <Input
                  id="schedule-duration"
                  type="number"
                  min={15}
                  step={15}
                  value={scheduleDuration}
                  onChange={(e) => setScheduleDuration(parseInt(e.target.value) || 60)}
                  data-testid="input-schedule-duration"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseScheduleDialog}
              data-testid="button-cancel-schedule"
            >
              Cancel
            </Button>
            <Button
              onClick={handleScheduleSubmit}
              disabled={scheduleJobMutation.isPending || !scheduleDate}
              data-testid="button-submit-schedule"
            >
              {scheduleJobMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                "Schedule Job"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
