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
import { Switch } from "@/components/ui/switch";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Building2,
  MapPin,
  Trash2,
  Home,
  Users,
  ShieldCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmJob, CrmAccount, CrmSite, CommercialProfile } from "@shared/schema";
import { cn } from "@/lib/utils";

type JobWithDetails = CrmJob & {
  accountName: string;
  siteAddress: string | null;
  assignedTechId: string | null;
  assignedTechName: string | null;
  nextScheduledAt: string | null;
  lastCompletedAt: string | null;
  derivedStatus: string;
  hasUpcoming: boolean;
  allWorkOrdersCompleted: boolean;
  workOrderCount: number;
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

type CustomerWithInfo = {
  id: string;
  name: string;
  customerType: string;
  customerStatus: string;
  fullAddress: string | null;
  phone: string | null;
  email: string | null;
  leadSource: string | null;
  createdAt: string;
  origin: 'crm' | 'legacy';
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

type AccountDetailResponse = CrmAccount & {
  sites: CrmSite[];
  contacts: any[];
  profile: CommercialProfile | any | null;
};

const customerTypeColors: Record<string, { bg: string; text: string; icon: any }> = {
  RESIDENTIAL: { bg: "bg-green-100", text: "text-green-700", icon: Home },
  Residential: { bg: "bg-green-100", text: "text-green-700", icon: Home },
  PROPERTY_MANAGER: { bg: "bg-blue-100", text: "text-blue-700", icon: Users },
  "Property Manager": { bg: "bg-blue-100", text: "text-blue-700", icon: Users },
  COMMERCIAL: { bg: "bg-purple-100", text: "text-purple-700", icon: Building2 },
  Commercial: { bg: "bg-purple-100", text: "text-purple-700", icon: Building2 },
};

const getCustomerTypeDisplay = (type: string): string => {
  const typeMap: Record<string, string> = {
    RESIDENTIAL: "Residential",
    PROPERTY_MANAGER: "Property Manager",
    COMMERCIAL: "Commercial",
  };
  return typeMap[type] || type;
};

const ITEMS_PER_PAGE = 50;

type FilterTab = "all" | "needs_scheduling" | "scheduled" | "in_progress" | "completed" | "closed" | "cancelled";

const filterTabConfig: Record<FilterTab, { label: string }> = {
  all: { label: "All Projects" },
  needs_scheduling: { label: "New / Needs Scheduling" },
  scheduled: { label: "Scheduled" },
  in_progress: { label: "In Progress" },
  completed: { label: "Completed" },
  closed: { label: "Closed" },
  cancelled: { label: "Cancelled" },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  needs_scheduling: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  closed: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
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
  new: "New / Needs Scheduling",
  needs_scheduling: "New / Needs Scheduling",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  closed: "Closed",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

const JOB_TYPES = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;
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
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [jobType, setJobType] = useState<string>("SERVICE");
  const [priority, setPriority] = useState<string>("normal");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [accessInstructions, setAccessInstructions] = useState("");
  const [poNumber, setPoNumber] = useState("");
  
  const [preferredContactMethod, setPreferredContactMethod] = useState<string>("");
  const [accessNotes, setAccessNotes] = useState("");
  
  const [unitNumber, setUnitNumber] = useState("");
  const [billTo, setBillTo] = useState<string>("bill_pm");
  const [approvalRequired, setApprovalRequired] = useState(false);
  
  const [siteContact, setSiteContact] = useState("");
  const [customSiteContact, setCustomSiteContact] = useState("");
  const [afterHoursNotes, setAfterHoursNotes] = useState("");

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedJobForSchedule, setSelectedJobForSchedule] = useState<JobWithDetails | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(new Date());
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDuration, setScheduleDuration] = useState(60);
  const [scheduleTechId, setScheduleTechId] = useState<string>("unassigned");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<JobWithDetails | null>(null);

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
    
    if (activeTab !== "all") {
      params.set("tab", activeTab);
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

  const { data: accountDetailData } = useQuery<AccountDetailResponse>({
    queryKey: ["/api/crm/accounts", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/accounts/${selectedCustomer!.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch account details");
      return res.json();
    },
    enabled: !!selectedCustomer?.id && selectedCustomer?.origin === 'crm',
  });

  const sites = accountDetailData?.sites || [];
  const selectedSite = sites.find(s => s.id === selectedSiteId);

  useEffect(() => {
    if (selectedSite) {
      if (selectedSite.tenantName) setTenantName(selectedSite.tenantName);
      if (selectedSite.tenantPhone) setTenantPhone(selectedSite.tenantPhone);
      if (selectedSite.accessInstructions) setAccessInstructions(selectedSite.accessInstructions);
    }
  }, [selectedSite]);

  useEffect(() => {
    if (sites.length === 1 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites, selectedSiteId]);

  const technicians = dispatchData?.technicians?.filter(t => t.role === "tech") || [];
  const contacts = accountDetailData?.contacts || [];

  const customerType = selectedCustomer?.customerType?.toUpperCase() || "";
  const isResidential = customerType === "RESIDENTIAL";
  const isPropertyManager = customerType === "PROPERTY_MANAGER";
  const isCommercial = customerType === "COMMERCIAL";
  const requiresPO = isCommercial && (accountDetailData?.profile as CommercialProfile)?.requiresPO;
  const isTaxExempt = isCommercial && (accountDetailData?.profile as CommercialProfile)?.taxExempt;

  const createJobMutation = useMutation({
    mutationFn: async (data: {
      accountId: string;
      siteId: string;
      jobType: string;
      priority: string;
      description: string;
    }) => {
      const jobRes = await apiRequest("POST", "/api/crm/jobs", {
        accountId: data.accountId,
        siteId: data.siteId,
        jobType: data.jobType,
        priority: data.priority,
        description: data.description,
        status: "new",
      });
      const job = await jobRes.json();
      
      return { job, assignmentFailed: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      if (result.assignmentFailed) {
        toast({
          title: "Project created",
          description: "The project was created but technician assignment failed. Please assign manually.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Project created",
          description: "The project has been created successfully.",
        });
      }
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
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
        description: "Project status has been updated successfully.",
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
        description: "Project has been assigned successfully.",
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
          throw new Error("This technician already has a project scheduled during this time. Please choose a different time or technician.");
        }
        throw new Error(errorData.message || "Failed to schedule project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      toast({
        title: "Project scheduled",
        description: "The project has been scheduled successfully.",
      });
      handleCloseScheduleDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Scheduling conflict",
        description: error.message || "Failed to schedule project",
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/jobs/${jobId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to delete project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      toast({
        title: "Project deleted",
        description: "The project has been deleted successfully.",
      });
      setDeleteConfirmOpen(false);
      setJobToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete project",
        variant: "destructive",
      });
    },
  });

  const handleDeleteJob = () => {
    if (jobToDelete) {
      deleteJobMutation.mutate(jobToDelete.id);
    }
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setCustomerSearch("");
    setSelectedCustomer(null);
    setSelectedSiteId("");
    setJobType("SERVICE");
    setPriority("normal");
    setAssignedTechId("unassigned");
    setStartDate(new Date());
    setStartTime("09:00");
    setDuration(60);
    setDescription("");
    setCustomerSearchOpen(false);
    setTenantName("");
    setTenantPhone("");
    setAccessInstructions("");
    setPoNumber("");
    setPreferredContactMethod("");
    setAccessNotes("");
    setUnitNumber("");
    setBillTo("bill_pm");
    setApprovalRequired(false);
    setSiteContact("");
    setCustomSiteContact("");
    setAfterHoursNotes("");
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
  const customerError = !selectedCustomer ? "Customer is required" : null;
  const siteError = selectedCustomer?.origin === 'crm' && !selectedSiteId ? "Site is required" : null;
  const priorityError = !priority ? "Priority is required" : null;
  
  const needsSiteSelection = selectedCustomer?.origin === 'crm';
  
  // Customer-type specific validation
  const commercialPOValid = !isCommercial || !requiresPO || poNumber.trim() !== "";
  const effectiveSiteContact = siteContact === "other" ? customSiteContact : siteContact;
  const commercialContactValid = !isCommercial || effectiveSiteContact.trim() !== "";
  
  const isFormValid = selectedCustomer && 
    (!needsSiteSelection || selectedSiteId) && 
    description.trim() !== "" && 
    priority &&
    commercialPOValid &&
    commercialContactValid;

  const handleSubmit = () => {
    if (!selectedCustomer) {
      toast({
        title: "Error",
        description: "Please select a customer",
        variant: "destructive",
      });
      return;
    }

    if (needsSiteSelection && !selectedSiteId) {
      toast({
        title: "Error",
        description: "Please select a site",
        variant: "destructive",
      });
      return;
    }

    if (!priority) {
      toast({
        title: "Error",
        description: "Please select a priority",
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

    if (isCommercial && requiresPO && poNumber.trim() === "") {
      toast({
        title: "Error",
        description: "PO Number is required for this commercial customer",
        variant: "destructive",
      });
      return;
    }

    const effectiveContact = siteContact === "other" ? customSiteContact : siteContact;
    if (isCommercial && effectiveContact.trim() === "") {
      toast({
        title: "Error",
        description: "Site Contact is required for commercial customers",
        variant: "destructive",
      });
      return;
    }

    let fullDescription = description.trim();
    
    if (isResidential) {
      if (preferredContactMethod || accessNotes) {
        fullDescription += `\n\n--- Residential Info ---`;
        if (preferredContactMethod) fullDescription += `\nPreferred Contact: ${preferredContactMethod}`;
        if (accessNotes) fullDescription += `\nAccess Notes: ${accessNotes}`;
      }
    }
    
    if (isPropertyManager) {
      if (tenantName || tenantPhone || accessInstructions || unitNumber || billTo || approvalRequired) {
        fullDescription += `\n\n--- Property Manager Info ---`;
        if (unitNumber) fullDescription += `\nUnit #: ${unitNumber}`;
        if (tenantName) fullDescription += `\nTenant: ${tenantName}`;
        if (tenantPhone) fullDescription += `\nTenant Phone: ${tenantPhone}`;
        if (accessInstructions) fullDescription += `\nAccess: ${accessInstructions}`;
        fullDescription += `\nBill To: ${billTo === 'bill_pm' ? 'Bill PM' : 'Bill Tenant/Owner'}`;
        if (approvalRequired) fullDescription += `\nApproval Required: Yes`;
      }
    }
    
    if (isCommercial) {
      if (poNumber || effectiveContact || afterHoursNotes) {
        fullDescription += `\n\n--- Commercial Info ---`;
        if (poNumber) fullDescription += `\nPO Number: ${poNumber}`;
        if (effectiveContact) fullDescription += `\nSite Contact: ${effectiveContact}`;
        if (afterHoursNotes) fullDescription += `\nAccess/After-Hours: ${afterHoursNotes}`;
        if (isTaxExempt) fullDescription += `\nTax Exempt: Yes`;
      }
    }

    createJobMutation.mutate({
      accountId: selectedCustomer.id,
      siteId: selectedSiteId || sites[0]?.id || "",
      jobType,
      priority,
      description: fullDescription,
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
          <TabsList className="flex w-full h-9 p-0.5 gap-0.5" data-testid="tabs-job-filter">
            {Object.entries(filterTabConfig).map(([key, config]) => (
              <TabsTrigger 
                key={key} 
                value={key} 
                data-testid={`tab-${key}`}
                className="flex-1 text-xs px-2 py-1.5 data-[state=active]:bg-[#711419] data-[state=active]:text-white"
              >
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
                placeholder="Search by account name or job type..."
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
                        <TableHead>Account</TableHead>
                        <TableHead>Site Address</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead className="w-[50px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => {
                        const statusStyle = statusColors[job.derivedStatus] || statusColors.new;
                        const priorityStyle = priorityColors[job.priority || "normal"] || priorityColors.normal;
                        
                        return (
                          <TableRow
                            key={job.id}
                            className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => navigate(`/crm/jobs/${job.id}`)}
                            data-testid={`row-job-${job.id}`}
                          >
                            <TableCell className="font-medium" data-testid={`text-job-date-${job.id}`}>
                              {job.createdAt ? formatDateDisplay(job.createdAt) : "—"}
                            </TableCell>
                            <TableCell data-testid={`text-job-type-${job.id}`}>
                              {job.jobType || "—"}
                            </TableCell>
                            <TableCell data-testid={`text-job-account-${job.id}`}>
                              <div className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                {job.accountName || "—"}
                              </div>
                            </TableCell>
                            <TableCell data-testid={`text-job-site-${job.id}`}>
                              {job.siteAddress ? (
                                <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="truncate max-w-[150px]">{job.siteAddress}</span>
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                                data-testid={`badge-job-status-${job.id}`}
                              >
                                {statusLabels[job.derivedStatus] || job.derivedStatus}
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setJobToDelete(job);
                                      setDeleteConfirmOpen(true);
                                    }}
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    data-testid={`action-delete-${job.id}`}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Job
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
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer-search">Customer *</Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 border rounded-md bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const typeConfig = customerTypeColors[selectedCustomer.customerType] || customerTypeColors.RESIDENTIAL;
                        const IconComponent = typeConfig.icon;
                        return <IconComponent className="h-4 w-4 text-slate-500" />;
                      })()}
                      <p className="font-medium" data-testid="text-selected-customer">{selectedCustomer.name}</p>
                      {(() => {
                        const typeConfig = customerTypeColors[selectedCustomer.customerType];
                        if (!typeConfig) return null;
                        return (
                          <Badge className={cn("text-xs", typeConfig.bg, typeConfig.text)}>
                            {getCustomerTypeDisplay(selectedCustomer.customerType)}
                          </Badge>
                        );
                      })()}
                      {isTaxExempt && (
                        <Badge className="text-xs bg-emerald-100 text-emerald-700">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Tax Exempt
                        </Badge>
                      )}
                    </div>
                    {selectedCustomer.fullAddress && (
                      <p className="text-sm text-slate-500 mt-1">
                        {selectedCustomer.fullAddress}
                      </p>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setSelectedCustomer(null);
                      setSelectedSiteId("");
                      setTenantName("");
                      setTenantPhone("");
                      setAccessInstructions("");
                      setPoNumber("");
                      setPreferredContactMethod("");
                      setAccessNotes("");
                      setUnitNumber("");
                      setBillTo("bill_pm");
                      setApprovalRequired(false);
                      setSiteContact("");
                      setAfterHoursNotes("");
                    }}
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
                  <PopoverContent className="w-[450px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search customers..."
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
                            {customersData?.customers?.map((customer) => {
                              const typeConfig = customerTypeColors[customer.customerType] || customerTypeColors.RESIDENTIAL;
                              const IconComponent = typeConfig.icon;
                              return (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.id}
                                  onSelect={() => {
                                    setSelectedCustomer(customer);
                                    setCustomerSearchOpen(false);
                                    setCustomerSearch("");
                                    setSelectedSiteId("");
                                  }}
                                  className="cursor-pointer"
                                  data-testid={`customer-option-${customer.id}`}
                                >
                                  <div className="flex flex-col w-full">
                                    <div className="flex items-center gap-2">
                                      <IconComponent className="h-4 w-4 text-slate-400" />
                                      <span className="font-medium">{customer.name}</span>
                                      <Badge className={cn("text-xs", typeConfig.bg, typeConfig.text)}>
                                        {getCustomerTypeDisplay(customer.customerType)}
                                      </Badge>
                                    </div>
                                    {customer.fullAddress && (
                                      <span className="text-sm text-slate-500 ml-6">
                                        {customer.fullAddress}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {selectedCustomer && needsSiteSelection && (
              <div className="space-y-2">
                <Label htmlFor="site-select">Site *</Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger data-testid="select-site">
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.length === 0 ? (
                      <SelectItem value="no-sites" disabled>No sites available</SelectItem>
                    ) : (
                      sites.map((site) => (
                        <SelectItem key={site.id} value={site.id} data-testid={`site-option-${site.id}`}>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            <span>{site.siteName || site.address1}</span>
                            {site.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedSite && (
                  <p className="text-sm text-slate-500">
                    {selectedSite.address1}, {selectedSite.city}, {selectedSite.state} {selectedSite.zip}
                  </p>
                )}
              </div>
            )}

            {isResidential && selectedCustomer && (
              <div className="space-y-3 p-3 border rounded-md bg-green-50 border-green-200">
                <div className="flex items-center gap-2 text-green-800">
                  <Home className="h-4 w-4" />
                  <Label className="font-medium">Residential Info</Label>
                  <span className="text-xs text-green-600">(Optional)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="preferred-contact" className="text-sm">Preferred Contact Method</Label>
                    <Select value={preferredContactMethod} onValueChange={setPreferredContactMethod}>
                      <SelectTrigger data-testid="select-preferred-contact">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="access-notes" className="text-sm">Access Notes</Label>
                  <Textarea
                    id="access-notes"
                    placeholder="Gate codes, pet info, etc."
                    value={accessNotes}
                    onChange={(e) => setAccessNotes(e.target.value)}
                    rows={2}
                    data-testid="textarea-access-notes"
                  />
                </div>
              </div>
            )}

            {isPropertyManager && selectedCustomer && (
              <div className="space-y-3 p-3 border rounded-md bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2 text-blue-800">
                  <Users className="h-4 w-4" />
                  <Label className="font-medium">Property Manager Info</Label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="unit-number" className="text-sm">Unit #</Label>
                    <Input
                      id="unit-number"
                      placeholder="Unit number"
                      value={unitNumber}
                      onChange={(e) => setUnitNumber(e.target.value)}
                      data-testid="input-unit-number"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenant-name" className="text-sm">Tenant Name</Label>
                    <Input
                      id="tenant-name"
                      placeholder="Tenant name"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      data-testid="input-tenant-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenant-phone" className="text-sm">Tenant Phone</Label>
                    <Input
                      id="tenant-phone"
                      placeholder="Tenant phone"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      data-testid="input-tenant-phone"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="bill-to" className="text-sm">Bill To</Label>
                    <Select value={billTo} onValueChange={setBillTo}>
                      <SelectTrigger data-testid="select-bill-to">
                        <SelectValue placeholder="Select billing" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bill_pm">Bill PM</SelectItem>
                        <SelectItem value="bill_tenant">Bill Tenant/Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 flex items-end">
                    <div className="flex items-center space-x-2 pb-2">
                      <Switch
                        id="approval-required"
                        checked={approvalRequired}
                        onCheckedChange={setApprovalRequired}
                        data-testid="switch-approval-required"
                      />
                      <Label htmlFor="approval-required" className="text-sm cursor-pointer">Approval Required</Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="access-instructions" className="text-sm">Access Instructions</Label>
                  <Textarea
                    id="access-instructions"
                    placeholder="Gate codes, key locations, etc."
                    value={accessInstructions}
                    onChange={(e) => setAccessInstructions(e.target.value)}
                    rows={2}
                    data-testid="textarea-access-instructions"
                  />
                </div>
              </div>
            )}

            {isCommercial && selectedCustomer && (
              <div className="space-y-3 p-3 border rounded-md bg-purple-50 border-purple-200">
                <div className="flex items-center gap-2 text-purple-800">
                  <Building2 className="h-4 w-4" />
                  <Label className="font-medium">Commercial Info</Label>
                  {isTaxExempt && (
                    <Badge className="text-xs bg-emerald-100 text-emerald-700">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Tax Exempt
                    </Badge>
                  )}
                </div>
                {requiresPO && (
                  <div className="space-y-1">
                    <Label htmlFor="po-number" className="text-sm">
                      PO Number <span className="text-purple-600">(Required for invoicing)</span>
                    </Label>
                    <Input
                      id="po-number"
                      placeholder="Enter PO number"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      data-testid="input-po-number"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="site-contact" className="text-sm">Site Contact / Facility Manager *</Label>
                  {contacts.length > 0 ? (
                    <>
                      <Select value={siteContact} onValueChange={setSiteContact}>
                        <SelectTrigger data-testid="select-site-contact">
                          <SelectValue placeholder="Select contact" />
                        </SelectTrigger>
                        <SelectContent>
                          {contacts.map((contact: any) => (
                            <SelectItem key={contact.id} value={`${contact.firstName} ${contact.lastName || ''} - ${contact.phone || contact.email || ''}`}>
                              {contact.firstName} {contact.lastName || ''} {contact.phone ? `(${contact.phone})` : ''}
                            </SelectItem>
                          ))}
                          <SelectItem value="other">Other (enter manually)</SelectItem>
                        </SelectContent>
                      </Select>
                      {siteContact === "other" && (
                        <Input
                          id="custom-site-contact"
                          placeholder="Enter contact name and phone"
                          value={customSiteContact}
                          onChange={(e) => setCustomSiteContact(e.target.value)}
                          className="mt-2"
                          data-testid="input-custom-site-contact"
                        />
                      )}
                    </>
                  ) : (
                    <Input
                      id="site-contact"
                      placeholder="Contact name and phone"
                      value={siteContact}
                      onChange={(e) => setSiteContact(e.target.value)}
                      data-testid="input-site-contact"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="after-hours-notes" className="text-sm">Access Instructions / After-Hours Notes</Label>
                  <Textarea
                    id="after-hours-notes"
                    placeholder="Security codes, after-hours access, etc."
                    value={afterHoursNotes}
                    onChange={(e) => setAfterHoursNotes(e.target.value)}
                    rows={2}
                    data-testid="textarea-after-hours-notes"
                  />
                </div>
              </div>
            )}

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
                <Label htmlFor="priority">Priority *</Label>
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
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Project description..."
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
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={(open) => !open && handleCloseScheduleDialog()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Schedule Project</DialogTitle>
          </DialogHeader>
          
          {selectedJobForSchedule && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-slate-50 rounded-md border">
                <p className="text-sm text-slate-500">Account</p>
                <p className="font-medium" data-testid="text-schedule-account">{selectedJobForSchedule.accountName}</p>
                {selectedJobForSchedule.siteAddress && (
                  <p className="text-sm text-slate-500 mt-1">{selectedJobForSchedule.siteAddress}</p>
                )}
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
                "Schedule Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent data-testid="dialog-delete-job">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
              All associated work orders, invoices, and quotes will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setJobToDelete(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJob}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteJobMutation.isPending ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
