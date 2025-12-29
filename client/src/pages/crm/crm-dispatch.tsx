import { useEffect, useState, useRef, useCallback } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmWorkOrder, CrmJob, CrmCustomer, WorkOrderStatus } from "@shared/schema";
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

const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

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
      const parent = cardRef.current?.parentElement;
      if (!parent) return;
      
      const parentWidth = parent.offsetWidth;
      const hoursPerPixel = TOTAL_HOURS / parentWidth;
      const deltaX = e.clientX - resizeStartX.current;
      const deltaHours = deltaX * hoursPerPixel;
      
      if (isResizingLeft) {
        let newStart = Math.round(originalStart.current + deltaHours);
        newStart = Math.max(START_HOUR, Math.min(newStart, originalEnd.current - 1));
        setVisualStart(newStart);
      } else if (isResizingRight) {
        let newEnd = Math.round(originalEnd.current + deltaHours);
        newEnd = Math.max(originalStart.current + 1, Math.min(newEnd, END_HOUR));
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
  const widthPercent = ((displayEnd - displayStart) / TOTAL_HOURS) * 100;
  const leftPercent = ((displayStart - START_HOUR) / TOTAL_HOURS) * 100;

  const style: React.CSSProperties = {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    minWidth: "60px",
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

function WorkOrderCardOverlay({ workOrder, timelineWidth }: { workOrder: DispatchWorkOrder; timelineWidth: number }) {
  const jobColors = getJobTypeColor(workOrder.jobType);
  const statusStripe = statusStripeColors[workOrder.status] || statusStripeColors.scheduled;
  const priorityStyle = priorityBadgeColors[workOrder.priority || "normal"] || priorityBadgeColors.normal;
  const isCompletedStatus = ["completed", "cancelled"].includes(workOrder.status);
  const { startHour, endHour } = getWorkOrderDisplayTimes(workOrder);
  const duration = endHour - startHour;
  const widthPx = Math.max(60, (duration / TOTAL_HOURS) * timelineWidth);
  
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
      <div className="w-44 flex-shrink-0 p-2 border-r border-slate-100 flex items-center">
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
      <div ref={setNodeRef} className={`flex-1 relative h-14 ${isOver ? 'bg-slate-50' : ''}`}>
        <div className="absolute inset-0 flex">
          {hours.map((hour) => (
            <div
              key={hour}
              className="flex-1 border-r border-slate-200 last:border-r-0"
              style={{ minWidth: "50px" }}
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
      <div className="w-44 flex-shrink-0 p-2 border-r border-slate-100 flex items-center">
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
      <div ref={setNodeRef} className={`flex-1 relative h-14 ${isOver ? 'bg-amber-50' : ''}`}>
        <div className="absolute inset-0 flex">
          {hours.map((hour) => (
            <div
              key={hour}
              className="flex-1 border-r border-slate-200 last:border-r-0"
              style={{ minWidth: "50px" }}
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [localWorkOrders, setLocalWorkOrders] = useState<DispatchWorkOrder[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [selectedUnassignedId, setSelectedUnassignedId] = useState<string>("");
  const { toast } = useToast();
  
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

  const handleAssignWorkOrder = useCallback((workOrderId: string) => {
    if (!workOrderId) return;
    
    const wo = localWorkOrders.find(w => w.id === workOrderId);
    if (!wo) return;

    const startDate = new Date(selectedDate);
    startDate.setHours(8, 0, 0, 0);
    const endDate = new Date(selectedDate);
    endDate.setHours(9, 0, 0, 0);
    
    const scheduledStartISO = startDate.toISOString();
    const scheduledEndISO = endDate.toISOString();

    const updates: any = {
      scheduledStart: scheduledStartISO,
      scheduledEnd: scheduledEndISO,
    };
    
    if (wo.status !== "scheduled" && wo.status !== "dispatched" && wo.status !== "en_route" && wo.status !== "on_site" && wo.status !== "completed") {
      updates.status = "scheduled";
    }

    setLocalWorkOrders(prev => prev.map(w =>
      w.id === workOrderId 
        ? { ...w, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any, status: updates.status || w.status } 
        : w
    ));

    updateWorkOrderMutation.mutate({
      workOrderId,
      updates,
    }, {
      onSuccess: () => {
        toast({ title: "Work order scheduled", description: `Work order assigned to 8am-9am slot. Drag to a technician to assign.` });
        setSelectedUnassignedId("");
      },
      onError: () => {
        setSelectedUnassignedId("");
      }
    });
    
    setSelectedUnassignedId("");
  }, [localWorkOrders, selectedDate, updateWorkOrderMutation, toast]);

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
      
      const timelineWidth = timelineRef.current?.offsetWidth || 780;
      const hoursPerPixel = TOTAL_HOURS / timelineWidth;
      const deltaHours = Math.round(delta.x * hoursPerPixel);
      
      let newStartHour = startHour + deltaHours;
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
    if (filter === "all") return true;
    if (filter === "completed") return wo.status === "completed";
    return wo.status === filter;
  });

  // Unassigned = no technician assigned (regardless of whether times are set)
  const unassignedWorkOrders = filteredWorkOrders.filter(wo => !wo.assignedTechId);
  
  // Unassigned work orders with times appear in the timeline row
  const scheduledUnassignedWorkOrders = unassignedWorkOrders.filter(wo => wo.scheduledStart && wo.scheduledEnd);

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

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-dispatch-title">
              Dispatch Board
            </h1>
            <p className="text-slate-500 text-sm flex items-center gap-2 mt-1">
              <CalendarDays className="h-4 w-4" />
              Schedule and manage work orders
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="text-slate-600 py-1.5 px-3 h-auto"
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

            <Select 
              value={selectedUnassignedId} 
              onValueChange={handleAssignWorkOrder}
              disabled={unassignedWorkOrders.length === 0}
            >
              <SelectTrigger className="w-[280px]" data-testid="select-unassigned-workorder">
                <SelectValue placeholder={unassignedWorkOrders.length > 0 
                  ? `Unassigned Work Orders (${unassignedWorkOrders.length})` 
                  : "No unassigned work orders"} />
              </SelectTrigger>
              <SelectContent>
                {unassignedWorkOrders.map(wo => (
                  <SelectItem key={wo.id} value={wo.id} data-testid={`option-workorder-${wo.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{wo.customerName}</span>
                      <Badge variant="outline" className="text-xs">{wo.jobType}</Badge>
                      {wo.propertyAddress && (
                        <span className="text-xs text-slate-500 truncate max-w-[100px]">{wo.propertyAddress}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center" data-testid="filter-buttons">
          {(["all", "scheduled", "dispatched", "en_route", "on_site", "completed"] as FilterStatus[]).map((status) => {
            const count = status === "all" 
              ? localWorkOrders.length 
              : localWorkOrders.filter(wo => wo.status === status).length;
            const labels: Record<FilterStatus, string> = {
              all: "All",
              scheduled: "Scheduled",
              dispatched: "Dispatched",
              en_route: "En Route",
              on_site: "On Site",
              completed: "Completed"
            };
            return (
              <Button
                key={status}
                variant={filter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(status)}
                data-testid={`filter-${status}`}
              >
                {labels[status]} ({count})
              </Button>
            );
          })}
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="ml-2 text-slate-600" data-testid="button-legend">
                <Info className="h-4 w-4 mr-1.5" />
                Legend
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-0" align="end">
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Job Type (Background)</p>
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
              <ScrollArea className="w-full">
                <div className="min-w-[800px]">
                  <div className="flex border-b border-slate-100">
                    <div className="w-44 flex-shrink-0 p-2 border-r border-slate-100 text-sm font-medium text-slate-700">
                      Technicians
                    </div>
                    <div ref={timelineRef} className="flex-1 flex">
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className="flex-1 text-center py-2 text-xs text-slate-500 border-r border-slate-200 last:border-r-0"
                          style={{ minWidth: "50px" }}
                        >
                          {formatHour(hour)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {scheduledUnassignedWorkOrders.length > 0 && (
                    <UnassignedRow 
                      workOrders={scheduledUnassignedWorkOrders}
                      onResize={resizeWorkOrder}
                      activeId={activeId}
                      onWorkOrderClick={handleWorkOrderClick}
                    />
                  )}

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
                {activeWorkOrder ? <WorkOrderCardOverlay workOrder={activeWorkOrder} timelineWidth={timelineRef.current?.offsetWidth || 780} /> : null}
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
                      <span className="text-sm text-slate-500">Job Type</span>
                      <span className="text-sm font-medium text-slate-900" data-testid="text-job-type">{selectedWorkOrder.jobType}</span>
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
    </CrmLayout>
  );
}
