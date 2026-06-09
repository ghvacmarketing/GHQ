---
name: Adding a salesbook section
description: The decoupled files that must all be updated when adding a new page type to the flipbook salesbook.
---

Adding a new section/page type to the salesbook is spread across multiple decoupled files. Miss one and the page silently fails to render (default case returns null) in one of the viewers.

**Where things live:** all page components + section model live in `client/src/components/salesbook-pages.tsx`.

**Checklist to add a new section type:**
1. Build the `forwardRef` page component(s) in `salesbook-pages.tsx` using `<PageWrapper ref={ref}>`; brand red is `BRAND_COLOR` `#711419`, pages are a fixed 618×800 box so keep content within height and wrap content area in `overflow:hidden`.
2. Extend the `SalesbookSection.type` union with the new type string(s).
3. Push the new section(s) into `buildSalesbookSections()` at the right spot (sequential `pageIndex++` continuity is automatic).
4. Add the type to `getSalesbookTOC()` if it should appear in the TOC (only divider-style types are listed there).
5. Add a `case` for each new type in **all THREE** render switches and import the component in each: `client/src/pages/salesbook-print.tsx` (server-PDF, components rendered WITHOUT `key`), `client/src/pages/price-book.tsx` (public `/salesbook`), `client/src/pages/crm/crm-salesbook.tsx` (CRM `/crm/salesbook`).

**Why:** the three viewers each have their own independent `renderSection` switch; the print one feeds the server PDF. The PDF page count is dynamic (screenshots every `.sb-print-page`), so no page-list edits are needed — but a missing case in any switch makes that page blank only in that surface.
