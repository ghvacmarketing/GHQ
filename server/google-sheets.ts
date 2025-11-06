interface GoogleSheetsData {
  // Labor and business rates (C column)
  laborRate: number;
  commissionPercent: number;
  financingPromotionPercent: number;
  profitPercent: number;
  
  // Parts prices (D column)
  refrigerantFilterDryerPrice: number;
  copperPrice: number;
  armaflexInsulationPrice: number;
  acidAwayPrice: number;
  refrigerantPrice: number;
  
  // Business calculations (B and E columns)
  materialShrinkagePercent: number;
  laborBenefitsPercent: number;
  salesTaxPercent: number;
  warrantyReserve: number;
  overheadPercent: number;
  profitPercentB42: number;
  financingCostPercent: number;
  commissionPercentB44: number;
}

interface CachedData {
  data: GoogleSheetsData;
  timestamp: number;
}

class GoogleSheetsService {
  private apiKey: string;
  private sheetId: string;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  private cache: CachedData | null = null;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {
    this.apiKey = process.env.GOOGLE_SHEETS_API_KEY || '';
    this.sheetId = process.env.GOOGLE_SHEET_ID || '';
    
    if (!this.apiKey || !this.sheetId) {
      console.warn('Google Sheets API key or Sheet ID not configured');
    }
  }

  private isCacheValid(): boolean {
    if (!this.cache) return false;
    const now = Date.now();
    const age = now - this.cache.timestamp;
    return age < this.CACHE_TTL;
  }

  getCacheMetadata(): { cached: boolean; timestamp: number | null; age: number | null } {
    if (!this.cache) {
      return { cached: false, timestamp: null, age: null };
    }
    const age = Date.now() - this.cache.timestamp;
    return {
      cached: this.isCacheValid(),
      timestamp: this.cache.timestamp,
      age: age
    };
  }

  invalidateCache(): void {
    this.cache = null;
    console.log('Google Sheets cache invalidated');
  }

  async fetchCellValues(forceRefresh: boolean = false): Promise<GoogleSheetsData> {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && this.isCacheValid() && this.cache) {
      console.log('Returning cached Google Sheets data (age: ' + Math.round((Date.now() - this.cache.timestamp) / 1000 / 60) + ' minutes)');
      return this.cache.data;
    }

    if (!this.apiKey || !this.sheetId) {
      console.error('Google Sheets API key or Sheet ID not configured');
      // If we have a previous cache, use it
      if (this.cache) {
        console.log('Using cached data due to missing credentials (age: ' + Math.round((Date.now() - this.cache.timestamp) / 1000 / 60) + ' minutes)');
        return this.cache.data;
      }
      // No cache available - throw error
      throw new Error('Google Sheets API credentials not configured and no cached data available. Cannot generate accurate quotes.');
    }

    console.log('Fetching fresh data from Google Sheets...');
    const previousCache = this.cache; // Store previous cache in case fetch fails
    try {
      // Define all the cell ranges we need to fetch
      const ranges = [
        'Template!C5',   // Labor Rate
        'Template!C6',   // Commission %
        'Template!C7',   // Financing/Promotion %
        'Template!C8',   // Profit %
        'Template!D20',  // Refrigerant Filter Dryer price
        'Template!D21',  // Copper price
        'Template!D22',  // Armaflex Insulation price
        'Template!D23',  // Acid Away price
        'Template!D24',  // Refrigerant price
        'Template!B25',  // Material Shrinkage %
        'Template!B34',  // Labor Benefits %
        'Template!B38',  // Sales Tax %
        'Template!E39',  // Warranty Reserve $
        'Template!B41',  // Overhead %
        'Template!B42',  // Profit %
        'Template!B43',  // Financing Cost %
        'Template!B44'   // Commission %
      ];

      const rangeQuery = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join('&');
      const url = `${this.baseUrl}/${this.sheetId}/values:batchGet?${rangeQuery}&key=${this.apiKey}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Sheets API error:', response.status, response.statusText, errorText);
        
        // If we had a previous cache and fetch failed, restore it and return cached data
        if (previousCache) {
          this.cache = previousCache;
          console.log('API error, restored previous cache (age: ' + Math.round((Date.now() - previousCache.timestamp) / 1000 / 60) + ' minutes)');
          return previousCache.data;
        }
        
        // No previous cache available - CANNOT provide accurate quotes without Google Sheets data
        throw new Error(`Google Sheets sync failed and no cached data available. Cannot generate accurate quotes. API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract values from the response
      const values = data.valueRanges.map((range: any) => {
        const cellValue = range.values?.[0]?.[0];
        // Handle percentage values (remove % and convert to decimal)
        if (typeof cellValue === 'string' && cellValue.includes('%')) {
          return parseFloat(cellValue.replace('%', '')) / 100;
        }
        // Handle dollar values (remove $ and convert to number)
        if (typeof cellValue === 'string' && cellValue.includes('$')) {
          return parseFloat(cellValue.replace('$', ''));
        }
        return parseFloat(cellValue) || 0;
      });

      const fetchedData = {
        // Labor and business rates (C5-C8) - kept for backward compatibility but not used
        laborRate: values[0] || 65,
        commissionPercent: values[1] || 0.03,
        financingPromotionPercent: values[2] || 0.03,
        profitPercent: values[3] || 0.15,
        
        // Parts prices (D20-D24)
        refrigerantFilterDryerPrice: values[4] || 0,
        copperPrice: values[5] || 0,
        armaflexInsulationPrice: values[6] || 0,
        acidAwayPrice: values[7] || 0,
        refrigerantPrice: values[8] || 0,
        
        // Business calculations (B25, B34, B38, E39, B41-B44)
        materialShrinkagePercent: values[9] || 0.03,
        laborBenefitsPercent: values[10] || 0.34,
        salesTaxPercent: values[11] || 0.08,
        warrantyReserve: values[12] || 25.00,
        overheadPercent: values[13] || 0.30,
        profitPercentB42: values[14] || 0.15,
        financingCostPercent: values[15] || 0.03,
        commissionPercentB44: values[16] || 0.03,
      };

      // Store in cache
      this.cache = {
        data: fetchedData,
        timestamp: Date.now()
      };
      console.log('Google Sheets data cached successfully');

      return fetchedData;

    } catch (error) {
      console.error('Error fetching Google Sheets data:', error);
      
      // If we had a previous cache and fetch failed, restore it and return cached data
      if (previousCache) {
        this.cache = previousCache;
        console.log('Fetch failed, restored previous cache (age: ' + Math.round((Date.now() - previousCache.timestamp) / 1000 / 60) + ' minutes)');
        return previousCache.data;
      }
      
      // No previous cache available - CANNOT provide accurate quotes without Google Sheets data
      throw new Error(`Google Sheets sync failed and no cached data available. Cannot generate accurate quotes. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getDefaultValues(): GoogleSheetsData {
    return {
      laborRate: 65,
      commissionPercent: 0.03,
      financingPromotionPercent: 0.03,
      profitPercent: 0.15,
      refrigerantFilterDryerPrice: 0,
      copperPrice: 0,
      armaflexInsulationPrice: 0,
      acidAwayPrice: 0,
      refrigerantPrice: 0,
      materialShrinkagePercent: 0.03,
      laborBenefitsPercent: 0.34,
      salesTaxPercent: 0.08,
      warrantyReserve: 25.00,
      overheadPercent: 0.30,
      profitPercentB42: 0.15,
      financingCostPercent: 0.03,
      commissionPercentB44: 0.03,
    };
  }

  async refreshData(): Promise<GoogleSheetsData> {
    console.log('Forcing refresh of Google Sheets data...');
    return await this.fetchCellValues(true); // Force refresh
  }
}

export const googleSheetsService = new GoogleSheetsService();
export type { GoogleSheetsData };