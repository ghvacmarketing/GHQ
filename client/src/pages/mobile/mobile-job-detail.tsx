import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Phone, 
  MapPin, 
  Clock,
  Send,
  Loader2,
  X,
  CheckCircle2,
  Car,
  Wrench,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Check,
  Clipboard,
  FileText,
  Receipt,
  LayoutDashboard,
  ClipboardList,
  Plus,
  Trash2,
  DollarSign,
  Eye,
  Search,
  Tag,
  Package
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queueMutation, usePendingNotes } from "@/lib/offline-queue";
import { useOnlineStatus, OfflineIndicator } from "@/hooks/use-online-status";
import MobileShell from "./mobile-shell";
import type { CrmWorkOrder, CrmCustomer, CrmProperty, WorkOrderStatus, CrmQuote, CrmInvoice, CrmInvoiceLineItem } from "@shared/schema";

interface WorkOrderDetail extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

type ChecklistQuestion = {
  id: string;
  question: string;
  questionType: "yes_no" | "text" | "number" | "select";
  options: string[] | null;
  isRequired: boolean;
};

type ChecklistResponseData = {
  id: string;
  workOrderId: string;
  checklistId: string;
  answers: Record<string, string | boolean | number>;
  summary: string | null;
  completedBy: string | null;
  completedAt: Date | null;
  checklist: {
    id: string;
    serviceType: string;
    name: string;
    description: string | null;
    questions: ChecklistQuestion[];
  } | null;
};

type TabType = "overview" | "work" | "quote" | "invoice";

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-700 border-slate-300" },
  dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700 border-blue-300" },
  en_route: { label: "En Route", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  on_site: { label: "On Site", className: "bg-green-100 text-green-700 border-green-300" },
  completed: { label: "Completed", className: "bg-slate-200 text-slate-600 border-slate-400" },
};

const statusFlow: WorkOrderStatus[] = ["scheduled", "dispatched", "en_route", "on_site", "completed"];

function getPropertyAddress(property: CrmProperty | null): string {
  if (!property) return "No address";
  const parts = [property.address1, property.address2, property.city, property.state, property.zip].filter(Boolean);
  return parts.join(", ") || "No address";
}

function getGoogleMapsUrl(property: CrmProperty | null): string {
  if (!property) return "";
  const address = [property.address1, property.city, property.state, property.zip].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (error instanceof Error && (
    error.message.includes('network') ||
    error.message.includes('Network') ||
    error.message.includes('offline') ||
    error.message.includes('Failed to fetch')
  )) {
    return true;
  }
  return !navigator.onLine;
}

function OverviewTab({ 
  workOrder, 
  checklistResponse,
  optimisticStatus,
  updateStatusMutation,
  handleStatusChange,
  noteInput,
  setNoteInput,
  handleAddNote,
  addNoteMutation,
  pendingNotes
}: {
  workOrder: WorkOrderDetail;
  checklistResponse: ChecklistResponseData | null | undefined;
  optimisticStatus: WorkOrderStatus | null;
  updateStatusMutation: any;
  handleStatusChange: (status: WorkOrderStatus) => void;
  noteInput: string;
  setNoteInput: (val: string) => void;
  handleAddNote: () => void;
  addNoteMutation: any;
  pendingNotes: any[];
}) {
  const [checklistAnswersOpen, setChecklistAnswersOpen] = useState(false);
  const displayStatus = optimisticStatus || workOrder.status;
  const status = statusConfig[displayStatus] || statusConfig.scheduled;
  const customerName = workOrder.customer?.name || "Unknown Customer";
  const customerPhone = workOrder.customer?.phone;
  const address = getPropertyAddress(workOrder.property);

  const getNextStatus = (currentStatus: WorkOrderStatus): WorkOrderStatus | null => {
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex < statusFlow.length - 1) {
      return statusFlow[currentIndex + 1];
    }
    return null;
  };

  const nextStatus = getNextStatus(displayStatus as WorkOrderStatus);

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <Badge 
          variant="outline" 
          className={`text-lg px-4 py-1 ${status.className} ${optimisticStatus ? 'opacity-70' : ''}`}
          data-testid="job-status-badge"
        >
          {status.label}
          {optimisticStatus && " (saving...)"}
        </Badge>
      </div>

      <Card data-testid="customer-info-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg" data-testid="customer-name">
            {customerName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {customerPhone && (
            <a 
              href={`tel:${customerPhone}`}
              className="flex items-center text-blue-600 hover:underline min-h-[44px]"
              data-testid="customer-phone"
            >
              <Phone className="h-4 w-4 mr-2" />
              {customerPhone}
            </a>
          )}
          <a 
            href={getGoogleMapsUrl(workOrder.property)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start text-slate-600 hover:text-blue-600 min-h-[44px]"
            data-testid="customer-address"
          >
            <MapPin className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
            <span>{address}</span>
          </a>
          {workOrder.scheduledStart && (
            <div className="flex items-center text-slate-500">
              <Clock className="h-4 w-4 mr-2" />
              <span data-testid="scheduled-time">
                {format(new Date(workOrder.scheduledStart), "h:mm a")}
                {workOrder.scheduledEnd && ` - ${format(new Date(workOrder.scheduledEnd), "h:mm a")}`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {checklistResponse && checklistResponse.checklist && checklistResponse.summary && (
        <Card className="border-amber-200 bg-amber-50/30" data-testid="card-checklist-summary">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clipboard className="h-4 w-4 text-amber-600" />
              Checklist Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-checklist-summary">
              {checklistResponse.summary}
            </p>
          </CardContent>
        </Card>
      )}

      <Card data-testid="status-update-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Job Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between" data-testid="status-stepper">
            {statusFlow.map((step, index) => {
              const stepIndex = statusFlow.indexOf(displayStatus as WorkOrderStatus);
              const isCompleted = index < stepIndex;
              const isCurrent = index === stepIndex;
              const stepIcons: Record<WorkOrderStatus, any> = {
                scheduled: Clock,
                dispatched: ClipboardCheck,
                en_route: Car,
                on_site: Wrench,
                completed: CheckCircle2,
                cancelled: X,
              };
              const StepIcon = stepIcons[step];
              
              return (
                <div key={step} className="flex flex-col items-center" data-testid={`status-step-${step}`}>
                  <div 
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      isCompleted 
                        ? 'bg-green-500 text-white' 
                        : isCurrent 
                          ? 'bg-[#711419] text-white ring-2 ring-offset-2 ring-[#711419]' 
                          : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    <StepIcon className="h-5 w-5" />
                  </div>
                  <span className={`text-xs mt-1 text-center ${
                    isCurrent ? 'font-semibold text-[#711419]' : 'text-slate-500'
                  }`}>
                    {statusConfig[step]?.label}
                  </span>
                </div>
              );
            })}
          </div>
          
          {nextStatus && displayStatus !== "completed" && (
            <Button
              className="w-full min-h-[48px] bg-[#711419] hover:bg-[#5a1014]"
              onClick={() => handleStatusChange(nextStatus)}
              disabled={updateStatusMutation.isPending}
              data-testid={`button-status-${nextStatus}`}
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : null}
              {nextStatus === "dispatched" && "Mark Dispatched"}
              {nextStatus === "en_route" && "Start Driving"}
              {nextStatus === "on_site" && "Arrive On Site"}
              {nextStatus === "completed" && "Complete Job"}
            </Button>
          )}

          {displayStatus === "completed" && (
            <div className="text-center py-2">
              <Badge className="bg-green-100 text-green-700 border-green-300">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Job Completed
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="notes-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workOrder.techNotes ? (
            <div 
              className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-md max-h-40 overflow-auto"
              data-testid="existing-notes"
            >
              {workOrder.techNotes}
            </div>
          ) : pendingNotes.length === 0 ? (
            <p className="text-sm text-slate-400 italic" data-testid="no-notes">
              No notes yet
            </p>
          ) : null}
          
          {pendingNotes.length > 0 && (
            <div className="space-y-2" data-testid="pending-notes-container">
              {pendingNotes.map((pendingNote: any) => (
                <div 
                  key={pendingNote.id}
                  className="text-sm text-slate-600 whitespace-pre-wrap bg-amber-50 border border-amber-200 p-3 rounded-md"
                >
                  <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300 mb-1">
                    Pending sync
                  </Badge>
                  <p>{pendingNote.noteText}</p>
                </div>
              ))}
            </div>
          )}
          
          <Separator />
          <div className="flex gap-2">
            <Input
              placeholder="Add a note..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              className="flex-1 min-h-[44px]"
              data-testid="input-note"
            />
            <Button
              size="icon"
              className="min-h-[44px] min-w-[44px] bg-[#711419] hover:bg-[#5a1014]"
              onClick={handleAddNote}
              disabled={!noteInput.trim() || addNoteMutation.isPending}
              data-testid="button-add-note"
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(workOrder.workSubtype || workOrder.description) && (
        <Card data-testid="job-info-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Job Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {workOrder.workSubtype && (
              <div data-testid="work-type-info">
                <span className="text-sm text-slate-500">Work Type: </span>
                <Badge variant="secondary" data-testid="work-type-badge">
                  {workOrder.visitType} - {workOrder.workSubtype}
                </Badge>
              </div>
            )}
            {workOrder.description && (
              <p className="text-sm text-slate-600" data-testid="job-description">
                {workOrder.description}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {workOrder.completionSummary && (
        <Card data-testid="completion-summary-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Completion Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 whitespace-pre-wrap" data-testid="completion-summary-text">
              {workOrder.completionSummary}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WorkTab({ 
  workOrder, 
  checklistResponse 
}: { 
  workOrder: WorkOrderDetail;
  checklistResponse: ChecklistResponseData | null | undefined;
}) {
  const [checklistAnswersOpen, setChecklistAnswersOpen] = useState(true);
  const { toast } = useToast();

  if (!checklistResponse || !checklistResponse.checklist) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center">
            <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No checklist for this job type</p>
            <p className="text-sm text-slate-500 mt-1">
              {workOrder.visitType === "SERVICE" 
                ? "This service type doesn't have a checklist defined" 
                : "Checklists are only available for service calls"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/30" data-testid="card-work-checklist">
        <CardHeader className="pb-3 border-b border-amber-200 bg-amber-50/50">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Clipboard className="h-4 w-4 text-amber-600" />
            {checklistResponse.checklist.name || "Service Checklist"}
          </CardTitle>
          {checklistResponse.checklist.description && (
            <p className="text-sm text-amber-700 mt-1">{checklistResponse.checklist.description}</p>
          )}
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {checklistResponse.summary && (
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-xs text-amber-700 mb-2 uppercase tracking-wide font-medium">AI Summary</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-work-summary">
                {checklistResponse.summary}
              </p>
            </div>
          )}

          <Collapsible open={checklistAnswersOpen} onOpenChange={setChecklistAnswersOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between p-3 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 bg-white min-h-[44px]"
                data-testid="button-toggle-work-answers"
              >
                <span>Checklist Answers ({checklistResponse.checklist.questions.length})</span>
                {checklistAnswersOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="space-y-3 bg-white rounded-lg p-4 border border-amber-200">
                {checklistResponse.checklist.questions.map((question) => {
                  const answer = checklistResponse.answers[question.id];
                  return (
                    <div key={question.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0" data-testid={`work-answer-${question.id}`}>
                      <p className="text-sm font-medium text-slate-700 mb-1">{question.question}</p>
                      <div className="flex items-center gap-2">
                        {question.questionType === "yes_no" && (
                          <>
                            {answer === true || answer === "true" || answer === "yes" ? (
                              <>
                                <Check className="h-4 w-4 text-green-500" />
                                <span className="text-sm text-green-700">Yes</span>
                              </>
                            ) : answer === false || answer === "false" || answer === "no" ? (
                              <>
                                <X className="h-4 w-4 text-red-500" />
                                <span className="text-sm text-red-700">No</span>
                              </>
                            ) : (
                              <span className="text-sm text-slate-400 italic">Not answered</span>
                            )}
                          </>
                        )}
                        {question.questionType === "text" && (
                          <span className="text-sm text-slate-600">
                            {answer !== undefined && answer !== "" ? String(answer) : <span className="text-slate-400 italic">Not answered</span>}
                          </span>
                        )}
                        {question.questionType === "number" && (
                          <span className="text-sm text-slate-600 font-medium">
                            {answer !== undefined && answer !== "" ? String(answer) : <span className="text-slate-400 italic font-normal">Not answered</span>}
                          </span>
                        )}
                        {question.questionType === "select" && (
                          <span className="text-sm text-slate-600">
                            {answer !== undefined && answer !== "" ? String(answer) : <span className="text-slate-400 italic">Not answered</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {checklistResponse.completedAt && (
            <p className="text-xs text-amber-600 text-right">
              Completed {format(new Date(checklistResponse.completedAt), "MMM d, h:mm a")}
              {checklistResponse.completedBy && ` by ${checklistResponse.completedBy}`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface QuickQuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineType: "service" | "discount" | "part";
}

interface CatalogPart {
  id: string;
  partNumber?: string;
  description: string;
  category?: string;
  price: string;
}

const quoteStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-300" },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700 border-green-300" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700 border-red-300" },
  expired: { label: "Expired", className: "bg-orange-100 text-orange-700 border-orange-300" },
  converted: { label: "Converted", className: "bg-purple-100 text-purple-700 border-purple-300" },
};

function QuoteTab({ workOrder }: { workOrder: WorkOrderDetail }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showQuickQuote, setShowQuickQuote] = useState(false);
  const [lineItems, setLineItems] = useState<QuickQuoteLineItem[]>([]);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [discountDescription, setDiscountDescription] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");

  // Fetch existing quotes for this work order
  const { data: quotesData, isLoading: quotesLoading, error: quotesError } = useQuery<{ quotes: CrmQuote[] }>({
    queryKey: ["/api/crm/quotes", { workOrderId: workOrder.id }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes?workOrderId=${workOrder.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
  });

  const quotes = quotesData?.quotes || [];

  // Fetch parts catalog
  const { data: partsData } = useQuery<CatalogPart[]>({
    queryKey: ["/api/parts"],
    queryFn: async () => {
      const res = await fetch("/api/parts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const parts = partsData || [];
  const filteredParts = catalogSearch.trim()
    ? parts.filter(p => 
        p.description.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (p.partNumber && p.partNumber.toLowerCase().includes(catalogSearch.toLowerCase()))
      )
    : parts.slice(0, 20);

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: async (data: { 
      title: string; 
      lineItems: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number; lineType: string }>; 
      subtotal: number;
      total: number;
    }) => {
      const customerName = workOrder.customer?.name || "Unknown Customer";
      const customerEmail = workOrder.customer?.email || "";
      const customerPhone = workOrder.customer?.phone || "";
      const serviceAddress = workOrder.property 
        ? [workOrder.property.address1, workOrder.property.city, workOrder.property.state, workOrder.property.zip].filter(Boolean).join(", ")
        : "";

      const formattedLineItems = data.lineItems.map((item, index) => ({
        description: item.description,
        quantity: item.quantity.toFixed(2),
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        lineType: item.lineType,
        taxable: item.lineType !== "discount",
        sortOrder: index,
      }));

      const response = await apiRequest("POST", "/api/crm/quotes", {
        scope: "work_order",
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        propertyId: workOrder.propertyId,
        customerName,
        customerEmail,
        customerPhone,
        serviceAddress,
        title: data.title || `Quick Quote for WO-${workOrder.id.slice(-6)}`,
        lineItems: formattedLineItems,
        subtotal: data.subtotal.toFixed(2),
        laborTotal: "0",
        taxRate: "0.0825",
        taxAmount: "0",
        taxTotal: "0",
        total: data.total.toFixed(2),
        status: "draft",
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Quote Created", description: "Your quick quote has been created as a draft." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", { workOrderId: workOrder.id }] });
      setShowQuickQuote(false);
      setLineItems([]);
      setQuoteTitle("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create quote", variant: "destructive" });
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: "", quantity: 1, unitPrice: 0, lineType: "service" }]);
  };

  const addCatalogItem = (part: CatalogPart) => {
    const price = parseFloat(part.price) || 0;
    setLineItems([...lineItems, { 
      id: Date.now().toString(), 
      description: part.description, 
      quantity: 1, 
      unitPrice: price,
      lineType: "part"
    }]);
    setShowCatalog(false);
    setCatalogSearch("");
    toast({ title: "Item Added", description: part.description });
  };

  const addDiscountItem = () => {
    const amount = parseFloat(discountAmount) || 0;
    if (amount <= 0 || !discountDescription.trim()) {
      toast({ title: "Error", description: "Please enter a discount description and amount.", variant: "destructive" });
      return;
    }
    setLineItems([...lineItems, { 
      id: Date.now().toString(), 
      description: discountDescription.trim(), 
      quantity: 1, 
      unitPrice: -Math.abs(amount),
      lineType: "discount"
    }]);
    setShowDiscount(false);
    setDiscountDescription("");
    setDiscountAmount("");
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof QuickQuoteLineItem, value: string | number) => {
    setLineItems(lineItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const total = subtotal; // No tax for quick quote

  const handleCreateQuote = () => {
    const validItems = lineItems.filter(item => item.description.trim() && item.unitPrice !== 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one line item.", variant: "destructive" });
      return;
    }

    createQuoteMutation.mutate({
      title: quoteTitle,
      lineItems: validItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
        lineType: item.lineType,
      })),
      subtotal,
      total,
    });
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
  };

  return (
    <div className="space-y-4">
      {/* Existing Quotes Section */}
      <Card data-testid="existing-quotes-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Existing Quotes</CardTitle>
        </CardHeader>
        <CardContent>
          {quotesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : quotesError ? (
            <p className="text-sm text-red-500" data-testid="quotes-error">
              Failed to load quotes. Please try again.
            </p>
          ) : quotes.length === 0 ? (
            <p className="text-sm text-slate-400 italic" data-testid="no-quotes-message">
              No quotes linked to this work order yet.
            </p>
          ) : (
            <div className="space-y-3">
              {quotes.map((quote) => {
                const statusInfo = quoteStatusConfig[quote.status] || quoteStatusConfig.draft;
                return (
                  <div
                    key={quote.id}
                    className="border rounded-lg p-3 space-y-2"
                    data-testid={`quote-item-${quote.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm" data-testid={`quote-number-${quote.id}`}>
                        {quote.quoteNumber || `Quote`}
                      </span>
                      <Badge variant="outline" className={statusInfo.className} data-testid={`quote-status-${quote.id}`}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    {quote.title && (
                      <p className="text-sm text-slate-600 truncate" data-testid={`quote-title-${quote.id}`}>
                        {quote.title}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold text-green-700" data-testid={`quote-total-${quote.id}`}>
                        {formatCurrency(quote.total)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                        data-testid={`button-view-quote-${quote.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                    {quote.createdAt && (
                      <p className="text-xs text-slate-400">
                        Created {format(new Date(quote.createdAt), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Quote Creation */}
      <Card data-testid="quick-quote-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-green-600" />
            Quick Quote
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showQuickQuote ? (
            <>
              <p className="text-sm text-slate-600">
                Create a simple quote with line items directly from here.
              </p>
              <Button
                className="w-full min-h-[48px] bg-[#711419] hover:bg-[#5a1014]"
                onClick={() => setShowQuickQuote(true)}
                data-testid="button-start-quick-quote"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Quick Quote
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              {/* Quote Title */}
              <div>
                <Label htmlFor="quote-title" className="text-sm font-medium">
                  Quote Title (optional)
                </Label>
                <Input
                  id="quote-title"
                  placeholder="e.g., AC Repair Quote"
                  value={quoteTitle}
                  onChange={(e) => setQuoteTitle(e.target.value)}
                  className="min-h-[44px] mt-1"
                  data-testid="input-quote-title"
                />
              </div>

              {/* Line Items Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Line Items</Label>
                  <span className="text-xs text-slate-500">{lineItems.length} item{lineItems.length !== 1 ? "s" : ""}</span>
                </div>
                
                {/* Action Buttons - Mobile Friendly */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1 min-w-[100px] border-blue-200 text-blue-700 hover:bg-blue-50"
                    onClick={() => setShowCatalog(true)}
                    data-testid="button-add-from-catalog"
                  >
                    <Package className="h-4 w-4 mr-1" />
                    Catalog
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1 min-w-[100px] border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => setShowDiscount(true)}
                    data-testid="button-add-discount"
                  >
                    <Tag className="h-4 w-4 mr-1" />
                    Discount
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1 min-w-[100px]"
                    onClick={addLineItem}
                    data-testid="button-add-line-item"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Manual
                  </Button>
                </div>

                {/* Line Items List */}
                {lineItems.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-6 text-center text-slate-400">
                    <p className="text-sm">No items added yet.</p>
                    <p className="text-xs mt-1">Use the buttons above to add items.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lineItems.map((item, index) => (
                      <div 
                        key={item.id} 
                        className={`border rounded-lg p-3 space-y-2 ${item.lineType === "discount" ? "bg-amber-50 border-amber-200" : item.lineType === "part" ? "bg-blue-50 border-blue-200" : ""}`}
                        data-testid={`line-item-${item.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-medium">
                              {item.lineType === "discount" ? (
                                <span className="text-amber-600 flex items-center gap-1"><Tag className="h-3 w-3" />Discount</span>
                              ) : item.lineType === "part" ? (
                                <span className="text-blue-600 flex items-center gap-1"><Package className="h-3 w-3" />Part</span>
                              ) : (
                                `Item ${index + 1}`
                              )}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeLineItem(item.id)}
                            data-testid={`button-remove-item-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {item.lineType === "discount" ? (
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{item.description}</span>
                            <span className="font-medium text-red-600" data-testid={`line-total-${item.id}`}>
                              {formatCurrency(item.unitPrice)}
                            </span>
                          </div>
                        ) : (
                          <>
                            <Input
                              placeholder="Description (e.g., Labor - AC Repair)"
                              value={item.description}
                              onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                              className="min-h-[44px]"
                              data-testid={`input-description-${item.id}`}
                            />
                            <div className="flex gap-2">
                              <div className="w-20">
                                <Label className="text-xs text-slate-500">Qty</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                                  className="min-h-[44px]"
                                  data-testid={`input-quantity-${item.id}`}
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-slate-500">Price</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={item.unitPrice || ""}
                                  onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                                  className="min-h-[44px]"
                                  data-testid={`input-unit-price-${item.id}`}
                                />
                              </div>
                              <div className="w-24 text-right">
                                <Label className="text-xs text-slate-500">Total</Label>
                                <p className="min-h-[44px] flex items-center justify-end font-medium" data-testid={`line-total-${item.id}`}>
                                  {formatCurrency(item.quantity * item.unitPrice)}
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium" data-testid="quote-subtotal">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span className={total >= 0 ? "text-green-700" : "text-red-600"} data-testid="quote-total">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 min-h-[48px]"
                  onClick={() => {
                    setShowQuickQuote(false);
                    setLineItems([]);
                    setQuoteTitle("");
                  }}
                  disabled={createQuoteMutation.isPending}
                  data-testid="button-cancel-quote"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 min-h-[48px] bg-[#711419] hover:bg-[#5a1014]"
                  onClick={handleCreateQuote}
                  disabled={createQuoteMutation.isPending}
                  data-testid="button-create-quote"
                >
                  {createQuoteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Create Quote
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items Catalog Dialog */}
      <Dialog open={showCatalog} onOpenChange={setShowCatalog}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Items Catalog
            </DialogTitle>
            <DialogDescription>
              Search and select items from the catalog
            </DialogDescription>
          </DialogHeader>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search parts..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
              data-testid="input-catalog-search"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2">
            {filteredParts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {catalogSearch ? "No items found" : "Loading catalog..."}
              </p>
            ) : (
              filteredParts.map((part, idx) => (
                <div
                  key={part.id || idx}
                  className="border rounded-lg p-3 hover:bg-slate-50 cursor-pointer"
                  onClick={() => addCatalogItem(part)}
                  data-testid={`catalog-item-${part.id || idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{part.description}</p>
                      {part.partNumber && (
                        <p className="text-xs text-slate-500">{part.partNumber}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-green-700 ml-2">
                      {formatCurrency(parseFloat(part.price) || 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCatalog(false); setCatalogSearch(""); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Discount Dialog */}
      <Dialog open={showDiscount} onOpenChange={setShowDiscount}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-600" />
              Add Discount
            </DialogTitle>
            <DialogDescription>
              Enter discount details to apply to the quote
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Discount Description</Label>
              <Input
                placeholder="e.g., Senior Discount, Loyalty Discount"
                value={discountDescription}
                onChange={(e) => setDiscountDescription(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-discount-description"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Amount ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-discount-amount"
              />
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowDiscount(false); setDiscountDescription(""); setDiscountAmount(""); }}>
              Cancel
            </Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700"
              onClick={addDiscountItem}
              data-testid="button-confirm-discount"
            >
              Add Discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceWithLineItems extends CrmInvoice {
  lineItems?: CrmInvoiceLineItem[];
}

const invoiceStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-300" },
  paid: { label: "Paid", className: "bg-green-100 text-green-700 border-green-300" },
  void: { label: "Void", className: "bg-red-100 text-red-700 border-red-300" },
  partial: { label: "Partial", className: "bg-amber-100 text-amber-700 border-amber-300" },
};

function InvoiceTab({ workOrder }: { workOrder: WorkOrderDetail }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { id: "1", description: "", quantity: 1, unitPrice: 0 }
  ]);
  const [taxRate, setTaxRate] = useState(8.25);

  const { data: invoicesData, isLoading: invoicesLoading, error: invoicesError } = useQuery<{ invoices: CrmInvoice[] }>({
    queryKey: ["/api/crm/invoices", { workOrderId: workOrder.id }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices?workOrderId=${workOrder.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  const invoices = invoicesData?.invoices || [];
  const existingInvoice = invoices.length > 0 ? invoices[0] : null;

  const { data: invoiceDetailData } = useQuery<InvoiceWithLineItems>({
    queryKey: ["/api/crm/invoices", existingInvoice?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${existingInvoice!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice details");
      return res.json();
    },
    enabled: !!existingInvoice?.id,
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: {
      lineItems: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number; lineType: string }>;
      subtotal: number;
      taxTotal: number;
      total: number;
    }) => {
      const formattedLineItems = data.lineItems.map((item, index) => ({
        description: item.description,
        quantity: item.quantity.toFixed(2),
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        lineType: item.lineType,
        taxable: true,
        sortOrder: index,
      }));

      const response = await apiRequest("POST", "/api/crm/invoices", {
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        propertyId: workOrder.propertyId,
        lineItems: formattedLineItems,
        subtotal: data.subtotal.toFixed(2),
        laborTotal: "0.00",
        taxTotal: data.taxTotal.toFixed(2),
        total: data.total.toFixed(2),
        amountPaid: "0.00",
        balanceDue: data.total.toFixed(2),
        status: "draft",
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice Created", description: "Your invoice has been created as a draft." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", { workOrderId: workOrder.id }] });
      setShowCreateForm(false);
      setLineItems([{ id: "1", description: "", quantity: 1, unitPrice: 0 }]);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create invoice", variant: "destructive" });
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const updateLineItem = (id: string, field: keyof InvoiceLineItem, value: string | number) => {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleCreateInvoice = () => {
    const validItems = lineItems.filter(item => item.description.trim() && item.unitPrice > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one line item with a description and price.", variant: "destructive" });
      return;
    }

    createInvoiceMutation.mutate({
      lineItems: validItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
        lineType: "service",
      })),
      subtotal,
      taxTotal: taxAmount,
      total,
    });
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
  };

  if (existingInvoice) {
    const invoiceDetail = invoiceDetailData || existingInvoice;
    const statusInfo = invoiceStatusConfig[invoiceDetail.status] || invoiceStatusConfig.draft;
    const isPaid = invoiceDetail.status === "paid";
    const isPartial = invoiceDetail.status === "partial";

    return (
      <div className="space-y-4">
        <Card data-testid="invoice-detail-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4 text-green-600" />
                {invoiceDetail.invoiceNumber}
              </CardTitle>
              <Badge variant="outline" className={statusInfo.className} data-testid="invoice-status-badge">
                {statusInfo.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Subtotal</span>
                <span className="text-sm font-medium" data-testid="invoice-subtotal">
                  {formatCurrency(invoiceDetail.subtotal || "0")}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Tax</span>
                <span className="text-sm font-medium" data-testid="invoice-tax">
                  {formatCurrency(invoiceDetail.taxTotal || "0")}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-base font-semibold">Total</span>
                <span className="text-lg font-bold text-green-700" data-testid="invoice-total">
                  {formatCurrency(invoiceDetail.total || "0")}
                </span>
              </div>
            </div>

            {(isPaid || isPartial) && (
              <div className={`rounded-lg p-3 ${isPaid ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className={`h-4 w-4 ${isPaid ? 'text-green-600' : 'text-amber-600'}`} />
                  <span className={`text-sm font-medium ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>
                    Payment Status
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Amount Paid</span>
                    <span className="font-medium text-green-700" data-testid="invoice-amount-paid">
                      {formatCurrency(invoiceDetail.amountPaid || "0")}
                    </span>
                  </div>
                  {!isPaid && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Balance Due</span>
                      <span className="font-medium text-red-600" data-testid="invoice-balance-due">
                        {formatCurrency(invoiceDetail.balanceDue || "0")}
                      </span>
                    </div>
                  )}
                  {invoiceDetail.paidAt && (
                    <p className="text-xs text-slate-500 mt-1" data-testid="invoice-paid-date">
                      Paid on {format(new Date(invoiceDetail.paidAt), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!isPaid && !isPartial && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-amber-700">Balance Due</span>
                  <span className="font-semibold text-amber-800" data-testid="invoice-balance-due">
                    {formatCurrency(invoiceDetail.balanceDue || invoiceDetail.total || "0")}
                  </span>
                </div>
              </div>
            )}

            {invoiceDetailData?.lineItems && invoiceDetailData.lineItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Line Items</p>
                <div className="space-y-2">
                  {invoiceDetailData.lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border rounded-lg p-3"
                      data-testid={`invoice-line-item-${item.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">{item.description}</p>
                          <p className="text-xs text-slate-500">
                            {item.quantity} × {formatCurrency(item.unitPrice)}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-slate-700">
                          {formatCurrency(item.lineTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full min-h-[48px]"
              onClick={() => navigate(`/crm/invoices/${invoiceDetail.id}`)}
              data-testid="button-view-invoice-detail"
            >
              <Eye className="h-4 w-4 mr-2" />
              View Full Invoice
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card data-testid="existing-invoices-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : invoicesError ? (
            <p className="text-sm text-red-500" data-testid="invoices-error">
              Failed to load invoices. Please try again.
            </p>
          ) : (
            <p className="text-sm text-slate-400 italic" data-testid="no-invoices-message">
              No invoices linked to this work order yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="create-invoice-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-green-600" />
            Create Invoice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showCreateForm ? (
            <>
              <p className="text-sm text-slate-600">
                Create an invoice for work completed on this job.
              </p>
              <Button
                className="w-full min-h-[48px] bg-[#711419] hover:bg-[#5a1014]"
                onClick={() => setShowCreateForm(true)}
                data-testid="button-show-create-invoice-form"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={item.id} className="bg-slate-50 rounded-lg p-3 space-y-3" data-testid={`line-item-${item.id}`}>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-slate-500">Line Item {index + 1}</Label>
                      {lineItems.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => removeLineItem(item.id)}
                          data-testid={`button-remove-line-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                      className="min-h-[44px]"
                      data-testid={`input-line-description-${item.id}`}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-500">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                          className="min-h-[44px]"
                          data-testid={`input-line-quantity-${item.id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Unit Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="min-h-[44px]"
                          data-testid={`input-line-unitprice-${item.id}`}
                        />
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium text-slate-700">
                      Line Total: {formatCurrency(item.quantity * item.unitPrice)}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="w-full min-h-[44px]"
                onClick={addLineItem}
                data-testid="button-add-line-item"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Line Item
              </Button>

              <div className="bg-slate-100 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Subtotal</span>
                  <span className="text-sm font-medium" data-testid="invoice-form-subtotal">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Tax</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-16 h-7 text-xs p-1"
                      data-testid="input-tax-rate"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                  <span className="text-sm font-medium" data-testid="invoice-form-tax">
                    {formatCurrency(taxAmount)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold">Total</span>
                  <span className="text-lg font-bold text-green-700" data-testid="invoice-form-total">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 min-h-[48px]"
                  onClick={() => {
                    setShowCreateForm(false);
                    setLineItems([{ id: "1", description: "", quantity: 1, unitPrice: 0 }]);
                  }}
                  disabled={createInvoiceMutation.isPending}
                  data-testid="button-cancel-invoice"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 min-h-[48px] bg-[#711419] hover:bg-[#5a1014]"
                  onClick={handleCreateInvoice}
                  disabled={createInvoiceMutation.isPending}
                  data-testid="button-create-invoice"
                >
                  {createInvoiceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Create Invoice
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MobileJobDetail() {
  const params = useParams<{ id: string }>();
  const workOrderId = parseInt(params.id || "0", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [noteInput, setNoteInput] = useState("");
  const { isOnline } = useOnlineStatus();
  const pendingNotes = usePendingNotes(workOrderId);

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [optimisticStatus, setOptimisticStatus] = useState<WorkOrderStatus | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionSummary, setCompletionSummary] = useState("");

  const { data: workOrder, isLoading } = useQuery<WorkOrderDetail>({
    queryKey: ["/api/crm/work-orders", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work order");
      return res.json();
    },
    enabled: !!params.id,
  });

  const { data: checklistResponse } = useQuery<ChecklistResponseData>({
    queryKey: ["/api/crm/work-orders", params.id, "checklist-response"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${params.id}/checklist-response`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch checklist");
      }
      return res.json();
    },
    enabled: !!params.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ newStatus, summary }: { newStatus: WorkOrderStatus; summary?: string }) => {
      setOptimisticStatus(newStatus);
      const payload: any = { status: newStatus };
      if (summary) {
        payload.completionSummary = summary;
      }
      await apiRequest("PATCH", `/api/crm/work-orders/${params.id}`, payload);
    },
    onSuccess: () => {
      setOptimisticStatus(null);
      setShowCompletionModal(false);
      setCompletionSummary("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({ title: "Status updated" });
    },
    onError: (error, variables) => {
      if (isNetworkError(error)) {
        queueMutation('status-update', workOrderId, { status: variables.newStatus, summary: variables.summary });
        setShowCompletionModal(false);
        setCompletionSummary("");
        toast({ 
          title: "Saved offline", 
          description: "Status will sync when you're back online",
        });
      } else {
        setOptimisticStatus(null);
        toast({ title: "Failed to update status", variant: "destructive" });
      }
    },
  });

  const handleStatusChange = (newStatus: WorkOrderStatus) => {
    if (newStatus === "completed") {
      setShowCompletionModal(true);
    } else {
      updateStatusMutation.mutate({ newStatus });
    }
  };

  const handleCompleteJob = () => {
    if (!completionSummary.trim()) {
      toast({ title: "Summary required", description: "Please enter a summary of the work completed", variant: "destructive" });
      return;
    }
    updateStatusMutation.mutate({ newStatus: "completed", summary: completionSummary.trim() });
  };

  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const existingNotes = workOrder?.techNotes ?? "";
      const timestamp = format(new Date(), "MMM d, h:mm a");
      const newNotes = existingNotes 
        ? `${existingNotes}\n\n[${timestamp}] ${note}`
        : `[${timestamp}] ${note}`;
      
      await apiRequest("PATCH", `/api/crm/work-orders/${params.id}`, { techNotes: newNotes });
      return newNotes;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      setNoteInput("");
      toast({ title: "Note added" });
    },
    onError: (error, note) => {
      if (isNetworkError(error)) {
        queueMutation('add-note', workOrderId, { noteText: note });
        setNoteInput("");
        toast({ 
          title: "Saved offline", 
          description: "Note will sync when you're back online",
        });
      } else {
        toast({ title: "Failed to add note", variant: "destructive" });
      }
    },
  });

  const handleAddNote = () => {
    if (noteInput.trim()) {
      addNoteMutation.mutate(noteInput.trim());
    }
  };

  if (isLoading) {
    return (
      <MobileShell>
        <OfflineIndicator />
        <div className="p-4 space-y-4" data-testid="job-detail-loading">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </MobileShell>
    );
  }

  if (!workOrder) {
    return (
      <MobileShell>
        <OfflineIndicator />
        <div className="p-4 text-center" data-testid="job-not-found">
          <p className="text-slate-500">Work order not found</p>
          <Button 
            variant="link" 
            onClick={() => navigate("/mobile")}
            data-testid="button-back-to-agenda"
          >
            Back to Agenda
          </Button>
        </div>
      </MobileShell>
    );
  }

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
    { id: "work" as const, label: "Work", icon: ClipboardList },
    { id: "quote" as const, label: "Quote", icon: FileText },
    { id: "invoice" as const, label: "Invoice", icon: Receipt },
  ];

  return (
    <MobileShell>
      <OfflineIndicator />
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 p-4 pb-2">
          <button
            onClick={() => navigate("/mobile")}
            className="flex items-center text-slate-600 hover:text-slate-800 min-h-[44px] min-w-[44px]"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            <span>Back</span>
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-24" data-testid="mobile-job-detail">
          {activeTab === "overview" && (
            <OverviewTab
              workOrder={workOrder}
              checklistResponse={checklistResponse}
              optimisticStatus={optimisticStatus}
              updateStatusMutation={updateStatusMutation}
              handleStatusChange={handleStatusChange}
              noteInput={noteInput}
              setNoteInput={setNoteInput}
              handleAddNote={handleAddNote}
              addNoteMutation={addNoteMutation}
              pendingNotes={pendingNotes}
            />
          )}
          {activeTab === "work" && (
            <WorkTab workOrder={workOrder} checklistResponse={checklistResponse} />
          )}
          {activeTab === "quote" && (
            <QuoteTab workOrder={workOrder} />
          )}
          {activeTab === "invoice" && (
            <InvoiceTab workOrder={workOrder} />
          )}
        </div>

        <div 
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          data-testid="job-tab-nav"
        >
          <div className="flex justify-around items-center">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 py-3 px-4 min-h-[60px] min-w-[60px] transition-colors ${
                    isActive 
                      ? 'text-[#711419]' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'stroke-2' : ''}`} />
                  <span className={`text-xs ${isActive ? 'font-semibold' : ''}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
        <DialogContent className="sm:max-w-md" data-testid="completion-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Complete Job
            </DialogTitle>
            <DialogDescription>
              Please provide a summary of the work completed before marking this job as done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="completion-summary">Work Summary *</Label>
              <Textarea
                id="completion-summary"
                placeholder="Describe what work was performed, parts used, and any follow-up needed..."
                value={completionSummary}
                onChange={(e) => setCompletionSummary(e.target.value)}
                className="min-h-[120px]"
                data-testid="input-completion-summary"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCompletionModal(false)}
              disabled={updateStatusMutation.isPending}
              data-testid="button-cancel-completion"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteJob}
              disabled={!completionSummary.trim() || updateStatusMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-completion"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Complete Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileShell>
  );
}
