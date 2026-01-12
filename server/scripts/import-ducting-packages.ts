import { db, pool } from "../db";
import { pricebookPackages } from "@shared/schema";
import fs from "fs";
import path from "path";

interface JsonPackage {
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  monthlyPayment: string | number;
  totalInvestment: string | number;
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

async function importDuctingPackages() {
  const packagesPath = path.join(process.cwd(), "attached_assets/pricebook-packages.json");
  const packagesData: JsonPackage[] = JSON.parse(fs.readFileSync(packagesPath, "utf-8"));

  const ductingPackages = packagesData.filter((p) => p.unitType === "Ducting");
  console.log(`Importing ${ductingPackages.length} Ducting packages...`);

  let imported = 0;

  for (const pkg of ductingPackages) {
    try {
      const monthlyPayment = Math.round(Number(pkg.monthlyPayment) * 100);
      const totalInvestment = Math.round(Number(pkg.totalInvestment) * 100);

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
      console.log(`Imported: ${pkg.packageLevel}`);
    } catch (err: any) {
      console.error(`Error importing ${pkg.packageLevel}: ${err.message}`);
    }
  }

  console.log(`Complete: ${imported} Ducting packages imported`);
  await pool.end();
  process.exit(0);
}

importDuctingPackages().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
