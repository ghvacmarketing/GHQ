import { useState, useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle,
  Circle,
  XCircle,
  Navigation,
  Plus,
  ClipboardList,
  DollarSign,
  FileText,
  ExternalLink,
  Wrench,
  MapPin,
  Package,
  AlertTriangle,
  Pencil,
  FolderOpen,
  Edit,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { CrmUser, CrmJob, CrmProperty, CrmWorkOrder, CrmInvoice, CrmQuote, CrmCustomer, CrmProject, WorkOrderStatus } from "@shared/schema";

type WorkOrderDetail = CrmWorkOrder & {
  job: CrmJob | null;
  customer: CrmCustomer | null;
  property: CrmProperty | null;
  project: CrmProject | null;
  tech: CrmUser | null;
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

const workOrderStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  en_route: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  on_site: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
};

const quoteStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  accepted: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  declined: { bg: "bg-red-100", text: "text-red-600", border: "border-red-200" },
  expired: { bg: "bg-orange-100", text: "text-orange-600", border: "border-orange-200" },
};

const invoiceStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  paid: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  void: { bg: "bg-red-100", text: "text-red-600", border: "border-red-200" },
  partial: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  overdue: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
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

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600" },
  normal: { bg: "bg-blue-100", text: "text-blue-700" },
  high: { bg: "bg-orange-100", text: "text-orange-700" },
  urgent: { bg: "bg-red-100", text: "text-red-700" },
};

const timeSlots = [
  { value: "08:00-10:00", label: "8:00 AM - 10:00 AM" },
  { value: "10:00-12:00", label: "10:00 AM - 12:00 PM" },
  { value: "13:00-15:00", label: "1:00 PM - 3:00 PM" },
  { value: "15:00-17:00", label: "3:00 PM - 5:00 PM" },
];

function formatShortDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return format(d, "EEE, MMM d");
}

function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return format(d, "MMM d, yyyy h:mm a");
}

function formatTimeRange(start: Date | string | null, end: Date | string | null): string {
  if (!start) return "Not scheduled";
  const s = new Date(start);
  const startTime = format(s, "h:mm a");
  if (!end) return startTime;
  const e = new Date(end);
  const endTime = format(e, "h:mm a");
  return `${startTime} - ${endTime}`;
}

function getGoogleMapsUrl(property: CrmProperty): string {
  const address = [
    property.address1,
    property.address2,
    property.city,
    property.state,
    property.zip,
  ]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getTimeSlotFromSchedule(start: Date | string | null): string {
  if (!start) return "08:00-10:00";
  const startDate = new Date(start);
  const hours = startDate.getHours();
  if (hours >= 8 && hours < 10) return "08:00-10:00";
  if (hours >= 10 && hours < 13) return "10:00-12:00";
  if (hours >= 13 && hours < 15) return "13:00-15:00";
  if (hours >= 15 && hours < 17) return "15:00-17:00";
  return "08:00-10:00";
}

function getPropertyAddress(property: CrmProperty | null): string {
  if (!property) return "";
  const parts = [property.address1];
  if (property.address2) parts.push(property.address2);
  parts.push(`${property.city}, ${property.state} ${property.zip}`);
  return parts.join(", ");
}

export default function CrmWorkOrderDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const workOrderId = params.id;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("details");
  const [createQuoteDialogOpen, setCreateQuoteDialogOpen] = useState(false);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteDescription, setQuoteDescription] = useState("");

  const [newStatus, setNewStatus] = useState<string>("");
  const [reassignTechId, setReassignTechId] = useState<string>("unassigned");
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState<string>("");
  const [editingTechNotes, setEditingTechNotes] = useState<string>("");
  const [editingChecklist, setEditingChecklist] = useState<{ item: string; completed: boolean }[]>([]);
  const [billingDisposition, setBillingDisposition] = useState<string>("not_set");
  const [billingNotes, setBillingNotes] = useState<string>("");

  const [projectSearch, setProjectSearch] = useState("");
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);

  const [reassignCustomerSearch, setReassignCustomerSearch] = useState("");
  const [reassignCustomerSearchOpen, setReassignCustomerSearchOpen] = useState(false);
  const debouncedReassignCustomerSearch = useDebounce(reassignCustomerSearch, 300);
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

  const { data: workOrder, isLoading: workOrderLoading, error: workOrderError } = useQuery<WorkOrderDetail>({
    queryKey: ["/api/crm/work-orders", workOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${workOrderId}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Work order not found");
        throw new Error("Failed to fetch work order");
      }
      return res.json();
    },
    enabled: !!currentUser && !!workOrderId,
  });

  useEffect(() => {
    if (workOrder) {
      setNewStatus(workOrder.status);
      setReassignTechId(workOrder.assignedTechId || "unassigned");
      setEditingTechNotes(workOrder.techNotes || "");
      setEditingChecklist(workOrder.checklist || []);
      setBillingDisposition(workOrder.billingDisposition || "not_set");
      setBillingNotes(workOrder.billingNotes || "");
      if (workOrder.scheduledStart) {
        setRescheduleDate(new Date(workOrder.scheduledStart));
        setRescheduleTimeSlot(getTimeSlotFromSchedule(workOrder.scheduledStart));
      }
    }
  }, [workOrder]);

  const { data: quotes, isLoading: quotesLoading } = useQuery<CrmQuote[]>({
    queryKey: ["/api/crm/work-orders", workOrderId, "quotes"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${workOrderId}/quotes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    enabled: !!currentUser && !!workOrderId,
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<CrmInvoice[]>({
    queryKey: ["/api/crm/work-orders", workOrderId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${workOrderId}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!currentUser && !!workOrderId,
  });

  const { data: techniciansData } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const technicians = (techniciansData || []).filter(u => u.role === "tech");

  const { data: propertiesData } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", workOrder?.customerId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/properties?customerId=${workOrder?.customerId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!currentUser && !!workOrder?.customerId,
  });

  const properties = propertiesData || [];

  const { data: projectsResponse, isLoading: projectsLoading } = useQuery<{ projects: CrmProject[]; pagination: any }>({
    queryKey: ["/api/crm/projects", workOrder?.customerId, debouncedProjectSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workOrder?.customerId) params.set("customerId", workOrder.customerId);
      if (debouncedProjectSearch) params.set("search", debouncedProjectSearch);
      const res = await fetch(`/api/crm/projects?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!currentUser && !!workOrder?.customerId,
  });

  const linkableProjects = projectsResponse?.projects || [];

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
    enabled: !!currentUser && reassignCustomerSearchOpen,
  });

  const reassignCustomers = reassignCustomersData?.customers || [];

  const createQuoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/quotes", {
        title: quoteTitle,
        description: quoteDescription,
        scope: "work_order",
        workOrderId: workOrderId,
        customerId: workOrder?.customerId || workOrder?.customer?.id,
        propertyId: workOrder?.propertyId || workOrder?.property?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId, "quotes"] });
      setCreateQuoteDialogOpen(false);
      setQuoteTitle("");
      setQuoteDescription("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create quote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/invoices", {
        workOrderId: workOrderId,
        customerId: workOrder?.customerId || workOrder?.customer?.id,
        propertyId: workOrder?.propertyId || workOrder?.property?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId, "invoices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (data: { updates: Partial<CrmWorkOrder> & { updateProjectCustomer?: boolean } }) => {
      const res = await apiRequest("PATCH", `/api/crm/work-orders/${workOrderId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId] });
      toast({ title: "Work order updated", description: "Changes have been saved." });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update work order",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateQuote = () => {
    if (quoteTitle.trim()) {
      createQuoteMutation.mutate();
    }
  };

  const handleUpdateStatus = () => {
    if (newStatus) {
      updateWorkOrderMutation.mutate({
        updates: { status: newStatus as WorkOrderStatus },
      });
    }
  };

  const handleReassignTech = () => {
    updateWorkOrderMutation.mutate({
      updates: { assignedTechId: reassignTechId === "unassigned" ? null : (reassignTechId || null) },
    });
  };

  const handleReschedule = () => {
    if (rescheduleDate && rescheduleTimeSlot) {
      const [startTimeStr, endTimeStr] = rescheduleTimeSlot.split("-");
      const [startHours, startMinutes] = startTimeStr.split(":").map(Number);
      const [endHours, endMinutes] = endTimeStr.split(":").map(Number);
      
      const scheduledStart = new Date(rescheduleDate);
      scheduledStart.setHours(startHours, startMinutes, 0, 0);
      
      const scheduledEnd = new Date(rescheduleDate);
      scheduledEnd.setHours(endHours, endMinutes, 0, 0);
      
      updateWorkOrderMutation.mutate({
        updates: {
          scheduledStart,
          scheduledEnd,
        },
      });
    }
  };

  const handleSaveTechNotes = () => {
    updateWorkOrderMutation.mutate({
      updates: { techNotes: editingTechNotes },
    });
  };

  const handleSaveChecklist = () => {
    updateWorkOrderMutation.mutate({
      updates: { checklist: editingChecklist },
    });
  };

  const handleSaveBilling = () => {
    updateWorkOrderMutation.mutate({
      updates: { 
        billingDisposition: billingDisposition as any,
        billingNotes: billingNotes,
      },
    });
  };

  const handleLinkProject = (projectId: string | null) => {
    updateWorkOrderMutation.mutate({
      updates: { projectId },
    });
    setProjectSearchOpen(false);
    setProjectSearch("");
  };

  const handleUpdateProperty = (propertyId: string) => {
    updateWorkOrderMutation.mutate({
      updates: { propertyId },
    });
  };

  const handleReassignCustomer = (newCustomer: CustomerWithInfo) => {
    if (!workOrder) return;
    
    const hasLinkedProject = !!workOrder.projectId;
    
    updateWorkOrderMutation.mutate({
      updates: { 
        customerId: newCustomer.id, 
        propertyId: null,
        projectId: null,
        updateProjectCustomer: hasLinkedProject,
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

  if (authLoading || workOrderLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (workOrderError || !workOrder) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="space-y-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/crm/work-orders")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Work Orders
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <XCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Work order not found</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const propertyAddress = workOrder.property
    ? [workOrder.property.address1, workOrder.property.city, workOrder.property.state].filter(Boolean).join(", ")
    : null;

  const statusColor = workOrderStatusColors[workOrder.status] || workOrderStatusColors.scheduled;
  const priorityColor = priorityColors[workOrder.priority || "normal"];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/crm/work-orders")}
                    className="-ml-2"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Work Orders
                  </Button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1
                    className="text-xl font-bold text-slate-900"
                    data-testid="text-work-order-title"
                  >
                    {workOrder.title || `Work Order #${workOrder.workOrderNumber}`}
                  </h1>
                  <Badge
                    className={`${statusColor.bg} ${statusColor.text} border ${statusColor.border}`}
                    data-testid="badge-status"
                  >
                    {statusLabels[workOrder.status] || workOrder.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    data-testid="badge-visit-type"
                  >
                    {visitTypeLabels[workOrder.visitType || "SERVICE"]}
                  </Badge>
                  <Badge
                    className={`${priorityColor.bg} ${priorityColor.text}`}
                    data-testid="badge-priority"
                  >
                    {(workOrder.priority || "normal").charAt(0).toUpperCase() + (workOrder.priority || "normal").slice(1)} Priority
                  </Badge>
                </div>
                {propertyAddress && (
                  <p className="text-sm text-slate-500 mt-1" data-testid="text-property-address">
                    {propertyAddress}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                {workOrder.scheduledStart && (
                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg">
                    <CalendarIcon className="h-4 w-4 text-slate-500" />
                    <span>{formatShortDate(workOrder.scheduledStart)}</span>
                    <Clock className="h-4 w-4 text-slate-500 ml-2" />
                    <span>{formatTimeRange(workOrder.scheduledStart, workOrder.scheduledEnd)}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
            <TabsTrigger
              value="details"
              data-testid="tab-details"
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none"
            >
              <ClipboardList className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Details</span>
            </TabsTrigger>
            <TabsTrigger
              value="quotes"
              data-testid="tab-quotes"
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none"
            >
              <FileText className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Quotes</span>
            </TabsTrigger>
            <TabsTrigger
              value="invoices"
              data-testid="tab-invoices"
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none"
            >
              <DollarSign className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Invoices</span>
            </TabsTrigger>
            <TabsTrigger
              value="edit"
              data-testid="tab-edit"
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none"
            >
              <Pencil className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Edit</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <User className="h-4 w-4 text-[#711419]" />
                    Customer & Site
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {workOrder.customer && (
                    <div>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-base font-semibold text-slate-900 hover:text-[#711419]"
                        onClick={() => navigate(`/crm/customers/${workOrder.customer!.id}`)}
                        data-testid="link-customer"
                      >
                        {workOrder.customer.name}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  )}
                  {workOrder.customer?.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <a href={`tel:${workOrder.customer.phone}`} className="hover:text-[#711419]" data-testid="link-phone">
                        {workOrder.customer.phone}
                      </a>
                    </div>
                  )}
                  {workOrder.customer?.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <a href={`mailto:${workOrder.customer.email}`} className="hover:text-[#711419] truncate" data-testid="link-email">
                        {workOrder.customer.email}
                      </a>
                    </div>
                  )}
                  {workOrder.property && (
                    <div className="pt-3 border-t">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Property</p>
                          <p className="font-medium text-sm text-slate-900" data-testid="text-address-line1">
                            {workOrder.property.address1}
                          </p>
                          <p className="text-slate-600 text-sm" data-testid="text-address-city">
                            {workOrder.property.city}, {workOrder.property.state} {workOrder.property.zip}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" asChild data-testid="button-directions">
                          <a href={getGoogleMapsUrl(workOrder.property)} target="_blank" rel="noopener noreferrer">
                            <Navigation className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Wrench className="h-4 w-4 text-[#711419]" />
                    Assignment
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Technician</p>
                    <p className="font-medium text-sm text-slate-900" data-testid="text-tech-name">
                      {workOrder.tech?.name || "Unassigned"}
                    </p>
                  </div>
                  {workOrder.job && (
                    <div className="pt-3 border-t">
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Linked Job</p>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-sm font-medium text-slate-900 hover:text-[#711419]"
                        onClick={() => navigate(`/crm/jobs/${workOrder.job!.id}`)}
                        data-testid="link-job"
                      >
                        {workOrder.job.jobType} - #{workOrder.job.id.slice(-6)}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  )}
                  {workOrder.project && (
                    <div className="pt-3 border-t">
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Linked Project</p>
                      <p className="font-medium text-sm text-slate-900" data-testid="text-project-name">
                        {workOrder.project.title || workOrder.project.projectType}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <DollarSign className="h-4 w-4 text-[#711419]" />
                    Billing
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Disposition</p>
                    <p className="font-medium text-sm text-slate-900" data-testid="text-billing-disposition">
                      {workOrder.billingDisposition || "Not set"}
                    </p>
                  </div>
                  {workOrder.billingNotes && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Notes</p>
                      <p className="text-sm text-slate-600">{workOrder.billingNotes}</p>
                    </div>
                  )}
                  <div className="pt-3 border-t">
                    <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Quotes</p>
                    <p className="font-medium text-sm text-slate-900">{quotes?.length || 0} quote(s)</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Invoices</p>
                    <p className="font-medium text-sm text-slate-900">{invoices?.length || 0} invoice(s)</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="text-base font-semibold">Description & Notes</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {workOrder.description && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Description</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-description">
                        {workOrder.description}
                      </p>
                    </div>
                  )}
                  {workOrder.techNotes && (
                    <div className="pt-3 border-t">
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Tech Notes</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-tech-notes">
                        {workOrder.techNotes}
                      </p>
                    </div>
                  )}
                  {!workOrder.description && !workOrder.techNotes && (
                    <p className="text-sm text-slate-500 italic">No description or notes available</p>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 border-b bg-slate-50/50">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <CheckCircle className="h-4 w-4 text-[#711419]" />
                      Checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {workOrder.checklist && workOrder.checklist.length > 0 ? (
                      <ul className="space-y-2">
                        {workOrder.checklist.map((item, index) => (
                          <li key={index} className="flex items-center gap-2">
                            {item.completed ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <Circle className="h-4 w-4 text-slate-300" />
                            )}
                            <span className={`text-sm ${item.completed ? "text-slate-500 line-through" : "text-slate-700"}`}>
                              {item.item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No checklist items</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3 border-b bg-slate-50/50">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <Package className="h-4 w-4 text-[#711419]" />
                      Parts Used
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {workOrder.partsUsed && workOrder.partsUsed.length > 0 ? (
                      <ul className="space-y-2">
                        {workOrder.partsUsed.map((part, index) => (
                          <li key={index} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700">{part.name} x{part.qty}</span>
                            <span className="text-slate-500">{formatCurrency(part.price * part.qty)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No parts recorded</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="quotes" className="mt-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Quotes</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setCreateQuoteDialogOpen(true)}
                    data-testid="button-create-quote"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create Quote
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {quotesLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : quotes && quotes.length > 0 ? (
                  <div className="space-y-3">
                    {quotes.map((quote) => {
                      const qStatusColor = quoteStatusColors[quote.status] || quoteStatusColors.draft;
                      return (
                        <div
                          key={quote.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50"
                          data-testid={`quote-item-${quote.id}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{quote.title}</span>
                              <Badge
                                className={`${qStatusColor.bg} ${qStatusColor.text} border ${qStatusColor.border} text-xs`}
                              >
                                {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500">
                              #{quote.quoteNumber} • {formatCurrency(quote.total)}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" data-testid={`button-view-quote-${quote.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 mb-4">No quotes yet</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateQuoteDialogOpen(true)}
                      data-testid="button-create-quote-empty"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create First Quote
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Invoices</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => createInvoiceMutation.mutate()}
                    disabled={createInvoiceMutation.isPending}
                    data-testid="button-create-invoice"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {invoicesLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : invoices && invoices.length > 0 ? (
                  <div className="space-y-3">
                    {invoices.map((invoice) => {
                      const invStatusColor = invoiceStatusColors[invoice.status] || invoiceStatusColors.draft;
                      return (
                        <div
                          key={invoice.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50"
                          data-testid={`invoice-item-${invoice.id}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">Invoice #{invoice.invoiceNumber}</span>
                              <Badge
                                className={`${invStatusColor.bg} ${invStatusColor.text} border ${invStatusColor.border} text-xs`}
                              >
                                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500">
                              {formatCurrency(invoice.total)} • {formatDateTime(invoice.createdAt)}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" data-testid={`button-view-invoice-${invoice.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 mb-4">No invoices yet</p>
                    {workOrder.billingDisposition && (
                      <p className="text-xs text-slate-400 mb-4">
                        Billing Disposition: {workOrder.billingDisposition}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => createInvoiceMutation.mutate()}
                      disabled={createInvoiceMutation.isPending}
                      data-testid="button-create-invoice-empty"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create First Invoice
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit" className="mt-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b bg-slate-50/50">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Pencil className="h-4 w-4 text-[#711419]" />
                  Edit Work Order
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Customer</h4>
                  <div className="flex items-center justify-between">
                    <p className="text-slate-900">{workOrder.customer?.name || "—"}</p>
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
                      <PopoverContent className="w-[350px] p-0" align="end">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search customers..."
                            value={reassignCustomerSearch}
                            onValueChange={setReassignCustomerSearch}
                            data-testid="input-customer-search"
                          />
                          <CommandList>
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

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Site <span className="text-red-500">*</span></h4>
                  {properties.length > 0 ? (
                    <Select 
                      value={workOrder.propertyId || ""} 
                      onValueChange={handleUpdateProperty}
                    >
                      <SelectTrigger className="w-full" data-testid="select-edit-site">
                        <SelectValue placeholder="Select a site">
                          {workOrder.property 
                            ? getPropertyAddress(workOrder.property) 
                            : "Select a site"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {getPropertyAddress(property)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-500">No sites for this customer</p>
                      {workOrder.customerId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/crm/customers/${workOrder.customerId}`)}
                          className="w-full"
                          data-testid="button-add-site"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Site
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Linked Project</h4>
                  {workOrder.project ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-slate-500" />
                        <Link 
                          to={`/crm/projects/${workOrder.projectId}`}
                          className="text-[#711419] hover:underline font-medium"
                        >
                          {workOrder.project.title}
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
                  ) : projectsLoading ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                  ) : (
                    <Popover open={projectSearchOpen} onOpenChange={setProjectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start"
                          data-testid="button-link-project"
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
                                    navigate(`/crm/customers/${workOrder.customerId}`);
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
                      <SelectTrigger className="w-[180px]" data-testid="select-edit-status">
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
                      disabled={updateWorkOrderMutation.isPending || newStatus === workOrder.status}
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
                      <SelectTrigger className="w-[180px]" data-testid="select-edit-tech">
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
                      data-testid="button-assign-tech"
                    >
                      Assign
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Schedule</h4>
                  <div className="grid grid-cols-2 gap-3">
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
                            data-testid="calendar-reschedule"
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
                      <Label className="text-xs">Time Slot</Label>
                      <Select value={rescheduleTimeSlot} onValueChange={setRescheduleTimeSlot}>
                        <SelectTrigger data-testid="select-edit-time-slot">
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot.value} value={slot.value}>
                              {slot.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleReschedule}
                    disabled={updateWorkOrderMutation.isPending || !rescheduleDate || !rescheduleTimeSlot}
                    data-testid="button-reschedule"
                  >
                    Reschedule
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Checklist</h4>
                  <div className="space-y-2">
                    {editingChecklist.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Checkbox
                          id={`checklist-item-${index}`}
                          checked={item.completed}
                          onCheckedChange={(checked) => {
                            const newList = [...editingChecklist];
                            newList[index] = { ...item, completed: !!checked };
                            setEditingChecklist(newList);
                          }}
                        />
                        <Input
                          value={item.item}
                          onChange={(e) => {
                            const newList = [...editingChecklist];
                            newList[index] = { ...item, item: e.target.value };
                            setEditingChecklist(newList);
                          }}
                          className="h-8 text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-500"
                          onClick={() => {
                            setEditingChecklist(editingChecklist.filter((_, i) => i !== index));
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setEditingChecklist([...editingChecklist, { item: "", completed: false }])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Item
                    </Button>
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

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Billing Disposition</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Disposition</Label>
                      <Select value={billingDisposition} onValueChange={setBillingDisposition}>
                        <SelectTrigger data-testid="select-billing-disposition">
                          <SelectValue placeholder="Select disposition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_set">Not Set</SelectItem>
                          <SelectItem value="invoice_created">Invoice Created</SelectItem>
                          <SelectItem value="no_charge">No Charge</SelectItem>
                          <SelectItem value="billed_elsewhere">Billed Elsewhere</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Billing Notes</Label>
                      <Textarea
                        value={billingNotes}
                        onChange={(e) => setBillingNotes(e.target.value)}
                        placeholder="Billing specific notes..."
                        className="min-h-[80px]"
                        data-testid="textarea-billing-notes"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveBilling}
                    disabled={updateWorkOrderMutation.isPending}
                    data-testid="button-save-billing"
                  >
                    Save Billing Info
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
                    data-testid="textarea-edit-tech-notes"
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={createQuoteDialogOpen} onOpenChange={setCreateQuoteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Quote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="quote-title">Title</Label>
                <Input
                  id="quote-title"
                  value={quoteTitle}
                  onChange={(e) => setQuoteTitle(e.target.value)}
                  placeholder="Quote title"
                  data-testid="input-quote-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-description">Description</Label>
                <Textarea
                  id="quote-description"
                  value={quoteDescription}
                  onChange={(e) => setQuoteDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  data-testid="input-quote-description"
                />
              </div>
              <div className="text-sm text-slate-500">
                <p>Scope: Work Order</p>
                <p>Work Order ID: {workOrderId?.slice(-8)}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateQuoteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateQuote}
                disabled={!quoteTitle.trim() || createQuoteMutation.isPending}
                data-testid="button-submit-quote"
              >
                {createQuoteMutation.isPending ? "Creating..." : "Create Quote"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}
