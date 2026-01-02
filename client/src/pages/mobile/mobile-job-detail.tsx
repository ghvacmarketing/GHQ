import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { nanoid } from "nanoid";
import { 
  ArrowLeft, 
  Phone, 
  MessageSquare, 
  Navigation, 
  MapPin, 
  Clock,
  Send,
  Loader2,
  Camera,
  X,
  Image,
  CloudOff,
  CheckCircle2,
  Car,
  Wrench,
  ClipboardCheck,
  Package,
  History,
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  Clipboard
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
import { useOnlineStatus, usePendingChanges, OfflineIndicator } from "@/hooks/use-online-status";
import MobileShell from "./mobile-shell";
import type { CrmWorkOrder, CrmCustomer, CrmProperty, WorkOrderStatus } from "@shared/schema";

interface WorkOrderPhoto {
  id: string;
  url: string;
  objectPath: string;
  filename: string;
  uploadedAt: string;
}

interface PartUsed {
  partId: string;
  name: string;
  qty: number;
  price: number;
}

interface WorkOrderDetail extends Omit<CrmWorkOrder, 'photos' | 'partsUsed'> {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
  photos?: WorkOrderPhoto[] | null;
  partsUsed?: PartUsed[] | null;
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

interface WorkOrderSummary {
  id: string;
  visitType: string;
  status: string;
  scheduledStart: string | null;
  description: string | null;
}

interface WorkOrdersResponse {
  workOrders: WorkOrderSummary[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

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

export default function MobileJobDetail() {
  const params = useParams<{ id: string }>();
  const workOrderId = parseInt(params.id || "0", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [noteInput, setNoteInput] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<WorkOrderPhoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isOnline } = useOnlineStatus();
  const pendingChangesCount = usePendingChanges(workOrderId);
  const pendingNotes = usePendingNotes(workOrderId);

  const [optimisticStatus, setOptimisticStatus] = useState<WorkOrderStatus | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionSummary, setCompletionSummary] = useState("");
  
  const [checklistAnswersOpen, setChecklistAnswersOpen] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPartName, setNewPartName] = useState("");
  const [newPartQty, setNewPartQty] = useState("1");
  const [newPartPrice, setNewPartPrice] = useState("");

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

  const { data: jobHistory } = useQuery<WorkOrdersResponse>({
    queryKey: ["/api/crm/work-orders", "customer-history", workOrder?.customerId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders?customerId=${workOrder?.customerId}&limit=6`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job history");
      return res.json();
    },
    enabled: !!workOrder?.customerId,
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

  const addPartMutation = useMutation({
    mutationFn: async (newPart: PartUsed) => {
      const existingParts = workOrder?.partsUsed || [];
      const updatedParts = [...existingParts, newPart];
      await apiRequest("PATCH", `/api/crm/work-orders/${params.id}`, { partsUsed: updatedParts });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      setNewPartName("");
      setNewPartQty("1");
      setNewPartPrice("");
      setShowAddPart(false);
      toast({ title: "Part added" });
    },
    onError: () => {
      toast({ title: "Failed to add part", variant: "destructive" });
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

  const handlePhotoCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const presignedResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await presignedResponse.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      const photoId = nanoid();
      const photoUrl = `/objects${objectPath.startsWith("/") ? objectPath : `/${objectPath}`}`;

      await apiRequest("POST", `/api/crm/work-orders/${params.id}/photos`, {
        id: photoId,
        url: photoUrl,
        objectPath: objectPath,
        filename: file.name,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      toast({ title: "Photo uploaded successfully" });
    } catch (error) {
      console.error("Photo upload error:", error);
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCall = () => {
    const phone = workOrder?.customer?.phone;
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleText = () => {
    const phone = workOrder?.customer?.phone;
    if (phone) {
      window.location.href = `sms:${phone}`;
    }
  };

  const handleNavigate = () => {
    const url = getGoogleMapsUrl(workOrder?.property || null);
    if (url) {
      window.open(url, "_blank");
    }
  };

  const handleAddNote = () => {
    if (noteInput.trim()) {
      addNoteMutation.mutate(noteInput.trim());
    }
  };

  const handleAddPart = () => {
    if (!newPartName.trim()) {
      toast({ title: "Part name required", variant: "destructive" });
      return;
    }
    const qty = parseInt(newPartQty, 10) || 1;
    const price = parseFloat(newPartPrice) || 0;
    addPartMutation.mutate({
      partId: nanoid(),
      name: newPartName.trim(),
      qty,
      price,
    });
  };

  const getNextStatus = (currentStatus: WorkOrderStatus): WorkOrderStatus | null => {
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex < statusFlow.length - 1) {
      return statusFlow[currentIndex + 1];
    }
    return null;
  };

  const previousWorkOrders = jobHistory?.workOrders.filter(wo => wo.id !== params.id).slice(0, 5) || [];
  const hasMoreHistory = (jobHistory?.pagination.total || 0) > 6;

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

  const displayStatus = optimisticStatus || workOrder.status;
  const status = statusConfig[displayStatus] || statusConfig.scheduled;
  const customerName = workOrder.customer?.name || "Unknown Customer";
  const customerPhone = workOrder.customer?.phone;
  const address = getPropertyAddress(workOrder.property);
  const nextStatus = getNextStatus(displayStatus as WorkOrderStatus);

  return (
    <MobileShell>
      <OfflineIndicator />
      <div className="p-4 space-y-4 pb-24" data-testid="mobile-job-detail">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/mobile")}
            className="flex items-center text-slate-600 hover:text-slate-800 min-h-[44px] min-w-[44px]"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            <span>Back</span>
          </button>
          
          {pendingChangesCount > 0 && (
            <div 
              className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full"
              data-testid="pending-changes-indicator"
            >
              <CloudOff className="h-3 w-3" />
              {pendingChangesCount} pending
            </div>
          )}
        </div>

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

        {checklistResponse && checklistResponse.checklist && (
          <Card className="border-amber-200 bg-amber-50/30" data-testid="card-service-checklist">
            <CardHeader className="pb-3 border-b border-amber-200 bg-amber-50/50">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Clipboard className="h-4 w-4 text-amber-600" />
                Service Checklist
              </CardTitle>
              {checklistResponse.checklist.name && (
                <p className="text-sm text-amber-700 mt-1">{checklistResponse.checklist.name}</p>
              )}
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {checklistResponse.summary && (
                <div className="bg-white rounded-lg p-4 border border-amber-200">
                  <p className="text-xs text-amber-700 mb-2 uppercase tracking-wide font-medium">AI Summary</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-checklist-summary">
                    {checklistResponse.summary}
                  </p>
                </div>
              )}

              <Collapsible open={checklistAnswersOpen} onOpenChange={setChecklistAnswersOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full flex items-center justify-between p-3 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 bg-white min-h-[44px]"
                    data-testid="button-toggle-checklist-answers"
                  >
                    <span>View All Answers ({checklistResponse.checklist.questions.length})</span>
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
                        <div key={question.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0" data-testid={`checklist-answer-${question.id}`}>
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
                {pendingNotes.map((pendingNote) => (
                  <div 
                    key={pendingNote.id}
                    className="text-sm text-slate-600 whitespace-pre-wrap bg-amber-50 border border-amber-200 p-3 rounded-md"
                    data-testid={`pending-note-${pendingNote.id}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant="outline" 
                        className="text-xs bg-amber-100 text-amber-700 border-amber-300"
                        data-testid="pending-sync-badge"
                      >
                        <CloudOff className="h-3 w-3 mr-1" />
                        Pending sync
                      </Badge>
                      <span className="text-xs text-amber-600">
                        {format(new Date(pendingNote.timestamp), "MMM d, h:mm a")}
                      </span>
                    </div>
                    {pendingNote.noteText}
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

        <Card data-testid="parts-used-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Parts Used
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workOrder.partsUsed && workOrder.partsUsed.length > 0 ? (
              <div className="space-y-2" data-testid="parts-list">
                {workOrder.partsUsed.map((part) => (
                  <div 
                    key={part.partId} 
                    className="flex items-center justify-between bg-slate-50 p-3 rounded-md"
                    data-testid={`part-item-${part.partId}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">{part.name}</p>
                      <p className="text-xs text-slate-500">Qty: {part.qty}</p>
                    </div>
                    {part.price > 0 && (
                      <span className="text-sm font-medium text-slate-600">${part.price.toFixed(2)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : !showAddPart ? (
              <p className="text-sm text-slate-400 italic" data-testid="no-parts">
                No parts logged yet
              </p>
            ) : null}
            
            {showAddPart ? (
              <div className="space-y-3 bg-slate-50 p-3 rounded-md" data-testid="add-part-form">
                <div>
                  <Label htmlFor="part-name" className="text-sm">Part Name *</Label>
                  <Input
                    id="part-name"
                    placeholder="e.g., Capacitor 45/5 MFD"
                    value={newPartName}
                    onChange={(e) => setNewPartName(e.target.value)}
                    className="min-h-[44px] mt-1"
                    data-testid="input-part-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="part-qty" className="text-sm">Quantity</Label>
                    <Input
                      id="part-qty"
                      type="number"
                      min="1"
                      value={newPartQty}
                      onChange={(e) => setNewPartQty(e.target.value)}
                      className="min-h-[44px] mt-1"
                      data-testid="input-part-qty"
                    />
                  </div>
                  <div>
                    <Label htmlFor="part-price" className="text-sm">Price (optional)</Label>
                    <Input
                      id="part-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newPartPrice}
                      onChange={(e) => setNewPartPrice(e.target.value)}
                      className="min-h-[44px] mt-1"
                      data-testid="input-part-price"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 min-h-[44px]"
                    onClick={() => {
                      setShowAddPart(false);
                      setNewPartName("");
                      setNewPartQty("1");
                      setNewPartPrice("");
                    }}
                    data-testid="button-cancel-part"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 min-h-[44px] bg-[#711419] hover:bg-[#5a1014]"
                    onClick={handleAddPart}
                    disabled={!newPartName.trim() || addPartMutation.isPending}
                    data-testid="button-save-part"
                  >
                    {addPartMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Save Part
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full min-h-[44px]"
                onClick={() => setShowAddPart(true)}
                data-testid="button-add-part"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Part
              </Button>
            )}
          </CardContent>
        </Card>

        <Card data-testid="photos-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4" />
              Photos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workOrder.photos && workOrder.photos.length > 0 ? (
              <div 
                className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2"
                data-testid="photo-thumbnails-container"
              >
                {workOrder.photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className="relative shrink-0 w-20 h-20 rounded-md overflow-hidden border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#711419]"
                    data-testid={`photo-thumbnail-${photo.id}`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic" data-testid="no-photos">
                No photos yet
              </p>
            )}
            <Separator />
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                ref={fileInputRef}
                className="hidden"
                data-testid="input-photo-file"
              />
              <Button
                variant="outline"
                className="flex-1 min-h-[44px]"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto || !isOnline}
                data-testid="button-add-photo"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Camera className="h-5 w-5 mr-2" />
                )}
                {isUploadingPhoto ? "Uploading..." : !isOnline ? "Photos require connection" : "Add Photo"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {previousWorkOrders.length > 0 && (
          <Card data-testid="job-history-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Previous Visits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {previousWorkOrders.map((wo) => (
                <button
                  key={wo.id}
                  onClick={() => navigate(`/mobile/job/${wo.id}`)}
                  className="w-full text-left bg-slate-50 p-3 rounded-md hover:bg-slate-100 transition-colors min-h-[44px]"
                  data-testid={`history-item-${wo.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">
                      {wo.scheduledStart ? format(new Date(wo.scheduledStart), "MMM d, yyyy") : "Unscheduled"}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${statusConfig[wo.status]?.className || ''}`}
                    >
                      {statusConfig[wo.status]?.label || wo.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">{wo.visitType}</p>
                  {wo.description && (
                    <p className="text-xs text-slate-400 mt-1 truncate">{wo.description}</p>
                  )}
                </button>
              ))}
              {hasMoreHistory && (
                <Button
                  variant="link"
                  className="w-full text-sm text-[#711419]"
                  onClick={() => navigate(`/crm/customers/${workOrder.customerId}`)}
                  data-testid="button-view-all-history"
                >
                  View All History →
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {selectedPhoto && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setSelectedPhoto(null)}
            data-testid="photo-viewer-overlay"
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 text-white p-2 hover:bg-white/20 rounded-full"
              data-testid="button-close-photo-viewer"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.filename}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
              data-testid="photo-viewer-image"
            />
          </div>
        )}

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

      <div 
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex justify-around items-center z-50 shadow-lg safe-area-pb"
        data-testid="floating-action-bar"
      >
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-1 h-auto py-2 px-4 min-h-[56px] min-w-[56px]"
          onClick={handleCall}
          disabled={!customerPhone}
          data-testid="fab-call"
        >
          <Phone className="h-5 w-5" />
          <span className="text-xs">Call</span>
        </Button>
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-1 h-auto py-2 px-4 min-h-[56px] min-w-[56px]"
          onClick={handleText}
          disabled={!customerPhone}
          data-testid="fab-text"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-xs">Text</span>
        </Button>
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-1 h-auto py-2 px-4 min-h-[56px] min-w-[56px]"
          onClick={handleNavigate}
          data-testid="fab-navigate"
        >
          <Navigation className="h-5 w-5" />
          <span className="text-xs">Navigate</span>
        </Button>
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-1 h-auto py-2 px-4 min-h-[56px] min-w-[56px]"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadingPhoto || !isOnline}
          data-testid="fab-photo"
        >
          {isUploadingPhoto ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
          <span className="text-xs">Photo</span>
        </Button>
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
