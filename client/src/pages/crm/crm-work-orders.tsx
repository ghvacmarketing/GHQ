import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";

// Debug logging for cache hits
const DEBUG_CACHE = false;
const logCache = (...args: unknown[]) => {
  if (DEBUG_CACHE) {
    console.log(`[WORKORDERS-PAGE ${new Date().toISOString().split('T')[1].slice(0, 12)}]`, ...args);
  }
};
import { DndContext, DragOverlay, useDraggable, useDroppable, closestCenter, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
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
  Edit,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { workOrderVisitTypeEnum, type WorkOrderVisitType, type WorkOrderStatus, type WorkSubtype, type ChecklistQuestion, type WorkOrderSubtype } from "@shared/schema";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, isToday, isThisWeek, addDays } from "date-fns";
import { createLocalDateTime, formatLocalDateTime } from "@/lib/timezone";
import type { CrmUser, CrmWorkOrder, CrmJob, CrmCustomer, CrmProperty, CrmProject } from "@shared/schema";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const WORK_SUBTYPE_TO_SERVICE_TYPE: Record<string, string> = {
  "No Heat": "NO_HEAT",
  "No Cool": "NO_AC",
  "Water Leak": "WATER_LEAK",
  "Strange Noise": "STRANGE_NOISE",
  "Thermostat Issue": "THERMOSTAT_ISSUE",
  "Electrical": "OTHER",
  "Thermostat": "THERMOSTAT_ISSUE",
  "Airflow": "OTHER",
  "Noise": "STRANGE_NOISE",
  "IAQ": "OTHER",
  "Other": "OTHER",
  "A/C Repair": "NO_AC",
  "AC Repair": "NO_AC",
  "Heating Repair": "NO_HEAT",
  "Furnace Repair": "NO_HEAT",
  "Heat Pump Repair": "NO_HEAT",
  "Ductless Repair": "NO_AC",
  "Mini Split Repair": "NO_AC",
};

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
  en_route: "Traveling",
  on_site: "Working",
  completed: "Completed",
  cancelled: "Cancelled",
};

const dispatchQueueStageLabels: Record<string, string> = {
  NeedsScheduling: "Needs Scheduling",
  WaitingOnParts: "Waiting on Parts",
  PartsArrived: "Parts Arrived",
  OnHold: "On Hold",
};

const dispatchQueueStageColors: Record<string, { bg: string; text: string; border: string }> = {
  NeedsScheduling: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  WaitingOnParts: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  PartsArrived: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  OnHold: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
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

type FilterTab = "all" | "scheduled" | "in_progress" | "completed" | "ready_to_invoice" | "invoiced" | "closed" | "cancelled" | "unassigned";

const filterTabConfig: Record<FilterTab, { label: string; shortLabel: string }> = {
  all: { label: "All", shortLabel: "All" },
  unassigned: { label: "Unassigned", shortLabel: "Unassigned" },
  scheduled: { label: "Scheduled", shortLabel: "Scheduled" },
  in_progress: { label: "In Progress", shortLabel: "Active" },
  completed: { label: "Completed", shortLabel: "Done" },
  ready_to_invoice: { label: "Ready to Invoice", shortLabel: "Ready" },
  invoiced: { label: "Invoiced / Awaiting Payment", shortLabel: "Invoiced" },
  closed: { label: "Closed", shortLabel: "Closed" },
  cancelled: { label: "Cancelled", shortLabel: "Cancelled" },
};

type UnassignedCategory = "needs_scheduling" | "waiting_on_parts" | "parts_arrived" | "on_hold";

const unassignedCategoryConfig: Record<UnassignedCategory, { label: string; description: string }> = {
  needs_scheduling: { label: "Needs Scheduling", description: "" },
  waiting_on_parts: { label: "Waiting on Parts", description: "" },
  parts_arrived: { label: "Parts Arrived", description: "" },
  on_hold: { label: "On Hold", description: "" },
};

const categoryToDispatchStage: Record<UnassignedCategory, string> = {
  needs_scheduling: "NeedsScheduling",
  waiting_on_parts: "WaitingOnParts",
  parts_arrived: "PartsArrived",
  on_hold: "OnHold",
};

function DraggableWorkOrderCard({ wo, visitStyle, onClick }: { 
  wo: EnrichedWorkOrder; 
  visitStyle: { bg: string; text: string };
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: wo.id,
    data: { workOrder: wo },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "bg-white border shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing",
        isDragging && "ring-2 ring-blue-400"
      )}
      onClick={onClick}
      data-testid={`card-work-order-${wo.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="font-semibold text-slate-900 text-sm truncate flex-1">
            {wo.customer?.name || "—"}
          </p>
        </div>
        
        {wo.workSubtype && wo.workSubtype !== "Other" && (
          <p className="text-xs text-slate-600 truncate mb-2">
            {wo.workSubtype}
          </p>
        )}

        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
          <Badge className={cn("text-[10px] px-1.5 py-0.5", visitStyle.bg, visitStyle.text)}>
            {wo.visitType || "Service"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function DroppableColumn({ 
  category, 
  config, 
  children, 
  count 
}: { 
  category: UnassignedCategory; 
  config: { label: string; description: string };
  children: React.ReactNode;
  count: number;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: category,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "bg-slate-100 rounded-lg border border-slate-200 transition-colors",
        isOver && "bg-blue-50 border-blue-300"
      )}
      data-testid={`kanban-column-${category}`}
    >
      <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">{config.label}</h3>
            {config.description && (
              <p className="text-xs text-slate-500">{config.description}</p>
            )}
          </div>
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        </div>
      </div>
      
      <div className="p-2 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto min-h-[100px]">
        {children}
      </div>
    </div>
  );
}

export default function CrmWorkOrders() {
  usePageTitle("Work Orders");
  const [, navigate] = useLocation();
  const queryClientInstance = useQueryClient();
  const { toast } = useToast();

  // Prefetch work order detail on hover for instant navigation
  const prefetchWorkOrder = (workOrderId: string) => {
    queryClientInstance.prefetchQuery({
      queryKey: [`/api/crm/work-orders/${workOrderId}`],
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 2 * 60 * 1000, // Cache prefetched data for 2 minutes
    });
  };

  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [visitTypeFilter, setVisitTypeFilter] = useState<WorkOrderVisitType | "all">("all");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<EnrichedWorkOrder | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [editingChecklist, setEditingChecklist] = useState<{ item: string; completed: boolean }[] | null>(null);
  const [editingTechNotes, setEditingTechNotes] = useState<string>("");
  const [reassignTechId, setReassignTechId] = useState<string>("unassigned");
  const [newStatus, setNewStatus] = useState<string>("");
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleStartTime, setRescheduleStartTime] = useState<string>("08:00");
  const [rescheduleEndTime, setRescheduleEndTime] = useState<string>("10:00");
  
  // Project linking state
  const [projectSearch, setProjectSearch] = useState("");
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  
  // Customer reassignment state (for detail sheet)
  const [reassignCustomerSearch, setReassignCustomerSearch] = useState("");
  const [reassignCustomerSearchOpen, setReassignCustomerSearchOpen] = useState(false);
  const [reassignPropertyId, setReassignPropertyId] = useState<string>("");
  const debouncedReassignCustomerSearch = useDebounce(reassignCustomerSearch, 300);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [woTitle, setWoTitle] = useState("");
  const [woDescription, setWoDescription] = useState("");
  const [visitType, setVisitType] = useState<WorkOrderVisitType>("SERVICE");
  const [workSubtype, setWorkSubtype] = useState<WorkSubtype>("Other");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  const [priority, setPriority] = useState<string>("normal");
  
  // Service call checklist state
  const [checklistQuestions, setChecklistQuestions] = useState<ChecklistQuestion[]>([]);
  const [checklistAnswers, setChecklistAnswers] = useState<Record<string, string | boolean | number>>({});
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  
  // Dynamic maintenance subtypes (includes custom agreement types)
  const [maintenanceSubtypes, setMaintenanceSubtypes] = useState<string[]>(["Preventative Maintenance"]);
  
  // Drag and drop state for unassigned kanban
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  
  // Generate 30-minute interval time options from 8 AM to 8 PM
  const timeOptions = (() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let min = 0; min < 60; min += 30) {
        if (hour === 20 && min > 0) break;
        const h = hour.toString().padStart(2, "0");
        const m = min.toString().padStart(2, "0");
        const value = `${h}:${m}`;
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const ampm = hour >= 12 ? "PM" : "AM";
        const label = `${displayHour}:${m.padStart(2, "0")} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  })();
  
  // Helper to get time from scheduled date
  const getTimeFromSchedule = (date: Date | string | null): string => {
    if (!date) return "08:00";
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = (Math.floor(d.getMinutes() / 30) * 30).toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const debouncedProjectSearch = useDebounce(projectSearch, 300);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  // Handle ?create=true query parameter to auto-open create dialog
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "true") {
      setCreateDialogOpen(true);
      // Remove the query parameter from the URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Fetch maintenance subtypes (includes custom agreement types) when MAINTENANCE is selected or dialog opens
  useEffect(() => {
    if (!createDialogOpen) return;
    if (visitType !== "MAINTENANCE") return;
    
    fetch("/api/crm/work-subtypes/MAINTENANCE", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMaintenanceSubtypes(data);
        }
      })
      .catch(() => {
        // Fall back to default if API fails
        setMaintenanceSubtypes(["Preventative Maintenance"]);
      });
  }, [visitType, createDialogOpen]);

  // Fetch checklist questions when SERVICE is selected and workSubtype changes
  useEffect(() => {
    if (!createDialogOpen) return;
    if (visitType !== "SERVICE") {
      setChecklistQuestions([]);
      setChecklistAnswers({});
      setChecklistId(null);
      return;
    }

    const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[workSubtype] || "OTHER";

    setChecklistLoading(true);
    fetch(`/api/crm/checklists/${serviceType}`, { credentials: "include" })
      .then(res => {
        if (!res.ok) {
          setChecklistQuestions([]);
          setChecklistId(null);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data && data.questions) {
          setChecklistQuestions(data.questions);
          setChecklistId(data.id);
          setChecklistAnswers({});
        } else {
          setChecklistQuestions([]);
          setChecklistId(null);
        }
      })
      .catch(() => {
        setChecklistQuestions([]);
        setChecklistId(null);
      })
      .finally(() => {
        setChecklistLoading(false);
      });
  }, [visitType, workSubtype, createDialogOpen]);

  const { data: technicians = [] } = useQuery<{ id: string; name: string; email: string; role: string }[]>({
    queryKey: ["/api/crm/technicians"],
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

  const { data: projectsResponse } = useQuery<{ projects: CrmProject[]; pagination: any }>({
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

  const projects = projectsResponse?.projects || [];

  // Query for active maintenance agreements when customer is selected
  interface ActiveAgreement {
    id: string;
    agreementType: string | null;
    status: string;
    frequency: string | null;
    visitsPerPeriod: number | null;
    nextServiceDate: string | null;
    displayName: string;
  }

  const { data: activeAgreements = [] } = useQuery<ActiveAgreement[]>({
    queryKey: ["/api/crm/customers", selectedCustomer?.id, "active-agreements"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${selectedCustomer!.id}/active-agreements`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.agreements ?? []);
    },
    enabled: !!selectedCustomer?.id && createDialogOpen,
  });

  // Query for linking projects in the detail sheet (different from create dialog)
  // Fetch immediately when sheet opens so user can see project options
  const { data: linkableProjectsResponse, isLoading: linkableProjectsLoading } = useQuery<{ projects: CrmProject[]; pagination: any }>({
    queryKey: ["/api/crm/projects", selectedWorkOrder?.customerId, debouncedProjectSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedWorkOrder?.customerId) params.set("customerId", selectedWorkOrder.customerId);
      if (debouncedProjectSearch) params.set("search", debouncedProjectSearch);
      const res = await fetch(`/api/crm/projects?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!currentUser && !!selectedWorkOrder?.customerId && sheetOpen,
  });

  const linkableProjects = linkableProjectsResponse?.projects || [];

  // Query for customer search in reassignment (detail sheet)
  const { data: reassignCustomersData, isLoading: reassignCustomersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", debouncedReassignCustomerSearch, "reassign"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "10" });
      if (debouncedReassignCustomerSearch) params.set("search", debouncedReassignCustomerSearch);
      const res = await fetch(`/api/crm/customers?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser && sheetOpen && reassignCustomerSearchOpen,
  });

  const reassignCustomers = reassignCustomersData?.customers || [];

  // Query to fetch work order subtypes dynamically
  const { data: workOrderSubtypes = [] } = useQuery<WorkOrderSubtype[]>({
    queryKey: ["/api/crm/work-order-subtypes", { activeOnly: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/crm/work-order-subtypes?activeOnly=true", {
        credentials: "include",
      });
      return res.json();
    },
    enabled: !!currentUser,
  });

  // Helper to get subtypes for a visit type
  const getSubtypesForVisitType = (vt: WorkOrderVisitType) => {
    return workOrderSubtypes
      .filter(s => s.visitType === vt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  };

  // Query for properties of the current work order's customer (for property reassignment)
  const { data: woPropertiesData } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", selectedWorkOrder?.customerId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/properties?customerId=${selectedWorkOrder?.customerId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!currentUser && !!selectedWorkOrder?.customerId && sheetOpen,
  });

  const woProperties = woPropertiesData || [];

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

  // Debug: Check cache before query runs
  useEffect(() => {
    const myQueryKey = ["/api/crm/work-orders/list", queryParams];
    const cachedData = queryClient.getQueryData(myQueryKey);
    logCache('========================================');
    logCache('PAGE MOUNTING / QUERY PARAMS CHANGED');
    logCache('My queryKey:', JSON.stringify(myQueryKey));
    logCache('queryParams string:', queryParams);
    logCache('Cache data exists:', !!cachedData);
    if (cachedData) {
      logCache('CACHE HIT - should render instantly!');
    } else {
      logCache('CACHE MISS - will fetch from network');
      const allQueries = queryClient.getQueryCache().getAll();
      const woQueries = allQueries.filter(q => 
        JSON.stringify(q.queryKey).includes('work-orders')
      );
      logCache('Existing work-orders-related cache keys:', 
        woQueries.map(q => JSON.stringify(q.queryKey))
      );
    }
    logCache('========================================');
  }, [queryParams]);

  const { data: workOrdersData, isLoading: workOrdersLoading, refetch } = useQuery<EnrichedWorkOrder[]>({
    queryKey: ["/api/crm/work-orders/list", queryParams],
    queryFn: async () => {
      logCache('queryFn EXECUTING - fetching from network!');
      const res = await fetch(`/api/crm/work-orders/list?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work orders");
      const data = await res.json();
      logCache('queryFn COMPLETE - got data');
      return data;
    },
    enabled: !!currentUser,
    staleTime: 10 * 60 * 1000, // 10 min - show cached data instantly, refresh in background when stale
    refetchInterval: 60000, // Refresh every 60 seconds to catch sync updates
    refetchIntervalInBackground: true, // Keep syncing even when tab is not focused
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
    
    // Apply category filter
    if (visitTypeFilter !== "all") {
      orders = orders.filter(wo => wo.visitType === visitTypeFilter);
    }
    
    
    // Apply tab-based status filtering (for tabs not handled server-side)
    if (activeTab === "unassigned") {
      // Unassigned work orders - no tech assigned or in queue stages
      const unassignedStages = ["NeedsScheduling", "WaitingOnParts", "PartsArrived", "OnHold"];
      orders = orders.filter(wo => 
        !wo.assignedTechId || 
        (wo.dispatchQueueStage && unassignedStages.includes(wo.dispatchQueueStage))
      );
    } else if (activeTab === "scheduled") {
      // Scheduled with tech and time set
      orders = orders.filter(wo => wo.scheduledStart && wo.assignedTechId && wo.status === "scheduled");
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
  }, [workOrdersData, activeTab, debouncedSearch, visitTypeFilter]);

  // Categorize unassigned work orders for the unassigned tab
  const categorizedUnassigned = useMemo(() => {
    if (activeTab !== "unassigned") return null;
    
    const categories: Record<UnassignedCategory, EnrichedWorkOrder[]> = {
      needs_scheduling: [],
      waiting_on_parts: [],
      parts_arrived: [],
      on_hold: [],
    };
    
    filteredWorkOrders.forEach(wo => {
      if (wo.dispatchQueueStage === "NeedsScheduling") {
        categories.needs_scheduling.push(wo);
      } else if (wo.dispatchQueueStage === "WaitingOnParts") {
        categories.waiting_on_parts.push(wo);
      } else if (wo.dispatchQueueStage === "PartsArrived") {
        categories.parts_arrived.push(wo);
      } else if (wo.dispatchQueueStage === "OnHold") {
        categories.on_hold.push(wo);
      } else if (!wo.assignedTechId) {
        // Default unassigned work orders to "Needs Scheduling" column
        categories.needs_scheduling.push(wo);
      }
    });
    
    return categories;
  }, [filteredWorkOrders, activeTab]);

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<CrmWorkOrder> & { updateProjectCustomer?: boolean } }) => {
      const res = await apiRequest("PATCH", `/api/crm/work-orders/${data.id}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === "/api/crm/dispatch/work-orders";
        }
      });
      toast({ title: "Work order updated", description: "Changes have been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    
    if (!over) return;
    
    const workOrderId = active.id as string;
    const targetCategory = over.id as UnassignedCategory;
    
    // Find the work order being dragged
    const draggedOrder = filteredWorkOrders.find(wo => wo.id === workOrderId);
    if (!draggedOrder) return;
    
    // Get the new dispatch stage
    const newDispatchStage = categoryToDispatchStage[targetCategory];
    
    // Only update if the stage is different
    if (draggedOrder.dispatchQueueStage !== newDispatchStage) {
      updateWorkOrderMutation.mutate({
        id: workOrderId,
        updates: { dispatchQueueStage: newDispatchStage as any },
      });
    }
  };

  const resetCreateForm = () => {
    setSelectedCustomer(null);
    setSelectedPropertyId("");
    setSelectedProjectId("");
    setWoTitle("");
    setWoDescription("");
    setVisitType("SERVICE");
    setWorkSubtype("Other");
    setScheduledDate(new Date());
    setStartTime("08:00");
    setEndTime("10:00");
    setAssignedTechId("unassigned");
    setPriority("normal");
    setCustomerSearch("");
    setCustomerSearchOpen(false);
    // Reset checklist state
    setChecklistQuestions([]);
    setChecklistAnswers({});
    setShowChecklist(true);
    setChecklistId(null);
  };

  // Generate checklist summary from questions and answers (local fallback)
  const generateLocalChecklistSummary = (): string => {
    if (checklistQuestions.length === 0) return "";
    
    const summaryParts: string[] = [];
    checklistQuestions.forEach(q => {
      const answer = checklistAnswers[q.id];
      if (answer !== undefined && answer !== "") {
        let answerText = String(answer);
        if (q.questionType === "yes_no") {
          answerText = answer === "yes" || answer === true ? "Yes" : "No";
        }
        summaryParts.push(`${q.question}: ${answerText}`);
      }
    });
    
    if (summaryParts.length === 0) return "";
    return "--- Service Call Checklist ---\n" + summaryParts.join("\n") + "\n---\n\n";
  };

  // Check if all required checklist questions are answered
  const areRequiredQuestionsAnswered = (): boolean => {
    if (visitType !== "SERVICE" || checklistQuestions.length === 0) return true;
    
    const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
    for (const q of requiredQuestions) {
      const answer = checklistAnswers[q.id];
      if (answer === undefined || answer === "" || answer === null) {
        return false;
      }
    }
    return true;
  };

  // Try AI summarization, fall back to local summary
  const generateChecklistSummary = async (): Promise<string> => {
    if (checklistQuestions.length === 0 || Object.keys(checklistAnswers).length === 0) return "";
    
    try {
      const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[workSubtype] || "OTHER";
      const res = await apiRequest("POST", "/api/ai/summarize-checklist", {
        questions: checklistQuestions,
        answers: checklistAnswers,
        serviceType,
      });
      const data = await res.json();
      if (data.summary) {
        return "--- Service Call Summary ---\n" + data.summary + "\n---\n\n";
      }
    } catch (err) {
      console.error("AI summarization failed, using local fallback:", err);
    }
    
    // Fallback to local summary
    return generateLocalChecklistSummary();
  };

  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error("Customer is required");
      if (!woTitle.trim()) throw new Error("Title is required");
      if (!woDescription.trim()) throw new Error("Description is required");
      
      // Validate required checklist questions are answered
      if (!areRequiredQuestionsAnswered()) {
        const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
        const missingQuestions = requiredQuestions.filter(q => {
          const answer = checklistAnswers[q.id];
          return answer === undefined || answer === "" || answer === null;
        });
        throw new Error(`Please answer required checklist questions: ${missingQuestions.map(q => q.question).join(", ")}`);
      }

      // Generate checklist summary (tries AI, falls back to local) and prepend to description
      const checklistSummary = await generateChecklistSummary();
      const finalDescription = checklistSummary + woDescription.trim();

      // Build schedule times only if we have a date
      let scheduledStartUTC = null;
      let scheduledEndUTC = null;
      if (scheduledDate) {
        const [startHours, startMinutes] = startTime.split(":").map(Number);
        const [endHours, endMinutes] = endTime.split(":").map(Number);
        scheduledStartUTC = createLocalDateTime(scheduledDate, startHours, startMinutes);
        scheduledEndUTC = createLocalDateTime(scheduledDate, endHours, endMinutes);
      }

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId: selectedCustomer.id,
        propertyId: selectedPropertyId || null,
        projectId: selectedProjectId || null,
        title: woTitle.trim(),
        description: finalDescription,
        visitType,
        workSubtype,
        scheduledStart: scheduledStartUTC?.toISOString() || null,
        scheduledEnd: scheduledEndUTC?.toISOString() || null,
        assignedTechId: assignedTechId === "unassigned" ? null : assignedTechId,
        priority,
        status: "scheduled",
      });
      const workOrder = await res.json();

      // Save checklist response if we have answers
      if (checklistId && Object.keys(checklistAnswers).length > 0) {
        try {
          await apiRequest("POST", `/api/crm/work-orders/${workOrder.id}/checklist-response`, {
            checklistId,
            answers: checklistAnswers,
            summary: checklistSummary,
          });
        } catch (err) {
          console.error("Failed to save checklist response:", err);
        }
      }

      return workOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      toast({ title: "Work order created", description: "New work order has been scheduled." });
      setCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (error: Error & { error?: string; conflictingOrder?: { title?: string; scheduledStart?: string } }) => {
      // Handle scheduling conflict errors specifically
      if (error?.error === 'SCHEDULING_CONFLICT' || error?.message === 'Scheduling conflict') {
        const conflictInfo = error?.conflictingOrder;
        const startTime = conflictInfo?.scheduledStart 
          ? format(new Date(conflictInfo.scheduledStart), "h:mm a")
          : "unknown time";
        toast({ 
          title: "Scheduling Conflict",
          description: `This technician already has "${conflictInfo?.title || 'a work order'}" scheduled at ${startTime}. You cannot schedule overlapping appointments.`,
          variant: "destructive" 
        });
      } else {
        toast({ title: "Creation failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const handleOpenDetail = (wo: EnrichedWorkOrder) => {
    // Navigate to the work order detail page
    navigate(`/crm/work-orders/${wo.id}`);
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
    if (selectedWorkOrder && rescheduleDate) {
      const [startHours, startMinutes] = rescheduleStartTime.split(":").map(Number);
      const [endHours, endMinutes] = rescheduleEndTime.split(":").map(Number);
      
      const scheduledStart = new Date(rescheduleDate);
      scheduledStart.setHours(startHours, startMinutes, 0, 0);
      
      const scheduledEnd = new Date(rescheduleDate);
      scheduledEnd.setHours(endHours, endMinutes, 0, 0);
      
      updateWorkOrderMutation.mutate({
        id: selectedWorkOrder.id,
        updates: {
          scheduledStart,
          scheduledEnd,
        },
      });
    }
  };
  
  const handleLinkProject = (projectId: string | null) => {
    if (selectedWorkOrder) {
      // Find the project to include in the optimistic update
      const linkedProject = projectId 
        ? linkableProjects.find(p => p.id === projectId) || null 
        : null;
      
      // Optimistically update the local state for immediate UI feedback
      setSelectedWorkOrder({
        ...selectedWorkOrder,
        projectId,
        project: linkedProject,
      });
      
      updateWorkOrderMutation.mutate({
        id: selectedWorkOrder.id,
        updates: { projectId },
      });
      setProjectSearchOpen(false);
      setProjectSearch("");
    }
  };

  const handleReassignCustomer = (newCustomer: CustomerWithInfo) => {
    if (!selectedWorkOrder) return;
    
    // Check if there's a linked project that needs to be updated
    const hasLinkedProject = !!selectedWorkOrder.projectId;
    
    // Optimistically update the selected work order
    setSelectedWorkOrder({
      ...selectedWorkOrder,
      customerId: newCustomer.id,
      customer: {
        id: newCustomer.id,
        displayName: newCustomer.name,
        name: newCustomer.name,
        customerType: newCustomer.customerType || "residential",
        customerStatus: "active",
      } as CrmCustomer,
      // Clear property since it belongs to old customer
      propertyId: null,
      property: null,
      // Clear project since projects are customer-specific
      projectId: null,
      project: null,
    });
    
    // Make the API call
    updateWorkOrderMutation.mutate({
      id: selectedWorkOrder.id,
      updates: { 
        customerId: newCustomer.id, 
        propertyId: null, // Clear property
        projectId: null, // Unlink project (user can relink to new customer's project)
        updateProjectCustomer: hasLinkedProject, // Update the project's customer if it existed
      },
    });
    
    setReassignCustomerSearchOpen(false);
    setReassignCustomerSearch("");
    
    toast({
      title: "Customer reassigned",
      description: hasLinkedProject 
        ? "Customer updated. Please select a new property and project for this customer."
        : "Customer updated. Please select a property for this customer.",
    });
  };

  const handleUpdateProperty = (propertyId: string) => {
    if (!selectedWorkOrder) return;
    
    const property = woProperties.find(p => p.id === propertyId) || null;
    
    setSelectedWorkOrder({
      ...selectedWorkOrder,
      propertyId,
      property,
    });
    
    updateWorkOrderMutation.mutate({
      id: selectedWorkOrder.id,
      updates: { propertyId },
    });
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

  const total = workOrdersData?.length || 0;

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
            <Select 
              value={visitTypeFilter} 
              onValueChange={(v) => setVisitTypeFilter(v as WorkOrderVisitType | "all")}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs border-0 bg-transparent focus:ring-0 focus:ring-offset-0" data-testid="select-visit-type-filter">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all" className="text-xs focus:bg-[#711419]/10 focus:text-[#711419]">All Types</SelectItem>
                {workOrderVisitTypeEnum.map((type) => (
                  <SelectItem key={type} value={type} className="text-xs focus:bg-[#711419]/10 focus:text-[#711419]">{visitTypeLabels[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              size="sm"
              data-testid="button-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Work Order
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
        ) : activeTab === "unassigned" && categorizedUnassigned ? (
          <DndContext 
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(Object.keys(unassignedCategoryConfig) as UnassignedCategory[]).map((category) => {
                  const config = unassignedCategoryConfig[category];
                  const categoryOrders = categorizedUnassigned[category];
                  
                  return (
                    <DroppableColumn 
                      key={category}
                      category={category}
                      config={config}
                      count={categoryOrders.length}
                    >
                      {categoryOrders.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-slate-400 text-xs">No work orders</p>
                        </div>
                      ) : (
                        categoryOrders.map((wo) => {
                          const visitStyle = visitTypeColors[wo.visitType || "SERVICE"] || visitTypeColors.SERVICE;
                          
                          return (
                            <DraggableWorkOrderCard
                              key={wo.id}
                              className="bg-white border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                              onMouseEnter={() => prefetchWorkOrder(wo.id)}
                              onTouchStart={() => prefetchWorkOrder(wo.id)}
                              wo={wo}
                              visitStyle={visitStyle}
                              onClick={() => handleOpenDetail(wo)}
                            />
                          );
                        })
                      )}
                    </DroppableColumn>
                  );
                })}
              </div>
            </div>
          </DndContext>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredWorkOrders.map((wo) => {
              // For unassigned work orders with dispatchQueueStage, show the queue stage badge instead of status
              const isUnassignedWithQueueStage = !wo.assignedTechId && wo.dispatchQueueStage && wo.dispatchQueueStage !== "Scheduled";
              const badgeStyle = isUnassignedWithQueueStage 
                ? (dispatchQueueStageColors[wo.dispatchQueueStage!] || statusColors.scheduled)
                : (statusColors[wo.status] || statusColors.scheduled);
              const badgeLabel = isUnassignedWithQueueStage 
                ? (dispatchQueueStageLabels[wo.dispatchQueueStage!] || statusLabels[wo.status])
                : statusLabels[wo.status];
              const visitStyle = visitTypeColors[wo.visitType || "SERVICE"] || visitTypeColors.SERVICE;
              
              return (
                <Card
                  key={wo.id}
                  className="bg-white border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onMouseEnter={() => prefetchWorkOrder(wo.id)}
                  onTouchStart={() => prefetchWorkOrder(wo.id)}
                  onClick={() => handleOpenDetail(wo)}
                  data-testid={`card-work-order-${wo.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-semibold text-slate-900 text-sm truncate flex-1" data-testid={`text-wo-customer-${wo.id}`}>
                        {wo.customer?.name || "—"}
                      </p>
                      <Badge 
                        className={`${badgeStyle.bg} ${badgeStyle.text} border ${badgeStyle.border} text-xs shrink-0`}
                        data-testid={`badge-status-${wo.id}`}
                      >
                        {badgeLabel}
                      </Badge>
                    </div>

                    {wo.workSubtype && wo.workSubtype !== "Other" && (
                      <p className="text-xs text-slate-600 truncate mb-2" data-testid={`text-wo-subtype-${wo.id}`}>
                        {wo.workSubtype}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={`${visitStyle.bg} ${visitStyle.text} text-xs`} data-testid={`badge-visit-type-${wo.id}`}>
                        {visitTypeLabels[wo.visitType || "SERVICE"]}
                      </Badge>
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
                {/* Customer Section with Reassignment */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Customer</h4>
                  <div className="flex items-center justify-between">
                    <p className="text-slate-900">{selectedWorkOrder.customer?.name || "—"}</p>
                    <Popover open={reassignCustomerSearchOpen} onOpenChange={setReassignCustomerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#711419] hover:bg-[#711419]/10"
                          data-testid="button-change-customer"
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Change
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-[350px] p-0 z-[100]" 
                        align="end"
                        sideOffset={4}
                        style={{ maxHeight: "300px", overflowY: "auto" }}
                      >
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search customers..."
                            value={reassignCustomerSearch}
                            onValueChange={setReassignCustomerSearch}
                            data-testid="input-reassign-customer-search"
                          />
                          <CommandList className="max-h-[250px]">
                            {reassignCustomersLoading ? (
                              <div className="p-4 text-center text-sm text-slate-500">
                                Loading...
                              </div>
                            ) : reassignCustomers.length === 0 ? (
                              <CommandEmpty>No customers found.</CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {reassignCustomers.map((customer) => (
                                  <CommandItem
                                    key={customer.id}
                                    value={customer.id}
                                    onSelect={() => handleReassignCustomer(customer)}
                                    data-testid={`reassign-customer-${customer.id}`}
                                  >
                                    <User className="h-4 w-4 mr-2 text-slate-500" />
                                    <div>
                                      <p className="font-medium">{customer.name}</p>
                                      <p className="text-xs text-slate-500">{customer.fullAddress || customer.customerType}</p>
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
                </div>

                {/* Location Section with Selector */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Location <span className="text-red-500">*</span></h4>
                  {woProperties.length > 0 ? (
                    <Select 
                      value={selectedWorkOrder.propertyId || ""} 
                      onValueChange={handleUpdateProperty}
                    >
                      <SelectTrigger className="w-full" data-testid="select-location">
                        <SelectValue placeholder="Select a location">
                          {selectedWorkOrder.property 
                            ? getPropertyAddress(selectedWorkOrder.property) 
                            : "Select a location"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {woProperties.map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {getPropertyAddress(property)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-500">No locations for this customer</p>
                      {selectedWorkOrder.customerId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSheetOpen(false);
                            navigate(`/crm/customers/${selectedWorkOrder.customerId}`);
                          }}
                          className="w-full"
                          data-testid="button-add-location"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Location
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Project Linking Section */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Linked Project</h4>
                  {selectedWorkOrder.project ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-slate-500" />
                        <Link 
                          to={`/crm/projects/${selectedWorkOrder.projectId}`}
                          className="text-[#711419] hover:underline font-medium"
                        >
                          {selectedWorkOrder.project.title}
                        </Link>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleLinkProject(null)}
                        className="text-slate-500 hover:text-red-600"
                        data-testid="button-unlink-project"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : linkableProjectsLoading ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                  ) : (
                    <Popover open={projectSearchOpen} onOpenChange={setProjectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start"
                          data-testid="button-add-to-project"
                        >
                          <FolderOpen className="h-4 w-4 mr-2" />
                          {linkableProjects.length === 0 ? "No projects - Create one" : "Add to Project"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search projects..."
                            value={projectSearch}
                            onValueChange={setProjectSearch}
                            data-testid="input-project-search"
                          />
                          <CommandList>
                            {linkableProjects.length === 0 ? (
                              <div className="p-4 text-center">
                                <p className="text-sm text-slate-500 mb-3">No projects for this customer</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setProjectSearchOpen(false);
                                    setSheetOpen(false);
                                    navigate(`/crm/customers/${selectedWorkOrder.customerId}`);
                                  }}
                                  data-testid="button-create-project"
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Create Project
                                </Button>
                              </div>
                            ) : (
                              <CommandGroup>
                                {linkableProjects.map((project) => (
                                  <CommandItem
                                    key={project.id}
                                    value={project.id}
                                    onSelect={() => handleLinkProject(project.id)}
                                    data-testid={`project-option-${project.id}`}
                                  >
                                    <FolderOpen className="h-4 w-4 mr-2 text-slate-500" />
                                    <div>
                                      <p className="font-medium">{project.title}</p>
                                      <p className="text-xs text-slate-500">{project.projectType}</p>
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
                      variant="outline"
                      onClick={handleUpdateStatus}
                      disabled={updateWorkOrderMutation.isPending || newStatus === selectedWorkOrder.status}
                      className="text-slate-700 hover:bg-slate-100"
                      data-testid="button-update-status"
                    >
                      Update
                    </Button>
                  </div>
                </div>

                {selectedWorkOrder.status === "on_site" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-800 font-medium">Technician is working</p>
                    <p className="text-xs text-amber-600">Assignment and schedule cannot be changed while work is in progress.</p>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Assigned Tech</h4>
                  <div className="flex items-center gap-2">
                    <Select value={reassignTechId} onValueChange={setReassignTechId} disabled={selectedWorkOrder.status === "on_site"}>
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
                      variant="outline"
                      onClick={handleReassignTech}
                      disabled={updateWorkOrderMutation.isPending || selectedWorkOrder.status === "on_site"}
                      className="text-slate-700 hover:bg-slate-100"
                      data-testid="button-reassign-tech"
                    >
                      Assign
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Schedule</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !rescheduleDate && "text-muted-foreground"
                            )}
                            data-testid="button-reschedule-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {rescheduleDate ? format(rescheduleDate, "MMM d, yyyy") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={rescheduleDate}
                            onSelect={setRescheduleDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Start</Label>
                      <Select value={rescheduleStartTime} onValueChange={setRescheduleStartTime}>
                        <SelectTrigger data-testid="select-reschedule-start-time">
                          <SelectValue placeholder="Start" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {timeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End</Label>
                      <Select value={rescheduleEndTime} onValueChange={setRescheduleEndTime}>
                        <SelectTrigger data-testid="select-reschedule-end-time">
                          <SelectValue placeholder="End" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {timeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReschedule}
                    disabled={updateWorkOrderMutation.isPending || !rescheduleDate || selectedWorkOrder.status === "on_site"}
                    className="text-slate-700 hover:bg-slate-100"
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
                    variant="outline"
                    onClick={handleSaveTechNotes}
                    disabled={updateWorkOrderMutation.isPending}
                    className="text-slate-700 hover:bg-slate-100"
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
                      variant="outline"
                      onClick={handleSaveChecklist}
                      disabled={updateWorkOrderMutation.isPending}
                      className="text-slate-700 hover:bg-slate-100"
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
                  <PopoverContent 
                    className="w-[var(--radix-popover-trigger-width)] min-w-[350px] p-0 z-[100]" 
                    align="start"
                    sideOffset={4}
                    style={{ maxHeight: "300px", overflowY: "auto" }}
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type to search customers..."
                        value={customerSearch}
                        onValueChange={setCustomerSearch}
                        data-testid="input-customer-search"
                      />
                      <CommandList className="max-h-[250px]">
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

              {/* Maintenance Agreement Info Display */}
              {selectedCustomer && activeAgreements.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">Active Maintenance Agreement</span>
                  </div>
                  {activeAgreements.map((agreement) => (
                    <div key={agreement.id} className="text-sm text-amber-700">
                      <p className="font-medium">{agreement.displayName}</p>
                      <div className="flex flex-wrap gap-3 text-xs mt-1">
                        {agreement.frequency && <span>Billing: {agreement.frequency}</span>}
                        {agreement.visitsPerPeriod && <span>Visits: {agreement.visitsPerPeriod}/period</span>}
                        {agreement.nextServiceDate && (
                          <span>Next Service: {new Date(agreement.nextServiceDate).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedCustomer && (
                <div className="space-y-2">
                  <Label>Location <span className="text-red-500">*</span></Label>
                  {properties.length > 0 ? (
                    <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                      <SelectTrigger data-testid="select-location">
                        <SelectValue placeholder="Select a location" />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map((prop) => (
                          <SelectItem key={prop.id} value={prop.id}>
                            {prop.address1}, {prop.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-500">No locations for this customer</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCreateDialogOpen(false);
                          navigate(`/crm/customers/${selectedCustomer.id}`);
                        }}
                        className="w-full"
                        data-testid="button-add-location-create"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Location First
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Visit Type</Label>
                  <Select 
                    value={visitType} 
                    onValueChange={(v) => {
                      const vt = v as WorkOrderVisitType;
                      setVisitType(vt);
                      // Set default subtype - use maintenanceSubtypes for MAINTENANCE, otherwise dynamic list
                      if (vt === "MAINTENANCE") {
                        setWorkSubtype(maintenanceSubtypes[0] || "Preventative Maintenance");
                      } else {
                        const subtypes = getSubtypesForVisitType(vt);
                        setWorkSubtype(subtypes.length > 0 ? subtypes[0].subtype : "Other");
                      }
                    }}
                  >
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

              <div className="space-y-2">
                <Label>Work Subtype</Label>
                <Select value={workSubtype} onValueChange={(v) => setWorkSubtype(v as WorkSubtype)}>
                  <SelectTrigger data-testid="select-work-subtype">
                    <SelectValue placeholder="Select subtype" />
                  </SelectTrigger>
                  <SelectContent>
                    {visitType === "MAINTENANCE" ? (
                      maintenanceSubtypes.map((subtype) => (
                        <SelectItem key={subtype} value={subtype}>
                          {subtype}
                        </SelectItem>
                      ))
                    ) : getSubtypesForVisitType(visitType).length > 0 ? (
                      getSubtypesForVisitType(visitType).map((s) => (
                        <SelectItem key={s.id} value={s.subtype}>
                          {s.subtype}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="Other">Other</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Service Call Checklist Section */}
              {visitType === "SERVICE" && (checklistLoading || checklistQuestions.length > 0) && (
                <Collapsible open={showChecklist} onOpenChange={setShowChecklist} className="space-y-2">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex w-full justify-between p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg"
                      data-testid="button-toggle-checklist"
                    >
                      <div className="flex items-center gap-2">
                        {Object.keys(checklistAnswers).length === checklistQuestions.length && checklistQuestions.length > 0 ? (
                          <ClipboardCheck className="h-5 w-5 text-amber-700" />
                        ) : (
                          <Clipboard className="h-5 w-5 text-amber-700" />
                        )}
                        <span className="font-medium text-amber-900">Service Call Checklist</span>
                        {checklistQuestions.length > 0 && (
                          <span className="text-sm text-amber-600">
                            ({Object.keys(checklistAnswers).filter(k => checklistAnswers[k] !== undefined && checklistAnswers[k] !== "").length}/{checklistQuestions.length} answered)
                          </span>
                        )}
                      </div>
                      <ChevronDown className={cn(
                        "h-4 w-4 text-amber-700 transition-transform",
                        showChecklist && "rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 space-y-4">
                    {checklistLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : checklistQuestions.length === 0 ? (
                      <p className="text-sm text-amber-700">No checklist questions available for this service type.</p>
                    ) : (
                      checklistQuestions.map((question) => (
                        <div key={question.id} className="space-y-2">
                          <Label className="text-sm font-medium text-amber-900">
                            {question.question}
                            {question.isRequired && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                          {question.helpText && (
                            <p className="text-xs text-amber-600">{question.helpText}</p>
                          )}
                          
                          {question.questionType === "yes_no" && (
                            <RadioGroup
                              value={checklistAnswers[question.id] as string || ""}
                              onValueChange={(value) => setChecklistAnswers(prev => ({ ...prev, [question.id]: value }))}
                              className="flex gap-4"
                              data-testid={`radio-${question.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="yes" id={`${question.id}-yes`} />
                                <Label htmlFor={`${question.id}-yes`} className="font-normal cursor-pointer">Yes</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="no" id={`${question.id}-no`} />
                                <Label htmlFor={`${question.id}-no`} className="font-normal cursor-pointer">No</Label>
                              </div>
                            </RadioGroup>
                          )}
                          
                          {question.questionType === "text" && (
                            <Input
                              value={checklistAnswers[question.id] as string || ""}
                              onChange={(e) => setChecklistAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                              placeholder="Enter response..."
                              className="bg-white"
                              data-testid={`input-${question.id}`}
                            />
                          )}
                          
                          {question.questionType === "number" && (
                            <Input
                              type="number"
                              value={checklistAnswers[question.id] as number || ""}
                              onChange={(e) => setChecklistAnswers(prev => ({ ...prev, [question.id]: e.target.value ? Number(e.target.value) : "" }))}
                              placeholder="Enter number..."
                              className="bg-white"
                              data-testid={`input-${question.id}`}
                            />
                          )}
                          
                          {question.questionType === "select" && question.options && (
                            <Select
                              value={checklistAnswers[question.id] as string || ""}
                              onValueChange={(value) => setChecklistAnswers(prev => ({ ...prev, [question.id]: value }))}
                            >
                              <SelectTrigger className="bg-white" data-testid={`select-${question.id}`}>
                                <SelectValue placeholder="Select an option..." />
                              </SelectTrigger>
                              <SelectContent>
                                {question.options.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ))
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="space-y-2">
                <Label>Assign Technician</Label>
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
                {assignedTechId === "unassigned" && (
                  <p className="text-xs text-slate-500 mt-1">Leave unassigned to add to backlog.</p>
                )}
              </div>

              {assignedTechId !== "unassigned" && (
                <>
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

                  {scheduledDate && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Start Time</Label>
                        <Select value={startTime} onValueChange={setStartTime}>
                          <SelectTrigger data-testid="select-start-time">
                            <SelectValue placeholder="Start" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {timeOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>End Time</Label>
                        <Select value={endTime} onValueChange={setEndTime}>
                          <SelectTrigger data-testid="select-end-time">
                            <SelectValue placeholder="End" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {timeOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                  placeholder="Brief title for the work order"
                  data-testid="input-wo-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  value={woDescription}
                  onChange={(e) => setWoDescription(e.target.value)}
                  placeholder="Describe the work to be done..."
                  className="min-h-[80px]"
                  data-testid="textarea-description"
                />
              </div>

              {selectedCustomer && projects.length > 0 && (
                <div className="space-y-2">
                  <Label>Link to Project</Label>
                  <Select value={selectedProjectId || "none"} onValueChange={(v) => setSelectedProjectId(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-project">
                      <SelectValue placeholder="Select project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project linked</SelectItem>
                      {projects.map((proj) => (
                        <SelectItem key={proj.id} value={proj.id}>
                          {proj.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                disabled={createWorkOrderMutation.isPending || !selectedCustomer || !woTitle.trim() || !woDescription.trim() || !areRequiredQuestionsAnswered() || (assignedTechId !== "unassigned" && !scheduledDate)}
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
