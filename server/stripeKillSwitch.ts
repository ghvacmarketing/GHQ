import { sql } from "drizzle-orm";
import { db } from "./db";
import { getUncachableStripeClient } from "./stripeClient";
import { ONLINE_PAYMENTS_ENABLED } from "@shared/online-payments";

// Payment links this app creates are tagged with one of these metadata types.
const APP_LINK_TYPES = new Set(["quote_deposit", "invoice_payment", "esign_deposit"]);

/** Payment link IDs recorded on our own quotes / invoices / e-sign documents —
 *  catches legacy links created before the metadata tag existed. */
async function knownPaymentLinkIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const table of ["crm_quotes", "crm_invoices", "signature_documents"]) {
    try {
      const result: any = await db.execute(
        sql.raw(`SELECT stripe_payment_link_id AS id FROM ${table} WHERE stripe_payment_link_id IS NOT NULL`),
      );
      for (const row of result?.rows ?? result ?? []) {
        if (row?.id) ids.add(String(row.id));
      }
    } catch (err: any) {
      console.error(`[StripeKillSwitch] Could not read payment link IDs from ${table}:`, err?.message || err);
    }
  }
  return ids;
}

/**
 * While online payments are switched off, make the links customers already
 * hold useless: deactivate every still-active payment link this app issued
 * and expire any checkout session a customer has open on one of them.
 *
 * Only touches links created by this app (tagged metadata or an ID stored on
 * one of our records) — anything else on the Stripe account is left alone.
 * Idempotent: it only ever lists ACTIVE links / OPEN sessions, so re-running
 * is a no-op once everything is shut.
 */
export async function shutOffOutstandingStripePayments(): Promise<void> {
  if (ONLINE_PAYMENTS_ENABLED) return;
  if (!process.env.STRIPE_KEY) {
    console.log("[StripeKillSwitch] STRIPE_KEY not set - nothing to deactivate");
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const known = await knownPaymentLinkIds();
    const ours = new Set<string>(known);

    let deactivated = 0;
    let linkFailures = 0;
    for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
      const isOurs = APP_LINK_TYPES.has(link.metadata?.type || "") || known.has(link.id);
      if (!isOurs) continue;
      ours.add(link.id);
      try {
        await stripe.paymentLinks.update(link.id, { active: false });
        deactivated++;
      } catch (err: any) {
        linkFailures++;
        console.error(`[StripeKillSwitch] Failed to deactivate payment link ${link.id}:`, err?.message || err);
      }
    }

    let expired = 0;
    let sessionFailures = 0;
    for await (const session of stripe.checkout.sessions.list({ status: "open", limit: 100 })) {
      const linkId =
        typeof session.payment_link === "string" ? session.payment_link : session.payment_link?.id || null;
      const isOurs = APP_LINK_TYPES.has(session.metadata?.type || "") || (!!linkId && ours.has(linkId));
      if (!isOurs) continue;
      try {
        await stripe.checkout.sessions.expire(session.id);
        expired++;
      } catch (err: any) {
        sessionFailures++;
        console.error(`[StripeKillSwitch] Failed to expire checkout session ${session.id}:`, err?.message || err);
      }
    }

    console.log(
      `[StripeKillSwitch] Online payments are OFF - deactivated ${deactivated} payment link(s)` +
        ` (${linkFailures} failed), expired ${expired} open checkout session(s) (${sessionFailures} failed)`,
    );
  } catch (err: any) {
    console.error("[StripeKillSwitch] Sweep failed:", err?.message || err);
  }
}

/** Run the sweep at boot, then twice more to catch links the outgoing server
 *  instance issued during the zero-downtime deploy handover. */
export function startStripeKillSwitch(): void {
  if (ONLINE_PAYMENTS_ENABLED) return;
  console.log("[StripeKillSwitch] Online payments are OFF - payment link creation is blocked");
  void shutOffOutstandingStripePayments();
  for (const delayMs of [3 * 60_000, 10 * 60_000]) {
    setTimeout(() => void shutOffOutstandingStripePayments(), delayMs).unref();
  }
}
