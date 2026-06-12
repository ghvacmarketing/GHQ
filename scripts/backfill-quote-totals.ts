import { db } from "../server/db";
import { crmQuotes, crmQuoteLineItems } from "../shared/schema";
import { eq } from "drizzle-orm";

async function recomputeQuoteStoredTotals(quoteId: string): Promise<{ subtotal: string; total: string } | null> {
  const items = await db.select().from(crmQuoteLineItems)
    .where(eq(crmQuoteLineItems.quoteId, quoteId));

  // Guard: quotes with no structured line items (e.g. older AI/text-only
  // quotes) store their amount solely in crmQuotes.total. Recomputing from
  // an empty line-item set would zero them out, so skip them entirely.
  if (items.length === 0) {
    return null;
  }

  let subtotal = 0;
  let total = 0;
  for (const item of items) {
    const lineTotal = parseFloat(String(item.lineTotal ?? "0")) || 0;
    total += lineTotal;
    const isDiscount = item.isDiscountLine === true
      || item.lineType === "discount"
      || (item.description ?? "").startsWith("Discount:");
    if (!isDiscount) {
      subtotal += lineTotal;
    }
  }

  const subtotalStr = subtotal.toFixed(2);
  const totalStr = total.toFixed(2);

  await db.update(crmQuotes)
    .set({ subtotal: subtotalStr, total: totalStr, updatedAt: new Date() })
    .where(eq(crmQuotes.id, quoteId));

  return { subtotal: subtotalStr, total: totalStr };
}

async function main() {
  console.log("Starting one-time backfill of quote stored totals...");

  const quotes = await db.select({
    id: crmQuotes.id,
    subtotal: crmQuotes.subtotal,
    total: crmQuotes.total,
  }).from(crmQuotes);

  console.log(`Found ${quotes.length} quotes to process.`);

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const quote of quotes) {
    const oldSubtotal = quote.subtotal == null ? null : Number(quote.subtotal).toFixed(2);
    const oldTotal = quote.total == null ? null : Number(quote.total).toFixed(2);

    const result = await recomputeQuoteStoredTotals(quote.id);
    if (result === null) {
      skipped++;
      continue;
    }
    const { subtotal, total } = result;

    if (oldSubtotal !== subtotal || oldTotal !== total) {
      changed++;
      console.log(
        `Quote ${quote.id}: subtotal ${oldSubtotal ?? "null"} -> ${subtotal}, total ${oldTotal ?? "null"} -> ${total}`,
      );
    } else {
      unchanged++;
    }
  }

  console.log(
    `\nBackfill complete. Updated: ${changed}, unchanged: ${unchanged}, skipped (no line items): ${skipped}, total: ${quotes.length}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
