---
name: Agreement visit vs billing cadence
description: How scheduled maintenance visits are spaced independently from billing frequency on CRM agreements.
---

CRM agreements (`crm_agreements`) and templates (`custom_agreement_types`) have two
separate cadence fields:
- `frequency` (weekly/monthly/annual) = BILLING cadence. Drives end-date extension,
  next-invoice date, renewal term length.
- `visitFrequency` (nullable, same enum) = how scheduled tune-up visits are SPREAD.
  When null, visit spacing falls back to `frequency`.

**Why:** Monthly-billed Care plans (Essential/Priority/Elite) must only book 1–3
tune-up visits per YEAR. Overloading `frequency=monthly` + `visitsPerPeriod` made the
scheduler cram those visits into a single ~30-day month. Decoupling fixes this so a
plan can bill monthly while visits spread across 12 months.

**How to apply:**
- Server: use `computeVisitDate()` + `effectiveVisitFrequency()` helpers in
  `server/routes.ts` (defined near top, after APP_TIMEZONE) for ALL maintenance-visit
  generation. There are 4 visit-generation sites (agreement create, auto-create from
  paid invoice, renewal reset on payment, pay-on-visit renewal). Billing math stays on
  `frequency`; only the per-visit date offset uses the visit cadence.
- Migration (`server/index.ts` runAgreementVisitFrequencyMigration): idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS visit_frequency text` on BOTH tables,
  run at startup before seeds (drizzle push hangs, so columns are added this way on
  every environment incl. production).
- Seed (`server/index.ts` runProtectionAndCarePlanSeeds): Care plans set
  `frequency:"monthly"`, `visitFrequency:"annual"`; idempotent backfill sets
  visit_frequency=annual on previously-seeded template rows where null, then a
  generic UPDATE propagates each agreement's linked-template visit cadence to
  existing `crm_agreements` rows where their visit_frequency IS NULL.
- The custom-agreement-type validator caps `visitsPerPeriod` against the VISIT cadence
  window (7/30/365), not the billing cadence.
- Admin UI (`crm-agreements.tsx`) exposes a "Visit Schedule" select ("Same as billing"
  = null). Create page (`crm-agreement-create.tsx`) prefills + sends `visitFrequency`
  and previews spacing with it.
