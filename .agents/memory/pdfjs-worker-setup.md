---
name: react-pdf / pdfjs worker setup
description: How to wire the PDF.js worker so PDFs actually render; the CDN .min.js path 404s on pdfjs v5.
---

# PDF.js worker for react-pdf

react-pdf (v10) bundles pdfjs-dist v5, where the worker file is
`pdf.worker.min.mjs` (ESM). The classic CDN path
`https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`
**404s** — that filename no longer exists. Symptom: console "Setting up fake
worker" + "Failed to fetch dynamically imported module ... pdf.worker.min.js",
and the page shows "Could not load the PDF" plus a runtime-error overlay.

**Fix (use everywhere react-pdf is imported):** bundle the worker locally via
Vite's `?url` import so it always matches the installed version and needs no
network:
```ts
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
```
Files using react-pdf in this repo: `client/src/components/full-screen-file-viewer.tsx`,
`client/src/pages/crm/crm-esign-editor.tsx`, `client/src/pages/public/sign.tsx`.
Keep them consistent — if you add another PDF viewer, use the same import.
