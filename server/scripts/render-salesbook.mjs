// One-time salesbook rasterizer for environments without poppler/pdftoppm
// (e.g. local Windows). Renders each page of the source PDF to a JPG in
// public/salesbook-pages/ at 150 DPI — the same size the flip-book viewer
// expects (1275x1650 for US-Letter). Usage:
//   node server/scripts/render-salesbook.mjs "attached_assets/<file>.pdf"
import fs from "fs";
import path from "path";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

// pdf.js expects a few browser globals to exist.
globalThis.DOMMatrix = DOMMatrix;
globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const SRC = process.argv[2] || "attached_assets/GHVAC-Sales-Pricebook-2026.pdf";
const OUTPUT_DIR = path.join(process.cwd(), "public", "salesbook-pages");
const DPI = 150;
const SCALE = DPI / 72;

function pad(n) {
  return String(n).padStart(2, "0");
}

async function main() {
  const data = new Uint8Array(fs.readFileSync(path.resolve(SRC)));
  const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  console.log(`[render] ${SRC}: ${doc.numPages} pages`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // Clear stale pages so a shorter book doesn't leave old trailing pages behind.
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    if (/^page.*\.jpg$/i.test(f)) fs.unlinkSync(path.join(OUTPUT_DIR, f));
  }

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const buf = canvas.toBuffer("image/jpeg", 0.9);
    const out = path.join(OUTPUT_DIR, `page-${pad(i)}.jpg`);
    fs.writeFileSync(out, buf);
    if (i === 1 || i % 10 === 0 || i === doc.numPages) {
      console.log(`[render] page ${i}/${doc.numPages} -> ${canvas.width}x${canvas.height} (${buf.length} bytes)`);
    }
    page.cleanup();
  }
  console.log(`[render] done: ${doc.numPages} pages written to ${OUTPUT_DIR}`);
}

main().catch((e) => {
  console.error("[render] FAILED:", e);
  process.exit(1);
});
