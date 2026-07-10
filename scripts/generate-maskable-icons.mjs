// Generate maskable PWA icons: the existing icon centered at 80% on a solid
// brand-maroon canvas, so Android's adaptive-icon mask never clips the logo.
// Run: node scripts/generate-maskable-icons.mjs
import sharp from "sharp";

const MAROON = { r: 0x71, g: 0x14, b: 0x19, alpha: 1 };
const SIZES = [192, 512];

for (const size of SIZES) {
  const inner = Math.round(size * 0.8); // 80% safe zone
  const logo = await sharp(`client/public/icon-${size}x${size}.png`)
    .resize(inner, inner, { fit: "contain", background: MAROON })
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: MAROON } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`client/public/icon-${size}-maskable.png`);

  console.log(`✓ icon-${size}-maskable.png`);
}
console.log("Done.");
