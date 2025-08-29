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

class GoogleSheetsService {
  private apiKey: string;
  private sheetId: string;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

  constructor() {
    this.apiKey = process.env.GOOGLE_SHEETS_API_KEY || '';
    this.sheetId = process.env.GOOGLE_SHEET_ID || '';
    
    if (!this.apiKey || !this.sheetId) {
      console.warn('Google Sheets API key or Sheet ID not configured');
    }
  }

  async fetchCellValues(): Promise<GoogleSheetsData> {
    if (!this.apiKey || !this.sheetId) {
      return this.getDefaultValues();
    }

    try {
      // Define all the cell ranges we need to fetch
      const ranges = [
        'C5',   // Labor Rate
        'C6',   // Commission %
        'C7',   // Financing/Promotion %
        'C8',   // Profit %
        'D20',  // Refrigerant Filter Dryer price
        'D21',  // Copper price
        'D22',  // Armaflex Insulation price
        'D23',  // Acid Away price
        'D24',  // Refrigerant price
        'B25',  // Material Shrinkage %
        'B34',  // Labor Benefits %
        'B38',  // Sales Tax %
        'E39',  // Warranty Reserve $
        'B41',  // Overhead %
        'B42',  // Profit %
        'B43',  // Financing Cost %
        'B44'   // Commission %
      ];

      const rangeQuery = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join('&');
      const url = `${this.baseUrl}/${this.sheetId}/values:batchGet?${rangeQuery}&key=${this.apiKey}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('Google Sheets API error:', response.status, response.statusText);
        return this.getDefaultValues();
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

      return {
        // Labor and business rates (C5-C8)
        laborRate: values[0] || 65,
        commissionPercent: values[1] || 0.03,
        financingPromotionPercent: values[2] || 0.04,
        profitPercent: values[3] || 0.21,
        
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
        profitPercentB42: values[14] || 0.21,
        financingCostPercent: values[15] || 0.04,
        commissionPercentB44: values[16] || 0.03,
      };

    } catch (error) {
      console.error('Error fetching Google Sheets data:', error);
      return this.getDefaultValues();
    }
  }

  private getDefaultValues(): GoogleSheetsData {
    return {
      laborRate: 65,
      commissionPercent: 0.03,
      financingPromotionPercent: 0.04,
      profitPercent: 0.21,
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
      profitPercentB42: 0.21,
      financingCostPercent: 0.04,
      commissionPercentB44: 0.03,
    };
  }

  async refreshData(): Promise<GoogleSheetsData> {
    return await this.fetchCellValues();
  }
}

export const googleSheetsService = new GoogleSheetsService();
export type { GoogleSheetsData };