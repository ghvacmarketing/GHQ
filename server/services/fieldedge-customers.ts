// Google Sheets ties have been removed. This service previously hydrated an
// in-memory customer cache from a FieldEdge-exported Google Sheet every few
// minutes. That live sync is gone: customer data now lives in the database and
// flows in exclusively via import/export.
//
// The service shape is preserved (call sites merge these results with DB
// customers) but the cache is now permanently empty, so the database is the
// sole source of truth.

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
  private readonly cacheStatus: CacheStatus = {
    lastFetchTime: null,
    customerCount: 0,
    error: null,
  };

  async refreshCache(): Promise<void> {
    // No-op: Sheets sync removed.
  }

  startAutoRefresh(_intervalMinutes: number = 5): void {
    // No-op: Sheets sync removed.
  }

  stopAutoRefresh(): void {
    // No-op: Sheets sync removed.
  }

  getCustomers(): FieldEdgeCustomer[] {
    return [];
  }

  getCustomerById(_id: string): FieldEdgeCustomer | undefined {
    return undefined;
  }

  searchCustomers(_term: string): FieldEdgeCustomer[] {
    return [];
  }

  getCacheStatus(): CacheStatus {
    return { ...this.cacheStatus };
  }

  isCachePopulated(): boolean {
    return false;
  }
}

export const fieldEdgeCustomerService = new FieldEdgeCustomerService();
