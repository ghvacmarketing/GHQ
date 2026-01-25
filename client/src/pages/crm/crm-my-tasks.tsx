import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { 
  format, 
  isAfter, 
  isBefore, 
  startOfDay, 
  endOfDay,
  addDays,
  formatDistanceToNow,
  isToday as dateFnsIsToday,
} from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, Task, TaskType, CrmCustomer, TaskStatus, TaskPriority } from "@shared/schema";

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
  urgent: "bg-red-500",
  high: "bg-orange-500",
  normal: "bg-gray-400",
  low: "bg-blue-500",
};

const priorityLabels: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
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
  { key: "upcoming", label: "Upcoming", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: Calendar },
  { key: "noDate", label: "No Due Date", color: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-gray-200", icon: CheckCircle2 },
];

function TaskCard({ 
  task, 
  onComplete, 
  isCompleting,
  onTaskClick 
}: { 
  task: TaskWithRelations;
  onComplete: (taskId: string) => void;
  isCompleting: boolean;
  onTaskClick: (task: TaskWithRelations) => void;
}) {
  const [, navigate] = useLocation();
  
  const formatDueDate = (dueAt: string | Date | null) => {
    if (!dueAt) return null;
    const date = new Date(dueAt);
    const now = new Date();
    
    if (isBefore(date, now)) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const handleCardClick = () => {
    navigate(`/crm/tasks?taskId=${task.id}`);
  };

  return (
    <div 
      className={`group flex items-start gap-3 p-3 bg-white border rounded-lg hover:shadow-sm transition-all cursor-pointer ${
        isCompleting ? "opacity-50 scale-95" : ""
      }`}
      onClick={handleCardClick}
    >
      <div 
        className="pt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={false}
          disabled={isCompleting}
          onCheckedChange={() => onComplete(task.id)}
          className="h-5 w-5"
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityIndicatorColors[task.priority as TaskPriority]}`} />
          <span className="font-medium text-slate-900 truncate">{task.title}</span>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {task.type && (
            <Badge variant="outline" className="text-xs bg-slate-50">
              {task.type.name}
            </Badge>
          )}
          
          {task.dueAt && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDueDate(task.dueAt)}
            </span>
          )}
          
          {task.customer && (
            <span className="text-xs text-slate-400 truncate max-w-[150px]">
              {task.customer.name}
            </span>
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
}: {
  config: SectionConfig;
  tasks: TaskWithRelations[];
  onComplete: (taskId: string) => void;
  completingTaskId: string | null;
  onTaskClick: (task: TaskWithRelations) => void;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = config.icon;

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
    queryKey: ["/api/tasks", { assignedTo: currentUser?.id, limit: 100, hideCompleted: true }],
    queryFn: async () => {
      const params = new URLSearchParams({
        assignedTo: currentUser!.id,
        limit: "100",
      });
      const res = await fetch(`/api/tasks?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setCompletingTaskId(taskId);
      await apiRequest("PUT", `/api/tasks/${taskId}`, { status: "completed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task completed",
        description: "The task has been marked as completed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to complete the task.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setCompletingTaskId(null);
    },
  });

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
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
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

  const handleTaskClick = (task: TaskWithRelations) => {
    navigate(`/crm/tasks?taskId=${task.id}`);
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
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>
            <p className="text-slate-500 text-sm mt-1">
              {totalActiveTasks} active task{totalActiveTasks !== 1 ? "s" : ""} assigned to you
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/crm/tasks")}
          >
            View All Tasks
          </Button>
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
              <Button onClick={() => navigate("/crm/tasks")} variant="outline">
                View All Company Tasks
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
                  onTaskClick={handleTaskClick}
                  defaultOpen={config.key === "overdue" || config.key === "today"}
                />
              );
            })}
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
