import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
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
  Building2,
  FolderOpen,
  AlertTriangle,
  Search,
} from "lucide-react";
import { workOrderVisitTypeEnum, type WorkOrderVisitType, type WorkOrderStatus } from "@shared/schema";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, isToday, isThisWeek, addDays } from "date-fns";
import type { CrmUser, CrmWorkOrder, CrmJob, CrmCustomer, CrmProperty, CrmProject } from "@shared/schema";

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
  property: CrmProperty | null;
  project: CrmProject | null;
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

const visitTypeLabels: Record<string, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  MAINTENANCE: "Maintenance",
  SALES: "Sales",
};

const visitTypeColors: Record<string, { bg: string; text: string }> = {
  SERVICE: { bg: "bg-blue-50", text: "text-blue-700" },
  INSTALL: { bg: "bg-green-50", text: "text-green-700" },
  MAINTENANCE: { bg: "bg-amber-50", text: "text-amber-700" },
  SALES: { bg: "bg-purple-50", text: "text-purple-700" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600" },
  normal: { bg: "bg-blue-100", text: "text-blue-700" },
  high: { bg: "bg-orange-100", text: "text-orange-700" },
  urgent: { bg: "bg-red-100", text: "text-red-700" },
};

type FilterTab = "all" | "needs_scheduling" | "scheduled" | "in_progress" | "completed" | "ready_to_invoice" | "invoiced" | "closed" | "cancelled";

const filterTabConfig: Record<FilterTab, { label: string; shortLabel: string }> = {
  all: { label: "All", shortLabel: "All" },
  needs_scheduling: { label: "Needs Scheduling", shortLabel: "Unscheduled" },
  scheduled: { label: "Scheduled", shortLabel: "Scheduled" },
  in_progress: { label: "In Progress", shortLabel: "Active" },
  completed: { label: "Completed", shortLabel: "Done" },
  ready_to_invoice: { label: "Ready to Invoice", shortLabel: "Ready" },
  invoiced: { label: "Invoiced / Awaiting Payment", shortLabel: "Invoiced" },
  closed: { label: "Closed", shortLabel: "Closed" },
  cancelled: { label: "Cancelled", shortLabel: "Cancelled" },
};

export default function CrmWorkOrders() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<EnrichedWorkOrder | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [editingChecklist, setEditingChecklist] = useState<{ item: string; completed: boolean }[] | null>(null);
  const [editingTechNotes, setEditingTechNotes] = useState<string>("");
  const [reassignTechId, setReassignTechId] = useState<string>("unassigned");
  const [newStatus, setNewStatus] = useState<string>("");
  const [rescheduleStart, setRescheduleStart] = useState<Date | null>(null);
  const [rescheduleEnd, setRescheduleEnd] = useState<Date | null>(null);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [woTitle, setWoTitle] = useState("");
  const [woDescription, setWoDescription] = useState("");
  const [visitType, setVisitType] = useState<WorkOrderVisitType>("SERVICE");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  const [priority, setPriority] = useState<string>("normal");

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

  const customers = customersData?.customers || [];

  const { data: propertiesData } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/properties?customerId=${selectedCustomer!.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!selectedCustomer?.id && createDialogOpen,
  });

  const properties = propertiesData || [];

  const { data: projectsData } = useQuery<CrmProject[]>({
    queryKey: ["/api/crm/projects", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?customerId=${selectedCustomer!.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!selectedCustomer?.id && createDialogOpen,
  });

  const projects = projectsData || [];

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    
    // Map tab to status filter when possible
    if (activeTab === "scheduled") {
      params.set("status", "scheduled");
    } else if (activeTab === "completed") {
      params.set("status", "completed");
    } else if (activeTab === "cancelled") {
      params.set("status", "cancelled");
    }
    // Other tabs require client-side filtering
    
    if (techFilter !== "all") params.set("techId", techFilter);
    return params.toString();
  }, [activeTab, techFilter]);

  const { data: workOrdersData, isLoading: workOrdersLoading, refetch } = useQuery<EnrichedWorkOrder[]>({
    queryKey: ["/api/crm/work-orders/list", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/list?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const filteredWorkOrders = useMemo(() => {
    let orders = workOrdersData || [];
    
    // Apply search filter
    if (debouncedSearch.trim()) {
      const searchLower = debouncedSearch.toLowerCase();
      orders = orders.filter(wo => {
        const titleMatch = wo.title?.toLowerCase().includes(searchLower);
        const descMatch = wo.description?.toLowerCase().includes(searchLower);
        const customerMatch = wo.customer?.name?.toLowerCase().includes(searchLower);
        const woNumber = wo.workOrderNumber?.toLowerCase().includes(searchLower);
        return titleMatch || descMatch || customerMatch || woNumber;
      });
    }
    
    // Apply tab-based status filtering (for tabs not handled server-side)
    if (activeTab === "needs_scheduling") {
      // Work orders without a scheduled date
      orders = orders.filter(wo => !wo.scheduledStart);
    } else if (activeTab === "in_progress") {
      // Active work - dispatched, en route, or on site
      orders = orders.filter(wo => ["dispatched", "en_route", "on_site"].includes(wo.status));
    } else if (activeTab === "ready_to_invoice") {
      // Completed but no invoice yet
      orders = orders.filter(wo => 
        wo.status === "completed" && 
        (!wo.billingDisposition || wo.billingDisposition === "pending")
      );
    } else if (activeTab === "invoiced") {
      // Has invoice created but not closed
      orders = orders.filter(wo => 
        wo.billingDisposition === "invoice_created"
      );
    } else if (activeTab === "closed") {
      // Fully closed/paid
      orders = orders.filter(wo => 
        wo.billingDisposition === "billed_elsewhere" || 
        wo.billingDisposition === "no_charge" ||
        wo.status === "closed"
      );
    }
    
    return orders.sort((a, b) => {
      const dateA = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
      const dateB = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
      return dateA - dateB;
    });
  }, [workOrdersData, activeTab, debouncedSearch]);

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
    setSelectedCustomer(null);
    setSelectedPropertyId("");
    setSelectedProjectId("");
    setWoTitle("");
    setWoDescription("");
    setVisitType("SERVICE");
    setScheduledDate(new Date());
    setStartTime("08:00");
    setEndTime("17:00");
    setAssignedTechId("unassigned");
    setPriority("normal");
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  };

  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error("Customer is required");
      if (!scheduledDate) throw new Error("Scheduled date is required");

      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const [endHours, endMinutes] = endTime.split(":").map(Number);
      
      const scheduledStart = new Date(scheduledDate);
      scheduledStart.setHours(startHours, startMinutes, 0, 0);
      
      const scheduledEnd = new Date(scheduledDate);
      scheduledEnd.setHours(endHours, endMinutes, 0, 0);

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId: selectedCustomer.id,
        propertyId: selectedPropertyId || null,
        projectId: selectedProjectId || null,
        title: woTitle || null,
        description: woDescription || null,
        visitType,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        assignedTechId: assignedTechId === "unassigned" ? null : assignedTechId,
        priority,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      toast({ title: "Work order created", description: "New work order has been scheduled." });
      setCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (error: Error) => {
      toast({ title: "Creation failed", description: error.message, variant: "destructive" });
    },
  });

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

  const getPropertyAddress = (property: CrmProperty | null) => {
    if (!property) return null;
    const parts = [property.address1];
    if (property.address2) parts.push(property.address2);
    parts.push(`${property.city}, ${property.state} ${property.zip}`);
    return parts.join(", ");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const total = workOrders?.length || 0;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Search bar at top - DoorLoop style */}
        <div className="flex justify-center mb-2">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search work orders..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
              data-testid="input-search-work-orders"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-work-orders-title">
              Work Orders
            </h1>
            <p className="text-sm text-slate-500">Total: {total}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              size="sm"
              data-testid="button-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Work Order
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              data-testid="button-refresh-work-orders"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs styled like projects/customers page - underline style */}
        <div className="flex overflow-x-auto border-b border-slate-200">
          {(Object.keys(filterTabConfig) as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-[#711419] text-[#711419]"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
              data-testid={`tab-${tab}`}
            >
              <span className="hidden sm:inline">{filterTabConfig[tab].label}</span>
              <span className="sm:hidden">{filterTabConfig[tab].shortLabel}</span>
            </button>
          ))}
        </div>

        {workOrdersLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredWorkOrders.length === 0 ? (
          <Card className="bg-white border shadow-sm">
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No work orders found</p>
              <p className="text-slate-400 text-sm mt-1">
                {activeTab === "all" ? "Create your first work order to get started" : "Try adjusting your filters"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkOrders.map((wo) => {
              const statusStyle = statusColors[wo.status] || statusColors.scheduled;
              const visitStyle = visitTypeColors[wo.visitType || "SERVICE"] || visitTypeColors.SERVICE;
              const prioStyle = priorityColors[wo.priority || "normal"] || priorityColors.normal;
              
              return (
                <Card
                  key={wo.id}
                  className="bg-white border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleOpenDetail(wo)}
                  data-testid={`card-work-order-${wo.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate" data-testid={`text-wo-number-${wo.id}`}>
                          WO-{wo.workOrderNumber}
                        </p>
                        {(wo.title || wo.description) && (
                          <p className="text-sm text-slate-600 truncate mt-0.5" data-testid={`text-wo-title-${wo.id}`}>
                            {wo.title || wo.description}
                          </p>
                        )}
                      </div>
                      <Badge 
                        className={`${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border} shrink-0`}
                        data-testid={`badge-status-${wo.id}`}
                      >
                        {statusLabels[wo.status]}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-600" data-testid={`text-customer-${wo.id}`}>
                        <User className="h-4 w-4 shrink-0" />
                        <span className="truncate">{wo.customer?.name || "—"}</span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600" data-testid={`text-scheduled-${wo.id}`}>
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        <span>
                          {formatDate(wo.scheduledStart)}
                          {wo.scheduledStart && (
                            <span className="text-slate-400 ml-1">
                              {formatTime(wo.scheduledStart)} - {formatTime(wo.scheduledEnd)}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600" data-testid={`text-tech-${wo.id}`}>
                        <UserCheck className="h-4 w-4 shrink-0" />
                        <span className="truncate">{wo.tech?.name || "Unassigned"}</span>
                      </div>

                      {wo.property && (
                        <div className="flex items-center gap-2 text-slate-500 text-xs" data-testid={`text-address-${wo.id}`}>
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{getPropertyAddress(wo.property)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                      <Badge className={`${visitStyle.bg} ${visitStyle.text} text-xs`} data-testid={`badge-visit-type-${wo.id}`}>
                        {visitTypeLabels[wo.visitType || "SERVICE"]}
                      </Badge>
                      {wo.priority && wo.priority !== "normal" && (
                        <Badge className={`${prioStyle.bg} ${prioStyle.text} text-xs`} data-testid={`badge-priority-${wo.id}`}>
                          {wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1)}
                        </Badge>
                      )}
                      {wo.project && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-project-${wo.id}`}>
                          <FolderOpen className="h-3 w-3 mr-1" />
                          {wo.project.title}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                WO-{selectedWorkOrder?.workOrderNumber}
              </SheetTitle>
              <SheetDescription>
                {selectedWorkOrder?.title || selectedWorkOrder?.description || "Work Order Details"}
              </SheetDescription>
            </SheetHeader>

            {selectedWorkOrder && (
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Customer</h4>
                  <p className="text-slate-900">{selectedWorkOrder.customer?.name || "—"}</p>
                </div>

                {selectedWorkOrder.property && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-slate-700">Property</h4>
                    <p className="text-slate-900 text-sm">{getPropertyAddress(selectedWorkOrder.property)}</p>
                  </div>
                )}

                {selectedWorkOrder.project && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-slate-700">Linked Project</h4>
                    <p className="text-slate-900">{selectedWorkOrder.project.title}</p>
                  </div>
                )}

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Status</h4>
                  <div className="flex items-center gap-2">
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="w-[180px]" data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["scheduled", "dispatched", "en_route", "on_site", "completed", "cancelled"] as WorkOrderStatus[]).map((status) => (
                          <SelectItem key={status} value={status}>
                            {statusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={handleUpdateStatus}
                      disabled={updateWorkOrderMutation.isPending || newStatus === selectedWorkOrder.status}
                      data-testid="button-update-status"
                    >
                      Update
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Assigned Tech</h4>
                  <div className="flex items-center gap-2">
                    <Select value={reassignTechId} onValueChange={setReassignTechId}>
                      <SelectTrigger className="w-[180px]" data-testid="select-reassign-tech">
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
                    <Button
                      size="sm"
                      onClick={handleReassignTech}
                      disabled={updateWorkOrderMutation.isPending}
                      data-testid="button-reassign-tech"
                    >
                      Assign
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Schedule</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Start</Label>
                      <Input
                        type="datetime-local"
                        value={rescheduleStart ? format(rescheduleStart, "yyyy-MM-dd'T'HH:mm") : ""}
                        onChange={(e) => setRescheduleStart(e.target.value ? new Date(e.target.value) : null)}
                        data-testid="input-reschedule-start"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End</Label>
                      <Input
                        type="datetime-local"
                        value={rescheduleEnd ? format(rescheduleEnd, "yyyy-MM-dd'T'HH:mm") : ""}
                        onChange={(e) => setRescheduleEnd(e.target.value ? new Date(e.target.value) : null)}
                        data-testid="input-reschedule-end"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleReschedule}
                    disabled={updateWorkOrderMutation.isPending || !rescheduleStart || !rescheduleEnd}
                    data-testid="button-reschedule"
                  >
                    Reschedule
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Tech Notes</h4>
                  <Textarea
                    value={editingTechNotes}
                    onChange={(e) => setEditingTechNotes(e.target.value)}
                    placeholder="Add notes..."
                    className="min-h-[80px]"
                    data-testid="textarea-tech-notes"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveTechNotes}
                    disabled={updateWorkOrderMutation.isPending}
                    data-testid="button-save-notes"
                  >
                    Save Notes
                  </Button>
                </div>

                {editingChecklist && editingChecklist.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-slate-700">Checklist</h4>
                    <div className="space-y-2">
                      {editingChecklist.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={(checked) => {
                              const updated = [...editingChecklist];
                              updated[index] = { ...item, completed: !!checked };
                              setEditingChecklist(updated);
                            }}
                            data-testid={`checkbox-checklist-${index}`}
                          />
                          <span className={item.completed ? "line-through text-slate-400" : ""}>
                            {item.item}
                          </span>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSaveChecklist}
                      disabled={updateWorkOrderMutation.isPending}
                      data-testid="button-save-checklist"
                    >
                      Save Checklist
                    </Button>
                  </div>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Work Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Customer <span className="text-red-500">*</span></Label>
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
                                  setSelectedPropertyId("");
                                  setSelectedProjectId("");
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

              {selectedCustomer && properties.length > 0 && (
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                    <SelectTrigger data-testid="select-property">
                      <SelectValue placeholder="Select property (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No property selected</SelectItem>
                      {properties.map((prop) => (
                        <SelectItem key={prop.id} value={prop.id}>
                          {prop.address1}, {prop.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                  placeholder="Optional title for this work order"
                  data-testid="input-wo-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Visit Type <span className="text-red-500">*</span></Label>
                <Select value={visitType} onValueChange={(v) => setVisitType(v as WorkOrderVisitType)}>
                  <SelectTrigger data-testid="select-visit-type">
                    <SelectValue />
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
                <Label>Scheduled Date <span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-scheduled-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledDate ? format(scheduledDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduledDate}
                      onSelect={setScheduledDate}
                      data-testid="calendar-scheduled-date"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    data-testid="input-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    data-testid="input-end-time"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assigned Technician</Label>
                <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                  <SelectTrigger data-testid="select-assigned-tech">
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

              {selectedCustomer && projects.length > 0 && (
                <div className="space-y-2">
                  <Label>Link to Project</Label>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger data-testid="select-project">
                      <SelectValue placeholder="Select project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No project linked</SelectItem>
                      {projects.map((proj) => (
                        <SelectItem key={proj.id} value={proj.id}>
                          {proj.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={woDescription}
                  onChange={(e) => setWoDescription(e.target.value)}
                  placeholder="Optional description or notes..."
                  className="min-h-[80px]"
                  data-testid="textarea-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
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
                disabled={createWorkOrderMutation.isPending || !selectedCustomer || !scheduledDate}
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
