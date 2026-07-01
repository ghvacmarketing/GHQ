import Stripe from 'stripe';

function getCredentials() {
  const secretKey = process.env.STRIPE_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_KEY environment variable is not set');
  }

  return {
    publishableKey: publishableKey || '',
    secretKey: secretKey,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as const,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
      // Local dev: the Stripe CLI (`stripe listen`) prints a signing secret
      // (whsec_...). Set STRIPE_WEBHOOK_SECRET so webhook signatures verify
      // without a managed webhook (which requires a public REPLIT_DOMAINS URL).
      ...(process.env.STRIPE_WEBHOOK_SECRET
        ? { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
        : {}),
    });
  }
  return stripeSync;
}
