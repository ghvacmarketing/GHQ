import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  Eye,
  Edit,
  Settings,
  Check,
  X,
  ChevronDown,
  Wrench,
  FileText,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, addDays, subDays, addMonths, addYears, isAfter, isBefore, startOfDay, differenceInCalendarDays } from "date-fns";
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
  active: "Active",
  grace_period: "Grace Period",
  expired: "Expired",
  cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  grace_period: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

const tabFilters = [
  { key: "all", label: "All Active" },
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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedAgreement, setSelectedAgreement] = useState<CrmAgreement | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<typeof createForm | null>(null);
  
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showCreateTypeDialog, setShowCreateTypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<CustomAgreementType | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "",
    description: "",
    frequency: "annual" as "weekly" | "monthly" | "annual",
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
    queryKey: ["/api/crm/agreements", page, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
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
      setTypeForm({ name: "", description: "", frequency: "annual", visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
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
      setTypeForm({ name: "", description: "", frequency: "annual", visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
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

  const updateAgreementMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<typeof createForm> }) => {
      const res = await apiRequest("PATCH", `/api/crm/agreements/${data.id}`, data.updates);
      return res.json();
    },
    onSuccess: (updatedAgreement) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      setIsEditing(false);
      setEditForm(null);
      // Update the selected agreement with the new data to reflect changes
      setSelectedAgreement(updatedAgreement);
      toast({ title: "Agreement updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update agreement", variant: "destructive" });
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

  const statusCounts = useMemo(() => {
    if (!agreementsData?.agreements) return { active: 0, grace_period: 0, expired: 0, upcoming_service: 0, all_active: 0 };
    const counts = { active: 0, grace_period: 0, expired: 0, upcoming_service: 0, all_active: 0 };

    const today = startOfDay(new Date());
    const fifteenDaysFromNow = addDays(today, 15);

    agreementsData.agreements.forEach((agreement) => {
      const status = getAgreementStatus(agreement);
      if (status === "active") counts.active++;
      else if (status === "grace_period") counts.grace_period++;
      else if (status === "expired") counts.expired++;
      
      if (agreement.nextServiceDate) {
        const nextServiceDate = startOfDay(new Date(agreement.nextServiceDate));
        const daysUntilService = differenceInCalendarDays(nextServiceDate, today);
        if (daysUntilService >= 0 && daysUntilService <= 15) {
          counts.upcoming_service++;
        }
      }
    });
    
    counts.all_active = counts.active + counts.grace_period;
    return counts;
  }, [agreementsData?.agreements]);

  const filteredAndSortedAgreements = useMemo(() => {
    if (!agreementsData?.agreements) return [];
    let filtered = [...agreementsData.agreements];

    const today = startOfDay(new Date());
    const fifteenDaysFromNow = addDays(today, 15);

    if (activeTab === "all") {
      filtered = filtered.filter((agreement) => {
        const status = getAgreementStatus(agreement);
        return status !== "expired" && status !== "cancelled";
      });
    } else if (activeTab === "grace_period") {
      filtered = filtered.filter((agreement) => {
        return getAgreementStatus(agreement) === "grace_period";
      });
    } else if (activeTab === "upcoming_service") {
      filtered = filtered.filter((agreement) => {
        if (!agreement.nextServiceDate) return false;
        const nextServiceDate = startOfDay(new Date(agreement.nextServiceDate));
        const daysUntilService = differenceInCalendarDays(nextServiceDate, today);
        return daysUntilService >= 0 && daysUntilService <= 15;
      });
    } else if (activeTab === "active") {
      filtered = filtered.filter((agreement) => getAgreementStatus(agreement) === "active");
    } else if (activeTab === "expired") {
      filtered = filtered.filter((agreement) => getAgreementStatus(agreement) === "expired");
    }
    
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
      return format(new Date(date), "MMM d, yyyy");
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

  const handleStartEdit = () => {
    if (selectedAgreement) {
      setEditForm({
        agreementNumber: selectedAgreement.agreementNumber || "",
        customerName: selectedAgreement.customerName || "",
        agreementPlan: selectedAgreement.agreementPlan || "",
        address: selectedAgreement.address || "",
        nextServiceDate: selectedAgreement.nextServiceDate || "",
        nextInvoiceDate: selectedAgreement.nextInvoiceDate || "",
        startDate: selectedAgreement.startDate || "",
        endDate: selectedAgreement.endDate || "",
        notes: selectedAgreement.notes || "",
        status: selectedAgreement.status as typeof createForm.status,
        contractDate: selectedAgreement.contractDate || "",
        appointmentDate: selectedAgreement.appointmentDate || "",
        price: selectedAgreement.price || "229.00",
        regionId: selectedAgreement.regionId || "",
      });
      setIsEditing(true);
    }
  };

  const handleContractDateChange = (contractDate: string, isEdit = false) => {
    if (!contractDate) return;
    
    const contractDateObj = new Date(contractDate);
    const appointmentDate = format(addMonths(contractDateObj, 1), "yyyy-MM-dd");
    const endDate = format(addYears(contractDateObj, 1), "yyyy-MM-dd");
    
    const updates = {
      contractDate,
      nextInvoiceDate: contractDate,
      appointmentDate,
      startDate: contractDate,
      endDate,
      nextServiceDate: appointmentDate,
    };
    
    if (isEdit && editForm) {
      setEditForm({ ...editForm, ...updates });
    } else {
      setCreateForm({ ...createForm, ...updates });
    }
  };

  const getVisitSummary = (appointmentDateStr: string) => {
    if (!appointmentDateStr) return null;
    try {
      const appointmentDate = new Date(appointmentDateStr);
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

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm || !selectedAgreement) return;
    if (!editForm.address.trim()) {
      toast({ title: "Address is required", variant: "destructive" });
      return;
    }
    updateAgreementMutation.mutate({
      id: selectedAgreement.id,
      updates: editForm,
    });
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

  const totalPages = agreementsData?.pagination?.totalPages || 0;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Search bar at top - DoorLoop style */}
        <div className="flex justify-center mb-2">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by customer, agreement #, address..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-agreements-title">
              Service Agreements
            </h1>
            <p className="text-sm text-slate-500">
              {filteredAndSortedAgreements.length} agreement{filteredAndSortedAgreements.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Tab Filters */}
        <div className="flex items-center justify-between border-b border-slate-200">
          <div className="flex overflow-x-auto">
            {tabFilters.map((tab) => {
              const count = tab.key === "all" ? statusCounts.all_active
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
                          onClick={() => setShowCreateDialog(true)}
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
                            <Badge className={`border ${statusColors[calculatedStatus] || statusColors.active}`}>
                              {statusLabels[calculatedStatus] || calculatedStatus}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAgreement(agreement);
                            }}
                            data-testid={`button-view-${agreement.id}`}
                          >
                            <Eye className="h-4 w-4" />
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
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

      <Dialog
        open={!!selectedAgreement}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAgreement(null);
            setIsEditing(false);
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Agreement" : "Agreement Details"}</DialogTitle>
            <DialogDescription>
              {selectedAgreement?.agreementNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedAgreement && (
            <>
              {isEditing && editForm ? (
                <form onSubmit={handleEditSubmit}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-agreementNumber">Agreement Number *</Label>
                      <Input
                        id="edit-agreementNumber"
                        value={editForm.agreementNumber}
                        onChange={(e) => setEditForm({ ...editForm, agreementNumber: e.target.value })}
                        placeholder="AGR-001"
                        data-testid="input-edit-agreement-number"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-customerName">Customer Name *</Label>
                      <Input
                        id="edit-customerName"
                        value={editForm.customerName}
                        onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                        placeholder="John Smith"
                        data-testid="input-edit-customer-name"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-agreementPlan">Agreement Plan *</Label>
                      <Input
                        id="edit-agreementPlan"
                        value={editForm.agreementPlan}
                        onChange={(e) => setEditForm({ ...editForm, agreementPlan: e.target.value })}
                        placeholder="1 unit, 5 units, etc."
                        data-testid="input-edit-agreement-plan"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-address">Service Address *</Label>
                      <Input
                        id="edit-address"
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        placeholder="123 Main St, City, ST 12345"
                        data-testid="input-edit-address"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-contractDate">Contract Date</Label>
                        <Input
                          id="edit-contractDate"
                          type="date"
                          value={editForm.contractDate}
                          onChange={(e) => handleContractDateChange(e.target.value, true)}
                          data-testid="input-edit-contract-date"
                        />
                        <p className="text-xs text-slate-500">Sets start, end, invoice & appointment dates automatically</p>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="edit-price">Price ($)</Label>
                        <Input
                          id="edit-price"
                          type="number"
                          step="0.01"
                          value={editForm.price}
                          onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                          data-testid="input-edit-price"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-regionId">Region</Label>
                      <Select
                        value={editForm.regionId}
                        onValueChange={(value) => setEditForm({ ...editForm, regionId: value })}
                      >
                        <SelectTrigger data-testid="select-edit-region">
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
                      {editForm.regionId && getSelectedRegion(editForm.regionId) && (
                        <p className="text-xs text-slate-500">
                          Reminders sent on the {getSelectedRegion(editForm.regionId)?.reminderDayOfMonth}{getSelectedRegion(editForm.regionId)?.reminderDayOfMonth === 1 ? 'st' : getSelectedRegion(editForm.regionId)?.reminderDayOfMonth === 2 ? 'nd' : getSelectedRegion(editForm.regionId)?.reminderDayOfMonth === 3 ? 'rd' : 'th'} of appointment month
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-appointmentDate">First Appointment Date</Label>
                        <Input
                          id="edit-appointmentDate"
                          type="date"
                          value={editForm.appointmentDate}
                          onChange={(e) => setEditForm({ ...editForm, appointmentDate: e.target.value, nextServiceDate: e.target.value })}
                          data-testid="input-edit-appointment-date"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="edit-nextInvoiceDate">Next Invoice Date</Label>
                        <Input
                          id="edit-nextInvoiceDate"
                          type="date"
                          value={editForm.nextInvoiceDate}
                          onChange={(e) => setEditForm({ ...editForm, nextInvoiceDate: e.target.value })}
                          data-testid="input-edit-next-invoice-date"
                        />
                      </div>
                    </div>
                    {editForm.appointmentDate && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-700">
                          <strong>Visit Schedule:</strong> First visit: {getVisitSummary(editForm.appointmentDate)?.firstVisit}, Second visit: {getVisitSummary(editForm.appointmentDate)?.secondVisit}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-startDate">Start Date</Label>
                        <Input
                          id="edit-startDate"
                          type="date"
                          value={editForm.startDate}
                          onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                          data-testid="input-edit-start-date"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="edit-endDate">End Date</Label>
                        <Input
                          id="edit-endDate"
                          type="date"
                          value={editForm.endDate}
                          onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                          data-testid="input-edit-end-date"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-status">Status</Label>
                      <Select
                        value={editForm.status}
                        onValueChange={(value) => setEditForm({ ...editForm, status: value as typeof editForm.status })}
                      >
                        <SelectTrigger data-testid="select-edit-status">
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
                      <Label htmlFor="edit-notes">Notes</Label>
                      <Textarea
                        id="edit-notes"
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        placeholder="Any additional notes..."
                        data-testid="input-edit-notes"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setEditForm(null);
                      }}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-[#711419] hover:bg-[#5a1014]"
                      disabled={updateAgreementMutation.isPending}
                      data-testid="button-save-edit"
                    >
                      {updateAgreementMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-500 text-xs">Customer</Label>
                      <p className="font-medium">{formatCustomerName(selectedAgreement.customerName)}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-xs">Status</Label>
                      <div>
                        <Badge className={`border ${statusColors[selectedAgreement.status] || statusColors.active}`}>
                          {statusLabels[selectedAgreement.status] || selectedAgreement.status}
                        </Badge>
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
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      size="sm"
                      className="bg-[#711419] hover:bg-[#5a1014]"
                      onClick={handleStartEdit}
                      data-testid="button-edit-agreement"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Agreement Types Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Custom Agreement Types</DialogTitle>
            <DialogDescription>
              Manage reusable templates for custom service agreements. These types appear as work subtypes under MAINTENANCE visits.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="mb-4">
              <Button
                size="sm"
                className="bg-[#711419] hover:bg-[#5a1014]"
                onClick={() => {
                  setTypeForm({ name: "", description: "", frequency: "annual", visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
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
            setTypeForm({ name: "", description: "", frequency: "annual", visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
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
              <div className="grid gap-2">
                <Label htmlFor="type-frequency">Frequency *</Label>
                <Select
                  value={typeForm.frequency}
                  onValueChange={(value: "weekly" | "monthly" | "annual") => setTypeForm({ ...typeForm, frequency: value })}
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="type-visits">Visits Per Period *</Label>
                  <Input
                    id="type-visits"
                    type="number"
                    min="1"
                    value={typeForm.visitsPerPeriod}
                    onChange={(e) => setTypeForm({ ...typeForm, visitsPerPeriod: parseInt(e.target.value) || 1 })}
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
                    data-testid="input-type-price"
                  />
                </div>
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
                  setTypeForm({ name: "", description: "", frequency: "annual", visitsPerPeriod: 2, defaultPrice: "0.00", isActive: true });
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
