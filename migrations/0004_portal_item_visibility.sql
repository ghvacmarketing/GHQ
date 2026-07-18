-- Per-item customer-portal visibility controls.
-- Invoices: portal_visible gates whether the invoice appears in the portal.
-- Quotes: portal_visible gates the list entry; portal_can_view additionally
-- allows the customer to open the full quote and sign it from the portal.

ALTER TABLE "crm_invoices" ADD COLUMN IF NOT EXISTS "portal_visible" boolean NOT NULL DEFAULT true;
ALTER TABLE "crm_quotes" ADD COLUMN IF NOT EXISTS "portal_visible" boolean NOT NULL DEFAULT true;
ALTER TABLE "crm_quotes" ADD COLUMN IF NOT EXISTS "portal_can_view" boolean NOT NULL DEFAULT false;

-- Back-compat: quotes that were already sent (or resolved) keep their portal
-- open/sign link, matching the behavior shipped before this flag existed.
UPDATE "crm_quotes" SET "portal_can_view" = true WHERE "status" IN ('sent', 'accepted', 'declined');
