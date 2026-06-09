---
name: drizzle-kit push blocked by orphan tables
description: Why `drizzle-kit push` hangs on interactive rename prompts here, and the workaround for adding new tables.
---

# drizzle-kit push interactive rename prompt

`npx drizzle-kit push` (even with `--force`) drops into an interactive
"Is X table created or renamed from another table?" prompt whenever the schema
adds brand-new tables AND the live DB contains tables that are not in the schema.

**Why:** The DB has orphan tables that exist in Postgres but were removed from
`shared/schema.ts` (e.g. misc_calls, proposal_builder_sessions,
pricebook_sync_state, pricebook_audit_log). drizzle-kit treats each new schema
table as a possible rename of one of those orphans and asks. The prompt uses a
raw TTY, so piping newlines / `yes` / `printf '\n'` into stdin is ignored — the
command cannot be answered non-interactively from the agent shell.

**How to apply:** To ADD new tables, skip `db:push` entirely. Create the tables
with raw SQL via the code_execution `executeSql` callback (CREATE TABLE IF NOT
EXISTS + indexes + FKs), matching the Drizzle column definitions exactly. After
that, drizzle sees them as existing/matching. Do NOT try to "fix" the orphan
tables by letting push drop them — that risks data loss in unrelated features.
The production schema is applied separately at Publish time, which has its own
rename-resolution UI.
