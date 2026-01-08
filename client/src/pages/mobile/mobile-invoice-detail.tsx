import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { 
  ArrowLeft, 
  Receipt, 
  MapPin, 
  Phone, 
  User,
  Send,
  Loader2,
  DollarSign,
  Tag,
  CreditCard,
  CheckCircle2,
  Download,
  Eye,
  Ban,
  Mail
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import MobileShell from "./mobile-shell";
import type { CrmInvoice, CrmInvoiceLineItem, CrmUser } from "@shared/schema";

interface InvoiceWithLineItems extends CrmInvoice {
  lineItems?: CrmInvoiceLineItem[];
  customer?: { name?: string; phone?: string; email?: string; fullAddress?: string } | null;
  property?: { address1?: string; city?: string; state?: string; zip?: string } | null;
  taxTotal?: string | null;
}

const invoiceStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-300" },
  paid: { label: "Paid", className: "bg-green-100 text-green-700 border-green-300" },
  void: { label: "Void", className: "bg-red-100 text-red-700 border-red-300" },
  partial: { label: "Partial", className: "bg-amber-100 text-amber-700 border-amber-300" },
};

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  try {
    return format(new Date(date), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

export default function MobileInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "check" | "card">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: invoice, isLoading, error } = useQuery<InvoiceWithLineItems>({
    queryKey: ["/api/crm/invoices", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!id,
  });

  const sendInvoiceEmailMutation = useMutation({
    mutationFn: async (recipientEmail: string) => {
      const response = await apiRequest("POST", `/api/crm/invoices/${id}/send-email`, {
        recipientEmail,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to send invoice email");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Email Sent", description: "Invoice email has been sent successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowEmailDialog(false);
      setEmailRecipient("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send invoice email", variant: "destructive" });
    },
  });

  const openEmailDialog = () => {
    const customerEmail = invoice?.customer?.email || invoice?.customerEmail || "";
    setEmailRecipient(customerEmail);
    setShowEmailDialog(true);
  };

  const handleSendEmail = () => {
    if (!emailRecipient.trim()) {
      toast({ title: "Error", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    sendInvoiceEmailMutation.mutate(emailRecipient.trim());
  };

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: { amountPaid: number; paymentMethod: string; paymentReference?: string }) => {
      const response = await apiRequest("POST", `/api/crm/invoices/${id}/pay`, {
        amountPaid: data.amountPaid,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Payment Recorded", description: "Payment has been recorded successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentReference("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to record payment", variant: "destructive" });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/invoices/${id}/void`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to void invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Invoice Voided", description: "Invoice has been voided." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to void invoice", variant: "destructive" });
    },
  });

  const handleBack = () => {
    if (invoice?.workOrderId) {
      navigate(`/mobile/job/${invoice.workOrderId}?tab=invoice`);
    } else {
      navigate("/mobile");
    }
  };

  const openPaymentDialog = () => {
    if (invoice) {
      const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");
      setPaymentAmount(balanceDue.toFixed(2));
      setPaymentMethod("cash");
      setPaymentReference("");
      setShowPaymentDialog(true);
    }
  };

  const handleRecordPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid payment amount.", variant: "destructive" });
      return;
    }
    recordPaymentMutation.mutate({
      amountPaid: amount,
      paymentMethod: paymentMethod,
      paymentReference: paymentReference || undefined,
    });
  };

  const handleVoid = () => {
    setShowVoidConfirm(true);
  };

  const confirmVoid = () => {
    voidMutation.mutate();
    setShowVoidConfirm(false);
  };

  const handleTakePayment = async () => {
    if (!invoice || !id) return;
    
    const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");
    if (balanceDue <= 0) {
      toast({ title: "No Balance Due", description: "This invoice has already been paid.", variant: "destructive" });
      return;
    }
    
    setIsGeneratingPaymentLink(true);
    try {
      const response = await fetch(`/api/stripe/invoice/${id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to create payment link");
      }
      
      if (result.paymentLinkUrl) {
        window.location.href = result.paymentLinkUrl;
      } else {
        throw new Error("No payment link received");
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create payment link", 
        variant: "destructive" 
      });
      setIsGeneratingPaymentLink(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!invoice) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let y = margin;

      const brandColor: [number, number, number] = [113, 20, 25];
      const textColor: [number, number, number] = [30, 41, 59];
      const mutedColor: [number, number, number] = [100, 116, 139];
      const lightBg: [number, number, number] = [248, 250, 252];

      const addPageHeader = () => {
        doc.setFillColor(...brandColor);
        doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F');
        
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("Giesbrecht HVAC", margin + 8, y + 12);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(220, 220, 220);
        doc.text("PO Box 917, Wrens, GA 30833", margin + 8, y + 20);

        doc.setFontSize(9);
        doc.text("(706) 826-0644", pageWidth - margin - 8, y + 10, { align: 'right' });
        doc.text("chandler@ghvacinc.com", pageWidth - margin - 8, y + 15, { align: 'right' });
        doc.text("www.ghvacinc.com", pageWidth - margin - 8, y + 20, { align: 'right' });
      };

      const checkPageBreak = (neededSpace: number) => {
        if (y + neededSpace > pageHeight - 35) {
          doc.addPage();
          y = margin;
          addPageHeader();
          y += 35;
        }
      };

      addPageHeader();
      y += 35;

      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brandColor);
      doc.text("INVOICE", pageWidth - margin, y, { align: 'right' });
      y += 12;

      doc.setFillColor(...lightBg);
      doc.roundedRect(pageWidth - margin - 70, y - 5, 70, 28, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...mutedColor);
      doc.text("Invoice #:", pageWidth - margin - 65, y + 3);
      doc.text("Date:", pageWidth - margin - 65, y + 10);
      doc.text("Due Date:", pageWidth - margin - 65, y + 17);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text(invoice.invoiceNumber || "", pageWidth - margin - 5, y + 3, { align: 'right' });
      doc.text(formatDate(invoice.createdAt), pageWidth - margin - 5, y + 10, { align: 'right' });
      doc.text(invoice.dueDate ? formatDate(invoice.dueDate) : "Upon Receipt", pageWidth - margin - 5, y + 17, { align: 'right' });

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Bill To:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.text(invoice.customer?.name || "Customer", margin, y + 5);
      if (invoice.customer?.phone) {
        doc.text(String(invoice.customer.phone), margin, y + 10);
      }
      if (invoice.customer?.email) {
        doc.text(String(invoice.customer.email), margin, y + 15);
      }
      if (invoice.customer?.fullAddress) {
        doc.text(invoice.customer.fullAddress, margin, y + 20);
      }
      y += 40;

      const col1Width = contentWidth * 0.55;
      const col2Width = contentWidth * 0.15;
      const col3Width = contentWidth * 0.15;

      doc.setFillColor(...brandColor);
      doc.rect(margin, y, contentWidth, 10, 'F');
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Description", margin + 3, y + 7);
      doc.text("Qty", margin + col1Width + col2Width / 2, y + 7, { align: 'center' });
      doc.text("Unit Price", margin + col1Width + col2Width + col3Width / 2, y + 7, { align: 'center' });
      doc.text("Amount", margin + contentWidth - 3, y + 7, { align: 'right' });
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...textColor);
      let rowIndex = 0;
      
      if (invoice.lineItems && invoice.lineItems.length > 0) {
        invoice.lineItems.forEach((item) => {
          const descLines = doc.splitTextToSize(item.description || "", col1Width - 6);
          const rowHeight = Math.max(8, descLines.length * 4 + 4);
          
          checkPageBreak(rowHeight + 2);
          if (rowIndex % 2 === 0) {
            doc.setFillColor(...lightBg);
            doc.rect(margin, y, contentWidth, rowHeight, 'F');
          }
          
          doc.setFontSize(9);
          let textY = y + 5;
          descLines.forEach((line: string) => {
            doc.text(line, margin + 3, textY);
            textY += 4;
          });
          
          doc.text(String(item.quantity || 1), margin + col1Width + col2Width / 2, y + 5, { align: 'center' });
          doc.text(formatCurrency(item.unitPrice), margin + col1Width + col2Width + col3Width / 2, y + 5, { align: 'center' });
          doc.text(formatCurrency(item.lineTotal), margin + contentWidth - 3, y + 5, { align: 'right' });
          
          y += rowHeight;
          rowIndex++;
        });
      }

      doc.setDrawColor(...brandColor);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + contentWidth, y);
      y += 8;

      const totalsX = margin + contentWidth - 80;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Subtotal:", totalsX, y);
      doc.text(formatCurrency(invoice.subtotal || "0"), margin + contentWidth - 3, y, { align: 'right' });
      y += 6;

      if (invoice.taxTotal && parseFloat(invoice.taxTotal) > 0) {
        doc.text("Tax:", totalsX, y);
        doc.text(formatCurrency(invoice.taxTotal), margin + contentWidth - 3, y, { align: 'right' });
        y += 6;
      }

      checkPageBreak(15);
      doc.setFillColor(...brandColor);
      doc.rect(totalsX - 5, y - 3, 85, 12, 'F');
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("TOTAL:", totalsX, y + 5);
      doc.text(formatCurrency(invoice.total || "0"), margin + contentWidth - 3, y + 5, { align: 'right' });
      y += 18;
      doc.setTextColor(...textColor);

      const amountPaid = parseFloat(invoice.total || "0") - parseFloat(invoice.balanceDue || "0");
      if (amountPaid > 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Amount Paid:", totalsX, y);
        doc.text(formatCurrency(amountPaid), margin + contentWidth - 3, y, { align: 'right' });
        y += 8;
      }

      const balanceDue = parseFloat(invoice.balanceDue || "0");
      if (balanceDue > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38);
        doc.text("Balance Due:", totalsX, y);
        doc.text(formatCurrency(invoice.balanceDue || "0"), margin + contentWidth - 3, y, { align: 'right' });
        y += 10;
      } else {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);
        doc.text("PAID IN FULL", margin + contentWidth - 3, y, { align: 'right' });
        y += 10;
      }

      const footerY = pageHeight - 20;
      doc.setDrawColor(...brandColor);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...mutedColor);
      doc.text("Thank you for your business!", pageWidth / 2, footerY, { align: 'center' });
      doc.text("Payment is due upon receipt unless otherwise specified.", pageWidth / 2, footerY + 5, { align: 'center' });

      const customerName = (invoice.customer?.name || "Customer").replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Invoice_${invoice.invoiceNumber}_${customerName}.pdf`;
      doc.save(fileName);

      toast({ title: "PDF Downloaded", description: `Invoice saved as ${fileName}` });
    } catch (error) {
      console.error("Error generating PDF:", error);
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

  if (error || !invoice) {
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
              <p className="text-red-500" data-testid="error-message">Failed to load invoice details.</p>
            </CardContent>
          </Card>
        </div>
      </MobileShell>
    );
  }

  const statusInfo = invoiceStatusConfig[invoice.status] || invoiceStatusConfig.draft;
  const lineItems = invoice.lineItems || [];
  const isPaid = invoice.status === "paid";
  const isPartial = invoice.status === "partial";
  const isVoid = invoice.status === "void";
  const canTakePayment = invoice.status === "draft" || invoice.status === "sent" || invoice.status === "partial";
  const canVoid = currentUser && (currentUser.role === "owner" || currentUser.role === "admin") && !isVoid;

  const amountPaid = parseFloat(invoice.total || "0") - parseFloat(invoice.balanceDue || "0");

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-invoice-detail">
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
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" data-testid="invoice-number">{invoice.invoiceNumber}</h1>
            </div>
          </div>
          <Badge variant="outline" className={statusInfo.className} data-testid="invoice-status">
            {statusInfo.label}
          </Badge>
        </div>

        {invoice.customer && (
          <Card data-testid="customer-info-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-slate-600" />
                Customer Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invoice.customer.name && (
                <p className="font-medium" data-testid="customer-name">{invoice.customer.name}</p>
              )}
              {invoice.customer.phone && (
                <a 
                  href={`tel:${invoice.customer.phone}`}
                  className="flex items-center text-blue-600 hover:underline min-h-[44px]"
                  data-testid="customer-phone"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  {invoice.customer.phone}
                </a>
              )}
              {invoice.property && (
                <div className="flex items-start text-slate-600 min-h-[44px]">
                  <MapPin className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
                  <span data-testid="service-address">
                    {[invoice.property.address1, invoice.property.city, invoice.property.state, invoice.property.zip].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card data-testid="payment-status-card">
          <CardContent className="pt-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-medium" data-testid="subtotal">{formatCurrency(invoice.subtotal || "0")}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-lg text-green-700" data-testid="total">{formatCurrency(invoice.total || "0")}</span>
            </div>

            {(isPaid || isPartial) && (
              <>
                <Separator />
                <div className={`rounded-lg p-3 ${isPaid ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {isPaid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <DollarSign className="h-4 w-4 text-amber-600" />
                    )}
                    <span className={`text-sm font-medium ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>
                      Payment Status
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Amount Paid</span>
                      <span className="font-medium text-green-700" data-testid="amount-paid">{formatCurrency(invoice.amountPaid || "0")}</span>
                    </div>
                    {!isPaid && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Balance Due</span>
                        <span className="font-medium text-red-600" data-testid="balance-due">{formatCurrency(invoice.balanceDue || "0")}</span>
                      </div>
                    )}
                    {invoice.paidAt && (
                      <p className="text-xs text-slate-500 mt-1">
                        Paid on {format(new Date(invoice.paidAt), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {!isPaid && !isPartial && parseFloat(invoice.balanceDue || invoice.total || "0") > 0 && (
              <>
                <Separator />
                <div className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <span className="text-sm text-amber-700">Balance Due</span>
                  <span className="font-semibold text-amber-800" data-testid="balance-due">
                    {formatCurrency(invoice.balanceDue || invoice.total || "0")}
                  </span>
                </div>
              </>
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

        {invoice.createdAt && (
          <p className="text-xs text-slate-400 text-center" data-testid="created-date">
            Created {format(new Date(invoice.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 min-h-[48px]"
              onClick={() => setShowPreviewSheet(true)}
              data-testid="button-preview"
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button
              variant="outline"
              className="flex-1 min-h-[48px]"
              onClick={handleDownloadPDF}
              data-testid="button-download"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>

          {invoice.status === "draft" && (
            <Button
              className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700"
              onClick={openEmailDialog}
              disabled={sendInvoiceEmailMutation.isPending}
              data-testid="button-send-invoice"
            >
              {sendInvoiceEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Send Email
            </Button>
          )}

          {canTakePayment && (
            <div className="flex flex-col gap-2">
              <Button
                className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700"
                onClick={handleTakePayment}
                disabled={isGeneratingPaymentLink}
                data-testid="button-take-payment"
              >
                {isGeneratingPaymentLink ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Take Card Payment
              </Button>
              <Button
                variant="outline"
                className="w-full min-h-[48px]"
                onClick={openPaymentDialog}
                data-testid="button-record-payment"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Record Cash/Check
              </Button>
            </div>
          )}

          {canVoid && (
            <Button
              variant="outline"
              className="w-full min-h-[48px] text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              onClick={handleVoid}
              disabled={voidMutation.isPending}
              data-testid="button-void"
            >
              {voidMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Ban className="h-4 w-4 mr-2" />
              )}
              Void Invoice
            </Button>
          )}
        </div>

        <Sheet open={showPreviewSheet} onOpenChange={setShowPreviewSheet}>
          <SheetContent side="bottom" className="h-[90vh] p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>Invoice Preview</SheetTitle>
              <SheetDescription>
                Preview of {invoice.invoiceNumber}
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(90vh-80px)]">
              <div className="p-4">
                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                  <div className="p-4 text-white" style={{ backgroundColor: '#711419' }}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-bold">Giesbrecht HVAC</h2>
                        <p className="text-sm opacity-90">PO Box 917, Wrens GA 30833</p>
                      </div>
                      <div className="text-right text-sm opacity-90">
                        <p>706-826-0644</p>
                        <p>chandler@ghvacinc.com</p>
                        <p>www.ghvacinc.com</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-lg font-bold" style={{ color: '#711419' }}>INVOICE</h3>
                      </div>
                      <div className="text-right text-sm bg-slate-50 p-3 rounded">
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-600">Invoice #:</span>
                          <span className="font-medium">{invoice.invoiceNumber}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-600">Date:</span>
                          <span className="font-medium">{formatDate(invoice.createdAt)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-600">Due Date:</span>
                          <span className="font-medium">{invoice.dueDate ? formatDate(invoice.dueDate) : "Upon Receipt"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-slate-700 mb-1">Bill To:</h4>
                      <p className="font-medium">{invoice.customer?.name || "Customer"}</p>
                      {invoice.customer?.phone && <p className="text-sm text-slate-600">{invoice.customer.phone}</p>}
                      {invoice.customer?.email && <p className="text-sm text-slate-600">{invoice.customer.email}</p>}
                      {invoice.customer?.fullAddress && <p className="text-sm text-slate-600">{invoice.customer.fullAddress}</p>}
                    </div>

                    <table className="w-full mb-4">
                      <thead>
                        <tr className="text-white text-sm" style={{ backgroundColor: '#711419' }}>
                          <th className="py-2 px-2 text-left">Description</th>
                          <th className="py-2 px-2 text-center">Qty</th>
                          <th className="py-2 px-2 text-right">Unit Price</th>
                          <th className="py-2 px-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, idx) => (
                          <tr key={item.id} className={idx % 2 === 0 ? "bg-slate-50" : ""}>
                            <td className="py-2 px-2 text-sm">{item.description}</td>
                            <td className="py-2 px-2 text-sm text-center">{item.quantity}</td>
                            <td className="py-2 px-2 text-sm text-right">{formatCurrency(item.unitPrice)}</td>
                            <td className="py-2 px-2 text-sm text-right">{formatCurrency(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="border-t pt-3" style={{ borderColor: '#711419' }}>
                      <div className="flex justify-end">
                        <div className="w-48 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Subtotal:</span>
                            <span>{formatCurrency(invoice.subtotal || "0")}</span>
                          </div>
                          <div className="flex justify-between font-bold text-white p-2 rounded" style={{ backgroundColor: '#711419' }}>
                            <span>TOTAL:</span>
                            <span>{formatCurrency(invoice.total || "0")}</span>
                          </div>
                          {amountPaid > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Amount Paid:</span>
                              <span className="text-green-600">{formatCurrency(amountPaid)}</span>
                            </div>
                          )}
                          {parseFloat(invoice.balanceDue || "0") > 0 ? (
                            <div className="flex justify-between font-semibold">
                              <span className="text-red-600">Balance Due:</span>
                              <span className="text-red-600">{formatCurrency(invoice.balanceDue || "0")}</span>
                            </div>
                          ) : (
                            <div className="text-center font-bold mt-2" style={{ color: '#711419' }}>
                              PAID IN FULL
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="border-t mt-6 pt-4 text-center text-xs text-slate-500" style={{ borderColor: '#711419' }}>
                      <p className="italic">Thank you for your business!</p>
                      <p>Payment is due upon receipt unless otherwise specified.</p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-green-600" />
                Record Payment
              </DialogTitle>
              <DialogDescription>
                Record a payment for invoice {invoice.invoiceNumber}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Amount ($)</Label>
                <Input
                  type="text"
                  value={formatCurrency(parseFloat(invoice?.total || "0"))}
                  readOnly
                  className="min-h-[44px] mt-1 bg-slate-50 cursor-not-allowed"
                  data-testid="input-payment-amount"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}>
                  <SelectTrigger className="min-h-[44px] mt-1" data-testid="select-payment-method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Reference (optional)</Label>
                <Input
                  placeholder="Check #, Transaction ID, etc."
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="min-h-[44px] mt-1"
                  data-testid="input-payment-reference"
                />
              </div>
            </div>
            
            <DialogFooter className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowPaymentDialog(false)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button 
                className="bg-green-600 hover:bg-green-700 min-h-[44px]"
                onClick={handleRecordPayment}
                disabled={recordPaymentMutation.isPending}
                data-testid="button-confirm-payment"
              >
                {recordPaymentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Record Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showVoidConfirm} onOpenChange={setShowVoidConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Void Invoice</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to void invoice {invoice.invoiceNumber}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 min-h-[44px]"
                onClick={confirmVoid}
                data-testid="button-confirm-void"
              >
                Void Invoice
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Send Invoice Email Dialog */}
        <Dialog open={showEmailDialog} onOpenChange={(open) => { if (!open) { setShowEmailDialog(false); setEmailRecipient(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send Invoice Email</DialogTitle>
              <DialogDescription>
                Enter the email address where you want to send this invoice.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="invoice-email-recipient" className="text-sm font-medium">
                  Recipient Email
                </Label>
                <Input
                  id="invoice-email-recipient"
                  type="email"
                  placeholder="customer@example.com"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  className="min-h-[44px] mt-1"
                  data-testid="input-invoice-email-recipient"
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => { setShowEmailDialog(false); setEmailRecipient(""); }}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                onClick={handleSendEmail}
                disabled={sendInvoiceEmailMutation.isPending || !emailRecipient.trim()}
                data-testid="button-confirm-send-invoice-email"
              >
                {sendInvoiceEmailMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MobileShell>
  );
}
