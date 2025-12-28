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
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmJob } from "@shared/schema";
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

type JobStatus = "new" | "scheduled" | "dispatched" | "en_route" | "on_site" | "completed" | "invoiced" | "paid" | "cancelled";
type FilterStatus = "all" | "new" | "scheduled" | "dispatched" | "en_route" | "on_site" | "completed";

interface DispatchJob extends CrmJob {
  customerName: string;
  assignedTechId: string | null;
  assignmentId: string | null;
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
  new: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700" },
  scheduled: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  dispatched: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  en_route: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  on_site: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  completed: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  invoiced: { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700" },
  paid: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  cancelled: { bg: "bg-red-50", border: "border-red-200", text: "text-red-500" },
};

const jobTypeColors: Record<string, { bg: string; border: string; text: string }> = {
  SERVICE: { bg: "bg-sky-100", border: "border-sky-200", text: "text-sky-900" },
  MAINTENANCE: { bg: "bg-emerald-100", border: "border-emerald-200", text: "text-emerald-900" },
  INSTALL: { bg: "bg-amber-100", border: "border-amber-200", text: "text-amber-900" },
  SALES: { bg: "bg-rose-100", border: "border-rose-200", text: "text-rose-900" },
};

const statusStripeColors: Record<string, string> = {
  new: "border-l-slate-400",
  scheduled: "border-l-blue-500",
  dispatched: "border-l-purple-500",
  en_route: "border-l-amber-500",
  on_site: "border-l-orange-500",
  completed: "border-l-green-500",
  invoiced: "border-l-green-500",
  paid: "border-l-green-500",
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
  new: "New",
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

function formatHour(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

function getJobDisplayTimes(job: DispatchJob): { startHour: number; endHour: number } {
  if (!job.scheduledStart || !job.scheduledEnd) {
    return { startHour: START_HOUR, endHour: START_HOUR + 1 };
  }
  const start = new Date(job.scheduledStart);
  const end = new Date(job.scheduledEnd);
  // Use UTC hours since times are stored and queried in UTC
  const startHour = Math.max(START_HOUR, Math.min(END_HOUR, start.getUTCHours() + start.getUTCMinutes() / 60));
  const endHour = Math.max(START_HOUR, Math.min(END_HOUR, end.getUTCHours() + end.getUTCMinutes() / 60));
  return { startHour, endHour: endHour > startHour ? endHour : startHour + 1 };
}

interface DraggableJobCardProps {
  job: DispatchJob;
  onResize: (jobId: string, newStart: number, newEnd: number) => void;
  isDragging?: boolean;
  onClick?: (jobId: string) => void;
}

function DraggableJobCard({ job, onResize, isDragging, onClick }: DraggableJobCardProps) {
  const jobColors = getJobTypeColor(job.jobType);
  const statusStripe = statusStripeColors[job.status] || statusStripeColors.new;
  const priorityStyle = priorityBadgeColors[job.priority || "normal"] || priorityBadgeColors.normal;
  const isCompletedStatus = ["completed", "invoiced", "paid", "cancelled"].includes(job.status);
  const { startHour, endHour } = getJobDisplayTimes(job);
  
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
    id: job.id,
    data: { job },
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
        onResize(job.id, visualStart, originalEnd.current);
      } else if (isResizingRight) {
        onResize(job.id, originalStart.current, visualEnd);
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
  }, [isResizing, isResizingLeft, isResizingRight, job.id, visualStart, visualEnd, onResize]);

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
      data-testid={`job-card-${job.id}`}
    >
      {job.priority && job.priority !== "normal" && (
        <div 
          className={`absolute top-0.5 right-1 px-1 py-0 text-[9px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}
          data-testid={`priority-badge-${job.id}`}
        >
          {job.priority.toUpperCase()}
        </div>
      )}
      
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center hover:bg-black/10"
        onMouseDown={(e) => handleResizeStart(e, 'left')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-left-${job.id}`}
      >
        <div className="w-0.5 h-4 bg-current opacity-30 rounded" />
      </div>
      
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center hover:bg-black/10"
        onMouseDown={(e) => handleResizeStart(e, 'right')}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`resize-right-${job.id}`}
      >
        <div className="w-0.5 h-4 bg-current opacity-30 rounded" />
      </div>

      <div 
        className="flex flex-col h-full justify-center px-3 py-1 cursor-grab"
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(job.id);
        }}
      >
        <p className="text-xs font-medium truncate">{job.customerName}</p>
        <p className="text-xs truncate opacity-70">{job.jobType}</p>
      </div>
    </div>
  );
}

function JobCardOverlay({ job, timelineWidth }: { job: DispatchJob; timelineWidth: number }) {
  const jobColors = getJobTypeColor(job.jobType);
  const statusStripe = statusStripeColors[job.status] || statusStripeColors.new;
  const priorityStyle = priorityBadgeColors[job.priority || "normal"] || priorityBadgeColors.normal;
  const isCompletedStatus = ["completed", "invoiced", "paid", "cancelled"].includes(job.status);
  const { startHour, endHour } = getJobDisplayTimes(job);
  const duration = endHour - startHour;
  const widthPx = Math.max(60, (duration / TOTAL_HOURS) * timelineWidth);
  
  return (
    <div
      className={`rounded border-l-4 ${jobColors.bg} ${jobColors.border} ${jobColors.text} ${statusStripe} px-3 py-1 shadow-md cursor-grabbing flex flex-col justify-center relative ${isCompletedStatus ? 'opacity-60' : ''}`}
      style={{ width: `${widthPx}px`, height: '48px' }}
    >
      {job.priority && job.priority !== "normal" && (
        <div 
          className={`absolute top-0.5 right-1 px-1 py-0 text-[9px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}
        >
          {job.priority.toUpperCase()}
        </div>
      )}
      <p className="text-xs font-medium truncate">{job.customerName}</p>
      <p className="text-xs truncate opacity-70">{job.jobType}</p>
    </div>
  );
}

interface DroppableTechnicianRowProps {
  tech: Technician;
  jobs: DispatchJob[];
  onResize: (jobId: string, newStart: number, newEnd: number) => void;
  activeId: string | null;
  onJobClick?: (jobId: string) => void;
}

function DroppableTechnicianRow({ tech, jobs, onResize, activeId, onJobClick }: DroppableTechnicianRowProps) {
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
        <div className={`w-1 h-10 rounded-full mr-2 ${jobs.length > 0 ? 'bg-green-500' : 'bg-slate-300'}`} />
        <div className="w-10 h-10 rounded bg-slate-200 flex items-center justify-center mr-2 flex-shrink-0">
          <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{tech.name}</p>
          <p className="text-xs text-slate-400">{jobs.length} jobs today</p>
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
        {jobs.map((job) => (
          <DraggableJobCard 
            key={job.id} 
            job={job} 
            onResize={onResize}
            isDragging={activeId === job.id}
            onClick={onJobClick}
          />
        ))}
      </div>
    </div>
  );
}

function UnassignedRow({ jobs, onResize, activeId, onJobClick }: { jobs: DispatchJob[]; onResize: (jobId: string, newStart: number, newEnd: number) => void; activeId: string | null; onJobClick?: (jobId: string) => void }) {
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
        <div className={`w-1 h-10 rounded-full mr-2 ${jobs.length > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} />
        <div className="w-10 h-10 rounded bg-slate-300 flex items-center justify-center mr-2 flex-shrink-0">
          <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">Unassigned</p>
          <p className="text-xs text-amber-600">{jobs.length} pending</p>
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
        {jobs.map((job) => (
          <DraggableJobCard 
            key={job.id} 
            job={job} 
            onResize={onResize}
            isDragging={activeId === job.id}
            onClick={onJobClick}
          />
        ))}
      </div>
    </div>
  );
}

function MobileJobCard({ job, technician, onClick }: { job: DispatchJob; technician?: Technician; onClick?: (jobId: string) => void }) {
  const jobColors = getJobTypeColor(job.jobType);
  const statusStripe = statusStripeColors[job.status] || statusStripeColors.new;
  const priorityStyle = priorityBadgeColors[job.priority || "normal"] || priorityBadgeColors.normal;
  const isCompletedStatus = ["completed", "invoiced", "paid", "cancelled"].includes(job.status);
  const { startHour, endHour } = getJobDisplayTimes(job);

  return (
    <Card 
      className={`${jobColors.bg} ${jobColors.border} border border-l-4 ${statusStripe} cursor-pointer hover:shadow-md transition-shadow ${isCompletedStatus ? 'opacity-60' : ''}`} 
      data-testid={`mobile-job-card-${job.id}`}
      onClick={() => onClick?.(job.id)}
    >
      <CardContent className="p-3 relative">
        {job.priority && job.priority !== "normal" && (
          <div 
            className={`absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-bold rounded ${priorityStyle.bg} ${priorityStyle.text}`}
            data-testid={`mobile-priority-badge-${job.id}`}
          >
            {job.priority.toUpperCase()}
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${jobColors.text}`}>{job.customerName}</p>
            <p className={`text-xs ${jobColors.text} opacity-80`}>{job.jobType}</p>
          </div>
          <Badge variant="outline" className={`text-xs ${job.priority && job.priority !== "normal" ? 'mr-12' : ''}`}>
            {statusLabels[job.status] || job.status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatHour(Math.floor(startHour))} - {formatHour(Math.floor(endHour))}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{technician?.name || "Unassigned"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DispatchData {
  technicians: { id: string; name: string; email: string; role: string }[];
  jobs: DispatchJob[];
  date: string;
}

export default function CrmDispatch() {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [localJobs, setLocalJobs] = useState<DispatchJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const { toast } = useToast();
  
  const selectedJob = selectedJobId ? localJobs.find(j => j.id === selectedJobId) : null;

  const handleJobClick = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
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

  const { data: dispatchData, isLoading: dispatchLoading } = useQuery<DispatchData>({
    queryKey: ["/api/crm/dispatch", dateString],
    queryFn: async () => {
      const res = await fetch(`/api/crm/dispatch?date=${dateString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dispatch data");
      return res.json();
    },
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (dispatchData?.jobs) {
      setLocalJobs(dispatchData.jobs);
    }
  }, [dispatchData?.jobs]);

  const technicians: Technician[] = (dispatchData?.technicians || [])
    .filter(u => u.role !== "owner")
    .map((u, idx) => ({
      id: u.id,
      name: u.name,
      initials: getInitials(u.name),
      color: techColors[idx % techColors.length],
    }));

  const updateJobMutation = useMutation({
    mutationFn: async (data: { jobId: string; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/crm/jobs/${data.jobId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch", dateString] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update job",
        description: error.message,
        variant: "destructive",
      });
      if (dispatchData?.jobs) {
        setLocalJobs(dispatchData.jobs);
      }
    },
  });

  const handleStatusChange = useCallback((newStatus: JobStatus) => {
    if (!selectedJobId) return;
    updateJobMutation.mutate({
      jobId: selectedJobId,
      updates: { status: newStatus },
    }, {
      onSuccess: () => {
        toast({ title: "Status updated", description: `Job status changed to ${statusLabels[newStatus]}` });
        setLocalJobs(prev => prev.map(j => 
          j.id === selectedJobId ? { ...j, status: newStatus } : j
        ));
      }
    });
  }, [selectedJobId, updateJobMutation, toast]);

  const handleUnassign = useCallback(() => {
    if (!selectedJobId) return;
    updateJobMutation.mutate({
      jobId: selectedJobId,
      updates: { assignedTechId: null, scheduledStart: null, scheduledEnd: null },
    }, {
      onSuccess: () => {
        toast({ title: "Technician unassigned", description: "Job moved to unassigned queue" });
        setLocalJobs(prev => prev.map(j => 
          j.id === selectedJobId ? { ...j, assignedTechId: null, scheduledStart: null, scheduledEnd: null } as DispatchJob : j
        ));
      }
    });
  }, [selectedJobId, updateJobMutation, toast]);

  const handleCancelJob = useCallback(() => {
    if (!selectedJobId) return;
    updateJobMutation.mutate({
      jobId: selectedJobId,
      updates: { status: "cancelled", scheduledStart: null, scheduledEnd: null },
    }, {
      onSuccess: () => {
        toast({ title: "Job cancelled", description: "The job has been cancelled" });
        setLocalJobs(prev => prev.map(j => 
          j.id === selectedJobId ? { ...j, status: "cancelled" as JobStatus, scheduledStart: null, scheduledEnd: null } as DispatchJob : j
        ));
        setIsSheetOpen(false);
      }
    });
  }, [selectedJobId, updateJobMutation, toast]);

  const handleSaveNotes = useCallback(() => {
    if (!selectedJobId || !newNote.trim()) return;
    const currentJob = localJobs.find(j => j.id === selectedJobId);
    const updatedDescription = currentJob?.description 
      ? `${currentJob.description}\n\n---\n${new Date().toLocaleDateString()}: ${newNote.trim()}`
      : newNote.trim();
    
    updateJobMutation.mutate({
      jobId: selectedJobId,
      updates: { description: updatedDescription },
    }, {
      onSuccess: () => {
        toast({ title: "Notes saved", description: "Job notes have been updated" });
        setLocalJobs(prev => prev.map(j => 
          j.id === selectedJobId ? { ...j, description: updatedDescription } : j
        ));
        setNewNote("");
      }
    });
  }, [selectedJobId, newNote, localJobs, updateJobMutation, toast]);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const resizeJob = useCallback((jobId: string, newStart: number, newEnd: number) => {
    const job = localJobs.find(j => j.id === jobId);
    if (!job) return;

    // Use the same UTC date string that the query uses
    const baseDateStr = selectedDate.toISOString().split("T")[0];
    
    // Create UTC dates directly to avoid timezone issues
    const startHourInt = Math.floor(newStart);
    const startMinutes = Math.round((newStart % 1) * 60);
    const endHourInt = Math.floor(newEnd);
    const endMinutes = Math.round((newEnd % 1) * 60);
    
    const scheduledStartISO = `${baseDateStr}T${String(startHourInt).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}:00.000Z`;
    const scheduledEndISO = `${baseDateStr}T${String(endHourInt).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00.000Z`;

    setLocalJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any } : j
    ));

    updateJobMutation.mutate({
      jobId,
      updates: {
        scheduledStart: scheduledStartISO,
        scheduledEnd: scheduledEndISO,
      },
    });
  }, [localJobs, selectedDate, updateJobMutation]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const timelineRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    
    if (!over) return;
    
    const overId = over.id as string;
    const jobId = active.id as string;
    const job = localJobs.find(j => j.id === jobId);
    
    if (!job) return;
    
    if (overId.startsWith('technician-')) {
      const newTechId = overId.replace('technician-', '');
      const isUnassigned = newTechId === 'unassigned';
      const { startHour, endHour } = getJobDisplayTimes(job);
      const duration = endHour - startHour;
      
      const timelineWidth = timelineRef.current?.offsetWidth || 780;
      const hoursPerPixel = TOTAL_HOURS / timelineWidth;
      const deltaHours = Math.round(delta.x * hoursPerPixel);
      
      let newStartHour = startHour + deltaHours;
      newStartHour = Math.max(START_HOUR, Math.min(newStartHour, END_HOUR - duration));
      const newEndHour = newStartHour + duration;

      // Use the same UTC date string that the query uses
      const baseDateStr = selectedDate.toISOString().split("T")[0];
      
      // Create UTC dates directly to avoid timezone issues
      const startHourInt = Math.floor(newStartHour);
      const startMinutes = Math.round((newStartHour % 1) * 60);
      const endHourInt = Math.floor(newEndHour);
      const endMinutes = Math.round((newEndHour % 1) * 60);
      
      const scheduledStartISO = `${baseDateStr}T${String(startHourInt).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}:00.000Z`;
      const scheduledEndISO = `${baseDateStr}T${String(endHourInt).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00.000Z`;

      setLocalJobs(prev => prev.map(j => 
        j.id === jobId 
          ? { ...j, assignedTechId: isUnassigned ? null : newTechId, scheduledStart: scheduledStartISO as any, scheduledEnd: scheduledEndISO as any } 
          : j
      ));

      updateJobMutation.mutate({
        jobId,
        updates: {
          assignedTechId: isUnassigned ? null : newTechId,
          scheduledStart: scheduledStartISO,
          scheduledEnd: scheduledEndISO,
        },
      });
    }
  }, [localJobs, selectedDate, updateJobMutation]);

  const filteredJobs = localJobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "completed") return ["completed", "invoiced", "paid"].includes(job.status);
    return job.status === filter;
  });

  const unassignedJobs = filteredJobs.filter(job => !job.assignedTechId);

  const getJobsForTechnician = useCallback((techId: string) => {
    return filteredJobs.filter((job) => job.assignedTechId === techId);
  }, [filteredJobs]);

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

  const activeJob = activeId ? localJobs.find(job => job.id === activeId) : null;

  if (authLoading || dispatchLoading) {
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
              Schedule and manage technician assignments
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
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center" data-testid="filter-buttons">
          {(["all", "new", "scheduled", "dispatched", "en_route", "on_site", "completed"] as FilterStatus[]).map((status) => {
            const count = status === "all" 
              ? localJobs.length 
              : status === "completed" 
                ? localJobs.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).length
                : localJobs.filter(j => j.status === status).length;
            const labels: Record<FilterStatus, string> = {
              all: "All",
              new: "New",
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
                      <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700">New</span>
                    </div>
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
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Card className="bg-white border hidden lg:block" data-testid="card-timeline">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base font-medium text-slate-800">
              Daily Schedule - {localJobs.length} jobs
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

                  <UnassignedRow 
                    jobs={unassignedJobs}
                    onResize={resizeJob}
                    activeId={activeId}
                    onJobClick={handleJobClick}
                  />

                  {technicians.map((tech) => (
                    <DroppableTechnicianRow
                      key={tech.id}
                      tech={tech}
                      jobs={getJobsForTechnician(tech.id)}
                      onResize={resizeJob}
                      activeId={activeId}
                      onJobClick={handleJobClick}
                    />
                  ))}

                  {localJobs.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      No jobs scheduled for this date
                    </div>
                  )}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              
              <DragOverlay>
                {activeJob ? <JobCardOverlay job={activeJob} timelineWidth={timelineRef.current?.offsetWidth || 780} /> : null}
              </DragOverlay>
            </DndContext>
          </CardContent>
        </Card>

        <div className="lg:hidden space-y-4" data-testid="mobile-job-list">
          <Card className="bg-white border">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base font-medium text-slate-800">
                Today's Jobs ({filteredJobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredJobs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No jobs match the current filter</p>
              ) : (
                filteredJobs.map((job) => {
                  const tech = technicians.find((t) => t.id === job.assignedTechId);
                  return <MobileJobCard key={job.id} job={job} technician={tech} onClick={handleJobClick} />;
                })
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="job-detail-sheet">
          {selectedJob && (
            <>
              <SheetHeader>
                <SheetTitle className="text-lg" data-testid="sheet-job-title">Job Details</SheetTitle>
                <SheetDescription>View and manage job information</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900">Job Information</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Customer</span>
                      <Link 
                        href={`/crm/customers/${selectedJob.customerId}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        data-testid="link-customer-detail"
                      >
                        {selectedJob.customerName}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Job Type</span>
                      <span className="text-sm font-medium text-slate-900" data-testid="text-job-type">{selectedJob.jobType}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Priority</span>
                      <Badge 
                        variant={selectedJob.priority === "urgent" ? "destructive" : selectedJob.priority === "high" ? "default" : "secondary"}
                        data-testid="badge-priority"
                      >
                        {selectedJob.priority || "normal"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Scheduled</span>
                      <span className="text-sm font-medium text-slate-900" data-testid="text-scheduled-time">
                        {(() => {
                          const { startHour, endHour } = getJobDisplayTimes(selectedJob);
                          return `${formatHour(Math.floor(startHour))} - ${formatHour(Math.floor(endHour))}`;
                        })()}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Status</span>
                      <Badge 
                        className={`${statusColors[selectedJob.status]?.bg} ${statusColors[selectedJob.status]?.text} ${statusColors[selectedJob.status]?.border} border`}
                        data-testid="badge-status"
                      >
                        {statusLabels[selectedJob.status] || selectedJob.status}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Assigned Tech</span>
                      <span className="text-sm font-medium text-slate-900" data-testid="text-assigned-tech">
                        {technicians.find(t => t.id === selectedJob.assignedTechId)?.name || "Unassigned"}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Update Status</h3>
                  <div className="flex flex-wrap gap-2" data-testid="status-buttons">
                    {(["scheduled", "dispatched", "en_route", "on_site", "completed"] as JobStatus[]).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={selectedJob.status === status ? "default" : "outline"}
                        onClick={() => handleStatusChange(status)}
                        disabled={updateJobMutation.isPending}
                        data-testid={`button-status-${status}`}
                      >
                        {updateJobMutation.isPending && selectedJob.status !== status ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        {statusLabels[status]}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Notes / Description</h3>
                  {selectedJob.description && (
                    <div className="bg-slate-50 rounded-md p-3 text-sm text-slate-700 whitespace-pre-wrap" data-testid="text-description">
                      {selectedJob.description}
                    </div>
                  )}
                  <Textarea
                    placeholder="Add notes to this job..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="textarea-notes"
                  />
                  <Button 
                    onClick={handleSaveNotes}
                    disabled={!newNote.trim() || updateJobMutation.isPending}
                    size="sm"
                    data-testid="button-save-notes"
                  >
                    {updateJobMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Save Notes
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Quick Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUnassign}
                      disabled={!selectedJob.assignedTechId || updateJobMutation.isPending}
                      data-testid="button-unassign"
                    >
                      <UserX className="h-4 w-4 mr-1" />
                      Unassign
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={selectedJob.status === "cancelled" || updateJobMutation.isPending}
                          data-testid="button-cancel-job"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel Job
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this job?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will mark the job as cancelled. This action cannot be easily undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-dialog-cancel">Keep Job</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleCancelJob}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid="button-confirm-cancel"
                          >
                            Yes, Cancel Job
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
    </CrmLayout>
  );
}
