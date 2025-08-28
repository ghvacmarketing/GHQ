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

  async getSettings(): Promise<SheetsSettings> {
    try {
      const range = 'Settings!B2:B5'; // Assuming settings in column B
      const url = `${this.baseUrl}/${this.config.spreadsheetId}/values/${range}?key=${this.config.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Sheets API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      const values = data.values || [];
      
      return {
        laborRate: parseFloat(values[0]?.[0]) || 75,
        taxRate: parseFloat(values[1]?.[0]) || 0.07,
        markupPercentage: parseFloat(values[2]?.[0]) || 0.25,
        warrantyDiscountRate: parseFloat(values[3]?.[0]) || 0.1,
      };
    } catch (error) {
      console.error('Error fetching settings from Google Sheets:', error);
      return {
        laborRate: 75,
        taxRate: 0.07,
        markupPercentage: 0.25,
        warrantyDiscountRate: 0.1,
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
