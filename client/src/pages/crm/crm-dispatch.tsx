import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarDays,
  User,
  Clock,
  MapPin,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";
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

type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
type FilterStatus = "all" | "unassigned" | "in_progress" | "completed";

interface Job {
  id: string;
  customerName: string;
  jobType: string;
  startTime: number;
  endTime: number;
  status: JobStatus;
  address?: string;
  technicianId: string;
}

interface Technician {
  id: string;
  name: string;
  initials: string;
  color: string;
}

const placeholderTechnicians: Technician[] = [
  { id: "1", name: "Mike T.", initials: "MT", color: "bg-blue-600" },
  { id: "2", name: "Sarah J.", initials: "SJ", color: "bg-purple-600" },
  { id: "3", name: "Carlos R.", initials: "CR", color: "bg-emerald-600" },
  { id: "4", name: "Lisa M.", initials: "LM", color: "bg-amber-600" },
];

const initialJobs: Job[] = [
  {
    id: "1",
    customerName: "Johnson Family",
    jobType: "AC Repair",
    startTime: 8,
    endTime: 10,
    status: "completed",
    address: "123 Oak St",
    technicianId: "1",
  },
  {
    id: "2",
    customerName: "Smith Residence",
    jobType: "Furnace Install",
    startTime: 10,
    endTime: 14,
    status: "in_progress",
    address: "456 Maple Ave",
    technicianId: "1",
  },
  {
    id: "3",
    customerName: "Williams Corp",
    jobType: "HVAC Maintenance",
    startTime: 9,
    endTime: 11,
    status: "scheduled",
    address: "789 Business Blvd",
    technicianId: "2",
  },
  {
    id: "4",
    customerName: "Garcia Home",
    jobType: "Duct Cleaning",
    startTime: 13,
    endTime: 15,
    status: "scheduled",
    address: "321 Pine Rd",
    technicianId: "2",
  },
  {
    id: "5",
    customerName: "Thompson Estate",
    jobType: "Heat Pump Service",
    startTime: 8,
    endTime: 10,
    status: "completed",
    address: "555 Cedar Ln",
    technicianId: "3",
  },
  {
    id: "6",
    customerName: "Anderson Family",
    jobType: "AC Install",
    startTime: 11,
    endTime: 16,
    status: "in_progress",
    address: "999 Elm Dr",
    technicianId: "3",
  },
  {
    id: "7",
    customerName: "Martinez Office",
    jobType: "Thermostat Install",
    startTime: 14,
    endTime: 16,
    status: "cancelled",
    address: "222 Tech Park",
    technicianId: "4",
  },
  {
    id: "8",
    customerName: "Brown Residence",
    jobType: "Emergency Repair",
    startTime: 17,
    endTime: 19,
    status: "scheduled",
    address: "444 Sunset Blvd",
    technicianId: "4",
  },
];

// 8am to 8pm (13 hours: 8,9,10,11,12,13,14,15,16,17,18,19,20)
const hours = Array.from({ length: 13 }, (_, i) => i + 8);
const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;

const statusColors: Record<JobStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  in_progress: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  completed: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  cancelled: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-500" },
};

const statusLabels: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatHour(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

interface DraggableJobCardProps {
  job: Job;
  onResize: (jobId: string, newStart: number, newEnd: number) => void;
  isDragging?: boolean;
}

function DraggableJobCard({ job, onResize, isDragging }: DraggableJobCardProps) {
  const colors = statusColors[job.status];
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [visualStart, setVisualStart] = useState(job.startTime);
  const [visualEnd, setVisualEnd] = useState(job.endTime);
  const resizeStartX = useRef(0);
  const originalStart = useRef(job.startTime);
  const originalEnd = useRef(job.endTime);
  
  // Sync visual state when not resizing
  useEffect(() => {
    if (!isResizingLeft && !isResizingRight) {
      setVisualStart(job.startTime);
      setVisualEnd(job.endTime);
    }
  }, [job.startTime, job.endTime, isResizingLeft, isResizingRight]);
  
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: job.id,
    data: { job },
  });

  const handleResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    resizeStartX.current = e.clientX;
    originalStart.current = job.startTime;
    originalEnd.current = job.endTime;
    setVisualStart(job.startTime);
    setVisualEnd(job.endTime);
    
    if (side === 'left') {
      setIsResizingLeft(true);
    } else {
      setIsResizingRight(true);
    }
  }, [job.startTime, job.endTime]);

  useEffect(() => {
    if (!isResizingLeft && !isResizingRight) return;

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
      // Commit the final values on mouseup
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
  }, [isResizingLeft, isResizingRight, job.id, visualStart, visualEnd, onResize]);

  const isResizing = isResizingLeft || isResizingRight;
  
  // Use visual state for positioning during resize
  const displayStart = isResizing ? visualStart : job.startTime;
  const displayEnd = isResizing ? visualEnd : job.endTime;
  const widthPercent = ((displayEnd - displayStart) / TOTAL_HOURS) * 100;
  const leftPercent = ((displayStart - START_HOUR) / TOTAL_HOURS) * 100;

  const style: React.CSSProperties = {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    minWidth: "60px",
    // Don't apply transform during resize - only during drag
    transform: !isResizing && transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  // Only enable drag listeners when not resizing
  const dragListeners = isResizing ? {} : listeners;
  const dragAttributes = isResizing ? {} : attributes;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={`absolute top-1 bottom-1 rounded border ${colors.bg} ${colors.border} ${colors.text} overflow-hidden cursor-grab group ${isDragging ? 'z-50' : ''}`}
      style={style}
      data-testid={`job-card-${job.id}`}
      {...dragAttributes}
      {...dragListeners}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-10"
        onMouseDown={(e) => handleResizeStart(e, 'left')}
        data-testid={`resize-left-${job.id}`}
      />
      
      <div
        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-10"
        onMouseDown={(e) => handleResizeStart(e, 'right')}
        data-testid={`resize-right-${job.id}`}
      />

      <div className="flex flex-col h-full justify-center px-2 py-1">
        <p className="text-xs font-medium truncate">{job.customerName}</p>
        <p className="text-xs truncate opacity-70">{job.jobType}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3 opacity-60" />
          <span className="text-xs opacity-70">
            {formatHour(displayStart)} - {formatHour(displayEnd)}
          </span>
        </div>
      </div>
    </div>
  );
}

function JobCardOverlay({ job }: { job: Job }) {
  const colors = statusColors[job.status];
  
  return (
    <div
      className={`rounded border ${colors.bg} ${colors.border} ${colors.text} px-2 py-1.5 shadow-md cursor-grabbing`}
      style={{ width: '160px' }}
    >
      <p className="text-xs font-medium truncate">{job.customerName}</p>
      <p className="text-xs truncate opacity-70">{job.jobType}</p>
      <span className="text-xs opacity-70">
        {formatHour(job.startTime)} - {formatHour(job.endTime)}
      </span>
    </div>
  );
}

interface DroppableTechnicianRowProps {
  tech: Technician;
  jobs: Job[];
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
              className="flex-1 border-r border-slate-50 last:border-r-0"
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

function MobileJobCard({ job, technician }: { job: Job; technician: Technician }) {
  const colors = statusColors[job.status];

  return (
    <Card className={`${colors.bg} ${colors.border} border`} data-testid={`mobile-job-card-${job.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${colors.text}`}>{job.customerName}</p>
            <p className={`text-xs ${colors.text} opacity-80`}>{job.jobType}</p>
          </div>
          <Badge variant="outline" className={`${colors.text} ${colors.border} text-xs`}>
            {statusLabels[job.status]}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatHour(job.startTime)} - {formatHour(job.endTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{technician.name}</span>
          </div>
        </div>
        {job.address && (
          <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3" />
            <span>{job.address}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CrmDispatch() {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const moveJobToTechnician = useCallback((jobId: string, newTechId: string) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId ? { ...job, technicianId: newTechId } : job
    ));
  }, []);

  const resizeJob = useCallback((jobId: string, newStart: number, newEnd: number) => {
    setJobs(prev => prev.map(job =>
      job.id === jobId ? { ...job, startTime: newStart, endTime: newEnd } : job
    ));
  }, []);

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
    const job = jobs.find(j => j.id === jobId);
    
    if (!job) return;
    
    if (overId.startsWith('technician-')) {
      const newTechId = overId.replace('technician-', '');
      const duration = job.endTime - job.startTime;
      
      const timelineWidth = timelineRef.current?.offsetWidth || 780;
      const hoursPerPixel = TOTAL_HOURS / timelineWidth;
      const deltaHours = Math.round(delta.x * hoursPerPixel);
      
      let newStart = job.startTime + deltaHours;
      newStart = Math.max(START_HOUR, Math.min(newStart, END_HOUR - duration));
      const newEnd = newStart + duration;
      
      setJobs(prev => prev.map(j => 
        j.id === jobId 
          ? { ...j, technicianId: newTechId, startTime: newStart, endTime: newEnd } 
          : j
      ));
    }
  }, [jobs]);

  const filteredJobs = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "unassigned") return !job.technicianId;
    if (filter === "in_progress") return job.status === "in_progress";
    if (filter === "completed") return job.status === "completed";
    return true;
  });

  const getJobsForTechnician = useCallback((techId: string) => {
    return filteredJobs.filter((job) => job.technicianId === techId);
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

  const activeJob = activeId ? jobs.find(job => job.id === activeId) : null;

  if (authLoading) {
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
              {status === "unassigned" && "Unassigned"}
              {status === "in_progress" && "In Progress"}
              {status === "completed" && "Completed"}
            </Button>
          ))}
        </div>

        <Card className="bg-white border hidden lg:block" data-testid="card-timeline">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base font-medium text-slate-800">
              Daily Schedule
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
                          className="flex-1 text-center py-2 text-xs text-slate-400 border-r border-slate-50 last:border-r-0"
                          style={{ minWidth: "50px" }}
                        >
                          {formatHour(hour)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {placeholderTechnicians.map((tech) => (
                    <DroppableTechnicianRow
                      key={tech.id}
                      tech={tech}
                      jobs={getJobsForTechnician(tech.id)}
                      onResize={resizeJob}
                      activeId={activeId}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              
              <DragOverlay>
                {activeJob ? <JobCardOverlay job={activeJob} /> : null}
              </DragOverlay>
            </DndContext>
          </CardContent>
        </Card>

        <div className="lg:hidden space-y-4" data-testid="mobile-job-list">
          <Card className="bg-white border">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base font-medium text-slate-800">
                Today's Jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredJobs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No jobs match the current filter</p>
              ) : (
                filteredJobs.map((job) => {
                  const tech = placeholderTechnicians.find((t) => t.id === job.technicianId);
                  return tech ? (
                    <MobileJobCard key={job.id} job={job} technician={tech} />
                  ) : null;
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white border" data-testid="card-legend">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-slate-600">Status Legend:</span>
              {(Object.keys(statusColors) as JobStatus[]).map((status) => (
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
