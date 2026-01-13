import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { 
  ArrowLeft, 
  FileText, 
  MapPin, 
  Phone, 
  User,
  Send,
  Loader2,
  DollarSign,
  Tag,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Mail,
  Monitor,
  MessageSquare
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let y = margin;

      const brandColor: [number, number, number] = [113, 20, 25];
      const textColor: [number, number, number] = [30, 41, 59];
      const mutedColor: [number, number, number] = [100, 116, 139];
      const lightBg: [number, number, number] = [248, 250, 252];
      const tableRowAlt: [number, number, number] = [248, 250, 252];

      doc.setFillColor(...brandColor);
      doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F');
      
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(COMPANY_INFO.name, margin + 8, y + 12);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(220, 220, 220);
      doc.text(COMPANY_INFO.address, margin + 8, y + 20);

      doc.setFontSize(9);
      doc.text(COMPANY_INFO.phone, pageWidth - margin - 8, y + 10, { align: 'right' });
      doc.text(COMPANY_INFO.email, pageWidth - margin - 8, y + 15, { align: 'right' });
      doc.text(COMPANY_INFO.website, pageWidth - margin - 8, y + 20, { align: 'right' });
      
      y += 38;

      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brandColor);
      doc.text("QUOTE", margin, y);
      y += 12;

      const boxHeight = 32;
      doc.setFillColor(...lightBg);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'F');
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Bill To", margin + 5, y + 8);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(quote.customerName || "Customer", margin + 5, y + 15);
      
      doc.setTextColor(...mutedColor);
      let custY = y + 15;
      if (quote.customerEmail) {
        custY += 4;
        doc.text(quote.customerEmail, margin + 5, custY);
      }
      if (quote.customerPhone) {
        custY += 4;
        doc.text(quote.customerPhone, margin + 5, custY);
      }
      if (quote.serviceAddress) {
        custY += 4;
        doc.text(quote.serviceAddress.substring(0, 60), margin + 5, custY);
      }

      const detailsX = pageWidth - margin - 60;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Quote #:", detailsX, y + 8);
      doc.text("Date:", detailsX, y + 14);
      doc.text("Valid Until:", detailsX, y + 20);
      
      doc.setFont("helvetica", "normal");
      doc.text(quote.quoteNumber || "", detailsX + 30, y + 8);
      doc.text(quote.createdAt ? format(new Date(quote.createdAt), "MM/dd/yyyy") : "", detailsX + 30, y + 14);
      doc.text(quote.validUntil ? format(new Date(quote.validUntil), "MM/dd/yyyy") : "N/A", detailsX + 30, y + 20);

      y += boxHeight + 10;

      doc.setFillColor(...brandColor);
      doc.rect(margin, y, contentWidth, 10, 'F');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Line Items", margin + 5, y + 7);
      y += 10;

      const col1Width = contentWidth * 0.50;
      const col2Width = contentWidth * 0.12;
      const col3Width = contentWidth * 0.18;
      const col4Width = contentWidth * 0.20;
      
      doc.setFillColor(...lightBg);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Description", margin + 3, y + 5.5);
      doc.text("Qty", margin + col1Width + col2Width/2, y + 5.5, { align: 'center' });
      doc.text("Unit Price", margin + col1Width + col2Width + col3Width - 3, y + 5.5, { align: 'right' });
      doc.text("Amount", margin + contentWidth - 3, y + 5.5, { align: 'right' });
      y += 8;

      const lineItems = quote.lineItems || [];
      lineItems.forEach((item, index) => {
        const descLines = doc.splitTextToSize(item.description || "", col1Width - 6);
        const rowHeight = Math.max(10, descLines.length * 4 + 4);
        
        if (index % 2 === 0) {
          doc.setFillColor(...tableRowAlt);
          doc.rect(margin, y, contentWidth, rowHeight, 'F');
        }
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...textColor);
        
        let textY = y + 5;
        descLines.forEach((line: string) => {
          doc.text(line, margin + 3, textY);
          textY += 4;
        });
        
        doc.text(String(item.quantity || 1), margin + col1Width + col2Width/2, y + 5, { align: 'center' });
        doc.text(formatCurrency(item.unitPrice), margin + col1Width + col2Width + col3Width - 3, y + 5, { align: 'right' });
        doc.text(formatCurrency(item.lineTotal), margin + contentWidth - 3, y + 5, { align: 'right' });
        
        y += rowHeight;
      });

      y += 8;
      
      const totalBoxWidth = 80;
      const totalBoxX = pageWidth - margin - totalBoxWidth;
      
      doc.setFontSize(10);
      doc.setTextColor(...textColor);
      doc.text("Subtotal:", totalBoxX, y);
      doc.text(formatCurrency(quote.subtotal), pageWidth - margin, y, { align: 'right' });
      y += 6;
      
      doc.setDrawColor(...brandColor);
      doc.setLineWidth(0.5);
      doc.line(totalBoxX, y, pageWidth - margin, y);
      y += 6;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brandColor);
      doc.text("Total:", totalBoxX, y);
      doc.text(formatCurrency(quote.total), pageWidth - margin, y, { align: 'right' });

      doc.save(`Quote-${quote.quoteNumber || id}.pdf`);
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
          className="min-h-[44px]"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" data-testid="quote-number">{quote.quoteNumber}</h1>
              {quote.title && <p className="text-sm text-slate-500">{quote.title}</p>}
            </div>
          </div>
          <Badge variant="outline" className={statusInfo.className} data-testid="quote-status">
            {statusInfo.label}
          </Badge>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            className="flex-1 min-h-[44px]"
            data-testid="button-preview"
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            className="flex-1 min-h-[44px]"
            data-testid="button-download"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>

        <Card data-testid="customer-info-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-slate-600" />
              Customer Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium" data-testid="customer-name">{quote.customerName}</p>
            {quote.customerPhone && (
              <a 
                href={`tel:${quote.customerPhone}`}
                className="flex items-center text-blue-600 hover:underline min-h-[44px]"
                data-testid="customer-phone"
              >
                <Phone className="h-4 w-4 mr-2" />
                {quote.customerPhone}
              </a>
            )}
            {quote.serviceAddress && (
              <div className="flex items-start text-slate-600 min-h-[44px]">
                <MapPin className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
                <span data-testid="service-address">{quote.serviceAddress}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="line-items-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Line Items ({lineItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lineItems.length === 0 ? (
              <p className="text-sm text-slate-400 italic" data-testid="no-line-items">No line items</p>
            ) : (
              <div className="space-y-2">
                {lineItems.map((item) => {
                  const isDiscount = item.isDiscountLine || item.lineType === "discount";
                  return (
                    <div
                      key={item.id}
                      className={`border rounded-lg p-3 ${isDiscount ? "bg-amber-50 border-amber-200" : ""}`}
                      data-testid={`line-item-${item.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {isDiscount && <Tag className="h-3 w-3 text-amber-600" />}
                            <p className="text-sm font-medium text-slate-800">{item.description}</p>
                          </div>
                          <p className="text-xs text-slate-500">
                            {item.quantity} × {formatCurrency(item.unitPrice)}
                          </p>
                        </div>
                        <span className={`text-sm font-medium ${isDiscount ? "text-amber-700" : "text-slate-700"}`}>
                          {formatCurrency(item.lineTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="totals-card">
          <CardContent className="pt-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-medium" data-testid="subtotal">{formatCurrency(quote.subtotal)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-lg text-green-700" data-testid="total">{formatCurrency(quote.total)}</span>
            </div>
          </CardContent>
        </Card>

        {quote.createdAt && (
          <p className="text-xs text-slate-400 text-center" data-testid="created-date">
            Created {format(new Date(quote.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}

        {/* Present to Client button - available for draft, sent, viewed quotes */}
        {(quote.status === "draft" || quote.status === "sent" || quote.status === "viewed") && (
          <Button
            className="w-full min-h-[48px]"
            style={{ backgroundColor: '#711419' }}
            onClick={() => navigate(`/mobile/quotes/${id}/present`)}
            data-testid="button-present-quote"
          >
            <Monitor className="h-4 w-4 mr-2" />
            Present to Client
          </Button>
        )}

        {quote.status === "draft" && (
          <Button
            className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700"
            onClick={openEmailDialog}
            disabled={sendQuoteEmailMutation.isPending}
            data-testid="button-send-quote"
          >
            {sendQuoteEmailMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Send Email
          </Button>
        )}

        {quote.status === "sent" && (
          <div className="flex gap-2">
            <Button
              className="flex-1 min-h-[48px] bg-green-600 hover:bg-green-700"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              data-testid="button-accept-quote"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Accept
            </Button>
            <Button
              variant="destructive"
              className="flex-1 min-h-[48px]"
              onClick={() => declineMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              data-testid="button-decline-quote"
            >
              {declineMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Decline
            </Button>
          </div>
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
