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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-customers-title">
              Customers
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              <span className="font-medium text-slate-700" data-testid="text-customers-count">
                {total.toLocaleString()} customers
              </span>
            </p>
          </div>
          <Link href="/crm/accounts/new">
            <Button data-testid="button-create-customer">
              <Plus className="h-4 w-4 mr-2" />
              Create Account
            </Button>
          </Link>
        </div>

        <Card className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setStatusTab("all")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    statusTab === "all"
                      ? "bg-slate-800 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  data-testid="tab-status-all"
                >
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  All
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    statusTab === "all" ? "bg-white/20" : "bg-slate-200"
                  }`}>
                    {statsData?.total?.toLocaleString() || "—"}
                  </span>
                </button>
                <button
                  onClick={() => setStatusTab("prospects")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    statusTab === "prospects"
                      ? "bg-amber-500 text-white shadow-md"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                  }`}
                  data-testid="tab-status-prospects"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Prospects
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    statusTab === "prospects" ? "bg-white/20" : "bg-amber-100"
                  }`}>
                    {statsData?.prospects?.toLocaleString() || "—"}
                  </span>
                </button>
                <button
                  onClick={() => setStatusTab("customers")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    statusTab === "customers"
                      ? "bg-green-500 text-white shadow-md"
                      : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                  }`}
                  data-testid="tab-status-customers"
                >
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Customers
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    statusTab === "customers" ? "bg-white/20" : "bg-green-100"
                  }`}>
                    {statsData?.customers?.toLocaleString() || "—"}
                  </span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by name, phone, or address..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>

                <Select value={customerType} onValueChange={setCustomerType}>
                  <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-customer-type">
                    <SelectValue placeholder="Customer Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Residential">Residential</SelectItem>
                    <SelectItem value="Property Manager">Property Manager</SelectItem>
                    <SelectItem value="Commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

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
                      onClick={() => navigate(`/crm/customers/${customer.id}`)}
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
