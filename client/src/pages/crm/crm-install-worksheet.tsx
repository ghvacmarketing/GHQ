import { useState, useEffect, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, useRoute, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { IndustrialTabs } from "@/components/crm/industrial-tabs";
import { Textarea } from "@/components/ui/textarea";
import { CatalogPicker } from "@/components/crm/catalog-picker";
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
  BookOpen,
  CheckCircle,
  Eye,
  EyeOff,
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

type AssignableUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
};
import PartsSelection from "@/components/parts-selection";
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
  /** Shown on the customer's copy of the quote? Costs default to internal. */
  customerVisible: boolean;
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
  usePageTitle("Custom Pricing");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const searchString = useSearch();

  const [pricingMode, setPricingMode] = useState<PricingMode>("install");
  const [inputs, setInputs] = useState<WorksheetInputs>(defaultInputs);
  const [installSubtype, setInstallSubtype] = useState<InstallSubtype>("residential");
  const [lines, setLines] = useState<LocalLine[]>([]);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);

  const [serviceParts, setServiceParts] = useState<QuotePart[]>([]);
  const [serviceLaborHours, setServiceLaborHours] = useState<string>("");
  // Editable per-quote service knobs, seeded from Settings once loaded — the
  // same pattern as the install inputs card. Changing them here never writes
  // back to Settings.
  const [serviceInputs, setServiceInputs] = useState<{
    laborRate: number;
    laborBenefitsPct: number;
    salesTaxPct: number;
    shrinkagePct: number;
    warrantyReserve: number;
    overheadPct: number;
    profitPct: number;
    financingPct: number;
    commissionPct: number;
  } | null>(null);
  const [serviceGhvacInstalled, setServiceGhvacInstalled] = useState<boolean | undefined>(undefined);
  const [serviceYearsSinceInstallation, setServiceYearsSinceInstallation] = useState<string>("");
  const [serviceJobNotes, setServiceJobNotes] = useState<string>("");
  const [serviceValidationErrors, setServiceValidationErrors] = useState<string[]>([]);
  const [isCustomPartModalOpen, setIsCustomPartModalOpen] = useState(false);
  const [customPartPrefillData, setCustomPartPrefillData] = useState<any>(null);
  const [assignedToId, setAssignedToId] = useState<string | null>(null);

  // ── Edit mode: /crm/quotes/install-worksheet/<quoteId> re-opens a finalized
  // Custom Pricing quote — the worksheet seeds from its costing snapshot and
  // Save regenerates the quote's lines + totals in place. ──
  const [, routeParams] = useRoute("/crm/quotes/install-worksheet/:id");
  const editQuoteId = routeParams?.id && routeParams.id !== "new" ? routeParams.id : null;
  const [editSeeded, setEditSeeded] = useState(false);
  const [editReconstructed, setEditReconstructed] = useState(false);
  const { data: editQuote, isError: editLoadError } = useQuery<any>({
    queryKey: ["/api/crm/quotes", editQuoteId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${editQuoteId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load quote");
      return res.json();
    },
    enabled: !!editQuoteId,
  });

  // ── Prefill from the New Quote setup flow: customer + salesperson are
  // chosen BEFORE this page opens, so finalizing must never re-ask. ──
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const presetCustomerId = urlParams.get("customerId");
  useEffect(() => {
    const a = urlParams.get("assignedToId");
    if (a) setAssignedToId(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: presetCustomer } = useQuery<CrmCustomer | null>({
    queryKey: ["/api/crm/customers", presetCustomerId, "worksheet-prefill"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${presetCustomerId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!presetCustomerId,
  });
  useEffect(() => {
    if (presetCustomer && !selectedCustomer) setSelectedCustomer(presetCustomer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCustomer]);

  // Seed the whole worksheet from the quote being edited (once, on load)
  useEffect(() => {
    if (!editQuoteId || !editQuote || editSeeded) return;
    if (editQuote.status === "accepted" || editQuote.status === "converted") {
      toast({ title: "Quote is locked", description: "Accepted quotes can't be repriced.", variant: "destructive" });
      navigate(`/crm/quotes/${editQuoteId}`);
      return;
    }
    const snap = (editQuote.costingSnapshot || null) as any;
    const mode: PricingMode = snap?.mode === "service" || editQuote.quoteType === "custom_service" ? "service" : "install";
    setPricingMode(mode);
    if (editQuote.customer) setSelectedCustomer(editQuote.customer as CrmCustomer);
    else if (editQuote.customerId) setSelectedCustomer({ id: editQuote.customerId, name: editQuote.customerName } as CrmCustomer);
    if (editQuote.assignedToId) setAssignedToId(editQuote.assignedToId);

    if (mode === "install") {
      const lineItems: any[] = editQuote.lineItems || [];
      if (snap?.inputs) {
        setInputs({ ...defaultInputs, ...snap.inputs });
      } else {
        // Older quote — its snapshot predates raw-input storage. Rebuild what
        // we can from the summary numbers + generated line items; the rest
        // stays at defaults, flagged in the banner so nobody trusts it blindly.
        const round4 = (n: number) => Math.round(n * 10000) / 10000;
        const rebuilt = { ...defaultInputs };
        const sell = Number(snap?.sellPrice) || 0;
        if (sell > 0) {
          rebuilt.overheadPct = round4((Number(snap?.overhead) || 0) / sell);
          rebuilt.financingPct = round4((Number(snap?.financing) || 0) / sell);
          rebuilt.commissionPct = round4((Number(snap?.commission) || 0) / sell);
          rebuilt.profitPct = round4((Number(snap?.profit) || 0) / sell);
        }
        const laborItem = lineItems.find((i) => i.lineType === "labor");
        const hrsMatch = laborItem?.description?.match(/\(([\d.]+)\s*hrs?\)/i);
        if (hrsMatch) rebuilt.hoursToInstall = parseFloat(hrsMatch[1]) || rebuilt.hoursToInstall;
        const laborLineTotal = parseFloat(String(laborItem?.lineTotal || 0)) || 0;
        if (laborLineTotal > 0 && rebuilt.hoursToInstall > 0) {
          // The labor line bundles payroll + benefits — split with the default benefits pct
          rebuilt.topManHourlyRate = Math.round((laborLineTotal / (1 + rebuilt.laborBenefitsPct) / rebuilt.hoursToInstall) * 100) / 100;
        }
        const warrantyItem = lineItems.find((i) => i.description === "Warranty Reserve");
        rebuilt.warrantyReserveDollar = warrantyItem ? parseFloat(String(warrantyItem.lineTotal || 0)) || 0 : 0;
        const total = parseFloat(String(editQuote.total || 0)) || 0;
        if (sell > 0 && total > 0 && sell - total > 0.009) rebuilt.discountDollar = Math.round((sell - total) * 100) / 100;
        setInputs(rebuilt);
        setEditReconstructed(true);
      }
      if (snap?.installSubtype && INSTALL_SUBTYPES.some((s) => s.value === snap.installSubtype)) {
        setInstallSubtype(snap.installSubtype);
      } else if (typeof editQuote.title === "string") {
        const m = editQuote.title.match(/^Install - (\w+)/i);
        const s = m?.[1]?.toLowerCase();
        if (s && INSTALL_SUBTYPES.some((st) => st.value === s)) setInstallSubtype(s as InstallSubtype);
      }
      // Cost lines: the quote's CURRENT part lines are the source of truth
      // (they carry any additions/promotions made on the quote page); the
      // snapshot only contributes each line's original category.
      const snapLines: any[] = Array.isArray(snap?.lines) ? snap.lines : [];
      const categoryFor = (desc: string): LineCategory => {
        const c = snapLines.find((sl) => sl.description === desc)?.category;
        return LINE_CATEGORIES.some((lc) => lc.value === c) ? (c as LineCategory) : "other";
      };
      setLines(
        lineItems
          .filter((i) => i.lineType === "part")
          .map((i, idx) => ({
            id: `line-${i.id || idx}`,
            category: categoryFor(i.description || ""),
            description: i.description || "",
            cost: parseFloat(String(i.lineTotal ?? i.unitPrice ?? 0)) || 0,
            customerVisible: i.customerVisible === true,
          }))
      );
    } else {
      const sq = snap?.serviceQuoteData;
      if (!sq) {
        toast({
          title: "Can't re-open this quote",
          description: "It was created before editable Custom Pricing — the original parts list wasn't saved.",
          variant: "destructive",
        });
        navigate(`/crm/quotes/${editQuoteId}`);
        return;
      }
      setServiceParts(Array.isArray(sq.parts) ? sq.parts : []);
      setServiceLaborHours(String(sq.laborHours ?? ""));
      setServiceGhvacInstalled(typeof sq.ghvacInstalled === "boolean" ? sq.ghvacInstalled : undefined);
      setServiceYearsSinceInstallation(String(sq.yearsSinceInstallation ?? ""));
      setServiceJobNotes(sq.jobNotes || "");
      if (sq.serviceInputs) setServiceInputs(sq.serviceInputs);
    }
    setEditSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editQuote, editSeeded, editQuoteId]);


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
  useEffect(() => {
    if (!serviceInputs && serviceSettings && serviceSettings.laborRate !== undefined) {
      setServiceInputs({
        laborRate: serviceSettings.laborRate ?? 0,
        laborBenefitsPct: serviceSettings.laborBenefitsPercent ?? 0,
        salesTaxPct: serviceSettings.salesTaxPercent ?? 0,
        shrinkagePct: serviceSettings.materialShrinkagePercent ?? 0,
        warrantyReserve: serviceSettings.warrantyReserve ?? 0,
        overheadPct: serviceSettings.overheadPercent ?? 0,
        profitPct: serviceSettings.profitPercent ?? 0,
        financingPct: serviceSettings.financingPromotionPercent ?? 0,
        commissionPct: serviceSettings.commissionPercent ?? 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceSettings]);

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

  // Fetch assignable users based on pricing mode
  // Install quotes need exactly sales role, service quotes need exactly admin role
  const exactRoleForQuoteType = pricingMode === "service" ? "admin" : "sales";
  const { data: assignableUsers, isLoading: isLoadingUsers } = useQuery<AssignableUser[]>({
    queryKey: ["/api/crm/users/by-role", exactRoleForQuoteType],
    queryFn: async () => {
      const response = await fetch(`/api/crm/users/by-role?exactRole=${exactRoleForQuoteType}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: showCustomerModal,
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
      lines: Array<{ category: string; description: string; cost: number; customerVisible: boolean }>;
      assignedToId?: string | null;
    }) => {
      const res = await apiRequest("POST", "/api/crm/quotes/from-worksheet", data);
      return res.json();
    },
    onSuccess: (data: { quoteId: string }) => {
      toast({ title: "Quote created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      navigate(`/crm/quotes/${data.quoteId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating quote", description: error.message, variant: "destructive" });
    },
  });

  // Edit mode's Save — regenerates the existing quote's lines, totals, and
  // costing snapshot from the current worksheet state.
  const updateMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await apiRequest("PUT", `/api/crm/quotes/${editQuoteId}/from-worksheet`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote updated", description: "Line items and totals were regenerated from the worksheet." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", editQuoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      navigate(`/crm/quotes/${editQuoteId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error updating quote", description: error.message, variant: "destructive" });
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
      assignedToId?: string | null;
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
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
    if (!serviceInputs || !serviceSettings?.warrantyDiscounts) {
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

    const materialShrinkagePercent = serviceInputs.shrinkagePct;
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
    const laborRate = serviceInputs.laborRate;
    const baseLaborCost = laborRate * hours;
    
    const laborBenefitsPercent = serviceInputs.laborBenefitsPct;
    const salesTaxPercent = serviceInputs.salesTaxPct;
    const warrantyReserve = serviceInputs.warrantyReserve;
    const overheadPercent = serviceInputs.overheadPct;
    const profitPercent = serviceInputs.profitPct;
    const financingPercent = serviceInputs.financingPct;
    const commissionPercent = serviceInputs.commissionPct;
    
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
  }, [serviceParts, serviceLaborHours, serviceGhvacInstalled, serviceYearsSinceInstallation, serviceInputs, serviceSettings, isLoadingInitialData]);

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
      category: 'Custom',
      availability: 'Available',
      warranty: false,
      isCustom: true,
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
    const laborRate = serviceInputs?.laborRate || 0;
    lineItems.push({
      description: `Labor (${laborHours} hours @ $${laborRate}/hr)`,
      quantity: 1,
      unitPrice: parseFloat(calculateServiceTotals.totalLaborCost || "0"),
      taxable: false,
    });

    // The full worksheet state rides the snapshot so this quote can be
    // re-opened in Custom Pricing later for edits.
    const serviceQuoteData = {
      parts: serviceParts,
      laborHours: serviceLaborHours,
      ghvacInstalled: serviceGhvacInstalled,
      yearsSinceInstallation: serviceYearsSinceInstallation,
      jobNotes: serviceJobNotes,
      serviceInputs,
      totals: calculateServiceTotals,
    };

    if (editQuoteId) {
      updateMutation.mutate({ mode: "service", serviceQuoteData, lineItems });
      return;
    }

    saveServiceQuoteMutation.mutate({
      customerId: selectedCustomer.id,
      title: "Service Quote",
      description: serviceJobNotes || undefined,
      notes: serviceJobNotes || undefined,
      lineItems,
      status: "draft",
      quoteType: "custom_service",
      serviceQuoteData,
      assignedToId: assignedToId || undefined,
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
    if (editQuoteId) {
      handleSaveServiceQuote();
      return;
    }
    setShowCustomerModal(true);
  };

  const handleFinalizeClick = () => {
    if (lines.length === 0) {
      toast({ title: "No line items", description: "Add at least one line item before creating a quote", variant: "destructive" });
      return;
    }
    // Editing an existing quote — save in place, never re-ask for a customer.
    if (editQuoteId) {
      updateMutation.mutate({
        mode: "install",
        installSubtype,
        inputs,
        lines: lines.map((l) => ({
          category: l.category,
          description: l.description,
          cost: l.cost,
          customerVisible: l.customerVisible,
        })),
      });
      return;
    }
    // Customer + salesperson were picked in the New Quote setup — create
    // straight away. The modal only appears when this page was opened cold.
    if (selectedCustomer && assignedToId) {
      handleCreateQuote();
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
        customerVisible: l.customerVisible,
      })),
      assignedToId: assignedToId || undefined,
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
        customerVisible: false,
      },
    ]);
  };

  const addLineFromCatalog = (item: { name: string; description: string | null; rate: string | null }) => {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        category: "equipment",
        description: item.description ? `${item.name} — ${item.description}` : item.name,
        cost: parseFloat(item.rate || "0") || 0,
        customerVisible: false,
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

  const isFinalizing = finalizeMutation.isPending || updateMutation.isPending;

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

  if (editQuoteId && !editSeeded) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="max-w-7xl mx-auto space-y-6">
          {editLoadError ? (
            <div className="rounded-[4px] border border-slate-300/70 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">Couldn't load this quote for editing.</p>
              <Button variant="outline" className="mt-4" onClick={() => navigate(`/crm/quotes/${editQuoteId}`)} data-testid="button-back-to-quote">
                Back to quote
              </Button>
            </div>
          ) : (
            <>
              <Skeleton className="h-12 w-64" />
              <div className="grid grid-cols-3 gap-6">
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
              </div>
            </>
          )}
        </div>
      </CrmLayout>
    );
  }

  const formatCurrency = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (n: number) => `${(n * 100).toFixed(2)}%`;
  const money = (v: string | undefined) => formatCurrency(parseFloat(v || "0"));

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header: title left, centered mode tabs (same style as Inbox), action right */}
        <div className="grid items-center gap-3 xl:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate(editQuoteId ? `/crm/quotes/${editQuoteId}` : "/crm/quotes")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-slate-300/70 text-slate-500 transition-colors hover:border-[#711419] hover:text-[#711419]"
              data-testid="button-back"
              aria-label="Back to quotes"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-foreground" data-testid="text-page-title">
                Custom Pricing
              </h1>
              {editQuoteId ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground" data-testid="text-editing-quote">
                  Editing <span className="font-semibold text-[#711419]">{editQuote?.quoteNumber || "quote"}</span>
                  {selectedCustomer ? <> for <span className="font-semibold text-[#711419]">{selectedCustomer.name}</span></> : null}
                  {" — saving replaces its line items and totals"}
                </p>
              ) : selectedCustomer ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  For <span className="font-semibold text-[#711419]">{selectedCustomer.name}</span>
                  {assignedToId ? " · salesperson set" : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {pricingMode === "install"
                    ? "Install pricing with labor, materials, and margins"
                    : "Service pricing with parts, labor, and warranty"}
                </p>
              )}
            </div>
          </div>
          <div className="justify-self-center">
            {editQuoteId ? (
              <div className="rounded-[4px] border border-slate-300/70 bg-white px-4 py-1.5 text-sm font-medium text-slate-600" data-testid="edit-mode-badge">
                {pricingMode === "install" ? "Install" : "Service"} · editing
              </div>
            ) : (
              <IndustrialTabs
                testidPrefix="pricing-mode"
                activeKey={pricingMode}
                onSelect={(k) => setPricingMode(k as PricingMode)}
                tabs={[
                  { key: "install", label: "Install" },
                  { key: "service", label: "Service" },
                ]}
              />
            )}
          </div>
          <div className="justify-self-end">
            {pricingMode === "install" ? (
              <Button
                className="bg-[#711419] hover:bg-[#8a1a1f] text-white"
                onClick={handleFinalizeClick}
                disabled={isFinalizing || lines.length === 0}
                data-testid="button-finalize"
              >
                {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                {editQuoteId ? "Save Changes" : "Finalize → Create Quote"}
              </Button>
            ) : (
              <Button
                className="bg-[#711419] hover:bg-[#8a1a1f] text-white"
                onClick={handleServiceFinalizeClick}
                disabled={saveServiceQuoteMutation.isPending || updateMutation.isPending || serviceParts.length === 0}
                data-testid="button-finalize-service"
              >
                {saveServiceQuoteMutation.isPending || updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {editQuoteId ? "Save Changes" : "Finalize → Create Quote"}
              </Button>
            )}
          </div>
        </div>

        {editQuoteId && editReconstructed && (
          <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800" data-testid="reconstructed-warning">
            This quote predates editable worksheets, so its inputs were reconstructed from the finalize-time snapshot — double-check hours, rates, and percentages before saving.
          </div>
        )}

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Line Items</CardTitle>
                <div className="flex items-center gap-2">
                  <CatalogPicker onPick={addLineFromCatalog} testidPrefix="worksheet-catalog" />
                  <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-line">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Line
                  </Button>
                </div>
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
                            className="flex items-start gap-2 rounded-[4px] border border-slate-300/70 bg-white p-2"
                            data-testid={`line-item-${line.id}`}
                          >
                            <Select
                              value={line.category}
                              onValueChange={(v) => updateLine(line.id, "category", v)}
                            >
                              <SelectTrigger className="w-32 shrink-0" data-testid={`select-category-${line.id}`}>
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
                            {/* Grows as you type — long descriptions are welcome */}
                            <Textarea
                              placeholder="Description"
                              value={line.description}
                              onChange={(e) => updateLine(line.id, "description", e.target.value)}
                              rows={1}
                              className="min-h-[40px] flex-1 resize-y text-sm"
                              data-testid={`input-description-${line.id}`}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Cost"
                              value={line.cost || ""}
                              onChange={(e) => updateLine(line.id, "cost", parseFloat(e.target.value) || 0)}
                              className="w-28 shrink-0"
                              data-testid={`input-cost-${line.id}`}
                            />
                            <button
                              onClick={() => removeLine(line.id)}
                              className="mt-1.5 shrink-0 rounded p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                              data-testid={`button-delete-${line.id}`}
                              title="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <EyeOff className="h-3.5 w-3.5" />
                    These lines are your internal cost build-up — the customer only ever sees the package sell price.
                  </p>
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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Where the price goes</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Overhead</span>
                  <span data-testid="calc-overhead-dollars">{formatCurrency(calcs.sellPrice * inputs.overheadPct)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Financing</span>
                  <span data-testid="calc-financing-dollars">{formatCurrency(calcs.sellPrice * inputs.financingPct)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Commission</span>
                  <span data-testid="calc-commission-dollars">{formatCurrency(calcs.sellPrice * inputs.commissionPct)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-slate-700">Profit</span>
                  <span data-testid="calc-profit-dollars">{formatCurrency(calcs.sellPrice * inputs.profitPct)}</span>
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* ── Inputs — seeded from Service Settings, editable per quote ── */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!serviceInputs ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <>
                  <div className={`space-y-2 ${serviceValidationErrors.includes('laborHours') ? 'rounded-lg p-2 ring-2 ring-red-500' : ''}`}>
                    <Label htmlFor="svcLaborHours">Labor Hours</Label>
                    <Input
                      id="svcLaborHours"
                      type="number"
                      step="0.5"
                      min="0"
                      value={serviceLaborHours}
                      onChange={(e) => setServiceLaborHours(e.target.value)}
                      placeholder="0"
                      data-testid="input-service-labor-hours"
                    />
                  </div>
                  {([
                    ["laborRate", "Labor Rate ($/hr)", 1, false],
                    ["warrantyReserve", "Warranty Reserve ($)", 1, false],
                    ["laborBenefitsPct", "Labor Benefits (%)", 1, true],
                    ["salesTaxPct", "Sales Tax (%)", 0.5, true],
                    ["shrinkagePct", "Material Shrinkage (%)", 0.5, true],
                    ["overheadPct", "Overhead (%)", 1, true],
                    ["profitPct", "Profit (%)", 1, true],
                    ["financingPct", "Financing (%)", 0.5, true],
                    ["commissionPct", "Commission (%)", 0.5, true],
                  ] as Array<[keyof NonNullable<typeof serviceInputs>, string, number, boolean]>).map(([key, label, step, isPct]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`svc-${key}`}>{label}</Label>
                      <Input
                        id={`svc-${key}`}
                        type="number"
                        step={step}
                        min="0"
                        value={isPct ? (serviceInputs[key] * 100).toFixed(step < 1 ? 1 : 0) : serviceInputs[key]}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value) || 0;
                          setServiceInputs((prev) => (prev ? { ...prev, [key]: isPct ? n / 100 : n } : prev));
                        }}
                        data-testid={`input-svc-${key}`}
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-400">
                    Seeded from Service Settings — changes here apply to this quote only.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Parts, warranty, notes ── */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Parts &amp; Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingInitialData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  <span className="ml-3 text-slate-500">Loading parts...</span>
                </div>
              ) : isErrorInitialData ? (
                <div className="text-center py-8 text-red-600">
                  <p>Failed to load parts data. Please check your connection to Google Sheets.</p>
                </div>
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

              {serviceParts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide border-b pb-1">
                    Selected Parts
                  </h4>
                  <div className="space-y-2">
                    {serviceParts.map((part) => (
                      <div
                        key={part.id}
                        className="flex items-center gap-2 rounded-[4px] border border-slate-300/70 bg-white p-2"
                        data-testid={`service-part-${part.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-800">{part.description}</p>
                          {part.partNumber && <p className="font-mono text-[11px] text-slate-400">{part.partNumber}</p>}
                        </div>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={part.quantity || 1}
                          onChange={(e) => {
                            const q = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setServiceParts((prev) => prev.map((x) => (x.id === part.id ? { ...x, quantity: q } : x)));
                          }}
                          className="w-16 shrink-0 text-center"
                          data-testid={`service-part-qty-${part.id}`}
                        />
                        <span className="w-20 shrink-0 text-right text-sm tabular-nums text-slate-600">
                          {formatCurrency(parseFloat(part.price) * (part.quantity || 1))}
                        </span>
                        <button
                          onClick={() => setServiceParts((prev) => prev.filter((x) => x.id !== part.id))}
                          className="shrink-0 rounded p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Remove part"
                          data-testid={`service-part-remove-${part.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <EyeOff className="h-3.5 w-3.5" />
                    Part costs are your internal build-up — the customer sees the final price.
                  </p>
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

              <div className="space-y-2">
                <Label htmlFor="jobNotes">Job Notes</Label>
                <Textarea
                  id="jobNotes"
                  value={serviceJobNotes}
                  onChange={(e) => setServiceJobNotes(e.target.value)}
                  placeholder="Enter any job notes..."
                  className="min-h-[80px]"
                  data-testid="input-service-job-notes"
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Calculated Totals — the full internal waterfall ── */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Calculated Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!calculateServiceTotals ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  <Package className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  Add parts and labor hours to see the breakdown.
                </div>
              ) : (
                <>
                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Parts Subtotal</span>
                      <span data-testid="svc-calc-parts">{money(calculateServiceTotals.partsSubtotal)}</span>
                    </div>
                    {parseFloat(calculateServiceTotals.ghvacCoveredParts) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-700">GHVAC-Covered Parts</span>
                        <span className="text-emerald-700" data-testid="svc-calc-covered">{money(calculateServiceTotals.ghvacCoveredParts)}</span>
                      </div>
                    )}
                    {parseFloat(calculateServiceTotals.materialShrinkage) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Material Shrinkage</span>
                        <span data-testid="svc-calc-shrinkage">{money(calculateServiceTotals.materialShrinkage)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Labor Payroll</span>
                      <span data-testid="svc-calc-labor">{money(calculateServiceTotals.baseLaborCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Labor Benefits</span>
                      <span data-testid="svc-calc-benefits">{money(calculateServiceTotals.laborBenefits)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Sales Tax</span>
                      <span data-testid="svc-calc-tax">{money(calculateServiceTotals.salesTax)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Warranty Reserve</span>
                      <span data-testid="svc-calc-reserve">{money(calculateServiceTotals.warrantyReserve)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Direct Cost</span>
                      <span data-testid="svc-calc-direct">{money(calculateServiceTotals.directCost)}</span>
                    </div>
                  </div>

                  <div className="py-3 border-b">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-lg">Sell Price</span>
                      <span className="text-2xl font-bold text-[#d3b07d]" data-testid="svc-calc-sell">
                        {money(calculateServiceTotals.fullSellingPrice)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pb-3 border-b">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Where the price goes</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Overhead</span>
                      <span data-testid="svc-calc-overhead">{money(calculateServiceTotals.overhead)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Financing</span>
                      <span data-testid="svc-calc-financing">{money(calculateServiceTotals.financingCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Commission</span>
                      <span data-testid="svc-calc-commission">{money(calculateServiceTotals.commission)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-slate-700">Profit</span>
                      <span data-testid="svc-calc-profit">{money(calculateServiceTotals.profit)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Gross Profit</span>
                      <span data-testid="svc-calc-gp">
                        {formatCurrency(parseFloat(calculateServiceTotals.fullSellingPrice) - parseFloat(calculateServiceTotals.directCost))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Gross Margin %</span>
                      <span data-testid="svc-calc-margin">
                        {(() => {
                          const sell = parseFloat(calculateServiceTotals.fullSellingPrice);
                          const direct = parseFloat(calculateServiceTotals.directCost);
                          return sell > 0 ? formatPercent(1 - direct / sell) : "—";
                        })()}
                      </span>
                    </div>
                  </div>

                  {calculateServiceTotals.isGHVACWarranty && (
                    <div className="space-y-2 pt-2 bg-amber-50 -mx-4 px-4 py-3 rounded-b-lg">
                      <h4 className="text-sm font-semibold text-amber-800">GHVAC Warranty Applied</h4>
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-700">Coverage</span>
                        <span data-testid="svc-calc-coverage">{formatPercent(calculateServiceTotals.warrantyCoverage)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-700">Price Before Warranty</span>
                        <span data-testid="svc-calc-before">{money(calculateServiceTotals.priceBeforeWarranty)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-amber-800">Customer Pays</span>
                        <span data-testid="svc-calc-total">{money(calculateServiceTotals.total)}</span>
                      </div>
                    </div>
                  )}
                  {!calculateServiceTotals.isGHVACWarranty && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-medium text-slate-700">Customer Pays</span>
                      <span className="font-semibold" data-testid="svc-calc-total">{money(calculateServiceTotals.total)}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <CustomPartModal
            isOpen={isCustomPartModalOpen}
            onClose={() => {
              setIsCustomPartModalOpen(false);
              setCustomPartPrefillData(null);
            }}
            onAddPart={handleAddCustomPart}
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

            {/* Assign To dropdown */}
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="assignedTo">
                Assign To ({pricingMode === "service" ? "Admin Team" : "Sales Team"})
              </Label>
              <Select
                value={assignedToId || ""}
                onValueChange={(value) => setAssignedToId(value || null)}
              >
                <SelectTrigger id="assignedTo" data-testid="select-assigned-to">
                  <SelectValue placeholder={isLoadingUsers ? "Loading users..." : "Select team member..."} />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers && assignableUsers.length > 0 ? (
                    assignableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id} data-testid={`assignee-option-${user.id}`}>
                        {user.displayName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="_no_users" disabled>
                      No users available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {pricingMode === "service" 
                  ? "Service quotes can be assigned to admin or owner users" 
                  : "Install quotes can be assigned to sales, admin, or owner users"}
              </p>
            </div>
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
                disabled={isFinalizing || !selectedCustomer || !assignedToId}
                data-testid="button-confirm-create-quote"
              >
                {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Create Quote
              </Button>
            ) : (
              <Button
                className="bg-[#711419] hover:bg-[#8a1a20] text-white"
                onClick={handleSaveServiceQuote}
                disabled={saveServiceQuoteMutation.isPending || !selectedCustomer || !assignedToId}
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
