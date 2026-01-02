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
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Trash2,
  Wand2,
  MoreVertical,
  Search,
  Send,
  Eye,
  Loader2,
  Clipboard,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

type ChecklistQuestion = {
  id: string;
  question: string;
  questionType: "yes_no" | "text" | "number" | "select";
  options: string[] | null;
  isRequired: boolean;
};

type ChecklistResponseData = {
  id: string;
  workOrderId: string;
  checklistId: string;
  answers: Record<string, string | boolean | number>;
  summary: string | null;
  completedBy: string | null;
  completedAt: Date | null;
  checklist: {
    id: string;
    serviceType: string;
    name: string;
    description: string | null;
    questions: ChecklistQuestion[];
  } | null;
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

// Generate 30-minute interval time options from 8:00 AM to 8:00 PM
const generateTimeOptions = () => {
  const options: { value: string; label: string }[] = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 20 && minute > 0) break; // Stop at 8:00 PM
      const hourStr = hour.toString().padStart(2, "0");
      const minuteStr = minute.toString().padStart(2, "0");
      const value = `${hourStr}:${minuteStr}`;
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const ampm = hour >= 12 ? "PM" : "AM";
      const label = `${displayHour}:${minuteStr} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

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

function getTimeFromSchedule(date: Date | string | null): string {
  if (!date) return "08:00";
  const d = new Date(date);
  let hours = d.getHours();
  let minutes = d.getMinutes();
  
  if (minutes >= 45) {
    hours = hours + 1;
    minutes = 0;
  } else if (minutes >= 15) {
    minutes = 30;
  } else {
    minutes = 0;
  }
  
  if (hours < 8) {
    hours = 8;
    minutes = 0;
  }
  if (hours > 20 || (hours === 20 && minutes > 0)) {
    hours = 20;
    minutes = 0;
  }
  
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState<string>("");
  const [reassignTechId, setReassignTechId] = useState<string>("unassigned");
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleStartTime, setRescheduleStartTime] = useState<string>("08:00");
  const [rescheduleEndTime, setRescheduleEndTime] = useState<string>("10:00");
  const [editingTechNotes, setEditingTechNotes] = useState<string>("");
  const [editingChecklist, setEditingChecklist] = useState<{ item: string; completed: boolean }[]>([]);
  const [billingDisposition, setBillingDisposition] = useState<string>("not_set");
  const [billingNotes, setBillingNotes] = useState<string>("");

  const [projectSearch, setProjectSearch] = useState("");
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);

  const [reassignCustomerSearch, setReassignCustomerSearch] = useState("");
  const [reassignCustomerSearchOpen, setReassignCustomerSearchOpen] = useState(false);
  const [checklistAnswersOpen, setChecklistAnswersOpen] = useState(false);
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
        setRescheduleStartTime(getTimeFromSchedule(workOrder.scheduledStart));
        setRescheduleEndTime(getTimeFromSchedule(workOrder.scheduledEnd));
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

  const { data: checklistResponse } = useQuery<ChecklistResponseData>({
    queryKey: ["/api/crm/work-orders", workOrderId, "checklist-response"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${workOrderId}/checklist-response`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch checklist response");
      }
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
      toast({
        title: "Failed to update work order",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteWorkOrderMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/crm/work-orders/${workOrderId}`);
    },
    onSuccess: () => {
      toast({ title: "Work order deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders"] });
      navigate("/crm/work-orders");
    },
    onError: (error: Error) => {
      const hasLinkedQuotes = error.message.toLowerCase().includes("linked quotes");
      const hasLinkedInvoices = error.message.toLowerCase().includes("linked invoices");
      
      let description = error.message;
      if (hasLinkedQuotes || hasLinkedInvoices) {
        const items = [];
        if (hasLinkedQuotes) items.push("quotes");
        if (hasLinkedInvoices) items.push("invoices");
        description = `This work order has ${items.join(" and ")} attached. Please delete the ${items.join(" and ")} first before deleting the work order.`;
      }
      
      toast({
        title: hasLinkedQuotes || hasLinkedInvoices ? "Cannot delete work order" : "Failed to delete work order",
        description,
        variant: "destructive",
      });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      await apiRequest("DELETE", `/api/crm/quotes/${quoteId}`);
    },
    onSuccess: () => {
      toast({ title: "Quote deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId, "quotes"] });
      setDeleteQuoteId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete quote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendQuoteMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/send`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote sent successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId, "quotes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send quote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest("DELETE", `/api/crm/invoices/${invoiceId}`);
    },
    onSuccess: () => {
      toast({ title: "Invoice deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId, "invoices"] });
      setDeleteInvoiceId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markInvoicePaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("PATCH", `/api/crm/invoices/${invoiceId}`, { status: "paid" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice marked as paid" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId, "invoices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("PATCH", `/api/crm/invoices/${invoiceId}`, { status: "void" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice voided" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrderId, "invoices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to void invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteWorkOrder = () => {
    deleteWorkOrderMutation.mutate();
  };

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
    if (rescheduleDate && rescheduleStartTime && rescheduleEndTime) {
      const [startHours, startMinutes] = rescheduleStartTime.split(":").map(Number);
      const [endHours, endMinutes] = rescheduleEndTime.split(":").map(Number);
      
      const scheduledStart = new Date(rescheduleDate);
      scheduledStart.setHours(startHours, startMinutes, 0, 0);
      
      const scheduledEnd = new Date(rescheduleDate);
      scheduledEnd.setHours(endHours, endMinutes, 0, 0);
      
      updateWorkOrderMutation.mutate({
        updates: {
          scheduledStart: scheduledStart.toISOString() as any,
          scheduledEnd: scheduledEnd.toISOString() as any,
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={deleteWorkOrderMutation.isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  data-testid="button-delete-work-order"
                >
                  {deleteWorkOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
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

            {checklistResponse && checklistResponse.checklist && (
              <Card className="shadow-sm mb-6 border-amber-200 bg-amber-50/30" data-testid="card-service-checklist">
                <CardHeader className="pb-3 border-b border-amber-200 bg-amber-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Clipboard className="h-4 w-4 text-amber-600" />
                    Service Call Checklist
                  </CardTitle>
                  {checklistResponse.checklist.name && (
                    <p className="text-sm text-amber-700 mt-1">{checklistResponse.checklist.name}</p>
                  )}
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {checklistResponse.summary && (
                    <div className="bg-white rounded-lg p-4 border border-amber-200">
                      <p className="text-xs text-amber-700 mb-2 uppercase tracking-wide font-medium">AI Summary</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-checklist-summary">
                        {checklistResponse.summary}
                      </p>
                    </div>
                  )}

                  <Collapsible open={checklistAnswersOpen} onOpenChange={setChecklistAnswersOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full flex items-center justify-between p-3 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 bg-white"
                        data-testid="button-toggle-checklist-answers"
                      >
                        <span>View All Answers ({checklistResponse.checklist.questions.length})</span>
                        {checklistAnswersOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3">
                      <div className="space-y-3 bg-white rounded-lg p-4 border border-amber-200">
                        {checklistResponse.checklist.questions.map((question) => {
                          const answer = checklistResponse.answers[question.id];
                          return (
                            <div key={question.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0" data-testid={`checklist-answer-${question.id}`}>
                              <p className="text-sm font-medium text-slate-700 mb-1">{question.question}</p>
                              <div className="flex items-center gap-2">
                                {question.questionType === "yes_no" && (
                                  <>
                                    {answer === true || answer === "true" || answer === "yes" ? (
                                      <>
                                        <Check className="h-4 w-4 text-green-500" />
                                        <span className="text-sm text-green-700">Yes</span>
                                      </>
                                    ) : answer === false || answer === "false" || answer === "no" ? (
                                      <>
                                        <X className="h-4 w-4 text-red-500" />
                                        <span className="text-sm text-red-700">No</span>
                                      </>
                                    ) : (
                                      <span className="text-sm text-slate-400 italic">Not answered</span>
                                    )}
                                  </>
                                )}
                                {question.questionType === "text" && (
                                  <span className="text-sm text-slate-600">
                                    {answer !== undefined && answer !== "" ? String(answer) : <span className="text-slate-400 italic">Not answered</span>}
                                  </span>
                                )}
                                {question.questionType === "number" && (
                                  <span className="text-sm text-slate-600 font-medium">
                                    {answer !== undefined && answer !== "" ? String(answer) : <span className="text-slate-400 italic font-normal">Not answered</span>}
                                  </span>
                                )}
                                {question.questionType === "select" && (
                                  <span className="text-sm text-slate-600">
                                    {answer !== undefined && answer !== "" ? String(answer) : <span className="text-slate-400 italic">Not answered</span>}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {checklistResponse.completedAt && (
                    <p className="text-xs text-amber-600 text-right">
                      Completed {formatDateTime(checklistResponse.completedAt)}
                      {checklistResponse.completedBy && ` by ${checklistResponse.completedBy}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

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
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <FileText className="h-4 w-4 text-[#711419]" />
                    Quotes ({quotes?.length || 0})
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set("workOrderId", workOrder.id);
                        if (workOrder.customerId) params.set("customerId", workOrder.customerId);
                        if (workOrder.projectId) params.set("projectId", workOrder.projectId);
                        if (workOrder.propertyId) params.set("propertyId", workOrder.propertyId);
                        navigate(`/crm/proposal-builder?${params.toString()}`);
                      }}
                      data-testid="button-generate-proposal"
                    >
                      <Wand2 className="h-4 w-4 mr-1" />
                      Generate Proposal
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#711419] hover:bg-[#5a1014] text-white"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set("workOrderId", workOrder.id);
                        if (workOrder.customerId) params.set("customerId", workOrder.customerId);
                        if (workOrder.propertyId) params.set("propertyId", workOrder.propertyId);
                        navigate(`/crm/quotes/new?${params.toString()}`);
                      }}
                      data-testid="button-create-quote"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create Quote
                    </Button>
                  </div>
                </div>
                {quotes && quotes.length > 0 && (
                  <div className="flex gap-2 mt-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search quotes..."
                        value={quoteSearch}
                        onChange={(e) => setQuoteSearch(e.target.value)}
                        className="pl-9 h-9"
                        data-testid="input-quote-search"
                      />
                    </div>
                    <Select value={quoteStatusFilter} onValueChange={setQuoteStatusFilter}>
                      <SelectTrigger className="w-[140px] h-9" data-testid="select-quote-status-filter">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-4">
                {quotesLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : quotes && quotes.length > 0 ? (
                  (() => {
                    const filteredQuotes = quotes.filter((quote) => {
                      const matchesSearch = quoteSearch === "" || 
                        quote.title?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                        quote.quoteNumber?.toLowerCase().includes(quoteSearch.toLowerCase());
                      const matchesStatus = quoteStatusFilter === "all" || quote.status === quoteStatusFilter;
                      return matchesSearch && matchesStatus;
                    });
                    return filteredQuotes.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Quote Number</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Created Date</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredQuotes.map((quote) => (
                            <TableRow 
                              key={quote.id} 
                              data-testid={`row-quote-${quote.id}`}
                              className="cursor-pointer hover:bg-slate-50"
                            >
                              <TableCell className="font-medium">{quote.quoteNumber}</TableCell>
                              <TableCell>{quote.title}</TableCell>
                              <TableCell>
                                <Badge className={cn(
                                  "text-xs",
                                  quote.status === "draft" && "bg-slate-100 text-slate-700",
                                  quote.status === "sent" && "bg-blue-100 text-blue-700",
                                  quote.status === "accepted" && "bg-green-100 text-green-700",
                                  quote.status === "declined" && "bg-red-100 text-red-700",
                                  quote.status === "expired" && "bg-yellow-100 text-yellow-700"
                                )}>
                                  {quote.status === "accepted" ? "Approved" : quote.status?.charAt(0).toUpperCase() + quote.status?.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {quote.total ? `$${Number(quote.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                              </TableCell>
                              <TableCell>
                                {quote.createdAt ? format(new Date(quote.createdAt), 'MMM d, yyyy') : '—'}
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      data-testid={`button-quote-actions-${quote.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                                      data-testid={`menu-view-quote-${quote.id}`}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      View
                                    </DropdownMenuItem>
                                    {quote.status === "draft" && (
                                      <DropdownMenuItem
                                        onClick={() => navigate(`/crm/quotes/${quote.id}/edit`)}
                                        data-testid={`menu-edit-quote-${quote.id}`}
                                      >
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => sendQuoteMutation.mutate(quote.id)}
                                      disabled={sendQuoteMutation.isPending}
                                      data-testid={`menu-send-quote-${quote.id}`}
                                    >
                                      <Send className="h-4 w-4 mr-2" />
                                      Send
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => setDeleteQuoteId(quote.id)}
                                      className="text-red-600"
                                      data-testid={`menu-delete-quote-${quote.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 mb-2">No quotes match your filters</p>
                        <p className="text-sm text-slate-400">Try adjusting your search or status filter</p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 mb-2">No quotes yet</p>
                    <p className="text-sm text-slate-400 mb-4">
                      Create a quote for this work order.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set("workOrderId", workOrder.id);
                        if (workOrder.customerId) params.set("customerId", workOrder.customerId);
                        if (workOrder.propertyId) params.set("propertyId", workOrder.propertyId);
                        navigate(`/crm/quotes/new?${params.toString()}`);
                      }}
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
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <DollarSign className="h-4 w-4 text-[#711419]" />
                    Invoices ({invoices?.length || 0})
                  </CardTitle>
                  <Button
                    size="sm"
                    className="bg-[#711419] hover:bg-[#5a1014] text-white"
                    onClick={() => createInvoiceMutation.mutate()}
                    disabled={createInvoiceMutation.isPending}
                    data-testid="button-create-invoice"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
                  </Button>
                </div>
                {invoices && invoices.length > 0 && (
                  <div className="flex gap-2 mt-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search invoices..."
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        className="pl-9 h-9"
                        data-testid="input-invoice-search"
                      />
                    </div>
                    <Select value={invoiceStatusFilter} onValueChange={setInvoiceStatusFilter}>
                      <SelectTrigger className="w-[140px] h-9" data-testid="select-invoice-status-filter">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-4">
                {invoicesLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : invoices && invoices.length > 0 ? (
                  (() => {
                    const filteredInvoices = invoices.filter((invoice) => {
                      const matchesSearch = invoiceSearch === "" || 
                        invoice.invoiceNumber?.toLowerCase().includes(invoiceSearch.toLowerCase());
                      const matchesStatus = invoiceStatusFilter === "all" || invoice.status === invoiceStatusFilter;
                      return matchesSearch && matchesStatus;
                    });
                    return filteredInvoices.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice Number</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Balance Due</TableHead>
                            <TableHead>Created Date</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredInvoices.map((invoice) => (
                            <TableRow 
                              key={invoice.id} 
                              data-testid={`row-invoice-${invoice.id}`}
                              className="cursor-pointer hover:bg-slate-50"
                            >
                              <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                              <TableCell>
                                <Badge className={cn(
                                  "text-xs",
                                  invoice.status === "draft" && "bg-slate-100 text-slate-700",
                                  invoice.status === "sent" && "bg-blue-100 text-blue-700",
                                  invoice.status === "paid" && "bg-green-100 text-green-700",
                                  invoice.status === "partial" && "bg-amber-100 text-amber-700",
                                  invoice.status === "void" && "bg-red-100 text-red-700"
                                )}>
                                  {invoice.status?.charAt(0).toUpperCase() + invoice.status?.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {invoice.total ? `$${Number(invoice.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {invoice.balanceDue ? `$${Number(invoice.balanceDue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                              </TableCell>
                              <TableCell>
                                {invoice.createdAt ? format(new Date(invoice.createdAt), 'MMM d, yyyy') : '—'}
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      data-testid={`button-invoice-actions-${invoice.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => navigate(`/crm/invoices/${invoice.id}`)}
                                      data-testid={`menu-view-invoice-${invoice.id}`}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      View
                                    </DropdownMenuItem>
                                    {invoice.status === "draft" && (
                                      <DropdownMenuItem
                                        onClick={() => navigate(`/crm/invoices/${invoice.id}/edit`)}
                                        data-testid={`menu-edit-invoice-${invoice.id}`}
                                      >
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                    )}
                                    {invoice.status !== "paid" && invoice.status !== "void" && (
                                      <DropdownMenuItem
                                        onClick={() => markInvoicePaidMutation.mutate(invoice.id)}
                                        disabled={markInvoicePaidMutation.isPending}
                                        data-testid={`menu-mark-paid-invoice-${invoice.id}`}
                                      >
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        Mark Paid
                                      </DropdownMenuItem>
                                    )}
                                    {invoice.status !== "void" && (
                                      <DropdownMenuItem
                                        onClick={() => voidInvoiceMutation.mutate(invoice.id)}
                                        disabled={voidInvoiceMutation.isPending}
                                        data-testid={`menu-void-invoice-${invoice.id}`}
                                      >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Void
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => setDeleteInvoiceId(invoice.id)}
                                      className="text-red-600"
                                      data-testid={`menu-delete-invoice-${invoice.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8">
                        <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 mb-2">No invoices match your filters</p>
                        <p className="text-sm text-slate-400">Try adjusting your search or status filter</p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-8">
                    <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 mb-2">No invoices yet</p>
                    {workOrder.billingDisposition && (
                      <p className="text-xs text-slate-400 mb-4">
                        Billing Disposition: {workOrder.billingDisposition}
                      </p>
                    )}
                    <p className="text-sm text-slate-400 mb-4">
                      Create an invoice for this work order.
                    </p>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Customer & Location Card */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <User className="h-4 w-4 text-[#711419]" />
                    Customer & Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Customer</Label>
                    <div className="flex items-center justify-between">
                      <p className="text-slate-900 font-medium">{workOrder.customer?.name || "—"}</p>
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

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Site <span className="text-red-500">*</span></Label>
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

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Linked Project</Label>
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
                </CardContent>
              </Card>

              {/* Status & Assignment Card */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Clock className="h-4 w-4 text-[#711419]" />
                    Status & Assignment
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Status</Label>
                    <div className="flex items-center gap-2">
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger className="flex-1" data-testid="select-edit-status">
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

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Assigned Tech</Label>
                    <div className="flex items-center gap-2">
                      <Select value={reassignTechId} onValueChange={setReassignTechId}>
                        <SelectTrigger className="flex-1" data-testid="select-edit-tech">
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

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Schedule</Label>
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
                        <Label className="text-xs">Start Time</Label>
                        <Select value={rescheduleStartTime} onValueChange={setRescheduleStartTime}>
                          <SelectTrigger data-testid="select-edit-start-time">
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
                        <Label className="text-xs">End Time</Label>
                        <Select value={rescheduleEndTime} onValueChange={setRescheduleEndTime}>
                          <SelectTrigger data-testid="select-edit-end-time">
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
                      onClick={handleReschedule}
                      disabled={updateWorkOrderMutation.isPending || !rescheduleDate || !rescheduleStartTime || !rescheduleEndTime}
                      data-testid="button-reschedule"
                    >
                      Reschedule
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Work Details & Billing Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Work Details Card */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <ClipboardList className="h-4 w-4 text-[#711419]" />
                    Work Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Checklist</Label>
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

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Tech Notes</Label>
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

              {/* Billing Card */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <DollarSign className="h-4 w-4 text-[#711419]" />
                    Billing
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Disposition</Label>
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

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Billing Notes</Label>
                    <Textarea
                      value={billingNotes}
                      onChange={(e) => setBillingNotes(e.target.value)}
                      placeholder="Billing specific notes..."
                      className="min-h-[100px]"
                      data-testid="textarea-billing-notes"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={handleSaveBilling}
                    disabled={updateWorkOrderMutation.isPending}
                    data-testid="button-save-billing"
                  >
                    Save Billing Info
                  </Button>
                </CardContent>
              </Card>
            </div>
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

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Work Order</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this work order? This action cannot be undone
                and will permanently remove the work order and all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteWorkOrder}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete"
              >
                {deleteWorkOrderMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteQuoteId} onOpenChange={(open) => !open && setDeleteQuoteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Quote</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this quote? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-quote">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteQuoteId && deleteQuoteMutation.mutate(deleteQuoteId)}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-quote"
              >
                {deleteQuoteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteInvoiceId} onOpenChange={(open) => !open && setDeleteInvoiceId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this invoice? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-invoice">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteInvoiceId && deleteInvoiceMutation.mutate(deleteInvoiceId)}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-invoice"
              >
                {deleteInvoiceMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
