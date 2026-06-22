---
name: Customer stores architecture
description: The separate customer data stores and which one backs the CRM "GHQ customers" list
---

There are THREE distinct customer stores; confusing them causes imports to land where the UI never reads.

- **crm_customers** — the real CRM records. Durable source for the "GHQ customers" list. Import here to make customers appear in the CRM.
- **customers** — a standalone table that MIRRORS a Google Sheet (via the customer-sync service). It deletes rows not in the sheet on sync, and the CRM customer list never reads it. Writing here is non-durable and invisible to the CRM.
- **FieldEdge in-memory cache** — loaded live from a Google Sheet via API by the FieldEdge customer service.

"GHQ customers" = `GET /api/crm/customers/merged` = crm_customers + FieldEdge cache (deduped). It never reads the `customers` table.

**FieldEdge feed gotcha:** the service auto-reads the FIRST tab of the configured sheet (`FIELDEDGE_CUSTOMER_SHEET_ID`) and filters rows by a `Display Name` column. If that env var points at the wrong spreadsheet (e.g. a sheet whose first/only tab has no `Display Name` header), the feed silently caches 0 customers via its success path (not an error). Fix = point the env var at the real customer sheet whose first tab has a `Display Name` header.

**Dedup note:** CSV "Display Name" mixes "Last, First" and "First Last" while crm_customers uses "First Last". Dedup by normalized 10-digit phone + lowercased email is far more reliable than name matching; reuse the FieldEdge "Last, First" -> "First Last" normalization when creating crm_customers from a CSV.
