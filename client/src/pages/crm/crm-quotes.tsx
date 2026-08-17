import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSmoothLoading } from "@/hooks/use-smooth-loading";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { IndustrialTabs } from "@/components/crm/industrial-tabs";
import { StatusDot } from "@/components/ui/status-dot";
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
  Loader2,
  User,
  MapPin,
  X,
  Filter,
  ArrowRight,
  LayoutGrid,
  List,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { NewQuoteSetup } from "@/components/crm/new-quote-setup";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";
import type { CrmUser, CrmQuote, CrmQuoteLineItem, CrmCustomer, CrmProperty } from "@shared/schema";

type QuotesResponse = {
  quotes: CrmQuote[];
  /** Per-status counts across the WHOLE (searched) dataset, for tab badges. */
  counts?: Record<string, number>;
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

// Saturated left-edge accent per status (card view's colored spine)
const quoteAccent: Record<string, string> = {
  draft: "#94a3b8",
  sent: "#3b82f6",
  viewed: "#a855f7",
  accepted: "#22c55e",
  converted: "#10b981",
  declined: "#ef4444",
  expired: "#f97316",
};

const tabFilters = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "viewed", label: "Viewed" },
  { key: "accepted", label: "Approved" },
  { key: "converted", label: "Converted" },
  { key: "declined", label: "Declined" },
  { key: "expired", label: "Expired" },
];

const quoteTypeFilters = [
  { key: "all", label: "All Types" },
  { key: "quick", label: "Quick Quote" },
  { key: "proposal", label: "Proposal Builder" },
  { key: "custom_install", label: "Custom Install" },
  { key: "custom_service", label: "Custom Service" },
];

export default function CrmQuotes() {
  usePageTitle("Quotes");
  const [, navigate] = useLocation();
  const queryClientInstance = useQueryClient();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [view, setView] = useState<"list" | "cards">(
    () => (typeof window !== "undefined" && (localStorage.getItem("crmQuotesView") as "list" | "cards")) || "list",
  );
  useEffect(() => {
    localStorage.setItem("crmQuotesView", view);
  }, [view]);
  const [page, setPage] = useState(1);
  const [selectedQuote, setSelectedQuote] = useState<CrmQuote | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  // Prefetch quote detail on hover for instant navigation
  const prefetchQuote = (quoteId: string) => {
    queryClientInstance.prefetchQuery({
      queryKey: [`/api/crm/quotes/${quoteId}`],
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 2 * 60 * 1000, // Cache prefetched data for 2 minutes
    });
  };
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  // Additional filters
  const [quoteTypeFilter, setQuoteTypeFilter] = useState("all");

  // Create form state
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    amount: "",
    assignedToId: "",
  });

  // Customer search and property selection state
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<CrmProperty | null>(null);
  const debouncedCustomerSearch = useDebounce(customerSearchInput, 300);

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
  }, [debouncedSearch, activeTab, quoteTypeFilter]);

  // Status tab + search are SERVER-side filters — they must apply across every
  // page of quotes, not just the 25 currently loaded.
  const { data: quotesData, isLoading: quotesLoadingRaw } = useQuery<QuotesResponse>({
    queryKey: ["/api/crm/quotes", page, quoteTypeFilter, activeTab, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(ITEMS_PER_PAGE));
      if (quoteTypeFilter !== "all") {
        params.set("quoteType", quoteTypeFilter);
      }
      if (activeTab !== "all") {
        params.set("status", activeTab);
      }
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      const res = await fetch(`/api/crm/quotes?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    enabled: !!currentUser,
    staleTime: 2 * 60 * 1000,
  });
  const quotesLoading = useSmoothLoading(quotesLoadingRaw);

  // Customer search query
  const { data: customerSearchResults = [], isLoading: isSearchingCustomers } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", "search", debouncedCustomerSearch],
    queryFn: async () => {
      if (!debouncedCustomerSearch.trim()) return [];
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(debouncedCustomerSearch)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.customers || [];
    },
    enabled: debouncedCustomerSearch.trim().length >= 2,
  });

  // Fetch properties for selected customer
  const { data: customerProperties = [] } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", { customerId: selectedCustomer?.id }],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const res = await fetch(`/api/crm/properties?customerId=${selectedCustomer.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCustomer?.id,
  });

  // Auto-select property if customer only has one
  useEffect(() => {
    if (customerProperties.length === 1 && !selectedProperty) {
      setSelectedProperty(customerProperties[0]);
    } else if (customerProperties.length === 0) {
      setSelectedProperty(null);
    }
  }, [customerProperties, selectedProperty]);

  // Fetch CRM users for assignment
  const { data: crmUsers = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const resetCreateForm = () => {
    setCreateForm({ title: "", description: "", amount: "", assignedToId: "" });
    setSelectedCustomer(null);
    setSelectedProperty(null);
    setCustomerSearchInput("");
  };

  const createQuoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer?.id) {
        throw new Error("Customer is required");
      }
      const amountStr = createForm.amount?.trim();
      const amount = amountStr ? parseFloat(amountStr) : 0;
      if (isNaN(amount) || amount < 0) {
        throw new Error("Please enter a valid amount");
      }
      const serviceAddress = selectedProperty 
        ? [selectedProperty.address1, selectedProperty.city, selectedProperty.state, selectedProperty.zip].filter(Boolean).join(", ")
        : undefined;
      const res = await apiRequest("POST", "/api/crm/quotes/quick", {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name || "Unknown Customer",
        customerEmail: selectedCustomer.email || null,
        customerPhone: selectedCustomer.phone || null,
        propertyId: selectedProperty?.id || undefined,
        serviceAddress,
        title: createForm.title || "Quick Quote",
        description: createForm.description || undefined,
        assignedToId: createForm.assignedToId || undefined,
        lineItems: [
          {
            description: createForm.title || "Quick Quote Item",
            quantity: 1,
            unitPrice: amount,
            taxable: true,
          },
        ],
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: [data, ...old.quotes] };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowCreateDialog(false);
      resetCreateForm();
      toast({ title: "Quote created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create quote", variant: "destructive" });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async ({ id }: { id: string; customerId?: string | null }) => {
      await apiRequest("DELETE", `/api/crm/quotes/${id}`);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["/api/crm/quotes"] });
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.filter((q: any) => q.id !== id) };
      });
      setSelectedQuote(null);
      return { snapshots };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      if (variables.customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", { customerId: variables.customerId }] });
      }
      toast({ title: "Quote deleted successfully" });
    },
    onError: (_err, _vars, context: any) => {
      context?.snapshots?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      toast({ title: "Failed to delete quote", variant: "destructive" });
    },
  });

  // Tab badge counts come from the server (whole dataset, not just this page).
  const statusCounts = useMemo(() => {
    const zero = { draft: 0, sent: 0, viewed: 0, accepted: 0, converted: 0, declined: 0, expired: 0 };
    return { ...zero, ...(quotesData?.counts ?? {}) };
  }, [quotesData?.counts]);

  const filteredAndSortedQuotes = useMemo(() => {
    if (!quotesData?.quotes) return [];
    // Status tab, quote type, and search all filter SERVER-side now (so they
    // span every page); only the column sort happens on the loaded page.
    const filtered = [...quotesData.quotes];

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
  }, [quotesData?.quotes, sortField, sortDirection]);

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
    setQuoteTypeFilter("all");
    setSearchInput("");
    setSortField("createdAt");
    setSortDirection("desc");
  };

  const hasActiveFilters = activeTab !== "all" || quoteTypeFilter !== "all" || debouncedSearch;

  const formatCurrency = (value: string | number | null) => {
    if (value === null || value === undefined) return "$0.00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  // Calculate display amount for options quotes
  // - For non-options quotes: show the total
  // - For options quotes (pending/sent): show the highest option price
  // - For options quotes (approved/converted): show the selected option's price
  const getDisplayAmount = (quote: CrmQuote) => {
    if (quote.quoteMode !== "options") {
      return quote.total;
    }
    
    const lineItems = quote.lineItems as CrmQuoteLineItem[] | undefined;
    if (!lineItems || lineItems.length === 0) {
      return quote.total;
    }
    
    // Group line items by optionTag and sum their totals
    const optionTotals: Record<string, number> = {};
    for (const item of lineItems) {
      const tag = item.optionTag || "default";
      const itemTotal = parseFloat(item.lineTotal?.toString() || "0");
      optionTotals[tag] = (optionTotals[tag] || 0) + itemTotal;
    }
    
    // If quote is approved/converted and has selectedOption, show that option's total
    if ((quote.status === "accepted" || quote.status === "converted") && quote.selectedOption) {
      const selectedTotal = optionTotals[quote.selectedOption];
      if (selectedTotal !== undefined) {
        return selectedTotal;
      }
    }
    
    // Otherwise, show the highest option price
    const totals = Object.values(optionTotals);
    if (totals.length > 0) {
      return Math.max(...totals);
    }
    
    return quote.total;
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
    if (!selectedCustomer) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }
    if (customerProperties.length > 0 && !selectedProperty) {
      toast({ title: "Please select a property location", variant: "destructive" });
      return;
    }
    if (!createForm.assignedToId) {
      toast({ title: "Please assign someone to this quote", variant: "destructive" });
      return;
    }
    if (!createForm.title.trim()) {
      toast({ title: "Quote title is required", variant: "destructive" });
      return;
    }
    if (!createForm.amount || parseFloat(createForm.amount) <= 0) {
      toast({ title: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    createQuoteMutation.mutate();
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

  const totalPages = quotesData?.pagination?.totalPages || 0;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Title + subheading · centered search · actions — all on one row */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="min-w-0 shrink-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground truncate" data-testid="text-quotes-title">
              Quotes
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Create, send, and track customer quotes</p>
          </div>

          {/* Center view switcher — same pill segmented control as the Inbox tabs */}
          <div className="mx-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-all ${
                view === "list" ? "bg-white text-[#711419] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              data-testid="quotes-view-list"
            >
              <List className="h-3.5 w-3.5" strokeWidth={1.75} /> List
            </button>
            <button
              onClick={() => setView("cards")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-all ${
                view === "cards" ? "bg-white text-[#711419] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              data-testid="quotes-view-cards"
            >
              <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} /> Cards
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-muted-foreground" data-testid="button-reset-filters">
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
            <Button size="sm" onClick={() => setSetupOpen(true)} data-testid="button-create-quote">
              <Plus className="h-4 w-4 mr-1" />
              New Quote
            </Button>
          </div>
        </div>

        {/* Status tabs left · search + filter right */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <IndustrialTabs
            testidPrefix="tab"
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k as typeof activeTab)}
            tabs={tabFilters.map((tab) => {
              const count = tab.key !== "all" ? statusCounts[tab.key as keyof typeof statusCounts] : null;
              return { key: tab.key, label: tab.label, count: count !== null && count > 0 ? count : null };
            })}
          />
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search quotes…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 bg-white pl-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                data-testid="input-search"
              />
            </div>
            <Select value={quoteTypeFilter} onValueChange={setQuoteTypeFilter}>
              <SelectTrigger
                className={`relative h-9 w-9 shrink-0 justify-center bg-white p-0 [&>svg]:hidden ${
                  quoteTypeFilter !== "all"
                    ? "border-[#711419] text-[#711419]"
                    : "border-input text-slate-600 hover:text-foreground"
                }`}
                title="Filter by quote type"
                data-testid="select-quote-type-filter"
              >
                <span className="flex items-center justify-center">
                  <Filter className="h-4 w-4" />
                </span>
                {quoteTypeFilter !== "all" && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-[2px] bg-[#711419]" />
                )}
              </SelectTrigger>
              <SelectContent className="bg-white">
                {quoteTypeFilters.map((type) => (
                  <SelectItem
                    key={type.key}
                    value={type.key}
                    className="text-xs focus:bg-[#711419]/10 focus:text-[#711419]"
                  >
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cards view */}
        {view === "cards" ? (
          <>
            {quotesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-[4px]" />
                ))}
              </div>
            ) : filteredAndSortedQuotes.length === 0 ? (
              <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-16 text-center">
                <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-500">No quotes found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="quotes-card-grid">
                {filteredAndSortedQuotes.map((quote) => {
                  const typeLabel = quoteTypeFilters.find((t) => t.key === (quote as any).quoteType)?.label;
                  return (
                    <div
                      key={quote.id}
                      className="group cursor-pointer rounded-[4px] border border-slate-300/70 border-l-2 bg-white p-3 transition-colors hover:border-slate-400"
                      style={{ borderLeftColor: quoteAccent[quote.status || "draft"] || "#94a3b8" }}
                      onMouseEnter={() => prefetchQuote(quote.id)}
                      onTouchStart={() => prefetchQuote(quote.id)}
                      onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                      data-testid={`card-quote-${quote.id}`}
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusDot pill={`${statusColors[quote.status || "draft"] || statusColors.draft} h-4 px-1 text-[10px]`}>
                          {statusLabels[quote.status || "draft"] || quote.status}
                        </StatusDot>
                        {typeLabel && typeLabel !== "All Types" && (
                          <span className="rounded-[3px] bg-slate-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                            {typeLabel}
                          </span>
                        )}
                        {(quote.viewCount || 0) > 0 && (
                          <span className="ml-auto flex items-center gap-0.5 text-[11px] text-purple-600" title={`Viewed ${quote.viewCount} times`}>
                            <Eye className="h-3 w-3" />
                            {quote.viewCount}
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 truncate text-sm font-semibold leading-tight text-slate-900">
                        {quote.title || quote.quoteNumber}
                      </p>
                      <p className="truncate text-xs text-slate-500">{quote.customerName || "—"}</p>

                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
                        <span className="truncate text-[11px] text-slate-500">{formatDate(quote.createdAt)}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="text-xs font-semibold tabular-nums text-slate-900">
                            {formatCurrency(getDisplayAmount(quote))}
                          </span>
                          <ArrowRight className="h-3 w-3 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-900" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 text-[#711419] transition-colors hover:text-[#5a1014] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <p className="text-sm text-slate-600">Page {page} of {totalPages}</p>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 text-[#711419] transition-colors hover:text-[#5a1014] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </>
        ) : (
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
                      onMouseEnter={() => prefetchQuote(quote.id)}
                      onTouchStart={() => prefetchQuote(quote.id)}
                      onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                    >
                      <TableCell className="font-medium text-slate-900">
                        {quote.quoteNumber}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <div className="flex items-center gap-1.5">
                          {quote.customerName || "—"}
                          {quote.status === "accepted" && (
                            <span className="inline-block w-2 h-2 rounded-[2px] bg-green-500" title="Accepted" />
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
                        <div className="flex items-center gap-2">
                          <StatusDot
                            pill={statusColors[quote.status || "draft"] || statusColors.draft}
                          >
                            {statusLabels[quote.status || "draft"] || quote.status}
                          </StatusDot>
                          {(quote.viewCount || 0) > 0 && (
                            <span className="flex items-center gap-1 text-xs text-purple-600" title={`Viewed ${quote.viewCount} time${quote.viewCount === 1 ? "" : "s"}`}>
                              <Eye className="h-3 w-3" />
                              {quote.viewCount}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-900">
                        {formatCurrency(getDisplayAmount(quote))}
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
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                  className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                  className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </Card>
        )}
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
                <StatusDot
                  pill={`text-sm ${statusColors[selectedQuote.status || "draft"] || statusColors.draft}`}
                  data-testid="badge-quote-status"
                >
                  {statusLabels[selectedQuote.status || "draft"] || selectedQuote.status}
                </StatusDot>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => deleteQuoteMutation.mutate({ id: selectedQuote.id, customerId: selectedQuote.customerId })}
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
                
                {Array.isArray(selectedQuote.lineItems) && selectedQuote.lineItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Line Items</p>
                    {(selectedQuote.lineItems as Array<{ description: string; quantity: string; lineTotal: string }>).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          {item.description} x{item.quantity}
                        </span>
                        <span className="text-slate-900">{formatCurrency(item.lineTotal)}</span>
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
          resetCreateForm();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Quick Quote</DialogTitle>
            <DialogDescription>
              Select a customer and enter quote details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {/* Customer Selection */}
            <div className="space-y-2">
              <Label>Customer *</Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="font-medium text-sm">{selectedCustomer.name}</p>
                      {selectedCustomer.email && (
                        <p className="text-xs text-slate-500">{selectedCustomer.email}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setSelectedProperty(null);
                      setCustomerSearchInput("");
                    }}
                    data-testid="button-clear-customer"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search customers..."
                    value={customerSearchInput}
                    onChange={(e) => setCustomerSearchInput(e.target.value)}
                    className="pl-9"
                    data-testid="input-customer-search"
                  />
                  {isSearchingCustomers && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                  )}
                  {customerSearchResults.length > 0 && customerSearchInput.length >= 2 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {customerSearchResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerSearchInput("");
                            setSelectedProperty(null);
                          }}
                          data-testid={`customer-option-${customer.id}`}
                        >
                          <User className="h-4 w-4 text-slate-400" />
                          <div>
                            <p className="font-medium text-sm">{customer.name}</p>
                            {customer.email && (
                              <p className="text-xs text-slate-500">{customer.email}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Property Selection - shown when customer has multiple properties */}
            {selectedCustomer && customerProperties.length > 1 && (
              <div className="space-y-2">
                <Label>Property *</Label>
                <Select
                  value={selectedProperty?.id || ""}
                  onValueChange={(value) => {
                    const property = customerProperties.find((p) => p.id === value);
                    setSelectedProperty(property || null);
                  }}
                >
                  <SelectTrigger data-testid="select-property">
                    <SelectValue placeholder="Select a property">
                      {selectedProperty && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <span>{selectedProperty.address1}{selectedProperty.city ? `, ${selectedProperty.city}` : ""}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {customerProperties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <span>{property.address1}{property.city ? `, ${property.city}` : ""}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Show selected property info when auto-selected */}
            {selectedCustomer && customerProperties.length === 1 && selectedProperty && (
              <div className="space-y-2">
                <Label>Property</Label>
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <span className="text-sm">{selectedProperty.address1}{selectedProperty.city ? `, ${selectedProperty.city}` : ""}</span>
                </div>
              </div>
            )}

            {/* Assign To Selection */}
            <div className="space-y-2">
              <Label>Assign To *</Label>
              <Select
                value={createForm.assignedToId}
                onValueChange={(value) => setCreateForm(prev => ({ ...prev, assignedToId: value }))}
              >
                <SelectTrigger data-testid="select-assigned-to">
                  <SelectValue placeholder="Select who to assign">
                    {createForm.assignedToId && crmUsers.find(u => u.id === createForm.assignedToId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {crmUsers.filter(u => u.isActive !== false).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        <span>{user.name}</span>
                        {user.role && <span className="text-xs text-slate-500">({user.role})</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quote Details */}
            <div className="space-y-2">
              <Label htmlFor="title">Quote Title *</Label>
              <Input
                id="title"
                value={createForm.title}
                onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., AC Unit Replacement"
                data-testid="input-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={createForm.amount}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="pl-7"
                  data-testid="input-amount"
                />
              </div>
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
                disabled={createQuoteMutation.isPending || !selectedCustomer || (customerProperties.length > 0 && !selectedProperty) || !createForm.assignedToId}
                data-testid="button-submit-create"
              >
                {createQuoteMutation.isPending ? "Creating..." : "Create Quote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Quote setup stepper — type → customer → property → link → salesperson */}
      <NewQuoteSetup open={setupOpen} onOpenChange={setSetupOpen} />
    </CrmLayout>
  );
}
