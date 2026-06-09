---
name: Salesbook PDF generation
description: How the salesbook PDF download is generated server-side and why
---

# Salesbook PDF download

The salesbook PDF (`GET /api/salesbook/pdf`) is generated **server-side**, not in the browser.
The previous client-side `html2canvas` + `jsPDF` approach took ~10 minutes and froze the user's browser.

**How it works:** `server/services/salesbook-pdf.ts` launches headless Chromium via `playwright-core`
(executable from `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`), loads the existing `/salesbook/print` route,
waits for `[data-print-ready="1"]`, screenshots each `.sb-print-page` element as JPEG, and assembles a PDF
with `pdf-lib`. Result is cached in memory keyed by a sha256 of `/api/salesbook/data`, with an in-flight
lock so concurrent requests share one generation. Prewarmed on startup in production only.

**Why this shape:** pure-JS assembly (playwright + pdf-lib) avoids depending on external binaries
(ghostscript/imagemagick/poppler) at runtime, which may not exist in the deployed environment.

**Gotchas:**
- Cold generation ~30s for ~91 pages; cached responses are instant. Freshness lags up to the
  5-min `/api/salesbook/data` in-process cache TTL (acceptable — data changes rarely).
- The `/salesbook/print` route forces images `eager` and re-sets `src` because they use `loading="lazy"`;
  without that, equipment image boxes render blank in the PDF.
