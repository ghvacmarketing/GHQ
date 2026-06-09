import { createHash } from "crypto";
import * as fs from "fs";
import { PDFDocument } from "pdf-lib";
import type { Browser } from "playwright-core";

const PAGE_W = 618;
const PAGE_H = 800;

let cachedPdf: Buffer | null = null;
let cachedHash: string | null = null;
let inFlight: Promise<Buffer> | null = null;

function baseUrl(): string {
  const port = parseInt(process.env.PORT || "5000", 10);
  return `http://127.0.0.1:${port}`;
}

async function fetchDataHash(): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/salesbook/data`);
    if (!res.ok) return null;
    const text = await res.text();
    return createHash("sha256").update(text).digest("hex");
  } catch {
    return null;
  }
}

async function render(): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error(
      "Chromium is not available for salesbook PDF generation (REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE is missing or invalid).",
    );
  }
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      executablePath: executablePath || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(`${baseUrl()}/salesbook/print`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await page.waitForSelector('[data-print-ready="1"]', { timeout: 90000 });

    const pageEls = await page.$$(".sb-print-page");
    const pdfDoc = await PDFDocument.create();
    for (const el of pageEls) {
      const shot = await el.screenshot({ type: "jpeg", quality: 82 });
      const jpg = await pdfDoc.embedJpg(shot);
      const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
      p.drawImage(jpg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  } finally {
    if (browser) await browser.close();
  }
}

export async function getSalesbookPdf(): Promise<Buffer> {
  const hash = await fetchDataHash();
  if (cachedPdf && hash && hash === cachedHash) {
    return cachedPdf;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    const buf = await render();
    cachedPdf = buf;
    cachedHash = hash;
    return buf;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function prewarmSalesbookPdf(delayMs = 4000): void {
  setTimeout(() => {
    getSalesbookPdf().catch((err) => {
      console.error("Salesbook PDF prewarm failed:", err);
    });
  }, delayMs);
}
