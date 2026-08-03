# GHQ (GHVAC Tools) — project notes

Field-service platform for Giesbrecht HVAC (Wrens, GA): CRM + Field (mobile PWA)
+ Documents + Accounting + Marketing apps. Deploys: push to `main` → Render
auto-deploys (Docker). DB: Neon Postgres. No local run.

## Conventions
- **Timezone**: all business scheduling is `America/New_York`. Server runs UTC —
  parse naive datetimes with `fromZonedTime(raw, "America/New_York")`, never bare
  `new Date()`.
- **DB migrations**: idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT
  EXISTS` functions in `server/index.ts` run at startup (plus matching Drizzle
  defs in `shared/schema.ts`). No drizzle-kit push on deploy.
- **Typecheck**: the repo does NOT tsc-clean (long-standing pre-existing errors).
  Verify new code adds no NEW errors by diffing against a `git stash` baseline.
  The deploy gate is `npm run build` (vite + esbuild — no typechecking).
- **AI providers**: chat prefers Claude (`ANTHROPIC_API_KEY`), falls back to
  OpenAI. Voice transcription is OpenAI Whisper ONLY (needs credits).

## Gibbs (the AI assistant)
- Brain: `server/services/crmHelpAI.ts`. Feature knowledge base:
  `server/services/crm-knowledge.ts`. Live-data lookup tools + approval-gated
  actions (create task/work order, send SMS/email) live in `crmHelpAI.ts` and
  `server/routes.ts` (`/api/crm/help`, `/api/crm/ai/execute-action`).
- Streaming: `/api/crm/help/stream` (NDJSON deltas + final `done` payload
  identical to the JSON route; both call the shared `runCrmHelpExchange`).
  Clients stream-first via `askGibbsStream` and fall back to the plain POST
  only when the stream can't start. The model's reply is a JSON envelope, so
  `crmHelpAI.ts` extracts the `answer` string incrementally
  (`makeAnswerExtractor`) from Anthropic SSE (`claudeStreamRequest`).
- Surfaces: desktop `client/src/components/crm/ai-assistant-modal.tsx`, mobile
  `client/src/components/mobile/assistant-overlay.tsx`, shared plumbing in
  `client/src/lib/ai-conversations.ts`, voice in
  `client/src/hooks/use-voice-dictation.ts`.

### Keeping Gibbs' knowledge fresh (IMPORTANT)
Whenever a feature ships, renames, or is removed:
1. Update `server/services/crm-knowledge.ts` (a page missing there means Gibbs
   denies it exists; also prune the "FEATURES THAT DO NOT EXIST" list).
2. Run `npm run audit:gibbs` — it cross-checks the sidebar nav and routes
   against the KB and lists anything undocumented. Fix what it flags.

Company-specific facts (brand voice, SOPs, policies) belong in the **Documents
app** — Gibbs reads them live via its `company_docs` tool (text files and PDFs).
