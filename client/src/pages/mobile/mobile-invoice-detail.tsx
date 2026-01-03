import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
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
  CheckCircle2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import MobileShell from "./mobile-shell";
import type { CrmInvoice, CrmInvoiceLineItem } from "@shared/schema";

interface InvoiceWithLineItems extends CrmInvoice {
  lineItems?: CrmInvoiceLineItem[];
  customer?: { name?: string; phone?: string } | null;
  property?: { address1?: string; city?: string; state?: string; zip?: string } | null;
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

export default function MobileInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "check" | "card">("cash");
  const [paymentReference, setPaymentReference] = useState("");

  const { data: invoice, isLoading, error } = useQuery<InvoiceWithLineItems>({
    queryKey: ["/api/crm/invoices", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!id,
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/crm/invoices/${id}/send`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice Sent", description: "Invoice has been sent successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", id] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send invoice", variant: "destructive" });
    },
  });

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
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentReference("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to record payment", variant: "destructive" });
    },
  });

  const handleBack = () => {
    window.history.back();
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
  const canRecordPayment = invoice.status === "sent" || invoice.status === "partial";

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
          {invoice.status === "draft" && (
            <Button
              className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700"
              onClick={() => sendInvoiceMutation.mutate()}
              disabled={sendInvoiceMutation.isPending}
              data-testid="button-send-invoice"
            >
              {sendInvoiceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Invoice
            </Button>
          )}

          {canRecordPayment && (
            <Button
              className="w-full min-h-[48px] bg-green-600 hover:bg-green-700"
              onClick={openPaymentDialog}
              data-testid="button-record-payment"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
        </div>

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
                <Label className="text-sm font-medium">Payment Amount ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="min-h-[44px] mt-1"
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
      </div>
    </MobileShell>
  );
}
