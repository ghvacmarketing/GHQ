// Payment-method processing fees shown on quotes/proposals so the customer can
// see what each method costs. DISPLAY ONLY — these are not added to the actual
// Stripe charge (Stripe deducts its fee from us). Defaults are Stripe's
// standard US rates; adjust here if your negotiated rates differ.

export interface PaymentFeeConfig {
  cardPercent: number; // % of amount
  cardFixed: number;   // flat $ per transaction
  achPercent: number;  // % of amount
  achCapUsd: number;   // ACH fee capped at this many dollars
}

export const PAYMENT_FEE_DEFAULTS: PaymentFeeConfig = {
  cardPercent: 2.9,
  cardFixed: 0.3,
  achPercent: 0.8,
  achCapUsd: 5,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Credit/debit card processing fee for an amount. */
export function cardFee(amount: number, cfg: PaymentFeeConfig = PAYMENT_FEE_DEFAULTS): number {
  if (!(amount > 0)) return 0;
  return round2(amount * (cfg.cardPercent / 100) + cfg.cardFixed);
}

/** ACH bank-transfer fee for an amount (capped). */
export function achFee(amount: number, cfg: PaymentFeeConfig = PAYMENT_FEE_DEFAULTS): number {
  if (!(amount > 0)) return 0;
  return round2(Math.min(amount * (cfg.achPercent / 100), cfg.achCapUsd));
}

/** Short human labels for the fee structure, e.g. "2.9% + $0.30". */
export function cardFeeLabel(cfg: PaymentFeeConfig = PAYMENT_FEE_DEFAULTS): string {
  return `${cfg.cardPercent}% + $${cfg.cardFixed.toFixed(2)}`;
}
export function achFeeLabel(cfg: PaymentFeeConfig = PAYMENT_FEE_DEFAULTS): string {
  return `${cfg.achPercent}%, max $${cfg.achCapUsd}`;
}

// ── Surcharge (actually added to the customer's charge) ──
// Percentage-only surcharge added to the price when the customer pays by that
// method, so the fee is passed to them. Shared by the quote view (display) and
// the payment-link backend (charge) so both compute the same amount.
export type PaymentMethod = "card" | "ach";
// Company policy (2026-08): cards carry a 3% convenience fee; ACH/bank
// transfer is FREE on purpose — the visible difference steers customers to
// the rail that costs us ~nothing (0.8% capped at $5) instead of 2.9%.
export const SURCHARGE = {
  cardPercent: 3,
  achPercent: 0,
  achCapUsd: 0,
} as const;

/** Surcharge dollars added to `amount` for the chosen method. */
export function surchargeFor(method: PaymentMethod, amount: number): number {
  if (!(amount > 0)) return 0;
  if (method === "ach") {
    if (SURCHARGE.achPercent <= 0) return 0;
    return round2(Math.min(amount * (SURCHARGE.achPercent / 100), SURCHARGE.achCapUsd));
  }
  return round2(amount * (SURCHARGE.cardPercent / 100));
}

export function surchargeLabel(method: PaymentMethod): string {
  if (method === "ach") {
    return SURCHARGE.achPercent > 0 ? `${SURCHARGE.achPercent}% (max $${SURCHARGE.achCapUsd})` : "no fee";
  }
  return `${SURCHARGE.cardPercent}%`;
}

/** Line-item description used when the fee is added to an invoice. */
export function surchargeLineDescription(method: PaymentMethod): string {
  return method === "ach"
    ? "Bank transfer convenience fee"
    : `Card payment convenience fee (${SURCHARGE.cardPercent}%)`;
}
