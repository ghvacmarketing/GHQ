import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useSearch, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Phone, Calendar, CalendarDays, Play, Pause, RefreshCw, ChevronDown, ChevronRight, Plus, Search, Edit2, Trash2, X, Check, Cloud, Sun, CloudRain, CloudSnow, Wind, AlertTriangle, BarChart3, ClipboardList, Send, MessageSquare } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { CrmLayout } from "@/components/crm/crm-layout";
import { CommsSwitcher } from "@/components/crm/comms-switcher";
import { CommentComposer } from "@/components/crm/comment-composer";
import { CommentThread } from "@/components/crm/comment-thread";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, formatDistanceToNow, subDays } from "date-fns";
import { formatLocal, toLocalTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { Voicemail, CallLog, CallLogTask, CrmUser } from "@shared/schema";
import { Switch } from "@/components/ui/switch";

const VOICEMAIL_STATUSES = ["NEW", "UNRESOLVED", "RESOLVED"] as const;
type VoicemailStatus = typeof VOICEMAIL_STATUSES[number];

const COLUMN_PREFIX = "column-";

function getColumnId(status: VoicemailStatus): string {
  return `${COLUMN_PREFIX}${status}`;
}

function getStatusFromColumnId(columnId: string): VoicemailStatus | null {
  if (columnId.startsWith(COLUMN_PREFIX)) {
    const status = columnId.slice(COLUMN_PREFIX.length) as VoicemailStatus;
    if (VOICEMAIL_STATUSES.includes(status)) {
      return status;
    }
  }
  return null;
}

interface HorizontalScrollContainerProps {
  children: ReactNode;
  className?: string;
  isDraggingCard?: boolean;
}

function HorizontalScrollContainer({ children, className, isDraggingCard }: HorizontalScrollContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);

  const updateFades = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    setShowLeftFade(scrollLeft > 10);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    updateFades();
    container.addEventListener('scroll', updateFades);
    window.addEventListener('resize', updateFades);
    return () => {
      container.removeEventListener('scroll', updateFades);
      window.removeEventListener('resize', updateFades);
    };
  }, [updateFades]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDraggingCard) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    const container = containerRef.current;
    if (!container) return;
    setIsDragging(true);
    setStartX(e.pageX - container.offsetLeft);
    setScrollLeft(container.scrollLeft);
    container.style.cursor = 'grabbing';
    container.style.userSelect = 'none';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isDraggingCard) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5;
    container.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    const container = containerRef.current;
    if (container) {
      container.style.cursor = 'grab';
      container.style.userSelect = '';
    }
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      handleMouseUp();
    }
  };

  return (
    <div className="relative">
      {showLeftFade && (
        <div className="absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      )}
      <div
        ref={containerRef}
        className={cn(
          "flex gap-4 overflow-x-auto pb-4 kanban-scroll-container",
          !isDraggingCard && "cursor-grab",
          isDragging && "cursor-grabbing",
          className
        )}
        style={{ scrollbarWidth: 'thin' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        data-testid="crm-phone-kanban-board"
      >
        <div className="kanban-spacer" aria-hidden="true" />
        {children}
        <div className="kanban-spacer" aria-hidden="true" />
      </div>
      {showRightFade && (
        <div className="absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      )}
    </div>
  );
}

interface VoicemailCardProps {
  voicemail: Voicemail;
  isDragging?: boolean;
  onCardClick?: (voicemail: Voicemail) => void;
}

function VoicemailCard({ voicemail, isDragging, onCardClick }: VoicemailCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id: voicemail.id,
    data: {
      type: "card",
      voicemail,
      status: voicemail.status || "NEW",
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!voicemail.mp3Filename) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(`/uploads/${voicemail.mp3Filename}`);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const formattedDate = voicemail.receivedAt 
    ? format(typeof voicemail.receivedAt === "string" ? parseISO(voicemail.receivedAt) : voicemail.receivedAt, "MMM d, yyyy h:mm a")
    : null;

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onCardClick?.(voicemail);
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-2 hover:shadow-md transition-shadow bg-white touch-manipulation cursor-grab active:cursor-grabbing"
      data-testid={`crm-phone-card-voicemail-${voicemail.id}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            className="flex-shrink-0 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid={`crm-phone-voicemail-drag-handle-${voicemail.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" data-testid={`crm-phone-text-voicemail-title-${voicemail.id}`}>
              {voicemail.title || "Untitled Voicemail"}
            </h4>
            {voicemail.caller && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{voicemail.caller}</span>
              </div>
            )}
            {formattedDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{formattedDate}</span>
              </div>
            )}
            {voicemail.mp3Filename && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePlayPause}
                  className="min-h-[36px] text-xs"
                  data-testid={`crm-phone-button-play-voicemail-${voicemail.id}`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3 w-3 mr-1" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      Play
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface KanbanColumnProps {
  status: VoicemailStatus;
  voicemails: Voicemail[];
  onCardClick?: (voicemail: Voicemail) => void;
}

function KanbanColumn({ status, voicemails, onCardClick }: KanbanColumnProps) {
  const columnId = getColumnId(status);
  
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: {
      type: "column",
      status,
    }
  });

  const statusLabels: Record<VoicemailStatus, string> = {
    NEW: "New",
    UNRESOLVED: "Unresolved",
    RESOLVED: "Resolved",
  };

  const statusColors: Record<VoicemailStatus, string> = {
    NEW: "bg-blue-50",
    UNRESOLVED: "bg-yellow-50",
    RESOLVED: "bg-green-50",
  };

  return (
    <div className="flex-shrink-0 w-72 sm:w-80 snap-start sm:snap-center">
      <Card className={`h-full ${statusColors[status]} transition-colors ${isOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}>
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold truncate" data-testid={`crm-phone-voicemail-column-title-${status}`}>
              {statusLabels[status]}
            </CardTitle>
            <Badge variant="outline" className="ml-2 flex-shrink-0" data-testid={`crm-phone-voicemail-column-count-${status}`}>
              {voicemails.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          <ScrollArea className="h-[calc(100vh-280px)] pr-2">
            <div ref={setNodeRef} className="min-h-[100px]">
              <SortableContext items={voicemails.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                {voicemails.map((voicemail) => (
                  <VoicemailCard
                    key={voicemail.id}
                    voicemail={voicemail}
                    onCardClick={onCardClick}
                  />
                ))}
              </SortableContext>
              {voicemails.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8" data-testid={`crm-phone-voicemail-column-empty-${status}`}>
                  No voicemails
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

const callLogFormSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  description: z.string().min(1, "Phone call summary is required"),
  phone: z.string().optional(),
  tag: z.string().optional(),
  billable: z.boolean().optional(),
});

type CallLogFormData = z.infer<typeof callLogFormSchema>;

interface CallLogEntryProps {
  log: CallLog;
  isHighlighted: boolean;
  entryRef?: React.Ref<HTMLDivElement>;
  onEdit: (log: CallLog) => void;
  onDelete: (id: string) => void;
}

function CallLogEntry({ log, isHighlighted, entryRef, onEdit, onDelete }: CallLogEntryProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  
  const createdAt = log.createdAt ? (typeof log.createdAt === "string" ? parseISO(log.createdAt) : log.createdAt) : new Date();
  const relativeTime = formatDistanceToNow(createdAt, { addSuffix: true });
  const exactTime = format(createdAt, "MMM d, yyyy 'at' h:mm a");

  // The day endpoint preloads tasks + comment counts; only fetch per-log when
  // they're missing (e.g. search results) so a day doesn't fan out N+1 requests.
  const preloadedTasks = (log as CallLog & { tasks?: CallLogTask[] }).tasks;
  const preloadedCommentCount = (log as CallLog & { commentCount?: number }).commentCount;

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<CallLogTask[]>({
    queryKey: [`/api/call-logs/${log.id}/tasks`],
    enabled: isExpanded,
    initialData: preloadedTasks,
    staleTime: 15_000,
  });

  const { data: comments = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/crm/comments", "call_log", log.id],
    enabled: preloadedCommentCount === undefined,
  });

  const commentCount = preloadedCommentCount ?? comments.length;

  const createTaskMutation = useMutation({
    mutationFn: async (description: string) => {
      const res = await apiRequest("POST", `/api/call-logs/${log.id}/tasks`, { description });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/call-logs/${log.id}/tasks`] });
      setNewTaskText("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, isCompleted }: { taskId: string; isCompleted: boolean }) => {
      const res = await apiRequest("PUT", `/api/call-log-tasks/${taskId}`, { isCompleted });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/call-logs/${log.id}/tasks`] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task", variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest("DELETE", `/api/call-log-tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/call-logs/${log.id}/tasks`] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete task", variant: "destructive" });
    },
  });

  const handleAddTask = () => {
    if (newTaskText.trim()) {
      createTaskMutation.mutate(newTaskText.trim());
    }
  };

  const tagBorderColors: Record<string, string> = {
    Service: "border-l-blue-500",
    Install: "border-l-green-500",
    Sales: "border-l-purple-500",
    Maintenance: "border-l-amber-500",
  };

  const tagBadgeColors: Record<string, string> = {
    Service: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    Install: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    Sales: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    Maintenance: "bg-amber-100 text-amber-800 dark:bg-amber-700 dark:text-amber-200",
  };

  const borderColor = log.tag ? tagBorderColors[log.tag] || "border-l-gray-300" : "border-l-gray-300";

  return (
    <div
      ref={entryRef}
      className={cn(
        "group py-2 px-2.5 rounded-md bg-white dark:bg-card/50 transition-all duration-200 border-l-2 hover:bg-gray-50/50 dark:hover:bg-muted/30 border border-border/30 dark:border-border/20",
        borderColor,
        isHighlighted && "ring-2 ring-primary animate-pulse"
      )}
      data-testid={`crm-phone-call-log-entry-${log.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1"
              data-testid={`crm-phone-expand-log-${log.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="font-medium text-sm">{log.clientName}</span>
            </button>
            {log.phone && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <Phone className="h-2.5 w-2.5" />
                {log.phone}
              </span>
            )}
            {log.tag && (
              <StatusDot pill={cn("text-[10px] h-4 px-1", tagBadgeColors[log.tag] || "")}>
                {log.tag}
              </StatusDot>
            )}
            {log.billable && (
              <StatusDot pill="text-[10px] h-4 px-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Billable
              </StatusDot>
            )}
            {commentCount > 0 && (
              <Badge 
                variant="outline" 
                className="text-[10px] h-4 px-1 flex items-center gap-0.5 cursor-pointer hover:bg-muted"
                onClick={() => setIsExpanded(true)}
              >
                <MessageSquare className="h-2.5 w-2.5" />
                {commentCount}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{log.description}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] text-muted-foreground/60 cursor-default">{relativeTime}</span>
              </TooltipTrigger>
              <TooltipContent>{exactTime}</TooltipContent>
            </Tooltip>
            {log.createdByName && (
              <span className="text-[10px] text-muted-foreground/60">
                • by {log.createdByName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onEdit(log)}
            data-testid={`crm-phone-button-edit-log-${log.id}`}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" data-testid={`crm-phone-button-delete-log-${log.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Call Log</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this call log entry? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(log.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <Input
              placeholder="Add a task..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTask();
                }
              }}
              className="h-7 text-xs flex-1"
              data-testid={`crm-phone-input-task-${log.id}`}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={handleAddTask}
              disabled={!newTaskText.trim() || createTaskMutation.isPending}
              data-testid={`crm-phone-button-add-task-${log.id}`}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>

          {tasksLoading ? (
            <div className="text-xs text-muted-foreground py-1">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="text-xs text-muted-foreground py-1">No tasks yet</div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border border-border/30 rounded-md p-2 bg-muted/20"
                  data-testid={`crm-phone-task-${task.id}`}
                >
                  <div className="flex items-center gap-2 group/task">
                    <Checkbox
                      checked={task.isCompleted}
                      onCheckedChange={(checked) =>
                        toggleTaskMutation.mutate({ taskId: task.id, isCompleted: !!checked })
                      }
                      className="h-3.5 w-3.5"
                      data-testid={`crm-phone-task-checkbox-${task.id}`}
                    />
                    <span
                      className={cn(
                        "text-xs flex-1",
                        task.isCompleted && "line-through text-muted-foreground"
                      )}
                    >
                      {task.description}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover/task:opacity-100 transition-opacity"
                      onClick={() => deleteTaskMutation.mutate(task.id)}
                      data-testid={`crm-phone-delete-task-${task.id}`}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 px-1 mt-1 text-muted-foreground hover:text-foreground">
                        <MessageSquare className="h-3 w-3 mr-1" />
                        <span className="text-[10px]">Comments</span>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 pl-5 border-l-2 border-border/50">
                      <CommentThread entityType="call_log_task" entityId={task.id} />
                      <div className="mt-2">
                        <CommentComposer 
                          entityType="call_log_task" 
                          entityId={task.id}
                          placeholder="Add comment on this task..."
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </div>
          )}

          {/* Comments Section */}
          <div className="mt-4 pt-3 border-t border-border/30">
            <div className="text-xs font-medium text-muted-foreground mb-2">Comments</div>
            <CommentThread entityType="call_log" entityId={log.id} />
            <div className="mt-3">
              <CommentComposer 
                entityType="call_log" 
                entityId={log.id}
                placeholder="Add a comment about this call..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CallLogFormProps {
  date: string;
  editingLog?: CallLog | null;
  onCancel?: () => void;
  onSuccess?: () => void;
}

function CallLogForm({ date, editingLog, onCancel, onSuccess }: CallLogFormProps) {
  const { toast } = useToast();
  const form = useForm<CallLogFormData>({
    resolver: zodResolver(callLogFormSchema),
    defaultValues: {
      clientName: editingLog?.clientName || "",
      description: editingLog?.description || "",
      phone: editingLog?.phone || "",
      tag: editingLog?.tag || "",
      billable: editingLog?.billable || false,
    },
  });

  useEffect(() => {
    if (editingLog) {
      form.reset({
        clientName: editingLog.clientName || "",
        description: editingLog.description || "",
        phone: editingLog.phone || "",
        tag: editingLog.tag || "",
        billable: editingLog.billable || false,
      });
    } else {
      form.reset({
        clientName: "",
        description: "",
        phone: "",
        tag: "",
        billable: false,
      });
    }
  }, [editingLog, form]);

  const createMutation = useMutation({
    mutationFn: async (data: CallLogFormData) => {
      const res = await apiRequest("POST", "/api/call-logs", { ...data, date });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days", date] });
      form.reset();
      toast({ title: "Success", description: "Call log created" });
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create call log", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CallLogFormData) => {
      const res = await apiRequest("PUT", `/api/call-logs/${editingLog?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days", date] });
      toast({ title: "Success", description: "Call log updated" });
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update call log", variant: "destructive" });
    },
  });

  const onSubmit = (data: CallLogFormData) => {
    if (editingLog) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 p-3 border rounded-lg bg-muted/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="clientName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter client name" {...field} data-testid="crm-phone-input-client-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="Phone number (optional)" {...field} data-testid="crm-phone-input-phone" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone Call Summary *</FormLabel>
              <FormControl>
                <Textarea placeholder="What was the call about?" className="min-h-[60px]" {...field} data-testid="crm-phone-input-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <FormField
            control={form.control}
            name="tag"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-[120px]">
                <FormLabel>Tag</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="crm-phone-select-tag">
                      <SelectValue placeholder="Select a tag" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Service">Service</SelectItem>
                    <SelectItem value="Install">Install</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="billable"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 pt-6">
                <FormControl>
                  <Switch
                    checked={field.value || false}
                    onCheckedChange={field.onChange}
                    data-testid="crm-phone-switch-billable"
                  />
                </FormControl>
                <FormLabel className="!mt-0 cursor-pointer">Billable</FormLabel>
              </FormItem>
            )}
          />
          <div className="flex items-center gap-2 pt-6">
            {onCancel && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel} data-testid="crm-phone-button-cancel-form">
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={isPending} data-testid="crm-phone-button-submit-form">
              <Check className="h-4 w-4 mr-1" />
              {isPending ? "Saving..." : editingLog ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}

interface DateCardProps {
  date: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  highlightedLogId: string | null;
  entryRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  cardRef?: React.Ref<HTMLDivElement>;
  hideHeader?: boolean;
}

function DateCard({ date, count, isExpanded, onToggle, highlightedLogId, entryRefs, cardRef, hideHeader = false }: DateCardProps) {
  const { toast } = useToast();
  const [editingLog, setEditingLog] = useState<CallLog | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: dayData, isLoading } = useQuery<{ date: string; logs: CallLog[] }>({
    queryKey: ["/api/call-logs/days", date],
    enabled: isExpanded,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/call-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days", date] });
      toast({ title: "Success", description: "Call log deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete call log", variant: "destructive" });
    },
  });

  const formattedDate = format(parseISO(date), "EEE, MMM d, yyyy");
  const logs = dayData?.logs || [];

  const handleEdit = (log: CallLog) => {
    setEditingLog(log);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setEditingLog(null);
    setShowForm(false);
  };

  const handleFormCancel = () => {
    setEditingLog(null);
    setShowForm(false);
  };

  return (
    <div ref={cardRef} data-testid={`crm-phone-date-card-${date}`}>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <div className={hideHeader ? "" : "border-b border-border/50 dark:border-border/30"}>
          {!hideHeader && (
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between py-2 px-1 hover:bg-muted/30 dark:hover:bg-muted/20 transition-colors text-left">
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{formattedDate}</span>
                </div>
                <Badge variant="outline" className="text-xs h-5 px-1.5">{count}</Badge>
              </button>
            </CollapsibleTrigger>
          )}
          <CollapsibleContent>
            <div className="py-2 px-1 space-y-2">
              {!showForm && !editingLog && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => setShowForm(true)}
                  data-testid="crm-phone-button-add-entry"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Entry
                </Button>
              )}

              {(showForm || editingLog) && (
                <CallLogForm
                  date={date}
                  editingLog={editingLog}
                  onCancel={handleFormCancel}
                  onSuccess={handleFormSuccess}
                />
              )}

              {isLoading ? (
                <div className="text-center text-xs text-muted-foreground py-2">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-2">No entries</div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log) => (
                    <CallLogEntry
                      key={log.id}
                      log={log}
                      isHighlighted={highlightedLogId === log.id}
                      entryRef={(el) => { entryRefs.current[log.id] = el; }}
                      onEdit={handleEdit}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}

interface SearchResult extends CallLog {
  date: string;
}

interface YearlyCallCalendarProps {
  days: { id: string; date: string; count: number }[];
}

function YearlyCallCalendar({ days }: YearlyCallCalendarProps) {
  const currentYear = new Date().getFullYear();
  const todayStr = formatLocal(new Date(), "yyyy-MM-dd");
  
  const dayCountMap = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((d) => {
      if (d.date.startsWith(String(currentYear))) {
        map.set(d.date, d.count);
      }
    });
    return map;
  }, [days, currentYear]);

  const months = useMemo(() => {
    const result: { name: string; days: { date: string; day: number; count: number; isToday: boolean }[] }[] = [];
    
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(currentYear, month, 1);
      const monthName = format(monthDate, "MMMM");
      const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
      const firstDayOfWeek = monthDate.getDay();
      
      const monthDays: { date: string; day: number; count: number; isToday: boolean }[] = [];
      
      for (let i = 0; i < firstDayOfWeek; i++) {
        monthDays.push({ date: "", day: 0, count: 0, isToday: false });
      }
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const count = dayCountMap.get(dateStr) || 0;
        monthDays.push({
          date: dateStr,
          day,
          count,
          isToday: dateStr === todayStr,
        });
      }
      
      result.push({ name: monthName, days: monthDays });
    }
    
    return result;
  }, [currentYear, dayCountMap, todayStr]);

  const totalYearCalls = useMemo(() => {
    return Array.from(dayCountMap.values()).reduce((sum, count) => sum + count, 0);
  }, [dayCountMap]);

  const getCountColor = (count: number, isToday: boolean) => {
    if (isToday) return "bg-primary text-primary-foreground";
    if (count === 0) return "bg-muted/30 text-muted-foreground/50";
    if (count <= 2) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    if (count <= 5) return "bg-green-200 text-green-900 dark:bg-green-800/40 dark:text-green-200";
    if (count <= 10) return "bg-green-300 text-green-900 dark:bg-green-700/50 dark:text-green-100";
    return "bg-green-500 text-white dark:bg-green-600";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{currentYear} Call Calendar</h2>
        <Badge variant="secondary" className="text-sm font-semibold">
          {totalYearCalls} calls this year
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {months.map((month) => (
          <Card key={month.name} className="p-3">
            <h3 className="text-sm font-semibold mb-2 text-center">{month.name}</h3>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="text-[10px] font-medium text-muted-foreground py-0.5">
                  {d}
                </div>
              ))}
              {month.days.map((day, i) => (
                <div key={i} className="aspect-square flex items-center justify-center">
                  {day.day > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "w-full h-full flex items-center justify-center rounded text-[10px] font-medium cursor-default transition-colors",
                            getCountColor(day.count, day.isToday)
                          )}
                          data-testid={`calendar-day-${day.date}`}
                        >
                          {day.day}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p className="font-medium">{format(parseISO(day.date), "MMM d, yyyy")}</p>
                        <p>{day.count} {day.count === 1 ? "call" : "calls"}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      
      <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded bg-muted/30" />
          <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30" />
          <div className="w-4 h-4 rounded bg-green-200 dark:bg-green-800/40" />
          <div className="w-4 h-4 rounded bg-green-300 dark:bg-green-700/50" />
          <div className="w-4 h-4 rounded bg-green-500 dark:bg-green-600" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

function YearlyCalendarTab() {
  const { data: days = [], isLoading } = useQuery<{ id: string; date: string; count: number }[]>({
    queryKey: ["/api/call-logs/days"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading calendar...</div>
      </div>
    );
  }

  return <YearlyCallCalendar days={days} />;
}

interface WeeklyStatsProps {
  days: { id: string; date: string; count: number }[];
}

function WeeklyStats({ days }: WeeklyStatsProps) {
  const weeklyData = useMemo(() => {
    const todayLocal = toLocalTime(new Date());
    const last7Days: { date: string; dayName: string; count: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = subDays(todayLocal, i);
      const dateStr = format(date, "yyyy-MM-dd");
      const dayName = format(date, "EEE").charAt(0);
      const dayData = days.find((d) => d.date === dateStr);
      last7Days.push({
        date: dateStr,
        dayName,
        count: dayData?.count || 0,
      });
    }

    const totalCalls = last7Days.reduce((sum, d) => sum + d.count, 0);

    return { last7Days, totalCalls };
  }, [days]);

  return (
    <div className="flex items-center gap-1.5 mb-3 py-2 px-3 bg-muted/20 dark:bg-muted/10 rounded-md border border-border/50" data-testid="crm-phone-weekly-stats">
      {weeklyData.last7Days.map((day) => {
        const isToday = day.date === formatLocal(new Date(), "yyyy-MM-dd");
        return (
          <div
            key={day.date}
            className={cn(
              "flex flex-col items-center justify-center rounded-md px-1.5 py-1 min-w-[32px]",
              isToday ? "bg-primary text-primary-foreground" : "bg-muted/50 dark:bg-muted/30"
            )}
            data-testid={`crm-phone-weekly-stat-${day.date}`}
          >
            <span className="text-[10px] font-medium">{day.dayName}</span>
            <span className={cn("text-xs font-bold", !isToday && day.count === 0 && "text-muted-foreground")}>{day.count}</span>
          </div>
        );
      })}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Total:</span>
        <Badge variant="secondary" className="text-xs font-semibold">{weeklyData.totalCalls}</Badge>
      </div>
    </div>
  );
}

function DailyCallLog() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [selectedPastDate, setSelectedPastDate] = useState<string | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ date: string; logId: string } | null>(null);
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);
  
  const todayDate = useMemo(() => formatLocal(new Date(), "yyyy-MM-dd"), []);

  const { data: days = [], isLoading: isDaysLoading } = useQuery<{ id: string; date: string; count: number }[]>({
    queryKey: ["/api/call-logs/days"],
  });

  const { data: searchResults = [], isLoading: isSearching } = useQuery<SearchResult[]>({
    queryKey: ["/api/call-logs/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await fetch(`/api/call-logs/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  // Handle URL params for notification click-through (log= or task=)
  useEffect(() => {
    if (urlParamsProcessed || isDaysLoading || days.length === 0) return;
    
    const params = new URLSearchParams(searchString);
    const logId = params.get("log");
    const taskId = params.get("task");
    
    if (!logId && !taskId) {
      setUrlParamsProcessed(true);
      return;
    }
    
    const navigateToLog = async (targetLogId: string) => {
      try {
        // Fetch the call log to get its date
        const res = await fetch(`/api/call-logs/${targetLogId}`);
        if (!res.ok) {
          console.error("Failed to fetch call log");
          return;
        }
        const log = await res.json();
        if (log && log.date) {
          setHighlightedLogId(targetLogId);
          setPendingScrollTarget({ date: log.date, logId: targetLogId });
        }
      } catch (error) {
        console.error("Error navigating to call log:", error);
      }
      // Clear URL params
      setLocation("/crm/phone", { replace: true });
    };
    
    const navigateToTask = async (targetTaskId: string) => {
      try {
        // Fetch the task to get its parent callLogId
        const res = await fetch(`/api/call-log-tasks/${targetTaskId}`);
        if (!res.ok) {
          console.error("Failed to fetch call log task");
          return;
        }
        const task = await res.json();
        if (task && task.callLogId) {
          navigateToLog(task.callLogId);
        }
      } catch (error) {
        console.error("Error navigating to call log task:", error);
      }
    };
    
    setUrlParamsProcessed(true);
    
    if (logId) {
      navigateToLog(logId);
    } else if (taskId) {
      navigateToTask(taskId);
    }
  }, [searchString, days, isDaysLoading, urlParamsProcessed, setLocation]);

  useEffect(() => {
    if (!pendingScrollTarget) return;
    
    const { date, logId } = pendingScrollTarget;
    let scrolledToCard = false;
    let scrolledToEntry = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const attemptScroll = (attempts: number) => {
      if (attempts <= 0 || scrolledToEntry) {
        if (date !== todayDate) {
          setSelectedPastDate(date);
        }
        setPendingScrollTarget(null);
        if (!scrolledToEntry) {
          setTimeout(() => setHighlightedLogId(null), 3000);
        }
        return;
      }
      
      const cardEl = cardRefs.current[date];
      const entryEl = entryRefs.current[logId];
      
      if (cardEl && !scrolledToCard) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "start" });
        scrolledToCard = true;
      }
      
      if (entryEl && !scrolledToEntry) {
        setTimeout(() => {
          entryEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }, scrolledToCard ? 200 : 0);
        scrolledToEntry = true;
        if (date !== todayDate) {
          setSelectedPastDate(date);
        }
        setTimeout(() => setHighlightedLogId(null), 3000);
        setPendingScrollTarget(null);
        return;
      }
      
      timeoutId = setTimeout(() => attemptScroll(attempts - 1), 200);
    };
    
    attemptScroll(20);
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pendingScrollTarget, selectedPastDate, todayDate]);

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setShowSearchResults(false);
    setSearchQuery("");
    setHighlightedLogId(result.id);
    setPendingScrollTarget({ date: result.date, logId: result.id });
  }, []);

  const createTodayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/call-logs", {
        clientName: "Today's Log",
        description: "Log created",
        date: todayDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days"] });
    },
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search calls by name, phone, or keyword..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchResults(true);
            }}
            onFocus={() => setShowSearchResults(true)}
            className="pl-9"
            data-testid="crm-phone-input-search-calls"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => {
                setSearchQuery("");
                setShowSearchResults(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {showSearchResults && searchQuery.length >= 2 && (
          <Card className="absolute z-20 w-full mt-1 max-h-64 overflow-auto">
            <CardContent className="p-2">
              {isSearching ? (
                <div className="text-center text-sm text-muted-foreground py-4">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">No results found</div>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
                      onClick={() => handleSearchResultClick(result)}
                      data-testid={`crm-phone-search-result-${result.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {result.createdByName?.charAt(0) || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{result.clientName}</div>
                          <div className="text-xs text-muted-foreground truncate">{result.description}</div>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {format(parseISO(result.date), "MMM d")}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {isDaysLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading call logs...</div>
      ) : days.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No call logs yet</p>
          <Button
            variant="default"
            className="mt-3"
            onClick={() => createTodayMutation.mutate()}
            disabled={createTodayMutation.isPending}
            data-testid="crm-phone-button-create-today"
          >
            <Plus className="h-4 w-4 mr-2" />
            {createTodayMutation.isPending ? "Creating..." : "Start Today's Log"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const todayData = days.find(d => d.date === todayDate);
            if (todayData) {
              return (
                <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-background shadow-sm" data-testid="crm-phone-today-card">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold">Today</CardTitle>
                          <p className="text-xs text-muted-foreground">{formatLocal(new Date(), "EEEE, MMMM d")}</p>
                        </div>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-sm">
                        {todayData.count} {todayData.count === 1 ? "call" : "calls"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <DateCard
                      date={todayDate}
                      count={todayData.count}
                      isExpanded={true}
                      onToggle={() => {}}
                      highlightedLogId={highlightedLogId}
                      entryRefs={entryRefs}
                      cardRef={(el) => { cardRefs.current[todayDate] = el; }}
                      hideHeader={true}
                    />
                  </CardContent>
                </Card>
              );
            } else {
              return (
                <Card className="border-dashed border-2 border-primary/30" data-testid="crm-phone-today-card-empty">
                  <CardContent className="py-6 text-center">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-3">No calls logged today</p>
                    <Button
                      onClick={() => createTodayMutation.mutate()}
                      disabled={createTodayMutation.isPending}
                      data-testid="crm-phone-button-create-today"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {createTodayMutation.isPending ? "Creating..." : "Start Today's Log"}
                    </Button>
                  </CardContent>
                </Card>
              );
            }
          })()}

          {(() => {
            const pastDays = days.filter(d => d.date !== todayDate);
            if (pastDays.length === 0) return null;
            
            const pendingPastDate = pendingScrollTarget?.date && pendingScrollTarget.date !== todayDate ? pendingScrollTarget.date : null;
            const activePastDate = pendingPastDate || selectedPastDate;
            
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Select 
                    value={selectedPastDate || "none"} 
                    onValueChange={(val) => setSelectedPastDate(val === "none" ? null : val)}
                  >
                    <SelectTrigger className="w-full" data-testid="crm-phone-select-past-date">
                      <SelectValue placeholder="View previous days..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a previous day...</SelectItem>
                      {pastDays.map((day) => (
                        <SelectItem key={day.date} value={day.date}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>{format(parseISO(day.date), "EEE, MMM d, yyyy")}</span>
                            <Badge variant="secondary" className="text-xs">{day.count}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activePastDate && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedPastDate(null);
                        setPendingScrollTarget(null);
                      }}
                      className="flex-shrink-0"
                      data-testid="crm-phone-button-clear-selection"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {activePastDate && (
                  <Card className="bg-muted/20" data-testid={`crm-phone-past-day-card-${activePastDate}`}>
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">
                          {format(parseISO(activePastDate), "EEEE, MMMM d, yyyy")}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {days.find(d => d.date === activePastDate)?.count || 0} calls
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <DateCard
                        date={activePastDate}
                        count={days.find(d => d.date === activePastDate)?.count || 0}
                        isExpanded={true}
                        onToggle={() => {}}
                        highlightedLogId={highlightedLogId}
                        entryRefs={entryRefs}
                        cardRef={(el) => { cardRefs.current[activePastDate] = el; }}
                        hideHeader={true}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function VoicemailsKanban() {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { status?: string }>>({});
  const [selectedVoicemail, setSelectedVoicemail] = useState<Voicemail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogAudioRef = useRef<HTMLAudioElement | null>(null);
  const [dialogIsPlaying, setDialogIsPlaying] = useState(false);

  const handleCardClick = useCallback((voicemail: Voicemail) => {
    setSelectedVoicemail(voicemail);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      if (dialogAudioRef.current) {
        dialogAudioRef.current.pause();
        dialogAudioRef.current = null;
      }
      setDialogIsPlaying(false);
    }
    setDialogOpen(open);
  }, []);

  const handleDialogPlayPause = useCallback(() => {
    if (!selectedVoicemail?.mp3Filename) return;

    if (!dialogAudioRef.current) {
      dialogAudioRef.current = new Audio(`/uploads/${selectedVoicemail.mp3Filename}`);
      dialogAudioRef.current.onended = () => setDialogIsPlaying(false);
    }

    if (dialogIsPlaying) {
      dialogAudioRef.current.pause();
      setDialogIsPlaying(false);
    } else {
      dialogAudioRef.current.play();
      setDialogIsPlaying(true);
    }
  }, [selectedVoicemail, dialogIsPlaying]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const { data: voicemails = [], isLoading } = useQuery<Voicemail[]>({
    queryKey: ["/api/voicemails"],
  });

  const clearOptimisticUpdate = useCallback((id: string) => {
    setOptimisticUpdates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateVoicemailMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { status: string } }) => {
      const res = await apiRequest("PATCH", `/api/voicemails/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      clearOptimisticUpdate(variables.id);
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
    },
    onError: (error, variables) => {
      clearOptimisticUpdate(variables.id);
      toast({
        title: "Error",
        description: "Failed to update voicemail status",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
    },
  });

  const syncVoicemailsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/voicemails/sync", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
      toast({
        title: "Sync Complete",
        description: `${data.synced} voicemails synced from Trello`,
      });
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync voicemails from Trello",
        variant: "destructive",
      });
    },
  });

  const voicemailsByStatus = useMemo(() => {
    const map: Record<VoicemailStatus, Voicemail[]> = {
      NEW: [],
      UNRESOLVED: [],
      RESOLVED: [],
    };

    voicemails.forEach((vm) => {
      const optimistic = optimisticUpdates[vm.id];
      const effectiveStatus = (optimistic?.status || vm.status || "NEW") as VoicemailStatus;
      if (VOICEMAIL_STATUSES.includes(effectiveStatus)) {
        map[effectiveStatus].push(vm);
      } else {
        map.NEW.push(vm);
      }
    });

    return map;
  }, [voicemails, optimisticUpdates]);

  const activeVoicemail = useMemo(() => {
    if (!activeId) return null;
    return voicemails.find((vm) => vm.id === activeId) || null;
  }, [activeId, voicemails]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeVm = voicemails.find((vm) => vm.id === active.id);
    if (!activeVm) return;

    let targetStatus: VoicemailStatus | null = null;

    if (String(over.id).startsWith(COLUMN_PREFIX)) {
      targetStatus = getStatusFromColumnId(String(over.id));
    } else {
      const overVm = voicemails.find((vm) => vm.id === over.id);
      if (overVm) {
        targetStatus = (overVm.status || "NEW") as VoicemailStatus;
      }
    }

    if (!targetStatus) return;

    const currentStatus = (activeVm.status || "NEW") as VoicemailStatus;
    if (currentStatus === targetStatus) return;

    setOptimisticUpdates((prev) => ({
      ...prev,
      [activeVm.id]: { status: targetStatus },
    }));

    updateVoicemailMutation.mutate({
      id: activeVm.id,
      data: { status: targetStatus },
    });
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncVoicemailsMutation.mutate()}
          disabled={syncVoicemailsMutation.isPending}
          className="min-h-[44px]"
          data-testid="crm-phone-button-sync-voicemails"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", syncVoicemailsMutation.isPending && "animate-spin")} />
          {syncVoicemailsMutation.isPending ? "Syncing..." : "Sync from Trello"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading voicemails...</div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <HorizontalScrollContainer isDraggingCard={!!activeId}>
            {VOICEMAIL_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                voicemails={voicemailsByStatus[status]}
                onCardClick={handleCardClick}
              />
            ))}
          </HorizontalScrollContainer>
          <DragOverlay>
            {activeVoicemail && (
              <VoicemailCard voicemail={activeVoicemail} isDragging />
            )}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="crm-phone-dialog-voicemail-details">
          <DialogHeader>
            <DialogTitle data-testid="crm-phone-dialog-voicemail-title">
              {selectedVoicemail?.title || "Untitled Voicemail"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedVoicemail && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge 
                  variant={
                    selectedVoicemail.status === "RESOLVED" ? "default" :
                    selectedVoicemail.status === "UNRESOLVED" ? "secondary" : "outline"
                  }
                  data-testid="crm-phone-dialog-voicemail-status"
                >
                  {selectedVoicemail.status || "NEW"}
                </Badge>
              </div>

              {selectedVoicemail.caller && (
                <div className="flex items-center gap-2 text-sm" data-testid="crm-phone-dialog-voicemail-caller">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{selectedVoicemail.caller}</span>
                </div>
              )}

              {selectedVoicemail.receivedAt && (
                <div className="flex items-center gap-2 text-sm" data-testid="crm-phone-dialog-voicemail-date">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>
                    {format(
                      typeof selectedVoicemail.receivedAt === "string" 
                        ? parseISO(selectedVoicemail.receivedAt) 
                        : selectedVoicemail.receivedAt, 
                      "MMMM d, yyyy 'at' h:mm a"
                    )}
                  </span>
                </div>
              )}

              {selectedVoicemail.mp3Filename && (
                <div className="py-2">
                  <Button
                    variant="outline"
                    onClick={handleDialogPlayPause}
                    className="min-h-[44px]"
                    data-testid="crm-phone-dialog-button-play-voicemail"
                  >
                    {dialogIsPlaying ? (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Pause Audio
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Play Audio
                      </>
                    )}
                  </Button>
                </div>
              )}

              {selectedVoicemail.description && (
                <div className="flex-1 overflow-hidden">
                  <h4 className="text-sm font-medium mb-2">Transcription</h4>
                  <ScrollArea className="h-[200px] border rounded-md p-3 bg-muted/30">
                    <p className="text-sm whitespace-pre-wrap" data-testid="crm-phone-dialog-voicemail-description">
                      {selectedVoicemail.description}
                    </p>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface WeatherPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  icon: string;
  isDaytime: boolean;
}

interface WeatherAlert {
  properties: {
    headline: string;
    severity: string;
    event: string;
    description: string;
    expires: string;
  };
}

interface WeatherData {
  lat: string;
  lon: string;
  forecast: { properties: { periods: WeatherPeriod[] } };
  hourly: { properties: { periods: WeatherPeriod[] } };
  alerts: { features: WeatherAlert[] };
  fetchedAt: string;
  stale: boolean;
}

function getWeatherIcon(shortForecast: string, isDaytime: boolean, size: "sm" | "md" = "md") {
  const forecast = shortForecast.toLowerCase();
  const className = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  if (forecast.includes("rain") || forecast.includes("shower")) return <CloudRain className={cn(className, "text-blue-500")} />;
  if (forecast.includes("snow")) return <CloudSnow className={cn(className, "text-blue-300")} />;
  if (forecast.includes("cloud") || forecast.includes("overcast")) return <Cloud className={cn(className, "text-gray-400")} />;
  if (forecast.includes("wind")) return <Wind className={cn(className, "text-gray-500")} />;
  return isDaytime ? <Sun className={cn(className, "text-yellow-500")} /> : <Cloud className={cn(className, "text-gray-600")} />;
}

interface WeatherImpactDataPoint {
  date: string;
  calls: number;
  hotIndex: number;
  coldIndex: number;
  avgTempF: number;
}

interface WeatherImpactResponse {
  data: WeatherImpactDataPoint[];
  updatedAt: string;
}

function WeeklyForecast() {
  const { data: weather } = useQuery<WeatherData>({
    queryKey: ["/api/weather"],
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  if (!weather?.forecast?.properties?.periods?.length) {
    return null;
  }

  const periods = weather.forecast.properties.periods;
  
  const dailyForecasts: { day: string; high: number | null; low: number | null; icon: string; isDaytime: boolean }[] = [];
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const dayName = period.name.replace(/ Night$/, "").replace("This ", "").replace("Tonight", "Today");
    const existing = dailyForecasts.find(d => d.day === dayName);
    if (existing) {
      if (period.isDaytime) existing.high = period.temperature;
      else existing.low = period.temperature;
    } else {
      dailyForecasts.push({
        day: dayName,
        high: period.isDaytime ? period.temperature : null,
        low: !period.isDaytime ? period.temperature : null,
        icon: period.shortForecast,
        isDaytime: period.isDaytime,
      });
    }
  }

  return (
    <div className="mb-4 grid grid-cols-7 gap-1 py-3 px-3 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 rounded-lg border border-blue-100 dark:border-blue-900/50" data-testid="crm-phone-weather-weekly">
      {dailyForecasts.slice(0, 7).map((day, idx) => (
        <div key={idx} className="flex flex-col items-center text-center py-1" data-testid={`crm-phone-weather-day-${idx}`}>
          <span className="text-xs font-medium text-muted-foreground truncate w-full">
            {day.day.slice(0, 3)}
          </span>
          <div className="my-1">
            {getWeatherIcon(day.icon, true, "sm")}
          </div>
          <div className="flex flex-col text-xs leading-tight">
            {day.high !== null && (
              <span className="text-red-600 dark:text-red-400 font-semibold">{day.high}°</span>
            )}
            {day.low !== null && (
              <span className="text-blue-600 dark:text-blue-400">{day.low}°</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const phoneScreeningSchema = z.object({
  dateOfCall: z.string().min(1, "Date of call is required"),
  screenedBy: z.string().min(1, "Screened by is required"),
  candidateName: z.string().min(1, "Candidate name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  resumeReceived: z.enum(["yes", "no", "will_send"]),
  validDriversLicense: z.enum(["yes", "no"]),
  epaCertification: z.enum(["yes", "no"]),
  epaTypeI: z.boolean().optional(),
  epaTypeII: z.boolean().optional(),
  epaTypeIII: z.boolean().optional(),
  epaUniversal: z.boolean().optional(),
  yearsExperience: z.string().optional(),
  systemsResidential: z.boolean().optional(),
  systemsCommercial: z.boolean().optional(),
  brandsFamiliar: z.string().optional(),
  experienceServiceCalls: z.boolean().optional(),
  experienceInstallations: z.boolean().optional(),
  experienceBoth: z.boolean().optional(),
  ownHandTools: z.enum(["yes", "no"]),
  toolkitDescription: z.string().optional(),
  strongestTechnicalSkill: z.string().optional(),
  comfortableAtticsCrawlSpaces: z.enum(["yes", "no"]),
  canLift75lbs: z.enum(["yes", "no"]),
  availableOnCall: z.enum(["yes", "no"]),
  howHeardAboutUs: z.string().optional(),
  currentlyEmployed: z.enum(["yes", "no"]),
  noticePeriod: z.string().optional(),
  desiredStartDate: z.string().optional(),
  salaryExpectation: z.string().optional(),
  safetyViolations: z.enum(["yes", "no"]),
  safetyViolationsExplain: z.string().optional(),
  reasonForLeaving: z.string().optional(),
  phoneManner: z.enum(["professional", "okay", "concerning"]),
  recommendMovingForward: z.enum(["yes", "no", "unsure"]),
  redFlagsNotes: z.string().optional(),
  actionSentToErnest: z.boolean().optional(),
  actionDeclined: z.boolean().optional(),
});

type PhoneScreeningFormData = z.infer<typeof phoneScreeningSchema>;

function PhoneScreeningForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<PhoneScreeningFormData>({
    resolver: zodResolver(phoneScreeningSchema),
    defaultValues: {
      dateOfCall: formatLocal(new Date(), "yyyy-MM-dd"),
      screenedBy: "",
      candidateName: "",
      phone: "",
      email: "",
      resumeReceived: "no",
      validDriversLicense: "yes",
      epaCertification: "no",
      epaTypeI: false,
      epaTypeII: false,
      epaTypeIII: false,
      epaUniversal: false,
      yearsExperience: "",
      systemsResidential: false,
      systemsCommercial: false,
      brandsFamiliar: "",
      experienceServiceCalls: false,
      experienceInstallations: false,
      experienceBoth: false,
      ownHandTools: "no",
      toolkitDescription: "",
      strongestTechnicalSkill: "",
      comfortableAtticsCrawlSpaces: "yes",
      canLift75lbs: "yes",
      availableOnCall: "yes",
      howHeardAboutUs: "",
      currentlyEmployed: "no",
      noticePeriod: "",
      desiredStartDate: "",
      salaryExpectation: "",
      safetyViolations: "no",
      safetyViolationsExplain: "",
      reasonForLeaving: "",
      phoneManner: "okay",
      recommendMovingForward: "unsure",
      redFlagsNotes: "",
      actionSentToErnest: false,
      actionDeclined: false,
    },
  });

  const getEpaTypes = (data: PhoneScreeningFormData) => {
    const types = [];
    if (data.epaTypeI) types.push("Type I");
    if (data.epaTypeII) types.push("Type II");
    if (data.epaTypeIII) types.push("Type III");
    if (data.epaUniversal) types.push("Universal");
    return types.length > 0 ? types.join(", ") : "N/A";
  };

  const getSystemTypes = (data: PhoneScreeningFormData) => {
    const types = [];
    if (data.systemsResidential) types.push("Residential");
    if (data.systemsCommercial) types.push("Commercial");
    return types.length > 0 ? types.join(", ") : "N/A";
  };

  const getExperienceTypes = (data: PhoneScreeningFormData) => {
    const types = [];
    if (data.experienceServiceCalls) types.push("Service Calls");
    if (data.experienceInstallations) types.push("Installations");
    if (data.experienceBoth) types.push("Both");
    return types.length > 0 ? types.join(", ") : "N/A";
  };

  const onSubmit = async (data: PhoneScreeningFormData) => {
    setIsSubmitting(true);
    try {
      const emailBody = `
HVAC Technician Phone Screening Form
=====================================

CANDIDATE INFORMATION
---------------------
Date of Call: ${data.dateOfCall}
Screened by: ${data.screenedBy}
Candidate Name: ${data.candidateName}
Phone: ${data.phone || "N/A"}
Email: ${data.email || "N/A"}
Resume Received: ${data.resumeReceived === "yes" ? "Yes" : data.resumeReceived === "no" ? "No" : "Will Send"}

BASIC QUALIFICATIONS
--------------------
Valid Driver's License: ${data.validDriversLicense === "yes" ? "Yes" : "No"}
EPA Certification: ${data.epaCertification === "yes" ? "Yes" : "No"}
EPA Type(s): ${getEpaTypes(data)}
Years of HVAC Experience: ${data.yearsExperience || "N/A"}

EXPERIENCE & SKILLS
-------------------
Types of Systems Worked On: ${getSystemTypes(data)}
Brands Familiar With: ${data.brandsFamiliar || "N/A"}
Experience With: ${getExperienceTypes(data)}
Own Hand Tools: ${data.ownHandTools === "yes" ? "Yes" : "No"}
Toolkit Description: ${data.toolkitDescription || "N/A"}
Strongest Technical Skill: ${data.strongestTechnicalSkill || "N/A"}

PRACTICAL REQUIREMENTS
----------------------
Comfortable in Attics/Crawl Spaces/Roofs: ${data.comfortableAtticsCrawlSpaces === "yes" ? "Yes" : "No"}
Can Lift/Carry 75 lbs Regularly: ${data.canLift75lbs === "yes" ? "Yes" : "No"}
Available for Standard Hours + On-Call: ${data.availableOnCall === "yes" ? "Yes" : "No"}

AVAILABILITY & BACKGROUND
-------------------------
How Did You Hear About Us: ${data.howHeardAboutUs || "N/A"}
Currently Employed: ${data.currentlyEmployed === "yes" ? "Yes" : "No"}
Notice Period Needed: ${data.noticePeriod || "N/A"}
Desired Start Date: ${data.desiredStartDate || "N/A"}
Salary/Hourly Expectations: ${data.salaryExpectation || "N/A"}
Any Safety Violations/License Suspensions: ${data.safetyViolations === "yes" ? "Yes" : "No"}
${data.safetyViolations === "yes" ? `Explanation: ${data.safetyViolationsExplain || "N/A"}` : ""}

WHY THEY'RE LOOKING
-------------------
Reason for Leaving Current/Last Position:
${data.reasonForLeaving || "N/A"}

YOUR IMPRESSION (KYLIE)
-----------------------
Overall Phone Manner: ${data.phoneManner === "professional" ? "Professional" : data.phoneManner === "okay" ? "Okay" : "Concerning"}
Would You Recommend Moving Forward: ${data.recommendMovingForward === "yes" ? "Yes" : data.recommendMovingForward === "no" ? "No" : "Unsure"}
Red Flags or Notes:
${data.redFlagsNotes || "None"}

ACTION TAKEN
------------
${data.actionSentToErnest ? "✅ Sent to Ernest for Review" : ""}
${data.actionDeclined ? "❌ Declined (Missing Requirements)" : ""}
      `.trim();

      const mailtoLink = `mailto:ernest@giesbrechthvac.com?subject=Phone Screening: ${encodeURIComponent(data.candidateName)}&body=${encodeURIComponent(emailBody)}`;
      window.location.href = mailtoLink;

      toast({
        title: "Opening email client",
        description: "The screening form will open in your email client to send to Ernest.",
      });
      
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to prepare email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleClear = () => {
    form.reset();
    toast({
      title: "Form cleared",
      description: "All fields have been reset.",
    });
  };

  const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-600 uppercase tracking-wide border-b-2 border-blue-500 pb-2">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-6">
      <Card>
        <CardHeader className="bg-slate-700 text-white rounded-t-lg">
          <CardTitle className="text-lg font-bold">HVAC Technician Phone Screening Form</CardTitle>
          <p className="text-sm text-slate-200">Quick 10-minute phone interview for service technician candidates</p>
        </CardHeader>
        <CardContent className="p-4">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <h3 className="font-semibold text-blue-800 mb-2">Quick Steps for Kylie:</h3>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li><strong>Greet & get resume:</strong> Ask for their email and where to send resume</li>
              <li><strong>Fill out this form:</strong> Takes 5-10 minutes during the call</li>
              <li><strong>Send to Ernest:</strong> Email completed form + resume to Ernest (you're done!)</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <SectionCard title="Candidate Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="dateOfCall" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Call:</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="screenedBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Screened by:</FormLabel>
                  <FormControl><Input placeholder="Kylie" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="candidateName" render={({ field }) => (
              <FormItem>
                <FormLabel>Candidate Name:</FormLabel>
                <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone:</FormLabel>
                  <FormControl><Input type="tel" placeholder="(555) 123-4567" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email:</FormLabel>
                  <FormControl><Input type="email" placeholder="candidate@email.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="resumeReceived" render={({ field }) => (
              <FormItem>
                <FormLabel>Resume Received?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="resume-yes" /><Label htmlFor="resume-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="resume-no" /><Label htmlFor="resume-no">No</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="will_send" id="resume-will-send" /><Label htmlFor="resume-will-send">Will Send</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          <SectionCard title="Basic Qualifications">
            <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded text-sm">
              <span className="font-semibold text-amber-800">⚠️ DEAL-BREAKERS:</span>{" "}
              <span className="text-amber-700">If they answer "No" to driver's license or EPA certification, thank them but explain these are requirements.</span>
            </div>
            <FormField control={form.control} name="validDriversLicense" render={({ field }) => (
              <FormItem>
                <FormLabel>Valid Driver's License?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="license-yes" /><Label htmlFor="license-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="license-no" /><Label htmlFor="license-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="epaCertification" render={({ field }) => (
              <FormItem>
                <FormLabel>EPA Certification?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="epa-cert-yes" /><Label htmlFor="epa-cert-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="epa-cert-no" /><Label htmlFor="epa-cert-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div>
              <Label className="text-sm font-medium">If Yes, EPA Type:</Label>
              <div className="flex flex-wrap gap-4 mt-2">
                <FormField control={form.control} name="epaTypeI" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="epa-type-1" />
                    <Label htmlFor="epa-type-1">Type I</Label>
                  </div>
                )} />
                <FormField control={form.control} name="epaTypeII" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="epa-type-2" />
                    <Label htmlFor="epa-type-2">Type II</Label>
                  </div>
                )} />
                <FormField control={form.control} name="epaTypeIII" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="epa-type-3" />
                    <Label htmlFor="epa-type-3">Type III</Label>
                  </div>
                )} />
                <FormField control={form.control} name="epaUniversal" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="epa-universal" />
                    <Label htmlFor="epa-universal">Universal</Label>
                  </div>
                )} />
              </div>
            </div>
            <FormField control={form.control} name="yearsExperience" render={({ field }) => (
              <FormItem>
                <FormLabel>Years of HVAC Experience:</FormLabel>
                <FormControl><Input placeholder="" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          <SectionCard title="Experience & Skills">
            <div>
              <Label className="text-sm font-medium">Types of Systems Worked On:</Label>
              <div className="flex flex-wrap gap-4 mt-2">
                <FormField control={form.control} name="systemsResidential" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="sys-residential" />
                    <Label htmlFor="sys-residential">Residential</Label>
                  </div>
                )} />
                <FormField control={form.control} name="systemsCommercial" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="sys-commercial" />
                    <Label htmlFor="sys-commercial">Commercial</Label>
                  </div>
                )} />
              </div>
            </div>
            <FormField control={form.control} name="brandsFamiliar" render={({ field }) => (
              <FormItem>
                <FormLabel>Brands Familiar With:</FormLabel>
                <FormControl><Input placeholder="e.g., Carrier, Trane, Lennox, etc." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div>
              <Label className="text-sm font-medium">Experience With:</Label>
              <div className="flex flex-wrap gap-4 mt-2">
                <FormField control={form.control} name="experienceServiceCalls" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="exp-service" />
                    <Label htmlFor="exp-service">Service Calls</Label>
                  </div>
                )} />
                <FormField control={form.control} name="experienceInstallations" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="exp-install" />
                    <Label htmlFor="exp-install">Installations</Label>
                  </div>
                )} />
                <FormField control={form.control} name="experienceBoth" render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} id="exp-both" />
                    <Label htmlFor="exp-both">Both</Label>
                  </div>
                )} />
              </div>
            </div>
            <FormField control={form.control} name="ownHandTools" render={({ field }) => (
              <FormItem>
                <FormLabel>Own Hand Tools?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="tools-yes" /><Label htmlFor="tools-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="tools-no" /><Label htmlFor="tools-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="toolkitDescription" render={({ field }) => (
              <FormItem>
                <FormLabel>If Yes, Describe Toolkit:</FormLabel>
                <FormControl><Input placeholder="e.g., basic hand tools, multimeter, gauges, etc." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="strongestTechnicalSkill" render={({ field }) => (
              <FormItem>
                <FormLabel>Strongest Technical Skill:</FormLabel>
                <FormControl><Input placeholder="e.g., diagnostics, refrigerant handling, electrical, etc." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          <SectionCard title="Practical Requirements">
            <FormField control={form.control} name="comfortableAtticsCrawlSpaces" render={({ field }) => (
              <FormItem>
                <FormLabel>Comfortable Working in Attics/Crawl Spaces/Roofs?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="attic-yes" /><Label htmlFor="attic-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="attic-no" /><Label htmlFor="attic-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="canLift75lbs" render={({ field }) => (
              <FormItem>
                <FormLabel>Can Lift/Carry 75 lbs Regularly?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="lift-yes" /><Label htmlFor="lift-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="lift-no" /><Label htmlFor="lift-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="availableOnCall" render={({ field }) => (
              <FormItem>
                <FormLabel>Available for Standard Hours + On-Call Rotation?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="oncall-yes" /><Label htmlFor="oncall-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="oncall-no" /><Label htmlFor="oncall-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          <SectionCard title="Availability & Background">
            <FormField control={form.control} name="howHeardAboutUs" render={({ field }) => (
              <FormItem>
                <FormLabel>How Did You Hear About Us?</FormLabel>
                <FormControl><Input placeholder="e.g., Indeed, referral, saw truck, etc." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="currentlyEmployed" render={({ field }) => (
              <FormItem>
                <FormLabel>Currently Employed?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="employed-yes" /><Label htmlFor="employed-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="employed-no" /><Label htmlFor="employed-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="noticePeriod" render={({ field }) => (
              <FormItem>
                <FormLabel>If Yes, Notice Period Needed:</FormLabel>
                <FormControl><Input placeholder="e.g., 2 weeks, immediate, etc." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="desiredStartDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Desired Start Date:</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="salaryExpectation" render={({ field }) => (
              <FormItem>
                <FormLabel>Salary/Hourly Expectations:</FormLabel>
                <FormControl><Input placeholder="e.g., $25/hour, $50k/year, negotiable" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="safetyViolations" render={({ field }) => (
              <FormItem>
                <FormLabel>Any Safety Violations or License Suspensions?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="safety-yes" /><Label htmlFor="safety-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="safety-no" /><Label htmlFor="safety-no">No</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="safetyViolationsExplain" render={({ field }) => (
              <FormItem>
                <FormLabel>If Yes, Explain:</FormLabel>
                <FormControl><Textarea placeholder="" className="min-h-[80px]" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          <SectionCard title="Why They're Looking">
            <FormField control={form.control} name="reasonForLeaving" render={({ field }) => (
              <FormItem>
                <FormLabel>Reason for Leaving Current/Last Position:</FormLabel>
                <FormControl><Textarea placeholder="" className="min-h-[100px]" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          <SectionCard title="Your Impression (Kylie)">
            <FormField control={form.control} name="phoneManner" render={({ field }) => (
              <FormItem>
                <FormLabel>Overall Phone Manner:</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="professional" id="manner-prof" /><Label htmlFor="manner-prof">Professional</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="okay" id="manner-okay" /><Label htmlFor="manner-okay">Okay</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="concerning" id="manner-concern" /><Label htmlFor="manner-concern">Concerning</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="recommendMovingForward" render={({ field }) => (
              <FormItem>
                <FormLabel>Would You Recommend Moving Forward?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="rec-yes" /><Label htmlFor="rec-yes">Yes</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="rec-no" /><Label htmlFor="rec-no">No</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="unsure" id="rec-unsure" /><Label htmlFor="rec-unsure">Unsure</Label></div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="redFlagsNotes" render={({ field }) => (
              <FormItem>
                <FormLabel>Any Red Flags or Notes:</FormLabel>
                <FormControl><Textarea placeholder="" className="min-h-[100px]" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          <SectionCard title="Action Taken">
            <div className="flex flex-wrap gap-6">
              <FormField control={form.control} name="actionSentToErnest" render={({ field }) => (
                <div className="flex items-center space-x-2">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} id="action-sent" />
                  <Label htmlFor="action-sent">Sent to Ernest for Review</Label>
                </div>
              )} />
              <FormField control={form.control} name="actionDeclined" render={({ field }) => (
                <div className="flex items-center space-x-2">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} id="action-declined" />
                  <Label htmlFor="action-declined">Declined (Missing Requirements)</Label>
                </div>
              )} />
            </div>
          </SectionCard>

          <div className="flex flex-wrap gap-3 pt-4">
            <Button type="button" onClick={handlePrint} variant="outline" className="bg-blue-500 hover:bg-blue-600 text-white border-blue-500">
              Print Form
            </Button>
            <Button type="button" onClick={handleClear} variant="outline" className="bg-slate-500 hover:bg-slate-600 text-white border-slate-500">
              Clear Form
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-green-500 hover:bg-green-600 text-white flex-1 sm:flex-none">
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting ? "Preparing..." : "Save & Email to Ernest"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function WeatherImpactTab() {
  const [range, setRange] = useState("month");
  const { data, isLoading, error } = useQuery<WeatherImpactResponse>({
    queryKey: ["/api/phone/weather-impact", range],
    queryFn: async () => {
      const res = await fetch(`/api/phone/weather-impact?range=${range}`);
      if (!res.ok) throw new Error("Failed to fetch weather impact data");
      return res.json();
    },
  });

  const rangeOptions = [
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "6month", label: "6 Months" },
    { value: "year", label: "Year" },
  ];

  return (
    <div className="space-y-4">
      <WeatherWidget />
      <WeeklyForecast />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-auto h-8 px-3 text-xs border-0 bg-transparent hover:bg-muted/50 focus:ring-0 gap-1" data-testid="crm-phone-select-weather-range">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            {rangeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data?.updatedAt && (
          <span className="text-xs text-muted-foreground" data-testid="crm-phone-weather-impact-updated">
            Last Updated: {format(parseISO(data.updatedAt), "MMM d, yyyy h:mm a")}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading weather impact data...</div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-destructive">Failed to load weather impact data</div>
        </div>
      ) : !data?.data?.length ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">No weather impact data available for this range</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            <Card data-testid="crm-phone-chart-calls-temp">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Calls & Temperature Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={data.data.sort((a, b) => a.date.localeCompare(b.date))} 
                      margin={{ top: 10, right: 30, bottom: 20, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value) => format(parseISO(value), "M/d")}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        yAxisId="left"
                        tick={{ fontSize: 11 }}
                        label={{ value: "Calls", angle: -90, position: "insideLeft", fontSize: 11, fill: "#711419" }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        label={{ value: "Temp (°F)", angle: 90, position: "insideRight", fontSize: 11, fill: "#3b82f6" }}
                      />
                      <RechartsTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload?.length) {
                            return (
                              <div className="bg-popover border rounded-md p-2 text-xs shadow-md">
                                <p className="font-medium">{format(parseISO(label), "MMM d, yyyy")}</p>
                                {payload.map((p, i) => (
                                  <p key={i} style={{ color: p.color }}>
                                    {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
                                  </p>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="calls" 
                        name="Calls"
                        stroke="#711419" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="avgTempF" 
                        name="Avg Temp"
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="crm-phone-chart-weather-index">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Weather Index Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={data.data.sort((a, b) => a.date.localeCompare(b.date))} 
                      margin={{ top: 10, right: 30, bottom: 20, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value) => format(parseISO(value), "M/d")}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        yAxisId="left"
                        tick={{ fontSize: 11 }}
                        label={{ value: "Calls", angle: -90, position: "insideLeft", fontSize: 11, fill: "#711419" }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        label={{ value: "Index", angle: 90, position: "insideRight", fontSize: 11, fill: "#64748b" }}
                      />
                      <RechartsTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload?.length) {
                            return (
                              <div className="bg-popover border rounded-md p-2 text-xs shadow-md">
                                <p className="font-medium">{format(parseISO(label), "MMM d, yyyy")}</p>
                                {payload.map((p, i) => (
                                  <p key={i} style={{ color: p.color }}>
                                    {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
                                  </p>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="calls" 
                        name="Calls"
                        stroke="#711419" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="hotIndex" 
                        name="Hot Index (CDD)"
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="coldIndex" 
                        name="Cold Index (HDD)"
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground text-center" data-testid="crm-phone-weather-impact-note">
            Hot Index (CDD) = Cooling Degree Days above 65°F, Cold Index (HDD) = Heating Degree Days below 65°F
          </p>
        </>
      )}
    </div>
  );
}

function WeatherWidget() {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { data: weather, isLoading, error } = useQuery<WeatherData>({
    queryKey: ["/api/weather"],
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mb-2 py-2 px-3 bg-muted/20 dark:bg-muted/10 rounded-md border border-border/50 flex items-center gap-2" data-testid="crm-phone-weather-loading">
        <div className="w-5 h-5 rounded-full bg-muted animate-pulse" />
        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
        <div className="h-3 w-24 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error || !weather?.forecast?.properties?.periods?.length) {
    return (
      <div className="mb-2 py-2 px-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-md border border-amber-200/50 dark:border-amber-800/50 flex items-center gap-2 text-amber-700 dark:text-amber-400" data-testid="crm-phone-weather-unavailable">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-xs">Weather unavailable</span>
      </div>
    );
  }

  const periods = weather.forecast.properties.periods;
  const currentPeriod = periods[0];
  const activeAlerts = weather.alerts?.features || [];

  let highTemp: number | null = null;
  let lowTemp: number | null = null;
  
  for (let i = 0; i < Math.min(4, periods.length); i++) {
    const period = periods[i];
    if (period.isDaytime && highTemp === null) {
      highTemp = period.temperature;
    } else if (!period.isDaytime && lowTemp === null) {
      lowTemp = period.temperature;
    }
    if (highTemp !== null && lowTemp !== null) break;
  }

  return (
    <div className="mb-2" data-testid="crm-phone-weather-widget">
      {activeAlerts.length > 0 && (
        <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full mb-1 py-1.5 px-2 bg-red-100/80 dark:bg-red-950/40 border border-red-200/50 dark:border-red-800/50 rounded-md flex items-center gap-2 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors" data-testid="crm-phone-weather-alerts-toggle">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="text-xs font-medium flex-1 text-left truncate">{activeAlerts.length} weather alert{activeAlerts.length > 1 ? "s" : ""}</span>
              {alertsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mb-1 p-2 bg-red-50/50 dark:bg-red-950/20 border border-red-200/30 dark:border-red-800/30 rounded-md space-y-1" data-testid="crm-phone-weather-alerts">
              {activeAlerts.slice(0, 2).map((alert, idx) => (
                <div key={idx} className="text-red-700 dark:text-red-400 text-xs">
                  {alert.properties.headline}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      <div className="flex items-center gap-4 py-3 px-4 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 rounded-lg border border-blue-100 dark:border-blue-900/50 shadow-sm" data-testid="crm-phone-weather-current">
        <div className="flex-shrink-0">
          {getWeatherIcon(currentPeriod.shortForecast, currentPeriod.isDaytime, "md")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground" data-testid="crm-phone-weather-temperature">
              {currentPeriod.temperature}°
            </span>
            <span className="text-sm text-muted-foreground">{currentPeriod.name}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {highTemp !== null && (
              <span className="text-red-600 dark:text-red-400 font-medium" data-testid="crm-phone-weather-high">
                H: {highTemp}°
              </span>
            )}
            {lowTemp !== null && (
              <span className="text-blue-600 dark:text-blue-400 font-medium" data-testid="crm-phone-weather-low">
                L: {lowTemp}°
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid="crm-phone-weather-short-forecast">
            {currentPeriod.shortForecast}
          </p>
        </div>
        <div className="flex flex-col items-end text-xs text-muted-foreground flex-shrink-0">
          <div className="flex items-center gap-1">
            <Wind className="h-3.5 w-3.5" />
            <span>{currentPeriod.windSpeed}</span>
          </div>
          <span className="text-[10px]">{currentPeriod.windDirection}</span>
        </div>
      </div>
    </div>
  );
}

function CrmPhoneContent() {
  const [activeTab, setActiveTab] = useState("call-logs");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" data-testid="crm-phone-page-title">Phone</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
          <TabsTrigger value="call-logs" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" data-testid="crm-phone-tab-call-logs">
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Call Logs
          </TabsTrigger>
          <TabsTrigger value="voicemails" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" data-testid="crm-phone-tab-voicemails">
            <Phone className="h-3.5 w-3.5 mr-1.5" />
            Voicemails
          </TabsTrigger>
          <TabsTrigger value="screening" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" data-testid="crm-phone-tab-screening">
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
            Screening
          </TabsTrigger>
          <TabsTrigger value="calendar" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" data-testid="crm-phone-tab-calendar">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="weather" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none" data-testid="crm-phone-tab-weather">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Weather
          </TabsTrigger>
        </TabsList>

        <TabsContent value="voicemails" className="mt-0">
          <VoicemailsKanban />
        </TabsContent>

        <TabsContent value="call-logs" className="mt-0">
          <DailyCallLog />
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <YearlyCalendarTab />
        </TabsContent>

        <TabsContent value="screening" className="mt-0">
          <PhoneScreeningForm />
        </TabsContent>

        <TabsContent value="weather" className="mt-0">
          <WeatherImpactTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function CrmPhonePage() {
  usePageTitle("Phone");
  const { data: currentUser, isLoading: userLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser} flush disableScroll>
      <div className="flex h-full min-h-0 flex-col">
        <CommsSwitcher active="phone" />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5 lg:py-5">
          <CrmPhoneContent />
        </div>
      </div>
    </CrmLayout>
  );
}
