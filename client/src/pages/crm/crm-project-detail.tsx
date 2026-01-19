import { useState, useEffect, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
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
  ProjectEquipmentItem, CrmProjectTask
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
  const [newEquipmentItem, setNewEquipmentItem] = useState<Partial<ProjectEquipmentItem>>({ name: "", quantity: 1, modelNumber: "", notes: "" });
  const [equipmentHasChanges, setEquipmentHasChanges] = useState(false);

  // Admin Tasks state
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<string | null>(null);
  const [newTaskDueDate, setNewTaskDueDate] = useState<Date | undefined>(undefined);

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
      setShowAddTaskDialog(false);
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
    mutationFn: async (data: { id: string; completedAt: string | null }) => {
      const response = await apiRequest("PATCH", `/api/crm/project-tasks/${data.id}`, { completedAt: data.completedAt });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "tasks"] });
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
    };
    setEquipmentItems([...equipmentItems, item]);
    setNewEquipmentItem({ name: "", quantity: 1, modelNumber: "", notes: "" });
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
                <h1 className="text-2xl font-bold" data-testid="text-project-title">{project.title}</h1>
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
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold">Project Schedule</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setShowEditScheduleDialog(true)}>
                  Edit
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Start Date</p>
                    <p className="text-sm text-slate-700">{formatDate(project.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">End Date</p>
                    <p className="text-sm text-slate-700">{formatDate(project.endDate)}</p>
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

            {/* Admin Tasks Section */}
            <Card data-testid="card-admin-tasks">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5 text-[#711419]" />
                  Admin Tasks
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddTaskDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Task
                </Button>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : !projectTasks || projectTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tasks yet. Add a task to get started.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {projectTasks.map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border",
                          task.completedAt ? "bg-muted/50" : "bg-white"
                        )}
                      >
                        <Checkbox
                          checked={!!task.completedAt}
                          onCheckedChange={(checked) => {
                            updateTaskMutation.mutate({
                              id: task.id,
                              completedAt: checked ? new Date().toISOString() : null,
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "font-medium text-sm",
                            task.completedAt && "line-through text-muted-foreground"
                          )}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {task.assignedUserName && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {task.assignedUserName}
                              </span>
                            )}
                            {task.dueDate && (
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {format(new Date(task.dueDate), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteTaskMutation.mutate(task.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
                  {/* Equipment table header */}
                  <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div className="col-span-4">Name</div>
                    <div className="col-span-1">Qty</div>
                    <div className="col-span-3">Model Number</div>
                    <div className="col-span-3">Notes</div>
                    <div className="col-span-1">Actions</div>
                  </div>
                  
                  {/* Equipment items list */}
                  {equipmentItems.length === 0 && (
                    <p className="text-sm text-muted-foreground italic py-4 text-center">No equipment or materials added yet</p>
                  )}
                  
                  {equipmentItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-100">
                      {editingEquipmentId === item.id ? (
                        <>
                          <div className="col-span-4">
                            <Input
                              value={item.name}
                              onChange={(e) => handleUpdateEquipmentItem(item.id, { name: e.target.value })}
                              placeholder="Item name"
                              data-testid={`input-equipment-name-${item.id}`}
                            />
                          </div>
                          <div className="col-span-1">
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => handleUpdateEquipmentItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                              data-testid={`input-equipment-qty-${item.id}`}
                            />
                          </div>
                          <div className="col-span-3">
                            <Input
                              value={item.modelNumber || ""}
                              onChange={(e) => handleUpdateEquipmentItem(item.id, { modelNumber: e.target.value })}
                              placeholder="Model #"
                              data-testid={`input-equipment-model-${item.id}`}
                            />
                          </div>
                          <div className="col-span-3">
                            <Input
                              value={item.notes || ""}
                              onChange={(e) => handleUpdateEquipmentItem(item.id, { notes: e.target.value })}
                              placeholder="Notes"
                              data-testid={`input-equipment-notes-${item.id}`}
                            />
                          </div>
                          <div className="col-span-1 flex gap-1">
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
                          <div className="col-span-4 text-sm">{item.name}</div>
                          <div className="col-span-1 text-sm">{item.quantity}</div>
                          <div className="col-span-3 text-sm text-muted-foreground">{item.modelNumber || "—"}</div>
                          <div className="col-span-3 text-sm text-muted-foreground">{item.notes || "—"}</div>
                          <div className="col-span-1 flex gap-1">
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
                  ))}
                  
                  {/* Add new item row */}
                  <div className="grid grid-cols-12 gap-2 items-center pt-3 border-t mt-2">
                    <div className="col-span-4">
                      <Input
                        value={newEquipmentItem.name || ""}
                        onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, name: e.target.value })}
                        placeholder="New item name"
                        data-testid="input-new-equipment-name"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        min={1}
                        value={newEquipmentItem.quantity || 1}
                        onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, quantity: parseInt(e.target.value) || 1 })}
                        data-testid="input-new-equipment-qty"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={newEquipmentItem.modelNumber || ""}
                        onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, modelNumber: e.target.value })}
                        placeholder="Model # (optional)"
                        data-testid="input-new-equipment-model"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={newEquipmentItem.notes || ""}
                        onChange={(e) => setNewEquipmentItem({ ...newEquipmentItem, notes: e.target.value })}
                        placeholder="Notes (optional)"
                        data-testid="input-new-equipment-notes"
                      />
                    </div>
                    <div className="col-span-1">
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
                  {/* Comment input with drag-and-drop file upload */}
                  <div className="space-y-3">
                    <Textarea
                      placeholder="Add a comment about this project..."
                      value={overviewComment}
                      onChange={(e) => setOverviewComment(e.target.value)}
                      rows={2}
                      className="w-full"
                      data-testid="textarea-project-timeline-comment"
                    />
                    
                    {/* Drag-and-drop file upload area */}
                    <div
                      {...overviewDropZoneProps}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
                        isDraggingOverview
                          ? "border-[#711419] bg-[#711419]/5"
                          : "border-slate-200 hover:border-slate-300"
                      )}
                      data-testid="overview-file-dropzone"
                    >
                      <input
                        type="file"
                        multiple
                        onChange={handleOverviewFileSelect}
                        className="hidden"
                        id="overview-file-upload"
                      />
                      <label htmlFor="overview-file-upload" className="cursor-pointer">
                        <Upload className={cn(
                          "w-6 h-6 mx-auto mb-2",
                          isDraggingOverview ? "text-[#711419]" : "text-muted-foreground"
                        )} />
                        <p className={cn(
                          "text-sm",
                          isDraggingOverview ? "text-[#711419] font-medium" : "text-muted-foreground"
                        )}>
                          {isDraggingOverview ? "Drop files here" : "Drag & drop files or click to upload"}
                        </p>
                      </label>
                    </div>

                    {/* File queue with thumbnails */}
                    {overviewFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2" data-testid="overview-file-queue">
                        {overviewFiles.map((f, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 border rounded-lg bg-slate-50"
                          >
                            {f.preview ? (
                              <img src={f.preview} alt="" className="w-10 h-10 object-cover rounded" />
                            ) : (
                              <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center">
                                <File className="w-5 h-5 text-slate-500" />
                              </div>
                            )}
                            <span className="text-xs truncate max-w-[100px]">{f.file.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeOverviewFile(idx)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Save button */}
                    <Button
                      onClick={handleSubmitOverviewComment}
                      disabled={(!overviewComment.trim() && overviewFiles.length === 0) || isSubmittingOverviewComment}
                      className="bg-[#711419] hover:bg-[#5a1014] text-white"
                      data-testid="button-save-project-timeline-comment"
                    >
                      {isSubmittingOverviewComment ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
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

        {/* Add Task Dialog */}
        <Dialog open={showAddTaskDialog} onOpenChange={setShowAddTaskDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Task Title *</Label>
                <Input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Enter task title..."
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={newTaskAssignee || "unassigned"} onValueChange={(v) => setNewTaskAssignee(v === "unassigned" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user..." />
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
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newTaskDueDate ? format(newTaskDueDate, "PPP") : "Select date..."}
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTaskDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  createTaskMutation.mutate({
                    title: newTaskTitle,
                    description: newTaskDescription || undefined,
                    assignedUserId: newTaskAssignee,
                    dueDate: newTaskDueDate?.toISOString(),
                  });
                }}
                disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
              >
                {createTaskMutation.isPending ? "Adding..." : "Add Task"}
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
