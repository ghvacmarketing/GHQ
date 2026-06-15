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
- **Two separate `renderSection` switches exist and must stay in sync** when adding a new
  salesbook section type: the on-screen/html2canvas one in `client/src/pages/price-book.tsx`
  AND the server-PDF one in `client/src/pages/salesbook-print.tsx`. Both consume the same
  `buildSalesbookSections` output. A type present in one but missing in the other renders as a
  **blank page** only in that path (e.g. water-heater pages showed in the flipbook but were blank
  in the CRM `/api/salesbook/pdf` download because the print switch lacked the case + import).
- Public `/salesbook` download = client html2canvas (price-book.tsx). CRM `/crm/salesbook`
  download = server `/api/salesbook/pdf` (playwright → salesbook-print.tsx). Different render paths.
- html2canvas (the client path) does NOT resolve CSS Grid `fr`/`gridAutoRows` track heights —
  cards collapse to a blank page. Use flexbox (nested rows with `flex:1`) for export-captured pages.
