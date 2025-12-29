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
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold" data-testid="text-project-title">{project.title}</h1>
                <Badge className={`${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                  {projectStatusLabels[project.status] || project.status}
                </Badge>
                <Badge className={`${typeStyle.bg} ${typeStyle.text} border ${typeStyle.border}`}>
                  {projectTypeLabels[project.projectType] || project.projectType}
                </Badge>
                <Badge className={`${priorityStyle.bg} ${priorityStyle.text}`}>
                  {(project.priority || "normal").charAt(0).toUpperCase() + (project.priority || "normal").slice(1)} Priority
                </Badge>
              </div>
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="work-orders" data-testid="tab-work-orders">
              Work Orders ({workOrderCount})
            </TabsTrigger>
            <TabsTrigger value="quotes" data-testid="tab-quotes">
              Quotes ({quotes?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">
              Invoices ({invoices?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {project.description && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                    <p className="text-sm whitespace-pre-wrap">{project.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Proposal Sent</h4>
                    <p className="text-sm">{formatDate(project.proposalSentAt)}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Approved</h4>
                    <p className="text-sm">{formatDate(project.approvedAt)}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Completed</h4>
                    <p className="text-sm">{formatDate(project.completedAt)}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Closed</h4>
                    <p className="text-sm">{formatDate(project.closedAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
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
