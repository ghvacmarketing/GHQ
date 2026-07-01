import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
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
  Monitor,
  Pencil,
  FolderKanban,
  Eye,
  Package,
  Search,
  Tag,
  Star,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmQuote, CrmQuoteLineItem, QuoteEmailLog, CrmItem } from "@shared/schema";
import { PaymentLinkButton } from "@/components/stripe-payment-link-button";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor, { RichTextDisplay } from "@/components/rich-text-editor";
import ghvacLogo from "@assets/ghvac-logo.png";
import { generateContractTemplate, applyTemplateVariables } from "@/lib/contract-template";
import {
  getProtectionDiscountPct,
  protectionDiscountLabel,
  parseProtectionDiscountLabelPct,
} from "@/lib/protection-discount";
import type { ProposalTemplate } from "@shared/schema";
import {
  BRAND_COLOR,
  COMPANY_INFO,
  PACKAGE_LEVEL_ORDER,
  getOptionSortOrder,
  groupLineItemsByOption,
  formatPresentationCurrency,
  formatPresentationDate,
  parseEquipmentImages,
  PresentationEquipmentImageGrid,
  getWhatsIncludedForOption,
  PresentationSignaturePad,
  type OptionGroup,
  type EquipmentImages,
  type WhatsIncludedItem,
  type WhatsIncludedResult,
} from "@/components/quote-presentation";

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
  usePageTitle("Quote Detail");
  const [, navigate] = useLocation();
  const [, params] = useRoute("/crm/quotes/:id");
  const quoteId = params?.id;
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const fromCustomer = searchParams.get("from") === "customer";
  const customerIdParam = searchParams.get("customerId");
  const tabParam = searchParams.get("tab");

  const handleBack = () => {
    if (fromCustomer && customerIdParam) {
      navigate(`/crm/customers/${customerIdParam}?tab=${tabParam || "quotes"}`);
    } else {
      navigate("/crm/quotes");
    }
  };
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
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [sendViaSms, setSendViaSms] = useState(false);
  const [sendPhoneRecipient, setSendPhoneRecipient] = useState("");
  const [expandedEmailIds, setExpandedEmailIds] = useState<Set<string>>(new Set());
  const [showMarkAsSentDialog, setShowMarkAsSentDialog] = useState(false);
  const [markSentNote, setMarkSentNote] = useState("");
  const [isEditingAssignment, setIsEditingAssignment] = useState(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [showPresentation, setShowPresentation] = useState(false);
  const [presentationSignature, setPresentationSignature] = useState("");
  const [presentationName, setPresentationName] = useState("");
  const [presentationAgreed, setPresentationAgreed] = useState(false);
  const [presentationSelectedOption, setPresentationSelectedOption] = useState<string | null>(null);
  const [isPresentationEditingDesc, setIsPresentationEditingDesc] = useState(false);
  const [presentationDescDraft, setPresentationDescDraft] = useState("");
  const [showWhatsIncludedDialog, setShowWhatsIncludedDialog] = useState(false);
  const [editingWhatsIncluded, setEditingWhatsIncluded] = useState<Array<{ category: string; items: string[] }>>([]);
  const [showWarrantiesDialog, setShowWarrantiesDialog] = useState(false);
  const [editingWarranties, setEditingWarranties] = useState("");
  const [showFinancingDialog, setShowFinancingDialog] = useState(false);
  const [editingFinancingText, setEditingFinancingText] = useState("");
  const [isVerifyingDeposit, setIsVerifyingDeposit] = useState(false);
  const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false);
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [editingLineItemData, setEditingLineItemData] = useState<{ description: string; quantity: string; unitPrice: string }>({ description: "", quantity: "", unitPrice: "" });
  const [isAddingNewLineItem, setIsAddingNewLineItem] = useState(false);
  const [newLineItemData, setNewLineItemData] = useState<{ description: string; quantity: string; unitPrice: string }>({ description: "", quantity: "1", unitPrice: "" });
  const [newItemOptionTag, setNewItemOptionTag] = useState<string>("");
  const [newItemOptionTagCreating, setNewItemOptionTagCreating] = useState(false);
  const [catalogItemOptionTag, setCatalogItemOptionTag] = useState<string>("");
  const [catalogItemOptionTagCreating, setCatalogItemOptionTagCreating] = useState(false);

  const [showManualSignatureDialog, setShowManualSignatureDialog] = useState(false);
  const [manualSignature, setManualSignature] = useState("");
  const [manualSignerName, setManualSignerName] = useState("");
  const [pendingManualOption, setPendingManualOption] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const { data: proposalTemplates = [], isLoading: templatesLoading } = useQuery<ProposalTemplate[]>({
    queryKey: ["/api/crm/proposal-templates"],
  });

  // Items catalog state
  const [showItemsCatalogDialog, setShowItemsCatalogDialog] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "install" | "service" | "maintenance" | "discount" | "protection" | "field_edge">("all");

  // Discount modal state
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [discountKind, setDiscountKind] = useState<"promotion" | "maintenance">("promotion");
  const [discountMode, setDiscountMode] = useState<"amount" | "percentage">("amount");
  const [discountValue, setDiscountValue] = useState("");

  // Protection bundle parts-discount prompt
  const [protectionPrompt, setProtectionPrompt] = useState<{ pct: number; bundleName: string } | null>(null);

  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpContext, setFollowUpContext] = useState<{
    customerId: string;
    propertyId: string | null;
    projectId: string | null;
    quoteId: string;
    quoteTitle: string;
  } | null>(null);

  const [showCreateProjectPrompt, setShowCreateProjectPrompt] = useState(false);
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [projectFormData, setProjectFormData] = useState({
    title: "",
    projectType: "INSTALL",
    expectedValue: "",
    description: "",
    priority: "normal",
    customerId: "",
    propertyId: "",
    customerName: "",
  });

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
    staleTime: 2 * 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as QuoteWithLines | undefined;
      // Poll every 3 seconds when a Stripe payment link is open and deposit hasn't landed yet
      if (data?.stripePaymentLinkId && !data?.depositPaidAt && data?.status !== "accepted") {
        return 3000;
      }
      return 60000;
    },
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

  // CRM Items search query for catalog
  const { data: itemSearchResults, isLoading: isSearchingItems } = useQuery<CrmItem[]>({
    queryKey: ["/api/crm/items", "search", itemSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (itemSearch.trim()) {
        params.set("search", itemSearch.trim());
      }
      const response = await fetch(`/api/crm/items?${params.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to search items");
      const data = await response.json();
      return data.items || data || [];
    },
    enabled: showItemsCatalogDialog,
  });

  const filteredItems = itemSearchResults?.filter(item => {
    if (categoryFilter === "all") return true;
    return item.category === categoryFilter;
  }) || [];

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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      const prev = queryClient.getQueryData(["/api/crm/quotes", quoteId]);
      queryClient.setQueryData(["/api/crm/quotes", quoteId], (old: any) => old ? { ...old, status: "sent" } : old);
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.map((q: any) => q.id === quoteId ? { ...q, status: "sent" } : q) };
      });
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote sent", description: "Quote status updated to sent." });
    },
    onError: (error: Error, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(["/api/crm/quotes", quoteId], context.prev);
      toast({ title: "Failed to send quote", description: error.message, variant: "destructive" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { recipientEmail?: string; recipientPhone?: string; personalMessage?: string; sendEmail: boolean; sendSms: boolean }) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || result.message || "Failed to send quote");
      }
      return result as { success: boolean; successCount: number; totalCount: number; emailSent?: boolean; smsSent?: boolean };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      const prev = queryClient.getQueryData(["/api/crm/quotes", quoteId]);
      queryClient.setQueryData(["/api/crm/quotes", quoteId], (old: any) => old ? { ...old, status: "sent" } : old);
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.map((q: any) => q.id === quoteId ? { ...q, status: "sent" } : q) };
      });
      return { prev };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId, "email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowSendQuoteDialog(false);
      setSendEmailRecipient("");
      setSendEmailMessage("");
      setSendPhoneRecipient("");
      setSendViaEmail(true);
      setSendViaSms(false);
      let description = "";
      if (data.emailSent && data.smsSent) {
        description = "The quote has been sent via email and SMS.";
      } else if (data.smsSent) {
        description = "The quote has been sent via SMS.";
      } else if (data.totalCount > 1) {
        description = `Quote sent to ${data.successCount} of ${data.totalCount} recipients.`;
      } else {
        description = "The quote has been emailed to the customer.";
      }
      toast({ title: "Quote sent!", description });
    },
    onError: (error: Error, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(["/api/crm/quotes", quoteId], context.prev);
      toast({ title: "Failed to send quote", description: error.message, variant: "destructive" });
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      const prev = queryClient.getQueryData(["/api/crm/quotes", quoteId]);
      queryClient.setQueryData(["/api/crm/quotes", quoteId], (old: any) => old ? { ...old, status: "sent" } : old);
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.map((q: any) => q.id === quoteId ? { ...q, status: "sent" } : q) };
      });
      return { prev };
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
    onError: (error: Error, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(["/api/crm/quotes", quoteId], context.prev);
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
      setIsPresentationEditingDesc(false);
      toast({ title: "Description updated", description: "The quote description has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update description", description: error.message, variant: "destructive" });
    },
  });

  const updateWhatsIncludedMutation = useMutation({
    mutationFn: async (whatsIncluded: Array<{ category: string; items: string[] }>) => {
      const updatedAiGeneratedQuote = {
        ...(quote?.aiGeneratedQuote ?? {}),
        whats_included: whatsIncluded,
      };
      const res = await fetch(`/api/crm/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aiGeneratedQuote: updatedAiGeneratedQuote }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to update What's Included");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setShowWhatsIncludedDialog(false);
      toast({ title: "What's Included updated", description: "The What's Included section has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update What's Included", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenWhatsIncludedDialog = () => {
    if (quote?.aiGeneratedQuote?.whats_included) {
      setEditingWhatsIncluded(JSON.parse(JSON.stringify(quote.aiGeneratedQuote.whats_included)));
    } else {
      setEditingWhatsIncluded([]);
    }
    setShowWhatsIncludedDialog(true);
  };

  const handleWhatsIncludedItemChange = (categoryIndex: number, itemIndex: number, value: string) => {
    setEditingWhatsIncluded(prev => {
      const updated = [...prev];
      updated[categoryIndex] = {
        ...updated[categoryIndex],
        items: [...updated[categoryIndex].items],
      };
      updated[categoryIndex].items[itemIndex] = value;
      return updated;
    });
  };

  const handleAddWhatsIncludedItem = (categoryIndex: number) => {
    setEditingWhatsIncluded(prev => {
      const updated = [...prev];
      updated[categoryIndex] = {
        ...updated[categoryIndex],
        items: [...updated[categoryIndex].items, ""],
      };
      return updated;
    });
  };

  const handleRemoveWhatsIncludedItem = (categoryIndex: number, itemIndex: number) => {
    setEditingWhatsIncluded(prev => {
      const updated = [...prev];
      updated[categoryIndex] = {
        ...updated[categoryIndex],
        items: updated[categoryIndex].items.filter((_, i) => i !== itemIndex),
      };
      return updated;
    });
  };

  const handleSaveWhatsIncluded = () => {
    // Guard against saving if quote status has changed from draft
    if (quote?.status !== "draft") {
      toast({
        title: "Cannot Save Changes",
        description: "This quote is no longer a draft. Changes cannot be saved.",
        variant: "destructive",
      });
      setShowWhatsIncludedDialog(false);
      return;
    }
    
    const cleanedData = editingWhatsIncluded.map(cat => ({
      category: cat.category,
      items: cat.items.filter(item => item.trim() !== ""),
    }));
    updateWhatsIncludedMutation.mutate(cleanedData);
  };

  const updateWarrantiesMutation = useMutation({
    mutationFn: async (warranties: string[]) => {
      const updatedAiGeneratedQuote = {
        ...(quote?.aiGeneratedQuote ?? {}),
        warranties_and_terms: warranties,
      };
      const res = await fetch(`/api/crm/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aiGeneratedQuote: updatedAiGeneratedQuote }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to update Warranties & Terms");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setShowWarrantiesDialog(false);
      toast({ title: "Warranties & Terms updated", description: "The Warranties & Terms section has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update Warranties & Terms", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenWarrantiesDialog = () => {
    if (quote?.aiGeneratedQuote?.warranties_and_terms) {
      setEditingWarranties(quote.aiGeneratedQuote.warranties_and_terms.join("\n"));
    } else {
      setEditingWarranties("");
    }
    setShowWarrantiesDialog(true);
  };

  const handleSaveWarranties = () => {
    if (quote?.status !== "draft") {
      toast({
        title: "Cannot Save Changes",
        description: "This quote is no longer a draft. Changes cannot be saved.",
        variant: "destructive",
      });
      setShowWarrantiesDialog(false);
      return;
    }
    
    const warrantiesArray = editingWarranties
      .split("\n")
      .map(line => line.trim())
      .filter(line => line !== "");
    updateWarrantiesMutation.mutate(warrantiesArray);
  };

  const updateFinancingMutation = useMutation({
    mutationFn: async (financingText: string) => {
      const updatedAiGeneratedQuote = {
        ...(quote?.aiGeneratedQuote ?? {}),
        financing_text: financingText,
      };
      const res = await fetch(`/api/crm/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aiGeneratedQuote: updatedAiGeneratedQuote }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to update Financing Text");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      setShowFinancingDialog(false);
      toast({ title: "Financing text updated", description: "The financing text has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update financing text", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenFinancingDialog = () => {
    setEditingFinancingText(quote?.aiGeneratedQuote?.financing_text || "");
    setShowFinancingDialog(true);
  };

  const handleSaveFinancing = () => {
    if (quote?.status !== "draft") {
      toast({
        title: "Cannot Save Changes",
        description: "This quote is no longer a draft. Changes cannot be saved.",
        variant: "destructive",
      });
      setShowFinancingDialog(false);
      return;
    }
    
    updateFinancingMutation.mutate(editingFinancingText.trim());
  };

  const updateLineItemMutation = useMutation({
    mutationFn: async (data: { lineItemId: string; description: string; quantity: number; unitPrice: number; lineTotal: number }) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/line-items/${data.lineItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          description: data.description,
          quantity: data.quantity,
          unitPrice: data.unitPrice.toString(),
          lineTotal: data.lineTotal.toString(),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to update line item");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      setEditingLineItemId(null);
      setEditingLineItemData({ description: "", quantity: "", unitPrice: "" });
      toast({ title: "Line item updated", description: "The line item has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update line item", description: error.message, variant: "destructive" });
    },
  });

  const addLineItemMutation = useMutation({
    mutationFn: async (data: { description: string; quantity: string; unitPrice: string; lineTotal: string; optionTag?: string }) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          description: data.description,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          lineTotal: data.lineTotal,
          ...(data.optionTag ? { optionTag: data.optionTag } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to add line item");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      setIsAddingNewLineItem(false);
      setNewLineItemData({ description: "", quantity: "1", unitPrice: "" });
      setNewItemOptionTag("");
      setNewItemOptionTagCreating(false);
      toast({ title: "Line item added", description: "The new line item has been added to the quote." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add line item", description: error.message, variant: "destructive" });
    },
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: async (lineItemId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/quotes/${quoteId}/line-items/${lineItemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      toast({ title: "Line item deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete line item",
        variant: "destructive",
      });
    },
  });

  const addFromCatalogMutation = useMutation({
    mutationFn: async ({ item, optionTag }: { item: CrmItem; optionTag?: string }) => {
      const price = parseFloat(item.rate || "0");
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/line-items`, {
        description: item.name,
        quantity: "1",
        unitPrice: price.toString(),
        lineTotal: price.toString(),
        lineType: ["install", "service", "maintenance", "protection", "discount"].includes(item.category || "")
          ? item.category
          : "install",
        itemId: item.id,
        ...(optionTag ? { optionTag } : {}),
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      setShowItemsCatalogDialog(false);
      setItemSearch("");
      setCategoryFilter("all");
      setCatalogItemOptionTag("");
      setCatalogItemOptionTagCreating(false);
      toast({ title: "Item added from catalog" });
      // Offer to auto-apply the bundle's parts discount to the rest of the quote.
      const item = variables.item;
      if (item.category === "protection") {
        const pct = getProtectionDiscountPct(item.description, item.name);
        if (pct && !hasProtectionDiscountLine()) {
          setProtectionPrompt({ pct, bundleName: item.name });
        }
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add item", variant: "destructive" });
    },
  });

  // --- Protection bundle parts-discount helpers ---
  const hasProtectionBundleLine = () =>
    quote?.lineItems?.some(
      (item) => item.lineType === "protection" && parseFloat(String(item.unitPrice)) > 0,
    ) || false;

  const findProtectionDiscountLine = () =>
    quote?.lineItems?.find(
      (item) => item.discountKind === "protection" && parseFloat(String(item.unitPrice)) < 0,
    );

  const hasProtectionDiscountLine = () => !!findProtectionDiscountLine();

  const calculateProtectionEligibleSubtotal = () =>
    quote?.lineItems
      ?.filter((item) => {
        const price = parseFloat(String(item.unitPrice)) || 0;
        if (item.isDiscountLine || item.lineType === "discount") return false;
        if (item.lineType === "protection") return false;
        return price > 0;
      })
      .reduce((sum, item) => sum + parseFloat(String(item.lineTotal || 0)), 0) || 0;

  const addProtectionDiscountMutation = useMutation({
    mutationFn: async ({ pct, amount }: { pct: number; amount: number }) => {
      const value = -Math.abs(amount);
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/line-items`, {
        description: protectionDiscountLabel(pct),
        quantity: "1",
        unitPrice: value.toString(),
        lineTotal: value.toString(),
        lineType: "discount",
        isDiscountLine: true,
        discountKind: "protection",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      setProtectionPrompt(null);
      toast({ title: "Parts discount applied" });
    },
    onError: (error: any) => {
      setProtectionPrompt(null);
      toast({ title: "Error", description: error.message || "Failed to apply discount", variant: "destructive" });
    },
  });

  const handleApplyProtectionDiscount = (pct: number) => {
    const eligible = calculateProtectionEligibleSubtotal();
    if (eligible <= 0) {
      toast({
        title: "No eligible items",
        description: "Add priced line items before applying the parts discount.",
        variant: "destructive",
      });
      setProtectionPrompt(null);
      return;
    }
    addProtectionDiscountMutation.mutate({ pct, amount: eligible * (pct / 100) });
  };

  // Keep the protection discount in sync: recalc when eligible items change and
  // remove it automatically once the bundle is gone.
  useEffect(() => {
    if (!quote?.lineItems) return;
    const discountLine = findProtectionDiscountLine();
    if (!discountLine) return;
    if (deleteLineItemMutation.isPending || updateLineItemMutation.isPending) return;

    if (!hasProtectionBundleLine()) {
      deleteLineItemMutation.mutate(discountLine.id);
      return;
    }

    const pct = parseProtectionDiscountLabelPct(discountLine.description);
    if (!pct) return;
    const eligible = calculateProtectionEligibleSubtotal();
    const target = -Math.abs(eligible * (pct / 100));
    const current = parseFloat(String(discountLine.unitPrice)) || 0;
    if (Math.abs(current - target) > 0.005) {
      updateLineItemMutation.mutate({
        lineItemId: discountLine.id,
        description: discountLine.description || protectionDiscountLabel(pct),
        quantity: 1,
        unitPrice: target,
        lineTotal: target,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.lineItems]);

  const calculateQuoteSubtotal = () => {
    return quote?.lineItems
      ?.filter(item => !item.description?.startsWith("Discount:") && parseFloat(String(item.unitPrice)) > 0)
      .reduce((sum, item) => sum + parseFloat(String(item.lineTotal || 0)), 0) || 0;
  };

  const hasExistingDiscount = (kind: "promotion" | "maintenance") => {
    return quote?.lineItems?.some(item => 
      item.description?.includes(kind === "promotion" ? "Promotional" : "Maintenance") && 
      parseFloat(String(item.unitPrice)) < 0
    ) || false;
  };

  const calculateEligibleSubtotal = (kind: "promotion" | "maintenance") => {
    return quote?.lineItems
      ?.filter(item => {
        const price = parseFloat(String(item.unitPrice)) || 0;
        if (item.description?.startsWith("Discount:") || price <= 0) return false;
        if (kind === "maintenance") return true;
        const category = item.lineType || "install";
        return category === "install" || category === "service";
      })
      .reduce((sum, item) => sum + parseFloat(String(item.lineTotal || 0)), 0) || 0;
  };

  const addDiscountMutation = useMutation({
    mutationFn: async (data: { description: string; amount: number }) => {
      const discountValue = -Math.abs(data.amount);
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/line-items`, {
        description: data.description,
        quantity: "1",
        unitPrice: discountValue.toString(),
        lineTotal: discountValue.toString(),
        lineType: "discount",
        isDiscountLine: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      setShowDiscountDialog(false);
      setDiscountKind("promotion");
      setDiscountMode("amount");
      setDiscountValue("");
      toast({ title: "Discount added" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add discount", variant: "destructive" });
    },
  });

  const handleApplyDiscount = () => {
    if (hasExistingDiscount(discountKind)) {
      toast({ title: "Discount already exists", description: "Remove the existing discount first.", variant: "destructive" });
      return;
    }

    let discountAmount: number;
    let description: string;

    if (discountKind === "maintenance") {
      discountAmount = calculateQuoteSubtotal() * 0.15;
      description = "Discount: Maintenance Agreement (15%)";
    } else {
      if (discountMode === "amount") {
        discountAmount = parseFloat(discountValue) || 0;
      } else {
        discountAmount = calculateEligibleSubtotal("promotion") * (parseFloat(discountValue) || 0) / 100;
      }
      description = discountMode === "percentage" 
        ? `Discount: Promotional (${discountValue}%)`
        : `Discount: Promotional`;
    }

    if (discountAmount <= 0) {
      toast({ title: "Invalid discount", description: "Please enter a valid discount amount.", variant: "destructive" });
      return;
    }

    addDiscountMutation.mutate({ description, amount: discountAmount });
  };

  const handleStartEditLineItem = (item: CrmQuoteLineItem) => {
    setEditingLineItemId(item.id);
    setEditingLineItemData({
      description: item.description || "",
      quantity: String(item.quantity || 1),
      unitPrice: String(parseFloat(item.unitPrice || "0")),
    });
  };

  const handleCancelEditLineItem = () => {
    setEditingLineItemId(null);
    setEditingLineItemData({ description: "", quantity: "", unitPrice: "" });
  };

  const handleSaveLineItem = () => {
    if (!editingLineItemId) return;
    const quantity = parseFloat(editingLineItemData.quantity) || 0;
    const unitPrice = parseFloat(editingLineItemData.unitPrice) || 0;
    const lineTotal = quantity * unitPrice;
    if (!editingLineItemData.description.trim()) {
      toast({ title: "Description required", variant: "destructive" });
      return;
    }
    if (quantity <= 0) {
      toast({ title: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }
    updateLineItemMutation.mutate({
      lineItemId: editingLineItemId,
      description: editingLineItemData.description.trim(),
      quantity,
      unitPrice,
      lineTotal,
    });
  };

  const handleAddLineItem = () => {
    const quantity = parseFloat(newLineItemData.quantity) || 0;
    const unitPrice = parseFloat(newLineItemData.unitPrice) || 0;
    const lineTotal = quantity * unitPrice;
    if (!newLineItemData.description.trim()) {
      toast({ title: "Description required", variant: "destructive" });
      return;
    }
    if (quantity <= 0) {
      toast({ title: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }
    addLineItemMutation.mutate({
      description: newLineItemData.description.trim(),
      quantity: quantity.toString(),
      unitPrice: unitPrice.toString(),
      lineTotal: lineTotal.toString(),
      optionTag: newItemOptionTag || undefined,
    });
  };

  const handleCancelAddLineItem = () => {
    setIsAddingNewLineItem(false);
    setNewLineItemData({ description: "", quantity: "1", unitPrice: "" });
    setNewItemOptionTag("");
    setNewItemOptionTagCreating(false);
  };

  const calculateLineItemsSubtotal = () => {
    if (!quote?.lineItems) return 0;
    return quote.lineItems
      .filter(item => !item.isDiscountLine && !item.description?.startsWith("Discount:"))
      .reduce((sum, item) => sum + parseFloat(String(item.lineTotal || 0)), 0);
  };

  const calculateLineItemsTotal = () => {
    if (!quote?.lineItems) return 0;
    return quote.lineItems.reduce((sum, item) => {
      const lineTotal = parseFloat(String(item.lineTotal || 0));
      return sum + lineTotal;
    }, 0);
  };

  const getEditingLineTotal = () => {
    const quantity = parseFloat(editingLineItemData.quantity) || 0;
    const unitPrice = parseFloat(editingLineItemData.unitPrice) || 0;
    return quantity * unitPrice;
  };

  const getNewLineTotal = () => {
    const quantity = parseFloat(newLineItemData.quantity) || 0;
    const unitPrice = parseFloat(newLineItemData.unitPrice) || 0;
    return quantity * unitPrice;
  };

  const canEditLineItems = quote && !["accepted", "converted"].includes(quote.status);

  const acceptInPersonMutation = useMutation({
    mutationFn: async (data: { signatureImage: string; signerName: string; selectedOption?: string | null }) => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/accept-in-person`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || result.message || "Failed to accept quote");
      }
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId, "email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      const customerId = quote?.customerId || quote?.accountId;
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "timeline"] });
      }
      setShowPresentation(false);
      setPresentationSignature("");
      setPresentationName("");
      setPresentationAgreed(false);
      setPresentationSelectedOption(null);
      toast({ title: "Quote accepted!", description: "The client has accepted the quote in person." });

      if (data.requiresFollowUpChoice && data.followUpContext) {
        setFollowUpContext(data.followUpContext);
        setShowFollowUpModal(true);
      }

      const quoteType = quote?.quoteType?.toLowerCase();
      if (quoteType === "custom_install" || quoteType === "proposal") {
        const getExpectedValue = () => {
          // For options mode, calculate selected option total
          if (quote?.quoteMode === "options" && data.selectedOption && quote?.lineItems) {
            const optionItems = quote.lineItems.filter(li => li.optionTag === data.selectedOption);
            const optionTotal = optionItems.reduce((sum, li) => sum + (parseFloat(li.lineTotal || '0')), 0);
            return optionTotal > 0 ? String(optionTotal) : (quote?.total || "");
          }
          // For single mode, use quote total
          return quote?.total || "";
        };

        setProjectFormData({
          title: quote?.title || `Project for ${quote?.quoteNumber || "Quote"}`,
          projectType: "INSTALL",
          expectedValue: getExpectedValue(),
          description: quote?.description || "",
          priority: "normal",
          customerId: quote?.customerId || quote?.accountId || "",
          propertyId: quote?.propertyId || quote?.siteId || "",
          customerName: quote?.customer?.name || quote?.customerName || "",
        });
        setShowCreateProjectPrompt(true);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to accept quote", description: error.message, variant: "destructive" });
    },
  });

  const handlePresentationAccept = async () => {
    if (!presentationSignature) {
      toast({ title: "Signature required", description: "Please have the client sign above.", variant: "destructive" });
      return;
    }
    if (!presentationName.trim()) {
      toast({ title: "Name required", description: "Please enter the client's printed name.", variant: "destructive" });
      return;
    }
    if (!presentationAgreed) {
      toast({ title: "Terms required", description: "Please agree to the terms and conditions.", variant: "destructive" });
      return;
    }
    if (quote?.quoteMode === "options" && !presentationSelectedOption) {
      toast({ title: "Selection required", description: "Please select one of the available options.", variant: "destructive" });
      return;
    }

    // Check if this quote requires a deposit payment (install/proposal quotes)
    const DEPOSIT_QUOTE_TYPES = ["custom_install", "proposal", "custom_service"];
    const requiresDeposit = DEPOSIT_QUOTE_TYPES.includes(quote?.quoteType?.toLowerCase() || "");

    if (requiresDeposit) {
      // Generate payment link and redirect to Stripe
      setIsGeneratingPaymentLink(true);
      try {
        const response = await fetch(`/api/stripe/quote/${quoteId}/payment-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            selectedOption: presentationSelectedOption,
            signatureImage: presentationSignature,
            signerName: presentationName.trim(),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to create payment link");
        }

        if (data.paymentLinkUrl) {
          // Open Stripe payment page in new tab
          window.open(data.paymentLinkUrl, '_blank');
          toast({ 
            title: "Payment link opened", 
            description: "A new tab has been opened for the customer to complete the deposit payment." 
          });
        }
      } catch (error: any) {
        toast({ 
          title: "Payment Error", 
          description: error.message || "Failed to generate payment link", 
          variant: "destructive" 
        });
      } finally {
        setIsGeneratingPaymentLink(false);
      }
    } else {
      // For non-deposit quotes, accept directly
      acceptInPersonMutation.mutate({
        signatureImage: presentationSignature,
        signerName: presentationName.trim(),
        selectedOption: presentationSelectedOption,
      });
    }
  };

  const resetPresentationState = () => {
    setPresentationSignature("");
    setPresentationName("");
    setPresentationAgreed(false);
    setPresentationSelectedOption(null);
  };

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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      const prev = queryClient.getQueryData(["/api/crm/quotes", quoteId]);
      queryClient.setQueryData(["/api/crm/quotes", quoteId], (old: any) => old ? { ...old, status: "accepted" } : old);
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.map((q: any) => q.id === quoteId ? { ...q, status: "accepted" } : q) };
      });
      return { prev };
    },
    onSuccess: (data) => {
      setShowAcceptOptionSelection(false);
      setSelectedOption("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      const acceptCustomerId = quote?.customerId || quote?.accountId;
      if (acceptCustomerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", acceptCustomerId, "timeline"] });
      }
      toast({ title: "Quote accepted", description: "Quote status updated to accepted." });

      if (data.requiresFollowUpChoice && data.followUpContext) {
        setFollowUpContext(data.followUpContext);
        setShowFollowUpModal(true);
      }

      const quoteType = quote?.quoteType?.toLowerCase();
      if (quoteType === "custom_install" || quoteType === "proposal") {
        const getExpectedValue = () => {
          // For options mode, calculate selected option total
          if (quote?.quoteMode === "options" && data.selectedOption && quote?.lineItems) {
            const optionItems = quote.lineItems.filter(li => li.optionTag === data.selectedOption);
            const optionTotal = optionItems.reduce((sum, li) => sum + (parseFloat(li.lineTotal || '0')), 0);
            return optionTotal > 0 ? String(optionTotal) : (quote?.total || "");
          }
          // For single mode, use quote total
          return quote?.total || "";
        };

        setProjectFormData({
          title: quote?.title || `Project for ${quote?.quoteNumber || "Quote"}`,
          projectType: "INSTALL",
          expectedValue: getExpectedValue(),
          description: quote?.description || "",
          priority: "normal",
          customerId: quote?.customerId || quote?.accountId || "",
          propertyId: quote?.propertyId || quote?.siteId || "",
          customerName: quote?.customer?.name || quote?.customerName || "",
        });
        setShowCreateProjectPrompt(true);
      }
    },
    onError: (error: { message?: string; requiresOptionSelection?: boolean; availableOptions?: string[] } | Error, _vars: any, context: any) => {
      if (context?.prev) queryClient.setQueryData(["/api/crm/quotes", quoteId], context.prev);
      if ('requiresOptionSelection' in error && error.requiresOptionSelection && error.availableOptions) {
        setAvailableOptions(error.availableOptions);
        setShowAcceptOptionSelection(true);
        return;
      }
      toast({ title: "Failed to accept quote", description: (error as Error).message || "Unknown error", variant: "destructive" });
    },
  });

  const createFollowUpMutation = useMutation({
    mutationFn: async (mode: "parts_needed" | "schedule_now") => {
      const res = await fetch(`/api/crm/quotes/${quoteId}/create-follow-up-work-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create follow-up work order");
      return data;
    },
    onSuccess: (data) => {
      setShowFollowUpModal(false);
      setFollowUpContext(null);
      if (data.mode === "parts_needed" && data.workOrder) {
        toast({
          title: "Work Order Created",
          description: `Follow-up work order #${data.workOrder.workOrderNumber} has been added to the Parts Needed queue.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
        // Navigate to the unassigned work orders board (Parts Needed section)
        navigate("/crm/work-orders");
      } else if (data.mode === "schedule_now" && data.context) {
        const params = new URLSearchParams({
          createWO: "true",
          customerId: data.context.customerId || "",
          propertyId: data.context.propertyId || "",
          projectId: data.context.projectId || "",
          sourceQuoteId: data.context.sourceQuoteId || "",
          title: data.context.suggestedTitle || "",
          description: data.context.suggestedDescription || "",
        });
        navigate(`/crm/dispatch?${params.toString()}`);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      propertyId?: string;
      title: string;
      projectType: string;
      expectedValue?: string;
      description?: string;
      priority?: string;
      quoteId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/crm/projects", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Project created",
        description: "The project has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setShowCreateProjectForm(false);
      setShowCreateProjectPrompt(false);
      if (data?.id) {
        navigate(`/crm/projects/${data.id}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const handleCreateProject = () => {
    if (!projectFormData.customerId) {
      toast({
        title: "Missing customer",
        description: "Cannot create project - no customer associated with this quote.",
        variant: "destructive",
      });
      return;
    }

    if (!projectFormData.title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a project title.",
        variant: "destructive",
      });
      return;
    }

    createProjectMutation.mutate({
      customerId: projectFormData.customerId,
      propertyId: projectFormData.propertyId || undefined,
      title: projectFormData.title.trim(),
      projectType: projectFormData.projectType,
      expectedValue: projectFormData.expectedValue || undefined,
      description: projectFormData.description || undefined,
      priority: projectFormData.priority || undefined,
      quoteId: quoteId,
    });
  };

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${quoteId}/decline`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to decline quote");
      }
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      const prev = queryClient.getQueryData(["/api/crm/quotes", quoteId]);
      queryClient.setQueryData(["/api/crm/quotes", quoteId], (old: any) => old ? { ...old, status: "declined" } : old);
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.map((q: any) => q.id === quoteId ? { ...q, status: "declined" } : q) };
      });
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote declined", description: "Quote status updated to declined." });
    },
    onError: (error: Error, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(["/api/crm/quotes", quoteId], context.prev);
      toast({ title: "Failed to decline quote", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    sendMutation.mutate();
  };

  const handleOpenSendDialog = () => {
    setSendEmailRecipient(quote?.customerEmail || quote?.customer?.email || "");
    setSendPhoneRecipient(quote?.customerPhone || quote?.customer?.phone || "");
    setSendEmailMessage("");
    setSendViaEmail(true);
    setSendViaSms(false);
    setShowSendQuoteDialog(true);
  };

  const handleSendEmail = () => {
    if (sendViaEmail && !sendEmailRecipient.trim()) {
      toast({ title: "Email required", description: "Please enter an email address.", variant: "destructive" });
      return;
    }
    if (sendViaSms && !sendPhoneRecipient.trim()) {
      toast({ title: "Phone required", description: "Please enter a phone number for SMS.", variant: "destructive" });
      return;
    }
    if (!sendViaEmail && !sendViaSms) {
      toast({ title: "Select method", description: "Please select at least one sending method.", variant: "destructive" });
      return;
    }
    sendEmailMutation.mutate({
      recipientEmail: sendViaEmail ? sendEmailRecipient.trim() : undefined,
      recipientPhone: sendViaSms ? sendPhoneRecipient.trim() : undefined,
      personalMessage: sendEmailMessage.trim() || undefined,
      sendEmail: sendViaEmail,
      sendSms: sendViaSms,
    });
  };

  const handleMarkAsSent = () => {
    markAsSentMutation.mutate({ note: markSentNote.trim() || undefined });
  };

  const DEPOSIT_QUOTE_TYPES = ["custom_install", "proposal", "custom_service"];

  const handleApprove = () => {
    const isDepositType = DEPOSIT_QUOTE_TYPES.includes(quote?.quoteType?.toLowerCase() || "");
    if (isDepositType) {
      if (quote?.quoteMode === "options") {
        const opts = [...new Set(
          (quote?.lineItems || [])
            .map((li: any) => li.optionTag)
            .filter((tag: any): tag is string => !!tag)
        )];
        setAvailableOptions(opts);
      } else {
        setAvailableOptions([]);
      }
      setPendingManualOption(null);
      setShowManualSignatureDialog(true);
    } else {
      acceptMutation.mutate({});
    }
  };

  const handleConfirmAcceptOption = () => {
    if (!selectedOption) {
      toast({ title: "Please select an option", variant: "destructive" });
      return;
    }
    acceptMutation.mutate({ selectedOption });
  };

  const handleConfirmManualSignature = () => {
    if (!manualSignature) {
      toast({ title: "Signature required", description: "Please have the client sign before accepting.", variant: "destructive" });
      return;
    }
    if (!manualSignerName.trim()) {
      toast({ title: "Name required", description: "Please enter the client's printed name.", variant: "destructive" });
      return;
    }
    acceptInPersonMutation.mutate({
      signatureImage: manualSignature,
      signerName: manualSignerName.trim(),
      selectedOption: pendingManualOption || undefined,
    });
    setShowManualSignatureDialog(false);
    setManualSignature("");
    setManualSignerName("");
    setPendingManualOption(null);
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["/api/crm/quotes"] });
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.filter((q: any) => q.id !== quoteId) };
      });
      navigate("/crm/quotes");
      return { snapshots };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote deleted", description: "The quote has been permanently deleted." });
    },
    onError: (error: Error, _vars, context: any) => {
      context?.snapshots?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
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

  const handleVerifyDeposit = async () => {
    if (!quote) return;
    setIsVerifyingDeposit(true);
    try {
      const res = await fetch(`/api/stripe/quote/${quote.id}/verify-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const result = await res.json();
      if (result.success) {
        toast({
          title: "Deposit Verified",
          description: result.alreadyPaid 
            ? "Deposit was already recorded."
            : `Deposit of $${result.depositAmount?.toFixed(2)} has been verified and recorded.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", quoteId] });
      } else {
        toast({
          variant: "destructive",
          title: "No Deposit Found",
          description: result.message || "No successful payment found for this quote.",
        });
      }
    } catch (err) {
      console.error("Error verifying deposit:", err);
      toast({
        variant: "destructive",
        title: "Verification Error",
        description: "Failed to verify deposit. Please try again.",
      });
    } finally {
      setIsVerifyingDeposit(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!quote) return;

    // Load logo, recolor every opaque pixel to white (so it sits directly on the
    // dark-red bar without any background box), and capture the aspect ratio.
    let logoDataUrl: string | null = null;
    let logoAspect = 4; // fallback width:height ratio
    try {
      const whiteLogoDataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 10) { // non-transparent pixel → make it white
              d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
            }
          }
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = ghvacLogo;
      });
      logoDataUrl = whiteLogoDataUrl;
      // Measure natural dimensions so we don't squish the image
      logoAspect = await new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
        img.onerror = () => resolve(4);
        img.src = ghvacLogo;
      });
    } catch {
      // Fall back to plain text if canvas recoloring fails
    }

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
        doc.roundedRect(margin, y, contentWidth, 22, 3, 3, 'F');

        // Left side: logo directly on the dark red bar, sized by natural aspect ratio
        if (logoDataUrl) {
          const logoH = 14; // mm — fits comfortably in the 22 mm bar
          const logoW = logoH * logoAspect;
          doc.addImage(logoDataUrl, 'PNG', margin + 4, y + 4, logoW, logoH);
        } else {
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text("Giesbrecht HVAC", margin + 6, y + 13);
        }

        // Right side: phone only (minimal)
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(220, 220, 220);
        doc.text("(706) 826-0644", pageWidth - margin - 6, y + 10, { align: 'right' });
        doc.text("chandler@ghvacinc.com", pageWidth - margin - 6, y + 16, { align: 'right' });
      };

      const checkPageBreak = (neededSpace: number) => {
        if (y + neededSpace > pageHeight - 45) {
          doc.addPage();
          y = margin;
        }
      };

      addPageHeader();
      y += 28;

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

        // Description/notes section (for proposal and custom_install quotes)
        if (quote.description) {
          // Detect contract template so we can render it with styled formatting
          const isContractTemplate =
            quote.description.includes("GIESBRECHT HVAC") &&
            quote.description.includes("INSTALLATION AGREEMENT");

          // ── Helpers ─────────────────────────────────────────────────────────
          const decodeEntities = (s: string) =>
            s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
          const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');
          const plainText = (raw: string) => decodeEntities(stripTags(raw));

          // Parse inline HTML into bold/normal text segments
          type Seg = { text: string; bold: boolean };
          const parseInline = (html: string): Seg[] => {
            const dec = (s: string) =>
              s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
               .replace(/\n/g, ' ');
            const marked = html
              .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '\x01$1\x01')
              .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '\x01$1\x01')
              .replace(/<[^>]*>/g, '');
            return marked.split('\x01')
              .map((part, i) => ({ text: dec(part), bold: i % 2 === 1 }))
              .filter(s => s.text.length > 0);
          };

          // Render inline segments using (and modifying) outer y
          // Handles both uniform and mixed-bold content with word-wrap
          type PdfRenderOpts = { x: number; maxW: number; fs: number };
          const renderSegs = (segs: Seg[], opts: PdfRenderOpts): void => {
            if (segs.length === 0) return;
            const { x, maxW, fs } = opts;
            const lh = fs * 0.42 + 1.5;
            doc.setFontSize(fs);
            const pb = () => { if (y + lh > pageHeight - 45) { doc.addPage(); y = margin; } };
            // All same weight → use splitTextToSize for perfect wrapping
            if (segs.every(s => s.bold === segs[0].bold)) {
              doc.setFont("helvetica", segs[0].bold ? "bold" : "normal");
              const txt = segs.map(s => s.text).join('');
              doc.splitTextToSize(txt, maxW).forEach((ln: string) => {
                pb(); doc.text(ln, x, y); y += lh;
              });
              return;
            }
            // Mixed bold → word-by-word tracking
            let cx = x;
            for (const seg of segs) {
              doc.setFont("helvetica", seg.bold ? "bold" : "normal");
              for (const tok of seg.text.split(/(\s+)/)) {
                if (!tok) continue;
                const tw = doc.getTextWidth(tok);
                const isWS = /^\s+$/.test(tok);
                if (!isWS && cx + tw > x + maxW && cx > x) {
                  cx = x; y += lh; pb();
                }
                if (!(isWS && cx === x)) { doc.text(tok, cx, y); cx += tw; }
              }
            }
            y += lh;
          };

          // ── Block parser ─────────────────────────────────────────────────────
          type PdfBlock = {
            type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'ol_li' | 'hr';
            text: string; rawHtml: string; number?: number;
          };
          const parseHtmlBlocks = (html: string): PdfBlock[] => {
            const blocks: PdfBlock[] = [];
            let olNum = 0, inOl = false;
            const proc = html
              .replace(/<hr\s*\/?>/gi, '\x00HR\x00')
              .replace(/<ol[^>]*>/gi, '\x00OLSTART\x00')
              .replace(/<\/ol>/gi, '\x00OLEND\x00')
              .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\x00H1:${c}\x00`)
              .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\x00H2:${c}\x00`)
              .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\x00H3:${c}\x00`)
              .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `\x00LI:${c}\x00`)
              .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, c) => `\x00PP:${c}\x00`);
            for (const part of proc.split('\x00').filter(p => p.trim())) {
              if (part === 'HR') { blocks.push({ type: 'hr', text: '', rawHtml: '' }); }
              else if (part === 'OLSTART') { inOl = true; olNum = 0; }
              else if (part === 'OLEND')   { inOl = false; olNum = 0; }
              else if (part.startsWith('H1:')) { const r = part.slice(3); blocks.push({ type: 'h1', text: plainText(r), rawHtml: r }); }
              else if (part.startsWith('H2:')) { const r = part.slice(3); blocks.push({ type: 'h2', text: plainText(r), rawHtml: r }); }
              else if (part.startsWith('H3:')) { const r = part.slice(3); blocks.push({ type: 'h3', text: plainText(r), rawHtml: r }); }
              else if (part.startsWith('LI:')) {
                const r = part.slice(3); const t = plainText(r);
                if (t) {
                  if (inOl) { olNum++; blocks.push({ type: 'ol_li', text: t, rawHtml: r, number: olNum }); }
                  else       { blocks.push({ type: 'li',    text: t, rawHtml: r }); }
                }
              }
              else if (part.startsWith('PP:')) {
                const r = part.slice(3);
                blocks.push({ type: 'p', text: plainText(r), rawHtml: r });
              }
            }
            return blocks;
          };

          // ── Render ───────────────────────────────────────────────────────────
          const blocks = parseHtmlBlocks(quote.description);
          if (blocks.length > 0) {
            if (!isContractTemplate) {
              doc.setFontSize(11);
              doc.setFont("helvetica", "bold");
              doc.setTextColor(...textColor);
              doc.text("Description", margin, y);
              y += 6;
            }

            for (const block of blocks) {

              // ── HR ───────────────────────────────────────────────────────────
              if (block.type === 'hr') {
                if (isContractTemplate) {
                  y += 2;
                  doc.setDrawColor(210, 210, 210);
                  doc.setLineWidth(0.25);
                  doc.line(margin, y, pageWidth - margin, y);
                  y += 4;
                }
                continue;
              }

              // ── H1 ───────────────────────────────────────────────────────────
              if (block.type === 'h1') {
                checkPageBreak(12);
                y += 2;
                if (isContractTemplate) {
                  doc.setFontSize(13);
                  doc.setFont("helvetica", "bold");
                  doc.setTextColor(...textColor);
                  doc.splitTextToSize(block.text, contentWidth).forEach((ln: string) => {
                    checkPageBreak(8); doc.text(ln, pageWidth / 2, y, { align: 'center' }); y += 8;
                  });
                } else {
                  doc.setFontSize(9);
                  doc.setFont("helvetica", "bold");
                  doc.setTextColor(...textColor);
                  doc.splitTextToSize(block.text, contentWidth).forEach((ln: string) => {
                    checkPageBreak(5); doc.text(ln, margin, y); y += 4.5;
                  });
                }
                y += 2;
                continue;
              }

              // ── H2 ───────────────────────────────────────────────────────────
              if (block.type === 'h2') {
                checkPageBreak(10);
                if (isContractTemplate) {
                  y += 4;
                  doc.setFontSize(10);
                  doc.setFont("helvetica", "bold");
                  doc.setTextColor(...brandColor);
                  const lines = doc.splitTextToSize(block.text, contentWidth);
                  lines.forEach((ln: string) => { checkPageBreak(6); doc.text(ln, margin, y); y += 6; });
                  // Thin brand-color underline
                  doc.setDrawColor(...brandColor);
                  doc.setLineWidth(0.4);
                  doc.line(margin, y - 1.5, margin + Math.min(doc.getTextWidth(lines[0]) + 2, contentWidth * 0.8), y - 1.5);
                  y += 2;
                } else {
                  y += 2;
                  doc.setFontSize(9);
                  doc.setFont("helvetica", "bold");
                  doc.setTextColor(...textColor);
                  doc.splitTextToSize(block.text, contentWidth).forEach((ln: string) => {
                    checkPageBreak(5); doc.text(ln, margin, y); y += 4.5;
                  });
                  y += 1;
                }
                continue;
              }

              // ── H3 ───────────────────────────────────────────────────────────
              if (block.type === 'h3') {
                checkPageBreak(6);
                y += 1;
                doc.setFontSize(9);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(...textColor);
                doc.splitTextToSize(block.text, contentWidth).forEach((ln: string) => {
                  checkPageBreak(5); doc.text(ln, margin, y); y += 4.5;
                });
                y += 1;
                continue;
              }

              // ── Bullet list item ─────────────────────────────────────────────
              if (block.type === 'li') {
                checkPageBreak(5);
                doc.setFontSize(9);
                if (isContractTemplate) {
                  doc.setTextColor(...textColor);
                  doc.setFont("helvetica", "normal");
                  doc.text("•", margin + 2, y);
                  renderSegs(parseInline(block.rawHtml), { x: margin + 7, maxW: contentWidth - 7, fs: 9 });
                } else {
                  doc.setFont("helvetica", "normal");
                  doc.setTextColor(...mutedColor);
                  doc.splitTextToSize(`• ${block.text}`, contentWidth - 4).forEach((ln: string, i: number) => {
                    checkPageBreak(5); doc.text(i === 0 ? ln : `  ${ln}`, margin + 2, y); y += 4;
                  });
                }
                continue;
              }

              // ── Ordered list item ────────────────────────────────────────────
              if (block.type === 'ol_li') {
                checkPageBreak(5);
                doc.setFontSize(9);
                if (isContractTemplate) {
                  doc.setTextColor(...textColor);
                  const numStr = `${block.number}.  `;
                  doc.setFont("helvetica", "bold");
                  doc.text(numStr, margin + 2, y);
                  const nw = doc.getTextWidth(numStr);
                  renderSegs(parseInline(block.rawHtml), { x: margin + 2 + nw, maxW: contentWidth - 2 - nw, fs: 9 });
                } else {
                  doc.setFont("helvetica", "normal");
                  doc.setTextColor(...mutedColor);
                  doc.splitTextToSize(`${block.number}. ${block.text}`, contentWidth - 4).forEach((ln: string, i: number) => {
                    checkPageBreak(5); doc.text(i === 0 ? ln : `    ${ln}`, margin + 2, y); y += 4;
                  });
                }
                continue;
              }

              // ── Paragraph ────────────────────────────────────────────────────
              if (block.type === 'p') {
                const isEmpty = !block.rawHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
                if (isEmpty) {
                  if (isContractTemplate) y += 3;
                  continue;
                }
                doc.setFontSize(9);
                if (isContractTemplate) {
                  doc.setTextColor(...textColor);
                  renderSegs(parseInline(block.rawHtml), { x: margin, maxW: contentWidth, fs: 9 });
                } else {
                  doc.setFont("helvetica", "normal");
                  doc.setTextColor(...mutedColor);
                  doc.splitTextToSize(block.text, contentWidth).forEach((ln: string) => {
                    checkPageBreak(5); doc.text(ln, margin, y); y += 4;
                  });
                  y += 1;
                }
              }
            }
            y += 6;
          }
        }

        addTableHeader();

        // Filter out labor/internal line items from PDF export (client-facing)
        const lineItems = (quote.lineItems || []).filter(item => 
          item.lineType !== "labor" && item.lineType !== "other"
        );
        // For single line item quotes, show sell price instead of actual cost
        const isSingleItem = lineItems.length === 1;
        
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
          
          // Use sell price for single item quotes in client-facing PDF
          const displayPrice = isSingleItem ? quote.total : item.unitPrice;
          const displayTotal = isSingleItem ? quote.total : item.lineTotal;
          
          doc.text(String(item.quantity || 1), margin + contentWidth * 0.52, y + 5.5, { align: 'center' });
          doc.text(formatCurrency(displayPrice), margin + contentWidth * 0.70, y + 5.5, { align: 'center' });
          doc.setFont("helvetica", "bold");
          doc.text(formatCurrency(displayTotal), pageWidth - margin - 5, y + 5.5, { align: 'right' });
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
          <Button variant="outline" className="mt-4" onClick={handleBack}>
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
              <Button variant="ghost" size="icon" data-testid="button-back" onClick={handleBack}>
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
              onClick={() => setShowPresentation(true)}
              variant="ghost"
              size="icon"
              className="text-slate-500 hover:text-[#711419]"
              title="Present to Client"
              data-testid="button-present"
            >
              <Monitor className="h-5 w-5" />
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
              
              {/* Verify Deposit button - for install quotes with payment link */}
              {quote.stripePaymentLinkId && !quote.depositPaidAt && (
                <Button
                  onClick={handleVerifyDeposit}
                  size="sm"
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50"
                  disabled={isVerifyingDeposit}
                  data-testid="button-verify-deposit"
                >
                  {isVerifyingDeposit ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Verify Deposit
                </Button>
              )}
              
              {/* Show deposit status if paid */}
              {quote.depositPaidAt && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Deposit Paid: ${parseFloat(quote.depositAmount || "0").toFixed(2)}
                </Badge>
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
              {quote.viewedAt && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">First Viewed</span>
                  <span className="text-sm">{formatDate(quote.viewedAt)}</span>
                </div>
              )}
              {(quote.viewCount || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">View Count</span>
                  <span className="text-sm font-medium text-purple-600">{quote.viewCount} {quote.viewCount === 1 ? "view" : "views"}</span>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Line Items
            </CardTitle>
            {canEditLineItems && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowItemsCatalogDialog(true)}
                  className="border-blue-400 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  data-testid="button-add-from-catalog"
                >
                  <Package className="h-4 w-4 mr-1" />
                  Add from Items Catalog
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDiscountKind("promotion");
                    setDiscountMode("amount");
                    setDiscountValue("");
                    setShowDiscountDialog(true);
                  }}
                  className="border-[#d3b07d] text-[#b8944d] hover:bg-[#faf6ef] hover:text-[#9a7d3f]"
                  data-testid="button-add-discount"
                >
                  <Tag className="h-4 w-4 mr-1" />
                  Add Discount
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAddingNewLineItem(true)}
                  disabled={isAddingNewLineItem || editingLineItemId !== null}
                  data-testid="button-add-line-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line Item
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  {quote.quoteMode === "options" && <TableHead className="w-24">Option</TableHead>}
                  <TableHead className="text-right w-24">Qty</TableHead>
                  <TableHead className="text-right w-32">Unit Price</TableHead>
                  <TableHead className="text-right w-32">Total</TableHead>
                  {canEditLineItems && <TableHead className="w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.lineItems && quote.lineItems.length > 0 ? (
                  quote.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      {editingLineItemId === item.id ? (
                        <>
                          <TableCell>
                            <Textarea
                              value={editingLineItemData.description}
                              onChange={(e) => setEditingLineItemData(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Description"
                              className="w-full min-h-[80px]"
                              rows={3}
                              data-testid={`input-line-item-description-${item.id}`}
                            />
                          </TableCell>
                          {quote.quoteMode === "options" && (
                            <TableCell>
                              {item.optionTag && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#711419]/10 text-[#711419]">
                                  {item.optionTag}
                                </span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            <Input
                              type="number"
                              value={editingLineItemData.quantity}
                              onChange={(e) => setEditingLineItemData(prev => ({ ...prev, quantity: e.target.value }))}
                              placeholder="Qty"
                              className="w-20 text-right"
                              min="0"
                              step="1"
                              data-testid={`input-line-item-quantity-${item.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingLineItemData.unitPrice}
                              onChange={(e) => setEditingLineItemData(prev => ({ ...prev, unitPrice: e.target.value }))}
                              placeholder="Unit Price"
                              className="w-28 text-right"
                              min="0"
                              step="0.01"
                              data-testid={`input-line-item-unitPrice-${item.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium text-slate-600">
                            {formatCurrency(getEditingLineTotal())}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={handleSaveLineItem}
                                disabled={updateLineItemMutation.isPending}
                                data-testid={`button-save-line-item-${item.id}`}
                              >
                                {updateLineItemMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 text-green-600" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={handleCancelEditLineItem}
                                disabled={updateLineItemMutation.isPending}
                                data-testid={`button-cancel-line-item-${item.id}`}
                              >
                                <X className="h-4 w-4 text-slate-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell><div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: item.description || "—" }} /></TableCell>
                          {quote.quoteMode === "options" && (
                            <TableCell>
                              {item.optionTag ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#711419]/10 text-[#711419]">
                                  {item.optionTag}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                  Untagged
                                </span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.lineTotal)}</TableCell>
                          {canEditLineItems && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleStartEditLineItem(item)}
                                  disabled={editingLineItemId !== null}
                                  data-testid={`button-edit-line-item-${item.id}`}
                                >
                                  <Pencil className="h-4 w-4 text-slate-500 hover:text-[#711419]" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() => deleteLineItemMutation.mutate(item.id)}
                                  disabled={editingLineItemId !== null || deleteLineItemMutation.isPending}
                                  data-testid={`button-delete-line-item-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>
                  ))
                ) : !isAddingNewLineItem ? (
                  <TableRow>
                    <TableCell colSpan={canEditLineItems ? (quote.quoteMode === "options" ? 6 : 5) : (quote.quoteMode === "options" ? 5 : 4)} className="text-center text-slate-500 py-8">
                      No line items
                    </TableCell>
                  </TableRow>
                ) : null}
                {/* Inline Add New Line Item Row */}
                {isAddingNewLineItem && canEditLineItems && (
                  <TableRow className="bg-blue-50/50">
                    <TableCell>
                      <Textarea
                        value={newLineItemData.description}
                        onChange={(e) => setNewLineItemData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Enter description"
                        className="w-full min-h-[80px]"
                        rows={3}
                        autoFocus
                        data-testid="input-new-line-item-description"
                      />
                    </TableCell>
                    {quote.quoteMode === "options" && (
                      <TableCell>
                        {(() => {
                          const existingTags = [...new Set(
                            (quote.lineItems || [])
                              .map(li => li.optionTag)
                              .filter((t): t is string => !!t)
                          )];
                          if (existingTags.length > 0 && !newItemOptionTagCreating) {
                            return (
                              <Select
                                value={newItemOptionTag}
                                onValueChange={(v) => {
                                  if (v === "__new__") {
                                    setNewItemOptionTagCreating(true);
                                    setNewItemOptionTag("");
                                  } else {
                                    setNewItemOptionTag(v);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-28 h-8 text-xs">
                                  <SelectValue placeholder="Option" />
                                </SelectTrigger>
                                <SelectContent>
                                  {existingTags.map(tag => (
                                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                                  ))}
                                  <SelectItem value="__new__" className="text-blue-600 font-medium">+ New option…</SelectItem>
                                </SelectContent>
                              </Select>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1">
                              <Input
                                value={newItemOptionTag}
                                onChange={(e) => setNewItemOptionTag(e.target.value)}
                                placeholder="Option name"
                                className="w-24 h-8 text-xs"
                                autoFocus={newItemOptionTagCreating}
                              />
                              {newItemOptionTagCreating && existingTags.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => { setNewItemOptionTagCreating(false); setNewItemOptionTag(""); }}
                                  className="text-slate-400 hover:text-slate-600 text-xs"
                                  title="Back to list"
                                >✕</button>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        type="number"
                        value={newLineItemData.quantity}
                        onChange={(e) => setNewLineItemData(prev => ({ ...prev, quantity: e.target.value }))}
                        placeholder="1"
                        className="w-20 text-right"
                        min="0"
                        step="1"
                        data-testid="input-new-line-item-quantity"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={newLineItemData.unitPrice}
                        onChange={(e) => setNewLineItemData(prev => ({ ...prev, unitPrice: e.target.value }))}
                        placeholder="0.00"
                        className="w-28 text-right"
                        data-testid="input-new-line-item-unitPrice"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-600">
                      {formatCurrency(getNewLineTotal())}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={handleAddLineItem}
                          disabled={addLineItemMutation.isPending}
                          data-testid="button-save-new-line-item"
                        >
                          {addLineItemMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={handleCancelAddLineItem}
                          disabled={addLineItemMutation.isPending}
                          data-testid="button-cancel-new-line-item"
                        >
                          <X className="h-4 w-4 text-slate-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Hide subtotal/total for options mode since each package is a separate choice */}
            {quote.quoteMode !== "options" && (
              <div className="mt-6 border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {quote.quoteType === "custom_install" ? "Internal Costs" : "Equipment & Labor"}
                  </span>
                  <span>{formatCurrency(calculateLineItemsSubtotal())}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Sell Price</span>
                  <span className="text-[#d3b07d]">
                    {/* For worksheet/custom_install quotes, line items are internal costs - use quote.total as the selling price */}
                    {quote.quoteType === "custom_install" 
                      ? formatCurrency(quote.total)
                      : formatCurrency(calculateLineItemsTotal())}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Catalog Dialog */}
        <Dialog open={showItemsCatalogDialog} onOpenChange={(open) => {
          setShowItemsCatalogDialog(open);
          if (!open) {
            setItemSearch("");
            setCategoryFilter("all");
            setCatalogItemOptionTag("");
            setCatalogItemOptionTagCreating(false);
          }
        }}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Items Catalog
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by name or part number..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as any)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="install">Install</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="protection">Protection Plans</SelectItem>
                    <SelectItem value="field_edge">Field Edge</SelectItem>
                    <SelectItem value="discount">Discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Option selector — only shown for options-mode quotes */}
              {quote?.quoteMode === "options" && (() => {
                const existingTags = [...new Set(
                  (quote.lineItems || [])
                    .map(li => li.optionTag)
                    .filter((t): t is string => !!t)
                )];
                return (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                    <Tag className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span className="text-amber-800 font-medium whitespace-nowrap">Add to option:</span>
                    {existingTags.length > 0 && !catalogItemOptionTagCreating ? (
                      <Select
                        value={catalogItemOptionTag}
                        onValueChange={(v) => {
                          if (v === "__new__") {
                            setCatalogItemOptionTagCreating(true);
                            setCatalogItemOptionTag("");
                          } else {
                            setCatalogItemOptionTag(v);
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1 max-w-[180px]">
                          <SelectValue placeholder="Select option" />
                        </SelectTrigger>
                        <SelectContent>
                          {existingTags.map(tag => (
                            <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                          ))}
                          <SelectItem value="__new__" className="text-blue-600 font-medium">+ New option…</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-1 flex-1 max-w-[200px]">
                        <Input
                          value={catalogItemOptionTag}
                          onChange={(e) => setCatalogItemOptionTag(e.target.value)}
                          placeholder="Option name"
                          className="h-7 text-xs flex-1"
                          autoFocus={catalogItemOptionTagCreating}
                        />
                        {catalogItemOptionTagCreating && existingTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => { setCatalogItemOptionTagCreating(false); setCatalogItemOptionTag(""); }}
                            className="text-slate-400 hover:text-slate-600 text-xs flex-shrink-0"
                            title="Back to list"
                          >✕</button>
                        )}
                      </div>
                    )}
                    {!catalogItemOptionTag && (
                      <span className="text-amber-600 text-xs">Items without an option won't appear in the presentation.</span>
                    )}
                  </div>
                );
              })()}

              <div className="border rounded-lg overflow-hidden flex-1 overflow-y-auto min-h-[300px] max-h-[400px]">
                {isSearchingItems ? (
                  <div className="p-8 text-center text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading items...
                  </div>
                ) : filteredItems.length > 0 ? (
                  <div className="divide-y">
                    {filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addFromCatalogMutation.mutate({ item, optionTag: catalogItemOptionTag || undefined })}
                        disabled={addFromCatalogMutation.isPending}
                        className="w-full p-4 text-left hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                              {item.partNumber && (
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
                                  {item.partNumber}
                                </span>
                              )}
                              <span className={cn(
                                "px-2 py-0.5 rounded text-xs capitalize",
                                item.category === "install" && "bg-blue-100 text-blue-700",
                                item.category === "service" && "bg-green-100 text-green-700",
                                item.category === "maintenance" && "bg-amber-100 text-amber-700",
                                item.category === "discount" && "bg-purple-100 text-purple-700"
                              )}>
                                {item.category || "install"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-slate-900">
                              ${parseFloat(item.rate || "0").toFixed(2)}
                            </p>
                            <p className="text-xs text-slate-400">{item.unit || "each"}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    No items found. Try a different search.
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discount Dialog */}
        <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Discount</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-3">
                <Label>Discount Type</Label>
                <RadioGroup
                  value={discountKind}
                  onValueChange={(value) => setDiscountKind(value as "promotion" | "maintenance")}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem 
                      value="promotion" 
                      id="detail-discount-promotion" 
                      disabled={hasExistingDiscount("promotion")}
                    />
                    <Label 
                      htmlFor="detail-discount-promotion" 
                      className={cn(hasExistingDiscount("promotion") && "text-slate-400")}
                    >
                      Promotion Discount
                      {hasExistingDiscount("promotion") && <span className="text-xs ml-2">(Already applied)</span>}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem 
                      value="maintenance" 
                      id="detail-discount-maintenance"
                      disabled={hasExistingDiscount("maintenance")}
                    />
                    <Label 
                      htmlFor="detail-discount-maintenance"
                      className={cn(hasExistingDiscount("maintenance") && "text-slate-400")}
                    >
                      Maintenance Discount
                      {hasExistingDiscount("maintenance") && <span className="text-xs ml-2">(Already applied)</span>}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {discountKind === "maintenance" ? (
                <div className="p-4 bg-slate-50 rounded-lg border">
                  <p className="text-sm font-medium text-slate-700">Fixed 15% Discount</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Maintenance discount is always 15% of the total quote amount.
                  </p>
                  <p className="text-sm font-medium text-slate-800 mt-2">
                    ≈ ${(calculateQuoteSubtotal() * 0.15).toFixed(2)} off ${calculateQuoteSubtotal().toFixed(2)} total
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <Label>Discount Mode</Label>
                    <RadioGroup
                      value={discountMode}
                      onValueChange={(value) => setDiscountMode(value as "amount" | "percentage")}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="amount" id="detail-mode-amount" />
                        <Label htmlFor="detail-mode-amount">$ Amount</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="percentage" id="detail-mode-percentage" />
                        <Label htmlFor="detail-mode-percentage">% Percentage</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="detail-discount-value">
                      {discountMode === "amount" ? "Discount Amount ($)" : "Discount Percentage (%)"}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        {discountMode === "amount" ? "$" : "%"}
                      </span>
                      <Input
                        id="detail-discount-value"
                        type="number"
                        min="0"
                        step={discountMode === "amount" ? "0.01" : "1"}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountMode === "amount" ? "0.00" : "0"}
                        className="pl-8"
                      />
                    </div>
                    {discountMode === "percentage" && discountValue && (
                      <p className="text-sm text-slate-500">
                        ≈ ${(calculateEligibleSubtotal("promotion") * (parseFloat(discountValue) || 0) / 100).toFixed(2)} off ${calculateEligibleSubtotal("promotion").toFixed(2)} eligible subtotal
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                variant="outline" 
                onClick={() => setShowDiscountDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleApplyDiscount}
                disabled={addDiscountMutation.isPending}
                className="bg-[#d3b07d] hover:bg-[#b8944d] text-white"
              >
                {addDiscountMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  "Apply Discount"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!protectionPrompt} onOpenChange={(open) => { if (!open) setProtectionPrompt(null); }}>
          <DialogContent className="sm:max-w-md" data-testid="protection-discount-prompt">
            <DialogHeader>
              <DialogTitle>Apply Parts Discount?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{protectionPrompt?.bundleName}</span> includes a{" "}
                <span className="font-semibold text-[#b8944d]">{protectionPrompt?.pct}% parts discount</span>.
                Apply it to the eligible items on this quote now?
              </p>
              {protectionPrompt && (
                <div className="p-3 bg-slate-50 rounded-lg border text-sm">
                  ≈ ${(calculateProtectionEligibleSubtotal() * (protectionPrompt.pct / 100)).toFixed(2)} off{" "}
                  ${calculateProtectionEligibleSubtotal().toFixed(2)} eligible subtotal
                  <p className="text-xs text-slate-400 mt-1">
                    Applies to all priced items except the protection bundle. Removing the bundle reverses it.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setProtectionPrompt(null)}
                data-testid="button-protection-skip"
              >
                Skip
              </Button>
              <Button
                onClick={() => protectionPrompt && handleApplyProtectionDiscount(protectionPrompt.pct)}
                disabled={addProtectionDiscountMutation.isPending}
                className="bg-[#d3b07d] hover:bg-[#b8944d] text-white"
                data-testid="button-protection-apply"
              >
                {addProtectionDiscountMutation.isPending ? "Applying..." : `Apply ${protectionPrompt?.pct}% Discount`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Editable Description for custom install quotes and proposal quotes */}
        {(quote.quoteType === "custom_install" || quote.quoteType === "proposal") && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Description</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={templatesLoading}
                  onClick={() => {
                    const isEmpty = (s: string | undefined | null) =>
                      !s || s.trim() === "" || s.trim() === "<p></p>";
                    if (proposalTemplates.length > 0) {
                      const currentContent = isEditingDescription ? editedDescription : quote.description;
                      if (!isEmpty(currentContent) && !window.confirm("Replace current description with a template?")) return;
                      setTemplatePickerOpen(true);
                    } else {
                      const buildTemplate = () => {
                        const lineDescriptions = (quote.lineItems || [])
                          .map(li => li.description)
                          .filter(Boolean)
                          .join("; ");
                        const totalStr = quote.total
                          ? "$" + parseFloat(quote.total.toString()).toLocaleString()
                          : undefined;
                        return generateContractTemplate({
                          customerName: quote.customer?.name || quote.customerName || undefined,
                          address: quote.serviceAddress || undefined,
                          equipmentSummary: lineDescriptions || undefined,
                          totalPrice: totalStr,
                        });
                      };
                      if (!isEditingDescription) {
                        if (!isEmpty(quote.description) && !window.confirm("Replace current description with the contract template?")) return;
                        setEditedDescription(buildTemplate());
                        setIsEditingDescription(true);
                      } else {
                        if (!isEmpty(editedDescription) && !window.confirm("Replace current description with the contract template?")) return;
                        setEditedDescription(buildTemplate());
                      }
                    }
                  }}
                  className="text-slate-700"
                >
                  <ClipboardList className="h-4 w-4 mr-1" />
                  Load Template
                </Button>
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
              </div>
            </CardHeader>
            <CardContent>
              {isEditingDescription ? (
                <div className="space-y-3">
                  <RichTextEditor
                    content={editedDescription}
                    onChange={(content) => setEditedDescription(content)}
                    placeholder="Add a description for this custom install quote..."
                    minHeight="min-h-[150px]"
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
                <RichTextDisplay content={quote.description} className="text-sm text-slate-600" />
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
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">What's Included</h4>
                    {quote.status === "draft" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={handleOpenWhatsIncludedDialog}
                        data-testid="btn-edit-whats-included"
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
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
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">Warranties & Terms</h4>
                    {quote.status === "draft" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={handleOpenWarrantiesDialog}
                        data-testid="btn-edit-warranties"
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                  <ul className="text-xs text-slate-600 space-y-1">
                    {quote.aiGeneratedQuote.warranties_and_terms.map((term: string, idx: number) => (
                      <li key={idx}>• {term}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {quote.aiGeneratedQuote.financing_text && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">Financing</h4>
                    {quote.status === "draft" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={handleOpenFinancingDialog}
                        data-testid="btn-edit-financing"
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">
                    {quote.aiGeneratedQuote.financing_text}
                  </p>
                </div>
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
                  let systemEventData: { eventType?: string; signerName?: string; signedAt?: string; acceptedAt?: string; markedByUser?: string; viewCount?: number; isFirstView?: boolean; viewedAt?: string } | null = null;
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
                    const eventType = systemEventData?.eventType;
                    
                    // Handle quote view events
                    if (eventType === "quote_viewed") {
                      const viewCount = systemEventData?.viewCount || 1;
                      const isFirstView = systemEventData?.isFirstView;
                      const eventTime = systemEventData?.viewedAt || log.sentAt;
                      
                      return (
                        <div
                          key={log.id}
                          className="rounded-lg border overflow-hidden bg-purple-50 border-purple-200"
                          data-testid={`email-log-${log.id}`}
                        >
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Eye className="h-4 w-4 text-purple-600 flex-shrink-0" />
                                  <span className="font-medium text-sm text-purple-800">
                                    {isFirstView ? "Quote First Viewed by Customer" : "Quote Viewed Again"}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2 text-xs text-purple-600">
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
                                className="bg-purple-100 text-purple-700 border-purple-300"
                              >
                                View #{viewCount}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    // Handle signature/acceptance events (default system event type)
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
              <Send className="h-5 w-5" />
              Send Quote
            </DialogTitle>
            <DialogDescription>
              Send this quote to the customer. Select one or both methods.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="send-email" 
                  checked={sendViaEmail} 
                  onCheckedChange={(c) => setSendViaEmail(!!c)} 
                />
                <Label htmlFor="send-email" className="cursor-pointer">Email</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="send-sms" 
                  checked={sendViaSms} 
                  onCheckedChange={(c) => setSendViaSms(!!c)} 
                />
                <Label htmlFor="send-sms" className="cursor-pointer">Text Message (SMS)</Label>
              </div>
            </div>
            {sendViaEmail && (
              <div className="space-y-2">
                <Label htmlFor="recipient-email">Recipient Email(s)</Label>
                <Input
                  id="recipient-email"
                  type="text"
                  placeholder="email1@example.com, email2@example.com"
                  value={sendEmailRecipient}
                  onChange={(e) => setSendEmailRecipient(e.target.value)}
                  data-testid="input-recipient-email"
                />
                <p className="text-xs text-slate-500">Separate multiple emails with commas</p>
              </div>
            )}
            {sendViaSms && (
              <div className="space-y-2">
                <Label htmlFor="recipient-phone">Recipient Phone</Label>
                <Input
                  id="recipient-phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={sendPhoneRecipient}
                  onChange={(e) => setSendPhoneRecipient(e.target.value)}
                  data-testid="input-recipient-phone"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="personal-message">Personal Message (optional)</Label>
              <Textarea
                id="personal-message"
                placeholder="Add a personal note..."
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
              disabled={sendEmailMutation.isPending || (!sendViaEmail && !sendViaSms)}
              className="bg-[#711419] hover:bg-[#711419]/90"
              data-testid="button-confirm-send"
            >
              {sendEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sendViaEmail && sendViaSms ? "Send Email & SMS" : sendViaEmail ? "Send Email" : sendViaSms ? "Send SMS" : "Send Quote"}
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

      <Dialog
        open={showManualSignatureDialog}
        onOpenChange={(open) => {
          setShowManualSignatureDialog(open);
          if (!open) {
            setManualSignature("");
            setManualSignerName("");
            setPendingManualOption(null);
            setAvailableOptions([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Accept Quote</DialogTitle>
            <DialogDescription>
              {availableOptions.length > 0
                ? "Select the customer's choice and capture their signature."
                : "Have the client sign below to confirm they accept this quote."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {availableOptions.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">
                  Customer's Choice
                </label>
                <div className="space-y-2">
                  {availableOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => setPendingManualOption(option)}
                      className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                        pendingManualOption === option
                          ? "border-[#711419] bg-[#711419]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span className={`font-medium ${pendingManualOption === option ? "text-[#711419]" : ""}`}>
                        {option}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <PresentationSignaturePad onSignatureChange={setManualSignature} />
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Printed Name
              </label>
              <Input
                placeholder="Customer's full name"
                value={manualSignerName}
                onChange={(e) => setManualSignerName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowManualSignatureDialog(false);
                setManualSignature("");
                setManualSignerName("");
                setPendingManualOption(null);
                setAvailableOptions([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmManualSignature}
              disabled={
                (availableOptions.length > 0 && !pendingManualOption) ||
                !manualSignature ||
                !manualSignerName.trim() ||
                acceptInPersonMutation.isPending
              }
              className="bg-[#711419] hover:bg-[#711419]/90 text-white"
            >
              {acceptInPersonMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Accept Quote
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Present to Client Dialog - Fullscreen */}
      <Dialog 
        open={showPresentation} 
        onOpenChange={(open) => {
          if (!open) {
            resetPresentationState();
          }
          setShowPresentation(open);
        }}
      >
        <DialogContent className="max-w-full w-full h-full max-h-screen m-0 p-0 rounded-none overflow-auto !bg-gray-100">
          <div className="min-h-screen bg-gray-100">
            {/* Exit button */}
            <div className="fixed top-4 right-4 z-50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetPresentationState();
                  setShowPresentation(false);
                }}
                className="bg-white shadow-lg"
                data-testid="button-exit-presentation"
              >
                <X className="h-4 w-4 mr-2" />
                Exit Presentation
              </Button>
            </div>

            <div className="py-8 px-4 max-w-3xl mx-auto">
              {/* Company Logo */}
              <div className="flex justify-center mb-6 py-6">
                <img 
                  src={ghvacLogo} 
                  alt="Giesbrecht HVAC" 
                  className="h-20 sm:h-24 w-auto object-contain"
                />
              </div>

              {/* Quote Header Card */}
              <Card className="shadow-lg mb-6 bg-gray-100 border-0">
                <CardHeader className="border-b" style={{ backgroundColor: BRAND_COLOR }}>
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      <CardTitle className="text-xl">Quote #{quote.quoteNumber}</CardTitle>
                    </div>
                    <span className="text-sm opacity-90">{formatPresentationDate(quote.createdAt)}</span>
                  </div>
                </CardHeader>
                <CardContent className="py-6 space-y-6 bg-gray-100">
                  {/* Customer Info */}
                  <div className="bg-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-700 mb-2">Prepared For</h3>
                    <p className="font-medium text-slate-900">{quote.customerName || quote.customer?.name}</p>
                    {quote.serviceAddress && (
                      <p className="text-slate-600 text-sm">{quote.serviceAddress}</p>
                    )}
                  </div>

                  {/* Description / Contract Template */}
                  {(quote.description || quote.status === "draft") && (
                    <div className="border-t pt-4">
                      {isPresentationEditingDesc ? (
                        <div className="space-y-3">
                          <RichTextEditor
                            content={presentationDescDraft}
                            onChange={setPresentationDescDraft}
                            placeholder="Enter contract description..."
                            minHeight="min-h-[300px]"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateDescriptionMutation.mutate(presentationDescDraft)}
                              disabled={updateDescriptionMutation.isPending}
                            >
                              {updateDescriptionMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsPresentationEditingDesc(false)}
                              disabled={updateDescriptionMutation.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {quote.status === "draft" && (
                            <div className="flex justify-end mb-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-slate-500 hover:text-slate-700"
                                onClick={() => {
                                  setPresentationDescDraft(quote.description || "");
                                  setIsPresentationEditingDesc(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {quote.description ? "Edit" : "Add Description"}
                              </Button>
                            </div>
                          )}
                          {quote.description && (
                            <div
                              className="contract-description"
                              dangerouslySetInnerHTML={{ __html: quote.description }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Quote Content - Options Mode */}
                  {quote.quoteMode === "options" && quote.lineItems ? (
                    <>
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">Your Home Comfort Options</h3>
                        <p className="text-sm sm:text-base text-slate-600">
                          Please review the options below and select the one that best fits your needs.
                        </p>
                      </div>

                      <div className="space-y-3 sm:space-y-4">
                        {groupLineItemsByOption(quote.lineItems).map((option) => {
                          const isSelected = presentationSelectedOption === option.tag;
                          const whatsIncluded = getWhatsIncludedForOption(
                            option.tag, 
                            quote.aiGeneratedQuote?.whats_included as WhatsIncludedItem[] | undefined
                          );
                          return (
                            <div 
                              key={option.tag} 
                              onClick={() => setPresentationSelectedOption(option.tag)}
                              className={`border-2 rounded-lg overflow-hidden cursor-pointer transition-all bg-gray-50 ${
                                isSelected 
                                  ? "border-[#711419] ring-2 ring-[#711419]/20 shadow-md" 
                                  : "border-slate-200 hover:border-slate-400"
                              }`}
                              data-testid={`presentation-option-${option.tag.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              <div className={`px-3 sm:px-4 py-4 flex justify-between items-center ${isSelected ? "bg-blue-50" : "bg-gray-50"}`}>
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <div className={`w-6 h-6 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                    isSelected ? "border-[#711419] bg-[#711419]" : "border-slate-400"
                                  }`}>
                                    {isSelected && <div className="w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full bg-white" />}
                                  </div>
                                  <span className="font-semibold text-slate-900 text-base sm:text-lg">{option.tag}</span>
                                </div>
                                <span className="text-lg sm:text-xl font-bold" style={{ color: BRAND_COLOR }}>{formatPresentationCurrency(option.total)}</span>
                              </div>
                              <div className="p-3 sm:p-4 bg-gray-50">
                                {/* Show AI-generated category title if available */}
                                {whatsIncluded.categoryTitle && (
                                  <div className="mb-3 pb-2 border-b border-slate-200">
                                    <p className="font-semibold text-slate-800 text-sm sm:text-base">{whatsIncluded.categoryTitle}</p>
                                  </div>
                                )}
                                
                                {option.items.map((item) => {
                                  const equipmentImages = parseEquipmentImages(item.imageUrl);
                                  return (
                                    <div key={item.id} className="py-2 border-b border-slate-100 last:border-0">
                                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                                        {equipmentImages ? (
                                          <div className="flex-shrink-0">
                                            <PresentationEquipmentImageGrid images={equipmentImages} />
                                          </div>
                                        ) : item.imageUrl && !item.imageUrl.startsWith('{') && (
                                          <div className="flex-shrink-0">
                                            <img 
                                              src={item.imageUrl} 
                                              alt={item.description}
                                              className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-slate-200"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          {/* Only show line item description if no AI category title */}
                                          {!whatsIncluded.categoryTitle && (
                                            <div className="font-medium text-slate-800 text-sm sm:text-base">{item.description}</div>
                                          )}
                                          {item.partNumber && (
                                            <div className="text-xs text-slate-500">Part #: {item.partNumber}</div>
                                          )}
                                          <div className="flex justify-between items-center mt-1 text-sm text-slate-600">
                                            <span>Qty: {parseFloat(item.quantity || "1")}</span>
                                            <span className="font-medium text-slate-800">{formatPresentationCurrency(item.lineTotal)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                
                                {whatsIncluded.items.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-slate-200">
                                    <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">What's Included:</p>
                                    <ul className="space-y-1">
                                      {whatsIncluded.items.map((incItem, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                                          <span className="text-[#711419] mt-0.5">•</span>
                                          <span>{incItem}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {presentationSelectedOption ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                          <p className="text-green-800 font-medium">
                            Selected: <strong>{presentationSelectedOption}</strong>
                          </p>
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                          <p className="text-amber-800 font-medium">
                            Please select one of the options above to continue.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Single Quote Mode - Line Items Table */
                    <>
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-4">Quote Details</h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {quote.lineItems && quote.lineItems.length > 0 ? (
                              quote.lineItems.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell><div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: item.description || "—" }} /></TableCell>
                                  <TableCell className="text-right">{item.quantity}</TableCell>
                                  <TableCell className="text-right">{formatPresentationCurrency(item.unitPrice)}</TableCell>
                                  <TableCell className="text-right">{formatPresentationCurrency(item.lineTotal)}</TableCell>
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

                        <div className="mt-6 border-t pt-4">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <span style={{ color: BRAND_COLOR }}>{formatPresentationCurrency(quote.total)}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Signature Section or Already Approved Message */}
              {quote.status === "accepted" ? (
                <Card className="shadow-lg bg-gray-50 border-0">
                  <CardContent className="py-12 text-center bg-gray-50">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="h-10 w-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Quote Already Approved</h2>
                    <p className="text-slate-600 mb-4">
                      Quote #{quote.quoteNumber} was accepted on {quote.acceptedAt ? format(new Date(quote.acceptedAt), "MMMM d, yyyy 'at' h:mm a") : "a previous date"}
                      {quote.signerName && ` by ${quote.signerName}`}.
                    </p>
                    <p className="text-sm text-slate-500">
                      This quote has already been approved and cannot be signed again.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-lg bg-gray-50 border-0">
                  <CardHeader className="bg-gray-50">
                    <CardTitle className="text-lg">Accept Quote</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 bg-gray-50">
                    <PresentationSignaturePad onSignatureChange={setPresentationSignature} />

                    <div className="space-y-2">
                      <Label htmlFor="presentation-name">Printed Name</Label>
                      <Input
                        id="presentation-name"
                        value={presentationName}
                        onChange={(e) => setPresentationName(e.target.value)}
                        placeholder="Enter your full name"
                        data-testid="input-presentation-name"
                      />
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox 
                        id="presentation-terms" 
                        checked={presentationAgreed}
                        onCheckedChange={(checked) => setPresentationAgreed(checked === true)}
                        data-testid="checkbox-presentation-terms"
                      />
                      <label 
                        htmlFor="presentation-terms" 
                        className="text-sm text-slate-600 leading-tight cursor-pointer"
                      >
                        I agree to the terms and conditions of this quote. I authorize the work described above to be performed 
                        and agree to pay the total amount upon completion of the work.
                      </label>
                    </div>

                    <Button
                      onClick={handlePresentationAccept}
                      disabled={acceptInPersonMutation.isPending || isGeneratingPaymentLink}
                      className="w-full py-6 text-lg"
                      style={{ backgroundColor: BRAND_COLOR }}
                      data-testid="button-presentation-accept"
                    >
                      {acceptInPersonMutation.isPending || isGeneratingPaymentLink ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          {isGeneratingPaymentLink ? "Opening Payment..." : "Processing..."}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5 mr-2" />
                          Accept Quote
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWhatsIncludedDialog} onOpenChange={setShowWhatsIncludedDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-800">
              <Pencil className="h-4 w-4" />
              Edit What's Included
            </DialogTitle>
            <DialogDescription>
              Edit the items included in each package option. Empty items will be removed when saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {editingWhatsIncluded.map((category, categoryIndex) => (
              <div key={categoryIndex} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-sm text-blue-800 mb-3">{category.category}</h4>
                <div className="space-y-2">
                  {category.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="flex items-center gap-2">
                      <Input
                        value={item}
                        onChange={(e) => handleWhatsIncludedItemChange(categoryIndex, itemIndex, e.target.value)}
                        placeholder="Enter item..."
                        className="flex-1 bg-white"
                        data-testid={`input-whats-included-${categoryIndex}-${itemIndex}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveWhatsIncludedItem(categoryIndex, itemIndex)}
                        data-testid={`btn-remove-item-${categoryIndex}-${itemIndex}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                    onClick={() => handleAddWhatsIncludedItem(categoryIndex)}
                    data-testid={`btn-add-item-${categoryIndex}`}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWhatsIncludedDialog(false)}
              data-testid="btn-cancel-whats-included"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveWhatsIncluded}
              disabled={updateWhatsIncludedMutation.isPending || quote?.status !== "draft"}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="btn-save-whats-included"
            >
              {updateWhatsIncludedMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : quote?.status !== "draft" ? (
                "Quote No Longer Editable"
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWarrantiesDialog} onOpenChange={setShowWarrantiesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-800">
              <Pencil className="h-4 w-4" />
              Edit Warranties & Terms
            </DialogTitle>
            <DialogDescription>
              Edit the warranties and terms. Enter each term on a new line. Empty lines will be removed when saving.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={editingWarranties}
              onChange={(e) => setEditingWarranties(e.target.value)}
              placeholder="Enter warranties and terms, one per line..."
              className="min-h-[200px] resize-y"
              data-testid="textarea-warranties"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWarrantiesDialog(false)}
              data-testid="btn-cancel-warranties"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveWarranties}
              disabled={updateWarrantiesMutation.isPending || quote?.status !== "draft"}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="btn-save-warranties"
            >
              {updateWarrantiesMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : quote?.status !== "draft" ? (
                "Quote No Longer Editable"
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinancingDialog} onOpenChange={setShowFinancingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-800">
              <Pencil className="h-4 w-4" />
              Edit Financing Text
            </DialogTitle>
            <DialogDescription>
              Edit the financing information displayed on the quote.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={editingFinancingText}
              onChange={(e) => setEditingFinancingText(e.target.value)}
              placeholder="Enter financing text..."
              className="min-h-[150px] resize-y"
              data-testid="textarea-financing"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFinancingDialog(false)}
              data-testid="btn-cancel-financing"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveFinancing}
              disabled={updateFinancingMutation.isPending || quote?.status !== "draft"}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="btn-save-financing"
            >
              {updateFinancingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : quote?.status !== "draft" ? (
                "Quote No Longer Editable"
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateProjectPrompt} onOpenChange={setShowCreateProjectPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-800">
              <FolderKanban className="h-5 w-5" />
              Create a Project?
            </DialogTitle>
            <DialogDescription>
              Would you like to create a project for this accepted quote? This will help you track the installation progress and schedule work orders.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600">
              Creating a project allows you to:
            </p>
            <ul className="mt-2 text-sm text-slate-600 list-disc list-inside space-y-1">
              <li>Track installation progress</li>
              <li>Schedule and manage work orders</li>
              <li>Monitor expected vs actual revenue</li>
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCreateProjectPrompt(false)}
              data-testid="btn-skip-create-project"
            >
              Not Now
            </Button>
            <Button
              onClick={() => {
                setShowCreateProjectPrompt(false);
                setShowCreateProjectForm(true);
              }}
              className="bg-green-600 hover:bg-green-700"
              data-testid="btn-open-create-project-form"
            >
              <FolderKanban className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateProjectForm} onOpenChange={setShowCreateProjectForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-800">
              <FolderKanban className="h-5 w-5" />
              Create Project
            </DialogTitle>
            <DialogDescription>
              Create a new project to track this installation. Fields have been pre-populated from the quote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-title">Project Title *</Label>
              <Input
                id="project-title"
                value={projectFormData.title}
                onChange={(e) => setProjectFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter project title..."
                data-testid="input-project-title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="project-type">Project Type</Label>
                <Select
                  value={projectFormData.projectType}
                  onValueChange={(value) => setProjectFormData(prev => ({ ...prev, projectType: value }))}
                >
                  <SelectTrigger id="project-type" data-testid="select-project-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INSTALL">Install</SelectItem>
                    <SelectItem value="DUCT">Duct</SelectItem>
                    <SelectItem value="COMMERCIAL">Commercial</SelectItem>
                    <SelectItem value="CRAWLSPACE">Crawlspace</SelectItem>
                    <SelectItem value="MAJOR_REPAIR">Major Repair</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-priority">Priority</Label>
                <Select
                  value={projectFormData.priority}
                  onValueChange={(value) => setProjectFormData(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger id="project-priority" data-testid="select-project-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-expected-value">Expected Value ($)</Label>
              <Input
                id="project-expected-value"
                type="number"
                step="0.01"
                min="0"
                value={projectFormData.expectedValue}
                onChange={(e) => setProjectFormData(prev => ({ ...prev, expectedValue: e.target.value }))}
                placeholder="0.00"
                data-testid="input-project-expected-value"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={projectFormData.description}
                onChange={(e) => setProjectFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter project description..."
                className="min-h-[80px] resize-y"
                data-testid="textarea-project-description"
              />
            </div>

            {(projectFormData.customerName || projectFormData.customerId) && (
              <div className="p-3 bg-slate-50 rounded-lg border">
                <p className="text-xs font-medium text-slate-500 mb-1">Customer</p>
                <p className="text-sm font-medium text-slate-900">
                  {projectFormData.customerName || `Customer ID: ${projectFormData.customerId.substring(0, 8)}...`}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateProjectForm(false)}
              data-testid="btn-cancel-create-project"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={createProjectMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="btn-submit-create-project"
            >
              {createProjectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderKanban className="h-4 w-4 mr-2" />
                  Create Project
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFollowUpModal} onOpenChange={setShowFollowUpModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Follow-up Work Order?</DialogTitle>
            <DialogDescription>
              This quote was accepted while the technician was working. Would you like to create a follow-up work order?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              onClick={() => createFollowUpMutation.mutate("parts_needed")}
              disabled={createFollowUpMutation.isPending}
              className="w-full justify-start gap-2 h-auto py-4 px-4"
              variant="outline"
            >
              <div className="flex flex-col items-start text-left">
                <span className="font-semibold">Parts Needed</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Create high-priority work order in the Parts Needed queue
                </span>
              </div>
            </Button>
            <Button
              onClick={() => createFollowUpMutation.mutate("schedule_now")}
              disabled={createFollowUpMutation.isPending}
              className="w-full justify-start gap-2 h-auto py-4 px-4"
              variant="outline"
            >
              <div className="flex flex-col items-start text-left">
                <span className="font-semibold">Schedule Now</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Open work order form to schedule immediately
                </span>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowFollowUpModal(false)}>
              Skip for now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {[...proposalTemplates].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)).map((tmpl) => (
              <button
                key={tmpl.id}
                className="w-full text-left p-3 rounded-lg border hover:bg-slate-50 transition-colors flex items-center gap-3"
                onClick={() => {
                  const lineDescriptions = (quote.lineItems || [])
                    .map(li => li.description)
                    .filter(Boolean)
                    .join("; ");
                  const totalStr = quote.total
                    ? "$" + parseFloat(quote.total.toString()).toLocaleString()
                    : undefined;
                  const html = applyTemplateVariables(tmpl.body, {
                    customerName: quote.customer?.name || quote.customerName || undefined,
                    address: quote.serviceAddress || undefined,
                    equipmentSummary: lineDescriptions || undefined,
                    totalPrice: totalStr,
                  });
                  setEditedDescription(html);
                  if (!isEditingDescription) setIsEditingDescription(true);
                  setTemplatePickerOpen(false);
                }}
              >
                <FileText className="h-5 w-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{tmpl.name}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {tmpl.body.replace(/<[^>]*>/g, " ").slice(0, 100)}...
                  </div>
                </div>
                {tmpl.isDefault && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 flex-shrink-0 text-xs">
                    <Star className="h-3 w-3 mr-1" />
                    Default
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
