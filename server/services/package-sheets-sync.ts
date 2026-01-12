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

  async importPackagesFromSheet(): Promise<SheetHvacPackage[]> {
    if (!this.isConfigured()) {
      console.warn('PackageSheetsService: Not configured, skipping import');
      return [];
    }

    try {
      const range = 'HVAC_Packages!A2:S1000';
      const url = `${this.baseUrl}/${this.config.spreadsheetId}/values/${range}?key=${this.config.apiKey}`;
      
      console.log('PackageSheetsService: Fetching HVAC packages from sheet...');
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
          monthlyPayment: this.parseDollarsToCents(row[4]),
          totalInvestment: this.parseDollarsToCents(row[5]),
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
