import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ArrowLeft, Search, MapPin, DollarSign, Calendar, CalendarDays, User, StickyNote, GripVertical, Phone, Mail, FileText, ExternalLink, ChevronLeft, ChevronRight, LayoutGrid, Package, Wrench } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { Lead, Technician, Quote } from "@shared/schema";

const SERVICE_STEPS = [
  "Intake",
  "Triage / Assign",
  "Diag / Callback Needed",
  "Quote Needed",
  "Quote Drafting",
  "Review & Send",
  "Awaiting Customer",
  "Approved",
  "Parts Ordered",
  "Parts Arrived",
  "Invoice Sent",
  "Waiting On Payment",
  "Closed (Paid)",
  "Lost / Declined",
] as const;

type ServiceStep = typeof SERVICE_STEPS[number];

const COLUMN_PREFIX = "column-";

function getColumnId(step: ServiceStep): string {
  return `${COLUMN_PREFIX}${step}`;
}

function getStepFromColumnId(columnId: string): ServiceStep | null {
  if (columnId.startsWith(COLUMN_PREFIX)) {
    const step = columnId.slice(COLUMN_PREFIX.length) as ServiceStep;
    if (SERVICE_STEPS.includes(step)) {
      return step;
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
        data-testid="service-kanban-board"
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

interface JobCardProps {
  lead: Lead;
  technicians: Technician[];
  onClick: () => void;
  isDragging?: boolean;
}

function JobCard({ lead, technicians, onClick, isDragging }: JobCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id: lead.id,
    data: {
      type: "card",
      lead,
      step: lead.serviceStep || SERVICE_STEPS[0],
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const assignedTechnician = technicians.find((t) => t.id === lead.assignedEmployeeId);
  const notesPreview = lead.clientIssue ? lead.clientIssue.slice(0, 50) + (lead.clientIssue.length > 50 ? "..." : "") : null;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="mb-2 cursor-pointer hover:shadow-md transition-shadow bg-white touch-manipulation"
      onClick={onClick}
      data-testid={`card-service-job-${lead.id}`}
      data-no-drag
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            data-testid={`service-drag-handle-${lead.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" data-testid={`text-service-job-name-${lead.id}`}>
              {lead.name}
            </h4>
            {lead.address && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{lead.address}</span>
              </div>
            )}
            {lead.estimatedValue && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <DollarSign className="h-3 w-3 flex-shrink-0" />
                <span>${parseFloat(lead.estimatedValue).toFixed(2)}</span>
              </div>
            )}
            {lead.projectedCloseDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{format(typeof lead.projectedCloseDate === "string" ? parseISO(lead.projectedCloseDate) : lead.projectedCloseDate, "MMM d, yyyy")}</span>
              </div>
            )}
            {assignedTechnician && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{assignedTechnician.name}</span>
              </div>
            )}
            {notesPreview && (
              <div className="flex items-start gap-1 text-xs text-muted-foreground mt-1">
                <StickyNote className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">{notesPreview}</span>
              </div>
            )}
            {lead.tags && lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {lead.tags.slice(0, 3).map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
                {lead.tags.length > 3 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{lead.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
            {lead.serviceStep && (
              <div className="mt-2 pt-2 border-t">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border-blue-200">
                  <Wrench className="h-2.5 w-2.5 mr-1" />
                  {lead.serviceStep}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface KanbanColumnProps {
  step: ServiceStep;
  leads: Lead[];
  technicians: Technician[];
  onCardClick: (lead: Lead) => void;
}

function KanbanColumn({ step, leads, technicians, onCardClick }: KanbanColumnProps) {
  const columnId = getColumnId(step);
  
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: {
      type: "column",
      step,
    }
  });

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => (a.serviceOrder || 0) - (b.serviceOrder || 0));
  }, [leads]);

  return (
    <div className="flex-shrink-0 w-72 sm:w-80 snap-start sm:snap-center">
      <Card className={`h-full bg-gray-50 transition-colors ${isOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}>
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold truncate" data-testid={`service-column-title-${step}`}>
              {step}
            </CardTitle>
            <Badge variant="outline" className="ml-2 flex-shrink-0" data-testid={`service-column-count-${step}`}>
              {leads.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          <ScrollArea className="h-[calc(100vh-280px)] pr-2">
            <div ref={setNodeRef} className="min-h-[100px]">
              <SortableContext items={sortedLeads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                {sortedLeads.map((lead) => (
                  <JobCard
                    key={lead.id}
                    lead={lead}
                    technicians={technicians}
                    onClick={() => onCardClick(lead)}
                  />
                ))}
              </SortableContext>
              {leads.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8" data-testid={`service-column-empty-${step}`}>
                  No jobs
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

interface CalendarViewProps {
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}

function CalendarView({ leads, onCardClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const getLeadDate = (lead: Lead): { date: Date; isRepairDate: boolean } | null => {
    // If repair date is set, show on that date in red
    if (lead.repairDate) {
      const date = typeof lead.repairDate === "string" ? parseISO(lead.repairDate) : lead.repairDate;
      return { date, isRepairDate: true };
    }
    // Otherwise show on service entered date in yellow (in progress)
    if (lead.serviceEnteredAt) {
      const date = typeof lead.serviceEnteredAt === "string" ? parseISO(lead.serviceEnteredAt) : lead.serviceEnteredAt;
      return { date, isRepairDate: false };
    }
    return null;
  };

  const leadsByDate = useMemo(() => {
    const map: Record<string, { lead: Lead; isRepairDate: boolean }[]> = {};
    leads.forEach((lead) => {
      const dateInfo = getLeadDate(lead);
      if (dateInfo && isSameMonth(dateInfo.date, currentMonth)) {
        const key = format(dateInfo.date, "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push({ lead, isRepairDate: dateInfo.isRepairDate });
      }
    });
    return map;
  }, [leads, currentMonth]);

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="min-h-[44px] min-w-[44px]"
          data-testid="button-service-prev-month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold" data-testid="text-service-current-month">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="min-h-[44px] min-w-[44px]"
          data-testid="button-service-next-month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 max-w-4xl mx-auto">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}

        {Array.from({ length: startDayOfWeek }).map((_, idx) => (
          <div key={`empty-${idx}`} className="h-[100px] sm:h-[120px] lg:h-[130px]" />
        ))}

        {daysInMonth.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayLeads = leadsByDate[dateKey] || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateKey}
              className={cn(
                "h-[100px] sm:h-[120px] lg:h-[130px] border rounded-md p-1 bg-card overflow-hidden",
                isToday && "ring-2 ring-primary"
              )}
              data-testid={`service-calendar-day-${dateKey}`}
            >
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {format(day, "d")}
              </div>
              <div className="space-y-1 overflow-y-auto h-[calc(100%-20px)] scrollbar-thin">
                {dayLeads.map(({ lead, isRepairDate }) => (
                  <HoverCard key={lead.id} openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <button
                        onClick={() => onCardClick(lead)}
                        className={cn(
                          "w-full text-left text-[10px] sm:text-xs px-1 py-0.5 rounded truncate min-h-[28px] flex items-center",
                          isRepairDate
                            ? "bg-primary text-primary-foreground"
                            : "bg-yellow-400 text-yellow-900"
                        )}
                        data-testid={`service-calendar-job-${lead.id}`}
                      >
                        <span className="truncate">{lead.name}</span>
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-72 p-3" side="right" align="start">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">{lead.name}</h4>
                        {lead.address && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span>{lead.address}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span>{lead.phone}</span>
                          </div>
                        )}
                        {lead.estimatedValue && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <DollarSign className="h-3 w-3 flex-shrink-0" />
                            <span>${parseFloat(lead.estimatedValue).toLocaleString()}</span>
                          </div>
                        )}
                        {lead.repairDate && (
                          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                            <CalendarDays className="h-3 w-3 flex-shrink-0" />
                            <span>Repair: {format(typeof lead.repairDate === "string" ? parseISO(lead.repairDate) : lead.repairDate, "MMM d, yyyy")}</span>
                          </div>
                        )}
                        {lead.serviceStep && (
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {lead.serviceStep}
                          </Badge>
                        )}
                        {lead.clientIssue && (
                          <p className="text-xs text-muted-foreground border-t pt-2 mt-2 line-clamp-2">
                            {lead.clientIssue}
                          </p>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-yellow-400" />
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-primary" />
          <span>Repair Date</span>
        </div>
      </div>
    </div>
  );
}

export default function ServicePipeline() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({ serviceStep: "", clientIssue: "", assignedEmployeeId: "", repairDate: null as Date | null });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { serviceStep?: string; serviceOrder?: number }>>({});
  const [activeView, setActiveView] = useState<"kanban" | "calendar">("kanban");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferNotes, setTransferNotes] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const { data: serviceLeads = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ["/api/service-leads"],
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const { data: linkedQuote, isLoading: isLoadingQuote } = useQuery<Quote>({
    queryKey: ["/api/quotes", editingLead?.quoteId],
    queryFn: async () => {
      if (!editingLead?.quoteId) return null;
      const res = await fetch(`/api/quotes/${editingLead.quoteId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!editingLead?.quoteId,
  });

  const clearOptimisticUpdate = useCallback((leadId: string) => {
    setOptimisticUpdates((prev) => {
      const next = { ...prev };
      delete next[leadId];
      return next;
    });
  }, []);

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const res = await apiRequest("PATCH", `/api/service-leads/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      clearOptimisticUpdate(variables.id);
      queryClient.invalidateQueries({ queryKey: ["/api/service-leads"] });
    },
    onError: (_, variables) => {
      clearOptimisticUpdate(variables.id);
      toast({ description: "Failed to update job", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/service-leads"] });
    },
  });

  const transferToInstallationMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/leads/${id}/transfer-to-installation`, { notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Job transferred to Installation Department" });
      setEditingLead(null);
      setShowTransferDialog(false);
      setTransferNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/service-leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: () => {
      toast({ description: "Failed to transfer job", variant: "destructive" });
    },
  });

  const leadsWithOptimisticUpdates = useMemo(() => {
    return serviceLeads.map((lead) => {
      const update = optimisticUpdates[lead.id];
      if (update) {
        return { ...lead, ...update };
      }
      return lead;
    });
  }, [serviceLeads, optimisticUpdates]);

  const filteredLeads = useMemo(() => {
    return leadsWithOptimisticUpdates.filter((lead) => {
      if (selectedEmployeeId !== "all" && lead.assignedEmployeeId !== selectedEmployeeId) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = lead.name.toLowerCase().includes(query);
        const matchesAddress = lead.address?.toLowerCase().includes(query);
        if (!matchesName && !matchesAddress) return false;
      }
      return true;
    });
  }, [leadsWithOptimisticUpdates, selectedEmployeeId, searchQuery]);

  const leadsByStep = useMemo(() => {
    const grouped: Record<ServiceStep, Lead[]> = {} as Record<ServiceStep, Lead[]>;
    SERVICE_STEPS.forEach((step) => {
      grouped[step] = [];
    });
    filteredLeads.forEach((lead) => {
      const step = (lead.serviceStep as ServiceStep) || SERVICE_STEPS[0];
      if (SERVICE_STEPS.includes(step)) {
        grouped[step].push(lead);
      } else {
        grouped[SERVICE_STEPS[0]].push(lead);
      }
    });
    return grouped;
  }, [filteredLeads]);

  const activeLead = useMemo(() => {
    if (!activeId) return null;
    return filteredLeads.find((l) => l.id === activeId) || null;
  }, [activeId, filteredLeads]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeLeadId = active.id as string;
    const overId = over.id as string;

    const draggedLead = filteredLeads.find((l) => l.id === activeLeadId);
    if (!draggedLead) return;

    const currentStep = (draggedLead.serviceStep as ServiceStep) || SERVICE_STEPS[0];
    let targetStep: ServiceStep | null = null;
    let overCardId: string | null = null;

    const stepFromColumn = getStepFromColumnId(overId);
    if (stepFromColumn) {
      targetStep = stepFromColumn;
    } else {
      const overLead = filteredLeads.find((l) => l.id === overId);
      if (overLead) {
        targetStep = (overLead.serviceStep as ServiceStep) || SERVICE_STEPS[0];
        overCardId = overId;
      }
    }

    if (!targetStep) return;

    const sameColumn = currentStep === targetStep;
    const currentColumnLeads = [...leadsByStep[currentStep]].sort((a, b) => (a.serviceOrder || 0) - (b.serviceOrder || 0));
    const targetColumnLeads = sameColumn 
      ? currentColumnLeads 
      : [...leadsByStep[targetStep]].sort((a, b) => (a.serviceOrder || 0) - (b.serviceOrder || 0));

    if (sameColumn) {
      if (!overCardId || activeLeadId === overCardId) return;

      const oldIndex = currentColumnLeads.findIndex((l) => l.id === activeLeadId);
      const newIndex = currentColumnLeads.findIndex((l) => l.id === overCardId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(currentColumnLeads, oldIndex, newIndex);
      
      const updates: Record<string, { serviceOrder: number }> = {};
      reordered.forEach((lead, index) => {
        if ((lead.serviceOrder || 0) !== index) {
          updates[lead.id] = { serviceOrder: index };
        }
      });

      if (Object.keys(updates).length > 0) {
        setOptimisticUpdates((prev) => ({ ...prev, ...updates }));

        Object.entries(updates).forEach(([id, data]) => {
          updateLeadMutation.mutate({ id, data });
        });
      }
    } else {
      let newOrder: number;
      if (overCardId) {
        const overIndex = targetColumnLeads.findIndex((l) => l.id === overCardId);
        newOrder = overIndex >= 0 ? overIndex : targetColumnLeads.length;
      } else {
        newOrder = targetColumnLeads.length;
      }

      setOptimisticUpdates((prev) => ({
        ...prev,
        [activeLeadId]: { serviceStep: targetStep, serviceOrder: newOrder },
      }));

      updateLeadMutation.mutate({
        id: activeLeadId,
        data: { serviceStep: targetStep, serviceOrder: newOrder },
      });
    }
  };

  const openEditDialog = (lead: Lead) => {
    setEditingLead(lead);
    setEditForm({
      serviceStep: lead.serviceStep || SERVICE_STEPS[0],
      clientIssue: lead.clientIssue || "",
      assignedEmployeeId: lead.assignedEmployeeId || "unassigned",
      repairDate: lead.repairDate ? (typeof lead.repairDate === "string" ? new Date(lead.repairDate) : lead.repairDate) : null,
    });
  };

  const handleSaveEdit = () => {
    if (!editingLead) return;
    
    updateLeadMutation.mutate({
      id: editingLead.id,
      data: {
        serviceStep: editForm.serviceStep,
        clientIssue: editForm.clientIssue,
        assignedEmployeeId: editForm.assignedEmployeeId === "unassigned" ? null : editForm.assignedEmployeeId,
        repairDate: editForm.repairDate,
      },
    });
    setEditingLead(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <img
              src={redlogo}
              alt="Giesbrecht HVAC"
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-service-company-logo"
            />
            <div className="min-w-0">
              <NavDropdown
                currentPageTitle="Service Department"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation Department", path: "/installation" },
                  { label: "Service Department", path: "/service-pipeline" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px]" data-testid="button-service-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1" />
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full sm:w-64 min-h-[44px]"
                data-testid="input-service-search"
              />
            </div>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]" data-testid="select-service-employee-filter">
                <SelectValue placeholder="Filter by employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "kanban" | "calendar")} className="mb-4">
          <TabsList className="grid w-full max-w-sm grid-cols-2 h-12 py-0 px-[3px] mx-auto" data-testid="tabs-service-view-switcher">
            <TabsTrigger value="kanban" className="min-h-[44px] pt-0 pb-0" data-testid="tab-service-kanban">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="calendar" className="min-h-[44px] pt-0 pb-0" data-testid="tab-service-calendar">
              <CalendarDays className="h-4 w-4 mr-2" />
              Calendar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            {isLoadingLeads ? (
              <HorizontalScrollContainer>
                {SERVICE_STEPS.slice(0, 8).map((step) => (
                  <div key={step} className="flex-shrink-0 w-72 sm:w-80 snap-start sm:snap-center">
                    <Card className="h-[400px]">
                      <CardHeader className="pb-2 pt-3 px-3">
                        <Skeleton className="h-5 w-32" />
                      </CardHeader>
                      <CardContent className="px-2">
                        <Skeleton className="h-24 w-full mb-2" />
                        <Skeleton className="h-24 w-full mb-2" />
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </HorizontalScrollContainer>
            ) : filteredLeads.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground text-center" data-testid="text-service-empty-state">
                  No service jobs found. Mark a lead as Won with a Service job type to add it here.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <HorizontalScrollContainer isDraggingCard={!!activeId}>
                  {SERVICE_STEPS.map((step) => (
                    <KanbanColumn
                      key={step}
                      step={step}
                      leads={leadsByStep[step]}
                      technicians={technicians}
                      onCardClick={openEditDialog}
                    />
                  ))}
                </HorizontalScrollContainer>
                <DragOverlay>
                  {activeLead && (
                    <Card className="w-72 sm:w-80 bg-white shadow-lg">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <div className="p-1">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm truncate">{activeLead.name}</h4>
                            {activeLead.address && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{activeLead.address}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            {isLoadingLeads ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-[400px] w-full" />
              </div>
            ) : (
              <CalendarView leads={filteredLeads} onCardClick={openEditDialog} />
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-service-edit-job">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingLead?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Client Details</h4>
              <div className="grid gap-2 text-sm">
                {editingLead?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${editingLead.phone}`} className="text-primary hover:underline">{editingLead.phone}</a>
                  </div>
                )}
                {editingLead?.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${editingLead.email}`} className="text-primary hover:underline truncate">{editingLead.email}</a>
                  </div>
                )}
                {editingLead?.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span>{editingLead.address}</span>
                  </div>
                )}
                {editingLead?.estimatedValue && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">${Number(editingLead.estimatedValue).toLocaleString()}</span>
                  </div>
                )}
                {editingLead?.projectedCloseDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Target: {format(parseISO(editingLead.projectedCloseDate.toString()), "MMM d, yyyy")}</span>
                  </div>
                )}
                {editingLead?.customerType && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{editingLead.customerType}</span>
                  </div>
                )}
              </div>
            </div>

            {editingLead?.quoteId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <h4 className="text-sm font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Linked Quote
                </h4>
                {isLoadingQuote ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ) : linkedQuote ? (
                  <div className="text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Quote ID:</span>
                      <span className="font-mono text-xs">{linkedQuote.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-semibold">${Number(linkedQuote.total).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={linkedQuote.status === "accepted" ? "default" : "secondary"}>
                        {linkedQuote.status}
                      </Badge>
                    </div>
                    <Link href={`/quote/edit/${linkedQuote.id}`}>
                      <Button variant="outline" size="sm" className="w-full mt-2 min-h-[36px]" data-testid="button-service-view-quote">
                        <ExternalLink className="h-3 w-3 mr-2" />
                        View Full Quote
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Quote not found</p>
                )}
              </div>
            )}

            <div className="border-t pt-4 space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Edit Service Job</h4>
              
              <div className="space-y-2">
                <Label htmlFor="serviceStep">Service Step</Label>
                <Select
                  value={editForm.serviceStep}
                  onValueChange={(value) => setEditForm({ ...editForm, serviceStep: value })}
                >
                  <SelectTrigger id="serviceStep" className="min-h-[44px]" data-testid="select-service-step">
                    <SelectValue placeholder="Select step" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_STEPS.map((step) => (
                      <SelectItem key={step} value={step}>
                        {step}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedEmployee">Assigned Employee</Label>
                <Select
                  value={editForm.assignedEmployeeId}
                  onValueChange={(value) => setEditForm({ ...editForm, assignedEmployeeId: value })}
                >
                  <SelectTrigger id="assignedEmployee" className="min-h-[44px]" data-testid="select-service-assigned-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={editForm.clientIssue}
                  onChange={(e) => setEditForm({ ...editForm, clientIssue: e.target.value })}
                  placeholder="Add notes about this service job..."
                  rows={3}
                  className="min-h-[80px]"
                  data-testid="textarea-service-notes"
                />
              </div>

              {/* Only show repair date picker when at "Parts Arrived" or later steps */}
              {(() => {
                const REPAIR_DATE_STEPS = ["Parts Arrived", "Invoice Sent", "Waiting On Payment", "Closed (Paid)"];
                const canScheduleRepair = REPAIR_DATE_STEPS.includes(editForm.serviceStep);
                
                if (!canScheduleRepair) {
                  return (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Repair Date</Label>
                      <p className="text-xs text-muted-foreground italic">
                        Repair date can only be scheduled once the job reaches "Parts Arrived"
                      </p>
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-2">
                    <Label>Repair Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full min-h-[44px] justify-start text-left font-normal",
                            !editForm.repairDate && "text-muted-foreground"
                          )}
                          data-testid="button-service-repair-date"
                        >
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {editForm.repairDate ? format(editForm.repairDate, "PPP") : "Select repair date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={editForm.repairDate || undefined}
                          onSelect={(date) => setEditForm({ ...editForm, repairDate: date || null })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {editForm.repairDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => setEditForm({ ...editForm, repairDate: null })}
                        data-testid="button-clear-repair-date"
                      >
                        Clear date
                      </Button>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="border-t pt-4">
              <Button
                variant="outline"
                className="w-full min-h-[44px] border-orange-300 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                onClick={() => setShowTransferDialog(true)}
                data-testid="button-push-to-installation"
              >
                <Package className="h-4 w-4 mr-2" />
                Push to Installation Department
              </Button>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingLead(null)} className="min-h-[44px]" data-testid="button-service-cancel">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="min-h-[44px]" data-testid="button-service-save">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-transfer-confirmation">
          <DialogHeader>
            <DialogTitle>Transfer to Installation Department</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will transfer <strong>{editingLead?.name}</strong> from the Service Department to the Installation Department. 
              All job details, notes, and history will be preserved.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="transferNotes">Transfer Notes (optional)</Label>
              <Textarea
                id="transferNotes"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Add any notes about why this job is being transferred..."
                rows={3}
                className="min-h-[80px]"
                data-testid="textarea-transfer-notes"
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowTransferDialog(false);
                setTransferNotes("");
              }} 
              className="min-h-[44px]"
              data-testid="button-transfer-cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (editingLead) {
                  transferToInstallationMutation.mutate({ 
                    id: editingLead.id, 
                    notes: transferNotes || undefined 
                  });
                }
              }}
              disabled={transferToInstallationMutation.isPending}
              className="min-h-[44px] bg-orange-600 hover:bg-orange-700"
              data-testid="button-transfer-confirm"
            >
              {transferToInstallationMutation.isPending ? "Transferring..." : "Transfer to Installation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
