import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmWorkOrder, CrmJob, CrmCustomer, CrmProperty, CrmProject, WorkOrderStatus } from "@shared/schema";
import { workOrderVisitTypeEnum, type WorkOrderVisitType } from "@shared/schema";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

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
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  useDraggable,
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
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);
const SLOT_WIDTH = 48;
const HOUR_WIDTH = SLOT_WIDTH * 4;
const TIMELINE_WIDTH = TOTAL_HOURS * HOUR_WIDTH;

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
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatHour(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

function getWorkOrderDisplayTimes(workOrder: DispatchWorkOrder): { startHour: number; endHour: number } {
  if (!workOrder.scheduledStart || !workOrder.scheduledEnd) {
    return { startHour: START_HOUR, endHour: START_HOUR + 1 };
  }
  const start = new Date(workOrder.scheduledStart);
  const end = new Date(workOrder.scheduledEnd);
  const startHour = Math.max(START_HOUR, Math.min(END_HOUR, start.getHours() + start.getMinutes() / 60));
  const endHour = Math.max(START_HOUR, Math.min(END_HOUR, end.getHours() + end.getMinutes() / 60));
  return { startHour, endHour: endHour > startHour ? endHour : startHour + 1 };
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
    data: { workOrder },
    disabled: isResizing,
  });

  const handleResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
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
  }, [startHour, endHour]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const hoursPerPixel = TOTAL_HOURS / TIMELINE_WIDTH;
      const deltaX = e.clientX - resizeStartX.current;
      const deltaHours = deltaX * hoursPerPixel;
      
      if (isResizingLeft) {
        let newStart = Math.round((originalStart.current + deltaHours) * 4) / 4;
        newStart = Math.max(START_HOUR, Math.min(newStart, originalEnd.current - 0.25));
        setVisualStart(newStart);
      } else if (isResizingRight) {
        let newEnd = Math.round((originalEnd.current + deltaHours) * 4) / 4;
        newEnd = Math.max(originalStart.current + 0.25, Math.min(newEnd, END_HOUR));
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
  const leftPx = (displayStart - START_HOUR) * HOUR_WIDTH;
  const widthPx = (displayEnd - displayStart) * HOUR_WIDTH;

  const style: React.CSSProperties = {
    left: `${leftPx}px`,
    width: `${Math.max(widthPx, 48)}px`,
    transform: isDragging && transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
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
        <p className="text-xs font-medium truncate">{workOrder.customerName}</p>
        <p className="text-xs truncate opacity-70">{workOrder.jobType} #{workOrder.workOrderNumber}</p>
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
  const duration = endHour - startHour;
  const widthPx = Math.max(48, duration * HOUR_WIDTH);
  
  return (
    <div
      className={`rounded border-l-4 ${jobColors.bg} ${jobColors.border} ${jobColors.text} ${statusStripe} px-3 py-1 shadow-md cursor-grabbing flex flex-col justify-center relative ${isCompletedStatus ? 'opacity-60' : ''}`}
      style={{ width: `${widthPx}px`, height: '48px' }}
    >
      {workOrder.priority && workOrder.priority !== "normal" && (
        <div 
          className={`absolute top-0.5 right-1 px-1 py-0 text-[9px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}
        >
          {workOrder.priority.toUpperCase()}
        </div>
      )}
      <p className="text-xs font-medium truncate">{workOrder.customerName}</p>
      <p className="text-xs truncate opacity-70">{workOrder.jobType} #{workOrder.workOrderNumber}</p>
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
      className={`flex border-b border-slate-100 last:border-b-0 ${isOver ? 'bg-slate-50' : ''}`}
      data-testid={`technician-row-${tech.id}`}
    >
      <div className="w-44 flex-shrink-0 p-2 border-r border-slate-100 flex items-center sticky left-0 bg-white z-10">
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
      <div ref={setNodeRef} className={`relative h-14 ${isOver ? 'bg-slate-50' : ''}`} style={{ width: `${TIMELINE_WIDTH}px` }}>
        <div className="absolute inset-0 flex">
          {hours.map((hour) => (
            <div
              key={hour}
              className="border-r border-slate-200 last:border-r-0 flex"
              style={{ width: `${HOUR_WIDTH}px` }}
            >
              {[0, 1, 2, 3].map((q) => (
                <div key={q} className="flex-1 border-r border-slate-100 last:border-r-0" />
              ))}
            </div>
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

function UnassignedRow({ workOrders, onResize, activeId, onWorkOrderClick }: { workOrders: DispatchWorkOrder[]; onResize: (workOrderId: string, newStart: number, newEnd: number) => void; activeId: string | null; onWorkOrderClick?: (workOrderId: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `technician-unassigned`,
    data: { technicianId: null },
  });

  return (
    <div
      className={`flex border-b-2 border-slate-200 ${isOver ? 'bg-amber-50' : 'bg-amber-50/30'}`}
      data-testid="unassigned-row"
    >
      <div className="w-44 flex-shrink-0 p-2 border-r border-slate-100 flex items-center sticky left-0 bg-inherit z-10">
        <div className={`w-1 h-10 rounded-full mr-2 ${workOrders.length > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} />
        <div className="w-10 h-10 rounded bg-slate-300 flex items-center justify-center mr-2 flex-shrink-0">
          <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">Unassigned</p>
          <p className="text-xs text-amber-600">{workOrders.length} pending</p>
        </div>
      </div>
      <div ref={setNodeRef} className={`relative h-14 ${isOver ? 'bg-amber-50' : ''}`} style={{ width: `${TIMELINE_WIDTH}px` }}>
        <div className="absolute inset-0 flex">
          {hours.map((hour) => (
            <div
              key={hour}
              className="border-r border-slate-200 last:border-r-0 flex"
              style={{ width: `${HOUR_WIDTH}px` }}
            >
              {[0, 1, 2, 3].map((q) => (
                <div key={q} className="flex-1 border-r border-slate-100 last:border-r-0" />
              ))}
            </div>
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
            <p className={`text-xs ${jobColors.text} opacity-80`}>{workOrder.jobType} #{workOrder.workOrderNumber}</p>
          </div>
          <Badge variant="outline" className={`text-xs ${workOrder.priority && workOrder.priority !== "normal" ? 'mr-12' : ''}`}>
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
  return {
    ...wo,
    customerName: wo.customer?.name || "Unknown Customer",
    customerPhone: wo.customer?.phone || null,
    propertyAddress: wo.customer?.address1 || null,
    jobType: wo.job?.jobType || "Service",
    priority: wo.job?.priority || "normal",
    description: wo.job?.description || null,
    techName: wo.tech?.name || null,
  };
}

export default function CrmDispatch() {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [localWorkOrders, setLocalWorkOrders] = useState<DispatchWorkOrder[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const { toast } = useToast();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [woTitle, setWoTitle] = useState("");
  const [woDescription, setWoDescription] = useState("");
  const [visitType, setVisitType] = useState<WorkOrderVisitType>("SERVICE");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  
  // Generate 15-minute interval time options from 6:00 AM to 8:00 PM
  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 6; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        if (hour === 20 && minute > 0) break; // Stop at 8:00 PM
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

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  
  const selectedWorkOrder = selectedWorkOrderId ? localWorkOrders.find(wo => wo.id === selectedWorkOrderId) : null;

  const handleWorkOrderClick = useCallback((workOrderId: string) => {
    setSelectedWorkOrderId(workOrderId);
    setIsSheetOpen(true);
    setNewNote("");
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const dateString = selectedDate.toISOString().split("T")[0];

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: techniciansData } = useQuery<{ id: string; name: string; email: string; role: string }[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const techniciansList = useMemo(() => 
    (techniciansData || []).filter(u => u.role === "tech"),
    [techniciansData]
  );

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

  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery<any[]>({
    queryKey: ["/api/crm/dispatch/work-orders", dateString],
    queryFn: async () => {
      const res = await fetch(`/api/crm/dispatch/work-orders?date=${dateString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dispatch data");
      return res.json();
    },
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (workOrdersData) {
      setLocalWorkOrders(workOrdersData.map(enrichWorkOrder));
    }
  }, [workOrdersData]);

  const technicians: Technician[] = (techniciansData || [])
    .filter(u => u.role !== "owner")
    .map((u, idx) => ({
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update work order",
        description: error.message,
        variant: "destructive",
      });
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
    setScheduledDate(selectedDate);
    setStartTime("08:00");
    setEndTime("17:00");
    setAssignedTechId("unassigned");
    setPriority("normal");
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  };

  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error("Customer is required");
      if (!scheduledDate) throw new Error("Scheduled date is required");

      // Parse start and end times
      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const [endHours, endMinutes] = endTime.split(":").map(Number);
      
      const scheduledStart = new Date(scheduledDate);
      scheduledStart.setHours(startHours, startMinutes, 0, 0);
      
      const scheduledEnd = new Date(scheduledDate);
      scheduledEnd.setHours(endHours, endMinutes, 0, 0);

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId: selectedCustomer.id,
        propertyId: selectedPropertyId || null,
        projectId: selectedProjectId || null,
        title: woTitle || null,
        description: woDescription || null,
        visitType,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        assignedTechId: assignedTechId === "unassigned" ? null : assignedTechId,
        priority,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch/work-orders", dateString] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
      toast({ title: "Work order created", description: "New work order has been scheduled." });
      setCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (error: Error) => {
      toast({ title: "Creation failed", description: error.message, variant: "destructive" });
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
  }, [localWorkOrders, selectedDate, updateWorkOrderMutation]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const timelineRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    
    if (!over) return;
    
    const overId = over.id as string;
    const workOrderId = active.id as string;
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    
    if (!wo) return;
    
    if (overId.startsWith('technician-')) {
      const newTechId = overId.replace('technician-', '');
      const isUnassigned = newTechId === 'unassigned';
      const { startHour, endHour } = getWorkOrderDisplayTimes(wo);
      const duration = endHour - startHour;
      
      const hoursPerPixel = TOTAL_HOURS / TIMELINE_WIDTH;
      const deltaHours = Math.round((delta.x * hoursPerPixel) * 4) / 4;
      
      let newStartHour = startHour + deltaHours;
      newStartHour = Math.round(newStartHour * 4) / 4;
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
      
      const scheduledStartISO = startDate.toISOString();
      const scheduledEndISO = endDate.toISOString();

      const newTech = isUnassigned ? null : technicians.find(t => t.id === newTechId);

      setLocalWorkOrders(prev => prev.map(w => 
        w.id === workOrderId 
          ? { ...w, assignedTechId: isUnassigned ? null : newTechId, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any, techName: newTech?.name || null } 
          : w
      ));

      updateWorkOrderMutation.mutate({
        workOrderId,
        updates: {
          assignedTechId: isUnassigned ? null : newTechId,
          scheduledStart: scheduledStartISO,
          scheduledEnd: scheduledEndISO,
        },
      });
    }
  }, [localWorkOrders, selectedDate, updateWorkOrderMutation, technicians]);

  const filteredWorkOrders = localWorkOrders.filter((wo) => {
    // Apply search filter
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
    
    // Apply status filter
    if (filter === "all") return true;
    if (filter === "completed") return wo.status === "completed";
    return wo.status === filter;
  });

  const unassignedWorkOrders = filteredWorkOrders.filter(wo => !wo.assignedTechId);

  const getWorkOrdersForTechnician = useCallback((techId: string) => {
    return filteredWorkOrders.filter((wo) => wo.assignedTechId === techId);
  }, [filteredWorkOrders]);

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
    en_route: "En Route",
    on_site: "On Site",
    completed: "Completed"
  };

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        {/* Row 1: Search bar + Create Work Order button - aligned right so button sits above Date/Legend */}
        <div className="flex items-center justify-end gap-3 mb-3">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search work orders..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-9 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
              data-testid="input-search-dispatch"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              setScheduledDate(selectedDate);
              setCreateDialogOpen(true);
            }}
            className="bg-[#711419] hover:bg-[#5a1014] text-white"
            data-testid="button-create-work-order"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Work Order
          </Button>
        </div>

        {/* Row 2: Title + Date/Legend */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-dispatch-title">
              Dispatch Board
            </h1>
            <p className="text-slate-500 text-sm">Daily Schedule - {filteredWorkOrders.length} work orders</p>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-slate-600"
                  data-testid="button-date-picker"
                >
                  <CalendarDays className="h-4 w-4 mr-2" />
                  {dateDisplay}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  data-testid="calendar-picker"
                />
              </PopoverContent>
            </Popover>
            
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
                        <span className="text-sm text-slate-700">En Route</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">On Site</span>
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
          </div>
        </div>

        {/* Tabs styled like projects/customers page - underline style */}
        <div className="flex overflow-x-auto border-b border-slate-200" data-testid="filter-tabs">
          {(["all", "scheduled", "dispatched", "en_route", "on_site", "completed"] as FilterStatus[]).map((status) => {
            const count = status === "all" 
              ? localWorkOrders.length 
              : localWorkOrders.filter(wo => wo.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  filter === status
                    ? "border-[#711419] text-[#711419]"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                }`}
                data-testid={`tab-${status}`}
              >
                {filterLabels[status]} ({count})
              </button>
            );
          })}
        </div>

        <Card className="bg-white border hidden lg:block" data-testid="card-timeline">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base font-medium text-slate-800">
              Daily Schedule - {localWorkOrders.length} work orders
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <ScrollArea className="w-full" style={{ maxWidth: '100%' }}>
                <div style={{ width: `${TIMELINE_WIDTH + 176}px` }}>
                  <div className="flex border-b border-slate-100 sticky top-0 bg-white z-20">
                    <div className="w-44 flex-shrink-0 p-2 border-r border-slate-100 text-sm font-medium text-slate-700 sticky left-0 bg-white z-30">
                      Technicians
                    </div>
                    <div ref={timelineRef} className="flex" style={{ width: `${TIMELINE_WIDTH}px` }}>
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className="text-center py-2 text-xs text-slate-500 border-r border-slate-200 last:border-r-0"
                          style={{ width: `${HOUR_WIDTH}px` }}
                        >
                          {formatHour(hour)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <UnassignedRow 
                    workOrders={unassignedWorkOrders}
                    onResize={resizeWorkOrder}
                    activeId={activeId}
                    onWorkOrderClick={handleWorkOrderClick}
                  />

                  {technicians.map((tech) => (
                    <DroppableTechnicianRow
                      key={tech.id}
                      tech={tech}
                      workOrders={getWorkOrdersForTechnician(tech.id)}
                      onResize={resizeWorkOrder}
                      activeId={activeId}
                      onWorkOrderClick={handleWorkOrderClick}
                    />
                  ))}

                  {localWorkOrders.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      No work orders scheduled for this date
                    </div>
                  )}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              
              <DragOverlay>
                {activeWorkOrder ? <WorkOrderCardOverlay workOrder={activeWorkOrder} /> : null}
              </DragOverlay>
            </DndContext>
          </CardContent>
        </Card>

        <div className="lg:hidden space-y-4" data-testid="mobile-workorder-list">
          <Card className="bg-white border">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base font-medium text-slate-800">
                Today's Work Orders ({filteredWorkOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredWorkOrders.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No work orders match the current filter</p>
              ) : (
                filteredWorkOrders.map((wo) => {
                  const tech = technicians.find((t) => t.id === wo.assignedTechId);
                  return <MobileWorkOrderCard key={wo.id} workOrder={wo} technician={tech} onClick={handleWorkOrderClick} />;
                })
              )}
            </CardContent>
          </Card>
        </div>

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
                        {(() => {
                          const { startHour, endHour } = getWorkOrderDisplayTimes(selectedWorkOrder);
                          return `${formatHour(Math.floor(startHour))} - ${formatHour(Math.floor(endHour))}`;
                        })()}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Status</span>
                      <Badge 
                        className={`${statusColors[selectedWorkOrder.status]?.bg} ${statusColors[selectedWorkOrder.status]?.text} ${statusColors[selectedWorkOrder.status]?.border} border`}
                        data-testid="badge-status"
                      >
                        {statusLabels[selectedWorkOrder.status] || selectedWorkOrder.status}
                      </Badge>
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

                {selectedWorkOrder.checklist && selectedWorkOrder.checklist.length > 0 && (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <CheckSquare className="h-4 w-4" />
                        Checklist
                      </h3>
                      <div className="space-y-2">
                        {selectedWorkOrder.checklist.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <span className={`w-4 h-4 rounded border flex items-center justify-center ${item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300'}`}>
                              {item.completed && '✓'}
                            </span>
                            <span className={item.completed ? 'text-slate-500 line-through' : 'text-slate-700'}>{item.item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {selectedWorkOrder.partsUsed && selectedWorkOrder.partsUsed.length > 0 && (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Parts Used
                      </h3>
                      <div className="space-y-2">
                        {selectedWorkOrder.partsUsed.map((part, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700">{part.name} x{part.qty}</span>
                            <span className="text-slate-500">${(part.price * part.qty).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Tech Notes
                  </h3>
                  {selectedWorkOrder.techNotes && (
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedWorkOrder.techNotes}
                    </div>
                  )}
                  <Textarea
                    placeholder="Add notes about this work order..."
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
                    {updateWorkOrderMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Save Notes
                  </Button>
                </div>

                {selectedWorkOrder.description && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900">Job Description</h3>
                      <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
                        {selectedWorkOrder.description}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUnassign}
                      disabled={updateWorkOrderMutation.isPending || !selectedWorkOrder.assignedTechId}
                      data-testid="button-unassign"
                    >
                      <UserX className="h-4 w-4 mr-1" />
                      Unassign
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={updateWorkOrderMutation.isPending}
                          data-testid="button-cancel-workorder"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel Work Order
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Work Order?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to cancel this work order? This action cannot be easily undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Work Order</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCancelWorkOrder} className="bg-red-600 hover:bg-red-700">
                            Cancel Work Order
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {selectedWorkOrder.jobId && (
                  <>
                    <Separator />
                    <div className="pt-2">
                      <Link href={`/crm/jobs/${selectedWorkOrder.jobId}`}>
                        <Button variant="outline" size="sm" className="w-full" data-testid="link-view-job">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Parent Job
                        </Button>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Customer <span className="text-red-500">*</span></Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSearchOpen}
                    className="w-full justify-between font-normal"
                    data-testid="button-select-customer"
                  >
                    {selectedCustomer ? selectedCustomer.name : "Search for a customer..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type to search customers..."
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                      data-testid="input-customer-search"
                    />
                    <CommandList>
                      {customersLoading ? (
                        <div className="p-4 text-center text-sm text-slate-500">
                          Loading...
                        </div>
                      ) : customers.length === 0 ? (
                        <CommandEmpty>No customers found.</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {customers.map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.id}
                              onSelect={() => {
                                setSelectedCustomer(customer);
                                setSelectedPropertyId("");
                                setSelectedProjectId("");
                                setCustomerSearchOpen(false);
                                setCustomerSearch("");
                              }}
                              data-testid={`customer-option-${customer.id}`}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{customer.name}</span>
                                {customer.fullAddress && (
                                  <span className="text-xs text-slate-500">{customer.fullAddress}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedCustomer && properties.length > 0 && (
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={selectedPropertyId || "none"} onValueChange={(v) => setSelectedPropertyId(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-property">
                    <SelectValue placeholder="Select property (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No property selected</SelectItem>
                    {properties.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id}>
                        {prop.address1}, {prop.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={woTitle}
                onChange={(e) => setWoTitle(e.target.value)}
                placeholder="Optional title for this work order"
                data-testid="input-wo-title"
              />
            </div>

            <div className="space-y-2">
              <Label>Visit Type <span className="text-red-500">*</span></Label>
              <Select value={visitType} onValueChange={(v) => setVisitType(v as WorkOrderVisitType)}>
                <SelectTrigger data-testid="select-visit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workOrderVisitTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {visitTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scheduled Date <span className="text-red-500">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="button-scheduled-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, "MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={setScheduledDate}
                    data-testid="calendar-scheduled-date"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger data-testid="select-start-time">
                    <SelectValue placeholder="Start" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {timeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger data-testid="select-end-time">
                    <SelectValue placeholder="End" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {timeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigned Technician</Label>
              <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                <SelectTrigger data-testid="select-assigned-tech">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {techniciansList.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCustomer && projects.length > 0 && (
              <div className="space-y-2">
                <Label>Link to Project</Label>
                <Select value={selectedProjectId || "none"} onValueChange={(v) => setSelectedProjectId(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-project">
                    <SelectValue placeholder="Select project (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project linked</SelectItem>
                    {projects.map((proj) => (
                      <SelectItem key={proj.id} value={proj.id}>
                        {proj.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={woDescription}
                onChange={(e) => setWoDescription(e.target.value)}
                placeholder="Optional description or notes..."
                className="min-h-[80px]"
                data-testid="textarea-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                resetCreateForm();
              }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createWorkOrderMutation.mutate()}
              disabled={createWorkOrderMutation.isPending || !selectedCustomer || !scheduledDate}
              className="bg-[#711419] hover:bg-[#5a1014]"
              data-testid="button-submit-create"
            >
              {createWorkOrderMutation.isPending ? "Creating..." : "Create Work Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
