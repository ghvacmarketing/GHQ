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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  Phone,
  Mail,
  MessageSquare,
  CalendarIcon,
  Clock,
  CheckCircle2,
  Circle,
  User,
  Building,
  Inbox,
  Zap,
  Hourglass,
  UserCheck,
  CheckSquare,
  X,
  ListChecks,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommentComposer } from "@/components/crm/comment-composer";
import { CommentThread } from "@/components/crm/comment-thread";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, isBefore, startOfDay, isToday as dateFnsIsToday, addDays, parseISO } from "date-fns";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CrmUser, Task, TaskType, CrmCustomer, TaskStatus, TaskPriority, TaskRelatedEntityType, TaskList } from "@shared/schema";

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  typeId: z.string().optional(),
  assignedToUserId: z.string().optional(),
  dueAt: z.date().optional().nullable(),
  relatedEntityType: z.enum(["customer", "lead", "project", "work_order", "invoice", "none"]).optional(),
  relatedEntityId: z.string().optional(),
  customerId: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

type TaskWithRelations = Task & {
  assignedToUser?: CrmUser | null;
  createdByUser?: CrmUser | null;
  type?: TaskType | null;
  customer?: CrmCustomer | null;
};

type TaskSubtask = {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  dueAt: string | null;
  sortOrder: number;
  createdAt: string;
};

type TasksResponse = {
  tasks: TaskWithRelations[];
  total: number;
};

const COLUMNS: { id: TaskList; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "next_actions", label: "Next Actions", icon: Zap },
  { id: "waiting_on", label: "Waiting On", icon: Hourglass },
  { id: "follow_up", label: "Follow Up", icon: UserCheck },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getDueDateStatus(dueAt: string | Date | null): "overdue" | "today" | "future" | "none" {
  if (!dueAt) return "none";
  const dueDate = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const today = startOfDay(new Date());
  const dueDateStart = startOfDay(dueDate);
  
  if (isBefore(dueDateStart, today)) return "overdue";
  if (dateFnsIsToday(dueDate)) return "today";
  return "future";
}

function DraggableTaskCard({
  task,
  onClick,
  onComplete,
  isUpdating,
}: {
  task: TaskWithRelations;
  onClick: () => void;
  onComplete: (completed: boolean) => void;
  isUpdating: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 1000 : 1,
      }
    : undefined;

  const dueDateStatus = getDueDateStatus(task.dueAt);
  const isCompleted = task.status === "completed";

  const dueDateColors = {
    overdue: "bg-red-100 text-red-700 border-red-200",
    today: "bg-yellow-100 text-yellow-700 border-yellow-200",
    future: "bg-blue-100 text-blue-700 border-blue-200",
    none: "",
  };

  const priorityAccent: Record<string, string> = {
    urgent: "border-l-red-500",
    high: "border-l-orange-400",
    normal: "border-l-slate-200",
    low: "border-l-slate-200",
  };
  const accent = priorityAccent[task.priority ?? "normal"] ?? "border-l-slate-200";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group bg-white border border-slate-200 border-l-4 ${accent} rounded-lg p-2.5 mb-1.5 cursor-pointer
        hover:shadow-sm hover:border-slate-300 transition-all
        ${isDragging ? "opacity-40 shadow-xl ring-2 ring-[#711419]" : ""}
        ${isCompleted ? "opacity-50" : ""}
      `}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete(!isCompleted);
          }}
          disabled={isUpdating}
          className={`
            flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center
            transition-colors hover:bg-slate-50
            ${isCompleted ? "bg-green-500 border-green-500" : "border-slate-300 hover:border-slate-400"}
          `}
        >
          {isCompleted && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
          {isUpdating && <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-400" />}
        </button>

        <div className="flex-1 min-w-0" onClick={onClick}>
          <p className={`text-xs font-medium leading-snug text-slate-800 ${isCompleted ? "line-through text-slate-400" : ""}`}>
            {task.title}
          </p>

          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {task.dueAt && (
              <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                dueDateStatus === "overdue" ? "bg-red-50 text-red-600" :
                dueDateStatus === "today" ? "bg-amber-50 text-amber-600" :
                "bg-slate-100 text-slate-500"
              }`}>
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                {format(new Date(task.dueAt), "MMM d")}
              </span>
            )}

            {task.type && (
              <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {task.type.name}
              </span>
            )}

            {task.customer && (
              <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 max-w-[120px] truncate">
                <User className="h-2.5 w-2.5 mr-0.5 flex-shrink-0" />
                <span className="truncate">{task.customer.name}</span>
              </span>
            )}
          </div>
        </div>

        {task.assignedToUser && (
          <Avatar className="h-5 w-5 flex-shrink-0 mt-0.5">
            <AvatarFallback className="text-[9px] bg-slate-200 text-slate-600">
              {getInitials(task.assignedToUser.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}

function DroppableColumn({
  column,
  tasks,
  onTaskClick,
  onTaskComplete,
  onQuickAdd,
  isUpdating,
  isCreating,
}: {
  column: typeof COLUMNS[number];
  tasks: TaskWithRelations[];
  onTaskClick: (task: TaskWithRelations) => void;
  onTaskComplete: (taskId: string, completed: boolean) => void;
  onQuickAdd: (title: string, taskList: TaskList) => void;
  isUpdating: string | null;
  isCreating: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });
  const [quickAddValue, setQuickAddValue] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  const Icon = column.icon;

  const handleQuickAdd = () => {
    if (quickAddValue.trim()) {
      onQuickAdd(quickAddValue.trim(), column.id);
      setQuickAddValue("");
      setIsAddingTask(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col bg-white border border-slate-200 rounded-xl min-w-0 shadow-sm
        ${isOver ? "ring-2 ring-[#711419]/40 ring-offset-1 bg-red-50/20" : ""}
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{column.label}</h3>
        <span className="ml-auto text-[10px] font-semibold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {tasks.length}
        </span>
      </div>

      <div className="px-2 pb-2">
        {isAddingTask ? (
          <div className="flex items-center gap-1">
            <Input
              value={quickAddValue}
              onChange={(e) => setQuickAddValue(e.target.value)}
              placeholder="Task title..."
              className="h-7 text-xs border-slate-200 focus-visible:ring-[#711419]/30"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickAddValue.trim()) {
                  handleQuickAdd();
                } else if (e.key === "Escape") {
                  setIsAddingTask(false);
                  setQuickAddValue("");
                }
              }}
              disabled={isCreating}
            />
            <Button
              size="sm"
              className="h-7 px-2 bg-[#711419] hover:bg-[#5a1014]"
              onClick={handleQuickAdd}
              disabled={!quickAddValue.trim() || isCreating}
            >
              {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-slate-400 hover:text-slate-600"
              onClick={() => {
                setIsAddingTask(false);
                setQuickAddValue("");
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingTask(true)}
            className="w-full flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 py-1 px-1.5 rounded-md hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Add a task</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[300px]">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-300">
            <Icon className="h-6 w-6 mb-1.5 opacity-40" />
            <p className="text-[11px]">No tasks</p>
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
              onComplete={(completed) => onTaskComplete(task.id, completed)}
              isUpdating={isUpdating === task.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function CrmTaskBoard() {
  usePageTitle("Task Board");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dueDateFilter, setDueDateFilter] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskWithRelations | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskDueAt, setNewSubtaskDueAt] = useState<Date | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("limit", "1000");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter !== "all") params.set("typeId", typeFilter);
    if (!showCompleted) params.set("hideCompleted", "true");
    if (dueDateFilter !== "all") params.set("dueDateFilter", dueDateFilter);
    return params.toString();
  };

  const { data: tasksData, isLoading: tasksLoading } = useQuery<TasksResponse>({
    queryKey: ["/api/tasks", "board", debouncedSearch, typeFilter, dueDateFilter, showCompleted],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?${buildQueryParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tasks");
      return response.json();
    },
    enabled: !!currentUser,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: taskTypes = [] } = useQuery<TaskType[]>({
    queryKey: ["/api/tasks/types"],
    enabled: !!currentUser,
  });

  const { data: crmUsers = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const { data: subtasks = [], isLoading: subtasksLoading } = useQuery<TaskSubtask[]>({
    queryKey: ["/api/tasks", selectedTask?.id, "subtasks"],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${selectedTask!.id}/subtasks`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch subtasks");
      return response.json();
    },
    enabled: !!selectedTask?.id && !isCreateMode,
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

  const createMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const payload = {
        ...data,
        createdByUserId: currentUser?.id,
        dueAt: data.dueAt ? data.dueAt.toISOString() : null,
        typeId: data.typeId === "none" ? null : data.typeId,
        assignedToUserId: data.assignedToUserId === "none" ? null : data.assignedToUserId,
        customerId: data.customerId === "none" ? null : data.customerId,
        relatedEntityType: data.relatedEntityType || "none",
        relatedEntityId: data.relatedEntityId || null,
      };
      return apiRequest("POST", "/api/tasks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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
      setShowDeleteDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete task", description: error.message, variant: "destructive" });
    },
  });

  const updateTaskListMutation = useMutation({
    mutationFn: async ({ taskId, taskList }: { taskId: string; taskList: TaskList }) => {
      return apiRequest("PUT", `/api/tasks/${taskId}`, { taskList });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to move task", description: error.message, variant: "destructive" });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      setUpdatingTaskId(taskId);
      return apiRequest("PUT", `/api/tasks/${taskId}`, {
        status: completed ? "completed" : "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update task", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      setUpdatingTaskId(null);
    },
  });

  const quickAddMutation = useMutation({
    mutationFn: async ({ title, taskList }: { title: string; taskList: TaskList }) => {
      return apiRequest("POST", "/api/tasks", {
        title,
        taskList,
        status: "pending",
        priority: "normal",
        createdByUserId: currentUser!.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
    },
  });

  const createSubtaskMutation = useMutation({
    mutationFn: async (data: { title: string; dueAt?: string | null }) => {
      return apiRequest("POST", `/api/tasks/${selectedTask!.id}/subtasks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", selectedTask?.id, "subtasks"] });
      setNewSubtaskTitle("");
      setNewSubtaskDueAt(null);
      setIsAddingSubtask(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create subtask", description: error.message, variant: "destructive" });
    },
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, data }: { subtaskId: string; data: Partial<TaskSubtask> }) => {
      return apiRequest("PUT", `/api/tasks/${selectedTask!.id}/subtasks/${subtaskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", selectedTask?.id, "subtasks"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update subtask", description: error.message, variant: "destructive" });
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return apiRequest("DELETE", `/api/tasks/${selectedTask!.id}/subtasks/${subtaskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", selectedTask?.id, "subtasks"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete subtask", description: error.message, variant: "destructive" });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskWithRelations;
    setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;

    if (!over) return;

    const taskId = active.id as string;
    const newTaskList = over.id as TaskList;

    const task = tasksData?.tasks.find((t) => t.id === taskId);
    if (!task || task.taskList === newTaskList) return;

    updateTaskListMutation.mutate({ taskId, taskList: newTaskList });
  };

  const handleOpenCreate = () => {
    setIsCreateMode(true);
    setSelectedTask(null);
    form.reset({
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
    });
    setIsDrawerOpen(true);
  };

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

  const tasksByColumn = useMemo(() => {
    const result: Record<TaskList, TaskWithRelations[]> = {
      inbox: [],
      projects: [],
      next_actions: [],
      waiting_on: [],
      follow_up: [],
    };

    const tasks = tasksData?.tasks || [];
    tasks.forEach((task) => {
      const list = task.taskList || "inbox";
      if (result[list]) {
        result[list].push(task);
      }
    });

    return result;
  }, [tasksData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser}>
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
              className={`w-full bg-slate-200 text-slate-900 font-medium ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start'}`}
              onClick={() => navigate("/crm/tasks/board")}
              title="Master Inbox"
            >
              <Inbox className={`h-4 w-4 ${sidebarCollapsed ? '' : 'mr-2'}`} />
              {!sidebarCollapsed && "Master Inbox"}
            </Button>
            <Button
              variant="ghost"
              className={`w-full text-slate-600 hover:bg-slate-100 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start'}`}
              onClick={() => navigate("/crm/tasks/mine")}
              title="My Tasks"
            >
              <User className={`h-4 w-4 ${sidebarCollapsed ? '' : 'mr-2'}`} />
              {!sidebarCollapsed && "My Tasks"}
            </Button>
          </div>
          {!sidebarCollapsed && (
            <div className="p-2 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">Lists</p>
              <div className="space-y-1">
                {COLUMNS.map((col) => {
                  const Icon = col.icon;
                  const count = tasksByColumn[col.id]?.length || 0;
                  return (
                    <div key={col.id} className="flex items-center justify-between px-2 py-1.5 text-sm text-slate-600 rounded hover:bg-slate-100">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{col.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{count}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="p-2 border-t border-slate-200 space-y-1">
              {COLUMNS.map((col) => {
                const Icon = col.icon;
                const count = tasksByColumn[col.id]?.length || 0;
                return (
                  <div key={col.id} className="flex items-center justify-center py-1.5 text-slate-600 rounded hover:bg-slate-100 relative" title={`${col.label} (${count})`}>
                    <Icon className="h-4 w-4" />
                    {count > 0 && (
                      <span className="absolute -top-1 -right-1 text-[10px] bg-slate-200 rounded-full w-4 h-4 flex items-center justify-center">{count}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${isDrawerOpen ? 'mr-0' : ''}`}>
          <div className="space-y-3 p-0 md:pl-4">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold text-slate-900">Master Inbox</h1>
              <Button variant="outline" size="sm" className="md:hidden text-xs" onClick={() => navigate("/crm/tasks/mine")}>
                My Tasks
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8 h-8 text-sm w-48 bg-white border-slate-200 focus-visible:ring-[#711419]/30"
                />
              </div>

              <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs bg-white border-slate-200">
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="next7days">Next 7 Days</SelectItem>
                  <SelectItem value="nodate">No Date</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs bg-white border-slate-200">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {taskTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5 ml-1">
                <Switch
                  id="show-completed"
                  checked={showCompleted}
                  onCheckedChange={setShowCompleted}
                  className="scale-75 origin-left"
                />
                <Label htmlFor="show-completed" className="text-xs text-slate-500 cursor-pointer select-none">Completed</Label>
              </div>
            </div>

            {tasksLoading ? (
              <div className="grid grid-cols-4 gap-3 pb-4">
                {COLUMNS.map((col) => (
                  <div key={col.id}>
                    <Skeleton className="h-[400px] rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="grid grid-cols-4 gap-3 pb-4">
                  {COLUMNS.map((column) => (
                    <DroppableColumn
                      key={column.id}
                      column={column}
                      tasks={tasksByColumn[column.id] || []}
                      onTaskClick={handleOpenEdit}
                      onTaskComplete={(taskId, completed) =>
                        completeTaskMutation.mutate({ taskId, completed })
                      }
                      onQuickAdd={(title, taskList) =>
                        quickAddMutation.mutate({ title, taskList })
                      }
                      isUpdating={updatingTaskId}
                      isCreating={quickAddMutation.isPending}
                    />
                  ))}
                </div>

                <DragOverlay>
                  {activeTask && (
                    <div className="bg-white border-2 border-[#711419] rounded-lg p-3 shadow-xl w-[280px]">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 border-slate-300" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">{activeTask.title}</p>
                          {activeTask.dueAt && (
                            <Badge variant="outline" className="text-xs mt-2">
                              <Clock className="h-3 w-3 mr-1" />
                              {format(new Date(activeTask.dueAt), "MMM d")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>

        <div
          className={`
            flex-shrink-0 bg-white border-l border-slate-200 overflow-y-auto
            transition-all duration-300 ease-in-out
            ${isDrawerOpen ? 'w-[500px] opacity-100' : 'w-0 opacity-0 overflow-hidden'}
          `}
        >
          <div className="w-[500px] p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isCreateMode ? "Create Task" : "Edit Task"}
                </h2>
                <p className="text-sm text-slate-500">
                  {isCreateMode ? "Add a new task to your board" : "Update task details"}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCloseDrawer}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="relatedEntityType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Related Entity Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "none"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="customer">Customer</SelectItem>
                            <SelectItem value="lead">Lead</SelectItem>
                            <SelectItem value="project">Project</SelectItem>
                            <SelectItem value="work_order">Work Order</SelectItem>
                            <SelectItem value="invoice">Invoice</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="relatedEntityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Related Entity ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Entity ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {selectedTask?.customer && (
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-slate-900">Quick Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.customer.phone && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = `tel:${selectedTask.customer!.phone}`}
                        >
                          <Phone className="h-4 w-4 mr-1" />
                          Call
                        </Button>
                      )}
                      {selectedTask.customer.email && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = `mailto:${selectedTask.customer!.email}`}
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          Email
                        </Button>
                      )}
                      {selectedTask.customer.phone && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = `sms:${selectedTask.customer!.phone}`}
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Text
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {!isCreateMode && selectedTask && (
                  <div className="space-y-2 mt-4 border-t pt-4">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <CheckSquare className="h-4 w-4" />
                      Subtasks
                      {subtasks.length > 0 && (
                        <Badge variant="secondary">
                          {subtasks.filter(s => s.isCompleted).length}/{subtasks.length}
                        </Badge>
                      )}
                    </h4>

                    {subtasksLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading subtasks...</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {subtasks.map((subtask) => (
                          <div key={subtask.id} className="flex items-center gap-2 group">
                            <Checkbox
                              checked={subtask.isCompleted}
                              onCheckedChange={(checked) => {
                                updateSubtaskMutation.mutate({
                                  subtaskId: subtask.id,
                                  data: { isCompleted: !!checked }
                                });
                              }}
                            />
                            <span className={`flex-1 text-sm ${subtask.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                              {subtask.title}
                            </span>
                            {subtask.dueAt && (
                              <Badge variant="outline" className="text-xs">
                                {format(new Date(subtask.dueAt), "MMM d")}
                              </Badge>
                            )}
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                >
                                  <CalendarIcon className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                  mode="single"
                                  selected={subtask.dueAt ? new Date(subtask.dueAt) : undefined}
                                  onSelect={(date) => {
                                    updateSubtaskMutation.mutate({
                                      subtaskId: subtask.id,
                                      data: { dueAt: date ? date.toISOString() : null }
                                    });
                                  }}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                              onClick={() => deleteSubtaskMutation.mutate(subtask.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}

                        {isAddingSubtask ? (
                          <div className="flex items-center gap-2 pt-2">
                            <Input
                              value={newSubtaskTitle}
                              onChange={(e) => setNewSubtaskTitle(e.target.value)}
                              placeholder="Subtask title..."
                              className="flex-1 h-8 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newSubtaskTitle.trim()) {
                                  createSubtaskMutation.mutate({
                                    title: newSubtaskTitle.trim(),
                                    dueAt: newSubtaskDueAt ? newSubtaskDueAt.toISOString() : null
                                  });
                                } else if (e.key === "Escape") {
                                  setIsAddingSubtask(false);
                                  setNewSubtaskTitle("");
                                  setNewSubtaskDueAt(null);
                                }
                              }}
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <CalendarIcon className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                  mode="single"
                                  selected={newSubtaskDueAt || undefined}
                                  onSelect={(date) => setNewSubtaskDueAt(date || null)}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              onClick={() => {
                                if (newSubtaskTitle.trim()) {
                                  createSubtaskMutation.mutate({
                                    title: newSubtaskTitle.trim(),
                                    dueAt: newSubtaskDueAt ? newSubtaskDueAt.toISOString() : null
                                  });
                                }
                              }}
                              disabled={!newSubtaskTitle.trim() || createSubtaskMutation.isPending}
                            >
                              {createSubtaskMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Add"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => {
                                setIsAddingSubtask(false);
                                setNewSubtaskTitle("");
                                setNewSubtaskDueAt(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-sm"
                            onClick={() => setIsAddingSubtask(true)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Subtask
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isCreateMode && selectedTask && (
                  <div className="space-y-3 mt-4 border-t pt-4">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Comments
                    </h4>
                    <CommentComposer
                      entityType="task"
                      entityId={selectedTask.id}
                      placeholder="Add a comment about this task..."
                      onCommentPosted={() => {
                        queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", "task", selectedTask.id] });
                      }}
                    />
                    <div className="mt-4 max-h-[300px] overflow-y-auto">
                      <CommentThread entityType="task" entityId={selectedTask.id} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    {!isCreateMode && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleCloseDrawer}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-[#711419] hover:bg-[#5a1014]"
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {(createMutation.isPending || updateMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {isCreateMode ? "Create Task" : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
