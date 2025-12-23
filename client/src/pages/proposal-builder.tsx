import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, ShoppingCart, Trash2, FileText, Copy, Package, Thermometer, Zap, Award, Filter, Wrench, CheckCircle2, Search, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import packagesData from "@assets/pricebook-packages.json";
import componentsData from "@assets/pricebook-components.json";
import type { Customer } from "@shared/schema";

const CART_STORAGE_KEY = 'ghvac-proposal-cart';
const CUSTOMER_STORAGE_KEY = 'ghvac-proposal-customer';

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

type CartPackage = PricebookPackage & {
  id: string;
  extractedTonnage: string;
  quantity: number;
  isCustomBuild?: false;
};

type CustomBuildCart = {
  id: string;
  isCustomBuild: true;
  tonnage: string;
  outdoorUnit: PricebookComponent;
  coil: PricebookComponent;
  indoorUnit: PricebookComponent;
  thermostat: PricebookComponent;
  quantity: number;
};

type CartItem = CartPackage | CustomBuildCart;

const packages: PricebookPackage[] = packagesData as PricebookPackage[];
const components: PricebookComponent[] = componentsData as PricebookComponent[];

const UNIT_TYPE_INFO: Record<string, { name: string; description: string; icon: typeof Package }> = {
  SGA: { name: "SGA", description: "Split Gas Air system for heating and cooling", icon: Thermometer },
  SHP: { name: "SHP", description: "All-electric heating and cooling solution", icon: Zap },
  STA: { name: "Heat Pump + Gas Furnace", description: "Dual fuel system for maximum efficiency", icon: Award },
  PHP: { name: "PHP", description: "All-in-one packaged heat pump unit", icon: Package },
  GP: { name: "GP", description: "All-in-one gas/electric package unit", icon: Package },
  "Mini-Split": { name: "Mini-Split", description: "Ductless single-zone heating & cooling", icon: Zap },
  "Ducting": { name: "Ducting", description: "Complete duct system replacement", icon: Package },
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
  
  // Use "Heat Kit" label for PHP and SHP systems, "Indoor" for others
  const indoorLabel = (unitType === 'PHP' || unitType === 'SHP') ? 'Heat Kit' : 'Indoor';
  
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
            src={`/assets/${item.url}`}
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

export default function ProposalBuilder() {
  const { toast } = useToast();
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
  const [generatedQuote, setGeneratedQuote] = useState<string | null>(null);

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

  // Customer search state for Accept Quote
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchAllFields, setSearchAllFields] = useState(false);

  // Debounce customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerSearch(customerSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchTerm]);

  // Customer search query
  const { data: customerSearchResults = [], isFetching: isSearchingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", debouncedCustomerSearch, searchAllFields],
    queryFn: async () => {
      if (debouncedCustomerSearch.length < 2) return [];
      const params = new URLSearchParams({
        term: debouncedCustomerSearch,
        ...(searchAllFields && { searchAll: 'true' })
      });
      const res = await fetch(`/api/customers/search?${params}`);
      if (!res.ok) throw new Error("Failed to search customers");
      return res.json();
    },
    enabled: debouncedCustomerSearch.length >= 2,
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

  const handleSelectCustomer = (customer: Customer) => {
    const cleanName = customer.displayName.replace(/^["']|["']$/g, '');
    setCustomerName(cleanName);
    setCustomerAddress(customer.fullAddress || '');
    setSelectedCustomer(customer);
    setCustomerSearchTerm("");
    setIsCustomerPopoverOpen(false);
    toast({ description: `Customer "${cleanName}" selected`, duration: 2000 });
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
      if (item.isCustomBuild) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return {
          type: "custom",
          tonnage: item.tonnage,
          quantity: item.quantity,
          priceLow: estimate.low * item.quantity,
          priceHigh: estimate.high * item.quantity,
          outdoor: {
            brand: item.outdoorUnit.brand,
            model: item.outdoorUnit.model,
            name: item.outdoorUnit.unitName,
          },
          coil: {
            brand: item.coil.brand,
            model: item.coil.model,
            name: item.coil.unitName,
          },
          indoor: {
            brand: item.indoorUnit.brand,
            model: item.indoorUnit.model,
            name: item.indoorUnit.unitName,
          },
          thermostat: {
            brand: item.thermostat.brand,
            model: item.thermostat.model,
            name: item.thermostat.unitName,
          },
        };
      } else {
        const itemPrice = (parseFloat(item.totalInvestment) || 0) * item.quantity;
        const monthlyPrice = (parseFloat(item.monthlyPayment) || 0) * item.quantity;
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
    return Array.from(new Set(packages.map(p => p.unitType)));
  }, []);

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

  // Get unique coils/heater kits by equipment type - dedupe by model
  // SGA uses Evaporator Coil, SHP/PHP uses Heater Kit
  const coilOrHeaterLabel = (customEquipmentType === "SHP" || customEquipmentType === "PHP") ? "Heater Kit" : "Evaporator Coil";
  const coilOrHeaterType = (customEquipmentType === "SHP" || customEquipmentType === "PHP") ? "Heater Kit" : "Evaporator Coil";
  
  const coilOptions = useMemo(() => {
    if (!customTonnage || !customEquipmentType) return [];
    const seen = new Set<string>();
    const targetType = (customEquipmentType === "SHP" || customEquipmentType === "PHP") ? "Heater Kit" : "Evaporator Coil";
    // Extract numeric tonnage from "1.5 Ton" format
    const numericTonnage = customTonnage.replace(" Ton", "");
    const isSgaOrShp = customEquipmentType === "SGA" || customEquipmentType === "SHP";
    const allowedModels = customEquipmentType === "SGA" ? allowedSgaModels.coil : 
                          customEquipmentType === "SHP" ? allowedShpModels.coil : null;
    return components.filter(comp => {
      if (comp.unitType !== customEquipmentType) return false;
      // For SGA/SHP, only allow models that exist in preset packages
      if (isSgaOrShp && allowedModels && !allowedModels.has(comp.model)) return false;
      if (comp.componentType !== targetType) return false;
      // For heater kits, also match by tonnage (compare numeric values)
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
  // For SGA/SHP: only show models that exist in preset packages
  const thermostatOptions = useMemo(() => {
    if (!customTonnage || !customEquipmentType) return [];
    const seen = new Set<string>();
    const numericTonnage = customTonnage.replace(" Ton", "");
    const isSgaOrShp = customEquipmentType === "SGA" || customEquipmentType === "SHP";
    const allowedModels = customEquipmentType === "SGA" ? allowedSgaModels.thermostat : 
                          customEquipmentType === "SHP" ? allowedShpModels.thermostat : null;
    return components.filter(comp => {
      if (comp.unitType !== customEquipmentType) return false;
      // For SGA/SHP, only allow models that exist in preset packages
      if (isSgaOrShp && allowedModels && !allowedModels.has(comp.model)) return false;
      if (comp.componentType !== "Thermostat/Control") return false;
      // For PHP/GP, match by tonnage
      if (isPackageUnitType && comp.tonnage !== numericTonnage) return false;
      const matchesBrand = thermostatBrandFilter === "All Brands" || comp.brand === thermostatBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, customEquipmentType, thermostatBrandFilter, isPackageUnitType, allowedSgaModels, allowedShpModels]);

  // For GP: only need Package Unit + Thermostat (2 components)
  // For PHP: need Package Unit + Heater Kit + Thermostat (3 components)
  // For SGA/SHP: need all 4 components
  const isCustomBuildComplete = customEquipmentType === "GP"
    ? (selectedOutdoorUnit && selectedThermostat && customTonnage)
    : customEquipmentType === "PHP"
    ? (selectedOutdoorUnit && selectedCoil && selectedThermostat && customTonnage)
    : (selectedOutdoorUnit && selectedCoil && selectedIndoorUnit && selectedThermostat && customTonnage);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartTotalRange = useMemo(() => {
    return cart.reduce((acc, item) => {
      if (item.isCustomBuild) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return { low: acc.low + estimate.low * item.quantity, high: acc.high + estimate.high * item.quantity };
      } else {
        const price = (parseFloat(item.totalInvestment) || 0) * item.quantity;
        return { low: acc.low + price, high: acc.high + price };
      }
    }, { low: 0, high: 0 });
  }, [cart]);

  const cartTotal = cartTotalRange.high; // Use high for backward compatibility

  const cartMonthlyTotalRange = useMemo(() => {
    return cart.reduce((acc, item) => {
      if (item.isCustomBuild) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        return { 
          low: acc.low + Math.round(estimate.low / 67) * item.quantity, 
          high: acc.high + Math.round(estimate.high / 67) * item.quantity 
        };
      } else {
        const monthly = (parseFloat(item.monthlyPayment) || 0) * item.quantity;
        return { low: acc.low + monthly, high: acc.high + monthly };
      }
    }, { low: 0, high: 0 });
  }, [cart]);

  const cartMonthlyTotal = cartMonthlyTotalRange.high; // Use high for backward compatibility

  const hasEstimatedItems = useMemo(() => {
    return cart.some(item => item.isCustomBuild);
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
    // Mini-Split and Ducting skip tonnage selection (step 2)
    if (customEquipmentType === "Mini-Split" || customEquipmentType === "Ducting") return 3;
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
    if (customTonnage) {
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

  const generateQuote = () => {
    if (cart.length === 0) return;
    
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let quoteText = `GHVAC EQUIPMENT PROPOSAL\n`;
    quoteText += `${'='.repeat(40)}\n\n`;
    quoteText += `Date: ${date}\n`;
    if (customerName) quoteText += `Prepared for: ${customerName}\n`;
    if (customerAddress) quoteText += `Address: ${customerAddress}\n`;
    quoteText += `\nEQUIPMENT SUMMARY\n`;
    quoteText += `${'-'.repeat(40)}\n\n`;

    cart.forEach((item, index) => {
      if (item.isCustomBuild) {
        const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
        const priceLow = estimate.low * item.quantity;
        const priceHigh = estimate.high * item.quantity;
        quoteText += `${index + 1}. Custom Build - ${item.tonnage} System\n`;
        quoteText += `   - ${item.outdoorUnit.brand} ${item.outdoorUnit.unitName}\n`;
        quoteText += `   - ${item.coil.brand} ${item.coil.unitName}\n`;
        quoteText += `   - ${item.indoorUnit.brand} ${item.indoorUnit.unitName}\n`;
        quoteText += `   - ${item.thermostat.brand} ${item.thermostat.unitName}\n`;
        quoteText += `   Price: ${formatPriceRange(priceLow, priceHigh)} (Estimated)\n`;
        if (item.quantity > 1) quoteText += `   Qty: ${item.quantity}\n`;
        quoteText += `\n`;
      } else {
        const unitTypeName = UNIT_TYPE_INFO[item.unitType]?.name || item.unitType;
        const itemPrice = (parseFloat(item.totalInvestment) || 0) * item.quantity;
        quoteText += `${index + 1}. ${item.packageLevel} Package - ${item.extractedTonnage}\n`;
        quoteText += `   ${unitTypeName} (${item.tier})\n`;
        quoteText += `   - ${item.outdoorBrand} ${item.outdoorName}\n`;
        if (item.indoorHeatName) quoteText += `   - ${item.indoorHeatName}\n`;
        if (item.thermostatName) quoteText += `   - ${item.thermostatName}\n`;
        quoteText += `   Price: ${formatPrice(itemPrice)}\n`;
        if (item.quantity > 1) quoteText += `   Qty: ${item.quantity}\n`;
        quoteText += `\n`;
      }
    });

    quoteText += `${'-'.repeat(40)}\n`;
    quoteText += `TOTAL INVESTMENT: ${formatPriceRange(cartTotalRange.low, cartTotalRange.high)}${hasEstimatedItems ? ' *' : ''}\n`;
    quoteText += `Monthly Payment: ${formatPriceRange(cartMonthlyTotalRange.low, cartMonthlyTotalRange.high)}/mo (with approved financing)\n`;
    if (hasEstimatedItems) {
      quoteText += `* Includes estimated pricing for custom builds\n`;
    }

    if (customerNotes) {
      quoteText += `\nNotes:\n${customerNotes}\n`;
    }

    quoteText += `\n${'-'.repeat(40)}\n`;
    quoteText += `Thank you for considering GHVAC!\n`;
    quoteText += `This proposal is valid for 30 days.\n`;

    setGeneratedQuote(quoteText);
    setQuoteDialogOpen(true);
  };

  const copyQuoteToClipboard = async () => {
    if (!generatedQuote) return;
    try {
      await navigator.clipboard.writeText(generatedQuote);
      toast({
        title: "Copied!",
        description: "Quote copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Please select and copy the text manually.",
        variant: "destructive",
      });
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
                src={`/assets/${comp.imageUrl}`}
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <img
              src={redlogo}
              alt="Giesbrecht HVAC"
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <NavDropdown
                currentPageTitle="Proposal Builder"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation Department", path: "/installation" },
                  { label: "Service Department", path: "/service-pipeline" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
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
                <ScrollArea className="h-[calc(100vh-280px)] mt-4">
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
                              {item.isCustomBuild ? (
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
                                        outdoor: item.outdoorUnit.imageUrl,
                                        coil: item.coil.imageUrl,
                                        furnace: item.indoorUnit.imageUrl,
                                        thermostat: item.thermostat.imageUrl
                                      }}
                                      size="sm"
                                      showLabels
                                      unitType={item.outdoorUnit.unitType}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm">{item.tonnage} System</p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.outdoorUnit.brand} {item.outdoorUnit.componentType}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.indoorUnit.brand} {item.indoorUnit.componentType}
                                      </p>
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
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge className={`${getPackageLevelColor(item.packageLevel)} text-white text-xs`}>
                                      {item.packageLevel}
                                    </Badge>
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
                                    <p className="font-bold text-sm text-primary">
                                      {formatPrice((parseFloat(item.totalInvestment) || 0) * item.quantity)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatPrice((parseFloat(item.monthlyPayment) || 0) * item.quantity)}/mo
                                    </p>
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
                    <div className="bg-muted p-3 rounded-lg">
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
                        onClick={generateQuote}
                        data-testid="button-generate-quote"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Generate Quote
                      </Button>
                    </div>
                  </div>
                )}
              </SheetContent>
            </Sheet>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="p-3 sm:p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-14 p-1 mx-auto mb-6 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-xl shadow-md" data-testid="tabs-view-switcher">
            <TabsTrigger 
              value="preset" 
              className="min-h-[48px] rounded-lg font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-lg dark:data-[state=active]:bg-slate-900" 
              data-testid="tab-preset-packages"
            >
              <Package className="h-5 w-5 mr-2" />
              Preset Packages
            </TabsTrigger>
            <TabsTrigger 
              value="custom" 
              className="min-h-[48px] rounded-lg font-semibold transition-all data-[state=active]:bg-[#d3b07d] data-[state=active]:text-white data-[state=active]:shadow-lg" 
              data-testid="tab-build-your-own"
            >
              <Wrench className="h-5 w-5 mr-2" />
              Build Your Own
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
                <Link href="/">
                  <Button variant="ghost" size="sm" className="min-h-[44px]" data-testid="button-home">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Home
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
                        className="cursor-pointer hover:border-primary transition-colors"
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
                        className="cursor-pointer hover:border-primary transition-colors"
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
                        className="cursor-pointer hover:border-primary transition-colors"
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
                        !item.isCustomBuild &&
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
                          className={`relative overflow-hidden ${isInCart ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}
                          data-testid={`package-${(isMiniSplit ? pkg.packageLevel : pkg.tonnage).toString().toLowerCase().replace('.', '-')}`}
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-4">
                              {/* Image */}
                              <div className="flex gap-3 flex-shrink-0">
                                {pkg.outdoorImageUrl && (
                                  <div className="text-center">
                                    <img 
                                      src={`/assets/${pkg.outdoorImageUrl}`}
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
                                      src={`/assets/${pkg.furnaceImageUrl}`}
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
                        !item.isCustomBuild &&
                        item.unitType === pkg.unitType && 
                        item.tier === pkg.tier && 
                        item.packageLevel === pkg.packageLevel &&
                        item.extractedTonnage === selectedTonnage
                      );
                      return (
                        <Card
                          key={`${pkg.packageLevel}-${pkg.outdoorModel}-${index}`}
                          className={`relative ${isInCart ? 'border-primary ring-1 ring-primary' : ''}`}
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
                                      src={`/assets/${pkg.outdoorImageUrl}`}
                                      alt={pkg.outdoorModel}
                                      className="w-16 h-16 object-contain rounded bg-white flex-shrink-0"
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
                                        src={`/assets/${pkg.coilImageUrl}`}
                                        alt={pkg.coilModel}
                                        className="w-16 h-16 object-contain rounded bg-white flex-shrink-0"
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
                                        src={`/assets/${pkg.furnaceImageUrl}`}
                                        alt={pkg.indoorHeatModel}
                                        className="w-16 h-16 object-contain rounded bg-white flex-shrink-0"
                                        loading="lazy"
                                      />
                                    )}
                                    <div className="flex-1">
                                      <p className="font-medium text-xs text-muted-foreground mb-1">
                                        {(pkg.unitType === 'PHP' || pkg.unitType === 'SHP') ? 'Heat Kit' : 'Indoor Unit / Furnace'}
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
                                        src={`/assets/${pkg.thermostatImageUrl}`}
                                        alt={pkg.thermostatModel}
                                        className="w-16 h-16 object-contain rounded bg-white flex-shrink-0"
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
                            
                            <Button
                              className="w-full min-h-[44px]"
                              onClick={() => addToCart(pkg)}
                              data-testid={`button-add-${pkg.packageLevel.toLowerCase()}`}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              Add to Proposal
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
                <Link href="/">
                  <Button variant="ghost" size="sm" className="min-h-[44px]" data-testid="button-home-custom">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Home
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
                  {["SGA", "SHP", "PHP", "GP", "Mini-Split", "Ducting"].map(type => {
                    const typeInfo = UNIT_TYPE_INFO[type];
                    const TypeIcon = typeInfo?.icon || Package;
                    return (
                      <Card
                        key={type}
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => setCustomEquipmentType(type)}
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
                      className="cursor-pointer hover:border-primary transition-colors"
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
                {/* Mini-Split and Ducting compact layout */}
                {(customEquipmentType === "Mini-Split" || customEquipmentType === "Ducting") ? (
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
                          !item.isCustomBuild &&
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
                                        src={`/assets/${pkg.outdoorImageUrl}`}
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
                                        src={`/assets/${pkg.furnaceImageUrl}`}
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
                        {customEquipmentType === "GP"
                          ? `${[selectedOutdoorUnit, selectedThermostat].filter(Boolean).length} / 2 components`
                          : customEquipmentType === "PHP"
                          ? `${[selectedOutdoorUnit, selectedCoil, selectedThermostat].filter(Boolean).length} / 3 components`
                          : `${[selectedOutdoorUnit, selectedCoil, selectedIndoorUnit, selectedThermostat].filter(Boolean).length} / 4 components`
                        }
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
                      {customEquipmentType === "GP"
                        ? "Please select all 2 required components to add this custom build to your proposal."
                        : customEquipmentType === "PHP"
                        ? "Please select all 3 required components to add this custom build to your proposal."
                        : "Please select all 4 required components to add this custom build to your proposal."
                      }
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

                  {/* SGA/SHP show coil/heater kit AND indoor unit */}
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
        </Tabs>

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
      </main>

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
            {/* Customer Search Section */}
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2">
                <Search className="h-4 w-4" />
                SEARCH CUSTOMER DATABASE
              </h3>
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
                      className="pl-10 pr-10"
                      data-testid="input-customer-search"
                    />
                    {isSearchingCustomers && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-4rem)] sm:w-[500px] p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="searchAll"
                        checked={searchAllFields}
                        onCheckedChange={(checked) => setSearchAllFields(checked === true)}
                      />
                      <label htmlFor="searchAll" className="text-xs text-muted-foreground cursor-pointer">
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
                    {customerSearchResults.map((customer) => (
                      <div
                        key={customer.id}
                        className="p-3 hover:bg-muted cursor-pointer border-b last:border-0"
                        onClick={() => handleSelectCustomer(customer)}
                        data-testid={`customer-result-${customer.id}`}
                      >
                        <p className="font-medium">{customer.displayName}</p>
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
              {selectedCustomer && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {selectedCustomer.displayName}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerName('');
                      setCustomerAddress('');
                    }}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>


            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                <Package className="h-4 w-4" />
                EQUIPMENT INCLUDED
              </h3>
              <div className="space-y-4">
                {cart.map((item, index) => {
                  if (item.isCustomBuild) {
                    const estimate = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat);
                    const priceLow = estimate.low * item.quantity;
                    const priceHigh = estimate.high * item.quantity;
                    const components = [
                      { label: 'Outdoor Unit', brand: item.outdoorUnit.brand, name: item.outdoorUnit.unitName, image: item.outdoorUnit.imageUrl },
                      { label: 'Evaporator Coil', brand: item.coil.brand, name: item.coil.unitName, image: item.coil.imageUrl },
                      { label: 'Indoor Unit', brand: item.indoorUnit.brand, name: item.indoorUnit.unitName, image: item.indoorUnit.imageUrl },
                      { label: 'Thermostat', brand: item.thermostat.brand, name: item.thermostat.unitName, image: item.thermostat.imageUrl },
                    ];
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
                                  <img src={`/assets/${comp.image}`} alt={comp.label} className="w-12 h-12 mx-auto object-contain mb-1" loading="lazy" />
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
                  } else {
                    const itemPrice = (parseFloat(item.totalInvestment) || 0) * item.quantity;
                    const monthlyPrice = (parseFloat(item.monthlyPayment) || 0) * item.quantity;
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
                    const indoorLabel = (item.unitType === 'PHP' || item.unitType === 'SHP') ? 'Heat Kit' : 'Indoor Unit';
                    const components = [
                      { label: 'Outdoor Unit', name: `${item.outdoorBrand} ${item.outdoorModel}`, image: item.outdoorImageUrl },
                      { label: 'Evaporator Coil', name: item.coilName || item.coilModel, image: item.coilImageUrl },
                      { label: indoorLabel, name: item.indoorHeatName || item.indoorHeatModel, image: item.furnaceImageUrl },
                      { label: 'Thermostat', name: item.thermostatName || item.thermostatModel, image: item.thermostatImageUrl },
                    ].filter(c => c.name);
                    return (
                      <div key={item.id} className={`rounded-xl border-2 bg-gradient-to-br overflow-hidden shadow-sm ${levelColors[item.packageLevel] || levelColors.Budget}`}>
                        <div className={`${headerColors[item.packageLevel] || headerColors.Budget} text-white px-4 py-2 flex items-center justify-between`}>
                          <div className="flex items-center gap-2">
                            <Award className="h-4 w-4" />
                            <span className="font-semibold">{item.packageLevel} Package</span>
                            <span className="opacity-70">•</span>
                            <span className="opacity-90">{item.extractedTonnage}</span>
                          </div>
                          {item.quantity > 1 && <Badge className="bg-white/20 text-white">x{item.quantity}</Badge>}
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="font-semibold text-lg">{UNIT_TYPE_INFO[item.unitType]?.name || item.unitType}</span>
                            <Badge variant="secondary" className="text-xs">{item.tier}</Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            {components.map((comp, i) => (
                              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center border border-gray-100 dark:border-gray-700">
                                {comp.image ? (
                                  <img src={`/assets/${comp.image}`} alt={comp.label} className="w-12 h-12 mx-auto object-contain mb-1" loading="lazy" />
                                ) : (
                                  <div className="w-12 h-12 mx-auto bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center mb-1">
                                    <Package className="h-6 w-6 text-gray-400" />
                                  </div>
                                )}
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{comp.label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="bg-primary/10 rounded-lg p-3 flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                              {formatPrice(monthlyPrice)}/mo financing
                            </div>
                            <p className="text-2xl font-bold text-primary">{formatPrice(itemPrice)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>

            <Separator className="my-6" />

            <div className="bg-muted rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatPriceRange(cartTotalRange.low, cartTotalRange.high)}</span>
              </div>
              {hasEstimatedItems && (
                <p className="text-xs text-muted-foreground mb-2">* Includes estimated pricing for custom builds</p>
              )}
              <Separator className="my-3" />
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">Total Investment</span>
                <span className="text-2xl font-bold text-primary">{formatPriceRange(cartTotalRange.low, cartTotalRange.high)}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-muted-foreground">Monthly Payment (with approved financing)</span>
                <span className="text-sm font-medium">{formatPriceRange(cartMonthlyTotalRange.low, cartMonthlyTotalRange.high)}/mo</span>
              </div>
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
                Thank you for considering GHVAC!
              </p>
            </div>
          </ScrollArea>
          
          <div className="border-t p-4 bg-card shrink-0 flex-none">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setQuoteDialogOpen(false)}
                className="flex-1 min-h-[44px]"
              >
                Close
              </Button>
              <Button
                onClick={copyQuoteToClipboard}
                className="flex-1 min-h-[44px]"
                data-testid="button-copy-quote"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
              <Button
                onClick={handleAcceptQuote}
                disabled={!selectedCustomer || acceptQuoteMutation.isPending}
                className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700"
                data-testid="button-accept-quote"
              >
                {acceptQuoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Accept Quote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
