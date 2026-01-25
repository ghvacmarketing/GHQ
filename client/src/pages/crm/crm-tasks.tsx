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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  User,
  Building,
  List,
  Calendar as CalendarViewIcon,
  GripVertical,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { 
  format, 
  isAfter, 
  isBefore, 
  startOfDay, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  addMonths, 
  subMonths, 
  isSameMonth, 
  isToday, 
  isSameDay 
} from "date-fns";
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CrmUser, Task, TaskType, CrmCustomer, TaskStatus, TaskPriority, TaskRelatedEntityType } from "@shared/schema";

const ITEMS_PER_PAGE = 25;

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

const statusLabels: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusColors: Record<TaskStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityLabels: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const priorityColors: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-gray-100 text-gray-600 border-gray-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const relatedEntityLabels: Record<TaskRelatedEntityType, string> = {
  customer: "Customer",
  lead: "Lead",
  project: "Project",
  work_order: "Work Order",
  invoice: "Invoice",
  none: "None",
};

type ViewMode = "list" | "calendar";

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

function DraggableTask({ 
  task, 
  onTaskClick,
  isOverdue 
}: { 
  task: TaskWithRelations; 
  onTaskClick: (task: TaskWithRelations) => void;
  isOverdue: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const priorityIndicatorColors: Record<TaskPriority, string> = {
    urgent: "bg-red-500",
    high: "bg-orange-500",
    normal: "bg-gray-400",
    low: "bg-blue-500",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 p-1.5 rounded text-xs cursor-pointer hover:bg-slate-100 transition-colors ${
        isDragging ? "opacity-50 z-50" : ""
      } ${isOverdue ? "bg-red-50 border border-red-200" : "bg-white border border-slate-200"}`}
      onClick={(e) => {
        e.stopPropagation();
        onTaskClick(task);
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-slate-400" />
      </div>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityIndicatorColors[task.priority as TaskPriority]}`} />
      <span className={`truncate flex-1 ${isOverdue ? "text-red-700" : "text-slate-700"}`}>
        {task.title}
      </span>
      {isOverdue && <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
    </div>
  );
}

function DroppableDay({ 
  date, 
  isCurrentMonth, 
  tasks, 
  onTaskClick,
  checkOverdue 
}: { 
  date: Date; 
  isCurrentMonth: boolean; 
  tasks: TaskWithRelations[];
  onTaskClick: (task: TaskWithRelations) => void;
  checkOverdue: (task: TaskWithRelations) => boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: format(date, "yyyy-MM-dd"),
    data: { date },
  });

  const dayIsToday = isToday(date);

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] p-1 border-b border-r border-slate-200 ${
        !isCurrentMonth ? "bg-slate-50" : "bg-white"
      } ${isOver ? "bg-blue-50 ring-2 ring-blue-400 ring-inset" : ""} ${
        dayIsToday ? "bg-amber-50" : ""
      }`}
    >
      <div className={`text-xs font-medium mb-1 ${
        dayIsToday 
          ? "text-white bg-[#711419] rounded-full w-6 h-6 flex items-center justify-center" 
          : !isCurrentMonth 
            ? "text-slate-400" 
            : "text-slate-700"
      }`}>
        {format(date, "d")}
      </div>
      <div className="space-y-1 max-h-[80px] overflow-y-auto">
        {tasks.map((task) => (
          <DraggableTask 
            key={task.id} 
            task={task} 
            onTaskClick={onTaskClick}
            isOverdue={checkOverdue(task)}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarView({ 
  tasks, 
  onTaskClick, 
  onTaskDrop,
  checkOverdue,
  isUpdating
}: { 
  tasks: TaskWithRelations[]; 
  onTaskClick: (task: TaskWithRelations) => void;
  onTaskDrop: (taskId: string, newDueDate: Date) => void;
  checkOverdue: (task: TaskWithRelations) => boolean;
  isUpdating: boolean;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTask, setActiveTask] = useState<TaskWithRelations | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    tasks.forEach(task => {
      if (task.dueAt) {
        const key = format(new Date(task.dueAt), "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(task);
      }
    });
    return map;
  }, [tasks]);

  const unscheduledTasks = useMemo(() => {
    return tasks.filter(task => !task.dueAt);
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskWithRelations;
    setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    
    const taskId = active.id as string;
    const dateString = over.id as string;
    const newDate = new Date(dateString);
    
    if (!isNaN(newDate.getTime())) {
      onTaskDrop(taskId, newDate);
    }
  };

  const priorityIndicatorColors: Record<TaskPriority, string> = {
    urgent: "bg-red-500",
    high: "bg-orange-500",
    normal: "bg-gray-400",
    low: "bg-blue-500",
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <div className="flex items-center gap-2">
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(new Date())}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-200">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="p-2 text-center text-xs font-medium text-slate-600">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => (
                <DroppableDay
                  key={day.toISOString()}
                  date={day}
                  isCurrentMonth={isSameMonth(day, currentMonth)}
                  tasks={tasksByDate.get(format(day, "yyyy-MM-dd")) || []}
                  onTaskClick={onTaskClick}
                  checkOverdue={checkOverdue}
                />
              ))}
            </div>
          </div>
        </div>

        {unscheduledTasks.length > 0 && (
          <div className="w-64 flex-shrink-0">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <h3 className="text-sm font-medium text-slate-700 mb-3">
                Unscheduled ({unscheduledTasks.length})
              </h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded text-xs cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => onTaskClick(task)}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityIndicatorColors[task.priority as TaskPriority]}`} />
                    <span className="truncate flex-1 text-slate-700">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="flex items-center gap-2 p-2 bg-white border-2 border-blue-400 rounded shadow-lg text-xs">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityIndicatorColors[activeTask.priority as TaskPriority]}`} />
            <span className="text-slate-700">{activeTask.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default function CrmTasks() {
  usePageTitle("Company Tasks");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [assignedToFilter, setAssignedToFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dueDateStart, setDueDateStart] = useState<Date | undefined>();
  const [dueDateEnd, setDueDateEnd] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, typeFilter, assignedToFilter, overdueOnly, dueDateStart, dueDateEnd]);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (typeFilter !== "all") params.set("typeId", typeFilter);
    if (assignedToFilter !== "all") params.set("assignedToUserId", assignedToFilter);
    if (overdueOnly) params.set("overdue", "true");
    if (dueDateStart) params.set("dueDateStart", dueDateStart.toISOString());
    if (dueDateEnd) params.set("dueDateEnd", dueDateEnd.toISOString());
    return params.toString();
  };

  const { data: tasksData, isLoading: tasksLoading } = useQuery<TasksResponse>({
    queryKey: ["/api/tasks", page, debouncedSearch, statusFilter, priorityFilter, typeFilter, assignedToFilter, overdueOnly, dueDateStart?.toISOString(), dueDateEnd?.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?${buildQueryParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tasks");
      return response.json();
    },
    enabled: !!currentUser && viewMode === "list",
  });

  const { data: calendarTasksData, isLoading: calendarTasksLoading } = useQuery<TasksResponse>({
    queryKey: ["/api/tasks", "calendar", statusFilter, priorityFilter, typeFilter, assignedToFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "1000");
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (typeFilter !== "all") params.set("typeId", typeFilter);
      if (assignedToFilter !== "all") params.set("assignedToUserId", assignedToFilter);
      const response = await fetch(`/api/tasks?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tasks");
      return response.json();
    },
    enabled: !!currentUser && viewMode === "calendar",
  });

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

  const rescheduleMutation = useMutation({
    mutationFn: async ({ taskId, newDueAt }: { taskId: string; newDueAt: Date }) => {
      return apiRequest("PUT", `/api/tasks/${taskId}`, { dueAt: newDueAt.toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task rescheduled successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reschedule task", description: error.message, variant: "destructive" });
    },
  });

  const handleTaskDrop = (taskId: string, newDueDate: Date) => {
    rescheduleMutation.mutate({ taskId, newDueAt: newDueDate });
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

  const isOverdue = (task: TaskWithRelations) => {
    if (!task.dueAt || task.status === "completed" || task.status === "cancelled") return false;
    return isBefore(new Date(task.dueAt), startOfDay(new Date()));
  };

  const tasks = tasksData?.tasks || [];
  const calendarTasks = calendarTasksData?.tasks || [];
  const totalTasks = tasksData?.total || 0;
  const totalPages = Math.ceil(totalTasks / ITEMS_PER_PAGE);

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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Company Tasks</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage and track all company tasks
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-slate-200 rounded-lg p-1 bg-slate-50">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="gap-2"
              >
                <List className="h-4 w-4" />
                List
              </Button>
              <Button
                variant={viewMode === "calendar" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("calendar")}
                className="gap-2"
              >
                <CalendarViewIcon className="h-4 w-4" />
                Calendar
              </Button>
            </div>
            <Button onClick={handleOpenCreate} className="bg-[#711419] hover:bg-[#5a1014]">
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          </div>
        </div>

        <Card className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Task Type" />
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

              <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Assigned To" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {crmUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center space-x-2">
                <Switch
                  id="overdue"
                  checked={overdueOnly}
                  onCheckedChange={setOverdueOnly}
                />
                <Label htmlFor="overdue" className="text-sm">Overdue Only</Label>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDateStart && dueDateEnd
                      ? `${format(dueDateStart, "MMM d")} - ${format(dueDateEnd, "MMM d")}`
                      : dueDateStart
                      ? format(dueDateStart, "MMM d, yyyy")
                      : "Due Date Range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dueDateStart, to: dueDateEnd }}
                    onSelect={(range) => {
                      setDueDateStart(range?.from);
                      setDueDateEnd(range?.to);
                    }}
                    initialFocus
                  />
                  {(dueDateStart || dueDateEnd) && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDueDateStart(undefined);
                          setDueDateEnd(undefined);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {viewMode === "calendar" ? (
          <Card className="bg-white border shadow-sm">
            <CardContent className="p-4">
              {calendarTasksLoading ? (
                <div className="p-8 space-y-4">
                  <Skeleton className="h-8 w-64 mb-4" />
                  <Skeleton className="h-[400px] w-full" />
                </div>
              ) : (
                <CalendarView
                  tasks={calendarTasks}
                  onTaskClick={handleOpenEdit}
                  onTaskDrop={handleTaskDrop}
                  checkOverdue={isOverdue}
                  isUpdating={rescheduleMutation.isPending}
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white border shadow-sm">
            <CardContent className="p-0">
              {tasksLoading ? (
                <div className="p-8 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No tasks found</h3>
                  <p className="text-slate-500 mb-4">
                    {debouncedSearch || statusFilter !== "all" || priorityFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Create your first task to get started"}
                  </p>
                  <Button onClick={handleOpenCreate} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Task
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Related To</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => (
                        <TableRow
                          key={task.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => handleOpenEdit(task)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {isOverdue(task) && (
                                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                              )}
                              <span className="truncate max-w-[250px]">{task.title}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {task.type?.name || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={priorityColors[task.priority as TaskPriority]}
                            >
                              {priorityLabels[task.priority as TaskPriority]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusColors[task.status as TaskStatus]}
                            >
                              {statusLabels[task.status as TaskStatus]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {task.assignedToUser ? (
                                <>
                                  <User className="h-4 w-4 text-slate-400" />
                                  <span>{task.assignedToUser.name}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">Unassigned</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {task.dueAt ? (
                              <div className={`flex items-center gap-1 ${isOverdue(task) ? "text-red-600 font-medium" : ""}`}>
                                <Clock className="h-4 w-4" />
                                {format(new Date(task.dueAt), "MMM d, yyyy")}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.relatedEntityType && task.relatedEntityType !== "none" ? (
                              <div className="flex items-center gap-1">
                                <Building className="h-4 w-4 text-slate-400" />
                                <span className="capitalize">{task.relatedEntityType.replace("_", " ")}</span>
                              </div>
                            ) : task.customer ? (
                              <div className="flex items-center gap-1">
                                <User className="h-4 w-4 text-slate-400" />
                                <span className="truncate max-w-[120px]">{task.customer.name}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t">
                    <p className="text-sm text-slate-500">
                      Showing {((page - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(page * ITEMS_PER_PAGE, totalTasks)} of {totalTasks} tasks
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-600">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{isCreateMode ? "Create Task" : "Edit Task"}</SheetTitle>
            <SheetDescription>
              {isCreateMode ? "Add a new task to your company task list" : "Update task details"}
            </SheetDescription>
          </SheetHeader>

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
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
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
        </SheetContent>
      </Sheet>

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
