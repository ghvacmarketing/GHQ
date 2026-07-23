import React, { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, useSearch, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, queryClient as globalQueryClient } from "@/lib/queryClient";

// Debug logging for cache hits
const DEBUG_CACHE = true;
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
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  Plus,
  FolderOpen,
  CornerDownRight,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { EmptyState } from "@/components/crm/ui-kit";
import { QuickAddCustomerDialog } from "@/components/crm/quick-add-customer-dialog";
import { format } from "date-fns";
import type { CrmUser, CrmCustomer, CrmProject } from "@shared/schema";

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
  const searchString = useSearch();
  const queryClient = useQueryClient();

  const initialSearch = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return p.get("search") || "";
  }, []);

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [customerType, setCustomerType] = useState("all");
  const [statusTab, setStatusTab] = useState("all");
  const [hasAgreement, setHasAgreement] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "crm" | "fieldedge">("all");
  const [accountRole, setAccountRole] = useState<"all" | "parent" | "sub">("all");
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
  }, [debouncedSearch, customerType, statusTab, hasAgreement, sourceFilter, accountRole]);

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
    if (accountRole !== "all") {
      params.set("accountRole", accountRole);
    }
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, customerType, statusTab, hasAgreement, sourceFilter, accountRole, page]);

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
    staleTime: 2 * 60 * 1000,
  });

  const { data: statsData } = useQuery<{ prospects: number; customers: number; total: number; withAgreements: number }>({
    queryKey: ["/api/crm/customers/stats", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/crm/customers/stats?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!currentUser,
  });

  // Fetch projects for customers on the current page
  const customerIds = useMemo(() => {
    return customersData?.customers?.map(c => c.id) || [];
  }, [customersData?.customers]);

  const { data: projectsData } = useQuery<{ projects: CrmProject[] }>({
    queryKey: ["/api/crm/projects", "forCustomers", customerIds],
    queryFn: async () => {
      if (customerIds.length === 0) return { projects: [] };
      const params = new URLSearchParams();
      customerIds.forEach(id => params.append("customerId", id));
      const res = await fetch(`/api/crm/projects?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!currentUser && customerIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  // Group projects by customer ID
  const projectsByCustomerId = useMemo(() => {
    const grouped: Record<string, CrmProject[]> = {};
    const projects = projectsData?.projects || [];
    for (const project of projects) {
      if (project.customerId) {
        if (!grouped[project.customerId]) {
          grouped[project.customerId] = [];
        }
        grouped[project.customerId].push(project);
      }
    }
    return grouped;
  }, [projectsData]);

  // Organize customers with sub-accounts grouped under parents
  const organizedCustomers = useMemo(() => {
    let customers = customersData?.customers || [];

    // Sort exact/starts-with name matches to top when searching
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.trim().toLowerCase();
      customers = [...customers].sort((a, b) => {
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        const aExact = aName === term;
        const bExact = bName === term;
        const aStarts = aName.startsWith(term);
        const bStarts = bName.startsWith(term);
        if (aExact !== bExact) return aExact ? -1 : 1;
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return 0;
      });
    }
    
    // Separate main accounts (no parent) and sub-accounts (have parent)
    const mainAccounts = customers.filter(c => !c.parentCustomerId);
    const subAccounts = customers.filter(c => c.parentCustomerId);
    
    // Create a map of parent IDs that are in the current page
    const mainAccountIds = new Set(mainAccounts.map(c => c.id));
    
    // Group sub-accounts by parent ID
    const subAccountsByParent: Record<string, CustomerWithAddress[]> = {};
    for (const sub of subAccounts) {
      const parentId = sub.parentCustomerId as string;
      if (!subAccountsByParent[parentId]) {
        subAccountsByParent[parentId] = [];
      }
      subAccountsByParent[parentId].push(sub);
    }
    
    // Build organized list: parent followed by its sub-accounts
    const result: Array<{ customer: CustomerWithAddress; isSubAccount: boolean; parentName?: string }> = [];
    const addedSubAccountIds = new Set<string>();
    
    for (const parent of mainAccounts) {
      result.push({ customer: parent, isSubAccount: false });
      
      // Add sub-accounts immediately after their parent
      const children = subAccountsByParent[parent.id] || [];
      for (const child of children) {
        result.push({ customer: child, isSubAccount: true, parentName: parent.name });
        addedSubAccountIds.add(child.id);
      }
    }
    
    // Add any sub-accounts whose parent is not in the current page
    for (const sub of subAccounts) {
      if (!addedSubAccountIds.has(sub.id)) {
        result.push({ customer: sub, isSubAccount: true });
      }
    }
    
    return result;
  }, [customersData]);

  // Format project number as 4-digit string
  const formatProjectNumber = (projectNumber: number | null) => {
    if (projectNumber === null || projectNumber === undefined) return "0000";
    return String(projectNumber).padStart(4, "0");
  };

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
      return "bg-amber-50 text-amber-700";
    }
    if (normalizedType === "property manager" || normalizedType === "property_manager") {
      return "bg-purple-50 text-purple-700";
    }
    return "bg-blue-50 text-blue-700";
  };

  const formatCustomerStatus = (status: string | null) => {
    if (!status) return "Unknown";
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === "prospect") return "Lead";
    // "client" is the legacy value for a converted customer — always show "Customer".
    if (normalizedStatus === "customer" || normalizedStatus === "client") return "Customer";
    return status;
  };

  const getStatusBadgeClass = (status: string | null) => {
    const normalizedStatus = status?.toLowerCase() || "";
    switch (normalizedStatus) {
      case "prospect":
        return "bg-amber-50 text-amber-700";
      case "customer":
        return "bg-green-50 text-green-700";
      default:
        return "bg-slate-100 text-slate-600";
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
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
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
        {/* Title + subheading · centered search · action — all on one row */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="min-w-0 shrink-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground truncate" data-testid="text-customers-title">
              Customers
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Manage customer accounts, contacts, and history</p>
          </div>

          <div className="relative w-full lg:flex-1 lg:max-w-sm lg:mx-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search"
            />
          </div>

          <div className="shrink-0">
            <Button size="sm" onClick={() => setQuickAddOpen(true)} data-testid="button-create-customer">
              <Plus className="h-4 w-4 mr-1" />
              New Customer
            </Button>
          </div>
        </div>

        <QuickAddCustomerDialog
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          onCreated={(customer) => navigate(`/crm/customers/${customer.id}`)}
        />

        {/* Tabs styled like projects page - underline style */}
        <div className="flex overflow-x-auto overflow-y-hidden border-b border-slate-200 scrollbar-hide">
          <button
            onClick={() => { setStatusTab("all"); setCustomerType("all"); setHasAgreement(false); setSourceFilter("all"); setAccountRole("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              statusTab === "all" && customerType === "all" && !hasAgreement && sourceFilter === "all" && accountRole === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-status-all"
          >
            All {total.toLocaleString()}
          </button>
          <button
            onClick={() => { setStatusTab("prospects"); setCustomerType("all"); setHasAgreement(false); setSourceFilter("all"); setAccountRole("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              statusTab === "prospects" && !hasAgreement && sourceFilter === "all" && accountRole === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-status-prospects"
          >
            Leads ({statsData?.prospects?.toLocaleString() || 0})
          </button>
          <button
            onClick={() => { setStatusTab("customers"); setCustomerType("all"); setHasAgreement(false); setSourceFilter("all"); setAccountRole("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              statusTab === "customers" && !hasAgreement && sourceFilter === "all" && accountRole === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-status-customers"
          >
            Customers ({statsData?.customers?.toLocaleString() || 0})
          </button>
          <div className="border-l border-slate-200 mx-2" />
          <button
            onClick={() => { setCustomerType("Residential"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); setAccountRole("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              customerType === "Residential" && !hasAgreement && sourceFilter === "all" && accountRole === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-type-residential"
          >
            Residential
          </button>
          <button
            onClick={() => { setCustomerType("Commercial"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); setAccountRole("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              customerType === "Commercial" && !hasAgreement && sourceFilter === "all" && accountRole === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-type-commercial"
          >
            Commercial
          </button>
          <button
            onClick={() => { setCustomerType("Property Manager"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); setAccountRole("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              customerType === "Property Manager" && !hasAgreement && sourceFilter === "all" && accountRole === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-type-property-manager"
          >
            Property Manager
          </button>
          <div className="border-l border-slate-200 mx-2" />
          <button
            onClick={() => { setHasAgreement(true); setCustomerType("all"); setStatusTab("all"); setSourceFilter("all"); setAccountRole("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              hasAgreement && accountRole === "all"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-has-agreements"
          >
            Agreements ({statsData?.withAgreements?.toLocaleString() || 0})
          </button>
          <div className="border-l border-slate-200 mx-2" />
          <button
            onClick={() => { setAccountRole("parent"); setCustomerType("all"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              accountRole === "parent"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-role-parent"
          >
            Parent Accounts
          </button>
          <button
            onClick={() => { setAccountRole("sub"); setCustomerType("all"); setStatusTab("all"); setHasAgreement(false); setSourceFilter("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              accountRole === "sub"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
            data-testid="tab-role-sub"
          >
            Sub Accounts
          </button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
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
                ) : organizedCustomers.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="p-0">
                      <EmptyState
                        icon={Users}
                        title="No customers found"
                        message="Try adjusting your search or filters."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  organizedCustomers.map(({ customer, isSubAccount }) => {
                    const customerProjects = projectsByCustomerId[customer.id] || [];
                    return (
                      <React.Fragment key={customer.id}>
                        <TableRow
                          className={`cursor-pointer hover:bg-slate-50 transition-colors ${isSubAccount ? 'bg-slate-25' : ''}`}
                          data-testid={`row-customer-${customer.id}`}
                          onMouseEnter={() => prefetchCustomer(customer.id)}
                          onTouchStart={() => prefetchCustomer(customer.id)}
                          onClick={() => {
                            const q = debouncedSearch.trim();
                            navigate(`/crm/customers/${customer.id}${q ? `?from=customers&q=${encodeURIComponent(q)}` : ""}`);
                          }}
                        >
                          <TableCell className="font-medium text-slate-900">
                            <div className={`flex items-center gap-2 ${isSubAccount ? 'pl-6' : ''}`}>
                              {isSubAccount && (
                                <CornerDownRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              )}
                              {customer.name}
                              {isSubAccount && (
                                <StatusDot pill="bg-purple-50 text-purple-600 border-purple-200 text-xs">
                                  Sub
                                </StatusDot>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusDot pill={getCustomerTypeBadgeClass(customer.customerType)}>
                              {formatCustomerType(customer.customerType)}
                            </StatusDot>
                          </TableCell>
                          <TableCell>
                            <StatusDot pill={getStatusBadgeClass(customer.customerStatus)}>
                              {formatCustomerStatus(customer.customerStatus)}
                            </StatusDot>
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
                        {customerProjects.map((project) => (
                          <TableRow
                            key={`project-${project.id}`}
                            className="cursor-pointer hover:bg-slate-100 transition-colors bg-slate-50/50"
                            data-testid={`row-project-${project.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/crm/projects/${project.id}`);
                            }}
                          >
                            <TableCell className="font-medium text-slate-700">
                              <div className="flex items-center gap-2 pl-6">
                                <FolderOpen className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                <span className="text-slate-600">
                                  {customer.name} - {formatProjectNumber(project.projectNumber)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusDot
                                pill="bg-slate-100 text-slate-600 border-slate-200"
                              >
                                Project
                              </StatusDot>
                            </TableCell>
                            <TableCell>
                              <StatusDot
                                pill="bg-blue-50 text-blue-600 border-blue-200"
                              >
                                {project.status}
                              </StatusDot>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-slate-500 max-w-xs truncate">
                              {project.title || "—"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-slate-500">
                              —
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-slate-500">
                              {project.createdAt ? formatCustomerSince(project.createdAt) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    );
                  })
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
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                  className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-slate-600 px-2">
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
            </div>
          )}
        </Card>
      </div>
    </CrmLayout>
  );
}
