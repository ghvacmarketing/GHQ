import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ChevronRight, ListFilter, Search, X } from "lucide-react";
import MobileShell from "./mobile-shell";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { SheetSelect } from "@/components/mobile/sheet-select";
import { Skeleton } from "@/components/ui/skeleton";
import { isNativeApp } from "@/lib/native";
import { useScrollHide } from "@/hooks/use-scroll-hide";

/** Quotes directory — the Work Orders page's twin for quotes: a Filters
 *  pill + sheet over the resting list, and the same floating search pill
 *  that opens the fullscreen bottom-input search overlay. */

const STATUS_CHIPS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700" },
  viewed: { label: "Viewed", className: "bg-sky-100 text-sky-700" },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700" },
  expired: { label: "Expired", className: "bg-amber-100 text-amber-700" },
  converted: { label: "Converted", className: "bg-purple-100 text-purple-700" },
};

type QuoteRow = {
  id: string;
  quoteNumber: string;
  customerName: string | null;
  title: string | null;
  total: string | null;
  status: string;
  createdAt: string | null;
};

function formatCurrency(amount: number | string | null | undefined) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

export default function MobileQuotes() {
  const [, navigate] = useLocation();
  const pillHidden = useScrollHide();
  const [searchActive, setSearchActive] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Search overlay keyboard ride (same pattern as Work Orders) ──
  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!searchActive) return;
    const setInset = (px: number) => {
      const el = searchBarRef.current;
      if (el) el.style.paddingBottom = px > 0 ? `${px + 10}px` : "calc(env(safe-area-inset-bottom) + 12px)";
    };
    setInset(0);
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
    searchInputRef.current?.blur();
    setSearchClosing(true);
    setTimeout(() => {
      setSearchActive(false);
      setSearchClosing(false);
      setSearchQuery("");
    }, 190);
  };

  // ── Filters ──
  const [filterOpen, setFilterOpen] = useState(false);
  const [fStatus, setFStatus] = useState<"all" | "draft" | "sent" | "accepted" | "declined" | "expired" | "converted">("all");
  const filtersActive = fStatus !== "all";

  // Resting list — newest 50, shaped by the filters
  const { data: quotesData, isLoading } = useQuery<{ quotes: QuoteRow[] }>({
    queryKey: ["/api/crm/quotes", "mobile-list", fStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (fStatus !== "all") params.set("status", fStatus);
      const res = await fetch(`/api/crm/quotes?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return { quotes: [] };
      return res.json();
    },
    placeholderData: (prev) => prev,
  });
  const rows = quotesData?.quotes || [];

  // Search sifts the newest quotes client-side (number, customer, title) —
  // the list endpoint has no text search, so pull the unfiltered set.
  const { data: searchPool } = useQuery<{ quotes: QuoteRow[] }>({
    queryKey: ["/api/crm/quotes", "mobile-search-pool"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes?limit=50`, { credentials: "include" });
      if (!res.ok) return { quotes: [] };
      return res.json();
    },
    enabled: searchActive,
    placeholderData: (prev) => prev,
  });
  const q = searchQuery.trim().toLowerCase();
  const results = (searchPool?.quotes || []).filter((r) =>
    [r.quoteNumber, r.customerName, r.title].some((v) => (v || "").toLowerCase().includes(q)),
  );

  const quoteRow = (quote: QuoteRow, i: number) => {
    const chip = STATUS_CHIPS[quote.status] || STATUS_CHIPS.draft;
    return (
      <button
        key={quote.id}
        onClick={() => navigate(`/mobile/quotes/${quote.id}`)}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
        data-testid={`quote-row-${quote.id}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {quote.customerName || "Unknown customer"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {[
              quote.title || quote.quoteNumber,
              quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
          {formatCurrency(quote.total)}
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
      <div className="space-y-5 p-4 pb-6" data-testid="mobile-quotes-page">
        <h2 className="pt-1 text-2xl font-bold tracking-tight text-slate-900">Quotes</h2>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              onClick={() => setFilterOpen(true)}
              className="relative flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
              aria-label="Filter quotes"
              data-testid="quotes-filter-open"
            >
              <ListFilter className="h-4 w-4" />
              Filters
              {filtersActive && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#711419]" />}
            </button>
            <h3 className="text-right text-xs font-semibold uppercase tracking-wider text-slate-400">All quotes</h3>
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
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="quotes-results">
              {rows.map((quote, i) => quoteRow(quote, i))}
            </div>
          ) : (
            <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center" data-testid="quotes-empty">
              <p className="text-sm font-medium text-slate-600">No quotes found</p>
              {filtersActive ? (
                <button
                  onClick={() => setFStatus("all")}
                  className="mt-1 text-xs font-semibold text-[#711419]"
                >
                  Clear filters
                </button>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400">Create one from the &ldquo;+&rdquo; button.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quote filters */}
      <DraggableSheet tall open={filterOpen} onOpenChange={setFilterOpen} title="Filter quotes" testid="sheet-quotes-filter">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          {filtersActive && (
            <button
              onClick={() => setFStatus("all")}
              className="text-sm font-semibold text-[#711419]"
              data-testid="quotes-filter-clear"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="mt-2 min-h-[40vh] divide-y divide-slate-200/80 pb-2">
          <SheetSelect
            label="Status"
            value={fStatus}
            onChange={(k) => setFStatus(k as typeof fStatus)}
            options={[
              { key: "all", label: "All" },
              { key: "draft", label: "Draft" },
              { key: "sent", label: "Sent" },
              { key: "accepted", label: "Accepted" },
              { key: "declined", label: "Declined" },
              { key: "expired", label: "Expired" },
              { key: "converted", label: "Converted" },
            ]}
            testid="quotes-filter-status"
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
            transition: "transform 380ms cubic-bezier(0.34,1.2,0.64,1), opacity 380ms cubic-bezier(0.34,1.2,0.64,1)",
          }}
          data-testid="quotes-search-pill"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-[16px] text-slate-400">Search quotes</span>
        </button>
      )}

      {/* Fullscreen search — results fill from the top, input docked at the
          bottom riding eased above the keyboard. */}
      {searchActive && (
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-slate-50 ${
            searchClosing
              ? "animate-out fade-out slide-out-to-bottom-2 duration-200 fill-mode-forwards"
              : "animate-in fade-in slide-in-from-bottom-2 duration-200"
          }`}
          data-testid="quotes-search-overlay"
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${(q.length < 2 ? rows.length === 0 : results.length === 0) ? "flex flex-col justify-end" : ""}`}
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            {q.length < 2 ? (
              rows.length > 0 ? (
                <div className="pb-2">
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
                    {rows.slice(0, 5).map((quote, i) => quoteRow(quote, i))}
                  </div>
                </div>
              ) : (
                <p className="pb-6 text-center text-sm text-slate-400">Type a quote number, customer, or title.</p>
              )
            ) : results.length === 0 ? (
              <p className="pb-6 text-center text-sm text-slate-400">No quotes match &ldquo;{searchQuery.trim()}&rdquo;.</p>
            ) : (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm" data-testid="quotes-search-results">
                {results.map((quote, i) => quoteRow(quote, i))}
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
                placeholder="Search quotes"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="quotes-search-input"
              />
            </div>
            <button
              onClick={closeSearch}
              className="liquid-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 shadow-sm transition-transform active:scale-90"
              aria-label="Close search"
              data-testid="quotes-search-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
