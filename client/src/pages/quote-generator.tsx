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
import VoiceNotes from "@/components/voice-notes";
import JobNotesDisplay from "@/components/job-notes-display";
import ConditionalRequirements from "@/components/conditional-requirements";
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

  // Fetch all initial data in one optimized call
  const { data: initialData, refetch: refetchInitialData } = useQuery({
    queryKey: ["/api/initial-data"],
    staleTime: 30000, // Consider data stale after 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
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
    if (!settings || (!quoteData.parts.length && !quoteData.laborHours)) return null;

    // Check if warranty applies (GHVAC installation)
    const isGHVACWarranty = quoteData.ghvacInstalled === true && quoteData.yearsSinceInstallation;
    const warrantyYears = isGHVACWarranty ? parseInt(quoteData.yearsSinceInstallation!) : 0;
    const warrantyDiscounts = settings.warrantyDiscounts || {
      2: 0.25, 3: 0.35, 4: 0.45, 5: 0.50, 6: 0.55, 
      7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90
    };
    const warrantyDiscountPercent = isGHVACWarranty ? (warrantyDiscounts[warrantyYears] || 0) : 0;

    // Parts subtotal with warranty logic
    let partsSubtotal = 0; // Charged parts (materials + unwarrantied parts)
    let freePartsSubtotal = 0; // Track parts made free by warranty
    
    quoteData.parts.forEach(part => {
      const partCost = parseFloat(part.price) * (part.quantity || 1);
      
      if (isGHVACWarranty) {
        // For GHVAC warranty:
        // - Parts category: FREE under manufacturer warranty
        // - Materials category: NOT warrantied, charged at discount
        // - Custom parts with warranty=false: NOT warrantied, charged at discount
        
        if (part.category === "Materials" || (part.isCustom && part.warranty === false)) {
          // Materials and unwarrantied custom parts - charge at discounted rate
          partsSubtotal += partCost;
        } else {
          // Parts category - free under manufacturer warranty
          freePartsSubtotal += partCost;
        }
      } else {
        // No warranty - charge full price for all parts
        partsSubtotal += partCost;
      }
    });

    // Apply material shrinkage (3%) only to charged parts that are shrinkage materials
    const materialShrinkagePercent = settings.materialShrinkagePercent || 0.03;
    const shrinkageMaterials = ['refrigerant filter dryer', 'copper', 'armaflex insulation', 'acid away'];
    
    const shrinkagePartsTotal = quoteData.parts.reduce((sum, part) => {
      const description = part.description.toLowerCase();
      const isShrinkagematerial = shrinkageMaterials.some(material => 
        description.includes(material)
      );
      
      if (isShrinkagematerial) {
        const partCost = parseFloat(part.price) * (part.quantity || 1);
        // Only apply shrinkage to parts that are actually being charged
        if (isGHVACWarranty) {
          // Only charge shrinkage if this part isn't free under warranty
          if (part.isCustom && part.warranty === false) {
            return sum + partCost;
          }
          return sum; // Part is free, no shrinkage charge
        } else {
          return sum + partCost; // No warranty, charge shrinkage
        }
      }
      return sum;
    }, 0);
    
    const materialShrinkageCost = shrinkagePartsTotal * materialShrinkagePercent;
    
    // Materials cost (parts + shrinkage) - apply warranty pricing to materials
    // The warranty percentage represents what the customer pays, not the discount
    let materialsCost = partsSubtotal + materialShrinkageCost;
    if (isGHVACWarranty && warrantyDiscountPercent > 0) {
      materialsCost = materialsCost * warrantyDiscountPercent;
    }
    
    const adjustedPartsTotal = materialsCost;

    // Labor calculation using live Google Sheets data
    const hours = parseFloat(quoteData.laborHours || "1");
    let laborRate = settings.laborRate || 65; // Use live rate from Google Sheets
    
    // Apply warranty pricing to labor if GHVAC installation
    // The warranty percentage represents what the customer pays, not the discount
    if (isGHVACWarranty && warrantyDiscountPercent > 0) {
      laborRate = laborRate * warrantyDiscountPercent;
    }
    
    const baseLaborCost = laborRate * hours;
    
    // All percentages now come live from Google Sheets
    const laborBenefitsPercent = settings.laborBenefitsPercent || 0.34;
    const salesTaxPercent = settings.salesTaxPercent || 0.08;
    const warrantyReserve = settings.warrantyReserve || 25.00;
    const overheadPercent = settings.overheadPercent || 0.30;
    const profitPercent = settings.profitPercent || 0.21;
    const financingPercent = settings.financingPromotionPercent || 0.04;
    const commissionPercent = settings.commissionPercent || 0.03;
    
    // Labor benefits calculation
    const laborBenefits = baseLaborCost * laborBenefitsPercent;
    const totalLaborCost = baseLaborCost + laborBenefits;
    
    // Sales tax applies ONLY to parts/materials, NOT labor
    const salesTax = adjustedPartsTotal * salesTaxPercent;
    
    // Direct cost total (E40 equivalent)
    const directCost = adjustedPartsTotal + totalLaborCost + salesTax + warrantyReserve;
    
    // Core pricing formula (E46 equivalent)
    // Selling Price = Direct Costs ÷ (1 - total deduction rate)
    const totalDeductionRate = overheadPercent + profitPercent + financingPercent + commissionPercent;
    const remainingRate = 1.0 - totalDeductionRate; // 1 - 0.58 = 0.42
    const sellingPrice = directCost / remainingRate;
    
    // Calculate allocations based on selling price
    const overhead = sellingPrice * overheadPercent;
    const profit = sellingPrice * profitPercent;
    const financingCost = sellingPrice * financingPercent;
    const commission = sellingPrice * commissionPercent;

    return {
      partsSubtotal: partsSubtotal.toFixed(2),
      freePartsSubtotal: freePartsSubtotal.toFixed(2), // Track free parts value
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
      isGHVACWarranty: isGHVACWarranty,
      // Legacy compatibility for display
      subtotal: partsSubtotal.toFixed(2),
      labor: baseLaborCost.toFixed(2),
      tax: salesTax.toFixed(2),
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
                  { label: "Quote Generator", path: "/" },
                  { label: "Processes and Systems", path: "/processes" },
                ]}
              />
              <p className="text-xs text-muted-foreground hidden sm:block">Field Technician Tool</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            {location === "/" && (
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

          <VoiceNotes
            onSummaryGenerated={(summary) => handleUpdateQuoteData({ jobNotes: summary })}
          />

          {quoteData.jobNotes && (
            <JobNotesDisplay
              jobNotes={quoteData.jobNotes}
              onClear={() => handleUpdateQuoteData({ jobNotes: "" })}
              onUpdate={(updatedNotes) => handleUpdateQuoteData({ jobNotes: updatedNotes })}
            />
          )}

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
    </div>
  );
}
