import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  FileText, 
  MapPin, 
  Phone, 
  User,
  Send,
  Loader2,
  DollarSign,
  Tag
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import MobileShell from "./mobile-shell";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

interface QuoteWithLineItems extends CrmQuote {
  lineItems?: CrmQuoteLineItem[];
}

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

  const { data: quote, isLoading, error } = useQuery<QuoteWithLineItems>({
    queryKey: ["/api/crm/quotes", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!id,
  });

  const sendQuoteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/crm/quotes/${id}/send`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Quote Sent", description: "Quote has been sent successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send quote", variant: "destructive" });
    },
  });

  const handleBack = () => {
    window.history.back();
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

        {quote.status === "draft" && (
          <Button
            className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700"
            onClick={() => sendQuoteMutation.mutate()}
            disabled={sendQuoteMutation.isPending}
            data-testid="button-send-quote"
          >
            {sendQuoteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Quote
          </Button>
        )}
      </div>
    </MobileShell>
  );
}
