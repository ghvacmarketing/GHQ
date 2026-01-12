import { db, pool } from "../db";
import { pricebookPackages } from "@shared/schema";
import fs from "fs";
import path from "path";
import { sql } from "drizzle-orm";

interface JsonPackage {
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  monthlyPayment: string;
  totalInvestment: string;
  outdoorBrand?: string;
  outdoorModel?: string;
  outdoorName?: string;
  coilModel?: string;
  coilName?: string;
  indoorHeatModel?: string;
  indoorHeatName?: string;
  thermostatModel?: string;
  thermostatName?: string;
  accessoryModels?: string;
  outdoorImageUrl?: string;
  thermostatImageUrl?: string;
  furnaceImageUrl?: string;
}

async function importPackages() {
  const packagesPath = path.join(process.cwd(), "attached_assets/pricebook-packages.json");
  const packagesData: JsonPackage[] = JSON.parse(fs.readFileSync(packagesPath, "utf-8"));

  console.log(`Importing ${packagesData.length} packages...`);

  let imported = 0;
  let errors = 0;

  for (const pkg of packagesData) {
    try {
      const monthlyPayment = parseInt(pkg.monthlyPayment) * 100;
      const totalInvestment = parseInt(pkg.totalInvestment) * 100;

      await db.insert(pricebookPackages).values({
        unitType: pkg.unitType,
        tier: pkg.tier,
        tonnage: pkg.tonnage,
        packageLevel: pkg.packageLevel,
        monthlyPayment,
        totalInvestment,
        outdoorBrand: pkg.outdoorBrand || null,
        outdoorModel: pkg.outdoorModel || null,
        outdoorName: pkg.outdoorName || null,
        coilModel: pkg.coilModel || null,
        coilName: pkg.coilName || null,
        indoorHeatModel: pkg.indoorHeatModel || null,
        indoorHeatName: pkg.indoorHeatName || null,
        thermostatModel: pkg.thermostatModel || null,
        thermostatName: pkg.thermostatName || null,
        accessoryModels: pkg.accessoryModels || null,
        outdoorImageUrl: pkg.outdoorImageUrl || null,
        thermostatImageUrl: pkg.thermostatImageUrl || null,
        furnaceImageUrl: pkg.furnaceImageUrl || null,
        isActive: true,
      });
      imported++;
      if (imported % 50 === 0) {
        console.log(`Progress: ${imported}/${packagesData.length}`);
      }
    } catch (err: any) {
      console.error(`Error importing package: ${pkg.unitType} ${pkg.tier} ${pkg.tonnage} ${pkg.packageLevel}`);
      console.error(err.message);
      errors++;
    }
  }

  console.log(`\nComplete: ${imported} imported, ${errors} errors`);
  await pool.end();
  process.exit(0);
}

importPackages().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
