import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CheckCircle,
  Plus,
  Trash2,
  Loader2,
  Search,
  User,
  Package,
  Wrench,
  Save,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { calcWorksheet, type WorksheetInputs, type WorksheetLine } from "@shared/calcWorksheet";
import type { CrmUser, CrmCustomer, QuotePart } from "@shared/schema";
import PartsSelection from "@/components/parts-selection";
import SelectedParts from "@/components/selected-parts";
import WarrantySection from "@/components/warranty-section";
import CustomPartModal from "@/components/custom-part-modal";

type InstallSubtype = "residential" | "commercial" | "crawlspace";
type LineCategory = "equipment" | "materials" | "accessories" | "subcontractor" | "permit" | "spiff" | "other";

const INSTALL_SUBTYPES: { value: InstallSubtype; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "crawlspace", label: "Crawlspace" },
];

const LINE_CATEGORIES: { value: LineCategory; label: string }[] = [
  { value: "equipment", label: "Equipment" },
  { value: "materials", label: "Materials" },
  { value: "accessories", label: "Accessories" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "permit", label: "Permit" },
  { value: "spiff", label: "Spiff" },
  { value: "other", label: "Other" },
];

interface LocalLine {
  id: string;
  category: LineCategory;
  description: string;
  cost: number;
}

const defaultInputs: WorksheetInputs = {
  hoursToInstall: 8,
  topManHourlyRate: 35,
  laborBenefitsPct: 0.40,
  overheadPct: 0.25,
  profitPct: 0.10,
  financingPct: 0.03,
  commissionPct: 0.03,
  warrantyReserveDollar: 25,
  crewDayHours: 16,
  discountDollar: 0,
};

type PricingMode = "install" | "service";

export default function CrmInstallWorksheet() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [pricingMode, setPricingMode] = useState<PricingMode>("install");
  const [inputs, setInputs] = useState<WorksheetInputs>(defaultInputs);
  const [installSubtype, setInstallSubtype] = useState<InstallSubtype>("residential");
  const [lines, setLines] = useState<LocalLine[]>([]);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);

  const [serviceParts, setServiceParts] = useState<QuotePart[]>([]);
  const [serviceLaborHours, setServiceLaborHours] = useState<string>("");
  const [serviceGhvacInstalled, setServiceGhvacInstalled] = useState<boolean | undefined>(undefined);
  const [serviceYearsSinceInstallation, setServiceYearsSinceInstallation] = useState<string>("");
  const [serviceJobNotes, setServiceJobNotes] = useState<string>("");
  const [serviceValidationErrors, setServiceValidationErrors] = useState<string[]>([]);
  const [isCustomPartModalOpen, setIsCustomPartModalOpen] = useState(false);
  const [customPartPrefillData, setCustomPartPrefillData] = useState<any>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: initialData, isLoading: isLoadingInitialData, isError: isErrorInitialData } = useQuery({
    queryKey: ["/api/initial-data"],
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: pricingMode === "service",
  });
  const serviceSettings = (initialData as any)?.settings;
  const availableParts = (initialData as any)?.parts || [];

  const { data: searchResults, isLoading: searchLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", "search", customerSearch],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(customerSearch)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search customers");
      const data = await res.json();
      return data.customers || [];
    },
    enabled: showCustomerModal && customerSearch.length >= 2,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const finalizeMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      installSubtype: string;
      inputs: WorksheetInputs;
      lines: Array<{ category: string; description: string; cost: number }>;
    }) => {
      const res = await apiRequest("POST", "/api/crm/quotes/from-worksheet", data);
      return res.json();
    },
    onSuccess: (data: { quoteId: string }) => {
      toast({ title: "Quote created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      navigate(`/crm/quotes/${data.quoteId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating quote", description: error.message, variant: "destructive" });
    },
  });

  const saveServiceQuoteMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      title: string;
      description?: string;
      notes?: string;
      lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        taxable?: boolean;
      }>;
      status?: string;
      quoteType: string;
      serviceQuoteData?: object;
    }) => {
      const res = await apiRequest("POST", "/api/crm/quotes/from-proposal", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Service Quote Saved!",
        description: `Quote ${data.quote?.quoteNumber || ''} created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setServiceParts([]);
      setServiceLaborHours("");
      setServiceGhvacInstalled(undefined);
      setServiceYearsSinceInstallation("");
      setServiceJobNotes("");
      setSelectedCustomer(null);
      setShowCustomerModal(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save service quote. Please try again.",
        variant: "destructive",
      });
      console.error("Save service quote error:", error);
    },
  });

  const calculateServiceTotals = useMemo(() => {
    if (isLoadingInitialData) return null;
    if (!serviceSettings || 
        serviceSettings.laborRate === undefined ||
        serviceSettings.laborBenefitsPercent === undefined ||
        serviceSettings.salesTaxPercent === undefined ||
        serviceSettings.warrantyReserve === undefined ||
        serviceSettings.materialShrinkagePercent === undefined ||
        serviceSettings.overheadPercent === undefined ||
        serviceSettings.profitPercent === undefined ||
        serviceSettings.financingPromotionPercent === undefined ||
        serviceSettings.commissionPercent === undefined ||
        !serviceSettings.warrantyDiscounts) {
      return null;
    }
    
    if (!serviceParts.length && !serviceLaborHours) return null;

    const isGHVACWarranty = serviceGhvacInstalled === true && serviceYearsSinceInstallation;
    const warrantyYears = isGHVACWarranty ? parseInt(serviceYearsSinceInstallation!) : 0;
    const warrantyCoverage = serviceSettings.warrantyDiscounts;
    const warrantyCoveragePercent = isGHVACWarranty ? (warrantyCoverage[warrantyYears] || 0) : 0;

    let customerPartsCost = 0;
    let ghvacCoveredPartsCost = 0;
    
    serviceParts.forEach(part => {
      const partCost = parseFloat(part.price) * (part.quantity || 1);
      const description = part.description.toLowerCase();
      
      const isGHVACCovered = isGHVACWarranty && (
        description.includes('control board') ||
        description.includes('evaporator coil') ||
        description.includes('evap coil') ||
        description.includes('compressor')
      );
      
      if (isGHVACCovered) {
        ghvacCoveredPartsCost += partCost;
      } else {
        customerPartsCost += partCost;
      }
    });

    const materialShrinkagePercent = serviceSettings.materialShrinkagePercent;
    const shrinkageMaterials = ['refrigerant filter dryer', 'copper', 'armaflex insulation', 'acid away'];
    
    const shrinkagePartsTotal = serviceParts.reduce((sum, part) => {
      const description = part.description.toLowerCase();
      const isShrinkageMaterial = shrinkageMaterials.some(material => 
        description.includes(material)
      );
      
      const isGHVACCovered = isGHVACWarranty && (
        description.includes('control board') ||
        description.includes('evaporator coil') ||
        description.includes('evap coil') ||
        description.includes('compressor')
      );
      
      if (isShrinkageMaterial && !isGHVACCovered) {
        const partCost = parseFloat(part.price) * (part.quantity || 1);
        return sum + partCost;
      }
      return sum;
    }, 0);
    
    const materialShrinkageCost = shrinkagePartsTotal * materialShrinkagePercent;
    
    const hours = parseFloat(serviceLaborHours || "1");
    const laborRate = serviceSettings.laborRate;
    const baseLaborCost = laborRate * hours;
    
    const laborBenefitsPercent = serviceSettings.laborBenefitsPercent;
    const salesTaxPercent = serviceSettings.salesTaxPercent;
    const warrantyReserve = serviceSettings.warrantyReserve;
    const overheadPercent = serviceSettings.overheadPercent;
    const profitPercent = serviceSettings.profitPercent;
    const financingPercent = serviceSettings.financingPromotionPercent;
    const commissionPercent = serviceSettings.commissionPercent;
    
    const laborBenefits = baseLaborCost * laborBenefitsPercent;
    const totalLaborCost = baseLaborCost + laborBenefits;
    
    const allPartsSubtotal = customerPartsCost + ghvacCoveredPartsCost;
    const allPartsWithShrinkage = allPartsSubtotal + materialShrinkageCost;
    const fullSalesTax = allPartsWithShrinkage * salesTaxPercent;
    const fullDirectCost = allPartsWithShrinkage + totalLaborCost + fullSalesTax + warrantyReserve;
    const totalDeductionRate = overheadPercent + profitPercent + financingPercent + commissionPercent;
    const remainingRate = 1.0 - totalDeductionRate;
    const fullSellingPrice = fullDirectCost / remainingRate;
    
    const customerPartsWithShrinkage = customerPartsCost + materialShrinkageCost;
    const customerSalesTax = customerPartsWithShrinkage * salesTaxPercent;
    const customerDirectCost = customerPartsWithShrinkage + totalLaborCost + customerSalesTax + warrantyReserve;
    const customerSellingPrice = customerDirectCost / remainingRate;
    
    let customerTotal = fullSellingPrice;
    let priceBeforeWarranty = fullSellingPrice;
    
    if (isGHVACWarranty && warrantyCoveragePercent > 0) {
      customerTotal = customerSellingPrice * warrantyCoveragePercent;
      priceBeforeWarranty = customerSellingPrice;
    }
    
    const overhead = fullDirectCost * overheadPercent;
    const profit = fullDirectCost * profitPercent;
    const financingCost = fullDirectCost * financingPercent;
    const commission = fullDirectCost * commissionPercent;

    return {
      partsSubtotal: allPartsSubtotal.toFixed(2),
      ghvacCoveredParts: ghvacCoveredPartsCost.toFixed(2),
      materialShrinkage: materialShrinkageCost.toFixed(2),
      adjustedPartsTotal: allPartsWithShrinkage.toFixed(2),
      baseLaborCost: baseLaborCost.toFixed(2),
      laborBenefits: laborBenefits.toFixed(2),
      totalLaborCost: totalLaborCost.toFixed(2),
      salesTax: fullSalesTax.toFixed(2),
      warrantyReserve: warrantyReserve.toFixed(2),
      directCost: fullDirectCost.toFixed(2),
      overhead: overhead.toFixed(2),
      profit: profit.toFixed(2),
      financingCost: financingCost.toFixed(2),
      commission: commission.toFixed(2),
      fullSellingPrice: fullSellingPrice.toFixed(2),
      priceBeforeWarranty: priceBeforeWarranty.toFixed(2),
      warrantyCoverage: warrantyCoveragePercent,
      total: customerTotal.toFixed(2),
      isGHVACWarranty: Boolean(isGHVACWarranty),
      subtotal: allPartsSubtotal.toFixed(2),
      labor: baseLaborCost.toFixed(2),
      tax: fullSalesTax.toFixed(2),
    };
  }, [serviceParts, serviceLaborHours, serviceGhvacInstalled, serviceYearsSinceInstallation, serviceSettings, isLoadingInitialData]);

  const handleUpdateServiceParts = (updates: { parts: QuotePart[] }) => {
    setServiceParts(updates.parts);
  };

  const handleAddCustomPart = (partData: { description: string; partNumber?: string; price: string; quantity: number }) => {
    const newPart: QuotePart = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description: partData.description,
      partNumber: partData.partNumber || '',
      price: partData.price,
      quantity: partData.quantity,
    };
    setServiceParts(prev => [...prev, newPart]);
    setIsCustomPartModalOpen(false);
    setCustomPartPrefillData(null);
  };

  const handleSaveServiceQuote = () => {
    const errors: string[] = [];
    
    if (!selectedCustomer) errors.push('customer');
    if (serviceParts.length === 0) errors.push('parts');
    if (serviceGhvacInstalled === undefined) errors.push('warranty');
    if (!serviceLaborHours) errors.push('laborHours');
    
    if (errors.length > 0) {
      setServiceValidationErrors(errors);
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    setServiceValidationErrors([]);
    
    if (!calculateServiceTotals) {
      toast({
        title: "Error",
        description: "Unable to calculate totals. Please check settings.",
        variant: "destructive",
      });
      return;
    }

    const lineItems = serviceParts.map(part => ({
      description: part.description + (part.partNumber ? ` (${part.partNumber})` : ''),
      quantity: part.quantity || 1,
      unitPrice: parseFloat(part.price),
      taxable: true,
    }));

    const laborHours = parseFloat(serviceLaborHours);
    const laborRate = serviceSettings?.laborRate || 0;
    lineItems.push({
      description: `Labor (${laborHours} hours @ $${laborRate}/hr)`,
      quantity: 1,
      unitPrice: parseFloat(calculateServiceTotals.totalLaborCost || "0"),
      taxable: false,
    });

    saveServiceQuoteMutation.mutate({
      customerId: selectedCustomer.id,
      title: "Service Quote",
      description: serviceJobNotes || undefined,
      notes: serviceJobNotes || undefined,
      lineItems,
      status: "draft",
      quoteType: "service",
      serviceQuoteData: {
        parts: serviceParts,
        laborHours: serviceLaborHours,
        ghvacInstalled: serviceGhvacInstalled,
        yearsSinceInstallation: serviceYearsSinceInstallation,
        jobNotes: serviceJobNotes,
        totals: calculateServiceTotals,
      },
    });
  };

  const handleServiceFinalizeClick = () => {
    if (serviceParts.length === 0) {
      toast({ title: "No parts", description: "Add at least one part before creating a quote", variant: "destructive" });
      return;
    }
    if (!serviceLaborHours) {
      toast({ title: "Missing labor hours", description: "Enter labor hours before creating a quote", variant: "destructive" });
      return;
    }
    if (serviceGhvacInstalled === undefined) {
      toast({ title: "Missing warranty info", description: "Select GHVAC warranty status", variant: "destructive" });
      return;
    }
    setShowCustomerModal(true);
  };

  const handleFinalizeClick = () => {
    if (lines.length === 0) {
      toast({ title: "No line items", description: "Add at least one line item before creating a quote", variant: "destructive" });
      return;
    }
    setShowCustomerModal(true);
  };

  const handleCreateQuote = () => {
    if (!selectedCustomer) {
      toast({ title: "Select a customer", description: "Please search and select a customer", variant: "destructive" });
      return;
    }

    finalizeMutation.mutate({
      customerId: selectedCustomer.id,
      installSubtype,
      inputs,
      lines: lines.map((l) => ({
        category: l.category,
        description: l.description,
        cost: l.cost,
      })),
    });
  };

  const updateInput = <K extends keyof WorksheetInputs>(key: K, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        category: "equipment",
        description: "",
        cost: 0,
      },
    ]);
  };

  const updateLine = (id: string, field: keyof LocalLine, value: string | number | boolean) => {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, [field]: value } : line))
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const worksheetLines: WorksheetLine[] = lines.map((l) => ({
    cost: l.cost,
  }));

  const calcs = calcWorksheet(inputs, worksheetLines);

  const linesByCategory = LINE_CATEGORIES.map((cat) => ({
    category: cat,
    items: lines.filter((l) => l.category === cat.value),
  })).filter((group) => group.items.length > 0);

  const isFinalizing = finalizeMutation.isPending;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const formatCurrency = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/crm/quotes/new")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
                Custom Pricing
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {pricingMode === "install" 
                  ? "Calculate install pricing with labor, materials, and margins"
                  : "Calculate service pricing with parts, labor, and warranty"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs value={pricingMode} onValueChange={(v) => setPricingMode(v as PricingMode)} className="w-auto">
              <TabsList className="grid w-full grid-cols-2 h-10">
                <TabsTrigger 
                  value="install" 
                  className="px-4 data-[state=active]:bg-[#711419] data-[state=active]:text-white"
                  data-testid="toggle-install-mode"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Install
                </TabsTrigger>
                <TabsTrigger 
                  value="service" 
                  className="px-4 data-[state=active]:bg-[#711419] data-[state=active]:text-white"
                  data-testid="toggle-service-mode"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Service
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {pricingMode === "install" && (
              <Button
                className="bg-[#d3b07d] hover:bg-[#c4a06e] text-white"
                onClick={handleFinalizeClick}
                disabled={isFinalizing || lines.length === 0}
                data-testid="button-finalize"
              >
                {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Finalize → Create Quote
              </Button>
            )}
            {pricingMode === "service" && (
              <Button
                className="bg-[#711419] hover:bg-[#8a1a20] text-white"
                onClick={handleServiceFinalizeClick}
                disabled={saveServiceQuoteMutation.isPending || serviceParts.length === 0}
                data-testid="button-finalize-service"
              >
                {saveServiceQuoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Finalize → Create Quote
              </Button>
            )}
          </div>
        </div>

        {pricingMode === "install" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hoursToInstall">Hours to Install</Label>
                <Input
                  id="hoursToInstall"
                  type="number"
                  step="0.5"
                  min="0"
                  value={inputs.hoursToInstall}
                  onChange={(e) => updateInput("hoursToInstall", parseFloat(e.target.value) || 0)}
                  data-testid="input-hours-to-install"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topManHourlyRate">Top Man Hourly Rate ($)</Label>
                <Input
                  id="topManHourlyRate"
                  type="number"
                  step="1"
                  min="0"
                  value={inputs.topManHourlyRate}
                  onChange={(e) => updateInput("topManHourlyRate", parseFloat(e.target.value) || 0)}
                  data-testid="input-top-man-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="laborBenefitsPct">Labor Benefits (%)</Label>
                <Input
                  id="laborBenefitsPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.laborBenefitsPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("laborBenefitsPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-labor-benefits"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="overheadPct">Overhead (%)</Label>
                <Input
                  id="overheadPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.overheadPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("overheadPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-overhead"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profitPct">Profit (%)</Label>
                <Input
                  id="profitPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.profitPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("profitPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-profit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="financingPct">Financing (%)</Label>
                <Input
                  id="financingPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.financingPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("financingPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-financing"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commissionPct">Commission (%)</Label>
                <Input
                  id="commissionPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.commissionPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("commissionPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-commission"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warrantyReserveDollar">Warranty Reserve ($)</Label>
                <Input
                  id="warrantyReserveDollar"
                  type="number"
                  step="1"
                  min="0"
                  value={inputs.warrantyReserveDollar}
                  onChange={(e) => updateInput("warrantyReserveDollar", parseFloat(e.target.value) || 0)}
                  data-testid="input-warranty-reserve"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crewDayHours">Crew Day Hours</Label>
                <Input
                  id="crewDayHours"
                  type="number"
                  step="1"
                  min="1"
                  value={inputs.crewDayHours}
                  onChange={(e) => updateInput("crewDayHours", parseFloat(e.target.value) || 16)}
                  data-testid="input-crew-day-hours"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountDollar">Discount ($)</Label>
                <Input
                  id="discountDollar"
                  type="number"
                  step="1"
                  min="0"
                  value={inputs.discountDollar}
                  onChange={(e) => updateInput("discountDollar", parseFloat(e.target.value) || 0)}
                  data-testid="input-discount"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Line Items</CardTitle>
                <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-line">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No line items yet. Click "Add Line" to get started.
                </div>
              ) : (
                <div className="space-y-6">
                  {linesByCategory.map((group) => (
                    <div key={group.category.value}>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide border-b pb-1">
                        {group.category.label}
                      </h4>
                      <div className="space-y-2">
                        {group.items.map((line) => (
                          <div
                            key={line.id}
                            className="flex items-center gap-2 p-2 bg-slate-50 rounded-md"
                            data-testid={`line-item-${line.id}`}
                          >
                            <Select
                              value={line.category}
                              onValueChange={(v) => updateLine(line.id, "category", v)}
                            >
                              <SelectTrigger className="w-32" data-testid={`select-category-${line.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LINE_CATEGORIES.map((c) => (
                                  <SelectItem key={c.value} value={c.value}>
                                    {c.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Description"
                              value={line.description}
                              onChange={(e) => updateLine(line.id, "description", e.target.value)}
                              className="flex-1"
                              data-testid={`input-description-${line.id}`}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Cost"
                              value={line.cost || ""}
                              onChange={(e) => updateLine(line.id, "cost", parseFloat(e.target.value) || 0)}
                              className="w-28"
                              data-testid={`input-cost-${line.id}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLine(line.id)}
                              data-testid={`button-delete-${line.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {lines.length > 0 && linesByCategory.length === 0 && (
                    lines.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-center gap-2 p-2 bg-slate-50 rounded-md"
                        data-testid={`line-item-${line.id}`}
                      >
                        <Select
                          value={line.category}
                          onValueChange={(v) => updateLine(line.id, "category", v)}
                        >
                          <SelectTrigger className="w-32" data-testid={`select-category-${line.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LINE_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Description"
                          value={line.description}
                          onChange={(e) => updateLine(line.id, "description", e.target.value)}
                          className="flex-1"
                          data-testid={`input-description-${line.id}`}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Cost"
                          value={line.cost || ""}
                          onChange={(e) => updateLine(line.id, "cost", parseFloat(e.target.value) || 0)}
                          className="w-28"
                          data-testid={`input-cost-${line.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.id)}
                          data-testid={`button-delete-${line.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Calculated Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Labor Payroll</span>
                  <span data-testid="calc-labor-payroll">{formatCurrency(calcs.laborPayroll)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Labor Benefits</span>
                  <span data-testid="calc-labor-benefits">{formatCurrency(calcs.laborBenefits)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Lines Total</span>
                  <span data-testid="calc-lines-total">{formatCurrency(calcs.linesTotal)}</span>
                </div>
              </div>

              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Direct Cost</span>
                  <span data-testid="calc-direct-cost">{formatCurrency(calcs.directCost)}</span>
                </div>
              </div>

              <div className="py-3 border-b">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-lg">Sell Price</span>
                  <span className="text-2xl font-bold text-[#d3b07d]" data-testid="calc-sell-price">
                    {formatCurrency(calcs.sellPrice)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Gross Profit</span>
                  <span data-testid="calc-gross-profit">{formatCurrency(calcs.grossProfit)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Gross Margin %</span>
                  <span data-testid="calc-gross-margin">{formatPercent(calcs.grossMarginPct)}</span>
                </div>
              </div>

              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Crew Days</span>
                  <span data-testid="calc-crew-days">{calcs.crewDays.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">GP per Crew Day</span>
                  <span data-testid="calc-gp-per-crew-day">{formatCurrency(calcs.grossProfitPerCrewDay)}</span>
                </div>
              </div>

              <div className="space-y-2 pb-3 border-b">
                <Label className="text-sm text-slate-500">Install Type</Label>
                <Select
                  value={installSubtype}
                  onValueChange={(v) => setInstallSubtype(v as InstallSubtype)}
                >
                  <SelectTrigger className="w-full" data-testid="select-install-subtype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSTALL_SUBTYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {inputs.discountDollar > 0 && (
                <div className="space-y-2 pt-2 bg-amber-50 -mx-4 px-4 py-3 rounded-b-lg">
                  <h4 className="text-sm font-semibold text-amber-800">With Discount</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted Price</span>
                    <span data-testid="calc-discounted-price">{formatCurrency(calcs.discountedSellPrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted GP</span>
                    <span data-testid="calc-discounted-gp">{formatCurrency(calcs.discountedGrossProfit)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted Margin</span>
                    <span data-testid="calc-discounted-margin">{formatPercent(calcs.discountedGrossMarginPct)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted GP/Day</span>
                    <span data-testid="calc-discounted-gp-day">{formatCurrency(calcs.discountedGpPerCrewDay)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )}

        {pricingMode === "service" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {isLoadingInitialData ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                      <span className="ml-3 text-slate-500">Loading parts...</span>
                    </div>
                  </CardContent>
                </Card>
              ) : isErrorInitialData ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="text-center py-8 text-red-600">
                      <p>Failed to load parts data. Please check your connection to Google Sheets.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className={`${serviceValidationErrors.includes('parts') ? 'ring-2 ring-red-500 rounded-lg' : ''}`}>
                  <PartsSelection
                    selectedParts={serviceParts}
                    onUpdate={handleUpdateServiceParts}
                    onAddCustomPart={(prefillData?: any) => {
                      setCustomPartPrefillData(prefillData);
                      setIsCustomPartModalOpen(true);
                    }}
                    availableParts={availableParts}
                  />
                </div>
              )}

              <div className={`${serviceValidationErrors.includes('warranty') ? 'ring-2 ring-red-500 rounded-lg' : ''}`}>
                <WarrantySection
                  ghvacInstalled={serviceGhvacInstalled}
                  yearsSinceInstallation={serviceYearsSinceInstallation}
                  onUpdate={(updates) => {
                    if ('ghvacInstalled' in updates) setServiceGhvacInstalled(updates.ghvacInstalled);
                    if ('yearsSinceInstallation' in updates) setServiceYearsSinceInstallation(updates.yearsSinceInstallation || '');
                  }}
                />
              </div>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    Labor & Notes
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`${serviceValidationErrors.includes('laborHours') ? 'ring-2 ring-red-500 rounded-lg p-2' : ''}`}>
                      <Label htmlFor="laborHours" className="text-sm font-medium mb-2 block">Labor Hours</Label>
                      <Input
                        id="laborHours"
                        type="number"
                        min="0"
                        step="0.5"
                        value={serviceLaborHours}
                        onChange={(e) => setServiceLaborHours(e.target.value)}
                        placeholder="Enter labor hours"
                        className="min-h-[44px]"
                        data-testid="input-service-labor-hours"
                      />
                      {serviceSettings?.laborRate && (
                        <p className="text-xs text-slate-500 mt-1">
                          Rate: ${serviceSettings.laborRate}/hr
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="jobNotes" className="text-sm font-medium mb-2 block">Job Notes</Label>
                      <Textarea
                        id="jobNotes"
                        value={serviceJobNotes}
                        onChange={(e) => setServiceJobNotes(e.target.value)}
                        placeholder="Enter any job notes..."
                        className="min-h-[80px]"
                        data-testid="input-service-job-notes"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {serviceParts.length > 0 && calculateServiceTotals && (
                <SelectedParts
                  parts={serviceParts}
                  totals={calculateServiceTotals}
                  onUpdate={handleUpdateServiceParts}
                />
              )}

              {serviceParts.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="text-slate-500">No parts selected yet</p>
                    <p className="text-sm text-slate-400">Search and add parts from the left panel</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <CustomPartModal
              isOpen={isCustomPartModalOpen}
              onClose={() => {
                setIsCustomPartModalOpen(false);
                setCustomPartPrefillData(null);
              }}
              onAdd={handleAddCustomPart}
              prefillData={customPartPrefillData}
            />
          </div>
        )}
      </div>

      <Dialog open={showCustomerModal} onOpenChange={setShowCustomerModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Customer for Quote</DialogTitle>
            <DialogDescription>
              Search and select an existing customer for this quote.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search customers..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-10"
                data-testid="input-customer-search"
              />
            </div>

            {searchLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}

            {!searchLoading && searchResults && searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {searchResults.map((customer) => (
                  <div
                    key={customer.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedCustomer?.id === customer.id
                        ? "border-[#d3b07d] bg-amber-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    onClick={() => setSelectedCustomer(customer)}
                    data-testid={`customer-option-${customer.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium">{customer.name}</span>
                    </div>
                    {customer.email && (
                      <p className="text-sm text-slate-500 ml-6">{customer.email}</p>
                    )}
                    {customer.phone && (
                      <p className="text-sm text-slate-500 ml-6">{customer.phone}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!searchLoading && customerSearch.length >= 2 && searchResults?.length === 0 && (
              <p className="text-center text-slate-500 py-4">No customers found</p>
            )}

            {customerSearch.length < 2 && (
              <p className="text-center text-slate-500 py-4 text-sm">
                Type at least 2 characters to search
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowCustomerModal(false)}
              data-testid="button-cancel-customer"
            >
              Cancel
            </Button>
            {pricingMode === "install" ? (
              <Button
                className="bg-[#d3b07d] hover:bg-[#c4a06e] text-white"
                onClick={handleCreateQuote}
                disabled={isFinalizing}
                data-testid="button-confirm-create-quote"
              >
                {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Create Quote
              </Button>
            ) : (
              <Button
                className="bg-[#711419] hover:bg-[#8a1a20] text-white"
                onClick={handleSaveServiceQuote}
                disabled={saveServiceQuoteMutation.isPending}
                data-testid="button-confirm-create-service-quote"
              >
                {saveServiceQuoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Create Service Quote
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
