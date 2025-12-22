import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, ChevronRight, ShoppingCart, Trash2, FileText, Copy, Package, Thermometer, Zap, Award, Filter, Wrench, CheckCircle2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import packagesData from "@assets/pricebook-packages.json";
import componentsData from "@assets/pricebook-components.json";

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
};

const TIER_INFO: Record<string, { description: string }> = {
  Essential: { description: "Standard efficiency, reliable performance" },
  Premium: { description: "High efficiency, enhanced features" },
  Ultimate: { description: "Top-tier efficiency, maximum comfort" },
};

const PACKAGE_LEVEL_ORDER = ["Best", "Better", "Good", "Budget"];

const TONNAGE_OPTIONS = ["1.5 Ton", "2 Ton", "2.5 Ton", "3 Ton", "3.5 Ton", "4 Ton", "5 Ton"];

const BRAND_OPTIONS = ["All Brands", "Trane", "Carrier", "RunTru", "Ameristar"];

const OUTDOOR_UNIT_TYPES = ["Air Conditioner", "Heat Pump"];
const INDOOR_UNIT_TYPES = ["Gas Furnace", "Air Handler"];

const formatPrice = (price: number) => '$' + price.toLocaleString();

function calculateCustomBuildEstimate(
  outdoorUnit: PricebookComponent | null,
  coil: PricebookComponent | null,
  indoorUnit: PricebookComponent | null,
  thermostat: PricebookComponent | null
): number {
  let total = 0;
  
  if (outdoorUnit) {
    if (outdoorUnit.sellingPrice) {
      total += outdoorUnit.sellingPrice;
    } else if (outdoorUnit.componentType === "Heat Pump") {
      total += 4500;
    } else {
      total += 3500;
    }
  }
  
  if (coil) {
    if (coil.sellingPrice) {
      total += coil.sellingPrice;
    } else {
      total += 800;
    }
  }
  
  if (indoorUnit) {
    if (indoorUnit.sellingPrice) {
      total += indoorUnit.sellingPrice;
    } else if (indoorUnit.componentType === "Air Handler") {
      total += 2000;
    } else {
      total += 1800;
    }
  }
  
  if (thermostat) {
    if (thermostat.sellingPrice) {
      total += thermostat.sellingPrice;
    } else if (thermostat.unitName.toLowerCase().includes('smart') || thermostat.unitName.toLowerCase().includes('wifi')) {
      total += 350;
    } else {
      total += 250;
    }
  }
  
  return total;
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
  const [customTonnage, setCustomTonnage] = useState<string | null>(null);
  const [selectedOutdoorUnit, setSelectedOutdoorUnit] = useState<PricebookComponent | null>(null);
  const [selectedCoil, setSelectedCoil] = useState<PricebookComponent | null>(null);
  const [selectedIndoorUnit, setSelectedIndoorUnit] = useState<PricebookComponent | null>(null);
  const [selectedThermostat, setSelectedThermostat] = useState<PricebookComponent | null>(null);
  const [outdoorBrandFilter, setOutdoorBrandFilter] = useState<string>("All Brands");
  const [coilBrandFilter, setCoilBrandFilter] = useState<string>("All Brands");
  const [indoorBrandFilter, setIndoorBrandFilter] = useState<string>("All Brands");
  const [thermostatBrandFilter, setThermostatBrandFilter] = useState<string>("All Brands");

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
      const tonnage = extractTonnageFromModel(pkg.outdoorModel);
      if (tonnage) tonnages.add(tonnage);
    });
    return Array.from(tonnages).sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      return numA - numB;
    });
  }, [selectedUnitType, selectedTier]);

  const packageOptions = useMemo(() => {
    if (!selectedUnitType || !selectedTier || !selectedTonnage) return [];
    
    const filtered = packages.filter(pkg => {
      if (pkg.unitType !== selectedUnitType || pkg.tier !== selectedTier) return false;
      const extracted = extractTonnageFromModel(pkg.outdoorModel);
      return extracted === selectedTonnage;
    });
    
    return filtered.sort((a, b) => {
      return PACKAGE_LEVEL_ORDER.indexOf(a.packageLevel) - PACKAGE_LEVEL_ORDER.indexOf(b.packageLevel);
    });
  }, [selectedUnitType, selectedTier, selectedTonnage]);

  // Filter outdoor units by tonnage (AC, Heat Pump have tonnage in model numbers) - dedupe by model
  const outdoorUnitOptions = useMemo(() => {
    if (!customTonnage) return [];
    const seen = new Set<string>();
    return components.filter(comp => {
      const compTonnage = extractTonnageFromModel(comp.model);
      const matchesTonnage = compTonnage === customTonnage;
      const matchesType = OUTDOOR_UNIT_TYPES.includes(comp.componentType);
      const matchesBrand = outdoorBrandFilter === "All Brands" || comp.brand === outdoorBrandFilter;
      if (!matchesTonnage || !matchesType || !matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, outdoorBrandFilter]);

  // Get unique coils (they're often universal, filter by brand only and dedupe by model)
  const coilOptions = useMemo(() => {
    if (!customTonnage) return [];
    const seen = new Set<string>();
    return components.filter(comp => {
      if (comp.componentType !== "Evaporator Coil") return false;
      const matchesBrand = coilBrandFilter === "All Brands" || comp.brand === coilBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, coilBrandFilter]);

  // Get unique indoor units (furnaces/air handlers, dedupe by model)
  const indoorUnitOptions = useMemo(() => {
    if (!customTonnage) return [];
    const seen = new Set<string>();
    return components.filter(comp => {
      if (!INDOOR_UNIT_TYPES.includes(comp.componentType)) return false;
      const matchesBrand = indoorBrandFilter === "All Brands" || comp.brand === indoorBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, indoorBrandFilter]);

  // Get unique thermostats (universal, dedupe by model)
  const thermostatOptions = useMemo(() => {
    if (!customTonnage) return [];
    const seen = new Set<string>();
    return components.filter(comp => {
      if (comp.componentType !== "Thermostat/Control") return false;
      const matchesBrand = thermostatBrandFilter === "All Brands" || comp.brand === thermostatBrandFilter;
      if (!matchesBrand) return false;
      if (seen.has(comp.model)) return false;
      seen.add(comp.model);
      return true;
    });
  }, [customTonnage, thermostatBrandFilter]);

  const isCustomBuildComplete = selectedOutdoorUnit && selectedCoil && selectedIndoorUnit && selectedThermostat && customTonnage;

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (item.isCustomBuild) {
        return sum + calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat) * item.quantity;
      } else {
        return sum + (parseFloat(item.totalInvestment) || 0) * item.quantity;
      }
    }, 0);
  }, [cart]);

  const cartMonthlyTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (item.isCustomBuild) {
        return sum + Math.round(calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat) / 67) * item.quantity;
      } else {
        return sum + (parseFloat(item.monthlyPayment) || 0) * item.quantity;
      }
    }, 0);
  }, [cart]);

  const hasEstimatedItems = useMemo(() => {
    return cart.some(item => item.isCustomBuild);
  }, [cart]);

  const currentStep = useMemo(() => {
    if (!selectedUnitType) return 1;
    if (!selectedTier) return hasSingleTier ? 2 : 2; // Will auto-select if single tier
    if (!selectedTonnage) return hasSingleTier ? 2 : 3;
    return hasSingleTier ? 3 : 4;
  }, [selectedUnitType, selectedTier, selectedTonnage, hasSingleTier]);

  const totalSteps = hasSingleTier ? 3 : 4;

  const customBuildStep = useMemo(() => {
    if (!customTonnage) return 1;
    return 2;
  }, [customTonnage]);

  const addToCart = (pkg: PricebookPackage) => {
    const extractedTonnage = selectedTonnage || extractTonnageFromModel(pkg.outdoorModel) || "Unknown";
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
    if (selectedTonnage) {
      setSelectedTonnage(null);
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
    }
  };

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
        const itemPrice = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat) * item.quantity;
        quoteText += `${index + 1}. Custom Build - ${item.tonnage} System\n`;
        quoteText += `   - ${item.outdoorUnit.brand} ${item.outdoorUnit.unitName}\n`;
        quoteText += `   - ${item.coil.brand} ${item.coil.unitName}\n`;
        quoteText += `   - ${item.indoorUnit.brand} ${item.indoorUnit.unitName}\n`;
        quoteText += `   - ${item.thermostat.brand} ${item.thermostat.unitName}\n`;
        quoteText += `   Price: ${formatPrice(itemPrice)} (Estimated)\n`;
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
    quoteText += `TOTAL INVESTMENT: ${formatPrice(cartTotal)}${hasEstimatedItems ? ' *' : ''}\n`;
    quoteText += `Monthly Payment: ${formatPrice(cartMonthlyTotal)}/mo (with approved financing)\n`;
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
        <div className="flex items-start justify-between gap-2">
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
                  { label: "Service Quote", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation", path: "/installation" },
                  { label: "Proposal Builder", path: "/proposal" },
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
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className="bg-green-500 text-white text-xs">
                                      <Wrench className="h-3 w-3 mr-1" />
                                      Custom Build
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      x{item.quantity}
                                    </Badge>
                                  </div>
                                  <p className="font-medium text-sm">{item.tonnage} System</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.outdoorUnit.brand} {item.outdoorUnit.componentType}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.indoorUnit.brand} {item.indoorUnit.componentType}
                                  </p>
                                  <div className="mt-2 pt-2 border-t">
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-xs">Est.</Badge>
                                      <span className="font-bold text-sm text-primary">
                                        {formatPrice(calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat) * item.quantity)}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className={`${getPackageLevelColor(item.packageLevel)} text-white text-xs`}>
                                      {item.packageLevel}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      x{item.quantity}
                                    </Badge>
                                  </div>
                                  <p className="font-medium text-sm">
                                    {UNIT_TYPE_INFO[item.unitType]?.name || item.unitType}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.tier} • {item.extractedTonnage}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {item.outdoorBrand} {item.outdoorModel}
                                  </p>
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
                              className="h-8 w-8 text-destructive"
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
                    <div className="space-y-2">
                      <Input
                        placeholder="Customer Name (optional)"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="h-10"
                        data-testid="input-customer-name"
                      />
                      <Input
                        placeholder="Address (optional)"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        className="h-10"
                        data-testid="input-customer-address"
                      />
                      <Textarea
                        placeholder="Notes (optional)"
                        value={customerNotes}
                        onChange={(e) => setCustomerNotes(e.target.value)}
                        className="min-h-[60px] resize-none"
                        data-testid="input-customer-notes"
                      />
                    </div>
                    <Separator />
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

            {((currentStep === 3 && !hasSingleTier) || (currentStep === 2 && hasSingleTier)) && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Select Tonnage</h2>
                <p className="text-muted-foreground mb-4">Choose the system capacity</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {tonnagesForSelection.map(tonnage => (
                    <Card
                      key={tonnage}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => setSelectedTonnage(tonnage)}
                      data-testid={`tonnage-${tonnage.replace(' ', '-').toLowerCase()}`}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                          {tonnage}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {parseInt(tonnage) * 12000} BTU
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {((currentStep === 4 && !hasSingleTier) || (currentStep === 3 && hasSingleTier)) && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Select Package</h2>
                <p className="text-muted-foreground mb-4">
                  Choose from available {selectedTier} packages for {selectedTonnage}
                </p>
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
                              <p className="font-medium text-xs text-muted-foreground mb-1">Outdoor Unit</p>
                              <p className="font-medium">{pkg.outdoorBrand} {pkg.outdoorModel}</p>
                              <p className="text-muted-foreground text-xs">{pkg.outdoorName}</p>
                            </div>
                            
                            {pkg.coilModel && (
                              <div className="p-2 bg-muted rounded-md">
                                <p className="font-medium text-xs text-muted-foreground mb-1">Evaporator Coil</p>
                                <p className="font-medium">{pkg.coilModel}</p>
                                <p className="text-muted-foreground text-xs">{pkg.coilName}</p>
                              </div>
                            )}
                            
                            {pkg.indoorHeatModel && (
                              <div className="p-2 bg-muted rounded-md">
                                <p className="font-medium text-xs text-muted-foreground mb-1">Indoor Unit / Furnace</p>
                                <p className="font-medium">{pkg.indoorHeatModel}</p>
                                <p className="text-muted-foreground text-xs">{pkg.indoorHeatName}</p>
                              </div>
                            )}
                            
                            {pkg.thermostatModel && (
                              <div className="p-2 bg-muted rounded-md">
                                <p className="font-medium text-xs text-muted-foreground mb-1">Thermostat</p>
                                <p className="font-medium">{pkg.thermostatModel}</p>
                                <p className="text-muted-foreground text-xs">{pkg.thermostatName}</p>
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
                <span className="font-medium">Step {customBuildStep} of 2</span>
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
                <h2 className="text-xl font-semibold mb-2">Select System Size</h2>
                <p className="text-muted-foreground mb-4">Choose the tonnage for your custom build</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {TONNAGE_OPTIONS.map(tonnage => (
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
              </div>
            )}

            {customBuildStep === 2 && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-semibold">Build Your {customTonnage} System</h2>
                    <p className="text-muted-foreground">Select one component from each category</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Badge variant="outline" className="text-xs">Estimated</Badge>
                        <span className="text-xl font-bold text-primary">
                          {formatPrice(calculateCustomBuildEstimate(selectedOutdoorUnit, selectedCoil, selectedIndoorUnit, selectedThermostat))}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[selectedOutdoorUnit, selectedCoil, selectedIndoorUnit, selectedThermostat].filter(Boolean).length} / 4 components
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
                      Please select all 4 required components to add this custom build to your proposal.
                    </p>
                  </div>
                )}

                <ScrollArea className="h-[calc(100vh-300px)]">
                  {renderComponentSection(
                    "Outdoor Unit",
                    outdoorUnitOptions,
                    selectedOutdoorUnit,
                    setSelectedOutdoorUnit,
                    outdoorBrandFilter,
                    setOutdoorBrandFilter,
                    "outdoor"
                  )}

                  <div className="my-6 flex items-center gap-3">
                    <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                    <span className="text-[#d3b07d] text-xs font-medium uppercase tracking-wider">Next Component</span>
                    <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[#d3b07d] to-transparent rounded-full" />
                  </div>

                  {renderComponentSection(
                    "Evaporator Coil",
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

        {cart.length > 0 && !cartOpen && activeTab === "custom" && customBuildStep === 1 && (
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
        <DialogContent className="sm:max-w-3xl max-h-[95vh] p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-red-700 to-red-800 text-white p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={redlogo}
                  alt="GHVAC"
                  className="h-10 sm:h-12 w-auto bg-white rounded-md p-1"
                />
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold">GHVAC Tools</h1>
                  <p className="text-sm text-red-100">Equipment Proposal</p>
                </div>
              </div>
              <Badge className="bg-white/20 text-white border-white/30">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="max-h-[calc(95vh-200px)] p-4 sm:p-6">
            {(customerName || customerAddress) && (
              <div className="mb-6 p-4 bg-muted rounded-lg">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">PREPARED FOR</h3>
                {customerName && <p className="font-medium text-lg">{customerName}</p>}
                {customerAddress && <p className="text-muted-foreground">{customerAddress}</p>}
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">EQUIPMENT SUMMARY</h3>
              <div className="space-y-3">
                {cart.map((item, index) => {
                  if (item.isCustomBuild) {
                    const itemPrice = calculateCustomBuildEstimate(item.outdoorUnit, item.coil, item.indoorUnit, item.thermostat) * item.quantity;
                    return (
                      <div key={item.id} className="border rounded-lg p-4 bg-card">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-green-500 text-white text-xs">
                                <Wrench className="h-3 w-3 mr-1" />
                                Custom Build
                              </Badge>
                              <span className="text-sm text-muted-foreground">{item.tonnage}</span>
                              {item.quantity > 1 && <Badge variant="outline">x{item.quantity}</Badge>}
                            </div>
                            <div className="text-sm space-y-1 text-muted-foreground">
                              <p>• {item.outdoorUnit.brand} {item.outdoorUnit.unitName}</p>
                              <p>• {item.coil.brand} {item.coil.unitName}</p>
                              <p>• {item.indoorUnit.brand} {item.indoorUnit.unitName}</p>
                              <p>• {item.thermostat.brand} {item.thermostat.unitName}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="mb-1 text-xs">Estimated</Badge>
                            <p className="text-xl font-bold text-primary">{formatPrice(itemPrice)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const itemPrice = (parseFloat(item.totalInvestment) || 0) * item.quantity;
                    const monthlyPrice = (parseFloat(item.monthlyPayment) || 0) * item.quantity;
                    return (
                      <div key={item.id} className="border rounded-lg p-4 bg-card">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={`${getPackageLevelColor(item.packageLevel)} text-white text-xs`}>
                                {item.packageLevel}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{item.extractedTonnage}</span>
                              {item.quantity > 1 && <Badge variant="outline">x{item.quantity}</Badge>}
                            </div>
                            <p className="font-medium">{UNIT_TYPE_INFO[item.unitType]?.name || item.unitType}</p>
                            <p className="text-sm text-muted-foreground">{item.tier} Tier</p>
                            <div className="text-sm space-y-1 text-muted-foreground mt-2">
                              <p>• {item.outdoorBrand} {item.outdoorName}</p>
                              {item.indoorHeatName && <p>• {item.indoorHeatName}</p>}
                              {item.thermostatName && <p>• {item.thermostatName}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-primary">{formatPrice(itemPrice)}</p>
                            <p className="text-sm text-muted-foreground">{formatPrice(monthlyPrice)}/mo</p>
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
                <span className="font-medium">{formatPrice(cartTotal)}</span>
              </div>
              {hasEstimatedItems && (
                <p className="text-xs text-muted-foreground mb-2">* Includes estimated pricing for custom builds</p>
              )}
              <Separator className="my-3" />
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">Total Investment</span>
                <span className="text-2xl font-bold text-primary">{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-muted-foreground">Monthly Payment (with approved financing)</span>
                <span className="text-sm font-medium">{formatPrice(cartMonthlyTotal)}/mo</span>
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
          
          <div className="border-t p-4 bg-card">
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
