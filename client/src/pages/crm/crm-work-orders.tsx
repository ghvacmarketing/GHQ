import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Calendar as CalendarIcon,
  User,
  Clock,
  MapPin,
  Wrench,
  CheckSquare,
  Package,
  FileText,
  RefreshCw,
  UserCheck,
  Eye,
  Plus,
} from "lucide-react";
import { workOrderVisitTypeEnum, type WorkOrderVisitType } from "@shared/schema";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import type { CrmUser, CrmWorkOrder, CrmJob, CrmCustomer, WorkOrderStatus } from "@shared/schema";

const JOB_TYPES = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

type CustomerWithInfo = {
  id: string;
  name: string;
  customerType: string;
  fullAddress: string | null;
};

type CustomersResponse = {
  customers: CustomerWithInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface EnrichedWorkOrder extends CrmWorkOrder {
  job: CrmJob | null;
  customer: CrmCustomer | null;
  tech: CrmUser | null;
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
};

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  cancelled: "Cancelled",
};

const allStatuses: WorkOrderStatus[] = ["scheduled", "dispatched", "en_route", "on_site", "completed", "cancelled"];

export default function CrmWorkOrders() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [dateFrom, setDateFrom] = useState<Date>(startOfDay(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfDay(addDays(new Date(), 30)));
  const [techFilter, setTechFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<EnrichedWorkOrder | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [editingChecklist, setEditingChecklist] = useState<{ item: string; completed: boolean }[] | null>(null);
  const [editingTechNotes, setEditingTechNotes] = useState<string>("");
  const [reassignTechId, setReassignTechId] = useState<string>("unassigned");
  const [newStatus, setNewStatus] = useState<string>("");
  const [rescheduleStart, setRescheduleStart] = useState<Date | null>(null);
  const [rescheduleEnd, setRescheduleEnd] = useState<Date | null>(null);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    jobId: "",
    visitType: "initial" as WorkOrderVisitType,
    scheduledDate: "",
    startTime: "08:00",
    endTime: "17:00",
    assignedTechId: "",
  });

  const [createNewJob, setCreateNewJob] = useState(false);
  const [newJobType, setNewJobType] = useState<string>("SERVICE");
  const [newJobPriority, setNewJobPriority] = useState<string>("normal");
  const [newJobDescription, setNewJobDescription] = useState<string>("");
  const [newJobCustomerId, setNewJobCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [newJobStartDate, setNewJobStartDate] = useState<Date | undefined>(new Date());
  const [newJobStartTime, setNewJobStartTime] = useState<string>("08:00");
  const [newJobDuration, setNewJobDuration] = useState<number>(120);
  const [newJobTechId, setNewJobTechId] = useState<string>("unassigned");

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

  const { data: techniciansData } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const technicians = useMemo(() => 
    (techniciansData || []).filter(u => u.role === "tech"),
    [techniciansData]
  );

  const { data: jobsData } = useQuery<{ jobs: CrmJob[] }>({
    queryKey: ["/api/crm/jobs"],
    enabled: !!currentUser && createDialogOpen,
  });

  const jobs = jobsData?.jobs || [];

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
    enabled: !!currentUser && createDialogOpen && createNewJob && customerSearchOpen,
  });

  const customers = customersData?.customers || [];

  useEffect(() => {
    if (createDialogOpen && jobs.length === 0) {
      setCreateNewJob(true);
    }
  }, [createDialogOpen, jobs.length]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dateFrom", dateFrom.toISOString());
    params.set("dateTo", dateTo.toISOString());
    if (techFilter !== "all") params.set("techId", techFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params.toString();
  }, [dateFrom, dateTo, techFilter, statusFilter]);

  const { data: workOrdersData, isLoading: workOrdersLoading, refetch } = useQuery<EnrichedWorkOrder[]>({
    queryKey: ["/api/crm/work-orders/list", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/list?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const workOrders = workOrdersData || [];

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<CrmWorkOrder> }) => {
      const res = await apiRequest("PATCH", `/api/crm/work-orders/${data.id}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      toast({ title: "Work order updated", description: "Changes have been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const resetCreateForm = () => {
    setCreateForm({
      jobId: "",
      visitType: "initial",
      scheduledDate: "",
      startTime: "08:00",
      endTime: "17:00",
      assignedTechId: "",
    });
    setCreateNewJob(false);
    setNewJobType("SERVICE");
    setNewJobPriority("normal");
    setNewJobDescription("");
    setNewJobCustomerId("");
    setCustomerSearch("");
    setSelectedCustomer(null);
    setCustomerSearchOpen(false);
    setNewJobStartDate(new Date());
    setNewJobStartTime("08:00");
    setNewJobDuration(120);
    setNewJobTechId("unassigned");
  };

  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      let jobId = createForm.jobId;

      if (createNewJob) {
        if (!newJobCustomerId) throw new Error("Customer is required");
        if (!newJobDescription.trim()) throw new Error("Project description is required");
        if (!newJobStartDate) throw new Error("Start date is required");
        if (newJobDuration < 15) throw new Error("Duration must be at least 15 minutes");

        const [hours, minutes] = newJobStartTime.split(":").map(Number);
        const scheduledStart = new Date(newJobStartDate);
        scheduledStart.setHours(hours, minutes, 0, 0);
        
        const scheduledEnd = new Date(scheduledStart);
        scheduledEnd.setMinutes(scheduledEnd.getMinutes() + newJobDuration);

        const jobRes = await apiRequest("POST", "/api/crm/jobs", {
          customerId: newJobCustomerId,
          jobType: newJobType,
          priority: newJobPriority,
          description: newJobDescription,
          status: newJobTechId !== "unassigned" ? "scheduled" : "new",
          assignedTechId: newJobTechId !== "unassigned" ? newJobTechId : null,
          scheduledStart: scheduledStart.toISOString(),
          scheduledEnd: scheduledEnd.toISOString(),
        });
        const newJob = await jobRes.json();
        jobId = newJob.id;
      }

      const scheduledStart = createForm.scheduledDate
        ? new Date(`${createForm.scheduledDate}T${createForm.startTime}`)
        : null;
      const scheduledEnd = createForm.scheduledDate
        ? new Date(`${createForm.scheduledDate}T${createForm.endTime}`)
        : null;

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        jobId,
        visitType: createForm.visitType,
        scheduledStart: scheduledStart?.toISOString(),
        scheduledEnd: scheduledEnd?.toISOString(),
        assignedTechId: createForm.assignedTechId === "unassigned" ? null : (createForm.assignedTechId || null),
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      toast({ title: "Work order created", description: "New work order has been scheduled." });
      setCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (error: Error) => {
      toast({ title: "Creation failed", description: error.message, variant: "destructive" });
    },
  });

  const visitTypeLabels: Record<string, string> = {
    SERVICE: "Service",
    INSTALL: "Install",
    MAINTENANCE: "Maintenance",
    SALES: "Sales",
  };

  const handleOpenDetail = async (wo: EnrichedWorkOrder) => {
    const res = await fetch(`/api/crm/work-orders/${wo.id}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setSelectedWorkOrder(data);
      setEditingChecklist(data.checklist || []);
      setEditingTechNotes(data.techNotes || "");
      setReassignTechId(data.assignedTechId || "unassigned");
      setNewStatus(data.status);
      setRescheduleStart(data.scheduledStart ? new Date(data.scheduledStart) : null);
      setRescheduleEnd(data.scheduledEnd ? new Date(data.scheduledEnd) : null);
      setSheetOpen(true);
    }
  };

  const handleSaveChecklist = () => {
    if (selectedWorkOrder && editingChecklist) {
      updateWorkOrderMutation.mutate({
        id: selectedWorkOrder.id,
        updates: { checklist: editingChecklist },
      });
    }
  };

  const handleSaveTechNotes = () => {
    if (selectedWorkOrder) {
      updateWorkOrderMutation.mutate({
        id: selectedWorkOrder.id,
        updates: { techNotes: editingTechNotes },
      });
    }
  };

  const handleUpdateStatus = () => {
    if (selectedWorkOrder && newStatus) {
      updateWorkOrderMutation.mutate({
        id: selectedWorkOrder.id,
        updates: { status: newStatus as WorkOrderStatus },
      });
    }
  };

  const handleReassignTech = () => {
    if (selectedWorkOrder) {
      updateWorkOrderMutation.mutate({
        id: selectedWorkOrder.id,
        updates: { assignedTechId: reassignTechId === "unassigned" ? null : (reassignTechId || null) },
      });
    }
  };

  const handleReschedule = () => {
    if (selectedWorkOrder && rescheduleStart && rescheduleEnd) {
      updateWorkOrderMutation.mutate({
        id: selectedWorkOrder.id,
        updates: {
          scheduledStart: rescheduleStart,
          scheduledEnd: rescheduleEnd,
        },
      });
    }
  };

  const formatDateTime = (date: Date | string | null) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM d, yyyy h:mm a");
    } catch {
      return "—";
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch {
      return "—";
    }
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "h:mm a");
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900" data-testid="text-work-orders-title">
            Work Orders
          </h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-[#711419] hover:bg-[#5a1014]"
              data-testid="button-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Work Order
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh-work-orders"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        <Card className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">From:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-[140px] justify-start text-left font-normal"
                      data-testid="button-date-from"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dateFrom, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={(d) => d && setDateFrom(startOfDay(d))}
                      data-testid="calendar-date-from"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">To:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-[140px] justify-start text-left font-normal"
                      data-testid="button-date-to"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dateTo, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={(d) => d && setDateTo(endOfDay(d))}
                      data-testid="calendar-date-to"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Select value={techFilter} onValueChange={setTechFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-tech-filter">
                  <SelectValue placeholder="All Technicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technicians</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {allStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">WO #</TableHead>
                  <TableHead className="font-semibold">Job Type</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Scheduled</TableHead>
                  <TableHead className="font-semibold">Tech</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrdersLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : workOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No work orders found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        Try adjusting your filters
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  workOrders.map((wo) => {
                    const statusStyle = statusColors[wo.status] || statusColors.scheduled;
                    return (
                      <TableRow
                        key={wo.id}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => handleOpenDetail(wo)}
                        data-testid={`row-work-order-${wo.id}`}
                      >
                        <TableCell className="font-medium" data-testid={`text-wo-number-${wo.id}`}>
                          WO-{wo.workOrderNumber}
                        </TableCell>
                        <TableCell data-testid={`text-job-type-${wo.id}`}>
                          {wo.job?.jobType || "—"}
                        </TableCell>
                        <TableCell data-testid={`text-customer-${wo.id}`}>
                          {wo.customer?.name || "—"}
                        </TableCell>
                        <TableCell data-testid={`text-scheduled-${wo.id}`}>
                          {formatDateTime(wo.scheduledStart)}
                        </TableCell>
                        <TableCell data-testid={`text-tech-${wo.id}`}>
                          {wo.tech?.name || "Unassigned"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border`}
                            data-testid={`badge-status-${wo.id}`}
                          >
                            {statusLabels[wo.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDetail(wo);
                            }}
                            data-testid={`button-view-${wo.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-work-order-detail">
            <SheetHeader>
              <SheetTitle data-testid="text-sheet-title">
                Work Order Details
              </SheetTitle>
              <SheetDescription>
                {selectedWorkOrder ? `WO-${selectedWorkOrder.workOrderNumber}` : ""}
              </SheetDescription>
            </SheetHeader>

            {selectedWorkOrder && (
              <div className="mt-6 space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Work Order Info
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Status:</span>
                      <Badge
                        className={`ml-2 ${statusColors[selectedWorkOrder.status]?.bg} ${statusColors[selectedWorkOrder.status]?.text}`}
                        data-testid="badge-detail-status"
                      >
                        {statusLabels[selectedWorkOrder.status]}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-slate-500">Tech:</span>
                      <span className="ml-2 font-medium" data-testid="text-detail-tech">
                        {selectedWorkOrder.tech?.name || "Unassigned"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">Scheduled:</span>
                      <span className="ml-2" data-testid="text-detail-scheduled">
                        {formatDateTime(selectedWorkOrder.scheduledStart)} - {formatTime(selectedWorkOrder.scheduledEnd)}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Job Info
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-slate-500">Type:</span>
                      <span className="ml-2 font-medium" data-testid="text-detail-job-type">
                        {selectedWorkOrder.job?.jobType || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Priority:</span>
                      <span className="ml-2 capitalize" data-testid="text-detail-priority">
                        {selectedWorkOrder.job?.priority || "normal"}
                      </span>
                    </div>
                    {selectedWorkOrder.job?.description && (
                      <div>
                        <span className="text-slate-500">Description:</span>
                        <p className="mt-1 text-slate-700" data-testid="text-detail-description">
                          {selectedWorkOrder.job.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Customer Info
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-slate-500">Name:</span>
                      <span className="ml-2 font-medium" data-testid="text-detail-customer-name">
                        {selectedWorkOrder.customer?.name || "—"}
                      </span>
                    </div>
                    {selectedWorkOrder.customer?.phone && (
                      <div>
                        <span className="text-slate-500">Phone:</span>
                        <span className="ml-2" data-testid="text-detail-customer-phone">
                          {selectedWorkOrder.customer.phone}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <CheckSquare className="h-4 w-4" />
                    Checklist
                  </h3>
                  {editingChecklist && editingChecklist.length > 0 ? (
                    <div className="space-y-2">
                      {editingChecklist.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Checkbox
                            id={`checklist-${idx}`}
                            checked={item.completed}
                            onCheckedChange={(checked) => {
                              const updated = [...editingChecklist];
                              updated[idx] = { ...updated[idx], completed: !!checked };
                              setEditingChecklist(updated);
                            }}
                            data-testid={`checkbox-checklist-${idx}`}
                          />
                          <label htmlFor={`checklist-${idx}`} className="text-sm">
                            {item.item}
                          </label>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        onClick={handleSaveChecklist}
                        disabled={updateWorkOrderMutation.isPending}
                        data-testid="button-save-checklist"
                      >
                        Save Checklist
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No checklist items</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Parts Used
                  </h3>
                  {selectedWorkOrder.partsUsed && selectedWorkOrder.partsUsed.length > 0 ? (
                    <div className="space-y-2">
                      {selectedWorkOrder.partsUsed.map((part, idx) => (
                        <div key={idx} className="flex justify-between text-sm" data-testid={`row-part-${idx}`}>
                          <span>{part.name} × {part.qty}</span>
                          <span className="text-slate-500">${(part.price * part.qty).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No parts used</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Tech Notes
                  </h3>
                  <Textarea
                    value={editingTechNotes}
                    onChange={(e) => setEditingTechNotes(e.target.value)}
                    placeholder="Add tech notes..."
                    className="min-h-[80px]"
                    data-testid="textarea-tech-notes"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveTechNotes}
                    disabled={updateWorkOrderMutation.isPending}
                    data-testid="button-save-tech-notes"
                  >
                    Save Notes
                  </Button>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Quick Actions</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger className="flex-1" data-testid="select-update-status">
                          <SelectValue placeholder="Update Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {allStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {statusLabels[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={handleUpdateStatus}
                        disabled={updateWorkOrderMutation.isPending}
                        data-testid="button-update-status"
                      >
                        Update
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select value={reassignTechId} onValueChange={setReassignTechId}>
                        <SelectTrigger className="flex-1" data-testid="select-reassign-tech">
                          <SelectValue placeholder="Reassign Tech" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {technicians.map((tech) => (
                            <SelectItem key={tech.id} value={tech.id}>
                              {tech.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={handleReassignTech}
                        disabled={updateWorkOrderMutation.isPending}
                        data-testid="button-reassign-tech"
                      >
                        <UserCheck className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-slate-500">Reschedule:</p>
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="flex-1" data-testid="button-reschedule-start">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {rescheduleStart ? format(rescheduleStart, "MMM d, h:mm a") : "Start"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={rescheduleStart || undefined}
                              onSelect={(d) => {
                                if (d) {
                                  const current = rescheduleStart || new Date();
                                  d.setHours(current.getHours(), current.getMinutes());
                                  setRescheduleStart(d);
                                }
                              }}
                              data-testid="calendar-reschedule-start"
                            />
                          </PopoverContent>
                        </Popover>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="flex-1" data-testid="button-reschedule-end">
                              <Clock className="mr-2 h-4 w-4" />
                              {rescheduleEnd ? format(rescheduleEnd, "MMM d, h:mm a") : "End"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={rescheduleEnd || undefined}
                              onSelect={(d) => {
                                if (d) {
                                  const current = rescheduleEnd || new Date();
                                  d.setHours(current.getHours(), current.getMinutes());
                                  setRescheduleEnd(d);
                                }
                              }}
                              data-testid="calendar-reschedule-end"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={handleReschedule}
                        disabled={updateWorkOrderMutation.isPending || !rescheduleStart || !rescheduleEnd}
                        data-testid="button-reschedule"
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Reschedule
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        <Dialog open={createDialogOpen} onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-create-work-order">
            <DialogHeader>
              <DialogTitle>Create Work Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {jobs.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                  No existing projects found. Create a new project below.
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="createNewJob"
                      checked={createNewJob}
                      onCheckedChange={(checked) => {
                        setCreateNewJob(!!checked);
                        if (checked) {
                          setCreateForm({ ...createForm, jobId: "" });
                        }
                      }}
                      data-testid="checkbox-create-new-job"
                    />
                    <Label htmlFor="createNewJob" className="cursor-pointer">
                      Create a new project
                    </Label>
                  </div>

                  {!createNewJob && (
                    <div className="space-y-2">
                      <Label>Project (required)</Label>
                      <Select
                        value={createForm.jobId}
                        onValueChange={(v) => setCreateForm({ ...createForm, jobId: v })}
                      >
                        <SelectTrigger data-testid="select-job">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {jobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              {job.jobType} - #{job.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {createNewJob && (
                <>
                  <div className="space-y-2">
                    <Label>Customer (required)</Label>
                    <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerSearchOpen}
                          className="w-full justify-between font-normal"
                          data-testid="button-select-customer"
                        >
                          {selectedCustomer ? selectedCustomer.name : "Search for a customer..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Type to search customers..."
                            value={customerSearch}
                            onValueChange={setCustomerSearch}
                            data-testid="input-customer-search"
                          />
                          <CommandList>
                            {customersLoading ? (
                              <div className="p-4 text-center text-sm text-slate-500">
                                Loading...
                              </div>
                            ) : customers.length === 0 ? (
                              <CommandEmpty>No customers found.</CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {customers.map((customer) => (
                                  <CommandItem
                                    key={customer.id}
                                    value={customer.id}
                                    onSelect={() => {
                                      setSelectedCustomer(customer);
                                      setNewJobCustomerId(customer.id);
                                      setCustomerSearchOpen(false);
                                      setCustomerSearch("");
                                    }}
                                    data-testid={`customer-option-${customer.id}`}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-medium">{customer.name}</span>
                                      {customer.fullAddress && (
                                        <span className="text-xs text-slate-500">{customer.fullAddress}</span>
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
                  </div>

                  <div className="space-y-2">
                    <Label>Job Type</Label>
                    <Select value={newJobType} onValueChange={setNewJobType}>
                      <SelectTrigger data-testid="select-new-job-type">
                        <SelectValue placeholder="Select job type" />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={newJobPriority} onValueChange={setNewJobPriority}>
                      <SelectTrigger data-testid="select-new-job-priority">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority.charAt(0).toUpperCase() + priority.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Description (required)</Label>
                    <Textarea
                      value={newJobDescription}
                      onChange={(e) => setNewJobDescription(e.target.value)}
                      placeholder="Describe the project..."
                      className="min-h-[80px]"
                      data-testid="textarea-new-job-description"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Primary Tech (optional)</Label>
                    <Select value={newJobTechId} onValueChange={setNewJobTechId}>
                      <SelectTrigger data-testid="select-new-job-tech">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {technicians.map((tech) => (
                          <SelectItem key={tech.id} value={tech.id}>
                            {tech.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Start Date (required)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          data-testid="button-new-job-start-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newJobStartDate ? format(newJobStartDate, "MMM d, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={newJobStartDate}
                          onSelect={setNewJobStartDate}
                          data-testid="calendar-new-job-start-date"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Time (required)</Label>
                      <Input
                        type="time"
                        value={newJobStartTime}
                        onChange={(e) => setNewJobStartTime(e.target.value)}
                        data-testid="input-new-job-start-time"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Duration (minutes)</Label>
                      <Input
                        type="number"
                        min={15}
                        value={newJobDuration}
                        onChange={(e) => setNewJobDuration(parseInt(e.target.value) || 15)}
                        data-testid="input-new-job-duration"
                      />
                      {newJobDuration < 15 && (
                        <p className="text-xs text-red-500">Minimum 15 minutes</p>
                      )}
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              <div className="space-y-2">
                <Label>Visit Type</Label>
                <Select
                  value={createForm.visitType}
                  onValueChange={(v) => setCreateForm({ ...createForm, visitType: v as WorkOrderVisitType })}
                >
                  <SelectTrigger data-testid="select-visit-type">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrderVisitTypeEnum.map((type) => (
                      <SelectItem key={type} value={type}>
                        {visitTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Scheduled Date (required)</Label>
                <Input
                  type="date"
                  value={createForm.scheduledDate}
                  onChange={(e) => setCreateForm({ ...createForm, scheduledDate: e.target.value })}
                  data-testid="input-date"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
                    data-testid="input-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={createForm.endTime}
                    onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })}
                    data-testid="input-end-time"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assign Technician (optional)</Label>
                <Select
                  value={createForm.assignedTechId}
                  onValueChange={(v) => setCreateForm({ ...createForm, assignedTechId: v })}
                >
                  <SelectTrigger data-testid="select-tech">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  resetCreateForm();
                }}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createWorkOrderMutation.mutate()}
                disabled={
                  createWorkOrderMutation.isPending ||
                  !createForm.scheduledDate ||
                  (createNewJob
                    ? !newJobCustomerId || !newJobDescription.trim() || !newJobStartDate || newJobDuration < 15
                    : !createForm.jobId)
                }
                className="bg-[#711419] hover:bg-[#5a1014]"
                data-testid="button-submit-create"
              >
                {createWorkOrderMutation.isPending ? "Creating..." : "Create Work Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}
