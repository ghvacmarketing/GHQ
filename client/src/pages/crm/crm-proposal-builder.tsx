import { useState, useMemo, useEffect, useCallback } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, ShoppingCart, Trash2, FileText, Copy, Package, Thermometer, Zap, Award, Filter, Wrench, CheckCircle2, Search, Loader2, Crown, Droplets, Download, Save, X, MapPin, Cog, Shield, Plus, FileEdit, Pencil } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } from "docx";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Skeleton } from "@/components/ui/skeleton";
import ProposalRichTextEditor from "@/components/proposal-rich-text-editor";
import redlogo from "@assets/redlogo.webp";
import componentsData from "@assets/pricebook-components.json";
import type { Customer, CrmUser, CrmCustomer, QuotePart } from "@shared/schema";

// API response types for pricebook data
type ApiPricebookPackage = {
  id: number;
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  monthlyPayment: number; // cents
  totalInvestment: number; // cents
  outdoorBrand: string;
  outdoorModel: string;
  outdoorName: string;
  coilModel: string | null;
  coilName: string | null;
  indoorHeatModel: string | null;
  indoorHeatName: string | null;
  thermostatModel: string | null;
  thermostatName: string | null;
  accessoryModels: string | null;
  outdoorImageUrl: string | null;
  coilImageUrl: string | null;
  furnaceImageUrl: string | null;
  thermostatImageUrl: string | null;
};

type ApiCrawlspaceTier = {
  id: number;
  name: string;
  milThickness: number;
  rollPrice: number; // cents
  description: string;
};

// Simplified CRM customer type for proposal builder
type CrmCustomerForProposal = {
  id: string;
  name: string;
  fullAddress: string | null;
  phone: string | null;
  email: string | null;
};

const CART_STORAGE_KEY = 'ghvac-proposal-cart';
const CUSTOMER_STORAGE_KEY = 'ghvac-proposal-customer';

// Company branding constants for proposals and documents
const COMPANY_INFO = {
  name: "GIESBRECHT HVAC",
  tagline: "Comfort you can trust.",
  address: "PO Box 917, Wrens, GA 30833",
  phone: "(706) 826-0644",
  email: "earnest@ghvacinc.com",
  website: "ghvac.work",
  documentTitle: "COMPREHENSIVE HOME COMFORT PROPOSAL",
  footer: "Thank you for considering GHVAC!",
  termsFooter: "This proposal is valid for 30 days. Prices subject to change. Financing terms subject to credit approval.",
};

const getAssetUrl = (path: string | undefined | null): string => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return `/assets/${path}`;
};

// Brand colors for PDF
const BRAND_COLORS = {
  primary: [113, 20, 25] as [number, number, number], // #711419 - deep red
  primaryHex: "#711419",
  text: [26, 26, 26] as [number, number, number], // #1a1a1a
  muted: [100, 100, 100] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightGray: [245, 245, 245] as [number, number, number],
  eliteGreen: [34, 139, 34] as [number, number, number], // Forest green for savings
};

type PricebookPackage = {
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  monthlyPayment: string;
  totalInvestment: string;
  outdoorBrand: string;
  outdoorModel: string;
  outdoorName: string;
  coilModel: string;
  coilName: string;
  indoorHeatModel: string;
  indoorHeatName: string;
  thermostatModel: string;
  thermostatName: string;
  accessoryModels: string;
  outdoorImageUrl?: string;
  coilImageUrl?: string;
  furnaceImageUrl?: string;
  thermostatImageUrl?: string;
};

type PricebookComponent = {
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  componentType: string;
  brand: string;
  unitName: string;
  model: string;
  description: string;
  monthlyPayment: string;
  totalInvestment: string;
  sourcePage: string;
  equipmentCost?: number;
  sellingPrice?: number;
  imageUrl?: string;
};

// Elite package metadata stored with cart items
type ElitePackageData = {
  isElite: true;
  selectedAirflowOptionId: string;
  coreBundlePrices: Record<string, number>; // bundle id -> price
  airflowPrice: number;
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
};

type CartPackage = PricebookPackage & {
  id: string;
  extractedTonnage: string;
  quantity: number;
  isCustomBuild?: false;
  eliteData?: ElitePackageData;
};

type CustomBuildCart = {
  id: string;
  isCustomBuild: true;
  tonnage: string;
  outdoorUnit: PricebookComponent | null;
  coil: PricebookComponent | null;
  indoorUnit: PricebookComponent | null;
  thermostat: PricebookComponent | null;
  quantity: number;
  eliteData?: ElitePackageData;
};

type CrawlspaceCartItem = {
  id: string;
  isCrawlspace: true;
  tier: CrawlspaceTier;
  sqft: number;
  pricingBreakdown: CrawlspacePricingBreakdown;
  quantity: number;
  eliteData?: ElitePackageData;
};

type CartItem = CartPackage | CustomBuildCart | CrawlspaceCartItem | CrawlspaceServicesCartItem;

const components: PricebookComponent[] = componentsData as PricebookComponent[];

// Transform API packages to frontend format (cents to dollars as strings)
function transformApiPackages(apiPackages: ApiPricebookPackage[]): PricebookPackage[] {
  return apiPackages.map(pkg => ({
    unitType: pkg.unitType,
    tier: pkg.tier,
    tonnage: pkg.tonnage,
    packageLevel: pkg.packageLevel,
    monthlyPayment: (pkg.monthlyPayment / 100).toFixed(2),
    totalInvestment: (pkg.totalInvestment / 100).toFixed(2),
    outdoorBrand: pkg.outdoorBrand,
    outdoorModel: pkg.outdoorModel,
    outdoorName: pkg.outdoorName,
    coilModel: pkg.coilModel || "",
    coilName: pkg.coilName || "",
    indoorHeatModel: pkg.indoorHeatModel || "",
    indoorHeatName: pkg.indoorHeatName || "",
    thermostatModel: pkg.thermostatModel || "",
    thermostatName: pkg.thermostatName || "",
    accessoryModels: pkg.accessoryModels || "",
    outdoorImageUrl: pkg.outdoorImageUrl || undefined,
    coilImageUrl: pkg.coilImageUrl || undefined,
    furnaceImageUrl: pkg.furnaceImageUrl || undefined,
    thermostatImageUrl: pkg.thermostatImageUrl || undefined,
  }));
}

// Transform API crawlspace tiers to frontend format (cents to dollars)
function transformApiCrawlspaceTiers(apiTiers: ApiCrawlspaceTier[]): CrawlspaceTier[] {
  return apiTiers.map(tier => ({
    id: `crawl-${tier.milThickness}mil`,
    name: tier.name,
    milThickness: tier.milThickness,
    rollPrice: tier.rollPrice / 100,
    description: tier.description,
  }));
}

const UNIT_TYPE_INFO: Record<string, { name: string; description: string; icon: typeof Package }> = {
  SGA: { name: "SGA", description: "Split Gas Air system for heating and cooling", icon: Thermometer },
  SHP: { name: "SHP", description: "All-electric heating and cooling solution", icon: Zap },
  STA: { name: "Heat Pump + Gas Furnace", description: "Dual fuel system for maximum efficiency", icon: Award },
  PHP: { name: "PHP", description: "All-in-one packaged heat pump unit", icon: Package },
  GP: { name: "GP", description: "All-in-one gas/electric package unit", icon: Package },
  "Mini-Split": { name: "Mini-Split", description: "Ductless single-zone heating & cooling", icon: Zap },
  "Ducting": { name: "Ducting", description: "Complete duct system replacement", icon: Package },
  "Crawlspace Services": { name: "Crawlspace Services", description: "Joist cleaning, mold treatment, excavation & more", icon: Wrench },
};

const TIER_INFO: Record<string, { description: string }> = {
  Essential: { description: "Standard efficiency, reliable performance" },
  Premium: { description: "High efficiency, enhanced features" },
  Ultimate: { description: "Top-tier efficiency, maximum comfort" },
  Packaged: { description: "All-in-one packaged unit" },
  Standard: { description: "Single-zone ductless system" },
};

const PACKAGE_LEVEL_ORDER = ["Best", "Better", "Good", "Budget"];

const TONNAGE_OPTIONS = ["1.5 Ton", "2 Ton", "2.5 Ton", "3 Ton", "3.5 Ton", "4 Ton", "5 Ton"];

const BRAND_OPTIONS = ["All Brands", "Trane", "Carrier", "RunTru", "Ameristar"];

const OUTDOOR_UNIT_TYPES = ["Air Conditioner", "Heat Pump"];
const INDOOR_UNIT_TYPES = ["Gas Furnace", "Air Handler"];

// Elite Package Configuration
const ELITE_DISCOUNT_PERCENT = 20;

type EliteBundle = {
  id: string;
  name: string;
  description: string;
  priceByTonnage?: Record<string, number>; // For tonnage-based pricing
  fixedPrice?: number; // For flat pricing
  benefits: string[];
  notCovered?: string[]; // Items not covered by warranty
};

type EliteAirflowOption = {
  id: string;
  name: string;
  description: string;
  priceByTonnage: Record<string, number>;
};

// HVAC Elite Core Bundles (always required when Elite is ON)
const HVAC_ELITE_CORE_BUNDLES: EliteBundle[] = [
  {
    id: "10yr-labor",
    name: "10-Year Labor Warranty",
    description: "Full labor coverage for repairs and service",
    fixedPrice: 1000,
    benefits: ["All labor costs covered", "No service call fees", "Factory-trained technicians", "Peace of mind protection"]
  },
  {
    id: "10yr-maintenance",
    name: "10-Year Maintenance Plan",
    description: "Comprehensive annual maintenance for 10 years",
    fixedPrice: 2290,
    benefits: ["Annual system tune-ups", "Priority scheduling", "Filter replacements", "Performance optimization"]
  },
  {
    id: "install-upgrade",
    name: "Install Upgrade Bundle",
    description: "Premium installation with Lineset + Drain + Low Voltage",
    priceByTonnage: { "1.5": 1000, "2": 1500, "2.5": 2000, "3": 2500, "3.5": 3000, "4": 4000, "5": 5000 },
    benefits: ["New copper lineset", "Proper condensate drainage", "Low voltage wiring upgrade", "Professional installation"]
  }
];

// HVAC Elite Airflow Options (must choose exactly one)
const HVAC_ELITE_AIRFLOW_OPTIONS: EliteAirflowOption[] = [
  {
    id: "new-ducting",
    name: "New Ducting System",
    description: "Complete duct system replacement with 10-year warranty",
    priceByTonnage: { "1.5": 7527, "2": 9353, "2.5": 11179, "3": 13005, "3.5": 14831, "4": 16657, "5": 20309 }
  },
  {
    id: "cleaning-return-insulation",
    name: "Duct Cleaning + New Return + Re-Insulation",
    description: "Duct cleaning, new return setup, and attic re-insulation bundle",
    // Combined: Duct Cleaning ($1000) + New Return (tonnage) + Re-Insulation (tonnage)
    priceByTonnage: { "1.5": 2245, "2": 2345, "2.5": 2850, "3": 2995, "3.5": 3450, "4": 3650, "5": 4450 }
  }
];

// Crawlspace Pricing Constants (from spec)
const CRAWLSPACE_CONSTANTS = {
  LABOR_RATE_PER_SQFT: 1.50,
  WALL_HEIGHT_FT: 3,
  WASTE_FACTOR: 1.10, // 10% waste/overlap
  PILLAR_SIDE_IN: 16,
  PILLAR_HEIGHT_FT: 3,
  ROLL_AREA_12x100: 1200, // sqft per roll
  LINER_MARKUP: 1.50, // 50% gross margin on liner
  DEHUMIDIFIER_MARKUP: 1.50, // 50% markup
  RECEPTACLE_ADD: 150, // $150 for receptacle box
  SIZE_BANDS: [1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000] // Extended bands
};

// Dehumidifier models
const DEHUMIDIFIERS = {
  E070: { model: "Aprilaire E070", baseCost: 1649.99, tiers: ["Premium", "Ultimate"] },
  E100: { model: "Aprilaire E100", baseCost: 2149.99, tiers: ["Essential"] }
};

// Liner roll prices by tier
const LINER_ROLL_PRICES = {
  Essential: { milThickness: 10, rollPrice: 167.99, description: "10 Mil Non-Reinforced" },
  Premium: { milThickness: 12, rollPrice: 307.99, description: "12 Mil Economy (WB)" },
  Ultimate: { milThickness: 20, rollPrice: 559.99, description: "20 Mil Reinforced" }
};

// Crawlspace pricing breakdown type
type CrawlspacePricingBreakdown = {
  inputSqft: number;
  bandSqft: number;
  pillars: number;
  wallAreaSqft: number;
  pillarAreaSqft: number;
  totalLinerAreaSqft: number;
  rollsNeeded: number;
  linerMaterialCost: number;
  laborCost: number;
  dehumidifierModel: string;
  dehumidifierBaseCost: number;
  dehumidifierSellPrice: number;
  totalPrice: number;
};

// Calculate crawlspace pricing based on sqft and tier
function calculateCrawlspacePricing(sqft: number, tierName: string): CrawlspacePricingBreakdown {
  // Round up to next size band
  let bandSqft = CRAWLSPACE_CONSTANTS.SIZE_BANDS.find(band => band >= sqft) || sqft;
  // If beyond our bands, round up to next 250
  if (sqft > CRAWLSPACE_CONSTANTS.SIZE_BANDS[CRAWLSPACE_CONSTANTS.SIZE_BANDS.length - 1]) {
    bandSqft = Math.ceil(sqft / 250) * 250;
  }
  
  // Pillars estimate: band_sqft / 125
  const pillars = Math.round(bandSqft / 125);
  
  // Wall liner (3ft up): 12 * sqrt(band_sqft)
  const wallAreaSqft = 12 * Math.sqrt(bandSqft);
  
  // Pillar wrap: 16 sqft per pillar
  const pillarAreaSqft = pillars * 16;
  
  // Total liner area with waste factor
  const totalLinerAreaSqft = Math.round((bandSqft + wallAreaSqft + pillarAreaSqft) * CRAWLSPACE_CONSTANTS.WASTE_FACTOR);
  
  // Rolls needed
  const rollsNeeded = Math.ceil(totalLinerAreaSqft / CRAWLSPACE_CONSTANTS.ROLL_AREA_12x100);
  
  // Liner material cost with 50% gross margin
  const linerInfo = LINER_ROLL_PRICES[tierName as keyof typeof LINER_ROLL_PRICES];
  const linerMaterialCost = rollsNeeded * linerInfo.rollPrice * CRAWLSPACE_CONSTANTS.LINER_MARKUP;
  
  // Labor cost
  const laborCost = bandSqft * CRAWLSPACE_CONSTANTS.LABOR_RATE_PER_SQFT;
  
  // Dehumidifier
  const dehu = tierName === "Essential" ? DEHUMIDIFIERS.E100 : DEHUMIDIFIERS.E070;
  const dehumidifierSellPrice = (dehu.baseCost * CRAWLSPACE_CONSTANTS.DEHUMIDIFIER_MARKUP) + CRAWLSPACE_CONSTANTS.RECEPTACLE_ADD;
  
  // Total
  const totalPrice = Math.round(linerMaterialCost + laborCost + dehumidifierSellPrice);
  
  return {
    inputSqft: sqft,
    bandSqft,
    pillars,
    wallAreaSqft: Math.round(wallAreaSqft),
    pillarAreaSqft,
    totalLinerAreaSqft,
    rollsNeeded,
    linerMaterialCost: Math.round(linerMaterialCost * 100) / 100,
    laborCost,
    dehumidifierModel: dehu.model,
    dehumidifierBaseCost: dehu.baseCost,
    dehumidifierSellPrice: Math.round(dehumidifierSellPrice * 100) / 100,
    totalPrice
  };
}

// Crawlspace Tiers
type CrawlspaceTier = {
  id: string;
  name: string;
  milThickness: number;
  description: string;
  rollPrice: number;
};

// Crawlspace Services Pricing (add-on services based on square footage)
const CRAWLSPACE_SERVICES = {
  SQFT_OPTIONS: [250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000],
  SERVICES: [
    {
      id: "joist-cleaning",
      name: "Joist Cleaning (HEPA Vacuum)",
      ratePerSqft: 3.25,
      minSqft: 250,
      description: "Deep clean floor joists using HEPA vacuum"
    },
    {
      id: "mold-treatment",
      name: "Mold Treatment",
      ratePerSqft: 1.35,
      minSqft: 250,
      description: "Professional mold treatment and prevention"
    },
    {
      id: "excavation",
      name: "Excavation",
      ratePerSqft: 2.50,
      minSqft: 250,
      description: "Crawlspace excavation and grading"
    }
  ],
  DOOR_OPTIONS: [
    {
      id: "door-replacement",
      name: "Replacement Door Installation",
      price: 1000,
      description: "Replaces existing crawl space door",
      features: ["Custom built", "10-year warranty included", "Option to rekey to match home locks"]
    },
    {
      id: "door-new",
      name: "New Door Installation (No Existing Door)",
      price: 2500,
      description: "Includes cutting opening in home exterior",
      features: ["Door installation", "Weatherproofing", "Custom built", "10-year warranty included", "Option to rekey to match home locks"]
    }
  ]
};

type CrawlspaceServiceSelection = {
  sqft: number;
  services: string[]; // service ids
  doorOption: string | null; // door option id
};

type CrawlspaceServicesCartItem = {
  id: string;
  isCrawlspaceServices: true;
  selections: CrawlspaceServiceSelection;
  totalPrice: number;
  quantity: number;
};

// Crawlspace Elite Bundles (all required when Elite is ON)
// Formula: Crawlspace Elite Add-On Total = P + $3,090 (where P = tier price)
const CRAWLSPACE_ELITE_BUNDLES: EliteBundle[] = [
  {
    id: "crawl-10yr-maintenance-inspection",
    name: "10-Year Maintenance & Inspection",
    description: "1 visit per year for 10 years",
    fixedPrice: 2290,
    benefits: [
      "Full crawlspace visual inspection (liner, seams, walls, pillars)",
      "Check dehumidifier operation + clean/replace filter",
      "Measure humidity/temperature and log readings",
      "Inspect sump/drainage + discharge line (if present)",
      "Check for standing water, leaks, or new moisture intrusion",
      "Minor reseal/tape touch-ups (as needed)"
    ]
  },
  {
    id: "crawl-dehumidifier-warranty",
    name: "10-Year Dehumidifier Warranty",
    description: "Parts + Labor coverage for dehumidifier",
    fixedPrice: 800,
    benefits: [
      "Parts coverage follows manufacturer terms",
      "Labor coverage included for 10 years",
      "Drain line clogs/maintenance issues covered on yearly plan"
    ],
    notCovered: [
      "Flooding, plumbing leaks left unresolved",
      "Pest damage, homeowner/third-party damage",
      "Structural movement beyond normal settling"
    ]
  }
];

// Helper to get price by tonnage (converts "2 Ton" to "2")
function getEliteBundlePrice(bundle: EliteBundle, tonnage: string): number {
  if (bundle.fixedPrice !== undefined) return bundle.fixedPrice;
  if (bundle.priceByTonnage) {
    const numTonnage = tonnage.replace(" Ton", "");
    return bundle.priceByTonnage[numTonnage] || 0;
  }
  return 0;
}

function getEliteAirflowPrice(option: EliteAirflowOption, tonnage: string): number {
  const numTonnage = tonnage.replace(" Ton", "");
  return option.priceByTonnage[numTonnage] || 0;
}

// Calculate full Elite package pricing for HVAC
function calculateHvacElitePricing(
  basePrice: number, 
  tonnage: string, 
  selectedAirflowOptionId: string
): ElitePackageData | null {
  const airflowOption = HVAC_ELITE_AIRFLOW_OPTIONS.find(o => o.id === selectedAirflowOptionId);
  if (!airflowOption) return null;

  const coreBundlePrices: Record<string, number> = {};
  let bundleTotal = 0;
  for (const bundle of HVAC_ELITE_CORE_BUNDLES) {
    const price = getEliteBundlePrice(bundle, tonnage);
    coreBundlePrices[bundle.id] = price;
    bundleTotal += price;
  }

  const airflowPrice = getEliteAirflowPrice(airflowOption, tonnage);
  const originalTotal = basePrice + bundleTotal + airflowPrice;
  const discountAmount = Math.round(originalTotal * (ELITE_DISCOUNT_PERCENT / 100));
  const finalTotal = originalTotal - discountAmount;

  return {
    isElite: true,
    selectedAirflowOptionId,
    coreBundlePrices,
    airflowPrice,
    originalTotal,
    discountAmount,
    finalTotal
  };
}

// Calculate full Elite package pricing for Crawlspace
// Formula: Crawlspace Elite = P + $3,090 where:
// - 10-Year Maintenance & Inspection: $2,290
// - 10-Year Dehumidifier Warranty: $800
function calculateCrawlspaceElitePricing(basePrice: number): ElitePackageData {
  const coreBundlePrices: Record<string, number> = {};
  
  // Fixed bundles matching CRAWLSPACE_ELITE_BUNDLES
  coreBundlePrices["crawl-10yr-maintenance-inspection"] = 2290;
  coreBundlePrices["crawl-dehumidifier-warranty"] = 800;
  
  const bundleTotal = coreBundlePrices["crawl-10yr-maintenance-inspection"] + 
                      coreBundlePrices["crawl-dehumidifier-warranty"];

  const originalTotal = basePrice + bundleTotal;
  const discountAmount = Math.round(originalTotal * (ELITE_DISCOUNT_PERCENT / 100));
  const finalTotal = originalTotal - discountAmount;

  return {
    isElite: true,
    selectedAirflowOptionId: "", // Not applicable for crawlspace
    coreBundlePrices,
    airflowPrice: 0,
    originalTotal,
    discountAmount,
    finalTotal
  };
}

// Type guard helpers
function isCrawlspaceItem(item: CartItem): item is CrawlspaceCartItem {
  return 'isCrawlspace' in item && item.isCrawlspace === true;
}

function isCrawlspaceServicesItem(item: CartItem): item is CrawlspaceServicesCartItem {
  return 'isCrawlspaceServices' in item && item.isCrawlspaceServices === true;
}

function isCustomBuild(item: CartItem): item is CustomBuildCart {
  return 'isCustomBuild' in item && item.isCustomBuild === true;
}

type HvacPackageCartItem = PricebookPackage & { id: string; extractedTonnage: string; quantity: number; isCustomBuild?: false; eliteData?: ElitePackageData };
function isHvacPackage(item: CartItem): item is HvacPackageCartItem {
  return !isCrawlspaceItem(item) && !isCustomBuild(item) && !isCrawlspaceServicesItem(item);
}

const formatPrice = (price: number) => '$' + price.toLocaleString();
const formatPriceRange = (low: number, high: number) => {
  if (low === high) return '$' + low.toLocaleString();
  return '$' + low.toLocaleString() + ' - $' + high.toLocaleString();
};

// Equipment image grid component for cart and quote views
function EquipmentImageGrid({ 
  images, 
  size = 'sm',
  showLabels = false,
  unitType
}: { 
  images: { outdoor?: string; coil?: string; furnace?: string; thermostat?: string };
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  unitType?: string;
}) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20'
  };
  
  const imgSize = sizeClasses[size];
  const hasAnyImage = images.outdoor || images.coil || images.furnace || images.thermostat;
  
  if (!hasAnyImage) return null;
  
  // Use "Heat Kit" label for PHP, "Air Handler" for SHP, "Indoor" for others
  const indoorLabel = unitType === 'PHP' ? 'Heat Kit' : unitType === 'SHP' ? 'Air Handler' : 'Indoor';
  
  const imageItems = [
    { key: 'outdoor', url: images.outdoor, label: 'Outdoor' },
    { key: 'coil', url: images.coil, label: 'Coil' },
    { key: 'furnace', url: images.furnace, label: indoorLabel },
    { key: 'thermostat', url: images.thermostat, label: 'T-stat' },
  ].filter(item => item.url);
  
  return (
    <div className={`grid ${imageItems.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'} gap-1`}>
      {imageItems.map(item => (
        <div key={item.key} className="flex flex-col items-center">
          <img 
            src={getAssetUrl(item.url)}
            alt={item.label}
            className={`${imgSize} object-contain rounded bg-gray-50 dark:bg-gray-800`}
            loading="lazy"
          />
          {showLabels && (
            <span className="text-[9px] text-muted-foreground mt-0.5 truncate w-full text-center">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function calculateCustomBuildEstimate(
  outdoorUnit: PricebookComponent | null,
  coil: PricebookComponent | null,
  indoorUnit: PricebookComponent | null,
  thermostat: PricebookComponent | null
): { low: number; high: number } {
  let totalLow = 0;
  let totalHigh = 0;
  
  if (outdoorUnit) {
    if (outdoorUnit.sellingPrice) {
      // Trane with pricing: 50% gross margin (low) to 100% markup (high)
      totalLow += outdoorUnit.sellingPrice;
      totalHigh += outdoorUnit.sellingPrice * 2;
    } else {
      // Non-Trane: same 50-100% range
      const basePrice = outdoorUnit.componentType === "Heat Pump" ? 4500 : 3500;
      totalLow += basePrice;
      totalHigh += basePrice * 2;
    }
  }
  
  if (coil) {
    if (coil.sellingPrice) {
      totalLow += coil.sellingPrice;
      totalHigh += coil.sellingPrice * 2;
    } else {
      const basePrice = 800;
      totalLow += basePrice;
      totalHigh += basePrice * 2;
    }
  }
  
  if (indoorUnit) {
    if (indoorUnit.sellingPrice) {
      totalLow += indoorUnit.sellingPrice;
      totalHigh += indoorUnit.sellingPrice * 2;
    } else {
      const basePrice = indoorUnit?.componentType === "Air Handler" ? 2000 : 1800;
      totalLow += basePrice;
      totalHigh += basePrice * 2;
    }
  }
  
  if (thermostat) {
    if (thermostat.sellingPrice) {
      totalLow += thermostat.sellingPrice;
      totalHigh += thermostat.sellingPrice * 2;
    } else {
      const basePrice = (thermostat.unitName.toLowerCase().includes('smart') || thermostat.unitName.toLowerCase().includes('wifi')) ? 350 : 250;
      totalLow += basePrice;
      totalHigh += basePrice * 2;
    }
  }
  
  return { low: totalLow, high: totalHigh };
}

function extractTonnageFromModel(model: string): string | null {
  const match = model.match(/0?(18|24|30|36|42|48|60)/);
  if (!match) return null;
  const tonnageMap: Record<string, string> = {
    "18": "1.5 Ton",
    "24": "2 Ton",
    "30": "2.5 Ton",
    "36": "3 Ton",
    "42": "3.5 Ton",
    "48": "4 Ton",
    "60": "5 Ton",
  };
  return tonnageMap[match[1]] || null;
}

function getPackageTonnageDisplay(pkg: PricebookPackage): string {
  if (pkg.tonnage) {
    // Handle special "All" value for packages that skip tonnage selection
    if (pkg.tonnage === "All") return "All";
    const tonNum = parseFloat(pkg.tonnage);
    if (!isNaN(tonNum)) {
      return `${tonNum} Ton`;
    }
  }
  return extractTonnageFromModel(pkg.outdoorModel) || "Unknown";
}

function generatePackageId(pkg: PricebookPackage, tonnage: string): string {
  return `${pkg.unitType}-${pkg.tier}-${tonnage}-${pkg.packageLevel}-${pkg.outdoorModel}`;
}

function generateCustomBuildId(tonnage: string, outdoor: PricebookComponent, coil: PricebookComponent, indoor: PricebookComponent, thermostat: PricebookComponent): string {
  return `custom-${tonnage}-${outdoor.model}-${coil.model}-${indoor.model}-${thermostat.model}`;
}

function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load cart from storage:', e);
  }
  return [];
}

function loadCustomerFromStorage(): { name: string; address: string; notes: string } {
  if (typeof window === 'undefined') return { name: '', address: '', notes: '' };
  try {
    const stored = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load customer from storage:', e);
  }
  return { name: '', address: '', notes: '' };
}

export default function CrmProposalBuilder() {
  usePageTitle("Proposal Builder");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const routeParams = useParams<{ customerId?: string }>();
  
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<CrmUser>({
    queryKey: ["/api/crm/auth/me"],
  });
  
  // Fetch packages from API
  const { data: packagesData, isLoading: isLoadingPackages } = useQuery<ApiPricebookPackage[]>({
    queryKey: ['/api/pricebook/packages'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Fetch crawlspace tiers from API
  const { data: crawlspaceTiersData, isLoading: isLoadingCrawlspaceTiers } = useQuery<ApiCrawlspaceTier[]>({
    queryKey: ['/api/pricebook/crawlspace-tiers'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Transform API data to frontend format
  const packages: PricebookPackage[] = useMemo(() => {
    if (!packagesData) return [];
    return transformApiPackages(packagesData);
  }, [packagesData]);
  
  const crawlspaceTiers: CrawlspaceTier[] = useMemo(() => {
    if (!crawlspaceTiersData) return [];
    return transformApiCrawlspaceTiers(crawlspaceTiersData);
  }, [crawlspaceTiersData]);
  
  // Sync cart items with fresh package data to update image URLs
  // This handles cases where cart was stored before images were available
  const syncCartWithPackages = useCallback((packagesData: PricebookPackage[], currentCart: CartItem[]) => {
    let hasUpdates = false;
    const updatedCart = currentCart.map(item => {
      if (isHvacPackage(item)) {
        const matchingPkg = packagesData.find(pkg => 
          pkg.unitType === item.unitType &&
          pkg.tier === item.tier &&
          pkg.tonnage === item.tonnage &&
          pkg.packageLevel === item.packageLevel
        );
        if (matchingPkg) {
          const needsUpdate = (
            (matchingPkg.outdoorImageUrl && matchingPkg.outdoorImageUrl !== item.outdoorImageUrl) ||
            (matchingPkg.coilImageUrl && matchingPkg.coilImageUrl !== item.coilImageUrl) ||
            (matchingPkg.furnaceImageUrl && matchingPkg.furnaceImageUrl !== item.furnaceImageUrl) ||
            (matchingPkg.thermostatImageUrl && matchingPkg.thermostatImageUrl !== item.thermostatImageUrl)
          );
          if (needsUpdate) {
            hasUpdates = true;
            return {
              ...item,
              outdoorImageUrl: matchingPkg.outdoorImageUrl || item.outdoorImageUrl,
              coilImageUrl: matchingPkg.coilImageUrl || item.coilImageUrl,
              furnaceImageUrl: matchingPkg.furnaceImageUrl || item.furnaceImageUrl,
              thermostatImageUrl: matchingPkg.thermostatImageUrl || item.thermostatImageUrl,
            };
          }
        }
      }
      return item;
    });
    return { updatedCart, hasUpdates };
  }, []);

  const [activeTab, setActiveTab] = useState<string>("preset");
  const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedTonnage, setSelectedTonnage] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>(() => loadCartFromStorage());
  const [cartOpen, setCartOpen] = useState(false);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState(() => loadCustomerFromStorage().name);
  const [customerAddress, setCustomerAddress] = useState(() => loadCustomerFromStorage().address);
  const [customerNotes, setCustomerNotes] = useState(() => loadCustomerFromStorage().notes);
  const [proposalNotes, setProposalNotes] = useState<string>("");
  const [isNavigatingAway, setIsNavigatingAway] = useState(false);
  
  // Quote mode: "single" = one combined quote, "options" = each package is a separate option
  const [quoteMode, setQuoteMode] = useState<"single" | "options">("options");

  // Build Your Own state
  const [customEquipmentType, setCustomEquipmentType] = useState<string | null>(null);
  const [customTonnage, setCustomTonnage] = useState<string | null>(null);
  const [selectedOutdoorUnit, setSelectedOutdoorUnit] = useState<PricebookComponent | null>(null);
  const [selectedCoil, setSelectedCoil] = useState<PricebookComponent | null>(null);
  const [selectedIndoorUnit, setSelectedIndoorUnit] = useState<PricebookComponent | null>(null);
  const [selectedThermostat, setSelectedThermostat] = useState<PricebookComponent | null>(null);
  const [outdoorBrandFilter, setOutdoorBrandFilter] = useState<string>("All Brands");
  const [coilBrandFilter, setCoilBrandFilter] = useState<string>("All Brands");
  const [indoorBrandFilter, setIndoorBrandFilter] = useState<string>("All Brands");
  const [thermostatBrandFilter, setThermostatBrandFilter] = useState<string>("All Brands");

  // Customer search state for Accept Quote (uses CRM customers, not FieldEdge customers)
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomerForProposal | null>(null);
  const [searchAllFields, setSearchAllFields] = useState(false);
  
  // Pre-loaded entity IDs from URL parameters
  const [preloadedProjectId, setPreloadedProjectId] = useState<string | null>(null);
  const [preloadedWorkOrderId, setPreloadedWorkOrderId] = useState<string | null>(null);
  
  const [preloadedPropertyId, setPreloadedPropertyId] = useState<string | null>(null);
  
  // Customer properties for site selection
  const [customerProperties, setCustomerProperties] = useState<Array<{ id: string; address1: string; address2?: string; city: string; state: string; zip: string }>>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  
  // Assigned user for quotes (install quotes require sales+ role)
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  
  // Parse URL parameters on mount and pre-fill customer if provided
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    // Prefer wouter route param (:customerId), fall back to query string (?customerId=)
    const customerId = routeParams.customerId || queryParams.get("customerId");
    const projectId = queryParams.get("projectId");
    const workOrderId = queryParams.get("workOrderId");
    const propertyId = queryParams.get("propertyId");
    
    if (projectId) setPreloadedProjectId(projectId);
    if (workOrderId) setPreloadedWorkOrderId(workOrderId);
    if (propertyId) setPreloadedPropertyId(propertyId);
    
    // Fetch CRM customer by ID if provided
    if (customerId) {
      fetch(`/api/crm/customers/${customerId}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then((customer: CrmCustomerForProposal | null) => {
          if (customer) {
            // Inline customer selection to avoid dependency issues
            const cleanName = customer.name.replace(/^["']|["']$/g, '');
            setCustomerName(cleanName);
            setCustomerAddress(customer.fullAddress || '');
            setSelectedCustomer(customer);
          }
        })
        .catch(console.error);
    }
  }, [routeParams.customerId]);

  // Sync cart image URLs with fresh package data when packages are loaded
  useEffect(() => {
    if (packages.length > 0 && cart.length > 0) {
      const { updatedCart, hasUpdates } = syncCartWithPackages(packages, cart);
      if (hasUpdates) {
        setCart(updatedCart);
      }
    }
  }, [packages]); // Only run when packages change, not on every cart change

  // Fetch customer properties whenever selectedCustomer changes
  useEffect(() => {
    const fetchProperties = async () => {
      if (!selectedCustomer) {
        setCustomerProperties([]);
        setSelectedPropertyId(null);
        return;
      }
      
      setIsLoadingProperties(true);
      try {
        const res = await fetch(`/api/crm/customers/${selectedCustomer.id}/properties`, { credentials: 'include' });
        if (res.ok) {
          const properties = await res.json();
          setCustomerProperties(properties);
          // Auto-select if preloadedPropertyId matches one of the properties
          if (preloadedPropertyId && properties.some((p: { id: string }) => p.id === preloadedPropertyId)) {
            setSelectedPropertyId(preloadedPropertyId);
          } else if (properties.length === 1) {
            // Auto-select if only one property
            setSelectedPropertyId(properties[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch customer properties:", error);
      } finally {
        setIsLoadingProperties(false);
      }
    };
    
    fetchProperties();
  }, [selectedCustomer, preloadedPropertyId]);

  // Elite Package state - per-package (key = package index)
  const [eliteEnabledByIndex, setEliteEnabledByIndex] = useState<Record<number, boolean>>({});
  const [selectedAirflowByIndex, setSelectedAirflowByIndex] = useState<Record<number, string>>({});
  const [selectedCrawlspaceTier, setSelectedCrawlspaceTier] = useState<CrawlspaceTier | null>(null);
  const [crawlspaceEliteEnabled, setCrawlspaceEliteEnabled] = useState(false);
  const [crawlspaceSqft, setCrawlspaceSqft] = useState<string>("1000");
  
  // Crawlspace Services state
  const [crawlspaceServicesSqft, setCrawlspaceServicesSqft] = useState<string>("1000");
  const [selectedCrawlspaceServices, setSelectedCrawlspaceServices] = useState<string[]>([]);
  const [selectedDoorOption, setSelectedDoorOption] = useState<string | null>(null);
  
  // Debounce customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerSearch(customerSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchTerm]);

  // Customer search query (uses CRM customers endpoint)
  const { data: customerSearchData, isFetching: isSearchingCustomers } = useQuery<CrmCustomerForProposal[]>({
    queryKey: ["/api/crm/customers", debouncedCustomerSearch],
    queryFn: async () => {
      if (debouncedCustomerSearch.length < 2) return [];
      const params = new URLSearchParams({
        search: debouncedCustomerSearch,
        limit: '20'
      });
      const res = await fetch(`/api/crm/customers?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to search customers");
      const data = await res.json();
      return data.customers || [];
    },
    enabled: debouncedCustomerSearch.length >= 2,
    refetchOnWindowFocus: false,
  });
  const customerSearchResults = Array.isArray(customerSearchData) ? customerSearchData : [];

  // Assignable users query (exactly sales role for install quotes)
  type AssignableUser = { id: string; displayName: string; email: string; role: string };
  const { data: assignableUsers } = useQuery<AssignableUser[]>({
    queryKey: ["/api/crm/users/by-role", "sales"],
    queryFn: async () => {
      const response = await fetch(`/api/crm/users/by-role?exactRole=sales`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Accept quote mutation
  const acceptQuoteMutation = useMutation({
    mutationFn: async (data: {
      customerName: string;
      phone?: string;
      email?: string;
      address?: string;
      estimatedValue: number;
      equipmentDetails: unknown[];
      totalLow: number;
      totalHigh: number;
      monthlyLow: number;
      monthlyHigh: number;
      notes?: string;
      hasCustomBuilds?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/proposals/accept", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Proposal Accepted!",
        description: "Lead created and added to installation pipeline.",
      });
      setQuoteDialogOpen(false);
      clearCart();
      setSelectedCustomer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/installation"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to accept proposal. Please try again.",
        variant: "destructive",
      });
      console.error("Accept quote error:", error);
    },
  });

  // Save proposal mutation
  const saveProposalMutation = useMutation({
    mutationFn: async (data: {
      customerName: string;
      customerAddress?: string;
      customerPhone?: string;
      customerEmail?: string;
      quoteTitle: string;
      packageDescription?: string;
      total: string;
      quoteData: string;
    }) => {
      const res = await apiRequest("POST", "/api/saved-proposals", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote Saved!",
        description: "Proposal saved to history.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-proposals"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save proposal. Please try again.",
        variant: "destructive",
      });
      console.error("Save proposal error:", error);
    },
  });

  const handleSaveProposal = () => {
    if (cart.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Please add equipment to the cart first.",
        variant: "destructive",
      });
      return;
    }

    const customerNameToUse = selectedCustomer?.name || customerName || "Unknown Customer";
    
    // Build cart items with image URLs for proposal history
    const cartItemsForSave = cart.map(item => {
      if (isCrawlspaceItem(item)) {
        return {
          type: "crawlspace" as const,
          tierName: item.tier.name,
          tierDescription: item.tier.description,
          milThickness: item.tier.milThickness,
          sqft: item.sqft,
          bandSqft: item.pricingBreakdown.bandSqft,
          totalPrice: item.pricingBreakdown.totalPrice,
          quantity: item.quantity,
          isElite: !!item.eliteData,
          eliteFinalTotal: item.eliteData?.finalTotal,
          eliteDiscountAmount: item.eliteData?.discountAmount,
        };
      } else if (isCustomBuild(item)) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return {
          type: "custom" as const,
          tonnage: item.tonnage,
          quantity: item.quantity,
          priceLow: estimate.low,
          priceHigh: estimate.high,
          outdoor: item.outdoorUnit ? {
            brand: item.outdoorUnit.brand,
            model: item.outdoorUnit.model,
            name: item.outdoorUnit.unitName,
            imageUrl: item.outdoorUnit.imageUrl,
          } : null,
          coil: item.coil ? {
            brand: item.coil.brand,
            model: item.coil.model,
            name: item.coil.unitName,
            imageUrl: item.coil.imageUrl,
          } : null,
          indoor: item.indoorUnit ? {
            brand: item.indoorUnit.brand,
            model: item.indoorUnit.model,
            name: item.indoorUnit.unitName,
            imageUrl: item.indoorUnit.imageUrl,
          } : null,
          thermostat: item.thermostat ? {
            brand: item.thermostat.brand,
            model: item.thermostat.model,
            name: item.thermostat.unitName,
            imageUrl: item.thermostat.imageUrl,
          } : null,
          isElite: !!item.eliteData,
          eliteFinalTotal: item.eliteData?.finalTotal,
          eliteDiscountAmount: item.eliteData?.discountAmount,
        };
      } else {
        const basePrice = parseFloat(item.totalInvestment) || 0;
        const finalPrice = item.eliteData ? item.eliteData.finalTotal : basePrice;
        return {
          type: "package" as const,
          unitType: item.unitType,
          unitTypeName: UNIT_TYPE_INFO[item.unitType]?.name || item.unitType,
          tier: item.tier,
          tonnage: item.extractedTonnage,
          packageLevel: item.packageLevel,
          quantity: item.quantity,
          totalPrice: finalPrice,
          monthlyPayment: item.eliteData ? Math.round(item.eliteData.finalTotal / 67) : parseFloat(item.monthlyPayment) || 0,
          outdoor: {
            brand: item.outdoorBrand,
            model: item.outdoorModel,
            name: item.outdoorName,
            imageUrl: item.outdoorImageUrl,
          },
          indoor: item.indoorHeatName ? {
            name: item.indoorHeatName,
            model: item.indoorHeatModel,
          } : null,
          thermostat: item.thermostatName ? {
            name: item.thermostatName,
            model: item.thermostatModel,
            imageUrl: item.thermostatImageUrl,
          } : null,
          coil: item.coilName ? {
            name: item.coilName,
            model: item.coilModel,
            imageUrl: item.coilImageUrl,
          } : null,
          isElite: !!item.eliteData,
          eliteFinalTotal: item.eliteData?.finalTotal,
          eliteDiscountAmount: item.eliteData?.discountAmount,
        };
      }
    });

    const quoteTitle = cart.length > 0
      ? (isHvacPackage(cart[0]) ? `${cart[0].packageLevel} Package Proposal` : "Equipment Proposal")
      : "Equipment Proposal";
    const fullQuoteData = { cartItems: cartItemsForSave, proposalNotes };
    
    saveProposalMutation.mutate({
      customerName: customerNameToUse,
      customerAddress: customerAddress || undefined,
      customerPhone: selectedCustomer?.phone || undefined,
      customerEmail: selectedCustomer?.email || undefined,
      quoteTitle,
      packageDescription: undefined,
      total: String(cartTotalAfterDiscount.high),
      quoteData: JSON.stringify(fullQuoteData),
    });
  };

  // Save to CRM Quote mutation
  const saveToCrmMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      propertyId?: string;
      projectId?: string;
      workOrderId?: string;
      title: string;
      description?: string;
      notes?: string;
      lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        taxable?: boolean;
        optionTag?: string;
        imageUrl?: string;
      }>;
      status?: string;
      quoteMode?: string;
      quoteType?: string;
      assignedToId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/crm/quotes/from-proposal", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Saved to CRM!",
        description: `Quote ${data.quote?.quoteNumber || ''} created successfully.`,
      });
      if (data.quote) {
        queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
          if (!old?.quotes) return old;
          return { ...old, quotes: [data.quote, ...old.quotes] };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setQuoteDialogOpen(false);
      if (data.quote?.id) {
        // Unmount TipTap editor first so ProseMirror can clean up DOM references
        // before React tears down the page, preventing getComputedStyle crash
        setIsNavigatingAway(true);
        setTimeout(() => {
          setLocation(`/crm/quotes/${data.quote.id}`);
        }, 150);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save to CRM. Please try again.",
        variant: "destructive",
      });
      console.error("Save to CRM error:", error);
    },
  });

  const handleSaveToCrm = () => {
    if (cart.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Please add equipment to the cart first.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCustomer) {
      toast({
        title: "Customer Required",
        description: "Please search and select a customer to save to CRM.",
        variant: "destructive",
      });
      return;
    }

    if (isLoadingProperties) {
      toast({
        title: "Please Wait",
        description: "Still loading customer properties...",
        variant: "destructive",
      });
      return;
    }

    // Build line items from cart items (preserves optionTag for multi-option quotes)
    const lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxable: boolean;
      optionTag?: string;
      imageUrl?: string;
    }> = [];
    
    cart.forEach(item => {
      if (isHvacPackage(item)) {
        const price = item.eliteData ? item.eliteData.finalTotal : parseFloat(item.totalInvestment) || 0;
        // Build equipment images JSON for display in public quote view
        const equipmentImages: Record<string, string> = {};
        if (item.outdoorImageUrl) equipmentImages.outdoor = item.outdoorImageUrl;
        if (item.thermostatImageUrl) equipmentImages.thermostat = item.thermostatImageUrl;
        if (item.coilImageUrl) equipmentImages.coil = item.coilImageUrl;
        if (item.furnaceImageUrl) equipmentImages.furnace = item.furnaceImageUrl;
        
        // For options mode, create unique option tags that include tonnage to distinguish multiple systems
        // e.g., "Best - 2.5 Ton" instead of just "Best" when there are multiple systems
        const uniqueOptionTag = quoteMode === "options" 
          ? `${item.packageLevel} - ${item.extractedTonnage}` 
          : undefined;
        
        lineItems.push({
          description: `${item.packageLevel} Package - ${item.extractedTonnage} - ${item.outdoorBrand} ${item.outdoorName}`,
          quantity: item.quantity,
          unitPrice: price,
          taxable: true,
          optionTag: uniqueOptionTag,
          imageUrl: Object.keys(equipmentImages).length > 0 ? JSON.stringify(equipmentImages) : undefined,
        });
      } else if (isCrawlspaceItem(item)) {
        const price = item.eliteData ? item.eliteData.finalTotal : item.pricingBreakdown.totalPrice;
        lineItems.push({
          description: `Crawlspace Encapsulation - ${item.tier.name} (${item.pricingBreakdown.bandSqft.toLocaleString()} sqft)`,
          quantity: item.quantity,
          unitPrice: price,
          taxable: true,
          optionTag: quoteMode === "options" ? item.tier.name : undefined,
        });
      } else if (isCustomBuild(item)) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        // Build equipment images JSON for custom builds
        const equipmentImages: Record<string, string> = {};
        if (item.outdoorUnit?.imageUrl) equipmentImages.outdoor = item.outdoorUnit.imageUrl;
        if (item.thermostat?.imageUrl) equipmentImages.thermostat = item.thermostat.imageUrl;
        if (item.coil?.imageUrl) equipmentImages.coil = item.coil.imageUrl;
        if (item.indoorUnit?.imageUrl) equipmentImages.furnace = item.indoorUnit.imageUrl;
        
        lineItems.push({
          description: `Custom Build - ${item.tonnage} System`,
          quantity: item.quantity,
          unitPrice: estimate.high,
          taxable: true,
          optionTag: quoteMode === "options" ? "Custom Build" : undefined,
          imageUrl: Object.keys(equipmentImages).length > 0 ? JSON.stringify(equipmentImages) : undefined,
        });
      }
    });

    // Check if property selection is required and valid
    const propertyIdToUse = selectedPropertyId || preloadedPropertyId;
    
    // Validate that propertyIdToUse belongs to current customer's properties
    const isValidProperty = customerProperties.length === 0 || 
      customerProperties.some(p => p.id === propertyIdToUse);
    
    if (customerProperties.length > 1 && (!propertyIdToUse || !isValidProperty)) {
      toast({
        title: "Property Required",
        description: "Please select a property/site for this quote.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate assigned user for install quotes
    if (!assignedToId) {
      toast({
        title: "Assignment Required",
        description: "Please assign this quote to a team member before saving to CRM.",
        variant: "destructive",
      });
      return;
    }
    
    // Only use propertyId if it's valid for this customer
    const finalPropertyId = isValidProperty ? propertyIdToUse : 
      (customerProperties.length === 1 ? customerProperties[0].id : undefined);

    const crmTitle = cart.length > 0
      ? (isHvacPackage(cart[0]) ? `${cart[0].packageLevel} Package Proposal` : "Equipment Proposal")
      : "Equipment Proposal";

    saveToCrmMutation.mutate({
      customerId: selectedCustomer.id,
      propertyId: finalPropertyId || undefined,
      projectId: preloadedProjectId || undefined,
      workOrderId: preloadedWorkOrderId || undefined,
      title: crmTitle,
      description: (proposalNotes && proposalNotes !== '<p></p>') ? proposalNotes : undefined,
      notes: customerNotes || undefined,
      lineItems,
      status: "draft",
      quoteMode: quoteMode,
      quoteType: "proposal",
      assignedToId: assignedToId || undefined,
    });
  };

  const handleSelectCustomer = (customer: CrmCustomerForProposal) => {
    const cleanName = customer.name.replace(/^["']|["']$/g, '');
    setCustomerName(cleanName);
    setCustomerAddress(customer.fullAddress || '');
    setSelectedCustomer(customer);
    setCustomerSearchTerm("");
    setIsCustomerPopoverOpen(false);
    toast({ description: `Customer "${cleanName}" selected`, duration: 2000 });
    // Properties are fetched via useEffect when selectedCustomer changes
  };

  const handleAcceptQuote = () => {
    if (!selectedCustomer) {
      toast({
        title: "Customer Required",
        description: "Please search and select a customer before accepting this quote.",
        variant: "destructive",
      });
      return;
    }

    const equipmentDetails = cart.map(item => {
      if (isCrawlspaceItem(item)) {
        const basePrice = item.pricingBreakdown.totalPrice;
        const finalPrice = item.eliteData ? item.eliteData.finalTotal : basePrice;
        return {
          type: "crawlspace",
          tierName: item.tier.name,
          tierDescription: item.tier.description,
          tierPrice: basePrice,
          sqft: item.sqft,
          bandSqft: item.pricingBreakdown.bandSqft,
          quantity: item.quantity,
          totalPrice: finalPrice * item.quantity,
          isElite: !!item.eliteData,
          eliteDiscount: item.eliteData?.discountAmount || 0,
          eliteSavings: item.eliteData ? item.eliteData.discountAmount * item.quantity : 0,
          eliteBundles: item.eliteData?.coreBundlePrices || null,
        };
      } else if (isCustomBuild(item)) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return {
          type: "custom",
          tonnage: item.tonnage,
          quantity: item.quantity,
          priceLow: estimate.low * item.quantity,
          priceHigh: estimate.high * item.quantity,
          outdoor: item.outdoorUnit ? {
            brand: item.outdoorUnit.brand,
            model: item.outdoorUnit.model,
            name: item.outdoorUnit.unitName,
          } : null,
          coil: item.coil ? {
            brand: item.coil.brand,
            model: item.coil.model,
            name: item.coil.unitName,
          } : null,
          indoor: item.indoorUnit ? {
            brand: item.indoorUnit.brand,
            model: item.indoorUnit.model,
            name: item.indoorUnit.unitName,
          } : null,
          thermostat: item.thermostat ? {
            brand: item.thermostat.brand,
            model: item.thermostat.model,
            name: item.thermostat.unitName,
          } : null,
        };
      } else {
        const basePrice = parseFloat(item.totalInvestment) || 0;
        const finalPrice = item.eliteData ? item.eliteData.finalTotal : basePrice;
        const itemPrice = finalPrice * item.quantity;
        const baseMonthly = parseFloat(item.monthlyPayment) || 0;
        const monthlyPrice = item.eliteData 
          ? Math.round(item.eliteData.finalTotal / 67) * item.quantity
          : baseMonthly * item.quantity;
        return {
          type: "package",
          unitType: item.unitType,
          unitTypeName: UNIT_TYPE_INFO[item.unitType]?.name || item.unitType,
          tier: item.tier,
          tonnage: item.extractedTonnage,
          packageLevel: item.packageLevel,
          quantity: item.quantity,
          totalPrice: itemPrice,
          monthlyPayment: monthlyPrice,
          outdoor: {
            brand: item.outdoorBrand,
            model: item.outdoorModel,
            name: item.outdoorName,
          },
          indoor: item.indoorHeatName ? {
            name: item.indoorHeatName,
            model: item.indoorHeatModel,
          } : null,
          thermostat: item.thermostatName ? {
            name: item.thermostatName,
            model: item.thermostatModel,
          } : null,
          isElite: !!item.eliteData,
          eliteDiscount: item.eliteData?.discountAmount || 0,
          eliteSavings: item.eliteData ? item.eliteData.discountAmount * item.quantity : 0,
          eliteBundles: item.eliteData?.coreBundlePrices || null,
          eliteAirflowOption: item.eliteData?.selectedAirflowOptionId || null,
          eliteAirflowPrice: item.eliteData?.airflowPrice || 0,
        };
      }
    });

    acceptQuoteMutation.mutate({
      customerName,
      phone: selectedCustomer?.phone || undefined,
      email: selectedCustomer?.email || undefined,
      address: customerAddress || undefined,
      estimatedValue: cartTotal,
      equipmentDetails,
      totalLow: cartTotalRange.low,
      totalHigh: cartTotalRange.high,
      monthlyLow: cartMonthlyTotalRange.low,
      monthlyHigh: cartMonthlyTotalRange.high,
      notes: customerNotes || undefined,
      hasCustomBuilds: hasEstimatedItems,
    });
  };

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({
      name: customerName,
      address: customerAddress,
      notes: customerNotes,
    }));
  }, [customerName, customerAddress, customerNotes]);

  // Reset custom build selections when tonnage changes
  useEffect(() => {
    setSelectedOutdoorUnit(null);
    setSelectedCoil(null);
    setSelectedIndoorUnit(null);
    setSelectedThermostat(null);
  }, [customTonnage]);

  const unitTypes = useMemo(() => {
    const allTypes = Array.from(new Set(packages.map(p => p.unitType)));
    // Order: HVAC systems first (GP, PHP, SGA, SHP), then Ducting, then Mini-Split
    const orderedTypes = ["GP", "PHP", "SGA", "SHP", "Ducting", "Mini-Split"];
    return orderedTypes.filter(t => allTypes.includes(t));
  }, [packages]);

  const tiersForUnitType = useMemo(() => {
    if (!selectedUnitType) return [];
    return Array.from(new Set(packages.filter(p => p.unitType === selectedUnitType).map(p => p.tier)));
  }, [selectedUnitType]);

  // Auto-select tier if there's only one (skip step 2)
  useEffect(() => {
    if (selectedUnitType && tiersForUnitType.length === 1 && !selectedTier) {
      setSelectedTier(tiersForUnitType[0]);
    }
  }, [selectedUnitType, tiersForUnitType, selectedTier]);

  const hasSingleTier = tiersForUnitType.length === 1;

  const tonnagesForSelection = useMemo(() => {
    if (!selectedUnitType || !selectedTier) return [];
    const filteredPackages = packages.filter(
      p => p.unitType === selectedUnitType && p.tier === selectedTier
    );
    const tonnages = new Set<string>();
    filteredPackages.forEach(pkg => {
      const tonnage = getPackageTonnageDisplay(pkg);
      if (tonnage && tonnage !== "Unknown") tonnages.add(tonnage);
    });
    return Array.from(tonnages).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return numA - numB;
    });
  }, [selectedUnitType, selectedTier]);

  // Auto-select tonnage if there's only one option (e.g., "All" for Mini-Split)
  const hasSingleTonnage = tonnagesForSelection.length === 1;
  
  useEffect(() => {
    if (selectedTier && hasSingleTonnage && !selectedTonnage) {
      setSelectedTonnage(tonnagesForSelection[0]);
    }
  }, [selectedTier, hasSingleTonnage, selectedTonnage, tonnagesForSelection]);

  const packageOptions = useMemo(() => {
    if (!selectedUnitType || !selectedTier || !selectedTonnage) return [];
    
    const filtered = packages.filter(pkg => {
      if (pkg.unitType !== selectedUnitType || pkg.tier !== selectedTier) return false;
      const pkgTonnage = getPackageTonnageDisplay(pkg);
      // If tonnage is "All", show all packages for this unit type/tier
      if (selectedTonnage === "All" || pkgTonnage === "All") return true;
      return pkgTonnage === selectedTonnage;
    });
    
    return filtered.sort((a, b) => {
      // For standard package levels (Best/Better/Good/Budget)
      const aIdx = PACKAGE_LEVEL_ORDER.indexOf(a.packageLevel);
      const bIdx = PACKAGE_LEVEL_ORDER.indexOf(b.packageLevel);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      // For BTU-based levels (Mini-Split: 6K, 9K, etc.), sort by numeric value
      const aNum = parseInt(a.packageLevel.replace('K', ''));
      const bNum = parseInt(b.packageLevel.replace('K', ''));
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return 0;
    });
  }, [selectedUnitType, selectedTier, selectedTonnage]);

  // Custom build packages for Mini-Split and Ducting (show all packages)
  const customBuildPackageOptions = useMemo(() => {
    if (!customEquipmentType || (customEquipmentType !== "Mini-Split" && customEquipmentType !== "Ducting")) return [];
    
    const filtered = packages.filter(pkg => pkg.unitType === customEquipmentType && pkg.tier === "Standard");
    
    return filtered.sort((a, b) => {
      // For BTU-based levels (Mini-Split: 6K, 9K, etc.) or tonnage-based (Ducting)
      const aNum = parseFloat(a.packageLevel.replace('K', '').replace(' Ton', ''));
      const bNum = parseFloat(b.packageLevel.replace('K', '').replace(' Ton', ''));
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return 0;
    });
  }, [customEquipmentType, packages]);

  // Check if this is a package unit type (PHP or GP)
  const isPackageUnitType = customEquipmentType === "PHP" || customEquipmentType === "GP";

  // Build sets of allowed models from SGA and SHP preset packages
  // This ensures Build Your Own only shows components that exist in preset packages
  const allowedSgaModels = useMemo(() => {
    const sgaPackages = packages.filter(p => p.unitType === "SGA");
    return {
      outdoor: new Set(sgaPackages.map(p => p.outdoorModel).filter(Boolean)),
      coil: new Set(sgaPackages.map(p => p.coilModel).filter(Boolean)),
      indoor: new Set(sgaPackages.map(p => p.indoorHeatModel).filter(Boolean)),
      thermostat: new Set(sgaPackages.map(p => p.thermostatModel).filter(Boolean)),
    };
  }, [packages]);

  const allowedShpModels = useMemo(() => {
    const shpPackages = packages.filter(p => p.unitType === "SHP");
    return {
      outdoor: new Set(shpPackages.map(p => p.outdoorModel).filter(Boolean)),
      coil: new Set(shpPackages.map(p => p.coilModel).filter(Boolean)),
      indoor: new Set(shpPackages.map(p => p.indoorHeatModel).filter(Boolean)),
      thermostat: new Set(shpPackages.map(p => p.thermostatModel).filter(Boolean)),
    };
  }, [packages]);
  
  // Filter outdoor units / package units by equipment type and tonnage - dedupe by model
  // For SGA/SHP: only show models that exist in preset packages
  const outdoorUnitOptions = useMemo(() => {
    if (!customTonnage || !customEquipmentType) return [];
    const seen = new Set<string>();
    const numericTonnage = customTonnage.replace(" Ton", "");
    const isSgaOrShp = customEquipmentType === "SGA" || customEquipmentType === "SHP";
    const allowedModels = customEquipmentType === "SGA" ? allowedSgaModels.outdoor : 
                          customEquipmentType === "SHP" ? allowedShpModels.outdoor : null;
    
    return components.filter(comp => {
      if (comp.unitType !== customEquipmentType) return false;
      
      // For SGA/SHP, only allow models that exist in preset packages
      if (isSgaOrShp && allowedModels && !allowedModels.has(comp.model)) return false;
      
      // For PHP/GP, look for Package Unit component type
      if (isPackageUnitType) {
        if (comp.componentType !== "Package Unit") return false;
        if (comp.tonnage !== numericTonnage) return false;
      } else {
        // For SGA/SHP, look for outdoor units (Air Conditioner or Heat Pump)
        const compTonnage = extractTonnageFromModel(comp.model);
        const matchesTonnage = compTonnage === customTonnage;
        const matchesType = OUTDOOR_UNIT_TYPES.includes(comp.componentType);
        if (!matchesTonnage || !matchesType) return false;
      }
      
      const matchesBrand = outdoorBrandFilter === "All Brands" || comp.brand === outdoorBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, customEquipmentType, outdoorBrandFilter, isPackageUnitType, allowedSgaModels, allowedShpModels]);

  // Get unique coils/air handlers/heater kits by equipment type - dedupe by model
  // SGA uses Evaporator Coil, SHP uses Air Handler, PHP uses Heater Kit
  const coilOrHeaterLabel = customEquipmentType === "PHP" ? "Heater Kit" : customEquipmentType === "SHP" ? "Air Handler" : "Evaporator Coil";
  
  const coilOptions = useMemo(() => {
    if (!customTonnage || !customEquipmentType) return [];
    const seen = new Set<string>();
    // SGA uses Evaporator Coil, SHP uses Air Handler, PHP uses Heater Kit
    const targetType = customEquipmentType === "PHP" ? "Heater Kit" : customEquipmentType === "SHP" ? "Air Handler" : "Evaporator Coil";
    // Extract numeric tonnage from "1.5 Ton" format
    const numericTonnage = customTonnage.replace(" Ton", "");
    const isSgaOrShp = customEquipmentType === "SGA" || customEquipmentType === "SHP";
    // For SHP, Air Handler models are in indoorHeatModel field (use allowedShpModels.indoor)
    const allowedModels = customEquipmentType === "SGA" ? allowedSgaModels.coil : 
                          customEquipmentType === "SHP" ? allowedShpModels.indoor : null;
    return components.filter(comp => {
      if (comp.unitType !== customEquipmentType) return false;
      // For SGA/SHP, only allow models that exist in preset packages
      if (isSgaOrShp && allowedModels && !allowedModels.has(comp.model)) return false;
      if (comp.componentType !== targetType) return false;
      // For PHP heater kits, match by tonnage (SHP Air Handlers don't have matching tonnages in data)
      if (targetType === "Heater Kit" && comp.tonnage !== numericTonnage) return false;
      const matchesBrand = coilBrandFilter === "All Brands" || comp.brand === coilBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, customEquipmentType, coilBrandFilter, allowedSgaModels, allowedShpModels]);

  // Get unique indoor units by equipment type - dedupe by model
  // For SGA/SHP: only show models that exist in preset packages
  const indoorUnitOptions = useMemo(() => {
    if (!customTonnage || !customEquipmentType) return [];
    const seen = new Set<string>();
    const isSgaOrShp = customEquipmentType === "SGA" || customEquipmentType === "SHP";
    const allowedModels = customEquipmentType === "SGA" ? allowedSgaModels.indoor : 
                          customEquipmentType === "SHP" ? allowedShpModels.indoor : null;
    return components.filter(comp => {
      if (comp.unitType !== customEquipmentType) return false;
      // For SGA/SHP, only allow models that exist in preset packages
      if (isSgaOrShp && allowedModels && !allowedModels.has(comp.model)) return false;
      if (!INDOOR_UNIT_TYPES.includes(comp.componentType)) return false;
      const matchesBrand = indoorBrandFilter === "All Brands" || comp.brand === indoorBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, customEquipmentType, indoorBrandFilter, allowedSgaModels, allowedShpModels]);

  // Get unique thermostats by equipment type - dedupe by model
  // For SGA/SHP: only show models that exist in preset packages (thermostats may be labeled under different unit types in components)
  const thermostatOptions = useMemo(() => {
    if (!customTonnage || !customEquipmentType) return [];
    const seen = new Set<string>();
    const numericTonnage = customTonnage.replace(" Ton", "");
    const isSgaOrShp = customEquipmentType === "SGA" || customEquipmentType === "SHP";
    const allowedModels = customEquipmentType === "SGA" ? allowedSgaModels.thermostat : 
                          customEquipmentType === "SHP" ? allowedShpModels.thermostat : null;
    return components.filter(comp => {
      if (comp.componentType !== "Thermostat/Control") return false;
      // For SGA/SHP, filter by allowed models from presets (ignore unitType since thermostats are shared across unit types)
      if (isSgaOrShp) {
        if (!allowedModels || !allowedModels.has(comp.model)) return false;
      } else {
        // For PHP/GP, match by unit type and tonnage
        if (comp.unitType !== customEquipmentType) return false;
        if (comp.tonnage !== numericTonnage) return false;
      }
      const matchesBrand = thermostatBrandFilter === "All Brands" || comp.brand === thermostatBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, customEquipmentType, thermostatBrandFilter, isPackageUnitType, allowedSgaModels, allowedShpModels]);

  // Allow adding to proposal with at least one component selected
  const selectedComponentCount = [selectedOutdoorUnit, selectedCoil, selectedIndoorUnit, selectedThermostat].filter(Boolean).length;
  const isCustomBuildComplete = customTonnage && selectedComponentCount >= 1;

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Canonical pricing: Calculate subtotal BEFORE any discounts (sum of all items at original prices)
  const cartSubtotalPreDiscount = useMemo(() => {
    return cart.reduce((acc, item) => {
      if (isCrawlspaceItem(item)) {
        // For Elite: use originalTotal (pre-discount), otherwise base tier price
        const price = (item.eliteData ? item.eliteData.originalTotal : item.pricingBreakdown.totalPrice) * item.quantity;
        return { low: acc.low + price, high: acc.high + price };
      } else if (isCrawlspaceServicesItem(item)) {
        // Crawlspace services: use totalPrice directly
        const price = item.totalPrice * item.quantity;
        return { low: acc.low + price, high: acc.high + price };
      } else if (isCustomBuild(item)) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return { low: acc.low + estimate.low * item.quantity, high: acc.high + estimate.high * item.quantity };
      } else {
        // For Elite: use originalTotal (pre-discount), otherwise base totalInvestment
        const price = (item.eliteData ? item.eliteData.originalTotal : (parseFloat(item.totalInvestment) || 0)) * item.quantity;
        return { low: acc.low + price, high: acc.high + price };
      }
    }, { low: 0, high: 0 });
  }, [cart]);

  // Calculate total Elite discount amount (20% savings)
  const cartEliteDiscountAmount = useMemo(() => {
    return cart.reduce((total, item) => {
      if (item.eliteData) {
        return total + item.eliteData.discountAmount * item.quantity;
      }
      return total;
    }, 0);
  }, [cart]);

  // Canonical pricing: Total after discount = Subtotal - Elite Discount
  const cartTotalAfterDiscount = useMemo(() => {
    return {
      low: cartSubtotalPreDiscount.low - cartEliteDiscountAmount,
      high: cartSubtotalPreDiscount.high - cartEliteDiscountAmount
    };
  }, [cartSubtotalPreDiscount, cartEliteDiscountAmount]);

  // Legacy aliases for backward compatibility
  const cartTotalRange = cartTotalAfterDiscount;
  const cartTotal = cartTotalRange.high;
  const cartEliteSavings = cartEliteDiscountAmount;

  const cartMonthlyTotalRange = useMemo(() => {
    return cart.reduce((acc, item) => {
      if (isCrawlspaceItem(item)) {
        // Crawlspace: derive monthly from price / 67
        const basePrice = item.eliteData ? item.eliteData.finalTotal : item.pricingBreakdown.totalPrice;
        const monthly = Math.round(basePrice / 67) * item.quantity;
        return { low: acc.low + monthly, high: acc.high + monthly };
      } else if (isCrawlspaceServicesItem(item)) {
        // Crawlspace services: derive monthly from price / 67
        const monthly = Math.round(item.totalPrice / 67) * item.quantity;
        return { low: acc.low + monthly, high: acc.high + monthly };
      } else if (isCustomBuild(item)) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return { 
          low: acc.low + Math.round(estimate.low / 67) * item.quantity, 
          high: acc.high + Math.round(estimate.high / 67) * item.quantity 
        };
      } else {
        // HVAC packages: use proper monthly payment logic
        // For Elite: derive from finalTotal / 67
        // For non-Elite: use the precise monthlyPayment from pricebook
        if (item.eliteData) {
          const monthly = Math.round(item.eliteData.finalTotal / 67) * item.quantity;
          return { low: acc.low + monthly, high: acc.high + monthly };
        } else {
          const monthly = (parseFloat(item.monthlyPayment) || 0) * item.quantity;
          return { low: acc.low + monthly, high: acc.high + monthly };
        }
      }
    }, { low: 0, high: 0 });
  }, [cart]);

  const cartMonthlyTotal = cartMonthlyTotalRange.high; // Use high for backward compatibility

  const hasEstimatedItems = useMemo(() => {
    return cart.some(item => isCustomBuild(item));
  }, [cart]);

  const currentStep = useMemo(() => {
    if (!selectedUnitType) return 1;
    // Calculate step based on skipped steps
    const skipTier = hasSingleTier;
    const skipTonnage = hasSingleTonnage;
    
    if (!selectedTier) return 2; // Will auto-select if single tier
    if (!selectedTonnage) {
      if (skipTier) return 2;
      return 3;
    }
    // Final step (package selection)
    if (skipTier && skipTonnage) return 2;
    if (skipTier || skipTonnage) return 3;
    return 4;
  }, [selectedUnitType, selectedTier, selectedTonnage, hasSingleTier, hasSingleTonnage]);

  const totalSteps = (hasSingleTier && hasSingleTonnage) ? 2 : (hasSingleTier || hasSingleTonnage) ? 3 : 4;

  const customBuildStep = useMemo(() => {
    if (!customEquipmentType) return 1;
    // Mini-Split, Ducting, and Crawlspace Services skip tonnage selection (step 2)
    if (customEquipmentType === "Mini-Split" || customEquipmentType === "Ducting" || customEquipmentType === "Crawlspace Services") return 3;
    if (!customTonnage) return 2;
    return 3;
  }, [customEquipmentType, customTonnage]);

  const addToCart = (pkg: PricebookPackage) => {
    const extractedTonnage = selectedTonnage || getPackageTonnageDisplay(pkg);
    const id = generatePackageId(pkg, extractedTonnage);
    
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing) {
        return prev.map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...pkg, id, extractedTonnage, quantity: 1, isCustomBuild: false as const }];
    });

    toast({
      title: "Added to Proposal",
      description: `${pkg.outdoorBrand} ${pkg.packageLevel} package added.`,
      duration: 2000,
    });
  };

  const addCustomBuildToCart = () => {
    if (!isCustomBuildComplete) {
      toast({
        title: "Incomplete Build",
        description: "Please select all 4 required components.",
        variant: "destructive",
      });
      return;
    }

    const id = generateCustomBuildId(customTonnage!, selectedOutdoorUnit!, selectedCoil!, selectedIndoorUnit!, selectedThermostat!);
    
    const customBuild: CustomBuildCart = {
      id,
      isCustomBuild: true,
      tonnage: customTonnage!,
      outdoorUnit: selectedOutdoorUnit!,
      coil: selectedCoil!,
      indoorUnit: selectedIndoorUnit!,
      thermostat: selectedThermostat!,
      quantity: 1,
    };

    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing) {
        return prev.map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, customBuild];
    });

    toast({
      title: "Custom Build Added",
      description: `Custom ${customTonnage} system added to proposal.`,
    });

    // Reset selections
    setSelectedOutdoorUnit(null);
    setSelectedCoil(null);
    setSelectedIndoorUnit(null);
    setSelectedThermostat(null);
  };

  const addCrawlspaceToCart = (tier: CrawlspaceTier, sqft: number, withElite: boolean = false) => {
    // Calculate pricing based on sqft
    const pricingBreakdown = calculateCrawlspacePricing(sqft, tier.name);
    const basePrice = pricingBreakdown.totalPrice;
    
    const id = withElite 
      ? `crawlspace-elite-${tier.name.toLowerCase()}-${sqft}`
      : `crawlspace-${tier.name.toLowerCase()}-${sqft}`;
    
    let eliteData: ElitePackageData | undefined;
    if (withElite) {
      eliteData = calculateCrawlspaceElitePricing(basePrice);
    }

    const crawlspaceItem: CrawlspaceCartItem = {
      id,
      isCrawlspace: true,
      tier,
      sqft,
      pricingBreakdown,
      quantity: 1,
      eliteData,
    };

    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing) {
        return prev.map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, crawlspaceItem];
    });

    toast({
      title: withElite ? "Elite Crawlspace Added!" : "Crawlspace Added",
      description: withElite 
        ? `${tier.name} package (${sqft} sqft) with Elite bundle added.`
        : `${tier.name} crawlspace package (${sqft} sqft) added.`,
    });

    setSelectedCrawlspaceTier(null);
    setCrawlspaceEliteEnabled(false);
    setCrawlspaceSqft("1000");
  };

  const calculateCrawlspaceServicesTotal = (sqft: number, serviceIds: string[], doorOptionId: string | null): number => {
    let total = 0;
    
    for (const serviceId of serviceIds) {
      const service = CRAWLSPACE_SERVICES.SERVICES.find(s => s.id === serviceId);
      if (service) {
        const effectiveSqft = Math.max(sqft, service.minSqft);
        total += effectiveSqft * service.ratePerSqft;
      }
    }
    
    if (doorOptionId) {
      const doorOption = CRAWLSPACE_SERVICES.DOOR_OPTIONS.find(d => d.id === doorOptionId);
      if (doorOption) {
        total += doorOption.price;
      }
    }
    
    return Math.round(total * 100) / 100;
  };

  const addCrawlspaceServicesToCart = () => {
    const sqft = parseInt(crawlspaceServicesSqft) || 1000;
    
    if (selectedCrawlspaceServices.length === 0 && !selectedDoorOption) {
      toast({
        title: "No services selected",
        description: "Please select at least one service or door option.",
        variant: "destructive",
      });
      return;
    }
    
    const totalPrice = calculateCrawlspaceServicesTotal(sqft, selectedCrawlspaceServices, selectedDoorOption);
    const id = `crawlspace-services-${sqft}-${selectedCrawlspaceServices.join('-')}-${selectedDoorOption || 'none'}`;
    
    const servicesItem: CrawlspaceServicesCartItem = {
      id,
      isCrawlspaceServices: true,
      selections: {
        sqft,
        services: selectedCrawlspaceServices,
        doorOption: selectedDoorOption,
      },
      totalPrice,
      quantity: 1,
    };
    
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing) {
        return prev.map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, servicesItem];
    });
    
    const serviceNames = selectedCrawlspaceServices.map(id => 
      CRAWLSPACE_SERVICES.SERVICES.find(s => s.id === id)?.name || id
    ).join(', ');
    const doorName = selectedDoorOption 
      ? CRAWLSPACE_SERVICES.DOOR_OPTIONS.find(d => d.id === selectedDoorOption)?.name 
      : null;
    
    toast({
      title: "Crawlspace Services Added",
      description: `${serviceNames}${doorName ? `, ${doorName}` : ''} for ${sqft} sqft added.`,
    });
    
    setSelectedCrawlspaceServices([]);
    setSelectedDoorOption(null);
    setCrawlspaceServicesSqft("1000");
    setCustomEquipmentType(null);
  };

  const addToCartWithElite = (pkg: PricebookPackage, index: number) => {
    const extractedTonnage = selectedTonnage || getPackageTonnageDisplay(pkg);
    const airflowSelection = selectedAirflowByIndex[index];
    const id = airflowSelection 
      ? `elite-${pkg.unitType}-${pkg.tier}-${extractedTonnage}-${pkg.packageLevel}-${pkg.outdoorModel}`
      : generatePackageId(pkg, extractedTonnage);
    
    let eliteData: ElitePackageData | undefined;
    if (airflowSelection) {
      const airflowOption = HVAC_ELITE_AIRFLOW_OPTIONS.find(opt => opt.name === airflowSelection)!;
      const result = calculateHvacElitePricing(parseFloat(pkg.totalInvestment) || 0, pkg.tonnage, airflowOption.id);
      eliteData = result || undefined;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing) {
        return prev.map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...pkg, id, extractedTonnage, quantity: 1, isCustomBuild: false as const, eliteData }];
    });

    toast({
      title: eliteData ? "Elite Package Added!" : "Added to Proposal",
      description: eliteData 
        ? `${pkg.outdoorBrand} ${pkg.packageLevel} with Elite upgrades added.`
        : `${pkg.outdoorBrand} ${pkg.packageLevel} package added.`,
      duration: 2000,
    });

    setEliteEnabledByIndex(prev => ({ ...prev, [index]: false }));
    setSelectedAirflowByIndex(prev => ({ ...prev, [index]: '' }));
  };

  const removeFromCart = (packageId: string) => {
    setCart(prev => prev.filter(item => item.id !== packageId));
  };

  const handleBack = () => {
    // When going back from packages view
    if (selectedTonnage) {
      // If tonnage step was skipped (e.g., Mini-Split with "All"), go back to tier or unit type
      if (hasSingleTonnage) {
        setSelectedTonnage(null);
        if (hasSingleTier) {
          setSelectedTier(null);
          setSelectedUnitType(null);
        } else {
          setSelectedTier(null);
        }
      } else {
        setSelectedTonnage(null);
      }
    } else if (selectedTier) {
      // If single tier, go back to unit type selection
      if (hasSingleTier) {
        setSelectedTier(null);
        setSelectedUnitType(null);
      } else {
        setSelectedTier(null);
      }
    } else if (selectedUnitType) {
      setSelectedUnitType(null);
    }
  };

  const handleCustomBuildBack = () => {
    if (customEquipmentType === "Crawlspace Services") {
      setCustomEquipmentType(null);
      setSelectedCrawlspaceServices([]);
      setSelectedDoorOption(null);
      setCrawlspaceServicesSqft("1000");
    } else if (customTonnage) {
      setCustomTonnage(null);
      setSelectedOutdoorUnit(null);
      setSelectedCoil(null);
      setSelectedIndoorUnit(null);
      setSelectedThermostat(null);
    } else if (customEquipmentType) {
      setCustomEquipmentType(null);
    }
  };

  // Get tonnages available for selected equipment type
  const customTonnageOptions = useMemo(() => {
    if (!customEquipmentType) return TONNAGE_OPTIONS;
    const filteredComponents = components.filter(c => c.unitType === customEquipmentType);
    const tonnages = new Set<string>();
    filteredComponents.forEach(c => {
      const tonnage = extractTonnageFromModel(c.model);
      if (tonnage) tonnages.add(tonnage);
    });
    return TONNAGE_OPTIONS.filter(t => tonnages.has(t));
  }, [customEquipmentType]);

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerAddress('');
    setCustomerNotes('');
    toast({
      title: "Cart Cleared",
      description: "All packages have been removed from your proposal.",
    });
  };

  const openQuoteDialog = () => {
    if (cart.length === 0) return;
    const returnUrl = routeParams.customerId
      ? `/crm/quotes/proposal/${routeParams.customerId}`
      : "/crm/quotes/proposal";
    const previewState = {
      cart,
      selectedCustomer,
      quoteMode,
      customerNotes,
      proposalNotes,
      assignedToId,
      selectedPropertyId,
      preloadedPropertyId,
      preloadedProjectId,
      preloadedWorkOrderId,
      customerProperties,
      assignableUsers: assignableUsers || [],
      returnUrl,
      computedTotals: {
        cartSubtotalPreDiscount,
        cartEliteDiscountAmount,
        cartTotalAfterDiscount,
        cartMonthlyTotalRange,
        hasEstimatedItems,
      },
    };
    sessionStorage.setItem("ghvac-proposal-preview-state", JSON.stringify(previewState));
    setLocation("/crm/proposal-preview");
  };

  const htmlToPlainText = (html: string): string => {
    return html
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n$1\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '\u2022 $1\n')
      .replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, '')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
      .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const buildCartLineItems = () => {
    return cart.map(item => {
      if (isCrawlspaceItem(item)) {
        const unitPrice = item.eliteData ? item.eliteData.finalTotal : item.pricingBreakdown.totalPrice;
        return {
          name: `Crawlspace Encapsulation — ${item.tier.name}`,
          description: `${item.tier.milThickness} Mil, ${item.pricingBreakdown.bandSqft.toLocaleString()} sq ft`,
          qty: item.quantity,
          price: unitPrice * item.quantity,
        };
      } else if (isCustomBuild(item)) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return {
          name: `Custom Build — ${item.tonnage} System`,
          description: [
            item.outdoorUnit ? `${item.outdoorUnit.brand} ${item.outdoorUnit.unitName}` : null,
            item.thermostat ? `Thermostat: ${item.thermostat.brand} ${item.thermostat.unitName}` : null,
          ].filter(Boolean).join(', '),
          qty: item.quantity,
          price: estimate.high * item.quantity,
        };
      } else if (isCrawlspaceServicesItem(item)) {
        return {
          name: 'Crawlspace Services',
          description: `${item.selections.sqft?.toLocaleString() ?? ''} sq ft`,
          qty: item.quantity,
          price: item.totalPrice * item.quantity,
        };
      } else {
        const unitTypeName = UNIT_TYPE_INFO[item.unitType]?.name || item.unitType;
        const basePrice = parseFloat(item.totalInvestment) || 0;
        const finalPrice = item.eliteData ? item.eliteData.finalTotal : basePrice;
        return {
          name: `${unitTypeName} — ${item.packageLevel} ${item.extractedTonnage}`,
          description: `${item.tier} | ${item.outdoorBrand} ${item.outdoorName}${item.eliteData ? ' | Elite Package' : ''}`,
          qty: item.quantity,
          price: finalPrice * item.quantity,
        };
      }
    });
  };

  const downloadQuoteAsDoc = async () => {
    if (cart.length === 0) return;
    try {
      const paragraphs: Paragraph[] = [];
      const lineItems = buildCartLineItems();

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: COMPANY_INFO.name, bold: true, size: 36 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      }));
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: COMPANY_INFO.tagline, italics: true, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }));
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: `${COMPANY_INFO.address} | Phone: ${COMPANY_INFO.phone} | ${COMPANY_INFO.email}`, size: 20 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }));
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: COMPANY_INFO.documentTitle, bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }));

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'Prepared for: ', bold: true }), new TextRun({ text: customerName || 'Valued Customer' })],
        spacing: { after: 40 },
      }));
      if (customerAddress) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: customerAddress })], spacing: { after: 80 } }));
      }
      paragraphs.push(new Paragraph({
        border: { bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 } },
        spacing: { after: 200 },
        children: [],
      }));

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'Equipment & Services', bold: true, size: 26 })],
        spacing: { after: 120 },
      }));

      lineItems.forEach(item => {
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: `${item.name}`, bold: true }),
            new TextRun({ text: `  (Qty: ${item.qty})  —  $${item.price.toLocaleString()}` }),
          ],
          spacing: { after: 40 },
        }));
        if (item.description) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: item.description, italics: true, color: '555555' })],
            spacing: { after: 80 },
          }));
        }
      });

      paragraphs.push(new Paragraph({
        border: { bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 } },
        spacing: { after: 120 },
        children: [],
      }));

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'Pricing Summary', bold: true, size: 26 })],
        spacing: { after: 120 },
      }));
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'Subtotal: ' }), new TextRun({ text: `$${cartSubtotalPreDiscount.high.toLocaleString()}`, bold: true })],
        spacing: { after: 40 },
      }));
      if (cartEliteDiscountAmount > 0) {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: 'Elite Bundle Discount: ' }), new TextRun({ text: `-$${cartEliteDiscountAmount.toLocaleString()}`, bold: true, color: '16a34a' })],
          spacing: { after: 40 },
        }));
      }
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'Total Investment: ' }), new TextRun({ text: `$${cartTotalAfterDiscount.high.toLocaleString()}`, bold: true, size: 28 })],
        spacing: { after: 40 },
      }));
      if (cartMonthlyTotalRange.high > 0) {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: `Estimated Monthly: $${cartMonthlyTotalRange.high.toLocaleString()}/mo (financing, OAC)`, italics: true })],
          spacing: { after: 120 },
        }));
      }

      if (proposalNotes && proposalNotes !== '<p></p>') {
        paragraphs.push(new Paragraph({
          border: { bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 } },
          spacing: { after: 120 },
          children: [],
        }));
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: 'Proposal Notes', bold: true, size: 26 })],
          spacing: { after: 120 },
        }));
        const notesText = htmlToPlainText(proposalNotes);
        notesText.split('\n').forEach(line => {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: line })],
            spacing: { after: 40 },
          }));
        });
      }

      paragraphs.push(new Paragraph({
        border: { bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 } },
        spacing: { after: 120 },
        children: [],
      }));
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'Warranties & Terms', bold: true, size: 26 })],
        spacing: { after: 80 },
      }));
      [
        '10-Year Parts & Labor Warranty on all HVAC equipment',
        'Licensed & Insured — HVAC Contractor License',
        'All work performed to manufacturer and local code standards',
        'Proposal valid for 30 days from date of issue',
      ].forEach(term => {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: `• ${term}` })],
          spacing: { after: 40 },
        }));
      });

      const doc = new Document({ sections: [{ children: paragraphs }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${customerName || 'Proposal'}_Quote.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Document Downloaded', description: 'Proposal saved as a Word document.' });
    } catch (error) {
      console.error('Error generating document:', error);
      toast({ title: 'Download Failed', description: 'Could not generate the document. Please try again.', variant: 'destructive' });
    }
  };

  const downloadQuoteAsPDF = async () => {
    if (cart.length === 0) return;
    try {
      const lineItems = buildCartLineItems();
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = margin;

      const checkPage = (needed: number) => {
        if (y + needed > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
      };

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(COMPANY_INFO.name, pageW / 2, y, { align: 'center' });
      y += 7;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text(COMPANY_INFO.tagline, pageW / 2, y, { align: 'center' });
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`${COMPANY_INFO.address} | ${COMPANY_INFO.phone} | ${COMPANY_INFO.email}`, pageW / 2, y, { align: 'center' });
      y += 10;
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(COMPANY_INFO.documentTitle, pageW / 2, y, { align: 'center' });
      y += 10;

      doc.setFontSize(11);
      doc.text('Prepared for:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(customerName || 'Valued Customer', margin + 32, y);
      y += 6;
      if (customerAddress) {
        doc.text(customerAddress, margin, y);
        y += 6;
      }
      y += 4;
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Equipment & Services', margin, y);
      y += 7;

      lineItems.forEach(item => {
        checkPage(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const priceStr = `Qty: ${item.qty}  —  $${item.price.toLocaleString()}`;
        doc.text(item.name, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(priceStr, pageW - margin, y, { align: 'right' });
        y += 5;
        if (item.description) {
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          const descLines = doc.splitTextToSize(item.description, contentW);
          doc.text(descLines, margin + 4, y);
          y += descLines.length * 4.5 + 2;
          doc.setTextColor(0, 0, 0);
        }
        y += 2;
      });

      y += 2;
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Pricing Summary', margin, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Subtotal:', margin, y);
      doc.setFont('helvetica', 'bold');
      doc.text(`$${cartSubtotalPreDiscount.high.toLocaleString()}`, pageW - margin, y, { align: 'right' });
      y += 6;
      if (cartEliteDiscountAmount > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(22, 163, 74);
        doc.text('Elite Bundle Discount:', margin, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`-$${cartEliteDiscountAmount.toLocaleString()}`, pageW - margin, y, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Total Investment:', margin, y);
      doc.text(`$${cartTotalAfterDiscount.high.toLocaleString()}`, pageW - margin, y, { align: 'right' });
      y += 6;
      if (cartMonthlyTotalRange.high > 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text(`Estimated Monthly: $${cartMonthlyTotalRange.high.toLocaleString()}/mo (financing, OAC)`, margin, y);
        y += 6;
      }

      if (proposalNotes && proposalNotes !== '<p></p>') {
        checkPage(20);
        y += 4;
        doc.line(margin, y, pageW - margin, y);
        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Proposal Notes', margin, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const notesText = htmlToPlainText(proposalNotes);
        const noteLines = doc.splitTextToSize(notesText, contentW);
        noteLines.forEach((line: string) => {
          checkPage(6);
          doc.text(line, margin, y);
          y += 5;
        });
      }

      checkPage(40);
      y += 4;
      doc.line(margin, y, pageW - margin, y);
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Warranties & Terms', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      [
        '10-Year Parts & Labor Warranty on all HVAC equipment',
        'Licensed & Insured — HVAC Contractor License',
        'All work performed to manufacturer and local code standards',
        'Proposal valid for 30 days from date of issue',
      ].forEach(term => {
        checkPage(6);
        doc.text(`• ${term}`, margin, y);
        y += 5;
      });

      doc.save(`${customerName || 'Proposal'}_Quote.pdf`);
      toast({ title: 'PDF Downloaded', description: 'Proposal saved as a PDF.' });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({ title: 'Download Failed', description: 'Could not generate the PDF. Please try again.', variant: 'destructive' });
    }
  };

  const getPackageLevelColor = (level: string) => {
    switch (level) {
      case "Budget": return "bg-gray-500";
      case "Good": return "bg-blue-500";
      case "Better": return "bg-purple-500";
      case "Best": return "bg-amber-500";
      default: return "bg-gray-500";
    }
  };

  const renderComponentCard = (
    comp: PricebookComponent, 
    isSelected: boolean, 
    onSelect: () => void,
    testIdPrefix: string
  ) => (
    <Card
      key={`${comp.model}-${comp.brand}`}
      className={`cursor-pointer transition-all ${isSelected ? 'border-green-500 ring-2 ring-green-500 bg-green-50 dark:bg-green-950' : 'hover:border-primary'}`}
      onClick={onSelect}
      data-testid={`${testIdPrefix}-${comp.model}`}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {comp.imageUrl && (
            <div className="flex-shrink-0">
              <img 
                src={comp.imageUrl}
                alt={comp.model}
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-md bg-gray-50"
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs">
                {comp.brand}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {comp.componentType}
              </Badge>
            </div>
            <p className="font-medium text-sm">{comp.model}</p>
            <p className="text-sm text-muted-foreground">{comp.unitName}</p>
            {comp.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{comp.description}</p>
            )}
          </div>
          {isSelected && (
            <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderBrandFilter = (
    value: string, 
    onChange: (value: string) => void,
    testId: string
  ) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]" data-testid={testId}>
        <Filter className="h-4 w-4 mr-2" />
        <SelectValue placeholder="Filter by brand" />
      </SelectTrigger>
      <SelectContent>
        {BRAND_OPTIONS.map(brand => (
          <SelectItem key={brand} value={brand}>{brand}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderComponentSection = (
    title: string,
    components: PricebookComponent[],
    selectedComponent: PricebookComponent | null,
    setSelectedComponent: (comp: PricebookComponent) => void,
    brandFilter: string,
    setBrandFilter: (value: string) => void,
    testIdPrefix: string,
    isRequired: boolean = true
  ) => (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-lg">{title}</h3>
          {isRequired && <Badge variant="destructive" className="text-xs">Required</Badge>}
          {selectedComponent && (
            <Badge className="bg-green-500 text-white text-xs">
              <Check className="h-3 w-3 mr-1" />
              Selected
            </Badge>
          )}
        </div>
        {renderBrandFilter(brandFilter, setBrandFilter, `filter-${testIdPrefix}`)}
      </div>
      
      {selectedComponent && (
        <div className="mb-3 p-3 bg-green-100 dark:bg-green-900 rounded-lg border border-green-300 dark:border-green-700">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Selected: {selectedComponent.brand} {selectedComponent.model}
          </p>
          <p className="text-xs text-green-700 dark:text-green-300">{selectedComponent.unitName}</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {components.length > 0 ? (
          components.map(comp => 
            renderComponentCard(
              comp, 
              selectedComponent?.model === comp.model && selectedComponent?.brand === comp.brand,
              () => setSelectedComponent(comp),
              testIdPrefix
            )
          )
        ) : (
          <div className="col-span-2 text-center py-6 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No components found for this tonnage and brand filter</p>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoadingUser || isLoadingPackages || isLoadingCrawlspaceTiers) {
    return (
      <CrmLayout currentUser={currentUser as CrmUser}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Loading packages...</p>
            </div>
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="flex flex-col h-full min-h-0">
        {/* Fixed Header */}
        <div className="flex flex-col gap-4 pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => window.history.back()} data-testid="button-back-to-quotes">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">Proposal Builder</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative min-h-[44px] min-w-[44px]"
                  data-testid="button-cart"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {cartItemCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                    >
                      {cartItemCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Proposal Cart ({cartItemCount} packages)
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-380px)] mt-4 pr-2">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Your proposal is empty</p>
                      <p className="text-sm">Add packages to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map(item => (
                        <Card key={item.id} className="p-3" data-testid={`cart-item-${item.id}`}>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              {isCrawlspaceItem(item) ? (
                                <>
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <Badge className="bg-teal-500 text-white text-xs">
                                      Crawlspace
                                    </Badge>
                                    {item.eliteData && (
                                      <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs">
                                        <Crown className="h-3 w-3 mr-1" />
                                        Elite
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      x{item.quantity}
                                    </Badge>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{item.tier.name} Encapsulation</p>
                                    <p className="text-xs text-muted-foreground">{item.tier.description}</p>
                                  </div>
                                  <div className="mt-2 pt-2 border-t">
                                    <p className="text-xs text-muted-foreground mb-1">
                                      {item.pricingBreakdown.bandSqft.toLocaleString()} sqft • {item.pricingBreakdown.rollsNeeded} rolls • {item.pricingBreakdown.dehumidifierModel}
                                    </p>
                                    {item.eliteData ? (
                                      <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                          <span>Base: {formatPrice(item.pricingBreakdown.totalPrice)}</span>
                                          <span className="line-through">{formatPrice(item.eliteData.originalTotal)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <Badge className="bg-green-500 text-white text-xs">
                                            Save {formatPrice(item.eliteData.discountAmount)} (20%)
                                          </Badge>
                                          <span className="font-bold text-sm text-primary">
                                            {formatPrice(item.eliteData.finalTotal * item.quantity)}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="font-bold text-sm text-primary">
                                        {formatPrice(item.pricingBreakdown.totalPrice * item.quantity)}
                                      </p>
                                    )}
                                  </div>
                                </>
                              ) : isCustomBuild(item) ? (
                                <>
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge className="bg-green-500 text-white text-xs">
                                      <Wrench className="h-3 w-3 mr-1" />
                                      Custom Build
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      x{item.quantity}
                                    </Badge>
                                  </div>
                                  <div className="flex gap-3">
                                    <EquipmentImageGrid
                                      images={{
                                        outdoor: item.outdoorUnit?.imageUrl,
                                        coil: item.coil?.imageUrl,
                                        furnace: item.indoorUnit?.imageUrl,
                                        thermostat: item.thermostat?.imageUrl
                                      }}
                                      size="sm"
                                      showLabels
                                      unitType={item.outdoorUnit?.unitType}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm">{item.tonnage} System</p>
                                      {item.outdoorUnit && (
                                        <p className="text-xs text-muted-foreground">
                                          {item.outdoorUnit.brand} {item.outdoorUnit.componentType}
                                        </p>
                                      )}
                                      {item.indoorUnit && (
                                        <p className="text-xs text-muted-foreground">
                                          {item.indoorUnit.brand} {item.indoorUnit.componentType}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-2 pt-2 border-t">
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-xs">Est.</Badge>
                                      <span className="font-bold text-sm text-primary">
                                        {(() => {
                                          const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
                                          return formatPriceRange(estimate.low * item.quantity, estimate.high * item.quantity);
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              ) : isCrawlspaceServicesItem(item) ? (
                                <>
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <Badge className="bg-orange-500 text-white text-xs">
                                      <Wrench className="h-3 w-3 mr-1" />
                                      Crawlspace Services
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      x{item.quantity}
                                    </Badge>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{item.selections.sqft.toLocaleString()} sq ft</p>
                                    <div className="text-xs text-muted-foreground space-y-0.5">
                                      {item.selections.services.map(serviceId => {
                                        const service = CRAWLSPACE_SERVICES.SERVICES.find(s => s.id === serviceId);
                                        return service ? <p key={serviceId}>{service.name}</p> : null;
                                      })}
                                      {item.selections.doorOption && (() => {
                                        const door = CRAWLSPACE_SERVICES.DOOR_OPTIONS.find(d => d.id === item.selections.doorOption);
                                        return door ? <p>{door.name}</p> : null;
                                      })()}
                                    </div>
                                  </div>
                                  <div className="mt-2 pt-2 border-t">
                                    <p className="font-bold text-sm text-primary">
                                      {formatPrice(item.totalPrice * item.quantity)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatPrice(Math.round(item.totalPrice * item.quantity / 67))}/mo
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <Badge className={`${getPackageLevelColor(item.packageLevel)} text-white text-xs`}>
                                      {item.packageLevel}
                                    </Badge>
                                    {item.eliteData && (
                                      <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs">
                                        <Crown className="h-3 w-3 mr-1" />
                                        Elite
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      x{item.quantity}
                                    </Badge>
                                  </div>
                                  <div className="flex gap-3">
                                    <EquipmentImageGrid
                                      images={{
                                        outdoor: item.outdoorImageUrl,
                                        coil: item.coilImageUrl,
                                        furnace: item.furnaceImageUrl,
                                        thermostat: item.thermostatImageUrl
                                      }}
                                      size="sm"
                                      showLabels
                                      unitType={item.unitType}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm">
                                        {UNIT_TYPE_INFO[item.unitType]?.name || item.unitType}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.tier} • {item.extractedTonnage}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {item.outdoorBrand} {item.outdoorModel}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-2 pt-2 border-t">
                                    {item.eliteData ? (
                                      <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                          <span>Base: {formatPrice(parseFloat(item.totalInvestment) || 0)}</span>
                                          <span className="line-through">{formatPrice(item.eliteData.originalTotal)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <Badge className="bg-green-500 text-white text-xs">
                                            Save {formatPrice(item.eliteData.discountAmount)} (20%)
                                          </Badge>
                                          <span className="font-bold text-sm text-primary">
                                            {formatPrice(item.eliteData.finalTotal * item.quantity)}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="font-bold text-sm text-primary">
                                          {formatPrice((parseFloat(item.totalInvestment) || 0) * item.quantity)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {formatPrice((parseFloat(item.monthlyPayment) || 0) * item.quantity)}/mo
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive flex-shrink-0"
                              onClick={() => removeFromCart(item.id)}
                              data-testid={`button-remove-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {cart.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-card border-t space-y-3">
                    {/* Quote Mode Toggle */}
                    <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 rounded-lg p-2">
                      <span className="text-xs font-medium text-muted-foreground">Quote Mode</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={quoteMode === "single" ? "default" : "ghost"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setQuoteMode("single")}
                          data-testid="button-quote-mode-single"
                        >
                          Single
                        </Button>
                        <Button
                          variant={quoteMode === "options" ? "default" : "ghost"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setQuoteMode("options")}
                          data-testid="button-quote-mode-options"
                        >
                          Options
                        </Button>
                      </div>
                    </div>
                    
                    <div className="bg-muted p-3 rounded-lg">
                      {quoteMode === "options" ? (
                        <>
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            {cart.length} Option{cart.length !== 1 ? 's' : ''} (not combined)
                          </div>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {cart.map((item, idx) => {
                              const optionLabel = isHvacPackage(item) ? item.packageLevel : 
                                                  isCrawlspaceItem(item) ? item.tier.name :
                                                  isCrawlspaceServicesItem(item) ? "Crawlspace Services" :
                                                  isCustomBuild(item) ? "Custom Build" : `Option ${idx + 1}`;
                              const optionPrice = isHvacPackage(item) 
                                ? (item.eliteData ? item.eliteData.finalTotal : parseFloat(item.totalInvestment) || 0) * item.quantity
                                : isCrawlspaceItem(item)
                                ? (item.eliteData ? item.eliteData.finalTotal : item.pricingBreakdown.totalPrice) * item.quantity
                                : isCrawlspaceServicesItem(item)
                                ? item.totalPrice * item.quantity
                                : isCustomBuild(item)
                                ? (() => { const est = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat); return est.high * item.quantity; })()
                                : 0;
                              return (
                                <div key={item.id} className="flex justify-between items-center text-sm">
                                  <span className="font-medium">{optionLabel}</span>
                                  <span className="text-primary font-bold">{formatPrice(optionPrice)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          {cartEliteSavings > 0 && (
                            <div className="flex justify-between items-center mb-2 pb-2 border-b border-green-200 dark:border-green-800">
                              <span className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
                                <Crown className="h-4 w-4" />
                                Elite Savings
                              </span>
                              <Badge className="bg-green-500 text-white">
                                You Save {formatPrice(cartEliteSavings)}
                              </Badge>
                            </div>
                          )}
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium">
                              Total Investment {hasEstimatedItems && <Badge variant="outline" className="ml-1 text-xs">Includes Est.</Badge>}
                            </span>
                            <span className="text-xl font-bold text-primary">{formatPrice(cartTotal)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm text-muted-foreground">
                            <span>Monthly Payment</span>
                            <span>{formatPrice(cartMonthlyTotal)}/mo</span>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 min-h-[44px]"
                        onClick={clearCart}
                        data-testid="button-clear-cart"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear
                      </Button>
                      <Button
                        className="flex-1 min-h-[44px]"
                        onClick={openQuoteDialog}
                        disabled={!selectedCustomer}
                        title={!selectedCustomer ? "Select a customer first" : undefined}
                        data-testid="button-generate-quote"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        {selectedCustomer ? 'View Quote' : 'Select Customer First'}
                      </Button>
                    </div>
                  </div>
                )}
              </SheetContent>
              </Sheet>
            </div>
          </div>
          
          {/* Customer Selection Section */}
          <Card className={`border-2 ${selectedCustomer ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700' : 'border-muted'}`}>
            <CardContent className="py-4 px-5">
              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-full text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Customer
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{selectedCustomer.name}</span>
                      {selectedCustomer.fullAddress && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {selectedCustomer.fullAddress}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Property selection for customers with multiple sites */}
                    {customerProperties.length > 1 && (
                      <select
                        value={selectedPropertyId || ""}
                        onChange={(e) => setSelectedPropertyId(e.target.value || null)}
                        className="h-9 px-3 border rounded-md bg-white dark:bg-gray-900 text-sm"
                        data-testid="select-property-main"
                      >
                        <option value="">Select Property...</option>
                        {customerProperties.map((prop) => (
                          <option key={prop.id} value={prop.id}>
                            {prop.address1}, {prop.city}
                          </option>
                        ))}
                      </select>
                    )}
                    {isLoadingProperties && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerName('');
                        setCustomerAddress('');
                        setCustomerProperties([]);
                        setSelectedPropertyId(null);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Change Customer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Search and attach a customer to this proposal (optional)</p>
                  <div className="max-w-lg">
                    <Popover open={isCustomerPopoverOpen} onOpenChange={setIsCustomerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={customerSearchTerm}
                            onChange={(e) => {
                              setCustomerSearchTerm(e.target.value);
                              if (e.target.value.length >= 2) {
                                setIsCustomerPopoverOpen(true);
                              }
                            }}
                            onFocus={() => {
                              if (customerSearchTerm.length >= 2) {
                                setIsCustomerPopoverOpen(true);
                              }
                            }}
                            placeholder="Search by name, phone, email, or address..."
                            className="pl-10 pr-10 h-11 bg-white dark:bg-gray-900 text-base"
                            data-testid="input-customer-search-main"
                            autoFocus
                          />
                          {isSearchingCustomers && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-[calc(100vw-4rem)] sm:w-[500px] p-0" 
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="p-2 border-b">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="searchAllMain"
                              checked={searchAllFields}
                              onCheckedChange={(checked) => setSearchAllFields(checked === true)}
                            />
                            <label htmlFor="searchAllMain" className="text-xs text-muted-foreground cursor-pointer">
                              Search all fields (address, email, phone)
                            </label>
                          </div>
                        </div>
                        <ScrollArea className="max-h-64">
                          {customerSearchResults.length === 0 && debouncedCustomerSearch.length >= 2 && !isSearchingCustomers && (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                              No customers found for "{debouncedCustomerSearch}"
                            </div>
                          )}
                          {[...customerSearchResults].sort((a, b) => {
                            const t = debouncedCustomerSearch.trim().toLowerCase();
                            const aName = (a.name || "").toLowerCase();
                            const bName = (b.name || "").toLowerCase();
                            if ((aName === t) !== (bName === t)) return (aName === t) ? -1 : 1;
                            if (aName.startsWith(t) !== bName.startsWith(t)) return aName.startsWith(t) ? -1 : 1;
                            return 0;
                          }).map((customer) => (
                            <div
                              key={customer.id}
                              className="p-3 hover:bg-muted cursor-pointer border-b last:border-0"
                              onClick={() => handleSelectCustomer(customer)}
                              data-testid={`customer-result-main-${customer.id}`}
                            >
                              <p className="font-medium">{customer.name}</p>
                              <div className="text-sm text-muted-foreground space-y-0.5">
                                {customer.fullAddress && <p className="truncate">{customer.fullAddress}</p>}
                                {(customer.phone || customer.email) && (
                                  <p className="truncate">
                                    {customer.phone && <span>{customer.phone}</span>}
                                    {customer.phone && customer.email && <span> • </span>}
                                    {customer.email && <span>{customer.email}</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap" data-testid="tabs-view-switcher">
            <TabsTrigger 
              value="preset" 
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" 
              data-testid="tab-preset-packages"
            >
              <Package className="h-5 w-5 sm:mr-2" />
              <span className="hidden sm:inline">Packages</span>
            </TabsTrigger>
            <TabsTrigger 
              value="custom" 
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" 
              data-testid="tab-build-your-own"
            >
              <Wrench className="h-5 w-5 sm:mr-2" />
              <span className="hidden sm:inline">Custom</span>
            </TabsTrigger>
            <TabsTrigger 
              value="crawlspace" 
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" 
              data-testid="tab-crawlspace"
            >
              <Droplets className="h-5 w-5 sm:mr-2" />
              <span className="hidden sm:inline">Crawlspace</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preset">
            <div className="flex items-center gap-2 mb-4">
              {currentStep > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="min-h-[44px]"
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              ) : (
                <Link href="/crm/quotes/new">
                  <Button variant="ghost" size="sm" className="min-h-[44px]" data-testid="button-home">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Quotes
                  </Button>
                </Link>
              )}
              <div className="text-sm text-muted-foreground flex items-center">
                <span className="font-medium">Step {currentStep} of {totalSteps}</span>
                {selectedUnitType && (
                  <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span>{UNIT_TYPE_INFO[selectedUnitType]?.name.split(' + ')[0] || selectedUnitType}</span>
                  </>
                )}
                {selectedTier && (
                  <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span>{selectedTier}</span>
                  </>
                )}
                {selectedTonnage && (
                  <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span>{selectedTonnage}</span>
                  </>
                )}
              </div>
            </div>

            {currentStep === 1 && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Select System Type</h2>
                <p className="text-muted-foreground mb-4">Choose the type of HVAC system</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {unitTypes.map(unitType => {
                    const info = UNIT_TYPE_INFO[unitType];
                    const IconComponent = info?.icon || Package;
                    return (
                      <Card
                        key={unitType}
                        className="cursor-pointer hover:border-primary transition-colors bg-slate-50"
                        onClick={() => setSelectedUnitType(unitType)}
                        data-testid={`unit-type-${unitType.toLowerCase()}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <IconComponent className="h-5 w-5 text-primary" />
                              <span>{info?.name || unitType}</span>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {info?.description || `${unitType} system packages`}
                          </p>
                          <Badge variant="secondary" className="mt-2">
                            {unitType}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === 2 && !hasSingleTier && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Select Tier</h2>
                <p className="text-muted-foreground mb-4">Choose your preferred quality tier</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tiersForUnitType.map(tier => {
                    const info = TIER_INFO[tier];
                    return (
                      <Card
                        key={tier}
                        className="cursor-pointer hover:border-primary transition-colors bg-slate-50"
                        onClick={() => setSelectedTier(tier)}
                        data-testid={`tier-${tier.toLowerCase()}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center justify-between">
                            {tier}
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {info?.description || `${tier} tier packages`}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedTier && !selectedTonnage && !hasSingleTonnage && (
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  {selectedUnitType === "Mini-Split" ? "Select BTU Size" : "Select Tonnage"}
                </h2>
                <p className="text-muted-foreground mb-4">Choose the system capacity</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {tonnagesForSelection.map(tonnage => {
                    const isMiniSplit = selectedUnitType === "Mini-Split";
                    const btuValue = isMiniSplit 
                      ? parseInt(tonnage.replace('K', '')) * 1000 
                      : parseInt(tonnage) * 12000;
                    return (
                      <Card
                        key={tonnage}
                        className="cursor-pointer hover:border-primary transition-colors bg-slate-50"
                        onClick={() => setSelectedTonnage(tonnage)}
                        data-testid={`tonnage-${tonnage.replace(' ', '-').toLowerCase()}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center justify-between">
                            {isMiniSplit ? `${tonnage} BTU` : tonnage}
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {btuValue.toLocaleString()} BTU
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedTier && selectedTonnage && (
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  {selectedUnitType === "Mini-Split" ? "Select Mini-Split System" 
                    : selectedUnitType === "Ducting" ? "Select Duct System Size"
                    : "Select Package"}
                </h2>
                <p className="text-muted-foreground mb-4">
                  {selectedUnitType === "Mini-Split" 
                    ? "Choose the BTU capacity for your space"
                    : selectedUnitType === "Ducting"
                    ? "Choose the system size based on your home's tonnage"
                    : `Choose from available ${selectedTier} packages for ${selectedTonnage}`}
                </p>
                
                {/* Mini-Split and Ducting compact layout */}
                {(selectedUnitType === "Mini-Split" || selectedUnitType === "Ducting") ? (
                  <div className="space-y-3">
                    {selectedUnitType === "Mini-Split" ? (
                      <p className="text-sm text-muted-foreground p-3 rounded-lg border mb-4" style={{ backgroundColor: '#d3b07d20', borderColor: '#d3b07d' }}>
                        Each package includes both the outdoor condenser and indoor wall-mounted unit for a complete ductless system.
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground p-3 rounded-lg border mb-4" style={{ backgroundColor: '#d3b07d20', borderColor: '#d3b07d' }}>
                        Complete duct system replacement includes removal of existing ducts, new ductwork installation, and system balancing with a 10-year workmanship guarantee.
                      </p>
                    )}
                    {packageOptions.map((pkg, index) => {
                      const isInCart = cart.some(item => 
                        isHvacPackage(item) &&
                        item.unitType === pkg.unitType && 
                        item.tier === pkg.tier && 
                        item.packageLevel === pkg.packageLevel
                      );
                      const isMiniSplit = selectedUnitType === "Mini-Split";
                      const btuValue = isMiniSplit ? parseInt(pkg.packageLevel.replace('K', '')) * 1000 : 0;
                      const tonnageDisplay = getPackageTonnageDisplay(pkg);
                      return (
                        <Card
                          key={`${pkg.packageLevel}-${pkg.outdoorModel || pkg.tonnage}-${index}`}
                          className={`relative overflow-hidden bg-slate-50 ${isInCart ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}
                          data-testid={`package-${(isMiniSplit ? pkg.packageLevel : pkg.tonnage).toString().toLowerCase().replace('.', '-')}`}
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-4">
                              {/* Image */}
                              <div className="flex gap-3 flex-shrink-0">
                                {pkg.outdoorImageUrl && (
                                  <div className="text-center">
                                    <img 
                                      src={pkg.outdoorImageUrl}
                                      alt={isMiniSplit ? "Outdoor Condenser" : "Duct System"}
                                      className="w-16 h-16 object-contain rounded-lg bg-white border shadow-sm"
                                      loading="lazy"
                                    />
                                    {isMiniSplit && <p className="text-[10px] text-muted-foreground mt-1 font-medium">Outdoor</p>}
                                  </div>
                                )}
                                {isMiniSplit && pkg.furnaceImageUrl && (
                                  <div className="text-center">
                                    <img 
                                      src={pkg.furnaceImageUrl}
                                      alt="Indoor Wall Unit"
                                      className="w-16 h-16 object-contain rounded-lg bg-white border shadow-sm"
                                      loading="lazy"
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1 font-medium">Indoor</p>
                                  </div>
                                )}
                              </div>
                              
                              {/* Main info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <Badge className="text-white font-bold text-sm px-3" style={{ backgroundColor: '#d3b07d' }}>
                                    {isMiniSplit ? pkg.packageLevel : pkg.packageLevel}
                                  </Badge>
                                  {isMiniSplit && (
                                    <span className="text-sm font-medium">
                                      {btuValue.toLocaleString()} BTU
                                    </span>
                                  )}
                                  {isInCart && (
                                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                                      <Check className="h-3 w-3 mr-1" />
                                      Added
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {isMiniSplit 
                                    ? `${pkg.outdoorBrand} Complete System`
                                    : pkg.outdoorName || "Complete Duct Replacement"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {isMiniSplit 
                                    ? "Includes outdoor condenser + indoor wall unit"
                                    : "New insulated ducts, registers, test & balance, 10-year guarantee"}
                                </p>
                              </div>
                              
                              {/* Price and action */}
                              <div className="text-right flex-shrink-0">
                                <p className="text-xl font-bold text-primary">
                                  {formatPrice(parseFloat(pkg.totalInvestment) || 0)}
                                </p>
                                <p className="text-xs text-muted-foreground mb-2">
                                  {formatPrice(parseFloat(pkg.monthlyPayment) || 0)}/mo
                                </p>
                                <Button
                                  size="sm"
                                  className="min-h-[40px] px-4"
                                  onClick={() => addToCart(pkg)}
                                  data-testid={`button-add-${(isMiniSplit ? pkg.packageLevel : pkg.tonnage).toString().toLowerCase().replace('.', '-')}`}
                                >
                                  <ShoppingCart className="h-4 w-4 mr-2" />
                                  Add
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  /* Standard package grid for other equipment types */
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {packageOptions.map((pkg, index) => {
                      const isInCart = cart.some(item => 
                        isHvacPackage(item) &&
                        item.unitType === pkg.unitType && 
                        item.tier === pkg.tier && 
                        item.packageLevel === pkg.packageLevel &&
                        item.extractedTonnage === selectedTonnage
                      );
                      return (
                        <Card
                          key={`${pkg.packageLevel}-${pkg.outdoorModel}-${index}`}
                          className={`relative bg-slate-50 ${isInCart ? 'border-primary ring-1 ring-primary' : ''}`}
                          data-testid={`package-${pkg.packageLevel.toLowerCase()}`}
                        >
                          {isInCart && (
                            <div className="absolute top-2 right-2">
                              <Badge className="bg-primary">
                                <Check className="h-3 w-3 mr-1" />
                                In Cart
                              </Badge>
                            </div>
                          )}
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge className={`${getPackageLevelColor(pkg.packageLevel)} text-white`}>
                                  {pkg.packageLevel}
                                </Badge>
                                <span className="text-sm text-muted-foreground">{pkg.outdoorBrand}</span>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-bold text-primary">
                                  {formatPrice(parseFloat(pkg.totalInvestment) || 0)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatPrice(parseFloat(pkg.monthlyPayment) || 0)}/mo financing
                                </p>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-2 text-sm">
                              <div className="p-2 bg-muted rounded-md">
                                <div className="flex gap-3">
                                  {pkg.outdoorImageUrl && (
                                    <img 
                                      src={pkg.outdoorImageUrl}
                                      alt={pkg.outdoorModel}
                                      className="w-16 h-16 object-contain rounded bg-slate-100 flex-shrink-0"
                                      loading="lazy"
                                    />
                                  )}
                                  <div className="flex-1">
                                    <p className="font-medium text-xs text-muted-foreground mb-1">Outdoor Unit</p>
                                    <p className="font-medium">{pkg.outdoorBrand} {pkg.outdoorModel}</p>
                                    <p className="text-muted-foreground text-xs">{pkg.outdoorName}</p>
                                  </div>
                                </div>
                              </div>
                              
                              {pkg.coilModel && (
                                <div className="p-2 bg-muted rounded-md">
                                  <div className="flex gap-3">
                                    {pkg.coilImageUrl && (
                                      <img 
                                        src={pkg.coilImageUrl}
                                        alt={pkg.coilModel}
                                        className="w-16 h-16 object-contain rounded bg-slate-100 flex-shrink-0"
                                        loading="lazy"
                                      />
                                    )}
                                    <div className="flex-1">
                                      <p className="font-medium text-xs text-muted-foreground mb-1">Evaporator Coil</p>
                                      <p className="font-medium">{pkg.coilModel}</p>
                                      <p className="text-muted-foreground text-xs">{pkg.coilName}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {pkg.indoorHeatModel && (
                                <div className="p-2 bg-muted rounded-md">
                                  <div className="flex gap-3">
                                    {pkg.furnaceImageUrl && (
                                      <img 
                                        src={pkg.furnaceImageUrl}
                                        alt={pkg.indoorHeatModel}
                                        className="w-16 h-16 object-contain rounded bg-slate-100 flex-shrink-0"
                                        loading="lazy"
                                      />
                                    )}
                                    <div className="flex-1">
                                      <p className="font-medium text-xs text-muted-foreground mb-1">
                                        {pkg.unitType === 'PHP' ? 'Heat Kit' : pkg.unitType === 'SHP' ? 'Air Handler' : 'Indoor Unit / Furnace'}
                                      </p>
                                      <p className="font-medium">{pkg.indoorHeatModel}</p>
                                      <p className="text-muted-foreground text-xs">{pkg.indoorHeatName}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {pkg.thermostatModel && (
                                <div className="p-2 bg-muted rounded-md">
                                  <div className="flex gap-3">
                                    {pkg.thermostatImageUrl && (
                                      <img 
                                        src={pkg.thermostatImageUrl}
                                        alt={pkg.thermostatModel}
                                        className="w-16 h-16 object-contain rounded bg-slate-100 flex-shrink-0"
                                        loading="lazy"
                                      />
                                    )}
                                    <div className="flex-1">
                                      <p className="font-medium text-xs text-muted-foreground mb-1">Thermostat</p>
                                      <p className="font-medium">{pkg.thermostatModel}</p>
                                      <p className="text-muted-foreground text-xs">{pkg.thermostatName}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                              <div className="flex items-center justify-between">
                                <Label htmlFor={`elite-${pkg.packageLevel}-${index}`} className="flex items-center gap-2 cursor-pointer">
                                  <Crown className="h-4 w-4 text-amber-500" />
                                  <span className="font-medium text-sm">Upgrade to Elite Package</span>
                                </Label>
                                <Switch
                                  id={`elite-${pkg.packageLevel}-${index}`}
                                  checked={eliteEnabledByIndex[index] || false}
                                  onCheckedChange={(checked) => {
                                    setEliteEnabledByIndex(prev => ({ ...prev, [index]: checked }));
                                    if (checked && !selectedAirflowByIndex[index]) {
                                      setSelectedAirflowByIndex(prev => ({ ...prev, [index]: HVAC_ELITE_AIRFLOW_OPTIONS[0].name }));
                                    }
                                  }}
                                  data-testid={`switch-elite-${pkg.packageLevel.toLowerCase()}`}
                                />
                              </div>
                              
                              {eliteEnabledByIndex[index] && (
                                <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700">
                                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">Core Bundles Included:</p>
                                  <div className="space-y-1 mb-3">
                                    {HVAC_ELITE_CORE_BUNDLES.map(bundle => (
                                      <div key={bundle.name} className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">{bundle.name}</span>
                                        <span className="font-medium">{formatPrice(getEliteBundlePrice(bundle, pkg.tonnage))}</span>
                                      </div>
                                    ))}
                                  </div>
                                  
                                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">Select Airflow Option:</p>
                                  <RadioGroup 
                                    value={selectedAirflowByIndex[index] || ''} 
                                    onValueChange={(value) => setSelectedAirflowByIndex(prev => ({ ...prev, [index]: value }))}
                                    className="space-y-2"
                                  >
                                    {HVAC_ELITE_AIRFLOW_OPTIONS.map(option => (
                                      <div key={option.name} className="flex items-center justify-between p-2 rounded border bg-white dark:bg-gray-800 border-amber-200 dark:border-amber-700">
                                        <div className="flex items-center gap-2">
                                          <RadioGroupItem value={option.name} id={`airflow-${option.name}-${index}`} />
                                          <Label htmlFor={`airflow-${option.name}-${index}`} className="text-xs cursor-pointer">
                                            {option.name}
                                          </Label>
                                        </div>
                                        <span className="text-xs font-medium">{formatPrice(getEliteAirflowPrice(option, pkg.tonnage))}</span>
                                      </div>
                                    ))}
                                  </RadioGroup>
                                  
                                  {selectedAirflowByIndex[index] && (() => {
                                    const airflowOption = HVAC_ELITE_AIRFLOW_OPTIONS.find(opt => opt.name === selectedAirflowByIndex[index])!;
                                    const pricing = calculateHvacElitePricing(parseFloat(pkg.totalInvestment) || 0, pkg.tonnage, airflowOption.id);
                                    if (!pricing) return null;
                                    const bundlesTotal = Object.values(pricing.coreBundlePrices).reduce((a, b) => a + b, 0) + pricing.airflowPrice;
                                    return (
                                      <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700">
                                        <div className="space-y-1 text-xs">
                                          <div className="flex justify-between">
                                            <span>Base Package:</span>
                                            <span>{formatPrice(parseFloat(pkg.totalInvestment) || 0)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Elite Bundles:</span>
                                            <span>{formatPrice(bundlesTotal)}</span>
                                          </div>
                                          <div className="flex justify-between border-t pt-1">
                                            <span>Subtotal:</span>
                                            <span>{formatPrice(pricing.originalTotal)}</span>
                                          </div>
                                          <div className="flex justify-between text-green-600 dark:text-green-400">
                                            <span>20% Elite Discount:</span>
                                            <span>-{formatPrice(pricing.discountAmount)}</span>
                                          </div>
                                          <div className="flex justify-between border-t pt-1 font-bold text-sm">
                                            <span>Total:</span>
                                            <span className="text-primary">{formatPrice(pricing.finalTotal)}</span>
                                          </div>
                                        </div>
                                        <Badge className="mt-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                                          Save {formatPrice(pricing.discountAmount)} (20%)
                                        </Badge>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                            
                            <Button
                              className={`w-full min-h-[44px] ${eliteEnabledByIndex[index] ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                              onClick={() => eliteEnabledByIndex[index] ? addToCartWithElite(pkg, index) : addToCart(pkg)}
                              data-testid={`button-add-${pkg.packageLevel.toLowerCase()}`}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              {eliteEnabledByIndex[index] ? "Add Elite Package" : "Add to Proposal"}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
                
                {packageOptions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No packages found for this combination</p>
                    <p className="text-sm">Try a different tonnage or tier</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="custom">
            <div className="flex items-center gap-2 mb-4">
              {customBuildStep > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCustomBuildBack}
                  className="min-h-[44px]"
                  data-testid="button-custom-back"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              ) : (
                <Link href="/crm/quotes/new">
                  <Button variant="ghost" size="sm" className="min-h-[44px]" data-testid="button-home-custom">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Quotes
                  </Button>
                </Link>
              )}
              <div className="text-sm text-muted-foreground flex items-center">
                <span className="font-medium">Step {customBuildStep} of 3</span>
                {customEquipmentType && (
                  <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span>{customEquipmentType}</span>
                  </>
                )}
                {customTonnage && (
                  <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span>{customTonnage}</span>
                  </>
                )}
              </div>
            </div>

            {customBuildStep === 1 && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Select Equipment Type</h2>
                <p className="text-muted-foreground mb-4">Choose the type of system you want to build</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {["SGA", "SHP", "PHP", "GP", "Mini-Split", "Ducting", "Crawlspace Services"].map(type => {
                    const typeInfo = UNIT_TYPE_INFO[type];
                    const TypeIcon = typeInfo?.icon || Package;
                    return (
                      <Card
                        key={type}
                        className="cursor-pointer hover:border-primary transition-colors bg-slate-50"
                        onClick={() => {
                          setCustomEquipmentType(type);
                        }}
                        data-testid={`custom-equipment-type-${type.toLowerCase()}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TypeIcon className="h-5 w-5 text-primary" />
                              {typeInfo?.name || type}
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {typeInfo?.description || `${type} system`}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {customBuildStep === 2 && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Select System Size</h2>
                <p className="text-muted-foreground mb-4">Choose the tonnage for your {customEquipmentType} system</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {customTonnageOptions.map(tonnage => (
                    <Card
                      key={tonnage}
                      className="cursor-pointer hover:border-primary transition-colors bg-slate-50"
                      onClick={() => setCustomTonnage(tonnage)}
                      data-testid={`custom-tonnage-${tonnage.replace(' ', '-').toLowerCase()}`}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                          {tonnage}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {parseFloat(tonnage) * 12000} BTU
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {customTonnageOptions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No tonnage options available for {customEquipmentType}</p>
                  </div>
                )}
              </div>
            )}

            {customBuildStep === 3 && (
              <div>
                {/* Crawlspace Services layout */}
                {customEquipmentType === "Crawlspace Services" ? (
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Crawlspace Services</h2>
                    <p className="text-muted-foreground mb-4">Select services and square footage for pricing</p>
                    
                    {/* Square Footage Selection */}
                    <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-950/50 rounded-lg border border-orange-200 dark:border-orange-800">
                      <Label htmlFor="crawlspace-services-sqft" className="text-sm font-medium mb-2 block">
                        Crawlspace Square Footage
                      </Label>
                      <div className="flex items-center gap-3">
                        <Select value={crawlspaceServicesSqft} onValueChange={setCrawlspaceServicesSqft}>
                          <SelectTrigger className="w-40 min-h-[44px]" data-testid="select-crawlspace-services-sqft">
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            {CRAWLSPACE_SERVICES.SQFT_OPTIONS.map(sqft => (
                              <SelectItem key={sqft} value={sqft.toString()}>
                                {sqft.toLocaleString()} sq ft
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">
                          Minimum: 250 sq ft
                        </span>
                      </div>
                    </div>

                    {/* Services Selection */}
                    <div className="mb-6">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        Select Services
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {CRAWLSPACE_SERVICES.SERVICES.map(service => {
                          const sqft = parseInt(crawlspaceServicesSqft) || 1000;
                          const effectiveSqft = Math.max(sqft, service.minSqft);
                          const price = effectiveSqft * service.ratePerSqft;
                          const isSelected = selectedCrawlspaceServices.includes(service.id);
                          
                          return (
                            <Card 
                              key={service.id}
                              className={`cursor-pointer transition-all hover:shadow-md ${
                                isSelected ? 'ring-2 ring-orange-500 border-orange-500 bg-orange-50 dark:bg-orange-950/50' : ''
                              }`}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedCrawlspaceServices(prev => prev.filter(id => id !== service.id));
                                } else {
                                  setSelectedCrawlspaceServices(prev => [...prev, service.id]);
                                }
                              }}
                              data-testid={`service-${service.id}`}
                            >
                              <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                  <Checkbox 
                                    checked={isSelected}
                                    className="mr-2"
                                    onClick={e => e.stopPropagation()}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedCrawlspaceServices(prev => [...prev, service.id]);
                                      } else {
                                        setSelectedCrawlspaceServices(prev => prev.filter(id => id !== service.id));
                                      }
                                    }}
                                  />
                                  <CardTitle className="text-base flex-1">{service.name}</CardTitle>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <p className="text-xs text-muted-foreground mb-2">{service.description}</p>
                                <div className="text-xs text-muted-foreground mb-2">
                                  Rate: ${service.ratePerSqft.toFixed(2)}/sq ft
                                </div>
                                <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                                  {formatPrice(price)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  for {effectiveSqft.toLocaleString()} sq ft
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>

                    {/* Door Options */}
                    <div className="mb-6">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Door Installation (Optional)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {CRAWLSPACE_SERVICES.DOOR_OPTIONS.map(option => {
                          const isSelected = selectedDoorOption === option.id;
                          
                          return (
                            <Card 
                              key={option.id}
                              className={`cursor-pointer transition-all hover:shadow-md ${
                                isSelected ? 'ring-2 ring-orange-500 border-orange-500 bg-orange-50 dark:bg-orange-950/50' : ''
                              }`}
                              onClick={() => {
                                setSelectedDoorOption(isSelected ? null : option.id);
                              }}
                              data-testid={`door-${option.id}`}
                            >
                              <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                  <div className={`w-4 h-4 rounded-full border-2 mr-2 flex items-center justify-center ${
                                    isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-400'
                                  }`}>
                                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                  </div>
                                  <CardTitle className="text-base flex-1">{option.name}</CardTitle>
                                  <Badge className="bg-orange-500 text-white">
                                    {formatPrice(option.price)}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <p className="text-xs text-muted-foreground mb-2">{option.description}</p>
                                <ul className="text-xs space-y-1">
                                  {option.features.map((feature, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                      <Check className="h-3 w-3 text-green-500" />
                                      {feature}
                                    </li>
                                  ))}
                                </ul>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>

                    {/* Pricing Summary and Add Button */}
                    {(selectedCrawlspaceServices.length > 0 || selectedDoorOption) && (
                      <div className="mt-6 p-4 border-2 border-orange-200 dark:border-orange-800 rounded-xl bg-gradient-to-r from-orange-50 to-white dark:from-orange-950 dark:to-gray-900">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                              <Wrench className="h-5 w-5 text-orange-500" />
                              Selected Services Summary
                            </h3>
                            <div className="text-sm text-muted-foreground mt-2 space-y-1">
                              {selectedCrawlspaceServices.map(serviceId => {
                                const service = CRAWLSPACE_SERVICES.SERVICES.find(s => s.id === serviceId);
                                if (!service) return null;
                                const sqft = parseInt(crawlspaceServicesSqft) || 1000;
                                const effectiveSqft = Math.max(sqft, service.minSqft);
                                const price = effectiveSqft * service.ratePerSqft;
                                return (
                                  <div key={serviceId} className="flex justify-between gap-4">
                                    <span>{service.name} ({effectiveSqft.toLocaleString()} sq ft)</span>
                                    <span className="font-medium">{formatPrice(price)}</span>
                                  </div>
                                );
                              })}
                              {selectedDoorOption && (() => {
                                const door = CRAWLSPACE_SERVICES.DOOR_OPTIONS.find(d => d.id === selectedDoorOption);
                                return door ? (
                                  <div className="flex justify-between gap-4">
                                    <span>{door.name}</span>
                                    <span className="font-medium">{formatPrice(door.price)}</span>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                            <div className="mt-3 pt-3 border-t flex justify-between items-center">
                              <span className="font-semibold">Total:</span>
                              <span className="text-xl font-bold text-orange-600 dark:text-orange-400">
                                {formatPrice(calculateCrawlspaceServicesTotal(
                                  parseInt(crawlspaceServicesSqft) || 1000,
                                  selectedCrawlspaceServices,
                                  selectedDoorOption
                                ))}
                              </span>
                            </div>
                          </div>
                          
                          <Button
                            className="min-h-[44px] bg-orange-600 hover:bg-orange-700"
                            onClick={addCrawlspaceServicesToCart}
                            data-testid="button-add-crawlspace-services"
                          >
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Add to Proposal
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (customEquipmentType === "Mini-Split" || customEquipmentType === "Ducting") ? (
                  <div>
                    <h2 className="text-xl font-semibold mb-2">
                      {customEquipmentType === "Mini-Split" ? "Select Mini-Split System" : "Select Duct System Size"}
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      {customEquipmentType === "Mini-Split" 
                        ? "Choose the BTU capacity for your space"
                        : "Choose the system size based on your home's tonnage"}
                    </p>
                    
                    <div className="space-y-3">
                      {customEquipmentType === "Mini-Split" ? (
                        <p className="text-sm text-muted-foreground p-3 rounded-lg border mb-4" style={{ backgroundColor: '#d3b07d20', borderColor: '#d3b07d' }}>
                          Each package includes both the outdoor condenser and indoor wall-mounted unit for a complete ductless system.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground p-3 rounded-lg border mb-4" style={{ backgroundColor: '#d3b07d20', borderColor: '#d3b07d' }}>
                          Complete duct system replacement includes removal of existing ducts, new ductwork installation, and system balancing with a 10-year workmanship guarantee.
                        </p>
                      )}
                      {customBuildPackageOptions.map((pkg, index) => {
                        const isInCart = cart.some(item => 
                          isHvacPackage(item) &&
                          item.unitType === pkg.unitType && 
                          item.tier === pkg.tier && 
                          item.packageLevel === pkg.packageLevel
                        );
                        const isMiniSplit = customEquipmentType === "Mini-Split";
                        const btuValue = isMiniSplit ? parseInt(pkg.packageLevel.replace('K', '')) * 1000 : 0;
                        return (
                          <Card
                            key={`${pkg.packageLevel}-${pkg.outdoorModel || pkg.tonnage}-${index}`}
                            className={`relative overflow-hidden ${isInCart ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}
                            data-testid={`custom-package-${(isMiniSplit ? pkg.packageLevel : pkg.packageLevel).toString().toLowerCase().replace('.', '-').replace(' ', '-')}`}
                          >
                            <div className="p-4">
                              <div className="flex items-start gap-4">
                                {/* Image */}
                                <div className="flex gap-3 flex-shrink-0">
                                  {pkg.outdoorImageUrl && (
                                    <div className="text-center">
                                      <img 
                                        src={pkg.outdoorImageUrl}
                                        alt={isMiniSplit ? "Outdoor Condenser" : "Duct System"}
                                        className="w-16 h-16 object-contain rounded-lg bg-white border shadow-sm"
                                        loading="lazy"
                                      />
                                      {isMiniSplit && <p className="text-[10px] text-muted-foreground mt-1 font-medium">Outdoor</p>}
                                    </div>
                                  )}
                                  {isMiniSplit && pkg.furnaceImageUrl && (
                                    <div className="text-center">
                                      <img 
                                        src={pkg.furnaceImageUrl}
                                        alt="Indoor Wall Unit"
                                        className="w-16 h-16 object-contain rounded-lg bg-white border shadow-sm"
                                        loading="lazy"
                                      />
                                      <p className="text-[10px] text-muted-foreground mt-1 font-medium">Indoor</p>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Main info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <Badge className="text-white font-bold text-sm px-3" style={{ backgroundColor: '#d3b07d' }}>
                                      {pkg.packageLevel}
                                    </Badge>
                                    {isMiniSplit && (
                                      <span className="text-sm font-medium">
                                        {btuValue.toLocaleString()} BTU
                                      </span>
                                    )}
                                    {isInCart && (
                                      <Badge variant="outline" className="text-primary border-primary text-xs">
                                        <Check className="h-3 w-3 mr-1" />
                                        Added
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-medium text-sm truncate">
                                    {isMiniSplit 
                                      ? `Complete ${pkg.packageLevel} Mini-Split System`
                                      : `Complete ${pkg.packageLevel} Duct System Replacement`}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {isMiniSplit 
                                      ? "New insulated ducts, registers, test & balance, 10-year guarantee"
                                      : "New insulated ducts, registers, test & balance, 10-year guarantee"}
                                  </p>
                                </div>
                                
                                {/* Price and Add */}
                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                  <div className="text-right">
                                    <p className="font-bold text-lg text-primary">
                                      ${parseFloat(pkg.totalInvestment).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      ${pkg.monthlyPayment}/mo
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    className="min-h-[36px] min-w-[70px]"
                                    onClick={() => addToCart(pkg)}
                                    data-testid={`custom-button-add-${pkg.packageLevel.toLowerCase().replace(' ', '-')}`}
                                  >
                                    <ShoppingCart className="h-4 w-4 mr-1" />
                                    Add
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                    
                    {customBuildPackageOptions.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No packages found for {customEquipmentType}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Standard component selection for SGA, SHP, PHP, GP */
                  <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-semibold">Build Your {customEquipmentType} {customTonnage} System</h2>
                    <p className="text-muted-foreground">Select one component from each category</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Badge variant="outline" className="text-xs">Estimated</Badge>
                        <span className="text-xl font-bold text-primary">
                          {(() => {
                            const estimate = calculateCustomBuildEstimate(selectedOutdoorUnit, selectedCoil, selectedIndoorUnit, selectedThermostat);
                            return formatPriceRange(estimate.low, estimate.high);
                          })()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedComponentCount} component{selectedComponentCount !== 1 ? 's' : ''} selected
                      </p>
                    </div>
                    <Button
                      className="min-h-[44px]"
                      disabled={!isCustomBuildComplete}
                      onClick={addCustomBuildToCart}
                      data-testid="button-add-custom-build"
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Add to Proposal
                    </Button>
                  </div>
                </div>

                {!isCustomBuildComplete && (
                  <div className="mb-4 p-3 bg-amber-100 dark:bg-amber-900 rounded-lg border border-amber-300 dark:border-amber-700">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Please select at least one component to add to your proposal.
                    </p>
                  </div>
                )}

                <ScrollArea className="h-[calc(100vh-300px)]">
                  {renderComponentSection(
                    isPackageUnitType ? "Package Unit" : "Outdoor Unit",
                    outdoorUnitOptions,
                    selectedOutdoorUnit,
                    setSelectedOutdoorUnit,
                    outdoorBrandFilter,
                    setOutdoorBrandFilter,
                    "outdoor"
                  )}

                  {/* PHP shows heater kit only (no indoor unit) */}
                  {customEquipmentType === "PHP" && (
                    <>
                      <div className="my-6 flex items-center gap-3">
                        <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                        <span className="text-[#d3b07d] text-xs font-medium uppercase tracking-wider">Next Component</span>
                        <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                      </div>

                      {renderComponentSection(
                        "Heater Kit",
                        coilOptions,
                        selectedCoil,
                        setSelectedCoil,
                        coilBrandFilter,
                        setCoilBrandFilter,
                        "coil"
                      )}
                    </>
                  )}

                  {/* SGA/SHP show coil/evaporator coil/air handler */}
                  {!isPackageUnitType && (
                    <>
                      <div className="my-6 flex items-center gap-3">
                        <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                        <span className="text-[#d3b07d] text-xs font-medium uppercase tracking-wider">Next Component</span>
                        <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                      </div>

                      {renderComponentSection(
                        coilOrHeaterLabel,
                        coilOptions,
                        selectedCoil,
                        setSelectedCoil,
                        coilBrandFilter,
                        setCoilBrandFilter,
                        "coil"
                      )}

                      {/* SGA shows Indoor Unit (furnace/air handler) */}
                      {customEquipmentType === "SGA" && (
                        <>
                          <div className="my-6 flex items-center gap-3">
                            <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                            <span className="text-[#d3b07d] text-xs font-medium uppercase tracking-wider">Next Component</span>
                            <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                          </div>

                          {renderComponentSection(
                            "Indoor Unit",
                            indoorUnitOptions,
                            selectedIndoorUnit,
                            setSelectedIndoorUnit,
                            indoorBrandFilter,
                            setIndoorBrandFilter,
                            "indoor"
                          )}
                        </>
                      )}
                    </>
                  )}

                  <div className="my-6 flex items-center gap-3">
                    <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                    <span className="text-[#d3b07d] text-xs font-medium uppercase tracking-wider">Next Component</span>
                    <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                  </div>

                  {renderComponentSection(
                    "Thermostat / Control",
                    thermostatOptions,
                    selectedThermostat,
                    setSelectedThermostat,
                    thermostatBrandFilter,
                    setThermostatBrandFilter,
                    "thermostat"
                  )}
                </ScrollArea>

                {isCustomBuildComplete && (
                  <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80">
                    <Button
                      className="w-full min-h-[52px] shadow-lg bg-green-600 hover:bg-green-700"
                      onClick={addCustomBuildToCart}
                      data-testid="button-add-custom-build-floating"
                    >
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Add Custom Build to Proposal
                    </Button>
                  </div>
                )}
                </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="crawlspace">
            <div className="flex items-center gap-2 mb-4">
              <Link href="/crm/quotes/new">
                <Button variant="ghost" size="sm" className="min-h-[44px]" data-testid="button-home-crawlspace">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Quotes
                </Button>
              </Link>
              <div className="text-sm text-muted-foreground flex items-center">
                <span className="font-medium">Crawlspace Encapsulation</span>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Select Crawlspace Package</h2>
              <p className="text-muted-foreground mb-4">Enter your crawlspace size and choose encapsulation level</p>
              
              {/* Sqft Select */}
              <div className="mb-6 p-4 bg-teal-50 dark:bg-teal-950/50 rounded-lg border border-teal-200 dark:border-teal-800">
                <Label htmlFor="crawlspace-sqft" className="text-sm font-medium mb-2 block">
                  Crawlspace Square Footage
                </Label>
                <div className="flex items-center gap-3">
                  <Select value={crawlspaceSqft} onValueChange={setCrawlspaceSqft}>
                    <SelectTrigger className="w-40 min-h-[44px]" data-testid="select-crawlspace-sqft">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {CRAWLSPACE_CONSTANTS.SIZE_BANDS.map(sqft => (
                        <SelectItem key={sqft} value={sqft.toString()}>
                          {sqft.toLocaleString()} sqft
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    Select crawlspace size
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {crawlspaceTiers.map((tier) => {
                  const sqftNum = parseInt(crawlspaceSqft) || 1000;
                  const pricing = calculateCrawlspacePricing(sqftNum, tier.name);
                  const isSelected = selectedCrawlspaceTier?.name === tier.name;
                  const isInCart = cart.some(item => 
                    isCrawlspaceItem(item) && item.tier.name === tier.name
                  );
                  
                  return (
                    <Card
                      key={tier.name}
                      className={`relative cursor-pointer transition-all hover:shadow-lg ${
                        isSelected ? 'ring-2 ring-teal-500 border-teal-500' : ''
                      } ${isInCart ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/50' : ''}`}
                      onClick={() => setSelectedCrawlspaceTier(tier)}
                      data-testid={`crawlspace-tier-${tier.name.toLowerCase()}`}
                    >
                      {isInCart && (
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-teal-500">
                            <Check className="h-3 w-3 mr-1" />
                            In Cart
                          </Badge>
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <Badge className="bg-teal-500 text-white mb-2">{tier.name}</Badge>
                            <CardTitle className="text-lg">{tier.milThickness} Mil Vapor Barrier</CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">{tier.description}</p>
                        
                        {/* Pricing Breakdown */}
                        <div className="text-xs space-y-1 border-t pt-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Size Band:</span>
                            <span>{pricing.bandSqft.toLocaleString()} sqft</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Liner ({pricing.rollsNeeded} rolls):</span>
                            <span>{formatPrice(pricing.linerMaterialCost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Labor:</span>
                            <span>{formatPrice(pricing.laborCost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{pricing.dehumidifierModel}:</span>
                            <span>{formatPrice(pricing.dehumidifierSellPrice)}</span>
                          </div>
                        </div>
                        
                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                              {formatPrice(pricing.totalPrice)}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatPrice(Math.round(pricing.totalPrice / 67))}/mo
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {selectedCrawlspaceTier && (() => {
              const sqftNum = parseInt(crawlspaceSqft) || 1000;
              const selectedPricing = calculateCrawlspacePricing(sqftNum, selectedCrawlspaceTier.name);
              const basePrice = selectedPricing.totalPrice;
              
              return (
              <div className="mt-6 p-4 border-2 border-teal-200 dark:border-teal-800 rounded-xl bg-gradient-to-r from-teal-50 to-white dark:from-teal-950 dark:to-gray-900">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Droplets className="h-5 w-5 text-teal-500" />
                      {selectedCrawlspaceTier.name} Package Selected
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedCrawlspaceTier.milThickness} Mil - {selectedPricing.bandSqft.toLocaleString()} sqft - {formatPrice(basePrice)}
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                      <Switch
                        id="elite-crawlspace"
                        checked={crawlspaceEliteEnabled}
                        onCheckedChange={setCrawlspaceEliteEnabled}
                        data-testid="switch-elite-crawlspace"
                      />
                      <Label htmlFor="elite-crawlspace" className="flex items-center gap-2 cursor-pointer">
                        <Crown className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">Elite Package</span>
                      </Label>
                    </div>
                    
                    <Button
                      className="min-h-[44px] bg-teal-600 hover:bg-teal-700"
                      onClick={() => addCrawlspaceToCart(selectedCrawlspaceTier, sqftNum, crawlspaceEliteEnabled)}
                      data-testid="button-add-crawlspace"
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      {crawlspaceEliteEnabled ? "Add Elite Package" : "Add to Proposal"}
                    </Button>
                  </div>
                </div>

                {crawlspaceEliteEnabled && (
                  <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/50 dark:to-amber-950/50 border border-amber-200 dark:border-amber-700">
                    <div className="flex items-center gap-2 mb-3">
                      <Crown className="h-5 w-5 text-amber-600" />
                      <h4 className="font-semibold text-amber-800 dark:text-amber-200">Elite Package Includes:</h4>
                    </div>
                    {(() => {
                      const elitePricing = calculateCrawlspaceElitePricing(basePrice);
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          {CRAWLSPACE_ELITE_BUNDLES.map(bundle => (
                            <div key={bundle.name} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-700">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-semibold text-base">{bundle.name}</p>
                                  <p className="text-xs text-muted-foreground">{bundle.description}</p>
                                </div>
                                <Badge className="bg-amber-500 text-white shrink-0">
                                  {formatPrice(elitePricing.coreBundlePrices[bundle.id] || 0)}
                                </Badge>
                              </div>
                              <ul className="mt-3 text-xs space-y-1.5">
                                {bundle.benefits.map((benefit, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span>{benefit}</span>
                                  </li>
                                ))}
                              </ul>
                              {bundle.notCovered && bundle.notCovered.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700">
                                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5">Not Covered:</p>
                                  <ul className="text-xs text-muted-foreground space-y-1">
                                    {bundle.notCovered.map((item, i) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <X className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    
                    {(() => {
                      const elitePricing = calculateCrawlspaceElitePricing(basePrice);
                      const bundlesTotal = Object.values(elitePricing.coreBundlePrices).reduce((a, b) => a + b, 0);
                      return (
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-amber-200 dark:border-amber-700">
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>Base Package ({selectedPricing.bandSqft.toLocaleString()} sqft):</span>
                              <span>{formatPrice(basePrice)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Elite Bundles:</span>
                              <span>{formatPrice(bundlesTotal)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2">
                              <span>Subtotal:</span>
                              <span>{formatPrice(elitePricing.originalTotal)}</span>
                            </div>
                            <div className="flex justify-between text-green-600 dark:text-green-400">
                              <span>20% Elite Discount:</span>
                              <span>-{formatPrice(elitePricing.discountAmount)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 text-lg font-bold">
                              <span>Total:</span>
                              <span className="text-teal-600 dark:text-teal-400">{formatPrice(elitePricing.finalTotal)}</span>
                            </div>
                          </div>
                          <Badge className="mt-3 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300">
                            You Save {formatPrice(elitePricing.discountAmount)} (20%)
                          </Badge>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
            })()}
          </TabsContent>
        </Tabs>

          {cart.length > 0 && !cartOpen && activeTab === "crawlspace" && !selectedCrawlspaceTier && (
            <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80">
              <Button
                className="w-full min-h-[52px] shadow-lg bg-teal-600 hover:bg-teal-700"
                onClick={() => setCartOpen(true)}
                data-testid="button-view-cart-crawlspace"
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                View Proposal ({cartItemCount} packages)
              </Button>
            </div>
          )}

          {cart.length > 0 && !cartOpen && activeTab === "preset" && currentStep < totalSteps && (
            <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80">
              <Button
                className="w-full min-h-[52px] shadow-lg"
                onClick={() => setCartOpen(true)}
                data-testid="button-view-cart"
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                View Proposal ({cartItemCount} packages)
              </Button>
            </div>
          )}

          {cart.length > 0 && !cartOpen && activeTab === "custom" && customBuildStep < 3 && (
            <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80">
              <Button
                className="w-full min-h-[52px] shadow-lg"
                onClick={() => setCartOpen(true)}
                data-testid="button-view-cart-custom"
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                View Proposal ({cartItemCount} packages)
              </Button>
            </div>
          )}

      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="sm:max-w-3xl h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col">
          <div className="bg-gray-50 dark:bg-gray-900 border-b mx-4 mt-4 rounded-xl px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={redlogo}
                  alt="GHVAC"
                  className="h-12 sm:h-14 w-auto"
                />
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">Equipment Proposal</h1>
                  <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-sm hidden sm:flex">
                Valid 30 Days
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
            {/* Customer Display - Read-only, selected on main page */}
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-lg">{selectedCustomer?.name || 'No Customer Selected'}</span>
                  {selectedCustomer?.fullAddress && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedCustomer.fullAddress}
                    </span>
                  )}
                  {customerProperties.length === 1 && (
                    <span className="text-sm text-muted-foreground">
                      ({customerProperties[0].city}, {customerProperties[0].state})
                    </span>
                  )}
                </div>
              </div>
            </div>
              
            {/* Assign To dropdown - for install quotes (sales+ users only) */}
            <div className="mb-6">
              <Label className="text-xs text-muted-foreground mb-1 block">Assign To (Sales Team)</Label>
              <Select
                value={assignedToId || ""}
                onValueChange={(value) => setAssignedToId(value || null)}
              >
                <SelectTrigger className="w-full" data-testid="select-assigned-user">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers && assignableUsers.length > 0 ? (
                    assignableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.displayName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>No users available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>


            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                <Package className="h-4 w-4" />
                EQUIPMENT INCLUDED
              </h3>
              <div className="space-y-4">
                {cart.map((item, index) => {
                  if (isCrawlspaceItem(item)) {
                    const basePrice = item.pricingBreakdown.totalPrice;
                    const finalPrice = item.eliteData ? item.eliteData.finalTotal : basePrice;
                    const itemPrice = finalPrice * item.quantity;
                    return (
                      <div key={item.id} className={`rounded-xl border-2 ${item.eliteData ? 'border-amber-300 dark:border-amber-700' : 'border-teal-200 dark:border-teal-800'} bg-gradient-to-br from-teal-50 to-white dark:from-teal-950 dark:to-gray-900 overflow-hidden shadow-sm`}>
                        <div className={`${item.eliteData ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-teal-500'} text-white px-4 py-2 flex items-center justify-between`}>
                          <div className="flex items-center gap-2">
                            {item.eliteData ? <Crown className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                            <span className="font-semibold">Crawlspace Encapsulation</span>
                            <span className="opacity-70">•</span>
                            <span className="opacity-90">{item.tier.name}</span>
                            {item.eliteData && <Badge className="bg-white/20 text-white text-xs ml-1">Elite Package</Badge>}
                          </div>
                          {item.quantity > 1 && <Badge className="bg-white/20 text-white">x{item.quantity}</Badge>}
                        </div>
                        <div className="p-4">
                          <p className="text-sm text-muted-foreground mb-4">{item.tier.milThickness} Mil Vapor Barrier - {item.tier.description}</p>
                          {item.eliteData && (
                            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-1">
                                <Crown className="h-3 w-3" />
                                ELITE PACKAGE INCLUDES:
                              </p>
                              <div className="space-y-1">
                                {CRAWLSPACE_ELITE_BUNDLES.map(bundle => {
                                  const bundlePrice = item.eliteData?.coreBundlePrices[bundle.id] || 0;
                                  return (
                                    <div key={bundle.name} className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">{bundle.name}</span>
                                      <span className="font-medium">{bundlePrice > 0 ? formatPrice(bundlePrice) : 'Included'}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700">
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Base Package ({item.pricingBreakdown.bandSqft.toLocaleString()} sqft)</span>
                                  <span className="font-medium">{formatPrice(item.pricingBreakdown.totalPrice)}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Elite Bundles</span>
                                  <span className="font-medium">{formatPrice(Object.values(item.eliteData.coreBundlePrices).reduce((a, b) => a + b, 0))}</span>
                                </div>
                                <div className="flex justify-between text-xs border-t border-amber-200 dark:border-amber-700 pt-1 mt-1">
                                  <span className="text-muted-foreground">Subtotal</span>
                                  <span className="font-medium">{formatPrice(item.eliteData.originalTotal)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-green-600 dark:text-green-400 font-medium">
                                  <span>20% Elite Discount</span>
                                  <span>-{formatPrice(item.eliteData.discountAmount)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="bg-teal-100 dark:bg-teal-900/50 rounded-lg p-3 flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                              {formatPrice(Math.round(itemPrice / 67))}/mo financing
                            </div>
                            <div className="text-right">
                              {item.eliteData && (
                                <p className="text-xs text-muted-foreground line-through">{formatPrice(item.eliteData.originalTotal * item.quantity)}</p>
                              )}
                              <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{formatPrice(itemPrice)}</p>
                            </div>
                          </div>
                          {item.eliteData && (
                            <Badge className="mt-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                              You Save {formatPrice(item.eliteData.discountAmount * item.quantity)}!
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  } else if (isCustomBuild(item)) {
                    const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
                    const priceLow = estimate.low * item.quantity;
                    const priceHigh = estimate.high * item.quantity;
                    const components = [
                      item.outdoorUnit ? { label: 'Outdoor Unit', brand: item.outdoorUnit.brand, name: item.outdoorUnit.unitName, image: item.outdoorUnit.imageUrl } : null,
                      item.coil ? { label: 'Evaporator Coil', brand: item.coil.brand, name: item.coil.unitName, image: item.coil.imageUrl } : null,
                      item.indoorUnit ? { label: 'Indoor Unit', brand: item.indoorUnit.brand, name: item.indoorUnit.unitName, image: item.indoorUnit.imageUrl } : null,
                      item.thermostat ? { label: 'Thermostat', brand: item.thermostat.brand, name: item.thermostat.unitName, image: item.thermostat.imageUrl } : null,
                    ].filter((c): c is NonNullable<typeof c> => c !== null);
                    return (
                      <div key={item.id} className="rounded-xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-white dark:from-green-950 dark:to-gray-900 overflow-hidden shadow-sm">
                        <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-4 w-4" />
                            <span className="font-semibold">Custom Build</span>
                            <span className="text-green-100">•</span>
                            <span className="text-green-100">{item.tonnage}</span>
                          </div>
                          {item.quantity > 1 && <Badge className="bg-white/20 text-white">x{item.quantity}</Badge>}
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            {components.map((comp, i) => (
                              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center border border-gray-100 dark:border-gray-700">
                                {comp.image ? (
                                  <img src={getAssetUrl(comp.image)} alt={comp.label} className="w-12 h-12 mx-auto object-contain mb-1" loading="lazy" />
                                ) : (
                                  <div className="w-12 h-12 mx-auto bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center mb-1">
                                    <Package className="h-6 w-6 text-gray-400" />
                                  </div>
                                )}
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{comp.label}</p>
                                <p className="text-xs font-medium truncate">{comp.brand}</p>
                              </div>
                            ))}
                          </div>
                          <div className="bg-green-100 dark:bg-green-900/50 rounded-lg p-3 flex items-center justify-between">
                            <div>
                              <Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:border-green-600 dark:text-green-300">Estimated Price</Badge>
                            </div>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatPriceRange(priceLow, priceHigh)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (isCrawlspaceServicesItem(item)) {
                    const itemPrice = item.totalPrice * item.quantity;
                    return (
                      <div key={item.id} className="rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950 dark:to-gray-900 overflow-hidden shadow-sm">
                        <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-4 w-4" />
                            <span className="font-semibold">Crawlspace Services</span>
                            <span className="opacity-70">•</span>
                            <span className="opacity-90">{item.selections.sqft.toLocaleString()} sq ft</span>
                          </div>
                          {item.quantity > 1 && <Badge className="bg-white/20 text-white">x{item.quantity}</Badge>}
                        </div>
                        <div className="p-4">
                          <div className="space-y-2 mb-4">
                            {item.selections.services.map(serviceId => {
                              const service = CRAWLSPACE_SERVICES.SERVICES.find(s => s.id === serviceId);
                              if (!service) return null;
                              const effectiveSqft = Math.max(item.selections.sqft, service.minSqft);
                              const price = effectiveSqft * service.ratePerSqft;
                              return (
                                <div key={serviceId} className="flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2">
                                    <Check className="h-4 w-4 text-orange-500" />
                                    <span>{service.name}</span>
                                    <span className="text-xs text-muted-foreground">({effectiveSqft.toLocaleString()} sq ft)</span>
                                  </div>
                                  <span className="font-medium">{formatPrice(price)}</span>
                                </div>
                              );
                            })}
                            {item.selections.doorOption && (() => {
                              const door = CRAWLSPACE_SERVICES.DOOR_OPTIONS.find(d => d.id === item.selections.doorOption);
                              if (!door) return null;
                              return (
                                <div className="flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2">
                                    <Check className="h-4 w-4 text-orange-500" />
                                    <span>{door.name}</span>
                                  </div>
                                  <span className="font-medium">{formatPrice(door.price)}</span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="bg-orange-100 dark:bg-orange-900/50 rounded-lg p-3 flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                              {formatPrice(Math.round(itemPrice / 67))}/mo financing
                            </div>
                            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{formatPrice(itemPrice)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const basePrice = parseFloat(item.totalInvestment) || 0;
                    const finalPrice = item.eliteData ? item.eliteData.finalTotal : basePrice;
                    const itemPrice = finalPrice * item.quantity;
                    const monthlyPrice = item.eliteData 
                      ? Math.round(item.eliteData.finalTotal / 67) * item.quantity
                      : (parseFloat(item.monthlyPayment) || 0) * item.quantity;
                    const levelColors: Record<string, string> = {
                      Best: 'from-amber-50 to-white dark:from-amber-950 dark:to-gray-900 border-amber-200 dark:border-amber-800',
                      Better: 'from-purple-50 to-white dark:from-purple-950 dark:to-gray-900 border-purple-200 dark:border-purple-800',
                      Good: 'from-blue-50 to-white dark:from-blue-950 dark:to-gray-900 border-blue-200 dark:border-blue-800',
                      Budget: 'from-gray-50 to-white dark:from-gray-900 dark:to-gray-900 border-gray-200 dark:border-gray-700',
                    };
                    const headerColors: Record<string, string> = {
                      Best: 'bg-amber-500',
                      Better: 'bg-purple-500',
                      Good: 'bg-blue-500',
                      Budget: 'bg-gray-500',
                    };
                    const indoorLabel = item.unitType === 'PHP' ? 'Heat Kit' : item.unitType === 'SHP' ? 'Air Handler' : 'Indoor Unit';
                    const components = [
                      { label: 'Outdoor Unit', name: `${item.outdoorBrand} ${item.outdoorModel}`, image: item.outdoorImageUrl },
                      { label: 'Evaporator Coil', name: item.coilName || item.coilModel, image: item.coilImageUrl },
                      { label: indoorLabel, name: item.indoorHeatName || item.indoorHeatModel, image: item.furnaceImageUrl },
                      { label: 'Thermostat', name: item.thermostatName || item.thermostatModel, image: item.thermostatImageUrl },
                    ].filter(c => c.name);
                    return (
                      <div key={item.id} className={`rounded-xl border-2 bg-gradient-to-br overflow-hidden shadow-sm ${item.eliteData ? 'border-amber-300 dark:border-amber-700' : ''} ${levelColors[item.packageLevel] || levelColors.Budget}`}>
                        <div className={`${item.eliteData ? 'bg-gradient-to-r from-amber-500 to-amber-600' : (headerColors[item.packageLevel] || headerColors.Budget)} text-white px-4 py-2 flex items-center justify-between`}>
                          <div className="flex items-center gap-2">
                            {item.eliteData ? <Crown className="h-4 w-4" /> : <Award className="h-4 w-4" />}
                            <span className="font-semibold">{item.unitType}</span>
                            <span className="opacity-70">•</span>
                            <span className="opacity-90">{item.tier}</span>
                            {item.eliteData && <Badge className="bg-white/20 text-white text-xs ml-1">Elite Package</Badge>}
                          </div>
                          {item.quantity > 1 && <Badge className="bg-white/20 text-white">x{item.quantity}</Badge>}
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="font-semibold text-lg">{UNIT_TYPE_INFO[item.unitType]?.name || item.unitType}</span>
                            <Badge variant="secondary" className="text-xs">{item.extractedTonnage}</Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            {components.map((comp, i) => (
                              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center border border-gray-100 dark:border-gray-700">
                                {comp.image ? (
                                  <img src={getAssetUrl(comp.image)} alt={comp.label} className="w-12 h-12 mx-auto object-contain mb-1" loading="lazy" />
                                ) : (
                                  <div className="w-12 h-12 mx-auto bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center mb-1">
                                    <Package className="h-6 w-6 text-gray-400" />
                                  </div>
                                )}
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{comp.label}</p>
                              </div>
                            ))}
                          </div>
                          {item.eliteData && (
                            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-1">
                                <Crown className="h-3 w-3" />
                                ELITE PACKAGE INCLUDES:
                              </p>
                              <div className="space-y-1">
                                {HVAC_ELITE_CORE_BUNDLES.map(bundle => (
                                  <div key={bundle.name} className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">{bundle.name}</span>
                                    <span className="font-medium">{formatPrice(item.eliteData!.coreBundlePrices[bundle.id] || 0)}</span>
                                  </div>
                                ))}
                                {(() => {
                                  const airflowOption = HVAC_ELITE_AIRFLOW_OPTIONS.find(o => o.id === item.eliteData!.selectedAirflowOptionId);
                                  if (airflowOption) {
                                    return (
                                      <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">{airflowOption.name}</span>
                                        <span className="font-medium">{formatPrice(item.eliteData!.airflowPrice)}</span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700">
                                <div className="flex justify-between text-xs text-green-600 dark:text-green-400 font-medium">
                                  <span>20% Elite Discount</span>
                                  <span>-{formatPrice(item.eliteData.discountAmount)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="bg-primary/10 rounded-lg p-3 flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                              {formatPrice(monthlyPrice)}/mo financing
                            </div>
                            <div className="text-right">
                              {item.eliteData && (
                                <p className="text-xs text-muted-foreground line-through">{formatPrice(item.eliteData.originalTotal * item.quantity)}</p>
                              )}
                              <p className="text-2xl font-bold text-primary">{formatPrice(itemPrice)}</p>
                            </div>
                          </div>
                          {item.eliteData && (
                            <Badge className="mt-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                              You Save {formatPrice(item.eliteData.discountAmount * item.quantity)}!
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>

              {/* Proposal Notes */}
              <div className="my-6">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Proposal Notes</h3>
                {!isNavigatingAway && (
                  <ProposalRichTextEditor value={proposalNotes} onChange={setProposalNotes} />
                )}
              </div>

            <Separator className="my-6" />

            <div className="bg-muted rounded-lg p-4">
              {quoteMode === "options" ? (
                <>
                  {/* Options Mode - Show each package as a separate option */}
                  <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    PRICING OPTIONS (Choose One)
                  </div>
                  <div className="space-y-3">
                    {cart.map((item, idx) => {
                      const optionLabel = isHvacPackage(item) ? item.packageLevel : 
                                          isCrawlspaceItem(item) ? item.tier.name :
                                          isCrawlspaceServicesItem(item) ? "Crawlspace Services" :
                                          isCustomBuild(item) ? "Custom Build" : `Option ${idx + 1}`;
                      const optionPrice = isHvacPackage(item) 
                        ? (item.eliteData ? item.eliteData.finalTotal : parseFloat(item.totalInvestment) || 0) * item.quantity
                        : isCrawlspaceItem(item)
                        ? (item.eliteData ? item.eliteData.finalTotal : item.pricingBreakdown.totalPrice) * item.quantity
                        : isCrawlspaceServicesItem(item)
                        ? item.totalPrice * item.quantity
                        : isCustomBuild(item)
                        ? (() => { const est = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat); return est.high * item.quantity; })()
                        : 0;
                      const optionMonthly = Math.round(optionPrice / 67);
                      const levelColor = isHvacPackage(item) ? getPackageLevelColor(item.packageLevel) : 'bg-gray-500';
                      return (
                        <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Badge className={`${levelColor} text-white text-xs`}>
                                {optionLabel}
                              </Badge>
                              {item.quantity > 1 && <span className="text-xs text-muted-foreground">x{item.quantity}</span>}
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary">{formatPrice(optionPrice)}</p>
                              <p className="text-xs text-muted-foreground">{formatPrice(optionMonthly)}/mo</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {hasEstimatedItems && (
                    <p className="text-xs text-muted-foreground mt-2">* Includes estimated pricing for custom builds</p>
                  )}
                </>
              ) : (
                <>
                  {/* Single Mode - Combined totals */}
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatPriceRange(cartSubtotalPreDiscount.low, cartSubtotalPreDiscount.high)}</span>
                  </div>
                  {hasEstimatedItems && (
                    <p className="text-xs text-muted-foreground mb-2">* Includes estimated pricing for custom builds</p>
                  )}
                  
                  {cartEliteDiscountAmount > 0 && (
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Crown className="h-4 w-4" />
                        Elite Bundle Discount (20%)
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">–{formatPrice(cartEliteDiscountAmount)}</span>
                    </div>
                  )}
                  
                  <Separator className="my-3" />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Total Investment</span>
                    <span className="text-2xl font-bold text-primary">{formatPriceRange(cartTotalAfterDiscount.low, cartTotalAfterDiscount.high)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-muted-foreground">Monthly Payment (with approved financing)</span>
                    <span className="text-sm font-medium">{formatPriceRange(cartMonthlyTotalRange.low, cartMonthlyTotalRange.high)}/mo</span>
                  </div>
                  
                  {cartEliteDiscountAmount > 0 && (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      You save {formatPrice(cartEliteDiscountAmount)} with Elite Package!
                    </p>
                  )}
                </>
              )}
            </div>

            {customerNotes && (
              <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Notes</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">{customerNotes}</p>
              </div>
            )}

            <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">
                This proposal is valid for 30 days. Prices are subject to change.
                Financing terms are subject to credit approval.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {COMPANY_INFO.footer}
              </p>
            </div>
          </ScrollArea>
          
          <div className="border-t border-slate-100 bg-white px-6 py-4 shrink-0 flex-none rounded-b-2xl">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setQuoteDialogOpen(false)}
                className="flex-1 h-11 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Close
              </Button>
              <Button
                onClick={handleSaveToCrm}
                disabled={cart.length === 0 || !selectedCustomer || saveToCrmMutation.isPending}
                className="flex-1 h-11 rounded-xl bg-[#711419] hover:bg-[#5a1014] text-white"
                data-testid="button-save-to-crm"
              >
                {saveToCrmMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Save to CRM
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      </div>
    </CrmLayout>
  );
}
