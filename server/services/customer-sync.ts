import { createHmac } from "crypto";
import { storage } from "../storage";
import { InsertCustomer } from "@shared/schema";

interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: number;
}

interface SyncStatus {
  lastSyncTime: Date | null;
  lastCheckTime: Date | null;
  lastSyncResult: SyncResult | null;
  lastError: string | null;
  dataHash: string | null;
  syncCount: number;
  lastSyncCountReset: Date;
}

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

const SYNC_STATUS_KEY = 'customer_sync_status';

class CustomerSyncService {
  private apiKey: string;
  private sheetId: string;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  private autoSyncInterval: NodeJS.Timeout | null = null;
  private statusLoaded: boolean = false;
  
  private syncStatus: SyncStatus = {
    lastSyncTime: null,
    lastCheckTime: null,
    lastSyncResult: null,
    lastError: null,
    dataHash: null,
    syncCount: 0,
    lastSyncCountReset: new Date(),
  };

  constructor() {
    this.apiKey = process.env.GOOGLE_SHEETS_API_KEY || '';
    this.sheetId = process.env.FIELDEDGE_CUSTOMER_SHEET_ID || '1POeQRuDUTia0BUYsVmEsBOqW6BDBvfL5qyKv-GQICU0';
    
    if (!this.apiKey) {
      console.warn('Google Sheets API key not configured for customer sync');
    }
    
    this.loadStatusFromDatabase();
  }

  private async loadStatusFromDatabase(): Promise<void> {
    try {
      const setting = await storage.getSetting(SYNC_STATUS_KEY);
      if (setting?.value) {
        const parsed = JSON.parse(setting.value);
        this.syncStatus = {
          lastSyncTime: parsed.lastSyncTime ? new Date(parsed.lastSyncTime) : null,
          lastCheckTime: parsed.lastCheckTime ? new Date(parsed.lastCheckTime) : null,
          lastSyncResult: parsed.lastSyncResult || null,
          lastError: parsed.lastError || null,
          dataHash: parsed.dataHash || null,
          syncCount: parsed.syncCount || 0,
          lastSyncCountReset: parsed.lastSyncCountReset ? new Date(parsed.lastSyncCountReset) : new Date(),
        };
        console.log('Customer sync status loaded from database');
      }
      this.statusLoaded = true;
    } catch (error) {
      console.error('Failed to load customer sync status from database:', error);
      this.statusLoaded = true;
    }
  }

  private async saveStatusToDatabase(): Promise<void> {
    try {
      const statusJson = JSON.stringify({
        lastSyncTime: this.syncStatus.lastSyncTime?.toISOString() || null,
        lastCheckTime: this.syncStatus.lastCheckTime?.toISOString() || null,
        lastSyncResult: this.syncStatus.lastSyncResult,
        lastError: this.syncStatus.lastError,
        dataHash: this.syncStatus.dataHash,
        syncCount: this.syncStatus.syncCount,
        lastSyncCountReset: this.syncStatus.lastSyncCountReset.toISOString(),
      });
      await storage.setSetting(SYNC_STATUS_KEY, statusJson);
    } catch (error) {
      console.error('Failed to save customer sync status to database:', error);
    }
  }

  private resetDailyCounterIfNeeded(): void {
    const now = new Date();
    const lastReset = this.syncStatus.lastSyncCountReset;
    
    if (now.getDate() !== lastReset.getDate() || 
        now.getMonth() !== lastReset.getMonth() || 
        now.getFullYear() !== lastReset.getFullYear()) {
      this.syncStatus.syncCount = 0;
      this.syncStatus.lastSyncCountReset = now;
      console.log('Customer sync daily counter reset');
    }
  }

  private calculateRowChecksum(row: SheetRow): string {
    const dataString = JSON.stringify({
      displayName: row["Display Name"] || '',
      customerType: row["Customer Type"] || '',
      customerStatus: row["Customer Status"] || '',
      fullAddress: row["Full Address"] || '',
      phone: row["Phone"] || '',
      email: row["Email"] || '',
      leadSource: row["Lead Source"] || '',
    });
    
    return createHmac('sha256', 'customer-sync')
      .update(dataString)
      .digest('hex');
  }

  private calculateDataHash(rows: SheetRow[]): string {
    const allData = rows.map(row => this.calculateRowChecksum(row)).join('');
    return createHmac('sha256', 'customer-sync-dataset')
      .update(allData)
      .digest('hex');
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

  private transformRowToCustomer(row: SheetRow): InsertCustomer {
    const checksum = this.calculateRowChecksum(row);
    
    // Normalize customer type - default to Residential if empty
    let customerType = row["Customer Type"]?.trim() || null;
    if (!customerType) {
      customerType = "Residential";
    }
    
    // Normalize customer status - "Customer" or "Prospect"
    const customerStatus = row["Customer Status"]?.trim() || "Customer";
    
    return {
      displayName: row["Display Name"]?.trim() || 'Unknown',
      customerType,
      customerStatus,
      fullAddress: row["Full Address"]?.trim() || null,
      phone: this.cleanPhoneNumber(row["Phone"]),
      email: row["Email"]?.trim() || null,
      leadSource: row["Lead Source"]?.trim() || null,
      checksum,
    };
  }

  private async fetchSheetData(): Promise<SheetRow[]> {
    if (!this.apiKey) {
      throw new Error('Google Sheets API key not configured');
    }

    const range = encodeURIComponent('Sheet1');
    const url = `${this.baseUrl}/${this.sheetId}/values/${range}?key=${this.apiKey}`;

    console.log('Fetching customer data from Google Sheets...');
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Sheets API error:', response.status, response.statusText, errorText);
      throw new Error(`Google Sheets API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.values || data.values.length === 0) {
      console.log('No data found in sheet');
      return [];
    }

    const headers = data.values[0] as string[];
    const rows = data.values.slice(1) as string[][];
    
    const parsedRows: SheetRow[] = rows.map((row: string[]) => {
      const rowObj: SheetRow = {};
      headers.forEach((header: string, index: number) => {
        rowObj[header] = row[index] || '';
      });
      return rowObj;
    });

    console.log(`Fetched ${parsedRows.length} customer rows from Google Sheets`);
    return parsedRows;
  }

  async syncCustomersFromSheet(): Promise<SyncResult | 'no_change'> {
    this.resetDailyCounterIfNeeded();
    
    try {
      console.log('Starting customer sync from Google Sheets...');
      
      const rows = await this.fetchSheetData();
      this.syncStatus.lastCheckTime = new Date();
      
      if (rows.length === 0) {
        console.log('No customer data to sync');
        this.syncStatus.lastError = null;
        return { created: 0, updated: 0, deleted: 0, skipped: 0, errors: 0 };
      }

      const newDataHash = this.calculateDataHash(rows);
      
      if (this.syncStatus.dataHash === newDataHash) {
        console.log('Customer data unchanged, skipping sync');
        this.syncStatus.lastError = null;
        return 'no_change';
      }

      const customers: InsertCustomer[] = rows
        .filter(row => row["Display Name"]?.trim())
        .map(row => this.transformRowToCustomer(row));

      console.log(`Importing ${customers.length} customers...`);
      
      const result = await storage.batchImportCustomers(customers);
      
      const validChecksums = customers
        .map(c => c.checksum)
        .filter((checksum): checksum is string => !!checksum);
      
      let deleted = 0;
      if (validChecksums.length > 0) {
        deleted = await storage.deleteCustomersNotInChecksums(validChecksums);
        if (deleted > 0) {
          console.log(`Deleted ${deleted} customers not in source sheet`);
        }
      }
      
      const fullResult: SyncResult = {
        created: result.created,
        updated: result.updated,
        deleted,
        skipped: result.skipped,
        errors: result.errors,
      };
      
      this.syncStatus.lastSyncTime = new Date();
      this.syncStatus.lastSyncResult = fullResult;
      this.syncStatus.lastError = null;
      this.syncStatus.dataHash = newDataHash;
      this.syncStatus.syncCount++;
      
      await this.saveStatusToDatabase();
      
      console.log(`Customer sync complete: ${fullResult.created} created, ${fullResult.updated} updated, ${fullResult.deleted} deleted, ${fullResult.skipped} skipped, ${fullResult.errors} errors`);
      
      return fullResult;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Customer sync failed:', errorMessage);
      
      this.syncStatus.lastCheckTime = new Date();
      this.syncStatus.lastError = errorMessage;
      
      await this.saveStatusToDatabase();
      
      throw error;
    }
  }

  getCustomerSyncStatus(): SyncStatus {
    this.resetDailyCounterIfNeeded();
    return { ...this.syncStatus };
  }

  resetSyncHash(): void {
    this.syncStatus.dataHash = null;
    console.log('Customer sync hash reset - next sync will force import');
  }

  startAutoSync(intervalMinutes: number): void {
    if (this.autoSyncInterval) {
      console.log('Auto-sync already running, stopping previous interval');
      this.stopAutoSync();
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    
    console.log(`Starting customer auto-sync every ${intervalMinutes} minutes`);
    
    this.syncCustomersFromSheet().catch(err => {
      console.error('Initial customer sync failed:', err);
    });
    
    this.autoSyncInterval = setInterval(async () => {
      try {
        await this.syncCustomersFromSheet();
      } catch (err) {
        console.error('Scheduled customer sync failed:', err);
      }
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
      console.log('Customer auto-sync stopped');
    }
  }
}

const customerSyncService = new CustomerSyncService();

export const syncCustomersFromSheet = () => customerSyncService.syncCustomersFromSheet();
export const getCustomerSyncStatus = () => customerSyncService.getCustomerSyncStatus();
export const resetSyncHash = () => customerSyncService.resetSyncHash();
export const startAutoSync = (intervalMinutes: number) => customerSyncService.startAutoSync(intervalMinutes);
export const stopAutoSync = () => customerSyncService.stopAutoSync();
