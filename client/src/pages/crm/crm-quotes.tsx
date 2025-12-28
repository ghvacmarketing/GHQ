import { useEffect, useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
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
import { Separator } from "@/components/ui/separator";
import {
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Filter,
  RotateCcw,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, subDays, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import type { CrmUser, Quote } from "@shared/schema";

type QuotesResponse = {
  quotes: Quote[];
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

type SortField = "quoteNumber" | "customerName" | "technician" | "createdAt" | "status" | "total";
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
  pending: "Pending",
  accepted: "Accepted",
};

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-green-100 text-green-700 border-green-200",
};

const tabFilters = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "pending", label: "Pending" },
  { key: "draft", label: "Draft" },
  { key: "last90", label: "Last 90 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "recent", label: "Recent (7 Days)" },
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
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  // Additional filters
  const [amountFilter, setAmountFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

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
  }, [debouncedSearch, activeTab, amountFilter, technicianFilter, dateFromFilter, dateToFilter]);

  const { data: quotesData, isLoading: quotesLoading } = useQuery<QuotesResponse>({
    queryKey: ["/api/quotes", page],
    queryFn: async () => {
      const res = await fetch(`/api/quotes?page=${page}&limit=${ITEMS_PER_PAGE}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    enabled: !!currentUser,
  });

  // Get unique technicians for the filter dropdown
  const uniqueTechnicians = useMemo(() => {
    if (!quotesData?.quotes) return [];
    const techs = new Set<string>();
    quotesData.quotes.forEach((quote) => {
      if (quote.technician) techs.add(quote.technician);
    });
    return Array.from(techs).sort();
  }, [quotesData?.quotes]);

  // Count quotes by status for tab badges
  const statusCounts = useMemo(() => {
    if (!quotesData?.quotes) return { accepted: 0, pending: 0, draft: 0 };
    const counts = { accepted: 0, pending: 0, draft: 0 };
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
        const technician = quote.technician?.toLowerCase() || "";
        const quoteId = quote.id?.toLowerCase() || "";
        return (
          customerName.includes(searchLower) ||
          technician.includes(searchLower) ||
          quoteId.includes(searchLower)
        );
      });
    }

    // Tab filter (status or date-based)
    if (activeTab === "accepted") {
      filtered = filtered.filter((quote) => quote.status === "accepted");
    } else if (activeTab === "pending") {
      filtered = filtered.filter((quote) => quote.status === "pending");
    } else if (activeTab === "draft") {
      filtered = filtered.filter((quote) => quote.status === "draft");
    } else if (activeTab === "last90") {
      const cutoff = subDays(new Date(), 90);
      filtered = filtered.filter((quote) => 
        quote.createdAt && isAfter(new Date(quote.createdAt), cutoff)
      );
    } else if (activeTab === "last30") {
      const cutoff = subDays(new Date(), 30);
      filtered = filtered.filter((quote) => 
        quote.createdAt && isAfter(new Date(quote.createdAt), cutoff)
      );
    } else if (activeTab === "recent") {
      const cutoff = subDays(new Date(), 7);
      filtered = filtered.filter((quote) => 
        quote.createdAt && isAfter(new Date(quote.createdAt), cutoff)
      );
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

    // Technician filter
    if (technicianFilter !== "all") {
      filtered = filtered.filter((quote) => quote.technician === technicianFilter);
    }

    // Date range filter
    if (dateFromFilter) {
      const fromDate = startOfDay(new Date(dateFromFilter));
      filtered = filtered.filter((quote) => 
        quote.createdAt && isAfter(new Date(quote.createdAt), fromDate)
      );
    }
    if (dateToFilter) {
      const toDate = endOfDay(new Date(dateToFilter));
      filtered = filtered.filter((quote) => 
        quote.createdAt && isBefore(new Date(quote.createdAt), toDate)
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal: string | number | Date = "";
      let bVal: string | number | Date = "";

      switch (sortField) {
        case "quoteNumber":
          aVal = getQuoteNumber(a);
          bVal = getQuoteNumber(b);
          break;
        case "customerName":
          aVal = a.customerName || "";
          bVal = b.customerName || "";
          break;
        case "technician":
          aVal = a.technician || "";
          bVal = b.technician || "";
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
  }, [quotesData?.quotes, debouncedSearch, activeTab, amountFilter, technicianFilter, dateFromFilter, dateToFilter, sortField, sortDirection]);

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
    setTechnicianFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
    setSearchInput("");
    setSortField("createdAt");
    setSortDirection("desc");
  };

  const hasActiveFilters = activeTab !== "all" || amountFilter !== "all" || technicianFilter !== "all" || dateFromFilter || dateToFilter || debouncedSearch;

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

  const getQuoteNumber = (quote: Quote) => {
    if (!quote.createdAt) return quote.id.slice(0, 8).toUpperCase();
    const date = new Date(quote.createdAt);
    const dateStr = format(date, "yyMMdd");
    return `Q-${dateStr}-${quote.id.slice(0, 4).toUpperCase()}`;
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-quotes-title">
              Quotes
            </h1>
            <span className="text-sm text-slate-500">•••</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by Name, Address, WO # and..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9 w-64 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419]"
                data-testid="input-search"
              />
            </div>
            <Link href="/quote">
              <Button size="sm" className="bg-[#711419] hover:bg-[#5a1014]" data-testid="button-create-quote">
                <FileText className="h-4 w-4 mr-1" />
                New Quote
              </Button>
            </Link>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-4 border-b border-slate-200 overflow-x-auto pb-0">
          {tabFilters.map((tab) => {
            const count = tab.key === "accepted" ? statusCounts.accepted 
              : tab.key === "pending" ? statusCounts.pending 
              : tab.key === "draft" ? statusCounts.draft 
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

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={amountFilter} onValueChange={setAmountFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-amount-filter">
              <SelectValue placeholder="Amount" />
            </SelectTrigger>
            <SelectContent>
              {amountRanges.map((range) => (
                <SelectItem key={range.key} value={range.key}>{range.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-technician-filter">
              <SelectValue placeholder="Technician" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Technicians</SelectItem>
              {uniqueTechnicians.map((tech) => (
                <SelectItem key={tech} value={tech}>{tech}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">From:</span>
            <Input
              type="date"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
              className="w-[130px] h-8 text-xs"
              data-testid="input-date-from"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">To:</span>
            <Input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              className="w-[130px] h-8 text-xs"
              data-testid="input-date-to"
            />
          </div>

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

          <span className="text-sm text-slate-500" data-testid="text-quote-count">
            {filteredAndSortedQuotes.length} quote{filteredAndSortedQuotes.length !== 1 ? "s" : ""}
          </span>
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
                  <TableHead 
                    className="font-semibold cursor-pointer hover:bg-slate-100 select-none hidden md:table-cell"
                    onClick={() => handleSort("technician")}
                    data-testid="sort-technician"
                  >
                    <div className="flex items-center">
                      Technician
                      {getSortIcon("technician")}
                    </div>
                  </TableHead>
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
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredAndSortedQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No quotes found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {hasActiveFilters
                          ? "Try adjusting your search or filters"
                          : "Create your first quote using the AI Quote Generator"}
                      </p>
                      {!hasActiveFilters && (
                        <Link href="/quote">
                          <Button variant="outline" className="mt-4" data-testid="button-create-first-quote">
                            <FileText className="h-4 w-4 mr-2" />
                            Create Quote
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedQuotes.map((quote) => (
                    <TableRow
                      key={quote.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      data-testid={`row-quote-${quote.id}`}
                      onClick={() => setSelectedQuote(quote)}
                    >
                      <TableCell className="font-medium text-slate-900">
                        {getQuoteNumber(quote)}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <div className="flex items-center gap-1.5">
                          {quote.customerName || "—"}
                          {quote.status === "accepted" && (
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Accepted" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 hidden md:table-cell">
                        {quote.technician || "—"}
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
                            onClick={() => setSelectedQuote(quote)}
                            data-testid={`button-view-${quote.id}`}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Link href={`/quote/edit/${quote.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              data-testid={`button-edit-${quote.id}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
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

      <Sheet open={!!selectedQuote} onOpenChange={(open) => !open && setSelectedQuote(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle data-testid="text-quote-detail-title">
              Quote {selectedQuote ? getQuoteNumber(selectedQuote) : ""}
            </SheetTitle>
            <SheetDescription>
              Service quote details
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
                <Link href={`/quote/edit/${selectedQuote.id}`}>
                  <Button variant="outline" size="sm" data-testid="button-edit-quote">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Edit Quote
                  </Button>
                </Link>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Customer</span>
                  <span className="font-medium text-slate-900" data-testid="text-customer-name">
                    {selectedQuote.customerName || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Technician</span>
                  <span className="font-medium text-slate-900" data-testid="text-technician">
                    {selectedQuote.technician || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Created</span>
                  <span className="font-medium text-slate-900" data-testid="text-created-date">
                    {formatDate(selectedQuote.createdAt)}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900">Quote Breakdown</h4>
                
                {selectedQuote.parts && (selectedQuote.parts as any[]).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Parts & Materials</p>
                    {(selectedQuote.parts as any[]).map((part, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          {part.name || part.partName} x{part.quantity || 1}
                        </span>
                        <span className="text-slate-900">{formatCurrency(part.total || part.price)}</span>
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
                    <span className="text-slate-900">{formatCurrency(selectedQuote.labor)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Tax</span>
                    <span className="text-slate-900">{formatCurrency(selectedQuote.tax)}</span>
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
    </CrmLayout>
  );
}
