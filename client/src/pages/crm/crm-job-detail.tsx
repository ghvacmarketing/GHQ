import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  CheckCircle,
  Circle,
  XCircle,
  Navigation,
  Plus,
  CalendarPlus,
  ClipboardList,
  DollarSign,
  FileText,
  StickyNote,
  Paperclip,
  ExternalLink,
  RefreshCw,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { CrmUser, CrmJob, CrmProperty, CrmWorkOrder, CrmInvoice, CrmQuote } from "@shared/schema";
import { workOrderVisitTypeEnum, workOrderStatusEnum, type WorkOrderVisitType, type WorkOrderStatus } from "@shared/schema";

type WorkOrderWithTech = CrmWorkOrder & {
  techName?: string | null;
};

type FinancialSummary = {
  quoteTotal: number;
  quoteCount: number;
  acceptedQuoteCount: number;
  totalInvoiced: number;
  totalPaid: number;
  balanceDue: number;
  invoiceCount: number;
};

type JobDetail = CrmJob & {
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  assignedTechId: string | null;
  assignedTechName: string | null;
  assignedTechEmail: string | null;
  property: CrmProperty | null;
  workOrders: WorkOrderWithTech[];
  derivedStatus: string;
  invoices: CrmInvoice[];
  quotes: CrmQuote[];
  financialSummary: FinancialSummary;
};

type DispatchResponse = {
  technicians: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
};

const statusLabels: Record<string, string> = {
  new: "New",
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Complete",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Canceled",
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  invoiced: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  paid: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
  draft: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  viewed: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  accepted: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  declined: { bg: "bg-red-100", text: "text-red-600", border: "border-red-200" },
  expired: { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200" },
  pending: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  partial: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  overdue: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600" },
  normal: { bg: "bg-blue-100", text: "text-blue-600" },
  high: { bg: "bg-amber-100", text: "text-amber-600" },
  urgent: { bg: "bg-red-100", text: "text-red-600" },
};

const visitTypeLabels: Record<string, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  MAINTENANCE: "Maintenance",
  SALES: "Sales",
};

const workOrderStatusSteps = ["scheduled", "en_route", "on_site", "completed"] as const;

function formatShortDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return format(d, "EEE, MMM d");
}

function formatTimeRange(start: Date | string | null, end: Date | string | null): string {
  if (!start) return "Not scheduled";
  const s = new Date(start);
  const startTime = format(s, "h:mm a");
  if (!end) return startTime;
  const e = new Date(end);
  const endTime = format(e, "h:mm a");
  return `${startTime} - ${endTime}`;
}

function getGoogleMapsUrl(property: CrmProperty): string {
  const address = [
    property.address1,
    property.address2,
    property.city,
    property.state,
    property.zip,
  ]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function WorkOrderStatusSteps({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-1">
        <XCircle className="h-3 w-3 text-red-500" />
        <span className="text-xs text-red-600">Canceled</span>
      </div>
    );
  }

  const currentIndex = workOrderStatusSteps.indexOf(status as any);
  const isDispatched = status === "dispatched";

  return (
    <div className="flex items-center gap-1">
      {workOrderStatusSteps.map((step, index) => {
        const isCompleted = currentIndex > index || (status === "completed" && index <= currentIndex);
        const isCurrent = step === status || (isDispatched && step === "scheduled");

        return (
          <div key={step} className="flex items-center">
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center ${
                isCompleted
                  ? "bg-green-500"
                  : isCurrent
                  ? "bg-blue-500"
                  : "bg-slate-200"
              }`}
              title={statusLabels[step]}
            >
              {isCompleted ? (
                <CheckCircle className="h-3 w-3 text-white" />
              ) : (
                <Circle className="h-2 w-2 text-white" />
              )}
            </div>
            {index < workOrderStatusSteps.length - 1 && (
              <div
                className={`w-3 h-0.5 ${
                  currentIndex > index ? "bg-green-500" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CrmJobDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const { toast } = useToast();

  const [workOrderDialogOpen, setWorkOrderDialogOpen] = useState(false);
  const [updateWoStatusDialogOpen, setUpdateWoStatusDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderWithTech | null>(null);
  const [selectedWoStatus, setSelectedWoStatus] = useState<string>("");
  const [workOrderForm, setWorkOrderForm] = useState({
    visitType: "SERVICE" as WorkOrderVisitType,
    scheduledDate: "",
    startTime: "",
    endTime: "",
    assignedTechId: "",
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const { data: job, isLoading: jobLoading, error: jobError } = useQuery<JobDetail>({
    queryKey: ["/api/crm/jobs", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/jobs/${jobId}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Job not found");
        throw new Error("Failed to fetch job");
      }
      return res.json();
    },
    enabled: !!currentUser && !!jobId,
  });

  const { data: dispatchData } = useQuery<DispatchResponse>({
    queryKey: ["/api/crm/dispatch"],
    queryFn: async () => {
      const res = await fetch("/api/crm/dispatch", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch technicians");
      return res.json();
    },
    enabled: !!currentUser && workOrderDialogOpen,
  });

  const technicians = dispatchData?.technicians?.filter((t) => t.role === "tech") || [];

  const updateWorkOrderStatusMutation = useMutation({
    mutationFn: async ({ workOrderId, newStatus }: { workOrderId: string; newStatus: string }) => {
      const res = await apiRequest("PATCH", `/api/crm/work-orders/${workOrderId}`, {
        status: newStatus,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Work order status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      setUpdateWoStatusDialogOpen(false);
      setSelectedWorkOrder(null);
      setSelectedWoStatus("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      const startTime = workOrderForm.startTime || "08:00";
      const endTime = workOrderForm.endTime || "17:00";
      const scheduledStart = workOrderForm.scheduledDate
        ? new Date(`${workOrderForm.scheduledDate}T${startTime}`)
        : null;
      const scheduledEnd = workOrderForm.scheduledDate
        ? new Date(`${workOrderForm.scheduledDate}T${endTime}`)
        : null;

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        jobId,
        visitType: workOrderForm.visitType,
        scheduledStart: scheduledStart?.toISOString(),
        scheduledEnd: scheduledEnd?.toISOString(),
        assignedTechId: workOrderForm.assignedTechId || null,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Work order created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      setWorkOrderDialogOpen(false);
      setWorkOrderForm({
        visitType: "SERVICE",
        scheduledDate: "",
        startTime: "",
        endTime: "",
        assignedTechId: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create work order",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/jobs/${jobId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      navigate("/crm/jobs");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteJob = () => {
    deleteJobMutation.mutate();
    setDeleteConfirmOpen(false);
  };

  const handleUpdateWorkOrderStatus = () => {
    if (selectedWorkOrder && selectedWoStatus) {
      updateWorkOrderStatusMutation.mutate({
        workOrderId: selectedWorkOrder.id,
        newStatus: selectedWoStatus,
      });
    }
  };

  const handleCreateWorkOrder = () => {
    if (workOrderForm.scheduledDate) {
      createWorkOrderMutation.mutate();
    }
  };

  const openUpdateStatusDialog = (wo: WorkOrderWithTech) => {
    setSelectedWorkOrder(wo);
    setSelectedWoStatus(wo.status);
    setUpdateWoStatusDialogOpen(true);
  };

  if (authLoading || jobLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (jobError || !job) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="space-y-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/crm/jobs")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Jobs
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <XCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Job not found</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const derivedStatusStyle = statusColors[job.derivedStatus] || statusColors.new;
  const priorityStyle = priorityColors[job.priority || "normal"] || priorityColors.normal;
  const jobTypeStyle = { bg: "bg-slate-100", text: "text-slate-700" };

  const propertyAddress = job.property
    ? [job.property.address1, job.property.city, job.property.state].filter(Boolean).join(", ")
    : null;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/crm/jobs")}
                    className="-ml-2"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Jobs
                  </Button>
                </div>
                <h1
                  className="text-xl font-bold text-slate-900"
                  data-testid="text-job-title"
                >
                  {job.jobType} for {job.customerName}
                </h1>
                <p className="text-sm text-slate-500 mt-1" data-testid="text-job-subtitle">
                  {job.customerName}
                  {propertyAddress && ` • ${propertyAddress}`}
                </p>
              </div>

            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardList className="h-5 w-5 text-slate-500" />
                    Work Orders
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setWorkOrderDialogOpen(true)}
                    className="bg-[#711419] hover:bg-[#5a1014]"
                    data-testid="button-add-work-order"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Work Order
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {job.workOrders && job.workOrders.length > 0 ? (
                  <div className="space-y-3">
                    {job.workOrders.map((wo, index) => {
                      const woStatusStyle = statusColors[wo.status] || statusColors.scheduled;
                      return (
                        <div
                          key={wo.id}
                          className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                          data-testid={`work-order-card-${wo.id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-900">
                                  Visit #{wo.workOrderNumber || index + 1}
                                </span>
                                <span className="text-sm text-slate-600">
                                  {visitTypeLabels[wo.visitType || "SERVICE"]}
                                </span>
                                <Badge className={`${woStatusStyle.bg} ${woStatusStyle.text} text-xs`}>
                                  {statusLabels[wo.status] || wo.status}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-4 text-sm text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  <span>{formatShortDate(wo.scheduledStart)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{formatTimeRange(wo.scheduledStart, wo.scheduledEnd)}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 text-sm">
                                <User className="h-3.5 w-3.5 text-slate-400" />
                                <span className={wo.techName ? "text-slate-700" : "text-slate-400 italic"}>
                                  {wo.techName || "Unassigned"}
                                </span>
                              </div>

                              <div className="pt-1">
                                <WorkOrderStatusSteps status={wo.status} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openUpdateStatusDialog(wo)}
                                data-testid={`button-update-wo-status-${wo.id}`}
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                Update Status
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No work orders scheduled</p>
                    <Button
                      variant="link"
                      className="text-[#711419] mt-2"
                      onClick={() => setWorkOrderDialogOpen(true)}
                      data-testid="button-schedule-first-visit"
                    >
                      Schedule first visit
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="notes" className="border rounded-lg bg-white">
                <AccordionTrigger className="px-4 hover:no-underline" data-testid="accordion-notes">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-5 w-5 text-slate-500" />
                    <span className="font-semibold">Notes & Attachments</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Job Description</h4>
                      <p className="text-sm text-slate-600">
                        {job.description || "No description added yet."}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                        <Paperclip className="h-4 w-4" />
                        Attachments
                      </h4>
                      <p className="text-sm text-slate-500 italic">No attachments</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5 text-slate-500" />
                  Customer & Site
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-base font-semibold text-slate-900 hover:text-[#711419]"
                    onClick={() => navigate(`/crm/customers/${job.customerId}`)}
                    data-testid="link-customer"
                  >
                    {job.customerName}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>

                {job.customerPhone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <a
                      href={`tel:${job.customerPhone}`}
                      className="hover:text-[#711419]"
                      data-testid="link-phone"
                    >
                      {job.customerPhone}
                    </a>
                  </div>
                )}

                {job.customerEmail && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <a
                      href={`mailto:${job.customerEmail}`}
                      className="hover:text-[#711419] truncate"
                      data-testid="link-email"
                    >
                      {job.customerEmail}
                    </a>
                  </div>
                )}

                {job.property && (
                  <div className="pt-2 border-t">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-slate-500 mb-1">Property Address</p>
                        <p className="font-medium text-slate-900" data-testid="text-address-line1">
                          {job.property.address1}
                        </p>
                        {job.property.address2 && (
                          <p className="text-slate-600 text-sm">{job.property.address2}</p>
                        )}
                        <p className="text-slate-600 text-sm" data-testid="text-address-city">
                          {job.property.city}, {job.property.state} {job.property.zip}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        data-testid="button-directions"
                      >
                        <a
                          href={getGoogleMapsUrl(job.property)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                    {job.property.notes && (
                      <div className="mt-2 p-2 bg-amber-50 rounded text-sm text-amber-800">
                        <span className="font-medium">Property Notes:</span> {job.property.notes}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-slate-500" />
                  Financial Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Quotes</span>
                    <span className="font-medium" data-testid="text-quote-summary">
                      {formatCurrency(job.financialSummary?.quoteTotal || 0)}
                      <span className="text-xs text-slate-500 ml-1">
                        ({job.financialSummary?.quoteCount || 0} quote{(job.financialSummary?.quoteCount || 0) !== 1 ? "s" : ""}, {job.financialSummary?.acceptedQuoteCount || 0} accepted)
                      </span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Total Invoiced</span>
                    <span className="font-medium" data-testid="text-total-invoiced">
                      {formatCurrency(job.financialSummary?.totalInvoiced || 0)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Total Paid</span>
                    <span className="font-medium text-green-600" data-testid="text-total-paid">
                      {formatCurrency(job.financialSummary?.totalPaid || 0)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-medium text-slate-700">Balance Due</span>
                    <span
                      className={`font-bold ${
                        (job.financialSummary?.balanceDue || 0) > 0
                          ? "text-red-600"
                          : "text-slate-700"
                      }`}
                      data-testid="text-balance-due"
                    >
                      {formatCurrency(job.financialSummary?.balanceDue || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-slate-500" />
                    Invoices
                  </CardTitle>
                  <span className="text-sm text-slate-500">
                    {job.invoices?.length || 0} invoice{(job.invoices?.length || 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {job.invoices && job.invoices.length > 0 ? (
                  <div className="space-y-2">
                    {job.invoices.map((inv) => {
                      const invStatusStyle = statusColors[inv.status] || statusColors.draft;
                      return (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100 hover:bg-slate-100 cursor-pointer"
                          onClick={() => navigate(`/crm/invoices/${inv.id}`)}
                          data-testid={`invoice-row-${inv.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-slate-900">
                              #{inv.invoiceNumber}
                            </span>
                            <Badge className={`${invStatusStyle.bg} ${invStatusStyle.text} text-xs`}>
                              {inv.status}
                            </Badge>
                          </div>
                          <span className="font-medium text-sm">
                            {formatCurrency(inv.total)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">No invoices yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={updateWoStatusDialogOpen} onOpenChange={setUpdateWoStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Work Order Status</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {selectedWorkOrder && (
              <p className="text-sm text-slate-600 mb-4">
                Updating Visit #{selectedWorkOrder.workOrderNumber} ({visitTypeLabels[selectedWorkOrder.visitType || "SERVICE"]})
              </p>
            )}
            <Select value={selectedWoStatus} onValueChange={setSelectedWoStatus}>
              <SelectTrigger data-testid="select-wo-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {workOrderStatusEnum.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabels[status] || status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUpdateWoStatusDialogOpen(false);
                setSelectedWorkOrder(null);
                setSelectedWoStatus("");
              }}
              data-testid="button-cancel-wo-status"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateWorkOrderStatus}
              disabled={updateWorkOrderStatusMutation.isPending || !selectedWoStatus}
              className="bg-[#711419] hover:bg-[#5a1014]"
              data-testid="button-save-wo-status"
            >
              {updateWorkOrderStatusMutation.isPending ? "Saving..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={workOrderDialogOpen} onOpenChange={setWorkOrderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Visit Type</Label>
              <Select
                value={workOrderForm.visitType}
                onValueChange={(v) => setWorkOrderForm({ ...workOrderForm, visitType: v as WorkOrderVisitType })}
              >
                <SelectTrigger data-testid="select-visit-type">
                  <SelectValue placeholder="Select visit type" />
                </SelectTrigger>
                <SelectContent>
                  {workOrderVisitTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {visitTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scheduled Date *</Label>
              <Input
                type="date"
                value={workOrderForm.scheduledDate}
                onChange={(e) => setWorkOrderForm({ ...workOrderForm, scheduledDate: e.target.value })}
                data-testid="input-scheduled-date"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={workOrderForm.startTime}
                  onChange={(e) => setWorkOrderForm({ ...workOrderForm, startTime: e.target.value })}
                  data-testid="input-start-time"
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={workOrderForm.endTime}
                  onChange={(e) => setWorkOrderForm({ ...workOrderForm, endTime: e.target.value })}
                  data-testid="input-end-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign Technician (optional)</Label>
              <Select
                value={workOrderForm.assignedTechId}
                onValueChange={(v) => setWorkOrderForm({ ...workOrderForm, assignedTechId: v })}
              >
                <SelectTrigger data-testid="select-assign-tech">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWorkOrderDialogOpen(false)}
              data-testid="button-cancel-work-order"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkOrder}
              disabled={createWorkOrderMutation.isPending || !workOrderForm.scheduledDate}
              className="bg-[#711419] hover:bg-[#5a1014]"
              data-testid="button-create-work-order"
            >
              {createWorkOrderMutation.isPending ? "Creating..." : "Create Work Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent data-testid="dialog-delete-job">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this job? This action cannot be undone.
              All associated work orders, invoices, and quotes will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJob}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteJobMutation.isPending ? "Deleting..." : "Delete Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
