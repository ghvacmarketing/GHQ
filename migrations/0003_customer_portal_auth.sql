-- Customer portal self-service auth (phone/email + password, SMS OTP)
-- Additive only; legacy magic-link accounts keep working.

ALTER TABLE "customer_portal_accounts" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE "customer_portal_accounts" ADD COLUMN IF NOT EXISTS "normalized_phone" text;
ALTER TABLE "customer_portal_accounts" ADD COLUMN IF NOT EXISTS "phone_verified_at" timestamp;
ALTER TABLE "customer_portal_accounts" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp;
ALTER TABLE "customer_portal_accounts" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "customer_portal_accounts" ADD COLUMN IF NOT EXISTS "locked_until" timestamp;

-- Backfill normalized phone from any phone already stored on the account
UPDATE "customer_portal_accounts"
SET "normalized_phone" = NULLIF(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'), '')
WHERE "normalized_phone" IS NULL;

CREATE INDEX IF NOT EXISTS "customer_portal_accounts_normalized_phone_idx"
  ON "customer_portal_accounts" ("normalized_phone");
CREATE INDEX IF NOT EXISTS "customer_portal_accounts_customer_id_idx"
  ON "customer_portal_accounts" ("customer_id");

CREATE TABLE IF NOT EXISTS "customer_portal_otp_codes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "normalized_phone" text NOT NULL,
  "code" text NOT NULL,
  "purpose" text NOT NULL,
  "account_id" varchar REFERENCES "customer_portal_accounts"("id") ON DELETE CASCADE,
  "attempts" integer NOT NULL DEFAULT 0,
  "verified_at" timestamp,
  "consumed_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "customer_portal_otp_phone_purpose_idx"
  ON "customer_portal_otp_codes" ("normalized_phone", "purpose");
