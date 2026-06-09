import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const PDF_PATH = path.join(process.cwd(), "attached_assets", "Chandler_Sales_Book_1766587153181.pdf");
const OUTPUT_DIR = path.join(process.cwd(), "public", "salesbook-pages");
const PAGE_PREFIX = "page";
const DPI = 150;

export interface SalesbookPageInfo {
  totalPages: number;
  pageWidth: number;
  pageHeight: number;
  pages: string[];
}

let cachedInfo: SalesbookPageInfo | null = null;

export function ensureSalesbookConverted(): SalesbookPageInfo {
  if (cachedInfo) return cachedInfo;

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const existingFiles = fs.readdirSync(OUTPUT_DIR).filter((f) => f.startsWith(PAGE_PREFIX) && f.endsWith(".jpg")).sort();

  if (existingFiles.length === 0) {
    console.log("[Salesbook] Converting PDF to page images...");
    try {
      execSync(`pdftoppm -jpeg -r ${DPI} "${PDF_PATH}" "${path.join(OUTPUT_DIR, PAGE_PREFIX)}"`, {
        timeout: 120000,
      });
      console.log("[Salesbook] PDF conversion complete");
    } catch (err) {
      console.error("[Salesbook] PDF conversion failed:", err);
      throw new Error("Failed to convert salesbook PDF");
    }
  }

  const pages = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith(PAGE_PREFIX) && f.endsWith(".jpg"))
    .sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      return numA - numB;
    });

  // Cache-bust the page image URLs using the newest file's modified time so that
  // replacing a page (e.g. a new cover) forces browsers to fetch the fresh image
  // instead of serving the long-cached old version.
  let version = 0;
  for (const f of pages) {
    try {
      version = Math.max(version, Math.floor(fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs));
    } catch {
      // ignore stat errors
    }
  }

  cachedInfo = {
    totalPages: pages.length,
    pageWidth: 1275,
    pageHeight: 1650,
    pages: pages.map((f) => `/salesbook-pages/${f}?v=${version}`),
  };

  console.log(`[Salesbook] ${cachedInfo.totalPages} pages ready`);
  return cachedInfo;
}
