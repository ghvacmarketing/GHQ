import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { StatusDot } from "@/components/ui/status-dot";
import { FileText, ChevronRight, CreditCard } from "lucide-react";
import { PortalLayout, PortalHeader } from "./portal-layout";

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  total: string;
  subtotal: string;
  amountPaid: string;
  balanceDue: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface InvoicesResponse {
  invoices: PortalInvoice[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-100 text-green-700 border-green-200" },
  sent: { label: "Awaiting Payment", className: "bg-amber-100 text-amber-700 border-amber-200" },
  viewed: { label: "Awaiting Payment", className: "bg-amber-100 text-amber-700 border-amber-200" },
  partial: { label: "Partially Paid", className: "bg-blue-100 text-blue-700 border-blue-200" },
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  void: { label: "Void", className: "bg-red-100 text-red-700 border-red-200" },
};

export default function PortalInvoices() {
  const [, setLocation] = useLocation();

  const { data: customer, error: customerError } = useQuery<{ id: string; name: string }>({
    queryKey: ["/api/portal/auth/me"],
    retry: false,
  });

  const { data: invoicesData, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ["/api/portal/invoices"],
    enabled: !!customer,
    retry: false,
  });

  const invoices = invoicesData?.invoices || [];

  useEffect(() => {
    if (customerError) {
      setLocation("/portal/login");
    }
  }, [customerError, setLocation]);

  const formatCurrency = (amount: string | number | null | undefined) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(isNaN(num) ? 0 : num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <PortalLayout>
      <PortalHeader title="Invoices" subtitle="View, track, and pay your invoices" />

      {isLoading ? (
        <div className="space-y-2.5" data-testid="invoices-skeleton">
          <div className="skeleton-shimmer h-20 rounded-[4px] bg-slate-200" />
          <div className="skeleton-shimmer h-20 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.08s" } as React.CSSProperties} />
          <div className="skeleton-shimmer h-20 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.16s" } as React.CSSProperties} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-[4px] border border-slate-300/70 bg-white py-12 text-center" data-testid="status-no-invoices">
          <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No invoices yet</p>
          <p className="mt-1 text-xs text-slate-400">Invoices we send you will show up here</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {invoices.map((invoice) => {
            const status = statusConfig[invoice.status] || statusConfig.sent;
            const payable = invoice.status !== "paid" && invoice.status !== "void" &&
              parseFloat(invoice.balanceDue || "0") > 0;
            return (
              <button
                key={invoice.id}
                onClick={() => setLocation(`/portal/invoice/${invoice.id}`)}
                className={`w-full rounded-[4px] border border-slate-300/70 border-l-4 bg-white p-3.5 text-left transition-transform active:scale-[0.99] ${payable ? "border-l-amber-500" : "border-l-emerald-500"}`}
                data-testid={`row-invoice-${invoice.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900" data-testid={`text-invoice-number-${invoice.id}`}>
                      Invoice {invoice.invoiceNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500" data-testid={`text-invoice-date-${invoice.id}`}>
                      {formatDate(invoice.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-slate-900" data-testid={`text-invoice-total-${invoice.id}`}>
                        {formatCurrency(invoice.total)}
                      </p>
                      {payable && (
                        <p className="text-xs font-medium tabular-nums text-amber-600" data-testid={`text-invoice-balance-${invoice.id}`}>
                          {formatCurrency(invoice.balanceDue)} due
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <StatusDot pill={status.className} data-testid={`badge-invoice-status-${invoice.id}`}>
                    {status.label}
                  </StatusDot>
                  {payable && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#711419]" data-testid={`button-invoice-action-${invoice.id}`}>
                      <CreditCard className="h-3.5 w-3.5" /> View &amp; Pay
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </PortalLayout>
  );
}
