import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Receipt, ExternalLink } from "lucide-react";
import { PortalLayout } from "./portal-layout";

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
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/portal/dashboard">
            <Button variant="ghost" size="sm" className="text-slate-600" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900" data-testid="text-page-title">
            Your Quotes
          </h1>
          <p className="text-slate-500 mt-1">View and manage your quote history</p>
        </div>

        <Card className="shadow-sm" data-testid="card-quotes">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Receipt className="h-5 w-5 text-[#711419]" />
              Quote History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-12" data-testid="status-no-quotes">
                <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No quotes found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="[&_td]:py-4 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-slate-400">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quote #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((quote) => {
                      const status = statusConfig[quote.status] || statusConfig.draft;
                      return (
                        <TableRow key={quote.id} data-testid={`row-quote-${quote.id}`}>
                          <TableCell className="font-medium" data-testid={`text-quote-number-${quote.id}`}>
                            {quote.quoteNumber}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" data-testid={`text-quote-title-${quote.id}`}>
                            {quote.title || "—"}
                          </TableCell>
                          <TableCell data-testid={`text-quote-date-${quote.id}`}>
                            {formatDate(quote.quoteDate)}
                          </TableCell>
                          <TableCell className="text-right font-medium" data-testid={`text-quote-total-${quote.id}`}>
                            {formatCurrency(quote.total)}
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusDot 
                              pill={status.className}
                              data-testid={`badge-quote-status-${quote.id}`}
                            >
                              {status.label}
                            </StatusDot>
                          </TableCell>
                          <TableCell className="text-center">
                            {quote.portalCanView && quote.viewToken ? (
                              <Link href={`/quote/${quote.viewToken}`}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[#711419] hover:text-[#711419] hover:bg-[#711419]/10"
                                  data-testid={`button-view-quote-${quote.id}`}
                                >
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  {quote.status === "sent" ? "View & Accept" : "View"}
                                </Button>
                              </Link>
                            ) : (
                              <span className="text-xs text-slate-400" data-testid={`text-quote-contact-${quote.id}`}>
                                Contact us to review
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
