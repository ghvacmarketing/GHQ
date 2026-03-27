import { useEffect, useState, useRef, useCallback, useMemo, Fragment } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Trash2,
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
  Truck,
  GripVertical,
  Pause,
  Ban,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { addDays, endOfMonth, endOfWeek, format, formatDistanceToNow, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { FleetMap } from "@/components/fleet-map";
import { createLocalDateTime, formatLocal, formatLocalDateTime, getLocalStartOfDay, getLocalEndOfDay, getLocalDateString, getTodayLocalDateString, APP_TIMEZONE, toLocalTime } from "@/lib/timezone";
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
import { CommentComposer } from "@/components/crm/comment-composer";
import type { CrmUser, CrmWorkOrder, CrmJob, CrmCustomer, CrmProperty, CrmProject, WorkOrderStatus, ChecklistQuestion, ImmediateAction } from "@shared/schema";
import { workOrderVisitTypeEnum, type WorkOrderVisitType, type WorkSubtype, dispatchQueueStageEnum, type DispatchQueueStage, type WorkOrderSubtype } from "@shared/schema";

const PRIORITIES = ["low", "normal", "high"] as const;

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
  WaitingOnParts: "Waiting on Parts",
  PartsArrived: "Parts Arrived",
  OnHold: "On Hold",
  ReadyToDispatch: "Ready to Schedule",
  NeedsApproval: "Needs Approval",
  CallbackPriority: "Callback/Priority",
  PartsNeeded: "Parts Needed",
  PartsOrdered: "Parts Ordered",
  Scheduled: "Scheduled",
};

const queueStageColors: Record<DispatchQueueStage, { bg: string; border: string; text: string; badge: string }> = {
  NeedsScheduling: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", badge: "bg-slate-500" },
  WaitingOnParts: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-500" },
  PartsArrived: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-500" },
  OnHold: { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-700", badge: "bg-gray-500" },
  ReadyToDispatch: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-500" },
  NeedsApproval: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", badge: "bg-purple-500" },
  CallbackPriority: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-500" },
  PartsNeeded: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-500" },
  PartsOrdered: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", badge: "bg-yellow-500" },
  Scheduled: { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", badge: "bg-cyan-500" },
};

import {
  DndContext,
  DragOverlay,
  pointerWithin,
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

const START_HOUR = 6;
const END_HOUR = 22;
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

// Create hour labels for 6am through 10pm
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

// No grid-snap modifier — the preview rectangle in each timeline row
// already snaps to half-hour increments and the drop handler reads from
// previewHourByTechRef, so snapping the DragOverlay to a 60-px grid
// (which is relative to the drag-start position, not the timeline grid)
// only causes the overlay to diverge from the actual landing position.

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
  scheduled: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700" },
  dispatched: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  en_route: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  on_site: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  completed: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700" },
  cancelled: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500" },
};

const jobTypeColors: Record<string, { bg: string; border: string; text: string }> = {
  SERVICE: { bg: "bg-sky-100", border: "border-sky-200", text: "text-sky-900" },
  MAINTENANCE: { bg: "bg-emerald-100", border: "border-emerald-200", text: "text-emerald-900" },
  INSTALL: { bg: "bg-blue-100", border: "border-blue-200", text: "text-blue-900" },
  SALES: { bg: "bg-indigo-100", border: "border-indigo-200", text: "text-indigo-900" },
};

const statusStripeColors: Record<string, string> = {
  scheduled: "border-l-yellow-400",
  dispatched: "border-l-blue-400",
  en_route: "border-l-blue-400",
  on_site: "border-l-green-400",
  completed: "border-l-gray-400",
  cancelled: "border-l-gray-400",
};

const priorityBadgeColors: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "bg-red-500", text: "text-white", border: "border-red-600" },
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
  scheduled: "Pending",
  dispatched: "Dispatched",
  en_route: "Traveling",
  on_site: "Working",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusHeaderColors: Record<string, string> = {
  scheduled: "bg-amber-500 text-white",
  dispatched: "bg-blue-600 text-white",
  en_route: "bg-blue-700 text-white",
  on_site: "bg-emerald-600 text-white",
  completed: "bg-slate-600 text-white",
  cancelled: "bg-rose-700 text-white",
};

const visitTypeHeaderColors: Record<string, string> = {
  SERVICE: "bg-sky-600 text-white",
  INSTALL: "bg-blue-700 text-white",
  MAINTENANCE: "bg-emerald-700 text-white",
  SALES: "bg-indigo-600 text-white",
};

const statusSquircleColors: Record<string, string> = {
  scheduled: "bg-yellow-400",
  dispatched: "bg-blue-400",
  en_route: "bg-blue-400",
  on_site: "bg-green-500",
  completed: "bg-gray-400",
  cancelled: "bg-gray-400",
};

const statusSegmentColors: Record<string, string> = {
  scheduled: "bg-yellow-400",
  dispatched: "bg-blue-500",
  en_route: "bg-blue-500",
  on_site: "bg-green-500",
  completed: "bg-gray-500",
  cancelled: "bg-gray-500",
};

const statusIconMap: Record<string, React.ReactNode> = {
  scheduled: <Clock className="h-4 w-4 text-white" />,
  dispatched: <Clipboard className="h-4 w-4 text-white" />,
  en_route: <Truck className="h-4 w-4 text-white" />,
  on_site: <Wrench className="h-4 w-4 text-white" />,
  completed: <Check className="h-4 w-4 text-white" />,
  cancelled: <Ban className="h-4 w-4 text-white" />,
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
  const start = toLocalTime(new Date(workOrder.scheduledStart));
  const end = toLocalTime(new Date(workOrder.scheduledEnd));
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
  onOpenQuickStatus?: (workOrderId: string, event: React.MouseEvent) => void;
}

function DraggableQueueCard({ workOrder, onClick, onOpenQuickStatus }: DraggableQueueCardProps) {
  const priorityStyle = priorityBadgeColors[workOrder.priority || "normal"] || priorityBadgeColors.normal;
  const visitTypeColor = getJobTypeColor(workOrder.visitType || workOrder.jobType);
  const needsSchedulingNow = (workOrder as any).immediateAction === "create_now" && !workOrder.scheduledStart;
  const iconColor = statusSquircleColors[workOrder.status] || statusSquircleColors.scheduled;

  const isLocked = workOrder.status === "on_site";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `queue-${workOrder.id}`,
    data: { workOrder, fromQueue: true },
    disabled: isLocked,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: 1,
    zIndex: isDragging ? 1000 : undefined,
  };

  const statusIcon = statusIconMap[workOrder.status] || statusIconMap.scheduled;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 border-b border-slate-100 hover:bg-slate-50 transition-colors ${isDragging ? 'z-50 shadow-lg cursor-grabbing bg-white rounded-md ring-2 ring-[#711419]/50' : 'cursor-grab'} ${needsSchedulingNow ? 'bg-red-50 border-b-red-200' : ''}`}
      data-testid={`queue-card-${workOrder.id}`}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(workOrder.id);
      }}
    >
      {/* Status Icon Button - Field Edge style */}
      <button
        className={`${iconColor} w-8 h-8 flex-shrink-0 rounded-md flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity`}
        title={`Status: ${statusLabels[workOrder.status] || workOrder.status} — Click to change`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpenQuickStatus?.(workOrder.id, e);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`status-icon-${workOrder.id}`}
      >
        {statusIcon}
      </button>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-900 truncate">{workOrder.customerName}</span>
          <Badge variant="outline" className={`${visitTypeColor.bg} ${visitTypeColor.text} border-0 text-[10px] flex-shrink-0`}>
            {visitTypeLabels[workOrder.visitType || "SERVICE"] || workOrder.visitType}
          </Badge>
          {workOrder.priority && workOrder.priority !== "normal" && (
            <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded flex-shrink-0 ${priorityStyle.bg} ${priorityStyle.text}`}>
              {workOrder.priority.toUpperCase()}
            </span>
          )}
        </div>
        {workOrder.propertyAddress && (
          <span className="text-xs text-slate-400 truncate">
            {workOrder.propertyAddress}
          </span>
        )}
      </div>
    </div>
  );
}

interface QueueStageBoxProps {
  stage: DispatchQueueStage;
  workOrders: DispatchWorkOrder[];
  onWorkOrderClick?: (workOrderId: string) => void;
  onOpenQuickStatus?: (workOrderId: string, event: React.MouseEvent) => void;
}

function QueueStageBox({
  stage,
  workOrders,
  onWorkOrderClick,
  onOpenQuickStatus,
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
            <div className="divide-y divide-slate-100">
              {workOrders.map((wo) => (
                <DraggableQueueCard
                  key={wo.id}
                  workOrder={wo}
                  onClick={onWorkOrderClick}
                  onOpenQuickStatus={onOpenQuickStatus}
                />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

const SCHEDULE_START_HOUR = 6;
const SCHEDULE_END_HOUR = 22;
const SCHEDULE_TOTAL_MINUTES = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 60;
const SCHEDULE_INTERVAL = 30;
const SCHEDULE_TIMELINE_WIDTH = TIMELINE_WIDTH;

function getScheduleLeftPercent(date: Date): number {
  const local = toLocalTime(date);
  const hours = local.getHours();
  const minutes = local.getMinutes();
  const totalMinutes = (hours - SCHEDULE_START_HOUR) * 60 + minutes;
  return Math.max(0, Math.min(100, (totalMinutes / SCHEDULE_TOTAL_MINUTES) * 100));
}

function getScheduleWidthPercent(startDate: Date, endDate: Date | null): number {
  if (!endDate) return (60 / SCHEDULE_TOTAL_MINUTES) * 100;
  const durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
  const snappedDuration = Math.max(SCHEDULE_INTERVAL, Math.round(durationMinutes / SCHEDULE_INTERVAL) * SCHEDULE_INTERVAL);
  return (snappedDuration / SCHEDULE_TOTAL_MINUTES) * 100;
}

function computeDropHourOffset(
  pointerClientX: number,
  timelineRect: DOMRect,
  dragClickHourOffset: number,
  durationHours: number,
): number {
  const totalHours = SCHEDULE_END_HOUR - SCHEDULE_START_HOUR;
  if (timelineRect.width <= 0) return 0;
  const pointerFraction = (pointerClientX - timelineRect.left) / timelineRect.width;
  const pointerHours = pointerFraction * totalHours;
  const rawStartHour = pointerHours - dragClickHourOffset;
  const snappedHour = Math.round(rawStartHour * 2) / 2;
  const maxStartHour = Math.max(0, totalHours - durationHours);
  return Math.max(0, Math.min(snappedHour, maxStartHour));
}

function getWorkOrderDurationHours(workOrder: DispatchWorkOrder): number {
  const { startHour, endHour } = getWorkOrderDisplayTimes(workOrder);
  return Math.max(0.5, endHour - startHour);
}

const scheduleVisitTypeColors: Record<string, string> = {
  SERVICE: "bg-sky-100",
  INSTALL: "bg-blue-100",
  MAINTENANCE: "bg-emerald-100",
  SALES: "bg-indigo-100",
};

const scheduleStatusStripes: Record<string, string> = {
  scheduled: "border-l-4 border-l-yellow-400",
  dispatched: "border-l-4 border-l-blue-400",
  en_route: "border-l-4 border-l-blue-400",
  on_site: "border-l-4 border-l-green-400",
  completed: "border-l-4 border-l-gray-400",
  cancelled: "border-l-4 border-l-gray-400",
};

const scheduleCardColors: Record<string, string> = {
  scheduled: "bg-yellow-400",
  dispatched: "bg-blue-400",
  en_route: "bg-blue-400",
  on_site: "bg-green-400",
  completed: "bg-gray-400",
  cancelled: "bg-gray-400",
};

const weekCardColors: Record<string, { bg: string; border: string }> = {
  scheduled: { bg: "bg-yellow-100", border: "border-l-yellow-400" },
  dispatched: { bg: "bg-blue-100", border: "border-l-blue-400" },
  en_route: { bg: "bg-blue-50", border: "border-l-blue-400" },
  on_site: { bg: "bg-green-100", border: "border-l-green-400" },
  completed: { bg: "bg-gray-100", border: "border-l-gray-400" },
  cancelled: { bg: "bg-gray-100", border: "border-l-gray-400" },
};

interface BouncieVehicle {
  id: string;
  technicianId: string | null;
  deviceId: string | null;
  vehicleName: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vin: string | null;
  licensePlate: string | null;
  lastLatitude: string | null;
  lastLongitude: string | null;
  lastLocationUpdatedAt: string | null;
  lastSpeed: string | null;
  lastHeading: number | null;
  odometer: string | null;
  fuelLevel: string | null;
  isRunning: boolean | null;
  isActive: boolean;
}

interface TrucksMapViewProps {
  technicians: Technician[];
}

function TrucksMapView({ technicians }: TrucksMapViewProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const { data: vehicles = [], isLoading } = useQuery<BouncieVehicle[]>({
    queryKey: ["/api/bouncie/vehicles"],
  });

  const { data: bouncieStatus } = useQuery<{ connected: boolean; lastSync: string | null }>({
    queryKey: ["/api/bouncie/status"],
  });

  const getTechnicianName = (techId: string | null) => {
    if (!techId) return "Unassigned";
    const tech = technicians.find(t => t.id === techId);
    return tech?.name || "Unknown";
  };

  const formatLastUpdate = (timestamp: string | null) => {
    if (!timestamp) return "Never";
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const handleVehicleClick = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
  };

  const handleCloseSheet = () => {
    setSelectedVehicleId(null);
  };

  if (isLoading) {
    return (
      <Card className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#711419]" />
              Fleet Tracking
            </CardTitle>
            {bouncieStatus?.connected ? (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                Bouncie Connected
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                Bouncie Not Connected
              </Badge>
            )}
          </div>
          <Link href="/crm/settings/fleet">
            <Button variant="outline" size="sm" className="text-slate-600">
              <Wrench className="h-4 w-4 mr-1.5" />
              Configure Fleet
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="flex h-full">
          <FleetMap 
            vehicles={vehicles.map(v => ({
              ...v,
              technicianName: v.technicianId ? (technicians.find(t => t.id === v.technicianId)?.name || null) : null
            }))} 
            selectedVehicleId={selectedVehicleId}
            onVehicleClick={handleVehicleClick}
          />

          <div className="w-80 border-l bg-white flex flex-col">
            <div className="p-3 border-b bg-slate-50">
              <h4 className="text-sm font-semibold text-slate-700">
                Vehicles ({vehicles.length})
              </h4>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {vehicles.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">
                    <Truck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    No vehicles configured
                    <Link href="/crm/settings/fleet" className="block mt-2 text-[#711419] hover:underline">
                      Add vehicles
                    </Link>
                  </div>
                ) : (
                  vehicles.map(vehicle => {
                    const isSelected = selectedVehicleId === vehicle.id;
                    return (
                      <div
                        key={vehicle.id}
                        onClick={() => handleVehicleClick(vehicle.id)}
                        className={cn(
                          "p-3 rounded-lg border bg-white hover:bg-slate-50 transition-colors cursor-pointer",
                          isSelected && "ring-2 ring-[#711419] bg-slate-50"
                        )}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${vehicle.isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
                            <span className="font-medium text-slate-800">{vehicle.vehicleName}</span>
                          </div>
                          {vehicle.lastSpeed && parseFloat(vehicle.lastSpeed) > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {Math.round(parseFloat(vehicle.lastSpeed))} mph
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3" />
                            {getTechnicianName(vehicle.technicianId)}
                          </div>
                          {vehicle.vehicleMake && vehicle.vehicleModel && (
                            <div className="text-slate-400">
                              {vehicle.vehicleYear} {vehicle.vehicleMake} {vehicle.vehicleModel}
                            </div>
                          )}
                          {vehicle.lastLocationUpdatedAt && (
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Clock className="h-3 w-3" />
                              Updated {formatLastUpdate(vehicle.lastLocationUpdatedAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>

      <Sheet open={!!selectedVehicle} onOpenChange={(open) => !open && handleCloseSheet()}>
        <SheetContent className="w-[400px] sm:w-[450px]">
          {selectedVehicle && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${selectedVehicle.isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <div>
                    <SheetTitle className="text-lg">{selectedVehicle.vehicleName}</SheetTitle>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <User className="h-3.5 w-3.5" />
                      {getTechnicianName(selectedVehicle.technicianId)}
                    </p>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="stats" className="mt-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="stats">Stats</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>

                <TabsContent value="stats" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-xs text-slate-500 mb-1">Odometer</div>
                      <div className="text-lg font-semibold text-slate-800">
                        {selectedVehicle.odometer 
                          ? `${Math.round(parseFloat(selectedVehicle.odometer)).toLocaleString()} mi`
                          : "N/A"
                        }
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-xs text-slate-500 mb-1">Fuel Level</div>
                      <div className="text-lg font-semibold text-slate-800">
                        {selectedVehicle.fuelLevel !== null && selectedVehicle.fuelLevel !== undefined
                          ? `${Math.round(parseFloat(selectedVehicle.fuelLevel))}%`
                          : "N/A"
                        }
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-xs text-slate-500 mb-1">Speed</div>
                      <div className="text-lg font-semibold text-slate-800">
                        {selectedVehicle.lastSpeed 
                          ? `${Math.round(parseFloat(selectedVehicle.lastSpeed))} mph`
                          : "0 mph"
                        }
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border">
                      <div className="text-xs text-slate-500 mb-1">Status</div>
                      <div className="flex items-center gap-2">
                        {selectedVehicle.lastSpeed && parseFloat(selectedVehicle.lastSpeed) > 0 ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-lg font-semibold text-green-600">Running</span>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 rounded-full bg-slate-400" />
                            <span className="text-lg font-semibold text-slate-600">Parked</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border">
                    <div className="text-xs text-slate-500 mb-1">Last Updated</div>
                    <div className="text-sm font-medium text-slate-800">
                      {selectedVehicle.lastLocationUpdatedAt 
                        ? format(new Date(selectedVehicle.lastLocationUpdatedAt), "MMM d, yyyy 'at' h:mm a")
                        : "Never"
                      }
                    </div>
                    {selectedVehicle.lastLocationUpdatedAt && (
                      <div className="text-xs text-slate-500 mt-1">
                        ({formatDistanceToNow(new Date(selectedVehicle.lastLocationUpdatedAt), { addSuffix: true })})
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="details" className="mt-4 space-y-3">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-slate-500">Make</span>
                      <span className="text-sm font-medium text-slate-800">
                        {selectedVehicle.vehicleMake || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-slate-500">Model</span>
                      <span className="text-sm font-medium text-slate-800">
                        {selectedVehicle.vehicleModel || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-slate-500">Year</span>
                      <span className="text-sm font-medium text-slate-800">
                        {selectedVehicle.vehicleYear || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-slate-500">VIN</span>
                      <span className="text-sm font-medium text-slate-800 font-mono">
                        {selectedVehicle.vin || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-slate-500">License Plate</span>
                      <span className="text-sm font-medium text-slate-800">
                        {selectedVehicle.licensePlate || "N/A"}
                      </span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

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
        <table className="w-full min-w-[1000px] border-collapse table-fixed">
          <colgroup>
            <col style={{ width: "160px" }} />
            {weekDates.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 border-r border-slate-200 bg-slate-50 sticky left-0 z-20">
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
                              const startTime = wo.scheduledStart ? formatLocal(wo.scheduledStart, "h:mma").toLowerCase() : "";
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

interface DroppableMonthCellProps {
  date: Date;
  children: React.ReactNode;
}

function DroppableMonthCell({ date, children }: DroppableMonthCellProps) {
  const dateId = getLocalDateString(date);
  const { setNodeRef, isOver } = useDroppable({ id: `month-${dateId}` });

  return (
    <div
      ref={setNodeRef}
      className={`relative h-full min-h-[110px] p-2 border border-slate-100 transition-colors ${isOver ? "bg-[#711419]/10 ring-2 ring-[#711419]/30" : ""}`}
    >
      {children}
    </div>
  );
}

interface DraggableMonthJobPillProps {
  workOrder: DispatchWorkOrder;
  onWorkOrderClick?: (workOrderId: string) => void;
}

function DraggableMonthJobPill({ workOrder, onWorkOrderClick }: DraggableMonthJobPillProps) {
  const colors = weekCardColors[workOrder.status] || weekCardColors.scheduled;
  const isLocked = workOrder.status === "on_site";
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `month-job-${workOrder.id}`,
    data: { workOrder, fromMonth: true },
    disabled: isLocked,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onWorkOrderClick?.(workOrder.id);
      }}
      className={`${colors.bg} ${colors.border} border-l-2 rounded-r px-1.5 py-0.5 text-[10px] ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-grab hover:opacity-80"} text-slate-700`}
      data-testid={`month-pill-${workOrder.id}`}
    >
      <span className="truncate">{workOrder.customerName}</span>
    </div>
  );
}

interface MonthDispatchBoardProps {
  workOrders: DispatchWorkOrder[];
  selectedDate: Date;
  onWorkOrderClick?: (workOrderId: string) => void;
  onDayClick?: (date: Date) => void;
}

function MonthDispatchBoard({ workOrders, selectedDate, onWorkOrderClick, onDayClick }: MonthDispatchBoardProps) {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const today = new Date();

  const days: Date[] = [];
  let current = calendarStart;
  while (current <= calendarEnd) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }

  const getWorkOrdersForDay = (date: Date) => {
    const dateStr = getLocalDateString(date);
    return workOrders.filter(wo => {
      if (!wo.scheduledStart) return false;
      return getLocalDateString(wo.scheduledStart) === dateStr;
    });
  };

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Card className="bg-white border overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
        {dayNames.map((day) => (
          <div key={day} className="py-2 text-center border-r border-slate-200 last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr">
        {days.map((date) => {
          const dayWorkOrders = getWorkOrdersForDay(date);
          const isOutsideMonth = !isSameMonth(date, selectedDate);
          const isToday = isSameDay(date, today);
          const visibleWorkOrders = dayWorkOrders.slice(0, 3);
          const extraCount = dayWorkOrders.length - visibleWorkOrders.length;

          return (
            <DroppableMonthCell key={date.toISOString()} date={date}>
              <button
                type="button"
                onClick={() => onDayClick?.(date)}
                className="flex items-center justify-between w-full mb-2 text-xs"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    isToday ? "bg-[#711419] text-white" : isOutsideMonth ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  {date.getDate()}
                </span>
                {dayWorkOrders.length > 0 && (
                  <span className="text-[10px] text-slate-400">{dayWorkOrders.length}</span>
                )}
              </button>
              <div className="space-y-1">
                {visibleWorkOrders.map((wo) => (
                  <DraggableMonthJobPill key={wo.id} workOrder={wo} onWorkOrderClick={onWorkOrderClick} />
                ))}
                {extraCount > 0 && (
                  <div className="text-[10px] text-slate-400">+{extraCount} more</div>
                )}
              </div>
            </DroppableMonthCell>
          );
        })}
      </div>
    </Card>
  );
}

interface DroppableScheduleRowProps {
  techId: string;
  children: (args: { isOver: boolean; setDroppableRef: (node: HTMLDivElement | null) => void }) => React.ReactNode;
}

function DroppableScheduleRow({ techId, children }: DroppableScheduleRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `technician-${techId}`,
    data: { technicianId: techId },
  });

  return (
    <div 
      className={`flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${isOver ? "bg-[#711419]/10 ring-2 ring-inset ring-[#711419]/30" : ""}`} 
      style={{ minHeight: 64 }}
    >
      {children({ isOver, setDroppableRef: setNodeRef })}
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
  onOpenQuickStatus?: (workOrderId: string, event: React.MouseEvent) => void;
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
  onOpenQuickStatus,
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
    if (isLocked) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    edgeRef.current = edge;
    accumulatedStartDeltaRef.current = 0;
    accumulatedEndDeltaRef.current = 0;
    setResizeOffset({ left: 0, width: 0 });

    const totalHours = SCHEDULE_END_HOUR - SCHEDULE_START_HOUR;
    const origStartHour = SCHEDULE_START_HOUR + (leftPercent / 100) * totalHours;
    const origEndHour = SCHEDULE_START_HOUR + ((leftPercent + widthPercent) / 100) * totalHours;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const timelineEl = containerRef.current.parentElement;
      if (!timelineEl) return;
      const timelineRect = timelineEl.getBoundingClientRect();
      if (timelineRect.width <= 0) return;

      const pointerFraction = (moveEvent.clientX - timelineRect.left) / timelineRect.width;
      const pointerHour = SCHEDULE_START_HOUR + pointerFraction * totalHours;
      const snappedHour = Math.round(pointerHour * 2) / 2;

      if (edge === 'start') {
        const clampedHour = Math.max(SCHEDULE_START_HOUR, Math.min(SCHEDULE_END_HOUR - 0.5, origEndHour - 0.5, snappedHour));
        const newLeftPercent = ((clampedHour - SCHEDULE_START_HOUR) / totalHours) * 100;
        const deltaPercent = newLeftPercent - leftPercent;
        setResizeOffset({ left: deltaPercent, width: -deltaPercent });
        accumulatedStartDeltaRef.current = Math.round((clampedHour - origStartHour) * 60);
      } else {
        const clampedHour = Math.max(origStartHour + 0.5, Math.min(SCHEDULE_END_HOUR, snappedHour));
        const newEndPercent = ((clampedHour - SCHEDULE_START_HOUR) / totalHours) * 100;
        const deltaPercent = newEndPercent - (leftPercent + widthPercent);
        setResizeOffset({ left: 0, width: deltaPercent });
        accumulatedEndDeltaRef.current = Math.round((clampedHour - origEndHour) * 60);
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
    opacity: isDragging ? 0 : 1,
    pointerEvents: isDragging ? 'none' : undefined,
    zIndex: isDragging ? -1 : isResizing ? 50 : 1,
  };

  const dragListeners = isResizing ? {} : listeners;
  const segmentColor = statusSegmentColors[workOrder.status] || statusSegmentColors.scheduled;
  const isHalfHourCard = widthPercent <= 4.2;
  const isCompactCard = widthPercent <= 5;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={{ ...style, transform: undefined, opacity: isDragging ? 0.2 : 1 }}
      className={`absolute top-2 bottom-2 cursor-grab transition-all group rounded-md border border-slate-300 ${bgColor} shadow-sm hover:shadow-md overflow-hidden ${isResizing ? 'cursor-ew-resize' : ''}`}
      title={isCompactCard ? `${workOrder.customerName}\n${workOrder.propertyAddress || "No address"}\n${statusLabels[workOrder.status] || workOrder.status}` : undefined}
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
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-slate-400/25 hover:bg-slate-400/45 transition-opacity z-30"
        onMouseDown={(e) => handleMouseDown(e, 'start')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-start-${workOrder.id}`}
      />
      <div 
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-slate-400/25 hover:bg-slate-400/45 transition-opacity z-30"
        onMouseDown={(e) => handleMouseDown(e, 'end')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-end-${workOrder.id}`}
      />
      
      <div className="flex h-full items-stretch">
        <button
          className={`${segmentColor} ${isHalfHourCard ? 'w-4' : isCompactCard ? 'w-6' : 'w-11'} flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-85 z-20`}
          title={`${statusLabels[workOrder.status]} — Click to change`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenQuickStatus?.(workOrder.id, e);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`status-icon-schedule-${workOrder.id}`}
        >
          <span className={`flex ${isHalfHourCard ? 'h-3 w-3 rounded-sm' : isCompactCard ? 'h-4 w-4' : 'h-6 w-6'} items-center justify-center bg-white/20 text-white`}>
            {isHalfHourCard ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : (statusIconMap[workOrder.status] || statusIconMap.scheduled)}
          </span>
        </button>
        <div className={`min-w-0 flex-1 border-l border-slate-200/50 ${isHalfHourCard ? 'px-1' : 'px-2'} py-0.5 flex flex-col justify-center`}>
          <p className={`truncate font-semibold text-slate-800 ${isCompactCard ? 'text-[10px] leading-tight' : 'text-xs'}`}>{workOrder.customerName}</p>
          {!isCompactCard && (
            <p className="truncate text-[10px] leading-tight text-slate-500">{workOrder.propertyAddress || "No address"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduleRowTimeline({
  children,
  isDragActive,
  isOver,
  droppableRef,
  dragClickHourOffset = 0,
  onPreviewTimeChange,
  previewDurationHours = 1,
  onNodeRef,
}: {
  children: React.ReactNode;
  isDragActive: boolean;
  isOver: boolean;
  droppableRef?: (node: HTMLDivElement | null) => void;
  dragClickHourOffset?: number;
  onPreviewTimeChange?: (hourOffset: number | null) => void;
  previewDurationHours?: number;
  onNodeRef?: (node: HTMLDivElement | null) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [previewLeft, setPreviewLeft] = useState<number | null>(null);
  const [previewStartHour, setPreviewStartHour] = useState<number>(0);
  const totalHours = SCHEDULE_END_HOUR - SCHEDULE_START_HOUR;
  const previewWidthPercent = (previewDurationHours / totalHours) * 100;

  const formatPreviewTime = (absHour: number) => {
    const h = Math.floor(absHour);
    const m = Math.round((absHour % 1) * 60);
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return m === 0 ? `${displayH} ${ampm}` : `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragActive || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clampedHour = computeDropHourOffset(e.clientX, rect, dragClickHourOffset, previewDurationHours);
    const snappedPercent = (clampedHour / totalHours) * 100;
    const maxLeftPercent = ((totalHours - previewDurationHours) / totalHours) * 100;
    setPreviewLeft(Math.max(0, Math.min(snappedPercent, maxLeftPercent)));
    setPreviewStartHour(SCHEDULE_START_HOUR + clampedHour);
    onPreviewTimeChange?.(clampedHour);
  }, [isDragActive, onPreviewTimeChange, totalHours, dragClickHourOffset, previewDurationHours]);

  const handlePointerLeave = useCallback(() => {
    setPreviewLeft(null);
    onPreviewTimeChange?.(null);
  }, [onPreviewTimeChange]);

  return (
    <div
      ref={(node) => {
        timelineRef.current = node;
        droppableRef?.(node);
        onNodeRef?.(node);
      }}
      className="flex-1 relative py-2"
      style={{ minWidth: SCHEDULE_TIMELINE_WIDTH }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {Array.from({ length: totalHours }, (_, i) => {
        const hourPercent = (i / totalHours) * 100;
        const halfHourPercent = ((i + 0.5) / totalHours) * 100;
        return (
          <Fragment key={`grid-${i}`}>
            <div className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: `${hourPercent}%` }} />
            <div className="absolute top-0 bottom-0 border-l border-dashed border-slate-100" style={{ left: `${halfHourPercent}%` }} />
          </Fragment>
        );
      })}
      <div className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: '100%' }} />

      {/* previewLeft is only non-null when the cursor is physically over
          this row's timeline div (set by handleMouseMove, cleared by
          handleMouseLeave).  We intentionally omit `isOver` from dnd-kit
          here because pointerWithin collision detection can lose track of
          the droppable when the timeline is partially clipped by a scroll
          container. */}
      {isDragActive && previewLeft !== null && (
        <div
          className="absolute top-1 bottom-1 bg-[#711419]/15 border-2 border-dashed border-[#711419]/40 rounded-md pointer-events-none z-[5]"
          style={{ left: `${previewLeft}%`, width: `${previewWidthPercent}%` }}
        >
          <div className="text-[10px] text-[#711419]/80 font-semibold text-center mt-1">
            {formatPreviewTime(previewStartHour)}
          </div>
          <div className="text-[9px] text-[#711419]/50 text-center">
            {formatPreviewTime(previewStartHour + previewDurationHours)}
          </div>
        </div>
      )}

      {children}
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
  dragClickHourOffset?: number;
  onPreviewTimeChange?: (techId: string, hourOffset: number | null) => void;
  onOpenQuickStatus?: (workOrderId: string, event: React.MouseEvent) => void;
  activeDragDurationHours?: number;
  onRegisterTimelineNode?: (techId: string, node: HTMLElement | null) => void;
}

function TechnicianScheduleBoard({ technicians, workOrders, onWorkOrderClick, selectedDate, onResizeComplete, activeId, dragClickHourOffset = 0, onPreviewTimeChange, onOpenQuickStatus, activeDragDurationHours = 1, onRegisterTimelineNode }: TechnicianScheduleBoardProps) {
  const hourLabels = useMemo(() => {
    const labels: string[] = [];
    for (let h = SCHEDULE_START_HOUR; h <= SCHEDULE_END_HOUR; h++) {
      const label = h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
      labels.push(label);
    }
    return labels;
  }, []);

  const getWorkOrdersForTech = (techId: string) => {
    const selectedDateStr = getLocalDateString(selectedDate);
    return workOrders.filter(wo => {
      if (wo.assignedTechId !== techId) return false;
      if (!wo.scheduledStart) return false;
      // Only count work orders for the selected date
      const woDateStr = getLocalDateString(wo.scheduledStart);
      return woDateStr === selectedDateStr;
    });
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
    <Card className="bg-white border overflow-hidden h-full">
      <div className="overflow-x-auto overflow-y-auto h-full">
        <div style={{ minWidth: SCHEDULE_TIMELINE_WIDTH + 200 }}>
          <div className="flex border-b border-slate-200 sticky top-0 bg-white z-20">
            <div className="w-48 flex-shrink-0 px-4 py-3 border-r border-slate-200 text-sm font-semibold text-slate-700 bg-white sticky left-0 z-30">
              Technicians
            </div>
            <div className="flex-1 relative" style={{ minWidth: SCHEDULE_TIMELINE_WIDTH }}>
              <div className="relative py-3" style={{ height: 40 }}>
                {hourLabels.map((label, i) => {
                  const leftPercent = (i / (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR)) * 100;
                  const isFirst = i === 0;
                  const isLast = i === hourLabels.length - 1;
                  const transform = isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)';
                  return (
                    <div key={i} className="absolute text-xs font-medium text-slate-500 whitespace-nowrap" style={{ left: `${leftPercent}%`, transform }}>
                      {label}
                    </div>
                  );
                })}
                {Array.from({ length: (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) + 1 }, (_, i) => {
                  const leftPercent = (i / (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR)) * 100;
                  return (
                    <div key={`line-${i}`} className="absolute bottom-0 border-l border-slate-200" style={{ left: `${leftPercent}%`, height: 6 }} />
                  );
                })}
              </div>
            </div>
          </div>

          {technicians.map((tech) => {
            const techWorkOrders = getWorkOrdersForTech(tech.id);
            return (
              <DroppableScheduleRow key={tech.id} techId={tech.id}>
                {({ isOver, setDroppableRef }) => (
                  <>
                    <div className="w-48 flex-shrink-0 px-4 py-3 border-r border-slate-100 flex items-center gap-3 bg-white sticky left-0 z-10">
                      <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
                        <User className="w-6 h-6 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{tech.name}</p>
                        <p className="text-xs text-slate-400">{techWorkOrders.length} work orders</p>
                      </div>
                    </div>
                    
                    <ScheduleRowTimeline
                      isDragActive={!!activeId}
                      isOver={isOver}
                      droppableRef={setDroppableRef}
                      dragClickHourOffset={dragClickHourOffset}
                      previewDurationHours={activeDragDurationHours}
                      onPreviewTimeChange={(hourOffset) => onPreviewTimeChange?.(tech.id, hourOffset)}
                      onNodeRef={(node) => onRegisterTimelineNode?.(tech.id, node)}
                    >
                      {techWorkOrders.map((wo) => {
                        if (!wo.scheduledStart) return null;
                        const startDate = new Date(wo.scheduledStart);
                        const endDate = wo.scheduledEnd ? new Date(wo.scheduledEnd) : null;

                        const leftPercent = getScheduleLeftPercent(startDate);
                        const widthPercent = getScheduleWidthPercent(startDate, endDate);
                        const visitType = wo.visitType || "SERVICE";
                        const bgColor = visitType === "SERVICE"
                          ? (wo.priority === "high" ? "bg-red-100" : wo.priority === "low" ? "bg-green-100" : "bg-yellow-100")
                          : (scheduleVisitTypeColors[visitType] || scheduleVisitTypeColors.SERVICE);
                        const statusStripe = scheduleStatusStripes[wo.status] || scheduleStatusStripes.scheduled;

                        const localStartDate = toLocalTime(startDate);
                        const startMinutesFrom8 = (localStartDate.getHours() - SCHEDULE_START_HOUR) * 60 + localStartDate.getMinutes();
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
                            isDragging={activeId === wo.id}
                            onOpenQuickStatus={onOpenQuickStatus}
                          />
                        );
                      })}
                    </ScheduleRowTimeline>
                  </>
                )}
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
  onOpenQuickStatus?: (workOrderId: string, event: React.MouseEvent) => void;
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
  onOpenQuickStatus,
}: UnassignedQueueSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "unassigned-queue",
  });
  
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
    "NeedsScheduling",
    "WaitingOnParts",
    "PartsArrived",
    "OnHold",
  ];

  return (
    <div 
      ref={setNodeRef}
      className={`space-y-3 p-2 rounded-lg transition-colors ${isOver ? 'bg-amber-50 ring-2 ring-amber-400 ring-dashed' : ''}`}
      data-testid="unassigned-queue-section"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">
          Unassigned Queue ({workOrders.length})
          {isOver && <span className="ml-2 text-sm text-amber-600 font-normal">Drop here to unassign</span>}
        </h2>
      </div>
      
      {filteredWorkOrders.length === 0 ? (
        <Card className={`border-dashed ${isOver ? 'bg-amber-50 border-amber-300' : 'bg-slate-50'}`}>
          <CardContent className="py-8 text-center text-slate-500">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{isOver ? 'Drop here to unassign this work order' : 'No unassigned work orders match your filters'}</p>
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
              onOpenQuickStatus={onOpenQuickStatus}
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
                workOrder.status === 'dispatched' ? 'bg-blue-500 text-white' :
                workOrder.status === 'en_route' ? 'bg-blue-400 text-white' :
                workOrder.status === 'on_site' ? 'bg-green-500 text-white' :
                workOrder.status === 'completed' ? 'bg-gray-500 text-white' :
                'bg-gray-500 text-white'
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
    priority: wo.priority || wo.job?.priority || "normal",
    description: wo.description || wo.job?.description || null,
    techName: wo.tech?.name || null,
  };
}

type ViewMode = "day" | "week" | "month" | "trucks";

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
  const [previewHourByTech, setPreviewHourByTech] = useState<Record<string, number>>({});
  const previewHourByTechRef = useRef<Record<string, number>>({});
  const techTimelineNodesRef = useRef<Record<string, HTMLElement>>({});
  const dragClickHourOffsetRef = useRef(0);
  const activeCardWidthRef = useRef(0);
  const lastPointerXRef = useRef(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [localWorkOrders, setLocalWorkOrders] = useState<DispatchWorkOrder[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const [workOrderDescription, setWorkOrderDescription] = useState("");
  const { toast } = useToast();
  
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  
  // Calculate date range for API query based on view mode
  const dateRangeParams = useMemo((): { startDate: string; endDate: string } | { date: string } => {
    if (viewMode === "week") {
      const dates = getWeekDates(selectedDate);
      return {
        startDate: format(dates[0], "yyyy-MM-dd"),
        endDate: format(dates[6], "yyyy-MM-dd")
      };
    }
    if (viewMode === "month") {
      const monthStart = startOfMonth(selectedDate);
      const monthEnd = endOfMonth(selectedDate);
      return {
        startDate: format(monthStart, "yyyy-MM-dd"),
        endDate: format(monthEnd, "yyyy-MM-dd"),
      };
    }
    // Day view - use single date
    return { date: format(selectedDate, "yyyy-MM-dd") };
  }, [selectedDate, viewMode]);
  
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
  const [immediateAction, setImmediateAction] = useState<ImmediateAction>("create_now");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{
    workOrderId: string;
    techId: string | null;
    dropDate: Date;
    techName: string | null;
  } | null>(null);
  const [dropStartTime, setDropStartTime] = useState("08:00");
  const [dropEndTime, setDropEndTime] = useState("10:00");
  
  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = SCHEDULE_START_HOUR; hour <= SCHEDULE_END_HOUR; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === SCHEDULE_END_HOUR && minute > 0) break;
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

  // New customer inline creation state
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustFirstName, setNewCustFirstName] = useState("");
  const [newCustLastName, setNewCustLastName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress1, setNewCustAddress1] = useState("");
  const [newCustAddress2, setNewCustAddress2] = useState("");
  const [newCustCity, setNewCustCity] = useState("");
  const [newCustState, setNewCustState] = useState("");
  const [newCustZip, setNewCustZip] = useState("");
  const [newCustType, setNewCustType] = useState<string>("residential");

  // Quick status change popup state
  const [quickStatusMenu, setQuickStatusMenu] = useState<{ workOrderId: string; x: number; y: number } | null>(null);

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  
  const selectedWorkOrder = selectedWorkOrderId ? localWorkOrders.find(wo => wo.id === selectedWorkOrderId) : null;

  const handleWorkOrderClick = useCallback((workOrderId: string) => {
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    setSelectedWorkOrderId(workOrderId);
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

  const customers = (() => {
    const raw = customersData?.customers || [];
    if (!debouncedCustomerSearch.trim()) return raw;
    const searchLower = debouncedCustomerSearch.trim().toLowerCase();
    return [...raw].sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aExact = aName === searchLower ? 0 : aName.startsWith(searchLower) ? 1 : 2;
      const bExact = bName === searchLower ? 0 : bName.startsWith(searchLower) ? 1 : 2;
      return aExact - bExact;
    });
  })();

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

  // Auto-select property when properties load (single property = auto-select, otherwise select first)
  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  // New customer creation mutation
  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const fullName = `${newCustFirstName.trim()} ${newCustLastName.trim()}`.trim();
      if (!fullName) throw new Error("Customer name is required");
      if (!newCustAddress1.trim() || !newCustCity.trim() || !newCustState.trim() || !newCustZip.trim()) {
        throw new Error("Address, city, state, and zip are required");
      }

      const fullAddress = [newCustAddress1.trim(), newCustAddress2.trim(), `${newCustCity.trim()}, ${newCustState.trim()} ${newCustZip.trim()}`]
        .filter(Boolean)
        .join(", ");

      const res = await apiRequest("POST", "/api/crm/customers/create-with-property", {
        customer: {
          name: fullName,
          phone: newCustPhone.trim() || null,
          email: newCustEmail.trim() || null,
          customerType: newCustType,
          customerStatus: "client",
          fullAddress,
        },
        property: {
          address1: newCustAddress1.trim(),
          address2: newCustAddress2.trim() || null,
          city: newCustCity.trim(),
          state: newCustState.trim(),
          zip: newCustZip.trim(),
        },
      });

      return res.json();
    },
    onSuccess: (data: { customer: CrmCustomer; property: CrmProperty | null }) => {
      const { customer, property } = data;
      // Set the new customer as selected
      const customerWithInfo: CustomerWithInfo = {
        id: customer.id,
        name: customer.name,
        customerType: customer.customerType || "residential",
        fullAddress: customer.fullAddress || null,
      };
      setSelectedCustomer(customerWithInfo);
      // Auto-select the property
      if (property) {
        setSelectedPropertyId(property.id);
      }
      // Invalidate customers cache so the new customer shows up in searches
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/properties", customer.id] });
      // Reset the new customer form and hide it
      resetNewCustomerForm();
      setShowNewCustomerForm(false);
      toast({ title: "Customer created", description: `${customer.name} has been added and selected.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create customer", description: error.message, variant: "destructive" });
    },
  });

  const resetNewCustomerForm = () => {
    setNewCustFirstName("");
    setNewCustLastName("");
    setNewCustPhone("");
    setNewCustEmail("");
    setNewCustAddress1("");
    setNewCustAddress2("");
    setNewCustCity("");
    setNewCustState("");
    setNewCustZip("");
    setNewCustType("residential");
  };

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
    queryKey: ["/api/crm/dispatch/work-orders", dateRangeParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      if ('startDate' in dateRangeParams) {
        params.set('startDate', dateRangeParams.startDate);
        params.set('endDate', dateRangeParams.endDate);
      } else {
        params.set('date', dateRangeParams.date);
      }
      const res = await fetch(`/api/crm/dispatch/work-orders?${params.toString()}`, { credentials: "include" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders", dateRangeParams] });
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
          ? formatLocal(conflictInfo.scheduledStart, "h:mm a")
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
    setImmediateAction("create_now");
    setDueDate(undefined);
    // Reset new customer form
    setShowNewCustomerForm(false);
    resetNewCustomerForm();
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

    const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[workSubtype] || "OTHER";

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
      
      const effectiveTechId = assignedTechId === "unassigned" ? null : assignedTechId;
      
      if (immediateAction === "schedule_later" && !dueDate) {
        throw new Error("Due date is required for Schedule for Later");
      }
      
      // Validate required checklist questions are answered
      if (!areRequiredQuestionsAnswered()) {
        const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
        const missingQuestions = requiredQuestions.filter(q => {
          const answer = checklistAnswers[q.id];
          return answer === undefined || answer === "" || answer === null;
        });
        throw new Error(`Please answer required checklist questions: ${missingQuestions.map(q => q.question).join(", ")}`);
      }

      let scheduledStartUTC: Date | null = null;
      let scheduledEndUTC: Date | null = null;
      
      if (scheduledDate) {
        const [startHours, startMinutes] = startTime.split(":").map(Number);
        const [endHours, endMinutes] = endTime.split(":").map(Number);
        
        // Create dates in local timezone and convert to UTC for storage
        scheduledStartUTC = createLocalDateTime(scheduledDate, startHours, startMinutes);
        scheduledEndUTC = createLocalDateTime(scheduledDate, endHours, endMinutes);

        if (effectiveTechId) {
          const conflict = checkSchedulingConflict(localWorkOrders, effectiveTechId, scheduledStartUTC, scheduledEndUTC);
          if (conflict) {
            const techName = technicians.find(t => t.id === effectiveTechId)?.name || "This technician";
            const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
            throw new Error(`${techName} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}. You cannot schedule overlapping appointments.`);
          }
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
        scheduledStart: scheduledStartUTC ? scheduledStartUTC.toISOString() : null,
        scheduledEnd: scheduledEndUTC ? scheduledEndUTC.toISOString() : null,
        assignedTechId: effectiveTechId,
        priority,
        status: "scheduled",
        immediateAction,
        dueDate: dueDate ? dueDate.toISOString() : null,
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
      
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders", dateRangeParams] });
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
          ? formatLocal(conflictInfo.scheduledStart, "h:mm a")
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

  const handleQuickStatusChange = useCallback((workOrderId: string, newStatus: WorkOrderStatus) => {
    updateWorkOrderMutation.mutate({
      workOrderId,
      updates: { status: newStatus },
    }, {
      onSuccess: () => {
        toast({ title: "Status updated", description: `Status changed to ${statusLabels[newStatus]}` });
        setLocalWorkOrders(prev => prev.map(wo =>
          wo.id === workOrderId ? { ...wo, status: newStatus } : wo
        ));
      }
    });
    setQuickStatusMenu(null);
  }, [updateWorkOrderMutation, toast]);

  const handleOpenQuickStatus = useCallback((workOrderId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setQuickStatusMenu({ workOrderId, x: rect.left, y: rect.bottom + 4 });
  }, []);

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
        setSelectedWorkOrderId(null);
      }
    });
  }, [selectedWorkOrderId, updateWorkOrderMutation, toast]);

  const handleDeleteWorkOrder = useCallback(async () => {
    if (!selectedWorkOrderId) return;
    try {
      await apiRequest("DELETE", `/api/crm/work-orders/${selectedWorkOrderId}`);
      setLocalWorkOrders(prev => prev.filter(wo => wo.id !== selectedWorkOrderId));
      setSelectedWorkOrderId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders"] });
      toast({ title: "Work order deleted" });
    } catch {
      toast({ title: "Failed to delete work order", variant: "destructive" });
    }
  }, [selectedWorkOrderId, toast]);

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
      const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
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
        const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
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
    
    const startDate = createLocalDateTime(selectedDate, startHourInt, startMinutes);
    const endDate = createLocalDateTime(selectedDate, endHourInt, endMinutes);
    
    if (wo.assignedTechId) {
      const conflict = checkSchedulingConflict(localWorkOrders, wo.assignedTechId, startDate, endDate, workOrderId);
      if (conflict) {
        const techName = wo.techName || technicians.find(t => t.id === wo.assignedTechId)?.name || "This technician";
        const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
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
    const localStart = toLocalTime(newStart);
    const localEnd = toLocalTime(newEnd);
    if (localStart.getHours() < SCHEDULE_START_HOUR) {
      newStart = createLocalDateTime(selectedDate, SCHEDULE_START_HOUR, 0);
    }
    if (localEnd.getHours() > SCHEDULE_END_HOUR || (localEnd.getHours() === SCHEDULE_END_HOUR && localEnd.getMinutes() > 0)) {
      newEnd = createLocalDateTime(selectedDate, SCHEDULE_END_HOUR, 0);
    }

    if (newStart >= newEnd) return;
    
    // Check for scheduling conflict when resizing
    if (wo.assignedTechId) {
      const conflict = checkSchedulingConflict(localWorkOrders, wo.assignedTechId, newStart, newEnd, workOrderId);
      if (conflict) {
        const techName = wo.techName || technicians.find(t => t.id === wo.assignedTechId)?.name || "This technician";
        const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
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

  const pointerTracker = useRef<((e: PointerEvent) => void) | null>(null);

  const cleanupPointerTracker = useCallback(() => {
    if (pointerTracker.current) {
      document.removeEventListener('pointermove', pointerTracker.current);
      pointerTracker.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { cleanupPointerTracker(); };
  }, [cleanupPointerTracker]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    const isFromQueue = id.startsWith('queue-');
    setActiveFromQueue(isFromQueue);
    setPreviewHourByTech({});
    previewHourByTechRef.current = {};

    const activatorEvt = event.activatorEvent as MouseEvent | null;
    if (activatorEvt) {
      lastPointerXRef.current = activatorEvt.clientX;
    }
    const tracker = (e: PointerEvent) => { lastPointerXRef.current = e.clientX; };
    pointerTracker.current = tracker;
    document.addEventListener('pointermove', tracker);

    if (isFromQueue) {
      setActiveId(id.replace('queue-', ''));
      dragClickHourOffsetRef.current = 0;
      const activeRect = event.active.rect.current.initial;
      if (activeRect) {
        activeCardWidthRef.current = activeRect.width;
      }
    } else {
      let workOrderId = id;
      if (id.startsWith('schedule-')) {
        workOrderId = id.replace('schedule-', '');
        setActiveId(workOrderId);
      } else if (id.startsWith('month-job-')) {
        workOrderId = id.replace('month-job-', '');
        setActiveId(workOrderId);
      } else {
        setActiveId(id);
      }

      const wo = localWorkOrders.find(w => w.id === workOrderId);
      const activeRect = event.active.rect.current.initial;
      if (wo && activatorEvt && activeRect) {
        const duration = getWorkOrderDurationHours(wo);
        const clickFraction = Math.max(0, Math.min(1, (activatorEvt.clientX - activeRect.left) / activeRect.width));
        dragClickHourOffsetRef.current = clickFraction * duration;
        activeCardWidthRef.current = activeRect.width;
      } else {
        dragClickHourOffsetRef.current = 0;
        activeCardWidthRef.current = 120;
      }
    }
  }, [localWorkOrders]);

  const timelineRef = useRef<HTMLDivElement>(null);
  const dispatchBoardRef = useRef<HTMLDivElement>(null);
  
  const combinedModifiers = useMemo(() => {
    const restrictModifier = createRestrictToContainerModifier(dispatchBoardRef);
    return [restrictModifier];
  }, []);

  const getDropScheduleTimes = useCallback((workOrder: DispatchWorkOrder, dropDate: Date) => {
    const defaultDurationMs = 2 * 60 * 60 * 1000;
    let startHour = SCHEDULE_START_HOUR;
    let startMinutes = 0;
    let durationMs = defaultDurationMs;

    if (workOrder.scheduledStart) {
      const existingStart = toLocalTime(new Date(workOrder.scheduledStart));
      startHour = existingStart.getHours();
      startMinutes = existingStart.getMinutes();
    }

    if (workOrder.scheduledStart && workOrder.scheduledEnd) {
      const existingStart = new Date(workOrder.scheduledStart);
      const existingEnd = new Date(workOrder.scheduledEnd);
      const existingDuration = existingEnd.getTime() - existingStart.getTime();
      if (existingDuration > 0) {
        durationMs = existingDuration;
      }
    }

    const scheduledStartUTC = createLocalDateTime(dropDate, startHour, startMinutes);
    const scheduledEndUTC = new Date(scheduledStartUTC.getTime() + durationMs);

    return { scheduledStartUTC, scheduledEndUTC };
  }, []);

  const handleDragCleanup = useCallback(() => {
    cleanupPointerTracker();
    setActiveId(null);
    setActiveFromQueue(false);
    setPreviewHourByTech({});
    previewHourByTechRef.current = {};
  }, [cleanupPointerTracker]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    const snapshotPreviewByTech = { ...previewHourByTechRef.current };

    handleDragCleanup();

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
    } else if (activeIdStr.startsWith('month-job-')) {
      workOrderId = activeIdStr.replace('month-job-', '');
    }
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    
    if (!wo) return;
    
    // Handle dropping on the unassigned queue - clear assignment
    if (overId === 'unassigned-queue') {
      // Only allow dropping from schedule, not from queue itself
      if (!isFromSchedule) return;
      
      // Only process if the work order is currently assigned
      if (!wo.assignedTechId) return;
      
      // Clear the technician assignment
      setLocalWorkOrders(prev => prev.map(w => 
        w.id === workOrderId 
          ? { ...w, assignedTechId: null, techName: null } 
          : w
      ));

      updateWorkOrderMutation.mutate({
        workOrderId,
        updates: {
          assignedTechId: null,
        },
      });

      toast({
        title: "Work order unassigned",
        description: `Moved back to unassigned queue`,
      });
      return;
    }
    
    if (overId.startsWith('technician-')) {
      const newTechId = overId.replace('technician-', '');
      
      if (isFromQueue && !isFromSchedule) {
        const newTech = technicians.find(t => t.id === newTechId);
        const defaultDuration = 1;
        
        let newStartHour = SCHEDULE_START_HOUR;
        const previewHour = snapshotPreviewByTech[newTechId];
        if (previewHour !== undefined) {
          newStartHour = SCHEDULE_START_HOUR + previewHour;
        } else {
          const timelineNode = techTimelineNodesRef.current[newTechId];
          if (timelineNode) {
            const timelineRect = timelineNode.getBoundingClientRect();
            const snappedHourOffset = computeDropHourOffset(lastPointerXRef.current, timelineRect, dragClickHourOffsetRef.current, defaultDuration);
            newStartHour = SCHEDULE_START_HOUR + snappedHourOffset;
          }
        }
        
        const newEndHour = Math.min(newStartHour + defaultDuration, SCHEDULE_END_HOUR);
        
        const startHourInt = Math.floor(newStartHour);
        const startMinutes = Math.round((newStartHour % 1) * 60);
        const endHourInt = Math.floor(newEndHour);
        const endMinutes = Math.round((newEndHour % 1) * 60);
        
        const startDate = createLocalDateTime(selectedDate, startHourInt, startMinutes);
        const endDate = createLocalDateTime(selectedDate, endHourInt, endMinutes);
        
        const conflict = checkSchedulingConflict(localWorkOrders, newTechId, startDate, endDate, workOrderId);
        if (conflict) {
          const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
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
          description: `Assigned to ${newTech?.name || 'technician'} at ${formatHour(startHourInt)}`,
        });
      } else {
        const { startHour: origStart, endHour: origEnd } = getWorkOrderDisplayTimes(wo);
        const duration = origEnd - origStart;

        // Prefer the preview hour tracked during drag — it uses the exact
        // same snap logic as the visual preview rectangle, guaranteeing the
        // card lands where the user saw the highlight.
        let newStartHour = origStart;
        const previewHour = snapshotPreviewByTech[newTechId];
        if (previewHour !== undefined) {
          newStartHour = SCHEDULE_START_HOUR + Math.max(0, Math.min(
            previewHour,
            (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) - duration,
          ));
        } else {
          const timelineNode = techTimelineNodesRef.current[newTechId];
          if (timelineNode) {
            const timelineRect = timelineNode.getBoundingClientRect();
            const snappedHourOffset = computeDropHourOffset(lastPointerXRef.current, timelineRect, dragClickHourOffsetRef.current, duration);
            newStartHour = SCHEDULE_START_HOUR + snappedHourOffset;
          }
        }
        const newEndHour = newStartHour + duration;

        const startHourInt = Math.floor(newStartHour);
        const startMinutes = Math.round((newStartHour % 1) * 60);
        const endHourInt = Math.floor(newEndHour);
        const endMinutes = Math.round((newEndHour % 1) * 60);
        
        const startDate = createLocalDateTime(selectedDate, startHourInt, startMinutes);
        const endDate = createLocalDateTime(selectedDate, endHourInt, endMinutes);
        
        const newTech = technicians.find(t => t.id === newTechId);
        
        const conflict = checkSchedulingConflict(localWorkOrders, newTechId, startDate, endDate, workOrderId);
        if (conflict) {
          const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
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
    } else if (overId.startsWith('month-')) {
      const dateStr = overId.replace('month-', '');
      const dropDate = new Date(`${dateStr}T00:00:00`);

      if (wo.scheduledStart) {
        const existingStart = toLocalTime(new Date(wo.scheduledStart));
        setDropStartTime(`${String(existingStart.getHours()).padStart(2,'0')}:${String(existingStart.getMinutes()).padStart(2,'0')}`);
        if (wo.scheduledEnd) {
          const existingEnd = toLocalTime(new Date(wo.scheduledEnd));
          setDropEndTime(`${String(existingEnd.getHours()).padStart(2,'0')}:${String(existingEnd.getMinutes()).padStart(2,'0')}`);
        } else {
          const endH = existingStart.getHours() + 2;
          setDropEndTime(`${String(Math.min(endH, 20)).padStart(2,'0')}:${String(existingStart.getMinutes()).padStart(2,'0')}`);
        }
      } else {
        setDropStartTime("08:00");
        setDropEndTime("10:00");
      }

      setPendingDrop({
        workOrderId,
        techId: wo.assignedTechId || null,
        dropDate,
        techName: wo.techName || null,
      });
      setTimePickerOpen(true);
    } else if (overId.startsWith('week-')) {
      const parts = overId.replace('week-', '').split('-');
      const techId = parts[0];
      const dateStr = parts.slice(1).join('-');
      const dropDate = new Date(dateStr + 'T00:00:00');
      const newTech = technicians.find(t => t.id === techId);

      if (wo.scheduledStart) {
        const existingStart = toLocalTime(new Date(wo.scheduledStart));
        setDropStartTime(`${String(existingStart.getHours()).padStart(2,'0')}:${String(existingStart.getMinutes()).padStart(2,'0')}`);
        if (wo.scheduledEnd) {
          const existingEnd = toLocalTime(new Date(wo.scheduledEnd));
          setDropEndTime(`${String(existingEnd.getHours()).padStart(2,'0')}:${String(existingEnd.getMinutes()).padStart(2,'0')}`);
        } else {
          const endH = existingStart.getHours() + 2;
          setDropEndTime(`${String(Math.min(endH, 20)).padStart(2,'0')}:${String(existingStart.getMinutes()).padStart(2,'0')}`);
        }
      } else {
        setDropStartTime("08:00");
        setDropEndTime("10:00");
      }

      setPendingDrop({
        workOrderId,
        techId,
        dropDate,
        techName: newTech?.name || null,
      });
      setTimePickerOpen(true);
    }
  }, [getDropScheduleTimes, localWorkOrders, selectedDate, updateWorkOrderMutation, technicians, toast]);

  const handlePreviewTimeChange = useCallback((techId: string, hourOffset: number | null) => {
    if (hourOffset === null) {
      delete previewHourByTechRef.current[techId];
    } else {
      previewHourByTechRef.current[techId] = hourOffset;
    }
    setPreviewHourByTech((prev) => {
      if (hourOffset === null) {
        if (prev[techId] === undefined) return prev;
        const next = { ...prev };
        delete next[techId];
        return next;
      }

      if (prev[techId] === hourOffset) return prev;
      return { ...prev, [techId]: hourOffset };
    });
  }, []);

  const confirmTimePickerDrop = useCallback(() => {
    if (!pendingDrop) return;

    const { workOrderId, techId, dropDate, techName } = pendingDrop;

    const [startH, startM] = dropStartTime.split(':').map(Number);
    const [endH, endM] = dropEndTime.split(':').map(Number);

    const startDate = createLocalDateTime(dropDate, startH, startM);
    const endDate = createLocalDateTime(dropDate, endH, endM);

    if (endDate <= startDate) {
      toast({ title: "Invalid time range", description: "End time must be after start time", variant: "destructive" });
      return;
    }

    if (techId) {
      const conflict = checkSchedulingConflict(localWorkOrders, techId, startDate, endDate, workOrderId);
      if (conflict) {
        const conflictStart = conflict.scheduledStart ? formatLocal(conflict.scheduledStart, "h:mm a") : "unknown time";
        toast({
          title: "Scheduling Conflict",
          description: `${techName || 'This technician'} already has "${conflict.title || 'a work order'}" scheduled at ${conflictStart}.`,
          variant: "destructive",
        });
        return;
      }
    }

    const scheduledStartISO = startDate.toISOString();
    const scheduledEndISO = endDate.toISOString();

    const updates: any = {
      scheduledStart: scheduledStartISO,
      scheduledEnd: scheduledEndISO,
    };
    if (techId) {
      updates.assignedTechId = techId;
    }

    setLocalWorkOrders(prev => prev.map(w =>
      w.id === workOrderId
        ? { ...w, ...updates, techName: techId ? techName : w.techName, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any, assignedTechId: techId || w.assignedTechId }
        : w
    ));

    updateWorkOrderMutation.mutate({ workOrderId, updates });

    toast({
      title: "Work order scheduled",
      description: `Scheduled for ${format(dropDate, "MMM d")} at ${dropStartTime}${techName ? ` - ${techName}` : ''}`,
    });

    setTimePickerOpen(false);
    setPendingDrop(null);
  }, [pendingDrop, dropStartTime, dropEndTime, localWorkOrders, updateWorkOrderMutation, toast]);

  const activeDragDurationHours = useMemo(() => {
    if (!activeId) return 1;
    const draggingWorkOrder = localWorkOrders.find((workOrder) => workOrder.id === activeId);
    if (!draggingWorkOrder || activeFromQueue) return 1;
    return getWorkOrderDurationHours(draggingWorkOrder);
  }, [activeFromQueue, activeId, localWorkOrders]);

  const unassignedWorkOrders = useMemo(() => {
    const filtered = localWorkOrders.filter(wo => !wo.assignedTechId || !wo.scheduledStart);
    return filtered.sort((a, b) => {
      const aIsImmediate = (a as any).immediateAction === "create_now" && !a.scheduledStart;
      const bIsImmediate = (b as any).immediateAction === "create_now" && !b.scheduledStart;
      if (aIsImmediate && !bIsImmediate) return -1;
      if (!aIsImmediate && bIsImmediate) return 1;
      const aDue = (a as any).dueDate;
      const bDue = (b as any).dueDate;
      if (aDue && bDue) return new Date(aDue).getTime() - new Date(bDue).getTime();
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return 0;
    });
  }, [localWorkOrders]);

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
    scheduled: "Pending",
    dispatched: "Dispatched",
    en_route: "Traveling",
    on_site: "Working",
    completed: "Completed"
  };

  return (
    <CrmLayout currentUser={currentUser} disableScroll>
      <div className="flex flex-row h-full w-full overflow-hidden">
        {/* Main Content - flex-1 so it genuinely shrinks when sidebar opens */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden h-full">
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
                  if (viewMode === "week") {
                    newDate.setDate(newDate.getDate() - 7);
                  } else if (viewMode === "month") {
                    newDate.setMonth(newDate.getMonth() - 1);
                  } else {
                    newDate.setDate(newDate.getDate() - 1);
                  }
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
              ) : viewMode === "week" ? (
                <span className="text-sm font-medium text-slate-700 px-2 min-w-[160px] text-center">
                  {formatWeekRange(weekDates)}
                </span>
              ) : (
                <span className="text-sm font-medium text-slate-700 px-2 min-w-[160px] text-center">
                  {format(selectedDate, "MMMM yyyy")}
                </span>
              )}
              
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  if (viewMode === "week") {
                    newDate.setDate(newDate.getDate() + 7);
                  } else if (viewMode === "month") {
                    newDate.setMonth(newDate.getMonth() + 1);
                  } else {
                    newDate.setDate(newDate.getDate() + 1);
                  }
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
                {viewMode === "day" ? "Daily Schedule" : viewMode === "week" ? "Weekly Schedule" : viewMode === "month" ? "Monthly Schedule" : "Fleet Tracking"} {viewMode !== "trucks" && `- ${localWorkOrders.length} work orders`}
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
              <button
                onClick={() => setViewMode("month")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  viewMode === "month"
                    ? "text-[#711419] border-[#711419]"
                    : "text-slate-500 border-transparent hover:text-slate-700"
                }`}
                data-testid="button-view-month"
              >
                Month
              </button>
              <button
                onClick={() => setViewMode("trucks")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                  viewMode === "trucks" 
                    ? "text-[#711419] border-[#711419]" 
                    : "text-slate-500 border-transparent hover:text-slate-700"
                }`}
                data-testid="button-view-trucks"
              >
                <Truck className="h-4 w-4" />
                Trucks
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
                        <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200" />
                        <span className="text-sm text-slate-700">Install</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200" />
                        <span className="text-sm text-slate-700">Maintenance</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-indigo-100 border border-indigo-200" />
                        <span className="text-sm text-slate-700">Sales</span>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-3">Service (By Priority)</p>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-green-100 border border-green-200" />
                        <span className="text-sm text-slate-700">Low</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200" />
                        <span className="text-sm text-slate-700">Normal</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-red-100 border border-red-200" />
                        <span className="text-sm text-slate-700">High</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Status (Left Stripe)</p>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Pending</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Dispatched</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Traveling</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Working</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Completed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
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
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCleanup}
          modifiers={combinedModifiers}
        >
          <div ref={dispatchBoardRef} className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden">
            {/* Scrollable Technician Schedule - vertical scroll here, horizontal inside component */}
            <div className="flex-1 min-h-[200px] overflow-y-auto overflow-x-hidden">
              {viewMode === "trucks" ? (
                <TrucksMapView technicians={technicians} />
              ) : viewMode === "day" ? (
                <TechnicianScheduleBoard
                  technicians={technicians}
                  workOrders={localWorkOrders.filter(wo => wo.assignedTechId)}
                  onWorkOrderClick={handleWorkOrderClick}
                  selectedDate={selectedDate}
                  onResizeComplete={handleResizeComplete}
                  activeId={activeId}
                  dragClickHourOffset={dragClickHourOffsetRef.current}
                  onPreviewTimeChange={handlePreviewTimeChange}
                  onOpenQuickStatus={handleOpenQuickStatus}
                  activeDragDurationHours={activeDragDurationHours}
                  onRegisterTimelineNode={(techId, node) => {
                    if (node) {
                      techTimelineNodesRef.current[techId] = node;
                    } else {
                      delete techTimelineNodesRef.current[techId];
                    }
                  }}
                />
              ) : viewMode === "week" ? (
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
              ) : (
                <MonthDispatchBoard
                  workOrders={localWorkOrders}
                  selectedDate={selectedDate}
                  onWorkOrderClick={handleWorkOrderClick}
                  onDayClick={(date) => {
                    setSelectedDate(date);
                    setViewMode("day");
                  }}
                />
              )}
            </div>
            
            {/* Fixed Unassigned Queue - hidden in trucks view */}
            {viewMode !== "trucks" && (
            <div className="flex-shrink-0 max-h-[220px] overflow-y-auto overflow-x-hidden">
              <UnassignedQueueSection
                workOrders={unassignedWorkOrders}
                onWorkOrderClick={handleWorkOrderClick}
                technicians={technicians}
                onQuickAssign={handleQuickAssign}
                onQuickSchedule={handleQuickSchedule}
                onQuickStageChange={handleQuickStageChange}
                onQuickNote={handleQuickNote}
                selectedDate={selectedDate}
                onOpenQuickStatus={handleOpenQuickStatus}
              />
            </div>
            )}
          </div>
          
          {/* Drag Overlay - small cursor indicator; pointer-events:none so mouse events reach the timeline for accurate preview tracking */}
          <DragOverlay dropAnimation={null}>
            {activeId ? (() => {
              const wo = localWorkOrders.find(w => w.id === activeId);
              const title = wo?.title || wo?.customerName || 'Work Order';
              return (
                <div
                  className="rounded-md bg-slate-200/90 border border-slate-400/60 shadow-lg cursor-grabbing px-2 py-1 flex items-center gap-1.5"
                  style={{ width: activeFromQueue ? 140 : Math.min(activeCardWidthRef.current || 140, 200), height: 36, pointerEvents: 'none' }}
                >
                  <div className="w-1.5 h-5 rounded-full bg-slate-400/70 flex-shrink-0" />
                  <span className="text-[10px] font-medium text-slate-600 truncate">{title}</span>
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>

        </div>

        {/* Side Panel - Push Layout */}
        {selectedWorkOrder && (
          <div className="w-[400px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden shadow-lg" data-testid="workorder-detail-panel">
            {/* Panel Header — color reflects visit type */}
            <div className={`flex items-center justify-between px-4 py-3 flex-shrink-0 ${
              (selectedWorkOrder.visitType || "SERVICE") === "SERVICE"
                ? (selectedWorkOrder.priority === "high" ? "bg-red-600 text-white" : selectedWorkOrder.priority === "low" ? "bg-green-600 text-white" : "bg-yellow-500 text-white")
                : (visitTypeHeaderColors[selectedWorkOrder.visitType || "SERVICE"] || "bg-slate-600 text-white")
            }`}>
              <div>
                <h2 className="text-sm font-semibold" data-testid="panel-workorder-title">Work Order: {selectedWorkOrder.workOrderNumber}</h2>
                <p className="text-xs opacity-80">{visitTypeLabels[selectedWorkOrder.visitType || "SERVICE"] || selectedWorkOrder.visitType}</p>
              </div>
              <button
                onClick={() => setSelectedWorkOrderId(null)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors opacity-80 hover:opacity-100"
                aria-label="Close panel"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            
            {/* Panel Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
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
                      <span className="text-sm font-medium text-slate-900" data-testid="text-visit-type">{visitTypeLabels[selectedWorkOrder.visitType || "SERVICE"] || selectedWorkOrder.visitType || "Service"}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Priority</span>
                      <Badge 
                        variant={selectedWorkOrder.priority === "high" ? "destructive" : "secondary"}
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

                    {selectedWorkOrder.bookingSource === "online" && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Source</span>
                        <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">
                          Online Booking
                        </Badge>
                      </div>
                    )}

                    {selectedWorkOrder.customerPhone && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Phone</span>
                        <span className="text-sm font-medium text-slate-900">{selectedWorkOrder.customerPhone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">Update Status</h3>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden" data-testid="status-buttons">
                    {(["scheduled", "dispatched", "en_route", "on_site", "completed", "cancelled"] as WorkOrderStatus[]).map((status) => {
                      const isActive = selectedWorkOrder.status === status;
                      return (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          disabled={updateWorkOrderMutation.isPending}
                          data-testid={`button-status-${status}`}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                            isActive
                              ? "bg-slate-50 text-slate-900 font-medium"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <span>{statusLabels[status]}</span>
                          {isActive && (
                            updateWorkOrderMutation.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                              : <Check className="h-3.5 w-3.5 text-[#711419]" />
                          )}
                        </button>
                      );
                    })}
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
                  <button
                    onClick={handleSaveWorkOrderDetails}
                    disabled={updateWorkOrderMutation.isPending}
                    data-testid="button-save-work-order-details"
                    className="text-xs text-slate-500 hover:text-[#711419] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save Details
                  </button>
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
                  <button
                    onClick={handleSaveDispatchNotes}
                    disabled={!dispatchNote.trim() || updateWorkOrderMutation.isPending}
                    data-testid="button-save-dispatch-notes"
                    className="text-xs text-slate-500 hover:text-[#711419] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save Dispatch Notes
                  </button>
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
                  <button
                    onClick={handleSaveNotes}
                    disabled={!newNote.trim() || updateWorkOrderMutation.isPending}
                    data-testid="button-save-notes"
                    className="text-xs text-slate-500 hover:text-[#711419] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save Notes
                  </button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
                  <p className="text-xs text-slate-500">Add comments with @mentions to notify team members.</p>
                  <CommentComposer
                    entityType="work_order"
                    entityId={selectedWorkOrder.id}
                    placeholder="Add notes..."
                    onCommentPosted={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", "work_order", selectedWorkOrder.id] });
                    }}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Link href={`/crm/work-orders/${selectedWorkOrder.id}`}>
                      <Button
                        variant="ghost"
                        className="w-full h-7 justify-start text-xs text-slate-600 hover:text-slate-900 px-2"
                        data-testid="button-view-full-details"
                      >
                        <FileText className="h-3 w-3 mr-1.5 flex-shrink-0" />
                        View Details
                      </Button>
                    </Link>
                    {selectedWorkOrder.assignedTechId && (
                      <Button
                        variant="ghost"
                        className="w-full h-7 justify-start text-xs text-slate-600 hover:text-slate-900 px-2"
                        onClick={handleUnassign}
                        disabled={updateWorkOrderMutation.isPending}
                        data-testid="button-unassign"
                      >
                        <UserX className="h-3 w-3 mr-1.5 flex-shrink-0" />
                        Unassign
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full h-7 justify-start text-xs text-slate-500 hover:text-orange-600 px-2"
                          disabled={updateWorkOrderMutation.isPending || selectedWorkOrder.status === "cancelled"}
                          data-testid="button-cancel-wo"
                        >
                          <XCircle className="h-3 w-3 mr-1.5 flex-shrink-0" />
                          Cancel
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full h-7 justify-start text-xs text-slate-500 hover:text-red-600 px-2"
                          data-testid="button-delete-wo"
                        >
                          <Trash2 className="h-3 w-3 mr-1.5 flex-shrink-0" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Work Order?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the work order. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep It</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteWorkOrder} className="bg-red-600 hover:bg-red-700">
                            Delete Permanently
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Status Change Dropdown */}
      {quickStatusMenu && (() => {
        const wo = localWorkOrders.find(w => w.id === quickStatusMenu.workOrderId);
        if (!wo) return null;
        const dropdownItems: { status: WorkOrderStatus; icon: React.ReactNode; label: string; color: string }[] = [
          { status: "scheduled", icon: <Clock className="h-3.5 w-3.5" />, label: "Pending", color: "bg-yellow-400" },
          { status: "dispatched", icon: <Clipboard className="h-3.5 w-3.5" />, label: "Dispatched", color: "bg-blue-400" },
          { status: "en_route", icon: <Truck className="h-3.5 w-3.5" />, label: "Traveling", color: "bg-blue-400" },
          { status: "on_site", icon: <Wrench className="h-3.5 w-3.5" />, label: "Working", color: "bg-green-500" },
          { status: "completed", icon: <Check className="h-3.5 w-3.5" />, label: "Completed", color: "bg-gray-400" },
          { status: "cancelled", icon: <Ban className="h-3.5 w-3.5" />, label: "Cancelled", color: "bg-gray-400" },
        ];
        // Position: prefer below-right of icon, but flip if near viewport edge
        const menuHeight = 230;
        const menuWidth = 160;
        let top = quickStatusMenu.y;
        let left = quickStatusMenu.x;
        if (top + menuHeight > window.innerHeight) {
          top = Math.max(8, quickStatusMenu.y - menuHeight);
        }
        if (left + menuWidth > window.innerWidth) {
          left = Math.max(8, quickStatusMenu.x - menuWidth - 16);
        }
        return (
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setQuickStatusMenu(null)}
            />
            <div
              className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 w-[160px]"
              style={{ top, left }}
              data-testid="quick-status-dropdown"
            >
              {dropdownItems.map(({ status, icon, label, color }) => (
                <button
                  key={status}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickStatusChange(quickStatusMenu.workOrderId, status);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-slate-100 ${
                    wo.status === status ? "bg-slate-100 font-semibold" : "font-medium"
                  }`}
                  data-testid={`quick-status-${status}`}
                >
                  <span className={`${color} w-5 h-5 rounded flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white">{icon}</span>
                  </span>
                  <span className="text-slate-700">{label}</span>
                  {wo.status === status && (
                    <Check className="h-3.5 w-3.5 ml-auto text-slate-500" />
                  )}
                </button>
              ))}
            </div>
          </>
        );
      })()}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle>Create New Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Customer *</Label>
                {!showNewCustomerForm && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-[#711419] hover:text-[#5a1014] hover:bg-red-50"
                    onClick={() => {
                      // Pre-fill name from search query if present
                      if (customerSearch.trim()) {
                        const parts = customerSearch.trim().split(/\s+/);
                        setNewCustFirstName(parts[0] || "");
                        setNewCustLastName(parts.slice(1).join(" ") || "");
                      }
                      setShowNewCustomerForm(true);
                      setCustomerSearchOpen(false);
                      setSelectedCustomer(null);
                      setSelectedPropertyId("");
                      setSelectedProjectId("");
                    }}
                    data-testid="button-new-customer"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New Customer
                  </Button>
                )}
              </div>

              {showNewCustomerForm ? (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-700">Quick Add Customer</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-slate-500"
                      onClick={() => {
                        setShowNewCustomerForm(false);
                        resetNewCustomerForm();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">First Name *</Label>
                      <Input
                        value={newCustFirstName}
                        onChange={(e) => setNewCustFirstName(e.target.value)}
                        placeholder="John"
                        className="h-8 text-sm bg-white"
                        data-testid="input-new-cust-first-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last Name *</Label>
                      <Input
                        value={newCustLastName}
                        onChange={(e) => setNewCustLastName(e.target.value)}
                        placeholder="Smith"
                        className="h-8 text-sm bg-white"
                        data-testid="input-new-cust-last-name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                        className="h-8 text-sm bg-white"
                        data-testid="input-new-cust-phone"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input
                        value={newCustEmail}
                        onChange={(e) => setNewCustEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="h-8 text-sm bg-white"
                        data-testid="input-new-cust-email"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Address *</Label>
                    <Input
                      value={newCustAddress1}
                      onChange={(e) => setNewCustAddress1(e.target.value)}
                      placeholder="123 Main St"
                      className="h-8 text-sm bg-white"
                      data-testid="input-new-cust-address1"
                    />
                  </div>
                  <Input
                    value={newCustAddress2}
                    onChange={(e) => setNewCustAddress2(e.target.value)}
                    placeholder="Apt, Suite, Unit (optional)"
                    className="h-8 text-sm bg-white"
                    data-testid="input-new-cust-address2"
                  />
                  <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">City *</Label>
                      <Input
                        value={newCustCity}
                        onChange={(e) => setNewCustCity(e.target.value)}
                        placeholder="City"
                        className="h-8 text-sm bg-white"
                        data-testid="input-new-cust-city"
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">State *</Label>
                      <Input
                        value={newCustState}
                        onChange={(e) => setNewCustState(e.target.value)}
                        placeholder="TX"
                        maxLength={2}
                        className="h-8 text-sm bg-white"
                        data-testid="input-new-cust-state"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Zip *</Label>
                      <Input
                        value={newCustZip}
                        onChange={(e) => setNewCustZip(e.target.value)}
                        placeholder="12345"
                        className="h-8 text-sm bg-white"
                        data-testid="input-new-cust-zip"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Customer Type</Label>
                    <Select value={newCustType} onValueChange={setNewCustType}>
                      <SelectTrigger className="h-8 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="residential">Residential</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                        <SelectItem value="property_manager">Property Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    className="w-full h-8 text-sm bg-[#711419] hover:bg-[#5a1014]"
                    disabled={
                      !newCustFirstName.trim() || !newCustLastName.trim() ||
                      !newCustAddress1.trim() || !newCustCity.trim() || !newCustState.trim() || !newCustZip.trim() ||
                      createCustomerMutation.isPending
                    }
                    onClick={() => createCustomerMutation.mutate()}
                    data-testid="button-create-customer"
                  >
                    {createCustomerMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Create & Select Customer
                  </Button>
                </div>
              ) : (
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
                          {customersLoading ? (
                            "Searching..."
                          ) : (
                            <div className="py-2 space-y-2">
                              <p className="text-sm text-slate-500">No customers found.</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-[#711419] border-[#711419]/30 hover:bg-red-50"
                                onClick={() => {
                                  // Parse the search query into first/last name
                                  const parts = customerSearch.trim().split(/\s+/);
                                  setNewCustFirstName(parts[0] || "");
                                  setNewCustLastName(parts.slice(1).join(" ") || "");
                                  setCustomerSearchOpen(false);
                                  setShowNewCustomerForm(true);
                                }}
                                data-testid="button-new-customer-from-search"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Create "{customerSearch.trim()}" as New Customer
                              </Button>
                            </div>
                          )}
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
              )}
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
              <Label>Immediate Action *</Label>
              <Select value={immediateAction} onValueChange={(v) => setImmediateAction(v as ImmediateAction)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_now">Create Work Order Now</SelectItem>
                  <SelectItem value="schedule_later">Schedule for Later</SelectItem>
                </SelectContent>
              </Select>
              {immediateAction === "create_now" && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  This work order will appear in the dispatch queue for immediate scheduling
                </p>
              )}
            </div>

            {immediateAction === "schedule_later" && (
              <div className="space-y-2">
                <Label>Due Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "PPP") : "Pick a due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

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

            <>
                <div className="space-y-2">
                  <Label>Scheduled Date (Optional)</Label>
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
              </>

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
              disabled={!selectedCustomer || !selectedPropertyId || !woTitle.trim() || !woDescription.trim() || createWorkOrderMutation.isPending || !areRequiredQuestionsAnswered() || (immediateAction === "schedule_later" && !dueDate)}
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
      <Dialog open={timePickerOpen} onOpenChange={(open) => { if (!open) { setTimePickerOpen(false); setPendingDrop(null); } }}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>Select Time</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {pendingDrop ? format(pendingDrop.dropDate, "EEEE, MMM d, yyyy") : ""}
              {pendingDrop?.techName ? ` — ${pendingDrop.techName}` : ""}
            </p>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Start Time</label>
              <input
                type="time"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={dropStartTime}
                onChange={(e) => setDropStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">End Time</label>
              <input
                type="time"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={dropEndTime}
                onChange={(e) => setDropEndTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTimePickerOpen(false); setPendingDrop(null); }}>Cancel</Button>
            <Button onClick={confirmTimePickerDrop}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
