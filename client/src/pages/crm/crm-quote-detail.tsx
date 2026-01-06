import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
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
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  ClipboardList,
  Mail,
  Clock,
  Check,
  AlertCircle,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownLeft,
  Inbox,
  Edit,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jsPDF } from "jspdf";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmQuote, CrmQuoteLineItem, QuoteEmailLog } from "@shared/schema";
import { PaymentLinkButton } from "@/components/stripe-payment-link-button";

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
  assignedTo?: { id: string; displayName: string; role: string } | null;
};

type AssignableUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
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
  const [showAcceptOptionSelection, setShowAcceptOptionSelection] = useState(false);
  const [availableOptions, setAvailableOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [showWorkOrderSelection, setShowWorkOrderSelection] = useState(false);
  const [availableWorkOrders, setAvailableWorkOrders] = useState<Array<{ id: string; title: string | null; workOrderNumber: number | null; visitType: string | null; scheduledStart: string | null }>>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string>("");
  const [quoteContext, setQuoteContext] = useState<{ customerId?: string; propertyId?: string; projectId?: string }>({});
  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [newWorkOrderTitle, setNewWorkOrderTitle] = useState("");
  const [newWorkOrderDescription, setNewWorkOrderDescription] = useState("");
  const [newWorkOrderVisitType, setNewWorkOrderVisitType] = useState<string>("INSTALL");
  const [newWorkOrderSubtype, setNewWorkOrderSubtype] = useState<string>("Full System");
  const [isCreatingWorkOrder, setIsCreatingWorkOrder] = useState(false);
  const [showSendQuoteDialog, setShowSendQuoteDialog] = useState(false);
  const [sendEmailRecipient, setSendEmailRecipient] = useState("");
  const [sendEmailMessage, setSendEmailMessage] = useState("");
  const [expandedEmailIds, setExpandedEmailIds] = useState<Set<string>>(new Set());
  const [showMarkAsSentDialog, setShowMarkAsSentDialog] = useState(false);
  const [markSentNote, setMarkSentNote] = useState("");
  const [isEditingAssignment, setIsEditingAssignment] = useState(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");

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
    staleTime: 0, // Always consider data stale to enable refetching
    refetchInterval: 10000, // Auto-refresh every 10 seconds to catch status updates
  });

  const { data: emailLogs = [], isLoading: emailLogsLoading } = useQuery<QuoteEmailLog[]>({
    queryKey: ["/api/crm/quotes", quoteId, "email-logs"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/email-logs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch email logs");
      return res.json();
    },
    enabled: !!quoteId && !!currentUser,
  });

  // Determine which users to show based on quote type
  // Quick/custom_service quotes (service) need exactly admin role
  // Proposal/custom_install quotes (install) need exactly sales role
  const isServiceQuote = quote?.quoteType === "quick" || quote?.quoteType === "custom_service";
  const exactRoleForQuoteType = isServiceQuote ? "admin" : "sales";

  // Fetch assignable users based on quote type
  const { data: assignableUsers = [] } = useQuery<AssignableUser[]>({
    queryKey: ["/api/crm/users/by-role", exactRoleForQuoteType],
    queryFn: async () => {
      const response = await fetch(`/api/crm/users/by-role?exactRole=${exactRoleForQuoteType}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: !!quote && isEditingAssignment,
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote sent", description: "Quote status updated to sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send quote", description: error.message, variant: "destructive" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { recipientEmail: string; personalMessage?: string }) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || result.message || "Failed to send email");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId, "email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowSendQuoteDialog(false);
      setSendEmailRecipient("");
      setSendEmailMessage("");
      toast({ title: "Quote sent!", description: "The quote has been emailed to the customer." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
    },
  });

  const markAsSentMutation = useMutation({
    mutationFn: async (data: { note?: string }) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to mark as sent");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId, "email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowMarkAsSentDialog(false);
      setMarkSentNote("");
      toast({ title: "Quote marked as sent", description: "The quote status has been updated to sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to mark as sent", description: error.message, variant: "destructive" });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async (assignedToId: string | null) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assignedToId }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to update assignment");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setIsEditingAssignment(false);
      setSelectedAssigneeId(null);
      toast({ title: "Assignment updated", description: "The quote assignment has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update assignment", description: error.message, variant: "destructive" });
    },
  });

  const updateDescriptionMutation = useMutation({
    mutationFn: async (description: string) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to update description");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setIsEditingDescription(false);
      toast({ title: "Description updated", description: "The quote description has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update description", description: error.message, variant: "destructive" });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (params: { selectedOption?: string } = {}) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ selectedOption: params.selectedOption }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresOptionSelection && data.availableOptions) {
          throw {
            message: data.message,
            requiresOptionSelection: true,
            availableOptions: data.availableOptions,
          };
        }
        throw new Error(data.message || "Failed to accept quote");
      }
      return data;
    },
    onSuccess: () => {
      setShowAcceptOptionSelection(false);
      setSelectedOption("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote accepted", description: "Quote status updated to accepted." });
    },
    onError: (error: { message?: string; requiresOptionSelection?: boolean; availableOptions?: string[] } | Error) => {
      if ('requiresOptionSelection' in error && error.requiresOptionSelection && error.availableOptions) {
        setAvailableOptions(error.availableOptions);
        setShowAcceptOptionSelection(true);
        return;
      }
      toast({ title: "Failed to accept quote", description: (error as Error).message || "Unknown error", variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote declined", description: "Quote status updated to declined." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to decline quote", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    sendMutation.mutate();
  };

  const handleOpenSendDialog = () => {
    setSendEmailRecipient(quote?.customerEmail || quote?.customer?.email || "");
    setSendEmailMessage("");
    setShowSendQuoteDialog(true);
  };

  const handleSendEmail = () => {
    if (!sendEmailRecipient.trim()) {
      toast({ title: "Email required", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    sendEmailMutation.mutate({
      recipientEmail: sendEmailRecipient.trim(),
      personalMessage: sendEmailMessage.trim() || undefined,
    });
  };

  const handleMarkAsSent = () => {
    markAsSentMutation.mutate({ note: markSentNote.trim() || undefined });
  };

  const handleApprove = () => {
    acceptMutation.mutate({});
  };

  const handleConfirmAcceptOption = () => {
    if (!selectedOption) {
      toast({ title: "Please select an option", variant: "destructive" });
      return;
    }
    acceptMutation.mutate({ selectedOption });
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote deleted", description: "The quote has been permanently deleted." });
      navigate("/crm/quotes");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete quote", description: error.message, variant: "destructive" });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (params: { selectedOption?: string; workOrderId?: string }) => {
      const res = await fetch("/api/crm/invoices/from-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          quoteId,
          selectedOption: params.selectedOption,
          workOrderId: params.workOrderId,
        }),
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
        if (data.requiresWorkOrder) {
          throw {
            message: data.message,
            requiresWorkOrder: true,
            availableWorkOrders: data.availableWorkOrders || [],
            quoteCustomerId: data.quoteCustomerId,
            quotePropertyId: data.quotePropertyId,
            quoteProjectId: data.quoteProjectId,
          };
        }
        throw new Error(data.message || "Failed to create invoice");
      }
      return data;
    },
    onSuccess: (data) => {
      setShowOptionSelection(false);
      setShowWorkOrderSelection(false);
      setSelectedOption("");
      setSelectedWorkOrderId("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ 
        title: "Invoice created!", 
        description: `Invoice ${data.invoice?.invoiceNumber || ''} has been created from this quote.`
      });
      if (data.invoice?.id) {
        navigate(`/crm/invoices`);
      }
    },
    onError: (error: { 
      message?: string; 
      requiresOptionSelection?: boolean; 
      availableOptions?: string[];
      requiresWorkOrder?: boolean;
      availableWorkOrders?: Array<{ id: string; title: string | null; workOrderNumber: number | null; visitType: string | null; scheduledStart: string | null }>;
      quoteCustomerId?: string;
      quotePropertyId?: string;
      quoteProjectId?: string;
    } | Error) => {
      if ('requiresOptionSelection' in error && error.requiresOptionSelection && error.availableOptions) {
        setAvailableOptions(error.availableOptions);
        setShowOptionSelection(true);
        return;
      }
      if ('requiresWorkOrder' in error && error.requiresWorkOrder) {
        setAvailableWorkOrders(error.availableWorkOrders || []);
        setQuoteContext({
          customerId: error.quoteCustomerId,
          propertyId: error.quotePropertyId,
          projectId: error.quoteProjectId,
        });
        setShowWorkOrderSelection(true);
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
    createInvoiceMutation.mutate({ selectedOption: quote?.selectedOption || undefined });
  };

  const handleConfirmOptionSelection = () => {
    if (!selectedOption) {
      toast({ title: "Please select an option", variant: "destructive" });
      return;
    }
    createInvoiceMutation.mutate({ selectedOption });
  };

  const handleSelectWorkOrder = () => {
    if (!selectedWorkOrderId) {
      toast({ title: "Please select a work order", variant: "destructive" });
      return;
    }
    createInvoiceMutation.mutate({ 
      selectedOption: quote?.selectedOption || undefined,
      workOrderId: selectedWorkOrderId 
    });
  };

  const handleCreateAndSelectWorkOrder = async () => {
    const customerId = quoteContext.customerId || quote?.customerId;
    const propertyId = quoteContext.propertyId || quote?.propertyId;
    const projectId = quoteContext.projectId || quote?.projectId;
    
    if (!customerId || !propertyId) {
      toast({ title: "Missing customer or property information", description: "The quote needs a customer and property assigned.", variant: "destructive" });
      return;
    }
    
    if (!newWorkOrderTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!newWorkOrderDescription.trim()) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    
    setIsCreatingWorkOrder(true);
    try {
      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId: customerId,
        propertyId: propertyId,
        projectId: projectId || undefined,
        title: newWorkOrderTitle,
        description: newWorkOrderDescription,
        visitType: newWorkOrderVisitType,
        workSubtype: newWorkOrderSubtype,
        status: "scheduled",
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create work order");
      }
      
      const workOrder = await res.json();
      toast({ title: "Work order created", description: `Work Order #${workOrder.workOrderNumber} created` });
      
      setShowCreateWorkOrder(false);
      createInvoiceMutation.mutate({ 
        selectedOption: quote?.selectedOption || undefined,
        workOrderId: workOrder.id 
      });
    } catch (err) {
      toast({ 
        title: "Failed to create work order", 
        description: (err as Error).message,
        variant: "destructive" 
      });
    } finally {
      setIsCreatingWorkOrder(false);
    }
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

      // Add diagonal APPROVED stamp across all pages if quote is accepted or converted
      const addApprovedStampToAllPages = () => {
        if (quote.status === "accepted" || quote.status === "converted") {
          const totalPages = doc.getNumberOfPages();
          
          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            doc.setPage(pageNum);
            doc.saveGraphicsState();
            
            // Position stamp in center of page
            const centerX = pageWidth / 2;
            const centerY = pageHeight / 2;
            
            // Draw diagonal stamp text with higher opacity for visibility
            doc.setFontSize(60);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(16, 185, 129); // emerald-500
            doc.setGState(new doc.GState({ opacity: 0.25 }));
            
            // Main APPROVED stamp - rotated the other direction (-45)
            const stampText = "APPROVED";
            doc.text(stampText, centerX, centerY - 10, { 
              angle: -45,
              align: 'center'
            });
            
            // Show selected option if this is an options-based quote
            if (quote.selectedOption) {
              doc.setFontSize(24);
              doc.text(`Selected: ${quote.selectedOption}`, centerX, centerY + 15, { 
                angle: -45,
                align: 'center'
              });
            }
            
            doc.restoreGraphicsState();
          }
        }
      };

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

        // Filter out labor/internal line items from PDF export (client-facing)
        const lineItems = (quote.lineItems || []).filter(item => 
          item.lineType !== "labor" && item.lineType !== "other"
        );
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
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...textColor);
          doc.text("Total", totalsX + 5, y + 10);
          doc.setTextColor(...brandColor);
          doc.text(formatCurrency(quote.total), pageWidth - margin - 5, y + 10, { align: 'right' });

          y += 28;
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

      // Add APPROVED stamp on top of all content (last layer)
      addApprovedStampToAllPages();

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
          <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
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
              <Button variant="ghost" size="icon" data-testid="button-back" onClick={() => window.history.back()}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
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
              {quote.title || "Quote"}
            </p>
            
            <div className="flex items-center gap-2">
              {["draft", "sent", "viewed"].includes(status) && (
                <Button
                  onClick={handleOpenSendDialog}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-send-quote"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Quote
                </Button>
              )}
              {status === "sent" && (
                <>
                  <Button
                    onClick={handleApprove}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
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
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
              
              {/* Payment Link button - only for install quotes */}
              <PaymentLinkButton
                type="quote"
                id={quote.id}
                quoteCategory={quote.quoteCategory}
                total={parseFloat(quote.total?.toString() || "0")}
                customerPhone={quote.customer?.phone || quote.customerPhone}
              />
              
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
                  {status === "draft" && (
                    <DropdownMenuItem 
                      onClick={() => setShowMarkAsSentDialog(true)}
                      data-testid="menu-mark-sent"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Mark as Sent
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 focus:text-red-600"
                    data-testid="menu-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Quote
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Assigned To</span>
                {isEditingAssignment ? (
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedAssigneeId || ""}
                      onValueChange={(value) => setSelectedAssigneeId(value || null)}
                    >
                      <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-edit-assigned-to">
                        <SelectValue placeholder="Select assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id} data-testid={`assignee-option-${user.id}`}>
                            {user.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        updateAssignmentMutation.mutate(selectedAssigneeId);
                      }}
                      disabled={updateAssignmentMutation.isPending}
                      data-testid="button-save-assignment"
                    >
                      {updateAssignmentMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setIsEditingAssignment(false);
                        setSelectedAssigneeId(null);
                      }}
                      data-testid="button-cancel-assignment"
                    >
                      <X className="h-4 w-4 text-slate-500" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingAssignment(true);
                      setSelectedAssigneeId(quote.assignedToId || null);
                    }}
                    className="text-sm hover:text-[#711419] transition-colors flex items-center gap-1"
                    data-testid="button-edit-assignment"
                  >
                    {quote.assignedTo ? (
                      <span>{quote.assignedTo.displayName}</span>
                    ) : (
                      <span className="text-slate-400 italic">Not assigned</span>
                    )}
                  </button>
                )}
              </div>
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
                  <span className="text-slate-600">Equipment & Labor</span>
                  <span>{formatCurrency(quote.subtotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Sell Price</span>
                  <span className="text-[#d3b07d]">{formatCurrency(quote.total)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editable Description for custom install quotes */}
        {quote.quoteType === "custom_install" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Description</CardTitle>
              {!isEditingDescription && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditedDescription(quote.description || "");
                    setIsEditingDescription(true);
                  }}
                  data-testid="button-edit-description"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isEditingDescription ? (
                <div className="space-y-3">
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Add a description for this custom install quote..."
                    className="min-h-[100px]"
                    data-testid="textarea-quote-description"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateDescriptionMutation.mutate(editedDescription)}
                      disabled={updateDescriptionMutation.isPending}
                      data-testid="button-save-description"
                    >
                      {updateDescriptionMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingDescription(false)}
                      data-testid="button-cancel-description"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : quote.description ? (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.description}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">No description added. Click Edit to add one.</p>
              )}
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

        {/* Email Inbox Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Email Inbox
            </CardTitle>
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
                  
                  // Parse system event metadata
                  let systemEventData: { eventType?: string; signerName?: string; signedAt?: string; acceptedAt?: string; markedByUser?: string } | null = null;
                  if (isSystemEvent && log.personalMessage) {
                    try {
                      systemEventData = JSON.parse(log.personalMessage);
                    } catch {
                      systemEventData = null;
                    }
                  }
                  
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
                  
                  // Render system events differently
                  if (isSystemEvent) {
                    const eventTime = systemEventData?.signedAt || systemEventData?.acceptedAt || log.sentAt;
                    const signerName = systemEventData?.signerName || log.recipientName;
                    
                    return (
                      <div
                        key={log.id}
                        className="rounded-lg border overflow-hidden bg-emerald-50 border-emerald-200"
                        data-testid={`email-log-${log.id}`}
                      >
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                <span className="font-medium text-sm text-emerald-800">
                                  Quote Signed & Accepted
                                </span>
                              </div>
                              
                              {signerName && (
                                <p className="text-sm text-emerald-700 mb-1">
                                  Signed by: <span className="font-medium">{signerName}</span>
                                </p>
                              )}
                              
                              <div className="flex items-center gap-2 text-xs text-emerald-600">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {eventTime
                                    ? format(new Date(eventTime), "MMM d, yyyy 'at' h:mm a")
                                    : "—"}
                                </span>
                              </div>
                            </div>
                            
                            <Badge
                              variant="outline"
                              className="bg-emerald-100 text-emerald-700 border-emerald-300"
                            >
                              Accepted
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
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
                                <Badge variant="outline" className="text-xs bg-slate-100">Manual</Badge>
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
                          
                          <Badge
                            variant="outline"
                            className={
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
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Email Content - Expandable */}
                      {isExpanded && hasContent && (
                        <div className="border-t bg-white p-4">
                          {isOutgoing && log.htmlContent ? (
                            <div 
                              className="prose prose-sm max-w-none text-slate-700"
                              dangerouslySetInnerHTML={{ __html: log.htmlContent }}
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

      {/* Send Quote Dialog */}
      <Dialog open={showSendQuoteDialog} onOpenChange={setShowSendQuoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Send Quote via Email
            </DialogTitle>
            <DialogDescription>
              Send this quote to the customer via email. They will receive a PDF attachment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recipient-email">Recipient Email</Label>
              <Input
                id="recipient-email"
                type="email"
                placeholder="customer@example.com"
                value={sendEmailRecipient}
                onChange={(e) => setSendEmailRecipient(e.target.value)}
                data-testid="input-recipient-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personal-message">Personal Message (optional)</Label>
              <Textarea
                id="personal-message"
                placeholder="Add a personal note to the email..."
                value={sendEmailMessage}
                onChange={(e) => setSendEmailMessage(e.target.value)}
                rows={3}
                data-testid="input-personal-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSendQuoteDialog(false)}
              data-testid="button-cancel-send"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sendEmailMutation.isPending}
              className="bg-[#711419] hover:bg-[#711419]/90"
              data-testid="button-confirm-send"
            >
              {sendEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Sent Dialog */}
      <AlertDialog open={showMarkAsSentDialog} onOpenChange={setShowMarkAsSentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5" />
              Mark Quote as Sent
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use this when you've shared the quote via phone, in-person, or another method.
              This will update the quote status to "Sent" without sending an email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="mark-sent-note">Note (optional)</Label>
              <Textarea
                id="mark-sent-note"
                placeholder="e.g., Discussed quote over phone with customer..."
                value={markSentNote}
                onChange={(e) => setMarkSentNote(e.target.value)}
                rows={2}
                data-testid="input-mark-sent-note"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-mark-sent">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkAsSent}
              disabled={markAsSentMutation.isPending}
              className="bg-[#711419] hover:bg-[#711419]/90"
              data-testid="button-confirm-mark-sent"
            >
              {markAsSentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Mark as Sent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                        {(() => {
                          // Filter out labor/internal line items from print preview (client-facing)
                          const clientVisibleItems = (quote.lineItems || []).filter(item => 
                            item.lineType !== "labor" && item.lineType !== "other"
                          );
                          return clientVisibleItems.length > 0 ? (
                            clientVisibleItems.map((item, idx) => (
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
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end mb-8">
                    <div className="w-72 bg-slate-50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span className="text-[#711419]">{formatCurrency(quote.total)}</span>
                      </div>
                    </div>
                  </div>
                </>
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

      <AlertDialog open={showAcceptOptionSelection} onOpenChange={setShowAcceptOptionSelection}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Customer's Choice</AlertDialogTitle>
            <AlertDialogDescription>
              This is a multi-option quote. Which option did the customer accept?
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
                data-testid={`accept-option-${option.toLowerCase().replace(/\s+/g, '-')}`}
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
                setShowAcceptOptionSelection(false);
              }}
              data-testid="button-cancel-accept-option"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAcceptOption}
              disabled={!selectedOption || acceptMutation.isPending}
              className="bg-[#711419] hover:bg-[#711419]/90"
              data-testid="button-confirm-accept-option"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Accept Quote
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

      <AlertDialog open={showWorkOrderSelection} onOpenChange={setShowWorkOrderSelection}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Link to Work Order
            </AlertDialogTitle>
            <AlertDialogDescription>
              Invoices must be tied to a work order for scheduling and tracking. 
              {availableWorkOrders.length > 0 
                ? " Select an existing work order or create a new one."
                : " Create a work order to proceed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {!showCreateWorkOrder ? (
            <>
              {availableWorkOrders.length > 0 && (
                <div className="py-4 space-y-2">
                  <Label className="text-sm font-medium">Select Work Order</Label>
                  {availableWorkOrders.map((wo) => (
                    <button
                      key={wo.id}
                      onClick={() => setSelectedWorkOrderId(wo.id)}
                      className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                        selectedWorkOrderId === wo.id
                          ? "border-[#711419] bg-[#711419]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      data-testid={`work-order-${wo.workOrderNumber}`}
                    >
                      <div className={`font-medium ${selectedWorkOrderId === wo.id ? "text-[#711419]" : ""}`}>
                        WO #{wo.workOrderNumber} - {wo.title || wo.visitType || "Work Order"}
                      </div>
                      {wo.scheduledStart && (
                        <div className="text-sm text-slate-500 mt-1">
                          Scheduled: {format(new Date(wo.scheduledStart), "MMM d, yyyy")}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateWorkOrder(true)}
                  className="w-full"
                  data-testid="button-create-work-order"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Work Order
                </Button>
              </div>
              
              <AlertDialogFooter>
                <AlertDialogCancel 
                  onClick={() => {
                    setSelectedWorkOrderId("");
                    setShowWorkOrderSelection(false);
                  }}
                  data-testid="button-cancel-work-order"
                >
                  Cancel
                </AlertDialogCancel>
                {availableWorkOrders.length > 0 && (
                  <AlertDialogAction
                    onClick={handleSelectWorkOrder}
                    disabled={!selectedWorkOrderId || createInvoiceMutation.isPending}
                    className="bg-[#711419] hover:bg-[#711419]/90"
                    data-testid="button-select-work-order"
                  >
                    {createInvoiceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Create Invoice
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wo-title">Title *</Label>
                  <Input
                    id="wo-title"
                    value={newWorkOrderTitle}
                    onChange={(e) => setNewWorkOrderTitle(e.target.value)}
                    placeholder={`Work Order from Quote ${quote?.quoteNumber}`}
                    data-testid="input-work-order-title"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="wo-description">Description *</Label>
                  <Textarea
                    id="wo-description"
                    value={newWorkOrderDescription}
                    onChange={(e) => setNewWorkOrderDescription(e.target.value)}
                    placeholder="Describe the work to be done..."
                    className="min-h-[80px]"
                    data-testid="textarea-work-order-description"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="wo-type">Visit Type</Label>
                  <Select value={newWorkOrderVisitType} onValueChange={(val) => {
                    setNewWorkOrderVisitType(val);
                    // Set default subtype based on visit type
                    const defaultSubtypes: Record<string, string> = {
                      "INSTALL": "Full System",
                      "SERVICE": "No Cool",
                      "MAINTENANCE": "Spring Tune-Up",
                      "SALES": "Comfort Consultation",
                    };
                    setNewWorkOrderSubtype(defaultSubtypes[val] || "Other");
                  }}>
                    <SelectTrigger data-testid="select-visit-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INSTALL">Installation</SelectItem>
                      <SelectItem value="SERVICE">Service</SelectItem>
                      <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                      <SelectItem value="SALES">Sales Visit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="wo-subtype">Work Type</Label>
                  <Select value={newWorkOrderSubtype} onValueChange={setNewWorkOrderSubtype}>
                    <SelectTrigger data-testid="select-work-subtype">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {newWorkOrderVisitType === "INSTALL" && (
                        <>
                          <SelectItem value="Full System">Full System</SelectItem>
                          <SelectItem value="Changeout">Changeout</SelectItem>
                          <SelectItem value="Add Ducts">Add Ducts</SelectItem>
                          <SelectItem value="Replace Ducts">Replace Ducts</SelectItem>
                          <SelectItem value="IAQ Install">IAQ Install</SelectItem>
                          <SelectItem value="Mini-split">Mini-split</SelectItem>
                          <SelectItem value="Crawlspace">Crawlspace</SelectItem>
                        </>
                      )}
                      {newWorkOrderVisitType === "SERVICE" && (
                        <>
                          <SelectItem value="No Cool">No Cool</SelectItem>
                          <SelectItem value="No Heat">No Heat</SelectItem>
                          <SelectItem value="Water Leak">Water Leak</SelectItem>
                          <SelectItem value="Electrical">Electrical</SelectItem>
                          <SelectItem value="Thermostat">Thermostat</SelectItem>
                          <SelectItem value="Airflow">Airflow</SelectItem>
                          <SelectItem value="Noise">Noise</SelectItem>
                          <SelectItem value="IAQ">IAQ</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </>
                      )}
                      {newWorkOrderVisitType === "MAINTENANCE" && (
                        <>
                          <SelectItem value="Spring Tune-Up">Spring Tune-Up</SelectItem>
                          <SelectItem value="Fall Tune-Up">Fall Tune-Up</SelectItem>
                          <SelectItem value="Maintenance Plan Visit">Maintenance Plan Visit</SelectItem>
                          <SelectItem value="Safety Inspection">Safety Inspection</SelectItem>
                          <SelectItem value="Duct Cleaning">Duct Cleaning</SelectItem>
                          <SelectItem value="IAQ Service">IAQ Service</SelectItem>
                        </>
                      )}
                      {newWorkOrderVisitType === "SALES" && (
                        <>
                          <SelectItem value="Comfort Consultation">Comfort Consultation</SelectItem>
                          <SelectItem value="HEAR Program">HEAR Program</SelectItem>
                          <SelectItem value="HER Program">HER Program</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <AlertDialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateWorkOrder(false)}
                  data-testid="button-back-work-order"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreateAndSelectWorkOrder}
                  disabled={isCreatingWorkOrder || !newWorkOrderTitle.trim() || !newWorkOrderDescription.trim()}
                  className="bg-[#711419] hover:bg-[#711419]/90"
                  data-testid="button-create-and-invoice"
                >
                  {isCreatingWorkOrder ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create Work Order & Invoice
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
