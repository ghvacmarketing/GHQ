import { useState, useEffect, useMemo } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createLocalDateTime } from "@/lib/timezone";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
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
  Upload,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  ArrowRight,
  XCircle,
  Loader2,
  Trash2,
  Wand2,
  Clipboard,
  ClipboardCheck,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { 
  CrmUser, CrmProject, CrmWorkOrder, CrmInvoice, CrmQuote, CrmCustomer, CrmProperty,
  ActivityAttachment, NoteMetadata, PhotoMetadata, FileMetadata, FinancialMetadata, 
  ApprovalMetadata, StatusChangeMetadata, FinancialSubtype, ApprovalStatus,
  WorkOrderVisitType, WorkSubtype, ChecklistQuestion
} from "@shared/schema";
import { 
  projectActivityTypeEnum, financialSubtypeEnum, approvalStatusEnum,
  workOrderVisitTypeEnum
} from "@shared/schema";
import type { WorkOrderSubtype } from "@shared/schema";

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
  CRAWLSPACE: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  MAJOR_REPAIR: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const projectTypeLabels: Record<string, string> = {
  INSTALL: "Install",
  DUCT: "Duct",
  COMMERCIAL: "Commercial",
  CRAWLSPACE: "Crawlspace",
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

const visitTypeLabels: Record<string, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  MAINTENANCE: "Maintenance",
  SALES: "Sales",
};

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const WORK_SUBTYPE_TO_SERVICE_TYPE: Record<string, string> = {
  "No Heat": "NO_HEAT",
  "No Cool": "NO_AC",
  "Water Leak": "WATER_LEAK",
  "Electrical": "OTHER",
  "Thermostat": "THERMOSTAT_ISSUE",
  "Airflow": "OTHER",
  "Noise": "STRANGE_NOISE",
  "IAQ": "OTHER",
  "Other": "OTHER",
};

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
  const [woDescription, setWoDescription] = useState("");
  const [woVisitType, setWoVisitType] = useState<WorkOrderVisitType>("SERVICE");
  const [woWorkSubtype, setWoWorkSubtype] = useState<WorkSubtype>("Other");
  const [woPriority, setWoPriority] = useState<string>("normal");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [checklistQuestions, setChecklistQuestions] = useState<ChecklistQuestion[]>([]);
  const [checklistAnswers, setChecklistAnswers] = useState<Record<string, string | boolean | number>>({});
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [maintenanceSubtypes, setMaintenanceSubtypes] = useState<string[]>(["Preventative Maintenance"]);

  const timeOptions = (() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let min = 0; min < 60; min += 30) {
        if (hour === 20 && min > 0) break;
        const h = hour.toString().padStart(2, "0");
        const m = min.toString().padStart(2, "0");
        const value = `${h}:${m}`;
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const ampm = hour >= 12 ? "PM" : "AM";
        const label = `${displayHour}:${m.padStart(2, "0")} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  })();

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

  const { data: technicians = [] } = useQuery<{ id: string; name: string; email: string; role: string }[]>({
    queryKey: ["/api/crm/technicians"],
    enabled: !!currentUser,
  });

  // Query to fetch work order subtypes dynamically
  const { data: workOrderSubtypes = [] } = useQuery<WorkOrderSubtype[]>({
    queryKey: ["/api/crm/work-order-subtypes", { activeOnly: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/crm/work-order-subtypes?activeOnly=true", {
        credentials: "include",
      });
      return res.json();
    },
    enabled: !!currentUser,
  });

  // Helper to get subtypes for a visit type
  const getSubtypesForVisitType = (vt: WorkOrderVisitType) => {
    return workOrderSubtypes
      .filter(s => s.visitType === vt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  };

  // Fetch maintenance subtypes (includes custom agreement types) when MAINTENANCE is selected or dialog opens
  useEffect(() => {
    if (!scheduleWODialogOpen) return;
    if (woVisitType !== "MAINTENANCE") return;
    
    fetch("/api/crm/work-subtypes/MAINTENANCE", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMaintenanceSubtypes(data);
        }
      })
      .catch(() => {
        setMaintenanceSubtypes(["Preventative Maintenance"]);
      });
  }, [woVisitType, scheduleWODialogOpen]);

  useEffect(() => {
    if (!scheduleWODialogOpen) return;
    if (woVisitType !== "SERVICE") {
      setChecklistQuestions([]);
      setChecklistAnswers({});
      return;
    }

    const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[woWorkSubtype];
    if (!serviceType) {
      setChecklistQuestions([]);
      setChecklistAnswers({});
      return;
    }

    setChecklistLoading(true);
    fetch(`/api/crm/checklists/${serviceType}`, { credentials: "include" })
      .then(res => {
        if (!res.ok) {
          setChecklistQuestions([]);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data && data.questions) {
          setChecklistQuestions(data.questions);
          setChecklistAnswers({});
        } else {
          setChecklistQuestions([]);
        }
      })
      .catch(() => {
        setChecklistQuestions([]);
      })
      .finally(() => {
        setChecklistLoading(false);
      });
  }, [woVisitType, woWorkSubtype, scheduleWODialogOpen]);

  const generateLocalChecklistSummary = (): string => {
    if (checklistQuestions.length === 0) return "";
    
    const summaryParts: string[] = [];
    checklistQuestions.forEach(q => {
      const answer = checklistAnswers[q.id];
      if (answer !== undefined && answer !== "") {
        let answerText = String(answer);
        if (q.questionType === "yes_no") {
          answerText = answer === "yes" || answer === true ? "Yes" : "No";
        }
        summaryParts.push(`${q.question}: ${answerText}`);
      }
    });
    
    if (summaryParts.length === 0) return "";
    return "--- Service Call Checklist ---\n" + summaryParts.join("\n") + "\n---\n\n";
  };

  const areRequiredQuestionsAnswered = (): boolean => {
    if (woVisitType !== "SERVICE" || checklistQuestions.length === 0) return true;
    
    const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
    for (const q of requiredQuestions) {
      const answer = checklistAnswers[q.id];
      if (answer === undefined || answer === "" || answer === null) {
        return false;
      }
    }
    return true;
  };

  const generateChecklistSummary = async (): Promise<string> => {
    if (checklistQuestions.length === 0 || Object.keys(checklistAnswers).length === 0) return "";
    
    try {
      const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[woWorkSubtype] || "OTHER";
      const res = await apiRequest("POST", "/api/ai/summarize-checklist", {
        questions: checklistQuestions,
        answers: checklistAnswers,
        serviceType,
      });
      const data = await res.json();
      if (data.summary) {
        return "--- Service Call Summary ---\n" + data.summary + "\n---\n\n";
      }
    } catch (err) {
      console.error("AI summarization failed, using local fallback:", err);
    }
    
    return generateLocalChecklistSummary();
  };

  const resetWOForm = () => {
    setWoTitle("");
    setWoDescription("");
    setWoVisitType("SERVICE");
    setWoWorkSubtype("Other");
    setWoPriority("normal");
    setAssignedTechId("unassigned");
    setScheduledDate(new Date());
    setStartTime("08:00");
    setEndTime("10:00");
    setChecklistQuestions([]);
    setChecklistAnswers({});
    setShowChecklist(true);
  };

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
      toast({ title: "Quote created - opening proposal builder" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "quotes"] });
      setCreateQuoteDialogOpen(false);
      setQuoteTitle("");
      setQuoteDescription("");
      // Navigate to proposal builder with project and customer context
      const customerId = project?.customerId || project?.customer?.id;
      if (customerId) {
        navigate(`/crm/quotes/proposal/${customerId}?projectId=${projectId}`);
      }
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
      if (!scheduledDate) throw new Error("Scheduled date is required");
      
      if (!areRequiredQuestionsAnswered()) {
        const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
        const missingQuestions = requiredQuestions.filter(q => {
          const answer = checklistAnswers[q.id];
          return answer === undefined || answer === "" || answer === null;
        });
        throw new Error(`Please answer required checklist questions: ${missingQuestions.map(q => q.question).join(", ")}`);
      }

      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const [endHours, endMinutes] = endTime.split(":").map(Number);
      
      const scheduledStartUTC = createLocalDateTime(scheduledDate, startHours, startMinutes);
      const scheduledEndUTC = createLocalDateTime(scheduledDate, endHours, endMinutes);

      const checklistSummary = await generateChecklistSummary();
      const finalDescription = checklistSummary + (woDescription?.trim() || "");

      const title = woTitle.trim() || `${visitTypeLabels[woVisitType]} - ${woWorkSubtype}`;

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        title,
        description: finalDescription || `${visitTypeLabels[woVisitType]} work order`,
        visitType: woVisitType,
        workSubtype: woWorkSubtype,
        priority: woPriority,
        projectId: projectId,
        customerId: project?.customerId || project?.customer?.id,
        propertyId: project?.propertyId || project?.property?.id,
        scheduledStart: scheduledStartUTC.toISOString(),
        scheduledEnd: scheduledEndUTC.toISOString(),
        assignedTechId: assignedTechId === "unassigned" ? null : assignedTechId,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Work order scheduled successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setScheduleWODialogOpen(false);
      resetWOForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to schedule work order",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/crm/projects/${projectId}`);
    },
    onSuccess: () => {
      toast({ title: "Project deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      navigate("/crm/projects");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete project",
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
            onClick={() => window.history.back()}
            className="mb-4"
            data-testid="button-back-projects"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
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
              onClick={() => window.history.back()}
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                data-testid="button-delete-project"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{project.title}" and all associated timeline activities. 
                  Work orders linked to this project will remain but will no longer be associated with it.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteProjectMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deleteProjectMutation.isPending}
                  data-testid="button-confirm-delete-project"
                >
                  {deleteProjectMutation.isPending ? "Deleting..." : "Delete Project"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
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
                                <CalendarIcon className="w-3 h-3" />
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
                <Button 
                  onClick={() => {
                    const customerId = project?.customerId || project?.customer?.id;
                    if (customerId) {
                      navigate(`/crm/quotes/new?customerId=${customerId}&projectId=${projectId}`);
                    }
                  }} 
                  data-testid="button-create-quote"
                >
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
                      onClick={() => {
                        const customerId = project?.customerId || project?.customer?.id;
                        if (customerId) {
                          navigate(`/crm/quotes/new?customerId=${customerId}&projectId=${projectId}`);
                        }
                      }}
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Invoices</CardTitle>
                <Button 
                  onClick={() => {
                    const hasWorkOrders = project?.workOrders && project.workOrders.length > 0;
                    if (!hasWorkOrders) {
                      toast({
                        title: "Work order required",
                        description: "Please create a work order in this project first before creating an invoice.",
                        variant: "destructive",
                      });
                      return;
                    }
                    navigate("/crm/invoices/new");
                  }}
                  data-testid="button-create-invoice"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Invoice
                </Button>
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

          <TabsContent value="timeline" className="mt-4 data-[state=inactive]:hidden" forceMount>
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

        <Dialog open={scheduleWODialogOpen} onOpenChange={(open) => {
          setScheduleWODialogOpen(open);
          if (!open) resetWOForm();
        }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Schedule Work Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Visit Type</Label>
                  <Select 
                    value={woVisitType} 
                    onValueChange={(v) => {
                      const vt = v as WorkOrderVisitType;
                      setWoVisitType(vt);
                      // Set default subtype - use maintenanceSubtypes for MAINTENANCE, otherwise dynamic list
                      if (vt === "MAINTENANCE") {
                        setWoWorkSubtype(maintenanceSubtypes[0] || "Preventative Maintenance");
                      } else {
                        const subtypes = getSubtypesForVisitType(vt);
                        setWoWorkSubtype(subtypes.length > 0 ? subtypes[0].subtype : "Other");
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-wo-visit-type">
                      <SelectValue />
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
                  <Label>Priority</Label>
                  <Select value={woPriority} onValueChange={setWoPriority}>
                    <SelectTrigger data-testid="select-wo-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Work Subtype</Label>
                <Select value={woWorkSubtype} onValueChange={(v) => setWoWorkSubtype(v as WorkSubtype)}>
                  <SelectTrigger data-testid="select-wo-work-subtype">
                    <SelectValue placeholder="Select subtype" />
                  </SelectTrigger>
                  <SelectContent>
                    {woVisitType === "MAINTENANCE" ? (
                      maintenanceSubtypes.map((subtype) => (
                        <SelectItem key={subtype} value={subtype}>
                          {subtype}
                        </SelectItem>
                      ))
                    ) : getSubtypesForVisitType(woVisitType).length > 0 ? (
                      getSubtypesForVisitType(woVisitType).map((s) => (
                        <SelectItem key={s.id} value={s.subtype}>
                          {s.subtype}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="Other">Other</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {woVisitType === "SERVICE" && (checklistLoading || checklistQuestions.length > 0) && (
                <Collapsible open={showChecklist} onOpenChange={setShowChecklist} className="space-y-2">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex w-full justify-between p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg"
                      data-testid="button-toggle-checklist"
                    >
                      <div className="flex items-center gap-2">
                        {Object.keys(checklistAnswers).length === checklistQuestions.length && checklistQuestions.length > 0 ? (
                          <ClipboardCheck className="h-5 w-5 text-amber-700" />
                        ) : (
                          <Clipboard className="h-5 w-5 text-amber-700" />
                        )}
                        <span className="font-medium text-amber-900">Service Call Checklist</span>
                        {checklistQuestions.length > 0 && (
                          <span className="text-sm text-amber-600">
                            ({Object.keys(checklistAnswers).filter(k => checklistAnswers[k] !== undefined && checklistAnswers[k] !== "").length}/{checklistQuestions.length} answered)
                          </span>
                        )}
                      </div>
                      <ChevronDown className={cn(
                        "h-4 w-4 text-amber-700 transition-transform",
                        showChecklist && "rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 space-y-4">
                    {checklistLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : checklistQuestions.length === 0 ? (
                      <p className="text-sm text-amber-700">No checklist questions available for this service type.</p>
                    ) : (
                      checklistQuestions.map((question) => (
                        <div key={question.id} className="space-y-2">
                          <Label className="text-sm font-medium text-amber-900">
                            {question.question}
                            {question.isRequired && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                          {question.helpText && (
                            <p className="text-xs text-amber-600">{question.helpText}</p>
                          )}
                          
                          {question.questionType === "yes_no" && (
                            <RadioGroup
                              value={checklistAnswers[question.id] as string || ""}
                              onValueChange={(value) => setChecklistAnswers(prev => ({ ...prev, [question.id]: value }))}
                              className="flex gap-4"
                              data-testid={`radio-${question.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="yes" id={`${question.id}-yes`} />
                                <Label htmlFor={`${question.id}-yes`} className="font-normal cursor-pointer">Yes</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="no" id={`${question.id}-no`} />
                                <Label htmlFor={`${question.id}-no`} className="font-normal cursor-pointer">No</Label>
                              </div>
                            </RadioGroup>
                          )}
                          
                          {question.questionType === "text" && (
                            <Input
                              value={checklistAnswers[question.id] as string || ""}
                              onChange={(e) => setChecklistAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                              placeholder="Enter response..."
                              className="bg-white"
                              data-testid={`input-${question.id}`}
                            />
                          )}
                          
                          {question.questionType === "number" && (
                            <Input
                              type="number"
                              value={checklistAnswers[question.id] as number || ""}
                              onChange={(e) => setChecklistAnswers(prev => ({ ...prev, [question.id]: e.target.value ? Number(e.target.value) : "" }))}
                              placeholder="Enter number..."
                              className="bg-white"
                              data-testid={`input-${question.id}`}
                            />
                          )}
                          
                          {question.questionType === "select" && question.options && (
                            <Select
                              value={checklistAnswers[question.id] as string || ""}
                              onValueChange={(value) => setChecklistAnswers(prev => ({ ...prev, [question.id]: value }))}
                            >
                              <SelectTrigger className="bg-white" data-testid={`select-${question.id}`}>
                                <SelectValue placeholder="Select an option..." />
                              </SelectTrigger>
                              <SelectContent>
                                {question.options.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ))
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="space-y-2">
                <Label>Scheduled Date <span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-scheduled-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledDate ? format(scheduledDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={scheduledDate}
                      onSelect={setScheduledDate}
                      data-testid="calendar-scheduled-date"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Select value={startTime} onValueChange={setStartTime}>
                    <SelectTrigger data-testid="select-start-time">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {timeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Select value={endTime} onValueChange={setEndTime}>
                    <SelectTrigger data-testid="select-end-time">
                      <SelectValue placeholder="End" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {timeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assign Technician</Label>
                <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                  <SelectTrigger data-testid="select-assigned-tech">
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

              <div className="space-y-2">
                <Label>Title <span className="text-red-500">*</span></Label>
                <Input
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                  placeholder={`${visitTypeLabels[woVisitType]} - ${woWorkSubtype}`}
                  data-testid="input-wo-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Description <span className="text-red-500">*</span></Label>
                <Textarea
                  value={woDescription}
                  onChange={(e) => setWoDescription(e.target.value)}
                  placeholder="Describe the work to be done..."
                  className="min-h-[80px]"
                  data-testid="textarea-wo-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setScheduleWODialogOpen(false);
                  resetWOForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createWorkOrderMutation.mutate()}
                disabled={!scheduledDate || !woTitle.trim() || !woDescription.trim() || !areRequiredQuestionsAnswered() || createWorkOrderMutation.isPending}
                className="bg-[#711419] hover:bg-[#5a1014]"
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
];

type UploadedFile = {
  file: globalThis.File;
  tag?: string;
  preview?: string;
};

type UploadedAttachment = ActivityAttachment;

const PHOTO_TAGS = ["before", "after", "indoor", "outdoor"] as const;
const FILE_CATEGORIES = ["proposal", "invoice", "permit", "manual", "other"] as const;
const FINANCIAL_SUBTYPES = ["estimate", "invoice", "payment", "credit", "change_order"] as const;
const FINANCIAL_STATUSES = ["pending", "approved", "paid", "cancelled"] as const;
const APPROVAL_STATUSES = ["requested", "approved", "denied"] as const;
const APPROVER_TYPES = ["pm", "tenant", "owner", "other"] as const;


function ProjectTimelineTab({ projectId }: { projectId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newActivityType, setNewActivityType] = useState("note");
  const [newActivityWorkOrderId, setNewActivityWorkOrderId] = useState("");

  const [noteContent, setNoteContent] = useState("");
  const [photoFiles, setPhotoFiles] = useState<UploadedFile[]>([]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [fileUploads, setFileUploads] = useState<UploadedFile[]>([]);
  const [fileCategory, setFileCategory] = useState<string>("other");
  const [fileNote, setFileNote] = useState("");
  const [financialSubtype, setFinancialSubtype] = useState<string>("estimate");
  const [financialAmount, setFinancialAmount] = useState("");
  const [financialStatus, setFinancialStatus] = useState<string>("pending");
  const [financialDate, setFinancialDate] = useState<Date | undefined>();
  const [financialNote, setFinancialNote] = useState("");
  const [financialAttachments, setFinancialAttachments] = useState<UploadedFile[]>([]);
  const [approvalTitle, setApprovalTitle] = useState("");
  const [approverType, setApproverType] = useState<string>("pm");
  const [approverName, setApproverName] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<string>("requested");
  const [approvalAmount, setApprovalAmount] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalAttachments, setApprovalAttachments] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const queryParams = new URLSearchParams();
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);
  if (pinnedOnly) queryParams.set("pinnedOnly", "true");

  const { data: activitiesData, isLoading, refetch } = useQuery<ProjectActivityWithMeta[]>({
    queryKey: ["/api/crm/projects", projectId, "activities", queryParams.toString()],
    queryFn: async () => {
      const url = `/api/crm/projects/${projectId}/activities?${queryParams.toString()}`;
      console.log("[TIMELINE DEBUG] Frontend - Fetching activities from:", url);
      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();
      console.log("[TIMELINE DEBUG] Frontend - Received activities:", {
        count: Array.isArray(data) ? data.length : 0,
        ids: Array.isArray(data) ? data.slice(0, 10).map((a: any) => ({ id: a.id, type: a.activityType, title: a.title })) : [],
      });
      return data;
    },
  });
  const activities = Array.isArray(activitiesData) ? activitiesData : [];

  const { data: projectData } = useQuery<ProjectDetail>({
    queryKey: ["/api/crm/projects", projectId],
    queryFn: () => fetch(`/api/crm/projects/${projectId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: workOrdersData } = useQuery<{ id: string; workOrderNumber: number; title: string | null; status: string }[]>({
    queryKey: ["/api/crm/work-orders", { projectId }],
    queryFn: () => fetch(`/api/crm/work-orders?projectId=${projectId}`, { credentials: 'include' }).then(r => r.json()).then(d => d.workOrders || []),
  });
  const workOrders = Array.isArray(workOrdersData) ? workOrdersData : [];

  const resetFormState = () => {
    setNoteContent("");
    setPhotoFiles([]);
    setPhotoCaption("");
    setFileUploads([]);
    setFileCategory("other");
    setFileNote("");
    setFinancialSubtype("estimate");
    setFinancialAmount("");
    setFinancialStatus("pending");
    setFinancialDate(undefined);
    setFinancialNote("");
    setFinancialAttachments([]);
    setApprovalTitle("");
    setApproverType("pm");
    setApproverName("");
    setApprovalStatus("requested");
    setApprovalAmount("");
    setApprovalNote("");
    setApprovalAttachments([]);
    setNewActivityWorkOrderId("");
  };

  const uploadFiles = async (files: UploadedFile[]): Promise<UploadedAttachment[]> => {
    if (files.length === 0) return [];
    
    const formData = new FormData();
    files.forEach((f) => {
      formData.append('files', f.file);
    });

    const response = await fetch('/api/activities/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload files');
    }

    const attachments: UploadedAttachment[] = await response.json();
    return attachments.map((att, idx) => ({
      ...att,
      tag: files[idx]?.tag,
    }));
  };

  const createActivityMutation = useMutation({
    mutationFn: async (data: { activityType: string; title: string; description?: string; workOrderId?: string; metadata?: Record<string, any> }) => {
      const response = await apiRequest("POST", `/api/crm/projects/${projectId}/activities`, data);
      const created = await response.json();
      console.log("[TIMELINE DEBUG] Frontend - Activity created:", created);
      return created;
    },
    onSuccess: (data) => {
      console.log("[TIMELINE DEBUG] Frontend - onSuccess, invalidating queries for projectId:", projectId);
      console.log("[TIMELINE DEBUG] Frontend - Query key to invalidate:", ["/api/crm/projects", projectId, "activities"]);
      toast({ title: "Activity added" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"], exact: false });
      setShowAddDialog(false);
      resetFormState();
      // Force refetch after a short delay to ensure cache is cleared
      setTimeout(() => {
        console.log("[TIMELINE DEBUG] Frontend - Forcing refetch");
        refetch();
      }, 500);
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

  const handleSubmitActivity = async () => {
    setIsUploading(true);
    try {
      let title = "";
      let description: string | undefined;
      let metadata: Record<string, any> = {};

      switch (newActivityType) {
        case "note": {
          if (noteContent.length < 10) {
            toast({ title: "Note must be at least 10 characters", variant: "destructive" });
            setIsUploading(false);
            return;
          }
          title = noteContent.substring(0, 50) + (noteContent.length > 50 ? "..." : "");
          metadata = { content: noteContent };
          break;
        }
        case "photo": {
          if (photoFiles.length === 0) {
            toast({ title: "Please select at least one photo", variant: "destructive" });
            setIsUploading(false);
            return;
          }
          const uploadedPhotos = await uploadFiles(photoFiles);
          title = `${photoFiles.length} photo${photoFiles.length > 1 ? "s" : ""} uploaded`;
          metadata = { photos: uploadedPhotos, caption: photoCaption || undefined };
          break;
        }
        case "file": {
          if (fileUploads.length === 0) {
            toast({ title: "Please select at least one file", variant: "destructive" });
            setIsUploading(false);
            return;
          }
          const uploadedFiles = await uploadFiles(fileUploads);
          uploadedFiles.forEach(f => f.category = fileCategory);
          title = `${fileUploads.length} file${fileUploads.length > 1 ? "s" : ""} uploaded`;
          metadata = { files: uploadedFiles, category: fileCategory, note: fileNote || undefined };
          break;
        }
        case "financial": {
          const amount = parseFloat(financialAmount);
          if (isNaN(amount) || amount <= 0) {
            toast({ title: "Please enter a valid amount", variant: "destructive" });
            setIsUploading(false);
            return;
          }
          const subtypeLabel = financialSubtype.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          title = `${subtypeLabel}: ${formatCurrency(amount)}`;
          let uploadedAttachments: UploadedAttachment[] = [];
          if (financialAttachments.length > 0) {
            uploadedAttachments = await uploadFiles(financialAttachments);
          }
          metadata = {
            subtype: financialSubtype,
            amount,
            status: financialStatus,
            date: financialDate ? format(financialDate, "yyyy-MM-dd") : undefined,
            attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
            note: financialNote || undefined,
          };
          break;
        }
        case "approval": {
          if (!approvalTitle.trim()) {
            toast({ title: "Please enter a title", variant: "destructive" });
            setIsUploading(false);
            return;
          }
          title = approvalTitle;
          let uploadedAttachments: UploadedAttachment[] = [];
          if (approvalAttachments.length > 0) {
            uploadedAttachments = await uploadFiles(approvalAttachments);
          }
          metadata = {
            approverType,
            approverName: approverName || undefined,
            status: approvalStatus,
            amount: approvalAmount ? parseFloat(approvalAmount) : undefined,
            attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
            note: approvalNote || undefined,
          };
          break;
        }
      }

      await createActivityMutation.mutateAsync({
        activityType: newActivityType,
        title,
        description,
        workOrderId: newActivityWorkOrderId || undefined,
        metadata,
      });
    } catch (error) {
      toast({ title: "Failed to create activity", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>, isPhoto = false) => {
    const files = e.target.files;
    if (!files) return;
    
    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      file,
      tag: isPhoto ? "before" : undefined,
      preview: isPhoto ? URL.createObjectURL(file) : undefined,
    }));
    setter(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number, setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>) => {
    setter(prev => {
      const updated = [...prev];
      if (updated[index].preview) {
        URL.revokeObjectURL(updated[index].preview!);
      }
      updated.splice(index, 1);
      return updated;
    });
  };

  const updateFileTag = (index: number, tag: string, setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>) => {
    setter(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], tag };
      return updated;
    });
  };

  const groupedByDay = activities.reduce((acc, activity) => {
    if (!activity.createdAt) {
      if (!acc["Unknown"]) acc["Unknown"] = { label: "Unknown Date", activities: [] };
      acc["Unknown"].activities.push(activity);
      return acc;
    }
    // Parse the timestamp - ensure it's treated as UTC if no timezone specified
    let timestamp = activity.createdAt;
    if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
      timestamp = timestamp + 'Z';
    }
    const localDate = new Date(timestamp);
    const dateKey = format(localDate, "yyyy-MM-dd");
    const dateLabel = format(localDate, "EEEE, MMMM d, yyyy");
    if (!acc[dateKey]) acc[dateKey] = { label: dateLabel, activities: [] };
    acc[dateKey].activities.push(activity);
    return acc;
  }, {} as Record<string, { label: string; activities: ProjectActivityWithMeta[] }>);

  const sortedDates = Object.keys(groupedByDay).sort((a, b) => b.localeCompare(a));

  const pinnedActivities = activities.filter(a => a.isPinned);
  const hasFilters = typeFilter !== "all" || startDate || endDate || pinnedOnly;

  const clearFilters = () => {
    setTypeFilter("all");
    setStartDate("");
    setEndDate("");
    setPinnedOnly(false);
  };

  const renderDynamicForm = () => {
    switch (newActivityType) {
      case "note":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Note Content <span className="text-red-500">*</span></Label>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Enter your note (minimum 10 characters)..."
                rows={4}
                data-testid="input-note-content"
              />
              <p className="text-xs text-muted-foreground">
                {noteContent.length}/10 characters minimum. Title auto-generates from first 50 characters.
              </p>
            </div>
          </div>
        );

      case "photo":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Photos <span className="text-red-500">*</span></Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFileSelect(e, setPhotoFiles, true)}
                  className="hidden"
                  id="photo-upload"
                  data-testid="input-photo-files"
                />
                <label htmlFor="photo-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to upload images</p>
                </label>
              </div>
            </div>
            {photoFiles.length > 0 && (
              <div className="space-y-2">
                <Label>Uploaded Photos ({photoFiles.length})</Label>
                <div className="grid grid-cols-2 gap-2">
                  {photoFiles.map((f, idx) => (
                    <div key={idx} className="relative border rounded-lg p-2">
                      {f.preview && (
                        <img src={f.preview} alt="" className="w-full h-20 object-cover rounded mb-2" />
                      )}
                      <div className="flex items-center gap-2">
                        <Select value={f.tag || "before"} onValueChange={(v) => updateFileTag(idx, v, setPhotoFiles)}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-photo-tag-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PHOTO_TAGS.map(tag => (
                              <SelectItem key={tag} value={tag}>{tag.charAt(0).toUpperCase() + tag.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => removeFile(idx, setPhotoFiles)}
                          data-testid={`button-remove-photo-${idx}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Caption (optional)</Label>
              <Textarea
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Add a caption..."
                rows={2}
                data-testid="input-photo-caption"
              />
            </div>
          </div>
        );

      case "file":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Files <span className="text-red-500">*</span></Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx"
                  multiple
                  onChange={(e) => handleFileSelect(e, setFileUploads)}
                  className="hidden"
                  id="file-upload"
                  data-testid="input-file-files"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to upload (PDF, DOC, DOCX, XLSX)</p>
                </label>
              </div>
            </div>
            {fileUploads.length > 0 && (
              <div className="space-y-2">
                <Label>Uploaded Files ({fileUploads.length})</Label>
                <div className="space-y-1">
                  {fileUploads.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm truncate flex-1">{f.file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => removeFile(idx, setFileUploads)}
                        data-testid={`button-remove-file-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={fileCategory} onValueChange={setFileCategory}>
                <SelectTrigger data-testid="select-file-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                value={fileNote}
                onChange={(e) => setFileNote(e.target.value)}
                placeholder="Add a note about these files..."
                rows={2}
                data-testid="input-file-note"
              />
            </div>
          </div>
        );

      case "financial":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subtype <span className="text-red-500">*</span></Label>
                <Select value={financialSubtype} onValueChange={setFinancialSubtype}>
                  <SelectTrigger data-testid="select-financial-subtype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCIAL_SUBTYPES.map(sub => (
                      <SelectItem key={sub} value={sub}>
                        {sub.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  value={financialAmount}
                  onChange={(e) => setFinancialAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  data-testid="input-financial-amount"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={financialStatus} onValueChange={setFinancialStatus}>
                  <SelectTrigger data-testid="select-financial-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCIAL_STATUSES.map(status => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start" data-testid="button-financial-date">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {financialDate ? format(financialDate, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarPicker
                      mode="single"
                      selected={financialDate}
                      onSelect={setFinancialDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                value={financialNote}
                onChange={(e) => setFinancialNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                data-testid="input-financial-note"
              />
            </div>
            <div className="space-y-2">
              <Label>Attachments (optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-3 text-center">
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFileSelect(e, setFinancialAttachments)}
                  className="hidden"
                  id="financial-attachments"
                  data-testid="input-financial-attachments"
                />
                <label htmlFor="financial-attachments" className="cursor-pointer text-sm text-muted-foreground">
                  <Upload className="w-6 h-6 mx-auto mb-1" />
                  Click to upload
                </label>
              </div>
              {financialAttachments.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {financialAttachments.length} file(s) selected
                </div>
              )}
            </div>
          </div>
        );

      case "approval":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input
                value={approvalTitle}
                onChange={(e) => setApprovalTitle(e.target.value)}
                placeholder="e.g., AC Unit Replacement Approval"
                data-testid="input-approval-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Approver Type</Label>
                <Select value={approverType} onValueChange={setApproverType}>
                  <SelectTrigger data-testid="select-approver-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVER_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Approver Name (optional)</Label>
                <Input
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  placeholder="Name"
                  data-testid="input-approver-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={approvalStatus} onValueChange={setApprovalStatus}>
                  <SelectTrigger data-testid="select-approval-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVAL_STATUSES.map(status => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount (optional)</Label>
                <Input
                  type="number"
                  value={approvalAmount}
                  onChange={(e) => setApprovalAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  data-testid="input-approval-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                data-testid="input-approval-note"
              />
            </div>
            <div className="space-y-2">
              <Label>Attachments (optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-3 text-center">
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFileSelect(e, setApprovalAttachments)}
                  className="hidden"
                  id="approval-attachments"
                  data-testid="input-approval-attachments"
                />
                <label htmlFor="approval-attachments" className="cursor-pointer text-sm text-muted-foreground">
                  <Upload className="w-6 h-6 mx-auto mb-1" />
                  Click to upload
                </label>
              </div>
              {approvalAttachments.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {approvalAttachments.length} file(s) selected
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isFormValid = () => {
    switch (newActivityType) {
      case "note": return noteContent.length >= 10;
      case "photo": return photoFiles.length > 0;
      case "file": return fileUploads.length > 0;
      case "financial": return financialAmount && parseFloat(financialAmount) > 0;
      case "approval": return approvalTitle.trim().length > 0;
      default: return false;
    }
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

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" data-testid="button-date-range">
                  <CalendarIcon className="w-4 h-4" />
                  {startDate && endDate 
                    ? `${format(new Date(startDate), "MMM d")} - ${format(new Date(endDate), "MMM d")}`
                    : startDate 
                      ? `From ${format(new Date(startDate), "MMM d")}`
                      : endDate 
                        ? `Until ${format(new Date(endDate), "MMM d")}`
                        : "Date Range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="start">
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const today = new Date();
                        setStartDate(format(today, "yyyy-MM-dd"));
                        setEndDate(format(today, "yyyy-MM-dd"));
                      }}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const today = new Date();
                        const weekAgo = new Date(today);
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        setStartDate(format(weekAgo, "yyyy-MM-dd"));
                        setEndDate(format(today, "yyyy-MM-dd"));
                      }}
                    >
                      Last 7 Days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const today = new Date();
                        const monthAgo = new Date(today);
                        monthAgo.setDate(monthAgo.getDate() - 30);
                        setStartDate(format(monthAgo, "yyyy-MM-dd"));
                        setEndDate(format(today, "yyyy-MM-dd"));
                      }}
                    >
                      Last 30 Days
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Start Date</p>
                      <CalendarPicker
                        mode="single"
                        selected={startDate ? new Date(startDate) : undefined}
                        onSelect={(date) => setStartDate(date ? format(date, "yyyy-MM-dd") : "")}
                        initialFocus
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">End Date</p>
                      <CalendarPicker
                        mode="single"
                        selected={endDate ? new Date(endDate) : undefined}
                        onSelect={(date) => setEndDate(date ? format(date, "yyyy-MM-dd") : "")}
                      />
                    </div>
                  </div>
                  {(startDate || endDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                      }}
                    >
                      Clear Dates
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

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
                    <CalendarIcon className="w-4 h-4" />
                    {groupedByDay[date].label}
                  </h4>
                  <div className="space-y-2 ml-2 border-l-2 border-slate-200 pl-4">
                    {groupedByDay[date].activities.map(activity => (
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

      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) resetFormState();
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={newActivityType} onValueChange={(v) => {
                setNewActivityType(v);
                resetFormState();
              }}>
                <SelectTrigger data-testid="select-new-activity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="financial">Financial Update</SelectItem>
                  <SelectItem value="approval">Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {renderDynamicForm()}

            {newActivityType !== "status_change" && (
              <div className="space-y-2">
                <Label>Link to Work Order (optional)</Label>
                <Select value={newActivityWorkOrderId || "none"} onValueChange={(v) => setNewActivityWorkOrderId(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-link-work-order">
                    <SelectValue placeholder="Select a work order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {workOrders.map(wo => (
                      <SelectItem key={wo.id} value={wo.id}>
                        WO #{wo.workOrderNumber} - {wo.title || "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitActivity}
              disabled={!isFormValid() || isUploading || createActivityMutation.isPending}
              data-testid="button-submit-activity"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : createActivityMutation.isPending ? (
                "Adding..."
              ) : (
                "Add Activity"
              )}
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
  const [expanded, setExpanded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  const IconComponent = activityTypeIcons[activity.activityType] || Activity;
  const colors = activityTypeColors[activity.activityType] || activityTypeColors.note;
  const label = activityTypeLabels[activity.activityType] || activity.activityType;
  const metadata = activity.metadata || {};

  const renderTypeSpecificContent = () => {
    switch (activity.activityType) {
      case "note": {
        const content = metadata.content || activity.description || "";
        const isLong = content.length > 150;
        const displayContent = expanded || !isLong ? content : content.substring(0, 150) + "...";
        
        return (
          <div className="mt-2">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{displayContent}</p>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 hover:underline mt-1 flex items-center gap-1"
                data-testid={`button-expand-note-${activity.id}`}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show more
                  </>
                )}
              </button>
            )}
          </div>
        );
      }

      case "photo": {
        const photos = (metadata.photos || []) as ActivityAttachment[];
        const caption = metadata.caption;
        const visiblePhotos = photos.slice(0, 4);
        const remainingCount = photos.length - 4;

        return (
          <div className="mt-2">
            <div className="grid grid-cols-4 gap-2">
              {visiblePhotos.map((photo, idx) => (
                <div
                  key={photo.id || idx}
                  className="relative aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => {
                    setLightboxIndex(idx);
                    setLightboxOpen(true);
                  }}
                  data-testid={`photo-thumbnail-${idx}`}
                >
                  <img
                    src={photo.url}
                    alt={photo.originalName || "Photo"}
                    className="w-full h-full object-cover"
                  />
                  {photo.tag && (
                    <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                      {photo.tag}
                    </span>
                  )}
                  {idx === 3 && remainingCount > 0 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white font-semibold">+{remainingCount}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {caption && (
              <p className="text-sm text-muted-foreground mt-2 italic">{caption}</p>
            )}
            
            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
              <DialogContent className="max-w-4xl p-2">
                <div className="relative">
                  {photos[lightboxIndex] && (
                    <img
                      src={photos[lightboxIndex].url}
                      alt={photos[lightboxIndex].originalName || "Photo"}
                      className="w-full max-h-[70vh] object-contain"
                    />
                  )}
                  <div className="flex justify-between items-center mt-2 px-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLightboxIndex(prev => Math.max(0, prev - 1))}
                      disabled={lightboxIndex === 0}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {lightboxIndex + 1} / {photos.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLightboxIndex(prev => Math.min(photos.length - 1, prev + 1))}
                      disabled={lightboxIndex === photos.length - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        );
      }

      case "file": {
        const files = (metadata.files || []) as ActivityAttachment[];
        const note = metadata.note;

        const getFileIcon = (mimeType: string) => {
          if (mimeType.includes("pdf")) return <FileText className="w-4 h-4 text-red-600" />;
          if (mimeType.includes("word") || mimeType.includes("doc")) return <FileText className="w-4 h-4 text-blue-600" />;
          if (mimeType.includes("sheet") || mimeType.includes("xlsx")) return <FileText className="w-4 h-4 text-green-600" />;
          return <File className="w-4 h-4 text-slate-600" />;
        };

        return (
          <div className="mt-2 space-y-2">
            {files.map((file, idx) => (
              <div
                key={file.id || idx}
                className="flex items-center justify-between p-2 bg-white rounded border"
                data-testid={`file-item-${idx}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getFileIcon(file.mimeType)}
                  <span className="text-sm truncate">{file.originalName || file.filename}</span>
                  {file.category && (
                    <Badge variant="outline" className="text-xs">{file.category}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-slate-100 rounded"
                    data-testid={`button-view-file-${idx}`}
                  >
                    <Eye className="w-4 h-4 text-slate-600" />
                  </a>
                  <a
                    href={file.url}
                    download={file.originalName || file.filename}
                    className="p-1 hover:bg-slate-100 rounded"
                    data-testid={`button-download-file-${idx}`}
                  >
                    <Download className="w-4 h-4 text-slate-600" />
                  </a>
                </div>
              </div>
            ))}
            {note && (
              <p className="text-sm text-muted-foreground italic">{note}</p>
            )}
          </div>
        );
      }

      case "financial": {
        const subtype = metadata.subtype;
        const amount = metadata.amount;
        const status = metadata.status;
        const note = metadata.note;

        const subtypeLabel = subtype?.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) || "Unknown";
        
        const getStatusColor = (s: string) => {
          switch (s) {
            case "approved": return "bg-green-100 text-green-700 border-green-200";
            case "paid": return "bg-emerald-100 text-emerald-700 border-emerald-200";
            case "pending": return "bg-yellow-100 text-yellow-700 border-yellow-200";
            case "cancelled": return "bg-red-100 text-red-600 border-red-200";
            default: return "bg-slate-100 text-slate-600 border-slate-200";
          }
        };

        return (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {subtypeLabel}
              </Badge>
              {amount !== undefined && (
                <span className="text-lg font-semibold text-green-700">
                  {formatCurrency(amount)}
                </span>
              )}
              {status && (
                <Badge variant="outline" className={getStatusColor(status)}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Badge>
              )}
            </div>
            {note && (
              <p className="text-sm text-muted-foreground">{note}</p>
            )}
          </div>
        );
      }

      case "approval": {
        const approverType = metadata.approverType;
        const approverName = metadata.approverName;
        const status = metadata.status;
        const amount = metadata.amount;
        const note = metadata.note;

        const getStatusColor = (s: string) => {
          switch (s) {
            case "approved": return "bg-green-100 text-green-700 border-green-200";
            case "denied": return "bg-red-100 text-red-600 border-red-200";
            case "requested": return "bg-yellow-100 text-yellow-700 border-yellow-200";
            default: return "bg-slate-100 text-slate-600 border-slate-200";
          }
        };

        return (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {status && (
                <Badge variant="outline" className={getStatusColor(status)}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Badge>
              )}
              {approverType && (
                <span className="text-sm text-muted-foreground">
                  Approver: {approverType.toUpperCase()}
                  {approverName && ` (${approverName})`}
                </span>
              )}
              {amount !== undefined && (
                <span className="text-sm font-medium text-slate-700">
                  {formatCurrency(amount)}
                </span>
              )}
            </div>
            {note && (
              <p className="text-sm text-muted-foreground">{note}</p>
            )}
          </div>
        );
      }

      default:
        return activity.description ? (
          <p className="text-sm text-muted-foreground mt-2">{activity.description}</p>
        ) : null;
    }
  };

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
                <span>{format(new Date(activity.createdAt.endsWith('Z') || activity.createdAt.includes('+') ? activity.createdAt : activity.createdAt + 'Z'), "h:mm a")}</span>
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
        {renderTypeSpecificContent()}
      </div>
    </div>
  );
}
