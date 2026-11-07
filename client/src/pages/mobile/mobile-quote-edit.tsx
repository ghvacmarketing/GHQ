import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, useSearch } from "wouter";
import { Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRequireCrmAuth } from "@/hooks/use-require-crm-auth";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import { LineItemsEditor, type CatalogPick } from "@/components/mobile/line-items-editor";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

/** Edit a quick quote on mobile — the same line-items editor the create flow
 *  uses, prefilled from the saved quote. Saving diffs against the original
 *  lines and replays the change through the per-line endpoints (add / update /
 *  delete), so totals recompute server-side exactly like desktop edits.
 *  Accepted/converted quotes are locked (the server refuses them anyway). */

type QuoteWithLineItems = Omit<CrmQuote, "lineItems"> & { lineItems?: CrmQuoteLineItem[] };

type EditRow = {
  id: string; // original line id, or "new-…" for added rows
  description: string;
  quantity: number;
  unitPrice: number;
  lineType: string;
  optional?: boolean;
};

const EDITABLE_STATUSES = ["draft", "sent", "viewed"];

const isDiscountLine = (li: CrmQuoteLineItem) =>
  li.isDiscountLine === true || li.lineType === "discount" || (li.description || "").startsWith("Discount:");

// Internal cost lines (worksheet build-up) never show on mobile editing —
// quick quotes don't carry them, but stay safe.
const isInternalLine = (li: CrmQuoteLineItem) =>
  (li as any).customerVisible === false ||
  ((li as any).customerVisible !== true && (li.lineType === "labor" || li.lineType === "other"));

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

const toRow = (li: CrmQuoteLineItem): EditRow => ({
  id: li.id,
  description: li.description || "",
  quantity: parseFloat(String(li.quantity ?? "1")) || 1,
  unitPrice: parseFloat(String(li.unitPrice ?? "0")) || 0,
  lineType: li.lineType || "service",
  optional: (li as any).isOptional === true,
});

export default function MobileQuoteEdit() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const currentUser = useRequireCrmAuth();

  // Opened from a job-linked detail page — keep the ?job= thread so Back
  // from the detail page still returns to that job afterwards.
  const fromJobId = new URLSearchParams(useSearch()).get("job");
  const detailPath = `/mobile/quotes/${id}${fromJobId ? `?job=${fromJobId}` : ""}`;

  const { data: quote, isLoading } = useQuery<QuoteWithLineItems>({
    queryKey: ["/api/crm/quotes", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!id,
  });

  // The editable snapshot. Discount lines pass through UNTOUCHED (they're
  // managed from desktop's Discounts dialog) but still count in the totals.
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<EditRow[]>([]);
  const [initial, setInitial] = useState<{ title: string; rows: EditRow[] } | null>(null);

  useEffect(() => {
    if (!quote || initial) return;
    const editable = (quote.lineItems || [])
      .filter((li) => !isInternalLine(li) && !isDiscountLine(li))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(toRow);
    setTitle(quote.title || "");
    setRows(editable);
    setInitial({ title: quote.title || "", rows: editable });
  }, [quote, initial]);

  const discountLines = useMemo(
    () => (quote?.lineItems || []).filter((li) => !isInternalLine(li) && isDiscountLine(li)),
    [quote?.lineItems],
  );
  const discountTotal = discountLines.reduce((s, li) => s + (parseFloat(String(li.lineTotal ?? "0")) || 0), 0);

  const subtotal = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
  const total = subtotal + discountTotal; // discount lineTotals are negative

  const dirty = !!initial && (title !== initial.title || JSON.stringify(rows) !== JSON.stringify(initial.rows));

  // Techs can edit lines but not the quote record itself (title) — the
  // server's quote PATCH is sales-or-above. Hide the field instead of
  // failing the save.
  const canEditTitle = !!currentUser && currentUser.role !== "tech";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const orig = initial!.rows;
      const byId = new Map(orig.map((r) => [r.id, r]));
      const surviving = new Set(rows.filter((r) => !r.id.startsWith("new-")).map((r) => r.id));

      // 1) Deleted originals
      for (const r of orig) {
        if (!surviving.has(r.id)) {
          await apiRequest("DELETE", `/api/crm/quotes/${id}/line-items/${r.id}`);
        }
      }
      // 2) Changed originals + 3) new rows — in editor order so sortOrder
      // lands matching what's on screen.
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const lineTotal = (r.quantity * r.unitPrice).toFixed(2);
        if (r.id.startsWith("new-")) {
          await apiRequest("POST", `/api/crm/quotes/${id}/line-items`, {
            description: r.description.trim(),
            quantity: r.quantity.toFixed(2),
            unitPrice: r.unitPrice.toFixed(2),
            lineTotal,
            lineType: r.lineType,
            sortOrder: i,
            isOptional: r.optional ?? false,
          });
        } else {
          const was = byId.get(r.id)!;
          const changed =
            was.description !== r.description ||
            was.quantity !== r.quantity ||
            was.unitPrice !== r.unitPrice ||
            (was.optional ?? false) !== (r.optional ?? false) ||
            orig.indexOf(was) !== i;
          if (changed) {
            await apiRequest("PATCH", `/api/crm/quotes/${id}/line-items/${r.id}`, {
              description: r.description.trim(),
              quantity: r.quantity.toFixed(2),
              unitPrice: r.unitPrice.toFixed(2),
              lineTotal,
              sortOrder: i,
              isOptional: r.optional ?? false,
            });
          }
        }
      }
      // 4) Title — only when changed and the role allows it.
      if (canEditTitle && title.trim() !== initial!.title) {
        await apiRequest("PATCH", `/api/crm/quotes/${id}`, { title: title.trim() });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      toast({ title: "Quote updated" });
      navigate(detailPath);
    },
    onError: (e: any) => {
      // Some line ops may already be saved — refetch so the editor reopens on
      // the true saved state rather than a half-applied local copy.
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      toast({ title: "Couldn't save all changes", description: e?.message || "Try again.", variant: "destructive" });
    },
  });

  const addRow = () =>
    setRows((prev) => [...prev, { id: `new-${Date.now()}`, description: "", quantity: 1, unitPrice: 0, lineType: "service" }]);
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.id !== rowId));
  const updateRow = (rowId: string, field: "description" | "quantity" | "unitPrice", value: string | number) =>
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
  const addFromCatalog = (item: CatalogPick) => {
    const cat = (item.category || "").toLowerCase();
    const lineType = cat === "service" ? "service" : cat === "maintenance" ? "maintenance" : "part";
    setRows((prev) => [...prev, { id: `new-${Date.now()}`, description: item.name, quantity: 1, unitPrice: item.rate, lineType }]);
  };

  const validRows = rows.filter((r) => r.description.trim() && r.unitPrice !== 0);
  const canSave = dirty && validRows.length === rows.length && rows.length > 0 && !saveMutation.isPending;

  const editable = !!quote && quote.quoteType === "quick" && EDITABLE_STATUSES.includes(quote.status);

  return (
    <MobileCreatePage
      title="Edit quote"
      dirty={dirty}
      exitTo={detailPath}
      onSave={editable ? () => saveMutation.mutate() : undefined}
      saveLabel="Save changes"
      saveDisabled={!canSave}
      saving={saveMutation.isPending}
      testid="mobile-quote-edit-page"
    >
      {isLoading || (!quote && !initial) ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !quote ? (
        <div className="rounded-[4px] border border-slate-300/70 bg-white py-10 text-center">
          <p className="text-sm text-red-500">Failed to load the quote.</p>
        </div>
      ) : !editable ? (
        <div className="rounded-[4px] border border-slate-300/70 bg-white px-4 py-8 text-center" data-testid="quote-not-editable">
          <p className="text-sm font-medium text-slate-700">
            {quote.quoteType !== "quick"
              ? "Only quick quotes can be edited on mobile — use the desktop CRM for this one."
              : "This quote can no longer be edited" + (quote.status === "accepted" || quote.status === "converted" ? " — the customer already approved it." : ".")}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div
            className="rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.05] px-4 py-3"
            data-testid="editing-quote-banner"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#711419]/70">Editing</p>
            <p className="truncate font-semibold text-slate-900">{quote.quoteNumber} · {quote.customerName}</p>
          </div>

          {canEditTitle ? (
            <div>
              <Label htmlFor="edit-quote-title" className="mb-1.5 block">Quote title</Label>
              <Input
                id="edit-quote-title"
                placeholder="e.g., AC Repair Quote"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                data-testid="input-edit-quote-title"
              />
            </div>
          ) : title ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quote title</p>
              <p className="mt-1 text-[15px] font-medium text-slate-900">{title}</p>
            </div>
          ) : null}

          <LineItemsEditor
            items={rows}
            onAdd={addRow}
            onRemove={removeRow}
            onUpdate={updateRow}
            onAddFromCatalog={addFromCatalog}
            onToggleOptional={(rowId, optional) =>
              setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, optional } : r)))
            }
            subtotal={subtotal}
            total={total}
            totalsTestPrefix="quote-edit"
          />

          {/* Discounts ride along untouched — shown so the total adds up */}
          {discountLines.length > 0 && (
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="edit-discount-lines">
              <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Discounts (managed on desktop)
              </p>
              {discountLines.map((li, i) => (
                <div key={li.id} className={`flex items-center gap-2 px-3.5 py-2.5 ${i > 0 ? "border-t border-slate-200/80" : ""}`}>
                  <Tag className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-700">{li.description}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">
                    {money(parseFloat(String(li.lineTotal ?? "0")) || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </MobileCreatePage>
  );
}
