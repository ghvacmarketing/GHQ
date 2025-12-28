import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  X,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import type { CrmUser, CrmCustomer } from "@shared/schema";

type CustomerWithAddress = CrmCustomer & { fullAddress: string | null };

type CustomersResponse = {
  customers: CustomerWithAddress[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  const [customerStatus, setCustomerStatus] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
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

  const { dateFrom, dateTo } = useMemo(() => {
    const today = startOfDay(new Date());
    switch (dateFilter) {
      case "today":
        return { dateFrom: today.toISOString(), dateTo: today.toISOString() };
      case "this_week":
        return { dateFrom: startOfWeek(today).toISOString(), dateTo: today.toISOString() };
      case "this_month":
        return { dateFrom: startOfMonth(today).toISOString(), dateTo: today.toISOString() };
      case "custom":
        return {
          dateFrom: customDateFrom?.toISOString() || "",
          dateTo: customDateTo?.toISOString() || "",
        };
      default:
        return { dateFrom: "", dateTo: "" };
    }
  }, [dateFilter, customDateFrom, customDateTo]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, customerType, customerStatus, dateFilter, customDateFrom, customDateTo]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (customerType !== "all") params.set("customerType", customerType);
    if (customerStatus !== "all") params.set("customerStatus", customerStatus);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, customerType, customerStatus, dateFrom, dateTo, page]);

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

  const formatCustomerType = (type: string | null) => {
    if (!type) return "—";
    const map: Record<string, string> = {
      residential: "Residential",
      commercial: "Commercial",
      property_manager: "Property Manager",
    };
    return map[type] || type;
  };

  const formatCustomerStatus = (status: string | null) => {
    if (!status) return "—";
    const map: Record<string, string> = {
      prospect: "Prospect",
      client: "Client",
    };
    return map[status] || status;
  };

  const getStatusBadgeClass = (status: string | null) => {
    if (status === "client") return "bg-green-100 text-green-700 border-green-200";
    if (status === "prospect") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-slate-100 text-slate-600 border-slate-200";
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
  const total = customersData?.total || 0;
  const totalPages = customersData?.totalPages || 0;

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
                All ({total.toLocaleString()})
              </span>
            </p>
          </div>
        </div>

        <Card className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name, email, phone, or address..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Select value={customerType} onValueChange={setCustomerType}>
                  <SelectTrigger data-testid="select-customer-type">
                    <SelectValue placeholder="Customer Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="property_manager">Property Manager</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={customerStatus} onValueChange={setCustomerStatus}>
                  <SelectTrigger data-testid="select-customer-status">
                    <SelectValue placeholder="Customer Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger data-testid="select-date-filter">
                    <SelectValue placeholder="Date Added" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>

                {dateFilter === "custom" && (
                  <div className="flex gap-2 items-center col-span-1 sm:col-span-2 lg:col-span-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          data-testid="button-date-from"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customDateFrom ? format(customDateFrom, "MM/dd/yy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={customDateFrom}
                          onSelect={setCustomDateFrom}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          data-testid="button-date-to"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customDateTo ? format(customDateTo, "MM/dd/yy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={customDateTo}
                          onSelect={setCustomDateTo}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCustomDateFrom(undefined);
                        setCustomDateTo(undefined);
                      }}
                      data-testid="button-clear-dates"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Display Name</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Full Address</TableHead>
                  <TableHead className="font-semibold hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Email</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customersLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-48" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
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
                    >
                      <TableCell className="font-medium text-slate-900">
                        {customer.name}
                        {customer.companyName && (
                          <span className="text-slate-500 text-sm block">
                            {customer.companyName}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatCustomerType(customer.customerType)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-slate-600 max-w-xs truncate">
                        {customer.fullAddress || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-slate-600">
                        {customer.phone || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-slate-600 max-w-xs truncate">
                        {customer.email || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusBadgeClass(customer.customerStatus)}
                        >
                          {formatCustomerStatus(customer.customerStatus)}
                        </Badge>
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
