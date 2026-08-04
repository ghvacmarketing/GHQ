import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, ListFilter, Plus, Search, X } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { useKeyboardInset } from "@/lib/native";

const categoryLabel = (c: string) =>
  c === "field_edge" ? "FieldEdge" : c.charAt(0).toUpperCase() + c.slice(1);

/** A price-book row offered by the catalog picker. */
export type CatalogPick = { name: string; description?: string | null; rate: number; category?: string | null };

/** Line items for the mobile quote/invoice create flows — the industrial-
 *  minimal take: one hairline container, divided rows, borderless
 *  description with a qty × price = total line under it, running totals
 *  with the maroon figure. Purely presentational; state lives in the page. */

export type EditableLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineType: string;
};

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export function LineItemsEditor({
  items,
  onAdd,
  onRemove,
  onUpdate,
  onAddFromCatalog,
  subtotal,
  total,
  totalsTestPrefix,
}: {
  items: EditableLineItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: "description" | "quantity" | "unitPrice", value: string | number) => void;
  /** When provided, a "Price book" button opens the CRM items catalog and
   *  hands the picked item back as a prefilled line. */
  onAddFromCatalog?: (item: CatalogPick) => void;
  subtotal: number;
  total: number;
  /** "quote" | "invoice" — keeps the existing testids intact. */
  totalsTestPrefix: string;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCat, setCatalogCat] = useState<string>("all");
  const [catalogFilterOpen, setCatalogFilterOpen] = useState(false);
  const keyboardInset = useKeyboardInset();
  const { data: catalogItems = [], isLoading: catalogLoading } = useQuery<
    Array<{ id: string; name: string; description?: string | null; category?: string | null; rate?: string | null; isActive?: boolean | null }>
  >({
    queryKey: ["/api/crm/items", "mobile-picker"],
    queryFn: async () => {
      const res = await fetch("/api/crm/items", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: catalogOpen,
    staleTime: 5 * 60 * 1000,
  });
  const activeItems = catalogItems.filter((it) => it.isActive !== false);
  const catalogCats = Array.from(new Set(activeItems.map((it) => it.category || "").filter(Boolean))).sort();
  const q = catalogSearch.trim().toLowerCase();
  const shownCatalog = activeItems
    .filter((it) => catalogCat === "all" || (it.category || "") === catalogCat)
    .filter((it) => !q || it.name.toLowerCase().includes(q) || (it.description || "").toLowerCase().includes(q))
    .slice(0, 50);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Line items</p>
        {items.length > 0 && (
          <span className="text-[11px] font-semibold tabular-nums text-slate-400">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
          {items.map((item, i) => (
            <div key={item.id} className={`px-3.5 py-3 ${i > 0 ? "border-t border-slate-200/80" : ""}`} data-testid={`line-item-${item.id}`}>
              <div className="flex items-start gap-2">
                <input
                  placeholder="What's the work?"
                  value={item.description}
                  onChange={(e) => onUpdate(item.id, "description", e.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-1 text-[15px] font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                  data-testid={`input-description-${item.id}`}
                />
                <button
                  onClick={() => onRemove(item.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors active:bg-red-50 active:text-red-500"
                  aria-label="Remove line"
                  data-testid={`button-remove-item-${item.id}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(e) => onUpdate(item.id, "quantity", parseInt(e.target.value) || 1)}
                  onFocus={(e) => e.target.select()}
                  className="h-10 w-14 rounded-[4px] border border-slate-300/70 bg-slate-50 text-center text-sm tabular-nums text-slate-900 outline-none focus:border-slate-400"
                  aria-label="Quantity"
                  data-testid={`input-quantity-${item.id}`}
                />
                <span className="text-xs text-slate-400">×</span>
                <div className="relative w-28">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.unitPrice || ""}
                    onChange={(e) => onUpdate(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    className="h-10 w-full rounded-[4px] border border-slate-300/70 bg-slate-50 pl-6 pr-2 text-sm tabular-nums text-slate-900 outline-none focus:border-slate-400"
                    aria-label="Unit price"
                    data-testid={`input-unit-price-${item.id}`}
                  />
                </div>
                <span
                  className={`ml-auto text-[15px] font-semibold tabular-nums ${item.unitPrice ? "text-slate-900" : "text-slate-300"}`}
                  data-testid={`line-total-${item.id}`}
                >
                  {money(item.quantity * item.unitPrice)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onAdd}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-600 transition-transform active:scale-[0.99]"
          data-testid="button-add-line-item"
        >
          <Plus className="h-4 w-4" />
          {items.length === 0 ? "Add the first line item" : "Add line item"}
        </button>
        {onAddFromCatalog && (
          <button
            onClick={() => { setCatalogSearch(""); setCatalogOpen(true); }}
            className="flex h-11 items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-600 transition-transform active:scale-[0.99]"
            data-testid="button-add-from-catalog"
          >
            <BookOpen className="h-4 w-4" />
            Price book
          </button>
        )}
      </div>

      {onAddFromCatalog && (
        <DraggableSheet full open={catalogOpen} onOpenChange={setCatalogOpen} title="Price book" testid="sheet-catalog-picker">
          {/* Full-height like the address sheet: the sheet never moves or
              pads for the keyboard — the list pads itself clear instead, so
              there's no empty white container behind the keys. */}
          <div className="flex h-full min-h-0 flex-col">
            {/* Title left, Filters pill right — the category filter lives in
                its own sheet instead of a pill rail */}
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Price book</h2>
              <button
                onClick={() => setCatalogFilterOpen(true)}
                className="flex h-10 max-w-[55%] items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
                aria-label="Filter by category"
                data-testid="catalog-filter-open"
              >
                <ListFilter className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{catalogCat === "all" ? "Filters" : categoryLabel(catalogCat)}</span>
                {catalogCat !== "all" && <span className="h-2 w-2 shrink-0 rounded-full bg-[#711419]" />}
              </button>
            </div>
            <div className="mt-3 flex h-11 shrink-0 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search items…"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="catalog-search-input"
              />
            </div>

            <div
              className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
              style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : 44 }}
            >
              {catalogLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">Loading the catalog…</p>
              ) : shownCatalog.length > 0 ? (
                <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                  {shownCatalog.map((it, i) => (
                    <button
                      key={it.id}
                      onClick={() => {
                        onAddFromCatalog({ name: it.name, description: it.description, rate: parseFloat(it.rate || "0") || 0, category: it.category });
                        setCatalogOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                      data-testid={`catalog-item-${it.id}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{it.name}</span>
                          {it.category && (
                            <span className="shrink-0 rounded-full border border-slate-300/70 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {categoryLabel(it.category)}
                            </span>
                          )}
                        </span>
                        {it.description && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{it.description}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">{money(parseFloat(it.rate || "0") || 0)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  {q || catalogCat !== "all" ? "No catalog items match." : "The price book is empty."}
                </p>
              )}
            </div>
          </div>

          {/* Category filter — its own nested sheet, checkable rows */}
          <DraggableSheet nested tall open={catalogFilterOpen} onOpenChange={setCatalogFilterOpen} title="Filter by category" testid="catalog-filter-sheet">
            <h2 className="text-lg font-semibold text-slate-900">Category</h2>
            <div className="mb-2 mt-3 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {["all", ...catalogCats].map((c, i) => (
                <button
                  key={c}
                  onClick={() => {
                    setCatalogCat(c);
                    setCatalogFilterOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                  data-testid={`catalog-cat-${c}`}
                >
                  <span className={`min-w-0 flex-1 text-sm ${catalogCat === c ? "font-semibold text-[#711419]" : "text-slate-800"}`}>
                    {c === "all" ? "All categories" : categoryLabel(c)}
                  </span>
                  {catalogCat === c && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                </button>
              ))}
            </div>
          </DraggableSheet>
        </DraggableSheet>
      )}

      <div className="space-y-1.5 border-t border-slate-200/80 pt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-medium tabular-nums text-slate-700" data-testid={`${totalsTestPrefix}-subtotal`}>
            {money(subtotal)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-base font-bold text-slate-900">Total</span>
          <span
            className={`text-xl font-bold tabular-nums ${total >= 0 ? "text-[#711419]" : "text-red-600"}`}
            data-testid={`${totalsTestPrefix}-total`}
          >
            {money(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
