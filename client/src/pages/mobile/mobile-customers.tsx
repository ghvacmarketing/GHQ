import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, Phone, MapPin, ChevronRight, Users, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import MobileShell from "./mobile-shell";
import type { CrmCustomer } from "@shared/schema";

const BRAND_COLOR = "#711419";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function CustomerCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <div className="flex justify-between items-start">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

function CustomerCard({ customer }: { customer: CrmCustomer }) {
  const customerTypeConfig = {
    residential: { label: "Residential", className: "bg-blue-100 text-blue-700 border-blue-300" },
    commercial: { label: "Commercial", className: "bg-purple-100 text-purple-700 border-purple-300" },
  };

  const typeConfig = customerTypeConfig[customer.customerType as keyof typeof customerTypeConfig] || customerTypeConfig.residential;

  return (
    <Link href={`/mobile/customers/${customer.id}`}>
      <div
        className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 active:bg-slate-50 transition-colors min-h-[88px]"
        data-testid={`customer-card-${customer.id}`}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate" data-testid={`customer-name-${customer.id}`}>
              {customer.name}
            </h3>
            
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1 min-h-[28px]"
                data-testid={`customer-phone-${customer.id}`}
              >
                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{customer.phone}</span>
              </a>
            )}
            
            {customer.fullAddress && (
              <div className="flex items-start gap-1.5 text-sm text-slate-500 mt-1">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span className="truncate" data-testid={`customer-address-${customer.id}`}>
                  {customer.fullAddress}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className={`text-xs ${typeConfig.className}`} data-testid={`customer-type-${customer.id}`}>
              {typeConfig.label}
            </Badge>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function MobileCustomers() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: customers, isLoading, error, isError } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/mobile/customers", { search: debouncedSearch, limit: 20 }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("limit", "20");
      const res = await fetch(`/api/mobile/customers?${params.toString()}`, {
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error("AUTH_REQUIRED");
      }
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") return false;
      return failureCount < 2;
    },
  });
  
  const needsAuth = isError && error instanceof Error && error.message === "AUTH_REQUIRED";

  return (
    <MobileShell>
      <div className="p-4 pb-6" data-testid="mobile-customers-page">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-800 mb-3" data-testid="page-title">
            Customer Lookup
          </h1>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11"
              data-testid="customer-search-input"
            />
          </div>
        </div>

        <div className="space-y-3">
          {needsAuth ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="auth-required-state">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: `${BRAND_COLOR}15` }}
              >
                <LogIn className="h-8 w-8" style={{ color: BRAND_COLOR }} />
              </div>
              <h3 className="text-lg font-medium text-slate-800 mb-1">Login Required</h3>
              <p className="text-sm text-slate-500 mb-4">
                Please log in to access customer lookup
              </p>
              <Link href="/crm/login">
                <Button style={{ backgroundColor: BRAND_COLOR }} data-testid="btn-login">
                  Go to Login
                </Button>
              </Link>
            </div>
          ) : isLoading ? (
            <>
              <CustomerCardSkeleton />
              <CustomerCardSkeleton />
              <CustomerCardSkeleton />
              <CustomerCardSkeleton />
              <CustomerCardSkeleton />
            </>
          ) : customers && customers.length > 0 ? (
            customers.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: `${BRAND_COLOR}15` }}
              >
                <Users className="h-8 w-8" style={{ color: BRAND_COLOR }} />
              </div>
              <h3 className="text-lg font-medium text-slate-800 mb-1">No customers found</h3>
              <p className="text-sm text-slate-500">
                {searchQuery
                  ? "Try adjusting your search terms"
                  : "Start typing to search for customers"}
              </p>
            </div>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
