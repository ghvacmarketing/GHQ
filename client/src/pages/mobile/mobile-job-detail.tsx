import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createPortal, flushSync } from "react-dom";
import { CustomerCamera } from "@/components/mobile/customer-camera";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { isNativeApp, pickNativeLibraryPhotos } from "@/lib/native";
import createPhoto from "@/assets/create-photo.png";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, useSearch } from "wouter";
import { format, addYears, addMonths } from "date-fns";
import {
  ArrowLeft,
  ArrowUpRight,
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
  Camera,
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
  Minus,
  MessageSquare,
  Navigation,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
} from "lucide-react";
import { statusDotColor } from "@/components/ui/status-dot";
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
import { markSkipEntrance, skipEntranceOnce, usePushEntrance } from "@/lib/page-transitions";

// The in-job create flows mount as OVERLAYS over the live tab (no
// navigation, no white flash) — loaded on first open.
const QuoteCreateOverlay = lazy(() => import("./mobile-quote-new"));
const InvoiceCreateOverlay = lazy(() => import("./mobile-invoice-new"));
import { useRequireCrmAuth } from "@/hooks/use-require-crm-auth";
import { useOnlineStatus, OfflineIndicator } from "@/hooks/use-online-status";
import MobileShell from "./mobile-shell";
import MobileJob from "./mobile-job";
import type { CrmWorkOrder, CrmCustomer, CrmProperty, WorkOrderStatus, CrmQuote, CrmInvoice, CrmInvoiceLineItem, CrmItem, CrmQuoteLineItem, CrmUser } from "@shared/schema";

interface WorkOrderDetail extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

type ChecklistQuestion = {
  id: string;
  question: string;
  questionType: "yes_no" | "text" | "number" | "select" | "multi_select";
  options: string[] | null;
  isRequired: boolean;
  helpText?: string | null;
  section?: string | null;
};

type AssignedChecklistTemplate = {
  id: string;
  name: string;
  description: string | null;
  questions: ChecklistQuestion[];
  photoSteps?: Array<{
    id: string;
    label: string;
    instructions: string | null;
    isRequired: boolean;
    linkedQuestionId: string | null;
  }>;
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
  en_route: { label: "Traveling", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  on_site: { label: "Working", className: "bg-green-100 text-green-700 border-green-300" },
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

const pendingReasonLabels: Record<string, string> = {
  waiting_on_parts: "Waiting on Parts",
  waiting_on_customer: "Waiting on Customer",
  waiting_for_next_job: "Waiting for Next Job",
  lunch_break: "Lunch Break",
  other: "Other",
};

function OverviewTab({ 
  workOrder, 
  checklistResponse,
  optimisticStatus,
  updateStatusMutation,
  handleStatusChange,
  renewalInfo,
  onCollectRenewal,
  onDeclineRenewal,
  onPendingChange,
  pendingMutation,
  optimisticPending,
  onGoTab,
}: {
  workOrder: WorkOrderDetail;
  checklistResponse: ChecklistResponseData | null | undefined;
  optimisticStatus: WorkOrderStatus | null;
  updateStatusMutation: any;
  handleStatusChange: (status: WorkOrderStatus) => void;
  renewalInfo: RenewalInfo | null | undefined;
  onCollectRenewal: () => void;
  onDeclineRenewal: () => void;
  onPendingChange: (isPending: boolean, reason?: string, isReasonChange?: boolean) => void;
  pendingMutation: any;
  optimisticPending: { isPending: boolean; reason?: string } | null;
  onGoTab: (tab: string) => void;
}) {
  const [checklistAnswersOpen, setChecklistAnswersOpen] = useState(false);
  // Photos door opens the camera RIGHT HERE, aimed at this job's customer
  const [ovCameraOpen, setOvCameraOpen] = useState(false);
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

  const actionBtn = "flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm transition-transform active:scale-[0.97]";

  const [, goNavigate] = useLocation();
  const flowIndex = statusFlow.indexOf(displayStatus as WorkOrderStatus);
  const isPendingNow = optimisticPending?.isPending ?? workOrder.isPending ?? false;
  const pendingReasonNow = optimisticPending?.reason ?? workOrder.pendingReason ?? "waiting_on_parts";

  return (
    <div className="space-y-4">
      {/* Top row — job number + type, status pill */}
      <div className="relative flex items-center justify-center pt-1" data-testid="job-topline">
        <p className="text-sm font-semibold text-slate-600">
          Job #{workOrder.workOrderNumber ?? ""} · {(workOrder.visitType || "SERVICE").charAt(0) + (workOrder.visitType || "SERVICE").slice(1).toLowerCase()}
        </p>
      </div>

      {/* Header */}
      <div data-testid="job-header">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" data-testid="job-customer-name">{customerName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {workOrder.title || "Service visit"}
          {workOrder.scheduledStart && (
            <> · arrival window {format(new Date(workOrder.scheduledStart), "h:mm")}{workOrder.scheduledEnd ? `–${format(new Date(workOrder.scheduledEnd), "h:mm a")}` : format(new Date(workOrder.scheduledStart), " a")}</>
          )}
        </p>
        <p className="mt-0.5 text-sm text-slate-400">
          {workOrder.property?.address1 || address}
          {isPendingNow && <span className="font-medium text-amber-600" data-testid="job-pending-badge"> · Waiting</span>}
        </p>
      </div>

      {/* Progress rail */}
      <div data-testid="job-progress">
        {/* One continuous bar: solid fill = steps done, lighter tip = the step in progress */}
        <div className="flex h-2 overflow-hidden rounded-md bg-slate-200">
          <div
            className="bg-[#711419] transition-all duration-300"
            style={{ width: `${(Math.min(flowIndex, statusFlow.length - 1) / statusFlow.length) * 100}%` }}
          />
          <div
            className="transition-all duration-300"
            style={{
              width: `${100 / statusFlow.length}%`,
              // In-progress step shows as a lighter tip; on the final step the
              // whole bar reads solid (done).
              backgroundColor: flowIndex >= statusFlow.length - 1 ? "#711419" : "rgba(113, 20, 25, 0.4)",
            }}
          />
        </div>
        <div className="mt-1.5 flex">
          {statusFlow.map((step, i) => (
            <span
              key={step}
              className={`flex-1 text-center text-[10px] ${i === flowIndex ? "font-bold text-[#711419]" : "font-medium text-slate-400"}`}
            >
              {statusConfig[step]?.label}
            </span>
          ))}
        </div>
      </div>

      {/* Primary action */}
      {nextStatus && displayStatus !== "completed" && (
        <button
          onClick={() => handleStatusChange(nextStatus)}
          disabled={updateStatusMutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#711419] py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(113,20,25,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60"
          data-testid={`button-status-${nextStatus}`}
        >
          {updateStatusMutation.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          {nextStatus === "dispatched" && "Take This Job"}
          {nextStatus === "en_route" && "Start Driving"}
          {nextStatus === "on_site" && "I've Arrived"}
          {nextStatus === "completed" && "Complete Job"}
        </button>
      )}
      {/* Waiting toggle */}
      {displayStatus !== "completed" && displayStatus !== "scheduled" && (
        <div className="rounded-lg border border-slate-100 bg-white p-3.5 shadow-sm" data-testid="pending-toggle-section">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Clock className="h-4 w-4 text-amber-600" /> Mark as Waiting
            </span>
            <Switch
              checked={isPendingNow}
              onCheckedChange={(checked) => onPendingChange(checked, checked ? "waiting_on_parts" : undefined, false)}
              disabled={pendingMutation.isPending}
              data-testid="pending-toggle"
            />
          </div>
          {isPendingNow && (
            <div className="mt-3 space-y-2">
              <Select
                value={pendingReasonNow}
                onValueChange={(value) => onPendingChange(true, value, true)}
                disabled={pendingMutation.isPending}
              >
                <SelectTrigger className="w-full" data-testid="pending-reason-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiting_on_parts">Waiting on Parts</SelectItem>
                  <SelectItem value="waiting_on_customer">Waiting on Customer</SelectItem>
                  <SelectItem value="waiting_for_next_job">Waiting for Next Job</SelectItem>
                  <SelectItem value="lunch_break">Lunch Break</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {workOrder.pendingStartedAt && !optimisticPending && (
                <p className="text-xs text-amber-600">
                  Waiting since {format(new Date(workOrder.pendingStartedAt), "h:mm a")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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

      {/* Brief — what dispatch wants you to know */}
      {(workOrder.dispatchNotes || workOrder.description) && (
        <Card className="rounded-lg border-slate-100 shadow-sm" data-testid="card-dispatch-notes">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#711419]">Brief</p>
              <p className="text-[11px] text-slate-400">from dispatch</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap" data-testid="text-dispatch-notes">
              {workOrder.dispatchNotes || workOrder.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Section doors — welcome-screen card language (title, sub, arrow;
          no icon plates) so a tech reads them as BUTTONS at a glance.
          Photos opens the camera RIGHT HERE aimed at this job's customer. */}
      <div className="space-y-2.5" data-testid="job-tiles">
        {[
          { key: "checklist", title: "Checklist", sub: "Tasks, notes & wrap-up", go: () => onGoTab("work") },
          { key: "photos", title: "Photos", sub: "Snap job-site photos — straight to the customer", go: () => workOrder.customerId && setOvCameraOpen(true) },
          { key: "quote", title: "Quote", sub: "Build & present", go: () => onGoTab("quote") },
          { key: "invoice", title: "Invoice", sub: "Collect payment", go: () => onGoTab("invoice") },
        ].map(({ key, title, sub, go }) => (
          <button
            key={key}
            onClick={go}
            className="flex w-full items-center gap-3.5 rounded-[4px] border border-slate-300/70 bg-white p-4 text-left transition-transform active:scale-[0.99] active:bg-slate-50"
            data-testid={`tile-${key}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{sub}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={1.75} />
          </button>
        ))}
      </div>
      {ovCameraOpen && workOrder.customerId && (
        <CustomerCamera
          customerId={workOrder.customerId}
          customerName={workOrder.customer?.name || "Customer"}
          onClose={() => setOvCameraOpen(false)}
        />
      )}

      {/* Schedule */}
      <Card className="rounded-lg border-slate-100 shadow-sm" data-testid="card-schedule">
        <CardContent className="pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Schedule</p>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Window</span>
              <span className="font-semibold text-slate-900" data-testid="scheduled-time">
                {workOrder.scheduledStart
                  ? `${format(new Date(workOrder.scheduledStart), "h:mm a")}${workOrder.scheduledEnd ? ` – ${format(new Date(workOrder.scheduledEnd), "h:mm a")}` : ""}`
                  : "Not scheduled"}
              </span>
            </div>
            {workOrder.scheduledStart && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Date</span>
                <span className="font-semibold text-slate-900">{format(new Date(workOrder.scheduledStart), "EEE, MMM d")}</span>
              </div>
            )}
            {workOrder.createdAt && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Booked</span>
                <span className="font-semibold text-slate-900">GHQ · {format(new Date(workOrder.createdAt), "MMM d")}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customer */}
      <Card className="rounded-lg border-slate-100 shadow-sm" data-testid="customer-info-card">
        <CardContent className="pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Customer</p>
          <div className="mt-2 space-y-2.5">
            {customerPhone && (
              <a href={`tel:${customerPhone}`} className="flex items-center text-sm font-semibold text-slate-900" data-testid="customer-phone">
                <Phone className="h-4 w-4 mr-2 text-slate-400" />
                {customerPhone}
              </a>
            )}
            <a
              href={getGoogleMapsUrl(workOrder.property)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start text-sm text-slate-700"
              data-testid="customer-address"
            >
              <MapPin className="h-4 w-4 mr-2 mt-0.5 shrink-0 text-slate-400" />
              <span>{address}</span>
            </a>
          </div>
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

// Tech-facing checklist: filled in the field, submitted once complete
function ChecklistFillCard({ workOrder, template }: { workOrder: WorkOrderDetail; template: AssignedChecklistTemplate }) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  // Photos captured PER STEP, right on the step: taken with the camera or
  // added from the library (multiple), uploaded immediately to the customer's
  // files, and linked to the step inside the submitted answers under
  // __photos_<stepId> keys.
  const [stepPhotos, setStepPhotos] = useState<Record<string, Array<{ id: string; url: string; uploading: boolean }>>>({});
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const activeStepRef = useRef<{ id: string; label: string } | null>(null);
  // OUR camera (not the iOS one) aimed at a single photo step
  const [stepCamera, setStepCamera] = useState<{ id: string; label: string } | null>(null);
  // Field mode: hide everything already satisfied, show only what's left
  const [missingOnly, setMissingOnly] = useState(false);

  const uploadStepPhoto = async (step: { id: string; label: string }, file: File) => {
    if (!workOrder.customerId) {
      toast({ title: "This job has no customer on file", variant: "destructive" });
      return;
    }
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localUrl = URL.createObjectURL(file);
    setStepPhotos((prev) => ({ ...prev, [step.id]: [...(prev[step.id] ?? []), { id: localId, url: localUrl, uploading: true }] }));
    try {
      const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await presignRes.json();
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const fileUrl = objectPath.startsWith("/objects") ? objectPath : `/objects/${objectPath}`;
      await apiRequest("POST", `/api/crm/customers/${workOrder.customerId}/files`, {
        name: `WO${workOrder.workOrderNumber ?? ""} - ${step.label}.jpg`,
        url: fileUrl,
        objectPath,
        contentType: file.type || "image/jpeg",
        size: file.size,
      });
      setStepPhotos((prev) => ({
        ...prev,
        [step.id]: (prev[step.id] ?? []).map((p) => (p.id === localId ? { ...p, url: fileUrl, uploading: false } : p)),
      }));
    } catch {
      setStepPhotos((prev) => ({ ...prev, [step.id]: (prev[step.id] ?? []).filter((p) => p.id !== localId) }));
      toast({ title: "Photo upload failed", description: "Check your signal and try again.", variant: "destructive" });
    }
  };

  const onFilesPicked = (files: FileList | null) => {
    const step = activeStepRef.current;
    if (!files || !step) return;
    for (const f of Array.from(files)) uploadStepPhoto(step, f);
  };

  const removeStepPhoto = (stepId: string, id: string) =>
    setStepPhotos((prev) => ({ ...prev, [stepId]: (prev[stepId] ?? []).filter((p) => p.id !== id) }));

  const startCapture = async (step: { id: string; label: string }, source: "camera" | "library") => {
    activeStepRef.current = step;
    if (source === "camera") {
      setStepCamera(step); // the house camera, never the iOS one
      return;
    }
    if (isNativeApp()) {
      const files = await pickNativeLibraryPhotos();
      if (files) for (const f of files) uploadStepPhoto(step, f);
      return;
    }
    libraryInputRef.current?.click();
  };

  const allPhotoSteps = template.photoSteps ?? [];
  const missingRequiredPhotos = allPhotoSteps.filter(
    (ps) => ps.isRequired !== false && !(stepPhotos[ps.id] ?? []).some((p) => !p.uploading),
  ).length;
  const anyUploading = Object.values(stepPhotos).some((arr) => arr.some((p) => p.uploading));

  // A photo step rendered as a live capture block — count, thumbnails with
  // remove, Take photo (camera) and Add (library, multiple).
  // ONE calm row per photo requirement: label + state left, two icon
  // buttons right (house camera / library), thumbs beneath.
  const renderPhotoStep = (ps: { id: string; label: string; instructions?: string | null; isRequired?: boolean | null }) => {
    const photos = stepPhotos[ps.id] ?? [];
    const doneCount = photos.filter((p) => !p.uploading).length;
    const satisfied = doneCount > 0;
    return (
      <div
        key={ps.id}
        className={`rounded-[4px] border border-slate-300/70 bg-white p-3 ${!satisfied && ps.isRequired !== false ? "border-l-2 border-l-[#711419]" : ""}`}
        data-testid={`fill-photo-${ps.id}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{ps.label}</p>
            <p className={`mt-0.5 text-[11px] font-semibold uppercase tracking-wide ${satisfied ? "text-green-600" : ps.isRequired !== false ? "text-[#711419]/70" : "text-slate-400"}`}>
              {satisfied ? `${doneCount} added` : ps.isRequired !== false ? "Photo needed" : "Optional photo"}
            </p>
          </div>
          <button
            onClick={() => startCapture({ id: ps.id, label: ps.label }, "camera")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-[#711419] text-white shadow-sm transition-transform active:scale-95"
            aria-label="Take photo"
            data-testid={`photo-take-${ps.id}`}
          >
            <Camera className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => startCapture({ id: ps.id, label: ps.label }, "library")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-slate-300/70 bg-white text-slate-600 transition-transform active:scale-95"
            aria-label="Add from library"
            data-testid={`photo-add-${ps.id}`}
          >
            <ImagePlus className="h-[18px] w-[18px]" />
          </button>
        </div>
        {ps.instructions && <p className="mt-1.5 text-xs text-slate-500">{ps.instructions}</p>}
        {photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative h-16 w-16 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                {p.uploading ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </span>
                ) : (
                  <button
                    onClick={() => removeStepPhoto(ps.id, p.id)}
                    className="absolute right-0.5 top-0.5 flex items-center justify-center rounded-full bg-black/60 text-white"
                    style={{ height: 18, width: 18 }}
                    aria-label="Remove photo"
                    data-testid={`photo-remove-${p.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const answeredCount = template.questions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && a !== "";
  }).length;
  const missingRequired = template.questions.filter(
    (q) => q.isRequired && (answers[q.id] === undefined || answers[q.id] === ""),
  ).length;

  const submit = useMutation({
    mutationFn: async () => {
      // Photo links ride inside the answers json under __photos_<stepId>
      const photoLinks = Object.fromEntries(
        Object.entries(stepPhotos)
          .filter(([, arr]) => arr.some((p) => !p.uploading))
          .map(([sid, arr]) => [`__photos_${sid}`, arr.filter((p) => !p.uploading).map((p) => p.url)]),
      );
      const res = await apiRequest("POST", `/api/crm/work-orders/${workOrder.id}/checklist-response`, {
        checklistId: template.id,
        answers: { ...answers, ...photoLinks },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", workOrder.id, "checklist-response"] });
      toast({ title: "Checklist submitted" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't submit checklist",
        description: e?.message || "Answer all required questions first.",
        variant: "destructive",
      });
    },
  });

  const setAnswer = (id: string, value: string | number) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  // Group questions into their builder-defined sections (phases)
  const sections = (() => {
    const groups: Array<{ name: string | null; qs: AssignedChecklistTemplate["questions"] }> = [];
    const gIdx = new Map<string, number>();
    for (const q of template.questions) {
      const name = q.section?.trim() || null;
      const key = name ?? "__none__";
      if (!gIdx.has(key)) {
        gIdx.set(key, groups.length);
        groups.push({ name, qs: [] });
      }
      groups[gIdx.get(key)!].qs.push(q);
    }
    return groups;
  })();
  const showSectionHeaders = sections.length > 1 || Boolean(sections[0]?.name);
  const answeredIn = (qs: AssignedChecklistTemplate["questions"]) =>
    qs.filter((q) => {
      const a = answers[q.id];
      return a !== undefined && a !== "";
    }).length;

  // Photo steps tied to a question render ON that question's card; the rest
  // collect in a general "Required photos" block.
  const photosByQuestion = new Map<string, NonNullable<AssignedChecklistTemplate["photoSteps"]>>();
  const generalPhotos: NonNullable<AssignedChecklistTemplate["photoSteps"]> = [];
  for (const ps of template.photoSteps ?? []) {
    if (ps.linkedQuestionId) {
      const arr = photosByQuestion.get(ps.linkedQuestionId) ?? [];
      arr.push(ps);
      photosByQuestion.set(ps.linkedQuestionId, arr);
    } else {
      generalPhotos.push(ps);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[4px] border border-slate-300/70 bg-white shadow-none" data-testid="card-checklist-fill">
        <CardHeader className="border-b border-slate-300/70 pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base font-semibold">
            <span className="min-w-0 flex-1 truncate text-slate-900">{template.name}</span>
            <span className="shrink-0 rounded-[3px] border border-slate-300/70 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
              {answeredCount}/{template.questions.length}
            </span>
          </CardTitle>
          {template.description && <p className="mt-1 text-sm text-slate-500">{template.description}</p>}
          {sections.length > 1 && (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {sections.length} sections
            </p>
          )}
          <div className="mt-2 h-1 w-full bg-slate-100">
            <div
              className="h-full bg-[#711419] transition-all"
              style={{ width: `${(answeredCount / Math.max(1, template.questions.length)) * 100}%` }}
            />
          </div>
          {(missingRequired > 0 || missingRequiredPhotos > 0) ? (
            <button
              onClick={() => setMissingOnly((v) => !v)}
              className={`mt-2.5 flex w-full items-center justify-between rounded-[4px] border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                missingOnly ? "border-[#711419] bg-[#711419]/5 text-[#711419]" : "border-slate-300/70 bg-slate-50 text-slate-700"
              }`}
              data-testid="checklist-missing-toggle"
            >
              <span>
                {missingRequired + missingRequiredPhotos} left
                <span className="font-normal text-slate-500">
                  {" "}— {missingRequired > 0 ? `${missingRequired} answer${missingRequired === 1 ? "" : "s"}` : ""}
                  {missingRequired > 0 && missingRequiredPhotos > 0 ? ", " : ""}
                  {missingRequiredPhotos > 0 ? `${missingRequiredPhotos} photo${missingRequiredPhotos === 1 ? "" : "s"}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide">
                {missingOnly ? "Show all" : "Show what's left"}
              </span>
            </button>
          ) : (
            <p className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Everything required is in — ready to submit
            </p>
          )}
        </CardHeader>
      </Card>

      {/* Each section is its own collapsible card — the bold slate header
          band stays visible even collapsed, so a section can't be missed. */}
      {sections.map((section, si) => {
        const done = answeredIn(section.qs);
        const complete = section.qs.length > 0 && done === section.qs.length;
        // Field mode: only what still needs attention (required answers or
        // required photos), sections with nothing left disappear entirely.
        const needsAttention = (q: AssignedChecklistTemplate["questions"][number]) => {
          const a = answers[q.id];
          const unanswered = a === undefined || a === "";
          const unmetPhoto = (photosByQuestion.get(q.id) ?? []).some(
            (ps) => ps.isRequired !== false && !(stepPhotos[ps.id] ?? []).some((pp) => !pp.uploading),
          );
          return (q.isRequired && unanswered) || unmetPhoto;
        };
        const visibleQs = missingOnly ? section.qs.filter(needsAttention) : section.qs;
        if (missingOnly && visibleQs.length === 0) return null;
        const collapsed = !missingOnly && collapsedSections.has(si);
        return (
          <div key={si} className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid={`checklist-section-${si}`}>
            {showSectionHeaders && (
              <button
                type="button"
                onClick={() =>
                  setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    if (next.has(si)) next.delete(si);
                    else next.add(si);
                    return next;
                  })
                }
                className={`flex w-full items-center gap-2.5 bg-slate-100 px-3.5 py-3 text-left ${collapsed ? "" : "border-b border-slate-300/70"}`}
                data-testid={`checklist-section-toggle-${si}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] bg-slate-900 text-xs font-bold text-white">
                  {si + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-slate-800">
                  {section.name || `Section ${si + 1}`}
                </span>
                <span className={`flex shrink-0 items-center gap-1 text-[11px] font-semibold ${complete ? "text-green-600" : "text-slate-500"}`}>
                  {complete && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {done} of {section.qs.length}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${collapsed ? "" : "rotate-180"}`} />
              </button>
            )}
            {!collapsed && (
              <div className="space-y-3 p-3.5">
              {visibleQs.map((q) => {
            const value = answers[q.id];
            const linkedPhotos = photosByQuestion.get(q.id) ?? [];
            const answered = value !== undefined && value !== "";
            return (
              <div key={q.id}>
              <div
                className={`rounded-[4px] border border-slate-300/70 bg-white p-3.5 ${!answered && q.isRequired ? "border-l-2 border-l-[#711419]" : ""}`}
                data-testid={`fill-question-${q.id}`}
              >
                <p className="flex items-start justify-between gap-2 text-sm font-medium text-slate-800">
                  <span className="min-w-0">
                    {q.question}
                    {q.isRequired && !answered && <span className="ml-1 text-red-500">*</span>}
                  </span>
                  {answered && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
                </p>
                {q.helpText && <p className="mt-0.5 text-xs text-slate-500">{q.helpText}</p>}
                {linkedPhotos.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {linkedPhotos.map((ps) => renderPhotoStep(ps))}
                  </div>
                )}
                <div className="mt-2.5">
                  {q.questionType === "yes_no" && (
                    <div className="grid grid-cols-2 gap-2">
                      {["yes", "no"].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setAnswer(q.id, opt)}
                          className={`rounded-[3px] border py-2.5 text-sm font-semibold capitalize transition-colors ${
                            value === opt
                              ? opt === "yes"
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-red-400 bg-red-50 text-red-600"
                              : "border-slate-200 text-slate-500"
                          }`}
                          data-testid={`fill-${q.id}-${opt}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.questionType === "text" && (
                    <Textarea
                      value={(value as string) ?? ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      rows={2}
                      placeholder="Type your answer..."
                      className="bg-white"
                    />
                  )}
                  {q.questionType === "number" && (
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={(value as string | number) ?? ""}
                      onChange={(e) => setAnswer(q.id, e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="Enter a number..."
                      className="bg-white"
                    />
                  )}
                  {q.questionType === "select" && q.options && (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setAnswer(q.id, opt)}
                          className={`rounded-[3px] border px-3.5 py-2 text-sm font-medium transition-colors ${
                            value === opt ? "border-[#711419] bg-[#711419]/5 text-[#711419]" : "border-slate-300/70 text-slate-500"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.questionType === "multi_select" && q.options && (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt) => {
                        const selected = String(value ?? "").split(", ").filter(Boolean);
                        const checked = selected.includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => {
                              const next = checked ? selected.filter((o) => o !== opt) : [...selected, opt];
                              setAnswer(q.id, next.join(", "));
                            }}
                            className={`rounded-[3px] border px-3.5 py-2 text-sm font-medium transition-colors ${
                              checked ? "border-[#711419] bg-[#711419]/5 text-[#711419]" : "border-slate-300/70 text-slate-500"
                            }`}
                          >
                            {checked ? "\u2713 " : ""}{opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              </div>
            );
          })}
              </div>
            )}
          </div>
        );
      })}

          {(() => {
            const shown = missingOnly
              ? generalPhotos.filter((ps) => ps.isRequired !== false && !(stepPhotos[ps.id] ?? []).some((pp) => !pp.uploading))
              : generalPhotos;
            if (shown.length === 0) return null;
            return (
              <div data-testid="fill-photo-steps">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Required photos</p>
                <div className="space-y-2">{shown.map((ps) => renderPhotoStep(ps))}</div>
              </div>
            );
          })()}

          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || missingRequired > 0 || missingRequiredPhotos > 0 || anyUploading}
            className="h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold hover:bg-[#8a1a1f]"
            data-testid="button-submit-checklist"
          >
            {submit.isPending
              ? "Submitting..."
              : anyUploading
                ? "Uploading photos..."
                : missingRequired > 0
                  ? `${missingRequired} required ${missingRequired === 1 ? "answer" : "answers"} left`
                  : missingRequiredPhotos > 0
                    ? `${missingRequiredPhotos} required ${missingRequiredPhotos === 1 ? "photo" : "photos"} left`
                    : "Submit checklist"}
          </Button>

      {/* House camera aimed at ONE step — its shots ride uploadStepPhoto so
          they get the WO/step naming and land in the answers links */}
      {stepCamera && workOrder.customerId && (
        <CustomerCamera
          customerId={workOrder.customerId}
          customerName={stepCamera.label}
          onCapture={(f) => uploadStepPhoto(stepCamera, f)}
          onClose={() => setStepCamera(null)}
        />
      )}

      {/* Hidden library fallback (web only — native uses the photo picker) */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { onFilesPicked(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

function WorkTab({
  workOrder,
  checklistResponse,
  assignedChecklist,
}: {
  workOrder: WorkOrderDetail;
  checklistResponse: ChecklistResponseData | null | undefined;
  assignedChecklist: AssignedChecklistTemplate | null;
}) {
  const [checklistAnswersOpen, setChecklistAnswersOpen] = useState(true);
  const { toast } = useToast();
  // In-job camera: shots land straight on THIS job's customer.
  const [cameraOpen, setCameraOpen] = useState(false);
  const camCustomerName = workOrder.customer?.name || "Customer";
  const photosDoor = (
    <>
      <button
        onClick={() => (workOrder.customerId ? setCameraOpen(true) : undefined)}
        disabled={!workOrder.customerId}
        className="flex w-full items-center gap-3.5 rounded-[4px] border border-slate-300/70 bg-white p-4 text-left transition-transform active:scale-[0.99] active:bg-slate-50 disabled:opacity-50"
        data-testid="work-take-photos"
      >
        <img src={createPhoto} alt="" className="h-11 w-11 shrink-0 select-none" draggable={false} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900">Take photos</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">
            Straight to {camCustomerName}&apos;s files — snap as many as you need
          </span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={1.75} />
      </button>
      {cameraOpen && workOrder.customerId && (
        <CustomerCamera
          customerId={workOrder.customerId}
          customerName={camCustomerName}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );

  if (!checklistResponse || !checklistResponse.checklist) {
    if (assignedChecklist && assignedChecklist.questions.length > 0) {
      return (
        <div className="space-y-4">
          {photosDoor}
          <ChecklistFillCard workOrder={workOrder} template={assignedChecklist} />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {photosDoor}
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
      {photosDoor}
      <Card className="rounded-[4px] border border-slate-300/70 bg-white shadow-none" data-testid="card-work-checklist">
        <CardHeader className="border-b border-slate-300/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Clipboard className="h-4 w-4 text-[#711419]" />
            {checklistResponse.checklist.name || "Service Checklist"}
          </CardTitle>
          {checklistResponse.checklist.description && (
            <p className="text-sm text-slate-500 mt-1">{checklistResponse.checklist.description}</p>
          )}
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {checklistResponse.summary && (
            <div className="rounded-[4px] border border-slate-300/70 bg-slate-50 p-4">
              <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-wider font-semibold">AI Summary</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-work-summary">
                {checklistResponse.summary}
              </p>
            </div>
          )}

          <Collapsible open={checklistAnswersOpen} onOpenChange={setChecklistAnswersOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between p-3 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-[3px] border border-slate-300/70 bg-white min-h-[44px]"
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
              <div className="space-y-3 bg-white rounded-[4px] p-4 border border-slate-300/70">
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
                        {(question.questionType === "select" || question.questionType === "multi_select") && (
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

          {/* Step photos — submitted under __photos_<stepId> keys; without
              this block they attached invisibly and looked lost. */}
          {(() => {
            const photoUrls = Object.entries(checklistResponse.answers || {})
              .filter(([k]) => k.startsWith("__photos_"))
              .flatMap(([, v]) => (Array.isArray(v) ? (v as string[]) : []));
            if (photoUrls.length === 0) return null;
            return (
              <div data-testid="work-checklist-photos">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Checklist photos ({photoUrls.length})
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {photoUrls.map((u, i) => (
                    <img
                      key={i}
                      src={u}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full rounded-[3px] border border-slate-300/70 object-cover"
                      data-testid={`work-checklist-photo-${i}`}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {checklistResponse.completedAt && (
            <p className="text-xs text-slate-500 text-right">
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

// Plain colored text — the quote rows show status as a word, not a pill.
const quoteStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-slate-500" },
  sent: { label: "Sent", className: "text-blue-600" },
  accepted: { label: "Accepted", className: "text-green-600" },
  declined: { label: "Declined", className: "text-red-500" },
  expired: { label: "Expired", className: "text-orange-500" },
  converted: { label: "Converted", className: "text-purple-600" },
};

function QuoteTab({ workOrder }: { workOrder: WorkOrderDetail }) {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch existing quotes for this work order
  const { data: quotesData, isLoading: quotesLoading, error: quotesError } = useQuery<{ quotes: CrmQuote[] }>({
    queryKey: ["/api/crm/quotes", { workOrderId: workOrder.id }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes?workOrderId=${workOrder.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds to catch customer acceptance
  });

  const quotes = quotesData?.quotes || [];

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
  };

  return (
    <div className="space-y-4">
      {/* Quotes — the list and the create action live in ONE card; the
          button matches the bottom-sheet create buttons. */}
      <Card data-testid="existing-quotes-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <div className="space-y-2.5">
              {quotes.map((quote) => {
                const statusInfo = quoteStatusConfig[quote.status] || quoteStatusConfig.draft;
                return (
                  // The whole row is the tap target — chevron + press state
                  // say "this opens"; everything else lives in quote detail.
                  <button
                    type="button"
                    key={quote.id}
                    onClick={() => navigate(`/mobile/quotes/${quote.id}?job=${workOrder.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors active:bg-slate-100"
                    data-testid={`quote-item-${quote.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900" data-testid={`quote-title-${quote.id}`}>
                        {quote.title || quote.quoteNumber || "Quote"}
                      </p>
                      {quote.createdAt && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Created {format(new Date(quote.createdAt), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-sm font-semibold tabular-nums text-slate-900" data-testid={`quote-total-${quote.id}`}>
                        {formatCurrency(quote.total)}
                      </span>
                      <span className={`text-xs font-medium ${statusInfo.className}`} data-testid={`quote-status-${quote.id}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create — BELOW the card, styled exactly like the create page's
          submit button; the create sheet rises as an OVERLAY over this tab
          (no navigation, nothing goes white). */}
      <button
        className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#711419] py-3.5 text-base font-semibold text-white shadow-md transition-transform active:scale-[0.98]"
        onClick={() => setCreateOpen(true)}
        data-testid="button-start-quick-quote"
      >
        Create Quick Quote
      </button>

      {/* Portaled to body: inside the job page's z-10 stacking context the
          sheet's z-[70] lost to the floating back button (z-30 at root), so
          the button painted OVER the open sheet. */}
      {createOpen &&
        createPortal(
          <Suspense fallback={null}>
            <QuoteCreateOverlay jobId={workOrder.id} onClose={() => setCreateOpen(false)} />
          </Suspense>,
          document.body,
        )}

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
  const [createOverlay, setCreateOverlay] = useState<{ fromQuote?: string } | null>(null);
  const [showQuoteSelection, setShowQuoteSelection] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "check" | "card">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [showInvoiceEmailDialog, setShowInvoiceEmailDialog] = useState(false);
  const [generatingPaymentLinkForInvoice, setGeneratingPaymentLinkForInvoice] = useState<string | null>(null);
  const [invoiceEmailRecipient, setInvoiceEmailRecipient] = useState("");
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);

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

  const openPaymentDialog = (invoice: CrmInvoice) => {
    setPaymentInvoiceId(invoice.id);
    const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");
    setPaymentAmount(balanceDue.toFixed(2));
    setPaymentMethod("cash");
    setPaymentReference("");
    setShowPaymentDialog(true);
  };

  const handleTakePayment = async (invoice: CrmInvoice) => {
    const balanceDue = parseFloat(invoice.balanceDue || invoice.total || "0");
    if (balanceDue <= 0) {
      toast({ title: "No Balance Due", description: "This invoice has already been paid.", variant: "destructive" });
      return;
    }
    
    setGeneratingPaymentLinkForInvoice(invoice.id);
    try {
      const response = await fetch(`/api/stripe/invoice/${invoice.id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to create payment link");
      }
      
      if (result.paymentLinkUrl) {
        window.open(result.paymentLinkUrl, '_blank');
      } else {
        throw new Error("No payment link received");
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create payment link", 
        variant: "destructive" 
      });
      setGeneratingPaymentLinkForInvoice(null);
    }
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

  // Create invoice from quote — the create sheet overlays this tab with the
  // job AND the quote pre-selected; the sheet prefills the line items.
  const createFromQuote = (quote: CrmQuote & { lineItems?: CrmQuoteLineItem[] }) => {
    setShowQuoteSelection(false);
    setCreateOverlay({ fromQuote: quote.id });
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
                          {(invoice.status === "draft" || invoice.status === "sent" || invoice.status === "partial") && parseFloat(invoice.balanceDue || invoice.total || "0") > 0 && (
                            <>
                              <Button
                                className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700"
                                onClick={() => handleTakePayment(invoice)}
                                disabled={generatingPaymentLinkForInvoice === invoice.id}
                                data-testid={`button-take-payment-${invoice.id}`}
                              >
                                {generatingPaymentLinkForInvoice === invoice.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <CreditCard className="h-4 w-4 mr-2" />
                                )}
                                Take Card Payment
                              </Button>
                              <Button
                                variant="outline"
                                className="w-full min-h-[44px]"
                                onClick={() => openPaymentDialog(invoice)}
                                data-testid={`button-record-payment-${invoice.id}`}
                              >
                                <DollarSign className="h-4 w-4 mr-2" />
                                Record Cash/Check
                              </Button>
                            </>
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

      {/* Create — BELOW the invoices card, same structure as the Quote tab:
          the create sheet rises as an OVERLAY over this tab (no navigation,
          nothing goes white); from-quote pre-fills the line items. */}
      <button
        className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#711419] py-3.5 text-base font-semibold text-white shadow-md transition-transform active:scale-[0.98]"
        onClick={() => setCreateOverlay({})}
        data-testid="button-show-create-invoice-form"
      >
        Create Invoice
      </button>
      {allAvailableQuotes.length > 0 && (
        <button
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl border border-[#711419]/30 bg-white py-3.5 text-base font-semibold text-[#711419] shadow-sm transition-transform active:scale-[0.98]"
          onClick={() => setShowQuoteSelection(true)}
          data-testid="button-create-invoice-from-quote"
        >
          Create from Quote ({allAvailableQuotes.length})
        </button>
      )}

      {/* Portaled to body — same stacking-context escape as the quote sheet */}
      {createOverlay &&
        createPortal(
          <Suspense fallback={null}>
            <InvoiceCreateOverlay
              jobId={workOrder.id}
              fromQuoteId={createOverlay.fromQuote}
              onClose={() => setCreateOverlay(null)}
            />
          </Suspense>,
          document.body,
        )}

      {/* Pick which accepted quote the invoice comes from — a HOUSE bottom
          sheet, not a popup */}
      <DraggableSheet tall open={showQuoteSelection} onOpenChange={setShowQuoteSelection} title="Select quote" testid="sheet-quote-selection">
        <h2 className="text-lg font-semibold text-slate-900">Invoice from a quote</h2>
        <p className="mt-0.5 text-sm text-slate-500">Choose the accepted quote to bill.</p>
        <div className="mt-3 min-h-[35vh] space-y-4 pb-2">
            {customerQuotesLoading ? (
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
                        <button
                          key={quote.id}
                          className="w-full rounded-[4px] border border-slate-300/70 bg-white p-3 text-left transition-transform active:scale-[0.99]"
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
                        </button>
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
                        <button
                          key={quote.id}
                          className="w-full rounded-[4px] border border-slate-300/70 bg-white p-3 text-left transition-transform active:scale-[0.99]"
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
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
        </div>
      </DraggableSheet>

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

    </div>
  );
}

// idOverride/tabOverride let another page mount this one as a back-swipe
// UNDERLAY (e.g. quote detail revealing the job's Quote tab) — the route
// params belong to the page on top, so they can't be read here.
export default function MobileJobDetail({ idOverride, tabOverride }: { idOverride?: string; tabOverride?: TabType } = {}) {
  useRequireCrmAuth();
  const entered = usePushEntrance();
  // Arriving as the tail end of a sheet-close (create quote/invoice ghost
  // sliding down): the page beneath must land STATIC — no entrance slide
  // playing under the descending sheet.
  const [skipEnter] = useState(() => skipEntranceOnce());
  const params = useParams<{ id: string }>();
  const workOrderId = parseInt(idOverride ?? params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [noteInput, setNoteInput] = useState("");
  const { isOnline } = useOnlineStatus();
  const pendingNotes = usePendingNotes(workOrderId);

  // Parse tab from query string
  const initialTab = (): TabType => {
    if (tabOverride) return tabOverride;
    const params = new URLSearchParams(searchString);
    const tab = params.get("tab");
    if (tab === "work" || tab === "quote" || tab === "invoice") {
      return tab;
    }
    return "overview";
  };

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Slide-out + swipe-right back to the jobs list (iOS-style)
  const pageRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const leavingRef = useRef(false);
  const goBackAnimated = (fromDx = 0) => {
    // Double-fired exits (fast double-tap on the arrow) must not run the
    // leave animation twice.
    if (leavingRef.current) return;
    leavingRef.current = true;
    // The jobs page is already on screen as the underlay — its remount after
    // navigation must not fade in again (the post-swipe "flash").
    markSkipEntrance();
    const el = pageRef.current;
    if (!el) return navigate("/mobile/job");
    const w = el.clientWidth || window.innerWidth;
    const startP = Math.max(0, Math.min(1, fromDx / w));
    const dur = 200 * (1 - startP) + 40;
    setShowUnderlay(true);
    requestAnimationFrame(() => {
      el.style.animation = "none";
      el.style.borderRadius = "24px 0 0 24px";
      el.style.transition = `transform ${dur}ms ease-in`;
      el.style.transform = "translateX(100%)";
      // The floating controls hold still while the page leaves — they fade
      // out as the swipe commits, exactly like the customer detail page.
      for (const btn of [backRef.current, actionsRef.current]) {
        if (!btn) continue;
        btn.style.transition = `opacity ${Math.max(120, dur - 40)}ms ease-out`;
        btn.style.opacity = "0";
        btn.style.pointerEvents = "none";
      }
      pageUnderlayRef.current?.animate(
        [{ transform: `translateX(${-25 * (1 - startP)}%)` }, { transform: "translateX(0)" }],
        { duration: dur, easing: "ease-out", fill: "forwards" },
      );
      pageScrimRef.current?.animate(
        [{ opacity: String(0.18 * (1 - startP)) }, { opacity: "0" }],
        { duration: dur, easing: "linear", fill: "forwards" },
      );
      setTimeout(() => navigate("/mobile/job"), dur - 10);
    });
  };
  const swipeDrag = useRef<{ id: number; x: number; y: number; engaged: boolean; active: boolean; section: boolean } | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const pageUnderlayRef = useRef<HTMLDivElement | null>(null);
  const pageScrimRef = useRef<HTMLDivElement | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const sectionsRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const contentRef = sectionsRef; // sections layer is the swipe/scroll target
  const tabScroll = useRef<Record<string, number>>({});

  // Parallax layer states: while a section is open, the Overview sits
  // beneath it shifted left with a light scrim — exactly like an iOS
  // navigation stack, so swiping a section away reveals it dynamically.
  const setOpenLayerStyles = () => {
    if (overviewRef.current) overviewRef.current.style.transform = "translateX(-25%)";
    if (scrimRef.current) scrimRef.current.style.opacity = "0.18";
    if (sectionsRef.current) sectionsRef.current.style.transform = "";
  };
  const setClosedLayerStyles = () => {
    if (overviewRef.current) overviewRef.current.style.transform = "";
    if (scrimRef.current) scrimRef.current.style.opacity = "0";
  };
  // Filled (fill:"forwards") animations OUTLIVE their transition and keep
  // overriding inline styles forever — a leftover spring-back fill later
  // resurfaced and pinned the overview off the page. Every settle point
  // must cancel whatever is still attached to the layers.
  const cancelLayerAnimations = () => {
    for (const el of [overviewRef.current, scrimRef.current, sectionsRef.current]) {
      el?.getAnimations().forEach((a) => a.cancel());
    }
  };

  // Animate the section layer away (from an optional drag offset) and land
  // on the Overview — used by swipe commit, the back button, and the nav pill.
  const closeSectionAnimated = (fromDx = 0) => {
    const sec = sectionsRef.current;
    const ov = overviewRef.current;
    const scrim = scrimRef.current;
    if (!sec || activeTab === "overview") { setActiveTab("overview"); return; }
    layerBusy.current = true;
    tabScroll.current[activeTab] = sec.scrollTop;
    const w = sec.clientWidth || window.innerWidth;
    const startP = Math.max(0, Math.min(1, fromDx / w));
    const dur = 180 * (1 - startP) + 40;
    // fill:"forwards" holds every layer at its END state through the React
    // re-render — without it the animations released a frame before the
    // timeout and layers snapped to stale drag transforms.
    sec.animate(
      [{ transform: `translateX(${fromDx}px)` }, { transform: "translateX(100%)" }],
      { duration: dur, easing: "ease-in", fill: "forwards" },
    );
    ov?.animate(
      [{ transform: `translateX(${-25 * (1 - startP)}%)` }, { transform: "translateX(0)" }],
      { duration: dur, easing: "ease-out", fill: "forwards" },
    );
    scrim?.animate(
      [{ opacity: String(0.18 * (1 - startP)) }, { opacity: "0" }],
      { duration: dur, easing: "linear", fill: "forwards" },
    );
    setTimeout(() => {
      // Order matters: write the closed inline state, flip the tab (the
      // fills keep holding through the render), THEN cancel every animation
      // so no filled frame can resurface later.
      setClosedLayerStyles();
      if (sectionsRef.current) sectionsRef.current.style.transform = "";
      setActiveTab("overview");
      // Landing on the Overview — no under copy may outlive the card
      setSectionUnder(null);
      requestAnimationFrame(() => {
        cancelLayerAnimations();
        layerBusy.current = false;
      });
    }, dur);
  };

  // One transition at a time: a second back (arrow or swipe) firing while a
  // close was still settling double-drove the layers — the split-second
  // "content moved" glitch on the overview. Entries no-op while busy.
  const layerBusy = useRef(false);

  // Tab-bar switches land on the Overview with a shell-style CROSSFADE —
  // the section fades away over a static overview (same feel as switching
  // agenda → media). The iOS card slide stays exclusive to the edge swipe.
  const closeSectionFaded = () => {
    const sec = sectionsRef.current;
    if (!sec || activeTab === "overview") { setActiveTab("overview"); return; }
    layerBusy.current = true;
    tabScroll.current[activeTab] = sec.scrollTop;
    cancelLayerAnimations();
    if (overviewRef.current) overviewRef.current.style.transform = "";
    if (scrimRef.current) scrimRef.current.style.opacity = "0";
    sec.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease", fill: "forwards" });
    setTimeout(() => {
      setClosedLayerStyles();
      if (sectionsRef.current) sectionsRef.current.style.transform = "";
      setActiveTab("overview");
      // Landing on the Overview — no under copy may outlive the card
      setSectionUnder(null);
      requestAnimationFrame(() => {
        cancelLayerAnimations();
        layerBusy.current = false;
      });
    }, 210);
  };

  // The floating back (and the edge swipe) walk the tab trail: on
  // Work/Quote/Invoice they return to whichever tab you were on LAST; on
  // Overview they always leave the job.
  const tabHistory = useRef<TabType[]>([]);
  const tabBackPop = useRef(false);
  const popPrevTab = (): TabType => {
    const hist = tabHistory.current;
    let prev: TabType = "overview";
    while (hist.length) {
      const t = hist.pop()!;
      if (t !== activeTab) { prev = t; break; }
    }
    return prev;
  };
  // Non-destructive look at where the trail leads — the swipe needs to know
  // WHAT to reveal beneath the card before it commits (and pops).
  const peekPrevTab = (): TabType => {
    const hist = tabHistory.current;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i] !== activeTab) return hist[i];
    }
    return "overview";
  };
  // While a section-card swipe is in flight toward ANOTHER section, that
  // section renders as a parked under-layer so the drag reveals the actual
  // destination instead of always showing the Overview.
  const [sectionUnder, setSectionUnder] = useState<TabType | null>(null);
  const sectionUnderRef = useRef<HTMLDivElement | null>(null);
  const sectionUnderScrimRef = useRef<HTMLDivElement | null>(null);
  const handleFloatingBack = () => {
    // A back tapped mid-transition would double-drive the layers — wait out
    // the ~200ms settle instead.
    if (layerBusy.current) return;
    if (activeTab === "overview") {
      goBackAnimated();
      return;
    }
    const prev = popPrevTab();
    tabBackPop.current = true;
    switchTab(prev);
  };

  // A back-swipe fully REVEALS the destination as the under copy before the
  // real tab swaps in — replaying the tab-enter animation on that swap was
  // the post-swipe blink. The commit sets this flag; the swap paints static.
  const revealDoneRef = useRef(false);
  const [tabEnterAnim, setTabEnterAnim] = useState(true);

  // Switch tabs preserving each section's scroll position. Every tab-bar
  // switch is a shell-style crossfade: the incoming layer fades in over a
  // static page (the inner wrappers carry the same 0.2s fade via CSS).
  const switchTab = (next: TabType) => {
    if (next === activeTab) return;
    if (layerBusy.current) return; // one transition at a time
    setTabEnterAnim(!revealDoneRef.current);
    revealDoneRef.current = false;
    // Remember where you came FROM — unless this switch IS a back-pop
    if (!tabBackPop.current) tabHistory.current.push(activeTab);
    tabBackPop.current = false;
    if (next === "overview") { closeSectionFaded(); return; }
    const sec = sectionsRef.current;
    const fromOverview = activeTab === "overview";
    if (sec && !fromOverview) tabScroll.current[activeTab] = sec.scrollTop;
    setActiveTab(next);
    requestAnimationFrame(() => {
      const sec2 = sectionsRef.current;
      if (sec2) sec2.scrollTop = tabScroll.current[next] || 0;
    });
    if (fromOverview && sec) {
      // Fade the section in over the STATIC overview, then park the
      // overview beneath (parallax position) for the back gestures.
      layerBusy.current = true;
      cancelLayerAnimations();
      if (overviewRef.current) overviewRef.current.style.transform = "";
      if (scrimRef.current) scrimRef.current.style.opacity = "0";
      sec.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease", fill: "forwards" });
      setTimeout(() => {
        setOpenLayerStyles();
        requestAnimationFrame(() => {
          cancelLayerAnimations();
          layerBusy.current = false;
        });
      }, 210);
    }
  };

  // ── Section back-swipe — NATIVE touch drag on the section layer itself.
  // Pointer events die (pointercancel) the instant the section's scroller
  // claims a touch, which is why the pointer-driven version felt dead. The
  // touch stream keeps reporting, so the full-screen section card tracks
  // the finger with iOS corners, then commits along the tab trail. ──
  const activeTabRef = useRef<TabType>(activeTab);
  activeTabRef.current = activeTab;
  const closeSectionAnimatedRef = useRef(closeSectionAnimated);
  closeSectionAnimatedRef.current = closeSectionAnimated;
  const switchTabRef = useRef(switchTab);
  switchTabRef.current = switchTab;
  const popPrevTabRef = useRef(popPrevTab);
  popPrevTabRef.current = popPrevTab;
  const peekPrevTabRef = useRef(peekPrevTab);
  peekPrevTabRef.current = peekPrevTab;
  const setSectionUnderRef = useRef(setSectionUnder);
  setSectionUnderRef.current = setSectionUnder;
  const sectionSwipe = useRef<{ id: number; x: number; y: number; engaged: boolean } | null>(null);
  const attachSectionSwipe = () => {
    const el = sectionsRef.current;
    if (!el) return;
    const tracked = (list: TouchList) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].identifier === sectionSwipe.current?.id) return list[i];
      }
      return null;
    };
    const restoreChrome = () => {
      el.style.borderRadius = "";
    };
    const onStart = (e: TouchEvent) => {
      if (sectionSwipe.current || e.touches.length !== 1) return;
      if (activeTabRef.current === "overview") return;
      if (layerBusy.current) return; // a close is still settling
      const t = e.touches[0];
      if (t.clientX > 48) return;
      sectionSwipe.current = { id: t.identifier, x: t.clientX, y: t.clientY, engaged: false };
    };
    const onMove = (e: TouchEvent) => {
      const st = sectionSwipe.current;
      if (!st) return;
      const t = tracked(e.touches);
      if (!t) return;
      const dx = t.clientX - st.x;
      const dy = Math.abs(t.clientY - st.y);
      if (!st.engaged) {
        if (dx > 8 && dx > dy) {
          st.engaged = true;
          el.style.transition = "none";
          el.style.animation = "none";
          // Full-height iOS card while it rides the finger
          el.style.borderRadius = "24px 0 0 24px";
          // Any filled animation still attached would MASK the per-frame
          // inline writes below — start every drag clean.
          cancelLayerAnimations();
          // Reveal the ACTUAL destination beneath: another section mounts
          // as a parked under-layer; the overview reveal stays for the
          // trail's end.
          const prev = peekPrevTabRef.current();
          if (prev !== "overview") {
            setSectionUnderRef.current(prev);
            // Park the copy at the destination's remembered scroll — a copy
            // at the top would visibly jump when the real tab restores it.
            window.setTimeout(() => {
              const u = sectionUnderRef.current;
              if (u) u.scrollTop = tabScroll.current[prev] || 0;
            }, 30);
          }
          // Heading to the Overview: a copy left by a just-finished swipe
          // (its drop timer still pending) would hijack the reveal, then
          // vanish mid-drag when the timer fired — the overview jitter on
          // chained back-swipes. Drop it before the reveal starts.
          else setSectionUnderRef.current(null);
        } else if (dy > 14) {
          sectionSwipe.current = null;
          return;
        }
      }
      if (st.engaged) {
        if (e.cancelable) e.preventDefault();
        const off = Math.max(0, dx);
        el.style.transform = `translateX(${off}px)`;
        const w = el.clientWidth || window.innerWidth;
        const pr = Math.max(0, Math.min(1, off / w));
        const underEl = sectionUnderRef.current;
        if (underEl) {
          underEl.style.transform = `translateX(${-25 * (1 - pr)}%)`;
          if (sectionUnderScrimRef.current) sectionUnderScrimRef.current.style.opacity = String(0.18 * (1 - pr));
        } else {
          if (overviewRef.current) overviewRef.current.style.transform = `translateX(${-25 * (1 - pr)}%)`;
          if (scrimRef.current) scrimRef.current.style.opacity = String(0.18 * (1 - pr));
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      const st = sectionSwipe.current;
      if (!st) return;
      const t = tracked(e.changedTouches);
      if (!t) return; // only the tracked finger ends it
      sectionSwipe.current = null;
      if (!st.engaged) return;
      const dx = t.clientX - st.x;
      if (dx > Math.min(140, window.innerWidth * 0.33)) {
        const prev = popPrevTabRef.current();
        if (prev === "overview") {
          closeSectionAnimatedRef.current(Math.max(0, dx));
          window.setTimeout(restoreChrome, 260);
        } else {
          // Section-to-section: finish revealing the under-layer, then swap
          // the real tab in and drop the under copy once it's covered.
          layerBusy.current = true;
          const underEl = sectionUnderRef.current;
          const w2 = el.clientWidth || window.innerWidth;
          const startP = Math.max(0, Math.min(1, Math.max(0, dx) / w2));
          const dur = 180 * (1 - startP) + 40;
          el.style.transition = `transform ${dur}ms ease-in`;
          el.style.transform = "translateX(100%)";
          underEl?.animate(
            [{ transform: underEl.style.transform || `translateX(${-25 * (1 - startP)}%)` }, { transform: "translateX(0)" }],
            { duration: dur, easing: "ease-out", fill: "forwards" },
          );
          sectionUnderScrimRef.current?.animate(
            [{ opacity: sectionUnderScrimRef.current.style.opacity || "0.18" }, { opacity: "0" }],
            { duration: dur, easing: "linear", fill: "forwards" },
          );
          window.setTimeout(() => {
            layerBusy.current = false; // release BEFORE the guarded switch
            tabBackPop.current = true;
            // The copy IS the destination, fully revealed — swap the real tab
            // in SYNCHRONOUSLY (async render left one frame of the old tab
            // when the transform reset below snapped the card back: the
            // post-swipe flash), with its enter animation suppressed and its
            // scroll restored before the frame paints.
            revealDoneRef.current = true;
            flushSync(() => switchTabRef.current(prev));
            el.style.transition = "none";
            el.style.transform = "";
            el.scrollTop = tabScroll.current[prev] || 0;
            restoreChrome();
            requestAnimationFrame(() => {
              el.style.transition = "";
            });
            // The real tab is painted over the copy now — drop the copy.
            // Unless a NEW swipe is already riding it: unmounting mid-drag
            // swaps the reveal under the finger. Its own settle cleans up.
            window.setTimeout(() => {
              if (!sectionSwipe.current) setSectionUnderRef.current(null);
            }, 240);
          }, dur - 10);
        }
      } else {
        el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
        el.style.transform = "translateX(0)";
        const underEl = sectionUnderRef.current;
        if (underEl) {
          underEl.animate(
            [{ transform: underEl.style.transform || "translateX(-25%)" }, { transform: "translateX(-25%)" }],
            { duration: 260, easing: "ease-out", fill: "forwards" },
          );
          sectionUnderScrimRef.current?.animate(
            [{ opacity: sectionUnderScrimRef.current.style.opacity || "0.18" }, { opacity: "0.18" }],
            { duration: 260, easing: "linear", fill: "forwards" },
          );
        } else {
          overviewRef.current?.animate(
            [{ transform: overviewRef.current.style.transform || "translateX(-25%)" }, { transform: "translateX(-25%)" }],
            { duration: 260, easing: "ease-out", fill: "forwards" },
          );
          scrimRef.current?.animate(
            [{ opacity: scrimRef.current.style.opacity || "0.18" }, { opacity: "0.18" }],
            { duration: 260, easing: "linear", fill: "forwards" },
          );
        }
        window.setTimeout(() => {
          // A new drag may already be riding the layers — writing parked
          // styles (or dropping the copy) now would yank them mid-swipe.
          if (sectionSwipe.current) return;
          el.style.transition = "";
          restoreChrome();
          if (overviewRef.current) overviewRef.current.style.transform = "translateX(-25%)";
          if (scrimRef.current) scrimRef.current.style.opacity = "0.18";
          // Drop the filled spring-back animations so they can't mask (or
          // later resurface over) the inline layer states.
          cancelLayerAnimations();
          // The card is fully back over the page — the under copy can go
          setSectionUnderRef.current(null);
        }, 300);
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  };

  const springBack = () => {
    const el = pageRef.current;
    if (!el) return;
    el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
    el.style.transform = "translateX(0)";
    for (const b of [backRef.current, actionsRef.current]) {
      if (b) {
        b.style.transition = "opacity 0.25s ease-out";
        b.style.opacity = "1";
      }
    }
    setTimeout(() => {
      if (el) {
        el.style.transition = "";
        el.style.borderRadius = "";
      }
      for (const b of [backRef.current, actionsRef.current]) {
        if (b) {
          b.style.transition = "";
          b.style.opacity = "";
        }
      }
    }, 290);
  };
  const onSwipeStart = (e: React.PointerEvent) => {
    // A second finger mid-swipe must not hijack or wipe the gesture
    if (swipeDrag.current) return;
    // A section close is still settling — starting the page exit now would
    // stack two transitions and glitch the overview for a frame.
    if (layerBusy.current) return;
    // Sections have their OWN native-touch back-swipe (pointer events die
    // to pointercancel inside their scroller) — this pointer drag is the
    // Overview's whole-page exit only.
    if (activeTab !== "overview") return;
    // Wider start zone — Android's system gesture owns the outermost edge,
    // so fingers landing "near the left" must still catch our drag.
    if (e.clientX > 48) return;
    swipeDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: false, active: true, section: false };
    // Mount the Jobs page underneath NOW, while the finger is still parked —
    // mounting it mid-drag left the first exposed frames empty (the "weird
    // vertical strip" on a fresh open). If this turns out to be a tap or a
    // vertical scroll, onSwipeEnd unmounts it again.
    setShowUnderlay(true);
    pageRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const st = swipeDrag.current;
    const el = pageRef.current;
    if (!st?.active || st.id !== e.pointerId || !el) return;
    const dx = e.clientX - st.x;
    const dy = Math.abs(e.clientY - st.y);
    if (!st.engaged) {
      if (dx > 8 && dx > dy) {
        st.engaged = true;
        el.style.transition = "none";
        // The mount-time slide-in animation outranks inline transforms —
        // if it's still running, the page ignores the finger and then
        // jumps. Kill it before dragging.
        el.style.animation = "none";
        setShowUnderlay(true);
        // iOS-card curve while the page rides the finger
        el.style.borderRadius = "24px 0 0 24px";
      }
      else if (dy > 14) { st.active = false; setShowUnderlay(false); return; }
    }
    if (st.engaged) {
      const off = Math.max(0, dx);
      el.style.transform = `translateX(${off}px)`;
      const w = el.clientWidth || window.innerWidth;
      const pr = Math.max(0, Math.min(1, off / w));
      if (pageUnderlayRef.current) pageUnderlayRef.current.style.transform = `translateX(${-25 * (1 - pr)}%)`;
      if (pageScrimRef.current) pageScrimRef.current.style.opacity = String(0.18 * (1 - pr));
      // The floating controls hold still but fade WITH the drag
      for (const b of [backRef.current, actionsRef.current]) {
        if (b) {
          b.style.transition = "none";
          b.style.opacity = String(1 - pr);
        }
      }
    }
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    const st = swipeDrag.current;
    if (!st || st.id !== e.pointerId) return; // only the tracked finger ends it
    swipeDrag.current = null;
    if (!st.engaged) {
      // Edge touch that never became a back-swipe (tap / vertical scroll) —
      // drop the pre-mounted underlay.
      setShowUnderlay(false);
      return;
    }
    const dx = e.clientX - st.x;
    const commit = dx > Math.min(140, window.innerWidth * 0.33);
    if (commit) {
      goBackAnimated(Math.max(0, e.clientX - st.x));
    } else {
      springBack();
      pageUnderlayRef.current?.animate(
        [{ transform: pageUnderlayRef.current.style.transform || "translateX(-25%)" }, { transform: "translateX(-25%)" }],
        { duration: 260, easing: "ease-out", fill: "forwards" },
      );
      pageScrimRef.current?.animate(
        [{ opacity: pageScrimRef.current.style.opacity || "0.18" }, { opacity: "0.18" }],
        { duration: 260, easing: "linear", fill: "forwards" },
      );
      setTimeout(() => setShowUnderlay(false), 320);
    }
  };


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
    staleTime: 5 * 1000, // near-live: dispatcher changes reach techs within ~10s
    refetchInterval: isOnline ? 10 * 1000 : false, // Auto-refresh every 10 seconds when online
    refetchOnWindowFocus: true, // Refresh when app comes back to foreground
  });

  // Attach the section touch-swipe once the layers actually render — the
  // loading skeleton mounts first, without the section layer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(attachSectionSwipe, [!!workOrder]);

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

  // The checklist dispatch assigned to this job — the tech fills it in the
  // field. Only needed until a response exists.
  const { data: assignedChecklist } = useQuery<AssignedChecklistTemplate | null>({
    queryKey: ["/api/crm/checklists/by-id", workOrder?.assignedChecklistId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/checklists/by-id/${workOrder!.assignedChecklistId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!workOrder?.assignedChecklistId,
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

  const isSupervisor = ["supervisor", "owner", "admin"].includes(currentUser?.role || "");
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
      // Patch the cache BEFORE dropping the optimistic value — clearing
      // first let the stale cached status flash the stepper backwards until
      // the refetch landed (the forward-back-forward stutter).
      queryClient.setQueryData<WorkOrderDetail>(["/api/crm/work-orders", params.id], (prev) =>
        prev ? { ...prev, status: variables.newStatus } : prev,
      );
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
        // Surface the server's reason (e.g. "Finish your current job first…")
        // instead of a generic failure.
        const raw = error instanceof Error ? error.message : "";
        let serverMessage = "";
        try {
          serverMessage = JSON.parse(raw.slice(raw.indexOf("{"))).message || "";
        } catch { /* not JSON — keep generic */ }
        toast({
          title: serverMessage || "Failed to update status",
          variant: "destructive",
        });
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

  const [optimisticPending, setOptimisticPending] = useState<{ isPending: boolean; reason?: string } | null>(null);

  const pendingMutation = useMutation({
    mutationFn: async ({ isPending, pendingReason, isReasonChange }: { isPending: boolean; pendingReason?: string; isReasonChange?: boolean }) => {
      const payload: any = { isPending };
      const pendingStartedAt = isPending && !isReasonChange ? new Date().toISOString() : (isReasonChange ? undefined : null);
      if (isPending) {
        payload.pendingReason = pendingReason || "waiting_on_parts";
        if (!isReasonChange) {
          payload.pendingStartedAt = pendingStartedAt;
        }
      } else {
        payload.pendingReason = null;
        payload.pendingStartedAt = null;
      }
      await apiRequest("PATCH", `/api/crm/work-orders/${params.id}`, payload);
      return { isPending, pendingReason: payload.pendingReason, pendingStartedAt: payload.pendingStartedAt };
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(["/api/crm/work-orders", params.id], (old: WorkOrderDetail | undefined) => {
        if (!old) return old;
        const updates: Partial<WorkOrderDetail> = {
          isPending: result.isPending,
          pendingReason: result.pendingReason,
        };
        if (result.pendingStartedAt !== undefined) {
          updates.pendingStartedAt = result.pendingStartedAt;
        }
        return { ...old, ...updates };
      });
      setOptimisticPending(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({ 
        title: variables.isPending ? "Marked as waiting" : "Waiting status cleared"
      });
    },
    onError: () => {
      setOptimisticPending(null);
      toast({ title: "Failed to update waiting status", variant: "destructive" });
    },
  });

  const handlePendingChange = (isPending: boolean, reason?: string, isReasonChange?: boolean) => {
    setOptimisticPending({ isPending, reason });
    pendingMutation.mutate({ isPending, pendingReason: reason, isReasonChange });
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
    <div className="relative h-screen overflow-hidden bg-slate-50">
      {/* Real Jobs page beneath the detail — the WHOLE screen (bottom nav
          included) slides over it, so the swipe reads as one solid sheet
          with no seam between the page and the nav */}
      {showUnderlay && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden data-underlay>
          <div ref={pageUnderlayRef} className="h-full w-full" style={{ transform: "translateX(-25%)" }}>
            <MobileJob />
          </div>
          <div ref={pageScrimRef} className="absolute inset-0 bg-black" style={{ opacity: 0.18 }} />
        </div>
      )}
      {/* Floating back — OUTSIDE the sliding panel: it holds its spot while
          the page follows your finger, then fades away as the swipe commits.
          On every tab: sections walk back to the tab you were on last, the
          Overview leaves the job. Styled like the customer detail's back. */}
      <button
        ref={backRef}
        onClick={handleFloatingBack}
        className="fixed left-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-900/10 bg-white text-slate-700 shadow-sm transition-opacity active:scale-95"
        style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}
        data-testid="button-back"
        aria-label="Back"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      {/* Supervisor actions float top-right, same family as the customer
          page's Edit pill — they hold still and fade with the back arrow. */}
      {isSupervisor && (
        <div
          ref={actionsRef}
          className={`fixed right-3 z-30 flex items-center gap-2 transition-opacity ${
            activeTab === "overview" ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}
        >
          {!isAssignedToMe ? (
            <button
              onClick={() => assignToMeMutation.mutate()}
              disabled={assignToMeMutation.isPending}
              className="flex h-10 items-center gap-1.5 rounded-full bg-[#711419] px-4 text-sm font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-60"
              data-testid="button-assign-to-me"
            >
              {assignToMeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Assign to Me
            </button>
          ) : (
            <button
              onClick={() => setShowEditDialog(true)}
              className="flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
              data-testid="button-edit-work-order"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
      )}
      <div
        ref={pageRef}
        className={`${skipEnter ? "" : entered ? "page-slide-in" : "translate-x-full"} relative z-10 h-full shadow-[-14px_0_32px_rgba(0,0,0,0.12)]`}
        style={{ touchAction: "pan-y" }}
        onPointerDown={onSwipeStart}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeEnd}
        onPointerCancel={onSwipeEnd}
      >
      <MobileShell
        customNav={{
          tabs,
          activeId: activeTab,
          onSelect: (id) => switchTab(id as TabType),
        }}
      >
      <OfflineIndicator />
      <div className="relative flex h-full flex-col bg-slate-50">
        <div className="relative min-h-0 flex-1" data-testid="mobile-job-detail">
          {/* Base layer: the Overview hub — always mounted so it parallaxes
              beneath a section while you swipe it away */}
          <div ref={overviewRef} className="absolute inset-0 overflow-auto px-4 pb-28 pt-14">
            <OverviewTab
              onGoTab={(t) => switchTab(t as TabType)}
              workOrder={workOrder}
              checklistResponse={checklistResponse}
              optimisticStatus={optimisticStatus}
              updateStatusMutation={updateStatusMutation}
              handleStatusChange={handleStatusChange}
              renewalInfo={renewalInfo}
              onCollectRenewal={() => setShowCollectRenewalDialog(true)}
              onDeclineRenewal={() => setShowDeclineRenewalDialog(true)}
              onPendingChange={handlePendingChange}
              pendingMutation={pendingMutation}
              optimisticPending={optimisticPending}
            />
          </div>
        </div>

      </div>
      </MobileShell>

      {/* Scrim over the WHOLE page (status-bar strip included). Parked inside
          the shell content it started 56px down, so a section back-swipe
          revealed an undimmed strip above a dimmed overview — a visible seam
          that only equalized once the scrim finished fading. */}
      <div ref={scrimRef} className="pointer-events-none absolute inset-0 z-[15] bg-black" style={{ opacity: 0 }} />

      {/* Under-layer for section-to-section back-swipes: the tab the trail
          leads to, parked in parallax beneath the sliding card so the swipe
          reveals the ACTUAL destination (not always the Overview). */}
      {sectionUnder && workOrder && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden data-underlay>
          <div
            ref={sectionUnderRef}
            className="h-full w-full overflow-hidden bg-slate-50 px-4"
            style={{
              transform: "translateX(-25%)",
              paddingTop: "calc(env(safe-area-inset-top) + 56px)",
              paddingBottom: "calc(112px + env(safe-area-inset-bottom))",
            }}
          >
            {sectionUnder === "work" && (
              <WorkTab workOrder={workOrder} checklistResponse={checklistResponse} assignedChecklist={assignedChecklist ?? null} />
            )}
            {sectionUnder === "quote" && <QuoteTab workOrder={workOrder} />}
            {sectionUnder === "invoice" && (
              <InvoiceTab
                workOrder={workOrder}
                renewalInfo={renewalInfo}
                onCollectRenewal={() => setShowCollectRenewalDialog(true)}
                onDeclineRenewal={() => setShowDeclineRenewalDialog(true)}
              />
            )}
          </div>
          <div ref={sectionUnderScrimRef} className="absolute inset-0 bg-black" style={{ opacity: 0.18 }} />
        </div>
      )}

      {/* Top fade over the section card — content dissolves under the
          chrome instead of colliding with it, same as every list page. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[32] bg-gradient-to-b from-slate-50 via-slate-50/85 to-transparent"
        style={{
          height: "calc(env(safe-area-inset-top) + 72px)",
          display: activeTab === "overview" ? "none" : undefined,
        }}
        aria-hidden
      />

      {/* Section layer — a FULL-SCREEN card over the shell (status bar
          included) so the back-swipe rides a complete iOS card instead of a
          panel cut off at the top. The tab bar (z-40, inside the shell) and
          the floating back (fixed, outside the panel) stay above it. Stays
          mounted so entered data and scroll positions survive round trips. */}
      <div
        ref={sectionsRef}
        className="absolute inset-0 z-30 overflow-auto overscroll-y-contain bg-slate-50 px-4 shadow-[-14px_0_32px_rgba(0,0,0,0.12)]"
        style={{
          display: activeTab === "overview" ? "none" : undefined,
          paddingTop: "calc(env(safe-area-inset-top) + 56px)",
          paddingBottom: "calc(112px + env(safe-area-inset-bottom))",
        }}
      >
        {/* 1px over-height keeps short tabs scrollable, so every section
            rubber-bands under your thumb instead of feeling pinned. */}
        <div className="min-h-[calc(100%+1px)]">
          <div className={activeTab === "work" ? `${tabEnterAnim ? "job-tab-enter " : ""}block` : "hidden"}>
            <WorkTab workOrder={workOrder} checklistResponse={checklistResponse} assignedChecklist={assignedChecklist ?? null} />
          </div>
          <div className={activeTab === "quote" ? `${tabEnterAnim ? "job-tab-enter " : ""}block` : "hidden"}>
            <QuoteTab workOrder={workOrder} />
          </div>
          <div className={activeTab === "invoice" ? `${tabEnterAnim ? "job-tab-enter " : ""}block` : "hidden"}>
            <InvoiceTab
              workOrder={workOrder}
              renewalInfo={renewalInfo}
              onCollectRenewal={() => setShowCollectRenewalDialog(true)}
              onDeclineRenewal={() => setShowDeclineRenewalDialog(true)}
            />
          </div>
        </div>
      </div>
      </div>

      {/* Completion summary rides in as a bottom sheet, like every other
          in-job flow — drag down or tap the scrim to bail out. */}
      <DraggableSheet tall open={showCompletionModal} onOpenChange={setShowCompletionModal} title="Complete job" testid="completion-modal">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold text-slate-900">Complete Job</h2>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          Sum up the visit before marking it done.
        </p>
        <div className="mt-4 space-y-2">
          <Label htmlFor="completion-summary">Work Summary *</Label>
          <Textarea
            id="completion-summary"
            placeholder="Describe what work was performed, parts used, and any follow-up needed..."
            value={completionSummary}
            onChange={(e) => setCompletionSummary(e.target.value)}
            className="min-h-[140px]"
            data-testid="input-completion-summary"
          />
        </div>
        <button
          onClick={handleCompleteJob}
          disabled={!completionSummary.trim() || updateStatusMutation.isPending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-base font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-50"
          data-testid="button-confirm-completion"
        >
          {updateStatusMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
          Complete Job
        </button>
      </DraggableSheet>

      {/* Edit rides in as a bottom sheet like every other in-job flow */}
      <DraggableSheet
        tall
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) {
            setEditSelectedDate(undefined);
            setEditSelectedSlot(null);
          }
        }}
        title="Edit work order"
        testid="edit-work-order-modal"
      >
        <div className="flex items-center gap-2">
          <Pencil className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Edit Work Order</h2>
        </div>
        <p className="mb-4 mt-0.5 text-sm text-slate-500">Update work order details below.</p>
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
                  <PopoverContent className="z-[100] w-auto p-0" align="start">
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
                      <SelectContent className="z-[100]">
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

              <div className="flex gap-2 pb-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  disabled={editWorkOrderMutation.isPending}
                  className="min-h-[48px] flex-1"
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editWorkOrderMutation.isPending}
                  className="min-h-[48px] flex-[2] bg-[#711419] hover:bg-[#5a1014]"
                  data-testid="button-save-edit"
                >
                  {editWorkOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
      </DraggableSheet>

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
    </div>
  );
}
