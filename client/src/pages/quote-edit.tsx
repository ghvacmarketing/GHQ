import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, AlertCircle } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import NavDropdown from "@/components/nav-dropdown";
import CustomerInfo from "@/components/customer-info";
import PartsSelection from "@/components/parts-selection";
import SelectedParts from "@/components/selected-parts";
import WarrantySection from "@/components/warranty-section";
import JobNotesDisplay from "@/components/job-notes-display";
import CustomPartModal from "@/components/custom-part-modal";
import { apiRequest } from "@/lib/queryClient";
import type { QuotePart, Quote } from "@shared/schema";
import redlogo from "@assets/redlogo.webp";

interface QuoteData {
  customerName: string;
  technician: string;
  parts: QuotePart[];
  ghvacInstalled?: boolean;
  yearsSinceInstallation?: string;
  laborHours?: string;
  jobNotes?: string;
}

export default function QuoteEdit() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/quote/edit/:id");
  const [, setLocation] = useLocation();
  const quoteId = params?.id;

  const [quoteData, setQuoteData] = useState<QuoteData>({
    customerName: "",
    technician: "",
    parts: [],
    ghvacInstalled: undefined,
    yearsSinceInstallation: "",
    laborHours: "",
    jobNotes: "",
  });

  const [isCustomPartModalOpen, setIsCustomPartModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Fetch existing quote
  const { data: quote, isLoading: loadingQuote } = useQuery<Quote>({
    queryKey: ["/api/quotes", quoteId],
    queryFn: async () => {
      const response = await fetch(`/api/quotes/${quoteId}`);
      if (!response.ok) throw new Error("Failed to load quote");
      return response.json();
    },
    enabled: !!quoteId,
  });

  // Fetch initial data
  const { data: initialData, isLoading: isLoadingData, isError: isErrorData, error: initialDataError } = useQuery({
    queryKey: ["/api/initial-data"],
    staleTime: Infinity, // Cache for entire browser session (server has 24hr cache)
    gcTime: Infinity, // Keep in cache indefinitely
  });

  const technicians = (initialData as any)?.technicians || [];
  const settings = (initialData as any)?.settings;
  const parts = (initialData as any)?.parts || [];

  // Check if quote is editable (not pushed to Trello and status is draft)
  const isQuoteEditable = quote && !quote.pushedToTrello && quote.status === "draft";

  // Pre-fill form when quote loads
  useEffect(() => {
    if (quote) {
      setQuoteData({
        customerName: quote.customerName,
        technician: quote.technician,
        parts: quote.parts as QuotePart[],
        ghvacInstalled: quote.ghvacInstalled ?? undefined,
        yearsSinceInstallation: quote.yearsSinceInstallation ?? "",
        laborHours: quote.laborHours ?? "",
        jobNotes: quote.jobNotes ?? "",
      });
    }
  }, [quote]);

  // Update quote mutation
  const updateQuoteMutation = useMutation({
    mutationFn: async (quotePayload: any) => {
      const response = await apiRequest("PATCH", `/api/quotes/${quoteId}`, quotePayload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: "Quote Updated",
        description: "Your quote has been updated successfully.",
      });
      setLocation("/history");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const calculateTotals = () => {
    // Don't validate while data is still loading
    if (isLoadingData) return null;
    
    // Validate that all required settings are loaded from Google Sheets
    // This check happens BEFORE the empty quote check to ensure errors are shown immediately
    if (!settings || 
        settings.laborRate === undefined ||
        settings.laborBenefitsPercent === undefined ||
        settings.salesTaxPercent === undefined ||
        settings.warrantyReserve === undefined ||
        settings.materialShrinkagePercent === undefined ||
        settings.overheadPercent === undefined ||
        settings.profitPercent === undefined ||
        settings.financingPromotionPercent === undefined ||
        settings.commissionPercent === undefined ||
        !settings.warrantyDiscounts) {
      // Only show error if query has actually failed, not during initial load
      if (isErrorData || initialData) {
        // Extract error message from API response if available
        const errorMessage = initialDataError instanceof Error 
          ? (initialDataError as any).message || "Unable to load pricing settings from Google Sheets."
          : "Unable to load pricing settings from Google Sheets.";
        
        toast({
          title: "Google Sheets Sync Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
      return null;
    }
    
    // Only proceed with calculations if there's actual quote data
    if (!quoteData.parts.length && !quoteData.laborHours) return null;

    // Check if warranty applies (GHVAC installation)
    const isGHVACWarranty = quoteData.ghvacInstalled === true && quoteData.yearsSinceInstallation;
    const warrantyYears = isGHVACWarranty ? parseInt(quoteData.yearsSinceInstallation!) : 0;
    const warrantyCoverage = settings.warrantyDiscounts;
    const warrantyCoveragePercent = isGHVACWarranty ? (warrantyCoverage[warrantyYears] || 0) : 0;

    // STEP 1: Separate GHVAC-covered parts from customer-responsible parts
    let customerPartsCost = 0; // Parts customer is responsible for
    let ghvacCoveredPartsCost = 0; // Parts GHVAC pays for (control board, evap coil, compressor)
    
    quoteData.parts.forEach(part => {
      const partCost = parseFloat(part.price) * (part.quantity || 1);
      const description = part.description.toLowerCase();
      
      // Identify specific GHVAC-covered parts by description
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

    // STEP 2: Calculate material shrinkage (only on customer-responsible parts)
    const materialShrinkagePercent = settings.materialShrinkagePercent;
    const shrinkageMaterials = ['refrigerant filter dryer', 'copper', 'armaflex insulation', 'acid away'];
    
    const shrinkagePartsTotal = quoteData.parts.reduce((sum, part) => {
      const description = part.description.toLowerCase();
      const isShrinkageMaterial = shrinkageMaterials.some(material => 
        description.includes(material)
      );
      
      // Only count shrinkage on parts the customer is paying for
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
    
    // STEP 3: Calculate labor
    const hours = parseFloat(quoteData.laborHours || "1");
    const laborRate = settings.laborRate;
    const baseLaborCost = laborRate * hours;
    
    // STEP 4: All percentages and constants (from Google Sheets only, no fallbacks)
    const laborBenefitsPercent = settings.laborBenefitsPercent;
    const salesTaxPercent = settings.salesTaxPercent;
    const warrantyReserve = settings.warrantyReserve;
    const overheadPercent = settings.overheadPercent;
    const profitPercent = settings.profitPercent;
    const financingPercent = settings.financingPromotionPercent;
    const commissionPercent = settings.commissionPercent;
    
    const laborBenefits = baseLaborCost * laborBenefitsPercent;
    const totalLaborCost = baseLaborCost + laborBenefits;
    
    // STEP 5: Calculate FULL selling price (with ALL parts for display)
    // Selling Price = Direct Cost / (1 - (Overhead + Profit + Financing + Commission))
    const allPartsSubtotal = customerPartsCost + ghvacCoveredPartsCost;
    const allPartsWithShrinkage = allPartsSubtotal + materialShrinkageCost;
    const fullSalesTax = allPartsWithShrinkage * salesTaxPercent;
    const fullDirectCost = allPartsWithShrinkage + totalLaborCost + fullSalesTax + warrantyReserve;
    const totalDeductionRate = overheadPercent + profitPercent + financingPercent + commissionPercent;
    const remainingRate = 1.0 - totalDeductionRate;
    const fullSellingPrice = fullDirectCost / remainingRate;
    
    // STEP 6: Calculate CUSTOMER selling price (only parts customer pays for)
    const customerPartsWithShrinkage = customerPartsCost + materialShrinkageCost;
    const customerSalesTax = customerPartsWithShrinkage * salesTaxPercent;
    const customerDirectCost = customerPartsWithShrinkage + totalLaborCost + customerSalesTax + warrantyReserve;
    const customerSellingPrice = customerDirectCost / remainingRate;
    
    // STEP 7: Apply warranty coverage percentage
    let customerTotal = fullSellingPrice;
    let priceBeforeWarranty = fullSellingPrice;
    
    if (isGHVACWarranty && warrantyCoveragePercent > 0) {
      // Customer pays warranty% of the price calculated without GHVAC parts
      customerTotal = customerSellingPrice * warrantyCoveragePercent;
      priceBeforeWarranty = customerSellingPrice;
    }
    
    // Calculate allocations based on full selling price (for transparency)
    const overhead = fullSellingPrice * overheadPercent;
    const profit = fullSellingPrice * profitPercent;
    const financingCost = fullSellingPrice * financingPercent;
    const commission = fullSellingPrice * commissionPercent;

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
      // Legacy compatibility for display
      subtotal: allPartsSubtotal.toFixed(2),
      labor: baseLaborCost.toFixed(2),
      tax: fullSalesTax.toFixed(2),
    };
  };

  const handleSaveQuote = () => {
    const errors: string[] = [];
    
    if (!quoteData.customerName) errors.push('customerName');
    if (!quoteData.technician) errors.push('technician');
    if (quoteData.parts.length === 0) errors.push('parts');
    if (quoteData.ghvacInstalled === undefined) errors.push('warranty');
    if (!quoteData.laborHours) errors.push('laborHours');
    
    if (errors.length > 0) {
      setValidationErrors(errors);
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields highlighted in red.",
        variant: "destructive",
      });
      return;
    }
    
    setValidationErrors([]);

    const totals = calculateTotals();
    if (!totals) return;

    const quotePayload = {
      customerName: quoteData.customerName,
      technician: quoteData.technician,
      parts: quoteData.parts,
      subtotal: totals.subtotal,
      labor: totals.labor,
      tax: totals.tax,
      total: totals.total,
      ghvacInstalled: quoteData.ghvacInstalled,
      yearsSinceInstallation: quoteData.yearsSinceInstallation,
      laborHours: quoteData.laborHours,
      jobNotes: quoteData.jobNotes,
    };

    updateQuoteMutation.mutate(quotePayload);
  };

  const handleUpdateQuoteData = (updates: Partial<QuoteData>) => {
    setQuoteData(prev => {
      if (updates.parts) {
        updates.parts = updates.parts.map(part => ({
          ...part,
          id: part.id || `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          price: part.price || "0",
          quantity: part.quantity || 1
        }));
      }
      return { ...prev, ...updates };
    });
  };

  const totals = calculateTotals();

  if (loadingQuote) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading quote...</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">Quote not found</p>
          <Link href="/history">
            <Button className="mt-4">Back to History</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Header */}
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
                currentPageTitle="Edit Quote"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Quote History", path: "/history" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <Link href="/history">
              <Button variant="ghost" size="icon" data-testid="button-back" title="Back to history">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-md md:max-w-2xl lg:max-w-5xl">
        {/* Warning Banner for Non-Editable Quotes */}
        {!isQuoteEditable && quote && (
          <Alert variant="destructive" data-testid="alert-quote-not-editable">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Quote Cannot Be Edited</AlertTitle>
            <AlertDescription>
              {quote.pushedToTrello ? (
                <>
                  This quote has been pushed to Trello with status "{quote.status}". 
                  To make changes, please edit the quote directly in Trello where it's being tracked.
                </>
              ) : (
                <>
                  This quote has status "{quote.status}" and cannot be edited. 
                  Only quotes with status "draft" can be modified.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        <CustomerInfo
          customerName={quoteData.customerName}
          technician={quoteData.technician}
          technicians={technicians}
          onUpdate={handleUpdateQuoteData}
          hasErrors={{
            customerName: validationErrors.includes('customerName'),
            technician: validationErrors.includes('technician'),
          }}
          disabled={!isQuoteEditable}
        />

        <WarrantySection
          ghvacInstalled={quoteData.ghvacInstalled}
          yearsSinceInstallation={quoteData.yearsSinceInstallation}
          laborHours={quoteData.laborHours}
          onUpdate={handleUpdateQuoteData}
          hasErrors={{
            warranty: validationErrors.includes('warranty'),
            laborHours: validationErrors.includes('laborHours'),
          }}
          disabled={!isQuoteEditable}
        />

        <PartsSelection
          selectedParts={quoteData.parts}
          onUpdate={handleUpdateQuoteData}
          onAddCustomPart={() => setIsCustomPartModalOpen(true)}
          hasPartsError={validationErrors.includes('parts')}
          availableParts={parts}
          disabled={!isQuoteEditable}
        />

        {quoteData.parts.length > 0 && totals && (
          <SelectedParts
            parts={quoteData.parts}
            totals={totals}
            onUpdate={handleUpdateQuoteData}
            disabled={!isQuoteEditable}
          />
        )}

        <JobNotesDisplay
          jobNotes={quoteData.jobNotes || ""}
          onUpdate={(notes) => handleUpdateQuoteData({ jobNotes: notes })}
          onClear={() => handleUpdateQuoteData({ jobNotes: "" })}
          disabled={!isQuoteEditable}
        />

        {/* Save Button */}
        <div className="flex justify-center pb-6">
          <Button
            onClick={handleSaveQuote}
            disabled={!isQuoteEditable || updateQuoteMutation.isPending}
            className="w-full sm:w-auto px-8 py-6 text-lg"
            data-testid="button-save-quote"
          >
            <Save className="mr-2 h-5 w-5" />
            {updateQuoteMutation.isPending ? "Saving..." : !isQuoteEditable ? "Cannot Edit" : "Save Changes"}
          </Button>
        </div>
      </main>

      {/* Custom Part Modal */}
      <CustomPartModal
        isOpen={isCustomPartModalOpen}
        onClose={() => setIsCustomPartModalOpen(false)}
        onAddPart={(part) => {
          handleUpdateQuoteData({
            parts: [...quoteData.parts, part],
          });
          setIsCustomPartModalOpen(false);
        }}
        prefillData={null}
      />
    </div>
  );
}
