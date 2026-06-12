---
name: Salesbook product provisioning
description: How salesbook/pricebook products must be added so they survive fresh deploys and Sheets sync
---

# Salesbook / pricebook product provisioning

Products shown in the salesbook flipbook come from the `pricebook_packages` DB table
(`/api/salesbook/data`). The page builder groups rows by `unitType`, then `tier`, then
`tonnage`.

**Rule:** New product rows must be created by an idempotent startup seed in
`server/index.ts` (e.g. `runWaterHeaterSeeds`, alongside `runProtectionAndCarePlanSeeds`),
NOT by ad-hoc SQL only.

**Why:** Ad-hoc SQL inserts exist only in the current environment — a fresh checkout,
new branch environment, or production deploy will have an empty/different DB and the
category silently disappears. Seeds re-create rows on every boot (existence-checked, so
no duplicates).

**How to apply:**
- Seed key = composite (`unitType`, `tier`, `tonnage`, `packageLevel`); check-then-insert.
- Google Sheets pricebook sync (`server/services/package-sheets-sync.ts`) is upsert-by-key
  with NO mass delete, so manually-seeded rows are safe from sync wiping them.
- Single-tier / non-tonnage products (e.g. Water Heaters): use `tier="Standard"` and use
  `tonnage` purely as a 1..N display-order key.
- Static per-product specs that aren't editable pricing (warranty/features) live in a
  component config in `client/src/components/salesbook-pages.tsx`, keyed off the stable
  `packageLevel` variant code (NOT the editable `outdoorName`, which can be renamed in the
  DB and would silently drop the specs). Keep those keys in sync with the seed.
