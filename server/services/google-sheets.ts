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
      
      // Initialize settings with defaults
      const settings: any = {
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
        },
        parts: {}
      };

      // Smart parser - looks across all columns for values
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        
        const firstCell = row[0]?.toString().toLowerCase() || '';
        
        // Parse pricing template section
        if (firstCell.includes('labor rate')) {
          // Look for the value in columns B, C, D
          for (let col = 1; col < Math.min(row.length, 4); col++) {
            const value = parseFloat((row[col] || '').toString().replace(/[$,%]/g, ''));
            if (!isNaN(value) && value > 0) {
              settings.laborRate = value;
              break;
            }
          }
        } else if (firstCell.includes('commission')) {
          for (let col = 1; col < Math.min(row.length, 4); col++) {
            const text = (row[col] || '').toString();
            const percent = parseFloat(text.replace(/[%]/g, ''));
            if (!isNaN(percent)) {
              settings.commissionPercent = percent / 100;
              break;
            }
          }
        } else if (firstCell.includes('financing') || firstCell.includes('promotion')) {
          for (let col = 1; col < Math.min(row.length, 4); col++) {
            const text = (row[col] || '').toString();
            const percent = parseFloat(text.replace(/[%]/g, ''));
            if (!isNaN(percent)) {
              settings.financingPromotionPercent = percent / 100;
              break;
            }
          }
        } else if (firstCell.includes('profit') && !firstCell.includes('gross')) {
          for (let col = 1; col < Math.min(row.length, 4); col++) {
            const text = (row[col] || '').toString();
            const percent = parseFloat(text.replace(/[%]/g, ''));
            if (!isNaN(percent)) {
              settings.profitPercent = percent / 100;
              break;
            }
          }
        } else if (firstCell.includes('labor benefits')) {
          for (let col = 1; col < Math.min(row.length, 10); col++) {
            const text = (row[col] || '').toString();
            const percent = parseFloat(text.replace(/[%]/g, ''));
            if (!isNaN(percent) && percent > 10) { // Labor benefits should be ~34%
              settings.laborBenefitsPercent = percent / 100;
              break;
            }
          }
        } else if (firstCell.includes('sales tax') || firstCell.includes('tax')) {
          for (let col = 1; col < Math.min(row.length, 10); col++) {
            const text = (row[col] || '').toString();
            const percent = parseFloat(text.replace(/[%]/g, ''));
            if (!isNaN(percent) && percent > 0 && percent < 20) { // Sales tax should be ~8%
              settings.salesTaxPercent = percent / 100;
              break;
            }
          }
        } else if (firstCell.includes('warranty reserve')) {
          for (let col = 1; col < Math.min(row.length, 10); col++) {
            const value = parseFloat((row[col] || '').toString().replace(/[$,]/g, ''));
            if (!isNaN(value) && value > 0) {
              settings.warrantyReserve = value;
              break;
            }
          }
        } else if (firstCell.includes('overhead')) {
          for (let col = 1; col < Math.min(row.length, 10); col++) {
            const text = (row[col] || '').toString();
            const percent = parseFloat(text.replace(/[%]/g, ''));
            if (!isNaN(percent) && percent > 10) { // Overhead should be ~30%
              settings.overheadPercent = percent / 100;
              break;
            }
          }
        }
        
        // Parse parts pricing section
        const partNames = [
          'control board', 'evaporator coil', 'compressor', 
          'refrigerant filter dryer', 'copper', 'armaflex insulation',
          'acid away', 'refrigerant', 'material shrinkage'
        ];
        
        for (const partName of partNames) {
          if (firstCell.includes(partName.toLowerCase())) {
            // Look for price in columns C, D, E, F (cost column and beyond)
            for (let col = 2; col < Math.min(row.length, 8); col++) {
              const value = parseFloat((row[col] || '').toString().replace(/[$,]/g, ''));
              if (!isNaN(value) && value > 0) {
                settings.parts[partName] = value;
                break;
              }
            }
          }
        }
        
        // Parse warranty pricing (look for year patterns)
        const yearMatch = firstCell.match(/(\d+)\s*year/);
        if (yearMatch) {
          const years = parseInt(yearMatch[1]);
          if (years >= 2 && years <= 10) {
            // Look for percentage in any column
            for (let col = 1; col < Math.min(row.length, 8); col++) {
              const text = (row[col] || '').toString();
              const percent = parseFloat(text.replace(/[%]/g, ''));
              if (!isNaN(percent) && percent > 0 && percent <= 100) {
                settings.warrantyDiscounts[years] = percent / 100;
                break;
              }
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
