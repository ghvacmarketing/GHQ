// Google Sheets ties have been removed. This module no longer contacts the
// Google Sheets API. Pricing/business-rate values are served from local
// defaults; data now flows into the app exclusively via import/export.
// The class shape and exports are preserved so existing callers keep working.

interface GoogleSheetsData {
  // Labor and business rates
  laborRate: number;
  commissionPercent: number;
  financingPromotionPercent: number;
  profitPercent: number;

  // Parts prices
  refrigerantFilterDryerPrice: number;
  copperPrice: number;
  armaflexInsulationPrice: number;
  acidAwayPrice: number;
  refrigerantPrice: number;

  // Business calculations
  materialShrinkagePercent: number;
  laborBenefitsPercent: number;
  salesTaxPercent: number;
  warrantyReserve: number;
  overheadPercent: number;
  profitPercentB42: number;
  financingCostPercent: number;
  commissionPercentB44: number;
}

const DEFAULT_VALUES: GoogleSheetsData = {
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
  warrantyReserve: 25.0,
  overheadPercent: 0.3,
  profitPercentB42: 0.15,
  financingCostPercent: 0.03,
  commissionPercentB44: 0.03,
};

class GoogleSheetsService {
  getCacheMetadata(): { cached: boolean; timestamp: number | null; age: number | null } {
    // No external cache anymore; report as not cached.
    return { cached: false, timestamp: null, age: null };
  }

  invalidateCache(): void {
    // No-op: nothing to invalidate now that Sheets is disconnected.
  }

  async fetchCellValues(_forceRefresh: boolean = false): Promise<GoogleSheetsData> {
    return { ...DEFAULT_VALUES };
  }

  async refreshData(): Promise<GoogleSheetsData> {
    return { ...DEFAULT_VALUES };
  }
}

export const googleSheetsService = new GoogleSheetsService();
export type { GoogleSheetsData };
