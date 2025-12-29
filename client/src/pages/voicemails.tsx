import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, GripVertical, Phone, Calendar, Play, Pause, RefreshCw, ChevronDown, ChevronRight, Plus, Search, Edit2, Trash2, X, Check, User, Cloud, Sun, CloudRain, CloudSnow, Wind, Thermometer, AlertTriangle, BarChart3 } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import MobileNav from "@/components/mobile-nav";
import redlogo from "@assets/redlogo.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { Voicemail, CallLog } from "@shared/schema";

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
        data-testid="voicemail-kanban-board"
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
      data-testid={`card-voicemail-${voicemail.id}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            className="flex-shrink-0 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid={`voicemail-drag-handle-${voicemail.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" data-testid={`text-voicemail-title-${voicemail.id}`}>
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
                  data-testid={`button-play-voicemail-${voicemail.id}`}
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
            <CardTitle className="text-sm font-semibold truncate" data-testid={`voicemail-column-title-${status}`}>
              {statusLabels[status]}
            </CardTitle>
            <Badge variant="outline" className="ml-2 flex-shrink-0" data-testid={`voicemail-column-count-${status}`}>
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
                <div className="text-center text-sm text-muted-foreground py-8" data-testid={`voicemail-column-empty-${status}`}>
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
  description: z.string().min(1, "Description is required"),
  phone: z.string().optional(),
  tag: z.string().optional(),
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
  const createdAt = log.createdAt ? (typeof log.createdAt === "string" ? parseISO(log.createdAt) : log.createdAt) : new Date();
  const relativeTime = formatDistanceToNow(createdAt, { addSuffix: true });
  const exactTime = format(createdAt, "MMM d, yyyy 'at' h:mm a");

  const tagBorderColors: Record<string, string> = {
    Service: "border-l-blue-500",
    Install: "border-l-green-500",
    Sales: "border-l-purple-500",
    Other: "border-l-gray-400",
  };

  const tagBadgeColors: Record<string, string> = {
    Service: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    Install: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    Sales: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    Other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
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
      data-testid={`call-log-entry-${log.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm">{log.clientName}</span>
            {log.phone && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <Phone className="h-2.5 w-2.5" />
                {log.phone}
              </span>
            )}
            {log.tag && (
              <Badge variant="secondary" className={cn("text-[10px] h-4 px-1", tagBadgeColors[log.tag] || "")}>
                {log.tag}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{log.description}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground/60 cursor-default">{relativeTime}</span>
            </TooltipTrigger>
            <TooltipContent>{exactTime}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onEdit(log)}
            data-testid={`button-edit-log-${log.id}`}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" data-testid={`button-delete-log-${log.id}`}>
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
    },
  });

  useEffect(() => {
    if (editingLog) {
      form.reset({
        clientName: editingLog.clientName || "",
        description: editingLog.description || "",
        phone: editingLog.phone || "",
        tag: editingLog.tag || "",
      });
    } else {
      form.reset({
        clientName: "",
        description: "",
        phone: "",
        tag: "",
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
                  <Input placeholder="Enter client name" {...field} data-testid="input-client-name" />
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
                  <Input placeholder="Phone number (optional)" {...field} data-testid="input-phone" />
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
              <FormLabel>Description *</FormLabel>
              <FormControl>
                <Textarea placeholder="What was the call about?" className="min-h-[60px]" {...field} data-testid="input-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center gap-3">
          <FormField
            control={form.control}
            name="tag"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Tag</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-tag">
                      <SelectValue placeholder="Select a tag" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Service">Service</SelectItem>
                    <SelectItem value="Install">Install</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-center gap-2 pt-6">
            {onCancel && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel} data-testid="button-cancel-form">
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={isPending} data-testid="button-submit-form">
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
}

function DateCard({ date, count, isExpanded, onToggle, highlightedLogId, entryRefs, cardRef }: DateCardProps) {
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
    <div ref={cardRef} data-testid={`date-card-${date}`}>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <div className="border-b border-border/50 dark:border-border/30">
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
          <CollapsibleContent>
            <div className="py-2 px-1 space-y-2">
              {!showForm && !editingLog && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => setShowForm(true)}
                  data-testid="button-add-entry"
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

interface WeeklyStatsProps {
  days: { id: string; date: string; count: number }[];
}

function WeeklyStats({ days }: WeeklyStatsProps) {
  const weeklyData = useMemo(() => {
    const today = startOfDay(new Date());
    const last7Days: { date: string; dayName: string; count: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
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
    <div className="flex items-center gap-1.5 mb-3 py-2 px-3 bg-muted/20 dark:bg-muted/10 rounded-md border border-border/50" data-testid="weekly-stats">
      {weeklyData.last7Days.map((day) => {
        const isToday = day.date === format(new Date(), "yyyy-MM-dd");
        return (
          <div
            key={day.date}
            className={cn(
              "flex flex-col items-center justify-center rounded-md px-1.5 py-1 min-w-[32px]",
              isToday ? "bg-primary text-primary-foreground" : "bg-muted/50 dark:bg-muted/30"
            )}
            data-testid={`weekly-stat-${day.date}`}
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
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (days.length > 0 && expandedDays.size === 0) {
      setExpandedDays(new Set([days[0].date]));
    }
  }, [days]);

  const toggleDay = useCallback((date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setShowSearchResults(false);
    setSearchQuery("");

    setExpandedDays((prev) => {
      const next = new Set(prev);
      next.add(result.date);
      return next;
    });

    setHighlightedLogId(result.id);

    setTimeout(() => {
      const cardEl = cardRefs.current[result.date];
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      setTimeout(() => {
        const entryEl = entryRefs.current[result.id];
        if (entryEl) {
          entryEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);

      setTimeout(() => {
        setHighlightedLogId(null);
      }, 3000);
    }, 100);
  }, []);

  const todayDate = new Date().toISOString().split("T")[0];
  const hasTodayCard = days.some((d) => d.date === todayDate);

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
      setExpandedDays((prev) => new Set([...prev, todayDate]));
    },
  });

  return (
    <div className="space-y-2">
      <WeeklyStats days={days} />

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
            data-testid="input-search-calls"
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
                      data-testid={`search-result-${result.id}`}
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

      {!hasTodayCard && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setExpandedDays((prev) => new Set([...prev, todayDate]));
            if (!hasTodayCard) {
              createTodayMutation.mutate();
            }
          }}
          disabled={createTodayMutation.isPending}
          data-testid="button-create-today"
        >
          <Plus className="h-4 w-4 mr-2" />
          {createTodayMutation.isPending ? "Creating..." : "Start Today's Log"}
        </Button>
      )}

      {isDaysLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading call logs...</div>
      ) : days.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No call logs yet</p>
          <p className="text-sm">Start by creating today's log</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="space-y-0 pr-4">
            {days.map((day) => (
              <DateCard
                key={day.date}
                date={day.date}
                count={day.count}
                isExpanded={expandedDays.has(day.date)}
                onToggle={() => toggleDay(day.date)}
                highlightedLogId={highlightedLogId}
                entryRefs={entryRefs}
                cardRef={(el) => { cardRefs.current[day.date] = el; }}
              />
            ))}
          </div>
        </ScrollArea>
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
          data-testid="button-sync-voicemails"
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
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-voicemail-details">
          <DialogHeader>
            <DialogTitle data-testid="dialog-voicemail-title">
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
                  data-testid="dialog-voicemail-status"
                >
                  {selectedVoicemail.status || "NEW"}
                </Badge>
              </div>

              {selectedVoicemail.caller && (
                <div className="flex items-center gap-2 text-sm" data-testid="dialog-voicemail-caller">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{selectedVoicemail.caller}</span>
                </div>
              )}

              {selectedVoicemail.receivedAt && (
                <div className="flex items-center gap-2 text-sm" data-testid="dialog-voicemail-date">
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
                    data-testid="dialog-button-play-voicemail"
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
                    <p className="text-sm whitespace-pre-wrap" data-testid="dialog-voicemail-description">
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
  
  // Group periods by day to get high/low for each day
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
    <div className="mb-4 grid grid-cols-7 gap-1 py-3 px-3 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 rounded-lg border border-blue-100 dark:border-blue-900/50" data-testid="weather-weekly">
      {dailyForecasts.slice(0, 7).map((day, idx) => (
        <div key={idx} className="flex flex-col items-center text-center py-1" data-testid={`weather-day-${idx}`}>
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
      <WeeklyForecast />
      
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px]" data-testid="select-weather-range">
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
          <span className="text-xs text-muted-foreground" data-testid="weather-impact-updated">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="chart-hot-index">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Hot Index vs Calls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        type="number" 
                        dataKey="hotIndex" 
                        name="Hot Index (CDD)" 
                        tick={{ fontSize: 12 }}
                        label={{ value: "CDD", position: "bottom", fontSize: 12 }}
                      />
                      <YAxis 
                        type="number" 
                        dataKey="calls" 
                        name="Calls" 
                        tick={{ fontSize: 12 }}
                        label={{ value: "Calls", angle: -90, position: "left", fontSize: 12 }}
                      />
                      <RechartsTooltip 
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (active && payload?.length) {
                            const point = payload[0].payload as WeatherImpactDataPoint;
                            return (
                              <div className="bg-popover border rounded-md p-2 text-xs shadow-md">
                                <p className="font-medium">{point.date}</p>
                                <p>Calls: {point.calls}</p>
                                <p>Hot Index: {point.hotIndex.toFixed(1)}</p>
                                <p>Avg Temp: {point.avgTempF.toFixed(1)}°F</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter 
                        data={data.data.filter(d => d.hotIndex > 0)} 
                        fill="#ef4444" 
                        fillOpacity={0.6}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="chart-cold-index">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Cold Index vs Calls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        type="number" 
                        dataKey="coldIndex" 
                        name="Cold Index (HDD)" 
                        tick={{ fontSize: 12 }}
                        label={{ value: "HDD", position: "bottom", fontSize: 12 }}
                      />
                      <YAxis 
                        type="number" 
                        dataKey="calls" 
                        name="Calls" 
                        tick={{ fontSize: 12 }}
                        label={{ value: "Calls", angle: -90, position: "left", fontSize: 12 }}
                      />
                      <RechartsTooltip 
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (active && payload?.length) {
                            const point = payload[0].payload as WeatherImpactDataPoint;
                            return (
                              <div className="bg-popover border rounded-md p-2 text-xs shadow-md">
                                <p className="font-medium">{point.date}</p>
                                <p>Calls: {point.calls}</p>
                                <p>Cold Index: {point.coldIndex.toFixed(1)}</p>
                                <p>Avg Temp: {point.avgTempF.toFixed(1)}°F</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter 
                        data={data.data.filter(d => d.coldIndex > 0)} 
                        fill="#3b82f6" 
                        fillOpacity={0.6}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground text-center" data-testid="weather-impact-note">
            Hot Index = CDD base 65°F, Cold Index = HDD base 65°F
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
      <div className="mb-2 py-2 px-3 bg-muted/20 dark:bg-muted/10 rounded-md border border-border/50 flex items-center gap-2" data-testid="weather-loading">
        <div className="w-5 h-5 rounded-full bg-muted animate-pulse" />
        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
        <div className="h-3 w-24 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error || !weather?.forecast?.properties?.periods?.length) {
    return (
      <div className="mb-2 py-2 px-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-md border border-amber-200/50 dark:border-amber-800/50 flex items-center gap-2 text-amber-700 dark:text-amber-400" data-testid="weather-unavailable">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-xs">Weather unavailable</span>
      </div>
    );
  }

  const periods = weather.forecast.properties.periods;
  const currentPeriod = periods[0];
  const activeAlerts = weather.alerts?.features || [];

  // Find today's high and low from forecast periods
  // NWS returns alternating day/night periods
  let highTemp: number | null = null;
  let lowTemp: number | null = null;
  
  // Look at first 2-4 periods to find today's high and tonight's low
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
    <div className="mb-2" data-testid="weather-widget">
      {activeAlerts.length > 0 && (
        <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full mb-1 py-1.5 px-2 bg-red-100/80 dark:bg-red-950/40 border border-red-200/50 dark:border-red-800/50 rounded-md flex items-center gap-2 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors" data-testid="weather-alerts-toggle">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="text-xs font-medium flex-1 text-left truncate">{activeAlerts.length} weather alert{activeAlerts.length > 1 ? "s" : ""}</span>
              {alertsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mb-1 p-2 bg-red-50/50 dark:bg-red-950/20 border border-red-200/30 dark:border-red-800/30 rounded-md space-y-1" data-testid="weather-alerts">
              {activeAlerts.slice(0, 2).map((alert, idx) => (
                <div key={idx} className="text-red-700 dark:text-red-400 text-xs">
                  {alert.properties.headline}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      <div className="flex items-center gap-4 py-3 px-4 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 rounded-lg border border-blue-100 dark:border-blue-900/50 shadow-sm" data-testid="weather-current">
        <div className="flex-shrink-0">
          {getWeatherIcon(currentPeriod.shortForecast, currentPeriod.isDaytime, "md")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground" data-testid="weather-temperature">
              {currentPeriod.temperature}°
            </span>
            <span className="text-sm text-muted-foreground">{currentPeriod.name}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {highTemp !== null && (
              <span className="text-red-600 dark:text-red-400 font-medium" data-testid="weather-high">
                H: {highTemp}°
              </span>
            )}
            {lowTemp !== null && (
              <span className="text-blue-600 dark:text-blue-400 font-medium" data-testid="weather-low">
                L: {lowTemp}°
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid="weather-short-forecast">
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

export default function Voicemails() {
  const [activeTab, setActiveTab] = useState("call-logs");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <MobileNav />
            <Link href="/">
              <Button variant="ghost" size="icon" className="flex-shrink-0 min-h-[44px] min-w-[44px]" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <span className="text-sm sm:text-base font-semibold truncate">Phone</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="p-2 sm:p-3">
        <WeatherWidget />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-2 h-8">
            <TabsTrigger value="call-logs" className="text-xs" data-testid="tab-call-logs">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Call Logs
            </TabsTrigger>
            <TabsTrigger value="voicemails" className="text-xs" data-testid="tab-voicemails">
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              Voicemails
            </TabsTrigger>
            <TabsTrigger value="weather" className="text-xs" data-testid="tab-weather">
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

          <TabsContent value="weather" className="mt-0">
            <WeatherImpactTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
