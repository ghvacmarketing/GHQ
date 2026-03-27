import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  Plus,
  X,
  Check,
  Building,
  User,
  LayoutGrid,
  Trash2,
  Inbox,
  Zap,
  Hourglass,
  UserCheck,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { 
  format, 
  isBefore, 
  startOfDay, 
  endOfDay,
  addDays,
  formatDistanceToNow,
  isToday as dateFnsIsToday,
} from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CrmUser, Task, TaskType, CrmCustomer, TaskStatus, TaskPriority, TaskRelatedEntityType } from "@shared/schema";

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  priority: z.enum(["low", "normal", "high"]),
  typeId: z.string().optional(),
  assignedToUserId: z.string().optional(),
  dueAt: z.date().optional().nullable().refine(
    (val) => {
      if (!val) return true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return val >= today;
    },
    { message: "Due date cannot be in the past" }
  ),
  relatedEntityType: z.enum(["customer", "lead", "project", "work_order", "invoice", "none"]).optional(),
  relatedEntityId: z.string().optional(),
  customerId: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

type TaskWithRelations = Task & {
  assignedToUser?: CrmUser | null;
  createdByUser?: CrmUser | null;
  type?: TaskType | null;
  customer?: CrmCustomer | null;
};

type TasksResponse = {
  tasks: TaskWithRelations[];
  total: number;
};

const priorityIndicatorColors: Record<TaskPriority, string> = {
  high: "bg-red-500",
  normal: "bg-gray-400",
  low: "bg-blue-500",
};

type SectionConfig = {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof AlertCircle;
};

const sectionConfigs: SectionConfig[] = [
  { key: "overdue", label: "Overdue", color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200", icon: AlertCircle },
  { key: "today", label: "Today", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200", icon: Clock },
  { key: "upcoming", label: "Upcoming", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: CalendarIcon },
  { key: "noDate", label: "No Due Date", color: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-gray-200", icon: CheckCircle2 },
];

function TaskCard({ 
  task, 
  onComplete, 
  isCompleting,
  onTaskClick,
  isHighlighted,
  onClearHighlight,
}: { 
  task: TaskWithRelations;
  onComplete: (taskId: string) => void;
  isCompleting: boolean;
  onTaskClick: (task: TaskWithRelations) => void;
  isHighlighted?: boolean;
  onClearHighlight?: () => void;
}) {
  const formatDueDate = (dueAt: string | Date | null) => {
    if (!dueAt) return null;
    const date = new Date(dueAt);
    return format(date, "MMM d, h:mm a");
  };

  return (
    <div 
      id={`task-${task.id}`}
      className={`group flex items-start gap-3 p-3 bg-white border rounded-lg hover:shadow-sm transition-all cursor-pointer ${
        isCompleting ? "opacity-50 scale-95" : ""
      } ${isHighlighted ? "ring-2 ring-[#711419] bg-red-50/30 border-[#711419]" : ""}`}
      onClick={() => {
        if (isHighlighted && onClearHighlight) onClearHighlight();
        onTaskClick(task);
      }}
    >
      <div 
        className="pt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          disabled={isCompleting}
          onClick={() => onComplete(task.id)}
          className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center hover:border-green-500 hover:bg-green-50 transition-colors"
        >
          {isCompleting && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </button>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityIndicatorColors[task.priority as TaskPriority]}`} />
          <span className="font-medium text-slate-900 truncate">{task.title}</span>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {task.dueAt && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDueDate(task.dueAt)}
            </span>
          )}
          
          {task.type && (
            <Badge variant="secondary" className="text-xs">
              {task.type.name}
            </Badge>
          )}
          
          {task.relatedEntityType && task.relatedEntityType !== "none" && (
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              <Building className="h-3 w-3 mr-1" />
              {task.relatedEntityType.replace("_", " ")}
            </Badge>
          )}
          
          {task.customer && !task.relatedEntityType && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              <User className="h-3 w-3 mr-1" />
              {task.customer.name}
            </Badge>
          )}
        </div>
      </div>
      
      {isCompleting && (
        <Loader2 className="h-4 w-4 animate-spin text-green-500" />
      )}
    </div>
  );
}

function TaskSection({
  config,
  tasks,
  onComplete,
  completingTaskId,
  onTaskClick,
  defaultOpen = true,
  highlightedTaskId,
  onClearHighlight,
}: {
  config: SectionConfig;
  tasks: TaskWithRelations[];
  onComplete: (taskId: string) => void;
  completingTaskId: string | null;
  onTaskClick: (task: TaskWithRelations) => void;
  defaultOpen?: boolean;
  highlightedTaskId?: string | null;
  onClearHighlight?: () => void;
}) {
  const hasHighlight = highlightedTaskId ? tasks.some(t => t.id === highlightedTaskId) : false;
  const [isOpen, setIsOpen] = useState(defaultOpen || hasHighlight);
  const Icon = config.icon;

  useEffect(() => {
    if (hasHighlight && !isOpen) setIsOpen(true);
  }, [hasHighlight]);

  if (tasks.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div 
          className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${config.bgColor} border ${config.borderColor}`}
        >
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className={`h-4 w-4 ${config.color}`} />
            ) : (
              <ChevronRight className={`h-4 w-4 ${config.color}`} />
            )}
            <Icon className={`h-4 w-4 ${config.color}`} />
            <span className={`font-semibold ${config.color}`}>{config.label}</span>
          </div>
          <Badge variant="secondary" className={`${config.bgColor} ${config.color} border ${config.borderColor}`}>
            {tasks.length}
          </Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-2 pl-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={onComplete}
              isCompleting={completingTaskId === task.id}
              onTaskClick={onTaskClick}
              isHighlighted={highlightedTaskId === task.id}
              onClearHighlight={onClearHighlight}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function CrmMyTasks() {
  usePageTitle("My Tasks");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);


  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const { data: tasksData, isLoading: tasksLoading } = useQuery<TasksResponse>({
    queryKey: ["/api/tasks", "my-tasks", currentUser?.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        assignedTo: currentUser!.id,
        limit: "100",
        hideCompleted: "true",
      });
      const res = await fetch(`/api/tasks?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    enabled: !!currentUser?.id,
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (!tasksData?.tasks) return;
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("highlight");
    if (!taskId) return;
    setHighlightedTaskId(taskId);
    window.history.replaceState({}, "", window.location.pathname);
    setTimeout(() => {
      const el = document.getElementById(`task-${taskId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }, [tasksData?.tasks]);

  const { data: taskTypes = [] } = useQuery<TaskType[]>({
    queryKey: ["/api/tasks/types"],
    enabled: !!currentUser,
  });

  const { data: crmUsers = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
      priority: "normal",
      typeId: undefined,
      assignedToUserId: undefined,
      dueAt: null,
      relatedEntityType: "none",
      relatedEntityId: "",
      customerId: undefined,
    },
  });

  const quickCreateMutation = useMutation({
    mutationFn: async (title: string) => {
      const payload = {
        title,
        status: "pending",
        priority: "normal",
        assignedToUserId: currentUser?.id,
        createdByUserId: currentUser?.id,
        taskList: "inbox",
      };
      return apiRequest("POST", "/api/tasks", payload);
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setNewTaskTitle("");
      setIsAddingTask(false);
      const newTask = await res.json();
      handleOpenEdit(newTask as TaskWithRelations);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const payload = {
        ...data,
        createdByUserId: currentUser?.id,
        assignedToUserId: data.assignedToUserId === "none" ? currentUser?.id : data.assignedToUserId || currentUser?.id,
        taskList: "inbox",
        dueAt: data.dueAt ? data.dueAt.toISOString() : null,
        typeId: data.typeId === "none" ? null : data.typeId,
        customerId: data.customerId === "none" ? null : data.customerId,
        relatedEntityType: data.relatedEntityType || "none",
        relatedEntityId: data.relatedEntityId || null,
      };
      return apiRequest("POST", "/api/tasks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
      toast({ title: "Task created successfully" });
      handleCloseDrawer();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      if (!selectedTask) throw new Error("No task selected");
      const payload = {
        ...data,
        dueAt: data.dueAt ? data.dueAt.toISOString() : null,
        typeId: data.typeId === "none" ? null : data.typeId,
        assignedToUserId: data.assignedToUserId === "none" ? null : data.assignedToUserId,
        customerId: data.customerId === "none" ? null : data.customerId,
        relatedEntityType: data.relatedEntityType || "none",
        relatedEntityId: data.relatedEntityId || null,
      };
      return apiRequest("PUT", `/api/tasks/${selectedTask.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
      toast({ title: "Task updated successfully" });
      handleCloseDrawer();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update task", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("No task selected");
      return apiRequest("DELETE", `/api/tasks/${selectedTask.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted successfully" });
      handleCloseDrawer();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete task", description: error.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setCompletingTaskId(taskId);
      await apiRequest("PUT", `/api/tasks/${taskId}`, { status: "completed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task completed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to complete the task.", variant: "destructive" });
    },
    onSettled: () => {
      setCompletingTaskId(null);
    },
  });

  const handleOpenEdit = (task: TaskWithRelations) => {
    setIsCreateMode(false);
    setSelectedTask(task);
    form.reset({
      title: task.title,
      description: task.description || "",
      status: task.status as TaskStatus,
      priority: task.priority as TaskPriority,
      typeId: task.typeId || undefined,
      assignedToUserId: task.assignedToUserId || undefined,
      dueAt: task.dueAt ? new Date(task.dueAt) : null,
      relatedEntityType: (task.relatedEntityType as TaskRelatedEntityType) || "none",
      relatedEntityId: task.relatedEntityId || "",
      customerId: task.customerId || undefined,
    });
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedTask(null);
    setIsCreateMode(false);
    form.reset();
  };

  const onSubmit = (data: TaskFormData) => {
    if (isCreateMode) {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  const { overdueTasks, todayTasks, upcomingTasks, noDateTasks } = useMemo(() => {
    if (!tasksData?.tasks) {
      return { overdueTasks: [], todayTasks: [], upcomingTasks: [], noDateTasks: [] };
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekEnd = endOfDay(addDays(now, 7));

    const activeTasks = tasksData.tasks.filter(
      (task) => task.status !== "completed" && task.status !== "cancelled"
    );

    const overdue: TaskWithRelations[] = [];
    const today: TaskWithRelations[] = [];
    const upcoming: TaskWithRelations[] = [];
    const noDate: TaskWithRelations[] = [];

    activeTasks.forEach((task) => {
      if (!task.dueAt) {
        noDate.push(task);
      } else {
        const dueDate = new Date(task.dueAt);
        if (isBefore(dueDate, todayStart)) {
          overdue.push(task);
        } else if (isBefore(dueDate, todayEnd) || dateFnsIsToday(dueDate)) {
          today.push(task);
        } else if (isBefore(dueDate, weekEnd)) {
          upcoming.push(task);
        } else {
          upcoming.push(task);
        }
      }
    });

    const sortByDue = (a: TaskWithRelations, b: TaskWithRelations) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    };

    const sortByPriority = (a: TaskWithRelations, b: TaskWithRelations) => {
      const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    };

    return {
      overdueTasks: overdue.sort(sortByDue),
      todayTasks: today.sort(sortByPriority),
      upcomingTasks: upcoming.sort(sortByDue),
      noDateTasks: noDate.sort(sortByPriority),
    };
  }, [tasksData?.tasks]);

  const handleComplete = (taskId: string) => {
    completeMutation.mutate(taskId);
  };

  const handleQuickAdd = () => {
    if (newTaskTitle.trim()) {
      quickCreateMutation.mutate(newTaskTitle.trim());
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const totalActiveTasks = overdueTasks.length + todayTasks.length + upcomingTasks.length + noDateTasks.length;


  return (
    <CrmLayout currentUser={currentUser} disableScroll>
      <div className="flex h-full">
        {/* Left Sidebar Navigation - Collapsible */}
        <div className={`
          flex-shrink-0 bg-slate-50 border-r border-slate-200 hidden md:flex flex-col
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'w-14' : 'w-56'}
        `}>
          <div className="p-2 border-b border-slate-200">
            <Button
              variant="ghost"
              size="icon"
              className="w-full h-8"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex-1 p-2 space-y-1">
            <Button
              variant="ghost"
              className={`w-full text-slate-600 hover:bg-slate-100 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start'}`}
              onClick={() => navigate("/crm/tasks/board")}
              title="Master Inbox"
            >
              <Inbox className={`h-4 w-4 ${sidebarCollapsed ? '' : 'mr-2'}`} />
              {!sidebarCollapsed && "Master Inbox"}
            </Button>
            <Button
              variant="ghost"
              className={`w-full bg-slate-200 text-slate-900 font-medium ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start'}`}
              onClick={() => navigate("/crm/tasks/mine")}
              title="My Tasks"
            >
              <User className={`h-4 w-4 ${sidebarCollapsed ? '' : 'mr-2'}`} />
              {!sidebarCollapsed && "My Tasks"}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-6 md:pl-4 pb-8 pt-0 w-full">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>
                <p className="text-slate-500 text-sm mt-1">
                  {totalActiveTasks} active task{totalActiveTasks !== 1 ? "s" : ""} assigned to you
                </p>
              </div>
              <Button
                variant="outline"
                className="md:hidden"
                onClick={() => navigate("/crm/tasks/board")}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Board View
              </Button>
            </div>

            <div className="bg-white border rounded-lg px-3 py-2">
              {isAddingTask ? (
                <div className="flex flex-col gap-1.5 bg-slate-50 rounded-lg p-2">
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task name..."
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTaskTitle.trim()) {
                        handleQuickAdd();
                      } else if (e.key === "Escape") {
                        setIsAddingTask(false);
                        setNewTaskTitle("");
                      }
                    }}
                    disabled={quickCreateMutation.isPending}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => { setIsAddingTask(false); setNewTaskTitle(""); }}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      onClick={handleQuickAdd}
                      disabled={!newTaskTitle.trim() || quickCreateMutation.isPending}
                      className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {quickCreateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingTask(true)}
                  className="w-full flex items-center gap-2 text-[12px] text-slate-400 hover:text-slate-600 py-1 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add a task</span>
                </button>
              )}
            </div>

            {tasksLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-12 w-full mb-2" />
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : totalActiveTasks === 0 ? (
              <Card className="bg-white border shadow-sm">
                <CardContent className="p-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">All caught up!</h3>
                  <p className="text-slate-500 mb-4">
                    You don't have any active tasks assigned to you.
                  </p>
                  <Button onClick={() => setIsAddingTask(true)} className="bg-[#711419] hover:bg-[#5a1014]">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Task
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {sectionConfigs.map((config) => {
                  const tasks = 
                    config.key === "overdue" ? overdueTasks :
                    config.key === "today" ? todayTasks :
                    config.key === "upcoming" ? upcomingTasks :
                    noDateTasks;
                  
                  return (
                    <TaskSection
                      key={config.key}
                      config={config}
                      tasks={tasks}
                      onComplete={handleComplete}
                      completingTaskId={completingTaskId}
                      onTaskClick={handleOpenEdit}
                      defaultOpen={config.key === "overdue" || config.key === "today"}
                      highlightedTaskId={highlightedTaskId}
                      onClearHighlight={() => setHighlightedTaskId(null)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <Dialog open={isDrawerOpen} onOpenChange={(open) => !open && handleCloseDrawer()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                {isCreateMode ? "Create Task" : "Edit Task"}
              </DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title *</FormLabel>
                      <FormControl>
                        <Input placeholder="Task title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Task description..."
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="typeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Type</SelectItem>
                          {taskTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assignedToUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned To</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {crmUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Due Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={`w-full pl-3 text-left font-normal ${
                                !field.value && "text-muted-foreground"
                              }`}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            initialFocus
                          />
                          {field.value && (
                            <div className="p-2 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => field.onChange(null)}
                              >
                                Clear
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-between pt-2 border-t">
                  {!isCreateMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </Button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <Button type="button" variant="outline" size="sm" onClick={handleCloseDrawer}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-[#711419] hover:bg-[#5a1014]"
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {(createMutation.isPending || updateMutation.isPending) && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      )}
                      {isCreateMode ? "Create" : "Save"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}
