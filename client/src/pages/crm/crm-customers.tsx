import { useEffect, useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { CrmUser, CrmAccount, CrmSite, CrmContact, AccountType, AccountStatus } from "@shared/schema";

type AccountWithDetails = CrmAccount & {
  primarySite: CrmSite | null;
  primaryContact: CrmContact | null;
};

type AccountsResponse = {
  accounts: AccountWithDetails[];
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
  const [accountType, setAccountType] = useState("all");
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
  }, [debouncedSearch, accountType, statusTab]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (accountType !== "all") params.set("accountType", accountType);
    if (statusTab !== "all") {
      const statusMap: Record<string, AccountStatus> = {
        prospects: "PROSPECT",
        active: "ACTIVE",
        inactive: "INACTIVE",
      };
      if (statusMap[statusTab]) {
        params.set("accountStatus", statusMap[statusTab]);
      }
    }
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, accountType, statusTab, page]);

  const { data: accountsData, isLoading: accountsLoading } = useQuery<AccountsResponse>({
    queryKey: ["/api/crm/accounts", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/accounts?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const formatAccountType = (type: AccountType) => {
    const map: Record<AccountType, string> = {
      RESIDENTIAL: "Residential",
      PROPERTY_MANAGER: "Property Manager",
      COMMERCIAL: "Commercial",
    };
    return map[type] || type;
  };

  const getAccountTypeBadgeClass = (type: AccountType) => {
    switch (type) {
      case "RESIDENTIAL":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "PROPERTY_MANAGER":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "COMMERCIAL":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const formatAccountStatus = (status: AccountStatus) => {
    const map: Record<AccountStatus, string> = {
      PROSPECT: "Prospect",
      ACTIVE: "Active",
      INACTIVE: "Inactive",
      DO_NOT_SERVICE: "Do Not Service",
    };
    return map[status] || status;
  };

  const getStatusBadgeClass = (status: AccountStatus) => {
    switch (status) {
      case "PROSPECT":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "ACTIVE":
        return "bg-green-100 text-green-700 border-green-200";
      case "INACTIVE":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "DO_NOT_SERVICE":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const formatPrimarySite = (site: CrmSite | null) => {
    if (!site) return "—";
    const parts = [site.address1, site.city, site.state, site.zip].filter(Boolean);
    return parts.join(", ") || "—";
  };

  const formatPrimaryContact = (contact: CrmContact | null) => {
    if (!contact) return { name: "—", phone: "" };
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";
    return { name, phone: contact.phone || "" };
  };

  const formatCustomerSince = (date: string | null) => {
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

  const accounts = accountsData?.accounts || [];
  const total = accountsData?.pagination?.total || 0;
  const totalPages = accountsData?.pagination?.totalPages || 0;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-accounts-title">
              Accounts
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              <span className="font-medium text-slate-700" data-testid="text-accounts-count">
                {total.toLocaleString()} accounts
              </span>
            </p>
          </div>
          <Link href="/crm/accounts/new">
            <Button data-testid="button-create-account">
              <Plus className="h-4 w-4 mr-2" />
              Create Account
            </Button>
          </Link>
        </div>

        <Card className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <Tabs value={statusTab} onValueChange={setStatusTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="all" data-testid="tab-status-all">All</TabsTrigger>
                  <TabsTrigger value="prospects" data-testid="tab-status-prospects">Prospects</TabsTrigger>
                  <TabsTrigger value="active" data-testid="tab-status-active">Active</TabsTrigger>
                  <TabsTrigger value="inactive" data-testid="tab-status-inactive">Inactive</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by name or company..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>

                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-account-type">
                    <SelectValue placeholder="Account Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="RESIDENTIAL">Residential</SelectItem>
                    <SelectItem value="PROPERTY_MANAGER">Property Manager</SelectItem>
                    <SelectItem value="COMMERCIAL">Commercial</SelectItem>
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
                  <TableHead className="font-semibold">Display Name</TableHead>
                  <TableHead className="font-semibold">Account Type</TableHead>
                  <TableHead className="font-semibold">Account Status</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Primary Site</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Primary Contact</TableHead>
                  <TableHead className="font-semibold hidden sm:table-cell">Customer Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountsLoading ? (
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
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No accounts found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        Try adjusting your search or filters
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => {
                    const primaryContact = formatPrimaryContact(account.primaryContact);
                    return (
                      <TableRow
                        key={account.id}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        data-testid={`row-account-${account.id}`}
                        onClick={() => navigate(`/crm/accounts/${account.id}`)}
                      >
                        <TableCell className="font-medium text-slate-900">
                          {account.displayName}
                          {account.companyName && (
                            <span className="text-slate-500 text-sm block">
                              {account.companyName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getAccountTypeBadgeClass(account.accountType)}
                          >
                            {formatAccountType(account.accountType)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getStatusBadgeClass(account.accountStatus)}
                          >
                            {formatAccountStatus(account.accountStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-slate-600 max-w-xs truncate">
                          {formatPrimarySite(account.primarySite)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-slate-600">
                          <div>
                            <span>{primaryContact.name}</span>
                            {primaryContact.phone && (
                              <span className="text-slate-400 text-sm block">
                                {primaryContact.phone}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-slate-600">
                          {formatCustomerSince(account.customerSince)}
                        </TableCell>
                      </TableRow>
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
                {Math.min(page * ITEMS_PER_PAGE, total)} of {total.toLocaleString()} accounts
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
