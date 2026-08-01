import { useEffect, useRef, useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, ChevronRight, Users, LogIn, CalendarClock, ListFilter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { SheetSelect } from "@/components/mobile/sheet-select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocalStartOfDay, getLocalEndOfDay, toLocalTime } from "@/lib/timezone";
import typeResidential from "@/assets/type-residential.png";
import typeCommercial from "@/assets/type-commercial.png";
import typePropertyManager from "@/assets/type-property-manager.png";

/** Metallic type badge per customer: house, office, or portfolio+key. */
const TYPE_BADGES: Record<string, string> = {
  residential: typeResidential,
  commercial: typeCommercial,
  property_manager: typePropertyManager,
};
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
  const [searchClosing, setSearchClosing] = useState(false);
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
    // Focus right away: the keyboard rises WITH the overlay so the bar
    // travels bottom-to-keyboard in one continuous motion.
    const focusT = setTimeout(() => searchInputRef.current?.focus(), 60);

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
    // Blur first so the keyboard drops while the overlay slides away —
    // one motion out, mirroring the way in.
    searchInputRef.current?.blur();
    setSearchClosing(true);
    setTimeout(() => {
      setSearchActive(false);
      setSearchClosing(false);
      setSearchQuery("");
    }, 190);
  };

  // ── All-customers list filters (same sheet pattern as job history) ──
  const [filterOpen, setFilterOpen] = useState(false);
  const [fType, setFType] = useState<"all" | "residential" | "commercial" | "property_manager">("all");
  const [fStatus, setFStatus] = useState<"all" | "customer" | "prospect">("all");
  const [fAgreement, setFAgreement] = useState(false);
  const [fRange, setFRange] = useState<"all" | "30" | "90" | "year" | "custom">("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const filtersActive = fType !== "all" || fStatus !== "all" || fAgreement || fRange !== "all";
  const createdFrom =
    fRange === "30" ? format(new Date(Date.now() - 30 * 864e5), "yyyy-MM-dd")
    : fRange === "90" ? format(new Date(Date.now() - 90 * 864e5), "yyyy-MM-dd")
    : fRange === "year" ? format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd")
    : fRange === "custom" ? fFrom
    : "";
  const createdTo = fRange === "custom" ? fTo : "";

  // Every customer, 25 at a time — pages append as the sentinel scrolls in
  const allCustomers = useInfiniteQuery({
    queryKey: ["/api/crm/customers", "mobile-all", fType, fStatus, fAgreement, createdFrom, createdTo],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: "25" });
      if (fType !== "all") params.set("customerType", fType);
      if (fStatus !== "all") params.set("customerStatus", fStatus);
      if (fAgreement) params.set("hasAgreement", "true");
      if (createdFrom) params.set("createdFrom", createdFrom);
      if (createdTo) params.set("createdTo", createdTo);
      const res = await fetch(`/api/crm/customers?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load customers");
      return res.json() as Promise<{
        customers: CrmCustomer[];
        pagination: { page: number; totalPages: number; total: number };
      }>;
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    placeholderData: (prev) => prev,
  });
  const allRows = (allCustomers.data?.pages ?? []).flatMap((p) => p.customers);
  const allTotal = allCustomers.data?.pages?.[0]?.pagination?.total ?? 0;

  // Sentinel-driven paging: current state lives in a ref so the observer
  // callback (created once) never acts on stale flags.
  const pagingRef = useRef({ hasNext: false, fetching: false, fetch: () => {} });
  pagingRef.current = {
    hasNext: !!allCustomers.hasNextPage,
    fetching: allCustomers.isFetchingNextPage,
    fetch: () => { allCustomers.fetchNextPage(); },
  };
  const sentinelIO = useRef<IntersectionObserver | null>(null);
  const sentinelRef = (el: HTMLDivElement | null) => {
    sentinelIO.current?.disconnect();
    sentinelIO.current = null;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const p = pagingRef.current;
        if (entries[0].isIntersecting && p.hasNext && !p.fetching) p.fetch();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    sentinelIO.current = io;
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

  // Search results — only while the overlay is up. Previous results stay on
  // screen while the next query runs: no loader, no flashing.
  const { data: results = [] } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/mobile/customers", { search: debouncedSearch, limit: 20 }],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch, limit: "20" });
      const res = await fetch(`/api/mobile/customers?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchActive && debouncedSearch.trim().length >= 2,
    placeholderData: (prev) => prev,
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
      <img
        src={TYPE_BADGES[(customer.customerType || "residential").toLowerCase()] || typeResidential}
        alt={customer.customerType || "residential"}
        className="h-9 w-9 shrink-0 select-none"
        draggable={false}
      />
      <span className="min-w-0 flex-1">
        <span className="truncate block text-sm font-semibold text-slate-900" data-testid={`customer-name-${customer.id}`}>
          {customer.name}
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

            {/* Every customer — filterable, loads as you scroll */}
            <div data-testid="customers-all">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  onClick={() => setFilterOpen(true)}
                  className="relative flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
                  aria-label="Filter customers"
                  data-testid="customers-filter-open"
                >
                  <ListFilter className="h-4 w-4" />
                  Filters
                  {filtersActive && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#711419]" />}
                </button>
                <h3 className="text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                  All customers{allTotal > 0 ? ` · ${allTotal}` : ""}
                </h3>
              </div>

              {allCustomers.isLoading ? (
                <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`flex items-center gap-3 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                      <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                        <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : allRows.length > 0 ? (
                <>
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customers-all-list">
                    {allRows.map((c, i) => customerRow(c, i))}
                  </div>
                  {allCustomers.isFetchingNextPage && (
                    <div className="mt-2 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className={`flex items-center gap-3 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                            <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div ref={sentinelRef} className="h-1" />
                  {!allCustomers.hasNextPage && (
                    <p className="py-3 text-center text-xs text-slate-400">That&rsquo;s everyone.</p>
                  )}
                </>
              ) : (
                <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center" data-testid="customers-all-empty">
                  <p className="text-sm font-medium text-slate-600">No customers match these filters</p>
                  <button onClick={() => { setFType("all"); setFStatus("all"); setFAgreement(false); setFRange("all"); }} className="mt-1 text-xs font-semibold text-[#711419]">
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Customer filters — dropdown rows; each opens its own option sheet */}
      <DraggableSheet tall open={filterOpen} onOpenChange={setFilterOpen} title="Filter customers" testid="sheet-customer-filter">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        <div className="mt-2 min-h-[55vh] divide-y divide-slate-200/80 pb-2">
          <SheetSelect
            label="Customer type"
            value={fType}
            onChange={(k) => setFType(k as typeof fType)}
            options={[
              { key: "all", label: "All" },
              { key: "residential", label: "Residential", img: typeResidential },
              { key: "commercial", label: "Commercial", img: typeCommercial },
              { key: "property_manager", label: "Property manager", img: typePropertyManager },
            ]}
            testid="customers-filter-type"
          />
          <SheetSelect
            label="Status"
            value={fStatus}
            onChange={(k) => setFStatus(k as typeof fStatus)}
            options={[
              { key: "all", label: "All" },
              { key: "customer", label: "Customer" },
              { key: "prospect", label: "Prospect" },
            ]}
            testid="customers-filter-status"
          />
          <SheetSelect
            label="Agreements"
            value={fAgreement ? "yes" : "all"}
            onChange={(k) => setFAgreement(k === "yes")}
            options={[
              { key: "all", label: "All customers" },
              { key: "yes", label: "Has an agreement" },
            ]}
            testid="customers-filter-agreement"
          />
          <SheetSelect
            label="Date added"
            value={fRange}
            onChange={(k) => setFRange(k as typeof fRange)}
            options={[
              { key: "all", label: "All time" },
              { key: "30", label: "Last 30 days" },
              { key: "90", label: "Last 90 days" },
              { key: "year", label: "This year" },
              { key: "custom", label: "Custom range" },
            ]}
            testid="customers-filter-range"
          />
          {fRange === "custom" && (
            <div className="grid grid-cols-2 gap-2 py-3">
              <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} data-testid="customers-filter-from" />
              <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} data-testid="customers-filter-to" />
            </div>
          )}
        </div>
      </DraggableSheet>

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
          className={`fixed inset-0 z-50 flex flex-col bg-slate-50 ${
            searchClosing
              ? "animate-out fade-out slide-out-to-bottom-2 duration-200 fill-mode-forwards"
              : "animate-in fade-in slide-in-from-bottom-2 duration-200"
          }`}
          data-testid="customers-search-overlay"
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${searchQuery.trim().length < 2 || results.length === 0 ? "flex flex-col justify-end" : ""}`}
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
            <button
              onClick={closeSearch}
              className="liquid-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 shadow-sm transition-transform active:scale-90"
              aria-label="Close search"
              data-testid="customers-search-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
