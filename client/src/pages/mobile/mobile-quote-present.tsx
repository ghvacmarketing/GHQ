import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, X, FileText, CheckCircle, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import MobileShell from "./mobile-shell";
import ghvacLogo from "@assets/ghvac-logo.png";
import {
  BRAND_COLOR,
  COMPANY_INFO,
  groupLineItemsByOption,
  formatPresentationCurrency,
  formatPresentationDate,
  parseEquipmentImages,
  PresentationEquipmentImageGrid,
  getWhatsIncludedForOption,
  PresentationSignaturePad,
  type WhatsIncludedItem,
} from "@/components/quote-presentation";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

type QuoteWithLineItems = Omit<CrmQuote, 'lineItems'> & {
  lineItems?: CrmQuoteLineItem[];
  customer?: { id: string; name: string; email?: string; phone?: string } | null;
  aiGeneratedQuote?: {
    quote_title?: string;
    package_description?: string;
    whats_included?: Array<{ category: string; items: string[] }>;
    best_for?: string;
    line_items?: Array<{ name: string; qty: number; price: number; description: string }>;
    financing_text?: string;
    warranties_and_terms?: string[];
    next_steps?: string[];
  } | null;
  quoteMode?: "single" | "options" | null;
};

export default function MobileQuotePresent() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [printedName, setPrintedName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false);

  // Quote types that require 50% deposit payment
  const DEPOSIT_QUOTE_TYPES = ["custom_install", "proposal", "custom_service"];

  const { data: quote, isLoading, error } = useQuery<QuoteWithLineItems>({
    queryKey: ["/api/crm/quotes", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!id,
  });

  const acceptInPersonMutation = useMutation({
    mutationFn: async (data: { signatureImage: string; signerName: string; selectedOption?: string | null }) => {
      const res = await fetch(`/api/crm/quotes/${id}/accept-in-person`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to accept quote");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote Accepted!", description: "The client has successfully accepted the quote." });
      navigate(`/mobile/quotes/${id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to accept quote", variant: "destructive" });
    },
    onSettled: () => {
      // Always refresh quote data after mutation attempt to catch any status changes
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
    },
  });

  const handleAcceptQuote = () => {
    if (!signature) {
      toast({ title: "Signature Required", description: "Please have the client sign above.", variant: "destructive" });
      return;
    }
    if (!printedName.trim()) {
      toast({ title: "Name Required", description: "Please enter the client's printed name.", variant: "destructive" });
      return;
    }
    if (!agreedToTerms) {
      toast({ title: "Terms Required", description: "Please agree to the terms and conditions.", variant: "destructive" });
      return;
    }
    if (quote?.quoteMode === "options" && !selectedOption) {
      toast({ title: "Selection Required", description: "Please select one of the available options.", variant: "destructive" });
      return;
    }

    acceptInPersonMutation.mutate({
      signatureImage: signature,
      signerName: printedName.trim(),
      selectedOption: selectedOption,
    });
  };

  const handleBack = () => {
    navigate(`/mobile/quotes/${id}`);
  };

  const handleExit = () => {
    navigate(`/mobile/quotes/${id}`);
  };

  const handlePayDeposit = async () => {
    if (!quote?.id) return;
    
    // Validate signature and name before proceeding to payment
    if (!signature) {
      toast({ title: "Signature Required", description: "Please have the client sign above.", variant: "destructive" });
      return;
    }
    if (!printedName.trim()) {
      toast({ title: "Name Required", description: "Please enter the client's printed name.", variant: "destructive" });
      return;
    }
    if (!agreedToTerms) {
      toast({ title: "Terms Required", description: "Please agree to the terms and conditions.", variant: "destructive" });
      return;
    }
    if (quote?.quoteMode === "options" && !selectedOption) {
      toast({ title: "Selection Required", description: "Please select one of the available options.", variant: "destructive" });
      return;
    }
    
    setPaymentLinkLoading(true);
    try {
      const response = await fetch(`/api/stripe/quote/${quote.id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          selectedOption,
          signatureImage: signature,
          signerName: printedName.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment link");
      }
      
      // Redirect to Stripe payment page
      if (data.paymentLinkUrl) {
        window.location.href = data.paymentLinkUrl;
      }
    } catch (error: any) {
      toast({ 
        title: "Payment Error", 
        description: error.message || "Failed to generate payment link", 
        variant: "destructive" 
      });
    } finally {
      setPaymentLinkLoading(false);
    }
  };

  if (isLoading) {
    return (
      <MobileShell>
        <div className="min-h-screen bg-white p-4">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-20" />
          </div>
          <Skeleton className="h-24 w-40 mx-auto mb-6" />
          <Skeleton className="h-40 w-full mb-4" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-48 w-full" />
        </div>
      </MobileShell>
    );
  }

  if (error || !quote) {
    return (
      <MobileShell>
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
          <p className="text-slate-600 mb-4">Unable to load quote</p>
          <Button onClick={handleBack} data-testid="button-back-error">
            Go Back
          </Button>
        </div>
      </MobileShell>
    );
  }

  const isAlreadyAccepted = quote.status === "accepted";
  const isDepositQuote = DEPOSIT_QUOTE_TYPES.includes(quote.quoteType?.toLowerCase() || "");

  return (
    <MobileShell>
      <div className="min-h-screen bg-white" data-testid="mobile-quote-present">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="min-h-[44px] -ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExit}
            className="min-h-[44px]"
            data-testid="button-exit"
          >
            <X className="h-4 w-4 mr-1" />
            Exit
          </Button>
        </div>

        <div className="px-4 py-6 space-y-6">
          <div className="flex justify-center py-4">
            <img 
              src={ghvacLogo} 
              alt={COMPANY_INFO.name}
              className="h-20 w-auto object-contain"
              data-testid="img-company-logo"
            />
          </div>

          <Card className="shadow-md border-0">
            <CardHeader className="text-white" style={{ backgroundColor: BRAND_COLOR }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  <CardTitle className="text-lg">Quote #{quote.quoteNumber}</CardTitle>
                </div>
                <span className="text-sm opacity-90">{formatPresentationDate(quote.createdAt)}</span>
              </div>
            </CardHeader>
            <CardContent className="py-5 space-y-5">
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-700 mb-2 text-sm uppercase tracking-wide">Prepared For</h3>
                <p className="font-medium text-slate-900 text-lg">{quote.customerName || quote.customer?.name}</p>
                {quote.serviceAddress && (
                  <p className="text-slate-600 text-sm mt-1">{quote.serviceAddress}</p>
                )}
              </div>

              {quote.quoteMode === "options" && quote.lineItems ? (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Your Home Comfort Options</h3>
                    <p className="text-sm text-slate-600">
                      Please review the options below and select the one that best fits your needs.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {groupLineItemsByOption(quote.lineItems).map((option) => {
                      const isSelected = selectedOption === option.tag;
                      const whatsIncluded = getWhatsIncludedForOption(
                        option.tag, 
                        quote.aiGeneratedQuote?.whats_included as WhatsIncludedItem[] | undefined
                      );
                      return (
                        <div 
                          key={option.tag} 
                          onClick={() => !isAlreadyAccepted && setSelectedOption(option.tag)}
                          className={`border-2 rounded-lg overflow-hidden transition-all ${
                            isAlreadyAccepted ? "cursor-default" : "cursor-pointer"
                          } ${
                            isSelected 
                              ? "border-[#711419] ring-2 ring-[#711419]/20 shadow-md" 
                              : "border-slate-200 hover:border-slate-400"
                          }`}
                          data-testid={`option-${option.tag.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <div className={`px-4 py-4 flex justify-between items-center ${isSelected ? "bg-blue-50" : "bg-gray-50"}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected ? "border-[#711419] bg-[#711419]" : "border-slate-400"
                              }`}>
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                              <span className="font-semibold text-slate-900 text-base">{option.tag}</span>
                            </div>
                            <span className="text-lg font-bold" style={{ color: BRAND_COLOR }}>
                              {formatPresentationCurrency(option.total)}
                            </span>
                          </div>
                          <div className="p-4 bg-white">
                            {whatsIncluded.categoryTitle && (
                              <div className="mb-3 pb-2 border-b border-slate-200">
                                <p className="font-semibold text-slate-800 text-sm">{whatsIncluded.categoryTitle}</p>
                              </div>
                            )}
                            
                            {option.items.map((item) => {
                              const equipmentImages = parseEquipmentImages(item.imageUrl);
                              return (
                                <div key={item.id} className="py-2 border-b border-slate-100 last:border-0">
                                  <div className="flex flex-col gap-2">
                                    {equipmentImages ? (
                                      <div className="flex-shrink-0">
                                        <PresentationEquipmentImageGrid images={equipmentImages} />
                                      </div>
                                    ) : item.imageUrl && !item.imageUrl.startsWith('{') && (
                                      <div className="flex-shrink-0">
                                        <img 
                                          src={item.imageUrl} 
                                          alt={item.description}
                                          className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      {!whatsIncluded.categoryTitle && (
                                        <div className="font-medium text-slate-800 text-sm">{item.description}</div>
                                      )}
                                      {item.partNumber && (
                                        <div className="text-xs text-slate-500">Part #: {item.partNumber}</div>
                                      )}
                                      <div className="flex justify-between items-center mt-1 text-sm text-slate-600">
                                        <span>Qty: {parseFloat(item.quantity || "1")}</span>
                                        <span className="font-medium text-slate-800">{formatPresentationCurrency(item.lineTotal)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            
                            {whatsIncluded.items.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">What's Included:</p>
                                <ul className="space-y-1">
                                  {whatsIncluded.items.map((incItem, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                                      <span className="text-[#711419] mt-0.5">•</span>
                                      <span>{incItem}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!isAlreadyAccepted && (
                    selectedOption ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                        <p className="text-green-800 font-medium">
                          Selected: <strong>{selectedOption}</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                        <p className="text-amber-800 font-medium">
                          Please select one of the options above to continue.
                        </p>
                      </div>
                    )
                  )}
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Quote Details</h3>
                    {quote.lineItems && quote.lineItems.length > 0 ? (
                      <div className="space-y-3">
                        {quote.lineItems.map((item) => (
                          <div
                            key={item.id}
                            className="border rounded-lg p-3 bg-slate-50"
                            data-testid={`line-item-${item.id}`}
                          >
                            <p className="font-medium text-slate-800 text-sm mb-2 break-words">{item.description}</p>
                            <div className="flex justify-between items-center text-sm text-slate-600">
                              <span>Qty: {item.quantity || 1}</span>
                              {item.unitPrice && (
                                <span>{formatPresentationCurrency(item.unitPrice)} each</span>
                              )}
                            </div>
                            <div className="flex justify-end mt-2 pt-2 border-t border-slate-200">
                              <span className="font-bold text-base" style={{ color: BRAND_COLOR }}>
                                {formatPresentationCurrency(item.lineTotal || "0")}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 py-8">
                        No line items
                      </div>
                    )}

                    <div className="mt-6 border-t pt-4">
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span style={{ color: BRAND_COLOR }}>{formatPresentationCurrency(quote.total)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {isAlreadyAccepted ? (
            <Card className="shadow-md border-0">
              <CardContent className="py-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Quote Already Approved</h2>
                <p className="text-slate-600 mb-4">
                  Quote #{quote.quoteNumber} was already accepted
                  {quote.signerName && ` by ${quote.signerName}`}.
                </p>
                <p className="text-sm text-slate-500">
                  This quote has already been approved and cannot be signed again.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-md border-0">
              <CardHeader>
                <CardTitle className="text-lg">Accept Quote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <PresentationSignaturePad onSignatureChange={setSignature} />

                <div className="space-y-2">
                  <Label htmlFor="printed-name">Printed Name</Label>
                  <Input
                    id="printed-name"
                    value={printedName}
                    onChange={(e) => setPrintedName(e.target.value)}
                    placeholder="Enter your full name"
                    className="min-h-[44px]"
                    data-testid="input-printed-name"
                  />
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="terms-checkbox" 
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-0.5"
                    data-testid="checkbox-terms"
                  />
                  <label 
                    htmlFor="terms-checkbox" 
                    className="text-sm text-slate-600 leading-tight cursor-pointer"
                  >
                    I agree to the terms and conditions of this quote. I authorize the work described above to be performed 
                    and agree to pay the total amount upon completion of the work.
                  </label>
                </div>

                {isDepositQuote ? (
                  <div className="space-y-3">
                    <Button
                      onClick={handlePayDeposit}
                      disabled={paymentLinkLoading || (quote.quoteMode === "options" && !selectedOption)}
                      className="w-full min-h-[56px] text-lg bg-green-600 hover:bg-green-700"
                      data-testid="button-pay-deposit"
                    >
                      {paymentLinkLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Generating Payment Link...
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-5 w-5 mr-2" />
                          Pay 50% Deposit Now
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-center text-amber-600">
                      Secure payment powered by Stripe. Remaining balance due upon completion.
                    </p>
                  </div>
                ) : (
                  <Button
                    onClick={handleAcceptQuote}
                    disabled={acceptInPersonMutation.isPending}
                    className="w-full min-h-[56px] text-lg"
                    style={{ backgroundColor: BRAND_COLOR }}
                    data-testid="button-accept-quote"
                  >
                    {acceptInPersonMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5 mr-2" />
                        Accept Quote
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <div className="text-center py-4">
            <p className="text-xs text-slate-500">
              {COMPANY_INFO.name} | {COMPANY_INFO.phone}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {COMPANY_INFO.address}
            </p>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
