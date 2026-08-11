// The shop's primary GreenSky financing program: 12.99% APR for 120 months.
// Monthly payment is standard amortization — P × r / (1 − (1+r)^−n) with
// r = APR/12 — which works out to a factor of ≈0.014925 of the financed
// amount (~$14.92 per $1,000). The old hardcoded "÷ 67" rule of thumb was
// this exact plan. Every quote, proposal, and package screen imports from
// here: when the program changes, change the two constants and every
// surface follows.
export const FINANCING_APR = 0.1299;
export const FINANCING_TERM_MONTHS = 120;

const monthlyRate = FINANCING_APR / 12;
export const FINANCING_FACTOR =
  monthlyRate / (1 - Math.pow(1 + monthlyRate, -FINANCING_TERM_MONTHS));

export const FINANCING_LABEL = `${(FINANCING_APR * 100).toFixed(2)}% APR · ${FINANCING_TERM_MONTHS} mo`;

/** Estimated monthly payment in whole dollars from a dollar amount
 *  (accepts "$12,405.28"-style strings). 0 for anything non-positive. */
export function monthlyFinancing(value: string | number | null | undefined): number {
  const num = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value ?? 0;
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * FINANCING_FACTOR);
}
