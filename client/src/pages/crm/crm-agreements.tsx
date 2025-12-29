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
  Upload,
  Eye,
  Edit,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, addDays, isAfter, isBefore, startOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, CrmAgreement } from "@shared/schema";

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
  expiring: "Expiring",
  expired: "Expired",
  cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  expiring: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

const tabFilters = [
  { key: "all", label: "All" },
  { key: "expiring", label: "Expiring (30 Days)" },
  { key: "upcoming", label: "Upcoming Service" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
];

export default function CrmAgreements() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedAgreement, setSelectedAgreement] = useState<CrmAgreement | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const [sortField, setSortField] = useState<SortField>("customerName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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

  const importAgreementsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/crm/agreements/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to import");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      setShowImportDialog(false);
      setImportFile(null);
      toast({ title: `Imported ${data.imported} agreements` });
    },
    onError: () => {
      toast({ title: "Failed to import agreements", variant: "destructive" });
    },
  });

  const statusCounts = useMemo(() => {
    if (!agreementsData?.agreements) return { active: 0, expiring: 0, expired: 0 };
    const counts = { active: 0, expiring: 0, expired: 0 };
    const today = startOfDay(new Date());
    const thirtyDaysFromNow = addDays(today, 30);

    agreementsData.agreements.forEach((agreement) => {
      if (agreement.status === "active") counts.active++;
      if (agreement.status === "expired") counts.expired++;
      if (agreement.endDate) {
        const endDate = new Date(agreement.endDate);
        if (isAfter(endDate, today) && isBefore(endDate, thirtyDaysFromNow)) {
          counts.expiring++;
        }
      }
    });
    return counts;
  }, [agreementsData?.agreements]);

  const filteredAndSortedAgreements = useMemo(() => {
    if (!agreementsData?.agreements) return [];
    let filtered = [...agreementsData.agreements];

    const today = startOfDay(new Date());
    const thirtyDaysFromNow = addDays(today, 30);

    if (activeTab === "expiring") {
      filtered = filtered.filter((agreement) => {
        if (!agreement.endDate) return false;
        const endDate = new Date(agreement.endDate);
        return isAfter(endDate, today) && isBefore(endDate, thirtyDaysFromNow);
      });
    } else if (activeTab === "upcoming") {
      filtered = filtered.filter((agreement) => {
        if (!agreement.nextServiceDate) return false;
        return isAfter(new Date(agreement.nextServiceDate), today);
      });
    } else if (activeTab === "active") {
      filtered = filtered.filter((agreement) => agreement.status === "active");
    } else if (activeTab === "expired") {
      filtered = filtered.filter((agreement) => agreement.status === "expired");
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
  }, [agreementsData?.agreements, activeTab, sortField, sortDirection]);

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
  };

  const hasActiveFilters = activeTab !== "all" || debouncedSearch;

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
    createAgreementMutation.mutate(createForm);
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      toast({ title: "Please select a file", variant: "destructive" });
      return;
    }
    importAgreementsMutation.mutate(importFile);
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-agreements-title">
              Service Agreements
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by customer, agreement #, address..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9 w-64 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419]"
                data-testid="input-search"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportDialog(true)}
              data-testid="button-import-agreements"
            >
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014]"
              onClick={() => setShowCreateDialog(true)}
              data-testid="button-create-agreement"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Agreement
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 border-b border-slate-200 overflow-x-auto pb-0">
          {tabFilters.map((tab) => {
            const count = tab.key === "active" ? statusCounts.active
              : tab.key === "expiring" ? statusCounts.expiring
              : tab.key === "expired" ? statusCounts.expired
              : null;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-[#711419] text-[#711419]"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                }`}
                data-testid={`tab-${tab.key}`}
              >
                {tab.label}
                {count !== null && count > 0 && (
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1" />
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
          <span className="text-sm text-slate-500" data-testid="text-agreement-count">
            {filteredAndSortedAgreements.length} agreement{filteredAndSortedAgreements.length !== 1 ? "s" : ""}
          </span>
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
                      <TableCell className="font-medium">{agreement.customerName}</TableCell>
                      <TableCell className="text-slate-600">{agreement.agreementNumber}</TableCell>
                      <TableCell className="text-slate-600">{agreement.agreementPlan}</TableCell>
                      <TableCell className="text-slate-600">{formatDate(agreement.nextServiceDate)}</TableCell>
                      <TableCell className="text-slate-600 hidden md:table-cell">{formatDate(agreement.nextInvoiceDate)}</TableCell>
                      <TableCell className="text-slate-600 hidden lg:table-cell max-w-[200px] truncate">
                        {agreement.address || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`border ${statusColors[agreement.status] || statusColors.active}`}>
                          {statusLabels[agreement.status] || agreement.status}
                        </Badge>
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
                <Label htmlFor="address">Service Address</Label>
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
                  <Label htmlFor="nextServiceDate">Next Service Date</Label>
                  <Input
                    id="nextServiceDate"
                    type="date"
                    value={createForm.nextServiceDate}
                    onChange={(e) => setCreateForm({ ...createForm, nextServiceDate: e.target.value })}
                    data-testid="input-next-service-date"
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

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Agreements</DialogTitle>
            <DialogDescription>
              Upload a CSV file containing agreement data. Expected columns: Agreement Number, Customer Name, Agreement Plan, Address, Next Service Date, Next Invoice Date, Start Date, End Date, Status, Notes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleImportSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="importFile">CSV File</Label>
                <Input
                  id="importFile"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  data-testid="input-import-file"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowImportDialog(false)}
                data-testid="button-cancel-import"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#711419] hover:bg-[#5a1014]"
                disabled={importAgreementsMutation.isPending || !importFile}
                data-testid="button-submit-import"
              >
                {importAgreementsMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAgreement} onOpenChange={(open) => !open && setSelectedAgreement(null)}>
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
                  <p className="font-medium">{selectedAgreement.customerName}</p>
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
    </CrmLayout>
  );
}
