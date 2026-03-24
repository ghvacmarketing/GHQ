import { useEffect, useState, useMemo, useRef, useCallback, type ReactNode } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Plus,
  Loader2,
  ClipboardList,
  DollarSign,
  Calendar,
  Check,
  ChevronsUpDown,
  BarChart3,
  LayoutGrid,
  CalendarDays,
  Activity,
  List,
  GripVertical,
  ListTodo,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, isSameMonth, startOfWeek, endOfWeek, addDays, subDays, addWeeks, subWeeks, isBefore, isAfter, startOfDay, setHours, getHours, isToday } from "date-fns";
import type { CrmUser, CrmProject, CrmProperty, CrmProjectTask } from "@shared/schema";
import { cn } from "@/lib/utils";

type CalendarTask = CrmProjectTask & {
  projectTitle: string | null;
  customerName: string | null;
  assignedUserName: string | null;
};

type ProjectWithDetails = CrmProject & {
  customerName: string | null;
  workOrderCount: number;
  hasUpcomingWorkOrders: boolean;
};

type ProjectsResponse = {
  projects: ProjectWithDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

type CustomerWithInfo = {
  id: string;
  name: string;
  customerType: string;
  customerStatus: string;
  fullAddress: string | null;
  phone: string | null;
  email: string | null;
  leadSource: string | null;
  createdAt: string;
  origin: 'crm' | 'legacy';
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

const ITEMS_PER_PAGE = 25;

type FilterTab = "all" | "lead" | "equipment_ordered" | "equipment_arrived" | "in_progress" | "completed" | "closed" | "cancelled";

const filterTabConfig: Record<FilterTab, { label: string }> = {
  all: { label: "All Projects" },
  lead: { label: "New" },
  equipment_ordered: { label: "Equipment Ordered" },
  equipment_arrived: { label: "Equipment Arrived" },
  in_progress: { label: "In Progress" },
  completed: { label: "Completed" },
  closed: { label: "Closed" },
  cancelled: { label: "Cancelled" },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  lead: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  proposal_sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  approved: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  equipment_ordered: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  equipment_arrived: { bg: "bg-lime-100", text: "text-lime-700", border: "border-lime-200" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  closed: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
  archived: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
};

const statusLabels: Record<string, string> = {
  lead: "New",
  proposal_sent: "Proposal Sent",
  approved: "Approved",
  equipment_ordered: "Equipment Ordered",
  equipment_arrived: "Equipment Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
  archived: "Archived",
};

const projectTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  INSTALL: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  DUCT: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200" },
  COMMERCIAL: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  CRAWLSPACE: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200" },
  MAJOR_REPAIR: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const projectTypeLabels: Record<string, string> = {
  INSTALL: "Install",
  DUCT: "Duct",
  COMMERCIAL: "Commercial",
  CRAWLSPACE: "Crawlspace",
  MAJOR_REPAIR: "Major Repair",
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  high: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  urgent: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const PROJECT_TYPES = ["INSTALL", "DUCT", "COMMERCIAL", "CRAWLSPACE", "MAJOR_REPAIR"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

type ProjectStatus = "lead" | "proposal_sent" | "approved" | "in_progress" | "completed";
const KANBAN_STAGES: ProjectStatus[] = ["lead", "proposal_sent", "approved", "in_progress", "completed"];
const COLUMN_PREFIX = "column-";

function getColumnId(stage: ProjectStatus): string {
  return `${COLUMN_PREFIX}${stage}`;
}

function getStageFromColumnId(columnId: string): ProjectStatus | null {
  if (columnId.startsWith(COLUMN_PREFIX)) {
    const stage = columnId.slice(COLUMN_PREFIX.length) as ProjectStatus;
    if (KANBAN_STAGES.includes(stage)) {
      return stage;
    }
  }
  return null;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
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
    <div className="relative" style={{ overflow: 'visible' }}>
      {showLeftFade && (
        <div className="absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      )}
      <div
        ref={containerRef}
        className={cn(
          "flex flex-row gap-4 pb-4",
          !isDraggingCard && "cursor-grab",
          isDragging && "cursor-grabbing",
          className
        )}
        style={{ 
          scrollbarWidth: 'thin',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="w-2 flex-shrink-0" aria-hidden="true" />
        {children}
        <div className="w-2 flex-shrink-0" aria-hidden="true" />
      </div>
      {showRightFade && (
        <div className="absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      )}
    </div>
  );
}

interface ProjectCardProps {
  project: ProjectWithDetails;
  onClick: () => void;
  isDragging?: boolean;
}

function ProjectCard({ project, onClick, isDragging: isDraggingProp }: ProjectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: project.id,
    data: {
      type: "card",
      project,
      stage: project.status || "lead",
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isDraggingProp ? 0.5 : 1,
  };

  const statusStyle = statusColors[project.status] || statusColors.lead;
  const priorityStyle = priorityColors[project.priority || "normal"];
  const showPriority = project.priority === "high" || project.priority === "urgent";

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="mb-2 cursor-pointer hover:shadow-md transition-shadow bg-white touch-manipulation"
      onClick={onClick}
      data-no-drag
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">
              {project.customerName || "No customer"} - {formatProjectNumber(project.projectNumber)}
            </h4>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {project.title}
            </p>
            {project.startDate && project.endDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{format(new Date(project.startDate), "MMM d")} - {format(new Date(project.endDate), "MMM d")}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge className={cn("text-xs border", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                {statusLabels[project.status] || project.status}
              </Badge>
              {showPriority && (
                <Badge className={cn("text-xs border", priorityStyle.bg, priorityStyle.text, priorityStyle.border)}>
                  {project.priority}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ProjectKanbanColumnProps {
  stage: ProjectStatus;
  projects: ProjectWithDetails[];
  onCardClick: (project: ProjectWithDetails) => void;
}

function ProjectKanbanColumn({ stage, projects, onCardClick }: ProjectKanbanColumnProps) {
  const columnId = getColumnId(stage);
  
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: {
      type: "column",
      stage,
    }
  });

  return (
    <div className="flex-1 min-w-[280px] max-w-[320px] h-full flex flex-col">
      <Card className={`h-full bg-gray-50 transition-colors flex flex-col ${isOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}>
        <CardHeader className="pb-2 pt-3 px-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold truncate">
              {statusLabels[stage]}
            </CardTitle>
            <Badge variant="outline" className="ml-2 flex-shrink-0">
              {projects.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 flex-1 overflow-hidden">
          <div
            ref={setNodeRef}
            className="h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin', maxHeight: 'calc(100vh - 350px)' }}
          >
            <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {projects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No projects
                </div>
              ) : (
                projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => onCardClick(project)}
                  />
                ))
              )}
            </SortableContext>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableDay({ day, isCurrentMonth, children }: { day: Date; isCurrentMonth: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: day.toISOString(),
  });
  
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[120px] border-b border-r relative transition-colors",
        !isCurrentMonth && "bg-muted/50 text-muted-foreground",
        isOver && "bg-blue-50 ring-2 ring-blue-400 ring-inset"
      )}
    >
      {children}
    </div>
  );
}

function DroppableTimeSlot({ 
  day, 
  hour, 
  isTodayDate, 
  children 
}: { 
  day: Date; 
  hour: number; 
  isTodayDate: boolean; 
  children: React.ReactNode; 
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `timeslot:${day.toISOString()}:${hour}`,
  });
  
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 bg-white p-1 min-h-[50px] border-b border-r overflow-hidden",
        isTodayDate && "bg-amber-50/30",
        isOver && "bg-blue-50 ring-2 ring-blue-400 ring-inset"
      )}
    >
      {children}
    </div>
  );
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatProjectNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "";
  return num.toString();
}

function DraggableTask({
  task,
  onClick,
}: {
  task: CalendarTask;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
  });
  
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : {};

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) onClick();
      }}
      className={cn(
        "flex items-center gap-1 text-[9px] leading-tight py-0.5 px-1.5 rounded cursor-grab active:cursor-grabbing w-full",
        task.completedAt ? "bg-gray-100 text-gray-400 line-through" : "bg-indigo-100 text-indigo-700",
        isDragging && "opacity-50 z-50"
      )}
      style={style}
      title={`${task.title}${task.assignedUserName ? ` • ${task.assignedUserName}` : ""}${task.dueDate ? ` • Due: ${format(new Date(task.dueDate), "MMM d")}` : ""} - ${task.projectTitle || "No project"}`}
    >
      <ListTodo className="w-3 h-3 flex-shrink-0" />
      <span className="truncate flex-1">{task.title}</span>
      <span className="flex-shrink-0 text-[8px] opacity-75 flex items-center gap-0.5">
        {task.dueDate && (
          <span>{format(new Date(task.dueDate), "M/d")}</span>
        )}
        {task.assignedUserName && (
          <span className="truncate max-w-[30px]">• {task.assignedUserName.split(" ")[0]}</span>
        )}
      </span>
    </button>
  );
}

function DraggableProject({ 
  project, 
  lane, 
  colors, 
  isSingleDay, 
  showRoundedLeft, 
  showRoundedRight, 
  onClick 
}: { 
  project: ProjectWithDetails; 
  lane: number; 
  colors: { bg: string; text: string }; 
  isSingleDay: boolean; 
  showRoundedLeft: boolean; 
  showRoundedRight: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
  });
  
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    top: `${lane * 44}px`,
  } : {
    top: `${lane * 44}px`,
  };

  const expectedValueFormatted = formatCurrency(project.expectedValue);
  
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) {
          onClick();
        }
      }}
      className={cn(
        "absolute left-0 right-0 text-left text-[10px] leading-tight py-1 px-1.5 h-10 cursor-grab active:cursor-grabbing overflow-hidden",
        colors.bg, colors.text,
        isDragging && "opacity-50 z-50",
        isSingleDay && "rounded mx-0.5",
        !isSingleDay && showRoundedLeft && !showRoundedRight && "rounded-l ml-0.5",
        !isSingleDay && !showRoundedLeft && showRoundedRight && "rounded-r mr-0.5",
        !isSingleDay && showRoundedLeft && showRoundedRight && "rounded mx-0.5"
      )}
      style={style}
      title={`${project.customerName || "Customer"} - ${formatProjectNumber(project.projectNumber)} - ${project.title}${expectedValueFormatted ? ` - ${expectedValueFormatted}` : ""} (drag to reschedule)`}
    >
      <div className="font-medium truncate">{project.customerName || "Customer"} - {formatProjectNumber(project.projectNumber)}</div>
      <div className="truncate opacity-90">{project.title}</div>
      {expectedValueFormatted && <div className="truncate font-medium">{expectedValueFormatted}</div>}
    </button>
  );
}

function DraggableTimeSlotProject({
  project,
  colors,
  onClick,
}: {
  project: ProjectWithDetails;
  colors: { bg: string; text: string; border: string };
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
  });
  
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) onClick();
      }}
      className={cn(
        "text-[9px] leading-tight py-0.5 px-1 rounded cursor-grab active:cursor-grabbing border overflow-hidden",
        colors.bg, colors.text, colors.border,
        isDragging && "opacity-50 z-50"
      )}
      style={style}
      title={`${project.customerName || "Customer"} - ${formatProjectNumber(project.projectNumber)} - ${project.title} (drag to reschedule)`}
    >
      <div className="font-medium truncate">
        {project.customerName || "Customer"} - {formatProjectNumber(project.projectNumber)}
      </div>
      <div className="truncate opacity-75">{project.title}</div>
    </div>
  );
}

function DraggableSpanningProject({
  project,
  colors,
  style,
  showRoundedLeft,
  showRoundedRight,
  onClick,
}: {
  project: ProjectWithDetails;
  colors: { bg: string; text: string; border: string };
  style: React.CSSProperties;
  showRoundedLeft: boolean;
  showRoundedRight: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
  });
  
  const dragStyle = transform ? {
    ...style,
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : style;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) onClick();
      }}
      className={cn(
        "absolute h-9 text-[10px] leading-tight py-1 px-1.5 cursor-grab active:cursor-grabbing overflow-hidden border",
        colors.bg, colors.text, colors.border,
        isDragging && "opacity-50 z-50",
        showRoundedLeft && showRoundedRight && "rounded",
        showRoundedLeft && !showRoundedRight && "rounded-l",
        !showRoundedLeft && showRoundedRight && "rounded-r"
      )}
      style={dragStyle}
      title={`${project.customerName || "Customer"} - ${formatProjectNumber(project.projectNumber)} - ${project.title} (drag to reschedule)`}
    >
      <div className="font-medium truncate">
        {project.customerName || "Customer"} - {formatProjectNumber(project.projectNumber)}
      </div>
      <div className="truncate opacity-75">{project.title}</div>
    </div>
  );
}

export default function CrmProjects() {
  usePageTitle("Projects");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>("all");
  
  const getInitialTab = (): "overview" | "list" | "calendar" | "kanban" => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "calendar" || tab === "overview" || tab === "list" || tab === "kanban") {
        return tab;
      }
    }
    return "overview";
  };
  const [mainViewTab, setMainViewTab] = useState<"overview" | "list" | "calendar" | "kanban">(getInitialTab);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"month" | "week" | "3day" | "day">("month");
  const [page, setPage] = useState(1);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<CrmProperty | null>(null);
  const [title, setTitle] = useState("");
  const [projectType, setProjectType] = useState<string>("INSTALL");
  const [expectedValue, setExpectedValue] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  const [activeDragProject, setActiveDragProject] = useState<ProjectWithDetails | null>(null);
  const [activeDragTask, setActiveDragTask] = useState<CalendarTask | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [activeKanbanProjectId, setActiveKanbanProjectId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  const debouncedSearch = useDebounce(searchInput, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterTab]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    
    if (activeFilterTab !== "all") {
      params.set("status", activeFilterTab);
    }
    
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, activeFilterTab, page]);

  const { data: projectsData, isLoading: projectsLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/crm/projects", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!currentUser,
    staleTime: 2 * 60 * 1000,
  });

  const { data: allProjectsData, isLoading: allProjectsLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/crm/projects/all"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?limit=1000`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch all projects");
      return res.json();
    },
    enabled: !!currentUser && mainViewTab === "kanban",
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    activeProjects: number;
    pendingActions: number;
    pipelineValue: number;
    completionRate: string;
    statusFunnel: Record<string, number>;
  }>({
    queryKey: ["/api/crm/projects/stats"],
  });

  const calendarQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("hasSchedule", "true");
    params.set("limit", "1000");
    return params.toString();
  }, []);

  const { data: calendarProjectsData, isLoading: calendarLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/crm/projects/calendar", calendarQueryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?${calendarQueryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch calendar projects");
      return res.json();
    },
    enabled: !!currentUser && mainViewTab === "calendar",
  });

  const { data: calendarTasksData } = useQuery<CalendarTask[]>({
    queryKey: ["/api/crm/project-tasks"],
    enabled: !!currentUser && mainViewTab === "calendar",
  });

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", debouncedCustomerSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedCustomerSearch) params.set("search", debouncedCustomerSearch);
      params.set("limit", "20");
      const res = await fetch(`/api/crm/customers?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser && createDialogOpen,
  });

  const { data: sitesData, isLoading: sitesLoading } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/properties?customerId=${selectedCustomer?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch sites");
      return res.json();
    },
    enabled: !!currentUser && !!selectedCustomer,
  });

  const sites = sitesData || [];

  const createProjectMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      propertyId?: string;
      title: string;
      projectType: string;
      expectedValue?: string;
      description?: string;
      priority?: string;
      startDate: string;
      endDate: string;
    }) => {
      return apiRequest("POST", "/api/crm/projects", data);
    },
    onSuccess: () => {
      toast({
        title: "Project created",
        description: "The project has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      resetCreateForm();
      setCreateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const updateProjectDatesMutation = useMutation({
    mutationFn: async (data: { projectId: string; startDate: string; endDate: string }) => {
      return apiRequest("PATCH", `/api/crm/projects/${data.projectId}`, {
        startDate: data.startDate,
        endDate: data.endDate,
      });
    },
    onSuccess: () => {
      toast({ title: "Project rescheduled" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/calendar"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reschedule project",
        variant: "destructive",
      });
    },
  });

  const updateProjectStatusMutation = useMutation({
    mutationFn: async (data: { projectId: string; status: string }) => {
      return apiRequest("PATCH", `/api/crm/projects/${data.projectId}`, {
        status: data.status,
      });
    },
    onSuccess: () => {
      toast({ title: "Project status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project status",
        variant: "destructive",
      });
    },
  });

  const updateTaskDueDateMutation = useMutation({
    mutationFn: async ({ taskId, dueDate }: { taskId: string; dueDate: string }) => {
      const res = await apiRequest("PATCH", `/api/crm/project-tasks/${taskId}`, { dueDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/project-tasks"] });
      toast({ title: "Task rescheduled" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reschedule task", description: error.message, variant: "destructive" });
    },
  });

  const handleCalendarDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id as string;
    
    if (activeId.startsWith("task-")) {
      const taskId = activeId.replace("task-", "");
      const task = calendarTasksData?.find(t => t.id === taskId);
      if (task) setActiveDragTask(task);
    } else {
      const allProjects = calendarProjectsData?.projects || [];
      const project = allProjects.find(p => p.id === activeId);
      if (project) setActiveDragProject(project);
    }
  };

  const handleCalendarDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveDragProject(null);
    setActiveDragTask(null);
    
    if (!over || !active) return;
    
    const activeId = active.id as string;
    const overId = over.id as string;
    
    if (activeId.startsWith("task-")) {
      const taskId = activeId.replace("task-", "");
      let newDate: Date | null = null;
      
      // Handle time slot drops (format: timeslot:ISO:hour)
      if (overId.startsWith("timeslot:")) {
        const parts = overId.split(":");
        if (parts.length >= 3) {
          const datePartStr = parts.slice(1, -1).join(":");
          newDate = new Date(datePartStr);
        }
      } else {
        // Regular date drop (month view)
        newDate = new Date(overId);
      }
      
      if (newDate && !isNaN(newDate.getTime())) {
        updateTaskDueDateMutation.mutate({
          taskId,
          dueDate: newDate.toISOString(),
        });
      }
      return;
    }
    
    const allProjects = calendarProjectsData?.projects || [];
    const project = allProjects.find(p => p.id === activeId);
    if (!project || !project.startDate) return;
    
    const isTimeSlotDrop = overId.startsWith("timeslot:");
    
    if (isTimeSlotDrop) {
      const parts = overId.split(":");
      if (parts.length < 3) return;
      
      const hourStr = parts[parts.length - 1];
      const newHour = parseInt(hourStr, 10);
      const datePartStr = parts.slice(1, -1).join(":");
      const newDateBase = new Date(datePartStr);
      
      if (isNaN(newDateBase.getTime()) || isNaN(newHour)) return;
      
      const oldStartDate = new Date(project.startDate);
      const newStartDate = setHours(startOfDay(newDateBase), newHour);
      
      const timeDiff = newStartDate.getTime() - oldStartDate.getTime();
      if (timeDiff === 0) return;
      
      const oldEndDate = project.endDate ? new Date(project.endDate) : oldStartDate;
      const newEndDate = new Date(oldEndDate.getTime() + timeDiff);
      
      queryClient.setQueryData(
        ["/api/crm/projects/calendar", calendarQueryParams],
        (oldData: any) => {
          if (!oldData?.projects) return oldData;
          return {
            ...oldData,
            projects: oldData.projects.map((p: any) =>
              p.id === activeId
                ? { ...p, startDate: format(newStartDate, "yyyy-MM-dd'T'HH:mm:ss"), endDate: format(newEndDate, "yyyy-MM-dd'T'HH:mm:ss") }
                : p
            ),
          };
        }
      );
      
      updateProjectDatesMutation.mutate({
        projectId: activeId,
        startDate: format(newStartDate, "yyyy-MM-dd'T'HH:mm:ss"),
        endDate: format(newEndDate, "yyyy-MM-dd'T'HH:mm:ss"),
      });
    } else {
      const oldStartDate = startOfDay(new Date(project.startDate));
      const newDate = startOfDay(new Date(overId));
      
      const daysDiff = Math.round((newDate.getTime() - oldStartDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff === 0) return;
      
      const newStartDate = addDays(oldStartDate, daysDiff);
      const oldEndDate = project.endDate ? startOfDay(new Date(project.endDate)) : oldStartDate;
      const newEndDate = addDays(oldEndDate, daysDiff);
      
      queryClient.setQueryData(
        ["/api/crm/projects/calendar", calendarQueryParams],
        (oldData: any) => {
          if (!oldData?.projects) return oldData;
          return {
            ...oldData,
            projects: oldData.projects.map((p: any) =>
              p.id === activeId
                ? { ...p, startDate: format(newStartDate, "yyyy-MM-dd"), endDate: format(newEndDate, "yyyy-MM-dd") }
                : p
            ),
          };
        }
      );
      
      updateProjectDatesMutation.mutate({
        projectId: activeId,
        startDate: format(newStartDate, "yyyy-MM-dd"),
        endDate: format(newEndDate, "yyyy-MM-dd"),
      });
    }
  };

  const handleKanbanDragStart = (event: DragStartEvent) => {
    setActiveKanbanProjectId(event.active.id as string);
    setIsDraggingCard(true);
  };

  const handleKanbanDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveKanbanProjectId(null);
    setIsDraggingCard(false);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let newStage: ProjectStatus | null = null;

    if (over.data.current?.type === "column") {
      newStage = over.data.current.stage as ProjectStatus;
    } else if (over.data.current?.type === "card") {
      newStage = over.data.current.stage as ProjectStatus;
    } else {
      newStage = getStageFromColumnId(overId);
    }

    if (newStage) {
      const allProjects = allProjectsData?.projects || [];
      const project = allProjects.find((p) => p.id === activeId);
      if (project && project.status !== newStage) {
        updateProjectStatusMutation.mutate({ projectId: activeId, status: newStage });
      }
    }
  };

  const projectsByStage = useMemo(() => {
    const grouped: Record<ProjectStatus, ProjectWithDetails[]> = {
      lead: [],
      proposal_sent: [],
      approved: [],
      in_progress: [],
      completed: [],
    };
    const allProjects = allProjectsData?.projects || [];
    allProjects.forEach((p) => {
      const stage = (p.status || "lead") as ProjectStatus;
      if (grouped[stage]) {
        grouped[stage].push(p);
      } else if (stage === "equipment_ordered" || stage === "equipment_arrived") {
        grouped["approved"].push(p);
      }
    });
    return grouped;
  }, [allProjectsData?.projects]);

  const resetCreateForm = () => {
    setCustomerSearch("");
    setSelectedCustomer(null);
    setSelectedSite(null);
    setTitle("");
    setProjectType("INSTALL");
    setExpectedValue("");
    setDescription("");
    setPriority("normal");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleCreateProject = () => {
    if (!selectedCustomer || !title || !projectType) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!startDate || !endDate) {
      toast({
        title: "Schedule required",
        description: "Please select a start and end date for the project.",
        variant: "destructive",
      });
      return;
    }

    if (sites.length > 0 && !selectedSite) {
      toast({
        title: "Location required",
        description: "Please select a location for this customer.",
        variant: "destructive",
      });
      return;
    }

    createProjectMutation.mutate({
      customerId: selectedCustomer.id,
      propertyId: selectedSite?.id || undefined,
      title,
      projectType,
      expectedValue: expectedValue || undefined,
      description: description || undefined,
      priority: priority || undefined,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    });
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "—";
    const num = parseFloat(value);
    if (isNaN(num)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch {
      return "—";
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const projects = projectsData?.projects || [];
  const total = projectsData?.pagination?.total || 0;
  const totalPages = projectsData?.pagination?.totalPages || Math.ceil(total / ITEMS_PER_PAGE);

  const activeKanbanProject = activeKanbanProjectId 
    ? (allProjectsData?.projects || []).find(p => p.id === activeKanbanProjectId)
    : null;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <FolderKanban className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Projects</h1>
              <p className="text-sm text-slate-500">Manage your project pipeline</p>
            </div>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Project
          </Button>
        </div>

        <div className="flex overflow-x-auto overflow-y-hidden border-b border-slate-200">
          <button
            onClick={() => setMainViewTab("overview")}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              mainViewTab === "overview"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Overview
          </button>
          <button
            onClick={() => setMainViewTab("list")}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              mainViewTab === "list"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <List className="h-4 w-4" />
            List
          </button>
          <button
            onClick={() => setMainViewTab("calendar")}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              mainViewTab === "calendar"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Calendar
          </button>
          <button
            onClick={() => setMainViewTab("kanban")}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              mainViewTab === "kanban"
                ? "border-[#711419] text-[#711419]"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban
          </button>
        </div>

        <Tabs value={mainViewTab} onValueChange={(v) => setMainViewTab(v as any)} className="w-full">
          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statsLoading ? <Skeleton className="h-8 w-16" /> : statsData?.activeProjects ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Projects in progress</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statsLoading ? <Skeleton className="h-8 w-16" /> : statsData?.pendingActions ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Need attention</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {statsLoading ? <Skeleton className="h-8 w-20" /> : `$${(statsData?.pipelineValue ?? 0).toLocaleString()}`}
                  </div>
                  <p className="text-xs text-muted-foreground">Active project value</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statsLoading ? <Skeleton className="h-8 w-16" /> : `${statsData?.completionRate ?? 0}%`}</div>
                  <p className="text-xs text-muted-foreground">Projects completed</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Project Status Funnel</CardTitle>
                <CardDescription>Click a status to filter the list view</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                  {Object.entries(statusLabels).filter(([key]) => key !== "archived" && key !== "proposal_sent" && key !== "approved").map(([status, label]) => {
                    const count = statsData?.statusFunnel?.[status] ?? 0;
                    const colors = statusColors[status] || statusColors.lead;
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          setActiveFilterTab(status as FilterTab);
                          setMainViewTab("list");
                        }}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all hover:scale-105",
                          colors.bg, colors.border
                        )}
                      >
                        <div className={cn("text-2xl font-bold", colors.text)}>{count}</div>
                        <div className="text-xs text-muted-foreground mt-1">{label}</div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Scheduled Projects</CardTitle>
                <CardDescription>Projects with scheduled dates in the next 14 days</CardDescription>
              </CardHeader>
              <CardContent>
                {projectsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (() => {
                  const today = startOfDay(new Date());
                  const twoWeeksOut = addDays(today, 14);
                  
                  const upcomingProjects = projects.filter(project => {
                    if (!project.startDate && !project.endDate) return false;
                    const projectStartDate = project.startDate ? startOfDay(new Date(project.startDate)) : null;
                    const projectEndDate = project.endDate ? startOfDay(new Date(project.endDate)) : null;
                    
                    const startInRange = projectStartDate && !isBefore(projectStartDate, today) && !isAfter(projectStartDate, twoWeeksOut);
                    const endInRange = projectEndDate && !isBefore(projectEndDate, today) && !isAfter(projectEndDate, twoWeeksOut);
                    const spansToday = projectStartDate && projectEndDate && isBefore(projectStartDate, today) && isAfter(projectEndDate, today);
                    
                    return startInRange || endInRange || spansToday;
                  });

                  upcomingProjects.sort((a, b) => {
                    const aDate = a.startDate ? new Date(a.startDate) : (a.endDate ? new Date(a.endDate) : new Date());
                    const bDate = b.startDate ? new Date(b.startDate) : (b.endDate ? new Date(b.endDate) : new Date());
                    return aDate.getTime() - bDate.getTime();
                  });
                  
                  if (upcomingProjects.length === 0) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p>No scheduled projects in the next 14 days</p>
                        <p className="text-sm mt-1">Set start/end dates on projects to see them here</p>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-3">
                      {upcomingProjects.slice(0, 10).map((project) => {
                        const statusStyle = statusColors[project.status] || statusColors.lead;
                        const projectStartDate = project.startDate ? startOfDay(new Date(project.startDate)) : null;
                        const projectEndDate = project.endDate ? startOfDay(new Date(project.endDate)) : null;
                        
                        const startDaysAway = projectStartDate ? Math.ceil((projectStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                        const endDaysAway = projectEndDate ? Math.ceil((projectEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                        
                        const formatDaysAway = (days: number) => {
                          if (days < 0) return `${Math.abs(days)}d ago`;
                          if (days === 0) return "Today";
                          if (days === 1) return "Tomorrow";
                          return `In ${days}d`;
                        };
                        
                        return (
                          <button
                            key={project.id}
                            onClick={() => navigate(`/crm/projects/${project.id}`)}
                            className="w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition-colors flex items-center justify-between gap-4"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">{project.title}</span>
                                <Badge className={cn("text-xs", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                                  {statusLabels[project.status] || project.status}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {project.customerName || "No customer"} - {formatProjectNumber(project.projectNumber)}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 space-y-0.5">
                              {projectStartDate && (
                                <div className="text-sm">
                                  <span className="text-blue-600 font-medium">{format(projectStartDate, "MMM d")}</span>
                                  <span className="text-xs text-muted-foreground ml-1">({formatDaysAway(startDaysAway!)})</span>
                                </div>
                              )}
                              {projectEndDate && projectStartDate && projectEndDate.getTime() !== projectStartDate.getTime() && (
                                <div className="text-sm">
                                  <span className="text-orange-600 font-medium">{format(projectEndDate, "MMM d")}</span>
                                  <span className="text-xs text-muted-foreground ml-1">({formatDaysAway(endDaysAway!)})</span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {upcomingProjects.length > 10 && (
                        <p className="text-sm text-center text-muted-foreground pt-2">
                          +{upcomingProjects.length - 10} more projects
                        </p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            <div className="space-y-4">
              <div className="flex justify-center mb-2">
                <div className="relative w-full max-w-xl">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search projects..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Total: {total}</p>
              </div>

              <div className="flex overflow-x-auto overflow-y-hidden border-b border-slate-200">
                {(Object.keys(filterTabConfig) as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveFilterTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                      activeFilterTab === tab
                        ? "border-[#711419] text-[#711419]"
                        : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                    }`}
                  >
                    {filterTabConfig[tab].label}
                  </button>
                ))}
              </div>

              {projectsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <Card className="bg-white border shadow-sm">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FolderKanban className="h-12 w-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 text-center">No projects found</p>
                    <p className="text-slate-400 text-sm text-center mt-1">
                      Create a new project to get started
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold">Customer</TableHead>
                        <TableHead className="font-semibold">Title</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Priority</TableHead>
                        <TableHead className="font-semibold">Dates</TableHead>
                        <TableHead className="font-semibold text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((project) => {
                        const status = project.status || "lead";
                        const statusStyle = statusColors[status] || statusColors.lead;
                        const priorityStyle = priorityColors[project.priority || "normal"];

                        return (
                          <TableRow
                            key={project.id}
                            className="cursor-pointer hover:bg-slate-50"
                            onClick={() => navigate(`/crm/projects/${project.id}`)}
                          >
                            <TableCell className="font-medium">
                              {project.customerName || "—"} - {formatProjectNumber(project.projectNumber)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="truncate max-w-[200px]">{project.title}</span>
                                {project.projectType && (
                                  <Badge variant="outline" className="text-xs">
                                    {projectTypeLabels[project.projectType] || project.projectType}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-xs border", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                                {statusLabels[status] || status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-xs border", priorityStyle.bg, priorityStyle.text, priorityStyle.border)}>
                                {project.priority || "normal"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {project.startDate ? (
                                <span className="text-sm">
                                  {format(new Date(project.startDate), "MMM d")}
                                  {project.endDate && project.endDate !== project.startDate && (
                                    <> - {format(new Date(project.endDate), "MMM d")}</>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-medium text-green-700">
                                {formatCurrency(project.expectedValue)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-slate-500">
                    Showing {(page - 1) * ITEMS_PER_PAGE + 1} to{" "}
                    {Math.min(page * ITEMS_PER_PAGE, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="text-sm text-slate-600">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleCalendarDragStart} onDragEnd={handleCalendarDragEnd}>
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (calendarView === "month") {
                          setCalendarMonth(subMonths(calendarMonth, 1));
                        } else if (calendarView === "week") {
                          setCalendarMonth(subWeeks(calendarMonth, 1));
                        } else if (calendarView === "3day") {
                          setCalendarMonth(subDays(calendarMonth, 3));
                        } else {
                          setCalendarMonth(subDays(calendarMonth, 1));
                        }
                      }}
                      className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h2 className="text-lg font-semibold min-w-[180px] text-center">
                      {calendarView === "month" 
                        ? format(calendarMonth, "MMMM yyyy")
                        : calendarView === "week"
                        ? `Week of ${format(startOfWeek(calendarMonth, { weekStartsOn: 0 }), "MMM d, yyyy")}`
                        : calendarView === "3day"
                        ? `${format(calendarMonth, "MMM d")} - ${format(addDays(calendarMonth, 2), "MMM d, yyyy")}`
                        : format(calendarMonth, "EEEE, MMM d, yyyy")
                      }
                    </h2>
                    <button
                      onClick={() => {
                        if (calendarView === "month") {
                          setCalendarMonth(addMonths(calendarMonth, 1));
                        } else if (calendarView === "week") {
                          setCalendarMonth(addWeeks(calendarMonth, 1));
                        } else if (calendarView === "3day") {
                          setCalendarMonth(addDays(calendarMonth, 3));
                        } else {
                          setCalendarMonth(addDays(calendarMonth, 1));
                        }
                      }}
                      className="p-2 text-[#711419] hover:text-[#5a1014] transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCalendarMonth(new Date())}
                      className="text-xs"
                    >
                      Today
                    </Button>
                  </div>
                  <div className="flex items-center rounded-lg border bg-muted p-1 gap-1">
                    <Button
                      variant={calendarView === "month" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCalendarView("month")}
                      className="h-7 px-3 text-xs"
                    >
                      Month
                    </Button>
                    <Button
                      variant={calendarView === "week" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCalendarView("week")}
                      className="h-7 px-3 text-xs"
                    >
                      Week
                    </Button>
                    <Button
                      variant={calendarView === "3day" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCalendarView("3day")}
                      className="h-7 px-3 text-xs"
                    >
                      3 Day
                    </Button>
                    <Button
                      variant={calendarView === "day" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCalendarView("day")}
                      className="h-7 px-3 text-xs"
                    >
                      Day
                    </Button>
                  </div>
                </div>

                {calendarView === "month" && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(statusColors).filter(([key]) => !["archived", "proposal_sent"].includes(key)).map(([status, colors]) => (
                      <div key={status} className="flex items-center gap-1.5 text-xs">
                        <div className={cn("w-3 h-3 rounded", colors.bg, colors.border, "border")} />
                        <span>{statusLabels[status]}</span>
                      </div>
                    ))}
                  </div>
                )}

                {calendarView === "month" && (calendarLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-7 bg-muted">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                        <div key={day} className="p-2 text-center text-sm font-medium border-b">{day}</div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-7">
                      {(() => {
                        const monthStart = startOfMonth(calendarMonth);
                        const monthEnd = endOfMonth(calendarMonth);
                        const calendarStart = startOfWeek(monthStart);
                        const calendarEnd = endOfWeek(monthEnd);
                        const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
                        
                        const projectLanes = new Map<string, number>();
                        const allProjects = calendarProjectsData?.projects || [];
                        
                        const sortedProjects = [...allProjects]
                          .filter(p => p.startDate)
                          .sort((a, b) => {
                            const aStart = new Date(a.startDate!).getTime();
                            const bStart = new Date(b.startDate!).getTime();
                            if (aStart !== bStart) return aStart - bStart;
                            const aEnd = a.endDate ? new Date(a.endDate).getTime() : aStart;
                            const bEnd = b.endDate ? new Date(b.endDate).getTime() : bStart;
                            return (bEnd - bStart) - (aEnd - aStart);
                          });
                        
                        sortedProjects.forEach(project => {
                          const projectStart = startOfDay(new Date(project.startDate!));
                          const projectEnd = project.endDate ? startOfDay(new Date(project.endDate)) : projectStart;
                          
                          let lane = 0;
                          while (true) {
                            let laneAvailable = true;
                            const entries = Array.from(projectLanes.entries());
                            for (let i = 0; i < entries.length; i++) {
                              const [otherId, otherLane] = entries[i];
                              if (otherLane !== lane) continue;
                              const other = sortedProjects.find(p => p.id === otherId);
                              if (!other) continue;
                              const otherStart = startOfDay(new Date(other.startDate!));
                              const otherEnd = other.endDate ? startOfDay(new Date(other.endDate)) : otherStart;
                              if (!(isAfter(projectStart, otherEnd) || isBefore(projectEnd, otherStart))) {
                                laneAvailable = false;
                                break;
                              }
                            }
                            if (laneAvailable) break;
                            lane++;
                          }
                          projectLanes.set(project.id, lane);
                        });
                        
                        return days.map((day, dayIndex) => {
                          const isCurrentMonth = isSameMonth(day, calendarMonth);
                          const dayStart = startOfDay(day);
                          const isStartOfWeekDay = dayIndex % 7 === 0;
                          const isEndOfWeekDay = dayIndex % 7 === 6;
                          
                          const dayProjects = allProjects.filter(project => {
                            if (!project.startDate) return false;
                            const projectStart = startOfDay(new Date(project.startDate));
                            const projectEnd = project.endDate ? startOfDay(new Date(project.endDate)) : projectStart;
                            return isSameDay(dayStart, projectStart) ||
                                   isSameDay(dayStart, projectEnd) ||
                                   (isAfter(dayStart, projectStart) && isBefore(dayStart, projectEnd));
                          });
                          
                          const sortedDayProjects = [...dayProjects].sort((a, b) => 
                            (projectLanes.get(a.id) || 0) - (projectLanes.get(b.id) || 0)
                          );
                          
                          const maxLane = Math.max(0, ...sortedDayProjects.map(p => projectLanes.get(p.id) || 0));
                          
                          return (
                            <DroppableDay key={day.toISOString()} day={day} isCurrentMonth={isCurrentMonth}>
                              <div className="text-xs font-medium p-1">{format(day, "d")}</div>
                              <div className="relative" style={{ height: `${Math.min(maxLane + 1, 3) * 46 + 4}px` }}>
                                {sortedDayProjects.slice(0, 3).map(project => {
                                  const lane = projectLanes.get(project.id) || 0;
                                  if (lane > 2) return null;
                                  
                                  const colors = statusColors[project.status] || statusColors.lead;
                                  const projectStart = startOfDay(new Date(project.startDate!));
                                  const projectEnd = project.endDate ? startOfDay(new Date(project.endDate)) : projectStart;
                                  
                                  const isFirst = isSameDay(dayStart, projectStart);
                                  const isLast = isSameDay(dayStart, projectEnd);
                                  const isSingleDayProject = isFirst && isLast;
                                  
                                  const showRoundedLeft = isFirst || isStartOfWeekDay;
                                  const showRoundedRight = isLast || isEndOfWeekDay;
                                  
                                  if (isFirst) {
                                    return (
                                      <DraggableProject
                                        key={project.id}
                                        project={project}
                                        lane={lane}
                                        colors={colors}
                                        isSingleDay={isSingleDayProject}
                                        showRoundedLeft={showRoundedLeft}
                                        showRoundedRight={showRoundedRight}
                                        onClick={() => navigate(`/crm/projects/${project.id}`)}
                                      />
                                    );
                                  }
                                  
                                  return (
                                    <button
                                      key={project.id}
                                      onClick={() => navigate(`/crm/projects/${project.id}`)}
                                      className={cn(
                                        "absolute left-0 right-0 h-10 cursor-pointer text-left text-[10px] leading-tight py-1 px-1.5 overflow-hidden hover:opacity-90 transition-opacity",
                                        colors.bg, colors.text,
                                        activeDragProject?.id === project.id && "opacity-30",
                                        isSingleDayProject && "rounded mx-0.5",
                                        !isSingleDayProject && showRoundedLeft && !showRoundedRight && "rounded-l ml-0.5",
                                        !isSingleDayProject && !showRoundedLeft && showRoundedRight && "rounded-r mr-0.5",
                                        !isSingleDayProject && showRoundedLeft && showRoundedRight && "rounded mx-0.5"
                                      )}
                                      style={{ top: `${lane * 44}px` }}
                                      title={`${project.customerName || "Customer"} - ${formatProjectNumber(project.projectNumber)} - ${project.title} (click to view)`}
                                    >
                                      {isStartOfWeekDay && (
                                        <>
                                          <div className="font-medium truncate">{project.customerName || "Customer"} - {formatProjectNumber(project.projectNumber)}</div>
                                          <div className="truncate opacity-90">{project.title}</div>
                                        </>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Tasks due on this day */}
                              {(() => {
                                const dayTasks = calendarTasksData?.filter(task => {
                                  if (!task.dueDate) return false;
                                  const taskDate = startOfDay(new Date(task.dueDate));
                                  return isSameDay(taskDate, dayStart);
                                }) || [];
                                
                                return dayTasks.length > 0 && (
                                  <div className="mt-1 space-y-0.5 px-0.5">
                                    {dayTasks.slice(0, 2).map(task => (
                                      <DraggableTask
                                        key={task.id}
                                        task={task}
                                        onClick={() => navigate(`/crm/projects/${task.projectId}`)}
                                      />
                                    ))}
                                    {dayTasks.length > 2 && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="text-[9px] text-indigo-600 hover:text-indigo-700 pl-1">
                                            +{dayTasks.length - 2} more tasks
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2" align="start">
                                          <div className="font-medium text-sm mb-2">{format(day, "EEEE, MMM d")} - Tasks</div>
                                          <div className="space-y-1 max-h-40 overflow-y-auto">
                                            {dayTasks.map(task => (
                                              <button
                                                key={task.id}
                                                onClick={() => navigate(`/crm/projects/${task.projectId}`)}
                                                className={cn(
                                                  "w-full text-left p-2 rounded text-xs hover:bg-indigo-100 border border-indigo-200",
                                                  task.completedAt ? "bg-gray-100 text-gray-400 line-through" : "bg-indigo-50 text-indigo-700"
                                                )}
                                              >
                                                <div className="flex items-center gap-1.5">
                                                  <ListTodo className="w-3 h-3 flex-shrink-0" />
                                                  <span className="truncate font-medium">{task.title}</span>
                                                </div>
                                                <div className="text-[10px] opacity-75 mt-0.5 truncate">
                                                  {task.dueDate && <span className="font-medium">{format(new Date(task.dueDate), "MMM d")}</span>}
                                                  {task.projectTitle && ` • ${task.projectTitle}`}
                                                  {task.assignedUserName && ` • ${task.assignedUserName}`}
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </div>
                                );
                              })()}
                              {dayProjects.length > 3 && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="text-[10px] text-muted-foreground px-1 absolute bottom-0.5 hover:text-foreground hover:bg-gray-100 rounded transition-colors cursor-pointer">
                                      +{dayProjects.length - 3} more
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-2" align="start">
                                    <div className="font-medium text-sm mb-2">{format(day, "EEEE, MMM d")}</div>
                                    <div className="space-y-1 max-h-60 overflow-y-auto">
                                      {dayProjects.map((project) => {
                                        const projColors = statusColors[project.status] || statusColors.lead;
                                        return (
                                          <div
                                            key={project.id}
                                            onClick={() => navigate(`/crm/projects/${project.id}`)}
                                            className={cn(
                                              "p-2 rounded text-xs cursor-pointer hover:opacity-80 border",
                                              projColors.bg, projColors.text, projColors.border
                                            )}
                                          >
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-medium truncate">
                                                {project.customerName || "Customer"} - {formatProjectNumber(project.projectNumber)}
                                              </span>
                                            </div>
                                            <div className="mt-0.5 truncate opacity-75">{project.title}</div>
                                            {project.expectedValue && (
                                              <div className="mt-0.5 font-medium">{formatCurrency(project.expectedValue)}</div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </DroppableDay>
                          );
                        });
                      })()}
                    </div>
                  </div>
                ))}

                {/* Week/3-Day/Day views with time slots */}
                {(calendarView === "week" || calendarView === "3day" || calendarView === "day") && (
                  calendarLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    </div>
                  ) : (() => {
                    const allProjects = calendarProjectsData?.projects || [];
                    let viewDays: Date[] = [];
                    
                    if (calendarView === "week") {
                      const weekStart = startOfWeek(calendarMonth, { weekStartsOn: 0 });
                      viewDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
                    } else if (calendarView === "3day") {
                      viewDays = [calendarMonth, addDays(calendarMonth, 1), addDays(calendarMonth, 2)];
                    } else {
                      viewDays = [calendarMonth];
                    }
                    
                    const hours = Array.from({ length: 24 }, (_, i) => i);
                    
                    return (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="flex border-b bg-muted">
                          <div className="w-[60px] flex-shrink-0 p-2 border-r text-center text-xs font-medium text-muted-foreground">
                            Time
                          </div>
                          {viewDays.map((day) => (
                            <div
                              key={day.toISOString()}
                              className={cn(
                                "flex-1 min-w-0 p-2 text-center border-r last:border-r-0",
                                isToday(day) && "bg-amber-50"
                              )}
                            >
                              <div className="text-xs font-medium">{format(day, "EEE")}</div>
                              <div className={cn(
                                "text-lg font-bold",
                                isToday(day) ? "text-amber-600" : "text-foreground"
                              )}>
                                {format(day, "d")}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Multi-day spanning projects section */}
                        {(() => {
                          const viewStart = startOfDay(viewDays[0]);
                          const viewEnd = startOfDay(viewDays[viewDays.length - 1]);
                          
                          const spanningProjects = allProjects.filter(project => {
                            if (!project.startDate || !project.endDate) return false;
                            const projectStart = startOfDay(new Date(project.startDate));
                            const projectEnd = startOfDay(new Date(project.endDate));
                            const durationDays = Math.round((projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
                            if (durationDays < 1) return false;
                            return !(isAfter(projectStart, viewEnd) || isBefore(projectEnd, viewStart));
                          });
                          
                          if (spanningProjects.length === 0) return null;
                          
                          const projectLanes = new Map<string, number>();
                          const sortedSpanning = [...spanningProjects].sort((a, b) => {
                            const aStart = new Date(a.startDate!).getTime();
                            const bStart = new Date(b.startDate!).getTime();
                            if (aStart !== bStart) return aStart - bStart;
                            const aEnd = a.endDate ? new Date(a.endDate).getTime() : aStart;
                            const bEnd = b.endDate ? new Date(b.endDate).getTime() : bStart;
                            return (bEnd - bStart) - (aEnd - aStart);
                          });
                          
                          sortedSpanning.forEach(project => {
                            const projectStart = startOfDay(new Date(project.startDate!));
                            const projectEnd = startOfDay(new Date(project.endDate!));
                            
                            let lane = 0;
                            while (true) {
                              let laneAvailable = true;
                              const entries = Array.from(projectLanes.entries());
                              for (let i = 0; i < entries.length; i++) {
                                const [otherId, otherLane] = entries[i];
                                if (otherLane !== lane) continue;
                                const other = sortedSpanning.find(p => p.id === otherId);
                                if (!other) continue;
                                const otherStart = startOfDay(new Date(other.startDate!));
                                const otherEnd = startOfDay(new Date(other.endDate!));
                                if (!(isAfter(projectStart, otherEnd) || isBefore(projectEnd, otherStart))) {
                                  laneAvailable = false;
                                  break;
                                }
                              }
                              if (laneAvailable) break;
                              lane++;
                            }
                            projectLanes.set(project.id, lane);
                          });
                          
                          const maxLane = Math.max(0, ...Array.from(projectLanes.values()));
                          const numDays = viewDays.length;
                          
                          return (
                            <div className="border-b bg-gray-50/50">
                              <div className="flex">
                                <div className="w-[60px] flex-shrink-0 border-r bg-muted/30" />
                                <div 
                                  className="flex-1 relative"
                                  style={{ height: `${(maxLane + 1) * 40 + 8}px` }}
                                >
                                  {sortedSpanning.map(project => {
                                    const lane = projectLanes.get(project.id) || 0;
                                    const colors = statusColors[project.status] || statusColors.lead;
                                    const projectStart = startOfDay(new Date(project.startDate!));
                                    const projectEnd = startOfDay(new Date(project.endDate!));
                                    
                                    let startDayIndex = viewDays.findIndex(d => isSameDay(d, projectStart));
                                    let endDayIndex = viewDays.findIndex(d => isSameDay(d, projectEnd));
                                    
                                    if (startDayIndex === -1) {
                                      startDayIndex = isBefore(projectStart, viewStart) ? 0 : -1;
                                    }
                                    if (endDayIndex === -1) {
                                      endDayIndex = isAfter(projectEnd, viewEnd) ? numDays - 1 : -1;
                                    }
                                    
                                    if (startDayIndex === -1 || endDayIndex === -1 || startDayIndex > endDayIndex) {
                                      return null;
                                    }
                                    
                                    const leftPercent = (startDayIndex / numDays) * 100;
                                    const widthPercent = ((endDayIndex - startDayIndex + 1) / numDays) * 100;
                                    
                                    const showRoundedLeft = isSameDay(projectStart, viewDays[startDayIndex]) || startDayIndex === 0;
                                    const showRoundedRight = isSameDay(projectEnd, viewDays[endDayIndex]) || endDayIndex === numDays - 1;
                                    
                                    return (
                                      <DraggableSpanningProject
                                        key={project.id}
                                        project={project}
                                        colors={colors}
                                        style={{
                                          left: `calc(${leftPercent}% + 2px)`,
                                          width: `calc(${widthPercent}% - 4px)`,
                                          top: `${lane * 40 + 4}px`,
                                        }}
                                        showRoundedLeft={showRoundedLeft}
                                        showRoundedRight={showRoundedRight}
                                        onClick={() => navigate(`/crm/projects/${project.id}`)}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Tasks Due section */}
                        {(() => {
                          const tasksByDay = viewDays.map(day => {
                            const dayStart = startOfDay(day);
                            return calendarTasksData?.filter(task => {
                              if (!task.dueDate) return false;
                              return isSameDay(new Date(task.dueDate), dayStart);
                            }) || [];
                          });
                          
                          const hasTasks = tasksByDay.some(tasks => tasks.length > 0);
                          if (!hasTasks) return null;
                          
                          return (
                            <div className="border-b bg-indigo-50/30">
                              <div className="flex">
                                <div className="w-[60px] flex-shrink-0 border-r bg-muted/30 p-1 pr-2 text-right">
                                  <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                                    <ListTodo className="w-3 h-3" />
                                    Tasks
                                  </div>
                                </div>
                                {viewDays.map((day, idx) => {
                                  const dayTasks = tasksByDay[idx];
                                  return (
                                    <div
                                      key={day.toISOString()}
                                      className={cn(
                                        "flex-1 min-w-0 p-1 border-r last:border-r-0 min-h-[40px]",
                                        isToday(day) && "bg-amber-50/50"
                                      )}
                                    >
                                      {dayTasks.length > 0 ? (
                                        <div className="space-y-0.5">
                                          {dayTasks.slice(0, 3).map(task => (
                                            <DraggableTask
                                              key={task.id}
                                              task={task}
                                              onClick={() => navigate(`/crm/projects/${task.projectId}`)}
                                            />
                                          ))}
                                          {dayTasks.length > 3 && (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <button className="text-[9px] text-indigo-600 hover:text-indigo-700 px-1">
                                                  +{dayTasks.length - 3} more tasks
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-64 p-2" align="start">
                                                <div className="font-medium text-sm mb-2">{format(day, "EEEE, MMM d")} - Tasks</div>
                                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                                  {dayTasks.map(task => (
                                                    <button
                                                      key={task.id}
                                                      onClick={() => navigate(`/crm/projects/${task.projectId}`)}
                                                      className={cn(
                                                        "w-full text-left p-2 rounded text-xs hover:bg-indigo-100 border border-indigo-200",
                                                        task.completedAt ? "bg-gray-100 text-gray-400 line-through" : "bg-indigo-50 text-indigo-700"
                                                      )}
                                                    >
                                                      <div className="flex items-center gap-1.5">
                                                        <ListTodo className="w-3 h-3 flex-shrink-0" />
                                                        <span className="truncate font-medium">{task.title}</span>
                                                      </div>
                                                      <div className="text-[10px] opacity-75 mt-0.5 truncate">
                                                        {task.dueDate && <span className="font-medium">{format(new Date(task.dueDate), "MMM d")}</span>}
                                                        {task.projectTitle && ` • ${task.projectTitle}`}
                                                        {task.assignedUserName && ` • ${task.assignedUserName}`}
                                                      </div>
                                                    </button>
                                                  ))}
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-[9px] text-muted-foreground italic">—</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                        
                        <div className="max-h-[600px] overflow-y-auto">
                          {hours.map((hour) => (
                            <div key={hour} className="flex">
                              <div className="w-[60px] flex-shrink-0 p-1 border-r text-right pr-2 text-xs text-muted-foreground bg-muted/30">
                                {format(setHours(new Date(), hour), "h a")}
                              </div>
                              {viewDays.map((day) => {
                                const isTodayDate = isToday(day);
                                const dayStart = startOfDay(day);
                                
                                const hourProjects = allProjects.filter((project) => {
                                  if (!project.startDate) return false;
                                  const projectStart = new Date(project.startDate);
                                  if (!isSameDay(projectStart, dayStart)) return false;
                                  
                                  // Exclude multi-day projects (they appear in the spanning section)
                                  if (project.endDate) {
                                    const projectEnd = new Date(project.endDate);
                                    if (!isSameDay(projectStart, projectEnd)) return false;
                                  }
                                  
                                  const projectHour = getHours(projectStart);
                                  if (projectHour === 0 && hour === 8) return true;
                                  return projectHour === hour;
                                });
                                
                                return (
                                  <DroppableTimeSlot
                                    key={`${day.toISOString()}-${hour}`}
                                    day={day}
                                    hour={hour}
                                    isTodayDate={isTodayDate}
                                  >
                                    <div className="space-y-0.5 min-w-0 w-full">
                                      {hourProjects.slice(0, 3).map((project) => {
                                        const colors = statusColors[project.status] || statusColors.lead;
                                        return (
                                          <DraggableTimeSlotProject
                                            key={project.id}
                                            project={project}
                                            colors={colors}
                                            onClick={() => navigate(`/crm/projects/${project.id}`)}
                                          />
                                        );
                                      })}
                                      {hourProjects.length > 3 && (
                                        <div className="text-[8px] text-muted-foreground text-center">
                                          +{hourProjects.length - 3} more
                                        </div>
                                      )}
                                    </div>
                                  </DroppableTimeSlot>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}

                <DragOverlay>
                  {activeDragProject && (
                    <div className={cn(
                      "text-[10px] leading-tight py-1 px-2 rounded shadow-lg opacity-90",
                      statusColors[activeDragProject.status]?.bg || "bg-slate-100",
                      statusColors[activeDragProject.status]?.text || "text-slate-700"
                    )}>
                      <div className="font-medium">{activeDragProject.customerName || "Customer"} - {formatProjectNumber(activeDragProject.projectNumber)}</div>
                      <div className="opacity-90">{activeDragProject.title}</div>
                      {activeDragProject.expectedValue && (
                        <div className="font-medium">{formatCurrency(activeDragProject.expectedValue)}</div>
                      )}
                    </div>
                  )}
                  {activeDragTask && (
                    <div className="flex items-center gap-1 text-[9px] py-0.5 px-1.5 rounded bg-indigo-100 text-indigo-700 shadow-lg opacity-90">
                      <ListTodo className="w-3 h-3" />
                      <span>{activeDragTask.title}</span>
                    </div>
                  )}
                </DragOverlay>
              </div>
            </DndContext>
          </TabsContent>

          <TabsContent value="kanban" className="mt-4">
            <DndContext 
              sensors={sensors} 
              onDragStart={handleKanbanDragStart} 
              onDragEnd={handleKanbanDragEnd}
            >
              {allProjectsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : (
                <HorizontalScrollContainer isDraggingCard={isDraggingCard}>
                  {KANBAN_STAGES.map((stage) => (
                    <ProjectKanbanColumn
                      key={stage}
                      stage={stage}
                      projects={projectsByStage[stage] || []}
                      onCardClick={(project) => navigate(`/crm/projects/${project.id}`)}
                    />
                  ))}
                </HorizontalScrollContainer>
              )}

              <DragOverlay>
                {activeKanbanProject && (
                  <Card className="w-[280px] shadow-lg opacity-90">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 p-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm truncate">
                            {activeKanbanProject.customerName || "No customer"} - {formatProjectNumber(activeKanbanProject.projectNumber)}
                          </h4>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {activeKanbanProject.title}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </DragOverlay>
            </DndContext>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSearchOpen}
                    className="w-full justify-between"
                  >
                    {selectedCustomer ? selectedCustomer.name : "Select customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search customers..."
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                    />
                    <CommandList>
                      {customersLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            {customersData?.customers.map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={customer.name}
                                onSelect={() => {
                                  setSelectedCustomer(customer);
                                  setSelectedSite(null);
                                  setCustomerSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedCustomer?.id === customer.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{customer.name}</span>
                                  {customer.fullAddress && (
                                    <span className="text-xs text-slate-500">
                                      {customer.fullAddress}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedCustomer && (
              <div className="space-y-2">
                <Label htmlFor="location">
                  Location {sites.length > 0 && <span className="text-red-500">*</span>}
                </Label>
                {sitesLoading ? (
                  <div className="flex items-center gap-2 p-3 border rounded-md bg-slate-50">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500">Loading locations...</span>
                  </div>
                ) : sites.length > 0 ? (
                  <Select 
                    value={selectedSite?.id || ""} 
                    onValueChange={(value) => {
                      const site = sites.find(s => s.id === value);
                      setSelectedSite(site || null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a location">
                        {selectedSite 
                          ? `${selectedSite.address1}${selectedSite.city ? `, ${selectedSite.city}` : ""}`
                          : "Select a location"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.tenantName || site.address1}
                          {site.city && `, ${site.city}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-slate-500 p-2">No locations for this customer</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Project title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectType">Project Type *</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {projectTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "Select start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        setStartDate(date);
                        if (date && (!endDate || endDate < date)) {
                          setEndDate(date);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "Select end"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => startDate ? date < startDate : false}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedValue">Expected Value</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="expectedValue"
                  type="number"
                  value={expectedValue}
                  onChange={(e) => setExpectedValue(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
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

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Project description (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetCreateForm();
                setCreateDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={createProjectMutation.isPending || !selectedCustomer || !title || !projectType || !startDate || !endDate || (sites.length > 0 && !selectedSite)}
            >
              {createProjectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
