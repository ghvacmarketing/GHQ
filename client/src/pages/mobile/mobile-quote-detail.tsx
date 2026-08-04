import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { generateQuotePdf } from "@/lib/quote-pdf";
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  Phone,
  Send,
  Loader2,
  Tag,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Mail,
  Monitor,
  MessageSquare
} from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import MobileShell from "./mobile-shell";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

type QuoteWithLineItems = Omit<CrmQuote, 'lineItems'> & {
  lineItems?: CrmQuoteLineItem[];
};

const COMPANY_INFO = {
  name: "Giesbrecht HVAC",
  address: "PO Box 917, Wrens, GA 30833",
  phone: "(706) 826-0644",
  email: "chandler@ghvacinc.com",
  website: "www.ghvacinc.com",
};

const quoteStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-300" },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700 border-green-300" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700 border-red-300" },
  expired: { label: "Expired", className: "bg-orange-100 text-orange-700 border-orange-300" },
  converted: { label: "Converted", className: "bg-purple-100 text-purple-700 border-purple-300" },
};

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

export default function MobileQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [sendViaSms, setSendViaSms] = useState(false);
  const [phoneRecipient, setPhoneRecipient] = useState("");

  const { data: quote, isLoading, error } = useQuery<QuoteWithLineItems>({
    queryKey: ["/api/crm/quotes", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!id,
  });

  const sendQuoteEmailMutation = useMutation({
    mutationFn: async (data: { recipientEmail?: string; recipientPhone?: string; sendEmail: boolean; sendSms: boolean }) => {
      const response = await apiRequest("POST", `/api/crm/quotes/${id}/send-email`, data);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to send quote");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      const methods = [];
      if (variables.sendEmail) methods.push("email");
      if (variables.sendSms) methods.push("SMS");
      const methodText = methods.join(" and ");
      toast({ title: "Quote Sent", description: `Quote has been sent via ${methodText} successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowEmailDialog(false);
      setEmailRecipient("");
      setPhoneRecipient("");
      setSendViaEmail(true);
      setSendViaSms(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send quote", variant: "destructive" });
    },
  });

  const openEmailDialog = () => {
    setEmailRecipient(quote?.customerEmail || "");
    setPhoneRecipient(quote?.customerPhone || (quote as any)?.customer?.phone || "");
    setSendViaEmail(true);
    setSendViaSms(false);
    setShowEmailDialog(true);
  };

  const handleSendEmail = () => {
    if (!sendViaEmail && !sendViaSms) {
      toast({ title: "Error", description: "Please select at least one sending method.", variant: "destructive" });
      return;
    }
    if (sendViaEmail && !emailRecipient.trim()) {
      toast({ title: "Error", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    if (sendViaSms && !phoneRecipient.trim()) {
      toast({ title: "Error", description: "Please enter a recipient phone number.", variant: "destructive" });
      return;
    }
    sendQuoteEmailMutation.mutate({
      recipientEmail: sendViaEmail ? emailRecipient.trim() : undefined,
      recipientPhone: sendViaSms ? phoneRecipient.trim() : undefined,
      sendEmail: sendViaEmail,
      sendSms: sendViaSms,
    });
  };

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${id}/accept`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to accept quote");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote Accepted", description: "Quote status updated to accepted." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to accept quote", variant: "destructive" });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${id}/decline`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to decline quote");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote Declined", description: "Quote status updated to declined." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to decline quote", variant: "destructive" });
    },
  });

  const handleBack = () => {
    if (quote?.workOrderId) {
      navigate(`/mobile/job/${quote.workOrderId}?tab=quote`);
    } else {
      navigate("/mobile");
    }
  };

  const handleDownloadPDF = () => {
    if (!quote) return;
    try {
      // Shared professional template (mirrors the invoice PDF); internal cost
      // lines never print.
      generateQuotePdf(quote as any, ((quote as any).lineItems || []) as any);
      toast({ title: "PDF Downloaded", description: "Quote PDF has been downloaded successfully." });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <MobileShell>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </MobileShell>
    );
  }

  if (error || !quote) {
    return (
      <MobileShell>
        <div className="p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4 min-h-[44px]"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-red-500" data-testid="error-message">Failed to load quote details.</p>
            </CardContent>
          </Card>
        </div>
      </MobileShell>
    );
  }

  const statusInfo = quoteStatusConfig[quote.status] || quoteStatusConfig.draft;
  const lineItems = quote.lineItems || [];

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-quote-detail">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="-ml-2 min-h-[44px] text-slate-600"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Header — the quote speaks for itself: no icon chip, and a fresh
            draft carries no status pill (the dot appears once it's sent). */}
        <div data-testid="quote-header">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="quote-number">
            {quote.title || `Quote ${quote.quoteNumber}`}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {[
              quote.title ? quote.quoteNumber : null,
              quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : null,
            ].filter(Boolean).join(" · ")}
          </p>
          {quote.status !== "draft" && (
            <div className="mt-1.5">
              <StatusDot pill={statusInfo.className} data-testid="quote-status">
                {statusInfo.label}
              </StatusDot>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[4px] border border-slate-300/70 bg-white text-sm font-semibold text-slate-700 transition-transform active:scale-[0.98]"
            data-testid="button-preview"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[4px] border border-slate-300/70 bg-white text-sm font-semibold text-slate-700 transition-transform active:scale-[0.98]"
            data-testid="button-download"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>

        {/* Customer — name up top, then real tappable rows: call and map */}
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customer-info-card">
          <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Customer
          </p>
          <div className="px-3.5 py-3">
            <p className="font-semibold text-slate-900" data-testid="customer-name">{quote.customerName}</p>
            {quote.customerEmail && (
              <p className="mt-0.5 truncate text-xs text-slate-500">{quote.customerEmail}</p>
            )}
          </div>
          {quote.customerPhone && (
            <a
              href={`tel:${quote.customerPhone}`}
              className="flex items-center gap-3 border-t border-slate-200/80 px-3.5 py-3 transition-colors active:bg-slate-50"
              data-testid="customer-phone"
            >
              <span className="shrink-0 rounded-[3px] bg-[#711419]/[0.08] p-2">
                <Phone className="h-4 w-4 text-[#711419]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{quote.customerPhone}</span>
                <span className="block text-xs text-slate-500">Tap to call</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </a>
          )}
          {quote.serviceAddress && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(quote.serviceAddress)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 border-t border-slate-200/80 px-3.5 py-3 transition-colors active:bg-slate-50"
              data-testid="service-address"
            >
              <span className="shrink-0 rounded-[3px] bg-[#711419]/[0.08] p-2">
                <MapPin className="h-4 w-4 text-[#711419]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-slate-900">{quote.serviceAddress}</span>
                <span className="block text-xs text-slate-500">Open in Maps</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </a>
          )}
        </div>

        {/* Line items — one card, totals docked as its footer */}
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="line-items-card">
          <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Line items{lineItems.length > 0 ? ` (${lineItems.length})` : ""}
          </p>
          {lineItems.length === 0 ? (
            <p className="px-3.5 py-4 text-sm italic text-slate-400" data-testid="no-line-items">No line items</p>
          ) : (
            <div>
              {lineItems.map((item, i) => {
                const isDiscount = item.isDiscountLine || item.lineType === "discount";
                return (
                  <div
                    key={item.id}
                    className={`flex items-start justify-between gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={`line-item-${item.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isDiscount && <Tag className="h-3 w-3 shrink-0 text-amber-600" />}
                        <p className="text-sm font-medium text-slate-900">{item.description}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${isDiscount ? "text-amber-700" : "text-slate-900"}`}>
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="space-y-1.5 border-t border-slate-200/80 bg-slate-50 px-3.5 py-3" data-testid="totals-card">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium tabular-nums" data-testid="subtotal">{formatCurrency(quote.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">Total</span>
              <span className="text-lg font-bold tabular-nums text-[#711419]" data-testid="total">{formatCurrency(quote.total)}</span>
            </div>
          </div>
        </div>

        {/* Present to Client button - available for draft, sent, viewed quotes */}
        {(["draft", "sent", "viewed"] as string[]).includes(quote.status) && (
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
            onClick={() => navigate(`/mobile/quotes/${id}/present`)}
            data-testid="button-present-quote"
          >
            <Monitor className="h-4 w-4" />
            Present to Client
          </button>
        )}

        {quote.status === "draft" && (
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] border border-[#711419]/30 bg-white text-base font-semibold text-[#711419] transition-transform active:scale-[0.98] disabled:opacity-60"
            onClick={openEmailDialog}
            disabled={sendQuoteEmailMutation.isPending}
            data-testid="button-send-quote"
          >
            {sendQuoteEmailMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send to Customer
          </button>
        )}

        {quote.status === "sent" && (
          <div className="flex gap-2">
            <button
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[4px] bg-green-600 text-base font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              data-testid="button-accept-quote"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Accept
            </button>
            <button
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[4px] border border-red-200 bg-white text-base font-semibold text-red-600 transition-transform active:scale-[0.98] disabled:opacity-60"
              onClick={() => declineMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              data-testid="button-decline-quote"
            >
              {declineMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Decline
            </button>
          </div>
        )}

        {quote.createdAt && (
          <p className="text-center text-xs text-slate-400" data-testid="created-date">
            Created {format(new Date(quote.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}
      </div>

      <Sheet open={showPreview} onOpenChange={setShowPreview}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Quote Preview</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-4" data-testid="quote-preview">
            <div 
              className="rounded-lg p-4 text-white"
              style={{ backgroundColor: '#711419' }}
            >
              <h2 className="text-lg font-bold">{COMPANY_INFO.name}</h2>
              <p className="text-sm opacity-90">{COMPANY_INFO.address}</p>
              <div className="mt-2 text-sm opacity-90">
                <p>{COMPANY_INFO.phone}</p>
                <p>{COMPANY_INFO.email}</p>
                <p>{COMPANY_INFO.website}</p>
              </div>
            </div>

            <h3 
              className="text-2xl font-bold"
              style={{ color: '#711419' }}
            >
              QUOTE
            </h3>

            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-semibold text-sm text-slate-600 mb-2">Bill To</h4>
              <p className="font-medium">{quote.customerName}</p>
              {quote.customerEmail && <p className="text-sm text-slate-600">{quote.customerEmail}</p>}
              {quote.customerPhone && <p className="text-sm text-slate-600">{quote.customerPhone}</p>}
              {quote.serviceAddress && <p className="text-sm text-slate-600">{quote.serviceAddress}</p>}
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-semibold text-slate-600">Quote #:</span>
                  <span className="ml-2">{quote.quoteNumber}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Date:</span>
                  <span className="ml-2">{quote.createdAt ? format(new Date(quote.createdAt), "MM/dd/yyyy") : "N/A"}</span>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold text-slate-600">Valid Until:</span>
                  <span className="ml-2">{quote.validUntil ? format(new Date(quote.validUntil), "MM/dd/yyyy") : "N/A"}</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div 
                className="p-3 text-white font-semibold text-sm"
                style={{ backgroundColor: '#711419' }}
              >
                Line Items
              </div>
              <div className="divide-y">
                <div className="grid grid-cols-12 gap-2 p-3 bg-slate-50 text-xs font-semibold text-slate-600">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-3 text-right">Amount</div>
                </div>
                {lineItems.map((item, index) => (
                  <div 
                    key={item.id} 
                    className={`grid grid-cols-12 gap-2 p-3 text-sm ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    <div className="col-span-5 text-slate-800">{item.description}</div>
                    <div className="col-span-2 text-center text-slate-600">{item.quantity}</div>
                    <div className="col-span-2 text-right text-slate-600">{formatCurrency(item.unitPrice)}</div>
                    <div className="col-span-3 text-right font-medium">{formatCurrency(item.lineTotal)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-end space-y-2 pt-4">
              <div className="flex justify-between w-48 text-sm">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
              </div>
              <Separator className="w-48" />
              <div className="flex justify-between w-48">
                <span className="font-bold" style={{ color: '#711419' }}>Total:</span>
                <span className="font-bold text-lg" style={{ color: '#711419' }}>{formatCurrency(quote.total)}</span>
              </div>
            </div>

            <div className="pt-4">
              <Button
                className="w-full min-h-[48px]"
                onClick={() => {
                  setShowPreview(false);
                  handleDownloadPDF();
                }}
                data-testid="button-download-from-preview"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Send Quote Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={(open) => { if (!open) { setShowEmailDialog(false); setEmailRecipient(""); setPhoneRecipient(""); setSendViaEmail(true); setSendViaSms(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Quote</DialogTitle>
            <DialogDescription>
              Choose how you want to send this quote to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-via-email"
                checked={sendViaEmail}
                onCheckedChange={(checked) => setSendViaEmail(checked === true)}
                data-testid="checkbox-send-via-email"
              />
              <Label htmlFor="send-via-email" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                <Mail className="h-4 w-4" />
                Send via Email
              </Label>
            </div>
            {sendViaEmail && (
              <div className="ml-6">
                <Label htmlFor="email-recipient" className="text-sm font-medium">
                  Recipient Email
                </Label>
                <Input
                  id="email-recipient"
                  type="email"
                  placeholder="customer@example.com"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  className="min-h-[44px] mt-1"
                  data-testid="input-quote-email-recipient"
                />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-via-sms"
                checked={sendViaSms}
                onCheckedChange={(checked) => setSendViaSms(checked === true)}
                data-testid="checkbox-send-via-sms"
              />
              <Label htmlFor="send-via-sms" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                <MessageSquare className="h-4 w-4" />
                Send via SMS
              </Label>
            </div>
            {sendViaSms && (
              <div className="ml-6">
                <Label htmlFor="phone-recipient" className="text-sm font-medium">
                  Recipient Phone
                </Label>
                <Input
                  id="phone-recipient"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phoneRecipient}
                  onChange={(e) => setPhoneRecipient(e.target.value)}
                  className="min-h-[44px] mt-1"
                  data-testid="input-quote-phone-recipient"
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setShowEmailDialog(false); setEmailRecipient(""); setPhoneRecipient(""); setSendViaEmail(true); setSendViaSms(false); }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
              onClick={handleSendEmail}
              disabled={sendQuoteEmailMutation.isPending || (!sendViaEmail && !sendViaSms) || (sendViaEmail && !emailRecipient.trim()) || (sendViaSms && !phoneRecipient.trim())}
              data-testid="button-confirm-send-quote"
            >
              {sendQuoteEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {sendViaEmail && sendViaSms ? "Send Both" : sendViaSms ? "Send SMS" : "Send Email"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileShell>
  );
}
