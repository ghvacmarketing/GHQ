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
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
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

export default function CrmQuotes() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

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
  }, [debouncedSearch, statusFilter]);

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

  const filteredQuotes = useMemo(() => {
    if (!quotesData?.quotes) return [];
    let filtered = [...quotesData.quotes];

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

    if (statusFilter !== "all") {
      filtered = filtered.filter((quote) => quote.status === statusFilter);
    }

    return filtered;
  }, [quotesData?.quotes, debouncedSearch, statusFilter]);

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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900" data-testid="text-quotes-title">
            Quotes
          </h1>
          <Link href="/quote">
            <Button size="sm" data-testid="button-create-quote">
              <FileText className="h-4 w-4 mr-1" />
              New Quote
            </Button>
          </Link>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search by customer name, technician, or quote ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-12 h-12 text-base bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419]"
            data-testid="input-search"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <span className="text-sm text-slate-500" data-testid="text-quote-count">
            {filteredQuotes.length} quote{filteredQuotes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Quote #</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Technician</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-right">Total</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotesLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No quotes found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {debouncedSearch || statusFilter !== "all"
                          ? "Try adjusting your search or filters"
                          : "Create your first quote using the AI Quote Generator"}
                      </p>
                      {!debouncedSearch && statusFilter === "all" && (
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
                  filteredQuotes.map((quote) => (
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
                        {quote.customerName || "—"}
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
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-medium text-slate-900" data-testid="text-customer-name">
                    {selectedQuote.customerName}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Technician</span>
                  <span className="font-medium text-slate-900" data-testid="text-technician">
                    {selectedQuote.technician || "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date Created</span>
                  <span className="font-medium text-slate-900" data-testid="text-created-date">
                    {formatDate(selectedQuote.createdAt)}
                  </span>
                </div>
                {selectedQuote.laborHours && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Labor Hours</span>
                    <span className="font-medium text-slate-900">
                      {selectedQuote.laborHours}
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {selectedQuote.parts && (selectedQuote.parts as any[]).length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Parts & Materials</h3>
                  <div className="space-y-2">
                    {(selectedQuote.parts as any[]).map((part: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium text-slate-900">{part.description || part.partNumber}</p>
                          {part.partNumber && (
                            <p className="text-xs text-slate-500">{part.partNumber}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-slate-900">
                            {formatCurrency(part.price)}
                          </p>
                          {part.quantity && part.quantity > 1 && (
                            <p className="text-xs text-slate-500">Qty: {part.quantity}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-900">
                    {formatCurrency(selectedQuote.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Labor</span>
                  <span className="font-medium text-slate-900">
                    {formatCurrency(selectedQuote.labor)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax</span>
                  <span className="font-medium text-slate-900">
                    {formatCurrency(selectedQuote.tax)}
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-base">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="font-bold text-slate-900" data-testid="text-quote-total">
                    {formatCurrency(selectedQuote.total)}
                  </span>
                </div>
              </div>

              {selectedQuote.jobNotes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Job Notes</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {selectedQuote.jobNotes}
                    </p>
                  </div>
                </>
              )}

              {selectedQuote.quoteText && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Quote Details</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {selectedQuote.quoteText}
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-400 pt-4">
                {selectedQuote.emailSent && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                    Email Sent
                  </Badge>
                )}
                {selectedQuote.pushedToTrello && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                    Synced to Trello
                  </Badge>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </CrmLayout>
  );
}
