import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { ChevronRight, ListFilter, Search, X } from "lucide-react";
import MobileShell from "./mobile-shell";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { SheetSelect } from "@/components/mobile/sheet-select";
import { Skeleton } from "@/components/ui/skeleton";
import { isNativeApp } from "@/lib/native";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { getLocalStartOfDay, getLocalEndOfDay } from "@/lib/timezone";
import visitService from "@/assets/visit-service.png";
import visitMaintenance from "@/assets/visit-maintenance.png";
import visitSales from "@/assets/visit-sales.png";
import visitInstall from "@/assets/visit-install.png";

/** Work Orders directory — the Customers page's twin for jobs: a Filters
 *  pill + sheet over the resting list, and the same floating search pill
 *  that opens the fullscreen bottom-input search overlay. */

const VISIT_TYPES: Array<{ key: string; label: string; img: string }> = [
  { key: "SERVICE", label: "Service", img: visitService },
  { key: "MAINTENANCE", label: "Maintenance", img: visitMaintenance },
  { key: "INSTALL", label: "Install", img: visitInstall },
  { key: "SALES", label: "Sales", img: visitSales },
];
export const visitTypeBadge = (t?: string | null): string =>
  VISIT_TYPES.find((v) => v.key === (t || "").toUpperCase())?.img || visitService;

const STATUS_CHIPS: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-600" },
  dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700" },
  en_route: { label: "Traveling", className: "bg-amber-100 text-amber-700" },
  on_site: { label: "Working", className: "bg-green-100 text-green-700" },
  completed: { label: "Completed", className: "bg-slate-100 text-slate-500" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
};

type WoRow = {
  id: string;
  title: string | null;
  status: string;
  visitType: string | null;
  workSubtype: string | null;
  scheduledStart: string | null;
  customerName: string | null;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MobileWorkOrders() {
  const [, navigate] = useLocation();
  // Uber-style: the floating search pill ducks away on scroll-down
  const pillHidden = useScrollHide();
  const [searchActive, setSearchActive] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // ── Search overlay keyboard ride (same pattern as Customers, eased) ──
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

  // ── Filters (same sheet pattern as Customers) ──
  const [filterOpen, setFilterOpen] = useState(false);
  const [fType, setFType] = useState<"all" | "SERVICE" | "MAINTENANCE" | "INSTALL" | "SALES">("all");
  const [fStatus, setFStatus] = useState<"all" | "scheduled" | "dispatched" | "en_route" | "on_site" | "completed" | "cancelled">("all");
  const [fWhen, setFWhen] = useState<"all" | "today" | "week" | "30">("all");
  const filtersActive = fType !== "all" || fStatus !== "all" || fWhen !== "all";
  const now = new Date();
  const schedFrom =
    fWhen === "today" ? getLocalStartOfDay(now).toISOString()
    : fWhen === "week" ? getLocalStartOfDay(startOfWeek(now, { weekStartsOn: 1 })).toISOString()
    : fWhen === "30" ? getLocalStartOfDay(new Date(Date.now() - 30 * 864e5)).toISOString()
    : "";
  const schedTo =
    fWhen === "today" ? getLocalEndOfDay(now).toISOString()
    : fWhen === "week" ? getLocalEndOfDay(endOfWeek(now, { weekStartsOn: 1 })).toISOString()
    : fWhen === "30" ? getLocalEndOfDay(now).toISOString()
    : "";

  // Resting list — every work order, newest first, shaped by the filters
  const { data: rows = [], isLoading } = useQuery<WoRow[]>({
    queryKey: ["/api/mobile/work-orders", "mobile-all", fType, fStatus, fWhen],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "30" });
      if (fType !== "all") params.set("type", fType);
      if (fStatus !== "all") params.set("status", fStatus);
      if (schedFrom) params.set("from", schedFrom);
      if (schedTo) params.set("to", schedTo);
      const res = await fetch(`/api/mobile/work-orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  // Search results — only while the overlay is up; searches EVERYTHING
  // (filters don't apply here), previous results stay while the next loads.
  const { data: results = [] } = useQuery<WoRow[]>({
    queryKey: ["/api/mobile/work-orders", "search", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch.trim(), limit: "20" });
      const res = await fetch(`/api/mobile/work-orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchActive && debouncedSearch.trim().length >= 2,
    placeholderData: (prev) => prev,
  });

  const woRow = (wo: WoRow, i: number) => {
    const chip = STATUS_CHIPS[wo.status] || STATUS_CHIPS.scheduled;
    return (
      <button
        key={wo.id}
        onClick={() => navigate(`/mobile/job/${wo.id}`)}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
        data-testid={`wo-row-${wo.id}`}
      >
        <img src={visitTypeBadge(wo.visitType)} alt="" className="h-9 w-9 shrink-0 select-none" draggable={false} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {wo.customerName || "Unknown customer"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {[
              wo.title || wo.workSubtype || "Work order",
              wo.scheduledStart ? format(new Date(wo.scheduledStart), "MMM d, yyyy") : "Unscheduled",
            ].join(" · ")}
          </span>
        </span>
        <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chip.className}`}>
          {chip.label}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
    );
  };

  return (
    <MobileShell>
      <div className="space-y-5 p-4 pb-6" data-testid="mobile-work-orders-page">
        <h2 className="pt-1 text-2xl font-bold tracking-tight text-slate-900">Work orders</h2>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              onClick={() => setFilterOpen(true)}
              className="relative flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
              aria-label="Filter work orders"
              data-testid="wo-filter-open"
            >
              <ListFilter className="h-4 w-4" />
              Filters
              {filtersActive && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#711419]" />}
            </button>
            <h3 className="text-right text-xs font-semibold uppercase tracking-wider text-slate-400">All work orders</h3>
          </div>

          {isLoading ? (
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              ))}
            </div>
          ) : rows.length > 0 ? (
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="wo-results">
              {rows.map((wo, i) => woRow(wo, i))}
            </div>
          ) : (
            <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center" data-testid="wo-empty">
              <p className="text-sm font-medium text-slate-600">No work orders found</p>
              {filtersActive ? (
                <button
                  onClick={() => { setFType("all"); setFStatus("all"); setFWhen("all"); }}
                  className="mt-1 text-xs font-semibold text-[#711419]"
                >
                  Clear filters
                </button>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400">Jobs will show here as they&rsquo;re created.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Work-order filters — dropdown rows; each opens its own option sheet */}
      <DraggableSheet tall open={filterOpen} onOpenChange={setFilterOpen} title="Filter work orders" testid="sheet-wo-filter">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          {filtersActive && (
            <button
              onClick={() => { setFType("all"); setFStatus("all"); setFWhen("all"); }}
              className="text-sm font-semibold text-[#711419]"
              data-testid="wo-filter-clear"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="mt-2 min-h-[55vh] divide-y divide-slate-200/80 pb-2">
          <SheetSelect
            label="Visit type"
            value={fType}
            onChange={(k) => setFType(k as typeof fType)}
            options={[
              { key: "all", label: "All" },
              ...VISIT_TYPES.map((v) => ({ key: v.key, label: v.label, img: v.img })),
            ]}
            testid="wo-filter-type"
          />
          <SheetSelect
            label="Status"
            value={fStatus}
            onChange={(k) => setFStatus(k as typeof fStatus)}
            options={[
              { key: "all", label: "All" },
              { key: "scheduled", label: "Scheduled" },
              { key: "dispatched", label: "Dispatched" },
              { key: "en_route", label: "Traveling" },
              { key: "on_site", label: "Working" },
              { key: "completed", label: "Completed" },
              { key: "cancelled", label: "Cancelled" },
            ]}
            testid="wo-filter-status"
          />
          <SheetSelect
            label="Scheduled"
            value={fWhen}
            onChange={(k) => setFWhen(k as typeof fWhen)}
            options={[
              { key: "all", label: "All time" },
              { key: "today", label: "Today" },
              { key: "week", label: "This week" },
              { key: "30", label: "Last 30 days" },
            ]}
            testid="wo-filter-when"
          />
        </div>
      </DraggableSheet>

      {/* Floating search pill — sits above the nav, left of the "+" */}
      {!searchActive && (
        <button
          onClick={() => setSearchActive(true)}
          className={`fixed left-4 right-[84px] z-40 flex h-12 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-lg ${pillHidden ? "pointer-events-none translate-y-24 opacity-0" : "translate-y-0 opacity-100"}`}
          style={{
            bottom: "calc(84px + env(safe-area-inset-bottom))",
            // Inline (not a Tailwind arbitrary class — those get skipped as
            // "ambiguous" and the pill popped with no animation): springy
            // overshoot ride down/up.
            transition: "transform 380ms cubic-bezier(0.34,1.2,0.64,1), opacity 380ms cubic-bezier(0.34,1.2,0.64,1)",
          }}
          data-testid="wo-search-pill"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-[16px] text-slate-400">Search work orders</span>
        </button>
      )}

      {/* Fullscreen search — results fill from the top, input docked at the
          bottom riding eased above the keyboard (same feel as Customers). */}
      {searchActive && (
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-slate-50 ${
            searchClosing
              ? "animate-out fade-out slide-out-to-bottom-2 duration-200 fill-mode-forwards"
              : "animate-in fade-in slide-in-from-bottom-2 duration-200"
          }`}
          data-testid="wo-search-overlay"
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${searchQuery.trim().length < 2 || results.length === 0 ? "flex flex-col justify-end" : ""}`}
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            {searchQuery.trim().length < 2 ? (
              rows.length > 0 ? (
                <div className="pb-2">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Recent</h3>
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
                    {rows.slice(0, 5).map((wo, i) => woRow(wo, i))}
                  </div>
                </div>
              ) : (
                <p className="pb-6 text-center text-sm text-slate-400">Type a job title or customer name.</p>
              )
            ) : results.length === 0 ? (
              <p className="pb-6 text-center text-sm text-slate-400">No work orders match &ldquo;{searchQuery.trim()}&rdquo;.</p>
            ) : (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm" data-testid="wo-search-results">
                {results.map((wo, i) => woRow(wo, i))}
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
                placeholder="Search work orders"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="wo-search-input"
              />
            </div>
            <button
              onClick={closeSearch}
              className="liquid-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 shadow-sm transition-transform active:scale-90"
              aria-label="Close search"
              data-testid="wo-search-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
