import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Plus,
  ClipboardList,
  DollarSign,
  FileText,
  ExternalLink,
  Wrench,
  MapPin,
  FolderKanban,
  CheckCircle,
  AlertCircle,
  Receipt,
  Pin,
  PinOff,
  Image,
  File,
  MessageSquare,
  Activity,
  Filter,
  X,
  History,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { CrmUser, CrmProject, CrmWorkOrder, CrmInvoice, CrmQuote, CrmCustomer, CrmProperty } from "@shared/schema";

type ProjectDetail = CrmProject & {
  customerName: string | null;
  customer: CrmCustomer | null;
  property: CrmProperty | null;
  workOrders: CrmWorkOrder[];
  workOrderCount: number;
};

const projectStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  lead: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200" },
  proposal_sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  approved: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  in_progress: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  closed: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  archived: { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200" },
};

const projectStatusLabels: Record<string, string> = {
  lead: "Lead",
  proposal_sent: "Proposal Sent",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
  archived: "Archived",
};

const projectTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  INSTALL: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  DUCT: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  COMMERCIAL: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  MAINTENANCE_AGREEMENT: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  MAJOR_REPAIR: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const projectTypeLabels: Record<string, string> = {
  INSTALL: "Install",
  DUCT: "Duct",
  COMMERCIAL: "Commercial",
  MAINTENANCE_AGREEMENT: "Maintenance Agreement",
  MAJOR_REPAIR: "Major Repair",
};

const workOrderStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  en_route: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  on_site: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
};

const quoteStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  accepted: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  declined: { bg: "bg-red-100", text: "text-red-600", border: "border-red-200" },
  expired: { bg: "bg-orange-100", text: "text-orange-600", border: "border-orange-200" },
};

const invoiceStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  paid: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  void: { bg: "bg-red-100", text: "text-red-600", border: "border-red-200" },
  partial: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  overdue: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600" },
  normal: { bg: "bg-blue-100", text: "text-blue-700" },
  high: { bg: "bg-orange-100", text: "text-orange-700" },
  urgent: { bg: "bg-red-100", text: "text-red-700" },
};

const VISIT_TYPES = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;

function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return format(d, "MMM d, yyyy h:mm a");
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return format(d, "MMM d, yyyy");
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getPropertyAddress(property: CrmProperty | null): string {
  if (!property) return "No property";
  const parts = [
    property.address1,
    property.address2,
    property.city,
    property.state,
    property.zip,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No address";
}

export default function CrmProjectDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("overview");
  const [createQuoteDialogOpen, setCreateQuoteDialogOpen] = useState(false);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteDescription, setQuoteDescription] = useState("");
  
  const [scheduleWODialogOpen, setScheduleWODialogOpen] = useState(false);
  const [woTitle, setWoTitle] = useState("");
  const [woVisitType, setWoVisitType] = useState<string>("SERVICE");
  const [woScheduledStart, setWoScheduledStart] = useState("");
  const [woScheduledEnd, setWoScheduledEnd] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const { data: project, isLoading: projectLoading, error: projectError } = useQuery<ProjectDetail>({
    queryKey: ["/api/crm/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Project not found");
        throw new Error("Failed to fetch project");
      }
      return res.json();
    },
    enabled: !!currentUser && !!projectId,
  });

  const { data: quotes, isLoading: quotesLoading } = useQuery<CrmQuote[]>({
    queryKey: ["/api/crm/projects", projectId, "quotes"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${projectId}/quotes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    enabled: !!currentUser && !!projectId,
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<CrmInvoice[]>({
    queryKey: ["/api/crm/projects", projectId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${projectId}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!currentUser && !!projectId,
  });

  const createQuoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/quotes", {
        title: quoteTitle,
        description: quoteDescription,
        scope: "project",
        projectId: projectId,
        customerId: project?.customerId || project?.customer?.id,
        propertyId: project?.propertyId || project?.property?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "quotes"] });
      setCreateQuoteDialogOpen(false);
      setQuoteTitle("");
      setQuoteDescription("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create quote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/work-orders", {
        title: woTitle,
        visitType: woVisitType,
        projectId: projectId,
        customerId: project?.customerId || project?.customer?.id,
        propertyId: project?.propertyId || project?.property?.id,
        scheduledStart: woScheduledStart ? new Date(woScheduledStart).toISOString() : null,
        scheduledEnd: woScheduledEnd ? new Date(woScheduledEnd).toISOString() : null,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Work order scheduled successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setScheduleWODialogOpen(false);
      setWoTitle("");
      setWoVisitType("SERVICE");
      setWoScheduledStart("");
      setWoScheduledEnd("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to schedule work order",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const totalQuoted = (quotes || [])
    .filter((q) => q.status === "accepted")
    .reduce((sum, q) => sum + parseFloat(q.total?.toString() || "0"), 0);

  const totalInvoiced = (invoices || []).reduce(
    (sum, inv) => sum + parseFloat(inv.total?.toString() || "0"),
    0
  );

  const balanceDue = (invoices || []).reduce(
    (sum, inv) => sum + parseFloat(inv.balanceDue?.toString() || "0"),
    0
  );

  const workOrderCount = project?.workOrders?.length || 0;

  // Wait for auth to resolve before rendering anything
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800 mx-auto mb-4" />
          <p className="text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // After auth is resolved, redirect if not logged in
  if (!currentUser) {
    return null; // useEffect will redirect to login
  }

  if (projectLoading) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </CrmLayout>
    );
  }

  if (projectError || !project) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/crm/projects")}
            className="mb-4"
            data-testid="button-back-projects"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Project Not Found</h2>
              <p className="text-muted-foreground">
                {projectError?.message || "The requested project could not be found."}
              </p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const statusStyle = projectStatusColors[project.status] || projectStatusColors.lead;
  const typeStyle = projectTypeColors[project.projectType] || projectTypeColors.INSTALL;
  const priorityStyle = priorityColors[project.priority || "normal"];

  return (
    <CrmLayout currentUser={currentUser!}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/crm/projects")}
              data-testid="button-back-projects"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-project-title">{project.title}</h1>
              {project.customer && (
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                  <button
                    onClick={() => navigate(`/crm/customers/${project.customer?.id}`)}
                    className="flex items-center gap-1 hover:text-primary"
                    data-testid="link-customer"
                  >
                    <User className="w-4 h-4" />
                    {project.customerName || project.customer?.name}
                  </button>
                  {project.customer?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {project.customer.phone}
                    </span>
                  )}
                  {project.customer?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      {project.customer.email}
                    </span>
                  )}
                </div>
              )}
              {project.property && (
                <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  {getPropertyAddress(project.property)}
                </div>
              )}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
            <TabsTrigger 
              value="overview" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-overview"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="work-orders" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-work-orders"
            >
              Work Orders ({workOrderCount})
            </TabsTrigger>
            <TabsTrigger 
              value="quotes" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-quotes"
            >
              Quotes ({quotes?.length || 0})
            </TabsTrigger>
            <TabsTrigger 
              value="invoices" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-invoices"
            >
              Invoices ({invoices?.length || 0})
            </TabsTrigger>
            <TabsTrigger 
              value="timeline" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-timeline"
            >
              Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-6">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold">Project Details</CardTitle>
              </CardHeader>
              <CardContent>
                {project.description && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-slate-700">{project.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Proposal Sent</p>
                    <p className="text-sm text-slate-700">{formatDate(project.proposalSentAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Approved</p>
                    <p className="text-sm text-slate-700">{formatDate(project.approvedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Completed</p>
                    <p className="text-sm text-slate-700">{formatDate(project.completedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Closed</p>
                    <p className="text-sm text-slate-700">{formatDate(project.closedAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card data-testid="card-total-quoted">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Quoted</p>
                      <p className="text-xl font-semibold">{formatCurrency(totalQuoted)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-invoiced">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Receipt className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Invoiced</p>
                      <p className="text-xl font-semibold">{formatCurrency(totalInvoiced)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-balance-due">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${balanceDue > 0 ? "bg-orange-100" : "bg-green-100"}`}>
                      <DollarSign className={`w-5 h-5 ${balanceDue > 0 ? "text-orange-600" : "text-green-600"}`} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Balance Due</p>
                      <p className={`text-xl font-semibold ${balanceDue > 0 ? "text-orange-600" : ""}`}>
                        {formatCurrency(balanceDue)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-work-orders-count">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <ClipboardList className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Work Orders</p>
                      <p className="text-xl font-semibold">{workOrderCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Expected Value</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(project.expectedValue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Actual Value</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(project.actualValue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Created</span>
                  </div>
                  <p className="text-lg font-semibold">{formatDate(project.createdAt)}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="work-orders" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Work Orders</CardTitle>
                <Button onClick={() => setScheduleWODialogOpen(true)} data-testid="button-schedule-work-order">
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule Work Order
                </Button>
              </CardHeader>
              <CardContent>
                {project.workOrders && project.workOrders.length > 0 ? (
                  <div className="space-y-3">
                    {project.workOrders.map((wo) => {
                      const woStatus = workOrderStatusColors[wo.status] || workOrderStatusColors.scheduled;
                      return (
                        <div
                          key={wo.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                          onClick={() => navigate(`/crm/work-orders/${wo.id}`)}
                          data-testid={`card-work-order-${wo.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-purple-100 rounded-lg">
                              <Wrench className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {wo.title || `WO #${wo.workOrderNumber}`}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                {wo.scheduledStart ? formatDateTime(wo.scheduledStart) : "Not scheduled"}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={`${woStatus.bg} ${woStatus.text} border ${woStatus.border}`}>
                              {wo.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Badge>
                            <ExternalLink className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No work orders yet</p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => setScheduleWODialogOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Schedule First Work Order
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Quotes</CardTitle>
                <Button onClick={() => setCreateQuoteDialogOpen(true)} data-testid="button-create-quote">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Quote
                </Button>
              </CardHeader>
              <CardContent>
                {quotesLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : quotes && quotes.length > 0 ? (
                  <div className="space-y-3">
                    {quotes.map((quote) => {
                      const qStatus = quoteStatusColors[quote.status] || quoteStatusColors.draft;
                      return (
                        <div
                          key={quote.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                          data-testid={`card-quote-${quote.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-green-100 rounded-lg">
                              <FileText className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                              <p className="font-medium">{quote.title || `Quote #${quote.id.slice(0, 8)}`}</p>
                              <p className="text-sm text-muted-foreground">
                                Created {formatDate(quote.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{formatCurrency(quote.total)}</span>
                            <Badge className={`${qStatus.bg} ${qStatus.text} border ${qStatus.border}`}>
                              {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No quotes yet</p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => setCreateQuoteDialogOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Quote
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : invoices && invoices.length > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Total Invoiced</p>
                        <p className="text-lg font-semibold">{formatCurrency(totalInvoiced)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Total Paid</p>
                        <p className="text-lg font-semibold text-green-600">
                          {formatCurrency(totalInvoiced - balanceDue)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Balance Due</p>
                        <p className={`text-lg font-semibold ${balanceDue > 0 ? "text-orange-600" : ""}`}>
                          {formatCurrency(balanceDue)}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {invoices.map((invoice) => {
                        const invStatus = invoiceStatusColors[invoice.status] || invoiceStatusColors.draft;
                        return (
                          <div
                            key={invoice.id}
                            className="flex items-center justify-between p-4 border rounded-lg"
                            data-testid={`card-invoice-${invoice.id}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="p-2 bg-blue-100 rounded-lg">
                                <Receipt className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium">
                                  Invoice #{invoice.invoiceNumber || invoice.id.slice(0, 8)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(invoice.createdAt)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="font-semibold">{formatCurrency(invoice.total)}</p>
                                {parseFloat(invoice.balanceDue?.toString() || "0") > 0 && (
                                  <p className="text-xs text-orange-600">
                                    Due: {formatCurrency(invoice.balanceDue)}
                                  </p>
                                )}
                              </div>
                              <Badge className={`${invStatus.bg} ${invStatus.text} border ${invStatus.border}`}>
                                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No invoices yet</p>
                    <p className="text-sm mt-1">Invoices are created from work orders</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <ProjectTimelineTab projectId={projectId!} />
          </TabsContent>
        </Tabs>

        <Dialog open={createQuoteDialogOpen} onOpenChange={setCreateQuoteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Quote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="quote-title">Title</Label>
                <Input
                  id="quote-title"
                  placeholder="Quote title"
                  value={quoteTitle}
                  onChange={(e) => setQuoteTitle(e.target.value)}
                  data-testid="input-quote-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-description">Description</Label>
                <Textarea
                  id="quote-description"
                  placeholder="Quote description"
                  value={quoteDescription}
                  onChange={(e) => setQuoteDescription(e.target.value)}
                  rows={4}
                  data-testid="input-quote-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateQuoteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createQuoteMutation.mutate()}
                disabled={!quoteTitle || createQuoteMutation.isPending}
                data-testid="button-submit-quote"
              >
                {createQuoteMutation.isPending ? "Creating..." : "Create Quote"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={scheduleWODialogOpen} onOpenChange={setScheduleWODialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Work Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="wo-title">Title</Label>
                <Input
                  id="wo-title"
                  placeholder="Work order title"
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                  data-testid="input-wo-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wo-visit-type">Visit Type</Label>
                <Select value={woVisitType} onValueChange={setWoVisitType}>
                  <SelectTrigger data-testid="select-wo-visit-type">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0) + type.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wo-scheduled-start">Scheduled Start</Label>
                <Input
                  id="wo-scheduled-start"
                  type="datetime-local"
                  value={woScheduledStart}
                  onChange={(e) => setWoScheduledStart(e.target.value)}
                  data-testid="input-wo-scheduled-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wo-scheduled-end">Scheduled End</Label>
                <Input
                  id="wo-scheduled-end"
                  type="datetime-local"
                  value={woScheduledEnd}
                  onChange={(e) => setWoScheduledEnd(e.target.value)}
                  data-testid="input-wo-scheduled-end"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setScheduleWODialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createWorkOrderMutation.mutate()}
                disabled={!woTitle || createWorkOrderMutation.isPending}
                data-testid="button-submit-wo"
              >
                {createWorkOrderMutation.isPending ? "Scheduling..." : "Schedule Work Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}

type ProjectActivityWithMeta = {
  id: string;
  projectId: string;
  workOrderId: string | null;
  userId: string | null;
  activityType: string;
  title: string;
  description: string | null;
  metadata: Record<string, any> | null;
  isPinned: boolean | null;
  createdAt: string | null;
  userName: string | null;
  workOrder: { id: string; workOrderNumber: number | null; title: string | null } | null;
};

const activityTypeIcons: Record<string, any> = {
  note: MessageSquare,
  photo: Image,
  file: File,
  status_change: Activity,
  financial: DollarSign,
  approval: CheckCircle,
  work_order_created: ClipboardList,
  work_order_completed: CheckCircle,
  quote_sent: FileText,
  quote_accepted: CheckCircle,
  invoice_sent: Receipt,
  invoice_paid: DollarSign,
};

const activityTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  note: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  photo: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  file: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
  status_change: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  financial: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  approval: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  work_order_created: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  work_order_completed: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  quote_sent: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  quote_accepted: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  invoice_sent: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  invoice_paid: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

const activityTypeLabels: Record<string, string> = {
  note: "Note",
  photo: "Photo",
  file: "File",
  status_change: "Status Change",
  financial: "Financial",
  approval: "Approval",
  work_order_created: "Work Order Created",
  work_order_completed: "Work Order Completed",
  quote_sent: "Quote Sent",
  quote_accepted: "Quote Accepted",
  invoice_sent: "Invoice Sent",
  invoice_paid: "Invoice Paid",
};

const filterOptions = [
  { value: "all", label: "All Activities" },
  { value: "note", label: "Notes" },
  { value: "photo", label: "Photos" },
  { value: "file", label: "Files" },
  { value: "financial", label: "Financial" },
  { value: "approval", label: "Approvals" },
  { value: "status_change", label: "Status Changes" },
];

function ProjectTimelineTab({ projectId }: { projectId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newActivityType, setNewActivityType] = useState("note");
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityDescription, setNewActivityDescription] = useState("");
  const [newActivityWorkOrderId, setNewActivityWorkOrderId] = useState("");

  const queryParams = new URLSearchParams();
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);
  if (pinnedOnly) queryParams.set("pinnedOnly", "true");

  const { data: activitiesData, isLoading, refetch } = useQuery<ProjectActivityWithMeta[]>({
    queryKey: ["/api/crm/projects", projectId, "activities", queryParams.toString()],
    queryFn: () => fetch(`/api/crm/projects/${projectId}/activities?${queryParams.toString()}`).then(r => r.json()),
  });
  const activities = Array.isArray(activitiesData) ? activitiesData : [];

  const { data: workOrdersData } = useQuery<{ id: string; workOrderNumber: number; title: string | null }[]>({
    queryKey: ["/api/crm/work-orders", { projectId }],
    queryFn: () => fetch(`/api/crm/work-orders?projectId=${projectId}`).then(r => r.json()).then(d => d.workOrders || []),
  });
  const workOrders = Array.isArray(workOrdersData) ? workOrdersData : [];

  const createActivityMutation = useMutation({
    mutationFn: async (data: { activityType: string; title: string; description?: string; workOrderId?: string }) => {
      return apiRequest("POST", `/api/crm/projects/${projectId}/activities`, data);
    },
    onSuccess: () => {
      toast({ title: "Activity added" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"], exact: false });
      setShowAddDialog(false);
      setNewActivityTitle("");
      setNewActivityDescription("");
      setNewActivityWorkOrderId("");
    },
    onError: () => {
      toast({ title: "Failed to add activity", variant: "destructive" });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ activityId, isPinned }: { activityId: string; isPinned: boolean }) => {
      return apiRequest("PATCH", `/api/crm/projects/${projectId}/activities/${activityId}`, { isPinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"], exact: false });
    },
  });

  const groupedByDay = activities.reduce((acc, activity) => {
    const date = activity.createdAt ? format(new Date(activity.createdAt), "yyyy-MM-dd") : "Unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(activity);
    return acc;
  }, {} as Record<string, ProjectActivityWithMeta[]>);

  const sortedDates = Object.keys(groupedByDay).sort((a, b) => b.localeCompare(a));

  const pinnedActivities = activities.filter(a => a.isPinned);
  const hasFilters = typeFilter !== "all" || startDate || endDate || pinnedOnly;

  const clearFilters = () => {
    setTypeFilter("all");
    setStartDate("");
    setEndDate("");
    setPinnedOnly(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            Project Timeline
          </CardTitle>
          <Button onClick={() => setShowAddDialog(true)} size="sm" data-testid="button-add-activity">
            <Plus className="w-4 h-4 mr-2" />
            Add Activity
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-activity-type-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {filterOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[140px]"
                placeholder="Start date"
                data-testid="input-start-date"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[140px]"
                placeholder="End date"
                data-testid="input-end-date"
              />
            </div>

            <Button
              variant={pinnedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setPinnedOnly(!pinnedOnly)}
              className="gap-1"
              data-testid="button-toggle-pinned"
            >
              <Pin className="w-4 h-4" />
              Pinned Only
            </Button>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="w-4 h-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>

          {pinnedActivities.length > 0 && !pinnedOnly && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Pin className="w-4 h-4" />
                Pinned Items
              </h4>
              <div className="space-y-2">
                {pinnedActivities.map(activity => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    onTogglePin={(isPinned) => togglePinMutation.mutate({ activityId: activity.id, isPinned })}
                    onNavigateToWorkOrder={(woId) => navigate(`/crm/work-orders/${woId}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No activities yet</p>
              <p className="text-sm mt-1">Add notes, photos, or track changes to build your timeline</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedDates.map(date => (
                <div key={date}>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {date === "Unknown" ? "Unknown Date" : format(new Date(date), "EEEE, MMMM d, yyyy")}
                  </h4>
                  <div className="space-y-2 ml-2 border-l-2 border-slate-200 pl-4">
                    {groupedByDay[date].map(activity => (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        onTogglePin={(isPinned) => togglePinMutation.mutate({ activityId: activity.id, isPinned })}
                        onNavigateToWorkOrder={(woId) => navigate(`/crm/work-orders/${woId}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={newActivityType} onValueChange={setNewActivityType}>
                <SelectTrigger data-testid="select-new-activity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="financial">Financial Update</SelectItem>
                  <SelectItem value="approval">Approval</SelectItem>
                  <SelectItem value="status_change">Status Change</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newActivityTitle}
                onChange={(e) => setNewActivityTitle(e.target.value)}
                placeholder="Activity title"
                data-testid="input-activity-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={newActivityDescription}
                onChange={(e) => setNewActivityDescription(e.target.value)}
                placeholder="Add more details..."
                rows={3}
                data-testid="input-activity-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Link to Work Order (optional)</Label>
              <Select value={newActivityWorkOrderId} onValueChange={setNewActivityWorkOrderId}>
                <SelectTrigger data-testid="select-link-work-order">
                  <SelectValue placeholder="Select a work order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {workOrders.map(wo => (
                    <SelectItem key={wo.id} value={wo.id}>
                      WO #{wo.workOrderNumber} - {wo.title || "Untitled"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createActivityMutation.mutate({
                activityType: newActivityType,
                title: newActivityTitle,
                description: newActivityDescription || undefined,
                workOrderId: newActivityWorkOrderId || undefined,
              })}
              disabled={!newActivityTitle || createActivityMutation.isPending}
              data-testid="button-submit-activity"
            >
              {createActivityMutation.isPending ? "Adding..." : "Add Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivityCard({
  activity,
  onTogglePin,
  onNavigateToWorkOrder,
}: {
  activity: ProjectActivityWithMeta;
  onTogglePin: (isPinned: boolean) => void;
  onNavigateToWorkOrder: (woId: string) => void;
}) {
  const IconComponent = activityTypeIcons[activity.activityType] || Activity;
  const colors = activityTypeColors[activity.activityType] || activityTypeColors.note;
  const label = activityTypeLabels[activity.activityType] || activity.activityType;

  return (
    <div
      className={`p-3 rounded-lg border ${colors.border} ${colors.bg} flex items-start gap-3`}
      data-testid={`activity-card-${activity.id}`}
    >
      <div className={`p-2 rounded-lg bg-white ${colors.border} border`}>
        <IconComponent className={`w-4 h-4 ${colors.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-sm">{activity.title}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
              <Badge variant="outline" className={`${colors.bg} ${colors.text} ${colors.border} text-xs`}>
                {label}
              </Badge>
              {activity.createdAt && (
                <span>{format(new Date(activity.createdAt), "h:mm a")}</span>
              )}
              {activity.userName && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {activity.userName}
                </span>
              )}
              {activity.workOrder && (
                <button
                  onClick={() => onNavigateToWorkOrder(activity.workOrder!.id)}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Wrench className="w-3 h-3" />
                  WO #{activity.workOrder.workOrderNumber}
                </button>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTogglePin(!activity.isPinned)}
            className={activity.isPinned ? "text-amber-600" : "text-muted-foreground"}
            data-testid={`button-toggle-pin-${activity.id}`}
          >
            {activity.isPinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
          </Button>
        </div>
        {activity.description && (
          <p className="text-sm text-muted-foreground mt-2">{activity.description}</p>
        )}
      </div>
    </div>
  );
}
