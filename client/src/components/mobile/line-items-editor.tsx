import { Plus, X } from "lucide-react";

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
  subtotal,
  total,
  totalsTestPrefix,
}: {
  items: EditableLineItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: "description" | "quantity" | "unitPrice", value: string | number) => void;
  subtotal: number;
  total: number;
  /** "quote" | "invoice" — keeps the existing testids intact. */
  totalsTestPrefix: string;
}) {
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

      <button
        onClick={onAdd}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-600 transition-transform active:scale-[0.99]"
        data-testid="button-add-line-item"
      >
        <Plus className="h-4 w-4" />
        {items.length === 0 ? "Add the first line item" : "Add line item"}
      </button>

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
