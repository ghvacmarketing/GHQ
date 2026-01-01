import { useEffect, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
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
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  User,
  Calendar,
  DollarSign,
  Printer,
  Eye,
  X,
  Trash2,
  Receipt,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmQuote, CrmQuoteLineItem
 } from "@shared/schema";

const COMPANY_INFO = {
  name: "Giesbrecht HVAC",
  address: "PO Box 917, Wrens, GA 30833",
  phone: "(706) 826-0644",
  email: "chandler@ghvacinc.com",
  website: "www.ghvacinc.com",
};

type QuoteWithLines = CrmQuote & {
  lineItems?: CrmQuoteLineItem[];
  customer?: { id: string; name: string; email?: string; phone?: string } | null;
  aiGeneratedQuote?: {
    quote_title?: string;
    package_description?: string;
    whats_included?: Array<{ category: string; items: string[] }>;
    best_for?: string;
    line_items?: Array<{ name: string; qty: number; price: number; description: string }>;
    financing_text?: string;
    warranties_and_terms?: string[];
    next_steps?: string[];
  } | null;
  quoteMode?: "single" | "options" | null;
  selectedOption?: string | null;
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Approved",
  converted: "Converted",
  declined: "Declined",
  expired: "Expired",
};

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  viewed: "bg-purple-100 text-purple-700 border-purple-200",
  accepted: "bg-green-100 text-green-700 border-green-200",
  converted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  expired: "bg-orange-100 text-orange-700 border-orange-200",
};

export default function CrmQuoteDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/crm/quotes/:id");
  const quoteId = params?.id;
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOptionSelection, setShowOptionSelection] = useState(false);
  const [availableOptions, setAvailableOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string>("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: quote, isLoading: quoteLoading } = useQuery<QuoteWithLines>({
    queryKey: ["/api/crm/quotes", quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${quoteId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!quoteId && !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/send`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to send quote");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      toast({ title: "Quote sent", description: "Quote status updated to sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send quote", description: error.message, variant: "destructive" });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/accept`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to accept quote");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      toast({ title: "Quote accepted", description: "Quote status updated to accepted." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to accept quote", description: error.message, variant: "destructive" });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/decline`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to decline quote");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      toast({ title: "Quote declined", description: "Quote status updated to declined." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to decline quote", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    sendMutation.mutate();
  };

  const handleApprove = () => {
    acceptMutation.mutate();
  };

  const handleDecline = () => {
    declineMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/quotes/${quoteId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete quote");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      toast({ title: "Quote deleted", description: "The quote has been permanently deleted." });
      navigate("/crm/quotes");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete quote", description: error.message, variant: "destructive" });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (selectedOpt?: string) => {
      const res = await apiRequest("POST", "/api/crm/invoices/from-quote", { 
        quoteId,
        selectedOption: selectedOpt 
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresOptionSelection && data.availableOptions) {
          throw { 
            message: data.message, 
            requiresOptionSelection: true,
            availableOptions: data.availableOptions
          };
        }
        throw new Error(data.message || "Failed to create invoice");
      }
      return data;
    },
    onSuccess: (data) => {
      setShowOptionSelection(false);
      setSelectedOption("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      toast({ 
        title: "Invoice created!", 
        description: `Invoice ${data.invoice?.invoiceNumber || ''} has been created from this quote.`
      });
      if (data.invoice?.id) {
        navigate(`/crm/invoices`);
      }
    },
    onError: (error: { message?: string; requiresOptionSelection?: boolean; availableOptions?: string[] } | Error) => {
      if ('requiresOptionSelection' in error && error.requiresOptionSelection && error.availableOptions) {
        setAvailableOptions(error.availableOptions);
        setShowOptionSelection(true);
        return;
      }
      toast({ 
        title: "Failed to create invoice", 
        description: (error as Error).message || "Unknown error", 
        variant: "destructive" 
      });
    },
  });

  const handleCreateInvoice = () => {
    createInvoiceMutation.mutate(quote?.selectedOption || undefined);
  };

  const handleConfirmOptionSelection = () => {
    if (!selectedOption) {
      toast({ title: "Please select an option", variant: "destructive" });
      return;
    }
    createInvoiceMutation.mutate(selectedOption);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
    setShowDeleteConfirm(false);
  };

  const handleDownloadPDF = () => {
    if (!quote) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let y = margin;

      const brandColor: [number, number, number] = [113, 20, 25];
      const goldColor: [number, number, number] = [211, 176, 125];
      const textColor: [number, number, number] = [30, 41, 59];
      const mutedColor: [number, number, number] = [100, 116, 139];
      const lightBg: [number, number, number] = [248, 250, 252];
      const tableRowAlt: [number, number, number] = [248, 250, 252];
      const isOptionsMode = quote.quoteMode === "options";

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
        if (y + neededSpace > pageHeight - 45) {
          doc.addPage();
          y = margin;
          addPageHeader();
          y += 35;
        }
      };

      addPageHeader();
      y += 35;

      // Check if this is an AI-generated quote from proposal builder
      if (quote.aiGeneratedQuote) {
        const aiQuote = quote.aiGeneratedQuote;

        // Title section
        if (aiQuote.quote_title) {
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...textColor);
          doc.text(aiQuote.quote_title, margin, y);
          y += 8;
        }

        // Package description
        if (aiQuote.package_description) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...mutedColor);
          const descLines = doc.splitTextToSize(aiQuote.package_description, contentWidth);
          descLines.forEach((line: string) => {
            doc.text(line, margin, y);
            y += 5;
          });
          y += 3;
        }

        // Customer info box
        const boxHeight = 32;
        doc.setFillColor(...lightBg);
        doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'F');
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textColor);
        doc.text("Customer", margin + 5, y + 8);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const customerName = quote.customer?.name || quote.customerName || "Customer";
        doc.text(customerName, margin + 5, y + 14);
        let custY = y + 14;
        doc.setTextColor(...mutedColor);
        if (quote.customer?.email || quote.customerEmail) {
          custY += 4;
          doc.text(String(quote.customer?.email || quote.customerEmail), margin + 5, custY);
        }
        if (quote.customer?.phone || quote.customerPhone) {
          custY += 4;
          doc.text(String(quote.customer?.phone || quote.customerPhone), margin + 5, custY);
        }
        if (quote.serviceAddress) {
          custY += 4;
          doc.text(quote.serviceAddress.substring(0, 60), margin + 5, custY);
        }
        y += boxHeight + 8;

        // Pricing Details table header
        doc.setFillColor(...brandColor);
        doc.rect(margin, y, contentWidth, 10, 'F');
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("Pricing Details", margin + 5, y + 7);
        y += 10;

        // Table column headers
        const col1Width = contentWidth * 0.60;
        const col2Width = contentWidth * 0.15;
        const col3Width = contentWidth * 0.25;
        doc.setFillColor(...lightBg);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textColor);
        doc.text("Item", margin + 3, y + 5.5);
        doc.text("Qty", margin + col1Width + col2Width/2, y + 5.5, { align: 'center' });
        doc.text("Price", margin + col1Width + col2Width + col3Width - 3, y + 5.5, { align: 'right' });
        y += 8;

        // Line items from AI quote
        const lineItems = aiQuote.line_items || [];
        let rowIndex = 0;
        lineItems.forEach((item) => {
          const nameLines = doc.splitTextToSize(item.name || "", col1Width - 6);
          const descLines = item.description ? doc.splitTextToSize(item.description, col1Width - 6) : [];
          const nameHeight = nameLines.length * 4;
          const descHeight = descLines.length * 3.5;
          const rowHeight = Math.max(12, nameHeight + descHeight + 6);
          
          checkPageBreak(rowHeight + 2);
          if (rowIndex % 2 === 0) {
            doc.setFillColor(...tableRowAlt);
            doc.rect(margin, y, contentWidth, rowHeight, 'F');
          }
          
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...textColor);
          let textY = y + 5;
          nameLines.forEach((line: string) => {
            doc.text(line, margin + 3, textY);
            textY += 4;
          });
          
          doc.setFont("helvetica", "normal");
          doc.text(String(item.qty || 1), margin + col1Width + col2Width/2, y + 5, { align: 'center' });
          doc.text(`$${(item.price || 0).toLocaleString()}`, margin + col1Width + col2Width + col3Width - 3, y + 5, { align: 'right' });
          
          if (descLines.length > 0) {
            doc.setFontSize(7);
            doc.setTextColor(...mutedColor);
            descLines.forEach((line: string) => {
              doc.text(line, margin + 3, textY);
              textY += 3.5;
            });
            doc.setTextColor(...textColor);
            doc.setFontSize(9);
          }
          
          y += rowHeight;
          rowIndex++;
        });

        // Separator line
        doc.setDrawColor(...brandColor);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + contentWidth, y);
        y += 6;

        // Only show Subtotal/Total in single mode - hidden in options mode
        if (!isOptionsMode) {
          // Calculate subtotal from line items
          const subtotal = lineItems.reduce((sum, item) => sum + (item.price || 0) * (item.qty || 1), 0);
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.text("Subtotal:", margin + col1Width, y);
          doc.text(`$${subtotal.toLocaleString()}`, margin + contentWidth - 3, y, { align: 'right' });
          y += 6;

          checkPageBreak(12);
          doc.setFillColor(...brandColor);
          doc.rect(margin, y, contentWidth, 10, 'F');
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text("TOTAL:", margin + col1Width, y + 7);
          doc.text(`$${subtotal.toLocaleString()}`, margin + contentWidth - 3, y + 7, { align: 'right' });
          y += 16;
          doc.setTextColor(...textColor);
        }

        // Financing text
        if (aiQuote.financing_text) {
          checkPageBreak(10);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...mutedColor);
          const finLines = doc.splitTextToSize(aiQuote.financing_text, contentWidth);
          finLines.forEach((line: string) => {
            doc.text(line, margin, y);
            y += 4;
          });
          y += 4;
        }

        // Warranties & Terms
        if (aiQuote.warranties_and_terms && aiQuote.warranties_and_terms.length > 0) {
          checkPageBreak(25);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...brandColor);
          doc.text("Warranties & Terms", margin, y);
          y += 7;
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...textColor);
          aiQuote.warranties_and_terms.forEach((term: string) => {
            checkPageBreak(6);
            const termLines = doc.splitTextToSize(`• ${term}`, contentWidth - 10);
            termLines.forEach((line: string) => {
              doc.text(line, margin + 5, y);
              y += 4;
            });
            y += 2;
          });
          y += 5;
        }

        // What's Included section
        if (aiQuote.whats_included && aiQuote.whats_included.length > 0) {
          checkPageBreak(20);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...brandColor);
          doc.text("What's Included", margin, y);
          y += 7;
          
          aiQuote.whats_included.forEach((category) => {
            checkPageBreak(15);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...textColor);
            doc.text(category.category, margin + 5, y);
            y += 5;
            
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...mutedColor);
            category.items.forEach((item: string) => {
              checkPageBreak(5);
              doc.text(`  • ${item}`, margin + 10, y);
              y += 4;
            });
            y += 3;
          });
        }

        // Next steps
        if (aiQuote.next_steps && aiQuote.next_steps.length > 0) {
          checkPageBreak(20);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...brandColor);
          doc.text("Next Steps", margin, y);
          y += 7;
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...textColor);
          aiQuote.next_steps.forEach((step: string, idx: number) => {
            checkPageBreak(6);
            const stepLines = doc.splitTextToSize(`${idx + 1}. ${step}`, contentWidth - 10);
            stepLines.forEach((line: string) => {
              doc.text(line, margin + 5, y);
              y += 4;
            });
          });
        }

      } else {
        // Standard line-item PDF for non-AI quotes
        const addTableHeader = () => {
          doc.setFillColor(...goldColor);
          doc.rect(margin, y, contentWidth, 10, 'F');
          
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text("Line Items", margin + 5, y + 7);
          y += 10;
          
          doc.setFillColor(...lightBg);
          doc.rect(margin, y, contentWidth, 8, 'F');
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...textColor);
          doc.text("Description", margin + 5, y + 5.5);
          doc.text("Qty", margin + contentWidth * 0.52, y + 5.5, { align: 'center' });
          doc.text("Unit Price", margin + contentWidth * 0.70, y + 5.5, { align: 'center' });
          doc.text("Amount", pageWidth - margin - 5, y + 5.5, { align: 'right' });
          y += 8;
        };

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textColor);
        doc.text("QUOTE", margin, y);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mutedColor);
        doc.text(quote.quoteNumber || "", margin, y + 6);

        const statusText = statusLabels[status] || status;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mutedColor);
        doc.text(statusText, pageWidth - margin, y + 2, { align: 'right' });

        y += 14;

        const boxWidth = (contentWidth - 6) / 2;
        const boxHeight = 32;
        
        doc.setFillColor(...lightBg);
        doc.roundedRect(margin, y, boxWidth, boxHeight, 2, 2, 'F');
        doc.roundedRect(margin + boxWidth + 6, y, boxWidth, boxHeight, 2, 2, 'F');

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textColor);
        doc.text("Bill To", margin + 5, y + 8);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const customerName = quote.customer?.name || quote.customerName || "Customer";
        doc.text(customerName, margin + 5, y + 14);
        let infoY = y + 14;
        doc.setTextColor(...mutedColor);
        if (quote.customer?.email || quote.customerEmail) {
          infoY += 4;
          doc.text(String(quote.customer?.email || quote.customerEmail), margin + 5, infoY);
        }
        if (quote.customer?.phone || quote.customerPhone) {
          infoY += 4;
          doc.text(String(quote.customer?.phone || quote.customerPhone), margin + 5, infoY);
        }
        if (quote.serviceAddress) {
          infoY += 4;
          const addrLines = doc.splitTextToSize(quote.serviceAddress, boxWidth - 10);
          addrLines.forEach((line: string) => {
            doc.text(line, margin + 5, infoY);
            infoY += 4;
          });
        }

        const detailsX = margin + boxWidth + 11;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textColor);
        doc.text("Quote Details", detailsX, y + 8);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mutedColor);
        doc.text("Date:", detailsX, y + 14);
        doc.text("Valid Until:", detailsX, y + 19);
        if (quote.title) {
          doc.text("Title:", detailsX, y + 24);
        }
        
        doc.setTextColor(...textColor);
        doc.text(formatDate(quote.createdAt), pageWidth - margin - 5, y + 14, { align: 'right' });
        doc.text(quote.validUntil ? formatDate(quote.validUntil) : "30 days", pageWidth - margin - 5, y + 19, { align: 'right' });
        if (quote.title) {
          doc.text(quote.title, pageWidth - margin - 5, y + 24, { align: 'right' });
        }

        y += boxHeight + 8;

        addTableHeader();

        const lineItems = quote.lineItems || [];
        let rowIndex = 0;
        lineItems.forEach((item) => {
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...textColor);
          
          const descLines = doc.splitTextToSize(item.description || "", contentWidth * 0.45);
          const rowHeight = Math.max(8, descLines.length * 4 + 3);
          
          checkPageBreak(rowHeight);

          if (rowIndex % 2 === 1) {
            doc.setFillColor(...tableRowAlt);
            doc.rect(margin, y, contentWidth, rowHeight, 'F');
          }

          let textY = y + 5.5;
          descLines.forEach((line: string, idx: number) => {
            doc.text(line, margin + 5, textY + (idx * 4));
          });
          
          doc.text(String(item.quantity || 1), margin + contentWidth * 0.52, y + 5.5, { align: 'center' });
          doc.text(formatCurrency(item.unitPrice), margin + contentWidth * 0.70, y + 5.5, { align: 'center' });
          doc.setFont("helvetica", "bold");
          doc.text(formatCurrency(item.lineTotal), pageWidth - margin - 5, y + 5.5, { align: 'right' });
          doc.setFont("helvetica", "normal");
          y += rowHeight;
          rowIndex++;
        });

        if (lineItems.length === 0) {
          doc.setTextColor(...mutedColor);
          doc.text("No line items", pageWidth / 2, y + 10, { align: 'center' });
          y += 20;
        }

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);

        checkPageBreak(45);
        y += 8;

        // Only show totals for non-options mode (no tax - prices already include tax)
        if (!isOptionsMode) {
          const totalsBoxWidth = 80;
          const totalsX = pageWidth - margin - totalsBoxWidth;
          
          doc.setFillColor(...lightBg);
          doc.roundedRect(totalsX, y, totalsBoxWidth, 20, 2, 2, 'F');
          
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...mutedColor);
          doc.text("Subtotal", totalsX + 5, y + 7);
          doc.setTextColor(...textColor);
          doc.text(formatCurrency(quote.subtotal), pageWidth - margin - 5, y + 7, { align: 'right' });
          
          doc.setDrawColor(...goldColor);
          doc.setLineWidth(0.5);
          doc.line(totalsX + 5, y + 11, pageWidth - margin - 5, y + 11);
          
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...textColor);
          doc.text("Total", totalsX + 5, y + 17);
          doc.setTextColor(...brandColor);
          doc.text(formatCurrency(quote.subtotal), pageWidth - margin - 5, y + 17, { align: 'right' });

          y += 28;
        }

        if (quote.description) {
          checkPageBreak(25);
          doc.setFillColor(254, 252, 232);
          doc.setDrawColor(253, 230, 138);
          doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(120, 53, 15);
          doc.text("Notes", margin + 5, y + 7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(146, 64, 14);
          const noteLines = doc.splitTextToSize(quote.description, contentWidth - 10);
          noteLines.slice(0, 2).forEach((line: string, idx: number) => {
            doc.text(line, margin + 5, y + 13 + (idx * 4));
          });
          y += 25;
        }
      }

      const footerY = pageHeight - 18;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Thank you for choosing Giesbrecht HVAC!", pageWidth / 2, footerY, { align: 'center' });
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...mutedColor);
      doc.text("Terms: Payment due upon completion. Prices valid for 30 days.", pageWidth / 2, footerY + 4, { align: 'center' });
      doc.text("(706) 826-0644  |  chandler@ghvacinc.com  |  www.ghvacinc.com", pageWidth / 2, footerY + 9, { align: 'center' });

      const custName = (quote.customer?.name || quote.customerName || "Quote").replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      doc.save(`GHVAC_Quote_${quote.quoteNumber || custName}_${dateStr}.pdf`);

      toast({
        title: "PDF Downloaded",
        description: "Quote saved as PDF successfully.",
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({
        title: "Download Failed",
        description: "Could not generate the PDF. Please try again.",
        variant: "destructive",
      });
    }
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

  if (authLoading || quoteLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (!quote) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="flex flex-col items-center justify-center py-16">
          <FileText className="h-16 w-16 text-slate-300 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700">Quote not found</h2>
          <Link href="/crm/quotes">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Quotes
            </Button>
          </Link>
        </div>
      </CrmLayout>
    );
  }

  const status = quote.status || "draft";

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6 max-w-4xl mx-auto pb-8">
        {/* Header - Two rows for cleaner layout */}
        <div className="space-y-4">
          {/* First row: Back button, Quote number, Status, Preview icon */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/crm/quotes">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-slate-900" data-testid="text-quote-number">
                {quote.quoteNumber}
              </h1>
              <Badge variant="outline" className={statusColors[status] || "bg-slate-100"}>
                {statusLabels[status] || status}
              </Badge>
            </div>
            <Button
              onClick={() => setShowPreview(true)}
              variant="ghost"
              size="icon"
              className="text-slate-500 hover:text-[#711419]"
              data-testid="button-preview"
            >
              <Eye className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Second row: Title/Date and Actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500" data-testid="text-quote-title">
              {quote.title || "Quote"} • Created {quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : "—"}
            </p>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSend}
                variant="outline"
                size="sm"
                disabled={sendMutation.isPending}
                data-testid="button-send"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send
              </Button>
              <Button
                onClick={handleDownloadPDF}
                variant="outline"
                size="sm"
                data-testid="button-download-pdf"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print PDF
              </Button>
              {status === "sent" && (
                <>
                  <Button
                    onClick={handleApprove}
                    variant="outline"
                    size="sm"
                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    disabled={acceptMutation.isPending}
                    data-testid="button-approve"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    onClick={handleDecline}
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={declineMutation.isPending}
                    data-testid="button-decline"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                </>
              )}
              {status === "accepted" && (
                <Button
                  onClick={handleCreateInvoice}
                  variant="outline"
                  size="sm"
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  disabled={createInvoiceMutation.isPending}
                  data-testid="button-create-invoice"
                >
                  {createInvoiceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Receipt className="h-4 w-4 mr-2" />
                  )}
                  Create Invoice
                </Button>
              )}
              <Button
                onClick={handleDelete}
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                disabled={deleteMutation.isPending}
                data-testid="button-delete"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium">{quote.customer?.name || "—"}</p>
              {quote.customer?.email && (
                <p className="text-sm text-slate-500">{quote.customer.email}</p>
              )}
              {quote.customer?.phone && (
                <p className="text-sm text-slate-500">{quote.customer.phone}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">Created</span>
                <span className="text-sm">{formatDate(quote.createdAt)}</span>
              </div>
              {quote.validUntil && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Valid Until</span>
                  <span className="text-sm">{formatDate(quote.validUntil)}</span>
                </div>
              )}
              {quote.sentAt && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Sent</span>
                  <span className="text-sm">{formatDate(quote.sentAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Line Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.lineItems && quote.lineItems.length > 0 ? (
                  quote.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                      No line items
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Hide subtotal/total for options mode since each package is a separate choice */}
            {quote.quoteMode !== "options" && (
              <div className="mt-6 border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span>{formatCurrency(quote.subtotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span className="text-[#d3b07d]">{formatCurrency(quote.subtotal)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {quote.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.description}</p>
            </CardContent>
          </Card>
        )}

        {quote.aiGeneratedQuote && (
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                <FileText className="h-4 w-4" />
                AI-Generated Proposal
                {quote.quoteMode === "options" && (
                  <Badge variant="outline" className="ml-2 text-xs">Options Mode</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {quote.aiGeneratedQuote.quote_title && (
                <h3 className="text-lg font-semibold text-slate-900">
                  {quote.aiGeneratedQuote.quote_title}
                </h3>
              )}
              
              {quote.aiGeneratedQuote.package_description && (
                <p className="text-sm text-slate-600">
                  {quote.aiGeneratedQuote.package_description}
                </p>
              )}
              
              {quote.aiGeneratedQuote.best_for && (
                <p className="text-sm italic text-slate-500">
                  <span className="font-medium not-italic">Best For:</span> {quote.aiGeneratedQuote.best_for}
                </p>
              )}
              
              {quote.aiGeneratedQuote.whats_included && quote.aiGeneratedQuote.whats_included.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase">What's Included</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {quote.aiGeneratedQuote.whats_included.map((category: { category: string; items: string[] }, idx: number) => (
                      <div key={idx} className="bg-white p-3 rounded-lg border">
                        <p className="font-medium text-sm text-slate-800 mb-2">{category.category}</p>
                        <ul className="text-xs text-slate-600 space-y-1">
                          {category.items.map((item: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-blue-500 mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {quote.aiGeneratedQuote.warranties_and_terms && quote.aiGeneratedQuote.warranties_and_terms.length > 0 && (
                <div className="pt-3 border-t">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Warranties & Terms</h4>
                  <ul className="text-xs text-slate-600 space-y-1">
                    {quote.aiGeneratedQuote.warranties_and_terms.map((term: string, idx: number) => (
                      <li key={idx}>• {term}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {quote.aiGeneratedQuote.financing_text && (
                <p className="text-sm text-slate-600 pt-2 border-t">
                  {quote.aiGeneratedQuote.financing_text}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden">
          <div className="h-full overflow-y-auto bg-white">
            <div className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Quote Preview</h2>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadPDF}
                  variant="outline"
                  size="sm"
                  className="border-blue-500 text-blue-600"
                >
                  <Printer className="h-4 w-4 mr-1" />
                  PDF
                </Button>
                <Button
                  onClick={() => setShowPreview(false)}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="p-8 print:p-0" id="quote-preview-content">
              <div className="bg-[#711419] text-white p-6 rounded-lg mb-6 print:rounded-none">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-3xl font-bold">{COMPANY_INFO.name}</h1>
                    <p className="text-white/80 mt-1">{COMPANY_INFO.address}</p>
                  </div>
                  <div className="text-right text-sm text-white/90">
                    <p>{COMPANY_INFO.phone}</p>
                    <p>{COMPANY_INFO.email}</p>
                    <p>{COMPANY_INFO.website}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">QUOTE</h2>
                  <p className="text-slate-500">{quote.quoteNumber}</p>
                </div>
                <Badge variant="outline" className={`${statusColors[status]} text-sm`}>
                  {statusLabels[status] || status}
                </Badge>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Bill To
                  </h3>
                  <p className="font-medium">{quote.customer?.name || quote.customerName || "—"}</p>
                  {(quote.customer?.email || quote.customerEmail) && (
                    <p className="text-sm text-slate-600">{quote.customer?.email || quote.customerEmail}</p>
                  )}
                  {(quote.customer?.phone || quote.customerPhone) && (
                    <p className="text-sm text-slate-600">{quote.customer?.phone || quote.customerPhone}</p>
                  )}
                  {quote.serviceAddress && (
                    <p className="text-sm text-slate-600 mt-1">{quote.serviceAddress}</p>
                  )}
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Quote Details
                  </h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date:</span>
                      <span>{formatDate(quote.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Valid Until:</span>
                      <span>{quote.validUntil ? formatDate(quote.validUntil) : "30 days"}</span>
                    </div>
                    {quote.title && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Title:</span>
                        <span>{quote.title}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Show AI-generated proposal if available, otherwise show line items */}
              {quote.aiGeneratedQuote ? (
                <div className="space-y-6 mb-8">
                  {/* AI Quote Title & Description */}
                  <div className="border-l-4 border-[#711419] pl-4">
                    <h3 className="text-xl font-bold text-slate-900">
                      {quote.aiGeneratedQuote.quote_title || quote.title}
                    </h3>
                    {quote.aiGeneratedQuote.package_description && (
                      <p className="text-slate-600 mt-2">{quote.aiGeneratedQuote.package_description}</p>
                    )}
                  </div>

                  {/* Best For */}
                  {quote.aiGeneratedQuote.best_for && (
                    <p className="text-sm italic text-slate-500 bg-slate-50 p-3 rounded-lg">
                      <span className="font-medium not-italic">Best For:</span> {quote.aiGeneratedQuote.best_for}
                    </p>
                  )}

                  {/* What's Included */}
                  {quote.aiGeneratedQuote.whats_included && quote.aiGeneratedQuote.whats_included.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 uppercase mb-3">What's Included</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {quote.aiGeneratedQuote.whats_included.map((category: { category: string; items: string[] }, idx: number) => (
                          <div key={idx} className="bg-slate-50 p-4 rounded-lg border">
                            <p className="font-semibold text-slate-800 mb-2">{category.category}</p>
                            <ul className="text-sm text-slate-600 space-y-1">
                              {category.items.map((item: string, i: number) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-[#711419] mt-0.5">•</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warranties & Terms */}
                  {quote.aiGeneratedQuote.warranties_and_terms && quote.aiGeneratedQuote.warranties_and_terms.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-amber-900 uppercase mb-2">Warranties & Terms</h4>
                      <ul className="text-sm text-amber-800 space-y-1">
                        {quote.aiGeneratedQuote.warranties_and_terms.map((term: string, idx: number) => (
                          <li key={idx}>• {term}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Financing */}
                  {quote.aiGeneratedQuote.financing_text && (
                    <p className="text-sm text-slate-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      {quote.aiGeneratedQuote.financing_text}
                    </p>
                  )}

                </div>
              ) : (
                <>
                  <div className="border rounded-lg overflow-hidden mb-6">
                    <div className="bg-[#d3b07d] text-white px-4 py-3">
                      <h3 className="font-semibold">Line Items</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="font-semibold">Description</TableHead>
                          <TableHead className="text-center font-semibold">Qty</TableHead>
                          <TableHead className="text-right font-semibold">Unit Price</TableHead>
                          <TableHead className="text-right font-semibold">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quote.lineItems && quote.lineItems.length > 0 ? (
                          quote.lineItems.map((item, idx) => (
                            <TableRow key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                              <TableCell className="font-medium">{item.description}</TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(item.lineTotal)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                              No line items
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end mb-8">
                    <div className="w-72 bg-slate-50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Subtotal</span>
                        <span>{formatCurrency(quote.subtotal)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span className="text-[#711419]">{formatCurrency(quote.subtotal)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {quote.description && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-amber-900 mb-2">Notes</h3>
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">{quote.description}</p>
                </div>
              )}

              <div className="border-t pt-6 text-center text-sm text-slate-500">
                <p className="font-medium text-slate-700">Thank you for choosing {COMPANY_INFO.name}!</p>
                <p className="mt-1">Terms: Payment due upon completion. Prices valid for 30 days.</p>
                <p className="mt-2">{COMPANY_INFO.phone} | {COMPANY_INFO.email} | {COMPANY_INFO.website}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quote ({quote.quoteNumber})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOptionSelection} onOpenChange={setShowOptionSelection}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Customer's Choice</AlertDialogTitle>
            <AlertDialogDescription>
              This is a multi-option quote. Which option did the customer choose?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            {availableOptions.map((option) => (
              <button
                key={option}
                onClick={() => setSelectedOption(option)}
                className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                  selectedOption === option
                    ? "border-[#711419] bg-[#711419]/5"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                data-testid={`option-${option.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <span className={`font-medium ${selectedOption === option ? "text-[#711419]" : ""}`}>
                  {option}
                </span>
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setSelectedOption("");
                setShowOptionSelection(false);
              }}
              data-testid="button-cancel-option"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmOptionSelection}
              disabled={!selectedOption || createInvoiceMutation.isPending}
              className="bg-[#711419] hover:bg-[#711419]/90"
              data-testid="button-confirm-option"
            >
              {createInvoiceMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
