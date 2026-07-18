import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
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
  Plus,
  Loader2,
  CalendarIcon,
  Clock,
  AlertCircle,
  User,
  ExternalLink,
  ListTodo,
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

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
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
});

type TaskFormData = z.infer<typeof taskFormSchema>;

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
  high: "High",
  normal: "Normal",
  low: "Low",
};

const priorityColors: Record<TaskPriority, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  normal: "bg-gray-100 text-gray-600 border-gray-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

export function EntityTasksTab({ entityType, entityId, customerId, customerName }: EntityTasksTabProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  const adminType = taskTypes.find(t => t.name.toLowerCase() === "admin");

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "normal",
      typeId: undefined,
      assignedToUserId: undefined,
      dueAt: null,
    },
  });

  useEffect(() => {
    if (adminType && !form.getValues("typeId")) {
      form.setValue("typeId", adminType.id);
    }
  }, [adminType]);

  const createMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      if (!currentUser) throw new Error("Not authenticated");
      const payload = {
        title: data.title,
        description: data.description || null,
        status: "pending" as TaskStatus,
        priority: data.priority,
        typeId: data.typeId && data.typeId !== "none" ? data.typeId : null,
        assignedToUserId: data.assignedToUserId && data.assignedToUserId !== "none" ? data.assignedToUserId : currentUser.id,
        createdByUserId: currentUser.id,
        dueAt: data.dueAt ? data.dueAt.toISOString() : null,
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
      handleCloseDialog();
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

  const handleOpenCreate = () => {
    form.reset({
      title: "",
      description: "",
      priority: "normal",
      typeId: adminType?.id || undefined,
      assignedToUserId: undefined,
      dueAt: null,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    form.reset();
  };

  const onSubmit = (data: TaskFormData) => {
    createMutation.mutate(data);
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
        <Button
          size="sm"
          className="bg-[#711419] hover:bg-[#5a1014]"
          onClick={handleOpenCreate}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Task
        </Button>
      </CardHeader>
      <CardContent>
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
                        <StatusDot pill={priorityColors[task.priority as TaskPriority]}>
                          {priorityLabels[task.priority as TaskPriority]}
                        </StatusDot>
                      </TableCell>
                      <TableCell>
                        <StatusDot pill={statusColors[task.status as TaskStatus]}>
                          {statusLabels[task.status as TaskStatus]}
                        </StatusDot>
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New Task</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-600">Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Task title" className="h-9" {...field} />
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
                    <FormLabel className="text-xs font-medium text-slate-600">Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add a description..."
                        className="resize-none text-sm"
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
                    <FormLabel className="text-xs font-medium text-slate-600">Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="No type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No type</SelectItem>
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Normal" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
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
                      <FormLabel className="text-xs font-medium text-slate-600">Assigned To</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Unassigned" />
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
              </div>

              <FormField
                control={form.control}
                name="dueAt"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-xs font-medium text-slate-600">Due Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={`w-full h-9 pl-3 text-left text-sm font-normal ${!field.value && "text-muted-foreground"}`}
                          >
                            {field.value ? format(field.value, "EEE, MMM d, yyyy") : <span>Pick a date</span>}
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
                            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => field.onChange(null)}>
                              Clear date
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#711419] hover:bg-[#5a1014]"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Create
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
