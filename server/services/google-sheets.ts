interface GoogleSheetsConfig {
  spreadsheetId: string;
  apiKey: string;
}

interface SheetsPart {
  partNumber: string;
  description: string;
  category: string;
  price: number;
  availability: string;
  vendor?: string;
  warranty: boolean;
}

interface SheetsSettings {
  laborRate: number;
  taxRate: number;
  markupPercentage: number;
  warrantyDiscountRate: number;
}

export class GoogleSheetsService {
  private config: GoogleSheetsConfig;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

  constructor() {
    this.config = {
      spreadsheetId: process.env.GOOGLE_SHEETS_ID || '',
      apiKey: process.env.GOOGLE_SHEETS_API_KEY || '',
    };
  }

  async getParts(): Promise<SheetsPart[]> {
    try {
      const range = 'Parts!A2:H1000'; // Assuming headers in row 1
      const url = `${this.baseUrl}/${this.config.spreadsheetId}/values/${range}?key=${this.config.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Sheets API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      return rows.map((row: string[]) => ({
        partNumber: row[0] || '',
        description: row[1] || '',
        category: row[2] || '',
        price: parseFloat(row[3]) || 0,
        availability: row[4] || 'Unknown',
        vendor: row[5] || '',
        warranty: row[6]?.toLowerCase() === 'true' || false,
      }));
    } catch (error) {
      console.error('Error fetching parts from Google Sheets:', error);
      return [];
    }
  }

  async getSettings(): Promise<any> {
    try {
      // Get the entire pricing template sheet
      const range = 'Sheet1!A:D'; // Adjust based on your sheet name
      const url = `${this.baseUrl}/${this.config.spreadsheetId}/values/${range}?key=${this.config.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Sheets API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      // Parse the pricing template structure
      const settings: any = {
        laborRate: 65, // Base labor rate
        commissionPercent: 3,
        financingPromotionPercent: 4, 
        profitPercent: 21,
        laborBenefitsPercent: 34,
        salesTaxPercent: 8,
        warrantyReserve: 25,
        overheadPercent: 30,
        // Warranty pricing by years
        warrantyDiscounts: {
          2: 0.25, 3: 0.35, 4: 0.45, 5: 0.50, 6: 0.55,
          7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90
        }
      };

      // Parse specific values from the sheet rows
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        
        const label = row[0]?.toString().toLowerCase() || '';
        const value = row[1]?.toString() || '';
        
        // Extract key pricing values
        if (label.includes('labor rate')) {
          const rate = parseFloat(value.replace(/[$,]/g, ''));
          if (!isNaN(rate)) settings.laborRate = rate;
        } else if (label.includes('commission')) {
          const percent = parseFloat(value.replace(/[%]/g, '')) / 100;
          if (!isNaN(percent)) settings.commissionPercent = percent;
        } else if (label.includes('financing') || label.includes('promotion')) {
          const percent = parseFloat(value.replace(/[%]/g, '')) / 100;
          if (!isNaN(percent)) settings.financingPromotionPercent = percent;
        } else if (label.includes('profit')) {
          const percent = parseFloat(value.replace(/[%]/g, '')) / 100;
          if (!isNaN(percent)) settings.profitPercent = percent;
        } else if (label.includes('labor benefits')) {
          const percent = parseFloat(value.replace(/[%]/g, '')) / 100;
          if (!isNaN(percent)) settings.laborBenefitsPercent = percent;
        } else if (label.includes('sales tax')) {
          const percent = parseFloat(value.replace(/[%]/g, '')) / 100;
          if (!isNaN(percent)) settings.salesTaxPercent = percent;
        } else if (label.includes('warranty reserve')) {
          const amount = parseFloat(value.replace(/[$,]/g, ''));
          if (!isNaN(amount)) settings.warrantyReserve = amount;
        } else if (label.includes('overhead')) {
          const percent = parseFloat(value.replace(/[%]/g, '')) / 100;
          if (!isNaN(percent)) settings.overheadPercent = percent;
        }
      }

      // Look for warranty pricing section
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && row[0]?.toString().includes('Year')) {
          const years = parseInt(row[0].toString().replace(/[^0-9]/g, ''));
          if (years >= 2 && years <= 10 && row[2]) {
            const percent = parseFloat(row[2].toString().replace(/[%]/g, '')) / 100;
            if (!isNaN(percent)) {
              settings.warrantyDiscounts[years] = percent;
            }
          }
        }
      }

      return settings;
    } catch (error) {
      console.error('Error fetching settings from Google Sheets:', error);
      // Return default settings if Google Sheets fails
      return {
        laborRate: 65,
        commissionPercent: 0.03,
        financingPromotionPercent: 0.04,
        profitPercent: 0.21,
        laborBenefitsPercent: 0.34,
        salesTaxPercent: 0.08,
        warrantyReserve: 25,
        overheadPercent: 0.30,
        warrantyDiscounts: {
          2: 0.25, 3: 0.35, 4: 0.45, 5: 0.50, 6: 0.55,
          7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90
        }
      };
    }
  }

  async updatePartsPricing(): Promise<void> {
    // This would be called periodically to sync pricing
    const parts = await this.getParts();
    // Update local storage with fresh pricing data
    console.log(`Updated ${parts.length} parts from Google Sheets`);
  }
}

export const googleSheetsService = new GoogleSheetsService();
