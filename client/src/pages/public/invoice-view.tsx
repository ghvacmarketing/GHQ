import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, FileText, AlertCircle, Loader2, CreditCard, MapPin, Calendar } from "lucide-react";
import type { CrmInvoice, CrmInvoiceLineItem } from "@shared/schema";
import ghvacLogo from "@assets/ghvac-logo.png";

const BRAND_COLOR = "#711419";

interface PublicInvoiceData {
  invoice: CrmInvoice & { customerName?: string; serviceAddress?: string };
  lineItems: CrmInvoiceLineItem[];
}

function BrandLogo() {
  return (
    <div className="flex justify-center mb-6 py-6">
      <img 
        src={ghvacLogo} 
        alt="Giesbrecht HVAC" 
        className="h-20 sm:h-24 w-auto object-contain"
      />
    </div>
  );
}

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
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

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-100 text-green-700 border-green-200" },
  sent: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200" },
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  void: { label: "Void", className: "bg-red-100 text-red-700 border-red-200" },
};

function InvoicePaid({ invoice }: { invoice: CrmInvoice & { customerName?: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <BrandLogo />
        </div>

        <Card className="shadow-lg">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Invoice Paid!</h2>
            
            <p className="text-slate-600 mb-4">
              Invoice #{invoice.invoiceNumber} has been paid in full
              {invoice.paidAt && ` on ${formatDate(invoice.paidAt)}`}.
            </p>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="space-y-1 text-sm text-green-700">
                <p>Amount Paid: <strong>{formatCurrency(invoice.amountPaid)}</strong></p>
                {invoice.paymentMethod && (
                  <p>Payment Method: {invoice.paymentMethod}</p>
                )}
              </div>
            </div>
            
            <p className="text-sm text-slate-500">
              Thank you for your payment! If you have questions, please contact us at (706) 826-0644.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PublicInvoiceView() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<PublicInvoiceData>({
    queryKey: ["/api/public/invoices", token],
    queryFn: async () => {
      const response = await fetch(`/api/public/invoices/${token}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to load invoice");
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  const invoice = data?.invoice;
  const lineItems = data?.lineItems || [];
  const statusInfo = invoice ? statusConfig[invoice.status] || statusConfig.sent : null;

  const isPaymentSuccess = typeof window !== "undefined" && window.location.search.includes("payment=success");

  useEffect(() => {
    if (isPaymentSuccess && invoice?.id && invoice.status !== "paid" && !paymentVerified && !isVerifying) {
      setIsVerifying(true);
      fetch(`/api/stripe/invoice/${invoice.id}/verify-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            setPaymentVerified(true);
            refetch();
            window.history.replaceState({}, '', window.location.pathname);
          }
        })
        .catch(err => console.error("Payment verification error:", err))
        .finally(() => setIsVerifying(false));
    }
  }, [isPaymentSuccess, invoice?.id, invoice?.status, paymentVerified, isVerifying, refetch]);

  const handlePayNow = async () => {
    if (!invoice?.id) return;
    setIsGeneratingPayment(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/stripe/invoice/${invoice.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyPaid) {
          refetch();
          setPaymentError("This invoice has already been paid.");
        } else {
          setPaymentError(data.error || "Failed to generate payment link");
        }
        return;
      }
      if (data.paymentLinkUrl) {
        window.location.href = data.paymentLinkUrl;
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
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-24 w-48 mx-auto" />
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <BrandLogo />
          </div>

          <Card className="shadow-lg">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-10 w-10 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Invoice Not Found</h2>
              <p className="text-slate-600">
                {error?.message || "This invoice link is invalid or has expired."}
              </p>
              <p className="text-sm text-slate-500 mt-4">
                Please contact us at (706) 826-0644 for assistance.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (invoice.status === "paid" && !isPaymentSuccess) {
    return <InvoicePaid invoice={invoice} />;
  }

  const isPending = invoice.status === "sent" || invoice.status === "draft";
  const balanceDue = parseFloat(invoice.balanceDue?.toString() || invoice.total?.toString() || "0");

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <BrandLogo />
        </div>

        {isPaymentSuccess && (
          <Card className="shadow-lg border-0 border-l-4 border-l-green-500 bg-green-50 mb-6">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-green-800">
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

        <Card className="shadow-lg border-0">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLOR}15` }}>
                  <FileText className="h-6 w-6" style={{ color: BRAND_COLOR }} />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    Invoice #{invoice.invoiceNumber}
                  </CardTitle>
                  <p className="text-sm text-slate-500">{formatDate(invoice.createdAt)}</p>
                </div>
              </div>
              {statusInfo && (
                <Badge 
                  variant="outline" 
                  className={statusInfo.className}
                >
                  {statusInfo.label}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              {invoice.customerName && (
                <div className="flex items-start gap-3">
                  <div className="text-slate-400 mt-0.5">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Customer</p>
                    <p className="font-medium text-slate-900">
                      {invoice.customerName}
                    </p>
                  </div>
                </div>
              )}

              {invoice.serviceAddress && (
                <div className="flex items-start gap-3">
                  <div className="text-slate-400 mt-0.5">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Service Address</p>
                    <p className="font-medium text-slate-900">
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
                    <p className="font-medium text-slate-900">
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
                    <p className="font-medium text-green-700">
                      {formatDate(invoice.paidAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Line Items</h3>
              <div className="space-y-2">
                {lineItems.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex justify-between items-start py-2 border-b border-slate-100 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{item.description}</p>
                      {item.partNumber && (
                        <p className="text-xs text-slate-500">Part #: {item.partNumber}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-900">
                      {formatCurrency(item.lineTotal)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
              </div>
              {parseFloat(invoice.laborTotal?.toString() || "0") > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Labor</span>
                  <span className="font-medium">{formatCurrency(invoice.laborTotal)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span style={{ color: BRAND_COLOR }}>{formatCurrency(invoice.total)}</span>
              </div>
              {parseFloat(invoice.amountPaid?.toString() || "0") > 0 && invoice.status !== "paid" && (
                <>
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Amount Paid</span>
                    <span>-{formatCurrency(invoice.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Balance Due</span>
                    <span style={{ color: BRAND_COLOR }}>{formatCurrency(invoice.balanceDue)}</span>
                  </div>
                </>
              )}
            </div>

            {invoice.notes && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Notes</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              </>
            )}

            {isPending && balanceDue > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  {paymentError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      {paymentError}
                    </div>
                  )}
                  <Button
                    onClick={handlePayNow}
                    disabled={isGeneratingPayment}
                    className="w-full text-white py-6 text-lg"
                    style={{ backgroundColor: BRAND_COLOR }}
                  >
                    {isGeneratingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Generating Payment Link...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-5 w-5" />
                        Pay Now - {formatCurrency(balanceDue)}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-slate-500">
                    Secure payment powered by Stripe
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-slate-500">
          <p>Giesbrecht HVAC • (706) 826-0644</p>
          <p>Thank you for your business!</p>
        </div>
      </div>
    </div>
  );
}
