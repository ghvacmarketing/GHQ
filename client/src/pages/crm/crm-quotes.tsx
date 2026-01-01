import { useEffect, useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { Separator } from "@/components/ui/separator";
import {
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Trash2,
  Send,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";
import type { CrmUser, CrmQuote, CrmQuoteLineItem } from "@shared/schema";

type QuotesResponse = {
  quotes: CrmQuote[];
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

type SortField = "quoteNumber" | "customerName" | "createdAt" | "status" | "total";
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
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Approved",
  converted: "Converted",
  declined: "Declined",
  expired: "Expired",
};

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  viewed: "bg-purple-100 text-purple-700 border-purple-200",
  accepted: "bg-green-100 text-green-700 border-green-200",
  converted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  expired: "bg-orange-100 text-orange-700 border-orange-200",
};

const tabFilters = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Approved" },
  { key: "converted", label: "Converted" },
  { key: "declined", label: "Declined" },
  { key: "expired", label: "Expired" },
];

const amountRanges = [
  { key: "all", label: "All Amounts" },
  { key: "0-500", label: "$0 - $500" },
  { key: "500-1000", label: "$500 - $1,000" },
  { key: "1000-5000", label: "$1,000 - $5,000" },
  { key: "5000-10000", label: "$5,000 - $10,000" },
  { key: "10000+", label: "$10,000+" },
];

export default function CrmQuotes() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedQuote, setSelectedQuote] = useState<CrmQuote | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  // Additional filters
  const [amountFilter, setAmountFilter] = useState("all");

  // Create form state
  const [createForm, setCreateForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    serviceAddress: "",
    title: "",
    description: "",
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
  }, [debouncedSearch, activeTab, amountFilter]);

  const { data: quotesData, isLoading: quotesLoading } = useQuery<QuotesResponse>({
    queryKey: ["/api/crm/quotes", page],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes?page=${page}&limit=${ITEMS_PER_PAGE}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const res = await apiRequest("POST", "/api/crm/quotes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setShowCreateDialog(false);
      setCreateForm({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        serviceAddress: "",
        title: "",
        description: "",
      });
      toast({ title: "Quote created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create quote", variant: "destructive" });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/quotes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setSelectedQuote(null);
      toast({ title: "Quote deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete quote", variant: "destructive" });
    },
  });

  // Count quotes by status for tab badges
  const statusCounts = useMemo(() => {
    if (!quotesData?.quotes) return { draft: 0, sent: 0, accepted: 0, converted: 0, declined: 0, expired: 0 };
    const counts = { draft: 0, sent: 0, accepted: 0, converted: 0, declined: 0, expired: 0 };
    quotesData.quotes.forEach((quote) => {
      const status = quote.status || "draft";
      if (status in counts) counts[status as keyof typeof counts]++;
    });
    return counts;
  }, [quotesData?.quotes]);

  const filteredAndSortedQuotes = useMemo(() => {
    if (!quotesData?.quotes) return [];
    let filtered = [...quotesData.quotes];

    // Search filter
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter((quote) => {
        const customerName = quote.customerName?.toLowerCase() || "";
        const quoteNumber = quote.quoteNumber?.toLowerCase() || "";
        const title = quote.title?.toLowerCase() || "";
        return (
          customerName.includes(searchLower) ||
          quoteNumber.includes(searchLower) ||
          title.includes(searchLower)
        );
      });
    }

    // Tab filter (status-based)
    if (activeTab !== "all") {
      filtered = filtered.filter((quote) => quote.status === activeTab);
    }

    // Amount filter
    if (amountFilter !== "all") {
      filtered = filtered.filter((quote) => {
        const total = typeof quote.total === "string" ? parseFloat(quote.total) : (quote.total || 0);
        switch (amountFilter) {
          case "0-500": return total >= 0 && total < 500;
          case "500-1000": return total >= 500 && total < 1000;
          case "1000-5000": return total >= 1000 && total < 5000;
          case "5000-10000": return total >= 5000 && total < 10000;
          case "10000+": return total >= 10000;
          default: return true;
        }
      });
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal: string | number | Date = "";
      let bVal: string | number | Date = "";

      switch (sortField) {
        case "quoteNumber":
          aVal = a.quoteNumber || "";
          bVal = b.quoteNumber || "";
          break;
        case "customerName":
          aVal = a.customerName || "";
          bVal = b.customerName || "";
          break;
        case "createdAt":
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case "status":
          aVal = a.status || "draft";
          bVal = b.status || "draft";
          break;
        case "total":
          aVal = typeof a.total === "string" ? parseFloat(a.total) : (a.total || 0);
          bVal = typeof b.total === "string" ? parseFloat(b.total) : (b.total || 0);
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
  }, [quotesData?.quotes, debouncedSearch, activeTab, amountFilter, sortField, sortDirection]);

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
    setAmountFilter("all");
    setSearchInput("");
    setSortField("createdAt");
    setSortDirection("desc");
  };

  const hasActiveFilters = activeTab !== "all" || amountFilter !== "all" || debouncedSearch;

  const formatCurrency = (value: string | number | null) => {
    if (value === null || value === undefined) return "$0.00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const formatDate = (date: Date | string | null) => {
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
    const hasPhoneError = createForm.customerPhone && !validatePhone(createForm.customerPhone);
    const hasEmailError = createForm.customerEmail && !validateEmail(createForm.customerEmail);
    if (hasPhoneError || hasEmailError) {
      toast({ title: "Please fix validation errors", variant: "destructive" });
      return;
    }
    createQuoteMutation.mutate(createForm);
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

  const totalPages = quotesData?.pagination?.totalPages || 0;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Search bar at top - DoorLoop style */}
        <div className="flex justify-center mb-2">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by customer, quote #..."
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
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-quotes-title">
              CRM Quotes
            </h1>
            <p className="text-sm text-slate-500">
              {filteredAndSortedQuotes.length} quote{filteredAndSortedQuotes.length !== 1 ? "s" : ""}
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
            <Link href="/crm/quotes/new">
              <Button 
                size="sm" 
                className="bg-[#711419] hover:bg-[#5a1014]" 
                data-testid="button-create-quote"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Quote
              </Button>
            </Link>
          </div>
        </div>

        {/* Tab Filters with Amount dropdown on right */}
        <div className="flex items-center justify-between border-b border-slate-200">
          <div className="flex overflow-x-auto">
            {tabFilters.map((tab) => {
              const count = tab.key !== "all" ? statusCounts[tab.key as keyof typeof statusCounts] : null;
              
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
          <div className="shrink-0 pb-1">
            <Select value={amountFilter} onValueChange={setAmountFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs border-slate-200 bg-white focus:ring-[#711419] focus:border-[#711419]" data-testid="select-amount-filter">
                <SelectValue placeholder="Amount" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {amountRanges.map((range) => (
                  <SelectItem 
                    key={range.key} 
                    value={range.key}
                    className="text-xs focus:bg-[#711419]/10 focus:text-[#711419]"
                  >
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead 
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort("quoteNumber")}
                    data-testid="sort-quote-number"
                  >
                    <div className="flex items-center">
                      Quote #
                      {getSortIcon("quoteNumber")}
                    </div>
                  </TableHead>
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
                  <TableHead className="font-semibold hidden lg:table-cell">Title</TableHead>
                  <TableHead 
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort("createdAt")}
                    data-testid="sort-date"
                  >
                    <div className="flex items-center">
                      Quote Date
                      {getSortIcon("createdAt")}
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
                  <TableHead 
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none text-right"
                    onClick={() => handleSort("total")}
                    data-testid="sort-amount"
                  >
                    <div className="flex items-center justify-end">
                      Amount
                      {getSortIcon("total")}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotesLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredAndSortedQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No quotes found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {hasActiveFilters
                          ? "Try adjusting your search or filters"
                          : "Create your first CRM quote"}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedQuotes.map((quote) => (
                    <TableRow
                      key={quote.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      data-testid={`row-quote-${quote.id}`}
                      onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                    >
                      <TableCell className="font-medium text-slate-900">
                        {quote.quoteNumber}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <div className="flex items-center gap-1.5">
                          {quote.customerName || "—"}
                          {quote.status === "accepted" && (
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Accepted" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm hidden lg:table-cell max-w-[200px] truncate">
                        {quote.title || "—"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatDate(quote.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[quote.status || "draft"] || statusColors.draft}
                        >
                          {statusLabels[quote.status || "draft"] || quote.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-900">
                        {formatCurrency(quote.total)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                            data-testid={`button-view-${quote.id}`}
                          >
                            <Eye className="h-3 w-3" />
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t bg-slate-50">
              <p className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
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
            </div>
          )}
        </Card>
      </div>

      {/* Quote Detail Sheet */}
      <Sheet open={!!selectedQuote} onOpenChange={(open) => !open && setSelectedQuote(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle data-testid="text-quote-detail-title">
              Quote {selectedQuote?.quoteNumber || ""}
            </SheetTitle>
            <SheetDescription>
              CRM quote details
            </SheetDescription>
          </SheetHeader>

          {selectedQuote && (
            <div className="space-y-6 mt-6">
              <div className="flex items-center justify-between">
                <Badge
                  variant="outline"
                  className={`text-sm ${statusColors[selectedQuote.status || "draft"] || statusColors.draft}`}
                  data-testid="badge-quote-status"
                >
                  {statusLabels[selectedQuote.status || "draft"] || selectedQuote.status}
                </Badge>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => deleteQuoteMutation.mutate(selectedQuote.id)}
                    disabled={deleteQuoteMutation.isPending}
                    className="text-red-600 hover:text-red-700"
                    data-testid="button-delete-quote"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Customer</span>
                  <span className="font-medium text-slate-900" data-testid="text-customer-name">
                    {selectedQuote.customerName || "—"}
                  </span>
                </div>
                {selectedQuote.customerEmail && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Email</span>
                    <span className="font-medium text-slate-900">
                      {selectedQuote.customerEmail}
                    </span>
                  </div>
                )}
                {selectedQuote.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Phone</span>
                    <span className="font-medium text-slate-900">
                      {selectedQuote.customerPhone}
                    </span>
                  </div>
                )}
                {selectedQuote.serviceAddress && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Address</span>
                    <span className="font-medium text-slate-900 text-right max-w-[200px]">
                      {selectedQuote.serviceAddress}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Created</span>
                  <span className="font-medium text-slate-900" data-testid="text-created-date">
                    {formatDate(selectedQuote.createdAt)}
                  </span>
                </div>
              </div>

              {selectedQuote.title && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Title</h4>
                    <p className="text-slate-600">{selectedQuote.title}</p>
                  </div>
                </>
              )}

              {selectedQuote.description && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Description</h4>
                  <p className="text-slate-600 whitespace-pre-wrap">{selectedQuote.description}</p>
                </div>
              )}

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900">Quote Breakdown</h4>
                
                {selectedQuote.lineItems && (selectedQuote.lineItems as CrmQuoteLineItem[]).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Line Items</p>
                    {(selectedQuote.lineItems as CrmQuoteLineItem[]).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          {item.description} x{item.quantity}
                        </span>
                        <span className="text-slate-900">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="text-slate-900">{formatCurrency(selectedQuote.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Labor</span>
                    <span className="text-slate-900">{formatCurrency(selectedQuote.laborTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Tax</span>
                    <span className="text-slate-900">{formatCurrency(selectedQuote.taxAmount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-900">Total</span>
                    <span className="text-slate-900" data-testid="text-quote-total">
                      {formatCurrency(selectedQuote.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Quote Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setCreateForm({
            customerName: "",
            customerEmail: "",
            customerPhone: "",
            serviceAddress: "",
            title: "",
            description: "",
          });
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Quote</DialogTitle>
            <DialogDescription>
              Enter customer information to create a new CRM quote.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                value={createForm.customerName}
                onChange={(e) => setCreateForm(prev => ({ ...prev, customerName: e.target.value }))}
                placeholder="Enter customer name"
                data-testid="input-customer-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={createForm.customerEmail}
                  onChange={(e) => {
                    setCreateForm(prev => ({ ...prev, customerEmail: e.target.value }));
                  }}
                  placeholder="email@example.com"
                  className={createForm.customerEmail && !validateEmail(createForm.customerEmail) ? "border-red-500" : ""}
                  data-testid="input-customer-email"
                />
                {createForm.customerEmail && !validateEmail(createForm.customerEmail) && (
                  <p className="text-sm text-red-500">Please enter a valid email</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={createForm.customerPhone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setCreateForm(prev => ({ ...prev, customerPhone: formatted }));
                  }}
                  placeholder="(555) 123-4567"
                  className={createForm.customerPhone && !validatePhone(createForm.customerPhone) ? "border-red-500" : ""}
                  data-testid="input-customer-phone"
                />
                {createForm.customerPhone && !validatePhone(createForm.customerPhone) && (
                  <p className="text-sm text-red-500">Please enter a valid phone number</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceAddress">Service Address</Label>
              <Input
                id="serviceAddress"
                value={createForm.serviceAddress}
                onChange={(e) => setCreateForm(prev => ({ ...prev, serviceAddress: e.target.value }))}
                placeholder="123 Main St, City, State"
                data-testid="input-service-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Quote Title</Label>
              <Input
                id="title"
                value={createForm.title}
                onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., AC Unit Replacement"
                data-testid="input-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={createForm.description}
                onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the work to be done..."
                rows={3}
                data-testid="input-description"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-[#711419] hover:bg-[#5a1014]"
                disabled={createQuoteMutation.isPending}
                data-testid="button-submit-create"
              >
                {createQuoteMutation.isPending ? "Creating..." : "Create Quote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
