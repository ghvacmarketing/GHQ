import { db } from "../db";
import { crmQuotes, crmQuoteLineItems } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Option-aware stored quote totals.
 *
 *  Single-mode quotes: total = sum of ALL line totals (discount lines carry
 *  negative totals so they net out); subtotal = sum of non-discount lines.
 *
 *  Multi-option ("options" mode) quotes carry EVERY option's line items, so a
 *  plain sum triple-counts. The stored total must reflect what the quote is
 *  worth to the pipeline:
 *    - while unsold: shared (untagged) items + the HIGHEST-priced option —
 *      the best-case sale
 *    - once sold (accepted/converted with a selectedOption): shared items +
 *      the option the customer actually chose
 *  Every aggregation downstream (dashboard analytics, sales performance,
 *  my-performance, reports) reads crmQuotes.total, so keeping this field
 *  honest fixes them all at once.
 */

const isDiscount = (item: { isDiscountLine: boolean | null; lineType: string | null; description: string | null }) =>
  item.isDiscountLine === true || item.lineType === "discount" || (item.description ?? "").startsWith("Discount:");

export function computeQuoteTotals(
  quote: { quoteMode: string | null; selectedOption: string | null; status: string | null },
  allItems: Array<{
    lineTotal: string | null;
    optionTag: string | null;
    isDiscountLine: boolean | null;
    lineType: string | null;
    description: string | null;
    customerVisible?: boolean | null;
  }>,
): { subtotal: number; total: number } | null {
  // Totals are the CUSTOMER's price — internal cost lines (worksheet
  // build-up, labor, warranty reserve) never count. A custom quote whose
  // lines are ALL internal keeps its stored sell price (return null = don't
  // touch the stored totals).
  const items = allItems.filter(
    (i) => i.customerVisible === true || (i.customerVisible !== false && i.lineType !== "labor" && i.lineType !== "other"),
  );
  if (items.length === 0) return null;
  let basis = items;
  if (quote.quoteMode === "options") {
    const shared = items.filter((i) => !i.optionTag);
    const byOption = new Map<string, typeof items>();
    for (const i of items) {
      if (!i.optionTag) continue;
      const list = byOption.get(i.optionTag) || [];
      list.push(i);
      byOption.set(i.optionTag, list);
    }
    if (byOption.size > 0) {
      const optionTotal = (list: typeof items) =>
        list.reduce((s, i) => s + (parseFloat(String(i.lineTotal ?? "0")) || 0), 0);
      const sold = ["accepted", "converted"].includes(quote.status || "");
      let chosen: typeof items | null = null;
      if (sold && quote.selectedOption && byOption.has(quote.selectedOption)) {
        chosen = byOption.get(quote.selectedOption)!;
      } else {
        // Highest potential sale — the best option
        for (const list of Array.from(byOption.values())) {
          if (!chosen || optionTotal(list) > optionTotal(chosen)) chosen = list;
        }
      }
      basis = [...shared, ...(chosen || [])];
    }
  }
  let subtotal = 0;
  let total = 0;
  for (const item of basis) {
    const lineTotal = parseFloat(String(item.lineTotal ?? "0")) || 0;
    total += lineTotal;
    if (!isDiscount(item)) subtotal += lineTotal;
  }
  return { subtotal, total };
}

/** Recompute and persist a quote's stored subtotal/total from its line items. */
export async function recomputeQuoteStoredTotals(quoteId: string): Promise<void> {
  const [quote] = await db
    .select({ quoteMode: crmQuotes.quoteMode, selectedOption: crmQuotes.selectedOption, status: crmQuotes.status, quoteType: crmQuotes.quoteType })
    .from(crmQuotes)
    .where(eq(crmQuotes.id, quoteId));
  if (!quote) return;
  // Custom (worksheet) quotes: the stored total IS the sell price set by the
  // worksheet — line items are cost build-up and must never overwrite it,
  // even when some lines are promoted to the customer view.
  if (quote.quoteType === "custom_install" || quote.quoteType === "custom_service") return;
  const items = await db.select().from(crmQuoteLineItems).where(eq(crmQuoteLineItems.quoteId, quoteId));
  const computed = computeQuoteTotals(quote, items);
  if (!computed) return; // all-internal quote — the stored sell price stands
  await db
    .update(crmQuotes)
    .set({ subtotal: computed.subtotal.toFixed(2), total: computed.total.toFixed(2), updatedAt: new Date() })
    .where(eq(crmQuotes.id, quoteId));
}

/** Boot-time self-heal: legacy options quotes stored the SUM of all options
 *  as their total. Recompute every options-mode quote with the rule above —
 *  deterministic and idempotent, so running it each boot is safe. */
export async function recomputeAllOptionsQuoteTotals(): Promise<void> {
  try {
    const rows = await db
      .select({ id: crmQuotes.id })
      .from(crmQuotes)
      .where(eq(crmQuotes.quoteMode, "options"));
    for (const r of rows) {
      await recomputeQuoteStoredTotals(r.id).catch(() => {});
    }
    if (rows.length > 0) console.log(`[quotes] option-aware totals verified for ${rows.length} multi-option quote(s)`);
  } catch (e: any) {
    console.error("[quotes] options-total backfill failed:", e?.message || e);
  }
}
