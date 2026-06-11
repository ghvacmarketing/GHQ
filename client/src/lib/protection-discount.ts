// Helpers for auto-applying an Installation Protection Bundle's parts-discount
// percentage to the rest of a quote.

export const PROTECTION_DISCOUNT_KIND = "protection" as const;

// Extracts the parts-discount percentage tied to a Protection bundle.
// Prefers an explicit "X% parts discount" phrase (found in the bundle's
// description), falling back to the tier keyword in the name.
export function getProtectionDiscountPct(
  ...texts: Array<string | null | undefined>
): number | null {
  const combined = texts.filter(Boolean).join(" ");
  if (!combined) return null;

  const explicit = combined.match(/(\d+(?:\.\d+)?)\s*%\s*parts?\s*discount/i);
  if (explicit) {
    const pct = parseFloat(explicit[1]);
    if (!isNaN(pct) && pct > 0) return pct;
  }

  const lower = combined.toLowerCase();
  if (lower.includes("protection")) {
    if (lower.includes("elite")) return 20;
    if (lower.includes("advanced")) return 15;
    if (lower.includes("standard")) return 10;
    if (lower.includes("basic")) return 5;
  }

  return null;
}

// Builds the description shown on the auto-generated discount line. The percentage
// is embedded so it can be recovered later (e.g. when recalculating).
export function protectionDiscountLabel(pct: number): string {
  return `Protection Plan Parts Discount (${pct}%)`;
}

// Reads the percentage back out of an auto-generated discount line description.
export function parseProtectionDiscountLabelPct(
  description: string | null | undefined,
): number | null {
  if (!description) return null;
  const match = description.match(/\((\d+(?:\.\d+)?)%\)/);
  if (!match) return null;
  const pct = parseFloat(match[1]);
  return !isNaN(pct) && pct > 0 ? pct : null;
}
