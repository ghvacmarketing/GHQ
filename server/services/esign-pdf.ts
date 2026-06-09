import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import type { SignatureField } from "@shared/schema";

const objectStorageService = new ObjectStorageService();

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/**
 * Read the raw bytes of an object stored at an `/objects/...` path.
 */
export async function downloadObjectBytes(objectPath: string): Promise<Buffer> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [buf] = await file.download();
  return buf;
}

/**
 * Upload raw bytes to object storage and return the normalized `/objects/...` path.
 */
async function uploadBytes(bytes: Uint8Array, contentType: string): Promise<string> {
  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const res = await fetch(uploadURL, {
    method: "PUT",
    body: Buffer.from(bytes),
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`Failed to upload signed PDF to storage (status ${res.status})`);
  }
  return objectStorageService.normalizeObjectEntityPath(uploadURL);
}

/**
 * Returns the number of pages in a stored PDF.
 */
export async function getPdfPageCount(objectPath: string): Promise<number> {
  const bytes = await downloadObjectBytes(objectPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isPng: boolean } | null {
  const match = /^data:(image\/(png|jpeg));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const isPng = match[2].toLowerCase() === "png";
  const bytes = Uint8Array.from(Buffer.from(match[3], "base64"));
  return { bytes, isPng };
}

/**
 * Flatten all completed field values onto the original PDF and store the result.
 * Coordinates on fields are fractions (0..1) of the page, measured from the TOP-LEFT.
 * Returns the `/objects/...` path of the signed PDF.
 */
export async function flattenSignedPdf(
  originalObjectPath: string,
  fields: SignatureField[],
): Promise<string> {
  const bytes = await downloadObjectBytes(originalObjectPath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    if (!field.value) continue;
    const pageIndex = Math.min(Math.max((field.page || 1) - 1, 0), pages.length - 1);
    const page = pages[pageIndex];
    const { width: pw, height: ph } = page.getSize();

    const boxX = field.x * pw;
    const boxW = field.width * pw;
    const boxH = field.height * ph;
    const topFromTop = field.y * ph;
    const boxY = ph - topFromTop - boxH; // convert to bottom-left origin

    if (field.type === "signature" || field.type === "initials") {
      const img = dataUrlToBytes(field.value);
      if (!img) continue;
      const embedded = img.isPng
        ? await pdfDoc.embedPng(img.bytes)
        : await pdfDoc.embedJpg(img.bytes);
      // Fit image within the box preserving aspect ratio
      const scale = Math.min(boxW / embedded.width, boxH / embedded.height);
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;
      page.drawImage(embedded, {
        x: boxX + (boxW - drawW) / 2,
        y: boxY + (boxH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    } else {
      // text / date / name
      let fontSize = Math.min(boxH * 0.7, 14);
      if (fontSize < 6) fontSize = 6;
      const text = field.value;
      page.drawText(text, {
        x: boxX + 2,
        y: boxY + (boxH - fontSize) / 2 + 1,
        size: fontSize,
        font: helvetica,
        color: rgb(0.05, 0.05, 0.05),
      });
    }
  }

  const out = await pdfDoc.save();
  return uploadBytes(out, "application/pdf");
}
