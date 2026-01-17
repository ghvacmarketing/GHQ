import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, queryClient as globalQueryClient } from "@/lib/queryClient";

// Debug logging for cache hits
const DEBUG_CACHE = false;
const logCache = (...args: unknown[]) => {
  if (DEBUG_CACHE) {
    console.log(`[CUSTOMERS-PAGE ${new Date().toISOString().split('T')[1].slice(0, 12)}]`, ...args);
  }
};
import { Card, CardContent } from "@/components/ui/card";
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
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { CrmUser, CrmCustomer } from "@shared/schema";

type CustomerWithAddress = CrmCustomer & {
  fullAddress: string | null;
  origin?: 'crm_customers' | 'crm_accounts';
  accountId?: string | null;
  source?: 'crm' | 'fieldedge';
};

type CustomersResponse = {
  customers: CustomerWithAddress[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  sources?: {
    crm: { count: number };
    fieldedge: {
      count: number;
      lastRefresh: string | null;
      error: string | null;
    };
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

export default function CrmCustomers() {
  usePageTitle("Customers");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [customerType, setCustomerType] = useState("all");
  const [statusTab, setStatusTab] = useState("all");
  const [hasAgreement, setHasAgreement] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "crm" | "fieldedge">("all");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(searchInput, 300);

  // Prefetch customer detail on hover for instant navigation
  const prefetchCustomer = (customerId: string) => {
    queryClient.prefetchQuery({
      queryKey: [`/api/crm/customers/${customerId}`],
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 2 * 60 * 1000, // Cache prefetched data for 2 minutes
    });
  };

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
  }, [debouncedSearch, customerType, statusTab, hasAgreement, sourceFilter]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (customerType !== "all") params.set("customerType", customerType);
    if (statusTab !== "all") {
      const statusMap: Record<string, string> = {
        prospects: "prospect",
        customers: "customer",
      };
      if (statusMap[statusTab]) {
        params.set("customerStatus", statusMap[statusTab]);
      }
    }
    if (hasAgreement) {
      params.set("hasAgreement", "true");
    }
    if (sourceFilter !== "all") {
      params.set("source", sourceFilter);
    }
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, customerType, statusTab, hasAgreement, sourceFilter, page]);

  // Debug: Check cache before query runs
  useEffect(() => {
    const myQueryKey = ["/api/crm/customers/merged", queryParams];
    const cachedData = globalQueryClient.getQueryData(myQueryKey);
    logCache('========================================');
    logCache('PAGE MOUNTING / QUERY PARAMS CHANGED');
    logCache('My queryKey:', JSON.stringify(myQueryKey));
    logCache('queryParams string:', queryParams);
    logCache('Cache data exists:', !!cachedData);
    if (cachedData) {
      logCache('CACHE HIT - should render instantly!');
    } else {
      logCache('CACHE MISS - will fetch from network');
      // Check what keys ARE in cache
      const allQueries = globalQueryClient.getQueryCache().getAll();
      const customerQueries = allQueries.filter(q => 
        JSON.stringify(q.queryKey).includes('customers')
      );
      logCache('Existing customer-related cache keys:', 
        customerQueries.map(q => JSON.stringify(q.queryKey))
      );
    }
    logCache('========================================');
  }, [queryParams]);

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers/merged", queryParams],
    queryFn: async () => {
      logCache('queryFn EXECUTING - fetching from network!');
      const res = await fetch(`/api/crm/customers/merged?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      const data = await res.json();
      logCache('queryFn COMPLETE - got data');
      return data;
    },
    enabled: !!currentUser,
    staleTime: 10 * 60 * 1000, // 10 min - show cached data instantly, refresh in background when stale
  });

  const { data: statsData } = useQuery<{ prospects: number; customers: number; total: number; withAgreements: number }>({
    queryKey: ["/api/crm/customers/stats"],
    queryFn: async () => {
      const res = await fetch("/api/crm/customers/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!currentUser,
    staleTime: 10 * 60 * 1000,
  });

  // Background prefetch next page of customers for instant pagination
  useEffect(() => {
    if (!customersData || !currentUser) return;

    const totalPages = customersData.pagination?.totalPages || 0;
    if (page < totalPages) {
      // Prefetch next page in the background
      const nextPageParams = new URLSearchParams();
      if (debouncedSearch) nextPageParams.set("search", debouncedSearch);
      if (customerType !== "all") nextPageParams.set("customerType", customerType);
      if (statusTab !== "all") {
        const statusMap: Record<string, string> = {
          prospects: "prospect",
          customers: "customer",
        };
        if (statusMap[statusTab]) {
          nextPageParams.set("customerStatus", statusMap[statusTab]);
        }
      }
      if (hasAgreement) nextPageParams.set("hasAgreement", "true");
      nextPageParams.set("page", String(page + 1));
      nextPageParams.set("limit", String(ITEMS_PER_PAGE));

      queryClient.prefetchQuery({
        queryKey: ["/api/crm/customers", nextPageParams.toString()],
        queryFn: async () => {
          const res = await fetch(`/api/crm/customers?${nextPageParams.toString()}`, {
            credentials: "include",
          });
          if (!res.ok) throw new Error("Failed to fetch customers");
          return res.json();
        },
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [customersData, page, debouncedSearch, customerType, statusTab, hasAgreement, currentUser, queryClient]);

  const formatCustomerType = (type: string | null) => {
    if (!type) return "Residential";
    const normalizedType = type.toLowerCase();
    if (normalizedType === "residential") return "Residential";
    if (normalizedType === "commercial") return "Commercial";
    if (normalizedType === "property manager" || normalizedType === "property_manager") return "Property Manager";
    return "Residential";
  };

  const getCustomerTypeBadgeClass = (type: string | null) => {
    const normalizedType = type?.toLowerCase() || "";
    if (normalizedType === "commercial") {
      return "bg-amber-100 text-amber-700 border-amber-200";
    }
    if (normalizedType === "property manager" || normalizedType === "property_manager") {
      return "bg-purple-100 text-purple-700 border-purple-200";
    }
    return "bg-blue-100 text-blue-700 border-blue-200";
  };

  const formatCustomerStatus = (status: string | null) => {
    if (!status) return "Unknown";
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === "prospect") return "Lead";
    if (normalizedStatus === "customer") return "Customer";
    return status;
  };

  const getStatusBadgeClass = (status: string | null) => {
    const normalizedStatus = status?.toLowerCase() || "";
    switch (normalizedStatus) {
      case "prospect":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "customer":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const formatAddress = (customer: CustomerWithAddress) => {
    return customer.fullAddress || "—";
  };

  const formatCustomerSince = (date: Date | null) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM d, yyyy");
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

  const customers = customersData?.customers || [];
  const total = customersData?.pagination?.total || 0;
  const totalPages = customersData?.pagination?.totalPages || 0;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Search bar at top - DoorLoop style */}
        <div className="flex justify-center mb-2">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, phone, email, or address..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
              data-testid="input-search"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-customers-title">
              Customers
            </h1>
            <p className="text-sm text-slate-500">Total: {total}</p>
          </div>
          <Link href="/crm/accounts/new">
            <Button size="sm" className="bg-[#711419] hover:bg-[#5a1014] text-white" data-testid="button-create-customer">
              <Plus className="h-4 w-4 mr-1" />
              New Customer
            </Button>
          </Link>
        </div>

        {/* Tabs styled like projects page - underline style */}
        <div className="flex overflow-x-auto border-b border-slate-200">
          <button
            onClick={() => { setStatusTab("all"); setCustomerType("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              statusTab === "all" && customerType === "all" && !hasAgreement && sourceFilter === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-status-all"
          >
            All ({statsData?.total?.toLocaleString() || 0})
          </button>
          <button
            onClick={() => { setStatusTab("prospects"); setCustomerType("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              statusTab === "prospects" && !hasAgreement && sourceFilter === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-status-prospects"
          >
            Leads ({statsData?.prospects?.toLocaleString() || 0})
          </button>
          <button
            onClick={() => { setStatusTab("customers"); setCustomerType("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              statusTab === "customers" && !hasAgreement && sourceFilter === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-status-customers"
          >
            Customers ({statsData?.customers?.toLocaleString() || 0})
          </button>
          <div className="border-l border-slate-200 mx-2" />
          <button
            onClick={() => { setCustomerType("Residential"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              customerType === "Residential" && !hasAgreement && sourceFilter === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-type-residential"
          >
            Residential
          </button>
          <button
            onClick={() => { setCustomerType("Commercial"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              customerType === "Commercial" && !hasAgreement && sourceFilter === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-type-commercial"
          >
            Commercial
          </button>
          <button
            onClick={() => { setCustomerType("Property Manager"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              customerType === "Property Manager" && !hasAgreement && sourceFilter === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-type-property-manager"
          >
            Property Manager
          </button>
          <div className="border-l border-slate-200 mx-2" />
          <button
            onClick={() => { setHasAgreement(true); setCustomerType("all"); setStatusTab("all"); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              hasAgreement
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-has-agreements"
          >
            Agreements ({statsData?.withAgreements?.toLocaleString() || 0})
          </button>
        </div>

        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Address</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="font-semibold hidden sm:table-cell">Customer Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customersLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-48" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No customers found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        Try adjusting your search or filters
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      data-testid={`row-customer-${customer.id}`}
                      onMouseEnter={() => prefetchCustomer(customer.id)}
                      onTouchStart={() => prefetchCustomer(customer.id)}
                      onClick={() => {
                        navigate(`/crm/customers/${customer.id}`);
                      }}
                    >
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          {customer.name}
                          {customer.source === 'fieldedge' && (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                              FE
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getCustomerTypeBadgeClass(customer.customerType)}
                        >
                          {formatCustomerType(customer.customerType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusBadgeClass(customer.customerStatus)}
                        >
                          {formatCustomerStatus(customer.customerStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-slate-600 max-w-xs truncate">
                        {formatAddress(customer)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-slate-600">
                        {customer.phone || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-slate-600">
                        {formatCustomerSince(customer.createdAt)}
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
                Showing {((page - 1) * ITEMS_PER_PAGE) + 1} to{" "}
                {Math.min(page * ITEMS_PER_PAGE, total)} of {total.toLocaleString()} customers
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
                <span className="text-sm text-slate-600 px-2">
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
            </div>
          )}
        </Card>
      </div>
    </CrmLayout>
  );
}
