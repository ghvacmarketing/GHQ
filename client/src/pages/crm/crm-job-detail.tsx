import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle,
  Circle,
  XCircle,
  Navigation,
  Plus,
  ClipboardList,
  DollarSign,
  FileText,
  ExternalLink,
  RefreshCw,
  LayoutDashboard,
  MessageSquare,
  Image as ImageIcon,
  Settings,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { CrmUser, CrmJob, CrmProperty, CrmWorkOrder, CrmInvoice, CrmQuote } from "@shared/schema";
import { workOrderStatusEnum, type WorkOrderVisitType } from "@shared/schema";

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

  const [activeTab, setActiveTab] = useState("overview");
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
        if (res.status === 404) throw new Error("Project not found");
        throw new Error("Failed to fetch project");
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
        assignedTechId: workOrderForm.assignedTechId && workOrderForm.assignedTechId !== "unassigned" ? workOrderForm.assignedTechId : null,
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
      toast({ title: "Project deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      navigate("/crm/jobs");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete project",
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

  const getNextScheduledWorkOrder = () => {
    if (!job?.workOrders || job.workOrders.length === 0) return null;
    const upcoming = job.workOrders
      .filter(wo => wo.scheduledStart && new Date(wo.scheduledStart) >= new Date())
      .sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime());
    return upcoming[0] || null;
  };

  if (authLoading || jobLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
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
            All Projects
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <XCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Project not found</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const propertyAddress = job.property
    ? [job.property.address1, job.property.city, job.property.state].filter(Boolean).join(", ")
    : null;

  const nextWorkOrder = getNextScheduledWorkOrder();

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
                    Projects
                  </Button>
                </div>
                <h1
                  className="text-xl font-bold text-slate-900"
                  data-testid="text-job-title"
                >
                  {job.jobType} for {job.customerName}
                </h1>
                {propertyAddress && (
                  <p className="text-sm text-slate-500 mt-1" data-testid="text-job-subtitle">
                    {propertyAddress}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start bg-white border rounded-lg p-1 h-auto flex-wrap gap-1">
            <TabsTrigger
              value="overview"
              data-testid="tab-overview"
              className="data-[state=active]:bg-[#711419] data-[state=active]:text-white px-3 py-2"
            >
              <LayoutDashboard className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger
              value="work-orders"
              data-testid="tab-work-orders"
              className="data-[state=active]:bg-[#711419] data-[state=active]:text-white px-3 py-2"
            >
              <ClipboardList className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Work Orders</span>
            </TabsTrigger>
            <TabsTrigger
              value="quotes"
              data-testid="tab-quotes"
              className="data-[state=active]:bg-[#711419] data-[state=active]:text-white px-3 py-2"
            >
              <FileText className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Quotes</span>
            </TabsTrigger>
            <TabsTrigger
              value="invoices"
              data-testid="tab-invoices"
              className="data-[state=active]:bg-[#711419] data-[state=active]:text-white px-3 py-2"
            >
              <DollarSign className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Invoices & Payments</span>
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              data-testid="tab-notes"
              className="data-[state=active]:bg-[#711419] data-[state=active]:text-white px-3 py-2"
            >
              <MessageSquare className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Notes / Activity</span>
            </TabsTrigger>
            <TabsTrigger
              value="files"
              data-testid="tab-files"
              className="data-[state=active]:bg-[#711419] data-[state=active]:text-white px-3 py-2"
            >
              <ImageIcon className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Files / Photos</span>
            </TabsTrigger>
            <TabsTrigger
              value="equipment"
              data-testid="tab-equipment"
              className="data-[state=active]:bg-[#711419] data-[state=active]:text-white px-3 py-2"
            >
              <Settings className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Equipment</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <User className="h-4 w-4 text-[#711419]" />
                    Customer & Site
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
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
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <a href={`tel:${job.customerPhone}`} className="hover:text-[#711419]" data-testid="link-phone">
                        {job.customerPhone}
                      </a>
                    </div>
                  )}
                  {job.customerEmail && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <a href={`mailto:${job.customerEmail}`} className="hover:text-[#711419] truncate" data-testid="link-email">
                        {job.customerEmail}
                      </a>
                    </div>
                  )}
                  {job.property && (
                    <div className="pt-3 border-t">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Property</p>
                          <p className="font-medium text-sm text-slate-900" data-testid="text-address-line1">
                            {job.property.address1}
                          </p>
                          <p className="text-slate-600 text-sm" data-testid="text-address-city">
                            {job.property.city}, {job.property.state} {job.property.zip}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" asChild data-testid="button-directions">
                          <a href={getGoogleMapsUrl(job.property)} target="_blank" rel="noopener noreferrer">
                            <Navigation className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <DollarSign className="h-4 w-4 text-[#711419]" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Quotes</span>
                      <span className="font-medium" data-testid="text-quote-summary">
                        {formatCurrency(job.financialSummary?.quoteTotal || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Total Invoiced</span>
                      <span className="font-medium" data-testid="text-total-invoiced">
                        {formatCurrency(job.financialSummary?.totalInvoiced || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Total Paid</span>
                      <span className="font-medium text-green-600" data-testid="text-total-paid">
                        {formatCurrency(job.financialSummary?.totalPaid || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="font-semibold text-slate-700">Balance Due</span>
                      <span
                        className={`font-bold ${(job.financialSummary?.balanceDue || 0) > 0 ? "text-red-600" : "text-slate-700"}`}
                        data-testid="text-balance-due"
                      >
                        {formatCurrency(job.financialSummary?.balanceDue || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="shadow-sm cursor-pointer hover:border-[#711419]/30 transition-colors" onClick={() => setActiveTab("work-orders")}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <ClipboardList className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{job.workOrders?.length || 0} Work Orders</p>
                          <p className="text-xs text-slate-500">
                            {nextWorkOrder ? `Next: ${formatShortDate(nextWorkOrder.scheduledStart)}` : "No upcoming visits"}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm cursor-pointer hover:border-[#711419]/30 transition-colors" onClick={() => setActiveTab("quotes")}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{job.quotes?.length || 0} Quotes</p>
                          <p className="text-xs text-slate-500">
                            {job.financialSummary?.acceptedQuoteCount || 0} accepted
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm cursor-pointer hover:border-[#711419]/30 transition-colors" onClick={() => setActiveTab("invoices")}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{job.invoices?.length || 0} Invoices</p>
                          <p className="text-xs text-slate-500">
                            Balance: {formatCurrency(job.financialSummary?.balanceDue || 0)}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="work-orders" className="mt-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-4 border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <ClipboardList className="h-5 w-5 text-[#711419]" />
                    Work Orders
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setWorkOrderDialogOpen(true)}
                    className="bg-[#711419] hover:bg-[#5a1014]"
                    data-testid="button-add-work-order"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {job.workOrders && job.workOrders.length > 0 ? (
                  <div className="space-y-3">
                    {job.workOrders.map((wo, index) => {
                      const woStatusStyle = statusColors[wo.status] || statusColors.scheduled;
                      return (
                        <div
                          key={wo.id}
                          className="p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
                          data-testid={`work-order-card-${wo.id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-900">
                                  Visit #{wo.workOrderNumber || index + 1}
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openUpdateStatusDialog(wo)}
                              data-testid={`button-update-wo-status-${wo.id}`}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Update
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-500">
                    <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-slate-600">No work orders yet</p>
                    <p className="text-sm text-slate-400 mt-1">Schedule the first visit for this job</p>
                    <Button
                      className="mt-4 bg-[#711419] hover:bg-[#5a1014]"
                      onClick={() => setWorkOrderDialogOpen(true)}
                      data-testid="button-schedule-first-visit"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create Work Order
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes" className="mt-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-4 border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <FileText className="h-5 w-5 text-[#711419]" />
                    Quotes
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/crm/quotes/new?jobId=${jobId}`)}
                    className="bg-[#711419] hover:bg-[#5a1014]"
                    data-testid="button-add-quote"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {job.quotes && job.quotes.length > 0 ? (
                  <div className="space-y-2">
                    {job.quotes.map((quote: any) => {
                      const quoteStatusStyle = statusColors[quote.status] || statusColors.draft;
                      return (
                        <div
                          key={quote.id}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                          onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                          data-testid={`quote-row-${quote.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                              <FileText className="h-5 w-5 text-slate-500" />
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">Quote #{quote.quoteNumber || quote.id.slice(-6)}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge className={`${quoteStatusStyle.bg} ${quoteStatusStyle.text} text-xs`}>
                                  {quote.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(quote.total)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-slate-600">No quotes yet</p>
                    <p className="text-sm text-slate-400 mt-1">Create a quote for this job</p>
                    <Button
                      className="mt-4 bg-[#711419] hover:bg-[#5a1014]"
                      onClick={() => navigate(`/crm/quotes/new?jobId=${jobId}`)}
                      data-testid="button-create-first-quote"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create Quote
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-4 border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <DollarSign className="h-5 w-5 text-[#711419]" />
                    Invoices & Payments
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/crm/invoices/new?jobId=${jobId}`)}
                    className="bg-[#711419] hover:bg-[#5a1014]"
                    data-testid="button-add-invoice"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {job.invoices && job.invoices.length > 0 ? (
                  <div className="space-y-2">
                    {job.invoices.map((inv) => {
                      const invStatusStyle = statusColors[inv.status] || statusColors.draft;
                      return (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                          onClick={() => navigate(`/crm/invoices/${inv.id}`)}
                          data-testid={`invoice-row-${inv.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                              <DollarSign className="h-5 w-5 text-slate-500" />
                            </div>
                            <div>
                              <span className="font-medium text-slate-900">Invoice #{inv.invoiceNumber}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge className={`${invStatusStyle.bg} ${invStatusStyle.text} text-xs`}>
                                  {inv.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(inv.total)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-500">
                    <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-slate-600">No invoices yet</p>
                    <p className="text-sm text-slate-400 mt-1">Create an invoice for this job</p>
                    <Button
                      className="mt-4 bg-[#711419] hover:bg-[#5a1014]"
                      onClick={() => navigate(`/crm/invoices/new?jobId=${jobId}`)}
                      data-testid="button-create-first-invoice"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create Invoice
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <Card className="shadow-sm">
              <CardContent className="py-16 text-center">
                <MessageSquare className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Notes & Activity</h3>
                <p className="text-slate-500">Coming soon</p>
                <p className="text-sm text-slate-400 mt-2">Audit timeline and notes will be displayed here</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="mt-6">
            <Card className="shadow-sm">
              <CardContent className="py-16 text-center">
                <ImageIcon className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Files & Photos</h3>
                <p className="text-slate-500">Coming soon</p>
                <p className="text-sm text-slate-400 mt-2">Attachments and photos will be displayed here</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipment" className="mt-6">
            <Card className="shadow-sm">
              <CardContent className="py-16 text-center">
                <Settings className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Equipment</h3>
                <p className="text-slate-500">Coming soon</p>
                <p className="text-sm text-slate-400 mt-2">Equipment tied to this site/job will be displayed here</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
                <Select
                  value={workOrderForm.startTime}
                  onValueChange={(v) => setWorkOrderForm({ ...workOrderForm, startTime: v })}
                >
                  <SelectTrigger data-testid="select-start-time">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    <SelectItem value="08:00">8:00 AM</SelectItem>
                    <SelectItem value="09:00">9:00 AM</SelectItem>
                    <SelectItem value="10:00">10:00 AM</SelectItem>
                    <SelectItem value="11:00">11:00 AM</SelectItem>
                    <SelectItem value="12:00">12:00 PM</SelectItem>
                    <SelectItem value="13:00">1:00 PM</SelectItem>
                    <SelectItem value="14:00">2:00 PM</SelectItem>
                    <SelectItem value="15:00">3:00 PM</SelectItem>
                    <SelectItem value="16:00">4:00 PM</SelectItem>
                    <SelectItem value="17:00">5:00 PM</SelectItem>
                    <SelectItem value="18:00">6:00 PM</SelectItem>
                    <SelectItem value="19:00">7:00 PM</SelectItem>
                    <SelectItem value="20:00">8:00 PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Select
                  value={workOrderForm.endTime}
                  onValueChange={(v) => setWorkOrderForm({ ...workOrderForm, endTime: v })}
                >
                  <SelectTrigger data-testid="select-end-time">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    <SelectItem value="08:00">8:00 AM</SelectItem>
                    <SelectItem value="09:00">9:00 AM</SelectItem>
                    <SelectItem value="10:00">10:00 AM</SelectItem>
                    <SelectItem value="11:00">11:00 AM</SelectItem>
                    <SelectItem value="12:00">12:00 PM</SelectItem>
                    <SelectItem value="13:00">1:00 PM</SelectItem>
                    <SelectItem value="14:00">2:00 PM</SelectItem>
                    <SelectItem value="15:00">3:00 PM</SelectItem>
                    <SelectItem value="16:00">4:00 PM</SelectItem>
                    <SelectItem value="17:00">5:00 PM</SelectItem>
                    <SelectItem value="18:00">6:00 PM</SelectItem>
                    <SelectItem value="19:00">7:00 PM</SelectItem>
                    <SelectItem value="20:00">8:00 PM</SelectItem>
                  </SelectContent>
                </Select>
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
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
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
              {deleteJobMutation.isPending ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
