import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Settings, History, RotateCcw } from "lucide-react";
import { Link, useLocation } from "wouter";
import NavDropdown from "@/components/nav-dropdown";
import giesbrechtLogo from "../assets/giesbrecht-logo.webp";
import CustomerInfo from "@/components/customer-info";
import PartsSelection from "@/components/parts-selection";
import SelectedParts from "@/components/selected-parts";
import WarrantySection from "@/components/warranty-section";
import QuoteActions from "@/components/quote-actions";
import QuotePreview from "@/components/quote-preview";
import CustomPartModal from "@/components/custom-part-modal";
import QuoteDescription from "@/components/quote-description";
import ConditionalRequirements from "@/components/conditional-requirements";
import ConvertQuoteToLeadDialog from "@/components/convert-quote-to-lead-dialog";
import { apiRequest } from "@/lib/queryClient";
import type { QuotePart } from "@shared/schema";

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

export default function QuoteGenerator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();

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
  const [customPartPrefillData, setCustomPartPrefillData] = useState<any>(null);
  const [generatedQuote, setGeneratedQuote] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);

  // Fetch all initial data in one optimized call
  const { data: initialData, refetch: refetchInitialData, isLoading: isLoadingData, isError: isErrorData, error: initialDataError } = useQuery({
    queryKey: ["/api/initial-data"],
    staleTime: Infinity, // Cache for entire browser session (server has 24hr cache)
    gcTime: Infinity, // Keep in cache indefinitely
  });

  // Extract data with defaults
  const technicians = (initialData as any)?.technicians || [];
  const settings = (initialData as any)?.settings;
  const parts = (initialData as any)?.parts || [];

  // Create refetch function for settings compatibility
  const refetchSettings = refetchInitialData;

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: async (quotePayload: any) => {
      const response = await apiRequest("POST", "/api/quotes", quotePayload);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedQuote(data);
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: "Quote Generated",
        description: "Your quote has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update quote status mutation
  const updateQuoteStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/quotes/${id}`, { status });
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      const statusText = variables.status === "accepted" ? "accepted" : "pending";
      
      // Update the generatedQuote state with the new status
      if (generatedQuote) {
        setGeneratedQuote({
          ...generatedQuote,
          status: variables.status
        });
      }
      
      toast({
        title: "Quote Updated",
        description: `Quote has been marked as ${statusText}.`,
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
    
    // Calculate allocations as percentages of direct cost
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
      // Legacy compatibility for display
      subtotal: allPartsSubtotal.toFixed(2),
      labor: baseLaborCost.toFixed(2),
      tax: fullSalesTax.toFixed(2),
    };
  };

  const handleGenerateQuote = () => {
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
    
    // Clear validation errors on success
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
      status: "draft",
      quoteText: "", // Will be generated on server
      emailSent: true, // Enable automatic email notifications
    };

    createQuoteMutation.mutate(quotePayload);
  };

  const handleUpdateQuoteData = (updates: Partial<QuoteData>) => {
    setQuoteData(prev => {
      // Validate parts array if being updated
      if (updates.parts) {
        // Ensure all parts have valid IDs
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

  const handleAddRequiredParts = (newParts: QuotePart[]) => {
    if (!newParts || newParts.length === 0) return;
    
    setQuoteData(prev => {
      // Add all new parts - allow duplicates for different units
      // Each part has a unique ID so duplicates are intentional
      return {
        ...prev,
        parts: [...prev.parts, ...newParts]
      };
    });
  };

  const handleCopyQuote = async () => {
    if (!generatedQuote) return;

    try {
      const response = await fetch(`/api/quotes/${generatedQuote.id}/copy`);
      const data = await response.json();
      
      await navigator.clipboard.writeText(data.quoteText);
      toast({
        title: "Quote Copied",
        description: "Quote text has been copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy quote to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAccepted = () => {
    if (generatedQuote) {
      updateQuoteStatusMutation.mutate({
        id: generatedQuote.id,
        status: "accepted",
      });
    }
  };

  const handleMarkPending = () => {
    if (generatedQuote) {
      updateQuoteStatusMutation.mutate({
        id: generatedQuote.id,
        status: "pending",
      });
    }
  };


  const handleStartOver = () => {
    setQuoteData({
      customerName: "",
      technician: "",
      parts: [],
      ghvacInstalled: undefined,
      yearsSinceInstallation: "",
      laborHours: "",
      jobNotes: "",
    });
    setGeneratedQuote(null);
    setValidationErrors([]);
    toast({
      title: "New Quote Started",
      description: "All fields have been cleared for a new quote.",
    });
  };

  const totals = calculateTotals();

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
                currentPageTitle="Quote Generator"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation", path: "/installation" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            {location === "/quote" && (
              <Link href="/history">
                <Button variant="ghost" size="icon" data-testid="button-history" title="View quote history">
                  <History className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => window.location.href = '/admin'}
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-md md:max-w-2xl lg:max-w-4xl">
        <div className="space-y-6">
          <CustomerInfo
            customerName={quoteData.customerName}
            technician={quoteData.technician}
            technicians={technicians}
            onUpdate={handleUpdateQuoteData}
            hasErrors={{
              customerName: validationErrors.includes('customerName'),
              technician: validationErrors.includes('technician'),
            }}
          />

          <ConditionalRequirements
            selectedParts={quoteData.parts}
            onAddParts={handleAddRequiredParts}
            onAddCustomPart={(prefillData) => {
              setCustomPartPrefillData(prefillData);
              setIsCustomPartModalOpen(true);
            }}
          />

          <PartsSelection
            selectedParts={quoteData.parts}
            onUpdate={handleUpdateQuoteData}
            onAddCustomPart={(prefillData?: any) => {
              setCustomPartPrefillData(prefillData);
              setIsCustomPartModalOpen(true);
            }}
            hasPartsError={validationErrors.includes('parts')}
            availableParts={parts}
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
          />

          <QuoteDescription
            value={quoteData.jobNotes || ""}
            onChange={(value) => handleUpdateQuoteData({ jobNotes: value })}
            onClear={() => handleUpdateQuoteData({ jobNotes: "" })}
          />

          {quoteData.parts.length > 0 && totals && (
            <SelectedParts
              parts={quoteData.parts}
              totals={totals}
              onUpdate={handleUpdateQuoteData}
            />
          )}

          <QuoteActions
            onGenerateQuote={handleGenerateQuote}
            onCopyQuote={handleCopyQuote}
            onMarkAccepted={handleMarkAccepted}
            onMarkPending={handleMarkPending}
            onStartOver={handleStartOver}
            onConvertToLead={() => setIsConvertDialogOpen(true)}
            isGenerating={createQuoteMutation.isPending}
            quoteGenerated={!!generatedQuote}
            quoteStatus={generatedQuote?.status}
          />

          {generatedQuote && (
            <QuotePreview
              quote={generatedQuote}
              quoteText=""
            />
          )}
        </div>
      </main>
      <CustomPartModal
        isOpen={isCustomPartModalOpen}
        onClose={() => {
          setIsCustomPartModalOpen(false);
          setCustomPartPrefillData(null);
        }}
        onAddPart={(part) => {
          setQuoteData(prev => ({
            ...prev,
            parts: [...prev.parts, {
              ...part,
              id: part.id || `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              price: part.price || "0",
              quantity: part.quantity || 1
            }]
          }));
          // Don't close modal here - let the modal handle it
        }}
        prefillData={customPartPrefillData}
      />

      <ConvertQuoteToLeadDialog
        quote={generatedQuote}
        isOpen={isConvertDialogOpen}
        onClose={() => setIsConvertDialogOpen(false)}
        onSuccess={(leadId) => {
          toast({
            title: "Success",
            description: "Quote converted to sales lead! Redirecting to Sales Prospects...",
          });
          setTimeout(() => {
            window.location.href = "/sales-prospects";
          }, 1500);
        }}
      />
    </div>
  );
}
