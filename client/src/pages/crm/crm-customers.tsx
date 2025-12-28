import { useEffect, useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
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
};

type CustomersResponse = {
  customers: CustomerWithAddress[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const ITEMS_PER_PAGE = 50;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function CrmCustomers() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [customerType, setCustomerType] = useState("all");
  const [statusTab, setStatusTab] = useState("all");
  const [page, setPage] = useState(1);

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
  }, [debouncedSearch, customerType, statusTab]);

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
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, customerType, statusTab, page]);

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: statsData } = useQuery<{ prospects: number; customers: number; total: number }>({
    queryKey: ["/api/crm/customers/stats"],
    queryFn: async () => {
      const res = await fetch("/api/crm/customers/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!currentUser,
  });

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
    if (normalizedStatus === "prospect") return "Prospect";
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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900" data-testid="text-customers-title">
            Customers
          </h1>
          <Link href="/crm/accounts/new">
            <Button size="sm" data-testid="button-create-customer">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </Link>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search by name, phone, email, or address..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-12 h-12 text-base bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419]"
            data-testid="input-search"
            autoFocus
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusTab("all")}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              statusTab === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
            data-testid="tab-status-all"
          >
            All ({statsData?.total?.toLocaleString() || 0})
          </button>
          <button
            onClick={() => setStatusTab("prospects")}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              statusTab === "prospects"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
            data-testid="tab-status-prospects"
          >
            Prospects ({statsData?.prospects?.toLocaleString() || 0})
          </button>
          <button
            onClick={() => setStatusTab("customers")}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              statusTab === "customers"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
            data-testid="tab-status-customers"
          >
            Customers ({statsData?.customers?.toLocaleString() || 0})
          </button>

          <div className="flex-1" />

          <Select value={customerType} onValueChange={setCustomerType}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-customer-type">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Residential">Residential</SelectItem>
              <SelectItem value="Property Manager">Property Manager</SelectItem>
              <SelectItem value="Commercial">Commercial</SelectItem>
            </SelectContent>
          </Select>
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
                      onClick={() => {
                        // CRM accounts go to account detail page, legacy customers to customer detail
                        if (customer.origin === 'crm_accounts') {
                          if (customer.accountId) {
                            navigate(`/crm/accounts/${customer.accountId}`);
                          }
                          // Skip navigation if CRM account lacks accountId (shouldn't happen)
                        } else {
                          navigate(`/crm/customers/${customer.id}`);
                        }
                      }}
                    >
                      <TableCell className="font-medium text-slate-900">
                        {customer.name}
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
