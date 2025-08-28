import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Settings, History, Sun, Moon } from "lucide-react";
import CustomerInfo from "@/components/customer-info";
import PartsSelection from "@/components/parts-selection";
import SelectedParts from "@/components/selected-parts";
import WarrantySection from "@/components/warranty-section";
import QuoteActions from "@/components/quote-actions";
import QuotePreview from "@/components/quote-preview";
import CustomPartModal from "@/components/custom-part-modal";
import { apiRequest } from "@/lib/queryClient";
import type { QuotePart } from "@shared/schema";

interface QuoteData {
  customerName: string;
  technician: string;
  parts: QuotePart[];
  ghvacInstalled: boolean;
  yearsSinceInstallation?: string;
}

export default function QuoteGenerator() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [quoteData, setQuoteData] = useState<QuoteData>({
    customerName: "",
    technician: "",
    parts: [],
    ghvacInstalled: false,
    yearsSinceInstallation: "",
  });

  const [isCustomPartModalOpen, setIsCustomPartModalOpen] = useState(false);
  const [generatedQuote, setGeneratedQuote] = useState<any>(null);

  // Fetch technicians
  const { data: technicians = [] } = useQuery({
    queryKey: ["/api/technicians"],
  });

  // Fetch pricing settings
  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
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

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const calculateTotals = () => {
    if (!settings || quoteData.parts.length === 0) return null;

    const subtotal = quoteData.parts.reduce((sum, part) => 
      sum + (parseFloat(part.price) * (part.quantity || 1)), 0
    );

    let laborRate = settings.laborRate;
    if (quoteData.ghvacInstalled && quoteData.yearsSinceInstallation) {
      const years = parseInt(quoteData.yearsSinceInstallation);
      const discountFactor = Math.max(0.5, 1 - (years * settings.warrantyDiscountRate));
      laborRate = laborRate * discountFactor;
    }

    const labor = laborRate;
    const tax = (subtotal + labor) * settings.taxRate;
    const total = subtotal + labor + tax;

    return {
      subtotal: subtotal.toFixed(2),
      labor: labor.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
    };
  };

  const handleGenerateQuote = () => {
    if (!quoteData.customerName || !quoteData.technician || quoteData.parts.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields and select at least one part.",
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
      status: "draft",
      quoteText: "", // Will be generated on server
      emailSent: false,
    };

    createQuoteMutation.mutate(quotePayload);
  };

  const handleUpdateQuoteData = (updates: Partial<QuoteData>) => {
    setQuoteData(prev => ({ ...prev, ...updates }));
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

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Settings className="text-primary-foreground text-sm" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">GHVAC Quote</h1>
              <p className="text-xs text-muted-foreground">Field Technician Tool</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" data-testid="button-history">
              <History className="h-4 w-4" />
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

          <PartsSelection
            selectedParts={quoteData.parts}
            onUpdate={handleUpdateQuoteData}
            onAddCustomPart={() => setIsCustomPartModalOpen(true)}
          />

          {quoteData.parts.length > 0 && totals && (
            <SelectedParts
              parts={quoteData.parts}
              totals={totals}
              onUpdate={handleUpdateQuoteData}
            />
          )}

          <WarrantySection
            ghvacInstalled={quoteData.ghvacInstalled}
            yearsSinceInstallation={quoteData.yearsSinceInstallation}
            onUpdate={handleUpdateQuoteData}
          />

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
        onClose={() => setIsCustomPartModalOpen(false)}
        onAddPart={(part) => {
          handleUpdateQuoteData({
            parts: [...quoteData.parts, { ...part, quantity: 1 }],
          });
          setIsCustomPartModalOpen(false);
        }}
      />
    </div>
  );
}
