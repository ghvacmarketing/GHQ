import { db } from "../db";
import { pricebookPackages } from "@shared/schema";
import { eq, and } from "drizzle-orm";

interface PackageSheetsConfig {
  spreadsheetId: string;
  apiKey: string;
}

export interface SheetHvacPackage {
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  monthlyPayment: number; // in cents
  totalInvestment: number; // in cents
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

export interface SheetCrawlspaceTier {
  name: string;
  milThickness: number;
  rollPrice: number; // in cents
  description?: string;
}

export class PackageSheetsService {
  private config: PackageSheetsConfig;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

  constructor() {
    this.config = {
      spreadsheetId: process.env.PRICEBOOK_SHEETS_ID || '',
      apiKey: process.env.GOOGLE_SHEETS_API_KEY || '',
    };
  }

  isConfigured(): boolean {
    return !!this.config.spreadsheetId && !!this.config.apiKey;
  }

  getSpreadsheetId(): string {
    return this.config.spreadsheetId;
  }

  private parseDollarsToCents(value: string | undefined): number {
    if (!value) return 0;
    const cleaned = value.toString().replace(/[$,\s]/g, '');
    const dollars = parseFloat(cleaned);
    if (isNaN(dollars)) return 0;
    return Math.round(dollars * 100);
  }

  // For pricebook-export sheet where values are already in cents
  private parseCentsValue(value: string | undefined): number {
    if (!value) return 0;
    const cleaned = value.toString().replace(/[$,\s]/g, '');
    const cents = parseInt(cleaned, 10);
    if (isNaN(cents)) return 0;
    return cents;
  }

  private parseImageUrl(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const str = value.toString().trim();
    if (!str) return undefined;
    
    // Check if it's an IMAGE() formula and extract the URL
    const imageMatch = str.match(/^=IMAGE\s*\(\s*["']([^"']+)["']\s*\)/i);
    if (imageMatch) {
      return imageMatch[1];
    }
    
    // Otherwise return as-is (it might be a direct URL)
    return str;
  }

  private async getFirstSheetName(): Promise<string> {
    const url = `${this.baseUrl}/${this.config.spreadsheetId}?fields=sheets.properties&key=${this.config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to get sheet metadata');
    }
    
    const data = await response.json();
    if (data.sheets && data.sheets.length > 0) {
      return data.sheets[0].properties.title;
    }
    throw new Error('No sheets found in spreadsheet');
  }

  async importPackagesFromSheet(): Promise<SheetHvacPackage[]> {
    if (!this.isConfigured()) {
      console.warn('PackageSheetsService: Not configured, skipping import');
      return [];
    }

    try {
      // Always use the "pricebook-export" sheet tab explicitly
      const sheetName = 'pricebook-export';
      const range = `${sheetName}!A2:S1000`;
      const url = `${this.baseUrl}/${this.config.spreadsheetId}/values/${range}?key=${this.config.apiKey}`;
      
      console.log(`PackageSheetsService: Fetching HVAC packages from sheet "${sheetName}"...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Sheets API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      console.log(`PackageSheetsService: Found ${rows.length} rows in HVAC_Packages sheet`);
      
      const packages: SheetHvacPackage[] = [];
      
      for (const row of rows) {
        const unitType = (row[0] || '').toString().trim();
        const tier = (row[1] || '').toString().trim();
        const tonnage = (row[2] || '').toString().trim();
        const packageLevel = (row[3] || '').toString().trim();
        
        if (!unitType || !tier || !tonnage || !packageLevel) {
          continue;
        }
        
        packages.push({
          unitType,
          tier,
          tonnage,
          packageLevel,
          monthlyPayment: this.parseCentsValue(row[4]),
          totalInvestment: this.parseCentsValue(row[5]),
          outdoorBrand: (row[6] || '').toString().trim() || undefined,
          outdoorModel: (row[7] || '').toString().trim() || undefined,
          outdoorName: (row[8] || '').toString().trim() || undefined,
          coilModel: (row[9] || '').toString().trim() || undefined,
          coilName: (row[10] || '').toString().trim() || undefined,
          indoorHeatModel: (row[11] || '').toString().trim() || undefined,
          indoorHeatName: (row[12] || '').toString().trim() || undefined,
          thermostatModel: (row[13] || '').toString().trim() || undefined,
          thermostatName: (row[14] || '').toString().trim() || undefined,
          accessoryModels: (row[15] || '').toString().trim() || undefined,
          outdoorImageUrl: this.parseImageUrl(row[16]),
          thermostatImageUrl: this.parseImageUrl(row[17]),
          furnaceImageUrl: this.parseImageUrl(row[18]),
        });
      }
      
      console.log(`PackageSheetsService: Parsed ${packages.length} valid HVAC packages`);
      return packages;
    } catch (error) {
      console.error('PackageSheetsService: Error importing HVAC packages from sheet:', error);
      throw error;
    }
  }

  async importCrawlspaceTiersFromSheet(): Promise<SheetCrawlspaceTier[]> {
    if (!this.isConfigured()) {
      console.warn('PackageSheetsService: Not configured, skipping crawlspace tiers import');
      return [];
    }

    try {
      const range = 'Crawlspace_Tiers!A2:D100';
      const url = `${this.baseUrl}/${this.config.spreadsheetId}/values/${range}?key=${this.config.apiKey}`;
      
      console.log('PackageSheetsService: Fetching crawlspace tiers from sheet...');
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Sheets API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      console.log(`PackageSheetsService: Found ${rows.length} rows in Crawlspace_Tiers sheet`);
      
      const tiers: SheetCrawlspaceTier[] = [];
      
      for (const row of rows) {
        const name = (row[0] || '').toString().trim();
        const milThicknessStr = (row[1] || '').toString().trim();
        
        if (!name || !milThicknessStr) {
          continue;
        }
        
        const milThickness = parseInt(milThicknessStr, 10);
        if (isNaN(milThickness)) {
          console.warn(`PackageSheetsService: Skipping row with invalid milThickness: ${milThicknessStr}`);
          continue;
        }
        
        tiers.push({
          name,
          milThickness,
          rollPrice: this.parseDollarsToCents(row[2]),
          description: (row[3] || '').toString().trim() || undefined,
        });
      }
      
      console.log(`PackageSheetsService: Parsed ${tiers.length} valid crawlspace tiers`);
      return tiers;
    } catch (error) {
      console.error('PackageSheetsService: Error importing crawlspace tiers from sheet:', error);
      throw error;
    }
  }
}

export const packageSheetsService = new PackageSheetsService();

// Auto-sync function for pricebook packages
let pricebookAutoSyncInterval: NodeJS.Timeout | null = null;

export async function syncPricebookPackages(): Promise<{ updated: number; inserted: number; total: number }> {
  if (!packageSheetsService.isConfigured()) {
    console.log('[PricebookSync] Not configured, skipping');
    return { updated: 0, inserted: 0, total: 0 };
  }

  try {
    const packages = await packageSheetsService.importPackagesFromSheet();
    
    if (packages.length === 0) {
      console.log('[PricebookSync] No packages from sheet');
      return { updated: 0, inserted: 0, total: 0 };
    }

    let updatedCount = 0;
    let insertedCount = 0;

    for (const pkg of packages) {
      // Find existing package by unique key (unitType + tier + tonnage + packageLevel)
      const existing = await db.select().from(pricebookPackages)
        .where(
          and(
            eq(pricebookPackages.unitType, pkg.unitType),
            eq(pricebookPackages.tier, pkg.tier),
            eq(pricebookPackages.tonnage, pkg.tonnage),
            eq(pricebookPackages.packageLevel, pkg.packageLevel)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing package - only update fields that have values from sheet
        // Preserve CRM-only data (like images) when sheet doesn't have them
        const updates: Record<string, any> = {};
        
        // Always update pricing fields (these are required)
        if (pkg.monthlyPayment !== undefined) updates.monthlyPayment = pkg.monthlyPayment;
        if (pkg.totalInvestment !== undefined) updates.totalInvestment = pkg.totalInvestment;
        
        // Only update optional fields if they have actual values in the sheet
        if (pkg.outdoorBrand) updates.outdoorBrand = pkg.outdoorBrand;
        if (pkg.outdoorModel) updates.outdoorModel = pkg.outdoorModel;
        if (pkg.outdoorName) updates.outdoorName = pkg.outdoorName;
        if (pkg.coilModel) updates.coilModel = pkg.coilModel;
        if (pkg.coilName) updates.coilName = pkg.coilName;
        if (pkg.indoorHeatModel) updates.indoorHeatModel = pkg.indoorHeatModel;
        if (pkg.indoorHeatName) updates.indoorHeatName = pkg.indoorHeatName;
        if (pkg.thermostatModel) updates.thermostatModel = pkg.thermostatModel;
        if (pkg.thermostatName) updates.thermostatName = pkg.thermostatName;
        if (pkg.accessoryModels) updates.accessoryModels = pkg.accessoryModels;
        
        // Only update image URLs if sheet has them - preserve existing CRM images otherwise
        if (pkg.outdoorImageUrl) updates.outdoorImageUrl = pkg.outdoorImageUrl;
        if (pkg.thermostatImageUrl) updates.thermostatImageUrl = pkg.thermostatImageUrl;
        if (pkg.furnaceImageUrl) updates.furnaceImageUrl = pkg.furnaceImageUrl;
        
        if (Object.keys(updates).length > 0) {
          await db.update(pricebookPackages)
            .set(updates)
            .where(eq(pricebookPackages.id, existing[0].id));
        }
        updatedCount++;
      } else {
        // Insert new package from sheet
        await db.insert(pricebookPackages).values({
          unitType: pkg.unitType,
          tier: pkg.tier,
          tonnage: pkg.tonnage,
          packageLevel: pkg.packageLevel,
          monthlyPayment: pkg.monthlyPayment,
          totalInvestment: pkg.totalInvestment,
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
        insertedCount++;
      }
    }

    console.log(`[PricebookSync] Updated ${updatedCount}, inserted ${insertedCount} (${packages.length} total from sheet)`);
    return { updated: updatedCount, inserted: insertedCount, total: packages.length };
  } catch (error) {
    console.error('[PricebookSync] Error:', error);
    return { updated: 0, inserted: 0, total: 0 };
  }
}

export function startPricebookAutoSync(intervalMinutes: number = 1): void {
  if (pricebookAutoSyncInterval) {
    clearInterval(pricebookAutoSyncInterval);
  }

  console.log(`[PricebookSync] Starting auto-sync every ${intervalMinutes} minute(s)`);
  
  // Run immediately on startup
  syncPricebookPackages().catch(err => console.error('[PricebookSync] Initial sync error:', err));

  // Then run on interval
  pricebookAutoSyncInterval = setInterval(() => {
    syncPricebookPackages().catch(err => console.error('[PricebookSync] Interval sync error:', err));
  }, intervalMinutes * 60 * 1000);
}
