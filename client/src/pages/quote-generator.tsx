import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Settings, History, RefreshCw } from "lucide-react";
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

  const [quoteData, setQuoteData] = useState<QuoteData>({
    customerName: "",
    technician: "",
    parts: [],
    ghvacInstalled: undefined,
    yearsSinceInstallation: "",
    laborHours: "1",
    jobNotes: "",
  });

  const [isCustomPartModalOpen, setIsCustomPartModalOpen] = useState(false);
  const [customPartPrefillData, setCustomPartPrefillData] = useState<any>(null);
  const [generatedQuote, setGeneratedQuote] = useState<any>(null);

  // Fetch technicians
  const { data: technicians = [] } = useQuery({
    queryKey: ["/api/technicians"],
  });

  // Fetch pricing settings with automatic refresh
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ["/api/settings"],
    staleTime: 30000, // Consider data stale after 30 seconds
    cacheTime: 60000, // Keep in cache for 1 minute
  });

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
      toast({
        title: "Quote Updated",
        description: `Quote has been marked as ${statusText}.`,
      });
    },
  });


  const calculateTotals = () => {
    if (!settings || (!quoteData.parts.length && !quoteData.laborHours)) return null;

    // Parts subtotal
    const partsSubtotal = quoteData.parts.reduce((sum, part) => 
      sum + (parseFloat(part.price) * (part.quantity || 1)), 0
    );

    // Labor calculation using live Google Sheets data
    const hours = parseFloat(quoteData.laborHours || "1");
    let laborRate = settings.laborRate || 65; // Use live rate from Google Sheets
    
    // Apply warranty discount if GHVAC installation
    if (quoteData.ghvacInstalled === true && quoteData.yearsSinceInstallation) {
      const years = parseInt(quoteData.yearsSinceInstallation);
      // Use live warranty discounts from Google Sheets
      const warrantyDiscounts = settings.warrantyDiscounts || {
        2: 0.25, 3: 0.35, 4: 0.45, 5: 0.50, 6: 0.55, 
        7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90
      };
      const discountPercent = warrantyDiscounts[years] || 0;
      laborRate = laborRate * (1 - discountPercent);
    }
    
    const totalLabor = laborRate * hours;
    
    // All percentages now come live from Google Sheets
    const laborBenefitsPercent = settings.laborBenefitsPercent || 0.34;
    const salesTaxPercent = settings.salesTaxPercent || 0.08;
    const warrantyReserve = settings.warrantyReserve || 25.00;
    const overheadPercent = settings.overheadPercent || 0.30;
    const profitPercent = settings.profitPercent || 0.21;
    const financingPercent = settings.financingPromotionPercent || 0.04;
    const commissionPercent = settings.commissionPercent || 0.03;
    
    // Calculations using live data
    const laborBenefits = totalLabor * laborBenefitsPercent;
    const salesTax = (partsSubtotal + totalLabor + laborBenefits) * salesTaxPercent;
    
    // Direct cost total
    const directCost = partsSubtotal + totalLabor + laborBenefits + salesTax + warrantyReserve;
    
    // Final calculations
    const overhead = directCost * overheadPercent;
    const profit = directCost * profitPercent;
    const financingCost = directCost * financingPercent;
    const commission = directCost * commissionPercent;
    
    // Final selling price
    const sellingPrice = directCost + overhead + profit + financingCost + commission;

    return {
      partsSubtotal: partsSubtotal.toFixed(2),
      totalLabor: totalLabor.toFixed(2),
      laborBenefits: laborBenefits.toFixed(2),
      salesTax: salesTax.toFixed(2),
      warrantyReserve: warrantyReserve.toFixed(2),
      directCost: directCost.toFixed(2),
      overhead: overhead.toFixed(2),
      profit: profit.toFixed(2),
      financingCost: financingCost.toFixed(2),
      commission: commission.toFixed(2),
      total: sellingPrice.toFixed(2),
      // Legacy compatibility
      subtotal: partsSubtotal.toFixed(2),
      labor: totalLabor.toFixed(2),
      tax: salesTax.toFixed(2),
    };
  };

  const handleGenerateQuote = () => {
    if (!quoteData.customerName || !quoteData.technician || quoteData.parts.length === 0 || quoteData.ghvacInstalled === undefined) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields including warranty coverage.",
        variant: "destructive",
      });
      return;
    }

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
      emailSent: false,
    };

    createQuoteMutation.mutate(quotePayload);
  };

  const handleUpdateQuoteData = (updates: Partial<QuoteData>) => {
    setQuoteData(prev => ({ ...prev, ...updates }));
  };

  const handleAddRequiredParts = (newParts: QuotePart[]) => {
    setQuoteData(prev => {
      // Merge new parts with existing, avoiding duplicates
      const existingIds = prev.parts.map(p => p.id);
      const partsToAdd = newParts.filter(p => !existingIds.includes(p.id));
      return {
        ...prev,
        parts: [...prev.parts, ...partsToAdd]
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

  const handleRefreshPricing = async () => {
    try {
      await refetchSettings();
      toast({
        title: "Pricing Refreshed",
        description: "Latest pricing data loaded from Google Sheets.",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh pricing data. Please try again.",
        variant: "destructive",
      });
    }
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <img 
              src={giesbrechtLogo} 
              alt="Giesbrecht HVAC" 
              className="h-10 w-auto object-contain"
              data-testid="img-company-logo"
            />
            <div>
              <h1 className="text-lg font-semibold text-foreground">Quote Generator</h1>
              <p className="text-xs text-muted-foreground">Field Technician Tool</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleRefreshPricing}
              data-testid="button-refresh-pricing"
              title="Refresh pricing from Google Sheets"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" data-testid="button-history">
              <History className="h-4 w-4" />
            </Button>
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

      <main className="container mx-auto px-4 py-6 max-w-md">
        <div className="space-y-6">
          <CustomerInfo
            customerName={quoteData.customerName}
            technician={quoteData.technician}
            technicians={technicians}
            onUpdate={handleUpdateQuoteData}
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
            onAddCustomPart={(prefillData) => {
              setCustomPartPrefillData(prefillData);
              setIsCustomPartModalOpen(true);
            }}
          />

          <WarrantySection
            ghvacInstalled={quoteData.ghvacInstalled}
            yearsSinceInstallation={quoteData.yearsSinceInstallation}
            laborHours={quoteData.laborHours}
            onUpdate={handleUpdateQuoteData}
          />

          <VoiceNotes
            onSummaryGenerated={(summary) => handleUpdateQuoteData({ jobNotes: summary })}
          />

          {quoteData.jobNotes && (
            <JobNotesDisplay
              jobNotes={quoteData.jobNotes}
              onClear={() => handleUpdateQuoteData({ jobNotes: "" })}
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
            isGenerating={createQuoteMutation.isPending}
            quoteGenerated={!!generatedQuote}
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
          handleUpdateQuoteData({
            parts: [...quoteData.parts, part],
          });
          setIsCustomPartModalOpen(false);
          setCustomPartPrefillData(null);
        }}
        prefillData={customPartPrefillData}
      />
    </div>
  );
}
