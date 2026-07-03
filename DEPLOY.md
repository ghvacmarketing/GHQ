# Deploying ghvac-tools to Render (off Replit)

The app is a single Node/Express server that also serves the built React client,
backed by **Neon** Postgres. Files are stored in Neon (the `object_store` table)
whenever the app is NOT running on Replit, so no separate object store is needed.

## One-time prerequisites

1. **Neon**: you already have a Neon database. Copy its **pooled** connection
   string — that's `DATABASE_URL`.
2. **Push the schema to Neon** (creates all tables incl. `object_store`, sessions):
   ```
   npm run db:push
   ```
   Run this locally with `DATABASE_URL` pointing at the Neon prod database. (If
   you've been developing against this same Neon DB, the tables already exist.)

## Deploy on Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick this repo. It reads `render.yaml`:
   - runtime: **Docker** (builds from `./Dockerfile` — includes Chromium + poppler
     so salesbook PDFs and page rendering work)
   - health check: `/health`
   - plan: **standard** (Chromium PDF rendering needs more than the 512MB starter)
3. In the service's **Environment** tab, fill in every `sync:false` variable
   (values come from your local `.env`). At minimum you cannot boot without:
   - `DATABASE_URL`
   - `SESSION_SECRET`  ← **required in production; the server refuses to start without it**
   - `GLOBAL_PASSWORD` (turns on the legacy-route auth) and `ADMIN_PASSWORD`
4. Click **Create / Deploy**. First deploy runs the build then starts the server.
5. Render gives you `https://ghvac-tools.onrender.com` (or your custom domain).

## After the first deploy

- **Update OAuth redirect URIs** to the new domain, in each provider's console,
  and set the matching env vars:
  - Google (CRM sign-in): `GOOGLE_OAUTH_REDIRECT_URI = https://<domain>/api/crm/auth/google/callback`
  - QuickBooks: redirect `https://<domain>/api/quickbooks/callback`
  - Bouncie: redirect `https://<domain>/api/bouncie/callback`
- **Stripe webhook**: point it at `https://<domain>/api/stripe/webhook` and set
  `STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret.
- **Textline webhook** (if used): `https://<domain>/api/webhooks/textline?secret=<TEXTLINE_WEBHOOK_SECRET>`.
- **Smoke-test** the gate + logins: legacy tool (enter `GLOBAL_PASSWORD`), CRM,
  mobile, customer portal, and a public quote link. If any wrongly returns
  "Authentication required", the path just needs adding to the gate allowlist.

## Known follow-ups

- **Salesbook PDF export** works via the Docker image (Chromium + poppler). If
  PDFs fail with an out-of-memory error, bump the Render plan (Chromium is
  memory-hungry). First deploy is slow — the image installs Chromium.
- **Cloudflare R2 (optional)**: files currently live in Neon. If the DB grows
  large from uploads, move the storage layer to R2 (S3-compatible). Not needed
  to launch.
- Move the `RESEND_API_KEY` out of `.replit` and rotate it.
