import jsPDF from "jspdf";

/** Shared professional quote PDF — mirrors the invoice PDF template exactly
 *  (brand-color company header, thick rule, BILL TO / date rows, bordered
 *  items table with a grey header row, right-column totals in brand color).
 *  Used by both the desktop and mobile quote detail pages so custom and quick
 *  quotes print identically.
 *
 *  Internal cost lines (worksheet build-up, labor, warranty reserve) never
 *  print — a custom quote with no customer-facing lines prints one line: the
 *  package at its sell price.
 */

type PdfLineItem = {
  description?: string | null;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  lineTotal?: string | number | null;
  lineType?: string | null;
  customerVisible?: boolean | null;
  optionTag?: string | null;
  isDiscountLine?: boolean | null;
};

type PdfQuote = {
  quoteNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  serviceAddress?: string | null;
  title?: string | null;
  description?: string | null;
  customerNotes?: string | null;
  subtotal?: string | null;
  total?: string | null;
  status?: string | null;
  createdAt?: string | Date | null;
  validUntil?: string | Date | null;
  acceptedAt?: string | Date | null;
  acceptedBy?: string | null;
  signerName?: string | null;
  quoteMode?: string | null;
  selectedOption?: string | null;
};

export const isInternalQuoteLine = (item: PdfLineItem): boolean =>
  item.customerVisible === false ||
  (item.customerVisible !== true && (item.lineType === "labor" || item.lineType === "other"));

const money = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const dateStr = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** Very small HTML → plain text for the quote description block. */
const htmlToText = (html: string): string =>
  html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function generateQuotePdf(quote: PdfQuote, allLineItems: PdfLineItem[]): string {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const CW = W - M * 2;

  const MAROON: [number, number, number] = [113, 20, 25];
  const INK: [number, number, number] = [17, 24, 39];
  const SLATE: [number, number, number] = [107, 114, 128];
  const BORDER: [number, number, number] = [229, 231, 235];
  const HEADBG: [number, number, number] = [248, 249, 250];

  // Customer-facing lines only; a fully-internal custom quote prints the
  // package sell price as its single line.
  let items = allLineItems.filter((i) => !isInternalQuoteLine(i));
  const sold = ["accepted", "converted"].includes(quote.status || "");
  if (quote.quoteMode === "options" && sold && quote.selectedOption) {
    items = items.filter((i) => !i.optionTag || i.optionTag === quote.selectedOption);
  }
  if (items.length === 0 && parseFloat(quote.total || "0") > 0) {
    items = [{
      description: quote.title || "Complete installation as specified",
      quantity: "1",
      unitPrice: quote.total,
      lineTotal: quote.total,
    }];
  }

  let y = 22;

  // ── Header: company (brand color) left, QUOTE right ──
  doc.setFontSize(19);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MAROON);
  doc.text("Giesbrecht HVAC", M, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE);
  doc.text("PO Box 917, Wrens, GA 30833", M, y + 6);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text("QUOTE", W - M, y, { align: "right" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE);
  doc.text(quote.quoteNumber || "", W - M, y + 6, { align: "right" });

  // Thick brand rule
  y += 11;
  doc.setFillColor(...MAROON);
  doc.rect(M, y, CW, 1.4, "F");
  y += 9;

  // ── PREPARED FOR (left) · Issued / Valid Until (right) ──
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...SLATE);
  doc.text("PREPARED FOR", M, y, { charSpace: 0.6 });
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(quote.customerName || "Customer", M, y + 6);
  let by = y + 11;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE);
  if (quote.serviceAddress) {
    const addr = doc.splitTextToSize(String(quote.serviceAddress), CW * 0.55);
    addr.forEach((line: string) => { doc.text(line, M, by); by += 4.2; });
  }
  if (quote.customerPhone) { doc.text(String(quote.customerPhone), M, by); by += 4.2; }

  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(`Issued: ${dateStr(quote.createdAt)}`, W - M, y + 1, { align: "right" });
  doc.text(`Valid until: ${quote.validUntil ? dateStr(quote.validUntil) : "30 days"}`, W - M, y + 6.5, { align: "right" });

  y = Math.max(by, y + 14) + 6;

  // ── Quote title ──
  if (quote.title) {
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(String(quote.title), CW);
    titleLines.forEach((line: string) => { doc.text(line, M, y); y += 6; });
    y += 1;
  }

  // ── Items table (bordered, grey header row) ──
  const colQtyW = 18;
  const colUnitW = 30;
  const colAmtW = 32;
  const colDescW = CW - colQtyW - colUnitW - colAmtW;
  const xDesc = M;
  const xQty = M + colDescW;
  const xUnit = xQty + colQtyW;
  const xAmt = xUnit + colUnitW;

  const drawRowBorders = (yy: number, h: number) => {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(xDesc, yy, colDescW, h);
    doc.rect(xQty, yy, colQtyW, h);
    doc.rect(xUnit, yy, colUnitW, h);
    doc.rect(xAmt, yy, colAmtW, h);
  };

  const tableHeader = (yy: number): number => {
    const h = 8;
    doc.setFillColor(...HEADBG);
    doc.rect(M, yy, CW, h, "F");
    drawRowBorders(yy, h);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text("Description", xDesc + 2.5, yy + 5.3);
    doc.text("Qty", xQty + colQtyW - 2.5, yy + 5.3, { align: "right" });
    doc.text("Unit", xUnit + colUnitW - 2.5, yy + 5.3, { align: "right" });
    doc.text("Amount", xAmt + colAmtW - 2.5, yy + 5.3, { align: "right" });
    return yy + h;
  };

  const continuation = (): number => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MAROON);
    doc.text("Giesbrecht HVAC", M, 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SLATE);
    doc.text(`QUOTE ${quote.quoteNumber || ""} — continued`, W - M, 14, { align: "right" });
    doc.setFillColor(...MAROON);
    doc.rect(M, 17, CW, 0.8, "F");
    return 24;
  };

  const ensureSpace = (needed: number, repeatHeader: boolean) => {
    if (y + needed > H - 28) {
      doc.addPage();
      y = continuation();
      if (repeatHeader) y = tableHeader(y);
    }
  };

  const itemRow = (item: PdfLineItem) => {
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(item.description || "", colDescW - 5);
    const rowH = Math.max(8, descLines.length * 4 + 4);
    ensureSpace(rowH + 2, true);
    drawRowBorders(y, rowH);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    let ty = y + 5.2;
    descLines.forEach((line: string) => { doc.text(line, xDesc + 2.5, ty); ty += 4; });
    doc.text(String(item.quantity || 1), xQty + colQtyW - 2.5, y + 5.2, { align: "right" });
    doc.text(money(item.unitPrice), xUnit + colUnitW - 2.5, y + 5.2, { align: "right" });
    doc.text(money(item.lineTotal), xAmt + colAmtW - 2.5, y + 5.2, { align: "right" });
    y += rowH;
  };

  // Section sub-header row spanning the table (used for options)
  const sectionRow = (label: string) => {
    ensureSpace(10, true);
    const h = 7;
    doc.setFillColor(...HEADBG);
    doc.rect(M, y, CW, h, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(M, y, CW, h);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MAROON);
    doc.text(label, M + 2.5, y + 4.8);
    y += h;
  };

  y = tableHeader(y);

  const optionTags = Array.from(new Set(items.map((i) => i.optionTag).filter(Boolean))) as string[];
  if (quote.quoteMode === "options" && !sold && optionTags.length > 1) {
    // Un-sold multi-option quote: one clean section per option, shared items last
    for (const tag of optionTags) {
      sectionRow(`Option: ${tag}`);
      const optItems = items.filter((i) => i.optionTag === tag);
      optItems.forEach(itemRow);
      const optTotal = optItems.reduce((s, i) => s + (parseFloat(String(i.lineTotal ?? "0")) || 0), 0);
      ensureSpace(8, true);
      drawRowBorders(y, 7);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(`${tag} total`, xDesc + 2.5, y + 4.8);
      doc.text(money(optTotal), xAmt + colAmtW - 2.5, y + 4.8, { align: "right" });
      y += 7;
    }
    const shared = items.filter((i) => !i.optionTag);
    if (shared.length > 0) {
      sectionRow("Included with every option");
      shared.forEach(itemRow);
    }
  } else {
    items.forEach(itemRow);
  }

  // ── Totals (right column, template style) ──
  y += 6;
  ensureSpace(40, false);
  const labX = xUnit;
  const valX = W - M;
  const totalsRow = (lab: string, val: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SLATE);
    doc.text(lab, labX, y);
    doc.setTextColor(...INK);
    doc.text(val, valX, y, { align: "right" });
    y += 5.5;
  };
  totalsRow("Subtotal", money(quote.subtotal));

  doc.setFillColor(...MAROON);
  doc.rect(labX, y - 2.5, W - M - labX, 0.7, "F");
  y += 3.5;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  const totalLabel = quote.quoteMode === "options" && !sold && optionTags.length > 1 ? "Total (best option)" : "Total";
  doc.text(totalLabel, labX, y);
  doc.setTextColor(...MAROON);
  doc.text(money(quote.total), valX, y, { align: "right" });
  y += 8;

  if (sold) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 128, 61);
    const who = quote.signerName || quote.acceptedBy;
    doc.text(
      `ACCEPTED${who ? ` BY ${String(who).toUpperCase()}` : ""}${quote.acceptedAt ? ` — ${dateStr(quote.acceptedAt)}` : ""}`,
      valX, y, { align: "right", charSpace: 0.4 },
    );
    y += 6;
  }

  // ── Description / scope of work ──
  const desc = (quote.description || "").trim();
  if (desc) {
    ensureSpace(20, false);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text("SCOPE OF WORK", M, y, { charSpace: 0.6 });
    y += 4.5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const text = htmlToText(desc);
    for (const para of text.split("\n")) {
      const lines = doc.splitTextToSize(para || " ", CW);
      for (const line of lines) {
        ensureSpace(5, false);
        doc.text(line, M, y);
        y += 4.2;
      }
    }
    y += 2;
  }

  // ── Customer notes ──
  if (quote.customerNotes && String(quote.customerNotes).trim()) {
    ensureSpace(20, false);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SLATE);
    doc.text("NOTES", M, y, { charSpace: 0.6 });
    y += 4.5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const noteLines = doc.splitTextToSize(String(quote.customerNotes).trim(), CW * 0.7);
    noteLines.forEach((line: string) => {
      ensureSpace(5, false);
      doc.text(line, M, y);
      y += 4.2;
    });
  }

  // ── Footer ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.line(M, H - 16, W - M, H - 16);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SLATE);
    doc.text("Giesbrecht HVAC  ·  (706) 826-0644  ·  www.ghvac.app  ·  Thank you for your business", M, H - 11);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 11, { align: "right" });
  }

  const customerName = (quote.customerName || "Customer").replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Quote_${quote.quoteNumber || "draft"}_${customerName}.pdf`;
  doc.save(fileName);
  return fileName;
}
