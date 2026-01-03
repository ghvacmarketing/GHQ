import { useEffect, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Send,
  XCircle,
  Loader2,
  FileText,
  User,
  Calendar,
  DollarSign,
  Printer,
  MapPin,
  CreditCard,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { jsPDF } from "jspdf";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmCustomer, CrmJob, CrmInvoice, CrmInvoiceLineItem, CrmInvoiceStatus, CrmPayment } from "@shared/schema";

type InvoiceDetailWithItems = CrmInvoice & {
  customer: CrmCustomer | null;
  job: CrmJob | null;
  lineItems: CrmInvoiceLineItem[];
  payments?: CrmPayment[];
};

const statusLabels: Record<CrmInvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  void: "Void",
};

const statusColors: Record<CrmInvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  void: "bg-red-100 text-red-700 border-red-200",
};

export default function CrmInvoiceDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/crm/invoices/:id");
  const invoiceId = params?.id;
  const { toast } = useToast();
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("check");
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: invoice, isLoading: invoiceLoading } = useQuery<InvoiceDetailWithItems>({
    queryKey: ["/api/crm/invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${invoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!invoiceId && !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    if (invoice && showPaymentDialog) {
      setPaymentAmount(invoice.balanceDue || "0");
    }
  }, [invoice, showPaymentDialog]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/send`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to send invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      toast({ title: "Invoice sent", description: "Invoice status updated to sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invoice", description: error.message, variant: "destructive" });
    },
  });

  const payMutation = useMutation({
    mutationFn: async (data: { amountPaid: string; paymentMethod: string; paymentReference?: string }) => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/pay`, data);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      toast({ title: "Payment recorded", description: `Payment of ${formatCurrency(parseFloat(paymentAmount))} recorded.` });
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentMethod("check");
      setPaymentNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record payment", description: error.message, variant: "destructive" });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/void`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to void invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      toast({ title: "Invoice voided", description: "Invoice has been voided." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to void invoice", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    sendMutation.mutate();
  };

  const handleRecordPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid payment amount.", variant: "destructive" });
      return;
    }
    payMutation.mutate({
      amountPaid: amount.toFixed(2),
      paymentMethod: paymentMethod,
      paymentReference: paymentNotes || undefined,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/invoices/${invoiceId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      toast({ title: "Invoice deleted", description: "Invoice has been deleted." });
      navigate("/crm/invoices");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete invoice", description: error.message, variant: "destructive" });
    },
  });

  const handleVoid = () => {
    setShowVoidConfirm(true);
  };

  const confirmVoid = () => {
    voidMutation.mutate();
    setShowVoidConfirm(false);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
    setShowDeleteConfirm(false);
  };

  const formatCurrency = (value: string | number | null) => {
    if (value === null || value === undefined) return "$0.00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch {
      return "—";
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
      const col4Width = contentWidth * 0.15;

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
      doc.text(formatCurrency(invoice.subtotal), margin + contentWidth - 3, y, { align: 'right' });
      y += 6;

      checkPageBreak(15);
      doc.setFillColor(...brandColor);
      doc.rect(totalsX - 5, y - 3, 85, 12, 'F');
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("TOTAL:", totalsX, y + 5);
      doc.text(formatCurrency(invoice.total), margin + contentWidth - 3, y + 5, { align: 'right' });
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
        doc.text(formatCurrency(invoice.balanceDue), margin + contentWidth - 3, y, { align: 'right' });
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

  if (authLoading || invoiceLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (!invoice) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="flex flex-col items-center justify-center py-20">
          <FileText className="h-12 w-12 text-slate-300 mb-4" />
          <h2 className="text-lg font-medium text-slate-700">Invoice not found</h2>
          <p className="text-slate-500 mb-4">The invoice you're looking for doesn't exist.</p>
          <Link href="/crm/invoices">
            <Button variant="outline" data-testid="link-back-invoices">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Invoices
            </Button>
          </Link>
        </div>
      </CrmLayout>
    );
  }

  const status = invoice.status as CrmInvoiceStatus;
  const isSent = status !== "draft";
  const isVoid = status === "void";
  const isPaid = status === "paid";
  const balanceDue = parseFloat(invoice.balanceDue || "0");
  const amountPaid = parseFloat(invoice.total || "0") - balanceDue;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header - Two rows for cleaner layout */}
        <div className="space-y-4">
          {/* First row: Back button, Title, Status */}
          <div className="flex items-center gap-3">
            <Link href="/crm/invoices">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-invoice-number">
              Invoice {invoice.invoiceNumber}
            </h1>
            <Badge className={`${statusColors[status]} border`} data-testid="badge-status">
              {statusLabels[status]}
            </Badge>
          </div>
          
          {/* Second row: Date and Actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500" data-testid="text-invoice-date">
              Created {formatDate(invoice.createdAt)}
            </p>
            
            <div className="flex items-center gap-2">
              {!isSent && !isVoid && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSend}
                  disabled={sendMutation.isPending}
                  data-testid="button-send"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send
                </Button>
              )}
              {!isVoid && !isPaid && (
                <Button
                  size="sm"
                  onClick={() => setShowPaymentDialog(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-record-payment"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-more-actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownloadPDF} data-testid="menu-print-pdf">
                    <Printer className="h-4 w-4 mr-2" />
                    Print PDF
                  </DropdownMenuItem>
                  {!isVoid && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={handleVoid}
                        disabled={voidMutation.isPending}
                        className="text-red-600 focus:text-red-600"
                        data-testid="menu-void"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Void Invoice
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem 
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 focus:text-red-600"
                    data-testid="menu-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium text-slate-900" data-testid="text-customer-name">
                {invoice.customer?.name || "—"}
              </p>
              {invoice.customer?.phone && (
                <p className="text-sm text-slate-600" data-testid="text-customer-phone">
                  {invoice.customer.phone}
                </p>
              )}
              {invoice.customer?.email && (
                <p className="text-sm text-slate-600" data-testid="text-customer-email">
                  {invoice.customer.email}
                </p>
              )}
            </CardContent>
          </Card>

          {invoice.customer?.fullAddress && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  Service Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-700" data-testid="text-service-address">
                  {invoice.customer.fullAddress}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              Line Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold text-center w-20">Qty</TableHead>
                  <TableHead className="font-semibold text-right w-28">Unit Price</TableHead>
                  <TableHead className="font-semibold text-right w-28">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lineItems && invoice.lineItems.length > 0 ? (
                  invoice.lineItems.map((item, index) => (
                    <TableRow key={item.id || index} data-testid={`row-line-item-${index}`}>
                      <TableCell className="font-medium">{item.description || "—"}</TableCell>
                      <TableCell className="text-center">{item.quantity || 1}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                      No line items
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-slate-500" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-medium" data-testid="text-subtotal">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center py-2">
                <span className="text-lg font-semibold text-slate-900">Total</span>
                <span className="text-lg font-bold text-slate-900" data-testid="text-total">{formatCurrency(invoice.total)}</span>
              </div>
              {amountPaid > 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-600">Amount Paid</span>
                  <span className="font-medium text-green-600" data-testid="text-amount-paid">{formatCurrency(amountPaid)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center py-2">
                <span className="text-lg font-semibold text-slate-900">Balance Due</span>
                <span className={`text-lg font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="text-balance-due">
                  {balanceDue > 0 ? formatCurrency(balanceDue) : "PAID"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap" data-testid="text-notes">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for invoice {invoice.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Amount</Label>
              <Input
                id="paymentAmount"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                data-testid="input-payment-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="paymentMethod" data-testid="select-payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentNotes">Notes (optional)</Label>
              <Textarea
                id="paymentNotes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Check #, reference, or other notes..."
                data-testid="textarea-payment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} data-testid="button-cancel-payment">
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={payMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-submit-payment"
            >
              {payMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showVoidConfirm} onOpenChange={setShowVoidConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-void">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoid}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-void"
            >
              Void Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
