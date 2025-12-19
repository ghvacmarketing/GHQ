import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, ChevronRight, ShoppingCart, Trash2, FileText, Copy, Package, Thermometer, Zap, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import packagesData from "@assets/pricebook-packages.json";

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

type CartPackage = PricebookPackage & {
  id: string;
  extractedTonnage: string;
  quantity: number;
};

const packages: PricebookPackage[] = packagesData as PricebookPackage[];

const UNIT_TYPE_INFO: Record<string, { name: string; description: string; icon: typeof Package }> = {
  SGA: { name: "Air Conditioner + Gas Furnace", description: "Split Gas Air system for heating and cooling", icon: Thermometer },
  SHP: { name: "Heat Pump System", description: "All-electric heating and cooling solution", icon: Zap },
  STA: { name: "Heat Pump + Gas Furnace", description: "Dual fuel system for maximum efficiency", icon: Award },
};

const TIER_INFO: Record<string, { description: string }> = {
  Essential: { description: "Standard efficiency, reliable performance" },
  Premium: { description: "High efficiency, enhanced features" },
  Ultimate: { description: "Top-tier efficiency, maximum comfort" },
};

const PACKAGE_LEVEL_ORDER = ["Budget", "Good", "Better", "Best"];

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

function loadCartFromStorage(): CartPackage[] {
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
  const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedTonnage, setSelectedTonnage] = useState<string | null>(null);
  const [cart, setCart] = useState<CartPackage[]>(() => loadCartFromStorage());
  const [cartOpen, setCartOpen] = useState(false);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState(() => loadCustomerFromStorage().name);
  const [customerAddress, setCustomerAddress] = useState(() => loadCustomerFromStorage().address);
  const [customerNotes, setCustomerNotes] = useState(() => loadCustomerFromStorage().notes);
  const [generatedQuote, setGeneratedQuote] = useState<string | null>(null);

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

  const unitTypes = useMemo(() => {
    return Array.from(new Set(packages.map(p => p.unitType)));
  }, []);

  const tiersForUnitType = useMemo(() => {
    if (!selectedUnitType) return [];
    return Array.from(new Set(packages.filter(p => p.unitType === selectedUnitType).map(p => p.tier)));
  }, [selectedUnitType]);

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
    const tonnageCode = selectedTonnage.replace(" Ton", "").padStart(2, "0") + (selectedTonnage === "2 Ton" ? "4" : selectedTonnage === "3 Ton" ? "6" : selectedTonnage === "4 Ton" ? "8" : "0");
    const tonnagePattern = selectedTonnage === "2 Ton" ? "024" : selectedTonnage === "3 Ton" ? "036" : selectedTonnage === "4 Ton" ? "048" : "060";
    
    const filtered = packages.filter(pkg => {
      if (pkg.unitType !== selectedUnitType || pkg.tier !== selectedTier) return false;
      const extracted = extractTonnageFromModel(pkg.outdoorModel);
      return extracted === selectedTonnage;
    });
    
    return filtered.sort((a, b) => {
      return PACKAGE_LEVEL_ORDER.indexOf(a.packageLevel) - PACKAGE_LEVEL_ORDER.indexOf(b.packageLevel);
    });
  }, [selectedUnitType, selectedTier, selectedTonnage]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const currentStep = useMemo(() => {
    if (!selectedUnitType) return 1;
    if (!selectedTier) return 2;
    if (!selectedTonnage) return 3;
    return 4;
  }, [selectedUnitType, selectedTier, selectedTonnage]);

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
      return [...prev, { ...pkg, id, extractedTonnage, quantity: 1 }];
    });

    toast({
      title: "Added to Proposal",
      description: `${pkg.outdoorBrand} ${pkg.packageLevel} package added.`,
    });
  };

  const removeFromCart = (packageId: string) => {
    setCart(prev => prev.filter(item => item.id !== packageId));
  };

  const handleBack = () => {
    if (selectedTonnage) {
      setSelectedTonnage(null);
    } else if (selectedTier) {
      setSelectedTier(null);
    } else if (selectedUnitType) {
      setSelectedUnitType(null);
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

    let quoteText = `GIESBRECHT HVAC - EQUIPMENT PROPOSAL\n`;
    quoteText += `${'='.repeat(50)}\n\n`;
    quoteText += `Date: ${date}\n`;
    if (customerName) quoteText += `Customer: ${customerName}\n`;
    if (customerAddress) quoteText += `Address: ${customerAddress}\n`;
    quoteText += `\n${'-'.repeat(50)}\n`;
    quoteText += `PACKAGES SELECTED:\n`;
    quoteText += `${'-'.repeat(50)}\n\n`;

    cart.forEach((item, index) => {
      const unitTypeName = UNIT_TYPE_INFO[item.unitType]?.name || item.unitType;
      quoteText += `${index + 1}. ${item.packageLevel.toUpperCase()} PACKAGE\n`;
      quoteText += `   System: ${unitTypeName}\n`;
      quoteText += `   Tier: ${item.tier} | Size: ${item.extractedTonnage}\n`;
      quoteText += `   Qty: ${item.quantity}\n\n`;
      quoteText += `   COMPONENTS:\n`;
      quoteText += `   • Outdoor Unit: ${item.outdoorBrand} ${item.outdoorModel}\n`;
      quoteText += `     ${item.outdoorName}\n`;
      if (item.coilModel) {
        quoteText += `   • Evaporator Coil: ${item.coilModel}\n`;
        quoteText += `     ${item.coilName}\n`;
      }
      if (item.indoorHeatModel) {
        quoteText += `   • Indoor Unit: ${item.indoorHeatModel}\n`;
        quoteText += `     ${item.indoorHeatName}\n`;
      }
      if (item.thermostatModel) {
        quoteText += `   • Thermostat: ${item.thermostatModel}\n`;
        quoteText += `     ${item.thermostatName}\n`;
      }
      quoteText += `\n`;
    });

    quoteText += `${'-'.repeat(50)}\n`;
    quoteText += `SUMMARY:\n`;
    quoteText += `${'-'.repeat(50)}\n`;
    quoteText += `Total Packages: ${cartItemCount}\n`;
    quoteText += `\n`;
    quoteText += `* Pricing to be calculated using Quote Generator\n`;

    if (customerNotes) {
      quoteText += `\n${'-'.repeat(50)}\n`;
      quoteText += `NOTES:\n`;
      quoteText += `${'-'.repeat(50)}\n`;
      quoteText += `${customerNotes}\n`;
    }

    quoteText += `\n${'-'.repeat(50)}\n`;
    quoteText += `This is an informal proposal.\n`;
    quoteText += `Contact us for a formal quote with pricing.\n`;
    quoteText += `\n`;
    quoteText += `Thank you for choosing Giesbrecht HVAC!\n`;

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
                  { label: "Quote Generator", path: "/quote" },
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
                    <p className="text-xs text-muted-foreground text-center">
                      Pricing to be calculated using Quote Generator
                    </p>
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
            <span className="font-medium">Step {currentStep} of 4</span>
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

        {currentStep === 2 && (
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

        {currentStep === 3 && (
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

        {currentStep === 4 && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Select Package</h2>
            <p className="text-muted-foreground mb-4">
              Choose from available {selectedTier} packages for {selectedTonnage}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {packageOptions.map((pkg, index) => {
                const isInCart = cart.some(item => 
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
                      <div className="flex items-center gap-2">
                        <Badge className={`${getPackageLevelColor(pkg.packageLevel)} text-white`}>
                          {pkg.packageLevel}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{pkg.outdoorBrand}</span>
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

        {cart.length > 0 && !cartOpen && (
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
      </main>

      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Equipment Proposal
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs sm:text-sm whitespace-pre-wrap font-mono bg-muted p-4 rounded-lg">
              {generatedQuote}
            </pre>
          </ScrollArea>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setQuoteDialogOpen(false)}
              className="w-full sm:w-auto min-h-[44px]"
            >
              Close
            </Button>
            <Button
              onClick={copyQuoteToClipboard}
              className="w-full sm:w-auto min-h-[44px]"
              data-testid="button-copy-quote"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
