import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, ChevronRight, Users, LogIn, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function MobileCustomers() {
  const [, navigate] = useLocation();
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
      <div className="p-4 pb-6 space-y-4" data-testid="mobile-customers-page">
        {/* iOS-style search pill — the page IS the lookup, no title needed */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search customers by name or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-100 pl-9 pr-9 text-[16px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
            data-testid="customer-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-slate-300 text-white"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {needsAuth ? (
          <div className="rounded-[4px] border border-slate-300/70 bg-white py-12 text-center" data-testid="auth-required-state">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[4px] border border-[#711419]/20 bg-[#711419]/5">
              <LogIn className="h-6 w-6 text-[#711419]" />
            </span>
            <h3 className="text-base font-semibold text-slate-800">Login required</h3>
            <p className="mt-0.5 text-sm text-slate-500">Please log in to look up customers.</p>
            <Link href="/crm/login">
              <Button className="mt-4" style={{ backgroundColor: BRAND_COLOR }} data-testid="btn-login">
                Go to Login
              </Button>
            </Link>
          </div>
        ) : isLoading ? (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            ))}
          </div>
        ) : customers && customers.length > 0 ? (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customer-results">
            {customers.map((customer, i) => (
              <button
                key={customer.id}
                onClick={() => navigate(`/mobile/customers/${customer.id}`)}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                data-testid={`customer-card-${customer.id}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-[#711419]/20 bg-[#711419]/5 text-[13px] font-bold text-[#711419]">
                  {(customer.name || "?").trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900" data-testid={`customer-name-${customer.id}`}>
                      {customer.name}
                    </span>
                    <span className="shrink-0 rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500" data-testid={`customer-type-${customer.id}`}>
                      {customer.customerType === "commercial" ? "Comm" : customer.customerType === "property_manager" ? "PM" : "Res"}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500" data-testid={`customer-address-${customer.id}`}>
                    {[customer.phone, customer.fullAddress].filter(Boolean).join(" · ") || "No contact info"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-12 text-center" data-testid="empty-state">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[4px] border border-[#711419]/20 bg-[#711419]/5">
              <Users className="h-6 w-6 text-[#711419]" />
            </span>
            <h3 className="text-base font-semibold text-slate-800">No customers found</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {searchQuery ? "Try adjusting your search terms." : "Start typing to search for customers."}
            </p>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
