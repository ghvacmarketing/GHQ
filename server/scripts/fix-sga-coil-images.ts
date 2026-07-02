// Populate the missing SGA evaporator-coil images. Every SGA package has a coil
// model but coilImageUrl was never set. The coil image is the position-"2" file
// that sits next to the already-linked outdoor ("1") image in the same folder
// (e.g. outdoor sga_essential_1_5ton_best_1_...png -> coil ..._best_2_...png).
import { db, pool } from "../db";
import { pricebookPackages } from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function main() {
  const rows = await db.select().from(pricebookPackages).where(eq(pricebookPackages.unitType, "SGA"));
  let updated = 0, already = 0, skipped = 0;
  const misses: string[] = [];

  for (const p of rows) {
    if (!p.coilModel) { skipped++; continue; }       // no coil on this package
    if (p.coilImageUrl) { already++; continue; }       // already linked
    if (!p.outdoorImageUrl) { skipped++; continue; }

    const dir = path.posix.dirname(p.outdoorImageUrl);          // sga_essential_images
    const file = path.posix.basename(p.outdoorImageUrl);        // sga_essential_1_5ton_best_1_...png
    const level = (p.packageLevel || "").toLowerCase();          // best/better/good/budget
    const marker = `_${level}_`;
    const idx = file.indexOf(marker);
    if (idx === -1) { misses.push(`${p.tonnage}/${p.packageLevel}: no "${marker}" in ${file}`); continue; }
    const base = file.slice(0, idx + marker.length);            // sga_essential_1_5ton_best_

    const fsDir = path.join(process.cwd(), "attached_assets", dir);
    let coilFile: string | undefined;
    try {
      coilFile = fs.readdirSync(fsDir).find((f) => f.startsWith(`${base}2_`) && f.toLowerCase().endsWith(".png"));
    } catch { /* dir missing */ }

    if (!coilFile) { misses.push(`${p.tier}/${p.tonnage}/${p.packageLevel}: no ${base}2_*.png in ${dir}`); continue; }

    const coilPath = `${dir}/${coilFile}`;
    await db.update(pricebookPackages).set({ coilImageUrl: coilPath, updatedAt: new Date() }).where(eq(pricebookPackages.id, p.id));
    updated++;
  }

  console.log(`[coil-fix] SGA packages: ${rows.length} | updated ${updated}, already ${already}, skipped(no coil) ${skipped}, misses ${misses.length}`);
  misses.slice(0, 20).forEach((m) => console.log("   MISS:", m));
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error("[coil-fix] FAILED:", e); process.exit(1); });
