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

const isDiscount = (item: { isDiscountLine?: boolean | null; lineType?: string | null; description?: string | null }) =>
  item.isDiscountLine === true || item.lineType === "discount" || (item.description ?? "").startsWith("Discount:");

/** Percentage a discount line's description declares — "(2%)", "(15%)". */
export function parseDiscountPct(description: string | null | undefined): number | null {
  const match = (description || "").match(/\((\d+(?:\.\d+)?)%\)/);
  if (!match) return null;
  const pct = parseFloat(match[1]);
  return !isNaN(pct) && pct > 0 ? pct : null;
}

/** The discount kind of a line, falling back to the description conventions
 *  for legacy lines saved without a discountKind. */
export function inferDiscountKind(
  description: string | null | undefined,
  discountKind: string | null | undefined,
): "promotion" | "maintenance" | "protection" | null {
  if (discountKind === "promotion" || discountKind === "maintenance" || discountKind === "protection") return discountKind;
  const desc = description || "";
  if (desc.includes("Promotional")) return "promotion";
  if (desc.includes("Maintenance")) return "maintenance";
  if (desc.includes("Protection")) return "protection";
  return null;
}

type BasisLine = {
  description?: string | null;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  lineTotal?: string | number | null;
  lineType?: string | null;
  isDiscountLine?: boolean | null;
  optionTag?: string | null;
};

/** What ONE option costs before discounts: its own positive non-discount
 *  lines plus untagged shared lines (charged with every option). Protection
 *  parts discounts additionally exclude the protection bundle itself. Mirrors
 *  the quote-detail client math exactly so amounts agree across surfaces. */
export function optionDiscountBasis(items: BasisLine[], tag: string, excludeProtection: boolean): number {
  return items.reduce((sum, item) => {
    if (isDiscount(item)) return sum;
    if (excludeProtection && item.lineType === "protection") return sum;
    if (item.optionTag && item.optionTag !== tag) return sum;
    const unitPrice = parseFloat(String(item.unitPrice ?? "0")) || 0;
    if (unitPrice <= 0) return sum;
    const lineTotal = item.lineTotal !== undefined && item.lineTotal !== null
      ? parseFloat(String(item.lineTotal)) || 0
      : unitPrice * (parseFloat(String(item.quantity ?? "1")) || 1);
    return sum + lineTotal;
  }, 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A multi-option quote must never carry ONE untagged percentage discount
 *  computed from the sum of all options (a stale client can still send one).
 *  This expands such a line into per-option lines, each at that percentage of
 *  the option's own price. Non-discount, tagged, and flat-amount lines pass
 *  through untouched (a flat shared amount already reads the same per option). */
export function expandSharedPercentDiscountLines<
  T extends BasisLine & { discountKind?: string | null },
>(lineItems: T[], quoteMode: string | null | undefined): T[] {
  if (quoteMode !== "options") return lineItems;
  const tags = Array.from(new Set(lineItems.map((li) => li.optionTag).filter((t): t is string => !!t)));
  if (tags.length === 0) return lineItems;

  const out: T[] = [];
  for (const item of lineItems) {
    const pct = isDiscount(item) && !item.optionTag ? parseDiscountPct(item.description) : null;
    if (!pct) {
      out.push(item);
      continue;
    }
    const kind = inferDiscountKind(item.description, item.discountKind);
    for (const tag of tags) {
      const basis = optionDiscountBasis(lineItems, tag, kind === "protection");
      const amount = round2(basis * (pct / 100));
      if (amount <= 0) continue;
      out.push({
        ...item,
        optionTag: tag,
        quantity: typeof item.quantity === "string" ? "1" : 1,
        unitPrice: typeof item.unitPrice === "string" ? (-amount).toFixed(2) : -amount,
        ...(item.lineTotal !== undefined && item.lineTotal !== null
          ? { lineTotal: typeof item.lineTotal === "string" ? (-amount).toFixed(2) : -amount }
          : {}),
      });
    }
  }
  return out;
}

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

/** Boot-time self-heal: an UNSOLD options quote carrying an untagged
 *  percentage discount line (created before per-option discounts, or by a
 *  stale client) gets it converted into per-option tagged lines — each at
 *  that percentage of the option's own price, never the sum of all options.
 *  Accepted/converted quotes keep their signed lines untouched. Idempotent:
 *  once converted, no untagged percentage lines remain to match. */
export async function migrateSharedPercentDiscountsToPerOption(): Promise<void> {
  try {
    const quotes = await db
      .select({ id: crmQuotes.id, status: crmQuotes.status })
      .from(crmQuotes)
      .where(eq(crmQuotes.quoteMode, "options"));
    let converted = 0;
    for (const q of quotes) {
      if (["accepted", "converted"].includes(q.status || "")) continue;
      const items = await db.select().from(crmQuoteLineItems).where(eq(crmQuoteLineItems.quoteId, q.id));
      const tags = Array.from(new Set(items.map((i) => i.optionTag).filter((t): t is string => !!t)));
      if (tags.length === 0) continue;
      const sharedPctLines = items.filter(
        (i) => isDiscount(i) && !i.optionTag && parseDiscountPct(i.description) !== null,
      );
      if (sharedPctLines.length === 0) continue;

      let changed = false;
      for (const line of sharedPctLines) {
        const pct = parseDiscountPct(line.description)!;
        const kind = inferDiscountKind(line.description, line.discountKind);
        // Mixed state (some option already has this kind tagged): leave the
        // quote for a human rather than risk stacking a second discount.
        const hasTaggedSameKind = items.some(
          (i) => i.optionTag && isDiscount(i) && inferDiscountKind(i.description, i.discountKind) === kind,
        );
        if (hasTaggedSameKind) continue;
        for (const tag of tags) {
          const basis = optionDiscountBasis(items, tag, kind === "protection");
          const amount = Math.round(basis * (pct / 100) * 100) / 100;
          if (amount <= 0) continue;
          await db.insert(crmQuoteLineItems).values({
            quoteId: q.id,
            lineType: "discount",
            description: line.description,
            quantity: "1",
            unitPrice: (-amount).toFixed(2),
            lineTotal: (-amount).toFixed(2),
            sortOrder: line.sortOrder ?? 0,
            optionTag: tag,
            isDiscountLine: true,
            discountKind: kind,
            customerVisible: line.customerVisible ?? true,
          });
        }
        await db.delete(crmQuoteLineItems).where(eq(crmQuoteLineItems.id, line.id));
        converted++;
        changed = true;
      }
      if (changed) await recomputeQuoteStoredTotals(q.id).catch(() => {});
    }
    if (converted > 0) {
      console.log(`[quotes] converted ${converted} shared percentage discount line(s) to per-option lines`);
    }
  } catch (e: any) {
    console.error("[quotes] per-option discount migration failed:", e?.message || e);
  }
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
