import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Check, ChevronRight, ListFilter, Search, X } from "lucide-react";
import MobileShell from "./mobile-shell";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { isNativeApp } from "@/lib/native";
import { useScrollHide } from "@/hooks/use-scroll-hide";

/** Invoices directory — billing across the company: a Filters pill + sheet
 *  over the resting list, and the same floating search pill that opens the
 *  fullscreen bottom-input search overlay. Defaults to CRM-created invoices
 *  (the imported FieldEdge history is behind the Source filter). */

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  total: string | null;
  balanceDue: string | null;
  status: string;
  createdAt: string | null;
};

function formatCurrency(amount: number | string | null | undefined) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

export default function MobileInvoices() {
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

  // Search enters/exits like the Gibbs history search: nothing pops — the
  // results UNFOLD from the top (grid-rows + fade) and fold back away.
  const [searchEntered, setSearchEntered] = useState(false);
  useEffect(() => {
    if (!searchActive) return;
    const raf = requestAnimationFrame(() => setSearchEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [searchActive]);

  const closeSearch = () => {
    searchInputRef.current?.blur();
    setSearchClosing(true);
    setSearchEntered(false);
    setTimeout(() => {
      setSearchActive(false);
      setSearchClosing(false);
      setSearchQuery("");
    }, 340);
  };

  // ── Filters ──
  const [filterOpen, setFilterOpen] = useState(false);
  const [fStatus, setFStatus] = useState<"all" | "draft" | "sent" | "partial" | "paid" | "void">("all");
  const [fSource, setFSource] = useState<"crm" | "imported" | "all">("crm");
  const filtersActive = fStatus !== "all" || fSource !== "crm";

  const listParams = (status: typeof fStatus, source: typeof fSource) => {
    const params = new URLSearchParams({ limit: "50" });
    if (status !== "all") params.set("status", status);
    if (source !== "all") params.set("source", source);
    return params;
  };

  // Resting list — newest 50, shaped by the filters
  const { data: invoicesData, isLoading } = useQuery<{ invoices: InvoiceRow[] }>({
    queryKey: ["/api/crm/invoices", "mobile-list", fStatus, fSource],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices?${listParams(fStatus, fSource).toString()}`, { credentials: "include" });
      if (!res.ok) return { invoices: [] };
      return res.json();
    },
    placeholderData: (prev) => prev,
  });
  const rows = invoicesData?.invoices || [];

  // Search sifts the newest invoices client-side (number, customer) — the
  // list endpoint has no text search, so pull the source-wide set.
  const { data: searchPool } = useQuery<{ invoices: InvoiceRow[] }>({
    queryKey: ["/api/crm/invoices", "mobile-search-pool", fSource],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices?${listParams("all", fSource).toString()}`, { credentials: "include" });
      if (!res.ok) return { invoices: [] };
      return res.json();
    },
    enabled: searchActive,
    placeholderData: (prev) => prev,
  });
  const q = searchQuery.trim().toLowerCase();
  const results = (searchPool?.invoices || []).filter((r) =>
    [r.invoiceNumber, r.customerName].some((v) => (v || "").toLowerCase().includes(q)),
  );

  const invoiceRow = (invoice: InvoiceRow, i: number) => {
    const balance = parseFloat(invoice.balanceDue || "0");
    const showBalance = balance > 0 && invoice.status !== "void" && invoice.status !== "draft";
    return (
      <button
        key={invoice.id}
        onClick={() => navigate(`/mobile/invoices/${invoice.id}`)}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
        data-testid={`invoice-row-${invoice.id}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {invoice.customerName || "Unknown customer"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {[
              invoice.invoiceNumber,
              invoice.createdAt ? format(new Date(invoice.createdAt), "MMM d, yyyy") : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums text-slate-900">
            {formatCurrency(invoice.total)}
          </span>
          {showBalance && (
            <span className="block text-[10px] font-semibold tabular-nums text-amber-600">
              {formatCurrency(balance)} due
            </span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
    );
  };

  return (
    <MobileShell>
      {/* Content scrolling under the top edge fades out instead of clipping */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 bg-gradient-to-b from-slate-50 via-slate-50/85 to-transparent"
        style={{ height: "calc(env(safe-area-inset-top) + 40px)" }}
        aria-hidden
      />
      <div className="space-y-5 p-4 pb-6" data-testid="mobile-invoices-page">
        <h2 className="pt-1 text-2xl font-bold tracking-tight text-slate-900">Invoices</h2>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              onClick={() => setFilterOpen(true)}
              className="relative flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
              aria-label="Filter invoices"
              data-testid="invoices-filter-open"
            >
              <ListFilter className="h-4 w-4" />
              Filters
              {filtersActive && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#711419]" />}
            </button>
            <h3 className="text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
              {fSource === "imported" ? "Imported history" : fSource === "all" ? "All invoices" : "CRM invoices"}
            </h3>
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
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="invoices-results">
              {rows.map((invoice, i) => invoiceRow(invoice, i))}
            </div>
          ) : (
            <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center" data-testid="invoices-empty">
              <p className="text-sm font-medium text-slate-600">No invoices found</p>
              {filtersActive ? (
                <button
                  onClick={() => { setFStatus("all"); setFSource("crm"); }}
                  className="mt-1 text-xs font-semibold text-[#711419]"
                >
                  Clear filters
                </button>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400">Invoices will show here as they&rsquo;re created.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Invoice filters */}
      <DraggableSheet tall open={filterOpen} onOpenChange={setFilterOpen} title="Filter invoices" testid="sheet-invoices-filter">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          {filtersActive && (
            <button
              onClick={() => { setFStatus("all"); setFSource("crm"); }}
              className="text-sm font-semibold text-[#711419]"
              data-testid="invoices-filter-clear"
            >
              Clear all
            </button>
          )}
        </div>
        {/* Already inside a sheet — the options list inline, one tap picks
            (no sheet-in-a-sheet). */}
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
          {([
            { key: "all", label: "All statuses" },
            { key: "draft", label: "Draft" },
            { key: "sent", label: "Sent" },
            { key: "partial", label: "Partially paid" },
            { key: "paid", label: "Paid" },
            { key: "void", label: "Void" },
          ] as const).map((opt, i) => (
            <button
              key={opt.key}
              onClick={() => setFStatus(opt.key)}
              className={`flex w-full items-center justify-between px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
              data-testid={`invoices-filter-status-${opt.key}`}
            >
              <span className={`text-sm ${fStatus === opt.key ? "font-semibold text-slate-900" : "text-slate-700"}`}>{opt.label}</span>
              {fStatus === opt.key && <Check className="h-4 w-4 text-[#711419]" />}
            </button>
          ))}
        </div>
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Source</p>
        <div className="mb-2 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
          {([
            { key: "crm", label: "Created in GHQ" },
            { key: "imported", label: "Imported history" },
            { key: "all", label: "Everything" },
          ] as const).map((opt, i) => (
            <button
              key={opt.key}
              onClick={() => setFSource(opt.key)}
              className={`flex w-full items-center justify-between px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
              data-testid={`invoices-filter-source-${opt.key}`}
            >
              <span className={`text-sm ${fSource === opt.key ? "font-semibold text-slate-900" : "text-slate-700"}`}>{opt.label}</span>
              {fSource === opt.key && <Check className="h-4 w-4 text-[#711419]" />}
            </button>
          ))}
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
          data-testid="invoices-search-pill"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-[16px] text-slate-400">Search invoices</span>
        </button>
      )}

      {/* Fullscreen search — results fill from the top, input docked at the
          bottom riding eased above the keyboard. */}
      {searchActive && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-slate-50"
          style={{
            opacity: searchEntered && !searchClosing ? 1 : 0,
            transition: "opacity 300ms ease",
          }}
          data-testid="invoices-search-overlay"
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${(q.length < 2 ? rows.length === 0 : results.length === 0) ? "flex flex-col justify-end" : ""}`}
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            {/* Same fold the Gibbs history search uses — the content
                unfolds in from the top and folds away on exit. */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: searchEntered && !searchClosing ? "1fr" : "0fr",
                opacity: searchEntered && !searchClosing ? 1 : 0,
                transition: "grid-template-rows 340ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease",
              }}
            >
              <div className="overflow-hidden">
                {q.length < 2 ? (
                  rows.length > 0 ? (
                    <div className="pb-2">
                      <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
                        {rows.map((invoice, i) => invoiceRow(invoice, i))}
                      </div>
                    </div>
                  ) : (
                    <p className="pb-6 text-center text-sm text-slate-400">Type an invoice number or customer name.</p>
                  )
                ) : results.length === 0 ? (
                  <p className="pb-6 text-center text-sm text-slate-400">No invoices match &ldquo;{searchQuery.trim()}&rdquo;.</p>
                ) : (
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm" data-testid="invoices-search-results">
                    {results.map((invoice, i) => invoiceRow(invoice, i))}
                  </div>
                )}
              </div>
            </div>
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
                placeholder="Search invoices"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="invoices-search-input"
              />
            </div>
            <button
              onClick={closeSearch}
              className="liquid-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 shadow-sm transition-transform active:scale-90"
              aria-label="Close search"
              data-testid="invoices-search-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
