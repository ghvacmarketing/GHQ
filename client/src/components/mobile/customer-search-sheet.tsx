import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { useKeyboardInset } from "@/lib/native";
import { customerTypeBadge } from "@/pages/mobile/mobile-quote-new";
import type { CrmCustomer } from "@shared/schema";

/** Customer lookup as a full-height sheet (same architecture as the address
 *  search): keyboard-first, the sheet never moves for the keyboard, results
 *  pad themselves clear, rows wear the metal customer-type badges. Shows the
 *  5 most relevant customers before you type. */
export function CustomerSearchSheet({
  open,
  onOpenChange,
  onSelect,
  title = "Find customer",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: CrmCustomer) => void;
  title?: string;
}) {
  const keyboardInset = useKeyboardInset();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    setQuery("");
    const t = setTimeout(() => setSettled(true), 540);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (settled) inputRef.current?.focus({ preventScroll: true });
  }, [settled]);

  const { data: customers = [], isFetching } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/mobile/customers", "picker", query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      params.set("limit", "10");
      const res = await fetch(`/api/mobile/customers?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
    placeholderData: (prev) => prev,
  });
  const shown = customers.slice(0, query.trim() ? 10 : 5);

  return (
    <DraggableSheet full open={open} onOpenChange={onOpenChange} title={title} testid="customer-search-sheet">
      <div
        className="flex h-full min-h-0 flex-col"
        onPointerDown={(e) => {
          if (e.target !== inputRef.current) e.preventDefault();
        }}
      >
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        <div className="mt-3 flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          {settled ? (
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or phone"
              className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
              data-testid="customer-search-sheet-input"
            />
          ) : (
            <span className="h-full w-full min-w-0 content-center text-[16px] text-slate-400">Name or phone</span>
          )}
          {isFetching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />}
        </div>

        <div
          className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
          style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : 24 }}
        >
          {!query.trim() && shown.length > 0 && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recent customers</p>
          )}
          {shown.length > 0 ? (
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
              {shown.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelect(c);
                    onOpenChange(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                  data-testid={`customer-sheet-row-${c.id}`}
                >
                  <img src={customerTypeBadge(c.customerType)} alt="" className="h-9 w-9 shrink-0 select-none" draggable={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{c.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {[c.phone, c.fullAddress].filter(Boolean).join(" · ") || "No contact info"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          ) : (
            <p className="pt-9 text-center text-sm text-slate-400">
              {query.trim().length >= 2 && !isFetching ? "No customers match that search." : "Start typing a name or phone number."}
            </p>
          )}
        </div>
      </div>
    </DraggableSheet>
  );
}
