import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  User,
  Clock,
  MapPin,
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
type FilterStatus = "all" | "unassigned" | "in_progress" | "completed";

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
  const startHour = Math.max(START_HOUR, Math.min(END_HOUR, start.getHours() + start.getMinutes() / 60));
  const endHour = Math.max(START_HOUR, Math.min(END_HOUR, end.getHours() + end.getMinutes() / 60));
  return { startHour, endHour: endHour > startHour ? endHour : startHour + 1 };
}

interface DraggableJobCardProps {
  job: DispatchJob;
  onResize: (jobId: string, newStart: number, newEnd: number) => void;
  isDragging?: boolean;
}

function DraggableJobCard({ job, onResize, isDragging }: DraggableJobCardProps) {
  const colors = statusColors[job.status] || statusColors.new;
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
      className={`absolute top-1 bottom-1 rounded border ${colors.bg} ${colors.border} ${colors.text} overflow-hidden ${isDragging ? 'z-50' : ''}`}
      style={style}
      data-testid={`job-card-${job.id}`}
    >
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
      >
        <p className="text-xs font-medium truncate">{job.customerName}</p>
        <p className="text-xs truncate opacity-70">{job.jobType}</p>
      </div>
    </div>
  );
}

function JobCardOverlay({ job, timelineWidth }: { job: DispatchJob; timelineWidth: number }) {
  const colors = statusColors[job.status] || statusColors.new;
  const { startHour, endHour } = getJobDisplayTimes(job);
  const duration = endHour - startHour;
  const widthPx = Math.max(60, (duration / TOTAL_HOURS) * timelineWidth);
  
  return (
    <div
      className={`rounded border ${colors.bg} ${colors.border} ${colors.text} px-3 py-1 shadow-md cursor-grabbing flex flex-col justify-center`}
      style={{ width: `${widthPx}px`, height: '48px' }}
    >
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
}

function DroppableTechnicianRow({ tech, jobs, onResize, activeId }: DroppableTechnicianRowProps) {
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
      <div className="w-40 flex-shrink-0 p-2 border-r border-slate-100">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full ${tech.color} flex items-center justify-center text-white text-xs font-medium`}>
            {tech.initials}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">{tech.name}</p>
            <p className="text-xs text-slate-400">{jobs.length} jobs</p>
          </div>
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
          />
        ))}
      </div>
    </div>
  );
}

function UnassignedRow({ jobs, onResize, activeId }: { jobs: DispatchJob[]; onResize: (jobId: string, newStart: number, newEnd: number) => void; activeId: string | null }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `technician-unassigned`,
    data: { technicianId: null },
  });

  return (
    <div
      className={`flex border-b-2 border-slate-200 ${isOver ? 'bg-amber-50' : 'bg-amber-50/30'}`}
      data-testid="unassigned-row"
    >
      <div className="w-40 flex-shrink-0 p-2 border-r border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-400 flex items-center justify-center text-white text-xs font-medium">
            ?
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">Unassigned</p>
            <p className="text-xs text-slate-400">{jobs.length} jobs</p>
          </div>
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
          />
        ))}
      </div>
    </div>
  );
}

function MobileJobCard({ job, technician }: { job: DispatchJob; technician?: Technician }) {
  const colors = statusColors[job.status] || statusColors.new;
  const { startHour, endHour } = getJobDisplayTimes(job);

  return (
    <Card className={`${colors.bg} ${colors.border} border`} data-testid={`mobile-job-card-${job.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${colors.text}`}>{job.customerName}</p>
            <p className={`text-xs ${colors.text} opacity-80`}>{job.jobType}</p>
          </div>
          <Badge variant="outline" className={`${colors.text} ${colors.border} text-xs`}>
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
  const { toast } = useToast();

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

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const resizeJob = useCallback((jobId: string, newStart: number, newEnd: number) => {
    const job = localJobs.find(j => j.id === jobId);
    if (!job) return;

    const baseDate = selectedDate;
    const scheduledStart = new Date(baseDate);
    scheduledStart.setHours(Math.floor(newStart), (newStart % 1) * 60, 0, 0);
    const scheduledEnd = new Date(baseDate);
    scheduledEnd.setHours(Math.floor(newEnd), (newEnd % 1) * 60, 0, 0);

    setLocalJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, scheduledStart, scheduledEnd } : j
    ));

    updateJobMutation.mutate({
      jobId,
      updates: {
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
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

      const scheduledStart = new Date(selectedDate);
      scheduledStart.setHours(Math.floor(newStartHour), (newStartHour % 1) * 60, 0, 0);
      const scheduledEnd = new Date(selectedDate);
      scheduledEnd.setHours(Math.floor(newEndHour), (newEndHour % 1) * 60, 0, 0);

      setLocalJobs(prev => prev.map(j => 
        j.id === jobId 
          ? { ...j, assignedTechId: isUnassigned ? null : newTechId, scheduledStart, scheduledEnd } 
          : j
      ));

      updateJobMutation.mutate({
        jobId,
        updates: {
          assignedTechId: isUnassigned ? null : newTechId,
          scheduledStart: scheduledStart.toISOString(),
          scheduledEnd: scheduledEnd.toISOString(),
        },
      });
    }
  }, [localJobs, selectedDate, updateJobMutation]);

  const filteredJobs = localJobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "unassigned") return !job.assignedTechId;
    if (filter === "in_progress") return ["dispatched", "en_route", "on_site"].includes(job.status);
    if (filter === "completed") return ["completed", "invoiced", "paid"].includes(job.status);
    return true;
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

        <div className="flex flex-wrap gap-2" data-testid="filter-buttons">
          {(["all", "unassigned", "in_progress", "completed"] as FilterStatus[]).map((status) => (
            <Button
              key={status}
              variant={filter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(status)}
              data-testid={`filter-${status}`}
            >
              {status === "all" && "All Jobs"}
              {status === "unassigned" && `Unassigned (${unassignedJobs.length})`}
              {status === "in_progress" && "In Progress"}
              {status === "completed" && "Completed"}
            </Button>
          ))}
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
                    <div className="w-40 flex-shrink-0 p-2 border-r border-slate-100 text-xs font-medium text-slate-500">
                      Technician
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
                  />

                  {technicians.map((tech) => (
                    <DroppableTechnicianRow
                      key={tech.id}
                      tech={tech}
                      jobs={getJobsForTechnician(tech.id)}
                      onResize={resizeJob}
                      activeId={activeId}
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
                  return <MobileJobCard key={job.id} job={job} technician={tech} />;
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white border" data-testid="card-legend">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-slate-600">Status Legend:</span>
              {["new", "scheduled", "dispatched", "en_route", "on_site", "completed"].map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${statusColors[status].bg} ${statusColors[status].border} border`} />
                  <span className="text-sm text-slate-600">{statusLabels[status]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
