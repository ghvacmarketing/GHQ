import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, useSearch } from "wouter";
import { format, addYears, addMonths } from "date-fns";
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
  Package,
  CreditCard,
  Mail,
  UserPlus,
  Pencil,
  CalendarIcon,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  Minus
} from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queueMutation, usePendingNotes } from "@/lib/offline-queue";
import { useOnlineStatus, OfflineIndicator } from "@/hooks/use-online-status";
import MobileShell from "./mobile-shell";
import type { CrmWorkOrder, CrmCustomer, CrmProperty, WorkOrderStatus, CrmQuote, CrmInvoice, CrmInvoiceLineItem, CrmItem, CrmQuoteLineItem, CrmUser } from "@shared/schema";

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

interface TimeSlot {
  start: string;
  end: string;
  label: string;
  available: boolean;
}

interface RenewalInfo {
  isRenewalVisit: boolean;
  paymentType: "initial" | "renewal" | null;
  renewalStatus: "none" | "pending" | "pending_payment" | "collected" | "declined";
  agreementInfo: {
    id: string;
    agreementNumber: string;
    price: number;
    customerName: string;
    billingPreference?: string;
    status?: string;
    agreementPlan?: string;
  } | null;
  visitInfo?: {
    visitNumber: number;
    totalVisitsInCycle: number;
    targetDate: string;
    isRenewalTrigger?: boolean;
  } | null;
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

function OverviewTab({ 
  workOrder, 
  checklistResponse,
  optimisticStatus,
  updateStatusMutation,
  handleStatusChange,
  renewalInfo,
  onCollectRenewal,
  onDeclineRenewal,
}: {
  workOrder: WorkOrderDetail;
  checklistResponse: ChecklistResponseData | null | undefined;
  optimisticStatus: WorkOrderStatus | null;
  updateStatusMutation: any;
  handleStatusChange: (status: WorkOrderStatus) => void;
  renewalInfo: RenewalInfo | null | undefined;
  onCollectRenewal: () => void;
  onDeclineRenewal: () => void;
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

      {renewalInfo?.isRenewalVisit && renewalInfo.renewalStatus === "pending" && renewalInfo.agreementInfo && (
        <Card className={renewalInfo.paymentType === "initial" ? "border-green-400 bg-green-50" : "border-amber-400 bg-amber-50"} data-testid="renewal-banner">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full ${renewalInfo.paymentType === "initial" ? "bg-green-100" : "bg-amber-100"}`}>
                {renewalInfo.paymentType === "initial" ? (
                  <DollarSign className="h-5 w-5 text-green-600" />
                ) : (
                  <RefreshCw className="h-5 w-5 text-amber-600" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 ${renewalInfo.paymentType === "initial" ? "text-green-800" : "text-amber-800"}`}>
                  {renewalInfo.paymentType === "initial" ? "First Visit - Collect Payment" : "Renewal Due"}
                </h3>
                <p className={`text-sm mb-2 ${renewalInfo.paymentType === "initial" ? "text-green-700" : "text-amber-700"}`}>
                  {renewalInfo.paymentType === "initial" 
                    ? `Collect first year payment to activate agreement (${renewalInfo.agreementInfo.agreementNumber})`
                    : `Collect payment for next service period`}
                </p>
                <p className={`text-lg font-bold mb-3 ${renewalInfo.paymentType === "initial" ? "text-green-700" : "text-amber-700"}`}>
                  ${parseFloat(String(renewalInfo.agreementInfo.price || 0)).toFixed(2)}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 min-h-[44px] flex-1"
                    onClick={onCollectRenewal}
                    data-testid="button-collect-renewal"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Collect Payment
                  </Button>
                  {renewalInfo.paymentType !== "initial" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50 min-h-[44px] flex-1"
                      onClick={onDeclineRenewal}
                      data-testid="button-decline-renewal"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Customer Declined
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {renewalInfo?.isRenewalVisit && renewalInfo.renewalStatus === "pending_payment" && (
        <Card className="border-blue-400 bg-blue-50" data-testid="renewal-pending-payment-banner">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-800">Invoice Created</h3>
                <p className="text-sm text-blue-700">Awaiting payment confirmation</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {renewalInfo?.isRenewalVisit && renewalInfo.renewalStatus === "collected" && (
        <div className="flex justify-center">
          <Badge className="bg-green-100 text-green-700 border-green-300 px-4 py-2" data-testid="badge-renewal-collected">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Renewal Collected
          </Badge>
        </div>
      )}

      {renewalInfo?.isRenewalVisit && renewalInfo.renewalStatus === "declined" && (
        <div className="flex justify-center">
          <Badge className="bg-red-100 text-red-700 border-red-300 px-4 py-2" data-testid="badge-renewal-declined">
            <X className="h-4 w-4 mr-2" />
            Renewal Declined
          </Badge>
        </div>
      )}

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

      {/* Maintenance Agreement Info Card */}
      {renewalInfo?.visitInfo && renewalInfo.agreementInfo && (
        <Card className="border-purple-200 bg-purple-50/50" data-testid="card-maintenance-info">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-purple-800">
              <FileCheck className="h-4 w-4" />
              Maintenance Agreement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Agreement</span>
              <span className="font-medium text-sm">{renewalInfo.agreementInfo.agreementNumber}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Visit Progress</span>
              <span className="font-bold text-purple-700">
                Visit {renewalInfo.visitInfo.visitNumber} of {renewalInfo.visitInfo.totalVisitsInCycle}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Billing</span>
              <Badge variant="outline" className="text-xs">
                {renewalInfo.agreementInfo.billingPreference === "pay_on_visit" ? "Pay on Visit" : "Auto Invoice"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Status</span>
              <Badge variant="outline" className={`text-xs ${
                renewalInfo.agreementInfo.status === "active" ? "bg-green-100 text-green-700 border-green-300" :
                renewalInfo.agreementInfo.status === "pending" ? "bg-amber-100 text-amber-700 border-amber-300" :
                "bg-slate-100 text-slate-700 border-slate-300"
              }`}>
                {renewalInfo.agreementInfo.status === "active" ? "Active" : 
                 renewalInfo.agreementInfo.status === "pending" ? "Pending Activation" :
                 renewalInfo.agreementInfo.status || "Unknown"}
              </Badge>
            </div>
            {renewalInfo.agreementInfo.agreementPlan && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Plan</span>
                <span className="text-sm font-medium">{renewalInfo.agreementInfo.agreementPlan}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {workOrder.dispatchNotes && (
        <Card className="border-amber-200 bg-amber-50/50" data-testid="card-dispatch-notes">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4 text-amber-600" />
              Dispatch Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-dispatch-notes">
              {workOrder.dispatchNotes}
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
  lineType: "service" | "discount" | "part" | "maintenance";
  fromCatalog?: boolean;
  isMaintenanceItem?: boolean;
}

// Calculate tiered pricing for maintenance items: $229 for 1st, -$10 each additional
function calculateMaintenanceTotal(quantity: number): number {
  const BASE_PRICE = 229;
  const DISCOUNT_PER_UNIT = 10;
  let total = 0;
  for (let i = 0; i < quantity; i++) {
    const price = Math.max(0, BASE_PRICE - (i * DISCOUNT_PER_UNIT));
    total += price;
  }
  return total;
}

// Calculate line total with tiered pricing for maintenance items
function calculateLineTotal(item: { quantity: number; unitPrice: number; isMaintenanceItem?: boolean }): number {
  if (item.isMaintenanceItem) {
    return calculateMaintenanceTotal(item.quantity);
  }
  return item.quantity * item.unitPrice;
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
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<"all" | "service" | "maintenance">("service");
  const [discountSearch, setDiscountSearch] = useState("");
  const [showManualDiscount, setShowManualDiscount] = useState(false);
  const [discountDescription, setDiscountDescription] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailQuoteId, setEmailQuoteId] = useState<string | null>(null);

  // Fetch users with admin role only for quote assignee selection
  const { data: adminUsers } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users", "admin-only"],
    queryFn: async () => {
      const res = await fetch("/api/crm/users", { credentials: "include" });
      if (!res.ok) return [];
      const users = await res.json();
      // Filter to only admin role (not owner, not sales, not tech)
      return users.filter((u: CrmUser) => u.role === 'admin' && u.isActive);
    },
    staleTime: 0, // Always get fresh data
    refetchOnMount: "always",
  });

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

  // Fetch CRM items (for both catalog and discounts)
  const { data: crmItemsData, isLoading: itemsLoading } = useQuery<CrmItem[]>({
    queryKey: ["/api/crm/items"],
    queryFn: async () => {
      const res = await fetch("/api/crm/items", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const crmItems = crmItemsData || [];
  
  // Filter CRM items for catalog (only service and maintenance for mobile techs)
  const filteredCatalogItems = crmItems
    .filter(item => {
      // Only show service and maintenance categories for mobile techs
      if (item.category !== "service" && item.category !== "maintenance") {
        return false;
      }
      // Apply category filter
      if (catalogCategoryFilter !== "all" && item.category !== catalogCategoryFilter) {
        return false;
      }
      // Apply search filter
      if (catalogSearch.trim()) {
        const search = catalogSearch.toLowerCase();
        return (
          item.name?.toLowerCase().includes(search) ||
          item.description?.toLowerCase().includes(search) ||
          item.partNumber?.toLowerCase().includes(search)
        );
      }
      return true;
    })
    // Sort to put "Service Call" at the top
    .sort((a, b) => {
      const aIsServiceCall = a.name?.toLowerCase().includes("service call") ? 0 : 1;
      const bIsServiceCall = b.name?.toLowerCase().includes("service call") ? 0 : 1;
      if (aIsServiceCall !== bIsServiceCall) return aIsServiceCall - bIsServiceCall;
      return (a.name || "").localeCompare(b.name || "");
    });
  
  // Filter discount items from CRM items (only discount category)
  const filteredDiscountItems = crmItems.filter(item => {
    // Only show items in the discount category
    if (item.category !== "discount") {
      return false;
    }
    // Apply search filter
    if (discountSearch.trim()) {
      const search = discountSearch.toLowerCase();
      return (
        item.name?.toLowerCase().includes(search) ||
        item.description?.toLowerCase().includes(search) ||
        item.partNumber?.toLowerCase().includes(search)
      );
    }
    return true;
  });

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
        assignedToId: selectedAssigneeId || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Quote Created", description: "Your quick quote has been created as a draft." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", { workOrderId: workOrder.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowQuickQuote(false);
      setLineItems([]);
      setQuoteTitle("");
      setSelectedAssigneeId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create quote", variant: "destructive" });
    },
  });

  // Send quote email mutation
  const sendQuoteEmailMutation = useMutation({
    mutationFn: async ({ quoteId, recipientEmail }: { quoteId: string; recipientEmail: string }) => {
      const response = await apiRequest("POST", `/api/crm/quotes/${quoteId}/send-email`, {
        recipientEmail,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to send quote email");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Email Sent", description: "Quote email has been sent successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", { workOrderId: workOrder.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowEmailDialog(false);
      setEmailQuoteId(null);
      setEmailRecipient("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send quote email", variant: "destructive" });
    },
  });

  const openEmailDialog = (quoteId: string) => {
    setEmailQuoteId(quoteId);
    setEmailRecipient(workOrder.customer?.email || "");
    setShowEmailDialog(true);
  };

  const handleSendEmail = () => {
    if (!emailQuoteId || !emailRecipient.trim()) {
      toast({ title: "Error", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    sendQuoteEmailMutation.mutate({ quoteId: emailQuoteId, recipientEmail: emailRecipient.trim() });
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: "", quantity: 1, unitPrice: 0, lineType: "service" }]);
  };

  const addCatalogItem = (item: CrmItem) => {
    let price = parseFloat(item.rate || "0") || 0;
    const isMaintenance = item.category === "maintenance";
    
    // Multi-system tiered pricing ONLY applies to standard "Preventative Maintenance"
    // Custom maintenance items (Crawlspace, etc.) use their catalog price
    const isPreventativeMaintenance = isMaintenance && 
      (item.name?.toLowerCase().includes("preventative") || item.name?.toLowerCase().includes("preventive"));
    
    if (isPreventativeMaintenance) {
      const existingMaintenanceCount = lineItems.filter(li => li.isMaintenanceItem).length;
      // Base price $229, each additional system -$10
      price = 229 - (existingMaintenanceCount * 10);
      if (price < 0) price = 0;
    }
    // For custom maintenance items, use the catalog price (already set above)
    
    // Map category to lineType
    const getLineType = (): QuickQuoteLineItem["lineType"] => {
      if (isMaintenance) return "maintenance";
      if (item.category === "service") return "service";
      return "part";
    };
    
    const discountApplied = isPreventativeMaintenance && price < 229;
    
    setLineItems([...lineItems, { 
      id: Date.now().toString(), 
      description: item.name, 
      quantity: 1, 
      unitPrice: price,
      lineType: getLineType(),
      fromCatalog: true,
      isMaintenanceItem: isPreventativeMaintenance // Only standard PM gets tiered pricing
    }]);
    setShowCatalog(false);
    setCatalogSearch("");
    setCatalogCategoryFilter("all");
    toast({ title: "Item Added", description: item.name + (discountApplied ? ` (Multi-system discount: $${price})` : "") });
  };

  // Add discount from catalogue
  const addCatalogDiscount = (item: CrmItem) => {
    const rate = parseFloat(item.rate || "0") || 0;
    setLineItems([...lineItems, { 
      id: Date.now().toString(), 
      description: item.name + (item.description ? ` - ${item.description}` : ""), 
      quantity: 1, 
      unitPrice: -Math.abs(rate),
      lineType: "discount",
      fromCatalog: true
    }]);
    setShowDiscount(false);
    setDiscountSearch("");
    toast({ title: "Discount Added", description: item.name });
  };

  // Add manual discount entry
  const addManualDiscountItem = () => {
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
      lineType: "discount",
      fromCatalog: false
    }]);
    setShowManualDiscount(false);
    setDiscountDescription("");
    setDiscountAmount("");
    toast({ title: "Discount Added", description: discountDescription.trim() });
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof QuickQuoteLineItem, value: string | number) => {
    setLineItems(lineItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const total = subtotal; // No tax for quick quote

  const handleCreateQuote = () => {
    const validItems = lineItems.filter(item => item.description.trim() && item.unitPrice !== 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one line item.", variant: "destructive" });
      return;
    }
    if (!selectedAssigneeId) {
      toast({ title: "Error", description: "Please select an admin to assign this quote to.", variant: "destructive" });
      return;
    }

    createQuoteMutation.mutate({
      title: quoteTitle,
      lineItems: validItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: calculateLineTotal(item),
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
                      <div className="flex gap-2">
                        {quote.status === "draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] border-blue-200 text-blue-700 hover:bg-blue-50"
                            onClick={() => openEmailDialog(quote.id)}
                            disabled={sendQuoteEmailMutation.isPending}
                            data-testid={`button-send-quote-${quote.id}`}
                          >
                            {sendQuoteEmailMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Mail className="h-4 w-4 mr-1" />
                            )}
                            Send Email
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px]"
                          onClick={() => navigate(`/mobile/quotes/${quote.id}`)}
                          data-testid={`button-view-quote-${quote.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
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

              {/* Assign To Admin Personnel (Required) */}
              <div>
                <Label htmlFor="quote-assignee" className="text-sm font-medium">
                  Assign to Admin Personnel <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={selectedAssigneeId} 
                  onValueChange={setSelectedAssigneeId}
                >
                  <SelectTrigger className="min-h-[44px] mt-1" data-testid="select-quote-assignee">
                    <SelectValue placeholder="Select an admin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {adminUsers?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedAssigneeId && (
                  <p className="text-xs text-slate-500 mt-1">Required: Select an admin to handle this quote</p>
                )}
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
                        className={`border rounded-lg p-3 space-y-2 ${
                          item.lineType === "discount" ? "bg-amber-50 border-amber-200" : 
                          item.lineType === "part" ? "bg-blue-50 border-blue-200" : 
                          item.lineType === "maintenance" ? "bg-green-50 border-green-200" :
                          item.lineType === "service" ? "bg-slate-50 border-slate-200" : ""
                        }`}
                        data-testid={`line-item-${item.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-medium">
                              {item.lineType === "discount" ? (
                                <span className="text-amber-600 flex items-center gap-1"><Tag className="h-3 w-3" />Discount</span>
                              ) : item.lineType === "part" ? (
                                <span className="text-blue-600 flex items-center gap-1"><Package className="h-3 w-3" />Part</span>
                              ) : item.lineType === "maintenance" ? (
                                <span className="text-green-600 flex items-center gap-1"><Wrench className="h-3 w-3" />Maintenance</span>
                              ) : item.lineType === "service" ? (
                                <span className="text-slate-600 flex items-center gap-1"><Wrench className="h-3 w-3" />Service</span>
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
                                  onFocus={(e) => e.target.select()}
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
                                  onFocus={(e) => e.target.select()}
                                  className={`min-h-[44px] ${item.fromCatalog ? "bg-slate-100 cursor-not-allowed" : ""}`}
                                  readOnly={item.fromCatalog}
                                  data-testid={`input-unit-price-${item.id}`}
                                />
                              </div>
                              <div className="w-24 text-right">
                                <Label className="text-xs text-slate-500">Total</Label>
                                <p className="min-h-[44px] flex items-center justify-end font-medium" data-testid={`line-total-${item.id}`}>
                                  {formatCurrency(calculateLineTotal(item))}
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
      <Dialog open={showCatalog} onOpenChange={(open) => { setShowCatalog(open); if (!open) { setCatalogSearch(""); setCatalogCategoryFilter("all"); } }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Items Catalog
            </DialogTitle>
            <DialogDescription>
              Search and select items from the catalog
            </DialogDescription>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search items..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
              data-testid="input-catalog-search"
            />
          </div>

          {/* Category Filter Tabs - Service & Maintenance only for mobile techs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "all", label: "All" },
              { key: "service", label: "Service" },
              { key: "maintenance", label: "Maintenance" },
            ].map((cat) => (
              <Button
                key={cat.key}
                variant={catalogCategoryFilter === cat.key ? "default" : "outline"}
                size="sm"
                onClick={() => setCatalogCategoryFilter(cat.key as typeof catalogCategoryFilter)}
                className="min-h-[36px]"
                data-testid={`filter-catalog-${cat.key}`}
              >
                {cat.label}
              </Button>
            ))}
          </div>
          
          {/* Items List */}
          <div className="flex-1 overflow-y-auto max-h-[250px] space-y-2">
            {itemsLoading ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading items...</p>
            ) : filteredCatalogItems.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {catalogSearch ? "No items found" : "No items in this category"}
              </p>
            ) : (
              filteredCatalogItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="border rounded-lg p-3 hover:bg-blue-50 cursor-pointer min-h-[44px] active:bg-blue-100"
                  onClick={() => addCatalogItem(item)}
                  data-testid={`catalog-item-${item.id || idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-slate-500 truncate">{item.description}</p>
                      )}
                      {item.category && (
                        <span className="text-xs text-blue-600 capitalize">{item.category}</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-green-700 ml-2">
                      {formatCurrency(parseFloat(item.rate || "0") || 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCatalog(false); setCatalogSearch(""); setCatalogCategoryFilter("service"); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Discount Catalogue Dialog */}
      <Dialog open={showDiscount} onOpenChange={(open) => { setShowDiscount(open); if (!open) { setDiscountSearch(""); } }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-600" />
              Select Discount
            </DialogTitle>
            <DialogDescription>
              Choose a discount from the catalogue or add a custom one
            </DialogDescription>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search discounts..."
              value={discountSearch}
              onChange={(e) => setDiscountSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
              data-testid="input-discount-search"
            />
          </div>
          
          {/* Discount Items List */}
          <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2">
            {itemsLoading ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading discounts...</p>
            ) : filteredDiscountItems.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-400 mb-3">
                  {discountSearch ? "No discounts found" : "No discounts in catalogue"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowDiscount(false); setShowManualDiscount(true); }}
                  className="min-h-[44px]"
                  data-testid="button-add-manual-discount"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Custom Discount
                </Button>
              </div>
            ) : (
              filteredDiscountItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="border rounded-lg p-3 hover:bg-amber-50 cursor-pointer min-h-[44px] active:bg-amber-100"
                  onClick={() => addCatalogDiscount(item)}
                  data-testid={`discount-item-${item.id || idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-slate-500 truncate">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-amber-700 ml-2">
                      -{formatCurrency(parseFloat(item.rate || "0") || 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter className="flex gap-2 border-t pt-3">
            <Button 
              variant="outline" 
              onClick={() => { setShowDiscount(false); setShowManualDiscount(true); }}
              className="min-h-[44px]"
              data-testid="button-custom-discount"
            >
              <Plus className="h-4 w-4 mr-1" />
              Custom
            </Button>
            <Button 
              variant="outline" 
              onClick={() => { setShowDiscount(false); setDiscountSearch(""); }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Discount Entry Dialog */}
      <Dialog open={showManualDiscount} onOpenChange={setShowManualDiscount}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-600" />
              Custom Discount
            </DialogTitle>
            <DialogDescription>
              Enter a custom discount amount
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
                data-testid="input-manual-discount-description"
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
                data-testid="input-manual-discount-amount"
              />
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowManualDiscount(false); setDiscountDescription(""); setDiscountAmount(""); }}>
              Cancel
            </Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 min-h-[44px]"
              onClick={addManualDiscountItem}
              data-testid="button-confirm-manual-discount"
            >
              Add Discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Quote Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={(open) => { if (!open) { setShowEmailDialog(false); setEmailQuoteId(null); setEmailRecipient(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Quote Email</DialogTitle>
            <DialogDescription>
              Enter the email address where you want to send this quote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email-recipient" className="text-sm font-medium">
                Recipient Email
              </Label>
              <Input
                id="email-recipient"
                type="email"
                placeholder="customer@example.com"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-quote-email-recipient"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setShowEmailDialog(false); setEmailQuoteId(null); setEmailRecipient(""); }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
              onClick={handleSendEmail}
              disabled={sendQuoteEmailMutation.isPending || !emailRecipient.trim()}
              data-testid="button-confirm-send-quote-email"
            >
              {sendQuoteEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
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
  lineType: "service" | "discount" | "part" | "maintenance";
  fromCatalog?: boolean;
  isMaintenanceItem?: boolean;
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

function InvoiceTab({ 
  workOrder, 
  renewalInfo, 
  onCollectRenewal, 
  onDeclineRenewal 
}: { 
  workOrder: WorkOrderDetail; 
  renewalInfo?: RenewalInfo | null;
  onCollectRenewal?: () => void;
  onDeclineRenewal?: () => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<"all" | "service" | "maintenance">("service");
  const [discountSearch, setDiscountSearch] = useState("");
  const [showManualDiscount, setShowManualDiscount] = useState(false);
  const [discountDescription, setDiscountDescription] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [showQuoteSelection, setShowQuoteSelection] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "check" | "card">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [showInvoiceEmailDialog, setShowInvoiceEmailDialog] = useState(false);
  const [invoiceEmailRecipient, setInvoiceEmailRecipient] = useState("");
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);
  
  // Agreement creation dialog state
  const [showAgreementDialog, setShowAgreementDialog] = useState(false);
  const [agreementNumberOfSystems, setAgreementNumberOfSystems] = useState(1);
  const [agreementContractDate, setAgreementContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [agreementStartDate, setAgreementStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [agreementBillingPreference, setAgreementBillingPreference] = useState<"pay_on_visit" | "auto_invoice">("auto_invoice");
  const [agreementAutoRenew, setAgreementAutoRenew] = useState(true);
  const [agreementNotes, setAgreementNotes] = useState("");
  const [agreementPayingNow, setAgreementPayingNow] = useState(false);
  const [pendingCatalogItem, setPendingCatalogItem] = useState<CrmItem | null>(null);

  // Calculate maintenance price based on number of systems
  const calculateMaintenancePrice = (numSystems: number): number => {
    let total = 0;
    for (let i = 0; i < numSystems; i++) {
      total += 229 - (10 * i);
    }
    return total;
  };

  const agreementPrice = calculateMaintenancePrice(agreementNumberOfSystems);

  const { data: invoicesData, isLoading: invoicesLoading, error: invoicesError } = useQuery<{ invoices: CrmInvoice[] }>({
    queryKey: ["/api/crm/invoices", { workOrderId: workOrder.id }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices?workOrderId=${workOrder.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  const invoices = invoicesData?.invoices || [];

  // Fetch details for expanded invoice
  const { data: expandedInvoiceData } = useQuery<InvoiceWithLineItems>({
    queryKey: ["/api/crm/invoices", expandedInvoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${expandedInvoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice details");
      return res.json();
    },
    enabled: !!expandedInvoiceId,
  });

  // Fetch quotes for this work order to enable "Create from Quote" feature  
  const { data: quotesData } = useQuery<{ quotes: (CrmQuote & { lineItems?: CrmQuoteLineItem[] })[] }>({
    queryKey: ["/api/crm/quotes", { workOrderId: workOrder.id }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes?workOrderId=${workOrder.id}`, { credentials: "include" });
      if (!res.ok) return { quotes: [] };
      return res.json();
    },
  });

  const quotes = quotesData?.quotes || [];
  const acceptedQuotes = quotes.filter(q => q.status === "accepted");
  
  // Fetch ALL quotes for this customer (to allow creating invoice from any customer quote)
  const { data: customerQuotesData, isLoading: customerQuotesLoading } = useQuery<{ quotes: (CrmQuote & { lineItems?: CrmQuoteLineItem[] })[] }>({
    queryKey: ["/api/crm/quotes", "customer", workOrder.customerId],
    queryFn: async () => {
      if (!workOrder.customerId) return { quotes: [] };
      const res = await fetch(`/api/crm/quotes?customerId=${workOrder.customerId}`, { credentials: "include" });
      if (!res.ok) return { quotes: [] };
      return res.json();
    },
    enabled: !!workOrder.customerId,
  });

  const customerQuotes = customerQuotesData?.quotes || [];
  // Get accepted customer quotes that are NOT attached to this work order (deduplicate by ID)
  const workOrderQuoteIds = new Set(acceptedQuotes.map(q => q.id));
  const otherCustomerAcceptedQuotes = customerQuotes.filter(
    q => q.status === "accepted" && !workOrderQuoteIds.has(q.id)
  );
  
  // Combined: all accepted quotes available for invoice creation (already deduplicated)
  const allAvailableQuotes = [...acceptedQuotes, ...otherCustomerAcceptedQuotes];

  // Fetch CRM items (for both catalog and discounts)
  const { data: crmItemsData, isLoading: itemsLoading } = useQuery<CrmItem[]>({
    queryKey: ["/api/crm/items"],
    queryFn: async () => {
      const res = await fetch("/api/crm/items", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const crmItems = crmItemsData || [];
  
  // Filter CRM items for catalog (only service and maintenance for mobile techs)
  const filteredCatalogItems = crmItems
    .filter(item => {
      // Only show service and maintenance categories for mobile techs
      if (item.category !== "service" && item.category !== "maintenance") {
        return false;
      }
      // Apply category filter
      if (catalogCategoryFilter !== "all" && item.category !== catalogCategoryFilter) {
        return false;
      }
      // Apply search filter
      if (catalogSearch.trim()) {
        const search = catalogSearch.toLowerCase();
        return (
          item.name?.toLowerCase().includes(search) ||
          item.description?.toLowerCase().includes(search) ||
          item.partNumber?.toLowerCase().includes(search)
        );
      }
      return true;
    })
    // Sort to put "Service Call" at the top
    .sort((a, b) => {
      const aIsServiceCall = a.name?.toLowerCase().includes("service call") ? 0 : 1;
      const bIsServiceCall = b.name?.toLowerCase().includes("service call") ? 0 : 1;
      if (aIsServiceCall !== bIsServiceCall) return aIsServiceCall - bIsServiceCall;
      return (a.name || "").localeCompare(b.name || "");
    });
  
  // Filter discount items from CRM items (only discount category)
  const filteredDiscountItems = crmItems.filter(item => {
    // Only show items in the discount category
    if (item.category !== "discount") {
      return false;
    }
    // Apply search filter
    if (discountSearch.trim()) {
      const search = discountSearch.toLowerCase();
      return (
        item.name?.toLowerCase().includes(search) ||
        item.description?.toLowerCase().includes(search) ||
        item.partNumber?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: {
      lineItems: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number; lineType: string }>;
      subtotal: number;
      total: number;
    }) => {
      const formattedLineItems = data.lineItems.map((item, index) => ({
        description: item.description,
        quantity: item.quantity.toFixed(2),
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        lineType: item.lineType,
        isDiscountLine: item.lineType === "discount",
        discountKind: item.lineType === "discount" ? "fixed" : undefined,
        sortOrder: index,
      }));

      const customerName = workOrder.customer?.name || "Unknown Customer";
      const customerEmail = workOrder.customer?.email || "";
      const customerPhone = workOrder.customer?.phone || "";
      const serviceAddress = workOrder.property 
        ? [workOrder.property.address1, workOrder.property.city, workOrder.property.state, workOrder.property.zip].filter(Boolean).join(", ")
        : "";

      const response = await apiRequest("POST", "/api/crm/invoices", {
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        propertyId: workOrder.propertyId,
        customerName,
        customerEmail,
        customerPhone,
        serviceAddress,
        lineItems: formattedLineItems,
        subtotal: data.subtotal.toFixed(2),
        laborTotal: "0.00",
        taxTotal: "0.00",
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      // Also invalidate customer quotes in case quote status changes
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", "customer", workOrder.customerId] });
      setShowCreateForm(false);
      setLineItems([]);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create invoice", variant: "destructive" });
    },
  });

  // Send invoice email mutation
  const sendInvoiceEmailMutation = useMutation({
    mutationFn: async ({ invoiceId, recipientEmail }: { invoiceId: string; recipientEmail: string }) => {
      const response = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/send-email`, {
        recipientEmail,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to send invoice email");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Email Sent", description: "Invoice email has been sent successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", { workOrderId: workOrder.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      if (emailInvoiceId) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", emailInvoiceId] });
      }
      setShowInvoiceEmailDialog(false);
      setEmailInvoiceId(null);
      setInvoiceEmailRecipient("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send invoice email", variant: "destructive" });
    },
  });

  const openInvoiceEmailDialog = (invoiceId: string) => {
    setEmailInvoiceId(invoiceId);
    setInvoiceEmailRecipient(workOrder.customer?.email || "");
    setShowInvoiceEmailDialog(true);
  };

  const handleSendInvoiceEmail = () => {
    if (!emailInvoiceId || !invoiceEmailRecipient.trim()) {
      toast({ title: "Error", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    sendInvoiceEmailMutation.mutate({ invoiceId: emailInvoiceId, recipientEmail: invoiceEmailRecipient.trim() });
  };

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: async (data: { invoiceId: string; amountPaid: number; paymentMethod: string; paymentReference?: string }) => {
      const response = await apiRequest("POST", `/api/crm/invoices/${data.invoiceId}/pay`, {
        amountPaid: data.amountPaid,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Payment Recorded", description: "Payment has been recorded successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", { workOrderId: workOrder.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      if (paymentInvoiceId) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", paymentInvoiceId] });
      }
      setShowPaymentDialog(false);
      setPaymentInvoiceId(null);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentReference("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to record payment", variant: "destructive" });
    },
  });

  // Create agreement mutation
  const createAgreementMutation = useMutation({
    mutationFn: async (data: {
      numberOfSystems: number;
      contractDate: string;
      startDate: string;
      billingPreference: "pay_on_visit" | "auto_invoice";
      autoRenew: boolean;
      notes: string;
      payingNow: boolean;
    }) => {
      const response = await apiRequest("POST", `/api/mobile/work-orders/${workOrder.id}/create-agreement`, data);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to create agreement");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.payingNow) {
        toast({ title: "Agreement Created", description: "Maintenance agreement has been created and payment recorded." });
      } else {
        toast({ title: "Agreement Created", description: "Maintenance agreement has been created. Line item added to invoice." });
        // Add the maintenance line item to the current invoice form
        if (data.lineItemData) {
          setLineItems([...lineItems, {
            id: Date.now().toString(),
            description: data.lineItemData.description,
            quantity: 1,
            unitPrice: parseFloat(data.lineItemData.unitPrice),
            lineType: "maintenance",
            fromCatalog: true,
            isMaintenanceItem: true
          }]);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", { workOrderId: workOrder.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowAgreementDialog(false);
      setPendingCatalogItem(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create agreement", variant: "destructive" });
    },
  });

  const handleCreateAgreement = () => {
    createAgreementMutation.mutate({
      numberOfSystems: agreementNumberOfSystems,
      contractDate: agreementContractDate,
      startDate: agreementStartDate,
      billingPreference: agreementBillingPreference,
      autoRenew: agreementAutoRenew,
      notes: agreementNotes,
      payingNow: agreementPayingNow,
    });
  };

  const openPaymentDialog = (invoice: CrmInvoice) => {
    setPaymentInvoiceId(invoice.id);
    const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");
    setPaymentAmount(balanceDue.toFixed(2));
    setPaymentMethod("cash");
    setPaymentReference("");
    setShowPaymentDialog(true);
  };

  const handleRecordPayment = () => {
    if (!paymentInvoiceId) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid payment amount.", variant: "destructive" });
      return;
    }
    recordPaymentMutation.mutate({
      invoiceId: paymentInvoiceId,
      amountPaid: amount,
      paymentMethod: paymentMethod,
      paymentReference: paymentReference || undefined,
    });
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: "", quantity: 1, unitPrice: 0, lineType: "service" }]);
  };

  const addCatalogItem = (item: CrmItem) => {
    let price = parseFloat(item.rate || "0") || 0;
    const isMaintenance = item.category === "maintenance";
    
    // Multi-system tiered pricing ONLY applies to standard "Preventative Maintenance"
    // Custom maintenance items (Crawlspace, etc.) use their catalog price
    const isPreventativeMaintenance = isMaintenance && 
      (item.name?.toLowerCase().includes("preventative") || item.name?.toLowerCase().includes("preventive"));
    
    // If Preventative Maintenance is selected, open agreement creation dialog
    if (isPreventativeMaintenance) {
      setPendingCatalogItem(item);
      setAgreementNumberOfSystems(1);
      setAgreementContractDate(format(new Date(), "yyyy-MM-dd"));
      setAgreementStartDate(format(new Date(), "yyyy-MM-dd"));
      setAgreementBillingPreference("auto_invoice");
      setAgreementAutoRenew(true);
      setAgreementNotes("");
      setAgreementPayingNow(false);
      setShowCatalog(false);
      setCatalogSearch("");
      setShowAgreementDialog(true);
      return;
    }
    
    if (isMaintenance) {
      // Use catalog price for non-PM maintenance items
      price = parseFloat(item.rate || "0") || 0;
    }
    
    // Map category to lineType
    const getLineType = (): InvoiceLineItem["lineType"] => {
      if (isMaintenance) return "maintenance";
      if (item.category === "service") return "service";
      return "part";
    };
    
    setLineItems([...lineItems, { 
      id: Date.now().toString(), 
      description: item.name, 
      quantity: 1, 
      unitPrice: price,
      lineType: getLineType(),
      fromCatalog: true,
      isMaintenanceItem: false
    }]);
    setShowCatalog(false);
    setCatalogSearch("");
    setCatalogCategoryFilter("all");
    toast({ title: "Item Added", description: item.name });
  };

  // Add discount from catalogue
  const addCatalogDiscount = (item: CrmItem) => {
    const rate = parseFloat(item.rate || "0") || 0;
    setLineItems([...lineItems, { 
      id: Date.now().toString(), 
      description: item.name + (item.description ? ` - ${item.description}` : ""), 
      quantity: 1, 
      unitPrice: -Math.abs(rate),
      lineType: "discount",
      fromCatalog: true
    }]);
    setShowDiscount(false);
    setDiscountSearch("");
    toast({ title: "Discount Added", description: item.name });
  };

  // Create invoice from quote - fetch full quote details and populate line items
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  
  const createFromQuote = async (quote: CrmQuote & { lineItems?: CrmQuoteLineItem[] }) => {
    setIsLoadingQuote(true);
    try {
      // Fetch full quote details including line items
      const res = await fetch(`/api/crm/quotes/${quote.id}`, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch quote details");
      }
      const fullQuote = await res.json();
      
      if (!fullQuote.lineItems || fullQuote.lineItems.length === 0) {
        toast({ title: "No Line Items", description: "This quote has no line items to convert.", variant: "destructive" });
        return;
      }
      
      const convertedItems: InvoiceLineItem[] = fullQuote.lineItems.map((item: CrmQuoteLineItem) => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        description: item.description,
        quantity: parseFloat(item.quantity || "1"),
        unitPrice: parseFloat(item.unitPrice || "0"),
        lineType: (item.lineType === "discount" ? "discount" : item.lineType === "part" ? "part" : "service") as "service" | "discount" | "part",
      }));
      
      setLineItems(convertedItems);
      setShowQuoteSelection(false);
      setShowCreateForm(true);
      toast({ title: "Quote Imported", description: `${convertedItems.length} line items imported from quote.` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to load quote details. Please try again.", variant: "destructive" });
    } finally {
      setIsLoadingQuote(false);
    }
  };

  // Add manual discount entry
  const addManualDiscountItem = () => {
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
    setShowManualDiscount(false);
    setDiscountDescription("");
    setDiscountAmount("");
    toast({ title: "Discount Added", description: discountDescription.trim() });
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof InvoiceLineItem, value: string | number | boolean) => {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Calculate subtotal (all items including discounts) with tiered maintenance pricing
  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const total = subtotal;

  const handleCreateInvoice = () => {
    // Allow $0 items if they have a description (free services), but filter items with no description
    const validItems = lineItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one line item with a description.", variant: "destructive" });
      return;
    }
    // Check if all items have $0 or negative totals (would create useless invoice)
    const hasPositiveTotal = validItems.some(item => calculateLineTotal(item) > 0);
    if (!hasPositiveTotal) {
      toast({ title: "Error", description: "Invoice must have at least one item with a positive amount.", variant: "destructive" });
      return;
    }

    createInvoiceMutation.mutate({
      lineItems: validItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: calculateLineTotal(item),
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
      {/* Pay-on-Visit Agreement Collect Payment Card */}
      {renewalInfo?.isRenewalVisit && renewalInfo.renewalStatus === "pending" && renewalInfo.agreementInfo && (
        <Card className={renewalInfo.paymentType === "initial" ? "border-green-400 bg-green-50" : "border-amber-400 bg-amber-50"} data-testid="invoice-tab-renewal-banner">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full ${renewalInfo.paymentType === "initial" ? "bg-green-100" : "bg-amber-100"}`}>
                {renewalInfo.paymentType === "initial" ? (
                  <DollarSign className="h-5 w-5 text-green-600" />
                ) : (
                  <RefreshCw className="h-5 w-5 text-amber-600" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 ${renewalInfo.paymentType === "initial" ? "text-green-800" : "text-amber-800"}`}>
                  {renewalInfo.paymentType === "initial" ? "First Visit - Collect Payment" : "Renewal Due"}
                </h3>
                <p className={`text-sm mb-2 ${renewalInfo.paymentType === "initial" ? "text-green-700" : "text-amber-700"}`}>
                  {renewalInfo.paymentType === "initial" 
                    ? `Collect first year payment to activate agreement (${renewalInfo.agreementInfo.agreementNumber})`
                    : `Collect renewal payment for agreement (${renewalInfo.agreementInfo.agreementNumber})`}
                </p>
                <p className={`text-lg font-bold mb-3 ${renewalInfo.paymentType === "initial" ? "text-green-700" : "text-amber-700"}`}>
                  ${parseFloat(String(renewalInfo.agreementInfo.price || 0)).toFixed(2)}
                </p>
                <Button
                  className="w-full min-h-[44px] bg-green-600 hover:bg-green-700"
                  onClick={onCollectRenewal}
                  data-testid="button-invoice-tab-collect-payment"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Collect Payment
                </Button>
                {renewalInfo.paymentType !== "initial" && onDeclineRenewal && (
                  <Button
                    variant="outline"
                    className="w-full mt-2 min-h-[44px] border-red-300 text-red-600 hover:bg-red-50"
                    onClick={onDeclineRenewal}
                    data-testid="button-invoice-tab-decline-renewal"
                  >
                    Customer Declined
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice Already Created Banner */}
      {renewalInfo?.isRenewalVisit && renewalInfo.renewalStatus === "pending_payment" && (
        <Card className="border-blue-400 bg-blue-50" data-testid="invoice-tab-pending-payment-banner">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-800">Invoice Created</h3>
                <p className="text-sm text-blue-700">A renewal invoice has been generated and is awaiting payment.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Invoices List */}
      <Card data-testid="existing-invoices-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Invoices ({invoices.length})</span>
          </CardTitle>
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
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-400 italic" data-testid="no-invoices-message">
              No invoices linked to this work order yet.
            </p>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const statusInfo = invoiceStatusConfig[invoice.status] || invoiceStatusConfig.draft;
                const isExpanded = expandedInvoiceId === invoice.id;
                const invoiceDetail = isExpanded && expandedInvoiceData ? expandedInvoiceData : invoice;
                const isPaid = invoiceDetail.status === "paid";
                const isPartial = invoiceDetail.status === "partial";
                
                return (
                  <div
                    key={invoice.id}
                    className="border rounded-lg overflow-hidden"
                    data-testid={`invoice-card-${invoice.id}`}
                  >
                    {/* Invoice Header - Click to expand/collapse */}
                    <div
                      className="p-3 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedInvoiceId(isExpanded ? null : invoice.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          <Receipt className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-sm">{invoice.invoiceNumber}</span>
                        </div>
                        <Badge variant="outline" className={statusInfo.className}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center pl-8">
                        <span className="text-xs text-slate-500">
                          {invoice.createdAt ? format(new Date(invoice.createdAt), "MMM d, yyyy") : ""}
                        </span>
                        <span className="font-semibold text-green-700">
                          {formatCurrency(invoice.total || "0")}
                        </span>
                      </div>
                    </div>
                    
                    {/* Expanded Invoice Details */}
                    {isExpanded && (
                      <div className="border-t bg-slate-50 p-3 space-y-3">
                        {/* Financial Summary */}
                        <div className="bg-white rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600">Subtotal</span>
                            <span className="font-medium">{formatCurrency(invoiceDetail.subtotal || "0")}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Total</span>
                            <span className="font-bold text-green-700">{formatCurrency(invoiceDetail.total || "0")}</span>
                          </div>
                        </div>

                        {/* Payment Status */}
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
                                <span className="font-medium text-green-700">{formatCurrency(invoiceDetail.amountPaid || "0")}</span>
                              </div>
                              {!isPaid && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600">Balance Due</span>
                                  <span className="font-medium text-red-600">{formatCurrency(invoiceDetail.balanceDue || "0")}</span>
                                </div>
                              )}
                              {invoiceDetail.paidAt && (
                                <p className="text-xs text-slate-500 mt-1">
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
                              <span className="font-semibold text-amber-800">
                                {formatCurrency(invoiceDetail.balanceDue || invoiceDetail.total || "0")}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Line Items */}
                        {expandedInvoiceData?.lineItems && expandedInvoiceData.lineItems.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">Line Items</p>
                            <div className="space-y-2">
                              {expandedInvoiceData.lineItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="bg-white border rounded-lg p-2"
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

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2">
                          {invoice.status === "draft" && (
                            <Button
                              className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700"
                              onClick={() => openInvoiceEmailDialog(invoice.id)}
                              disabled={sendInvoiceEmailMutation.isPending}
                              data-testid={`button-send-invoice-${invoice.id}`}
                            >
                              {sendInvoiceEmailMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Mail className="h-4 w-4 mr-2" />
                              )}
                              Send Email
                            </Button>
                          )}
                          {(invoice.status === "sent" || invoice.status === "partial") && (
                            <Button
                              className="w-full min-h-[44px] bg-green-600 hover:bg-green-700"
                              onClick={() => openPaymentDialog(invoice)}
                              data-testid={`button-record-payment-${invoice.id}`}
                            >
                              <CreditCard className="h-4 w-4 mr-2" />
                              Record Payment
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            className="w-full min-h-[44px]"
                            onClick={() => navigate(`/mobile/invoices/${invoice.id}`)}
                            data-testid="button-view-invoice-detail"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Full Invoice
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create New Invoice */}
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
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full min-h-[48px] bg-[#711419] hover:bg-[#5a1014]"
                  onClick={() => setShowCreateForm(true)}
                  data-testid="button-show-create-invoice-form"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invoice
                </Button>
                {allAvailableQuotes.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full min-h-[48px] border-green-200 text-green-700 hover:bg-green-50"
                    onClick={() => setShowQuoteSelection(true)}
                    data-testid="button-create-invoice-from-quote"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Create from Quote ({allAvailableQuotes.length})
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
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
                    data-testid="button-invoice-add-from-catalog"
                  >
                    <Package className="h-4 w-4 mr-1" />
                    Catalog
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1 min-w-[100px] border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => setShowDiscount(true)}
                    data-testid="button-invoice-add-discount"
                  >
                    <Tag className="h-4 w-4 mr-1" />
                    Discount
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1 min-w-[100px]"
                    onClick={addLineItem}
                    data-testid="button-invoice-add-line-item"
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
                        className={`border rounded-lg p-3 space-y-2 ${
                          item.lineType === "discount" ? "bg-amber-50 border-amber-200" : 
                          item.lineType === "part" ? "bg-blue-50 border-blue-200" : 
                          item.lineType === "maintenance" ? "bg-green-50 border-green-200" :
                          item.lineType === "service" ? "bg-slate-50 border-slate-200" : ""
                        }`}
                        data-testid={`invoice-line-item-${item.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-medium">
                              {item.lineType === "discount" ? (
                                <span className="text-amber-600 flex items-center gap-1"><Tag className="h-3 w-3" />Discount</span>
                              ) : item.lineType === "part" ? (
                                <span className="text-blue-600 flex items-center gap-1"><Package className="h-3 w-3" />Part</span>
                              ) : item.lineType === "maintenance" ? (
                                <span className="text-green-600 flex items-center gap-1"><Wrench className="h-3 w-3" />Maintenance</span>
                              ) : item.lineType === "service" ? (
                                <span className="text-slate-600 flex items-center gap-1"><Wrench className="h-3 w-3" />Service</span>
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
                            data-testid={`button-remove-invoice-line-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {item.lineType === "discount" ? (
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{item.description}</span>
                            <span className="font-medium text-red-600" data-testid={`invoice-line-total-${item.id}`}>
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
                              data-testid={`input-invoice-description-${item.id}`}
                            />
                            <div className="flex gap-2">
                              <div className="w-20">
                                <Label className="text-xs text-slate-500">Qty</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                                  onFocus={(e) => e.target.select()}
                                  className="min-h-[44px]"
                                  data-testid={`input-invoice-quantity-${item.id}`}
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
                                  onFocus={(e) => e.target.select()}
                                  className={`min-h-[44px] ${item.fromCatalog ? "bg-slate-100 cursor-not-allowed" : ""}`}
                                  readOnly={item.fromCatalog}
                                  data-testid={`input-invoice-unit-price-${item.id}`}
                                />
                              </div>
                              <div className="w-24 text-right">
                                <Label className="text-xs text-slate-500">Total</Label>
                                <p className="min-h-[44px] flex items-center justify-end font-medium" data-testid={`invoice-line-total-${item.id}`}>
                                  {formatCurrency(calculateLineTotal(item))}
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
              <div className="bg-slate-100 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Subtotal</span>
                  <span className="text-sm font-medium" data-testid="invoice-form-subtotal">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold">Total</span>
                  <span className={`text-lg font-bold ${total >= 0 ? "text-green-700" : "text-red-600"}`} data-testid="invoice-form-total">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 min-h-[48px]"
                  onClick={() => {
                    setShowCreateForm(false);
                    setLineItems([]);
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

      {/* Items Catalog Dialog */}
      <Dialog open={showCatalog} onOpenChange={(open) => { setShowCatalog(open); if (!open) { setCatalogSearch(""); setCatalogCategoryFilter("all"); } }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Items Catalog
            </DialogTitle>
            <DialogDescription>
              Search and select items from the catalog
            </DialogDescription>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search items..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
              data-testid="input-invoice-catalog-search"
            />
          </div>

          {/* Category Filter Tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "all", label: "All" },
              { key: "install", label: "Install" },
              { key: "service", label: "Service" },
              { key: "maintenance", label: "Maintenance" },
            ].map((cat) => (
              <Button
                key={cat.key}
                variant={catalogCategoryFilter === cat.key ? "default" : "outline"}
                size="sm"
                onClick={() => setCatalogCategoryFilter(cat.key as typeof catalogCategoryFilter)}
                className="min-h-[36px]"
                data-testid={`filter-invoice-catalog-${cat.key}`}
              >
                {cat.label}
              </Button>
            ))}
          </div>
          
          {/* Items List */}
          <div className="flex-1 overflow-y-auto max-h-[250px] space-y-2">
            {itemsLoading ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading items...</p>
            ) : filteredCatalogItems.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {catalogSearch ? "No items found" : "No items in this category"}
              </p>
            ) : (
              filteredCatalogItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="border rounded-lg p-3 hover:bg-blue-50 cursor-pointer min-h-[44px] active:bg-blue-100"
                  onClick={() => addCatalogItem(item)}
                  data-testid={`invoice-catalog-item-${item.id || idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-slate-500 truncate">{item.description}</p>
                      )}
                      {item.category && (
                        <span className="text-xs text-blue-600 capitalize">{item.category}</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-green-700 ml-2">
                      {formatCurrency(parseFloat(item.rate || "0") || 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCatalog(false); setCatalogSearch(""); setCatalogCategoryFilter("service"); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Discount Catalogue Dialog */}
      <Dialog open={showDiscount} onOpenChange={(open) => { setShowDiscount(open); if (!open) { setDiscountSearch(""); } }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-600" />
              Select Discount
            </DialogTitle>
            <DialogDescription>
              Choose a discount from the catalogue or add a custom one
            </DialogDescription>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search discounts..."
              value={discountSearch}
              onChange={(e) => setDiscountSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
              data-testid="input-invoice-discount-search"
            />
          </div>
          
          {/* Discount Items List */}
          <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2">
            {itemsLoading ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading discounts...</p>
            ) : filteredDiscountItems.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-400 mb-3">
                  {discountSearch ? "No discounts found" : "No discounts in catalogue"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowDiscount(false); setShowManualDiscount(true); }}
                  className="min-h-[44px]"
                  data-testid="button-invoice-add-manual-discount"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Custom Discount
                </Button>
              </div>
            ) : (
              filteredDiscountItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="border rounded-lg p-3 hover:bg-amber-50 cursor-pointer min-h-[44px] active:bg-amber-100"
                  onClick={() => addCatalogDiscount(item)}
                  data-testid={`invoice-discount-item-${item.id || idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-slate-500 truncate">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-amber-700 ml-2">
                      -{formatCurrency(parseFloat(item.rate || "0") || 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter className="flex gap-2 border-t pt-3">
            <Button 
              variant="outline" 
              onClick={() => { setShowDiscount(false); setShowManualDiscount(true); }}
              className="min-h-[44px]"
              data-testid="button-invoice-custom-discount"
            >
              <Plus className="h-4 w-4 mr-1" />
              Custom
            </Button>
            <Button 
              variant="outline" 
              onClick={() => { setShowDiscount(false); setDiscountSearch(""); }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Discount Entry Dialog */}
      <Dialog open={showManualDiscount} onOpenChange={setShowManualDiscount}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-600" />
              Custom Discount
            </DialogTitle>
            <DialogDescription>
              Enter a custom discount amount
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
                data-testid="input-invoice-manual-discount-description"
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
                data-testid="input-invoice-manual-discount-amount"
              />
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowManualDiscount(false); setDiscountDescription(""); setDiscountAmount(""); }}>
              Cancel
            </Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 min-h-[44px]"
              onClick={addManualDiscountItem}
              data-testid="button-confirm-invoice-manual-discount"
            >
              Add Discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote Selection Dialog for Create Invoice from Quote */}
      <Dialog open={showQuoteSelection} onOpenChange={setShowQuoteSelection}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              Select Quote
            </DialogTitle>
            <DialogDescription>
              Choose an accepted quote to create an invoice from
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto max-h-[400px] space-y-4">
            {(isLoadingQuote || customerQuotesLoading) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                <span className="ml-2 text-sm text-slate-600">Loading quotes...</span>
              </div>
            ) : allAvailableQuotes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                No accepted quotes available.
              </p>
            ) : (
              <>
                {/* Work Order Quotes Section */}
                {acceptedQuotes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      This Work Order
                    </p>
                    <div className="space-y-2">
                      {acceptedQuotes.map((quote) => (
                        <div
                          key={quote.id}
                          className="border rounded-lg p-3 hover:bg-green-50 cursor-pointer transition-colors"
                          onClick={() => createFromQuote(quote)}
                          data-testid={`quote-selection-${quote.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{quote.quoteNumber}</p>
                              <p className="text-xs text-slate-500">
                                Accepted: {quote.acceptedAt ? format(new Date(quote.acceptedAt), "MMM d, yyyy") : "Unknown"}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-green-700 ml-2">
                              {formatCurrency(parseFloat(quote.total || "0"))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Other Customer Quotes Section */}
                {otherCustomerAcceptedQuotes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Other Customer Quotes
                    </p>
                    <div className="space-y-2">
                      {otherCustomerAcceptedQuotes.map((quote) => (
                        <div
                          key={quote.id}
                          className="border border-blue-200 rounded-lg p-3 hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => createFromQuote(quote)}
                          data-testid={`quote-selection-customer-${quote.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{quote.quoteNumber}</p>
                              <p className="text-xs text-slate-500">
                                Accepted: {quote.acceptedAt ? format(new Date(quote.acceptedAt), "MMM d, yyyy") : "Unknown"}
                              </p>
                              {quote.title && (
                                <p className="text-xs text-blue-600 truncate">{quote.title}</p>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-blue-700 ml-2">
                              {formatCurrency(parseFloat(quote.total || "0"))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuoteSelection(false)} className="min-h-[44px]">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => {
        if (!open) {
          setShowPaymentDialog(false);
          setPaymentInvoiceId(null);
          setPaymentAmount("");
          setPaymentMethod("cash");
          setPaymentReference("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              Record Payment
            </DialogTitle>
            <DialogDescription>
              Enter payment details for this invoice
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Amount ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-payment-amount"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(val: "cash" | "check" | "card") => setPaymentMethod(val)}>
                <SelectTrigger className="min-h-[44px] mt-1" data-testid="select-payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Reference (optional)</Label>
              <Input
                placeholder="e.g., Check #1234"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-payment-reference"
              />
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPaymentDialog(false);
                setPaymentInvoiceId(null);
                setPaymentAmount("");
                setPaymentMethod("cash");
                setPaymentReference("");
              }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 min-h-[44px]"
              onClick={handleRecordPayment}
              disabled={recordPaymentMutation.isPending}
              data-testid="button-confirm-payment"
            >
              {recordPaymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Invoice Email Dialog */}
      <Dialog open={showInvoiceEmailDialog} onOpenChange={(open) => { if (!open) { setShowInvoiceEmailDialog(false); setEmailInvoiceId(null); setInvoiceEmailRecipient(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Invoice Email</DialogTitle>
            <DialogDescription>
              Enter the email address where you want to send this invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="invoice-email-recipient" className="text-sm font-medium">
                Recipient Email
              </Label>
              <Input
                id="invoice-email-recipient"
                type="email"
                placeholder="customer@example.com"
                value={invoiceEmailRecipient}
                onChange={(e) => setInvoiceEmailRecipient(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-invoice-email-recipient"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setShowInvoiceEmailDialog(false); setEmailInvoiceId(null); setInvoiceEmailRecipient(""); }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
              onClick={handleSendInvoiceEmail}
              disabled={sendInvoiceEmailMutation.isPending || !invoiceEmailRecipient.trim()}
              data-testid="button-confirm-send-invoice-email"
            >
              {sendInvoiceEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Agreement Dialog */}
      <Dialog open={showAgreementDialog} onOpenChange={(open) => { 
        if (!open) { 
          setShowAgreementDialog(false); 
          setPendingCatalogItem(null);
        } 
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-[#711419]" />
              Create Maintenance Agreement
            </DialogTitle>
            <DialogDescription>
              Set up a preventative maintenance agreement for this customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Customer Info (Auto-filled) */}
            <div className="bg-slate-50 rounded-lg p-3 border">
              <p className="text-xs text-slate-500 mb-1">Customer</p>
              <p className="font-medium text-sm">{workOrder.customer?.name || "Unknown Customer"}</p>
              {workOrder.property && (
                <>
                  <p className="text-xs text-slate-500 mt-2 mb-1">Property</p>
                  <p className="text-sm text-slate-700">
                    {[workOrder.property.address1, workOrder.property.city, workOrder.property.state, workOrder.property.zip].filter(Boolean).join(", ")}
                  </p>
                </>
              )}
            </div>

            {/* Number of Systems */}
            <div>
              <Label className="text-sm font-medium">Number of Systems</Label>
              <div className="flex items-center gap-2 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setAgreementNumberOfSystems(prev => Math.max(1, prev - 1))}
                  disabled={agreementNumberOfSystems <= 1}
                  data-testid="button-decrease-agreement-systems"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min="1"
                  value={agreementNumberOfSystems}
                  onChange={(e) => setAgreementNumberOfSystems(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center min-h-[44px]"
                  data-testid="input-agreement-systems"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setAgreementNumberOfSystems(prev => prev + 1)}
                  data-testid="button-increase-agreement-systems"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                $229 first system, $10 discount per additional
              </p>
            </div>

            {/* Price Display */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-800">Annual Agreement Price</span>
                <span className="text-xl font-bold text-green-700">${agreementPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Contract Date */}
            <div>
              <Label className="text-sm font-medium">Contract Date</Label>
              <Input
                type="date"
                value={agreementContractDate}
                onChange={(e) => setAgreementContractDate(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-agreement-contract-date"
              />
            </div>

            {/* Start Date */}
            <div>
              <Label className="text-sm font-medium">Start Date</Label>
              <Input
                type="date"
                value={agreementStartDate}
                onChange={(e) => setAgreementStartDate(e.target.value)}
                className="min-h-[44px] mt-1"
                data-testid="input-agreement-start-date"
              />
            </div>

            {/* Billing Preference */}
            <div>
              <Label className="text-sm font-medium">Billing Preference</Label>
              <Select value={agreementBillingPreference} onValueChange={(v: "pay_on_visit" | "auto_invoice") => setAgreementBillingPreference(v)}>
                <SelectTrigger className="min-h-[44px] mt-1" data-testid="select-agreement-billing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_invoice">Auto Invoice (Bill Immediately)</SelectItem>
                  <SelectItem value="pay_on_visit">Pay on Visit</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                {agreementBillingPreference === "auto_invoice" 
                  ? "Customer will be invoiced when agreement is created" 
                  : "Customer will pay when technician arrives for first visit"}
              </p>
            </div>

            {/* Auto Renew */}
            <div className="flex items-center justify-between py-2">
              <div>
                <Label className="text-sm font-medium">Auto Renew</Label>
                <p className="text-xs text-slate-500">Automatically renew agreement each year</p>
              </div>
              <Switch
                checked={agreementAutoRenew}
                onCheckedChange={setAgreementAutoRenew}
                data-testid="switch-agreement-auto-renew"
              />
            </div>

            {/* Customer Paying Now Toggle */}
            <div className="flex items-center justify-between py-2 border-t pt-4">
              <div>
                <Label className="text-sm font-medium">Customer Paying Now?</Label>
                <p className="text-xs text-slate-500">Collect payment immediately and activate agreement</p>
              </div>
              <Switch
                checked={agreementPayingNow}
                onCheckedChange={setAgreementPayingNow}
                data-testid="switch-agreement-paying-now"
              />
            </div>

            {/* Notes */}
            <div>
              <Label className="text-sm font-medium">Notes (Optional)</Label>
              <Textarea
                value={agreementNotes}
                onChange={(e) => setAgreementNotes(e.target.value)}
                placeholder="Any additional notes about this agreement..."
                className="min-h-[80px] mt-1"
                data-testid="textarea-agreement-notes"
              />
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowAgreementDialog(false); 
                setPendingCatalogItem(null);
              }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button 
              className="bg-[#711419] hover:bg-[#5a1014] min-h-[44px]"
              onClick={handleCreateAgreement}
              disabled={createAgreementMutation.isPending}
              data-testid="button-create-agreement"
            >
              {createAgreementMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <FileCheck className="h-4 w-4 mr-2" />
                  Create Agreement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MobileJobDetail() {
  const params = useParams<{ id: string }>();
  const workOrderId = parseInt(params.id || "0", 10);
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [noteInput, setNoteInput] = useState("");
  const { isOnline } = useOnlineStatus();
  const pendingNotes = usePendingNotes(workOrderId);

  // Parse tab from query string
  const initialTab = (): TabType => {
    const params = new URLSearchParams(searchString);
    const tab = params.get("tab");
    if (tab === "work" || tab === "quote" || tab === "invoice") {
      return tab;
    }
    return "overview";
  };

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [optimisticStatus, setOptimisticStatus] = useState<WorkOrderStatus | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionSummary, setCompletionSummary] = useState("");
  const [showInvoiceReminder, setShowInvoiceReminder] = useState(false);
  const [invoiceReminderType, setInvoiceReminderType] = useState<"activation" | "renewal">("activation");

  const { data: workOrder, isLoading } = useQuery<WorkOrderDetail>({
    queryKey: ["/api/crm/work-orders", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work order");
      return res.json();
    },
    enabled: !!params.id,
    staleTime: 30 * 1000, // Data considered fresh for 30 seconds
    refetchInterval: isOnline ? 30 * 1000 : false, // Auto-refresh every 30 seconds when online
    refetchOnWindowFocus: true, // Refresh when app comes back to foreground
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

  const { data: renewalInfo, refetch: refetchRenewalInfo } = useQuery<RenewalInfo>({
    queryKey: ["/api/mobile/work-orders", params.id, "renewal-info"],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/work-orders/${params.id}/renewal-info`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return { isRenewalVisit: false, paymentType: null, renewalStatus: "none" as const, agreementInfo: null, visitInfo: null };
        throw new Error("Failed to fetch renewal info");
      }
      return res.json();
    },
    enabled: !!params.id,
  });

  const { data: currentUser } = useQuery<CrmUser>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch current user");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSelectedDate, setEditSelectedDate] = useState<Date | undefined>(undefined);
  const [editSelectedSlot, setEditSelectedSlot] = useState<{ start: string; end: string } | null>(null);

  const [showCollectRenewalDialog, setShowCollectRenewalDialog] = useState(false);
  const [showDeclineRenewalDialog, setShowDeclineRenewalDialog] = useState(false);
  const [renewalPaymentMethod, setRenewalPaymentMethod] = useState<"cash" | "check" | "card">("cash");

  const collectRenewalMutation = useMutation({
    mutationFn: async ({ paymentMethod, paymentType }: { paymentMethod: string; paymentType: "initial" | "renewal" | null }) => {
      const res = await apiRequest("POST", `/api/mobile/work-orders/${params.id}/collect-renewal`, {
        paymentMethod,
        paymentType,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to collect payment");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const isInitial = data?.paymentType === "initial";
      toast({ 
        title: isInitial ? "Payment Collected" : "Renewal Collected", 
        description: isInitial 
          ? "Agreement has been activated. Invoice created for payment." 
          : "Payment has been recorded successfully." 
      });
      setShowCollectRenewalDialog(false);
      setRenewalPaymentMethod("cash");
      refetchRenewalInfo();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/work-orders", params.id, "renewal-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to collect payment", variant: "destructive" });
    },
  });

  const declineRenewalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mobile/work-orders/${params.id}/decline-renewal`, {});
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to record renewal decline");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Renewal Declined", description: "Customer decline has been recorded." });
      setShowDeclineRenewalDialog(false);
      refetchRenewalInfo();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/work-orders", params.id, "renewal-info"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to record renewal decline", variant: "destructive" });
    },
  });

  const isSupervisor = currentUser?.role === "supervisor";
  const isAssignedToMe = workOrder?.assignedTechId === currentUser?.id;

  type EditWorkOrderFormData = {
    scheduledStart: string;
    scheduledEnd: string;
    priority: string;
    title: string;
    description: string;
    dispatchNotes: string;
    techNotes: string;
  };

  const editForm = useForm<EditWorkOrderFormData>({
    defaultValues: {
      scheduledStart: "",
      scheduledEnd: "",
      priority: "normal",
      title: "",
      description: "",
      dispatchNotes: "",
      techNotes: "",
    },
  });

  useEffect(() => {
    if (workOrder && showEditDialog) {
      editForm.reset({
        scheduledStart: workOrder.scheduledStart 
          ? format(new Date(workOrder.scheduledStart), "yyyy-MM-dd'T'HH:mm") 
          : "",
        scheduledEnd: workOrder.scheduledEnd 
          ? format(new Date(workOrder.scheduledEnd), "yyyy-MM-dd'T'HH:mm") 
          : "",
        priority: workOrder.priority || "normal",
        title: workOrder.title || "",
        description: workOrder.description || "",
        dispatchNotes: workOrder.dispatchNotes || "",
        techNotes: workOrder.techNotes || "",
      });
      if (workOrder.scheduledStart) {
        setEditSelectedDate(new Date(workOrder.scheduledStart));
        if (workOrder.scheduledEnd) {
          setEditSelectedSlot({
            start: new Date(workOrder.scheduledStart).toISOString(),
            end: new Date(workOrder.scheduledEnd).toISOString(),
          });
        }
      } else {
        setEditSelectedDate(undefined);
        setEditSelectedSlot(null);
      }
    }
  }, [workOrder, showEditDialog, editForm]);

  const { data: editAvailableSlots = [], isLoading: editSlotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ["/api/mobile/work-orders/available-slots", { date: editSelectedDate ? format(editSelectedDate, "yyyy-MM-dd") : null, techId: currentUser?.id }],
    queryFn: async () => {
      if (!editSelectedDate || !currentUser?.id) return [];
      const dateStr = format(editSelectedDate, "yyyy-MM-dd");
      const res = await fetch(`/api/mobile/work-orders/available-slots?date=${dateStr}&techId=${currentUser.id}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.slots || [];
    },
    enabled: !!editSelectedDate && showEditDialog && !!currentUser?.id,
  });

  const assignToMeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/mobile/work-orders/${params.id}/assign-to-me`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({ title: "Work order assigned to you" });
    },
    onError: () => {
      toast({ title: "Failed to assign work order", variant: "destructive" });
    },
  });

  const editWorkOrderMutation = useMutation({
    mutationFn: async (data: EditWorkOrderFormData) => {
      await apiRequest("PATCH", `/api/mobile/work-orders/${params.id}`, {
        scheduledStart: editSelectedSlot?.start || null,
        scheduledEnd: editSelectedSlot?.end || null,
        priority: data.priority,
        title: data.title,
        description: data.description,
        dispatchNotes: data.dispatchNotes,
        techNotes: data.techNotes,
      });
    },
    onSuccess: () => {
      setShowEditDialog(false);
      setEditSelectedDate(undefined);
      setEditSelectedSlot(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({ title: "Work order updated" });
    },
    onError: () => {
      toast({ title: "Failed to update work order", variant: "destructive" });
    },
  });

  const handleEditSubmit = (data: EditWorkOrderFormData) => {
    editWorkOrderMutation.mutate(data);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ newStatus, summary }: { newStatus: WorkOrderStatus; summary?: string }) => {
      setOptimisticStatus(newStatus);
      const payload: any = { status: newStatus };
      if (summary) {
        payload.completionSummary = summary;
      }
      await apiRequest("PATCH", `/api/crm/work-orders/${params.id}`, payload);
    },
    onSuccess: (_, variables) => {
      setOptimisticStatus(null);
      setShowCompletionModal(false);
      setCompletionSummary("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({ title: "Status updated" });
      
      // Show invoice/renewal reminder for pay-on-visit agreements
      const visitInfo = renewalInfo?.visitInfo;
      const agreementInfo = renewalInfo?.agreementInfo;
      if (
        variables.newStatus === "completed" && 
        visitInfo && 
        agreementInfo?.billingPreference === "pay_on_visit"
      ) {
        // First visit of pending agreement - activation reminder
        if (visitInfo.visitNumber === 1 && agreementInfo.status === "pending") {
          setInvoiceReminderType("activation");
          setShowInvoiceReminder(true);
        }
        // Last visit of cycle for active agreement - renewal reminder
        else if (
          visitInfo.visitNumber === visitInfo.totalVisitsInCycle &&
          agreementInfo.status === "active"
        ) {
          setInvoiceReminderType("renewal");
          setShowInvoiceReminder(true);
        }
      }
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
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                if (activeTab !== "overview") {
                  setActiveTab("overview");
                } else {
                  navigate("/mobile");
                }
              }}
              className="flex items-center text-slate-600 hover:text-slate-800 min-h-[44px] min-w-[44px]"
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5 mr-1" />
              <span>Back</span>
            </button>
            
            <div className="flex items-center gap-2">
              {isSupervisor && !isAssignedToMe && (
                <Button
                  onClick={() => assignToMeMutation.mutate()}
                  disabled={assignToMeMutation.isPending}
                  className="bg-[#711419] hover:bg-[#5a1014] min-h-[44px]"
                  data-testid="button-assign-to-me"
                >
                  {assignToMeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-1" />
                  )}
                  Assign to Me
                </Button>
              )}
              {isSupervisor && isAssignedToMe && (
                <Button
                  variant="secondary"
                  onClick={() => setShowEditDialog(true)}
                  className="min-h-[44px]"
                  data-testid="button-edit-work-order"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-24" data-testid="mobile-job-detail">
          {activeTab === "overview" && (
            <OverviewTab
              workOrder={workOrder}
              checklistResponse={checklistResponse}
              optimisticStatus={optimisticStatus}
              updateStatusMutation={updateStatusMutation}
              handleStatusChange={handleStatusChange}
              renewalInfo={renewalInfo}
              onCollectRenewal={() => setShowCollectRenewalDialog(true)}
              onDeclineRenewal={() => setShowDeclineRenewalDialog(true)}
            />
          )}
          {activeTab === "work" && (
            <WorkTab workOrder={workOrder} checklistResponse={checklistResponse} />
          )}
          {activeTab === "quote" && (
            <QuoteTab workOrder={workOrder} />
          )}
          {activeTab === "invoice" && (
            <InvoiceTab 
              workOrder={workOrder} 
              renewalInfo={renewalInfo}
              onCollectRenewal={() => setShowCollectRenewalDialog(true)}
              onDeclineRenewal={() => setShowDeclineRenewalDialog(true)}
            />
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

      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setEditSelectedDate(undefined);
          setEditSelectedSlot(null);
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="edit-work-order-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-slate-600" />
              Edit Work Order
            </DialogTitle>
            <DialogDescription>
              Update work order details below.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Work order title..." 
                        className="min-h-[44px]"
                        data-testid="input-edit-title"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <Label>Schedule</Label>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal min-h-[44px]"
                      data-testid="button-edit-date-picker"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editSelectedDate ? format(editSelectedDate, "EEEE, MMMM d, yyyy") : "Select a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editSelectedDate}
                      onSelect={(date) => {
                        setEditSelectedDate(date);
                        setEditSelectedSlot(null);
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {editSelectedDate && (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">Available Time Slots</Label>
                    {editSlotsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        <span className="ml-2 text-sm text-slate-500">Loading slots...</span>
                      </div>
                    ) : editAvailableSlots.length === 0 ? (
                      <p className="text-sm text-slate-500 py-2">No time slots available for this date</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {editAvailableSlots.map((slot, idx) => {
                          const isSelected = editSelectedSlot?.start === slot.start && editSelectedSlot?.end === slot.end;
                          return (
                            <Button
                              key={idx}
                              type="button"
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              disabled={!slot.available}
                              onClick={() => setEditSelectedSlot({ start: slot.start, end: slot.end })}
                              className={`text-xs ${
                                isSelected
                                  ? "bg-[#711419] hover:bg-[#5a1014] text-white"
                                  : slot.available
                                  ? "hover:bg-slate-100"
                                  : "opacity-50 cursor-not-allowed bg-slate-100 text-slate-400"
                              }`}
                              data-testid={`edit-time-slot-${idx}`}
                            >
                              {slot.label}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {editSelectedSlot && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    <Clock className="h-4 w-4" />
                    <span>
                      {format(new Date(editSelectedSlot.start), "h:mm a")} - {format(new Date(editSelectedSlot.end), "h:mm a")}
                    </span>
                  </div>
                )}
              </div>

              <FormField
                control={editForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="min-h-[44px]" data-testid="select-edit-priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Work order description..."
                        className="min-h-[80px]"
                        data-testid="input-edit-description"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="dispatchNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dispatch Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Notes for dispatch..."
                        className="min-h-[80px]"
                        data-testid="input-edit-dispatch-notes"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="techNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tech Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Technical notes..."
                        className="min-h-[80px]"
                        data-testid="input-edit-tech-notes"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  disabled={editWorkOrderMutation.isPending}
                  className="min-h-[44px]"
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editWorkOrderMutation.isPending}
                  className="bg-[#711419] hover:bg-[#5a1014] min-h-[44px]"
                  data-testid="button-save-edit"
                >
                  {editWorkOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCollectRenewalDialog} onOpenChange={setShowCollectRenewalDialog}>
        <DialogContent className="sm:max-w-md" data-testid="collect-renewal-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              {renewalInfo?.paymentType === "initial" ? "Collect First Year Payment" : "Collect Renewal Payment"}
            </DialogTitle>
            <DialogDescription>
              {renewalInfo?.paymentType === "initial" 
                ? "Collect payment to activate this maintenance agreement."
                : "Confirm payment collection for the maintenance agreement renewal."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {renewalInfo?.agreementInfo && (
              <div className={`rounded-lg p-4 space-y-2 ${renewalInfo.paymentType === "initial" ? "bg-green-50" : "bg-slate-50"}`}>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Agreement</span>
                  <span className="text-sm font-medium">{renewalInfo.agreementInfo.agreementNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Customer</span>
                  <span className="text-sm font-medium">{renewalInfo.agreementInfo.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Amount</span>
                  <span className="text-lg font-bold text-green-600">${parseFloat(String(renewalInfo.agreementInfo.price || 0)).toFixed(2)}</span>
                </div>
                {renewalInfo.paymentType === "initial" && (
                  <p className="text-xs text-green-700 mt-2 pt-2 border-t border-green-200">
                    This is the first payment. Agreement will be activated after payment is recorded.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={renewalPaymentMethod} onValueChange={(value: "cash" | "check" | "card") => setRenewalPaymentMethod(value)}>
                <SelectTrigger className="min-h-[44px]" data-testid="select-renewal-payment-method">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCollectRenewalDialog(false)}
              disabled={collectRenewalMutation.isPending}
              className="min-h-[44px]"
              data-testid="button-cancel-collect-renewal"
            >
              Cancel
            </Button>
            <Button
              onClick={() => collectRenewalMutation.mutate({ paymentMethod: renewalPaymentMethod, paymentType: renewalInfo?.paymentType || null })}
              disabled={collectRenewalMutation.isPending}
              className="bg-green-600 hover:bg-green-700 min-h-[44px]"
              data-testid="button-confirm-collect-renewal"
            >
              {collectRenewalMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {renewalInfo?.paymentType === "initial" ? "Collect & Activate" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeclineRenewalDialog} onOpenChange={setShowDeclineRenewalDialog}>
        <DialogContent className="sm:max-w-md" data-testid="decline-renewal-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Customer Declined Renewal
            </DialogTitle>
            <DialogDescription>
              Are you sure the customer has declined to renew their maintenance agreement?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {renewalInfo?.agreementInfo && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                <p className="text-sm text-red-700">
                  <strong>{renewalInfo.agreementInfo.customerName}</strong> is declining to renew agreement <strong>{renewalInfo.agreementInfo.agreementNumber}</strong> (${parseFloat(String(renewalInfo.agreementInfo.price || 0)).toFixed(2)}/year).
                </p>
                <p className="text-xs text-red-600">
                  This action will be recorded. The office will be notified.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeclineRenewalDialog(false)}
              disabled={declineRenewalMutation.isPending}
              className="min-h-[44px]"
              data-testid="button-cancel-decline-renewal"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => declineRenewalMutation.mutate()}
              disabled={declineRenewalMutation.isPending}
              className="min-h-[44px]"
              data-testid="button-confirm-decline-renewal"
            >
              {declineRenewalMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Confirm Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice/Renewal Reminder Dialog for Pay-on-Visit Agreements */}
      <Dialog open={showInvoiceReminder} onOpenChange={setShowInvoiceReminder}>
        <DialogContent className="sm:max-w-md" data-testid="invoice-reminder-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-600" />
              {invoiceReminderType === "activation" ? "Invoice Reminder" : "Renewal Reminder"}
            </DialogTitle>
            <DialogDescription>
              This maintenance visit has been completed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <p className="text-sm text-amber-800 font-medium">
                {invoiceReminderType === "activation" 
                  ? "Don't forget to invoice the customer for their maintenance agreement!" 
                  : "This was the final visit of the cycle. Ask the customer if they'd like to renew their agreement."}
              </p>
              {renewalInfo?.agreementInfo && (
                <div className="text-sm text-amber-700 space-y-1">
                  <p>Agreement: <strong>{renewalInfo.agreementInfo.agreementNumber}</strong></p>
                  <p>Amount: <strong>${parseFloat(String(renewalInfo.agreementInfo.price || 0)).toFixed(2)}</strong></p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className={invoiceReminderType === "renewal" ? "flex-col gap-2 sm:flex-col" : ""}>
            {invoiceReminderType === "activation" ? (
              <Button
                onClick={() => setShowInvoiceReminder(false)}
                className="min-h-[44px] w-full"
                data-testid="button-dismiss-invoice-reminder"
              >
                <Check className="h-4 w-4 mr-2" />
                Got it
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setShowInvoiceReminder(false);
                    setShowCollectRenewalDialog(true);
                  }}
                  className="min-h-[44px] w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-invoice-renewal"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Invoice Renewal
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowInvoiceReminder(false);
                    setShowDeclineRenewalDialog(true);
                  }}
                  className="min-h-[44px] w-full"
                  data-testid="button-customer-declined"
                >
                  <X className="h-4 w-4 mr-2" />
                  Customer Declined
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowInvoiceReminder(false)}
                  className="min-h-[44px] w-full"
                  data-testid="button-dismiss-renewal-reminder"
                >
                  Remind Me Later
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileShell>
  );
}
