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
  const { data: initialData } = useQuery({
    queryKey: ["/api/initial-data"],
    staleTime: 30000,
    gcTime: 60000,
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
    if (!settings || (!quoteData.parts.length && !quoteData.laborHours)) return null;

    const isGHVACWarranty = quoteData.ghvacInstalled === true && quoteData.yearsSinceInstallation;
    const warrantyYears = isGHVACWarranty ? parseInt(quoteData.yearsSinceInstallation!) : 0;
    const warrantyDiscounts = settings.warrantyDiscounts || {
      2: 0.25, 3: 0.35, 4: 0.45, 5: 0.50, 6: 0.55, 
      7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90
    };
    const warrantyDiscountPercent = isGHVACWarranty ? (warrantyDiscounts[warrantyYears] || 0) : 0;

    let partsSubtotal = 0;
    let freePartsSubtotal = 0;
    
    quoteData.parts.forEach(part => {
      const partCost = parseFloat(part.price) * (part.quantity || 1);
      
      if (isGHVACWarranty) {
        if (part.category === "Materials" || (part.isCustom && part.warranty === false)) {
          partsSubtotal += partCost;
        } else {
          freePartsSubtotal += partCost;
        }
      } else {
        partsSubtotal += partCost;
      }
    });

    const materialShrinkagePercent = settings.materialShrinkagePercent || 0.03;
    const shrinkageMaterials = ['refrigerant filter dryer', 'copper', 'armaflex insulation', 'acid away'];
    
    const shrinkagePartsTotal = quoteData.parts.reduce((sum, part) => {
      const description = part.description.toLowerCase();
      const isShrinkageMaterial = shrinkageMaterials.some(material => 
        description.includes(material)
      );
      
      if (isShrinkageMaterial) {
        const partCost = parseFloat(part.price) * (part.quantity || 1);
        if (isGHVACWarranty) {
          if (part.isCustom && part.warranty === false) {
            return sum + partCost;
          }
          return sum;
        } else {
          return sum + partCost;
        }
      }
      return sum;
    }, 0);
    
    const materialShrinkageCost = shrinkagePartsTotal * materialShrinkagePercent;
    
    let materialsCost = partsSubtotal + materialShrinkageCost;
    if (isGHVACWarranty && warrantyDiscountPercent > 0) {
      materialsCost = materialsCost * warrantyDiscountPercent;
    }
    
    const adjustedPartsTotal = materialsCost;

    const hours = parseFloat(quoteData.laborHours || "1");
    let laborRate = settings.laborRate || 65;
    
    if (isGHVACWarranty && warrantyDiscountPercent > 0) {
      laborRate = laborRate * warrantyDiscountPercent;
    }
    
    const baseLaborCost = laborRate * hours;
    
    const laborBenefitsPercent = settings.laborBenefitsPercent || 0.34;
    const salesTaxPercent = settings.salesTaxPercent || 0.08;
    const warrantyReserve = settings.warrantyReserve || 25.00;
    const overheadPercent = settings.overheadPercent || 0.30;
    const profitPercent = settings.profitPercent || 0.21;
    const financingPercent = settings.financingPromotionPercent || 0.04;
    const commissionPercent = settings.commissionPercent || 0.03;
    
    const laborBenefits = baseLaborCost * laborBenefitsPercent;
    const totalLaborCost = baseLaborCost + laborBenefits;
    
    const salesTax = adjustedPartsTotal * salesTaxPercent;
    
    const directCost = adjustedPartsTotal + totalLaborCost + salesTax + warrantyReserve;
    
    const totalDeductionRate = overheadPercent + profitPercent + financingPercent + commissionPercent;
    const remainingRate = 1.0 - totalDeductionRate;
    const sellingPrice = directCost / remainingRate;
    
    // Calculate allocations based on selling price
    const overhead = sellingPrice * overheadPercent;
    const profit = sellingPrice * profitPercent;
    const financingCost = sellingPrice * financingPercent;
    const commission = sellingPrice * commissionPercent;

    return {
      partsSubtotal: partsSubtotal.toFixed(2),
      freePartsSubtotal: freePartsSubtotal.toFixed(2),
      materialShrinkage: materialShrinkageCost.toFixed(2),
      adjustedPartsTotal: adjustedPartsTotal.toFixed(2),
      baseLaborCost: baseLaborCost.toFixed(2),
      laborBenefits: laborBenefits.toFixed(2),
      totalLaborCost: totalLaborCost.toFixed(2),
      salesTax: salesTax.toFixed(2),
      warrantyReserve: warrantyReserve.toFixed(2),
      directCost: directCost.toFixed(2),
      overhead: overhead.toFixed(2),
      profit: profit.toFixed(2),
      financingCost: financingCost.toFixed(2),
      commission: commission.toFixed(2),
      total: sellingPrice.toFixed(2),
      warrantyDiscount: warrantyDiscountPercent,
      isGHVACWarranty: Boolean(isGHVACWarranty),
      // Legacy compatibility for display
      subtotal: partsSubtotal.toFixed(2),
      labor: baseLaborCost.toFixed(2),
      tax: salesTax.toFixed(2),
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
