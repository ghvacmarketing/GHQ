import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, ChevronRight, Users, LogIn, Loader2, Plus, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocalStartOfDay, getLocalEndOfDay, toLocalTime } from "@/lib/timezone";
import { format } from "date-fns";
import { isNativeApp } from "@/lib/native";
import MobileShell from "./mobile-shell";
import type { CrmCustomer, CrmUser } from "@shared/schema";

const BRAND_COLOR = "#711419";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

type TodayJob = {
  id: string;
  scheduledStart: string | null;
  customerId: string | null;
  customer?: { id: string; name: string | null } | null;
};

/** Customer lookup — recent customers + today's schedule up top, with a
 *  floating search pill (photos-style) that opens the fullscreen search
 *  overlay whose input rides eased above the keyboard. */
export default function MobileCustomers() {
  const [, navigate] = useLocation();
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Legacy deep-link: creation now lives on its own page.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      navigate("/mobile/customers/new", { replace: true });
    }
  }, [navigate]);

  // ── Search overlay keyboard ride (same pattern as Photos, eased) ──
  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!searchActive) return;
    const setInset = (px: number) => {
      const el = searchBarRef.current;
      if (el) el.style.paddingBottom = px > 0 ? `${px + 10}px` : "calc(env(safe-area-inset-bottom) + 12px)";
    };
    setInset(0);
    // Overlay paints first; the keyboard rises a beat later.
    const focusT = setTimeout(() => searchInputRef.current?.focus(), 220);

    let removeNative: (() => void) | null = null;
    if (isNativeApp()) {
      import("@capacitor/keyboard").then(({ Keyboard }) => {
        const subs: any[] = [];
        Keyboard.addListener("keyboardWillShow", (info: any) => setInset(info?.keyboardHeight || 0)).then((h) => subs.push(h));
        Keyboard.addListener("keyboardWillHide", () => setInset(0)).then((h) => subs.push(h));
        removeNative = () => subs.forEach((h) => h?.remove?.());
      }).catch(() => {});
    }
    const vv = window.visualViewport;
    const update = () => setInset(Math.max(0, window.innerHeight - (vv?.height || window.innerHeight) - (vv?.offsetTop || 0)));
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      clearTimeout(focusT);
      removeNative?.();
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [searchActive]);

  const closeSearch = () => {
    setSearchActive(false);
    setSearchQuery("");
  };

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // Recent customers — the page's resting content
  const { data: recent, isLoading, error, isError } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/mobile/customers", { limit: 5 }],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/customers?limit=5`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) throw new Error("AUTH_REQUIRED");
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    retry: (failureCount, err) => {
      if (err instanceof Error && err.message === "AUTH_REQUIRED") return false;
      return failureCount < 2;
    },
  });

  // Search results — only while the overlay is up
  const { data: results = [], isFetching: searching } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/mobile/customers", { search: debouncedSearch, limit: 20 }],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch, limit: "20" });
      const res = await fetch(`/api/mobile/customers?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchActive && debouncedSearch.trim().length >= 2,
  });

  // Who's on today's schedule — one glance before heading out
  const todayStart = getLocalStartOfDay(new Date()).toISOString();
  const todayEnd = getLocalEndOfDay(new Date()).toISOString();
  const { data: todayJobs = [] } = useQuery<TodayJob[]>({
    queryKey: ["/api/crm/work-orders", "customers-today", currentUser?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: todayStart, dateTo: todayEnd });
      if ((currentUser?.role === "tech" || currentUser?.role === "sales") && currentUser?.id) {
        params.set("techId", currentUser.id);
      }
      const res = await fetch(`/api/crm/work-orders?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.workOrders || [];
    },
    enabled: !!currentUser,
    staleTime: 45 * 1000,
  });
  const todayCustomers = (() => {
    const seen = new Map<string, { id: string; name: string; time: string | null }>();
    for (const j of todayJobs) {
      const id = j.customer?.id || j.customerId;
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        id,
        name: j.customer?.name || "Customer",
        time: j.scheduledStart ? format(toLocalTime(j.scheduledStart), "h:mm a") : null,
      });
    }
    return Array.from(seen.values());
  })();

  const needsAuth = isError && error instanceof Error && error.message === "AUTH_REQUIRED";

  const customerRow = (customer: CrmCustomer, i: number, onPick?: () => void) => (
    <button
      key={customer.id}
      onClick={onPick || (() => navigate(`/mobile/customers/${customer.id}`))}
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
          <span className="shrink-0 rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {customer.customerType === "commercial" ? "Comm" : customer.customerType === "property_manager" ? "PM" : "Res"}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {[customer.phone, customer.fullAddress].filter(Boolean).join(" · ") || "No contact info"}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );

  return (
    <MobileShell>
      <div className="space-y-5 p-4 pb-6" data-testid="mobile-customers-page">
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
        ) : (
          <>
            {/* On today's schedule — quick jump to the customers you'll see */}
            {todayCustomers.length > 0 && (
              <div data-testid="customers-today">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <CalendarClock className="h-3.5 w-3.5" /> On today&rsquo;s schedule
                </h3>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                  {todayCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/mobile/customers/${c.id}`)}
                      className="flex shrink-0 items-center gap-2 rounded-full border border-slate-300/70 bg-white py-1.5 pl-1.5 pr-3.5 shadow-sm transition-transform active:scale-95"
                      data-testid={`today-customer-${c.id}`}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#711419]/10 text-[11px] font-bold text-[#711419]">
                        {c.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-slate-800">{c.name.split(/\s+/).slice(0, 2).join(" ")}</span>
                      {c.time && <span className="text-xs tabular-nums text-slate-400">{c.time}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent customers — top 5 */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Recent customers</h3>
              {isLoading ? (
                <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  ))}
                </div>
              ) : recent && recent.length > 0 ? (
                <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customer-results">
                  {recent.slice(0, 5).map((c, i) => customerRow(c, i))}
                </div>
              ) : (
                <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-12 text-center" data-testid="empty-state">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[4px] border border-[#711419]/20 bg-[#711419]/5">
                    <Users className="h-6 w-6 text-[#711419]" />
                  </span>
                  <h3 className="text-base font-semibold text-slate-800">No customers yet</h3>
                  <p className="mt-0.5 text-sm text-slate-500">Customers with recent activity will appear here.</p>
                </div>
              )}
            </div>

            {/* Quick action */}
            <button
              onClick={() => navigate("/mobile/customers/new")}
              className="flex w-full items-center gap-3 rounded-[4px] border border-slate-300/70 bg-white px-3.5 py-3 text-left active:bg-slate-50"
              data-testid="customers-add-new"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-[#711419] text-white">
                <Plus className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">Add a new customer</span>
                <span className="block text-xs text-slate-500">They&rsquo;re in the CRM the moment you save</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </>
        )}
      </div>

      {/* Floating search pill — sits above the nav, left of the "+" */}
      {!needsAuth && !searchActive && (
        <button
          onClick={() => setSearchActive(true)}
          className="fixed left-4 right-[84px] z-40 flex h-12 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
          data-testid="customers-search-pill"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-[16px] text-slate-400">Search customers</span>
        </button>
      )}

      {/* Fullscreen search — results fill from the top, input docked at the
          bottom riding eased above the keyboard (same feel as Photos). */}
      {searchActive && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-slate-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          data-testid="customers-search-overlay"
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${searchQuery.trim().length < 2 || searching || results.length === 0 ? "flex flex-col justify-end" : ""}`}
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            {searchQuery.trim().length < 2 ? (
              recent && recent.length > 0 ? (
                <div className="pb-2">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Recent</h3>
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
                    {recent.slice(0, 5).map((c, i) => customerRow(c, i))}
                  </div>
                </div>
              ) : (
                <p className="pb-6 text-center text-sm text-slate-400">Type a name or phone number.</p>
              )
            ) : searching ? (
              <div className="flex items-center justify-center pb-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <p className="pb-6 text-center text-sm text-slate-400">No customers match &ldquo;{searchQuery.trim()}&rdquo;.</p>
            ) : (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm" data-testid="customers-search-results">
                {results.map((c, i) => customerRow(c, i))}
              </div>
            )}
          </div>
          <div
            ref={searchBarRef}
            className="flex items-center gap-2 px-4 pt-2"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
              transition: "padding-bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="customer-search-input"
              />
            </div>
            {/* The create "+" reborn as the search X — quarter-turned plus */}
            <button
              onClick={closeSearch}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#711419] text-white shadow-[0_6px_20px_rgba(113,20,25,0.4)] transition-transform active:scale-90 animate-in zoom-in-75 duration-300"
              aria-label="Close search"
              data-testid="customers-search-close"
            >
              <Plus className="h-6 w-6 rotate-45" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
