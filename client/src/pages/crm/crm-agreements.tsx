import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Trash2,
  Settings,
  Check,
  X,
  ChevronDown,
  Wrench,
  FileText,
  Pencil as Edit,
  Printer,
  RefreshCw,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, addDays, subDays, addMonths, addYears, isAfter, isBefore, startOfDay, differenceInCalendarDays, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, CrmAgreement, MaintenanceRegion, CustomAgreementType } from "@shared/schema";
import { Switch } from "@/components/ui/switch";

type AgreementsResponse = {
  agreements: CrmAgreement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  statusCounts?: {
    pending: number;
    active: number;
    grace_period: number;
    expired: number;
    upcoming_service: number;
    all_active: number;
  };
};

const ITEMS_PER_PAGE = 25;

type SortField = "customerName" | "agreementNumber" | "agreementPlan" | "nextServiceDate" | "nextInvoiceDate" | "address" | "status";
type SortDirection = "asc" | "desc";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const statusLabels: Record<string, string> = {
  pending: "Pending Payment",
  active: "Active",
  grace_period: "Grace Period",
  expired: "Expired",
  cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700 border-blue-200",
  active: "bg-green-100 text-green-700 border-green-200",
  grace_period: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

const tabFilters = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "upcoming_service", label: "Upcoming Service" },
  { key: "grace_period", label: "Grace Period" },
  { key: "expired", label: "Expired" },
];

function formatCustomerName(name: string | null | undefined): string {
  if (!name) return "";
  if (name.includes(",")) {
    const parts = name.split(",").map(p => p.trim());
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return name;
}

export default function CrmAgreements() {
  usePageTitle("Agreements");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedAgreement, setSelectedAgreement] = useState<CrmAgreement | null>(null);
  // Editable copy of an agreement (opens the edit dialog when non-null)
  const [editForm, setEditForm] = useState<null | {
    id: string; agreementPlan: string; price: string; numberOfSystems: number;
    visitsPerPeriod: number; startDate: string; endDate: string; contractDate: string;
    autoRenew: boolean; billingPreference: string; status: string; notes: string; details: string;
  }>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showCreateTypeDialog, setShowCreateTypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<CustomAgreementType | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "",
    description: "",
    frequency: "annual" as "weekly" | "monthly" | "annual",
    // How scheduled visits are spread, separate from the billing cycle. null = same as billing.
    visitFrequency: null as "weekly" | "monthly" | "annual" | null,
    visitsPerPeriod: 2,
    defaultPrice: "0.00",
    isActive: true,
  });

  const [sortField, setSortField] = useState<SortField>("customerName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [agreementTypeFilter, setAgreementTypeFilter] = useState<string>("all");

  const [createForm, setCreateForm] = useState({
    agreementNumber: "",
    customerName: "",
    agreementPlan: "",
    address: "",
    nextServiceDate: "",
    nextInvoiceDate: "",
    startDate: "",
    endDate: "",
    notes: "",
    details: "",
    status: "active" as const,
    contractDate: "",
    appointmentDate: "",
    price: "229.00",
    regionId: "",
  });

  const debouncedSearch = useDebounce(searchInput, 300);

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

  const { data: agreementsData, isLoading: agreementsLoading } = useQuery<AgreementsResponse>({
    queryKey: ["/api/crm/agreements", page, debouncedSearch, activeTab],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
        tab: activeTab,
      });
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      const res = await fetch(`/api/crm/agreements?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch agreements");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: regions = [] } = useQuery<MaintenanceRegion[]>({
    queryKey: ["/api/crm/maintenance-regions"],
    queryFn: async () => {
      const res = await fetch("/api/crm/maintenance-regions", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch regions");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const canManageTypes = currentUser?.role === "admin" || currentUser?.role === "owner" || currentUser?.role === "sales";
  const isAdminOrOwner = currentUser?.role === "admin" || currentUser?.role === "owner";
  const canSendInvoice = ["owner", "admin", "supervisor", "sales"].includes(currentUser?.role || "");

  const { data: customAgreementTypes = [], isLoading: typesLoading } = useQuery<CustomAgreementType[]>({
    queryKey: ["/api/crm/custom-agreement-types"],
    queryFn: async () => {
      const res = await fetch("/api/crm/custom-agreement-types", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom agreement types");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const createTypeMutation = useMutation({
    mutationFn: async (data: typeof typeForm) => {
      const res = await apiRequest("POST", "/api/crm/custom-agreement-types", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/custom-agreement-types"] });
      setShowCreateTypeDialog(false);
      setTypeForm({ name: "", description: "", frequency: "annual", visitFrequency: null, visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
      toast({ title: "Custom agreement type created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create custom agreement type", variant: "destructive" });
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<typeof typeForm> }) => {
      const res = await apiRequest("PATCH", `/api/crm/custom-agreement-types/${data.id}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/custom-agreement-types"] });
      setEditingType(null);
      setTypeForm({ name: "", description: "", frequency: "annual", visitFrequency: null, visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
      toast({ title: "Custom agreement type updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update custom agreement type", variant: "destructive" });
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/custom-agreement-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/custom-agreement-types"] });
      toast({ title: "Custom agreement type deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete custom agreement type", variant: "destructive" });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async (agreementId: string) => {
      const res = await apiRequest("POST", `/api/crm/agreements/${agreementId}/send-invoice`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      const msg = data.emailSent 
        ? `Invoice ${data.invoiceNumber} created and emailed to customer`
        : `Invoice ${data.invoiceNumber} created (no email on file)`;
      toast({ title: "Invoice Sent", description: msg });
      setSelectedAgreement(null);
    },
    onError: () => {
      toast({ title: "Failed to send invoice", variant: "destructive" });
    },
  });

  // Hide "Send First Invoice" if first invoice has already been sent (using the firstInvoiceSentAt field)
  const shouldHideFirstInvoiceButton = !!(selectedAgreement?.firstInvoiceSentAt);

  const createAgreementMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const res = await apiRequest("POST", "/api/crm/agreements", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      setShowCreateDialog(false);
      setCreateForm({
        agreementNumber: "",
        customerName: "",
        agreementPlan: "",
        address: "",
        nextServiceDate: "",
        nextInvoiceDate: "",
        startDate: "",
        endDate: "",
        notes: "",
        details: "",
        status: "active",
        contractDate: "",
        appointmentDate: "",
        price: "229.00",
        regionId: "",
      });
      toast({ title: "Agreement created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create agreement", variant: "destructive" });
    },
  });

  const updateAgreementMutation = useMutation({
    mutationFn: async () => {
      if (!editForm) return;
      const { id, ...body } = editForm;
      const res = await apiRequest("PATCH", `/api/crm/agreements/${id}`, {
        ...body,
        price: body.price || undefined,
        numberOfSystems: Number(body.numberOfSystems) || 1,
        visitsPerPeriod: Number(body.visitsPerPeriod) || 1,
      });
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      setEditForm(null);
      if (updated) setSelectedAgreement(updated);
      toast({ title: "Agreement updated" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to update agreement", variant: "destructive" }),
  });

  const deleteAgreementMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/agreements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      setSelectedAgreement(null);
      toast({ title: "Agreement deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete agreement", variant: "destructive" });
    },
  });

  const getAgreementStatus = (agreement: CrmAgreement): string => {
    // Honor any explicit non-active status before applying date-based logic
    if (agreement.status && agreement.status !== "active") {
      return agreement.status;
    }
    
    if (!agreement.endDate) return "active";
    
    const today = startOfDay(new Date());
    const endDate = startOfDay(new Date(agreement.endDate));
    const daysSinceEnd = differenceInCalendarDays(today, endDate);
    
    // daysSinceEnd < 0: Active (end date is in the future)
    // daysSinceEnd >= 0 && daysSinceEnd <= 30: Grace Period (0-30 days since expiration)
    // daysSinceEnd > 30: Expired (more than 30 days since expiration)
    if (daysSinceEnd < 0) {
      return "active";
    } else if (daysSinceEnd <= 30) {
      return "grace_period";
    } else {
      return "expired";
    }
  };

  // Use server-provided statusCounts which are computed across ALL agreements
  const statusCounts = useMemo(() => {
    if (agreementsData?.statusCounts) {
      return agreementsData.statusCounts;
    }
    return { active: 0, grace_period: 0, expired: 0, upcoming_service: 0, all_active: 0 };
  }, [agreementsData?.statusCounts]);

  const filteredAndSortedAgreements = useMemo(() => {
    if (!agreementsData?.agreements) return [];
    // Server now handles tab-based filtering, so we just apply agreement type filter and sorting
    let filtered = [...agreementsData.agreements];
    
    if (agreementTypeFilter !== "all") {
      filtered = filtered.filter((agreement) => agreement.agreementPlan === agreementTypeFilter);
    }

    filtered.sort((a, b) => {
      let aVal: string | number | Date = "";
      let bVal: string | number | Date = "";

      switch (sortField) {
        case "customerName":
          aVal = a.customerName || "";
          bVal = b.customerName || "";
          break;
        case "agreementNumber":
          aVal = a.agreementNumber || "";
          bVal = b.agreementNumber || "";
          break;
        case "agreementPlan":
          aVal = a.agreementPlan || "";
          bVal = b.agreementPlan || "";
          break;
        case "nextServiceDate":
          aVal = a.nextServiceDate ? new Date(a.nextServiceDate).getTime() : 0;
          bVal = b.nextServiceDate ? new Date(b.nextServiceDate).getTime() : 0;
          break;
        case "nextInvoiceDate":
          aVal = a.nextInvoiceDate ? new Date(a.nextInvoiceDate).getTime() : 0;
          bVal = b.nextInvoiceDate ? new Date(b.nextInvoiceDate).getTime() : 0;
          break;
        case "address":
          aVal = a.address || "";
          bVal = b.address || "";
          break;
        case "status":
          aVal = a.status || "active";
          bVal = b.status || "active";
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (sortDirection === "asc") {
        return (aVal as number) - (bVal as number);
      }
      return (bVal as number) - (aVal as number);
    });

    return filtered;
  }, [agreementsData?.agreements, activeTab, sortField, sortDirection, agreementTypeFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    }
    return sortDirection === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-[#711419]" />
      : <ArrowDown className="h-3 w-3 ml-1 text-[#711419]" />;
  };

  const resetFilters = () => {
    setActiveTab("all");
    setSearchInput("");
    setSortField("customerName");
    setSortDirection("asc");
    setAgreementTypeFilter("all");
  };

  const hasActiveFilters = activeTab !== "all" || debouncedSearch || agreementTypeFilter !== "all";

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    try {
      return format(parseISO(date), "MMM d, yyyy");
    } catch {
      return "—";
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.customerName.trim()) {
      toast({ title: "Customer name is required", variant: "destructive" });
      return;
    }
    if (!createForm.agreementNumber.trim()) {
      toast({ title: "Agreement number is required", variant: "destructive" });
      return;
    }
    if (!createForm.agreementPlan.trim()) {
      toast({ title: "Agreement plan is required", variant: "destructive" });
      return;
    }
    if (!createForm.address.trim()) {
      toast({ title: "Address is required", variant: "destructive" });
      return;
    }
    createAgreementMutation.mutate(createForm);
  };

  const handleContractDateChange = (contractDate: string) => {
    if (!contractDate) return;
    
    const contractDateObj = new Date(contractDate);
    const appointmentDate = format(addMonths(contractDateObj, 1), "yyyy-MM-dd");
    const endDate = format(addYears(contractDateObj, 1), "yyyy-MM-dd");
    
    setCreateForm({
      ...createForm,
      contractDate,
      nextInvoiceDate: contractDate,
      appointmentDate,
      startDate: contractDate,
      endDate,
      nextServiceDate: appointmentDate,
    });
  };

  const getVisitSummary = (appointmentDateStr: string) => {
    if (!appointmentDateStr) return null;
    try {
      const appointmentDate = parseISO(appointmentDateStr);
      const secondVisit = addMonths(appointmentDate, 6);
      return {
        firstVisit: format(appointmentDate, "MMM d, yyyy"),
        secondVisit: format(secondVisit, "MMM d, yyyy"),
      };
    } catch {
      return null;
    }
  };

  const getSelectedRegion = (regionId: string) => {
    return regions.find((r) => r.id === regionId);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const totalPages = agreementsData?.pagination?.totalPages || 0;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Title + subheading · centered search · actions — all on one row */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="min-w-0 shrink-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground truncate" data-testid="text-agreements-title">
              Service Agreements
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Preventative maintenance &amp; service plans</p>
          </div>

          <div className="relative w-full lg:flex-1 lg:max-w-sm lg:mx-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agreements…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search"
            />
          </div>

            <div className="flex shrink-0 items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 text-xs text-slate-600"
                data-testid="button-reset-filters"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettingsDialog(true)}
              className="h-8 px-2"
              data-testid="button-agreement-settings"
              title="Manage Custom Agreement Types"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="bg-[#711419] hover:bg-[#5a1014]"
                  data-testid="button-create-agreement"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Agreement
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Select Agreement Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/crm/agreements/new?type=preventative")}
                  className="cursor-pointer"
                  data-testid="menu-item-preventative"
                >
                  <Wrench className="h-4 w-4 mr-2 text-[#711419]" />
                  <div>
                    <div className="font-medium">Preventative Maintenance</div>
                    <div className="text-xs text-slate-500">Standard annual maintenance agreement</div>
                  </div>
                </DropdownMenuItem>
                
                {customAgreementTypes.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-slate-500">Custom Agreement Types</DropdownMenuLabel>
                    {customAgreementTypes.filter(t => t.isActive).map((type) => (
                      <DropdownMenuItem
                        key={type.id}
                        onClick={() => navigate(`/crm/agreements/new?type=custom&typeId=${type.id}`)}
                        className="cursor-pointer"
                        data-testid={`menu-item-custom-${type.id}`}
                      >
                        <FileText className="h-4 w-4 mr-2 text-slate-500" />
                        <div>
                          <div className="font-medium">{type.name}</div>
                          {type.description && (
                            <div className="text-xs text-slate-500 truncate max-w-[180px]">{type.description}</div>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                
                {canManageTypes && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowSettingsDialog(true)}
                      className="cursor-pointer text-slate-600"
                      data-testid="menu-item-manage-types"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Manage Custom Types
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
        </div>

        {/* Tab Filters with Type dropdown on right */}
        <div className="flex items-center justify-between border-b border-slate-200">
          <div className="flex overflow-x-auto overflow-y-hidden">
            {tabFilters.map((tab) => {
              const count = tab.key === "all" ? statusCounts.all_active
                : tab.key === "pending" ? statusCounts.pending
                : tab.key === "active" ? statusCounts.active
                : tab.key === "upcoming_service" ? statusCounts.upcoming_service
                : tab.key === "grace_period" ? statusCounts.grace_period
                : tab.key === "expired" ? statusCounts.expired
                : null;

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    activeTab === tab.key
                      ? "border-[#711419] text-[#711419]"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                  data-testid={`tab-${tab.key}`}
                >
                {tab.label}
                {count != null && count > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded ${
                    activeTab === tab.key ? "bg-[#711419] text-white" : "bg-slate-200 text-slate-600"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          </div>
          <div className="shrink-0 pb-1">
            <Select value={agreementTypeFilter} onValueChange={setAgreementTypeFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs border-0 bg-transparent focus:ring-0 focus:ring-offset-0" data-testid="select-agreement-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all" className="text-xs focus:bg-[#711419]/10 focus:text-[#711419]">All Types</SelectItem>
                <SelectItem value="Preventative Maintenance" className="text-xs focus:bg-[#711419]/10 focus:text-[#711419]">Preventative Maintenance</SelectItem>
                {customAgreementTypes.filter(t => t.isActive).map((type) => (
                  <SelectItem key={type.id} value={type.name} className="text-xs focus:bg-[#711419]/10 focus:text-[#711419]">
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort("customerName")}
                    data-testid="sort-customer"
                  >
                    <div className="flex items-center">
                      Customer
                      {getSortIcon("customerName")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort("agreementNumber")}
                    data-testid="sort-agreement-number"
                  >
                    <div className="flex items-center">
                      Agreement #
                      {getSortIcon("agreementNumber")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort("agreementPlan")}
                    data-testid="sort-plan"
                  >
                    <div className="flex items-center">
                      Plan
                      {getSortIcon("agreementPlan")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort("nextServiceDate")}
                    data-testid="sort-next-service"
                  >
                    <div className="flex items-center">
                      Next Service
                      {getSortIcon("nextServiceDate")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none hidden md:table-cell"
                    onClick={() => handleSort("nextInvoiceDate")}
                    data-testid="sort-next-invoice"
                  >
                    <div className="flex items-center">
                      Next Invoice
                      {getSortIcon("nextInvoiceDate")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none hidden lg:table-cell"
                    onClick={() => handleSort("address")}
                    data-testid="sort-address"
                  >
                    <div className="flex items-center">
                      Address
                      {getSortIcon("address")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort("status")}
                    data-testid="sort-status"
                  >
                    <div className="flex items-center">
                      Status
                      {getSortIcon("status")}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agreementsLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredAndSortedAgreements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <FileCheck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No agreements found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {hasActiveFilters
                          ? "Try adjusting your search or filters"
                          : "Create your first service agreement"}
                      </p>
                      {!hasActiveFilters && (
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() => navigate("/crm/agreements/new?type=preventative")}
                          data-testid="button-create-first-agreement"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create Agreement
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedAgreements.map((agreement) => (
                    <TableRow
                      key={agreement.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedAgreement(agreement)}
                      data-testid={`row-agreement-${agreement.id}`}
                    >
                      <TableCell className="font-medium">{formatCustomerName(agreement.customerName)}</TableCell>
                      <TableCell className="text-slate-600">{agreement.agreementNumber}</TableCell>
                      <TableCell className="text-slate-600">{agreement.agreementPlan}</TableCell>
                      <TableCell className="text-slate-600">{formatDate(agreement.nextServiceDate)}</TableCell>
                      <TableCell className="text-slate-600 hidden md:table-cell">{formatDate(agreement.nextInvoiceDate)}</TableCell>
                      <TableCell className="text-slate-600 hidden lg:table-cell max-w-[200px] truncate">
                        {agreement.address || "—"}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const calculatedStatus = getAgreementStatus(agreement);
                          return (
                            <StatusDot pill={`border ${statusColors[calculatedStatus] || statusColors.active}`}>
                              {statusLabels[calculatedStatus] || calculatedStatus}
                            </StatusDot>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Are you sure you want to delete this agreement?")) {
                                deleteAgreementMutation.mutate(agreement.id);
                              }
                            }}
                            disabled={deleteAgreementMutation.isPending}
                            data-testid={`button-delete-${agreement.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
                className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="button-next-page"
                className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Agreement</DialogTitle>
            <DialogDescription>
              Enter the details for the new service agreement.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="agreementNumber">Agreement Number *</Label>
                <Input
                  id="agreementNumber"
                  value={createForm.agreementNumber}
                  onChange={(e) => setCreateForm({ ...createForm, agreementNumber: e.target.value })}
                  placeholder="AGR-001"
                  data-testid="input-agreement-number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  value={createForm.customerName}
                  onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
                  placeholder="John Smith"
                  data-testid="input-customer-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="agreementPlan">Agreement Plan *</Label>
                <Input
                  id="agreementPlan"
                  value={createForm.agreementPlan}
                  onChange={(e) => setCreateForm({ ...createForm, agreementPlan: e.target.value })}
                  placeholder="1 unit, 5 units, etc."
                  data-testid="input-agreement-plan"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Service Address *</Label>
                <Input
                  id="address"
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  placeholder="123 Main St, City, ST 12345"
                  data-testid="input-address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="contractDate">Contract Date</Label>
                  <Input
                    id="contractDate"
                    type="date"
                    value={createForm.contractDate}
                    onChange={(e) => handleContractDateChange(e.target.value)}
                    data-testid="input-contract-date"
                  />
                  <p className="text-xs text-slate-500">Sets start, end, invoice & appointment dates automatically</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={createForm.price}
                    onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                    data-testid="input-price"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="regionId">Region</Label>
                <Select
                  value={createForm.regionId}
                  onValueChange={(value) => setCreateForm({ ...createForm, regionId: value })}
                >
                  <SelectTrigger data-testid="select-region">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem key={region.id} value={region.id}>
                        {region.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.regionId && getSelectedRegion(createForm.regionId) && (
                  <p className="text-xs text-slate-500">
                    Reminders sent on the {getSelectedRegion(createForm.regionId)?.reminderDayOfMonth}{getSelectedRegion(createForm.regionId)?.reminderDayOfMonth === 1 ? 'st' : getSelectedRegion(createForm.regionId)?.reminderDayOfMonth === 2 ? 'nd' : getSelectedRegion(createForm.regionId)?.reminderDayOfMonth === 3 ? 'rd' : 'th'} of appointment month
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="appointmentDate">First Appointment Date</Label>
                  <Input
                    id="appointmentDate"
                    type="date"
                    value={createForm.appointmentDate}
                    onChange={(e) => setCreateForm({ ...createForm, appointmentDate: e.target.value, nextServiceDate: e.target.value })}
                    data-testid="input-appointment-date"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nextInvoiceDate">Next Invoice Date</Label>
                  <Input
                    id="nextInvoiceDate"
                    type="date"
                    value={createForm.nextInvoiceDate}
                    onChange={(e) => setCreateForm({ ...createForm, nextInvoiceDate: e.target.value })}
                    data-testid="input-next-invoice-date"
                  />
                </div>
              </div>
              {createForm.appointmentDate && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-700">
                    <strong>Visit Schedule:</strong> First visit: {getVisitSummary(createForm.appointmentDate)?.firstVisit}, Second visit: {getVisitSummary(createForm.appointmentDate)?.secondVisit}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    data-testid="input-start-date"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={createForm.endDate}
                    onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                    data-testid="input-end-date"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={createForm.status}
                  onValueChange={(value) => setCreateForm({ ...createForm, status: value as typeof createForm.status })}
                >
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expiring">Expiring</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  data-testid="input-notes"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="agr-details">Agreement details (printed on the client document)</Label>
                <Textarea
                  id="agr-details"
                  value={createForm.details}
                  onChange={(e) => setCreateForm({ ...createForm, details: e.target.value })}
                  placeholder="What this agreement covers, inclusions, special terms… Blank lines start new paragraphs on the printed document."
                  rows={4}
                  data-testid="textarea-agreement-details"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#711419] hover:bg-[#5a1014]"
                disabled={createAgreementMutation.isPending}
                data-testid="button-submit-create"
              >
                {createAgreementMutation.isPending ? "Creating..." : "Create Agreement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit agreement */}
      <Dialog open={!!editForm} onOpenChange={(o) => !o && setEditForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Agreement</DialogTitle>
            <DialogDescription>Changes apply to billing, scheduling, and the printed document.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Plan name</Label>
                  <Input value={editForm.agreementPlan} onChange={(e) => setEditForm({ ...editForm, agreementPlan: e.target.value })} data-testid="edit-plan" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Price</Label>
                  <Input type="number" min="0" step="0.01" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} data-testid="edit-price" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label>Systems</Label>
                  <Input type="number" min="1" value={editForm.numberOfSystems} onChange={(e) => setEditForm({ ...editForm, numberOfSystems: Number(e.target.value) || 1 })} data-testid="edit-systems" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Visits / yr</Label>
                  <Input type="number" min="1" value={editForm.visitsPerPeriod} onChange={(e) => setEditForm({ ...editForm, visitsPerPeriod: Number(e.target.value) || 1 })} data-testid="edit-visits" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger data-testid="edit-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pending", "active", "grace_period", "expired", "cancelled"].map((st) => (
                        <SelectItem key={st} value={st} className="capitalize">{st.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label>Contract date</Label>
                  <Input type="date" value={editForm.contractDate} onChange={(e) => setEditForm({ ...editForm, contractDate: e.target.value })} data-testid="edit-contract-date" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Start</Label>
                  <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} data-testid="edit-start" />
                </div>
                <div className="grid gap-1.5">
                  <Label>End</Label>
                  <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} data-testid="edit-end" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Billing</Label>
                  <Select value={editForm.billingPreference} onValueChange={(v) => setEditForm({ ...editForm, billingPreference: v })}>
                    <SelectTrigger data-testid="edit-billing"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto_invoice">Auto invoice</SelectItem>
                      <SelectItem value="pay_on_visit">Pay per visit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[#711419]" checked={editForm.autoRenew} onChange={(e) => setEditForm({ ...editForm, autoRenew: e.target.checked })} data-testid="edit-autorenew" />
                  Auto-renew
                </label>
              </div>
              <div className="grid gap-1.5">
                <Label>Notes (internal)</Label>
                <Textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} data-testid="edit-notes" />
              </div>
              <div className="grid gap-1.5">
                <Label>Agreement details (printed on the client document)</Label>
                <Textarea
                  rows={5}
                  value={editForm.details}
                  onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                  placeholder="What this agreement covers, inclusions, special terms… Blank lines start new paragraphs on the printed document."
                  data-testid="edit-details"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={updateAgreementMutation.isPending}
              onClick={() => updateAgreementMutation.mutate()}
              data-testid="save-agreement-edit"
            >
              {updateAgreementMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedAgreement}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAgreement(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agreement Details</DialogTitle>
            <DialogDescription>
              {selectedAgreement?.agreementNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedAgreement && (
            <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-500 text-xs">Customer</Label>
                      <p className="font-medium">{formatCustomerName(selectedAgreement.customerName)}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">Status</Label>
                      <div>
                        <StatusDot pill={`border ${statusColors[selectedAgreement.status] || statusColors.active}`}>
                          {statusLabels[selectedAgreement.status] || selectedAgreement.status}
                        </StatusDot>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-500 text-xs">Agreement Plan</Label>
                      <p className="font-medium">{selectedAgreement.agreementPlan}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">Address</Label>
                      <p className="font-medium">{selectedAgreement.address || "—"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-500 text-xs">Contract Date</Label>
                      <p className="font-medium">{formatDate(selectedAgreement.contractDate)}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">Price</Label>
                      <p className="font-medium">${selectedAgreement.price || "229.00"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-500 text-xs">Billing Type</Label>
                      <p className="font-medium">
                        {selectedAgreement.billingPreference === "pay_on_visit" ? "Pay Per Visit" : "Auto Invoice"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">Region</Label>
                      <p className="font-medium">
                        {selectedAgreement.regionId ? getSelectedRegion(selectedAgreement.regionId)?.name || "—" : "—"}
                      </p>
                      {selectedAgreement.regionId && getSelectedRegion(selectedAgreement.regionId) && (
                        <p className="text-xs text-slate-500">
                          Reminders on the {getSelectedRegion(selectedAgreement.regionId)?.reminderDayOfMonth}{getSelectedRegion(selectedAgreement.regionId)?.reminderDayOfMonth === 1 ? 'st' : getSelectedRegion(selectedAgreement.regionId)?.reminderDayOfMonth === 2 ? 'nd' : getSelectedRegion(selectedAgreement.regionId)?.reminderDayOfMonth === 3 ? 'rd' : 'th'}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">First Appointment</Label>
                      <p className="font-medium">{formatDate(selectedAgreement.appointmentDate)}</p>
                    </div>
                  </div>
                  {selectedAgreement.appointmentDate && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-700">
                        <strong>Visit Schedule:</strong> First visit: {getVisitSummary(selectedAgreement.appointmentDate)?.firstVisit}, Second visit: {getVisitSummary(selectedAgreement.appointmentDate)?.secondVisit}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-500 text-xs">Next Service Date</Label>
                      <p className="font-medium">{formatDate(selectedAgreement.nextServiceDate)}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">Next Invoice Date</Label>
                      <p className="font-medium">{formatDate(selectedAgreement.nextInvoiceDate)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-500 text-xs">Start Date</Label>
                      <p className="font-medium">{formatDate(selectedAgreement.startDate)}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">End Date</Label>
                      <p className="font-medium">{formatDate(selectedAgreement.endDate)}</p>
                    </div>
                  </div>
                  {selectedAgreement.notes && (
                    <div>
                      <Label className="text-slate-500 text-xs">Notes</Label>
                      <p className="text-sm">{selectedAgreement.notes}</p>
                    </div>
                  )}
                  {selectedAgreement.details && (
                    <div>
                      <Label className="text-slate-500 text-xs">Agreement details (printed on document)</Label>
                      <p className="whitespace-pre-wrap text-sm">{selectedAgreement.details}</p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/crm/agreements/${selectedAgreement.id}/print`)}
                      data-testid="button-print-agreement"
                    >
                      <Printer className="h-4 w-4 mr-1" /> Print
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditForm({
                          id: selectedAgreement.id,
                          agreementPlan: selectedAgreement.agreementPlan || "",
                          price: String(selectedAgreement.price ?? ""),
                          numberOfSystems: selectedAgreement.numberOfSystems ?? 1,
                          visitsPerPeriod: selectedAgreement.visitsPerPeriod ?? 2,
                          startDate: selectedAgreement.startDate || "",
                          endDate: selectedAgreement.endDate || "",
                          contractDate: selectedAgreement.contractDate || "",
                          autoRenew: !!selectedAgreement.autoRenew,
                          billingPreference: selectedAgreement.billingPreference || "auto_invoice",
                          status: selectedAgreement.status || "active",
                          notes: selectedAgreement.notes || "",
                          details: selectedAgreement.details || "",
                        })
                      }
                      data-testid="button-edit-agreement"
                    >
                      <Edit className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    {canSendInvoice && 
                      selectedAgreement.billingPreference !== "pay_on_visit" && 
                      ((selectedAgreement.status === "pending" && !shouldHideFirstInvoiceButton) || selectedAgreement.status === "active") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const msg = selectedAgreement.status === "pending" 
                            ? `Create and send first invoice to ${selectedAgreement.customerName} for $${selectedAgreement.price || "0"}?`
                            : `Send a renewal invoice to ${selectedAgreement.customerName} for $${selectedAgreement.price || "0"}?`;
                          if (confirm(msg)) {
                            sendInvoiceMutation.mutate(selectedAgreement.id);
                          }
                        }}
                        disabled={sendInvoiceMutation.isPending}
                        data-testid="button-send-invoice"
                        className="text-[#711419] border-[#711419] hover:bg-[#711419]/10"
                      >
                        <FileCheck className="h-4 w-4 mr-1" />
                        {sendInvoiceMutation.isPending ? "Sending..." : selectedAgreement.status === "pending" ? "Send First Invoice" : "Send Invoice"}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this agreement?")) {
                          deleteAgreementMutation.mutate(selectedAgreement.id);
                        }
                      }}
                      disabled={deleteAgreementMutation.isPending}
                      data-testid="button-delete-agreement"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog - Agreement Types */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Agreement Types</DialogTitle>
            <DialogDescription>
              Manage custom agreement type templates.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-4">
            <div className="mb-4">
              <Button
                size="sm"
                className="bg-[#711419] hover:bg-[#5a1014]"
                onClick={() => {
                  setTypeForm({ name: "", description: "", frequency: "annual", visitFrequency: null, visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
                  setShowCreateTypeDialog(true);
                }}
                data-testid="button-create-type"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Agreement Type
              </Button>
            </div>

            {typesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : customAgreementTypes.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Settings className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                <p>No custom agreement types yet</p>
                <p className="text-sm">Create one to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Frequency</TableHead>
                    <TableHead className="text-center">Visits/Period</TableHead>
                    <TableHead className="text-right">Default Price</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customAgreementTypes.map((type) => (
                    <TableRow key={type.id} data-testid={`row-type-${type.id}`}>
                      <TableCell className="font-medium">{type.name}</TableCell>
                      <TableCell className="text-slate-600 max-w-[200px] truncate">
                        {type.description || "—"}
                      </TableCell>
                      <TableCell className="text-center capitalize">{type.frequency || "annual"}</TableCell>
                      <TableCell className="text-center">{type.visitsPerPeriod}</TableCell>
                      <TableCell className="text-right">${type.defaultPrice || "0.00"}</TableCell>
                      <TableCell className="text-center">
                        {type.isActive ? (
                          <Check className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-slate-400 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setEditingType(type);
                              setTypeForm({
                                name: type.name,
                                description: type.description || "",
                                frequency: type.frequency || "annual",
                                visitFrequency: type.visitFrequency || null,
                                visitsPerPeriod: type.visitsPerPeriod,
                                defaultPrice: type.defaultPrice || "0.00",
                                isActive: type.isActive,
                              });
                            }}
                            data-testid={`button-edit-type-${type.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${type.name}"?`)) {
                                deleteTypeMutation.mutate(type.id);
                              }
                            }}
                            disabled={deleteTypeMutation.isPending}
                            data-testid={`button-delete-type-${type.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Custom Agreement Type Dialog */}
      <Dialog 
        open={showCreateTypeDialog || !!editingType} 
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateTypeDialog(false);
            setEditingType(null);
            setTypeForm({ name: "", description: "", frequency: "annual", visitFrequency: null, visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit Agreement Type" : "Create Agreement Type"}</DialogTitle>
            <DialogDescription>
              {editingType 
                ? "Update the custom agreement type details." 
                : "Create a new reusable agreement type template."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!typeForm.name.trim()) {
                toast({ title: "Name is required", variant: "destructive" });
                return;
              }
              if (editingType) {
                updateTypeMutation.mutate({ id: editingType.id, updates: typeForm });
              } else {
                createTypeMutation.mutate(typeForm);
              }
            }}
          >
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="type-name">Name *</Label>
                <Input
                  id="type-name"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="e.g., Annual Crawlspace Inspection"
                  data-testid="input-type-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type-description">Description</Label>
                <Textarea
                  id="type-description"
                  value={typeForm.description}
                  onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                  placeholder="Optional description of the service"
                  data-testid="input-type-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 items-end">
                <div className="grid gap-2">
                  <Label htmlFor="type-frequency">Billing Cycle *</Label>
                  <Select
                    value={typeForm.frequency}
                    onValueChange={(value: "weekly" | "monthly" | "annual") => {
                      const effectiveVisitFreq = typeForm.visitFrequency || value;
                      const max = effectiveVisitFreq === "weekly" ? 7 : effectiveVisitFreq === "monthly" ? 30 : 365;
                      setTypeForm({ 
                        ...typeForm, 
                        frequency: value,
                        visitsPerPeriod: Math.min(typeForm.visitsPerPeriod, max)
                      });
                    }}
                  >
                    <SelectTrigger id="type-frequency" data-testid="select-type-frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type-visit-frequency">Visit Schedule</Label>
                  <Select
                    value={typeForm.visitFrequency ?? "same"}
                    onValueChange={(value: "same" | "weekly" | "monthly" | "annual") => {
                      const visitFrequency = value === "same" ? null : value;
                      const effectiveVisitFreq = visitFrequency || typeForm.frequency;
                      const max = effectiveVisitFreq === "weekly" ? 7 : effectiveVisitFreq === "monthly" ? 30 : 365;
                      setTypeForm({
                        ...typeForm,
                        visitFrequency,
                        visitsPerPeriod: Math.min(typeForm.visitsPerPeriod, max),
                      });
                    }}
                  >
                    <SelectTrigger id="type-visit-frequency" data-testid="select-type-visit-frequency">
                      <SelectValue placeholder="Same as billing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">Same as billing</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual (spread across year)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Set "Visit Schedule" to spread tune-up visits differently than billing — e.g. a monthly-billed plan with visits spread across the year.
              </p>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="type-visits">Visits *</Label>
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const vf = typeForm.visitFrequency || typeForm.frequency;
                      const label = vf === "weekly" ? "7" : vf === "monthly" ? "30" : "365";
                      const per = vf === "annual" ? "per year" : vf === "monthly" ? "per month" : "per week";
                      return `(max ${label}, ${per})`;
                    })()}
                  </span>
                </div>
                <Input
                  id="type-visits"
                  type="number"
                  min="1"
                  max={(() => {
                    const vf = typeForm.visitFrequency || typeForm.frequency;
                    return vf === "weekly" ? 7 : vf === "monthly" ? 30 : 365;
                  })()}
                  value={typeForm.visitsPerPeriod}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    if (rawValue === "") {
                      setTypeForm({ ...typeForm, visitsPerPeriod: 1 });
                      return;
                    }
                    const val = parseInt(rawValue);
                    if (isNaN(val)) return;
                    const vf = typeForm.visitFrequency || typeForm.frequency;
                    const max = vf === "weekly" ? 7 : vf === "monthly" ? 30 : 365;
                    setTypeForm({ ...typeForm, visitsPerPeriod: Math.max(1, Math.min(val, max)) });
                  }}
                  data-testid="input-type-visits"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type-price">Default Price ($) *</Label>
                <Input
                  id="type-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={typeForm.defaultPrice}
                  onChange={(e) => setTypeForm({ ...typeForm, defaultPrice: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-type-price"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="type-active"
                  checked={typeForm.isActive}
                  onCheckedChange={(checked) => setTypeForm({ ...typeForm, isActive: checked })}
                  data-testid="switch-type-active"
                />
                <Label htmlFor="type-active">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateTypeDialog(false);
                  setEditingType(null);
                  setTypeForm({ name: "", description: "", frequency: "annual", visitFrequency: null, visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
                }}
                data-testid="button-cancel-type"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#711419] hover:bg-[#5a1014]"
                disabled={createTypeMutation.isPending || updateTypeMutation.isPending}
                data-testid="button-save-type"
              >
                {(createTypeMutation.isPending || updateTypeMutation.isPending) 
                  ? "Saving..." 
                  : editingType ? "Save Changes" : "Create Type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
