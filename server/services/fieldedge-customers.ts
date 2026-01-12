import type { Customer } from "@shared/schema";
import { createHash } from "crypto";

interface SheetRow {
  "Display Name"?: string;
  "Customer Type"?: string;
  "Customer Status"?: string;
  "Full Address"?: string;
  "Phone"?: string;
  "Email"?: string;
  "Lead Source"?: string;
  [key: string]: string | undefined;
}

export interface FieldEdgeCustomer {
  id: string;
  displayName: string;
  customerType: string | null;
  customerStatus: string;
  fullAddress: string | null;
  phone: string | null;
  email: string | null;
  leadSource: string | null;
  source: 'fieldedge';
  createdAt: Date;
}

interface CacheStatus {
  lastFetchTime: Date | null;
  customerCount: number;
  error: string | null;
}

class FieldEdgeCustomerService {
  private apiKey: string;
  private sheetId: string;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  private cache: FieldEdgeCustomer[] = [];
  private cacheStatus: CacheStatus = {
    lastFetchTime: null,
    customerCount: 0,
    error: null
  };
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;

  constructor() {
    this.apiKey = process.env.GOOGLE_SHEETS_API_KEY || '';
    this.sheetId = process.env.FIELDEDGE_CUSTOMER_SHEET_ID || '1POeQRuDUTia0BUYsVmEsBOqW6BDBvfL5qyKv-GQICU0';
  }

  private cleanPhoneNumber(phone: string | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone.trim() || null;
  }

  private generateStableId(row: SheetRow): string {
    const name = (row["Display Name"] || '').trim().toLowerCase();
    const phone = this.normalizePhoneForHash(row["Phone"]);
    const email = (row["Email"] || '').trim().toLowerCase();
    const hashInput = `${name}|${phone}|${email}`;
    const hash = createHash('sha256').update(hashInput).digest('hex').substring(0, 12);
    return `fieldedge-${hash}`;
  }

  private normalizePhoneForHash(phone: string | undefined): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  private formatDisplayName(rawName: string | undefined): string {
    if (!rawName) return 'Unknown';
    
    const name = rawName.trim();
    if (!name) return 'Unknown';
    
    // Remove leading special characters and quotes
    let cleanName = name.replace(/^["'&\s]+/, '').replace(/["']+$/, '');
    
    // Check if name is in "Last, First" format
    if (cleanName.includes(',')) {
      const parts = cleanName.split(',').map(p => p.trim());
      if (parts.length >= 2 && parts[1]) {
        // Reverse to "First Last" format
        const firstName = parts[1];
        const lastName = parts[0];
        return `${firstName} ${lastName}`.trim();
      }
    }
    
    // Return as-is if not in comma format
    return cleanName || name;
  }

  private transformRowToCustomer(row: SheetRow): FieldEdgeCustomer {
    let customerType = row["Customer Type"]?.trim() || null;
    if (!customerType) {
      customerType = "Residential";
    }
    const customerStatus = row["Customer Status"]?.trim() || "Customer";

    return {
      id: this.generateStableId(row),
      displayName: this.formatDisplayName(row["Display Name"]),
      customerType,
      customerStatus,
      fullAddress: row["Full Address"]?.trim() || null,
      phone: this.cleanPhoneNumber(row["Phone"]),
      email: row["Email"]?.trim() || null,
      leadSource: row["Lead Source"]?.trim() || null,
      source: 'fieldedge',
      createdAt: new Date()
    };
  }

  private async getFirstSheetName(): Promise<string> {
    const url = `${this.baseUrl}/${this.sheetId}?fields=sheets.properties&key=${this.apiKey}`;
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

  private async fetchSheetData(): Promise<SheetRow[]> {
    if (!this.apiKey) {
      throw new Error('Google Sheets API key not configured');
    }

    // Auto-detect the first sheet name
    const sheetName = await this.getFirstSheetName();
    const range = encodeURIComponent(sheetName);
    const url = `${this.baseUrl}/${this.sheetId}/values/${range}?key=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FieldEdge] Google Sheets API error:', response.status, errorText);
      throw new Error(`Google Sheets API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.values || data.values.length === 0) {
      return [];
    }

    const headers = data.values[0] as string[];
    const rows = data.values.slice(1) as string[][];

    return rows.map((row: string[]) => {
      const rowObj: SheetRow = {};
      headers.forEach((header: string, index: number) => {
        rowObj[header] = row[index] || '';
      });
      return rowObj;
    });
  }

  async refreshCache(): Promise<void> {
    if (this.isRefreshing) {
      console.log('[FieldEdge] Cache refresh already in progress, skipping');
      return;
    }

    this.isRefreshing = true;

    try {
      console.log('[FieldEdge] Refreshing customer cache from Google Sheets...');
      const rows = await this.fetchSheetData();

      this.cache = rows
        .filter(row => row["Display Name"]?.trim())
        .map((row) => this.transformRowToCustomer(row));

      this.cacheStatus = {
        lastFetchTime: new Date(),
        customerCount: this.cache.length,
        error: null
      };

      console.log(`[FieldEdge] Cached ${this.cache.length} customers from Google Sheets`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[FieldEdge] Failed to refresh cache:', errorMessage);
      this.cacheStatus.error = errorMessage;
    } finally {
      this.isRefreshing = false;
    }
  }

  startAutoRefresh(intervalMinutes: number = 5): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    console.log(`[FieldEdge] Starting auto-refresh every ${intervalMinutes} minutes`);

    this.refreshCache().catch(err => {
      console.error('[FieldEdge] Initial cache refresh failed:', err);
    });

    this.refreshInterval = setInterval(() => {
      this.refreshCache().catch(err => {
        console.error('[FieldEdge] Scheduled cache refresh failed:', err);
      });
    }, intervalMinutes * 60 * 1000);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('[FieldEdge] Auto-refresh stopped');
    }
  }

  getCustomers(): FieldEdgeCustomer[] {
    return [...this.cache];
  }

  getCustomerById(id: string): FieldEdgeCustomer | undefined {
    return this.cache.find(c => c.id === id);
  }

  searchCustomers(term: string): FieldEdgeCustomer[] {
    const lowerTerm = term.toLowerCase();
    return this.cache.filter(c =>
      c.displayName.toLowerCase().includes(lowerTerm) ||
      c.phone?.includes(term) ||
      c.email?.toLowerCase().includes(lowerTerm) ||
      c.fullAddress?.toLowerCase().includes(lowerTerm)
    );
  }

  getCacheStatus(): CacheStatus {
    return { ...this.cacheStatus };
  }

  isCachePopulated(): boolean {
    return this.cache.length > 0;
  }
}

export const fieldEdgeCustomerService = new FieldEdgeCustomerService();
