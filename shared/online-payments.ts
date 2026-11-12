// ── Online (Stripe) payments kill switch ──
// One flag, read by BOTH the server and the client bundle.
//
// false = customers and staff cannot start a Stripe payment anywhere:
//   • the server refuses to create payment links (quote deposits, invoices,
//     e-sign deposits) and refuses to redirect to stored ones
//   • on boot the server deactivates payment links this app already issued
//     and expires their open checkout sessions (server/stripeKillSwitch.ts)
//   • the pay buttons are replaced with a "call us" notice
// The Stripe webhook and the verify-payment endpoints stay live on purpose,
// so a payment that was already in flight still lands on the books.
//
// To turn online payments back on: set this to true and deploy. Links that
// were deactivated stay dead; fresh ones are generated on demand.
export const ONLINE_PAYMENTS_ENABLED = false;

export const OFFICE_PHONE = "(706) 826-0644";

/** Customer-facing explanation shown wherever a pay button used to be. */
export const ONLINE_PAYMENTS_OFF_MESSAGE =
  `Online payments are temporarily unavailable. Please call us at ${OFFICE_PHONE} to arrange payment.`;

/** Staff-facing explanation (CRM + Field app). */
export const ONLINE_PAYMENTS_OFF_STAFF_MESSAGE =
  "Online (Stripe) payments are temporarily turned off. Record cash/check payments manually, or have the customer call the office.";
