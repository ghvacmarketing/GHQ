import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Plus,
  Loader2,
  CalendarIcon,
  Clock,
  AlertCircle,
  User,
  ExternalLink,
  ListTodo,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CrmUser, Task, TaskType, TaskStatus, TaskPriority } from "@shared/schema";

interface EntityTasksTabProps {
  entityType: "customer" | "lead" | "project" | "work_order";
  entityId: string;
  customerId?: string;
  customerName?: string;
}

type TaskWithRelations = Task & {
  assignedToUser?: CrmUser | null;
  createdByUser?: CrmUser | null;
  type?: TaskType | null;
};

type TasksResponse = {
  tasks: TaskWithRelations[];
  total: number;
};

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

export function EntityTasksTab({ entityType, entityId, customerId, customerName }: EntityTasksTabProps) {
  const { toast } = useToast();
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("normal");
  const [newTaskTypeId, setNewTaskTypeId] = useState<string>("");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState<string>("");
  const [newTaskDueDate, setNewTaskDueDate] = useState<Date | undefined>();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery<TasksResponse>({
    queryKey: ["/api/tasks", entityType, entityId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("relatedEntityType", entityType);
      params.set("relatedEntityId", entityId);
      params.set("limit", "100");
      const response = await fetch(`/api/tasks?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tasks");
      return response.json();
    },
    enabled: !!entityId,
  });

  const { data: taskTypes = [] } = useQuery<TaskType[]>({
    queryKey: ["/api/tasks/types"],
  });

  const { data: crmUsers = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
  });

  useEffect(() => {
    if (taskTypes.length > 0 && !newTaskTypeId) {
      const adminType = taskTypes.find(t => t.name.toLowerCase() === "admin");
      if (adminType) {
        setNewTaskTypeId(adminType.id);
      }
    }
  }, [taskTypes, newTaskTypeId]);

  const quickCreateMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!currentUser) throw new Error("Not authenticated");
      const adminType = taskTypes.find(t => t.name.toLowerCase() === "admin");
      const payload = {
        title,
        status: "pending" as TaskStatus,
        priority: "normal" as TaskPriority,
        assignedToUserId: currentUser.id,
        createdByUserId: currentUser.id,
        typeId: adminType?.id || null,
        taskList: "inbox",
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        customerId: customerId || null,
      };
      return apiRequest("POST", "/api/tasks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
      toast({ title: "Task created" });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error("Not authenticated");
      const payload = {
        title: newTaskTitle,
        description: newTaskDescription || null,
        status: "pending" as TaskStatus,
        priority: newTaskPriority,
        typeId: newTaskTypeId && newTaskTypeId !== "none" ? newTaskTypeId : null,
        assignedToUserId: newTaskAssignedTo && newTaskAssignedTo !== "none" ? newTaskAssignedTo : currentUser.id,
        createdByUserId: currentUser.id,
        dueAt: newTaskDueDate ? newTaskDueDate.toISOString() : null,
        taskList: "inbox",
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        customerId: customerId || null,
      };
      return apiRequest("POST", "/api/tasks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
      toast({ title: "Task created successfully" });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
    },
  });

  const quickCompleteMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      return apiRequest("PUT", `/api/tasks/${taskId}`, {
        status: completed ? "completed" : "pending",
        completedAt: completed ? new Date().toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update task", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setIsAddingTask(false);
    setShowDetails(false);
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskPriority("normal");
    setNewTaskAssignedTo("");
    setNewTaskDueDate(undefined);
    const adminType = taskTypes.find(t => t.name.toLowerCase() === "admin");
    setNewTaskTypeId(adminType?.id || "");
  };

  const handleQuickAdd = () => {
    if (!newTaskTitle.trim()) return;
    if (showDetails) {
      createMutation.mutate();
    } else {
      quickCreateMutation.mutate(newTaskTitle.trim());
    }
  };

  const isOverdue = (task: TaskWithRelations) => {
    if (!task.dueAt || task.status === "completed" || task.status === "cancelled") return false;
    return isBefore(new Date(task.dueAt), startOfDay(new Date()));
  };

  const tasks = tasksData?.tasks || [];

  if (tasksLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-slate-600" />
          Tasks
          {tasks.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {tasks.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-white border rounded-lg px-3 py-2 mb-4">
          {isAddingTask ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5 bg-slate-50 rounded-lg p-2">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task name..."
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTaskTitle.trim() && !showDetails) {
                      handleQuickAdd();
                    } else if (e.key === "Escape") {
                      resetForm();
                    }
                  }}
                  disabled={quickCreateMutation.isPending || createMutation.isPending}
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showDetails ? "Less options" : "More options"}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={resetForm}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      onClick={handleQuickAdd}
                      disabled={!newTaskTitle.trim() || quickCreateMutation.isPending || createMutation.isPending}
                      className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {(quickCreateMutation.isPending || createMutation.isPending)
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Check className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {showDetails && (
                <div className="space-y-3 px-1 pb-1">
                  <Textarea
                    placeholder="Description (optional)..."
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Type</Label>
                      <Select value={newTaskTypeId} onValueChange={setNewTaskTypeId}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {taskTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Priority</Label>
                      <Select value={newTaskPriority} onValueChange={(v) => setNewTaskPriority(v as TaskPriority)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Priority" />
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Assigned To</Label>
                      <Select value={newTaskAssignedTo} onValueChange={setNewTaskAssignedTo}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Me</SelectItem>
                          {crmUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Due Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-8 justify-start text-left text-sm font-normal",
                              !newTaskDueDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                            {newTaskDueDate ? format(newTaskDueDate, "MMM d") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={newTaskDueDate}
                            onSelect={setNewTaskDueDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleQuickAdd}
                    disabled={!newTaskTitle.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Task"
                    )}
                  </Button>
                </div>
              )}
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

        {tasks.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <ListTodo className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm">No tasks yet</p>
            <p className="text-xs text-slate-400 mt-1">Create a task to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => {
                  const overdue = isOverdue(task);
                  return (
                    <TableRow
                      key={task.id}
                      className={cn(
                        "cursor-pointer hover:bg-slate-50",
                        overdue && "bg-red-50"
                      )}
                    >
                      <TableCell className="text-center">
                        <Checkbox
                          checked={task.status === "completed"}
                          onCheckedChange={(checked) => {
                            quickCompleteMutation.mutate({
                              taskId: task.id,
                              completed: checked === true,
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-medium",
                            task.status === "completed" && "line-through text-slate-400"
                          )}>
                            {task.title}
                          </span>
                          {overdue && (
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {task.type?.name || (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={priorityColors[task.priority as TaskPriority]}>
                          {priorityLabels[task.priority as TaskPriority]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[task.status as TaskStatus]}>
                          {statusLabels[task.status as TaskStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {task.assignedToUser ? (
                          <div className="flex items-center gap-1 text-sm">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            {task.assignedToUser.name}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {task.dueAt ? (
                          <div className={cn(
                            "flex items-center gap-1 text-sm",
                            overdue && "text-red-600 font-medium"
                          )}>
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(task.dueAt), "MMM d, yyyy")}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/crm/tasks/board?taskId=${task.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
