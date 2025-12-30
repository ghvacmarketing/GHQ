import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  Send,
  DollarSign,
  XCircle,
  Printer,
  Calendar as CalendarIcon,
  X,
  Loader2,
  Plus,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";
import type { CrmUser, CrmCustomer, CrmJob, CrmInvoice, CrmInvoiceLineItem, CrmInvoiceStatus, CrmPayment } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InvoiceWithRelations = CrmInvoice & {
  customer: CrmCustomer | null;
  job: CrmJob | null;
};

type InvoiceDetailWithItems = CrmInvoice & {
  customer: CrmCustomer | null;
  job: CrmJob | null;
  lineItems: CrmInvoiceLineItem[];
  payments?: CrmPayment[];
};

const ITEMS_PER_PAGE = 25;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const statusLabels: Record<CrmInvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partial: "Partial",
  paid: "Paid",
  void: "Void",
};

const statusColors: Record<CrmInvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  viewed: "bg-purple-100 text-purple-700 border-purple-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  void: "bg-red-100 text-red-700 border-red-200",
};

export default function CrmInvoices() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"check" | "cash" | "other">("check");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    serviceAddress: "",
    description: "",
    subtotal: "",
    taxAmount: "",
  });

  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, startDate, endDate]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params.toString();
  }, [statusFilter]);

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<InvoiceWithRelations[]>({
    queryKey: ["/api/crm/invoices", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices${queryParams ? `?${queryParams}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: invoiceDetail, isLoading: detailLoading } = useQuery<InvoiceDetailWithItems>({
    queryKey: ["/api/crm/invoices", selectedInvoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${selectedInvoiceId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch invoice detail");
      return res.json();
    },
    enabled: !!selectedInvoiceId,
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CrmInvoice> }) => {
      const res = await apiRequest("PATCH", `/api/crm/invoices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      if (selectedInvoiceId) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", selectedInvoiceId] });
      }
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: {
      customerName: string;
      customerEmail?: string;
      customerPhone?: string;
      serviceAddress?: string;
      description?: string;
      subtotal: string;
      taxAmount: string;
    }) => {
      const subtotal = parseFloat(data.subtotal) || 0;
      const taxAmount = parseFloat(data.taxAmount) || 0;
      const total = subtotal + taxAmount;
      
      const res = await apiRequest("POST", "/api/crm/invoices", {
        customerName: data.customerName,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        serviceAddress: data.serviceAddress || null,
        description: data.description || null,
        subtotal: subtotal.toFixed(2),
        tax: taxAmount.toFixed(2),
        total: total.toFixed(2),
        balanceDue: total.toFixed(2),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      setShowCreateDialog(false);
      setCreateForm({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        serviceAddress: "",
        description: "",
        subtotal: "",
        taxAmount: "",
      });
      toast({ title: "Invoice created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create invoice", variant: "destructive" });
    },
  });

  const filteredInvoices = useMemo(() => {
    if (!invoicesData) return [];
    let filtered = [...invoicesData];

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter((inv) => {
        const customerName = inv.customer?.name?.toLowerCase() || "";
        const invoiceNumber = inv.invoiceNumber?.toLowerCase() || "";
        return customerName.includes(searchLower) || invoiceNumber.includes(searchLower);
      });
    }

    if (startDate) {
      filtered = filtered.filter((inv) => {
        if (!inv.createdAt) return false;
        return new Date(inv.createdAt) >= startDate;
      });
    }

    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter((inv) => {
        if (!inv.createdAt) return false;
        return new Date(inv.createdAt) <= endOfDay;
      });
    }

    return filtered;
  }, [invoicesData, debouncedSearch, startDate, endDate]);

  const paginatedInvoices = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInvoices, page]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);

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

  const handleSendInvoice = async (invoiceId: string) => {
    try {
      await updateInvoiceMutation.mutateAsync({ id: invoiceId, data: { status: "sent" } });
      toast({ title: "Invoice sent", description: "Invoice status updated to sent." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to send invoice.", variant: "destructive" });
    }
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    try {
      await updateInvoiceMutation.mutateAsync({ id: invoiceId, data: { status: "void" } });
      toast({ title: "Invoice voided", description: "Invoice has been voided." });
      setSelectedInvoiceId(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to void invoice.", variant: "destructive" });
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoiceId || !paymentAmount) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid payment amount.", variant: "destructive" });
      return;
    }

    const currentBalance = parseFloat(invoiceDetail?.balanceDue || "0");
    const newBalance = Math.max(0, currentBalance - amount);
    const newStatus: CrmInvoiceStatus = newBalance <= 0 ? "paid" : "partial";

    try {
      await updateInvoiceMutation.mutateAsync({
        id: selectedInvoiceId,
        data: { balanceDue: newBalance.toFixed(2), status: newStatus },
      });
      toast({ title: "Payment recorded", description: `Payment of ${formatCurrency(amount)} recorded.` });
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentNotes("");
    } catch (error) {
      toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (invoiceDetail) {
      window.print();
    }
  };

  const clearDateFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.customerName.trim()) {
      toast({ title: "Customer name is required", variant: "destructive" });
      return;
    }
    const hasPhoneError = createForm.customerPhone && !validatePhone(createForm.customerPhone);
    const hasEmailError = createForm.customerEmail && !validateEmail(createForm.customerEmail);
    if (hasPhoneError || hasEmailError) {
      toast({ title: "Please fix validation errors", variant: "destructive" });
      return;
    }
    createInvoiceMutation.mutate(createForm);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
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

  const statusTabs = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "viewed", label: "Viewed" },
    { value: "partial", label: "Partial" },
    { value: "paid", label: "Paid" },
    { value: "void", label: "Void" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Search bar at top - DoorLoop style */}
        <div className="flex justify-center mb-2">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by invoice # or customer name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
              data-testid="input-search"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-invoices-title">
              Invoices
            </h1>
            <p className="text-sm text-slate-500">Total: {filteredInvoices.length}</p>
          </div>
          <Button 
            size="sm" 
            className="bg-[#711419] hover:bg-[#5a1014] text-white" 
            onClick={() => setShowCreateDialog(true)}
            data-testid="button-create-invoice"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Invoice
          </Button>
        </div>

        {/* Tabs styled like projects page - underline style */}
        <div className="flex overflow-x-auto border-b border-slate-200">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                statusFilter === tab.value
                  ? "border-[#711419] text-[#711419]"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
              data-testid={`tab-status-${tab.value}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date filters row */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-start-date">
                <CalendarIcon className="h-3 w-3 mr-1" />
                {startDate ? format(startDate, "MMM d, yyyy") : "Start Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-end-date">
                <CalendarIcon className="h-3 w-3 mr-1" />
                {endDate ? format(endDate, "MMM d, yyyy") : "End Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDateFilters}
              className="h-8 text-xs text-slate-500"
              data-testid="button-clear-dates"
            >
              <X className="h-3 w-3 mr-1" />
              Clear Dates
            </Button>
          )}
        </div>

        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Invoice #</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-right">Total</TableHead>
                  <TableHead className="font-semibold text-right">Balance Due</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : paginatedInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No invoices found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        Try adjusting your search or filters
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedInvoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      data-testid={`row-invoice-${invoice.id}`}
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                    >
                      <TableCell className="font-medium text-slate-900">
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {invoice.customer?.name || "—"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatDate(invoice.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[invoice.status as CrmInvoiceStatus] || statusColors.draft}
                        >
                          {statusLabels[invoice.status as CrmInvoiceStatus] || invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-900">
                        {formatCurrency(invoice.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={parseFloat(invoice.balanceDue || "0") > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                          {formatCurrency(invoice.balanceDue)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {invoice.status === "draft" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleSendInvoice(invoice.id)}
                              disabled={updateInvoiceMutation.isPending}
                              data-testid={`button-send-${invoice.id}`}
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t bg-slate-50">
              <p className="text-sm text-slate-600">
                Showing {((page - 1) * ITEMS_PER_PAGE) + 1} to{" "}
                {Math.min(page * ITEMS_PER_PAGE, filteredInvoices.length)} of {filteredInvoices.length} invoices
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-slate-600 px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Sheet open={!!selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle data-testid="text-invoice-detail-title">
              Invoice {invoiceDetail?.invoiceNumber || ""}
            </SheetTitle>
            <SheetDescription>
              View invoice details and manage payments
            </SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-4 mt-6">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : invoiceDetail ? (
            <div className="space-y-6 mt-6">
              <div className="flex items-center justify-between">
                <Badge
                  variant="outline"
                  className={`text-sm ${statusColors[invoiceDetail.status as CrmInvoiceStatus] || statusColors.draft}`}
                  data-testid="badge-invoice-status"
                >
                  {statusLabels[invoiceDetail.status as CrmInvoiceStatus] || invoiceDetail.status}
                </Badge>
                <div className="flex gap-2">
                  {invoiceDetail.status === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendInvoice(invoiceDetail.id)}
                      disabled={updateInvoiceMutation.isPending}
                      data-testid="button-send-invoice"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Send
                    </Button>
                  )}
                  {!["paid", "void"].includes(invoiceDetail.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPaymentDialog(true)}
                      data-testid="button-record-payment"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Record Payment
                    </Button>
                  )}
                  {!["void", "paid"].includes(invoiceDetail.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVoidInvoice(invoiceDetail.id)}
                      disabled={updateInvoiceMutation.isPending}
                      className="text-red-600 hover:text-red-700"
                      data-testid="button-void-invoice"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Void
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrint}
                    data-testid="button-print-invoice"
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Invoice #</span>
                  <span className="font-medium" data-testid="text-invoice-number">{invoiceDetail.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date</span>
                  <span data-testid="text-invoice-date">{formatDate(invoiceDetail.createdAt)}</span>
                </div>
                {invoiceDetail.dueDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Due Date</span>
                    <span data-testid="text-invoice-due-date">{formatDate(invoiceDetail.dueDate)}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-medium" data-testid="text-invoice-customer">
                    {invoiceDetail.customer?.name || "—"}
                  </span>
                </div>
                {invoiceDetail.customer?.phone && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Phone</span>
                    <span>{invoiceDetail.customer.phone}</span>
                  </div>
                )}
                {invoiceDetail.customer?.email && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Email</span>
                    <span>{invoiceDetail.customer.email}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Line Items</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs text-right">Unit Price</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceDetail.lineItems?.length > 0 ? (
                        invoiceDetail.lineItems.map((item, idx) => (
                          <TableRow key={item.id} data-testid={`row-line-item-${idx}`}>
                            <TableCell className="text-sm">{item.description}</TableCell>
                            <TableCell className="text-sm text-right">{item.quantity}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className="text-sm text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-slate-500 py-4">
                            No line items
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span data-testid="text-invoice-subtotal">{formatCurrency(invoiceDetail.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax</span>
                  <span data-testid="text-invoice-tax">{formatCurrency(invoiceDetail.tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span data-testid="text-invoice-total">{formatCurrency(invoiceDetail.total)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Balance Due</span>
                  <span className={parseFloat(invoiceDetail.balanceDue || "0") > 0 ? "text-red-600" : "text-green-600"} data-testid="text-invoice-balance">
                    {formatCurrency(invoiceDetail.balanceDue)}
                  </span>
                </div>
              </div>

              {invoiceDetail.payments && invoiceDetail.payments.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Payment History</h3>
                  <div className="space-y-2">
                    {invoiceDetail.payments.map((payment, idx) => (
                      <div key={payment.id} className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100" data-testid={`row-payment-${idx}`}>
                        <div>
                          <span className="text-sm font-medium text-green-700">
                            {payment.provider?.toUpperCase() || "Payment"}
                          </span>
                          <span className="text-xs text-green-600 ml-2">
                            {formatDate(payment.createdAt)}
                          </span>
                        </div>
                        <span className="font-medium text-green-700">{formatCurrency(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Enter the payment details for invoice {invoiceDetail?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Amount</Label>
              <Input
                id="paymentAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                data-testid="input-payment-amount"
              />
              <p className="text-xs text-slate-500">
                Balance due: {formatCurrency(invoiceDetail?.balanceDue || null)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "check" | "cash" | "other")}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentNotes">Notes (optional)</Label>
              <Input
                id="paymentNotes"
                placeholder="Check #, reference, etc."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                data-testid="input-payment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} data-testid="button-cancel-payment">
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={!paymentAmount || updateInvoiceMutation.isPending}
              data-testid="button-confirm-payment"
            >
              {updateInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setCreateForm({
            customerName: "",
            customerEmail: "",
            customerPhone: "",
            serviceAddress: "",
            description: "",
            subtotal: "",
            taxAmount: "",
          });
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Invoice</DialogTitle>
            <DialogDescription>
              Enter customer and invoice details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                value={createForm.customerName}
                onChange={(e) => setCreateForm(prev => ({ ...prev, customerName: e.target.value }))}
                placeholder="Enter customer name"
                data-testid="input-create-customer-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={createForm.customerEmail}
                  onChange={(e) => {
                    setCreateForm(prev => ({ ...prev, customerEmail: e.target.value }));
                  }}
                  placeholder="email@example.com"
                  className={createForm.customerEmail && !validateEmail(createForm.customerEmail) ? "border-red-500" : ""}
                  data-testid="input-create-customer-email"
                />
                {createForm.customerEmail && !validateEmail(createForm.customerEmail) && (
                  <p className="text-sm text-red-500">Please enter a valid email</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={createForm.customerPhone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setCreateForm(prev => ({ ...prev, customerPhone: formatted }));
                  }}
                  placeholder="(555) 123-4567"
                  className={createForm.customerPhone && !validatePhone(createForm.customerPhone) ? "border-red-500" : ""}
                  data-testid="input-create-customer-phone"
                />
                {createForm.customerPhone && !validatePhone(createForm.customerPhone) && (
                  <p className="text-sm text-red-500">Please enter a valid phone number</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceAddress">Service Address</Label>
              <Input
                id="serviceAddress"
                value={createForm.serviceAddress}
                onChange={(e) => setCreateForm(prev => ({ ...prev, serviceAddress: e.target.value }))}
                placeholder="123 Main St, City, State"
                data-testid="input-create-service-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={createForm.description}
                onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the work performed..."
                rows={2}
                data-testid="input-create-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subtotal">Subtotal ($)</Label>
                <Input
                  id="subtotal"
                  type="number"
                  step="0.01"
                  value={createForm.subtotal}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, subtotal: e.target.value }))}
                  placeholder="0.00"
                  data-testid="input-create-subtotal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxAmount">Tax ($)</Label>
                <Input
                  id="taxAmount"
                  type="number"
                  step="0.01"
                  value={createForm.taxAmount}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, taxAmount: e.target.value }))}
                  placeholder="0.00"
                  data-testid="input-create-tax"
                />
              </div>
            </div>
            {(createForm.subtotal || createForm.taxAmount) && (
              <div className="text-right text-sm text-slate-600">
                Total: {formatCurrency((parseFloat(createForm.subtotal) || 0) + (parseFloat(createForm.taxAmount) || 0))}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-[#711419] hover:bg-[#5a1014]"
                disabled={createInvoiceMutation.isPending}
                data-testid="button-submit-create-invoice"
              >
                {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
