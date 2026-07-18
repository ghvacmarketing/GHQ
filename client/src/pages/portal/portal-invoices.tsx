import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, FileText, CreditCard, Eye } from "lucide-react";
import { PortalLayout } from "./portal-layout";

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
            Your Invoices
          </h1>
          <p className="text-slate-500 mt-1">View and track your invoice history</p>
        </div>

        <Card className="shadow-sm" data-testid="card-invoices">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#711419]" />
              Invoice History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12" data-testid="status-no-invoices">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No invoices found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const status = statusConfig[invoice.status] || statusConfig.sent;
                      const payable = invoice.status !== "paid" && invoice.status !== "void" &&
                        parseFloat(invoice.balanceDue || "0") > 0;
                      return (
                        <TableRow
                          key={invoice.id}
                          className="cursor-pointer"
                          onClick={() => setLocation(`/portal/invoice/${invoice.id}`)}
                          data-testid={`row-invoice-${invoice.id}`}
                        >
                          <TableCell className="font-medium" data-testid={`text-invoice-number-${invoice.id}`}>
                            {invoice.invoiceNumber}
                          </TableCell>
                          <TableCell data-testid={`text-invoice-date-${invoice.id}`}>
                            {formatDate(invoice.createdAt)}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-invoice-total-${invoice.id}`}>
                            {formatCurrency(invoice.total)}
                          </TableCell>
                          <TableCell className="text-right font-semibold" data-testid={`text-invoice-balance-${invoice.id}`}>
                            {formatCurrency(invoice.balanceDue)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={status.className}
                              data-testid={`badge-invoice-status-${invoice.id}`}
                            >
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Link href={`/portal/invoice/${invoice.id}`} onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant={payable ? "default" : "ghost"}
                                size="sm"
                                className={payable
                                  ? "text-white bg-[#711419] hover:bg-[#5a1014]"
                                  : "text-[#711419] hover:text-[#711419] hover:bg-[#711419]/10"}
                                data-testid={`button-invoice-action-${invoice.id}`}
                              >
                                {payable ? (
                                  <><CreditCard className="h-4 w-4 mr-1" /> View &amp; Pay</>
                                ) : (
                                  <><Eye className="h-4 w-4 mr-1" /> View</>
                                )}
                              </Button>
                            </Link>
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
