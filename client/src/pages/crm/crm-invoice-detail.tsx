import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  ArrowLeft,
  Send,
  XCircle,
  Loader2,
  FileText,
  User,
  Calendar,
  DollarSign,
  Printer,
  MapPin,
  CreditCard,
  Trash2,
  MoreHorizontal,
  Mail,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownLeft,
  Inbox,
  Pencil,
  Check,
  X,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { jsPDF } from "jspdf";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmCustomer, CrmJob, CrmInvoice, CrmInvoiceLineItem, CrmInvoiceStatus, CrmPayment, InvoiceEmailLog } from "@shared/schema";
import { PaymentLinkButton } from "@/components/stripe-payment-link-button";
import RichTextEditor, { RichTextDisplay } from "@/components/rich-text-editor";

type InvoiceDetailWithItems = CrmInvoice & {
  customer: CrmCustomer | null;
  job: CrmJob | null;
  lineItems: CrmInvoiceLineItem[];
  payments?: CrmPayment[];
};

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

export default function CrmInvoiceDetail() {
  usePageTitle("Invoice Detail");
  const [, navigate] = useLocation();
  const [, params] = useRoute("/crm/invoices/:id");
  const invoiceId = params?.id;
  const { toast } = useToast();
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("check");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [showSendEmailDialog, setShowSendEmailDialog] = useState(false);
  const [sendEmailRecipient, setSendEmailRecipient] = useState("");
  const [sendEmailMessage, setSendEmailMessage] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [sendViaSms, setSendViaSms] = useState(false);
  const [sendPhoneRecipient, setSendPhoneRecipient] = useState("");
  const [expandedEmailIds, setExpandedEmailIds] = useState<Set<string>>(new Set());
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [editingLineItemData, setEditingLineItemData] = useState<{ description: string; quantity: string; unitPrice: string }>({ description: "", quantity: "", unitPrice: "" });
  const [showAddLineItemDialog, setShowAddLineItemDialog] = useState(false);
  const [newLineItemData, setNewLineItemData] = useState<{ description: string; quantity: string; unitPrice: string }>({ description: "", quantity: "1", unitPrice: "" });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: invoice, isLoading: invoiceLoading } = useQuery<InvoiceDetailWithItems>({
    queryKey: ["/api/crm/invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${invoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!invoiceId && !!currentUser,
  });

  const { data: emailLogs = [], isLoading: emailLogsLoading } = useQuery<InvoiceEmailLog[]>({
    queryKey: ["/api/crm/invoices", invoiceId, "email-logs"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${invoiceId}/email-logs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch email logs");
      return res.json();
    },
    enabled: !!invoiceId && !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    if (invoice && showPaymentDialog) {
      setPaymentAmount(invoice.balanceDue || "0");
    }
  }, [invoice, showPaymentDialog]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/send`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to send invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Invoice sent", description: "Invoice status updated to sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invoice", description: error.message, variant: "destructive" });
    },
  });

  const payMutation = useMutation({
    mutationFn: async (data: { amountPaid: string; paymentMethod: string; paymentReference?: string }) => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/pay`, data);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Payment recorded", description: `Payment of ${formatCurrency(parseFloat(paymentAmount))} recorded.` });
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentMethod("check");
      setPaymentNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record payment", description: error.message, variant: "destructive" });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/void`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to void invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Invoice voided", description: "Invoice has been voided." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to void invoice", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    sendMutation.mutate();
  };

  const handleRecordPayment = () => {
    const amount = parseFloat(invoice?.total || "0");
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Invoice has no valid amount.", variant: "destructive" });
      return;
    }
    payMutation.mutate({
      amountPaid: amount.toFixed(2),
      paymentMethod: paymentMethod,
      paymentReference: paymentNotes || undefined,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/invoices/${invoiceId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete invoice");
      }
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/invoices"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["/api/crm/invoices"] });
      queryClient.setQueriesData({ queryKey: ["/api/crm/invoices"] }, (old: any) => {
        if (!old?.invoices) return old;
        return { ...old, invoices: old.invoices.filter((inv: any) => inv.id !== invoiceId) };
      });
      navigate("/crm/invoices");
      return { snapshots };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Invoice deleted", description: "Invoice has been deleted." });
    },
    onError: (error: Error, _vars, context: any) => {
      context?.snapshots?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      toast({ title: "Failed to delete invoice", description: error.message, variant: "destructive" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/send-email`, {
        recipientEmail: sendViaEmail ? sendEmailRecipient : undefined,
        recipientPhone: sendViaSms ? sendPhoneRecipient : undefined,
        personalMessage: sendEmailMessage || undefined,
        sendEmail: sendViaEmail,
        sendSms: sendViaSms,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to send invoice");
      }
      const result = await res.json();
      return result as { success: boolean; successCount: number; totalCount: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId, "email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowSendEmailDialog(false);
      setSendEmailRecipient("");
      setSendEmailMessage("");
      setSendPhoneRecipient("");
      setSendViaEmail(true);
      setSendViaSms(false);
      const methods: string[] = [];
      if (sendViaEmail) methods.push("email");
      if (sendViaSms) methods.push("SMS");
      const methodStr = methods.join(" and ");
      const description = data.totalCount > 1 
        ? `Invoice sent via ${methodStr} to ${data.successCount} of ${data.totalCount} recipients.`
        : `The invoice has been sent via ${methodStr}.`;
      toast({ title: "Invoice sent!", description });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invoice", description: error.message, variant: "destructive" });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async ({ lineItemId, data }: { lineItemId: string; data: { description: string; quantity: number; unitPrice: string } }) => {
      const res = await apiRequest("PATCH", `/api/crm/invoices/${invoiceId}/line-items/${lineItemId}`, data);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update line item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      setEditingLineItemId(null);
      setEditingLineItemData({ description: "", quantity: "", unitPrice: "" });
      toast({ title: "Line item updated", description: "The line item has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update line item", description: error.message, variant: "destructive" });
    },
  });

  const addLineItemMutation = useMutation({
    mutationFn: async (data: { description: string; quantity: number; unitPrice: string }) => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/line-items`, data);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to add line item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      setShowAddLineItemDialog(false);
      setNewLineItemData({ description: "", quantity: "1", unitPrice: "" });
      toast({ title: "Line item added", description: "The line item has been added successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add line item", description: error.message, variant: "destructive" });
    },
  });

  const handleStartEditLineItem = (item: CrmInvoiceLineItem) => {
    setEditingLineItemId(item.id);
    setEditingLineItemData({
      description: item.description || "",
      quantity: String(item.quantity || 1),
      unitPrice: String(item.unitPrice || "0"),
    });
  };

  const handleCancelEditLineItem = () => {
    setEditingLineItemId(null);
    setEditingLineItemData({ description: "", quantity: "", unitPrice: "" });
  };

  const handleSaveLineItem = () => {
    if (!editingLineItemId) return;
    const quantity = parseFloat(editingLineItemData.quantity) || 1;
    const unitPrice = editingLineItemData.unitPrice;
    updateLineItemMutation.mutate({
      lineItemId: editingLineItemId,
      data: {
        description: editingLineItemData.description,
        quantity,
        unitPrice,
      },
    });
  };

  const handleAddLineItem = () => {
    const quantity = parseFloat(newLineItemData.quantity) || 1;
    addLineItemMutation.mutate({
      description: newLineItemData.description,
      quantity,
      unitPrice: newLineItemData.unitPrice,
    });
  };

  const calculateEditingTotal = () => {
    const qty = parseFloat(editingLineItemData.quantity) || 0;
    const price = parseFloat(editingLineItemData.unitPrice) || 0;
    return qty * price;
  };

  const calculateNewLineItemTotal = () => {
    const qty = parseFloat(newLineItemData.quantity) || 0;
    const price = parseFloat(newLineItemData.unitPrice) || 0;
    return qty * price;
  };

  const handleVoid = () => {
    setShowVoidConfirm(true);
  };

  const confirmVoid = () => {
    voidMutation.mutate();
    setShowVoidConfirm(false);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
    setShowDeleteConfirm(false);
  };

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

  const handleDownloadPDF = () => {
    if (!invoice) return;

    try {
      // Template: brand-color company header, thick rule, BILL TO / Issued-Due
      // rows, bordered items table with a grey header row, and a Balance Due
      // line in brand color.
      const doc = new jsPDF();
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 16;
      const CW = W - M * 2;

      const MAROON: [number, number, number] = [113, 20, 25];
      const INK: [number, number, number] = [17, 24, 39];
      const SLATE: [number, number, number] = [107, 114, 128];
      const BORDER: [number, number, number] = [229, 231, 235];
      const HEADBG: [number, number, number] = [248, 249, 250];

      const totalNum = parseFloat(invoice.total || "0");
      const balanceNum = parseFloat(invoice.balanceDue || "0");
      const amountPaid = totalNum - balanceNum;

      let y = 22;

      // ── Header: company (brand color) left, INVOICE right ──
      doc.setFontSize(19);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MAROON);
      doc.text("Giesbrecht HVAC", M, y);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SLATE);
      doc.text("PO Box 917, Wrens, GA 30833", M, y + 6);

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text("INVOICE", W - M, y, { align: "right" });
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SLATE);
      doc.text(invoice.invoiceNumber || "", W - M, y + 6, { align: "right" });

      // Thick brand rule
      y += 11;
      doc.setFillColor(...MAROON);
      doc.rect(M, y, CW, 1.4, "F");
      y += 9;

      // ── BILL TO (left) · Issued / Due (right) ──
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...SLATE);
      doc.text("BILL TO", M, y, { charSpace: 0.6 });
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(invoice.customer?.name || "Customer", M, y + 6);
      let by = y + 11;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SLATE);
      if (invoice.customer?.fullAddress) {
        const addr = doc.splitTextToSize(String(invoice.customer.fullAddress), CW * 0.55);
        addr.forEach((line: string) => { doc.text(line, M, by); by += 4.2; });
      }
      if (invoice.customer?.phone) { doc.text(String(invoice.customer.phone), M, by); by += 4.2; }

      doc.setFontSize(9);
      doc.setTextColor(...SLATE);
      doc.text(`Issued: ${formatDate(invoice.createdAt)}`, W - M, y + 1, { align: "right" });
      doc.text(`Due: ${invoice.dueDate ? formatDate(invoice.dueDate) : "Upon receipt"}`, W - M, y + 6.5, { align: "right" });

      y = Math.max(by, y + 14) + 6;

      // ── Job title line (when the invoice is tied to a job) ──
      const jobTitle = (invoice as any).workOrder?.title || (invoice as any).jobTitle || null;
      if (jobTitle) {
        doc.setFontSize(11.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...INK);
        doc.text(String(jobTitle), M, y);
        y += 7;
      }

      // ── Items table (bordered, grey header row) ──
      const colQtyW = 18;
      const colUnitW = 30;
      const colAmtW = 32;
      const colDescW = CW - colQtyW - colUnitW - colAmtW;
      const xDesc = M;
      const xQty = M + colDescW;
      const xUnit = xQty + colQtyW;
      const xAmt = xUnit + colUnitW;

      const drawRowBorders = (yy: number, h: number) => {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.25);
        doc.rect(xDesc, yy, colDescW, h);
        doc.rect(xQty, yy, colQtyW, h);
        doc.rect(xUnit, yy, colUnitW, h);
        doc.rect(xAmt, yy, colAmtW, h);
      };

      const tableHeader = (yy: number): number => {
        const h = 8;
        doc.setFillColor(...HEADBG);
        doc.rect(M, yy, CW, h, "F");
        drawRowBorders(yy, h);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...SLATE);
        doc.text("Description", xDesc + 2.5, yy + 5.3);
        doc.text("Qty", xQty + colQtyW - 2.5, yy + 5.3, { align: "right" });
        doc.text("Unit", xUnit + colUnitW - 2.5, yy + 5.3, { align: "right" });
        doc.text("Amount", xAmt + colAmtW - 2.5, yy + 5.3, { align: "right" });
        return yy + h;
      };

      const continuation = (): number => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...MAROON);
        doc.text("Giesbrecht HVAC", M, 14);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...SLATE);
        doc.text(`INVOICE ${invoice.invoiceNumber || ""} — continued`, W - M, 14, { align: "right" });
        doc.setFillColor(...MAROON);
        doc.rect(M, 17, CW, 0.8, "F");
        return 24;
      };

      y = tableHeader(y);
      const ensureSpace = (needed: number, repeatHeader: boolean) => {
        if (y + needed > H - 28) {
          doc.addPage();
          y = continuation();
          if (repeatHeader) y = tableHeader(y);
        }
      };

      doc.setFont("helvetica", "normal");
      (invoice.lineItems || []).forEach((item) => {
        doc.setFontSize(9);
        const descLines = doc.splitTextToSize(item.description || "", colDescW - 5);
        const rowH = Math.max(8, descLines.length * 4 + 4);
        ensureSpace(rowH + 2, true);
        drawRowBorders(y, rowH);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...INK);
        let ty = y + 5.2;
        descLines.forEach((line: string) => { doc.text(line, xDesc + 2.5, ty); ty += 4; });
        doc.text(String(item.quantity || 1), xQty + colQtyW - 2.5, y + 5.2, { align: "right" });
        doc.text(formatCurrency(item.unitPrice), xUnit + colUnitW - 2.5, y + 5.2, { align: "right" });
        doc.text(formatCurrency(item.lineTotal), xAmt + colAmtW - 2.5, y + 5.2, { align: "right" });
        y += rowH;
      });

      // ── Totals (right column, template style) ──
      y += 6;
      ensureSpace(40, false);
      const labX = xUnit;
      const valX = W - M;
      const totalsRow = (lab: string, val: string) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...SLATE);
        doc.text(lab, labX, y);
        doc.setTextColor(...INK);
        doc.text(val, valX, y, { align: "right" });
        y += 5.5;
      };
      totalsRow("Subtotal", formatCurrency(invoice.subtotal));
      totalsRow("Tax", formatCurrency(0));
      totalsRow("Total", formatCurrency(invoice.total));
      if (amountPaid > 0) totalsRow("Paid", `-${formatCurrency(amountPaid)}`);

      // brand rule above Balance Due
      doc.setFillColor(...MAROON);
      doc.rect(labX, y - 2.5, W - M - labX, 0.7, "F");
      y += 3.5;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text("Balance Due", labX, y);
      doc.setTextColor(...MAROON);
      doc.text(formatCurrency(invoice.balanceDue), valX, y, { align: "right" });
      y += 8;

      if (balanceNum <= 0 && totalNum > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(21, 128, 61);
        doc.text("PAID IN FULL", valX, y, { align: "right", charSpace: 0.6 });
        y += 6;
      }

      // ── Notes ──
      if (invoice.notes && String(invoice.notes).trim()) {
        ensureSpace(20, false);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...SLATE);
        doc.text("NOTES", M, y, { charSpace: 0.6 });
        y += 4.5;
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        const noteLines = doc.splitTextToSize(String(invoice.notes).trim(), CW * 0.7);
        noteLines.forEach((line: string) => {
          ensureSpace(5, false);
          doc.text(line, M, y);
          y += 4.2;
        });
      }

      // ── Footer ──
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.25);
        doc.line(M, H - 16, W - M, H - 16);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...SLATE);
        doc.text("Giesbrecht HVAC  ·  (706) 826-0644  ·  www.ghvac.app  ·  Thank you for your business", M, H - 11);
        doc.text(`Page ${p} of ${pages}`, W - M, H - 11, { align: "right" });
      }

      const customerName = (invoice.customer?.name || "Customer").replace(/[^a-zA-Z0-9]/g, "_");
      const fileName = `Invoice_${invoice.invoiceNumber}_${customerName}.pdf`;
      doc.save(fileName);

      toast({ title: "PDF Downloaded", description: `Invoice saved as ${fileName}` });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  if (authLoading || invoiceLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (!invoice) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="flex flex-col items-center justify-center py-20">
          <FileText className="h-12 w-12 text-slate-300 mb-4" />
          <h2 className="text-lg font-medium text-slate-700">Invoice not found</h2>
          <p className="text-slate-500 mb-4">The invoice you're looking for doesn't exist.</p>
          <Button variant="outline" data-testid="link-back-invoices" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </CrmLayout>
    );
  }

  const status = invoice.status as CrmInvoiceStatus;
  const isSent = status !== "draft";
  const isVoid = status === "void";
  const isPaid = status === "paid";
  const balanceDue = parseFloat(invoice.balanceDue || "0");
  const amountPaid = parseFloat(invoice.total || "0") - balanceDue;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header - Two rows for cleaner layout */}
        <div className="space-y-4">
          {/* First row: Back button, Title, Status */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" data-testid="button-back" onClick={() => window.history.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-invoice-number">
              Invoice {invoice.invoiceNumber}
            </h1>
            <StatusDot pill={`${statusColors[status]} border`} data-testid="badge-status">
              {statusLabels[status]}
            </StatusDot>
          </div>
          
          {/* Second row: Date and Actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500" data-testid="text-invoice-date">
              Created {formatDate(invoice.createdAt)}
            </p>
            
            <div className="flex items-center gap-2">
              {!isVoid && !isPaid && (
                <Button
                  size="sm"
                  onClick={() => setShowPaymentDialog(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-record-payment"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              )}
              {!isVoid && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSendEmailRecipient(invoice.customer?.email || "");
                    setSendPhoneRecipient(invoice.customer?.phone || "");
                    setShowSendEmailDialog(true);
                  }}
                  data-testid="button-send-email"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invoice
                </Button>
              )}
              
              {/* Payment Link button for invoices with balance due */}
              {!isVoid && balanceDue > 0 && (
                <PaymentLinkButton
                  type="invoice"
                  id={invoice.id}
                  total={balanceDue}
                  customerPhone={invoice.customer?.phone}
                />
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-more-actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownloadPDF} data-testid="menu-print-pdf">
                    <Printer className="h-4 w-4 mr-2" />
                    Print PDF
                  </DropdownMenuItem>
                  {!isVoid && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={handleVoid}
                        disabled={voidMutation.isPending}
                        className="text-red-600 focus:text-red-600"
                        data-testid="menu-void"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Void Invoice
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem 
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 focus:text-red-600"
                    data-testid="menu-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium text-slate-900" data-testid="text-customer-name">
                {invoice.customer?.name || "—"}
              </p>
              {invoice.customer?.phone && (
                <p className="text-sm text-slate-600" data-testid="text-customer-phone">
                  {invoice.customer.phone}
                </p>
              )}
              {invoice.customer?.email && (
                <p className="text-sm text-slate-600" data-testid="text-customer-email">
                  {invoice.customer.email}
                </p>
              )}
            </CardContent>
          </Card>

          {invoice.customer?.fullAddress && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  Service Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-700" data-testid="text-service-address">
                  {invoice.customer.fullAddress}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                Line Items
              </CardTitle>
              {status === "draft" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddLineItemDialog(true)}
                  data-testid="button-add-line-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line Item
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold text-center w-20">Qty</TableHead>
                  <TableHead className="font-semibold text-right w-28">Unit Price</TableHead>
                  <TableHead className="font-semibold text-right w-28">Amount</TableHead>
                  {status === "draft" && (
                    <TableHead className="font-semibold text-center w-24">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lineItems && invoice.lineItems.length > 0 ? (
                  invoice.lineItems.map((item, index) => (
                    <TableRow key={item.id || index} data-testid={`row-line-item-${index}`}>
                      {editingLineItemId === item.id ? (
                        <>
                          <TableCell>
                            <Textarea
                              value={editingLineItemData.description}
                              onChange={(e) => setEditingLineItemData(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Description"
                              className="w-full min-h-[80px]"
                              rows={3}
                              data-testid={`input-edit-description-${index}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingLineItemData.quantity}
                              onChange={(e) => setEditingLineItemData(prev => ({ ...prev, quantity: e.target.value }))}
                              placeholder="Qty"
                              className="w-16 text-center"
                              min="1"
                              data-testid={`input-edit-quantity-${index}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingLineItemData.unitPrice}
                              onChange={(e) => setEditingLineItemData(prev => ({ ...prev, unitPrice: e.target.value }))}
                              placeholder="Unit Price"
                              className="w-24 text-right"
                              step="0.01"
                              data-testid={`input-edit-unit-price-${index}`}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium text-slate-500" data-testid={`text-edit-total-${index}`}>
                            {formatCurrency(calculateEditingTotal())}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={handleSaveLineItem}
                                disabled={updateLineItemMutation.isPending}
                                data-testid={`button-save-line-item-${index}`}
                              >
                                {updateLineItemMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-slate-700"
                                onClick={handleCancelEditLineItem}
                                disabled={updateLineItemMutation.isPending}
                                data-testid={`button-cancel-edit-line-item-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium"><div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description || "—") }} /></TableCell>
                          <TableCell className="text-center">{item.quantity || 1}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.lineTotal)}</TableCell>
                          {status === "draft" && (
                            <TableCell>
                              <div className="flex items-center justify-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-500 hover:text-slate-700"
                                  onClick={() => handleStartEditLineItem(item)}
                                  data-testid={`button-edit-line-item-${index}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={status === "draft" ? 5 : 4} className="text-center text-slate-500 py-8">
                      No line items
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-slate-500" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-medium" data-testid="text-subtotal">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center py-2">
                <span className="text-lg font-semibold text-slate-900">Total</span>
                <span className="text-lg font-bold text-slate-900" data-testid="text-total">{formatCurrency(invoice.total)}</span>
              </div>
              {amountPaid > 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-600">Amount Paid</span>
                  <span className="font-medium text-green-600" data-testid="text-amount-paid">{formatCurrency(amountPaid)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center py-2">
                <span className="text-lg font-semibold text-slate-900">Balance Due</span>
                <span className={`text-lg font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="text-balance-due">
                  {balanceDue > 0 ? formatCurrency(balanceDue) : "PAID"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <RichTextDisplay content={invoice.notes} className="text-slate-700" />
            </CardContent>
          </Card>
        )}

        {/* Email Inbox Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Email Inbox
              <div className="ml-auto flex gap-2">
                {invoice.paymentLinkClickCount && invoice.paymentLinkClickCount > 0 && (
                  <StatusDot pill="bg-green-100 text-green-700 border-green-300">
                    Payment link clicked {invoice.paymentLinkClickCount} time{invoice.paymentLinkClickCount > 1 ? 's' : ''}
                  </StatusDot>
                )}
                {invoice.viewCount && invoice.viewCount > 0 && (
                  <StatusDot pill="bg-purple-100 text-purple-700 border-purple-300">
                    Viewed {invoice.viewCount} time{invoice.viewCount > 1 ? 's' : ''}
                  </StatusDot>
                )}
              </div>
            </CardTitle>
            <div className="space-y-1">
              {invoice.lastPaymentLinkClickedAt && (
                <p className="text-xs text-green-600">
                  Last payment link click: {format(new Date(invoice.lastPaymentLinkClickedAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
              {invoice.viewedAt && (
                <p className="text-xs text-slate-500">
                  First viewed: {format(new Date(invoice.viewedAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {emailLogsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : emailLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No email conversation yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {emailLogs.map((log) => {
                  const isOutgoing = log.direction === "outgoing" || !log.direction;
                  const isSystemEvent = log.direction === "system";
                  const isExpanded = expandedEmailIds.has(log.id);
                  const hasContent = log.htmlContent || log.textContent;
                  
                  const toggleExpanded = () => {
                    setExpandedEmailIds(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(log.id)) {
                        newSet.delete(log.id);
                      } else {
                        newSet.add(log.id);
                      }
                      return newSet;
                    });
                  };
                  
                  return (
                    <div
                      key={log.id}
                      className={`rounded-lg border overflow-hidden ${
                        isOutgoing
                          ? log.status === "sent"
                            ? "bg-blue-50 border-blue-200"
                            : log.status === "failed"
                            ? "bg-red-50 border-red-200"
                            : "bg-slate-50 border-slate-200"
                          : "bg-green-50 border-green-200"
                      }`}
                      data-testid={`email-log-${log.id}`}
                    >
                      {/* Email Header - Always Visible */}
                      <div 
                        className={`p-3 ${hasContent ? "cursor-pointer hover:bg-black/5" : ""}`}
                        onClick={hasContent ? toggleExpanded : undefined}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {isOutgoing ? (
                                <ArrowUpRight className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              ) : (
                                <ArrowDownLeft className="h-4 w-4 text-green-600 flex-shrink-0" />
                              )}
                              <span className="font-medium text-sm">
                                {isOutgoing ? "To:" : "From:"}
                              </span>
                              <span className="text-sm truncate">
                                {isOutgoing ? log.recipientEmail : log.fromEmail || "Customer"}
                              </span>
                              {log.isManual && (
                                <StatusDot pill="text-xs bg-slate-100">Manual</StatusDot>
                              )}
                            </div>
                            
                            {log.subject && (
                              <p className="text-sm font-medium text-slate-700 truncate mb-1">
                                {log.subject}
                              </p>
                            )}
                            
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Clock className="h-3 w-3" />
                              <span>
                                {log.sentAt
                                  ? format(new Date(log.sentAt), "MMM d, yyyy 'at' h:mm a")
                                  : "—"}
                              </span>
                              {hasContent && (
                                <>
                                  <span className="text-slate-300">|</span>
                                  <span className="flex items-center gap-1 text-blue-600">
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    {isExpanded ? "Hide content" : "View content"}
                                  </span>
                                </>
                              )}
                            </div>
                            
                            {!isExpanded && log.personalMessage && (
                              <p className="mt-2 text-xs text-slate-600 bg-white/50 p-2 rounded border border-slate-200">
                                {log.personalMessage.length > 100
                                  ? `${log.personalMessage.substring(0, 100)}...`
                                  : log.personalMessage}
                              </p>
                            )}
                            
                            {log.status === "failed" && log.errorMessage && (
                              <p className="mt-2 text-xs text-red-600">
                                Error: {log.errorMessage}
                              </p>
                            )}
                          </div>
                          
                          <StatusDot
                            pill={
                              isOutgoing
                                ? log.status === "sent"
                                  ? "bg-blue-100 text-blue-700 border-blue-300"
                                  : log.status === "failed"
                                  ? "bg-red-100 text-red-700 border-red-300"
                                  : "bg-slate-100 text-slate-700 border-slate-300"
                                : "bg-green-100 text-green-700 border-green-300"
                            }
                          >
                            {isOutgoing 
                              ? (log.status === "sent" ? "Sent" : log.status === "failed" ? "Failed" : log.status)
                              : "Received"
                            }
                          </StatusDot>
                        </div>
                      </div>
                      
                      {/* Email Content - Expandable */}
                      {isExpanded && hasContent && (
                        <div className="border-t bg-white p-4">
                          {isOutgoing && log.htmlContent ? (
                            <div 
                              className="prose prose-sm max-w-none text-slate-700"
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(log.htmlContent) }}
                            />
                          ) : log.textContent ? (
                            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                              {log.textContent}
                            </pre>
                          ) : !isOutgoing && log.htmlContent ? (
                            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                              {log.htmlContent.replace(/<[^>]*>/g, '')}
                            </pre>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Send Invoice Dialog */}
      <Dialog open={showSendEmailDialog} onOpenChange={setShowSendEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Invoice</DialogTitle>
            <DialogDescription>
              Send invoice {invoice.invoiceNumber} to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="send-email-inv" 
                  checked={sendViaEmail} 
                  onCheckedChange={(c) => setSendViaEmail(!!c)} 
                  data-testid="checkbox-send-via-email"
                />
                <Label htmlFor="send-email-inv" className="cursor-pointer">Email</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="send-sms-inv" 
                  checked={sendViaSms} 
                  onCheckedChange={(c) => setSendViaSms(!!c)} 
                  data-testid="checkbox-send-via-sms"
                />
                <Label htmlFor="send-sms-inv" className="cursor-pointer">Text Message (SMS)</Label>
              </div>
            </div>

            {sendViaEmail && (
              <div className="space-y-2">
                <Label htmlFor="recipientEmail">Recipient Email(s)</Label>
                <Input
                  id="recipientEmail"
                  type="text"
                  value={sendEmailRecipient}
                  onChange={(e) => setSendEmailRecipient(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  data-testid="input-recipient-email"
                />
                <p className="text-xs text-slate-500">Separate multiple emails with commas</p>
              </div>
            )}

            {sendViaSms && (
              <div className="space-y-2">
                <Label htmlFor="recipientPhone">Recipient Phone</Label>
                <Input
                  id="recipientPhone"
                  type="tel"
                  value={sendPhoneRecipient}
                  onChange={(e) => setSendPhoneRecipient(e.target.value)}
                  placeholder="(555) 123-4567"
                  data-testid="input-recipient-phone"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="personalMessage">Personal Message (optional)</Label>
              <Textarea
                id="personalMessage"
                value={sendEmailMessage}
                onChange={(e) => setSendEmailMessage(e.target.value)}
                placeholder="Add a personal message to include..."
                rows={4}
                data-testid="textarea-personal-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendEmailDialog(false)} data-testid="button-cancel-send-email">
              Cancel
            </Button>
            <Button
              onClick={() => sendEmailMutation.mutate()}
              disabled={sendEmailMutation.isPending || (!sendViaEmail && !sendViaSms) || (sendViaEmail && !sendEmailRecipient) || (sendViaSms && !sendPhoneRecipient)}
              data-testid="button-submit-send-email"
            >
              {sendEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sendViaEmail && sendViaSms ? "Send Email & SMS" : sendViaSms ? "Send SMS" : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for invoice {invoice.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Amount</Label>
              <Input
                id="paymentAmount"
                type="text"
                value={formatCurrency(parseFloat(invoice.total || "0"))}
                readOnly
                className="bg-slate-50 cursor-not-allowed"
                data-testid="input-payment-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="paymentMethod" data-testid="select-payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentNotes">Notes (optional)</Label>
              <Textarea
                id="paymentNotes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Check #, reference, or other notes..."
                data-testid="textarea-payment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} data-testid="button-cancel-payment">
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={payMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-submit-payment"
            >
              {payMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showVoidConfirm} onOpenChange={setShowVoidConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-void">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoid}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-void"
            >
              Void Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showAddLineItemDialog} onOpenChange={setShowAddLineItemDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
            <DialogDescription>
              Add a new line item to invoice {invoice.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newDescription">Description</Label>
              <RichTextEditor
                content={newLineItemData.description}
                onChange={(content) => setNewLineItemData(prev => ({ ...prev, description: content }))}
                placeholder="Enter item description..."
                minHeight="min-h-[120px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newQuantity">Quantity</Label>
                <Input
                  id="newQuantity"
                  type="number"
                  value={newLineItemData.quantity}
                  onChange={(e) => setNewLineItemData(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="1"
                  min="1"
                  data-testid="input-new-line-item-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newUnitPrice">Unit Price</Label>
                <Input
                  id="newUnitPrice"
                  type="number"
                  value={newLineItemData.unitPrice}
                  onChange={(e) => setNewLineItemData(prev => ({ ...prev, unitPrice: e.target.value }))}
                  placeholder="0.00"
                  step="0.01"
                  data-testid="input-new-line-item-unit-price"
                />
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-slate-600">Calculated Total:</span>
              <span className="text-lg font-semibold" data-testid="text-new-line-item-total">
                {formatCurrency(calculateNewLineItemTotal())}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddLineItemDialog(false);
                setNewLineItemData({ description: "", quantity: "1", unitPrice: "" });
              }}
              data-testid="button-cancel-add-line-item"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddLineItem}
              disabled={addLineItemMutation.isPending || !newLineItemData.description || !newLineItemData.unitPrice}
              data-testid="button-submit-add-line-item"
            >
              {addLineItemMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Line Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
