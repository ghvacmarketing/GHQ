import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  User,
  Clock,
  MapPin,
  ExternalLink,
  UserX,
  XCircle,
  Loader2,
  Info,
  FileText,
  CheckSquare,
  Package,
  Search,
  Plus,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Timer,
  Wrench,
  Phone,
  Clipboard,
  ClipboardCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { format, formatDistanceToNow } from "date-fns";
import { createLocalDateTime, formatLocal, formatLocalDateTime, getLocalStartOfDay, getLocalEndOfDay, getLocalDateString, getTodayLocalDateString, APP_TIMEZONE } from "@/lib/timezone";
import { formatInTimeZone } from "date-fns-tz";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmWorkOrder, CrmJob, CrmCustomer, CrmProperty, CrmProject, WorkOrderStatus, ChecklistQuestion } from "@shared/schema";
import { workOrderVisitTypeEnum, type WorkOrderVisitType, type WorkSubtype, dispatchQueueStageEnum, type DispatchQueueStage, type WorkOrderSubtype } from "@shared/schema";

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
};

type CustomerWithInfo = {
  id: string;
  name: string;
  customerType: string;
  fullAddress: string | null;
};

type CustomersResponse = {
  customers: CustomerWithInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const visitTypeLabels: Record<string, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  MAINTENANCE: "Maintenance",
  SALES: "Sales",
};

const queueStageLabels: Record<DispatchQueueStage, string> = {
  NeedsScheduling: "Needs Scheduling",
  ReadyToDispatch: "Ready to Dispatch",
  WaitingOnParts: "Waiting on Parts",
  NeedsApproval: "Needs Approval",
  OnHold: "On Hold",
  CallbackPriority: "Callback/Priority",
  PartsNeeded: "Parts Needed",
  PartsOrdered: "Parts Ordered",
  PartsArrived: "Parts Arrived",
  Scheduled: "Scheduled",
};

const queueStageColors: Record<DispatchQueueStage, { bg: string; border: string; text: string; badge: string }> = {
  NeedsScheduling: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", badge: "bg-slate-500" },
  ReadyToDispatch: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-500" },
  WaitingOnParts: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-500" },
  NeedsApproval: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", badge: "bg-purple-500" },
  OnHold: { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-700", badge: "bg-gray-500" },
  CallbackPriority: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-500" },
  PartsNeeded: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-500" },
  PartsOrdered: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", badge: "bg-yellow-500" },
  PartsArrived: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-500" },
  Scheduled: { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", badge: "bg-cyan-500" },
};

import {
  DndContext,
  DragOverlay,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  useDraggable,
  Modifier,
} from "@dnd-kit/core";

type FilterStatus = "all" | "scheduled" | "dispatched" | "en_route" | "on_site" | "completed";

interface DispatchWorkOrder extends CrmWorkOrder {
  job: CrmJob | null;
  customer: CrmCustomer | null;
  tech: CrmUser | null;
  customerName: string;
  customerPhone: string | null;
  propertyAddress: string | null;
  jobType: string;
  priority: string | null;
  description: string | null;
  techName: string | null;
}

interface Technician {
  id: string;
  name: string;
  initials: string;
  color: string;
}

const techColors = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-teal-600",
];

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

const START_HOUR = 8;
const END_HOUR = 20;
const STEP_MINUTES = 30;
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / STEP_MINUTES;

function formatHour(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

function formatDecimalHour(decimalHour: number): string {
  const hours = Math.floor(decimalHour);
  const minutes = Math.round((decimalHour % 1) * 60);
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours >= 12 ? "pm" : "am";
  if (minutes === 0) {
    return `${displayHour}${ampm}`;
  }
  return `${displayHour}:${minutes.toString().padStart(2, "0")}${ampm}`;
}

// Create hour labels for 8am through 8pm (13 labels total)
const hourLabels = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => ({
  hour: START_HOUR + i,
  label: formatHour(START_HOUR + i),
}));

const timeSlots = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
  const totalMinutes = START_HOUR * 60 + i * STEP_MINUTES;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return {
    hour,
    minute,
    label: minute === 0 ? formatHour(hour) : null,
    isHourMark: minute === 0,
    timeValue: hour + minute / 60,
  };
});

const SLOT_WIDTH = 60;
const TIMELINE_WIDTH = TOTAL_SLOTS * SLOT_WIDTH;

const snapToGridModifier: Modifier = ({ transform }) => {
  return {
    ...transform,
    x: Math.round(transform.x / SLOT_WIDTH) * SLOT_WIDTH,
    y: transform.y,
  };
};

const createRestrictToContainerModifier = (containerRef: React.RefObject<HTMLDivElement | null>): Modifier => {
  return ({ transform, draggingNodeRect }) => {
    if (!containerRef.current || !draggingNodeRect) {
      return transform;
    }
    
    const containerRect = containerRef.current.getBoundingClientRect();
    
    const minY = containerRect.top - draggingNodeRect.top;
    const maxY = containerRect.bottom - draggingNodeRect.bottom;
    
    return {
      ...transform,
      y: Math.min(Math.max(transform.y, minY), maxY),
    };
  };
};

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  scheduled: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  dispatched: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  en_route: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  on_site: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  completed: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  cancelled: { bg: "bg-red-50", border: "border-red-200", text: "text-red-500" },
};

const jobTypeColors: Record<string, { bg: string; border: string; text: string }> = {
  SERVICE: { bg: "bg-sky-100", border: "border-sky-200", text: "text-sky-900" },
  MAINTENANCE: { bg: "bg-emerald-100", border: "border-emerald-200", text: "text-emerald-900" },
  INSTALL: { bg: "bg-amber-100", border: "border-amber-200", text: "text-amber-900" },
  SALES: { bg: "bg-rose-100", border: "border-rose-200", text: "text-rose-900" },
};

const statusStripeColors: Record<string, string> = {
  scheduled: "border-l-blue-500",
  dispatched: "border-l-purple-500",
  en_route: "border-l-amber-500",
  on_site: "border-l-orange-500",
  completed: "border-l-green-500",
  cancelled: "border-l-red-500",
};

const priorityBadgeColors: Record<string, { bg: string; text: string; border: string }> = {
  urgent: { bg: "bg-red-500", text: "text-white", border: "border-red-600" },
  high: { bg: "bg-orange-500", text: "text-white", border: "border-orange-600" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  low: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300" },
};

function getJobTypeColor(jobType: string | null | undefined): { bg: string; border: string; text: string } {
  if (!jobType) return jobTypeColors.SERVICE;
  const upperType = jobType.toUpperCase();
  if (upperType.includes("SERVICE")) return jobTypeColors.SERVICE;
  if (upperType.includes("MAINTENANCE")) return jobTypeColors.MAINTENANCE;
  if (upperType.includes("INSTALL")) return jobTypeColors.INSTALL;
  if (upperType.includes("SALES")) return jobTypeColors.SALES;
  return jobTypeColors.SERVICE;
}

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "Traveling",
  on_site: "Working",
  completed: "Completed",
  cancelled: "Cancelled",
};

function timeToSlotIndex(decimalHour: number): number {
  const clampedHour = Math.max(START_HOUR, Math.min(END_HOUR, decimalHour));
  return Math.round((clampedHour - START_HOUR) * (60 / STEP_MINUTES));
}

function slotIndexToTime(slotIndex: number): number {
  return START_HOUR + (slotIndex * STEP_MINUTES) / 60;
}

function getWorkOrderDisplayTimes(workOrder: DispatchWorkOrder): { startHour: number; endHour: number; startSlot: number; endSlot: number } {
  if (!workOrder.scheduledStart || !workOrder.scheduledEnd) {
    return { startHour: START_HOUR, endHour: START_HOUR + 1, startSlot: 0, endSlot: 2 };
  }
  const start = new Date(workOrder.scheduledStart);
  const end = new Date(workOrder.scheduledEnd);
  const startHour = Math.max(START_HOUR, Math.min(END_HOUR, start.getHours() + start.getMinutes() / 60));
  const endHour = Math.max(START_HOUR, Math.min(END_HOUR, end.getHours() + end.getMinutes() / 60));
  const startSlot = timeToSlotIndex(startHour);
  const endSlot = timeToSlotIndex(endHour);
  return { 
    startHour, 
    endHour: endHour > startHour ? endHour : startHour + 0.5, 
    startSlot, 
    endSlot: endSlot > startSlot ? endSlot : startSlot + 1 
  };
}

function getEffectiveQueueStage(workOrder: DispatchWorkOrder): DispatchQueueStage {
  if (workOrder.dispatchQueueStage) {
    return workOrder.dispatchQueueStage as DispatchQueueStage;
  }
  if (!workOrder.scheduledStart) {
    return "NeedsScheduling";
  }
  if (!workOrder.assignedTechId) {
    return "ReadyToDispatch";
  }
  return "NeedsScheduling";
}

function checkSchedulingConflict(
  workOrders: DispatchWorkOrder[],
  techId: string,
  newStart: Date,
  newEnd: Date,
  excludeWorkOrderId?: string
): DispatchWorkOrder | null {
  for (const wo of workOrders) {
    if (wo.id === excludeWorkOrderId) continue;
    if (wo.assignedTechId !== techId) continue;
    if (!wo.scheduledStart || !wo.scheduledEnd) continue;
    if (["cancelled", "completed"].includes(wo.status)) continue;
    
    const existingStart = new Date(wo.scheduledStart);
    const existingEnd = new Date(wo.scheduledEnd);
    
    if (existingStart < newEnd && existingEnd > newStart) {
      return wo;
    }
  }
  return null;
}

interface DraggableQueueCardProps {
  workOrder: DispatchWorkOrder;
  onClick?: (workOrderId: string) => void;
  technicians?: Technician[];
  onQuickAssign?: (workOrderId: string, techId: string) => void;
  onQuickSchedule?: (workOrderId: string, date: Date, startTime: string, endTime: string) => void;
  onQuickStageChange?: (workOrderId: string, stage: DispatchQueueStage) => void;
  onQuickNote?: (workOrderId: string, note: string) => void;
  selectedDate?: Date;
}

function DraggableQueueCard({ 
  workOrder, 
  onClick, 
  technicians = [],
  onQuickAssign,
  onQuickSchedule,
  onQuickStageChange,
  onQuickNote,
  selectedDate = new Date(),
}: DraggableQueueCardProps) {
  const priorityStyle = priorityBadgeColors[workOrder.priority || "normal"] || priorityBadgeColors.normal;
  const visitTypeColor = getJobTypeColor(workOrder.visitType || workOrder.jobType);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(selectedDate);
  const [scheduleStart, setScheduleStart] = useState("08:00");
  const [scheduleEnd, setScheduleEnd] = useState("09:00");
  
  // Disable dragging for work orders where tech is on site
  const isLocked = workOrder.status === "on_site";
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `queue-${workOrder.id}`,
    data: { workOrder, fromQueue: true },
    disabled: isLocked,
  });

  const age = workOrder.createdAt ? formatDistanceToNow(new Date(workOrder.createdAt), { addSuffix: false }) : null;
  
  const scheduledWindow = workOrder.scheduledStart && workOrder.scheduledEnd
    ? `${format(new Date(workOrder.scheduledStart), "h:mm a")} - ${format(new Date(workOrder.scheduledEnd), "h:mm a")}`
    : null;

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: 1,
    zIndex: isDragging ? 1000 : undefined,
  };
  
  const handleScheduleSubmit = () => {
    if (scheduleDate && onQuickSchedule) {
      onQuickSchedule(workOrder.id, scheduleDate, scheduleStart, scheduleEnd);
      setScheduleOpen(false);
    }
  };
  
  const handleNoteSubmit = () => {
    if (quickNote.trim() && onQuickNote) {
      onQuickNote(workOrder.id, quickNote.trim());
      setQuickNote("");
      setNoteOpen(false);
    }
  };
  
  const quickTimeOptions = [
    { value: "08:00", label: "8:00 AM" },
    { value: "09:00", label: "9:00 AM" },
    { value: "10:00", label: "10:00 AM" },
    { value: "11:00", label: "11:00 AM" },
    { value: "12:00", label: "12:00 PM" },
    { value: "13:00", label: "1:00 PM" },
    { value: "14:00", label: "2:00 PM" },
    { value: "15:00", label: "3:00 PM" },
    { value: "16:00", label: "4:00 PM" },
    { value: "17:00", label: "5:00 PM" },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 bg-white border rounded-lg shadow-sm hover:shadow-md transition-all duration-150 ${isDragging ? 'z-50 shadow-xl cursor-grabbing ring-2 ring-[#711419]/50 scale-105' : ''}`}
      data-testid={`queue-card-${workOrder.id}`}
    >
      <div 
        className="cursor-grab"
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(workOrder.id);
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-slate-900 truncate">{workOrder.customerName}</p>
            {workOrder.propertyAddress && (
              <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {workOrder.propertyAddress}
              </p>
            )}
          </div>
          {workOrder.priority && workOrder.priority !== "normal" && (
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}>
              {workOrder.priority.toUpperCase()}
            </span>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className={`${visitTypeColor.bg} ${visitTypeColor.text} border-0 text-[10px]`}>
            {visitTypeLabels[workOrder.visitType || "SERVICE"] || workOrder.visitType}
          </Badge>
          
          {workOrder.workSubtype && workOrder.workSubtype !== "Other" && (
            <span className="text-slate-600">{workOrder.workSubtype}</span>
          )}
        </div>
        
        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
          {age && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {age} old
            </span>
          )}
          {scheduledWindow && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {scheduledWindow}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100">
        <Select onValueChange={(techId) => onQuickAssign?.(workOrder.id, techId)}>
          <SelectTrigger className="h-6 text-[10px] px-2 flex-1 min-w-0" data-testid={`quick-assign-${workOrder.id}`}>
            <User className="h-3 w-3 mr-1" />
            <span className="truncate">Assign</span>
          </SelectTrigger>
          <SelectContent>
            {technicians.map((tech) => (
              <SelectItem key={tech.id} value={tech.id} className="text-xs">{tech.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" data-testid={`quick-schedule-${workOrder.id}`}>
              <CalendarIcon className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Calendar
                  mode="single"
                  selected={scheduleDate}
                  onSelect={setScheduleDate}
                  className="rounded-md border"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Start</Label>
                  <Select value={scheduleStart} onValueChange={setScheduleStart}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {quickTimeOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End</Label>
                  <Select value={scheduleEnd} onValueChange={setScheduleEnd}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {quickTimeOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" className="w-full h-7 text-xs" onClick={handleScheduleSubmit}>
                Schedule
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        
        <Select onValueChange={(stage) => onQuickStageChange?.(workOrder.id, stage as DispatchQueueStage)}>
          <SelectTrigger className="h-6 text-[10px] px-2 w-auto" data-testid={`quick-status-${workOrder.id}`}>
            <AlertCircle className="h-3 w-3" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WaitingOnParts" className="text-xs">Waiting on Parts</SelectItem>
            <SelectItem value="NeedsApproval" className="text-xs">Needs Approval</SelectItem>
            <SelectItem value="OnHold" className="text-xs">On Hold</SelectItem>
            <SelectItem value="CallbackPriority" className="text-xs">Callback/Priority</SelectItem>
            <SelectItem value="ReadyToDispatch" className="text-xs">Ready to Dispatch</SelectItem>
          </SelectContent>
        </Select>
        
        <Popover open={noteOpen} onOpenChange={setNoteOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" data-testid={`quick-note-${workOrder.id}`}>
              <FileText className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div className="space-y-2">
              <Label className="text-xs">Quick Note</Label>
              <Textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                placeholder="Add a note..."
                className="min-h-[60px] text-xs"
              />
              <Button size="sm" className="w-full h-7 text-xs" onClick={handleNoteSubmit} disabled={!quickNote.trim()}>
                Add Note
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function QueueCardOverlay({ workOrder }: { workOrder: DispatchWorkOrder }) {
  const priorityStyle = priorityBadgeColors[workOrder.priority || "normal"] || priorityBadgeColors.normal;
  const visitTypeColor = getJobTypeColor(workOrder.visitType || workOrder.jobType);
  
  return (
    <div className="p-3 bg-white border rounded-lg shadow-lg cursor-grabbing w-64">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-slate-900 truncate">{workOrder.customerName}</p>
          {workOrder.propertyAddress && (
            <p className="text-xs text-slate-500 truncate">{workOrder.propertyAddress}</p>
          )}
        </div>
        {workOrder.priority && workOrder.priority !== "normal" && (
          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}>
            {workOrder.priority.toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className={`${visitTypeColor.bg} ${visitTypeColor.text} border-0 text-[10px]`}>
          {visitTypeLabels[workOrder.visitType || "SERVICE"] || workOrder.visitType}
        </Badge>
      </div>
    </div>
  );
}

interface QueueStageBoxProps {
  stage: DispatchQueueStage;
  workOrders: DispatchWorkOrder[];
  onWorkOrderClick?: (workOrderId: string) => void;
  technicians?: Technician[];
  onQuickAssign?: (workOrderId: string, techId: string) => void;
  onQuickSchedule?: (workOrderId: string, date: Date, startTime: string, endTime: string) => void;
  onQuickStageChange?: (workOrderId: string, stage: DispatchQueueStage) => void;
  onQuickNote?: (workOrderId: string, note: string) => void;
  selectedDate?: Date;
}

function QueueStageBox({ 
  stage, 
  workOrders, 
  onWorkOrderClick,
  technicians,
  onQuickAssign,
  onQuickSchedule,
  onQuickStageChange,
  onQuickNote,
  selectedDate,
}: QueueStageBoxProps) {
  const [isOpen, setIsOpen] = useState(true);
  const colors = queueStageColors[stage];
  const label = queueStageLabels[stage];
  
  if (workOrders.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`${colors.bg} ${colors.border} border`} data-testid={`queue-box-${stage}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-2 px-3 cursor-pointer hover:bg-black/5 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className={`text-sm font-medium ${colors.text}`}>{label}</CardTitle>
              </div>
              <Badge className={`${colors.badge} text-white text-xs`}>{workOrders.length}</Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {workOrders.map((wo) => (
                <DraggableQueueCard 
                  key={wo.id} 
                  workOrder={wo}
                  onClick={onWorkOrderClick}
                  technicians={technicians}
                  onQuickAssign={onQuickAssign}
                  onQuickSchedule={onQuickSchedule}
                  onQuickStageChange={onQuickStageChange}
                  onQuickNote={onQuickNote}
                  selectedDate={selectedDate}
                />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

const SCHEDULE_START_HOUR = 8;
const SCHEDULE_END_HOUR = 20;
const SCHEDULE_TOTAL_MINUTES = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 60;
const SCHEDULE_INTERVAL = 30;
const SCHEDULE_TIMELINE_WIDTH = TIMELINE_WIDTH;

function getScheduleLeftPercent(date: Date): number {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = (hours - SCHEDULE_START_HOUR) * 60 + minutes;
  return Math.max(0, Math.min(100, (totalMinutes / SCHEDULE_TOTAL_MINUTES) * 100));
}

function getScheduleWidthPercent(startDate: Date, endDate: Date | null): number {
  if (!endDate) return (60 / SCHEDULE_TOTAL_MINUTES) * 100;
  const durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
  const snappedDuration = Math.max(SCHEDULE_INTERVAL, Math.round(durationMinutes / SCHEDULE_INTERVAL) * SCHEDULE_INTERVAL);
  return (snappedDuration / SCHEDULE_TOTAL_MINUTES) * 100;
}

const scheduleVisitTypeColors: Record<string, string> = {
  SERVICE: "bg-blue-100",
  INSTALL: "bg-yellow-100",
  MAINTENANCE: "bg-green-100",
  SALES: "bg-pink-100",
};

const scheduleStatusStripes: Record<string, string> = {
  scheduled: "border-l-4 border-l-blue-500",
  dispatched: "border-l-4 border-l-purple-500",
  en_route: "border-l-4 border-l-amber-500",
  on_site: "border-l-4 border-l-orange-500",
  completed: "border-l-4 border-l-green-500",
  cancelled: "border-l-4 border-l-red-400",
};

const scheduleCardColors: Record<string, string> = {
  scheduled: "bg-blue-500",
  dispatched: "bg-purple-500",
  en_route: "bg-amber-500",
  on_site: "bg-orange-500",
  completed: "bg-green-500",
  cancelled: "bg-red-400",
};

const weekCardColors: Record<string, { bg: string; border: string }> = {
  scheduled: { bg: "bg-blue-100", border: "border-l-blue-500" },
  dispatched: { bg: "bg-purple-100", border: "border-l-purple-500" },
  en_route: { bg: "bg-amber-100", border: "border-l-amber-500" },
  on_site: { bg: "bg-orange-100", border: "border-l-orange-500" },
  completed: { bg: "bg-green-100", border: "border-l-green-500" },
  cancelled: { bg: "bg-red-100", border: "border-l-red-400" },
};

interface WeekDispatchBoardProps {
  technicians: Technician[];
  workOrders: DispatchWorkOrder[];
  weekDates: Date[];
  onWorkOrderClick?: (workOrderId: string) => void;
  onQuickAssign?: (workOrderId: string, techId: string) => void;
  onDayClick?: (date: Date) => void;
}

function WeekDispatchBoard({ technicians, workOrders, weekDates, onWorkOrderClick, onQuickAssign, onDayClick }: WeekDispatchBoardProps) {
  const { setNodeRef } = useDroppable({ id: "week-board" });
  
  const getWorkOrdersForTechAndDay = (techId: string, date: Date) => {
    const dateStr = getLocalDateString(date);
    return workOrders.filter(wo => {
      if (wo.assignedTechId !== techId) return false;
      if (!wo.scheduledStart) return false;
      const woDate = getLocalDateString(wo.scheduledStart);
      return woDate === dateStr;
    });
  };
  
  const getUnassignedForDay = (date: Date) => {
    const dateStr = getLocalDateString(date);
    return workOrders.filter(wo => {
      if (wo.assignedTechId) return false;
      if (!wo.scheduledStart) return false;
      const woDate = getLocalDateString(wo.scheduledStart);
      return woDate === dateStr;
    });
  };
  
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = getTodayLocalDateString();
  
  return (
    <Card className="bg-white border overflow-hidden" ref={setNodeRef}>
      <div className="overflow-x-auto overflow-y-auto max-h-full">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="w-40 px-3 py-2 text-left text-xs font-semibold text-slate-600 border-r border-slate-200 bg-slate-50 sticky left-0 z-20">
                Technicians
              </th>
              {weekDates.map((date, i) => {
                const dateStr = getLocalDateString(date);
                const isToday = dateStr === today;
                return (
                  <th 
                    key={i} 
                    className={`px-2 py-2 text-center text-xs font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100 ${isToday ? "bg-[#711419]/10 text-[#711419]" : "text-slate-600"}`}
                    onClick={() => onDayClick?.(date)}
                  >
                    <div>{dayNames[i]}</div>
                    <div className={`text-sm font-bold ${isToday ? "text-[#711419]" : "text-slate-800"}`}>
                      {date.getDate()}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {technicians.map((tech) => (
              <tr key={tech.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2 border-r border-slate-100 bg-white sticky left-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                      <User className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{tech.name}</p>
                    </div>
                  </div>
                </td>
                {weekDates.map((date, dayIdx) => {
                  const dayWOs = getWorkOrdersForTechAndDay(tech.id, date);
                  const dateStr = getLocalDateString(date);
                  const isToday = dateStr === today;
                  const totalHours = dayWOs.reduce((sum, wo) => {
                    if (!wo.scheduledStart || !wo.scheduledEnd) return sum;
                    const start = new Date(wo.scheduledStart);
                    const end = new Date(wo.scheduledEnd);
                    return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                  }, 0);
                  
                  return (
                    <td 
                      key={dayIdx} 
                      className={`px-1 py-1 border-r border-slate-100 align-top min-h-[80px] ${isToday ? "bg-[#711419]/5" : ""}`}
                      style={{ minHeight: 80, height: 80 }}
                    >
                      <DroppableWeekCell 
                        techId={tech.id} 
                        date={date}
                        onQuickAssign={onQuickAssign}
                      >
                        {dayWOs.length > 0 ? (
                          <div className="space-y-1">
                            {dayWOs.slice(0, 3).map((wo) => {
                              const colors = weekCardColors[wo.status] || weekCardColors.scheduled;
                              const startTime = wo.scheduledStart ? format(new Date(wo.scheduledStart), "h:mma").toLowerCase() : "";
                              return (
                                <div
                                  key={wo.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onWorkOrderClick?.(wo.id);
                                  }}
                                  className={`${colors.bg} ${colors.border} border-l-2 rounded-r px-1.5 py-0.5 cursor-pointer hover:opacity-80 text-[10px]`}
                                  data-testid={`week-card-${wo.id}`}
                                >
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium text-slate-600">{startTime}</span>
                                    <span className="truncate text-slate-700">{wo.customerName}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {dayWOs.length > 3 && (
                              <div className="text-[10px] text-slate-500 px-1">
                                +{dayWOs.length - 3} more
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full min-h-[60px] flex items-center justify-center">
                            <span className="text-[10px] text-slate-300">—</span>
                          </div>
                        )}
                        {totalHours > 0 && (
                          <div className="text-[9px] text-slate-400 mt-1 text-right">
                            {totalHours.toFixed(1)}h
                          </div>
                        )}
                      </DroppableWeekCell>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface DroppableWeekCellProps {
  techId: string;
  date: Date;
  children: React.ReactNode;
  onQuickAssign?: (workOrderId: string, techId: string) => void;
}

function DroppableWeekCell({ techId, date, children, onQuickAssign }: DroppableWeekCellProps) {
  const id = `week-${techId}-${date.toISOString().split("T")[0]}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  
  return (
    <div 
      ref={setNodeRef} 
      className={`min-h-[60px] rounded transition-colors ${isOver ? "bg-[#711419]/10 ring-2 ring-[#711419]/30" : ""}`}
    >
      {children}
    </div>
  );
}

interface DroppableScheduleRowProps {
  techId: string;
  children: React.ReactNode;
}

function DroppableScheduleRow({ techId, children }: DroppableScheduleRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `technician-${techId}`,
    data: { technicianId: techId },
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${isOver ? "bg-[#711419]/10 ring-2 ring-inset ring-[#711419]/30" : ""}`} 
      style={{ minHeight: 64 }}
    >
      {children}
    </div>
  );
}

interface DraggableScheduleCardProps {
  workOrder: DispatchWorkOrder;
  leftPercent: number;
  widthPercent: number;
  bgColor: string;
  statusStripe?: string;
  onWorkOrderClick?: (id: string) => void;
  onResizeComplete?: (workOrderId: string, deltaStartMinutes: number, deltaEndMinutes: number) => void;
  isDragging?: boolean;
}

function DraggableScheduleCard({ 
  workOrder, 
  leftPercent, 
  widthPercent, 
  bgColor, 
  statusStripe = "",
  onWorkOrderClick,
  onResizeComplete,
  isDragging = false,
}: DraggableScheduleCardProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeOffset, setResizeOffset] = useState({ left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const edgeRef = useRef<'start' | 'end'>('end');
  const accumulatedStartDeltaRef = useRef(0);
  const accumulatedEndDeltaRef = useRef(0);
  const justResizedRef = useRef(false);
  
  // Disable dragging for work orders where tech is on site
  const isLocked = workOrder.status === "on_site";
  
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `schedule-${workOrder.id}`,
    data: { workOrder, fromSchedule: true },
    disabled: isResizing || isLocked,
  });

  const handleMouseDown = (e: React.MouseEvent, edge: 'start' | 'end') => {
    if (isLocked) return; // Don't allow resizing for on_site work orders
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    edgeRef.current = edge;
    accumulatedStartDeltaRef.current = 0;
    accumulatedEndDeltaRef.current = 0;
    setResizeOffset({ left: 0, width: 0 });
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const parentWidth = containerRef.current.parentElement?.offsetWidth || SCHEDULE_TIMELINE_WIDTH;
      const deltaX = moveEvent.clientX - startXRef.current;
      const deltaPercent = (deltaX / parentWidth) * 100;
      const deltaMinutes = Math.round((deltaPercent / 100) * SCHEDULE_TOTAL_MINUTES / 30) * 30;
      const deltaPercentSnapped = (deltaMinutes / SCHEDULE_TOTAL_MINUTES) * 100;
      
      if (edge === 'start') {
        setResizeOffset({ left: deltaPercentSnapped, width: -deltaPercentSnapped });
        accumulatedStartDeltaRef.current = deltaMinutes;
      } else {
        setResizeOffset({ left: 0, width: deltaPercentSnapped });
        accumulatedEndDeltaRef.current = deltaMinutes;
      }
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeOffset({ left: 0, width: 0 });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      justResizedRef.current = true;
      setTimeout(() => { justResizedRef.current = false; }, 100);
      
      if ((accumulatedStartDeltaRef.current !== 0 || accumulatedEndDeltaRef.current !== 0) && onResizeComplete) {
        onResizeComplete(workOrder.id, accumulatedStartDeltaRef.current, accumulatedEndDeltaRef.current);
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const visualLeft = leftPercent + resizeOffset.left;
  const visualWidth = Math.max(widthPercent + resizeOffset.width, 4);

  const style: React.CSSProperties = {
    left: `${visualLeft}%`,
    width: `${visualWidth}%`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: 1,
    zIndex: isDragging ? 1000 : isResizing ? 50 : 1,
  };

  const dragListeners = isResizing ? {} : listeners;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      className={`absolute top-2 bottom-2 ${bgColor} ${statusStripe} text-slate-800 rounded-md px-2 py-1 cursor-grab hover:shadow-md transition-all overflow-hidden shadow-sm group ${isResizing ? 'cursor-ew-resize' : ''}`}
      data-testid={`schedule-card-${workOrder.id}`}
      {...attributes}
      {...dragListeners}
      onClick={(e) => {
        if (!isResizing && !justResizedRef.current) {
          e.stopPropagation();
          onWorkOrderClick?.(workOrder.id);
        }
      }}
    >
      <div 
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-slate-400/30 hover:bg-slate-400/50 transition-opacity z-10"
        onMouseDown={(e) => handleMouseDown(e, 'start')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-start-${workOrder.id}`}
      />
      <div 
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-slate-400/30 hover:bg-slate-400/50 transition-opacity z-10"
        onMouseDown={(e) => handleMouseDown(e, 'end')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-end-${workOrder.id}`}
      />
      
      <div className="flex items-center gap-1.5">
        {workOrder.status === "completed" && <CheckSquare className="h-3 w-3 flex-shrink-0 text-green-600" />}
        <p className="text-xs font-medium truncate">{workOrder.customerName}</p>
      </div>
      <p className="text-[10px] text-slate-600 truncate">{workOrder.propertyAddress || "No address"}</p>
    </div>
  );
}

interface TechnicianScheduleBoardProps {
  technicians: Technician[];
  workOrders: DispatchWorkOrder[];
  onWorkOrderClick?: (workOrderId: string) => void;
  selectedDate: Date;
  onResizeComplete?: (workOrderId: string, deltaStartMinutes: number, deltaEndMinutes: number) => void;
  activeId?: string | null;
}

function TechnicianScheduleBoard({ technicians, workOrders, onWorkOrderClick, selectedDate, onResizeComplete, activeId }: TechnicianScheduleBoardProps) {
  const hourLabels = useMemo(() => {
    const labels: string[] = [];
    for (let h = SCHEDULE_START_HOUR; h <= SCHEDULE_END_HOUR; h++) {
      const label = h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
      labels.push(label);
    }
    return labels;
  }, []);

  const getWorkOrdersForTech = (techId: string) => {
    return workOrders.filter(wo => wo.assignedTechId === techId && wo.scheduledStart);
  };

  if (technicians.length === 0) {
    return (
      <Card className="bg-white border">
        <CardContent className="p-8 text-center text-slate-500">
          No technicians available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border overflow-hidden">
      <div className="overflow-x-auto overflow-y-auto max-h-full">
        <div style={{ minWidth: SCHEDULE_TIMELINE_WIDTH + 200 }}>
          <div className="flex border-b border-slate-200 sticky top-0 bg-white z-20">
            <div className="w-48 flex-shrink-0 px-4 py-3 border-r border-slate-200 text-sm font-semibold text-slate-700 bg-white sticky left-0 z-30">
              Technicians
            </div>
            <div className="flex-1 relative" style={{ minWidth: SCHEDULE_TIMELINE_WIDTH }}>
              <div className="flex justify-between px-2 py-3">
                {hourLabels.map((label, i) => (
                  <div key={i} className="text-xs font-medium text-slate-500 whitespace-nowrap" style={{ width: i === hourLabels.length - 1 ? 'auto' : `${100 / (hourLabels.length - 1)}%` }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {technicians.map((tech) => {
            const techWorkOrders = getWorkOrdersForTech(tech.id);
            return (
              <DroppableScheduleRow key={tech.id} techId={tech.id}>
                <div className="w-48 flex-shrink-0 px-4 py-3 border-r border-slate-100 flex items-center gap-3 bg-white sticky left-0 z-10">
                  <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
                    <User className="w-6 h-6 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{tech.name}</p>
                    <p className="text-xs text-slate-400">{techWorkOrders.length} work orders</p>
                  </div>
                </div>
                
                <div className="flex-1 relative py-2" style={{ minWidth: SCHEDULE_TIMELINE_WIDTH }}>
                  {techWorkOrders.map((wo) => {
                    if (!wo.scheduledStart) return null;
                    const startDate = new Date(wo.scheduledStart);
                    const endDate = wo.scheduledEnd ? new Date(wo.scheduledEnd) : null;
                    
                    const leftPercent = getScheduleLeftPercent(startDate);
                    const widthPercent = getScheduleWidthPercent(startDate, endDate);
                    const visitType = wo.visitType || "SERVICE";
                    const bgColor = scheduleVisitTypeColors[visitType] || scheduleVisitTypeColors.SERVICE;
                    const statusStripe = scheduleStatusStripes[wo.status] || scheduleStatusStripes.scheduled;
                    
                    const startMinutesFrom8 = (startDate.getHours() - SCHEDULE_START_HOUR) * 60 + startDate.getMinutes();
                    if (startMinutesFrom8 < 0 || startMinutesFrom8 >= SCHEDULE_TOTAL_MINUTES) return null;

                    return (
                      <DraggableScheduleCard
                        key={wo.id}
                        workOrder={wo}
                        leftPercent={leftPercent}
                        widthPercent={widthPercent}
                        bgColor={bgColor}
                        statusStripe={statusStripe}
                        onWorkOrderClick={onWorkOrderClick}
                        onResizeComplete={onResizeComplete}
                        isDragging={activeId === `schedule-${wo.id}`}
                      />
                    );
                  })}
                </div>
              </DroppableScheduleRow>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

interface UnassignedQueueSectionProps {
  workOrders: DispatchWorkOrder[];
  onWorkOrderClick?: (workOrderId: string) => void;
  technicians?: Technician[];
  onQuickAssign?: (workOrderId: string, techId: string) => void;
  onQuickSchedule?: (workOrderId: string, date: Date, startTime: string, endTime: string) => void;
  onQuickStageChange?: (workOrderId: string, stage: DispatchQueueStage) => void;
  onQuickNote?: (workOrderId: string, note: string) => void;
  selectedDate?: Date;
}

function UnassignedQueueSection({
  workOrders,
  onWorkOrderClick,
  technicians,
  onQuickAssign,
  onQuickSchedule,
  onQuickStageChange,
  onQuickNote,
  selectedDate,
}: UnassignedQueueSectionProps) {
  const filteredWorkOrders = useMemo(() => {
    return workOrders;
  }, [workOrders]);

  const groupedByStage = useMemo(() => {
    const groups: Record<DispatchQueueStage, DispatchWorkOrder[]> = {
      NeedsScheduling: [],
      ReadyToDispatch: [],
      WaitingOnParts: [],
      NeedsApproval: [],
      OnHold: [],
      CallbackPriority: [],
      PartsNeeded: [],
      PartsOrdered: [],
      PartsArrived: [],
      Scheduled: [],
    };
    
    filteredWorkOrders.forEach(wo => {
      const stage = getEffectiveQueueStage(wo);
      if (groups[stage]) {
        groups[stage].push(wo);
      } else {
        // Fallback to NeedsScheduling if stage is unknown
        groups.NeedsScheduling.push(wo);
      }
    });
    
    return groups;
  }, [filteredWorkOrders]);

  const stageOrder: DispatchQueueStage[] = [
    "WaitingOnParts",
    "NeedsApproval",
    "OnHold",
    "CallbackPriority",
    "ReadyToDispatch",
  ];

  return (
    <div className="space-y-3" data-testid="unassigned-queue-section">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Unassigned Queue ({workOrders.length})</h2>
      </div>
      
      {filteredWorkOrders.length === 0 ? (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-8 text-center text-slate-500">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No unassigned work orders match your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {stageOrder.map(stage => (
            <QueueStageBox 
              key={stage}
              stage={stage}
              workOrders={groupedByStage[stage]}
              onWorkOrderClick={onWorkOrderClick}
              technicians={technicians}
              onQuickAssign={onQuickAssign}
              onQuickSchedule={onQuickSchedule}
              onQuickStageChange={onQuickStageChange}
              onQuickNote={onQuickNote}
              selectedDate={selectedDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DraggableWorkOrderCardProps {
  workOrder: DispatchWorkOrder;
  onResize: (workOrderId: string, newStart: number, newEnd: number) => void;
  isDragging?: boolean;
  onClick?: (workOrderId: string) => void;
}

function DraggableWorkOrderCard({ workOrder, onResize, isDragging, onClick }: DraggableWorkOrderCardProps) {
  const jobColors = getJobTypeColor(workOrder.jobType);
  const statusStripe = statusStripeColors[workOrder.status] || statusStripeColors.scheduled;
  const priorityStyle = priorityBadgeColors[workOrder.priority || "normal"] || priorityBadgeColors.normal;
  const isCompletedStatus = ["completed", "cancelled"].includes(workOrder.status);
  const { startHour, endHour } = getWorkOrderDisplayTimes(workOrder);
  
  // Disable dragging/resizing for work orders where tech is on site
  const isLocked = workOrder.status === "on_site";
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [visualStart, setVisualStart] = useState(startHour);
  const [visualEnd, setVisualEnd] = useState(endHour);
  const resizeStartX = useRef(0);
  const originalStart = useRef(startHour);
  const originalEnd = useRef(endHour);
  
  const isResizing = isResizingLeft || isResizingRight;
  
  useEffect(() => {
    if (!isResizing) {
      setVisualStart(startHour);
      setVisualEnd(endHour);
    }
  }, [startHour, endHour, isResizing]);
  
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: workOrder.id,
    data: { workOrder, fromQueue: false },
    disabled: isResizing || isLocked,
  });

  const handleResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    if (isLocked) return; // Don't allow resizing for on_site work orders
    e.stopPropagation();
    e.preventDefault();
    resizeStartX.current = e.clientX;
    originalStart.current = startHour;
    originalEnd.current = endHour;
    setVisualStart(startHour);
    setVisualEnd(endHour);
    
    if (side === 'left') {
      setIsResizingLeft(true);
    } else {
      setIsResizingRight(true);
    }
  }, [startHour, endHour, isLocked]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const hoursPerPixel = (END_HOUR - START_HOUR) / TIMELINE_WIDTH;
      const deltaX = e.clientX - resizeStartX.current;
      const deltaHours = deltaX * hoursPerPixel;
      
      if (isResizingLeft) {
        let newStart = Math.round((originalStart.current + deltaHours) * 2) / 2;
        newStart = Math.max(START_HOUR, Math.min(newStart, originalEnd.current - 0.5));
        setVisualStart(newStart);
      } else if (isResizingRight) {
        let newEnd = Math.round((originalEnd.current + deltaHours) * 2) / 2;
        newEnd = Math.max(originalStart.current + 0.5, Math.min(newEnd, END_HOUR));
        setVisualEnd(newEnd);
      }
    };

    const handleMouseUp = () => {
      if (isResizingLeft) {
        onResize(workOrder.id, visualStart, originalEnd.current);
      } else if (isResizingRight) {
        onResize(workOrder.id, originalStart.current, visualEnd);
      }
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isResizingLeft, isResizingRight, workOrder.id, visualStart, visualEnd, onResize]);

  const displayStart = isResizing ? visualStart : startHour;
  const displayEnd = isResizing ? visualEnd : endHour;
  const startSlotIdx = (displayStart - START_HOUR) * (60 / STEP_MINUTES);
  const endSlotIdx = (displayEnd - START_HOUR) * (60 / STEP_MINUTES);
  const leftPx = startSlotIdx * SLOT_WIDTH;
  const widthPx = (endSlotIdx - startSlotIdx) * SLOT_WIDTH;

  const style: React.CSSProperties = {
    left: `${leftPx}px`,
    width: `${Math.max(widthPx, 48)}px`,
    transform: isDragging && transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: 1,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={`absolute top-1 bottom-1 rounded border-l-4 ${jobColors.bg} ${jobColors.border} ${jobColors.text} ${statusStripe} overflow-hidden ${isDragging ? 'z-50' : ''} ${isCompletedStatus ? 'opacity-60' : ''}`}
      style={style}
      data-testid={`workorder-card-${workOrder.id}`}
    >
      {workOrder.isPending && (
        <div 
          className="absolute top-0.5 left-3 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center z-10"
          data-testid={`pending-icon-${workOrder.id}`}
          title="Waiting"
        >
          <Clock className="h-3 w-3 text-white" />
        </div>
      )}
      {workOrder.priority && workOrder.priority !== "normal" && (
        <div 
          className={`absolute top-0.5 right-1 px-1 py-0 text-[9px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}
          data-testid={`priority-badge-${workOrder.id}`}
        >
          {workOrder.priority.toUpperCase()}
        </div>
      )}
      
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center hover:bg-black/10"
        onMouseDown={(e) => handleResizeStart(e, 'left')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-left-${workOrder.id}`}
      >
        <div className="w-0.5 h-4 bg-current opacity-30 rounded" />
      </div>
      
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center hover:bg-black/10"
        onMouseDown={(e) => handleResizeStart(e, 'right')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-right-${workOrder.id}`}
      >
        <div className="w-0.5 h-4 bg-current opacity-30 rounded" />
      </div>

      <div 
        className="flex flex-col h-full justify-center px-3 py-1 cursor-grab"
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(workOrder.id);
        }}
      >
        <div className="flex items-center gap-1">
          <p className={`text-xs font-medium truncate flex-1 ${workOrder.isPending ? 'ml-5' : ''}`}>{workOrder.customerName}</p>
          {workOrder.status !== "scheduled" && (
            <span 
              className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm ${
                workOrder.status === 'dispatched' ? 'bg-purple-600 text-white' :
                workOrder.status === 'en_route' ? 'bg-amber-500 text-white' :
                workOrder.status === 'on_site' ? 'bg-orange-500 text-white' :
                workOrder.status === 'completed' ? 'bg-green-600 text-white' :
                'bg-gray-600 text-white'
              }`}
              data-testid={`status-badge-${workOrder.id}`}
            >
              {statusLabels[workOrder.status] || workOrder.status}
            </span>
          )}
        </div>
        <p className={`text-xs truncate opacity-70 ${workOrder.isPending ? 'ml-5' : ''}`}>{workOrder.propertyAddress || "No address"}</p>
      </div>
    </div>
  );
}

function WorkOrderCardOverlay({ workOrder }: { workOrder: DispatchWorkOrder }) {
  const jobColors = getJobTypeColor(workOrder.jobType);
  const statusStripe = statusStripeColors[workOrder.status] || statusStripeColors.scheduled;
  const priorityStyle = priorityBadgeColors[workOrder.priority || "normal"] || priorityBadgeColors.normal;
  const isCompletedStatus = ["completed", "cancelled"].includes(workOrder.status);
  const { startHour, endHour } = getWorkOrderDisplayTimes(workOrder);
  const durationSlots = (endHour - startHour) * (60 / STEP_MINUTES);
  const widthPx = Math.max(48, durationSlots * SLOT_WIDTH);
  
  return (
    <div
      className={`rounded border-l-4 ${jobColors.bg} ${jobColors.border} ${jobColors.text} ${statusStripe} px-3 py-1 shadow-md cursor-grabbing flex flex-col justify-center relative ${isCompletedStatus ? 'opacity-60' : ''}`}
      style={{ width: `${widthPx}px`, height: '48px' }}
    >
      {workOrder.isPending && (
        <div 
          className="absolute top-0.5 left-3 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center z-10"
          title="Waiting"
        >
          <Clock className="h-3 w-3 text-white" />
        </div>
      )}
      {workOrder.priority && workOrder.priority !== "normal" && (
        <div 
          className={`absolute top-0.5 right-1 px-1 py-0 text-[9px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}
        >
          {workOrder.priority.toUpperCase()}
        </div>
      )}
      <div className="flex items-center gap-1">
        <p className={`text-xs font-medium truncate flex-1 ${workOrder.isPending ? 'ml-5' : ''}`}>{workOrder.customerName}</p>
        {workOrder.status !== "scheduled" && (
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm ${
            workOrder.status === 'dispatched' ? 'bg-purple-600 text-white' :
            workOrder.status === 'en_route' ? 'bg-amber-500 text-white' :
            workOrder.status === 'on_site' ? 'bg-orange-500 text-white' :
            workOrder.status === 'completed' ? 'bg-green-600 text-white' :
            'bg-gray-600 text-white'
          }`}>
            {statusLabels[workOrder.status] || workOrder.status}
          </span>
        )}
      </div>
      <p className={`text-xs truncate opacity-70 ${workOrder.isPending ? 'ml-5' : ''}`}>{workOrder.propertyAddress || "No address"}</p>
    </div>
  );
}

interface DroppableTechnicianRowProps {
  tech: Technician;
  workOrders: DispatchWorkOrder[];
  onResize: (workOrderId: string, newStart: number, newEnd: number) => void;
  activeId: string | null;
  onWorkOrderClick?: (workOrderId: string) => void;
}

function DroppableTechnicianRow({ tech, workOrders, onResize, activeId, onWorkOrderClick }: DroppableTechnicianRowProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `technician-${tech.id}`,
    data: { technicianId: tech.id },
  });

  return (
    <div
      key={tech.id}
      className={`flex border-b border-slate-100 last:border-b-0 transition-all duration-150 ${isOver ? 'bg-[#711419]/5 ring-2 ring-inset ring-[#711419]/40' : ''}`}
      data-testid={`technician-row-${tech.id}`}
    >
      <div className={`w-44 flex-shrink-0 p-2 border-r border-slate-100 flex items-center sticky left-0 z-10 transition-colors ${isOver ? 'bg-[#711419]/5' : 'bg-white'}`}>
        <div className={`w-1 h-10 rounded-full mr-2 ${workOrders.length > 0 ? 'bg-green-500' : 'bg-slate-300'}`} />
        <div className="w-10 h-10 rounded bg-slate-200 flex items-center justify-center mr-2 flex-shrink-0">
          <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{tech.name}</p>
          <p className="text-xs text-slate-400">{workOrders.length} work orders</p>
        </div>
      </div>
      <div ref={setNodeRef} className={`relative h-14 transition-colors ${isOver ? 'bg-[#711419]/5' : ''}`} style={{ width: `${TIMELINE_WIDTH}px` }}>
        <div className="absolute inset-0 flex">
          {timeSlots.map((slot, idx) => (
            <div
              key={idx}
              className={`border-r last:border-r-0 ${slot.isHourMark ? 'border-slate-300' : 'border-slate-200'}`}
              style={{ width: `${SLOT_WIDTH}px` }}
            />
          ))}
        </div>
        {workOrders.map((wo) => (
          <DraggableWorkOrderCard 
            key={wo.id} 
            workOrder={wo} 
            onResize={onResize}
            isDragging={activeId === wo.id}
            onClick={onWorkOrderClick}
          />
        ))}
      </div>
    </div>
  );
}

function MobileWorkOrderCard({ workOrder, technician, onClick }: { workOrder: DispatchWorkOrder; technician?: Technician; onClick?: (workOrderId: string) => void }) {
  const jobColors = getJobTypeColor(workOrder.jobType);
  const statusStripe = statusStripeColors[workOrder.status] || statusStripeColors.scheduled;
  const priorityStyle = priorityBadgeColors[workOrder.priority || "normal"] || priorityBadgeColors.normal;
  const isCompletedStatus = ["completed", "cancelled"].includes(workOrder.status);
  const { startHour, endHour } = getWorkOrderDisplayTimes(workOrder);

  return (
    <Card 
      className={`${jobColors.bg} ${jobColors.border} border border-l-4 ${statusStripe} cursor-pointer hover:shadow-md transition-shadow ${isCompletedStatus ? 'opacity-60' : ''}`} 
      data-testid={`mobile-workorder-card-${workOrder.id}`}
      onClick={() => onClick?.(workOrder.id)}
    >
      <CardContent className="p-3 relative">
        {workOrder.priority && workOrder.priority !== "normal" && (
          <div 
            className={`absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}
            data-testid={`mobile-priority-badge-${workOrder.id}`}
          >
            {workOrder.priority.toUpperCase()}
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${jobColors.text}`}>{workOrder.customerName}</p>
            <p className={`text-xs ${jobColors.text} opacity-80`}>{workOrder.propertyAddress || "No address"}</p>
          </div>
          <Badge 
            className={`text-xs font-bold ${workOrder.priority && workOrder.priority !== "normal" ? 'mr-12' : ''} ${
              workOrder.status === 'scheduled' ? 'bg-blue-600 text-white' :
              workOrder.status === 'dispatched' ? 'bg-purple-600 text-white' :
              workOrder.status === 'en_route' ? 'bg-amber-500 text-white' :
              workOrder.status === 'on_site' ? 'bg-orange-500 text-white' :
              workOrder.status === 'completed' ? 'bg-green-600 text-white' :
              'bg-gray-600 text-white'
            }`}
            data-testid={`mobile-status-badge-${workOrder.id}`}
          >
            {statusLabels[workOrder.status] || workOrder.status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatHour(Math.floor(startHour))} - {formatHour(Math.floor(endHour))}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{technician?.name || workOrder.techName || "Unassigned"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DispatchData {
  technicians: { id: string; name: string; email: string; role: string }[];
  workOrders: DispatchWorkOrder[];
  date: string;
}

function enrichWorkOrder(wo: any): DispatchWorkOrder {
  const property = wo.property;
  const propertyAddress = property
    ? [property.address1, property.city, property.state].filter(Boolean).join(", ")
    : wo.customer?.address1 || null;
  
  return {
    ...wo,
    customerName: wo.customer?.name || "Unknown Customer",
    customerPhone: wo.customer?.phone || null,
    propertyAddress,
    jobType: wo.job?.jobType || "Service",
    priority: wo.job?.priority || "normal",
    description: wo.job?.description || null,
    techName: wo.tech?.name || null,
  };
}

type ViewMode = "day" | "week";

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

function formatWeekRange(dates: Date[]): string {
  if (dates.length < 7) return "";
  const start = dates[0];
  const end = dates[6];
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();
  
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

export default function CrmDispatch() {
  usePageTitle("Dispatch Board");
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeFromQueue, setActiveFromQueue] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [localWorkOrders, setLocalWorkOrders] = useState<DispatchWorkOrder[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const [workOrderDescription, setWorkOrderDescription] = useState("");
  const { toast } = useToast();
  
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [woTitle, setWoTitle] = useState("");
  const [woDescription, setWoDescription] = useState("");
  const [visitType, setVisitType] = useState<WorkOrderVisitType>("SERVICE");
  const [workSubtype, setWorkSubtype] = useState<WorkSubtype>("No Cool");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  
  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 20 && minute > 0) break;
        const hourStr = hour.toString().padStart(2, "0");
        const minuteStr = minute.toString().padStart(2, "0");
        const value = `${hourStr}:${minuteStr}`;
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const ampm = hour >= 12 ? "PM" : "AM";
        const label = `${displayHour}:${minuteStr} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  }, []);
  const [priority, setPriority] = useState<string>("normal");
  
  // Service call checklist state
  const [checklistQuestions, setChecklistQuestions] = useState<ChecklistQuestion[]>([]);
  const [checklistAnswers, setChecklistAnswers] = useState<Record<string, string | boolean | number>>({});
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  
  // Track source quote ID when creating follow-up work order from quote acceptance
  const [sourceQuoteId, setSourceQuoteId] = useState<string | null>(null);

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  
  const selectedWorkOrder = selectedWorkOrderId ? localWorkOrders.find(wo => wo.id === selectedWorkOrderId) : null;

  const handleWorkOrderClick = useCallback((workOrderId: string) => {
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    setSelectedWorkOrderId(workOrderId);
    setIsSheetOpen(true);
    setNewNote("");
    setWorkOrderDescription(wo?.description || "");
  }, [localWorkOrders]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Use local date format to ensure correct date is sent (not UTC which may shift days)
  const dateString = format(selectedDate, "yyyy-MM-dd");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: techniciansList = [] } = useQuery<{ id: string; name: string; email: string; role: string }[]>({
    queryKey: ["/api/crm/technicians"],
    enabled: !!currentUser,
  });

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", debouncedCustomerSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedCustomerSearch) params.set("search", debouncedCustomerSearch);
      params.set("limit", "10");
      const res = await fetch(`/api/crm/customers?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser && createDialogOpen && customerSearchOpen,
  });

  const customers = customersData?.customers || [];

  const { data: propertiesData } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/properties?customerId=${selectedCustomer!.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!selectedCustomer?.id && createDialogOpen,
  });

  const properties = propertiesData || [];

  const { data: projectsResponse } = useQuery<{ projects: CrmProject[]; pagination: any }>({
    queryKey: ["/api/crm/projects", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?customerId=${selectedCustomer!.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!selectedCustomer?.id && createDialogOpen,
  });

  const projects = projectsResponse?.projects || [];

  // Query for active maintenance agreements when customer is selected
  interface ActiveAgreement {
    id: string;
    agreementNumber: string | null;
    agreementPlan: string | null;
    agreementType: string | null;
    status: string;
    numberOfSystems: number | null;
    agreementValue: string | null;
    displayPrice: string;
    frequency: string | null;
    visitsPerPeriod: number | null;
    nextServiceDate: string | null;
    nextInvoiceDate: string | null;
    billingPreference: "auto_invoice" | "pay_on_visit" | null;
    autoRenew: boolean | null;
    contractDate: string | null;
    endDate: string | null;
    isInitialCycle: boolean | null;
    notes: string | null;
    displayName: string;
    visitProgress: {
      completed: number;
      scheduled: number;
      total: number;
      remaining: number;
      lastVisitDate: string | null;
    };
  }

  const { data: activeAgreements = [], isLoading: agreementsLoading } = useQuery<ActiveAgreement[]>({
    queryKey: ["/api/crm/customers", selectedCustomer?.id, "active-agreements"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${selectedCustomer!.id}/active-agreements`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.agreements ?? []);
    },
    enabled: !!selectedCustomer?.id && createDialogOpen,
  });

  // Query to fetch work order subtypes dynamically
  const { data: workOrderSubtypes = [] } = useQuery<WorkOrderSubtype[]>({
    queryKey: ["/api/crm/work-order-subtypes", { activeOnly: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/crm/work-order-subtypes?activeOnly=true", {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!currentUser,
  });

  // Helper to get subtypes for a visit type
  const getSubtypesForVisitType = (vt: WorkOrderVisitType) => {
    return workOrderSubtypes
      .filter(s => s.visitType === vt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  };

  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery<any[]>({
    queryKey: ["/api/crm/dispatch/work-orders", dateString],
    queryFn: async () => {
      const res = await fetch(`/api/crm/dispatch/work-orders?date=${dateString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dispatch data");
      return res.json();
    },
    enabled: !!currentUser,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes for better performance
    refetchInterval: 60000, // Refresh every 60 seconds to catch sync updates
    refetchIntervalInBackground: true, // Keep syncing even when tab is not focused
  });

  // Time breakdown data for the selected date
  interface TimeBreakdown {
    technicianId: string;
    technicianName: string;
    role: string;
    totalClockedMinutes: number;
    driveTimeMinutes: number;
    workTimeMinutes: number;
    idleTimeMinutes: number;
    workOrdersCompleted: number;
  }
  interface TimeBreakdownResponse {
    breakdowns: TimeBreakdown[];
  }
  const { data: timeBreakdownData } = useQuery<TimeBreakdownResponse>({
    queryKey: ["/api/crm/time-breakdown", dateString],
    queryFn: async () => {
      const res = await fetch(`/api/crm/time-breakdown?startDate=${dateString}&endDate=${dateString}`, { credentials: "include" });
      if (!res.ok) return { breakdowns: [] };
      return res.json();
    },
    enabled: !!currentUser,
    staleTime: 60000,
  });
  const [showTimeBreakdown, setShowTimeBreakdown] = useState(false);

  useEffect(() => {
    if (workOrdersData) {
      setLocalWorkOrders(workOrdersData.map(enrichWorkOrder));
    }
  }, [workOrdersData]);

  const technicians: Technician[] = techniciansList.map((u, idx) => ({
    id: u.id,
    name: u.name,
    initials: getInitials(u.name),
    color: techColors[idx % techColors.length],
  }));

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (data: { workOrderId: string; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/crm/work-orders/${data.workOrderId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders", dateString] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("/api/crm/work-orders");
        }
      });
    },
    onError: (error: any) => {
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders"] });
      
      // Check if it's a scheduling conflict error
      if (error?.error === 'SCHEDULING_CONFLICT' || error?.message === 'Scheduling conflict') {
        const conflictInfo = error?.conflictingOrder;
        const startTime = conflictInfo?.scheduledStart 
          ? format(new Date(conflictInfo.scheduledStart), "h:mm a")
          : 'unknown time';
        toast({
          title: "Scheduling Conflict",
          description: `This tech already has "${conflictInfo?.title || 'a work order'}" scheduled at ${startTime}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to update work order",
          description: error?.message || "An error occurred",
          variant: "destructive",
        });
      }
      
      if (workOrdersData) {
        setLocalWorkOrders(workOrdersData.map(enrichWorkOrder));
      }
    },
  });

  const resetCreateForm = () => {
    setSelectedCustomer(null);
    setSelectedPropertyId("");
    setSelectedProjectId("");
    setWoTitle("");
    setWoDescription("");
    setVisitType("SERVICE");
    setWorkSubtype("Other");
    setScheduledDate(selectedDate);
    setStartTime("08:00");
    setEndTime("17:00");
    setAssignedTechId("unassigned");
    setPriority("normal");
    setCustomerSearch("");
    setCustomerSearchOpen(false);
    // Reset checklist state
    setChecklistQuestions([]);
    setChecklistAnswers({});
    setShowChecklist(true);
    setChecklistId(null);
    // Reset source quote ID
    setSourceQuoteId(null);
  };

  // Auto-open work order creation dialog when URL params are present (from quote acceptance flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const createWO = params.get("createWO");
    const customerId = params.get("customerId");
    const propertyId = params.get("propertyId");
    const projectId = params.get("projectId");
    const quoteId = params.get("sourceQuoteId");
    const title = params.get("title");
    const description = params.get("description");

    if (createWO === "true" && customerId) {
      // Fetch the customer by ID and set up the form
      const fetchCustomerAndOpenDialog = async () => {
        try {
          const res = await fetch(`/api/crm/customers/${customerId}`, {
            credentials: "include",
          });
          if (res.ok) {
            const customer = await res.json();
            const customerWithInfo: CustomerWithInfo = {
              id: customer.id,
              name: customer.name,
              customerType: customer.customerType || "residential",
              fullAddress: customer.fullAddress || null,
            };
            setSelectedCustomer(customerWithInfo);
            setSelectedPropertyId(propertyId || "");
            setSelectedProjectId(projectId || "");
            setWoTitle(title ? decodeURIComponent(title) : "");
            setWoDescription(description ? decodeURIComponent(description) : "");
            setSourceQuoteId(quoteId || null);
            setCreateDialogOpen(true);

            // Clear URL params after reading
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, "", cleanUrl);
          }
        } catch (error) {
          console.error("Failed to fetch customer for work order creation:", error);
        }
      };
      fetchCustomerAndOpenDialog();
    }
  }, []);

  // Fetch checklist questions when SERVICE is selected and workSubtype changes
  useEffect(() => {
    if (!createDialogOpen) return;
    if (visitType !== "SERVICE") {
      setChecklistQuestions([]);
      setChecklistAnswers({});
      setChecklistId(null);
      return;
    }

    const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[workSubtype];
    if (!serviceType) {
      setChecklistQuestions([]);
      setChecklistAnswers({});
      setChecklistId(null);
      return;
    }

    setChecklistLoading(true);
    fetch(`/api/crm/checklists/${serviceType}`, { credentials: "include" })
      .then(res => {
        if (!res.ok) {
          setChecklistQuestions([]);
          setChecklistId(null);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data && data.questions) {
          setChecklistQuestions(data.questions);
          setChecklistId(data.id);
          setChecklistAnswers({});
        } else {
          setChecklistQuestions([]);
          setChecklistId(null);
        }
      })
      .catch(() => {
        setChecklistQuestions([]);
        setChecklistId(null);
      })
      .finally(() => {
        setChecklistLoading(false);
      });
  }, [visitType, workSubtype, createDialogOpen]);

  // Generate checklist summary from questions and answers (local fallback)
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

  // Check if all required checklist questions are answered
  const areRequiredQuestionsAnswered = (): boolean => {
    if (visitType !== "SERVICE" || checklistQuestions.length === 0) return true;
    
    const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
    for (const q of requiredQuestions) {
      const answer = checklistAnswers[q.id];
      if (answer === undefined || answer === "" || answer === null) {
        return false;
      }
    }
    return true;
  };

  // Try AI summarization, fall back to local summary
  const generateChecklistSummary = async (): Promise<string> => {
    if (checklistQuestions.length === 0 || Object.keys(checklistAnswers).length === 0) return "";
    
    try {
      const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[workSubtype] || "OTHER";
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
    
    // Fallback to local summary
    return generateLocalChecklistSummary();
  };

  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error("Customer is required");
      if (!selectedPropertyId) throw new Error("Property is required");
      if (!woTitle.trim()) throw new Error("Title is required");
      if (!woDescription.trim()) throw new Error("Description is required");
      if (!scheduledDate) throw new Error("Scheduled date is required");
      
      // Validate required checklist questions are answered
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
      
      // Create dates in local timezone and convert to UTC for storage
      const scheduledStartUTC = createLocalDateTime(scheduledDate, startHours, startMinutes);
      const scheduledEndUTC = createLocalDateTime(scheduledDate, endHours, endMinutes);

      // Frontend pre-check for scheduling conflicts (if a technician is assigned)
      const effectiveTechId = assignedTechId === "unassigned" ? null : assignedTechId;
      if (effectiveTechId) {
        const conflict = checkSchedulingConflict(localWorkOrders, effectiveTechId, scheduledStartUTC, scheduledEndUTC);
        if (conflict) {
          const techName = technicians.find(t => t.id === effectiveTechId)?.name || "This technician";
          const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
          throw new Error(`${techName} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`);
        }
      }

      // Generate checklist summary (tries AI, falls back to local) and prepend to description
      const checklistSummary = await generateChecklistSummary();
      const finalDescription = checklistSummary + woDescription.trim();

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId: selectedCustomer.id,
        propertyId: selectedPropertyId || null,
        projectId: selectedProjectId || null,
        sourceQuoteId: sourceQuoteId || null,
        title: woTitle.trim(),
        description: finalDescription,
        visitType,
        workSubtype,
        scheduledStart: scheduledStartUTC.toISOString(),
        scheduledEnd: scheduledEndUTC.toISOString(),
        assignedTechId: assignedTechId === "unassigned" ? null : assignedTechId,
        priority,
        status: "scheduled",
      });
      const workOrder = await res.json();

      // Save checklist response if we have answers
      if (checklistId && Object.keys(checklistAnswers).length > 0) {
        try {
          await apiRequest("POST", `/api/crm/work-orders/${workOrder.id}/checklist-response`, {
            checklistId,
            answers: checklistAnswers,
            summary: checklistSummary,
          });
        } catch (err) {
          console.error("Failed to save checklist response:", err);
        }
      }

      return workOrder;
    },
    onSuccess: (workOrder) => {
      // Add the new work order to localWorkOrders immediately to prevent stale data conflicts
      const newTech = technicians.find(t => t.id === workOrder.assignedTechId);
      const enrichedWorkOrder: DispatchWorkOrder = {
        ...workOrder,
        techName: newTech?.name || null,
        customerName: selectedCustomer?.name || null,
        propertyAddress: null,
      };
      setLocalWorkOrders(prev => [...prev, enrichedWorkOrder]);
      
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders", dateString] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      toast({ title: "Work order created", description: "New work order has been scheduled." });
      setCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (error: Error & { error?: string; details?: string; conflictingOrder?: { title?: string; scheduledStart?: string } }) => {
      // Handle scheduling conflict errors specifically
      if (error?.error === 'SCHEDULING_CONFLICT' || error?.message === 'Scheduling conflict') {
        const conflictInfo = error?.conflictingOrder;
        const startTime = conflictInfo?.scheduledStart 
          ? format(new Date(conflictInfo.scheduledStart), "h:mm a")
          : "unknown time";
        toast({ 
          title: "Scheduling Conflict",
          description: `This technician already has "${conflictInfo?.title || 'a work order'}" scheduled at ${startTime}. You cannot schedule overlapping appointments.`,
          variant: "destructive" 
        });
      } else if (error?.error === 'NO_MAINTENANCE_AGREEMENT') {
        toast({ 
          title: "No Maintenance Agreement",
          description: error?.details || "This property does not have an active maintenance agreement. Please create one first or select a different visit type.",
          variant: "destructive" 
        });
      } else {
        toast({ title: "Creation failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const handleStatusChange = useCallback((newStatus: WorkOrderStatus) => {
    if (!selectedWorkOrderId) return;
    updateWorkOrderMutation.mutate({
      workOrderId: selectedWorkOrderId,
      updates: { status: newStatus },
    }, {
      onSuccess: () => {
        toast({ title: "Status updated", description: `Work order status changed to ${statusLabels[newStatus]}` });
        setLocalWorkOrders(prev => prev.map(wo => 
          wo.id === selectedWorkOrderId ? { ...wo, status: newStatus } : wo
        ));
      }
    });
  }, [selectedWorkOrderId, updateWorkOrderMutation, toast]);

  const handleUnassign = useCallback(() => {
    if (!selectedWorkOrderId) return;
    updateWorkOrderMutation.mutate({
      workOrderId: selectedWorkOrderId,
      updates: { assignedTechId: null, scheduledStart: null, scheduledEnd: null },
    }, {
      onSuccess: () => {
        toast({ title: "Technician unassigned", description: "Work order moved to unassigned queue" });
        setLocalWorkOrders(prev => prev.map(wo => 
          wo.id === selectedWorkOrderId ? { ...wo, assignedTechId: null, scheduledStart: null, scheduledEnd: null, techName: null } as DispatchWorkOrder : wo
        ));
      }
    });
  }, [selectedWorkOrderId, updateWorkOrderMutation, toast]);

  const handleCancelWorkOrder = useCallback(() => {
    if (!selectedWorkOrderId) return;
    updateWorkOrderMutation.mutate({
      workOrderId: selectedWorkOrderId,
      updates: { status: "cancelled", scheduledStart: null, scheduledEnd: null },
    }, {
      onSuccess: () => {
        toast({ title: "Work order cancelled", description: "The work order has been cancelled" });
        setLocalWorkOrders(prev => prev.map(wo => 
          wo.id === selectedWorkOrderId ? { ...wo, status: "cancelled" as WorkOrderStatus, scheduledStart: null, scheduledEnd: null } as DispatchWorkOrder : wo
        ));
        setIsSheetOpen(false);
      }
    });
  }, [selectedWorkOrderId, updateWorkOrderMutation, toast]);

  const handleSaveNotes = useCallback(() => {
    if (!selectedWorkOrderId || !newNote.trim()) return;
    const currentWO = localWorkOrders.find(wo => wo.id === selectedWorkOrderId);
    const updatedNotes = currentWO?.techNotes 
      ? `${currentWO.techNotes}\n\n---\n${new Date().toLocaleDateString()}: ${newNote.trim()}`
      : newNote.trim();
    
    updateWorkOrderMutation.mutate({
      workOrderId: selectedWorkOrderId,
      updates: { techNotes: updatedNotes },
    }, {
      onSuccess: () => {
        toast({ title: "Notes saved", description: "Work order notes have been updated" });
        setLocalWorkOrders(prev => prev.map(wo => 
          wo.id === selectedWorkOrderId ? { ...wo, techNotes: updatedNotes } : wo
        ));
        setNewNote("");
      }
    });
  }, [selectedWorkOrderId, newNote, localWorkOrders, updateWorkOrderMutation, toast]);

  const handleSaveDispatchNotes = useCallback(() => {
    if (!selectedWorkOrderId || !dispatchNote.trim()) return;
    const currentWO = localWorkOrders.find(wo => wo.id === selectedWorkOrderId);
    const updatedNotes = currentWO?.dispatchNotes 
      ? `${currentWO.dispatchNotes}\n\n---\n${new Date().toLocaleDateString()}: ${dispatchNote.trim()}`
      : dispatchNote.trim();
    
    updateWorkOrderMutation.mutate({
      workOrderId: selectedWorkOrderId,
      updates: { dispatchNotes: updatedNotes },
    }, {
      onSuccess: () => {
        toast({ title: "Dispatch notes saved", description: "Notes for callback/reference have been updated" });
        setLocalWorkOrders(prev => prev.map(wo => 
          wo.id === selectedWorkOrderId ? { ...wo, dispatchNotes: updatedNotes } : wo
        ));
        setDispatchNote("");
      }
    });
  }, [selectedWorkOrderId, dispatchNote, localWorkOrders, updateWorkOrderMutation, toast]);

  const handleSaveWorkOrderDetails = useCallback(() => {
    if (!selectedWorkOrderId) return;
    
    updateWorkOrderMutation.mutate({
      workOrderId: selectedWorkOrderId,
      updates: { description: workOrderDescription },
    }, {
      onSuccess: () => {
        toast({ title: "Details saved", description: "Work order details have been updated" });
        setLocalWorkOrders(prev => prev.map(wo => 
          wo.id === selectedWorkOrderId ? { ...wo, description: workOrderDescription } : wo
        ));
      }
    });
  }, [selectedWorkOrderId, workOrderDescription, updateWorkOrderMutation, toast]);

  const handleQuickAssign = useCallback((workOrderId: string, techId: string) => {
    const newTech = technicians.find(t => t.id === techId);
    // Create dates in local timezone (EST) and convert to UTC for storage
    const startDateUTC = createLocalDateTime(selectedDate, 8, 0);
    const endDateUTC = createLocalDateTime(selectedDate, 9, 0);
    
    // Check for scheduling conflict before assigning
    const conflict = checkSchedulingConflict(localWorkOrders, techId, startDateUTC, endDateUTC, workOrderId);
    if (conflict) {
      const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
      toast({
        title: "Scheduling Conflict",
        description: `${newTech?.name || 'This technician'} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
        variant: "destructive",
      });
      return;
    }
    
    setLocalWorkOrders(prev => prev.map(wo => 
      wo.id === workOrderId 
        ? { ...wo, assignedTechId: techId, techName: newTech?.name || null, scheduledStart: startDateUTC.toISOString() as any, scheduledEnd: endDateUTC.toISOString() as any } 
        : wo
    ));
    
    updateWorkOrderMutation.mutate({
      workOrderId,
      updates: { 
        assignedTechId: techId,
        scheduledStart: startDateUTC.toISOString(),
        scheduledEnd: endDateUTC.toISOString(),
      },
    }, {
      onSuccess: () => {
        toast({ title: "Technician assigned", description: `Assigned to ${newTech?.name || 'technician'}` });
      }
    });
  }, [technicians, selectedDate, localWorkOrders, updateWorkOrderMutation, toast]);

  const handleQuickSchedule = useCallback((workOrderId: string, date: Date, startTime: string, endTime: string) => {
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);
    
    // Create dates in local timezone (EST) and convert to UTC for storage
    const startDateUTC = createLocalDateTime(date, startHours, startMinutes);
    const endDateUTC = createLocalDateTime(date, endHours, endMinutes);
    
    // Check for scheduling conflict if work order has an assigned tech
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    if (wo?.assignedTechId) {
      const conflict = checkSchedulingConflict(localWorkOrders, wo.assignedTechId, startDateUTC, endDateUTC, workOrderId);
      if (conflict) {
        const techName = wo.techName || technicians.find(t => t.id === wo.assignedTechId)?.name || "This technician";
        const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
        toast({
          title: "Scheduling Conflict",
          description: `${techName} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
          variant: "destructive",
        });
        return;
      }
    }
    
    setLocalWorkOrders(prev => prev.map(wo => 
      wo.id === workOrderId 
        ? { ...wo, scheduledStart: startDateUTC.toISOString() as any, scheduledEnd: endDateUTC.toISOString() as any } 
        : wo
    ));
    
    updateWorkOrderMutation.mutate({
      workOrderId,
      updates: { 
        scheduledStart: startDateUTC.toISOString(),
        scheduledEnd: endDateUTC.toISOString(),
      },
    }, {
      onSuccess: () => {
        toast({ title: "Scheduled", description: `Work order scheduled for ${formatLocalDateTime(startDateUTC)}` });
        // Navigate to the scheduled date so user can see the work order
        setSelectedDate(date);
      }
    });
  }, [localWorkOrders, technicians, updateWorkOrderMutation, toast]);

  const handleQuickStageChange = useCallback((workOrderId: string, stage: DispatchQueueStage) => {
    setLocalWorkOrders(prev => prev.map(wo => 
      wo.id === workOrderId 
        ? { ...wo, dispatchQueueStage: stage } as DispatchWorkOrder
        : wo
    ));
    
    updateWorkOrderMutation.mutate({
      workOrderId,
      updates: { dispatchQueueStage: stage },
    }, {
      onSuccess: () => {
        toast({ title: "Status updated", description: `Changed to ${queueStageLabels[stage]}` });
      }
    });
  }, [updateWorkOrderMutation, toast]);

  const handleQuickNote = useCallback((workOrderId: string, note: string) => {
    const currentWO = localWorkOrders.find(wo => wo.id === workOrderId);
    const updatedNotes = currentWO?.techNotes 
      ? `${currentWO.techNotes}\n\n---\n${new Date().toLocaleDateString()}: ${note}`
      : note;
    
    setLocalWorkOrders(prev => prev.map(wo => 
      wo.id === workOrderId ? { ...wo, techNotes: updatedNotes } : wo
    ));
    
    updateWorkOrderMutation.mutate({
      workOrderId,
      updates: { techNotes: updatedNotes },
    }, {
      onSuccess: () => {
        toast({ title: "Note added", description: "Quick note has been saved" });
      }
    });
  }, [localWorkOrders, updateWorkOrderMutation, toast]);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const resizeWorkOrder = useCallback((workOrderId: string, newStart: number, newEnd: number) => {
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const startHourInt = Math.floor(newStart);
    const startMinutes = Math.round((newStart % 1) * 60);
    const endHourInt = Math.floor(newEnd);
    const endMinutes = Math.round((newEnd % 1) * 60);
    
    const startDate = new Date(selectedDate);
    startDate.setHours(startHourInt, startMinutes, 0, 0);
    const endDate = new Date(selectedDate);
    endDate.setHours(endHourInt, endMinutes, 0, 0);
    
    // Check for scheduling conflict when resizing
    if (wo.assignedTechId) {
      const conflict = checkSchedulingConflict(localWorkOrders, wo.assignedTechId, startDate, endDate, workOrderId);
      if (conflict) {
        const techName = wo.techName || technicians.find(t => t.id === wo.assignedTechId)?.name || "This technician";
        const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
        toast({
          title: "Scheduling Conflict",
          description: `${techName} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
          variant: "destructive",
        });
        return;
      }
    }
    
    const scheduledStartISO = startDate.toISOString();
    const scheduledEndISO = endDate.toISOString();

    setLocalWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any } : w
    ));

    updateWorkOrderMutation.mutate({
      workOrderId,
      updates: {
        scheduledStart: scheduledStartISO,
        scheduledEnd: scheduledEndISO,
      },
    });
  }, [localWorkOrders, selectedDate, technicians, updateWorkOrderMutation, toast]);

  const handleResizeComplete = useCallback((workOrderId: string, deltaStartMinutes: number, deltaEndMinutes: number) => {
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    if (!wo || !wo.scheduledStart) return;

    const currentStart = new Date(wo.scheduledStart);
    const currentEnd = wo.scheduledEnd ? new Date(wo.scheduledEnd) : new Date(currentStart.getTime() + 60 * 60 * 1000);
    
    let newStart = new Date(currentStart.getTime() + deltaStartMinutes * 60 * 1000);
    let newEnd = new Date(currentEnd.getTime() + deltaEndMinutes * 60 * 1000);
    
    if (newStart >= newEnd) return;
    if (newStart.getHours() < SCHEDULE_START_HOUR) {
      newStart.setHours(SCHEDULE_START_HOUR, 0, 0, 0);
    }
    if (newEnd.getHours() > SCHEDULE_END_HOUR || (newEnd.getHours() === SCHEDULE_END_HOUR && newEnd.getMinutes() > 0)) {
      newEnd.setHours(SCHEDULE_END_HOUR, 0, 0, 0);
    }
    
    // Check for scheduling conflict when resizing
    if (wo.assignedTechId) {
      const conflict = checkSchedulingConflict(localWorkOrders, wo.assignedTechId, newStart, newEnd, workOrderId);
      if (conflict) {
        const techName = wo.techName || technicians.find(t => t.id === wo.assignedTechId)?.name || "This technician";
        const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
        toast({
          title: "Scheduling Conflict",
          description: `${techName} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
          variant: "destructive",
        });
        return;
      }
    }
    
    const scheduledStartISO = newStart.toISOString();
    const scheduledEndISO = newEnd.toISOString();

    setLocalWorkOrders(prev => prev.map(w =>
      w.id === workOrderId ? { ...w, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any } : w
    ));

    updateWorkOrderMutation.mutate({
      workOrderId,
      updates: {
        scheduledStart: scheduledStartISO,
        scheduledEnd: scheduledEndISO,
      },
    });
  }, [localWorkOrders, technicians, updateWorkOrderMutation, toast]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    const isFromQueue = id.startsWith('queue-');
    setActiveFromQueue(isFromQueue);
    if (isFromQueue) {
      setActiveId(id.replace('queue-', ''));
    } else if (id.startsWith('schedule-')) {
      setActiveId(id.replace('schedule-', ''));
    } else {
      setActiveId(id);
    }
  }, []);

  const timelineRef = useRef<HTMLDivElement>(null);
  const dispatchBoardRef = useRef<HTMLDivElement>(null);
  
  const combinedModifiers = useMemo(() => {
    const restrictModifier = createRestrictToContainerModifier(dispatchBoardRef);
    return [snapToGridModifier, restrictModifier];
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    setActiveFromQueue(false);
    
    if (!over) return;
    
    const overId = over.id as string;
    const activeIdStr = active.id as string;
    const isFromQueue = activeIdStr.startsWith('queue-');
    const isFromSchedule = activeIdStr.startsWith('schedule-');
    let workOrderId = activeIdStr;
    if (isFromQueue) {
      workOrderId = activeIdStr.replace('queue-', '');
    } else if (isFromSchedule) {
      workOrderId = activeIdStr.replace('schedule-', '');
    }
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    
    if (!wo) return;
    
    if (overId.startsWith('technician-')) {
      const newTechId = overId.replace('technician-', '');
      
      if (isFromQueue && !isFromSchedule) {
        const newTech = technicians.find(t => t.id === newTechId);
        
        // Preserve existing scheduled time if available, otherwise use defaults
        if (wo.scheduledStart && wo.scheduledEnd) {
          // Check for conflict with existing scheduled time
          const existingStart = new Date(wo.scheduledStart);
          const existingEnd = new Date(wo.scheduledEnd);
          const conflict = checkSchedulingConflict(localWorkOrders, newTechId, existingStart, existingEnd, workOrderId);
          if (conflict) {
            const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
            toast({
              title: "Scheduling Conflict",
              description: `${newTech?.name || 'This technician'} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
              variant: "destructive",
            });
            return;
          }
          
          // Keep the existing scheduled time, just assign the tech
          setLocalWorkOrders(prev => prev.map(w => 
            w.id === workOrderId 
              ? { ...w, assignedTechId: newTechId, techName: newTech?.name || null } 
              : w
          ));

          updateWorkOrderMutation.mutate({
            workOrderId,
            updates: {
              assignedTechId: newTechId,
            },
          });

          toast({
            title: "Work order assigned",
            description: `Assigned to ${newTech?.name || 'technician'} at ${format(existingStart, "h:mm a")}`,
          });
        } else {
          // No scheduled time - set a default time
          const defaultDuration = 1;
          const newStartHour = START_HOUR;
          const newEndHour = Math.min(newStartHour + defaultDuration, END_HOUR);
          
          const startHourInt = Math.floor(newStartHour);
          const startMinutes = Math.round((newStartHour % 1) * 60);
          const endHourInt = Math.floor(newEndHour);
          const endMinutes = Math.round((newEndHour % 1) * 60);
          
          const startDate = new Date(selectedDate);
          startDate.setHours(startHourInt, startMinutes, 0, 0);
          const endDate = new Date(selectedDate);
          endDate.setHours(endHourInt, endMinutes, 0, 0);
          
          // Check for conflict with default time slot
          const conflict = checkSchedulingConflict(localWorkOrders, newTechId, startDate, endDate, workOrderId);
          if (conflict) {
            const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
            toast({
              title: "Scheduling Conflict",
              description: `${newTech?.name || 'This technician'} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
              variant: "destructive",
            });
            return;
          }
          
          const scheduledStartISO = startDate.toISOString();
          const scheduledEndISO = endDate.toISOString();

          setLocalWorkOrders(prev => prev.map(w => 
            w.id === workOrderId 
              ? { ...w, assignedTechId: newTechId, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any, techName: newTech?.name || null } 
              : w
          ));

          updateWorkOrderMutation.mutate({
            workOrderId,
            updates: {
              assignedTechId: newTechId,
              scheduledStart: scheduledStartISO,
              scheduledEnd: scheduledEndISO,
            },
          });

          toast({
            title: "Work order assigned",
            description: `Assigned to ${newTech?.name || 'technician'} at ${formatHour(Math.floor(newStartHour))}`,
          });
        }
      } else {
        const { startHour, endHour } = getWorkOrderDisplayTimes(wo);
        const duration = endHour - startHour;
        
        const hoursPerPixel = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) / SCHEDULE_TIMELINE_WIDTH;
        const deltaHours = Math.round((delta.x * hoursPerPixel) * 2) / 2;
        
        let newStartHour = startHour + deltaHours;
        newStartHour = Math.round(newStartHour * 2) / 2;
        newStartHour = Math.max(START_HOUR, Math.min(newStartHour, END_HOUR - duration));
        const newEndHour = newStartHour + duration;

        const startHourInt = Math.floor(newStartHour);
        const startMinutes = Math.round((newStartHour % 1) * 60);
        const endHourInt = Math.floor(newEndHour);
        const endMinutes = Math.round((newEndHour % 1) * 60);
        
        const startDate = new Date(selectedDate);
        startDate.setHours(startHourInt, startMinutes, 0, 0);
        const endDate = new Date(selectedDate);
        endDate.setHours(endHourInt, endMinutes, 0, 0);
        
        const newTech = technicians.find(t => t.id === newTechId);
        
        // Check for conflict when moving between technicians
        const conflict = checkSchedulingConflict(localWorkOrders, newTechId, startDate, endDate, workOrderId);
        if (conflict) {
          const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
          toast({
            title: "Scheduling Conflict",
            description: `${newTech?.name || 'This technician'} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
            variant: "destructive",
          });
          return;
        }
        
        const scheduledStartISO = startDate.toISOString();
        const scheduledEndISO = endDate.toISOString();

        setLocalWorkOrders(prev => prev.map(w => 
          w.id === workOrderId 
            ? { ...w, assignedTechId: newTechId, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any, techName: newTech?.name || null } 
            : w
        ));

        updateWorkOrderMutation.mutate({
          workOrderId,
          updates: {
            assignedTechId: newTechId,
            scheduledStart: scheduledStartISO,
            scheduledEnd: scheduledEndISO,
          },
        });
      }
    } else if (overId.startsWith('week-')) {
      const parts = overId.replace('week-', '').split('-');
      const techId = parts[0];
      const dateStr = parts.slice(1).join('-');
      const dropDate = new Date(dateStr + 'T08:00:00');
      
      const startDate = new Date(dropDate);
      startDate.setHours(8, 0, 0, 0);
      const endDate = new Date(dropDate);
      endDate.setHours(10, 0, 0, 0);
      
      const newTech = technicians.find(t => t.id === techId);
      
      // Check for conflict when dropping in week view
      const conflict = checkSchedulingConflict(localWorkOrders, techId, startDate, endDate, workOrderId);
      if (conflict) {
        const conflictStart = conflict.scheduledStart ? format(new Date(conflict.scheduledStart), "h:mm a") : "unknown time";
        toast({
          title: "Scheduling Conflict",
          description: `${newTech?.name || 'This technician'} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`,
          variant: "destructive",
        });
        return;
      }
      
      const scheduledStartISO = startDate.toISOString();
      const scheduledEndISO = endDate.toISOString();
      
      setLocalWorkOrders(prev => prev.map(w => 
        w.id === workOrderId 
          ? { ...w, assignedTechId: techId, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any, techName: newTech?.name || null } 
          : w
      ));
      
      updateWorkOrderMutation.mutate({
        workOrderId,
        updates: {
          assignedTechId: techId,
          scheduledStart: scheduledStartISO,
          scheduledEnd: scheduledEndISO,
        },
      });
      
      toast({
        title: "Work order scheduled",
        description: `Assigned to ${newTech?.name || 'technician'} on ${format(dropDate, "MMM d")}`,
      });
    }
  }, [localWorkOrders, selectedDate, updateWorkOrderMutation, technicians, toast]);

  const unassignedWorkOrders = localWorkOrders.filter(wo => !wo.assignedTechId || !wo.scheduledStart);

  const assignedWorkOrders = useMemo(() => {
    return localWorkOrders.filter((wo) => {
      if (!wo.assignedTechId) return false;
      
      if (debouncedSearch.trim()) {
        const searchLower = debouncedSearch.toLowerCase();
        const woNumber = wo.workOrderNumber ? String(wo.workOrderNumber).toLowerCase() : "";
        const matchesSearch = 
          wo.customerName?.toLowerCase().includes(searchLower) ||
          woNumber.includes(searchLower) ||
          wo.description?.toLowerCase().includes(searchLower) ||
          wo.techName?.toLowerCase().includes(searchLower) ||
          wo.propertyAddress?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      if (filter === "all") return true;
      if (filter === "completed") return wo.status === "completed";
      return wo.status === filter;
    });
  }, [localWorkOrders, debouncedSearch, filter]);

  const getWorkOrdersForTechnician = useCallback((techId: string) => {
    return assignedWorkOrders.filter((wo) => wo.assignedTechId === techId);
  }, [assignedWorkOrders]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
    }
  };

  const dateDisplay = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const activeWorkOrder = activeId ? localWorkOrders.find(wo => wo.id === activeId) : null;

  if (authLoading || workOrdersLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="flex gap-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const filterLabels: Record<FilterStatus, string> = {
    all: "All",
    scheduled: "Scheduled",
    dispatched: "Dispatched",
    en_route: "Traveling",
    on_site: "Working",
    completed: "Completed"
  };

  return (
    <CrmLayout currentUser={currentUser} disableScroll>
      <div className="flex flex-col h-full max-w-full overflow-hidden">
        {/* Fixed Header Section */}
        <div className="flex-shrink-0 space-y-3 pb-3">
          <div className="flex justify-center">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search work orders..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
                data-testid="input-search-dispatch"
              />
            </div>
          </div>

          <div className="flex justify-center">
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  newDate.setDate(newDate.getDate() - (viewMode === "week" ? 7 : 1));
                  setSelectedDate(newDate);
                }}
                className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors"
                data-testid="button-prev-date"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              
              {viewMode === "day" ? (
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button 
                      className="text-sm text-slate-700 font-medium min-w-[160px] text-center hover:text-[#711419] transition-colors"
                      data-testid="button-date-picker"
                    >
                      {dateDisplay}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      initialFocus
                      data-testid="calendar-picker"
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="text-sm font-medium text-slate-700 px-2 min-w-[160px] text-center">
                  {formatWeekRange(weekDates)}
                </span>
              )}
              
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  newDate.setDate(newDate.getDate() + (viewMode === "week" ? 7 : 1));
                  setSelectedDate(newDate);
                }}
                className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors"
                data-testid="button-next-date"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900" data-testid="text-dispatch-title">
                Dispatch Board
              </h1>
              <p className="text-sm text-slate-500">
                {viewMode === "day" ? "Daily Schedule" : "Weekly Schedule"} - {localWorkOrders.length} work orders
              </p>
            </div>
            
            <div className="flex items-center border-b border-slate-200">
              <button
                onClick={() => setViewMode("day")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  viewMode === "day" 
                    ? "text-[#711419] border-[#711419]" 
                    : "text-slate-500 border-transparent hover:text-slate-700"
                }`}
                data-testid="button-view-day"
              >
                Day
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  viewMode === "week" 
                    ? "text-[#711419] border-[#711419]" 
                    : "text-slate-500 border-transparent hover:text-slate-700"
                }`}
                data-testid="button-view-week"
              >
                Week
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-slate-600" data-testid="button-legend">
                  <Info className="h-4 w-4 mr-1.5" />
                  Legend
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="end">
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Visit Type (Background)</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-sky-100 border border-sky-200" />
                        <span className="text-sm text-slate-700">Service</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200" />
                        <span className="text-sm text-slate-700">Maintenance</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200" />
                        <span className="text-sm text-slate-700">Install</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-rose-100 border border-rose-200" />
                        <span className="text-sm text-slate-700">Sales</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Status (Left Stripe)</p>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Scheduled</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Dispatched</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Traveling</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Working</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Completed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Cancelled</span>
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            <Button
              size="sm"
              onClick={() => {
                setScheduledDate(selectedDate);
                setCreateDialogOpen(true);
              }}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Work Order
            </Button>
          </div>
          </div>

          {/* Time Breakdown Summary Panel */}
          <Collapsible open={showTimeBreakdown} onOpenChange={setShowTimeBreakdown}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full flex justify-between items-center py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg" data-testid="toggle-time-breakdown">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-slate-600" />
                  <span className="font-medium text-slate-700">Time Breakdown</span>
                  {timeBreakdownData?.breakdowns && timeBreakdownData.breakdowns.length > 0 && (
                    <span className="text-xs text-slate-500">
                      ({timeBreakdownData.breakdowns.length} techs clocked in)
                    </span>
                  )}
                </div>
                <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", showTimeBreakdown && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {timeBreakdownData?.breakdowns && timeBreakdownData.breakdowns.length > 0 ? (
                  timeBreakdownData.breakdowns.map(tech => {
                    const total = tech.totalClockedMinutes || 0;
                    const idle = tech.idleTimeMinutes || 0;
                    const drive = tech.driveTimeMinutes || 0;
                    const work = tech.workTimeMinutes || 0;
                    const idlePct = total > 0 ? Math.round((idle / total) * 100) : 0;
                    const drivePct = total > 0 ? Math.round((drive / total) * 100) : 0;
                    const workPct = total > 0 ? Math.round((work / total) * 100) : 0;
                    const formatMins = (mins: number) => {
                      const m = mins || 0;
                      const h = Math.floor(m / 60);
                      const remainder = m % 60;
                      return h > 0 ? `${h}h ${remainder}m` : `${remainder}m`;
                    };
                    return (
                      <Card key={tech.technicianId} className="p-3 bg-white" data-testid={`time-card-${tech.technicianId}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-slate-800 truncate">{tech.technicianName}</span>
                          <span className="text-xs text-slate-500">{formatMins(total)}</span>
                        </div>
                        {/* Stacked Progress Bar */}
                        <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100">
                          {idlePct > 0 && <div className="bg-gray-400" style={{ width: `${idlePct}%` }} title={`Idle: ${formatMins(idle)}`} />}
                          {drivePct > 0 && <div className="bg-blue-500" style={{ width: `${drivePct}%` }} title={`Drive: ${formatMins(drive)}`} />}
                          {workPct > 0 && <div className="bg-green-500" style={{ width: `${workPct}%` }} title={`Work: ${formatMins(work)}`} />}
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />Idle {idlePct}%</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Drive {drivePct}%</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Work {workPct}%</span>
                        </div>
                      </Card>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-4 text-sm text-slate-500">
                    No technicians clocked in for this date
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Main Content Area - Scrollable Schedule + Fixed Queue */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          modifiers={combinedModifiers}
        >
          <div ref={dispatchBoardRef} className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden">
            {/* Scrollable Technician Schedule - vertical scroll here, horizontal inside component */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              {viewMode === "day" ? (
                <TechnicianScheduleBoard
                  technicians={technicians}
                  workOrders={localWorkOrders.filter(wo => wo.assignedTechId)}
                  onWorkOrderClick={handleWorkOrderClick}
                  selectedDate={selectedDate}
                  onResizeComplete={handleResizeComplete}
                  activeId={activeId}
                />
              ) : (
                <WeekDispatchBoard
                  technicians={technicians}
                  workOrders={localWorkOrders}
                  weekDates={weekDates}
                  onWorkOrderClick={handleWorkOrderClick}
                  onQuickAssign={handleQuickAssign}
                  onDayClick={(date) => {
                    setSelectedDate(date);
                    setViewMode("day");
                  }}
                />
              )}
            </div>
            
            {/* Fixed Unassigned Queue */}
            <div className="flex-shrink-0 max-h-[280px] overflow-y-auto overflow-x-hidden">
              <UnassignedQueueSection
                workOrders={unassignedWorkOrders}
                onWorkOrderClick={handleWorkOrderClick}
                technicians={technicians}
                onQuickAssign={handleQuickAssign}
                onQuickSchedule={handleQuickSchedule}
                onQuickStageChange={handleQuickStageChange}
                onQuickNote={handleQuickNote}
                selectedDate={selectedDate}
              />
            </div>
          </div>
          
          {/* Drag Overlay - only shows when dragging from queue */}
          <DragOverlay dropAnimation={null}>
            {activeId && activeFromQueue ? (
              (() => {
                const draggingWo = localWorkOrders.find(w => w.id === activeId);
                if (!draggingWo) return null;
                const visitTypeColor = getJobTypeColor(draggingWo.visitType || draggingWo.jobType);
                const scheduledWindow = draggingWo.scheduledStart && draggingWo.scheduledEnd
                  ? `${format(new Date(draggingWo.scheduledStart), "h:mm a")} - ${format(new Date(draggingWo.scheduledEnd), "h:mm a")}`
                  : null;
                return (
                  <div className="p-3 bg-white border-2 border-[#711419] rounded-lg shadow-2xl w-64 cursor-grabbing">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${visitTypeColor.border.replace('border-', 'bg-')}`} />
                        <span className="text-xs font-medium text-slate-600">WO #{draggingWo.workOrderNumber}</span>
                      </div>
                      {scheduledWindow && (
                        <span className="text-xs text-slate-500">{scheduledWindow}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{draggingWo.customerName}</p>
                    <p className="text-xs text-slate-500 truncate">{draggingWo.title || draggingWo.description || "No description"}</p>
                  </div>
                );
              })()
            ) : null}
          </DragOverlay>
        </DndContext>

      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="workorder-detail-sheet">
          {selectedWorkOrder && (
            <>
              <SheetHeader>
                <SheetTitle className="text-lg" data-testid="sheet-workorder-title">Work Order #{selectedWorkOrder.workOrderNumber}</SheetTitle>
                <SheetDescription>View and manage work order details</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900">Work Order Information</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Customer</span>
                      {selectedWorkOrder.job?.customerId ? (
                        <Link 
                          href={`/crm/customers/${selectedWorkOrder.job.customerId}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          data-testid="link-customer-detail"
                        >
                          {selectedWorkOrder.customerName}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-slate-900">{selectedWorkOrder.customerName}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Visit Type</span>
                      <span className="text-sm font-medium text-slate-900" data-testid="text-visit-type">{selectedWorkOrder.jobType}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Priority</span>
                      <Badge 
                        variant={selectedWorkOrder.priority === "urgent" ? "destructive" : selectedWorkOrder.priority === "high" ? "default" : "secondary"}
                        data-testid="badge-priority"
                      >
                        {selectedWorkOrder.priority || "normal"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Scheduled</span>
                      <span className="text-sm font-medium text-slate-900" data-testid="text-scheduled-time">
                        {selectedWorkOrder.scheduledStart && selectedWorkOrder.scheduledEnd ? (
                          (() => {
                            const { startHour, endHour } = getWorkOrderDisplayTimes(selectedWorkOrder);
                            return `${formatDecimalHour(startHour)} - ${formatDecimalHour(endHour)}`;
                          })()
                        ) : "Not scheduled"}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Status</span>
                      <div className="flex items-center gap-2">
                        {selectedWorkOrder.isPending && (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-200">
                            Waiting
                          </Badge>
                        )}
                        <Badge 
                          className={`${statusColors[selectedWorkOrder.status]?.bg} ${statusColors[selectedWorkOrder.status]?.text} ${statusColors[selectedWorkOrder.status]?.border} border`}
                          data-testid="badge-status"
                        >
                          {statusLabels[selectedWorkOrder.status] || selectedWorkOrder.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Assigned Tech</span>
                      <span className="text-sm font-medium text-slate-900" data-testid="text-assigned-tech">
                        {technicians.find(t => t.id === selectedWorkOrder.assignedTechId)?.name || selectedWorkOrder.techName || "Unassigned"}
                      </span>
                    </div>

                    {selectedWorkOrder.customerPhone && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Phone</span>
                        <span className="text-sm font-medium text-slate-900">{selectedWorkOrder.customerPhone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Update Status</h3>
                  <div className="flex flex-wrap gap-2" data-testid="status-buttons">
                    {(["scheduled", "dispatched", "en_route", "on_site", "completed"] as WorkOrderStatus[]).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={selectedWorkOrder.status === status ? "default" : "outline"}
                        onClick={() => handleStatusChange(status)}
                        disabled={updateWorkOrderMutation.isPending}
                        data-testid={`button-status-${status}`}
                      >
                        {updateWorkOrderMutation.isPending && selectedWorkOrder.status !== status ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        {statusLabels[status]}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Work Order Details</h3>
                  <p className="text-xs text-slate-500">Description of the work to be performed.</p>
                  <Textarea
                    placeholder="Enter work order details..."
                    value={workOrderDescription}
                    onChange={(e) => setWorkOrderDescription(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="textarea-work-order-details"
                  />
                  <Button 
                    size="sm" 
                    onClick={handleSaveWorkOrderDetails}
                    disabled={updateWorkOrderMutation.isPending}
                    data-testid="button-save-work-order-details"
                  >
                    Save Details
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Dispatch Notes
                  </h3>
                  <p className="text-xs text-slate-500">For client callbacks or technician reference. These notes will be visible to technicians in the mobile app.</p>
                  {selectedWorkOrder.dispatchNotes && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm whitespace-pre-wrap" data-testid="dispatch-notes-display">
                      {selectedWorkOrder.dispatchNotes}
                    </div>
                  )}
                  <Textarea
                    placeholder="Add dispatch notes (e.g., client called back, special instructions)..."
                    value={dispatchNote}
                    onChange={(e) => setDispatchNote(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="textarea-dispatch-notes"
                  />
                  <Button 
                    size="sm" 
                    onClick={handleSaveDispatchNotes}
                    disabled={!dispatchNote.trim() || updateWorkOrderMutation.isPending}
                    data-testid="button-save-dispatch-notes"
                  >
                    Save Dispatch Notes
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Technician Notes</h3>
                  <p className="text-xs text-slate-500">Notes added by the technician during or after completion.</p>
                  {selectedWorkOrder.completionSummary && (
                    <div className="bg-green-50 border border-green-200 rounded p-3 text-sm" data-testid="completion-summary">
                      <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                        <CheckSquare className="h-4 w-4" />
                        Completion Summary
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap">{selectedWorkOrder.completionSummary}</p>
                    </div>
                  )}
                  {selectedWorkOrder.techNotes && (
                    <div className="bg-slate-50 rounded p-3 text-sm whitespace-pre-wrap" data-testid="tech-notes">
                      {selectedWorkOrder.techNotes}
                    </div>
                  )}
                  <Textarea
                    placeholder="Add notes..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="textarea-notes"
                  />
                  <Button 
                    size="sm" 
                    onClick={handleSaveNotes}
                    disabled={!newNote.trim() || updateWorkOrderMutation.isPending}
                    data-testid="button-save-notes"
                  >
                    Save Notes
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/crm/work-orders/${selectedWorkOrder.id}`}>
                      <Button
                        size="sm"
                        variant="default"
                        data-testid="button-view-full-details"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        View Full Details
                      </Button>
                    </Link>
                    {selectedWorkOrder.assignedTechId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleUnassign}
                        disabled={updateWorkOrderMutation.isPending}
                        data-testid="button-unassign"
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Unassign Tech
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={updateWorkOrderMutation.isPending || selectedWorkOrder.status === "cancelled"}
                          data-testid="button-cancel-wo"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel Work Order
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Work Order?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will cancel the work order. This action can be undone by changing the status later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Work Order</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCancelWorkOrder}>
                            Yes, Cancel It
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSearchOpen}
                    className="w-full justify-between"
                    data-testid="button-select-customer"
                  >
                    {selectedCustomer ? selectedCustomer.name : "Select customer..."}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 z-[100]" sideOffset={4}>
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Search customers..." 
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                    />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>
                        {customersLoading ? "Searching..." : "No customers found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setSelectedCustomer(c);
                              setCustomerSearchOpen(false);
                              setSelectedPropertyId("");
                              setSelectedProjectId("");
                            }}
                          >
                            <div>
                              <p className="font-medium">{c.name}</p>
                              <p className="text-xs text-slate-500">{c.fullAddress || c.customerType}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Maintenance Agreement Info Display - Enhanced */}
            {selectedCustomer && agreementsLoading && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                <span className="text-sm text-slate-600">Checking for maintenance agreements...</span>
              </div>
            )}
            {selectedCustomer && !agreementsLoading && activeAgreements.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                {activeAgreements.map((agreement) => (
                  <div key={agreement.id} className="p-3">
                    {/* Header with status badges */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-semibold text-amber-800">
                          {agreement.status === "active" ? "Active" : 
                           agreement.status === "pending" ? "Pending" : 
                           agreement.status === "grace_period" ? "Grace Period" : ""} Maintenance Agreement
                        </span>
                        {agreement.status === "pending" && (
                          <span className="text-[10px] bg-yellow-500 text-white px-2 py-0.5 rounded-full font-medium">
                            Awaiting Payment
                          </span>
                        )}
                        {agreement.status === "grace_period" && (
                          <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-medium">
                            Renewal Due
                          </span>
                        )}
                      </div>
                      {agreement.billingPreference === "pay_on_visit" && (
                        <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-medium">
                          Pay on Visit
                        </span>
                      )}
                    </div>
                    
                    {/* Plan name and agreement number */}
                    <div className="mb-3">
                      <p className="font-semibold text-amber-900">{agreement.displayName}</p>
                      {agreement.agreementNumber && (
                        <p className="text-xs text-amber-600">{agreement.agreementNumber}</p>
                      )}
                    </div>

                    {/* Two column layout */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {/* Left column - Service Schedule */}
                      <div className="space-y-1.5">
                        <p className="font-semibold text-amber-800 text-[11px] uppercase tracking-wide">Service</p>
                        
                        {agreement.numberOfSystems && (
                          <div className="flex justify-between">
                            <span className="text-amber-600">Systems:</span>
                            <span className="font-medium text-amber-800">{agreement.numberOfSystems}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between">
                          <span className="text-amber-600">Visit Progress:</span>
                          <span className="font-medium text-amber-800">
                            {agreement.visitProgress.completed}/{agreement.visitProgress.total}
                          </span>
                        </div>
                        
                        {agreement.visitProgress.remaining > 0 && (
                          <div className="flex justify-between">
                            <span className="text-amber-600">Remaining:</span>
                            <span className="font-medium text-amber-800">{agreement.visitProgress.remaining} visits</span>
                          </div>
                        )}
                        
                        {agreement.nextServiceDate && (
                          <div className="flex justify-between">
                            <span className="text-amber-600">Next Service:</span>
                            <span className="font-medium text-amber-800">
                              {new Date(agreement.nextServiceDate).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        
                        {agreement.visitProgress.lastVisitDate && (
                          <div className="flex justify-between">
                            <span className="text-amber-600">Last Visit:</span>
                            <span className="font-medium text-amber-800">
                              {new Date(agreement.visitProgress.lastVisitDate).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right column - Billing & Terms */}
                      <div className="space-y-1.5">
                        <p className="font-semibold text-amber-800 text-[11px] uppercase tracking-wide">Billing</p>
                        
                        <div className="flex justify-between">
                          <span className="text-amber-600">Value:</span>
                          <span className="font-medium text-amber-800">${parseFloat(agreement.displayPrice).toFixed(2)}</span>
                        </div>
                        
                        {agreement.frequency && (
                          <div className="flex justify-between">
                            <span className="text-amber-600">Frequency:</span>
                            <span className="font-medium text-amber-800 capitalize">{agreement.frequency}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between">
                          <span className="text-amber-600">Billing:</span>
                          <span className="font-medium text-amber-800">
                            {agreement.billingPreference === "pay_on_visit" ? "On Visit" : "Auto Invoice"}
                          </span>
                        </div>
                        
                        {agreement.autoRenew !== null && (
                          <div className="flex justify-between">
                            <span className="text-amber-600">Auto Renew:</span>
                            <span className="font-medium text-amber-800">{agreement.autoRenew ? "Yes" : "No"}</span>
                          </div>
                        )}
                        
                        {agreement.endDate && (
                          <div className="flex justify-between">
                            <span className="text-amber-600">Expires:</span>
                            <span className="font-medium text-amber-800">
                              {new Date(agreement.endDate).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Alerts section */}
                    {agreement.billingPreference === "pay_on_visit" && agreement.visitProgress.completed === 0 && (
                      <div className="mt-3 bg-orange-100 border border-orange-300 rounded p-2 text-xs text-orange-800">
                        <span className="font-semibold">First Visit:</span> Collect ${parseFloat(agreement.displayPrice).toFixed(2)} payment on-site to activate agreement
                      </div>
                    )}
                    
                    {agreement.billingPreference === "pay_on_visit" && 
                     agreement.visitProgress.remaining === 1 && 
                     agreement.visitProgress.completed > 0 && (
                      <div className="mt-3 bg-blue-100 border border-blue-300 rounded p-2 text-xs text-blue-800">
                        <span className="font-semibold">Renewal Visit:</span> Last visit of cycle - collect renewal payment
                      </div>
                    )}
                    
                    {/* Notes (collapsible) */}
                    {agreement.notes && (
                      <div className="mt-3 pt-2 border-t border-amber-200">
                        <p className="text-[10px] text-amber-600 uppercase font-medium mb-1">Notes</p>
                        <p className="text-xs text-amber-700">{agreement.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedCustomer && (
              <div className="space-y-2">
                <Label>Location *</Label>
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.length > 0 ? (
                      properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.address1} {p.city && `, ${p.city}`}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-slate-500">No properties found for this customer</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCustomer && projects.length > 0 && (
              <div className="space-y-2">
                <Label>Project (Optional)</Label>
                <Select value={selectedProjectId || "none"} onValueChange={(v) => setSelectedProjectId(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Visit Type</Label>
                <Select value={visitType} onValueChange={(v) => {
                  const newVisitType = v as WorkOrderVisitType;
                  setVisitType(newVisitType);
                  // Set default subtype from dynamic list
                  const subtypes = getSubtypesForVisitType(newVisitType);
                  setWorkSubtype(subtypes.length > 0 ? subtypes[0].subtype : "Other");
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrderVisitTypeEnum.map((t) => (
                      <SelectItem key={t} value={t}>{visitTypeLabels[t] || t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Work Subtype</Label>
              <Select value={workSubtype} onValueChange={(v) => setWorkSubtype(v as WorkSubtype)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subtype" />
                </SelectTrigger>
                <SelectContent>
                  {getSubtypesForVisitType(visitType).length > 0 ? (
                    getSubtypesForVisitType(visitType).map((s) => (
                      <SelectItem key={s.id} value={s.subtype}>{s.subtype}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Other">Other</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Service Call Checklist Section */}
            {visitType === "SERVICE" && (checklistLoading || checklistQuestions.length > 0) && (
              <Collapsible open={showChecklist} onOpenChange={setShowChecklist} className="space-y-2">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex w-full justify-between p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg"
                    data-testid="toggle-checklist"
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
              <Label>Scheduled Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={setScheduledDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>End Time</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign Technician</Label>
              <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {techniciansList.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input 
                value={woTitle}
                onChange={(e) => setWoTitle(e.target.value)}
                placeholder="Brief title for the work order"
              />
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea 
                value={woDescription}
                onChange={(e) => setWoDescription(e.target.value)}
                placeholder="Describe the work to be done..."
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateDialogOpen(false);
              resetCreateForm();
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => createWorkOrderMutation.mutate()}
              disabled={!selectedCustomer || !selectedPropertyId || !woTitle.trim() || !woDescription.trim() || createWorkOrderMutation.isPending || !areRequiredQuestionsAnswered()}
              className="bg-[#711419] hover:bg-[#5a1014]"
            >
              {createWorkOrderMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
