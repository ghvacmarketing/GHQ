/** Downscale a picked photo to a phone-friendly JPEG (max 1600px, q0.8) so
 *  MMS/email payloads stay small. Returns base64 + a preview data URL. */
export async function compressImage(file: File): Promise<{
  dataBase64: string;
  mimeType: string;
  filename: string;
  preview: string;
}> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return {
    dataBase64: dataUrl.split(",")[1],
    mimeType: "image/jpeg",
    filename: (file.name || "photo").replace(/\.\w+$/, "") + ".jpg",
    preview: dataUrl,
  };
}
