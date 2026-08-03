import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ChevronRight, Search, X } from "lucide-react";
import MobileShell from "./mobile-shell";
import { Skeleton } from "@/components/ui/skeleton";
import visitService from "@/assets/visit-service.png";
import visitMaintenance from "@/assets/visit-maintenance.png";
import visitSales from "@/assets/visit-sales.png";
import visitInstall from "@/assets/visit-install.png";

/** Work Orders directory — the Customers page's twin for jobs: search every
 *  work order (title or customer), filter by visit type via the metal
 *  badges, tap through to the job detail. */

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
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const debounced = useDebounce(search, 300);

  const { data: rows = [], isLoading } = useQuery<WoRow[]>({
    queryKey: ["/api/mobile/work-orders", debounced, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debounced.trim()) params.set("search", debounced.trim());
      if (typeFilter !== "all") params.set("type", typeFilter);
      params.set("limit", "30");
      const res = await fetch(`/api/mobile/work-orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  return (
    <MobileShell>
      <div className="p-4 space-y-4" style={{ minHeight: "calc(100% + 1px)" }} data-testid="mobile-work-orders-page">
        <h2 className="pt-1 text-2xl font-bold tracking-tight text-slate-900">Work orders</h2>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by job or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-100 pl-9 pr-9 text-[16px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
            data-testid="wo-search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-slate-300 text-white"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Visit-type pills with the metal badges */}
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
          <button
            onClick={() => setTypeFilter("all")}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              typeFilter === "all" ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300/70 bg-white text-slate-600"
            }`}
            data-testid="wo-type-all"
          >
            All
          </button>
          {VISIT_TYPES.map((v) => (
            <button
              key={v.key}
              onClick={() => setTypeFilter(v.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-3 text-xs font-semibold transition-colors ${
                typeFilter === v.key ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300/70 bg-white text-slate-600"
              }`}
              data-testid={`wo-type-${v.key.toLowerCase()}`}
            >
              <img src={v.img} alt="" className="h-6 w-6 select-none" draggable={false} />
              {v.label}
            </button>
          ))}
        </div>

        {/* Results */}
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
            {rows.map((wo, i) => {
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
            })}
          </div>
        ) : (
          <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center" data-testid="wo-empty">
            <p className="text-sm font-medium text-slate-600">No work orders found</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {search.trim() || typeFilter !== "all" ? "Try a different search or filter." : "Jobs will show here as they're created."}
            </p>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
