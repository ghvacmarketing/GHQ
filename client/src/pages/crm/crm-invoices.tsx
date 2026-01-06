import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
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
  X,
  Loader2,
  Plus,
  Download,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";
import type { CrmUser, CrmCustomer, CrmJob, CrmInvoice, CrmInvoiceLineItem, CrmInvoiceStatus, CrmPayment } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InvoiceWithRelations = CrmInvoice & {
  customer?: CrmCustomer | null;
  customerName?: string | null;
  job?: CrmJob | null;
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
  usePageTitle("Invoices");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
  }, [debouncedSearch, statusFilter]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params.toString();
  }, [statusFilter]);

  const { data: invoicesResponse, isLoading: invoicesLoading } = useQuery<{ invoices: InvoiceWithRelations[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>({
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

  const invoicesData = invoicesResponse?.invoices;

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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
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
    }) => {
      const subtotal = parseFloat(data.subtotal) || 0;
      const total = subtotal;
      
      const res = await apiRequest("POST", "/api/crm/invoices", {
        customerName: data.customerName,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        serviceAddress: data.serviceAddress || null,
        description: data.description || null,
        subtotal: subtotal.toFixed(2),
        tax: "0.00",
        total: total.toFixed(2),
        balanceDue: total.toFixed(2),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowCreateDialog(false);
      setCreateForm({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        serviceAddress: "",
        description: "",
        subtotal: "",
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
        const customerName = inv.customerName?.toLowerCase() || "";
        const invoiceNumber = inv.invoiceNumber?.toLowerCase() || "";
        return customerName.includes(searchLower) || invoiceNumber.includes(searchLower);
      });
    }

    return filtered;
  }, [invoicesData, debouncedSearch]);

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

    try {
      const res = await apiRequest("POST", `/api/crm/invoices/${selectedInvoiceId}/pay`, {
        amountPaid: amount.toFixed(2),
        paymentMethod: paymentMethod,
        paymentReference: paymentNotes || undefined,
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to record payment");
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", selectedInvoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Payment recorded", description: `Payment of ${formatCurrency(amount)} recorded.` });
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentMethod("check");
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to record payment.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (invoiceDetail) {
      window.print();
    }
  };

  const handleDownloadPDF = () => {
    if (!invoiceDetail) return;

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

      // INVOICE title
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brandColor);
      doc.text("INVOICE", pageWidth - margin, y, { align: 'right' });
      y += 12;

      // Invoice details box
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
      doc.text(invoiceDetail.invoiceNumber || "", pageWidth - margin - 5, y + 3, { align: 'right' });
      doc.text(formatDate(invoiceDetail.createdAt), pageWidth - margin - 5, y + 10, { align: 'right' });
      doc.text(invoiceDetail.dueDate ? formatDate(invoiceDetail.dueDate) : "Upon Receipt", pageWidth - margin - 5, y + 17, { align: 'right' });

      // Bill To section
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Bill To:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.text(invoiceDetail.customer?.name || "Customer", margin, y + 5);
      if (invoiceDetail.customer?.phone) {
        doc.text(invoiceDetail.customer.phone, margin, y + 10);
      }
      if (invoiceDetail.customer?.email) {
        doc.text(invoiceDetail.customer.email, margin, y + 15);
      }
      y += 35;

      // Line items table
      const col1Width = contentWidth * 0.55;
      const col2Width = contentWidth * 0.15;
      const col3Width = contentWidth * 0.15;
      const col4Width = contentWidth * 0.15;

      // Table header
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

      // Table rows
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...textColor);
      let rowIndex = 0;
      
      if (invoiceDetail.lineItems && invoiceDetail.lineItems.length > 0) {
        invoiceDetail.lineItems.forEach((item) => {
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

      // Separator line
      doc.setDrawColor(...brandColor);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + contentWidth, y);
      y += 8;

      // Totals section
      const totalsX = margin + contentWidth - 80;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Subtotal:", totalsX, y);
      doc.text(formatCurrency(invoiceDetail.subtotal), margin + contentWidth - 3, y, { align: 'right' });
      y += 7;

      // Total row
      checkPageBreak(15);
      doc.setFillColor(...brandColor);
      doc.rect(totalsX - 5, y - 3, 85, 12, 'F');
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("TOTAL:", totalsX, y + 5);
      doc.text(formatCurrency(invoiceDetail.total), margin + contentWidth - 3, y + 5, { align: 'right' });
      y += 18;
      doc.setTextColor(...textColor);

      // Balance Due
      const balanceDue = parseFloat(invoiceDetail.balanceDue || "0");
      if (balanceDue > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38);
        doc.text("Balance Due:", totalsX, y);
        doc.text(formatCurrency(invoiceDetail.balanceDue), margin + contentWidth - 3, y, { align: 'right' });
        y += 10;
      } else {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);
        doc.text("PAID IN FULL", margin + contentWidth - 3, y, { align: 'right' });
        y += 10;
      }

      // Footer
      const footerY = pageHeight - 20;
      doc.setDrawColor(...brandColor);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...mutedColor);
      doc.text("Thank you for your business!", pageWidth / 2, footerY, { align: 'center' });
      doc.text("Payment is due upon receipt unless otherwise specified.", pageWidth / 2, footerY + 5, { align: 'center' });

      // Save the PDF
      const customerName = invoiceDetail.customer?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Customer';
      const fileName = `Invoice_${invoiceDetail.invoiceNumber}_${customerName}.pdf`;
      doc.save(fileName);

      toast({ title: "PDF Downloaded", description: `Invoice saved as ${fileName}` });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
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
            onClick={() => navigate("/crm/invoices/new")}
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
                      onClick={() => navigate(`/crm/invoices/${invoice.id}`)}
                    >
                      <TableCell className="font-medium text-slate-900">
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {invoice.customerName || "—"}
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
              <div className="flex gap-2">
                <Input
                  id="paymentAmount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  data-testid="input-payment-amount"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentAmount(invoiceDetail?.balanceDue || "0")}
                  data-testid="button-pay-full-balance"
                >
                  Full
                </Button>
              </div>
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
            <div className="space-y-2">
              <Label htmlFor="subtotal">Total ($)</Label>
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
            {createForm.subtotal && (
              <div className="text-right text-sm text-slate-600">
                Total: {formatCurrency(parseFloat(createForm.subtotal) || 0)}
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
