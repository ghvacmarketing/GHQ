import type { Equipment, EquipmentCategory } from "@shared/schema";

interface CachedEquipment {
  categories: EquipmentCategory[];
  timestamp: number;
}

class EquipmentSheetsService {
  private apiKey: string;
  private sheetId: string;
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  private cache: CachedEquipment | null = null;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000;

  constructor() {
    this.apiKey = process.env.GOOGLE_SHEETS_API_KEY || '';
    this.sheetId = process.env.GOOGLE_SHEET_ID || '';
  }

  private isCacheValid(): boolean {
    if (!this.cache) return false;
    const age = Date.now() - this.cache.timestamp;
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
    console.log('Equipment cache invalidated');
  }

  async fetchEquipment(forceRefresh: boolean = false): Promise<EquipmentCategory[]> {
    if (!forceRefresh && this.isCacheValid() && this.cache) {
      console.log('Returning cached equipment data');
      return this.cache.categories;
    }

    if (!this.apiKey || !this.sheetId) {
      console.error('Google Sheets credentials not configured for equipment');
      if (this.cache) {
        return this.cache.categories;
      }
      return this.getDefaultEquipment();
    }

    console.log('Fetching equipment from Google Sheets...');
    const previousCache = this.cache;

    try {
      const url = `${this.baseUrl}/${this.sheetId}/values/Equipment!A:L?key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error('Google Sheets API error for equipment:', response.status);
        if (previousCache) {
          this.cache = previousCache;
          return previousCache.categories;
        }
        return this.getDefaultEquipment();
      }

      const data = await response.json();
      const rows = data.values || [];

      if (rows.length < 2) {
        console.log('No equipment data in sheet, using defaults');
        return this.getDefaultEquipment();
      }

      const headers = rows[0];
      const equipmentList: Equipment[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue;

        const equipment: Equipment = {
          id: `eq-${i}`,
          category: row[0] || '',
          subcategory: row[1] || undefined,
          brand: row[2] || '',
          model: row[3] || '',
          description: row[4] || '',
          tonnage: row[5] || undefined,
          seer: row[6] || undefined,
          afue: row[7] || undefined,
          voltage: row[8] || undefined,
          price: parseFloat(String(row[9] || '0').replace(/[$,]/g, '')) || 0,
          laborHours: parseFloat(row[10] || '0') || undefined,
          warranty: row[11] || undefined,
        };
        equipmentList.push(equipment);
      }

      const categories = this.groupByCategory(equipmentList);
      
      this.cache = {
        categories,
        timestamp: Date.now()
      };
      console.log(`Cached ${equipmentList.length} equipment items in ${categories.length} categories`);

      return categories;

    } catch (error) {
      console.error('Error fetching equipment:', error);
      if (previousCache) {
        this.cache = previousCache;
        return previousCache.categories;
      }
      return this.getDefaultEquipment();
    }
  }

  private groupByCategory(equipment: Equipment[]): EquipmentCategory[] {
    const categoryMap: Record<string, Equipment[]> = {};

    for (const item of equipment) {
      if (!categoryMap[item.category]) {
        categoryMap[item.category] = [];
      }
      categoryMap[item.category].push(item);
    }

    const categories: EquipmentCategory[] = [];
    const categoryNames = Object.keys(categoryMap);
    for (const name of categoryNames) {
      const items = categoryMap[name];
      const subcatSet: Record<string, boolean> = {};
      items.forEach((i: Equipment) => {
        if (i.subcategory) subcatSet[i.subcategory] = true;
      });
      const subcategories = Object.keys(subcatSet);
      categories.push({
        name,
        subcategories,
        equipment: items
      });
    }

    return categories;
  }

  private getDefaultEquipment(): EquipmentCategory[] {
    return [
      {
        name: "Air Conditioners",
        subcategories: ["Single Stage", "Two Stage", "Variable Speed"],
        equipment: [
          { id: "ac-1", category: "Air Conditioners", subcategory: "Single Stage", brand: "Carrier", model: "24ACC636A003", description: "Carrier 3 Ton 14 SEER Air Conditioner", tonnage: "3 Ton", seer: "14 SEER", voltage: "208/230V", price: 2850, laborHours: 8, warranty: "10 Year Parts" },
          { id: "ac-2", category: "Air Conditioners", subcategory: "Single Stage", brand: "Carrier", model: "24ACC648A003", description: "Carrier 4 Ton 14 SEER Air Conditioner", tonnage: "4 Ton", seer: "14 SEER", voltage: "208/230V", price: 3250, laborHours: 8, warranty: "10 Year Parts" },
          { id: "ac-3", category: "Air Conditioners", subcategory: "Two Stage", brand: "Carrier", model: "24ACC748A003", description: "Carrier 4 Ton 17 SEER Two Stage Air Conditioner", tonnage: "4 Ton", seer: "17 SEER", voltage: "208/230V", price: 4150, laborHours: 10, warranty: "10 Year Parts" },
          { id: "ac-4", category: "Air Conditioners", subcategory: "Variable Speed", brand: "Carrier", model: "24VNA948A003", description: "Carrier 4 Ton 21 SEER Variable Speed Air Conditioner", tonnage: "4 Ton", seer: "21 SEER", voltage: "208/230V", price: 5850, laborHours: 12, warranty: "10 Year Parts" },
        ]
      },
      {
        name: "Heat Pumps",
        subcategories: ["Single Stage", "Two Stage", "Variable Speed"],
        equipment: [
          { id: "hp-1", category: "Heat Pumps", subcategory: "Single Stage", brand: "Carrier", model: "25HCC536A003", description: "Carrier 3 Ton 14 SEER Heat Pump", tonnage: "3 Ton", seer: "14 SEER", hspf: "8.2 HSPF", voltage: "208/230V", price: 3150, laborHours: 10, warranty: "10 Year Parts" },
          { id: "hp-2", category: "Heat Pumps", subcategory: "Single Stage", brand: "Carrier", model: "25HCC548A003", description: "Carrier 4 Ton 14 SEER Heat Pump", tonnage: "4 Ton", seer: "14 SEER", hspf: "8.2 HSPF", voltage: "208/230V", price: 3650, laborHours: 10, warranty: "10 Year Parts" },
          { id: "hp-3", category: "Heat Pumps", subcategory: "Variable Speed", brand: "Carrier", model: "25VNA048A003", description: "Carrier 4 Ton 20 SEER Variable Speed Heat Pump", tonnage: "4 Ton", seer: "20 SEER", hspf: "10 HSPF", voltage: "208/230V", price: 6250, laborHours: 14, warranty: "10 Year Parts" },
        ]
      },
      {
        name: "Furnaces",
        subcategories: ["80% AFUE", "96% AFUE"],
        equipment: [
          { id: "furn-1", category: "Furnaces", subcategory: "80% AFUE", brand: "Carrier", model: "58SB0A070E17", description: "Carrier 70,000 BTU 80% AFUE Gas Furnace", btu: "70,000 BTU", afue: "80%", voltage: "115V", price: 1450, laborHours: 6, warranty: "20 Year Heat Exchanger" },
          { id: "furn-2", category: "Furnaces", subcategory: "80% AFUE", brand: "Carrier", model: "58SB0A090E21", description: "Carrier 90,000 BTU 80% AFUE Gas Furnace", btu: "90,000 BTU", afue: "80%", voltage: "115V", price: 1650, laborHours: 6, warranty: "20 Year Heat Exchanger" },
          { id: "furn-3", category: "Furnaces", subcategory: "96% AFUE", brand: "Carrier", model: "59SC5A080E21", description: "Carrier 80,000 BTU 96% AFUE Gas Furnace", btu: "80,000 BTU", afue: "96%", voltage: "115V", price: 2450, laborHours: 8, warranty: "20 Year Heat Exchanger" },
          { id: "furn-4", category: "Furnaces", subcategory: "96% AFUE", brand: "Carrier", model: "59SC5A100E21", description: "Carrier 100,000 BTU 96% AFUE Gas Furnace", btu: "100,000 BTU", afue: "96%", voltage: "115V", price: 2750, laborHours: 8, warranty: "20 Year Heat Exchanger" },
        ]
      },
      {
        name: "Package Units",
        subcategories: ["Gas/Electric", "Heat Pump"],
        equipment: [
          { id: "pkg-1", category: "Package Units", subcategory: "Gas/Electric", brand: "Carrier", model: "48VG-A240603", description: "Carrier 2 Ton 14 SEER Gas/Electric Package Unit", tonnage: "2 Ton", seer: "14 SEER", afue: "80%", voltage: "208/230V", price: 4250, laborHours: 10, warranty: "10 Year Parts" },
          { id: "pkg-2", category: "Package Units", subcategory: "Gas/Electric", brand: "Carrier", model: "48VG-A360603", description: "Carrier 3 Ton 14 SEER Gas/Electric Package Unit", tonnage: "3 Ton", seer: "14 SEER", afue: "80%", voltage: "208/230V", price: 4850, laborHours: 10, warranty: "10 Year Parts" },
          { id: "pkg-3", category: "Package Units", subcategory: "Heat Pump", brand: "Carrier", model: "50VL-A36---3", description: "Carrier 3 Ton 14 SEER Heat Pump Package Unit", tonnage: "3 Ton", seer: "14 SEER", hspf: "8.0 HSPF", voltage: "208/230V", price: 5150, laborHours: 10, warranty: "10 Year Parts" },
        ]
      },
      {
        name: "Mini Splits",
        subcategories: ["Single Zone", "Multi Zone"],
        equipment: [
          { id: "mini-1", category: "Mini Splits", subcategory: "Single Zone", brand: "Carrier", model: "38MAQB09---3", description: "Carrier 9,000 BTU Single Zone Mini Split", btu: "9,000 BTU", seer: "22 SEER", voltage: "208/230V", price: 2150, laborHours: 6, warranty: "10 Year Parts" },
          { id: "mini-2", category: "Mini Splits", subcategory: "Single Zone", brand: "Carrier", model: "38MAQB12---3", description: "Carrier 12,000 BTU Single Zone Mini Split", btu: "12,000 BTU", seer: "22 SEER", voltage: "208/230V", price: 2450, laborHours: 6, warranty: "10 Year Parts" },
          { id: "mini-3", category: "Mini Splits", subcategory: "Single Zone", brand: "Carrier", model: "38MAQB18---3", description: "Carrier 18,000 BTU Single Zone Mini Split", btu: "18,000 BTU", seer: "20 SEER", voltage: "208/230V", price: 2950, laborHours: 8, warranty: "10 Year Parts" },
          { id: "mini-4", category: "Mini Splits", subcategory: "Multi Zone", brand: "Carrier", model: "38MGQF27---3", description: "Carrier 27,000 BTU Multi Zone Mini Split (2-3 Zones)", btu: "27,000 BTU", seer: "21 SEER", voltage: "208/230V", price: 4250, laborHours: 12, warranty: "10 Year Parts" },
        ]
      },
      {
        name: "Air Handlers",
        subcategories: ["Standard", "Variable Speed"],
        equipment: [
          { id: "ah-1", category: "Air Handlers", subcategory: "Standard", brand: "Carrier", model: "FV4CNF003000", description: "Carrier 2.5 Ton Multi-Position Air Handler", tonnage: "2.5 Ton", voltage: "208/230V", price: 1150, laborHours: 4, warranty: "10 Year Parts" },
          { id: "ah-2", category: "Air Handlers", subcategory: "Standard", brand: "Carrier", model: "FV4CNF004000", description: "Carrier 3.5 Ton Multi-Position Air Handler", tonnage: "3.5 Ton", voltage: "208/230V", price: 1350, laborHours: 4, warranty: "10 Year Parts" },
          { id: "ah-3", category: "Air Handlers", subcategory: "Variable Speed", brand: "Carrier", model: "FE4ANF003L00", description: "Carrier 2.5 Ton Variable Speed Air Handler", tonnage: "2.5 Ton", voltage: "208/230V", price: 1850, laborHours: 5, warranty: "10 Year Parts" },
        ]
      },
      {
        name: "Accessories",
        subcategories: ["Thermostats", "Air Quality", "Zoning"],
        equipment: [
          { id: "acc-1", category: "Accessories", subcategory: "Thermostats", brand: "Ecobee", model: "EB-STATE5P-01", description: "Ecobee Smart Thermostat Premium", price: 249, laborHours: 1.5, warranty: "3 Year" },
          { id: "acc-2", category: "Accessories", subcategory: "Thermostats", brand: "Honeywell", model: "TH6220WF2006", description: "Honeywell T6 Pro Smart Thermostat", price: 169, laborHours: 1.5, warranty: "5 Year" },
          { id: "acc-3", category: "Accessories", subcategory: "Air Quality", brand: "Carrier", model: "GAPABXCC1620", description: "Carrier Infinity Air Purifier", price: 650, laborHours: 2, warranty: "10 Year" },
          { id: "acc-4", category: "Accessories", subcategory: "Air Quality", brand: "Aprilaire", model: "700M", description: "Aprilaire Whole-Home Humidifier", price: 450, laborHours: 3, warranty: "5 Year" },
          { id: "acc-5", category: "Accessories", subcategory: "Zoning", brand: "Honeywell", model: "HZ322", description: "Honeywell TrueZONE 3-Zone Panel", price: 380, laborHours: 4, warranty: "5 Year" },
        ]
      }
    ];
  }

  async refreshData(): Promise<EquipmentCategory[]> {
    console.log('Forcing refresh of equipment data...');
    return await this.fetchEquipment(true);
  }
}

export const equipmentSheetsService = new EquipmentSheetsService();
