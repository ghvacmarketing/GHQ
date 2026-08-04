import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { StatusDot } from "@/components/ui/status-dot";
import { FileText, ChevronRight, ExternalLink } from "lucide-react";
import { PortalLayout, PortalHeader } from "./portal-layout";

interface PortalQuote {
  id: string;
  quoteNumber: string;
  total: string;
  subtotal: string;
  status: string;
  quoteDate: string | null;
  validUntil: string | null;
  title: string | null;
  viewToken?: string | null;
  portalCanView?: boolean;
}

interface QuotesResponse {
  quotes: PortalQuote[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700 border-green-200" },
  sent: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200" },
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700 border-red-200" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-700 border-gray-200" },
};

export default function PortalQuotes() {
  const [, setLocation] = useLocation();

  const { data: customer, error: customerError } = useQuery<{ id: string; name: string }>({
    queryKey: ["/api/portal/auth/me"],
    retry: false,
  });

  const { data: quotesData, isLoading } = useQuery<QuotesResponse>({
    queryKey: ["/api/portal/quotes"],
    enabled: !!customer,
    retry: false,
  });

  const quotes = quotesData?.quotes || [];

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <PortalLayout>
      <PortalHeader title="Quotes" subtitle="Review and accept your quotes" />

      {isLoading ? (
        <div className="space-y-2.5" data-testid="quotes-skeleton">
          <div className="skeleton-shimmer h-20 rounded-[4px] bg-slate-200" />
          <div className="skeleton-shimmer h-20 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.08s" } as React.CSSProperties} />
          <div className="skeleton-shimmer h-20 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.16s" } as React.CSSProperties} />
        </div>
      ) : quotes.length === 0 ? (
        <div className="rounded-[4px] border border-slate-300/70 bg-white py-12 text-center" data-testid="status-no-quotes">
          <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No quotes yet</p>
          <p className="mt-1 text-xs text-slate-400">Quotes we prepare for you will show up here</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {quotes.map((quote) => {
            const status = statusConfig[quote.status] || statusConfig.draft;
            const viewable = !!(quote.portalCanView && quote.viewToken);
            const pendingAction = viewable && quote.status === "sent";
            const inner = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900" data-testid={`text-quote-title-${quote.id}`}>
                      {quote.title || `Quote ${quote.quoteNumber}`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500" data-testid={`text-quote-number-${quote.id}`}>
                      {quote.quoteNumber} · {formatDate(quote.quoteDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="text-sm font-bold tabular-nums text-slate-900" data-testid={`text-quote-total-${quote.id}`}>
                      {formatCurrency(quote.total)}
                    </p>
                    {viewable && <ChevronRight className="h-4 w-4 text-slate-400" />}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <StatusDot pill={status.className} data-testid={`badge-quote-status-${quote.id}`}>
                    {status.label}
                  </StatusDot>
                  {viewable ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#711419]" data-testid={`button-view-quote-${quote.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      {pendingAction ? "View & Accept" : "View"}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400" data-testid={`text-quote-contact-${quote.id}`}>
                      Contact us to review
                    </span>
                  )}
                </div>
              </>
            );
            const rowClass = `w-full rounded-[4px] border border-slate-300/70 border-l-4 bg-white p-3.5 text-left ${pendingAction ? "border-l-amber-500" : "border-l-[#711419]"}`;
            return viewable ? (
              <button
                key={quote.id}
                onClick={() => setLocation(`/quote/${quote.viewToken}`)}
                className={`${rowClass} transition-transform active:scale-[0.99]`}
                data-testid={`row-quote-${quote.id}`}
              >
                {inner}
              </button>
            ) : (
              <div key={quote.id} className={rowClass} data-testid={`row-quote-${quote.id}`}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </PortalLayout>
  );
}
