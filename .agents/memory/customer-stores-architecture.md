---
name: Customer stores architecture
description: The three separate customer data stores and which one backs the CRM "GHQ customers" list
---

There are THREE distinct customer stores; confusing them causes imports to land where the UI never reads.

1. `crm_customers` table — the real CRM records. This is the durable source for the "GHQ customers" list.
2. `customers` table — a standalone/legacy DB that is a MIRROR of a Google Sheet via `server/services/customer-sync.ts` (`storage.batchImportCustomers`). It also DELETES rows not in the source sheet on sync, so writing here is non-durable AND it is never read by the CRM customer list.
3. FieldEdge in-memory cache — `fieldEdgeCustomerService.getCustomers()` in `server/services/fieldedge-customers.ts`, loaded live from a Google Sheet via API.

The "GHQ customers" list = `GET /api/crm/customers/merged` = `crm_customers` + FieldEdge cache (deduped). It NEVER reads the `customers` table.

**Why this matters:** A CSV/customer import must target `crm_customers` to show up in the CRM. Importing into `customers` adds nothing visible and may be wiped by the next sheet sync.

**FieldEdge feed gotcha:** the service auto-reads the FIRST tab of `FIELDEDGE_CUSTOMER_SHEET_ID` and filters rows by a `Display Name` column. If that env var points at the wrong spreadsheet (e.g. a sheet whose only tab is `pricebook-export`), the feed silently caches 0 customers (success path, not an error). To fix the live feed, point `FIELDEDGE_CUSTOMER_SHEET_ID` at the customer sheet whose first tab has a `Display Name` header.

**Dedup note:** CSV "Display Name" mixes formats ("Last, First" and "First Last") while `crm_customers.name` is "First Last". Dedup by normalized phone (10-digit) + lowercased email is far more reliable than name matching. Reuse the FieldEdge `formatDisplayName` logic ("Last, First" -> "First Last") when creating crm_customers from CSV.
