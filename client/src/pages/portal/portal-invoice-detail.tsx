import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, CheckCircle2, MapPin, Calendar, CreditCard, Loader2 } from "lucide-react";
import ghvacLogo from "@assets/ghvac-logo.png";

const BRAND_COLOR = "#711419";

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  lineType: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  serviceAddress: string | null;
  total: string;
  subtotal: string;
  laborTotal: string;
  amountPaid: string;
  balanceDue: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
}

interface InvoiceResponse {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-100 text-green-700 border-green-200" },
  sent: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200" },
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  void: { label: "Void", className: "bg-red-100 text-red-700 border-red-200" },
};

function formatCurrency(amount: string | number | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(isNaN(num) ? 0 : num);
}

function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function PortalInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  const isPaymentSuccess = location.includes("payment=success");

  const { data, isLoading, error, refetch } = useQuery<InvoiceResponse>({
    queryKey: ["/api/portal/invoice", id],
    queryFn: async () => {
      const res = await fetch(`/api/portal/invoice/${id}`);
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!id,
  });

  const invoice = data?.invoice;
  const lineItems = data?.lineItems || [];
  const statusInfo = invoice ? statusConfig[invoice.status] || statusConfig.sent : null;

  // Auto-verify payment when redirected from Stripe payment success
  useEffect(() => {
    if (isPaymentSuccess && id && invoice && invoice.status !== "paid" && !paymentVerified && !isVerifying) {
      setIsVerifying(true);
      fetch(`/api/stripe/invoice/${id}/verify-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            setPaymentVerified(true);
            refetch();
          }
        })
        .catch(err => console.error("Payment verification error:", err))
        .finally(() => setIsVerifying(false));
    }
  }, [isPaymentSuccess, id, invoice, paymentVerified, isVerifying, refetch]);

  // Handle Pay Now button click - generates payment link and opens in new tab
  const handlePayNow = async () => {
    if (!invoice || !id) return;
    setIsGeneratingPayment(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/stripe/invoice/${id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyPaid) {
          refetch(); // Refresh to show updated status
          setPaymentError("This invoice has already been paid.");
        } else {
          setPaymentError(data.error || "Failed to generate payment link");
        }
        return;
      }
      if (data.paymentLinkUrl) {
        window.open(data.paymentLinkUrl, '_blank');
      } else {
        setPaymentError("No payment link returned");
      }
    } catch (err) {
      console.error('Error generating payment link:', err);
      setPaymentError("Failed to generate payment link. Please try again.");
    } finally {
      setIsGeneratingPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-24 w-48 mx-auto" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-lg border-0">
            <CardContent className="p-8 text-center">
              <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Invoice Not Found</h2>
              <p className="text-slate-500">The invoice you're looking for doesn't exist or has been removed.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-center mb-6 py-4">
          <img 
            src={ghvacLogo} 
            alt="Giesbrecht HVAC" 
            className="h-16 sm:h-20 w-auto object-contain"
          />
        </div>

        {isPaymentSuccess && (
          <Card className="shadow-lg border-0 border-l-4 border-l-green-500 bg-green-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-green-800" data-testid="text-payment-success">
                    Payment Successful!
                  </h2>
                  <p className="text-green-700">
                    Thank you for your payment. A confirmation email will be sent shortly.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isPaymentSuccess && invoice.status === "paid" && (
          <Card className="shadow-lg border-0 border-l-4 border-l-green-500 bg-green-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-green-800" data-testid="text-already-paid">
                    Invoice Already Paid
                  </h2>
                  <p className="text-green-700">
                    This invoice has been paid in full. Thank you for your payment!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg border-0" data-testid="card-invoice">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLOR}15` }}>
                  <FileText className="h-6 w-6" style={{ color: BRAND_COLOR }} />
                </div>
                <div>
                  <CardTitle className="text-xl" data-testid="text-invoice-number">
                    Invoice #{invoice.invoiceNumber}
                  </CardTitle>
                  <p className="text-sm text-slate-500">{formatDate(invoice.createdAt)}</p>
                </div>
              </div>
              {statusInfo && (
                <Badge 
                  variant="outline" 
                  className={statusInfo.className}
                  data-testid="badge-status"
                >
                  {statusInfo.label}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="text-slate-400 mt-0.5">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Customer</p>
                  <p className="font-medium text-slate-900" data-testid="text-customer-name">
                    {invoice.customerName}
                  </p>
                  {invoice.customerEmail && (
                    <p className="text-sm text-slate-600">{invoice.customerEmail}</p>
                  )}
                </div>
              </div>

              {invoice.serviceAddress && (
                <div className="flex items-start gap-3">
                  <div className="text-slate-400 mt-0.5">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Service Address</p>
                    <p className="font-medium text-slate-900" data-testid="text-service-address">
                      {invoice.serviceAddress}
                    </p>
                  </div>
                </div>
              )}

              {invoice.dueDate && (
                <div className="flex items-start gap-3">
                  <div className="text-slate-400 mt-0.5">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Due Date</p>
                    <p className="font-medium text-slate-900" data-testid="text-due-date">
                      {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                </div>
              )}

              {invoice.paidAt && (
                <div className="flex items-start gap-3">
                  <div className="text-green-500 mt-0.5">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Paid On</p>
                    <p className="font-medium text-green-700" data-testid="text-paid-date">
                      {formatDate(invoice.paidAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {lineItems.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900">Line Items</h3>
                <div className="space-y-2">
                  {lineItems.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex justify-between items-start py-2 border-b border-slate-100 last:border-0"
                      data-testid={`line-item-${item.id}`}
                    >
                      <div className="flex-1">
                        <p className="text-slate-900">{item.description}</p>
                        <p className="text-sm text-slate-500">
                          {parseFloat(item.quantity)} x {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <p className="font-medium text-slate-900 ml-4">
                        {formatCurrency(item.lineTotal)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="text-slate-900" data-testid="text-subtotal">
                  {formatCurrency(invoice.subtotal)}
                </span>
              </div>
              {parseFloat(invoice.laborTotal || "0") > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Labor</span>
                  <span className="text-slate-900" data-testid="text-labor">
                    {formatCurrency(invoice.laborTotal)}
                  </span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold text-lg">
                <span className="text-slate-900">Total</span>
                <span className="text-slate-900" data-testid="text-total">
                  {formatCurrency(invoice.total)}
                </span>
              </div>
              {parseFloat(invoice.amountPaid || "0") > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Amount Paid</span>
                  <span data-testid="text-amount-paid">
                    -{formatCurrency(invoice.amountPaid)}
                  </span>
                </div>
              )}
              {parseFloat(invoice.balanceDue || "0") > 0 && (
                <div className="flex justify-between font-semibold text-lg mt-2 pt-2 border-t">
                  <span className="text-slate-900">Balance Due</span>
                  <span style={{ color: BRAND_COLOR }} data-testid="text-balance-due">
                    {formatCurrency(invoice.balanceDue)}
                  </span>
                </div>
              )}
            </div>

            {/* Pay Now Button - only show when invoice is unpaid and has balance */}
            {invoice.status !== "paid" && invoice.status !== "void" && parseFloat(invoice.balanceDue || "0") > 0 && !isPaymentSuccess && (
              <div className="mt-6">
                {paymentError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {paymentError}
                  </div>
                )}
                <Button 
                  onClick={handlePayNow}
                  disabled={isGeneratingPayment}
                  className="w-full text-white"
                  style={{ backgroundColor: BRAND_COLOR }}
                  data-testid="button-pay-now"
                >
                  {isGeneratingPayment ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Payment Link...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Pay Now - {formatCurrency(invoice.balanceDue)}
                    </>
                  )}
                </Button>
              </div>
            )}

            {invoice.notes && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Notes</h3>
                  <p className="text-slate-600 text-sm whitespace-pre-wrap" data-testid="text-notes">
                    {invoice.notes}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-sm text-slate-500 py-4">
          <p>Giesbrecht HVAC</p>
          <p>Thank you for your business!</p>
        </div>
      </div>
    </div>
  );
}
