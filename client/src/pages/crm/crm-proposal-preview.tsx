import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Package, Crown, Award, Wrench, Check, Loader2, FileText, CheckCircle2, MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import ProposalRichTextEditor from "@/components/proposal-rich-text-editor";
import redlogo from "@assets/redlogo.webp";

// ─── Types (mirrored from crm-proposal-builder) ──────────────────────────────

type ElitePackageData = {
  isElite: true;
  selectedAirflowOptionId: string;
  coreBundlePrices: Record<string, number>;
  airflowPrice: number;
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
};

type PricebookPackage = {
  unitType: string; tier: string; tonnage: string; packageLevel: string;
  monthlyPayment: string; totalInvestment: string;
  outdoorBrand: string; outdoorModel: string; outdoorName: string;
  coilModel: string; coilName: string; indoorHeatModel: string; indoorHeatName: string;
  thermostatModel: string; thermostatName: string; accessoryModels: string;
  outdoorImageUrl?: string; coilImageUrl?: string; furnaceImageUrl?: string; thermostatImageUrl?: string;
};

type PricebookComponent = {
  unitType: string; tier: string; tonnage: string; packageLevel: string;
  componentType: string; brand: string; unitName: string; model: string;
  description: string; monthlyPayment: string; totalInvestment: string;
  sourcePage: string; equipmentCost?: number; sellingPrice?: number; imageUrl?: string;
};

type CartPackage = PricebookPackage & {
  id: string; extractedTonnage: string; quantity: number;
  isCustomBuild?: false; eliteData?: ElitePackageData;
};

type CustomBuildCart = {
  id: string; isCustomBuild: true; tonnage: string;
  outdoorUnit: PricebookComponent | null; coil: PricebookComponent | null;
  indoorUnit: PricebookComponent | null; thermostat: PricebookComponent | null;
  quantity: number; eliteData?: ElitePackageData;
};

type CrawlspaceTier = { id: string; name: string; milThickness: number; description: string; rollPrice: number };
type CrawlspacePricingBreakdown = {
  inputSqft: number; bandSqft: number; pillars: number; wallAreaSqft: number;
  pillarAreaSqft: number; totalLinerAreaSqft: number; rollsNeeded: number;
  linerMaterialCost: number; laborCost: number; dehumidifierModel: string;
  dehumidifierBaseCost: number; dehumidifierSellPrice: number; totalPrice: number;
};

type CrawlspaceCartItem = {
  id: string; isCrawlspace: true; tier: CrawlspaceTier;
  sqft: number; pricingBreakdown: CrawlspacePricingBreakdown; quantity: number; eliteData?: ElitePackageData;
};

type CrawlspaceServiceSelection = { sqft: number; services: string[]; doorOption: string | null };
type CrawlspaceServicesCartItem = {
  id: string; isCrawlspaceServices: true; selections: CrawlspaceServiceSelection; totalPrice: number; quantity: number;
};

type CartItem = CartPackage | CustomBuildCart | CrawlspaceCartItem | CrawlspaceServicesCartItem;
type HvacPackageCartItem = PricebookPackage & { id: string; extractedTonnage: string; quantity: number; isCustomBuild?: false; eliteData?: ElitePackageData };

type AssignableUser = { id: string; displayName: string };
type CustomerProperty = { id: string; address1: string; address2?: string; city: string; state: string; zip: string };

type PreviewState = {
  cart: CartItem[];
  selectedCustomer: { id: string; name: string; fullAddress: string | null; phone: string | null; email: string | null } | null;
  quoteMode: "single" | "options";
  customerNotes: string;
  proposalNotes: string;
  assignedToId: string | null;
  selectedPropertyId: string | null;
  preloadedPropertyId: string | null;
  preloadedProjectId: string | null;
  preloadedWorkOrderId: string | null;
  customerProperties: CustomerProperty[];
  assignableUsers: AssignableUser[];
  returnUrl: string;
  computedTotals: {
    cartSubtotalPreDiscount: { low: number; high: number };
    cartEliteDiscountAmount: number;
    cartTotalAfterDiscount: { low: number; high: number };
    cartMonthlyTotalRange: { low: number; high: number };
    hasEstimatedItems: boolean;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const PREVIEW_STATE_KEY = "ghvac-proposal-preview-state";

const COMPANY_INFO = {
  name: "GIESBRECHT HVAC",
  footer: "Thank you for considering GHVAC!",
};

const getAssetUrl = (path: string | undefined | null): string => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/assets/${path}`;
};

const formatPrice = (p: number) => "$" + p.toLocaleString();
const formatPriceRange = (low: number, high: number) =>
  low === high ? "$" + low.toLocaleString() : "$" + low.toLocaleString() + " – $" + high.toLocaleString();

function isCrawlspaceItem(item: CartItem): item is CrawlspaceCartItem {
  return "isCrawlspace" in item && (item as any).isCrawlspace === true;
}
function isCrawlspaceServicesItem(item: CartItem): item is CrawlspaceServicesCartItem {
  return "isCrawlspaceServices" in item && (item as any).isCrawlspaceServices === true;
}
function isCustomBuild(item: CartItem): item is CustomBuildCart {
  return "isCustomBuild" in item && (item as any).isCustomBuild === true;
}
function isHvacPackage(item: CartItem): item is HvacPackageCartItem {
  return !isCrawlspaceItem(item) && !isCustomBuild(item) && !isCrawlspaceServicesItem(item);
}

function getPackageLevelColor(level: string) {
  switch (level) {
    case "Budget": return "bg-gray-500";
    case "Good": return "bg-blue-500";
    case "Better": return "bg-purple-500";
    case "Best": return "bg-amber-500";
    default: return "bg-gray-500";
  }
}

const UNIT_TYPE_INFO: Record<string, { name: string }> = {
  SGA: { name: "SGA" }, SHP: { name: "SHP" }, STA: { name: "Heat Pump + Gas Furnace" },
  PHP: { name: "PHP" }, GP: { name: "GP" }, "Mini-Split": { name: "Mini-Split" }, "Ducting": { name: "Ducting" },
};

const HVAC_ELITE_CORE_BUNDLES = [
  { id: "10yr-labor", name: "10-Year Labor Warranty" },
  { id: "10yr-maintenance", name: "10-Year Maintenance Plan" },
  { id: "install-upgrade", name: "Install Upgrade Bundle" },
];

const HVAC_ELITE_AIRFLOW_OPTIONS = [
  { id: "new-ducting", name: "New Ducting System" },
  { id: "cleaning-return-insulation", name: "Duct Cleaning + New Return + Re-Insulation" },
];

const CRAWLSPACE_ELITE_BUNDLES = [
  { id: "crawl-10yr-maintenance-inspection", name: "10-Year Maintenance & Inspection" },
  { id: "crawl-dehumidifier-warranty", name: "10-Year Dehumidifier Warranty" },
];

const CRAWLSPACE_SERVICES = {
  SERVICES: [
    { id: "joist-cleaning", name: "Joist Cleaning (HEPA Vacuum)", ratePerSqft: 3.25, minSqft: 250 },
    { id: "mold-treatment", name: "Mold Treatment", ratePerSqft: 1.35, minSqft: 250 },
    { id: "excavation", name: "Excavation", ratePerSqft: 2.50, minSqft: 250 },
  ],
  DOOR_OPTIONS: [
    { id: "door-replacement", name: "Replacement Door Installation", price: 1000 },
    { id: "door-new", name: "New Door Installation (No Existing Door)", price: 2500 },
  ],
};

function calculateCustomBuildEstimate(
  outdoorUnit: PricebookComponent | null,
  coil: PricebookComponent | null,
  indoorUnit: PricebookComponent | null,
  thermostat: PricebookComponent | null,
): { low: number; high: number } {
  let totalLow = 0, totalHigh = 0;
  if (outdoorUnit) {
    const base = outdoorUnit.sellingPrice ?? (outdoorUnit.componentType === "Heat Pump" ? 4500 : 3500);
    totalLow += base; totalHigh += base * 2;
  }
  if (coil) { const base = coil.sellingPrice ?? 800; totalLow += base; totalHigh += base * 2; }
  if (indoorUnit) {
    const base = indoorUnit.sellingPrice ?? (indoorUnit.componentType === "Air Handler" ? 2000 : 1800);
    totalLow += base; totalHigh += base * 2;
  }
  if (thermostat) {
    const base = thermostat.sellingPrice ??
      ((thermostat.unitName.toLowerCase().includes("smart") || thermostat.unitName.toLowerCase().includes("wifi")) ? 350 : 250);
    totalLow += base; totalHigh += base * 2;
  }
  return { low: totalLow, high: totalHigh };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CrmProposalPreview() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [previewData, setPreviewData] = useState<PreviewState | null>(null);
  const [proposalNotes, setProposalNotes] = useState<string>("");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [isNavigatingAway, setIsNavigatingAway] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(PREVIEW_STATE_KEY);
    if (!raw) {
      setLocation("/crm/quotes/proposal");
      return;
    }
    try {
      const data: PreviewState = JSON.parse(raw);
      setPreviewData(data);
      setProposalNotes(data.proposalNotes || "");
      setAssignedToId(data.assignedToId || null);
    } catch {
      setLocation("/crm/quotes/proposal");
    }
  }, []);

  const saveToCrmMutation = useMutation({
    mutationFn: async (payload: {
      customerId: string; propertyId?: string; projectId?: string; workOrderId?: string;
      title: string; description?: string; notes?: string;
      lineItems: Array<{ description: string; quantity: number; unitPrice: number; taxable?: boolean; optionTag?: string; imageUrl?: string }>;
      status?: string; quoteMode?: string; quoteType?: string; assignedToId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/crm/quotes/from-proposal", payload);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Saved to CRM!", description: `Quote ${data.quote?.quoteNumber || ""} created successfully.` });
      if (data.quote) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      }
      if (data.quote?.id) {
        setIsNavigatingAway(true);
        sessionStorage.removeItem(PREVIEW_STATE_KEY);
        setTimeout(() => setLocation(`/crm/quotes/${data.quote.id}`), 150);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save to CRM. Please try again.", variant: "destructive" });
    },
  });

  const handleSaveToCrm = () => {
    if (!previewData?.selectedCustomer) return;
    const { cart, selectedCustomer, quoteMode, customerNotes, customerProperties,
      selectedPropertyId, preloadedPropertyId, preloadedProjectId, preloadedWorkOrderId } = previewData;

    if (!assignedToId) {
      toast({ title: "Assignment Required", description: "Please assign this quote to a team member.", variant: "destructive" });
      return;
    }

    const propertyIdToUse = selectedPropertyId || preloadedPropertyId;
    const isValidProperty = customerProperties.length === 0 || customerProperties.some(p => p.id === propertyIdToUse);
    if (customerProperties.length > 1 && (!propertyIdToUse || !isValidProperty)) {
      toast({ title: "Property Required", description: "Please select a property for this quote.", variant: "destructive" });
      return;
    }
    const finalPropertyId = isValidProperty ? propertyIdToUse : (customerProperties.length === 1 ? customerProperties[0].id : undefined);

    const lineItems: Array<{ description: string; quantity: number; unitPrice: number; taxable: boolean; optionTag?: string; imageUrl?: string }> = [];

    cart.forEach(item => {
      if (isHvacPackage(item)) {
        const price = item.eliteData ? item.eliteData.finalTotal : parseFloat(item.totalInvestment) || 0;
        const equipmentImages: Record<string, string> = {};
        if (item.outdoorImageUrl) equipmentImages.outdoor = item.outdoorImageUrl;
        if (item.thermostatImageUrl) equipmentImages.thermostat = item.thermostatImageUrl;
        if (item.coilImageUrl) equipmentImages.coil = item.coilImageUrl;
        if (item.furnaceImageUrl) equipmentImages.furnace = item.furnaceImageUrl;
        const uniqueOptionTag = quoteMode === "options" ? `${item.packageLevel} - ${item.extractedTonnage}` : undefined;
        lineItems.push({
          description: `${item.packageLevel} Package - ${item.extractedTonnage} - ${item.outdoorBrand} ${item.outdoorName}`,
          quantity: item.quantity, unitPrice: price, taxable: true,
          optionTag: uniqueOptionTag,
          imageUrl: Object.keys(equipmentImages).length > 0 ? JSON.stringify(equipmentImages) : undefined,
        });
      } else if (isCrawlspaceItem(item)) {
        const price = item.eliteData ? item.eliteData.finalTotal : item.pricingBreakdown.totalPrice;
        lineItems.push({
          description: `Crawlspace Encapsulation - ${item.tier.name} (${item.pricingBreakdown.bandSqft.toLocaleString()} sqft)`,
          quantity: item.quantity, unitPrice: price, taxable: true,
          optionTag: quoteMode === "options" ? item.tier.name : undefined,
        });
      } else if (isCustomBuild(item)) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        const equipmentImages: Record<string, string> = {};
        if (item.outdoorUnit?.imageUrl) equipmentImages.outdoor = item.outdoorUnit.imageUrl;
        if (item.thermostat?.imageUrl) equipmentImages.thermostat = item.thermostat.imageUrl;
        if (item.coil?.imageUrl) equipmentImages.coil = item.coil.imageUrl;
        if (item.indoorUnit?.imageUrl) equipmentImages.furnace = item.indoorUnit.imageUrl;
        lineItems.push({
          description: `Custom Build - ${item.tonnage} System`,
          quantity: item.quantity, unitPrice: estimate.high, taxable: true,
          optionTag: quoteMode === "options" ? "Custom Build" : undefined,
          imageUrl: Object.keys(equipmentImages).length > 0 ? JSON.stringify(equipmentImages) : undefined,
        });
      }
    });

    const crmTitle = cart.length > 0
      ? (isHvacPackage(cart[0]) ? `${(cart[0] as HvacPackageCartItem).packageLevel} Package Proposal` : "Equipment Proposal")
      : "Equipment Proposal";

    saveToCrmMutation.mutate({
      customerId: selectedCustomer.id,
      propertyId: finalPropertyId || undefined,
      projectId: preloadedProjectId || undefined,
      workOrderId: preloadedWorkOrderId || undefined,
      title: crmTitle,
      description: (proposalNotes && proposalNotes !== "<p></p>") ? proposalNotes : undefined,
      notes: customerNotes || undefined,
      lineItems,
      status: "draft",
      quoteMode,
      quoteType: "proposal",
      assignedToId: assignedToId || undefined,
    });
  };

  if (!previewData) {
    return (
      <CrmLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CrmLayout>
    );
  }

  const { cart, selectedCustomer, quoteMode, customerNotes, assignableUsers, customerProperties, computedTotals } = previewData;
  const { cartSubtotalPreDiscount, cartEliteDiscountAmount, cartTotalAfterDiscount, cartMonthlyTotalRange, hasEstimatedItems } = computedTotals;

  return (
    <CrmLayout>
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsNavigatingAway(true);
            setTimeout(() => setLocation(previewData.returnUrl || "/crm/quotes/proposal"), 100);
          }}
          className="text-slate-600 dark:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <img src={redlogo} alt="GHVAC" className="h-8 w-auto hidden sm:block" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">Equipment Proposal</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <Badge variant="outline" className="text-xs ml-2 hidden sm:flex shrink-0">Valid 30 Days</Badge>
        </div>
        <Button
          onClick={handleSaveToCrm}
          disabled={cart.length === 0 || !selectedCustomer || saveToCrmMutation.isPending}
          className="bg-[#711419] hover:bg-[#5a1014] text-white shrink-0"
        >
          {saveToCrmMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
          Save to CRM
        </Button>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Customer */}
        <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <span className="font-semibold text-lg">{selectedCustomer?.name || "No Customer Selected"}</span>
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

        {/* Assign To */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Assign To (Sales Team)</Label>
          <Select value={assignedToId || ""} onValueChange={(v) => setAssignedToId(v || null)}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Select team member..." />
            </SelectTrigger>
            <SelectContent>
              {assignableUsers && assignableUsers.length > 0 ? (
                assignableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>
                ))
              ) : (
                <SelectItem value="" disabled>No users available</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Equipment */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
            <Package className="h-4 w-4" />
            EQUIPMENT INCLUDED
          </h3>
          <div className="space-y-4">
            {cart.map((item) => {
              if (isCrawlspaceItem(item)) {
                const basePrice = item.pricingBreakdown.totalPrice;
                const finalPrice = item.eliteData ? item.eliteData.finalTotal : basePrice;
                const itemPrice = finalPrice * item.quantity;
                return (
                  <div key={item.id} className={`rounded-xl border-2 ${item.eliteData ? "border-amber-300 dark:border-amber-700" : "border-teal-200 dark:border-teal-800"} bg-gradient-to-br from-teal-50 to-white dark:from-teal-950 dark:to-gray-900 overflow-hidden shadow-sm`}>
                    <div className={`${item.eliteData ? "bg-gradient-to-r from-amber-500 to-amber-600" : "bg-teal-500"} text-white px-4 py-2 flex items-center justify-between`}>
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
                      <p className="text-sm text-muted-foreground mb-4">{item.tier.milThickness} Mil Vapor Barrier – {item.tier.description}</p>
                      {item.eliteData && (
                        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-1">
                            <Crown className="h-3 w-3" /> ELITE PACKAGE INCLUDES:
                          </p>
                          <div className="space-y-1">
                            {CRAWLSPACE_ELITE_BUNDLES.map(bundle => (
                              <div key={bundle.name} className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{bundle.name}</span>
                                <span className="font-medium">{formatPrice(item.eliteData!.coreBundlePrices[bundle.id] || 0)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700">
                            <div className="flex justify-between text-xs text-green-600 dark:text-green-400 font-medium">
                              <span>20% Elite Discount</span>
                              <span>–{formatPrice(item.eliteData.discountAmount)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="bg-teal-100 dark:bg-teal-900/50 rounded-lg p-3 flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">{formatPrice(Math.round(itemPrice / 67))}/mo financing</div>
                        <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{formatPrice(itemPrice)}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (isCustomBuild(item)) {
                const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
                const priceLow = estimate.low * item.quantity;
                const priceHigh = estimate.high * item.quantity;
                const components = [
                  item.outdoorUnit ? { label: "Outdoor Unit", name: item.outdoorUnit.unitName, image: item.outdoorUnit.imageUrl } : null,
                  item.coil ? { label: "Evaporator Coil", name: item.coil.unitName, image: item.coil.imageUrl } : null,
                  item.indoorUnit ? { label: "Indoor Unit", name: item.indoorUnit.unitName, image: item.indoorUnit.imageUrl } : null,
                  item.thermostat ? { label: "Thermostat", name: item.thermostat.unitName, image: item.thermostat.imageUrl } : null,
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
                          </div>
                        ))}
                      </div>
                      <div className="bg-green-100 dark:bg-green-900/50 rounded-lg p-3 flex items-center justify-between">
                        <Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:border-green-600 dark:text-green-300">Estimated Price</Badge>
                        <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatPriceRange(priceLow, priceHigh)}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (isCrawlspaceServicesItem(item)) {
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
                        <div className="text-sm text-muted-foreground">{formatPrice(Math.round(itemPrice / 67))}/mo financing</div>
                        <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{formatPrice(itemPrice)}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              // HVAC Package
              const hvac = item as HvacPackageCartItem;
              const basePrice = parseFloat(hvac.totalInvestment) || 0;
              const finalPrice = hvac.eliteData ? hvac.eliteData.finalTotal : basePrice;
              const itemPrice = finalPrice * hvac.quantity;
              const monthlyPrice = hvac.eliteData
                ? Math.round(hvac.eliteData.finalTotal / 67) * hvac.quantity
                : (parseFloat(hvac.monthlyPayment) || 0) * hvac.quantity;
              const levelColors: Record<string, string> = {
                Best: "from-amber-50 to-white dark:from-amber-950 dark:to-gray-900 border-amber-200 dark:border-amber-800",
                Better: "from-purple-50 to-white dark:from-purple-950 dark:to-gray-900 border-purple-200 dark:border-purple-800",
                Good: "from-blue-50 to-white dark:from-blue-950 dark:to-gray-900 border-blue-200 dark:border-blue-800",
                Budget: "from-gray-50 to-white dark:from-gray-900 dark:to-gray-900 border-gray-200 dark:border-gray-700",
              };
              const headerColors: Record<string, string> = {
                Best: "bg-amber-500", Better: "bg-purple-500", Good: "bg-blue-500", Budget: "bg-gray-500",
              };
              const indoorLabel = hvac.unitType === "PHP" ? "Heat Kit" : hvac.unitType === "SHP" ? "Air Handler" : "Indoor Unit";
              const components = [
                { label: "Outdoor Unit", name: `${hvac.outdoorBrand} ${hvac.outdoorModel}`, image: hvac.outdoorImageUrl },
                { label: "Evaporator Coil", name: hvac.coilName || hvac.coilModel, image: hvac.coilImageUrl },
                { label: indoorLabel, name: hvac.indoorHeatName || hvac.indoorHeatModel, image: hvac.furnaceImageUrl },
                { label: "Thermostat", name: hvac.thermostatName || hvac.thermostatModel, image: hvac.thermostatImageUrl },
              ].filter(c => c.name);
              return (
                <div key={hvac.id} className={`rounded-xl border-2 bg-gradient-to-br overflow-hidden shadow-sm ${hvac.eliteData ? "border-amber-300 dark:border-amber-700" : ""} ${levelColors[hvac.packageLevel] || levelColors.Budget}`}>
                  <div className={`${hvac.eliteData ? "bg-gradient-to-r from-amber-500 to-amber-600" : (headerColors[hvac.packageLevel] || headerColors.Budget)} text-white px-4 py-2 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      {hvac.eliteData ? <Crown className="h-4 w-4" /> : <Award className="h-4 w-4" />}
                      <span className="font-semibold">{hvac.unitType}</span>
                      <span className="opacity-70">•</span>
                      <span className="opacity-90">{hvac.tier}</span>
                      {hvac.eliteData && <Badge className="bg-white/20 text-white text-xs ml-1">Elite Package</Badge>}
                    </div>
                    {hvac.quantity > 1 && <Badge className="bg-white/20 text-white">x{hvac.quantity}</Badge>}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-semibold text-lg">{UNIT_TYPE_INFO[hvac.unitType]?.name || hvac.unitType}</span>
                      <Badge variant="secondary" className="text-xs">{hvac.extractedTonnage}</Badge>
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
                    {hvac.eliteData && (
                      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-1">
                          <Crown className="h-3 w-3" /> ELITE PACKAGE INCLUDES:
                        </p>
                        <div className="space-y-1">
                          {HVAC_ELITE_CORE_BUNDLES.map(bundle => (
                            <div key={bundle.name} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{bundle.name}</span>
                              <span className="font-medium">{formatPrice(hvac.eliteData!.coreBundlePrices[bundle.id] || 0)}</span>
                            </div>
                          ))}
                          {(() => {
                            const airflowOption = HVAC_ELITE_AIRFLOW_OPTIONS.find(o => o.id === hvac.eliteData!.selectedAirflowOptionId);
                            if (airflowOption) {
                              return (
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">{airflowOption.name}</span>
                                  <span className="font-medium">{formatPrice(hvac.eliteData!.airflowPrice)}</span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700">
                          <div className="flex justify-between text-xs text-green-600 dark:text-green-400 font-medium">
                            <span>20% Elite Discount</span>
                            <span>–{formatPrice(hvac.eliteData.discountAmount)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="bg-primary/10 rounded-lg p-3 flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">{formatPrice(monthlyPrice)}/mo financing</div>
                      <div className="text-right">
                        {hvac.eliteData && (
                          <p className="text-xs text-muted-foreground line-through">{formatPrice(hvac.eliteData.originalTotal * hvac.quantity)}</p>
                        )}
                        <p className="text-2xl font-bold text-primary">{formatPrice(itemPrice)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Proposal Notes – large editor */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-foreground">Proposal Notes</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Add contract terms, scope of work, exclusions, or any other notes for the customer.
          </p>
          {!isNavigatingAway && (
            <div className="min-h-[400px]">
              <ProposalRichTextEditor value={proposalNotes} onChange={setProposalNotes} />
            </div>
          )}
        </div>

        <Separator />

        {/* Pricing Summary */}
        <div className="bg-muted rounded-lg p-5">
          {quoteMode === "options" ? (
            <>
              <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                PRICING OPTIONS (Choose One)
              </div>
              <div className="space-y-3">
                {cart.map((item, idx) => {
                  const optionLabel = isHvacPackage(item) ? (item as HvacPackageCartItem).packageLevel
                    : isCrawlspaceItem(item) ? item.tier.name
                    : isCrawlspaceServicesItem(item) ? "Crawlspace Services"
                    : isCustomBuild(item) ? "Custom Build"
                    : `Option ${idx + 1}`;
                  const optionPrice = isHvacPackage(item)
                    ? ((item as HvacPackageCartItem).eliteData
                        ? (item as HvacPackageCartItem).eliteData!.finalTotal
                        : parseFloat((item as HvacPackageCartItem).totalInvestment) || 0) * item.quantity
                    : isCrawlspaceItem(item)
                    ? (item.eliteData ? item.eliteData.finalTotal : item.pricingBreakdown.totalPrice) * item.quantity
                    : isCrawlspaceServicesItem(item)
                    ? item.totalPrice * item.quantity
                    : (() => { const est = calculateCustomBuildEstimate((item as CustomBuildCart).outdoorUnit, (item as CustomBuildCart).coil, (item as CustomBuildCart).indoorUnit, (item as CustomBuildCart).thermostat); return est.high * item.quantity; })();
                  const optionMonthly = Math.round(optionPrice / 67);
                  const levelColor = isHvacPackage(item) ? getPackageLevelColor((item as HvacPackageCartItem).packageLevel) : "bg-gray-500";
                  return (
                    <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge className={`${levelColor} text-white text-xs`}>{optionLabel}</Badge>
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
                    <Crown className="h-4 w-4" /> Elite Bundle Discount (20%)
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
          <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Notes</h3>
            <p className="text-sm text-amber-700 dark:text-amber-300">{customerNotes}</p>
          </div>
        )}

        <div className="p-4 bg-muted/50 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">
            This proposal is valid for 30 days. Prices are subject to change. Financing terms are subject to credit approval.
          </p>
          <p className="text-xs text-muted-foreground mt-1">{COMPANY_INFO.footer}</p>
        </div>

        {/* Bottom save button */}
        <div className="flex gap-3 pb-4">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => {
              setIsNavigatingAway(true);
              setTimeout(() => setLocation(previewData.returnUrl || "/crm/quotes/proposal"), 100);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Builder
          </Button>
          <Button
            onClick={handleSaveToCrm}
            disabled={cart.length === 0 || !selectedCustomer || saveToCrmMutation.isPending}
            className="flex-1 h-11 bg-[#711419] hover:bg-[#5a1014] text-white"
          >
            {saveToCrmMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Save to CRM
          </Button>
        </div>
      </div>
    </CrmLayout>
  );
}
