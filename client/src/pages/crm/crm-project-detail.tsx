import { useState, useEffect, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useFileDrop } from "@/hooks/use-file-drop";
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
  Pencil,
  ListTodo,
  Search,
  Package,
  Calculator,
  TrendingUp,
  TrendingDown,
  Users,
  Boxes,
  Settings,
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
import { Checkbox } from "@/components/ui/checkbox";
import { CrmLayout } from "@/components/crm/crm-layout";
import RichTextEditor, { RichTextDisplay } from "@/components/rich-text-editor";
import { format } from "date-fns";
import type { 
  CrmUser, CrmProject, CrmWorkOrder, CrmInvoice, CrmQuote, CrmCustomer, CrmProperty,
  ActivityAttachment, NoteMetadata, PhotoMetadata, FileMetadata, FinancialMetadata, 
  ApprovalMetadata, FinancialSubtype, ApprovalStatus,
  WorkOrderVisitType, WorkSubtype, ChecklistQuestion,
  ProjectEquipmentItem, CrmProjectTask, MaterialsCatalogItem, ProjectLaborEntry
} from "@shared/schema";
import { 
  projectActivityTypeEnum, financialSubtypeEnum, approvalStatusEnum,
  workOrderVisitTypeEnum
} from "@shared/schema";
import type { WorkOrderSubtype } from "@shared/schema";
import { CommentComposer } from "@/components/crm/comment-composer";
import { CommentThread } from "@/components/crm/comment-thread";
import { EntityTasksTab } from "@/components/crm/entity-tasks-tab";

type ProjectDetail = CrmProject & {
  customerName: string | null;
  customer: CrmCustomer | null;
  property: CrmProperty | null;
  workOrders: CrmWorkOrder[];
  workOrderCount: number;
};

type ProjectTaskWithUser = CrmProjectTask & {
  assignedUserName: string | null;
};

const projectStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  lead: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200" },
  proposal_sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  equipment_ordered: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  equipment_arrived: { bg: "bg-lime-100", text: "text-lime-700", border: "border-lime-200" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  closed: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
  archived: { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200" },
};

const projectStatusLabels: Record<string, string> = {
  lead: "New",
  proposal_sent: "Proposal Sent",
  equipment_ordered: "Equipment Ordered",
  equipment_arrived: "Equipment Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
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
  "Strange Noise": "STRANGE_NOISE",
  "Thermostat Issue": "THERMOSTAT_ISSUE",
  "Electrical": "OTHER",
  "Thermostat": "THERMOSTAT_ISSUE",
  "Airflow": "OTHER",
  "Noise": "STRANGE_NOISE",
  "IAQ": "OTHER",
  "Other": "OTHER",
  "A/C Repair": "NO_AC",
  "AC Repair": "NO_AC",
  "Heating Repair": "NO_HEAT",
  "Furnace Repair": "NO_HEAT",
  "Heat Pump Repair": "NO_HEAT",
  "Ductless Repair": "NO_AC",
  "Mini Split Repair": "NO_AC",
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

function formatProjectNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "";
  return num.toString();
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
  usePageTitle("Project Detail");
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

  const [showEditScheduleDialog, setShowEditScheduleDialog] = useState(false);
  const [editStartDate, setEditStartDate] = useState<Date | undefined>();
  const [editEndDate, setEditEndDate] = useState<Date | undefined>();
  const [editEquipmentInfo, setEditEquipmentInfo] = useState("");

  const [showEditProjectDialog, setShowEditProjectDialog] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editProjectType, setEditProjectType] = useState("");
  const [editPriority, setEditPriority] = useState("");

  // Scope of Work and Equipment sections state
  const [isEditingScopeSection, setIsEditingScopeSection] = useState(false);
  const [editScopeOfWork, setEditScopeOfWork] = useState("");
  const [editChallengePoints, setEditChallengePoints] = useState("");
  const [equipmentItems, setEquipmentItems] = useState<ProjectEquipmentItem[]>([]);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [newEquipmentItem, setNewEquipmentItem] = useState<Partial<ProjectEquipmentItem>>({ 
    name: "", quantity: 1, modelNumber: "", notes: "", unitCost: undefined, vendor: "", date: format(new Date(), "yyyy-MM-dd") 
  });
  const [equipmentHasChanges, setEquipmentHasChanges] = useState(false);
  
  // Materials Catalog Dialog state
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<Map<string, { item: MaterialsCatalogItem; quantity: number }>>(new Map());

  // Admin Tasks state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<string | null>(null);
  const [newTaskDueDate, setNewTaskDueDate] = useState<Date | undefined>(undefined);
  
  // Edit task dialog state
  const [editingTask, setEditingTask] = useState<{
    id: string;
    title: string;
    description: string;
    assignedUserId: string | null;
    dueDate: Date | undefined;
  } | null>(null);

  // Equipment file attachment state
  const {
    files: equipmentFiles,
    isDragging: isDraggingEquipment,
    dropZoneProps: equipmentDropZoneProps,
    handleFileSelect: handleEquipmentFileSelect,
    removeFile: removeEquipmentFile,
    clearFiles: clearEquipmentFiles,
  } = useFileDrop();
  const [isUploadingEquipmentFiles, setIsUploadingEquipmentFiles] = useState(false);

  // Inline timeline state for Overview tab
  const [overviewComment, setOverviewComment] = useState("");
  const [isSubmittingOverviewComment, setIsSubmittingOverviewComment] = useState(false);
  const {
    files: overviewFiles,
    isDragging: isDraggingOverview,
    dropZoneProps: overviewDropZoneProps,
    handleFileSelect: handleOverviewFileSelect,
    removeFile: removeOverviewFile,
    clearFiles: clearOverviewFiles,
  } = useFileDrop();

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

  // Query for CRM users (for task assignment)
  const { data: users } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  // Query for project tasks
  const { data: projectTasks, isLoading: tasksLoading } = useQuery<ProjectTaskWithUser[]>({
    queryKey: ["/api/crm/projects", projectId, "tasks"],
    enabled: !!projectId,
  });

  // Query for materials catalog (for Add from Catalog dialog)
  const { data: materialsCatalog, isLoading: catalogLoading } = useQuery<MaterialsCatalogItem[]>({
    queryKey: ["/api/crm/materials-catalog"],
    enabled: !!currentUser && catalogDialogOpen,
  });

  // Query for activities in overview tab
  const { data: overviewActivitiesData, isLoading: overviewActivitiesLoading, refetch: refetchOverviewActivities } = useQuery<ProjectActivityWithMeta[]>({
    queryKey: ["/api/crm/projects", projectId, "activities"],
    queryFn: async () => {
      const response = await fetch(`/api/crm/projects/${projectId}/activities`, { credentials: 'include' });
      return response.json();
    },
    enabled: !!currentUser && !!projectId,
  });
  const overviewActivities = Array.isArray(overviewActivitiesData) ? overviewActivitiesData.slice(0, 5) : [];

  // File upload helper for overview
  const uploadOverviewFiles = async (files: { file: File }[]): Promise<ActivityAttachment[]> => {
    if (files.length === 0) return [];
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f.file));
    const response = await fetch('/api/activities/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to upload files');
    return response.json();
  };

  // Mutation to create activity from overview
  const createOverviewActivityMutation = useMutation({
    mutationFn: async (data: { activityType: string; title: string; metadata?: Record<string, any> }) => {
      const response = await apiRequest("POST", `/api/crm/projects/${projectId}/activities`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Comment added" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"], exact: false });
      setOverviewComment("");
      clearOverviewFiles();
      refetchOverviewActivities();
    },
    onError: () => {
      toast({ title: "Failed to add comment", variant: "destructive" });
    },
  });

  // Task mutations
  const createTaskMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; assignedUserId?: string | null; dueDate?: string }) => {
      const response = await apiRequest("POST", `/api/crm/projects/${projectId}/tasks`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task added" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/project-tasks"] });
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskAssignee(null);
      setNewTaskDueDate(undefined);
    },
    onError: () => {
      toast({ title: "Failed to add task", variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      completedAt?: string | null;
      title?: string;
      description?: string;
      assignedUserId?: string | null;
      dueDate?: string | null;
    }) => {
      const { id, ...updateData } = data;
      const response = await apiRequest("PATCH", `/api/crm/project-tasks/${id}`, updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/project-tasks"] });
      setEditingTask(null);
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest("DELETE", `/api/crm/project-tasks/${taskId}`);
    },
    onSuccess: () => {
      toast({ title: "Task deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/project-tasks"] });
    },
    onError: () => {
      toast({ title: "Failed to delete task", variant: "destructive" });
    },
  });

  const handleSubmitOverviewComment = async () => {
    if (!overviewComment.trim() && overviewFiles.length === 0) {
      toast({ title: "Please enter a comment or attach files", variant: "destructive" });
      return;
    }
    setIsSubmittingOverviewComment(true);
    try {
      let attachments: ActivityAttachment[] = [];
      if (overviewFiles.length > 0) {
        attachments = await uploadOverviewFiles(overviewFiles);
      }
      const title = overviewComment.substring(0, 50) + (overviewComment.length > 50 ? "..." : "") || "File attachment";
      await createOverviewActivityMutation.mutateAsync({
        activityType: "note",
        title,
        metadata: { 
          content: overviewComment,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      });
    } catch (error) {
      toast({ title: "Failed to add comment", variant: "destructive" });
    } finally {
      setIsSubmittingOverviewComment(false);
    }
  };

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

    const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[woWorkSubtype] || "OTHER";

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

  useEffect(() => {
    if (showEditScheduleDialog && project) {
      setEditStartDate(project.startDate ? new Date(project.startDate) : undefined);
      setEditEndDate(project.endDate ? new Date(project.endDate) : undefined);
      setEditEquipmentInfo(project.equipmentInfo || "");
    }
  }, [showEditScheduleDialog, project]);

  useEffect(() => {
    if (showEditProjectDialog && project) {
      setEditTitle(project.title);
      setEditStatus(project.status);
      setEditProjectType(project.projectType);
      setEditPriority(project.priority || "normal");
    }
  }, [showEditProjectDialog, project]);

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

  const updateProjectStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/crm/projects/${projectId}`, { status });
    },
    onSuccess: () => {
      toast({ title: "Project status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update project status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (data: { startDate?: string | null; endDate?: string | null; equipmentInfo?: string | null }) => {
      const updateData: Record<string, unknown> = { ...data };
      if (data.equipmentInfo && !project?.equipmentInfo && project?.status === "lead") {
        updateData.status = "equipment_ordered";
      }
      const res = await apiRequest("PATCH", `/api/crm/projects/${projectId}`, updateData);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Project updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setShowEditScheduleDialog(false);
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const updateProjectDetailsMutation = useMutation({
    mutationFn: async (data: { title: string; status: string; projectType: string; priority: string }) => {
      const res = await apiRequest("PATCH", `/api/crm/projects/${projectId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Project updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setShowEditProjectDialog(false);
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const updateScopeMutation = useMutation({
    mutationFn: async (data: { scopeOfWork?: string; challengePoints?: string }) => {
      const res = await apiRequest("PATCH", `/api/crm/projects/${projectId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Scope of work updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setIsEditingScopeSection(false);
    },
    onError: () => {
      toast({ title: "Failed to update scope", variant: "destructive" });
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: async (data: { equipmentMaterials: ProjectEquipmentItem[] }) => {
      const res = await apiRequest("PATCH", `/api/crm/projects/${projectId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Equipment materials updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setEquipmentHasChanges(false);
    },
    onError: () => {
      toast({ title: "Failed to update equipment", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (project) {
      setEquipmentItems(project.equipmentMaterials || []);
      setEditScopeOfWork(project.scopeOfWork || "");
      setEditChallengePoints(project.challengePoints || "");
    }
  }, [project]);

  const handleAddEquipmentItem = () => {
    if (!newEquipmentItem.name?.trim()) return;
    const item: ProjectEquipmentItem = {
      id: crypto.randomUUID(),
      name: newEquipmentItem.name.trim(),
      quantity: newEquipmentItem.quantity || 1,
      modelNumber: newEquipmentItem.modelNumber?.trim() || undefined,
      notes: newEquipmentItem.notes?.trim() || undefined,
      unitCost: newEquipmentItem.unitCost,
      vendor: newEquipmentItem.vendor?.trim() || undefined,
      date: newEquipmentItem.date || format(new Date(), "yyyy-MM-dd"),
    };
    setEquipmentItems([...equipmentItems, item]);
    setNewEquipmentItem({ name: "", quantity: 1, modelNumber: "", notes: "", unitCost: undefined, vendor: "", date: format(new Date(), "yyyy-MM-dd") });
    setEquipmentHasChanges(true);
  };

  const handleUpdateEquipmentItem = (id: string, updates: Partial<ProjectEquipmentItem>) => {
    setEquipmentItems(equipmentItems.map(item => item.id === id ? { ...item, ...updates } : item));
    setEquipmentHasChanges(true);
  };

  const handleDeleteEquipmentItem = (id: string) => {
    setEquipmentItems(equipmentItems.filter(item => item.id !== id));
    setEquipmentHasChanges(true);
  };

  // Catalog dialog helpers
  const filteredCatalogItems = useMemo(() => {
    if (!materialsCatalog) return [];
    if (!catalogSearch.trim()) return materialsCatalog;
    const search = catalogSearch.toLowerCase();
    return materialsCatalog.filter(item => 
      item.name.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search) ||
      item.partNumber?.toLowerCase().includes(search) ||
      item.vendor?.toLowerCase().includes(search)
    );
  }, [materialsCatalog, catalogSearch]);

  const handleToggleCatalogItem = (item: MaterialsCatalogItem, checked: boolean) => {
    setSelectedCatalogItems(prev => {
      const newMap = new Map(prev);
      if (checked) {
        newMap.set(item.id, { item, quantity: 1 });
      } else {
        newMap.delete(item.id);
      }
      return newMap;
    });
  };

  const handleCatalogItemQuantityChange = (itemId: string, quantity: number) => {
    setSelectedCatalogItems(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(itemId);
      if (existing) {
        newMap.set(itemId, { ...existing, quantity: Math.max(1, quantity) });
      }
      return newMap;
    });
  };

  const handleAddFromCatalog = () => {
    const newItems: ProjectEquipmentItem[] = Array.from(selectedCatalogItems.values()).map(({ item, quantity }) => ({
      id: crypto.randomUUID(),
      name: item.name,
      quantity,
      modelNumber: item.partNumber || undefined,
      notes: item.description || undefined,
      unitCost: item.unitCost ? parseFloat(item.unitCost.toString()) : undefined,
      vendor: item.vendor || undefined,
      date: format(new Date(), "yyyy-MM-dd"),
      itemType: "material" as const,
    }));
    setEquipmentItems([...equipmentItems, ...newItems]);
    setSelectedCatalogItems(new Map());
    setCatalogSearch("");
    setCatalogDialogOpen(false);
    setEquipmentHasChanges(true);
    toast({ title: `Added ${newItems.length} item${newItems.length > 1 ? 's' : ''} from catalog` });
  };

  // Calculate total materials cost
  const totalMaterialsCost = useMemo(() => {
    return equipmentItems.reduce((sum, item) => {
      const cost = (item.unitCost || 0) * (item.quantity || 1);
      return sum + cost;
    }, 0);
  }, [equipmentItems]);

  const uploadEquipmentFilesHandler = async () => {
    if (equipmentFiles.length === 0) return;
    setIsUploadingEquipmentFiles(true);
    try {
      const formData = new FormData();
      equipmentFiles.forEach((f) => formData.append('files', f.file));
      const uploadRes = await fetch('/api/activities/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const attachments = await uploadRes.json();
      
      await apiRequest("POST", `/api/crm/projects/${projectId}/activities`, {
        activityType: "note",
        title: `Equipment/Materials files (${equipmentFiles.length})`,
        metadata: {
          content: "Equipment and materials documentation",
          attachments,
          source: "equipment"
        },
      });
      
      toast({ title: "Files uploaded successfully" });
      clearEquipmentFiles();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"] });
    } catch (error) {
      toast({ title: "Failed to upload files", variant: "destructive" });
    } finally {
      setIsUploadingEquipmentFiles(false);
    }
  };

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
            onClick={() => navigate("/crm/projects?tab=calendar")}
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
              onClick={() => navigate("/crm/projects?tab=calendar")}
              data-testid="button-back-projects"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold" data-testid="text-project-title">{project.customerName || project.customer?.name || "No customer"} - {formatProjectNumber(project.projectNumber)}</h1>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowEditProjectDialog(true)}
                  data-testid="button-edit-project"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{project.title}</p>
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

        <Dialog open={showEditScheduleDialog} onOpenChange={setShowEditScheduleDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Schedule & Equipment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editStartDate ? format(editStartDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarPicker mode="single" selected={editStartDate} onSelect={setEditStartDate} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editEndDate ? format(editEndDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarPicker mode="single" selected={editEndDate} onSelect={setEditEndDate} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Equipment Information</Label>
                <Textarea
                  value={editEquipmentInfo}
                  onChange={(e) => setEditEquipmentInfo(e.target.value)}
                  placeholder="Enter equipment details, model numbers, specifications..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditScheduleDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => {
                  updateScheduleMutation.mutate({
                    startDate: editStartDate ? editStartDate.toISOString() : null,
                    endDate: editEndDate ? editEndDate.toISOString() : null,
                    equipmentInfo: editEquipmentInfo || null,
                  });
                }}
                disabled={updateScheduleMutation.isPending}
              >
                {updateScheduleMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditProjectDialog} onOpenChange={setShowEditProjectDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project Title <span className="text-red-500">*</span></Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Enter project title"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(projectStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project Type</Label>
                <Select value={editProjectType} onValueChange={setEditProjectType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(projectTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditProjectDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => {
                  if (!editTitle.trim()) return;
                  updateProjectDetailsMutation.mutate({
                    title: editTitle,
                    status: editStatus,
                    projectType: editProjectType,
                    priority: editPriority,
                  });
                }}
                disabled={!editTitle.trim() || updateProjectDetailsMutation.isPending}
                className="bg-[#711419] hover:bg-[#5a1014]"
              >
                {updateProjectDetailsMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
            <TabsTrigger 
              value="job-costing" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-job-costing"
            >
              Job Costing
            </TabsTrigger>
            <TabsTrigger 
              value="comments" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-comments"
            >
              Comments
            </TabsTrigger>
            <TabsTrigger 
              value="tasks" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
              data-testid="tab-tasks"
            >
              Tasks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-6">
            {project.status === "equipment_ordered" && (
              <Card className="border border-yellow-200 bg-yellow-50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-medium text-yellow-900">Equipment Ordered</p>
                        <p className="text-sm text-yellow-700">Has the equipment arrived?</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => updateProjectStatusMutation.mutate("equipment_arrived")}
                      disabled={updateProjectStatusMutation.isPending}
                      className="bg-lime-600 hover:bg-lime-700 text-white"
                      data-testid="button-equipment-arrived"
                    >
                      {updateProjectStatusMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Equipment Arrived
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Compact Project Schedule with Progress */}
            <Card className="border-0 shadow-sm bg-gradient-to-r from-slate-50 to-white">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-6 flex-1">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Start</p>
                        <p className="text-sm font-medium text-slate-700">{formatDate(project.startDate)}</p>
                      </div>
                    </div>
                    <div className="flex-1 max-w-[200px]">
                      {(() => {
                        const start = project.startDate ? new Date(project.startDate).getTime() : Date.now();
                        const end = project.endDate ? new Date(project.endDate).getTime() : Date.now();
                        const now = Date.now();
                        const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
                        return (
                          <div className="relative">
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-[#711419] to-[#8B1A1F] rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-slate-400 text-center mt-1">{Math.round(progress)}% elapsed</p>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">End</p>
                        <p className="text-sm font-medium text-slate-700">{formatDate(project.endDate)}</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowEditScheduleDialog(true)}>
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Unified Financial Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Card data-testid="card-total-quoted" className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <p className="text-xs text-slate-500">Total Quoted</p>
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{formatCurrency(totalQuoted)}</p>
                </CardContent>
              </Card>

              <Card data-testid="card-total-invoiced" className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Receipt className="w-4 h-4 text-slate-400" />
                    <p className="text-xs text-slate-500">Invoiced</p>
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{formatCurrency(totalInvoiced)}</p>
                </CardContent>
              </Card>

              <Card data-testid="card-balance-due" className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className={`w-4 h-4 ${balanceDue > 0 ? "text-orange-500" : "text-slate-400"}`} />
                    <p className="text-xs text-slate-500">Balance Due</p>
                  </div>
                  <p className={`text-lg font-semibold ${balanceDue > 0 ? "text-orange-600" : "text-slate-800"}`}>
                    {formatCurrency(balanceDue)}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-expected-value" className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                    <p className="text-xs text-slate-500">Expected</p>
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{formatCurrency(project.expectedValue)}</p>
                </CardContent>
              </Card>

              <Card data-testid="card-actual-value" className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-slate-400" />
                    <p className="text-xs text-slate-500">Actual</p>
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{formatCurrency(project.actualValue)}</p>
                </CardContent>
              </Card>

              <Card data-testid="card-work-orders-count" className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ClipboardList className="w-4 h-4 text-slate-400" />
                    <p className="text-xs text-slate-500">Work Orders</p>
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{workOrderCount}</p>
                </CardContent>
              </Card>
            </div>

            {/* Admin Tasks Section */}
            <Card data-testid="card-admin-tasks">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5 text-[#711419]" />
                  Admin Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Tasks table header */}
                  <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div className="col-span-1"></div>
                    <div className="col-span-4">Task</div>
                    <div className="col-span-3">Assigned To</div>
                    <div className="col-span-2">Due Date</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {/* Tasks loading state */}
                  {tasksLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <>
                      {/* Empty state */}
                      {(!projectTasks || projectTasks.length === 0) && (
                        <p className="text-sm text-muted-foreground italic py-4 text-center">No tasks added yet</p>
                      )}

                      {/* Tasks list */}
                      {projectTasks?.map((task) => (
                        <div key={task.id} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-100">
                          <div className="col-span-1">
                            <Checkbox
                              checked={!!task.completedAt}
                              onCheckedChange={(checked) => {
                                updateTaskMutation.mutate({
                                  id: task.id,
                                  completedAt: checked ? new Date().toISOString() : null,
                                });
                              }}
                            />
                          </div>
                          <div className="col-span-4">
                            <p className={cn(
                              "text-sm",
                              task.completedAt && "line-through text-muted-foreground"
                            )}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                            )}
                          </div>
                          <div className="col-span-3 text-sm text-muted-foreground">
                            {task.assignedUserName || "—"}
                          </div>
                          <div className="col-span-2 text-sm text-muted-foreground">
                            {task.dueDate ? format(new Date(task.dueDate), "MMM d, yyyy") : "—"}
                          </div>
                          <div className="col-span-2 flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setEditingTask({
                                id: task.id,
                                title: task.title,
                                description: task.description || "",
                                assignedUserId: task.assignedUserId || null,
                                dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
                              })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:text-destructive"
                              onClick={() => deleteTaskMutation.mutate(task.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Edit Task Dialog */}
                  <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Edit Task</DialogTitle>
                      </DialogHeader>
                      {editingTask && (
                        <div className="space-y-4">
                          <div>
                            <Label>Title</Label>
                            <Input
                              value={editingTask.title}
                              onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                              placeholder="Task title..."
                            />
                          </div>
                          <div>
                            <Label>Description</Label>
                            <Textarea
                              value={editingTask.description}
                              onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                              placeholder="Task description..."
                              rows={3}
                            />
                          </div>
                          <div>
                            <Label>Assign To</Label>
                            <Select 
                              value={editingTask.assignedUserId || "unassigned"} 
                              onValueChange={(v) => setEditingTask({ ...editingTask, assignedUserId: v === "unassigned" ? null : v })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Assign to..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {users?.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Due Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editingTask.dueDate ? format(editingTask.dueDate, "MMM d, yyyy") : "Select date..."}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <CalendarPicker
                                  mode="single"
                                  selected={editingTask.dueDate}
                                  onSelect={(date) => setEditingTask({ ...editingTask, dueDate: date })}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingTask(null)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            if (editingTask) {
                              updateTaskMutation.mutate({
                                id: editingTask.id,
                                title: editingTask.title,
                                description: editingTask.description || undefined,
                                assignedUserId: editingTask.assignedUserId,
                                dueDate: editingTask.dueDate?.toISOString() || null,
                              });
                            }
                          }}
                          disabled={!editingTask?.title.trim() || updateTaskMutation.isPending}
                        >
                          {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Add new task row */}
                  <div className="grid grid-cols-12 gap-2 items-center pt-3 border-t mt-2">
                    <div className="col-span-1"></div>
                    <div className="col-span-4">
                      <Input
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="New task..."
                        data-testid="input-new-task-title"
                      />
                    </div>
                    <div className="col-span-3">
                      <Select value={newTaskAssignee || "unassigned"} onValueChange={(v) => setNewTaskAssignee(v === "unassigned" ? null : v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Assign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users?.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full h-9 justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newTaskDueDate ? format(newTaskDueDate, "MMM d") : "Due date..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <CalendarPicker
                            mode="single"
                            selected={newTaskDueDate}
                            onSelect={setNewTaskDueDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          createTaskMutation.mutate({
                            title: newTaskTitle,
                            description: newTaskDescription || undefined,
                            assignedUserId: newTaskAssignee || undefined,
                            dueDate: newTaskDueDate?.toISOString(),
                          });
                        }}
                        disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                        className="h-8 w-8 p-0"
                        data-testid="button-add-task"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Project Scope of Work Section */}
            <Card data-testid="card-project-scope">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#711419]" />
                  Project Scope of Work
                </CardTitle>
                {!isEditingScopeSection && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingScopeSection(true)}
                    data-testid="button-edit-scope"
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditingScopeSection ? (
                  <>
                    <div className="space-y-2">
                      <Label>Scope of Work</Label>
                      <RichTextEditor
                        content={editScopeOfWork}
                        onChange={setEditScopeOfWork}
                        placeholder="Describe the scope of work for this project..."
                        minHeight="min-h-[150px]"
                        editable={true}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Project Challenge Points</Label>
                      <Textarea
                        value={editChallengePoints}
                        onChange={(e) => setEditChallengePoints(e.target.value)}
                        placeholder="List any challenges or special considerations..."
                        rows={4}
                        data-testid="textarea-challenge-points"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => updateScopeMutation.mutate({ scopeOfWork: editScopeOfWork, challengePoints: editChallengePoints })}
                        disabled={updateScopeMutation.isPending}
                        className="bg-[#711419] hover:bg-[#5a1014] text-white"
                        data-testid="button-save-scope"
                      >
                        {updateScopeMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditingScopeSection(false);
                          setEditScopeOfWork(project?.scopeOfWork || "");
                          setEditChallengePoints(project?.challengePoints || "");
                        }}
                        data-testid="button-cancel-scope"
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Scope of Work</Label>
                      {project?.scopeOfWork ? (
                        <RichTextDisplay content={project.scopeOfWork} className="p-3 bg-slate-50 rounded-lg border" />
                      ) : (
                        <p className="text-sm text-muted-foreground italic p-3 bg-slate-50 rounded-lg border">No scope of work defined</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Project Challenge Points</Label>
                      {project?.challengePoints ? (
                        <p className="text-sm p-3 bg-slate-50 rounded-lg border whitespace-pre-wrap">{project.challengePoints}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic p-3 bg-slate-50 rounded-lg border">No challenge points noted</p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Equipment Details and Materials Section */}
            <Card data-testid="card-equipment-materials">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-[#711419]" />
                  Equipment & Materials
                </CardTitle>
                {equipmentHasChanges && (
                  <Button
                    onClick={() => updateEquipmentMutation.mutate({ equipmentMaterials: equipmentItems })}
                    disabled={updateEquipmentMutation.isPending}
                    className="bg-[#711419] hover:bg-[#5a1014] text-white"
                    data-testid="button-save-equipment"
                  >
                    {updateEquipmentMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Add from Catalog button */}
                  <div className="flex justify-end mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCatalogDialogOpen(true)}
                      className="gap-2"
                      data-testid="button-add-from-catalog"
                    >
                      <Package className="h-4 w-4" />
                      Add from Catalog
                    </Button>
                  </div>

                  {/* Equipment table - responsive scroll wrapper */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      {/* Equipment table header */}
                      <div className="grid grid-cols-[2fr_0.5fr_1fr_1fr_1fr_1fr_1fr_0.5fr] gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                        <div>Name</div>
                        <div>Qty</div>
                        <div>Unit Cost</div>
                        <div>Vendor</div>
                        <div>Date</div>
                        <div>Model #</div>
                        <div>Total</div>
                        <div>Actions</div>
                      </div>
                      
                      {/* Equipment items list */}
                      {equipmentItems.length === 0 && (
                        <p className="text-sm text-muted-foreground italic py-4 text-center">No equipment or materials added yet</p>
                      )}
                      
                      {equipmentItems.map((item) => {
                        const itemTotal = (item.unitCost || 0) * (item.quantity || 1);
                        return (
                          <div key={item.id} className="grid grid-cols-[2fr_0.5fr_1fr_1fr_1fr_1fr_1fr_0.5fr] gap-2 items-center py-2 border-b border-slate-100">
                            {editingEquipmentId === item.id ? (
                              <>
                                <div>
                                  <Input
                                    value={item.name}
                                    onChange={(e) => handleUpdateEquipmentItem(item.id, { name: e.target.value })}
                                    placeholder="Item name"
                                    data-testid={`input-equipment-name-${item.id}`}
                                  />
                                </div>
                                <div>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={item.quantity}
                                    onChange={(e) => handleUpdateEquipmentItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                                    className="text-center"
                                    data-testid={`input-equipment-qty-${item.id}`}
                                  />
                                </div>
                                <div>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={item.unitCost ?? ""}
                                      onChange={(e) => handleUpdateEquipmentItem(item.id, { unitCost: e.target.value ? parseFloat(e.target.value) : undefined })}
                                      className="pl-6"
                                      placeholder="0.00"
                                      data-testid={`input-equipment-cost-${item.id}`}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <Input
                                    value={item.vendor || ""}
                                    onChange={(e) => handleUpdateEquipmentItem(item.id, { vendor: e.target.value })}
                                    placeholder="Vendor"
                                    data-testid={`input-equipment-vendor-${item.id}`}
                                  />
                                </div>
                                <div>
                                  <Input
                                    type="date"
                                    value={item.date || ""}
                                    onChange={(e) => handleUpdateEquipmentItem(item.id, { date: e.target.value })}
                                    data-testid={`input-equipment-date-${item.id}`}
                                  />
                                </div>
                                <div>
                                  <Input
                                    value={item.modelNumber || ""}
                                    onChange={(e) => handleUpdateEquipmentItem(item.id, { modelNumber: e.target.value })}
                                    placeholder="Model #"
                                    data-testid={`input-equipment-model-${item.id}`}
                                  />
                                </div>
                                <div className="text-sm font-medium text-green-700">
                                  {formatCurrency(itemTotal)}
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingEquipmentId(null)}
                                    className="h-8 w-8 p-0"
                                    data-testid={`button-done-equipment-${item.id}`}
                                  >
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-sm font-medium">{item.name}</div>
                                <div className="text-sm text-center">{item.quantity}</div>
                                <div className="text-sm">{item.unitCost ? formatCurrency(item.unitCost) : "—"}</div>
                                <div className="text-sm text-muted-foreground">{item.vendor || "—"}</div>
                                <div className="text-sm text-muted-foreground">{item.date ? format(new Date(item.date), "MMM d, yyyy") : "—"}</div>
                                <div className="text-sm text-muted-foreground">{item.modelNumber || "—"}</div>
                                <div className="text-sm font-medium text-green-700">
                                  {item.unitCost ? (
                                    <span title={`${item.quantity} × ${formatCurrency(item.unitCost)}`}>
                                      {formatCurrency(itemTotal)}
                                    </span>
                                  ) : "—"}
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingEquipmentId(item.id)}
                                    className="h-8 w-8 p-0"
                                    data-testid={`button-edit-equipment-${item.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEquipmentItem(item.id)}
                                    className="h-8 w-8 p-0 hover:text-destructive"
                                    data-testid={`button-delete-equipment-${item.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Add new item row */}
                      <div className="grid grid-cols-[2fr_0.5fr_1fr_1fr_1fr_1fr_1fr_0.5fr] gap-2 items-center pt-3 border-t mt-2">
                        <div>
                          <Input
                            value={newEquipmentItem.name || ""}
                            onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, name: e.target.value })}
                            placeholder="New item name"
                            data-testid="input-new-equipment-name"
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            min={1}
                            value={newEquipmentItem.quantity || 1}
                            onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, quantity: parseInt(e.target.value) || 1 })}
                            className="text-center"
                            data-testid="input-new-equipment-qty"
                          />
                        </div>
                        <div>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={newEquipmentItem.unitCost ?? ""}
                              onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, unitCost: e.target.value ? parseFloat(e.target.value) : undefined })}
                              className="pl-6"
                              placeholder="0.00"
                              data-testid="input-new-equipment-cost"
                            />
                          </div>
                        </div>
                        <div>
                          <Input
                            value={newEquipmentItem.vendor || ""}
                            onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, vendor: e.target.value })}
                            placeholder="Vendor"
                            data-testid="input-new-equipment-vendor"
                          />
                        </div>
                        <div>
                          <Input
                            type="date"
                            value={newEquipmentItem.date || format(new Date(), "yyyy-MM-dd")}
                            onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, date: e.target.value })}
                            data-testid="input-new-equipment-date"
                          />
                        </div>
                        <div>
                          <Input
                            value={newEquipmentItem.modelNumber || ""}
                            onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, modelNumber: e.target.value })}
                            placeholder="Model #"
                            data-testid="input-new-equipment-model"
                          />
                        </div>
                        <div className="text-sm font-medium text-muted-foreground">
                          {newEquipmentItem.unitCost ? formatCurrency((newEquipmentItem.unitCost || 0) * (newEquipmentItem.quantity || 1)) : "—"}
                        </div>
                        <div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddEquipmentItem}
                            disabled={!newEquipmentItem.name?.trim()}
                            className="h-8 w-8 p-0"
                            data-testid="button-add-equipment"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Total Materials Cost */}
                      {equipmentItems.length > 0 && (
                        <div className="flex justify-end mt-4 pt-4 border-t-2">
                          <div className="flex items-center gap-3 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                            <span className="text-sm font-medium text-green-800">Total Materials Cost:</span>
                            <span className="text-lg font-bold text-green-700">{formatCurrency(totalMaterialsCost)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* File Attachment Section */}
                  <div className="mt-6 pt-4 border-t">
                    <Label className="text-sm font-medium mb-2 block">Attach Materials List or Documentation</Label>
                    <div
                      {...equipmentDropZoneProps}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
                        isDraggingEquipment
                          ? "border-[#711419] bg-[#711419]/5"
                          : "border-slate-200 hover:border-slate-300"
                      )}
                      data-testid="equipment-file-dropzone"
                    >
                      <input
                        type="file"
                        multiple
                        onChange={handleEquipmentFileSelect}
                        className="hidden"
                        id="equipment-file-upload"
                      />
                      <label htmlFor="equipment-file-upload" className="cursor-pointer">
                        <Upload className={cn(
                          "w-6 h-6 mx-auto mb-2",
                          isDraggingEquipment ? "text-[#711419]" : "text-muted-foreground"
                        )} />
                        <p className={cn(
                          "text-sm",
                          isDraggingEquipment ? "text-[#711419] font-medium" : "text-muted-foreground"
                        )}>
                          {isDraggingEquipment ? "Drop files here" : "Drag & drop files or click to upload"}
                        </p>
                      </label>
                    </div>

                    {/* File queue display */}
                    {equipmentFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {equipmentFiles.map((f, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 border rounded bg-slate-50">
                            <div className="flex items-center gap-2 min-w-0">
                              {f.preview ? (
                                <img src={f.preview} alt="" className="w-8 h-8 object-cover rounded" />
                              ) : (
                                <File className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span className="text-sm truncate">{f.file.name}</span>
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeEquipmentFile(idx)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          onClick={uploadEquipmentFilesHandler}
                          disabled={isUploadingEquipmentFiles}
                          className="w-full bg-[#711419] hover:bg-[#5a1014] text-white"
                          data-testid="button-upload-equipment-files"
                        >
                          {isUploadingEquipmentFiles ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload {equipmentFiles.length} File{equipmentFiles.length > 1 ? "s" : ""}
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Project Timeline Section */}
            <Card data-testid="card-project-timeline-overview">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-[#711419]" />
                  Project Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Comment input with @mention support */}
                  <CommentComposer
                    entityType="project"
                    entityId={projectId || ""}
                    placeholder="Add a comment about this project..."
                    onCommentPosted={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", "project", projectId] });
                      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"] });
                      refetchOverviewActivities();
                    }}
                  />

                  {/* Comments section */}
                  <div className="mt-4">
                    <CommentThread entityType="project" entityId={projectId || ""} />
                  </div>

                  {/* Recent activity entries */}
                  {overviewActivitiesLoading ? (
                    <div className="space-y-3 py-4">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : overviewActivities.length === 0 ? (
                    <div className="text-center py-6">
                      <History className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No activity yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Comments and activity will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {overviewActivities.map((activity) => {
                        const metadata = activity.metadata || {};
                        const content = metadata.content || activity.title || "";
                        const attachments = metadata.attachments || metadata.photos || metadata.files || [];
                        let timestamp = activity.createdAt || "";
                        if (timestamp && !timestamp.endsWith('Z') && !timestamp.includes('+')) {
                          timestamp = timestamp + 'Z';
                        }
                        
                        return (
                          <div 
                            key={activity.id} 
                            className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                            data-testid={`timeline-entry-overview-${activity.id}`}
                          >
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
                              <MessageSquare className="h-4 w-4 text-gray-700" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-medium text-sm text-slate-700 truncate">
                                  {activity.userName || 'Unknown User'}
                                </span>
                                <span className="text-xs text-slate-400 flex-shrink-0">
                                  {timestamp ? format(new Date(timestamp), "MMM d, yyyy 'at' h:mm a") : ""}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 line-clamp-2 whitespace-pre-wrap">
                                {content}
                              </p>
                              {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {attachments.map((att: ActivityAttachment, idx: number) => (
                                    <a
                                      key={idx}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                                    >
                                      <File className="w-3 h-3" />
                                      {att.filename || att.originalName || "Attachment"}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* View All Timeline button */}
                  <div className="pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-[#711419] hover:text-[#711419] hover:bg-[#711419]/10"
                      onClick={() => setActiveTab("timeline")}
                      data-testid="button-view-all-timeline"
                    >
                      View All Timeline
                      <History className="h-4 w-4 ml-1" />
                    </Button>
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

          <TabsContent value="job-costing" className="mt-4 data-[state=inactive]:hidden" forceMount>
            <JobCostingTab projectId={projectId!} project={project} />
          </TabsContent>

          <TabsContent value="comments" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <MessageSquare className="h-5 w-5 text-[#711419]" />
                  Comments
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <CommentThread entityType="project" entityId={projectId!} />
                <div className="border-t pt-4 mt-4">
                  <CommentComposer 
                    entityType="project" 
                    entityId={projectId!}
                    onCommentPosted={() => queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", "project", projectId] })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            <EntityTasksTab
              entityType="project"
              entityId={projectId!}
              customerId={project?.customerId || project?.customer?.id}
              customerName={project?.customerName || project?.customer?.name}
            />
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
            <DialogFooter className="flex-col gap-2">
              {(!scheduledDate || !woTitle.trim() || !woDescription.trim() || !areRequiredQuestionsAnswered()) && (
                <p className="text-xs text-amber-600 w-full text-left">
                  Missing: {[
                    !scheduledDate && "date",
                    !woTitle.trim() && "title",
                    !woDescription.trim() && "description",
                    !areRequiredQuestionsAnswered() && "required checklist questions"
                  ].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="flex gap-2 w-full justify-end">
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
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add from Catalog Dialog */}
        <Dialog open={catalogDialogOpen} onOpenChange={(open) => {
          setCatalogDialogOpen(open);
          if (!open) {
            setSelectedCatalogItems(new Map());
            setCatalogSearch("");
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Add from Materials Catalog
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search by name, category, part number, or vendor..."
                  className="pl-9"
                  data-testid="input-catalog-search"
                />
              </div>

              {/* Catalog items list */}
              <div className="flex-1 overflow-y-auto border rounded-lg">
                {catalogLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredCatalogItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {catalogSearch ? "No items match your search" : "No items in catalog"}
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredCatalogItems.map((item) => {
                      const isSelected = selectedCatalogItems.has(item.id);
                      const selectedItem = selectedCatalogItems.get(item.id);
                      return (
                        <div 
                          key={item.id} 
                          className={cn(
                            "p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors",
                            isSelected && "bg-blue-50"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleToggleCatalogItem(item, !!checked)}
                            data-testid={`checkbox-catalog-${item.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{item.name}</span>
                              {item.category && (
                                <Badge variant="outline" className="text-xs">{item.category}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              {item.partNumber && <span>#{item.partNumber}</span>}
                              {item.vendor && <span>Vendor: {item.vendor}</span>}
                              {item.unitCost && <span className="text-green-600 font-medium">{formatCurrency(parseFloat(item.unitCost.toString()))}</span>}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Qty:</Label>
                              <Input
                                type="number"
                                min={1}
                                value={selectedItem?.quantity || 1}
                                onChange={(e) => handleCatalogItemQuantityChange(item.id, parseInt(e.target.value) || 1)}
                                className="w-16 h-8 text-center"
                                data-testid={`input-catalog-qty-${item.id}`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected count */}
              {selectedCatalogItems.size > 0 && (
                <div className="text-sm text-muted-foreground">
                  {selectedCatalogItems.size} item{selectedCatalogItems.size > 1 ? 's' : ''} selected
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCatalogDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddFromCatalog}
                disabled={selectedCatalogItems.size === 0}
                className="bg-[#711419] hover:bg-[#5a1014] gap-2"
                data-testid="button-add-selected-catalog"
              >
                <Plus className="h-4 w-4" />
                Add Selected ({selectedCatalogItems.size})
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

type UploadedAttachment = ActivityAttachment;


function ProjectTimelineTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    files: uploadedFiles,
    isDragging: isDraggingDialog,
    dropZoneProps: dialogDropZoneProps,
    handleFileSelect,
    removeFile,
    clearFiles: clearUploadedFiles,
  } = useFileDrop();

  const { data: activitiesData, isLoading, refetch } = useQuery<ProjectActivityWithMeta[]>({
    queryKey: ["/api/crm/projects", projectId, "activities"],
    queryFn: async () => {
      const response = await fetch(`/api/crm/projects/${projectId}/activities`, { credentials: 'include' });
      return response.json();
    },
  });
  const activities = Array.isArray(activitiesData) ? activitiesData : [];

  const uploadFiles = async (files: { file: File }[]): Promise<ActivityAttachment[]> => {
    if (files.length === 0) return [];
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f.file));
    const response = await fetch('/api/activities/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to upload files');
    return response.json();
  };

  const createActivityMutation = useMutation({
    mutationFn: async (data: { activityType: string; title: string; metadata?: Record<string, any> }) => {
      const response = await apiRequest("POST", `/api/crm/projects/${projectId}/activities`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Update added" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"], exact: false });
      setShowAddDialog(false);
      setUpdateText("");
      clearUploadedFiles();
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to add update", variant: "destructive" });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async (activityId: string) => {
      return apiRequest("DELETE", `/api/crm/projects/${projectId}/activities/${activityId}`);
    },
    onSuccess: () => {
      toast({ title: "Update deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "activities"], exact: false });
    },
    onError: () => {
      toast({ title: "Failed to delete update", variant: "destructive" });
    },
  });

  const handleSubmit = async () => {
    if (!updateText.trim()) {
      toast({ title: "Please enter some text", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      let attachments: ActivityAttachment[] = [];
      if (uploadedFiles.length > 0) {
        attachments = await uploadFiles(uploadedFiles);
      }
      const title = updateText.substring(0, 50) + (updateText.length > 50 ? "..." : "");
      await createActivityMutation.mutateAsync({
        activityType: "note",
        title,
        metadata: { 
          content: updateText,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      });
    } catch (error) {
      toast({ title: "Failed to add update", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
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

  const getActivityContent = (activity: ProjectActivityWithMeta) => {
    const metadata = activity.metadata || {};
    return metadata.content || activity.title || "";
  };

  const getActivityAttachments = (activity: ProjectActivityWithMeta): ActivityAttachment[] => {
    const metadata = activity.metadata || {};
    return metadata.attachments || metadata.photos || metadata.files || [];
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            Project Timeline
          </CardTitle>
          <Button onClick={() => setShowAddDialog(true)} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
            <Plus className="w-4 h-4 mr-2" />
            Add Update
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No updates yet</p>
              <p className="text-sm mt-1">Add the first update to start the timeline</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedDates.map(dateKey => (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {groupedByDay[dateKey].label}
                    </span>
                  </div>
                  <div className="space-y-3 ml-6 border-l-2 border-muted pl-4">
                    {groupedByDay[dateKey].activities.map(activity => {
                      const content = getActivityContent(activity);
                      const attachments = getActivityAttachments(activity);
                      let timestamp = activity.createdAt || "";
                      if (timestamp && !timestamp.endsWith('Z') && !timestamp.includes('+')) {
                        timestamp = timestamp + 'Z';
                      }
                      const time = timestamp ? format(new Date(timestamp), "h:mm a") : "";

                      return (
                        <div key={activity.id} className="bg-muted/30 rounded-lg p-4 relative group">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm whitespace-pre-wrap">{content}</p>
                              {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {attachments.map((att, idx) => (
                                    <a
                                      key={idx}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                                    >
                                      <File className="w-3 h-3" />
                                      {att.filename || att.originalName || "Attachment"}
                                    </a>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <span>{time}</span>
                                {activity.userName && (
                                  <>
                                    <span>•</span>
                                    <span>{activity.userName}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteActivityMutation.mutate(activity.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Update <span className="text-red-500">*</span></Label>
              <Textarea
                value={updateText}
                onChange={(e) => setUpdateText(e.target.value)}
                placeholder="What's the latest on this project?"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Attachment (optional)</Label>
              <div 
                {...dialogDropZoneProps}
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
                  isDraggingDialog
                    ? "border-[#711419] bg-[#711419]/5"
                    : "border-slate-200 hover:border-slate-300"
                )}
                data-testid="dialog-file-dropzone"
              >
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  id="update-file-upload"
                />
                <label htmlFor="update-file-upload" className="cursor-pointer">
                  <Upload className={cn(
                    "w-8 h-8 mx-auto mb-2",
                    isDraggingDialog ? "text-[#711419]" : "text-muted-foreground"
                  )} />
                  <p className={cn(
                    "text-sm",
                    isDraggingDialog ? "text-[#711419] font-medium" : "text-muted-foreground"
                  )}>
                    {isDraggingDialog ? "Drop files here" : "Drag & drop files or click to upload"}
                  </p>
                </label>
              </div>
              {uploadedFiles.length > 0 && (
                <div className="space-y-2 mt-2">
                  {uploadedFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2 min-w-0">
                        {f.preview ? (
                          <img src={f.preview} alt="" className="w-8 h-8 object-cover rounded" />
                        ) : (
                          <File className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-sm truncate">{f.file.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeFile(idx)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setUpdateText(""); clearUploadedFiles(); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!updateText.trim() || isSubmitting}
              className="bg-[#711419] hover:bg-[#5a1014]"
            >
              {isSubmitting ? "Saving..." : "Add Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type JobCostingSettings = {
  overheadPercent: number;
  commissionPercent: number;
};

const LABOR_TYPES = ["Install", "Service", "Supervision", "Other"] as const;

function JobCostingTab({ projectId, project }: { projectId: string; project: CrmProject }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProjectLaborEntry>>({});
  const [newEntry, setNewEntry] = useState<{
    date: string;
    contractor: string;
    description: string;
    laborType: string;
    amount: string;
  }>({
    date: format(new Date(), "yyyy-MM-dd"),
    contractor: "",
    description: "",
    laborType: "Install",
    amount: "",
  });

  const { data: laborEntries, isLoading: laborLoading, refetch: refetchLabor } = useQuery<ProjectLaborEntry[]>({
    queryKey: ["/api/crm/projects", projectId, "labor"],
    queryFn: async () => {
      const response = await fetch(`/api/crm/projects/${projectId}/labor`, { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch labor entries");
      return response.json();
    },
  });

  const { data: jobCostingSettings, isLoading: settingsLoading } = useQuery<JobCostingSettings>({
    queryKey: ["/api/crm/job-costing-settings"],
    queryFn: async () => {
      const response = await fetch("/api/crm/job-costing-settings", { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch job costing settings");
      return response.json();
    },
  });

  const updateJobCostingSettingsMutation = useMutation({
    mutationFn: async (data: { overheadPercent?: number; commissionPercent?: number }) => {
      const payload: Record<string, string | null> = {};
      if (data.overheadPercent !== undefined) {
        payload.overheadPercent = data.overheadPercent !== null ? String(data.overheadPercent) : null;
      }
      if (data.commissionPercent !== undefined) {
        payload.commissionPercent = data.commissionPercent !== null ? String(data.commissionPercent) : null;
      }
      const res = await apiRequest("PATCH", `/api/crm/projects/${projectId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Project cost settings updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
    },
    onError: () => {
      toast({ title: "Failed to update cost settings", variant: "destructive" });
    },
  });

  const createLaborMutation = useMutation({
    mutationFn: async (data: typeof newEntry) => {
      const response = await apiRequest("POST", `/api/crm/projects/${projectId}/labor`, {
        date: data.date,
        contractor: data.contractor,
        description: data.description || null,
        laborType: data.laborType,
        amount: parseFloat(data.amount),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Labor entry added" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "labor"] });
      setNewEntry({
        date: format(new Date(), "yyyy-MM-dd"),
        contractor: "",
        description: "",
        laborType: "Install",
        amount: "",
      });
    },
    onError: () => {
      toast({ title: "Failed to add labor entry", variant: "destructive" });
    },
  });

  const updateLaborMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProjectLaborEntry> }) => {
      const response = await apiRequest("PUT", `/api/crm/projects/${projectId}/labor/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Labor entry updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "labor"] });
      setEditingId(null);
      setEditForm({});
    },
    onError: () => {
      toast({ title: "Failed to update labor entry", variant: "destructive" });
    },
  });

  const deleteLaborMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/projects/${projectId}/labor/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Labor entry deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "labor"] });
    },
    onError: () => {
      toast({ title: "Failed to delete labor entry", variant: "destructive" });
    },
  });

  const revenue = parseFloat((project.actualValue || project.expectedValue || "0").toString());
  
  const laborTotal = (laborEntries || []).reduce((sum, entry) => 
    sum + parseFloat(entry.amount?.toString() || "0"), 0);
  
  const equipmentMaterials = (project.equipmentMaterials || []) as ProjectEquipmentItem[];
  const materialsTotal = equipmentMaterials.reduce((sum, item) => 
    sum + ((item.unitCost || 0) * (item.quantity || 1)), 0);
  
  const grossProfit = revenue - laborTotal - materialsTotal;
  
  const overheadPercent = project?.overheadPercent != null ? Number(project.overheadPercent) : (jobCostingSettings?.overheadPercent || 30);
  const commissionPercent = project?.commissionPercent != null ? Number(project.commissionPercent) : (jobCostingSettings?.commissionPercent || 5);
  
  const overhead = revenue * (overheadPercent / 100);
  const commission = revenue * (commissionPercent / 100);
  const netProfit = grossProfit - overhead - commission;

  const laborPercent = revenue > 0 ? (laborTotal / revenue) * 100 : 0;
  const materialsPercent = revenue > 0 ? (materialsTotal / revenue) * 100 : 0;
  const grossProfitPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const overheadPercentOfRevenue = revenue > 0 ? (overhead / revenue) * 100 : 0;
  const commissionPercentOfRevenue = revenue > 0 ? (commission / revenue) * 100 : 0;
  const netProfitPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const handleAddEntry = () => {
    if (!newEntry.date || !newEntry.contractor || !newEntry.amount) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createLaborMutation.mutate(newEntry);
  };

  const startEdit = (entry: ProjectLaborEntry) => {
    setEditingId(entry.id);
    setEditForm({
      date: entry.date,
      contractor: entry.contractor,
      description: entry.description,
      laborType: entry.laborType,
      amount: entry.amount,
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateLaborMutation.mutate({
      id: editingId,
      data: {
        date: editForm.date,
        contractor: editForm.contractor,
        description: editForm.description,
        laborType: editForm.laborType,
        amount: editForm.amount,
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#711419]" />
            Project Cost Settings
          </CardTitle>
          <CardDescription>
            Adjust overhead and commission percentages for this project. Leave blank to use global defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-3">
              <Label htmlFor="project-overhead" className="text-sm font-medium whitespace-nowrap">
                Overhead %
              </Label>
              <Input
                id="project-overhead"
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="w-24"
                placeholder={String(jobCostingSettings?.overheadPercent || 30)}
                defaultValue={project?.overheadPercent != null ? Number(project.overheadPercent) : ""}
                onBlur={(e) => {
                  const value = e.target.value ? parseFloat(e.target.value) : null;
                  if (value !== (project?.overheadPercent != null ? Number(project.overheadPercent) : null)) {
                    updateJobCostingSettingsMutation.mutate({ overheadPercent: value ?? undefined });
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">(Default: {jobCostingSettings?.overheadPercent || 30}%)</span>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="project-commission" className="text-sm font-medium whitespace-nowrap">
                Commission %
              </Label>
              <Input
                id="project-commission"
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="w-24"
                placeholder={String(jobCostingSettings?.commissionPercent || 5)}
                defaultValue={project?.commissionPercent != null ? Number(project.commissionPercent) : ""}
                onBlur={(e) => {
                  const value = e.target.value ? parseFloat(e.target.value) : null;
                  if (value !== (project?.commissionPercent != null ? Number(project.commissionPercent) : null)) {
                    updateJobCostingSettingsMutation.mutate({ commissionPercent: value ?? undefined });
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">(Default: {jobCostingSettings?.commissionPercent || 5}%)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#711419]" />
            Profitability Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="text-center p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Revenue</p>
                <p className="text-lg font-semibold">{formatCurrency(revenue)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Labor</p>
                <p className="text-lg font-semibold text-orange-600">{formatCurrency(laborTotal)}</p>
                <p className="text-xs text-muted-foreground">{laborPercent.toFixed(1)}%</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Materials</p>
                <p className="text-lg font-semibold text-orange-600">{formatCurrency(materialsTotal)}</p>
                <p className="text-xs text-muted-foreground">{materialsPercent.toFixed(1)}%</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Gross Profit</p>
                <p className={cn("text-lg font-semibold", grossProfit >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatCurrency(grossProfit)}
                </p>
                <p className="text-xs text-muted-foreground">{grossProfitPercent.toFixed(1)}%</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Overhead ({overheadPercent}%)</p>
                <p className="text-lg font-semibold text-slate-600">{formatCurrency(overhead)}</p>
                <p className="text-xs text-muted-foreground">{overheadPercentOfRevenue.toFixed(1)}%</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Commission ({commissionPercent}%)</p>
                <p className="text-lg font-semibold text-slate-600">{formatCurrency(commission)}</p>
                <p className="text-xs text-muted-foreground">{commissionPercentOfRevenue.toFixed(1)}%</p>
              </div>
              <div className={cn(
                "text-center p-3 rounded-lg border-2",
                netProfit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              )}>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 font-medium">Net Profit</p>
                <p className={cn("text-xl font-bold", netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatCurrency(netProfit)}
                </p>
                <p className="text-xs text-muted-foreground font-medium">{netProfitPercent.toFixed(1)}%</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#711419]" />
            Labor Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {laborLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-left px-4 py-3 font-medium">Contractor</th>
                      <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Description</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-right px-4 py-3 font-medium">Amount</th>
                      <th className="text-right px-4 py-3 font-medium w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(laborEntries || []).map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        {editingId === entry.id ? (
                          <>
                            <td className="px-4 py-2">
                              <Input
                                type="date"
                                value={editForm.date?.toString() || ""}
                                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                className="h-8"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                value={editForm.contractor || ""}
                                onChange={(e) => setEditForm({ ...editForm, contractor: e.target.value })}
                                className="h-8"
                              />
                            </td>
                            <td className="px-4 py-2 hidden md:table-cell">
                              <Input
                                value={editForm.description || ""}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                className="h-8"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Select 
                                value={editForm.laborType || "Install"} 
                                onValueChange={(v) => setEditForm({ ...editForm, laborType: v })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {LABOR_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={editForm.amount?.toString() || ""}
                                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value as any })}
                                className="h-8 text-right"
                              />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleUpdate}
                                  disabled={updateLaborMutation.isPending}
                                  className="h-8 w-8 p-0 text-green-600"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setEditingId(null); setEditForm({}); }}
                                  className="h-8 w-8 p-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">{entry.date ? format(new Date(entry.date), "MMM d, yyyy") : "—"}</td>
                            <td className="px-4 py-3">{entry.contractor}</td>
                            <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{entry.description || "—"}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{entry.laborType || "Other"}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(entry.amount)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEdit(entry)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteLaborMutation.mutate(entry.id)}
                                  className="h-8 w-8 p-0 hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-slate-50/50">
                      <td className="px-4 py-2">
                        <Input
                          type="date"
                          value={newEntry.date}
                          onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                          className="h-8"
                          data-testid="input-labor-date"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          placeholder="Contractor name"
                          value={newEntry.contractor}
                          onChange={(e) => setNewEntry({ ...newEntry, contractor: e.target.value })}
                          className="h-8"
                          data-testid="input-labor-contractor"
                        />
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        <Input
                          placeholder="Description (optional)"
                          value={newEntry.description}
                          onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                          className="h-8"
                          data-testid="input-labor-description"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Select value={newEntry.laborType} onValueChange={(v) => setNewEntry({ ...newEntry, laborType: v })}>
                          <SelectTrigger className="h-8" data-testid="select-labor-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LABOR_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={newEntry.amount}
                          onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
                          className="h-8 text-right"
                          data-testid="input-labor-amount"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddEntry}
                          disabled={createLaborMutation.isPending || !newEntry.date || !newEntry.contractor || !newEntry.amount}
                          className="h-8"
                          data-testid="button-add-labor"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="border-t-2">
                    <tr className="bg-slate-100">
                      <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total Labor:</td>
                      <td className="px-4 py-3 text-right font-bold text-lg">{formatCurrency(laborTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-[#711419]" />
            Equipment & Materials
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              const overviewTab = document.querySelector('[data-testid="tab-overview"]') as HTMLButtonElement;
              if (overviewTab) overviewTab.click();
            }}
          >
            Edit in Overview
          </Button>
        </CardHeader>
        <CardContent>
          {equipmentMaterials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Boxes className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No equipment or materials added</p>
              <p className="text-sm mt-1">Add items in the Overview tab</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Model #</th>
                    <th className="text-center px-4 py-3 font-medium">Qty</th>
                    <th className="text-right px-4 py-3 font-medium">Unit Cost</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {equipmentMaterials.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.vendor && <p className="text-xs text-muted-foreground">{item.vendor}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{item.modelNumber || "—"}</td>
                      <td className="px-4 py-3 text-center">{item.quantity}</td>
                      <td className="px-4 py-3 text-right">{item.unitCost ? formatCurrency(item.unitCost) : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency((item.unitCost || 0) * (item.quantity || 1))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2">
                  <tr className="bg-slate-100">
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total Materials:</td>
                    <td className="px-4 py-3 text-right font-bold text-lg">{formatCurrency(materialsTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
