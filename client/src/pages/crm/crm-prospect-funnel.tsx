import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  useDraggable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertTriangle,
  Flame,
  Thermometer,
  Snowflake,
  Clock,
  Users,
  Activity,
  TrendingUp,
  Search,
  X,
  Filter,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  MessageSquare,
  StickyNote,
  List,
  CalendarDays,
  DollarSign,
  BarChart3,
  GripVertical,
  LayoutGrid,
  Trophy,
  Pencil,
  History,
  Send,
  FileText,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { format, isToday, isPast, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, isSameMonth, startOfWeek, endOfWeek, getDay, addDays, subDays, addWeeks, subWeeks, startOfDay, getHours, getMinutes, setHours } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CrmUser, CrmCustomer, CrmFollowUp, SalesStage, InterestLevel, FollowUpType, CrmQuote } from "@shared/schema";

type ProspectMetrics = {
  activeProspects: number;
  pendingActions: number;
  conversionRate: string;
  pipelineValue: number;
  funnelCounts: {
    new: number;
    contacted: number;
    quote_sent: number;
    negotiating: number;
    won: number;
    lost: number;
  };
};

type OverviewAnalytics = {
  leaderboard: Array<{
    repId: string;
    repName: string;
    leadsAssigned: number;
    quotesGenerated: number;
    wins: number;
    conversionRate: number;
    totalRevenue: number;
  }>;
  stalledDeals: Array<{
    customerId: string;
    customerName: string;
    salesStage: string;
    daysSinceActivity: number;
    potentialValue: number | null;
    assignedSalesRepName: string | null;
  }>;
  forecast: {
    totalWeightedForecast: number;
    breakdown: Array<{
      stage: string;
      count: number;
      totalValue: number;
      weightedValue: number;
      weight: number;
    }>;
  };
};

const NEXT_STAGE: Record<SalesStage, SalesStage | null> = {
  new: "contacted",
  contacted: "quote_sent",
  quote_sent: "negotiating",
  negotiating: "won",
  won: null,
  lost: null,
};

const STAGE_LABELS: Record<SalesStage, string> = {
  new: "New",
  contacted: "Contacted",
  quote_sent: "Quote Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

const temperatureConfig: Record<InterestLevel, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  hot: { icon: Flame, className: "bg-red-100 text-red-700 border-red-200" },
  warm: { icon: Thermometer, className: "bg-amber-100 text-amber-700 border-amber-200" },
  cold: { icon: Snowflake, className: "bg-slate-100 text-slate-600 border-slate-200" },
};

function InterestBadge({ level }: { level: InterestLevel | null | undefined }) {
  if (!level) return null;
  
  const { icon: Icon, className } = temperatureConfig[level];
  
  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      <Icon className="h-3 w-3 mr-1" />
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </Badge>
  );
}

function FollowUpBadge({ nextFollowUpAt }: { nextFollowUpAt: Date | string | null | undefined }) {
  if (!nextFollowUpAt) return null;
  
  const date = typeof nextFollowUpAt === "string" ? parseISO(nextFollowUpAt) : nextFollowUpAt;
  
  if (isPast(date) && !isToday(date)) {
    return (
      <div className="flex items-center gap-1.5 text-red-700 font-medium text-sm">
        <AlertTriangle className="h-4 w-4" />
        <span>Follow-up overdue</span>
        <span className="text-red-500 text-xs">({format(date, "MMM d")})</span>
      </div>
    );
  }
  
  if (isToday(date)) {
    return (
      <div className="flex items-center gap-1.5 text-amber-700 font-medium text-sm">
        <Clock className="h-4 w-4" />
        <span>Follow-up due today</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1.5 text-slate-600 text-sm">
      <Calendar className="h-4 w-4 text-blue-500" />
      <span>Follow-up</span>
      <span className="font-medium">{format(date, "MMM d")}</span>
    </div>
  );
}

// Avatar colors based on name hash
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500", 
  "bg-purple-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-orange-500",
  "bg-cyan-500",
];

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getAvatarColor(name: string | null | undefined): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function InitialsAvatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);
  
  const sizeClasses = {
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base",
  };
  
  return (
    <div className={`${sizeClasses[size]} ${bgColor} rounded-full flex items-center justify-center text-white font-medium flex-shrink-0`}>
      {initials}
    </div>
  );
}

function FollowUpTypeIcon({ type }: { type: FollowUpType }) {
  switch (type) {
    case "call":
      return <Phone className="h-3 w-3" />;
    case "email":
      return <Mail className="h-3 w-3" />;
    case "visit":
      return <MapPin className="h-3 w-3" />;
    case "text":
      return <MessageSquare className="h-3 w-3" />;
    default:
      return <Calendar className="h-3 w-3" />;
  }
}

const KANBAN_STAGES: SalesStage[] = ["new", "contacted", "quote_sent", "negotiating"];
const COLUMN_PREFIX = "column-";

function getColumnId(stage: SalesStage): string {
  return `${COLUMN_PREFIX}${stage}`;
}

function getStageFromColumnId(columnId: string): SalesStage | null {
  if (columnId.startsWith(COLUMN_PREFIX)) {
    const stage = columnId.slice(COLUMN_PREFIX.length) as SalesStage;
    if (KANBAN_STAGES.includes(stage)) {
      return stage;
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
    <div className="relative" style={{ overflow: 'visible' }}>
      {showLeftFade && (
        <div className="absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      )}
      <div
        ref={containerRef}
        className={cn(
          "flex flex-row gap-4 pb-4 kanban-scroll-container",
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
        data-testid="kanban-board"
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

interface DraggableFollowUpProps {
  followUp: {
    id: string;
    followUpType: string | null;
    dueAt: string | Date;
    notes: string | null;
    completedAt: string | Date | null;
    prospect?: CrmCustomer;
  };
  onClick: () => void;
  calendarItemStyle: string;
  isCompleted: boolean;
}

function DraggableFollowUp({ followUp, onClick, calendarItemStyle, isCompleted }: DraggableFollowUpProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: followUp.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 1000 : undefined,
        opacity: isDragging ? 0.8 : 1,
      }
    : undefined;

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick();
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      style={style}
      className={`w-full text-left text-xs p-1 rounded truncate cursor-grab active:cursor-grabbing hover:opacity-80 touch-manipulation ${calendarItemStyle}`}
      data-testid={`calendar-followup-${followUp.id}`}
    >
      <div className="flex items-center gap-1">
        <FollowUpTypeIcon type={followUp.followUpType as FollowUpType} />
        <span className={`truncate ${isCompleted ? 'line-through' : ''}`}>{followUp.prospect?.name || "Unknown"}</span>
      </div>
      {followUp.notes && (
        <div className="truncate text-[10px] opacity-75">{followUp.notes}</div>
      )}
    </div>
  );
}

interface DroppableCalendarDayProps {
  day: Date;
  calendarMonth: Date;
  children: ReactNode;
}

function DroppableCalendarDay({ day, calendarMonth, children }: DroppableCalendarDayProps) {
  const dateStr = format(day, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({
    id: `calendar-day-${dateStr}`,
  });

  const isCurrentMonth = isSameMonth(day, calendarMonth);
  const isTodayDate = isToday(day);

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] bg-white p-1 transition-colors ${
        !isCurrentMonth ? "bg-gray-50 text-gray-400" : ""
      } ${isTodayDate ? "ring-2 ring-amber-400 ring-inset" : ""} ${
        isOver ? "bg-blue-50 ring-2 ring-blue-400 ring-inset" : ""
      }`}
      data-testid={`calendar-day-${dateStr}`}
    >
      {children}
    </div>
  );
}

interface ProspectCardProps {
  prospect: CrmCustomer;
  onClick: () => void;
  isDragging?: boolean;
}

function ProspectCard({ prospect, onClick, isDragging: isDraggingProp }: ProspectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: prospect.id,
    data: {
      type: "card",
      prospect,
      stage: prospect.salesStage || "new",
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isDraggingProp ? 0.5 : 1,
  };

  const nextFollowUp = prospect.nextFollowUpAt
    ? typeof prospect.nextFollowUpAt === "string"
      ? parseISO(prospect.nextFollowUpAt)
      : prospect.nextFollowUpAt
    : null;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="mb-2 cursor-pointer hover:shadow-md transition-shadow bg-white touch-manipulation"
      onClick={onClick}
      data-testid={`card-prospect-${prospect.id}`}
      data-no-drag
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            data-testid={`drag-handle-${prospect.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" data-testid={`text-prospect-name-${prospect.id}`}>
              {prospect.name}
            </h4>
            {prospect.phone && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span>{prospect.phone}</span>
              </div>
            )}
            {nextFollowUp && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${
                isPast(nextFollowUp) && !isToday(nextFollowUp) 
                  ? "text-red-600 font-medium" 
                  : isToday(nextFollowUp) 
                  ? "text-amber-600 font-medium"
                  : "text-muted-foreground"
              }`}>
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{format(nextFollowUp, "MMM d")}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              <InterestBadge level={prospect.interestLevel as InterestLevel} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ProspectKanbanColumnProps {
  stage: SalesStage;
  prospects: CrmCustomer[];
  onCardClick: (prospect: CrmCustomer) => void;
}

function ProspectKanbanColumn({ stage, prospects, onCardClick }: ProspectKanbanColumnProps) {
  const columnId = getColumnId(stage);
  
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: {
      type: "column",
      stage,
    }
  });

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col">
      <Card className={`h-full bg-gray-50 transition-colors flex flex-col ${isOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}>
        <CardHeader className="pb-2 pt-3 px-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold truncate" data-testid={`column-title-${stage}`}>
              {STAGE_LABELS[stage]}
            </CardTitle>
            <Badge variant="outline" className="ml-2 flex-shrink-0" data-testid={`column-count-${stage}`}>
              {prospects.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 flex-1 overflow-hidden">
          <div
            ref={setNodeRef}
            className="h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
            data-testid={`kanban-column-${stage}`}
          >
            <SortableContext items={prospects.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {prospects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No leads
                </div>
              ) : (
                prospects.map((prospect) => (
                  <ProspectCard
                    key={prospect.id}
                    prospect={prospect}
                    onClick={() => onCardClick(prospect)}
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

export default function CrmProspectFunnel() {
  usePageTitle("Sales Funnel");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [activeFilter, setActiveFilter] = useState<string>("All Active");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  
  const [expandedProspectId, setExpandedProspectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("details");
  
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("call");
  const [followUpDueDate, setFollowUpDueDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  
  const [wonConfirmOpen, setWonConfirmOpen] = useState(false);
  const [lostConfirmOpen, setLostConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteFollowUpConfirmOpen, setDeleteFollowUpConfirmOpen] = useState(false);
  const [deleteFollowUpId, setDeleteFollowUpId] = useState<string | null>(null);
  const [confirmProspectId, setConfirmProspectId] = useState<string | null>(null);
  
  const [mainViewTab, setMainViewTab] = useState<string>("overview");
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<"month" | "week" | "3day" | "day">("month");
  
  const [activeProspectId, setActiveProspectId] = useState<string | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [activeCalendarFollowUpId, setActiveCalendarFollowUpId] = useState<string | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editInterestLevel, setEditInterestLevel] = useState<InterestLevel | "">("");

  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [editFollowUpType, setEditFollowUpType] = useState<FollowUpType>("call");
  const [editFollowUpDueDate, setEditFollowUpDueDate] = useState("");
  const [editFollowUpNotes, setEditFollowUpNotes] = useState("");

  const [leadNoteBody, setLeadNoteBody] = useState("");
  const [showAllNotes, setShowAllNotes] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const getApiStatus = (filter: string): string | null => {
    if (filter === "All Active") return null;
    if (filter === "Won") return "won";
    if (filter === "Lost") return "lost";
    return filter.toLowerCase().replace(" ", "_");
  };

  const apiStatus = getApiStatus(activeFilter);
  
  const { data: prospects = [], isLoading: prospectsLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/prospects", apiStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (apiStatus) params.set("status", apiStatus);
      const res = await fetch(`/api/crm/prospects?${params.toString()}`);
      return res.json();
    },
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<ProspectMetrics>({
    queryKey: ["/api/crm/prospects/metrics"],
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  const { data: overviewAnalytics, isLoading: analyticsLoading } = useQuery<OverviewAnalytics>({
    queryKey: ["/api/crm/prospects/overview-analytics", selectedEmployeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedEmployeeId !== "all") params.set("employee", selectedEmployeeId);
      const res = await fetch(`/api/crm/prospects/overview-analytics?${params.toString()}`);
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: followUps = [], isLoading: followUpsLoading } = useQuery<CrmFollowUp[]>({
    queryKey: ["/api/crm/follow-ups"],
    enabled: !!currentUser,
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser,
  });

  type LeadNote = {
    id: string;
    customerId: string;
    userId: string;
    body: string;
    createdAt: string;
    userName: string;
  };

  const { data: leadNotes = [], isLoading: leadNotesLoading } = useQuery<LeadNote[]>({
    queryKey: ["/api/crm/customers", expandedProspectId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${expandedProspectId}/notes`);
      return res.json();
    },
    enabled: !!currentUser && !!expandedProspectId,
  });

  const { data: leadQuotes = [] } = useQuery<CrmQuote[]>({
    queryKey: ['/api/crm/quotes', 'lead', expandedProspectId],
    queryFn: async () => {
      if (!expandedProspectId) return [];
      const res = await fetch(`/api/crm/quotes?customerId=${expandedProspectId}&sourceType=lead`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.quotes || [];
    },
    enabled: !!expandedProspectId,
  });

  const salesUsers = useMemo(() => {
    return (users || []).filter(u => u.role === 'sales');
  }, [users]);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, salesStage }: { id: string; salesStage: SalesStage }) => {
      const res = await apiRequest("PATCH", `/api/crm/customers/${id}/stage`, { salesStage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects/metrics"] });
      toast({ title: "Stage updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update stage", description: error.message, variant: "destructive" });
    },
  });

  const createFollowUpMutation = useMutation({
    mutationFn: async (data: { customerId: string; followUpType: FollowUpType; dueAt: string; notes?: string; openInEditMode?: boolean }) => {
      const res = await apiRequest("POST", "/api/crm/follow-ups", {
        customerId: data.customerId,
        followUpType: data.followUpType,
        dueAt: data.dueAt,
        notes: data.notes,
      });
      return { followUp: await res.json(), openInEditMode: data.openInEditMode };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      if (result.openInEditMode && result.followUp?.id) {
        setEditingFollowUpId(result.followUp.id);
        setEditFollowUpType(result.followUp.followUpType || "call");
        setEditFollowUpDueDate(format(new Date(result.followUp.dueAt), "yyyy-MM-dd'T'HH:mm"));
        setEditFollowUpNotes(result.followUp.notes || "");
        toast({ title: "Follow-up created - edit below" });
      } else {
        setFollowUpDialogOpen(false);
        setSelectedProspectId(null);
        setFollowUpType("call");
        setFollowUpDueDate("");
        setFollowUpNotes("");
        toast({ title: "Follow-up scheduled" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to schedule follow-up", description: error.message, variant: "destructive" });
    },
  });

  const completeFollowUpMutation = useMutation({
    mutationFn: async ({ id, completedAt }: { id: string; completedAt: string | null }) => {
      const res = await apiRequest("PATCH", `/api/crm/follow-ups/${id}`, { completedAt });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      toast({ title: variables.completedAt ? "Follow-up completed" : "Follow-up marked incomplete" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update follow-up", description: error.message, variant: "destructive" });
    },
  });

  const updateFollowUpMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { followUpType?: FollowUpType; dueAt?: string; notes?: string } }) => {
      const res = await apiRequest("PATCH", `/api/crm/follow-ups/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      setEditingFollowUpId(null);
      setEditFollowUpType("call");
      setEditFollowUpDueDate("");
      setEditFollowUpNotes("");
      toast({ title: "Follow-up updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update follow-up", description: error.message, variant: "destructive" });
    },
  });

  const deleteFollowUpMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/crm/follow-ups/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      setDeleteFollowUpConfirmOpen(false);
      setDeleteFollowUpId(null);
      toast({ title: "Follow-up deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete follow-up", description: error.message, variant: "destructive" });
    },
  });

  const updateSalesRepMutation = useMutation({
    mutationFn: async ({ id, assignedSalesRepId }: { id: string; assignedSalesRepId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/crm/customers/${id}`, { assignedSalesRepId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      toast({ title: "Salesperson updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update salesperson", description: error.message, variant: "destructive" });
    },
  });

  const removeFromFunnelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/crm/customers/${id}`, {
        salesStage: null,
        interestLevel: null,
        customerStatus: "client",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects/metrics"] });
      toast({ title: "Removed from lead funnel" });
      setExpandedProspectId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove from funnel", description: error.message, variant: "destructive" });
    },
  });

  const createLeadNoteMutation = useMutation({
    mutationFn: async ({ customerId, body }: { customerId: string; body: string }) => {
      const res = await apiRequest("POST", `/api/crm/customers/${customerId}/notes`, { body });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", expandedProspectId, "notes"] });
      setLeadNoteBody("");
      toast({ title: "Comment posted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to post comment", description: error.message, variant: "destructive" });
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { phone?: string; email?: string; fullAddress?: string; companyName?: string; notes?: string; interestLevel?: string | null } }) => {
      const res = await apiRequest("PATCH", `/api/crm/customers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      toast({ title: "Lead updated successfully" });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update lead", description: error.message, variant: "destructive" });
    },
  });

  const handleEditLead = () => {
    if (!expandedProspect) return;
    setEditPhone(expandedProspect.phone || "");
    setEditEmail(expandedProspect.email || "");
    setEditAddress(expandedProspect.fullAddress || "");
    setEditCompanyName(expandedProspect.companyName || "");
    setEditNotes(expandedProspect.notes || "");
    setEditInterestLevel((expandedProspect.interestLevel as InterestLevel) || "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditPhone("");
    setEditEmail("");
    setEditAddress("");
    setEditCompanyName("");
    setEditNotes("");
    setEditInterestLevel("");
  };

  const handleSaveLead = () => {
    if (!expandedProspect) return;
    updateLeadMutation.mutate({
      id: expandedProspect.id,
      data: {
        phone: editPhone,
        email: editEmail,
        fullAddress: editAddress,
        companyName: editCompanyName,
        notes: editNotes,
        interestLevel: editInterestLevel || null,
      },
    });
  };

  const handleRemoveFromFunnel = () => {
    if (confirmProspectId) {
      removeFromFunnelMutation.mutate(confirmProspectId);
      setDeleteConfirmOpen(false);
      setConfirmProspectId(null);
    }
  };

  const fuzzyMatch = (text: string, search: string): number => {
    if (!text || !search) return 0;
    const textLower = text.toLowerCase();
    const searchLower = search.toLowerCase();
    
    if (textLower.includes(searchLower)) return 100;
    
    let searchIdx = 0;
    let matchCount = 0;
    for (let i = 0; i < textLower.length && searchIdx < searchLower.length; i++) {
      if (textLower[i] === searchLower[searchIdx]) {
        matchCount++;
        searchIdx++;
      }
    }
    
    if (matchCount >= searchLower.length * 0.6) {
      return (matchCount / searchLower.length) * 80;
    }
    
    return 0;
  };

  const filteredProspects = useMemo(() => {
    return prospects
      .map((prospect) => {
        let searchScore = 0;
        if (searchTerm.trim()) {
          const search = searchTerm.trim();
          const nameScore = fuzzyMatch(prospect.name || '', search);
          const phoneDigits = prospect.phone?.replace(/\D/g, '') || '';
          const searchDigits = search.replace(/\D/g, '');
          const phoneScore = searchDigits && phoneDigits.includes(searchDigits) ? 100 : 0;
          searchScore = Math.max(nameScore, phoneScore);
        }
        return { prospect, searchScore };
      })
      .filter(({ prospect, searchScore }) => {
        if (searchTerm.trim() && searchScore === 0) return false;
        if (selectedEmployeeId !== "all" && prospect.assignedSalesRepId !== selectedEmployeeId) return false;
        
        if (activeFilter === "All Active") {
          return prospect.salesStage !== "won" && prospect.salesStage !== "lost";
        }
        if (activeFilter === "Won") return prospect.salesStage === "won";
        if (activeFilter === "Lost") return prospect.salesStage === "lost";
        
        return prospect.salesStage === activeFilter.toLowerCase().replace(" ", "_");
      })
      .sort((a, b) => b.searchScore - a.searchScore)
      .map(({ prospect }) => prospect);
  }, [prospects, searchTerm, selectedEmployeeId, activeFilter]);

  const handleMoveToNextStage = (prospect: CrmCustomer) => {
    const nextStage = prospect.salesStage ? NEXT_STAGE[prospect.salesStage] : null;
    if (nextStage) {
      if (nextStage === "won") {
        setConfirmProspectId(prospect.id);
        setWonConfirmOpen(true);
      } else {
        updateStageMutation.mutate({ id: prospect.id, salesStage: nextStage });
      }
    }
  };

  const handleMarkWon = () => {
    if (confirmProspectId) {
      updateStageMutation.mutate({ id: confirmProspectId, salesStage: "won" });
      setWonConfirmOpen(false);
      setConfirmProspectId(null);
      setExpandedProspectId(null);
    }
  };

  const handleMarkLost = () => {
    if (confirmProspectId) {
      updateStageMutation.mutate({ id: confirmProspectId, salesStage: "lost" });
      setLostConfirmOpen(false);
      setConfirmProspectId(null);
      setExpandedProspectId(null);
    }
  };

  const handleAddFollowUp = (prospectId: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    createFollowUpMutation.mutate({
      customerId: prospectId,
      followUpType: "call",
      dueAt: tomorrow.toISOString(),
      openInEditMode: true,
    });
  };

  const handleSubmitFollowUp = () => {
    if (!selectedProspectId || !followUpDueDate) return;
    
    createFollowUpMutation.mutate({
      customerId: selectedProspectId,
      followUpType,
      dueAt: new Date(followUpDueDate).toISOString(),
      notes: followUpNotes || undefined,
    });
  };

  const getProspectFollowUps = (prospectId: string) => {
    return followUps.filter(f => f.customerId === prospectId)
      .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
  };

  const selectedEmployeeName = useMemo(() => {
    if (selectedEmployeeId === "all") return null;
    const user = salesUsers.find(u => u.id === selectedEmployeeId);
    return user?.name || null;
  }, [selectedEmployeeId, salesUsers]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [calendarMonth]);

  const prospectsByStage = useMemo(() => {
    const grouped: Record<SalesStage, CrmCustomer[]> = {
      new: [],
      contacted: [],
      quote_sent: [],
      negotiating: [],
      won: [],
      lost: [],
    };
    prospects.forEach((p) => {
      const stage = (p.salesStage || "new") as SalesStage;
      if (grouped[stage]) {
        grouped[stage].push(p);
      }
    });
    return grouped;
  }, [prospects]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveProspectId(event.active.id as string);
    setIsDraggingCard(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProspectId(null);
    setIsDraggingCard(false);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let newStage: SalesStage | null = null;

    if (over.data.current?.type === "column") {
      newStage = over.data.current.stage as SalesStage;
    } else if (over.data.current?.type === "card") {
      newStage = over.data.current.stage as SalesStage;
    } else {
      newStage = getStageFromColumnId(overId);
    }

    if (newStage) {
      const prospect = prospects.find((p) => p.id === activeId);
      if (prospect && prospect.salesStage !== newStage) {
        if (newStage === "won") {
          setConfirmProspectId(activeId);
          setWonConfirmOpen(true);
        } else if (newStage === "lost") {
          setConfirmProspectId(activeId);
          setLostConfirmOpen(true);
        } else {
          updateStageMutation.mutate({ id: activeId, salesStage: newStage });
        }
      }
    }
  };

  const handleCalendarDragStart = (event: DragStartEvent) => {
    setActiveCalendarFollowUpId(event.active.id as string);
  };

  const handleCalendarDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCalendarFollowUpId(null);

    if (!over) return;

    const followUpId = active.id as string;
    const targetDateStr = over.id as string;

    if (!targetDateStr.startsWith("calendar-day-")) return;

    const targetDate = parseISO(targetDateStr.replace("calendar-day-", ""));
    const followUp = followUps.find((f) => f.id === followUpId);

    if (!followUp) return;

    const originalDate = typeof followUp.dueAt === "string" ? parseISO(followUp.dueAt) : followUp.dueAt;

    if (isSameDay(originalDate, targetDate)) return;

    const hours = originalDate.getHours();
    const minutes = originalDate.getMinutes();
    const newDate = new Date(targetDate);
    newDate.setHours(hours, minutes, 0, 0);

    updateFollowUpMutation.mutate({
      id: followUpId,
      data: { dueAt: newDate.toISOString() },
    });
  };

  const filteredProspectIds = useMemo(() => {
    return new Set(filteredProspects.map((p) => p.id));
  }, [filteredProspects]);

  const getFollowUpsForDate = (date: Date) => {
    return followUps.filter((f) => {
      if (!filteredProspectIds.has(f.customerId)) return false;
      const followUpDate = typeof f.dueAt === "string" ? parseISO(f.dueAt) : f.dueAt;
      return isSameDay(followUpDate, date);
    }).map((f) => {
      const prospect = filteredProspects.find((p) => p.id === f.customerId);
      return { ...f, prospect };
    });
  };

  if (authLoading) {
    return (
      <CrmLayout currentUser={{} as CrmUser}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

  const isLoading = prospectsLoading || followUpsLoading;

  const expandedProspect = expandedProspectId ? filteredProspects.find(p => p.id === expandedProspectId) : null;

  const SearchFiltersComponent = () => (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
            data-testid="input-search-prospects"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchTerm("")}
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm bg-white border-slate-300" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Active">All Active</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Contacted">Contacted</SelectItem>
            <SelectItem value="Quote Sent">Quote Sent</SelectItem>
            <SelectItem value="Negotiating">Negotiating</SelectItem>
            <SelectItem value="Won">Won</SelectItem>
            <SelectItem value="Lost">Lost</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
          <SelectTrigger className="w-[160px] h-9 text-sm bg-white border-slate-300" data-testid="select-employee-filter">
            <SelectValue placeholder="All Sales People" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sales People</SelectItem>
            {salesUsers.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
                Lead Funnel
              </h1>
              <p className="text-sm text-slate-500">
                Track leads through your sales pipeline
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/crm/add-prospect")}
              className="bg-[#711419] hover:bg-[#5a1014]"
              data-testid="button-add-prospect"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add New Lead
            </Button>
          </div>
          
          {/* Tabs styled like work orders page - underline style */}
          <div className="flex overflow-x-auto border-b border-slate-200" data-testid="tabs-main-view">
            <button
              onClick={() => setMainViewTab("overview")}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                mainViewTab === "overview"
                  ? "border-[#711419] text-[#711419]"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
              data-testid="tab-overview"
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
              data-testid="tab-list"
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
              data-testid="tab-calendar"
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
              data-testid="tab-kanban"
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
          </div>
          
          <Tabs value={mainViewTab} onValueChange={setMainViewTab} className="w-full">

            <TabsContent value="overview" className="space-y-6 mt-4">
              {selectedEmployeeName && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Showing stats for: <strong>{selectedEmployeeName}</strong></span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-auto h-7 text-xs"
                      onClick={() => setSelectedEmployeeId("all")}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {metricsLoading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <>
              <Card data-testid="card-metric-active">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Active Prospects
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-active-prospects">
                    {metrics?.activeProspects || 0}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-pending">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                    <Activity className="h-4 w-4" />
                    Pending Actions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-pending-actions">
                    {metrics?.pendingActions || 0}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-conversion">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Conversion Rate
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-conversion-rate">
                    {metrics?.conversionRate || "0"}%
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-pipeline">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Pipeline Value
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold text-green-600" data-testid="text-pipeline-value">
                    ${(metrics?.pipelineValue || 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card className="mb-6" data-testid="card-sales-funnel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Sales Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">New</div>
                <div className="text-2xl font-bold text-blue-600" data-testid="text-funnel-new">
                  {metrics?.funnelCounts?.new || 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Contacted</div>
                <div className="text-2xl font-bold text-amber-600" data-testid="text-funnel-contacted">
                  {metrics?.funnelCounts?.contacted || 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Quote Sent</div>
                <div className="text-2xl font-bold text-purple-600" data-testid="text-funnel-quote-sent">
                  {metrics?.funnelCounts?.quote_sent || 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Negotiating</div>
                <div className="text-2xl font-bold text-green-600" data-testid="text-funnel-negotiating">
                  {metrics?.funnelCounts?.negotiating || 0}
                </div>
              </div>
              <div className="text-center bg-green-50 p-2 rounded">
                <div className="text-sm text-muted-foreground">Won</div>
                <div className="text-2xl font-bold text-green-600" data-testid="text-funnel-won">
                  {metrics?.funnelCounts?.won || 0}
                </div>
              </div>
              <div className="text-center bg-red-50 p-2 rounded">
                <div className="text-sm text-muted-foreground">Lost</div>
                <div className="text-2xl font-bold text-red-600" data-testid="text-funnel-lost">
                  {metrics?.funnelCounts?.lost || 0}
                </div>
              </div>
            </div>
              </CardContent>
            </Card>

            {/* Sales Rep Leaderboard Section */}
            <Card className="mb-6" data-testid="card-leaderboard">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Sales Rep Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : overviewAnalytics?.leaderboard && overviewAnalytics.leaderboard.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium">Rep Name</th>
                          <th className="text-center py-2 px-2 font-medium">Leads</th>
                          <th className="text-center py-2 px-2 font-medium">Quotes</th>
                          <th className="text-center py-2 px-2 font-medium">Wins</th>
                          <th className="text-center py-2 px-2 font-medium">Conv %</th>
                          <th className="text-right py-2 px-2 font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...overviewAnalytics.leaderboard]
                          .sort((a, b) => b.totalRevenue - a.totalRevenue)
                          .map((rep) => (
                            <tr key={rep.repId} className="border-b border-slate-100">
                              <td className="py-2 px-2 font-medium">{rep.repName}</td>
                              <td className="text-center py-2 px-2">{rep.leadsAssigned}</td>
                              <td className="text-center py-2 px-2">{rep.quotesGenerated}</td>
                              <td className="text-center py-2 px-2">{rep.wins}</td>
                              <td className="text-center py-2 px-2">{rep.conversionRate}%</td>
                              <td className="text-right py-2 px-2 text-green-600 font-medium">
                                ${rep.totalRevenue.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No sales data available</p>
                )}
              </CardContent>
            </Card>

            {/* Stalled Deals Section */}
            <Card className="mb-6" data-testid="card-stalled-deals">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Stalled Deals
                  </CardTitle>
                  {overviewAnalytics?.stalledDeals && overviewAnalytics.stalledDeals.length > 0 && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      {overviewAnalytics.stalledDeals.length} deals need attention
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : overviewAnalytics?.stalledDeals && overviewAnalytics.stalledDeals.length > 0 ? (
                  <div className="space-y-2">
                    {overviewAnalytics.stalledDeals.map((deal) => (
                      <div
                        key={deal.customerId}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                        onClick={() => {
                          setExpandedProspectId(deal.customerId);
                          setActiveTab("details");
                        }}
                        data-testid={`stalled-deal-${deal.customerId}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <InitialsAvatar name={deal.customerName} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{deal.customerName}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className={`text-xs ${
                                deal.salesStage === 'new' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                deal.salesStage === 'contacted' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                deal.salesStage === 'quote_sent' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                deal.salesStage === 'negotiating' ? 'bg-green-50 text-green-700 border-green-200' :
                                'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>
                                {STAGE_LABELS[deal.salesStage as SalesStage] || deal.salesStage}
                              </Badge>
                              <span className="text-red-600 font-medium">{deal.daysSinceActivity} days stalled</span>
                              {deal.assignedSalesRepName && (
                                <span>· {deal.assignedSalesRepName}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {deal.potentialValue && (
                          <div className="text-right flex-shrink-0 ml-2">
                            <div className="font-medium text-green-600">
                              ${deal.potentialValue.toLocaleString()}
                            </div>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-6 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">No stalled deals - all prospects active!</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 30-Day Revenue Forecast Section */}
            <Card className="mb-6" data-testid="card-forecast">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  30-Day Revenue Forecast
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-48" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <div className="text-4xl font-bold text-green-600" data-testid="text-forecast-total">
                        ${(overviewAnalytics?.forecast?.totalWeightedForecast || 0).toLocaleString()}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Weighted Pipeline Value</p>
                    </div>

                    {overviewAnalytics?.forecast?.breakdown && overviewAnalytics.forecast.breakdown.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-2 font-medium">Stage</th>
                              <th className="text-center py-2 px-2 font-medium">Count</th>
                              <th className="text-right py-2 px-2 font-medium">Value</th>
                              <th className="text-center py-2 px-2 font-medium">Weight</th>
                              <th className="text-right py-2 px-2 font-medium">Weighted Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {overviewAnalytics.forecast.breakdown.map((row) => (
                              <tr key={row.stage} className="border-b border-slate-100">
                                <td className="py-2 px-2">
                                  <span className={`font-medium ${
                                    row.stage === 'new' ? 'text-blue-600' :
                                    row.stage === 'contacted' ? 'text-amber-600' :
                                    row.stage === 'quote_sent' ? 'text-purple-600' :
                                    row.stage === 'negotiating' ? 'text-green-600' :
                                    'text-slate-600'
                                  }`}>
                                    {STAGE_LABELS[row.stage as SalesStage] || row.stage}
                                  </span>
                                </td>
                                <td className="text-center py-2 px-2">{row.count}</td>
                                <td className="text-right py-2 px-2">${row.totalValue.toLocaleString()}</td>
                                <td className="text-center py-2 px-2">{Math.round(row.weight * 100)}%</td>
                                <td className="text-right py-2 px-2 text-green-600 font-medium">
                                  ${row.weightedValue.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground text-center italic">
                      Based on weighted probability by stage
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="list" className="space-y-4 mt-4">
              <SearchFiltersComponent />
              <Card className="bg-white border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold">Name / Contact</TableHead>
                        <TableHead className="font-semibold">Stage</TableHead>
                        <TableHead className="font-semibold">Interest</TableHead>
                        <TableHead className="font-semibold hidden md:table-cell">Next Follow-up</TableHead>
                        <TableHead className="font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : filteredProspects.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12">
                            <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">
                              {searchTerm ? "No leads found matching your search" : "No leads found"}
                            </p>
                            <p className="text-slate-400 text-sm mt-1">
                              {searchTerm ? "Try adjusting your search" : "Add a new lead to get started"}
                            </p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProspects.map((prospect) => {
                          const nextFollowUpDate = prospect.nextFollowUpAt
                            ? typeof prospect.nextFollowUpAt === "string"
                              ? parseISO(prospect.nextFollowUpAt)
                              : prospect.nextFollowUpAt
                            : null;
                          const isOverdue = nextFollowUpDate && isPast(nextFollowUpDate) && !isToday(nextFollowUpDate);
                          const isDueToday = nextFollowUpDate && isToday(nextFollowUpDate);
                          const isActive = prospect.salesStage !== "won" && prospect.salesStage !== "lost";

                          const getStageBadgeClass = (stage: string | null) => {
                            switch (stage) {
                              case "new":
                                return "bg-blue-100 text-blue-700 border-blue-200";
                              case "contacted":
                                return "bg-amber-100 text-amber-700 border-amber-200";
                              case "quote_sent":
                                return "bg-purple-100 text-purple-700 border-purple-200";
                              case "negotiating":
                                return "bg-green-100 text-green-700 border-green-200";
                              case "won":
                                return "bg-emerald-100 text-emerald-700 border-emerald-200";
                              case "lost":
                                return "bg-red-100 text-red-600 border-red-200";
                              default:
                                return "bg-slate-100 text-slate-700 border-slate-200";
                            }
                          };

                          return (
                            <TableRow
                              key={prospect.id}
                              className="cursor-pointer hover:bg-slate-50 transition-colors"
                              data-testid={`row-prospect-${prospect.id}`}
                            >
                              <TableCell className="py-3">
                                <div className="flex items-center gap-3">
                                  <InitialsAvatar name={prospect.name} size="md" />
                                  <div className="min-w-0">
                                    <div 
                                      className="font-medium text-slate-900 truncate cursor-pointer hover:text-[#711419]"
                                      onClick={() => {
                                        setExpandedProspectId(prospect.id);
                                        setActiveTab("details");
                                      }}
                                      data-testid={`text-prospect-name-${prospect.id}`}
                                    >
                                      {prospect.name}
                                    </div>
                                    {prospect.companyName && (
                                      <div className="text-xs text-slate-500 truncate">{prospect.companyName}</div>
                                    )}
                                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                      {prospect.phone && (
                                        <span className="flex items-center gap-1">
                                          <Phone className="h-3 w-3" />
                                          {prospect.phone}
                                        </span>
                                      )}
                                      {prospect.email && (
                                        <span className="flex items-center gap-1 truncate max-w-[150px]">
                                          <Mail className="h-3 w-3 flex-shrink-0" />
                                          <span className="truncate">{prospect.email}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${getStageBadgeClass(prospect.salesStage)}`}
                                >
                                  {STAGE_LABELS[prospect.salesStage as SalesStage] || "New"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <InterestBadge level={prospect.interestLevel as InterestLevel} />
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {nextFollowUpDate ? (
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                    isOverdue 
                                      ? "text-red-700" 
                                      : isDueToday 
                                      ? "text-amber-700" 
                                      : "text-slate-600"
                                  }`}>
                                    <Calendar className="h-3.5 w-3.5" />
                                    {isOverdue ? `Overdue (${format(nextFollowUpDate, "MMM d")})` : isDueToday ? "Today" : format(nextFollowUpDate, "MMM d")}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isActive && (
                                    <>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-7 w-7 text-green-600 hover:bg-green-50" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmProspectId(prospect.id);
                                          setWonConfirmOpen(true);
                                        }}
                                        title="Mark Won"
                                        data-testid={`button-mark-won-${prospect.id}`}
                                      >
                                        <CheckCircle2 className="h-4 w-4" />
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-7 w-7 text-red-600 hover:bg-red-50" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmProspectId(prospect.id);
                                          setLostConfirmOpen(true);
                                        }}
                                        title="Mark Lost"
                                        data-testid={`button-mark-lost-${prospect.id}`}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedProspectId(prospect.id);
                                      setActiveTab("details");
                                    }} 
                                    data-testid={`button-expand-${prospect.id}`}
                                  >
                                    View
                                    <ChevronRight className="h-3 w-3 ml-0.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
          </TabsContent>

            <TabsContent value="calendar" className="space-y-4 mt-4">
              <SearchFiltersComponent />
              <DndContext
                sensors={sensors}
                onDragStart={handleCalendarDragStart}
                onDragEnd={handleCalendarDragEnd}
              >
                <div className="space-y-4" data-testid="calendar-view">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
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
                        data-testid="button-prev-period"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <h3 className="text-lg font-semibold min-w-[180px] text-center" data-testid="text-calendar-month">
                        {calendarView === "month" 
                          ? format(calendarMonth, "MMMM yyyy")
                          : calendarView === "week"
                          ? `Week of ${format(startOfWeek(calendarMonth, { weekStartsOn: 0 }), "MMM d, yyyy")}`
                          : calendarView === "3day"
                          ? `${format(calendarMonth, "MMM d")} - ${format(addDays(calendarMonth, 2), "MMM d, yyyy")}`
                          : format(calendarMonth, "EEEE, MMM d, yyyy")
                        }
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
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
                        data-testid="button-next-period"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
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
                    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="bg-gray-100 text-center py-2 text-xs font-medium text-gray-600">
                          {day}
                        </div>
                      ))}
                      {calendarDays.map((day, idx) => {
                        const dayFollowUps = getFollowUpsForDate(day);
                        const isTodayDate = isToday(day);
                        const isPastDate = isPast(day) && !isTodayDate;
                        
                        return (
                          <DroppableCalendarDay key={idx} day={day} calendarMonth={calendarMonth}>
                            <div className={`text-xs font-medium mb-1 ${
                              isTodayDate ? "text-amber-600" : isPastDate ? "text-gray-400" : "text-gray-700"
                            }`}>
                              {format(day, "d")}
                            </div>
                            <div className="space-y-1">
                              {dayFollowUps.slice(0, 3).map((followUp) => {
                                const followUpDate = typeof followUp.dueAt === "string" ? parseISO(followUp.dueAt) : followUp.dueAt;
                                const isCompleted = !!followUp.completedAt;
                                const isOverdue = isPast(followUpDate) && !isToday(followUpDate) && !isCompleted;
                                
                                const calendarItemStyle = isCompleted
                                  ? "bg-gray-100 text-gray-400 border border-gray-200"
                                  : isOverdue
                                  ? "bg-red-100 text-red-700"
                                  : isTodayDate
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-gray-100 text-gray-700";
                                
                                return (
                                  <DraggableFollowUp
                                    key={followUp.id}
                                    followUp={followUp}
                                    onClick={() => {
                                      if (followUp.prospect) {
                                        setExpandedProspectId(followUp.prospect.id);
                                        setActiveTab("followups");
                                      }
                                    }}
                                    calendarItemStyle={calendarItemStyle}
                                    isCompleted={isCompleted}
                                  />
                                );
                              })}
                              {dayFollowUps.length > 3 && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="w-full text-[10px] text-muted-foreground text-center hover:text-foreground hover:bg-gray-100 rounded px-1 py-0.5 transition-colors cursor-pointer">
                                      +{dayFollowUps.length - 3} more
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-2" align="start">
                                    <div className="font-medium text-sm mb-2">{format(day, "EEEE, MMM d")}</div>
                                    <div className="space-y-1 max-h-60 overflow-y-auto">
                                      {dayFollowUps.map((followUp) => {
                                        const followUpDate = typeof followUp.dueAt === "string" ? parseISO(followUp.dueAt) : followUp.dueAt;
                                        const isCompleted = !!followUp.completedAt;
                                        const isOverdue = isPast(followUpDate) && !isToday(followUpDate) && !isCompleted;
                                        
                                        const popoverItemStyle = isCompleted
                                          ? "bg-gray-100 text-gray-400 border border-gray-200"
                                          : isOverdue
                                          ? "bg-red-50 text-red-700 border border-red-200"
                                          : "bg-blue-50 text-blue-700 border border-blue-200";
                                        
                                        return (
                                          <div
                                            key={followUp.id}
                                            onClick={() => {
                                              if (followUp.prospect) {
                                                setExpandedProspectId(followUp.prospect.id);
                                                setActiveTab("followups");
                                              }
                                            }}
                                            className={`p-2 rounded text-xs cursor-pointer hover:opacity-80 ${popoverItemStyle}`}
                                          >
                                            <div className="flex items-center gap-1.5">
                                              <FollowUpTypeIcon type={followUp.followUpType as FollowUpType} />
                                              <span className={`font-medium ${isCompleted ? 'line-through' : ''}`}>
                                                {followUp.prospect?.name || "Unknown"}
                                              </span>
                                              <span className="text-[10px] ml-auto opacity-75">
                                                {format(followUpDate, "h:mm a")}
                                              </span>
                                            </div>
                                            {followUp.notes && (
                                              <div className="mt-1 text-[10px] opacity-75 truncate">{followUp.notes}</div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          </DroppableCalendarDay>
                        );
                      })}
                    </div>
                  )}

                  {(calendarView === "week" || calendarView === "3day" || calendarView === "day") && (() => {
                    const timeSlots = Array.from({ length: 11 }, (_, i) => i + 8);
                    const viewDays = calendarView === "week"
                      ? eachDayOfInterval({
                          start: startOfWeek(calendarMonth, { weekStartsOn: 0 }),
                          end: endOfWeek(calendarMonth, { weekStartsOn: 0 }),
                        })
                      : calendarView === "3day"
                      ? [calendarMonth, addDays(calendarMonth, 1), addDays(calendarMonth, 2)]
                      : [calendarMonth];

                    return (
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <div className={`grid gap-px bg-gray-200`} style={{ gridTemplateColumns: `60px repeat(${viewDays.length}, 1fr)` }}>
                          <div className="bg-gray-100 p-2 text-xs font-medium text-gray-600"></div>
                          {viewDays.map((day, idx) => (
                            <div 
                              key={idx} 
                              className={`bg-gray-100 p-2 text-center text-xs font-medium ${isToday(day) ? 'text-amber-600 bg-amber-50' : 'text-gray-600'}`}
                            >
                              <div>{format(day, "EEE")}</div>
                              <div className={`text-lg ${isToday(day) ? 'font-bold' : ''}`}>{format(day, "d")}</div>
                            </div>
                          ))}
                        </div>
                        <div className="max-h-[500px] overflow-y-auto">
                          {timeSlots.map((hour) => (
                            <div 
                              key={hour} 
                              className={`grid gap-px bg-gray-200`} 
                              style={{ gridTemplateColumns: `60px repeat(${viewDays.length}, 1fr)` }}
                            >
                              <div className="bg-white p-1 text-xs text-gray-500 text-right pr-2 min-h-[50px]">
                                {format(setHours(new Date(), hour), "h a")}
                              </div>
                              {viewDays.map((day, dayIdx) => {
                                const dayFollowUps = getFollowUpsForDate(day);
                                const hourFollowUps = dayFollowUps.filter((f) => {
                                  const fDate = typeof f.dueAt === "string" ? parseISO(f.dueAt) : f.dueAt;
                                  return getHours(fDate) === hour;
                                });
                                const isTodayDate = isToday(day);

                                return (
                                  <div 
                                    key={dayIdx} 
                                    className={`bg-white p-1 min-h-[50px] border-t border-gray-100 ${isTodayDate ? 'bg-amber-50/30' : ''}`}
                                  >
                                    {hourFollowUps.map((followUp) => {
                                      const followUpDate = typeof followUp.dueAt === "string" ? parseISO(followUp.dueAt) : followUp.dueAt;
                                      const isCompleted = !!followUp.completedAt;
                                      const isOverdue = isPast(followUpDate) && !isToday(followUpDate) && !isCompleted;
                                      
                                      const calendarItemStyle = isCompleted
                                        ? "bg-gray-100 text-gray-400 border border-gray-200"
                                        : isOverdue
                                        ? "bg-red-100 text-red-700"
                                        : isTodayDate
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-blue-100 text-blue-700";
                                      
                                      return (
                                        <DraggableFollowUp
                                          key={followUp.id}
                                          followUp={followUp}
                                          onClick={() => {
                                            if (followUp.prospect) {
                                              setExpandedProspectId(followUp.prospect.id);
                                              setActiveTab("followups");
                                            }
                                          }}
                                          calendarItemStyle={calendarItemStyle}
                                          isCompleted={isCompleted}
                                        />
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <DragOverlay>
                  {activeCalendarFollowUpId ? (
                    (() => {
                      const followUp = followUps.find((f) => f.id === activeCalendarFollowUpId);
                      if (!followUp) return null;
                      const prospect = filteredProspects.find((p) => p.id === followUp.customerId);
                      const followUpDate = typeof followUp.dueAt === "string" ? parseISO(followUp.dueAt) : followUp.dueAt;
                      const isCompleted = !!followUp.completedAt;
                      const isOverdue = isPast(followUpDate) && !isToday(followUpDate) && !isCompleted;
                      const calendarItemStyle = isCompleted
                        ? "bg-gray-100 text-gray-400 border border-gray-200"
                        : isOverdue
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700";
                      return (
                        <div className={`text-xs p-1 rounded truncate shadow-lg ${calendarItemStyle}`}>
                          <div className="flex items-center gap-1">
                            <FollowUpTypeIcon type={followUp.followUpType as FollowUpType} />
                            <span>{prospect?.name || "Unknown"}</span>
                          </div>
                        </div>
                      );
                    })()
                  ) : null}
                </DragOverlay>
              </DndContext>
            </TabsContent>

            <TabsContent value="kanban" className="mt-4 -mx-4 px-0" style={{ overflow: 'visible' }}>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div 
                  className="kanban-board-scroll px-4" 
                  style={{ 
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '0.5rem',
                    overflow: 'hidden',
                    height: 'calc(100vh - 220px)',
                  }}
                  data-testid="kanban-board"
                >
                  {KANBAN_STAGES.map((stage) => (
                    <ProspectKanbanColumn
                      key={stage}
                      stage={stage}
                      prospects={prospectsByStage[stage]}
                      onCardClick={(prospect) => {
                        setExpandedProspectId(prospect.id);
                        setActiveTab("details");
                      }}
                    />
                  ))}
                </div>
                <DragOverlay>
                  {activeProspectId ? (
                    (() => {
                      const prospect = prospects.find((p) => p.id === activeProspectId);
                      return prospect ? (
                        <ProspectCard
                          prospect={prospect}
                          onClick={() => {}}
                          isDragging
                        />
                      ) : null;
                    })()
                  ) : null}
                </DragOverlay>
              </DndContext>
            </TabsContent>
          </Tabs>
        </div>

        <Sheet open={!!expandedProspectId} onOpenChange={(open) => {
          if (!open) {
            setExpandedProspectId(null);
            setIsEditing(false);
          }
        }}>
          <SheetContent side="right" className="w-[90vw] sm:w-[530px] sm:max-w-[530px] p-0 flex flex-col overflow-y-auto">
            {expandedProspect && (
              <>
                <SheetHeader className="px-4 py-3 border-b flex-shrink-0 pr-12">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <SheetTitle className="text-lg truncate">
                        <Link href={`/crm/customers/${expandedProspect.id}`} className="hover:text-[#711419] hover:underline">
                          {expandedProspect.name}
                          <ExternalLink className="h-3 w-3 inline ml-1 opacity-50" />
                        </Link>
                      </SheetTitle>
                      <SheetDescription className="text-xs">
                        {expandedProspect.phone && <span className="mr-3">{expandedProspect.phone}</span>}
                        {expandedProspect.email && <span className="truncate">{expandedProspect.email}</span>}
                      </SheetDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Select
                        value={expandedProspect.interestLevel || ""}
                        onValueChange={(value) => updateLeadMutation.mutate({ id: expandedProspect.id, data: { interestLevel: value || null } })}
                      >
                        <SelectTrigger className="h-8 w-[90px] text-xs border-0 bg-transparent p-0 gap-1">
                          <SelectValue placeholder="Set temp">
                            {expandedProspect.interestLevel ? (() => {
                              const level = expandedProspect.interestLevel as InterestLevel;
                              const config = temperatureConfig[level];
                              const Icon = config.icon;
                              return (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
                                  <Icon className="h-3 w-3" />
                                  {level.charAt(0).toUpperCase() + level.slice(1)}
                                </span>
                              );
                            })() : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hot">
                            <div className="flex items-center gap-2">
                              <Flame className="h-4 w-4 text-red-600" />
                              Hot
                            </div>
                          </SelectItem>
                          <SelectItem value="warm">
                            <div className="flex items-center gap-2">
                              <Thermometer className="h-4 w-4 text-amber-600" />
                              Warm
                            </div>
                          </SelectItem>
                          <SelectItem value="cold">
                            <div className="flex items-center gap-2">
                              <Snowflake className="h-4 w-4 text-slate-500" />
                              Cold
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={expandedProspect.salesStage || "new"}
                        onValueChange={(value) => updateStageMutation.mutate({ id: expandedProspect.id, salesStage: value as SalesStage })}
                      >
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="quote_sent">Quote Sent</SelectItem>
                          <SelectItem value="negotiating">Negotiating</SelectItem>
                          <SelectItem value="won">Won</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </SheetHeader>

                <ScrollArea className="flex-1 px-4 py-3">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
                      <TabsTrigger value="details" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">Details</TabsTrigger>
                      <TabsTrigger value="followups" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
                        <Calendar className="h-3 w-3 mr-1" />
                        Follow-ups ({getProspectFollowUps(expandedProspect.id).length})
                      </TabsTrigger>
                      <TabsTrigger value="notes" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
                        <StickyNote className="h-3 w-3 mr-1" />
                        Notes
                      </TabsTrigger>
                      <TabsTrigger value="quotes" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
                        <FileText className="h-3 w-3 mr-1" />
                        Quotes ({leadQuotes.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Assigned Salesperson</h4>
                        <Select
                          value={expandedProspect.assignedSalesRepId || ""}
                          onValueChange={(value) => updateSalesRepMutation.mutate({ id: expandedProspect.id, assignedSalesRepId: value || null })}
                        >
                          <SelectTrigger className="w-full" data-testid="select-salesperson">
                            <SelectValue placeholder="Select salesperson" />
                          </SelectTrigger>
                          <SelectContent>
                            {salesUsers.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Contact Information</h4>
                          {!isEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleEditLead}
                              className="h-8 px-2 text-muted-foreground hover:text-foreground"
                              data-testid="button-edit-lead"
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          )}
                        </div>
                        
                        {isEditing ? (
                          <div className="grid gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="edit-phone" className="text-xs text-muted-foreground">Phone</Label>
                              <Input
                                id="edit-phone"
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                placeholder="Enter phone number"
                                className="h-9"
                                data-testid="input-edit-phone"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="edit-email" className="text-xs text-muted-foreground">Email</Label>
                              <Input
                                id="edit-email"
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="Enter email address"
                                className="h-9"
                                data-testid="input-edit-email"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="edit-address" className="text-xs text-muted-foreground">Address</Label>
                              <Input
                                id="edit-address"
                                value={editAddress}
                                onChange={(e) => setEditAddress(e.target.value)}
                                placeholder="Enter address"
                                className="h-9"
                                data-testid="input-edit-address"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="edit-company" className="text-xs text-muted-foreground">Company</Label>
                              <Input
                                id="edit-company"
                                value={editCompanyName}
                                onChange={(e) => setEditCompanyName(e.target.value)}
                                placeholder="Enter company name"
                                className="h-9"
                                data-testid="input-edit-company"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="edit-temperature" className="text-xs text-muted-foreground">Temperature</Label>
                              <Select value={editInterestLevel} onValueChange={(v) => setEditInterestLevel(v as InterestLevel)}>
                                <SelectTrigger className="h-9" data-testid="select-edit-temperature">
                                  <SelectValue placeholder="Select temperature" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hot">
                                    <div className="flex items-center gap-2">
                                      <Flame className="h-4 w-4 text-red-600" />
                                      Hot
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="warm">
                                    <div className="flex items-center gap-2">
                                      <Thermometer className="h-4 w-4 text-amber-600" />
                                      Warm
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="cold">
                                    <div className="flex items-center gap-2">
                                      <Snowflake className="h-4 w-4 text-slate-500" />
                                      Cold
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="edit-notes" className="text-xs text-muted-foreground">Notes</Label>
                              <Textarea
                                id="edit-notes"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="Enter notes"
                                className="min-h-[80px] resize-none"
                                data-testid="input-edit-notes"
                              />
                            </div>
                            <div className="flex gap-2 pt-2">
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={handleCancelEdit}
                                data-testid="button-cancel-edit"
                              >
                                Cancel
                              </Button>
                              <Button
                                className="flex-1 bg-[#711419] hover:bg-[#5a1014]"
                                onClick={handleSaveLead}
                                disabled={updateLeadMutation.isPending}
                                data-testid="button-save-lead"
                              >
                                {updateLeadMutation.isPending ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-2 text-sm">
                            {expandedProspect.phone && (
                              <a href={`tel:${expandedProspect.phone}`} className="flex items-center gap-2 hover:underline">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                {expandedProspect.phone}
                              </a>
                            )}
                            {expandedProspect.email && (
                              <a href={`mailto:${expandedProspect.email}`} className="flex items-center gap-2 hover:underline">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                {expandedProspect.email}
                              </a>
                            )}
                            {expandedProspect.fullAddress && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span>{expandedProspect.fullAddress}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {!isEditing && expandedProspect.companyName && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Company</h4>
                          <p className="text-sm text-muted-foreground">{expandedProspect.companyName}</p>
                        </div>
                      )}

                      {!isEditing && expandedProspect.notes && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Notes</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{expandedProspect.notes}</p>
                        </div>
                      )}

                      <Card className="mt-4">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <History className="h-4 w-4" />
                            Timeline / Comments
                          </CardTitle>
                        </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex gap-2">
                              <Textarea
                                placeholder="Add a comment..."
                                value={leadNoteBody}
                                onChange={(e) => setLeadNoteBody(e.target.value)}
                                className="min-h-[60px] resize-none flex-1"
                              />
                              <Button
                                size="sm"
                                className="self-end"
                                onClick={() => {
                                  if (expandedProspect && leadNoteBody.trim()) {
                                    createLeadNoteMutation.mutate({
                                      customerId: expandedProspect.id,
                                      body: leadNoteBody.trim(),
                                    });
                                  }
                                }}
                                disabled={!leadNoteBody.trim() || createLeadNoteMutation.isPending}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            </div>

                            {leadNotesLoading ? (
                              <div className="space-y-2">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                              </div>
                            ) : leadNotes.length === 0 ? (
                              <p className="text-center text-muted-foreground text-sm py-4">
                                No comments yet
                              </p>
                            ) : (
                              <>
                                <div className="space-y-2">
                                  {[...leadNotes]
                                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                    .slice(0, showAllNotes ? leadNotes.length : 5)
                                    .map((note) => (
                                      <div
                                        key={note.id}
                                        className="flex gap-3 p-3 rounded-lg border bg-gray-50"
                                      >
                                        <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className="font-semibold text-sm">{note.userName}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {format(parseISO(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                            </span>
                                          </div>
                                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                                            {note.body}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                                {leadNotes.length > 5 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => setShowAllNotes(!showAllNotes)}
                                  >
                                    {showAllNotes ? "Show less" : `Show ${leadNotes.length - 5} more comments`}
                                  </Button>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>

                      {!isEditing && (
                        <>
                          <div className="pt-4 border-t flex gap-2">
                            {expandedProspect.salesStage !== "won" && expandedProspect.salesStage !== "lost" && (
                              <>
                                <Button 
                                  className="flex-1" 
                                  variant="outline"
                                  onClick={() => {
                                    setConfirmProspectId(expandedProspect.id);
                                    setWonConfirmOpen(true);
                                  }}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                  Mark Won
                                </Button>
                                <Button 
                                  className="flex-1" 
                                  variant="outline"
                                  onClick={() => {
                                    setConfirmProspectId(expandedProspect.id);
                                    setLostConfirmOpen(true);
                                  }}
                                >
                                  <X className="h-4 w-4 mr-2 text-red-600" />
                                  Mark Lost
                                </Button>
                              </>
                            )}
                            <Button
                              className="flex-1"
                              onClick={() => navigate(`/crm/customers/${expandedProspect.id}`)}
                            >
                              View Full Profile
                            </Button>
                          </div>

                          <div className="pt-4 border-t">
                            <Button 
                              variant="outline"
                              className="w-full"
                              onClick={() => {
                                setConfirmProspectId(expandedProspect.id);
                                setDeleteConfirmOpen(true);
                              }}
                              data-testid="button-remove-from-funnel"
                            >
                              <X className="h-4 w-4 mr-2" />
                              Remove from Funnel
                            </Button>
                          </div>
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="followups" className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-medium">Follow-ups</h4>
                        <Button size="sm" onClick={() => handleAddFollowUp(expandedProspect.id)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Follow-up
                        </Button>
                      </div>

                      {getProspectFollowUps(expandedProspect.id).length === 0 ? (
                        <Card className="p-6">
                          <p className="text-center text-muted-foreground text-sm">
                            No follow-ups scheduled
                          </p>
                        </Card>
                      ) : (
                        <div className="space-y-3">
                          {getProspectFollowUps(expandedProspect.id).map((followUp) => {
                            const dueDate = new Date(followUp.dueAt);
                            const isCompleted = !!followUp.completedAt;
                            const isOverdue = isPast(dueDate) && !isToday(dueDate) && !isCompleted;
                            const isDueToday = isToday(dueDate) && !isCompleted;
                            const isEditingThis = editingFollowUpId === followUp.id;
                            
                            const cardStyle = isCompleted
                              ? 'border-gray-200 bg-gray-50'
                              : isOverdue
                              ? 'border-red-300 bg-red-50'
                              : isDueToday
                              ? 'border-amber-300 bg-amber-50'
                              : '';
                            
                            const iconBgStyle = isCompleted
                              ? 'bg-gray-100'
                              : isOverdue
                              ? 'bg-red-100'
                              : isDueToday
                              ? 'bg-amber-100'
                              : 'bg-gray-100';
                            
                            return (
                              <Card 
                                key={followUp.id} 
                                className={`p-3 ${cardStyle}`}
                                data-testid={`card-followup-${followUp.id}`}
                              >
                                {isEditingThis ? (
                                  <div className="space-y-3">
                                    <div className="space-y-2">
                                      <Label className="text-xs">Type</Label>
                                      <Select value={editFollowUpType} onValueChange={(v) => setEditFollowUpType(v as FollowUpType)}>
                                        <SelectTrigger className="h-8 text-sm">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="call">Call</SelectItem>
                                          <SelectItem value="email">Email</SelectItem>
                                          <SelectItem value="visit">Visit</SelectItem>
                                          <SelectItem value="text">Text</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-xs">Due Date</Label>
                                      <Input
                                        type="datetime-local"
                                        value={editFollowUpDueDate}
                                        onChange={(e) => setEditFollowUpDueDate(e.target.value)}
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-xs">Notes</Label>
                                      <Textarea
                                        value={editFollowUpNotes}
                                        onChange={(e) => setEditFollowUpNotes(e.target.value)}
                                        placeholder="Add notes..."
                                        className="text-sm min-h-[60px]"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          updateFollowUpMutation.mutate({
                                            id: followUp.id,
                                            data: {
                                              followUpType: editFollowUpType,
                                              dueAt: new Date(editFollowUpDueDate).toISOString(),
                                              notes: editFollowUpNotes || undefined,
                                            },
                                          });
                                        }}
                                        disabled={!editFollowUpDueDate || updateFollowUpMutation.isPending}
                                      >
                                        {updateFollowUpMutation.isPending ? "Saving..." : "Save"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditingFollowUpId(null);
                                          setEditFollowUpType("call");
                                          setEditFollowUpDueDate("");
                                          setEditFollowUpNotes("");
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          checked={isCompleted}
                                          onCheckedChange={(checked) => {
                                            completeFollowUpMutation.mutate({
                                              id: followUp.id,
                                              completedAt: checked ? new Date().toISOString() : null,
                                            });
                                          }}
                                          disabled={completeFollowUpMutation.isPending}
                                          className="flex-shrink-0"
                                        />
                                        <div className={`p-1.5 rounded ${iconBgStyle}`}>
                                          <FollowUpTypeIcon type={followUp.followUpType as FollowUpType} />
                                        </div>
                                        <div className={isCompleted ? 'text-gray-500' : ''}>
                                          <div className={`font-medium text-sm capitalize ${isCompleted ? 'line-through' : ''}`}>{followUp.followUpType}</div>
                                          <div className="text-xs text-muted-foreground">
                                            Due: {format(dueDate, "MMM d, yyyy h:mm a")}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {followUp.completedAt ? (
                                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                            Completed
                                          </Badge>
                                        ) : isOverdue ? (
                                          <Badge variant="destructive" className="text-xs">
                                            Overdue
                                          </Badge>
                                        ) : isDueToday ? (
                                          <Badge className="text-xs bg-amber-500">
                                            Due Today
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-xs">
                                            Scheduled
                                          </Badge>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={() => {
                                            setEditingFollowUpId(followUp.id);
                                            setEditFollowUpType(followUp.followUpType as FollowUpType);
                                            setEditFollowUpDueDate(format(dueDate, "yyyy-MM-dd'T'HH:mm"));
                                            setEditFollowUpNotes(followUp.notes || "");
                                          }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => {
                                            setDeleteFollowUpId(followUp.id);
                                            setDeleteFollowUpConfirmOpen(true);
                                          }}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                    {followUp.notes && (
                                      <p className={`text-xs mt-2 pl-12 ${isCompleted ? 'text-gray-400' : 'text-muted-foreground'}`}>{followUp.notes}</p>
                                    )}
                                    {followUp.outcome && (
                                      <div className="mt-2 pl-12">
                                        <Badge variant="outline" className="text-xs">{followUp.outcome.replace(/_/g, " ")}</Badge>
                                      </div>
                                    )}
                                  </>
                                )}
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="notes" className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Customer Notes</h4>
                        {expandedProspect.notes ? (
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm whitespace-pre-wrap">{expandedProspect.notes}</p>
                          </div>
                        ) : (
                          <Card className="p-6">
                            <p className="text-center text-muted-foreground text-sm">
                              No notes available
                            </p>
                          </Card>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="quotes" className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-medium">Quotes</h4>
                        <Link href={`/crm/quotes/new?customerId=${expandedProspect.id}&sourceType=lead`}>
                          <Button size="sm" className="h-8 text-xs">
                            <Plus className="h-3 w-3 mr-1" />
                            Create Quote
                          </Button>
                        </Link>
                      </div>
                      
                      {leadQuotes.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-500">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>No quotes yet</p>
                          <p className="text-xs mt-1">Create a quote to send to this lead</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {leadQuotes.map((quote) => (
                            <Link key={quote.id} href={`/crm/quotes/${quote.id}`}>
                              <div className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-medium text-sm">{quote.title || `Quote #${quote.quoteNumber}`}</p>
                                    <p className="text-xs text-gray-500">{quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : ""}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-medium text-sm">${Number(quote.total || 0).toLocaleString()}</p>
                                    <Badge variant={quote.status === 'accepted' ? 'default' : quote.status === 'sent' ? 'secondary' : 'outline'} className="text-xs">
                                      {quote.status}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </ScrollArea>
              </>
            )}
          </SheetContent>
        </Sheet>

        <Dialog open={followUpDialogOpen} onOpenChange={setFollowUpDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Follow-Up</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={followUpType} onValueChange={(v) => setFollowUpType(v as FollowUpType)}>
                  <SelectTrigger data-testid="select-followup-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="visit">Visit</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="datetime-local"
                  value={followUpDueDate}
                  onChange={(e) => setFollowUpDueDate(e.target.value)}
                  data-testid="input-followup-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                  placeholder="Add any notes..."
                  data-testid="input-followup-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFollowUpDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitFollowUp}
                disabled={!followUpDueDate || createFollowUpMutation.isPending}
                data-testid="button-submit-followup"
              >
                {createFollowUpMutation.isPending ? "Scheduling..." : "Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={wonConfirmOpen} onOpenChange={setWonConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as Won?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to mark this prospect as won? This will move them to the Won stage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmProspectId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkWon} className="bg-green-600 hover:bg-green-700">
                Mark Won
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={lostConfirmOpen} onOpenChange={setLostConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as Lost?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to mark this prospect as lost? This will move them to the Lost stage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmProspectId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkLost} className="bg-red-600 hover:bg-red-700">
                Mark Lost
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from Lead Funnel?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the customer from the lead funnel. The customer record will remain in the system and can be added back to the funnel later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmProspectId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRemoveFromFunnel}>
                Remove from Funnel
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deleteFollowUpConfirmOpen} onOpenChange={setDeleteFollowUpConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Follow-up?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this follow-up? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteFollowUpId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  if (deleteFollowUpId) {
                    deleteFollowUpMutation.mutate(deleteFollowUpId);
                  }
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteFollowUpMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
