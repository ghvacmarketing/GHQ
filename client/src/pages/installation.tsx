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
import { ArrowLeft, ArrowRight, Search, MapPin, DollarSign, Calendar, CalendarDays, User, StickyNote, GripVertical, Phone, Mail, FileText, ExternalLink, ChevronLeft, ChevronRight, LayoutGrid, Package, Wrench } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { Lead, Technician, Quote } from "@shared/schema";

const INSTALL_STEPS = [
  "Define Scope of Work",
  "Assign to Sub-Contractor",
  "Order Equipment & Materials",
  "Waiting on Equipment & Material",
  "Warehouse: Equipment Arrived",
  "Spec Out Project",
  "Warehouse: Stage Equipment & Materials",
  "Schedule Job",
] as const;

type InstallStep = typeof INSTALL_STEPS[number];

const COLUMN_PREFIX = "column-";

function getColumnId(step: InstallStep): string {
  return `${COLUMN_PREFIX}${step}`;
}

function getStepFromColumnId(columnId: string): InstallStep | null {
  if (columnId.startsWith(COLUMN_PREFIX)) {
    const step = columnId.slice(COLUMN_PREFIX.length) as InstallStep;
    if (INSTALL_STEPS.includes(step)) {
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
      step: lead.installStep || INSTALL_STEPS[0],
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
      data-testid={`card-job-${lead.id}`}
      data-no-drag
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            data-testid={`drag-handle-${lead.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" data-testid={`text-job-name-${lead.id}`}>
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
            {lead.installDate && (
              <div className="flex items-center gap-1 text-xs text-green-600 font-medium mt-1">
                <CalendarDays className="h-3 w-3 flex-shrink-0" />
                <span>
                  {(() => {
                    const startDate = typeof lead.installDate === "string" ? parseISO(lead.installDate) : lead.installDate;
                    const endDateRaw = lead.installEndDate;
                    if (endDateRaw) {
                      const endDate = typeof endDateRaw === "string" ? parseISO(endDateRaw) : endDateRaw;
                      if (endDate > startDate) {
                        return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d")}`;
                      }
                    }
                    return format(startDate, "MMM d, yyyy");
                  })()}
                </span>
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
            {(() => {
              const isFromService = lead.transferredFromPipeline === "service" || 
                (lead.tags?.some(t => t.toLowerCase() === "service") && lead.tags?.some(t => t.toLowerCase() === "installation"));
              const otherTags = lead.tags?.filter(t => t.toLowerCase() !== "service" && t.toLowerCase() !== "installation") || [];
              
              if (isFromService) {
                return (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 bg-orange-50 text-orange-700 border-orange-200">
                      <Wrench className="h-2.5 w-2.5" />
                      Service
                      <ArrowRight className="h-2.5 w-2.5" />
                      <Package className="h-2.5 w-2.5" />
                      Installation
                    </Badge>
                    {otherTags.slice(0, 2).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                    {otherTags.length > 2 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        +{otherTags.length - 2}
                      </Badge>
                    )}
                  </div>
                );
              }
              
              if (lead.tags && lead.tags.length > 0) {
                return (
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
                );
              }
              
              return null;
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface KanbanColumnProps {
  step: InstallStep;
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
    return [...leads].sort((a, b) => (a.installOrder || 0) - (b.installOrder || 0));
  }, [leads]);

  return (
    <div className="flex-shrink-0 w-72 sm:w-80 snap-start sm:snap-center">
      <Card className={`h-full bg-gray-50 transition-colors ${isOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}>
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold truncate" data-testid={`column-title-${step}`}>
              {step}
            </CardTitle>
            <Badge variant="outline" className="ml-2 flex-shrink-0" data-testid={`column-count-${step}`}>
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
                <div className="text-center text-sm text-muted-foreground py-8" data-testid={`column-empty-${step}`}>
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

interface EventBar {
  lead: Lead;
  hasInstallDate: boolean;
  weekIndex: number;
  startCol: number;
  span: number;
  isStart: boolean;
  isEnd: boolean;
}

function CalendarView({ leads, onCardClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const totalCells = startDayOfWeek + daysInMonth.length;
  const numWeeks = Math.ceil(totalCells / 7);

  const getLeadDateRange = (lead: Lead): { startDate: Date; endDate: Date | null; hasInstallDate: boolean } | null => {
    if (lead.installDate) {
      const startDate = typeof lead.installDate === "string" ? parseISO(lead.installDate) : lead.installDate;
      const endDateRaw = lead.installEndDate;
      let endDate: Date | null = null;
      if (endDateRaw) {
        endDate = typeof endDateRaw === "string" ? parseISO(endDateRaw) : endDateRaw;
        if (endDate <= startDate) endDate = null;
      }
      return { startDate, endDate, hasInstallDate: true };
    }
    if (lead.installEnteredAt) {
      const date = typeof lead.installEnteredAt === "string" ? parseISO(lead.installEnteredAt) : lead.installEnteredAt;
      return { startDate: date, endDate: null, hasInstallDate: false };
    }
    if (lead.closedAt) {
      const date = typeof lead.closedAt === "string" ? parseISO(lead.closedAt) : lead.closedAt;
      return { startDate: date, endDate: null, hasInstallDate: false };
    }
    return null;
  };

  const getCellIndex = (date: Date): number => {
    const dayOfMonth = date.getDate();
    return startDayOfWeek + dayOfMonth - 1;
  };

  const eventBars = useMemo(() => {
    const bars: EventBar[] = [];
    
    leads.forEach((lead) => {
      const dateRange = getLeadDateRange(lead);
      if (!dateRange) return;
      
      const { startDate, endDate, hasInstallDate } = dateRange;
      
      const effectiveStart = isSameMonth(startDate, currentMonth) ? startDate : monthStart;
      const effectiveEnd = endDate 
        ? (isSameMonth(endDate, currentMonth) ? endDate : monthEnd)
        : (isSameMonth(startDate, currentMonth) ? startDate : null);
      
      if (!effectiveEnd) return;
      if (!isSameMonth(effectiveStart, currentMonth) && !isSameMonth(effectiveEnd, currentMonth)) return;
      
      const startCellIndex = getCellIndex(effectiveStart);
      const endCellIndex = getCellIndex(effectiveEnd);
      
      const startWeek = Math.floor(startCellIndex / 7);
      const endWeek = Math.floor(endCellIndex / 7);
      
      for (let week = startWeek; week <= endWeek; week++) {
        const weekStartCell = week * 7;
        const weekEndCell = weekStartCell + 6;
        
        const barStartCell = Math.max(startCellIndex, weekStartCell);
        const barEndCell = Math.min(endCellIndex, weekEndCell);
        
        const startCol = barStartCell - weekStartCell;
        const span = barEndCell - barStartCell + 1;
        
        bars.push({
          lead,
          hasInstallDate,
          weekIndex: week,
          startCol,
          span,
          isStart: barStartCell === startCellIndex && isSameMonth(startDate, currentMonth),
          isEnd: barEndCell === endCellIndex && (!endDate || isSameMonth(endDate, currentMonth)),
        });
      }
    });
    
    return bars;
  }, [leads, currentMonth, startDayOfWeek]);

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let w = 0; w < numWeeks; w++) {
      const weekDates: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const cellIndex = w * 7 + d;
        const dayIndex = cellIndex - startDayOfWeek;
        if (dayIndex >= 0 && dayIndex < daysInMonth.length) {
          weekDates.push(daysInMonth[dayIndex]);
        } else {
          weekDates.push(null as any);
        }
      }
      result.push(weekDates);
    }
    return result;
  }, [numWeeks, startDayOfWeek, daysInMonth]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="min-h-[44px] min-w-[44px]"
          data-testid="button-prev-month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold" data-testid="text-current-month">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="min-h-[44px] min-w-[44px]"
          data-testid="button-next-month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-7 gap-0 border-b">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {weeks.map((weekDates, weekIndex) => {
          const weekBars = eventBars.filter(bar => bar.weekIndex === weekIndex);
          
          return (
            <div key={weekIndex} className="relative">
              <div className="grid grid-cols-7 gap-0">
                {weekDates.map((day, dayIndex) => {
                  const isToday = day && isSameDay(day, new Date());
                  return (
                    <div
                      key={dayIndex}
                      className={cn(
                        "h-[100px] sm:h-[120px] border-r border-b last:border-r-0 p-1 bg-card overflow-hidden",
                        isToday && "ring-2 ring-primary ring-inset",
                        !day && "bg-muted/30"
                      )}
                      data-testid={day ? `calendar-day-${format(day, "yyyy-MM-dd")}` : undefined}
                    >
                      {day && (
                        <div className="text-xs font-medium text-muted-foreground">
                          {format(day, "d")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="absolute top-6 left-0 right-0 bottom-1 space-y-1 pointer-events-none px-0.5 overflow-y-auto scrollbar-thin">
                {weekBars.map((bar, barIndex) => (
                  <div
                    key={`${bar.lead.id}-${weekIndex}-${barIndex}`}
                    className="pointer-events-auto"
                    style={{
                      marginLeft: `calc(${bar.startCol} * (100% / 7) + 2px)`,
                      width: `calc(${bar.span} * (100% / 7) - 4px)`,
                    }}
                  >
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          onClick={() => onCardClick(bar.lead)}
                          className={cn(
                            "w-full text-left text-[10px] sm:text-xs px-2 py-1 min-h-[24px] flex items-center cursor-pointer hover:opacity-90 transition-opacity",
                            bar.hasInstallDate
                              ? "bg-primary text-primary-foreground"
                              : "bg-yellow-400 text-yellow-900",
                            bar.isStart && bar.isEnd && "rounded",
                            bar.isStart && !bar.isEnd && "rounded-l",
                            bar.isEnd && !bar.isStart && "rounded-r",
                            !bar.isStart && !bar.isEnd && "rounded-none"
                          )}
                          data-testid={`calendar-job-${bar.lead.id}`}
                        >
                          <span className="truncate font-medium">{bar.lead.name}</span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-72 p-3" side="right" align="start">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">{bar.lead.name}</h4>
                          {bar.lead.address && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span>{bar.lead.address}</span>
                            </div>
                          )}
                          {bar.lead.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              <span>{bar.lead.phone}</span>
                            </div>
                          )}
                          {bar.lead.estimatedValue && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <DollarSign className="h-3 w-3 flex-shrink-0" />
                              <span>${parseFloat(bar.lead.estimatedValue).toLocaleString()}</span>
                            </div>
                          )}
                          {bar.lead.installDate && (
                            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                              <CalendarDays className="h-3 w-3 flex-shrink-0" />
                              <span>
                                {(() => {
                                  const startDate = typeof bar.lead.installDate === "string" ? parseISO(bar.lead.installDate) : bar.lead.installDate;
                                  const endDateRaw = bar.lead.installEndDate;
                                  if (endDateRaw) {
                                    const endDate = typeof endDateRaw === "string" ? parseISO(endDateRaw) : endDateRaw;
                                    if (endDate > startDate) {
                                      return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d")}`;
                                    }
                                  }
                                  return format(startDate, "MMM d, yyyy");
                                })()}
                              </span>
                            </div>
                          )}
                          {bar.lead.installStep && (
                            <Badge variant="outline" className="text-[10px] mt-1">
                              {bar.lead.installStep}
                            </Badge>
                          )}
                          {bar.lead.clientIssue && (
                            <p className="text-xs text-muted-foreground border-t pt-2 mt-2 line-clamp-2">
                              {bar.lead.clientIssue}
                            </p>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-primary" />
          <span>Scheduled (Install Date)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-yellow-400" />
          <span>Needs Date</span>
        </div>
      </div>
    </div>
  );
}

export default function Installation() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({ installStep: "", clientIssue: "", assignedEmployeeId: "", installDate: undefined as Date | undefined, installEndDate: undefined as Date | undefined });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { installStep?: string; installOrder?: number }>>({});
  const [activeView, setActiveView] = useState<"kanban" | "calendar">("kanban");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const { data: allLeads = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const salesPeople = useMemo(() => {
    return technicians.filter((tech) => 
      tech.name.toLowerCase().includes("chandler") || 
      tech.name.toLowerCase().includes("earnest")
    );
  }, [technicians]);

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
      const res = await apiRequest("PATCH", `/api/leads/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      clearOptimisticUpdate(variables.id);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (_, variables) => {
      clearOptimisticUpdate(variables.id);
      toast({ description: "Failed to update job", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
  });

  const leadsWithOptimisticUpdates = useMemo(() => {
    return allLeads.map((lead) => {
      const update = optimisticUpdates[lead.id];
      if (update) {
        return { ...lead, ...update };
      }
      return lead;
    });
  }, [allLeads, optimisticUpdates]);

  const installationLeads = useMemo(() => {
    return leadsWithOptimisticUpdates.filter((lead) => {
      if (lead.status !== "Won") return false;
      if (!lead.tags || !Array.isArray(lead.tags)) return false;
      return lead.tags.some((tag) => tag.toLowerCase() === "installation");
    });
  }, [leadsWithOptimisticUpdates]);

  const filteredLeads = useMemo(() => {
    return installationLeads.filter((lead) => {
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
  }, [installationLeads, selectedEmployeeId, searchQuery]);

  const leadsByStep = useMemo(() => {
    const grouped: Record<InstallStep, Lead[]> = {} as Record<InstallStep, Lead[]>;
    INSTALL_STEPS.forEach((step) => {
      grouped[step] = [];
    });
    filteredLeads.forEach((lead) => {
      const step = (lead.installStep as InstallStep) || INSTALL_STEPS[0];
      if (INSTALL_STEPS.includes(step)) {
        grouped[step].push(lead);
      } else {
        grouped[INSTALL_STEPS[0]].push(lead);
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

    const currentStep = (draggedLead.installStep as InstallStep) || INSTALL_STEPS[0];
    let targetStep: InstallStep | null = null;
    let overCardId: string | null = null;

    const stepFromColumn = getStepFromColumnId(overId);
    if (stepFromColumn) {
      targetStep = stepFromColumn;
    } else {
      const overLead = filteredLeads.find((l) => l.id === overId);
      if (overLead) {
        targetStep = (overLead.installStep as InstallStep) || INSTALL_STEPS[0];
        overCardId = overId;
      }
    }

    if (!targetStep) return;

    const sameColumn = currentStep === targetStep;
    const currentColumnLeads = [...leadsByStep[currentStep]].sort((a, b) => (a.installOrder || 0) - (b.installOrder || 0));
    const targetColumnLeads = sameColumn 
      ? currentColumnLeads 
      : [...leadsByStep[targetStep]].sort((a, b) => (a.installOrder || 0) - (b.installOrder || 0));

    if (sameColumn) {
      if (!overCardId || activeLeadId === overCardId) return;

      const oldIndex = currentColumnLeads.findIndex((l) => l.id === activeLeadId);
      const newIndex = currentColumnLeads.findIndex((l) => l.id === overCardId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(currentColumnLeads, oldIndex, newIndex);
      
      const updates: Record<string, { installOrder: number }> = {};
      reordered.forEach((lead, index) => {
        if ((lead.installOrder || 0) !== index) {
          updates[lead.id] = { installOrder: index };
        }
      });

      if (Object.keys(updates).length > 0) {
        setOptimisticUpdates((prev) => ({ ...prev, ...updates }));

        Object.entries(updates).forEach(([id, data]) => {
          updateLeadMutation.mutate({ id, data });
        });
      }
    } else {
      // Validate: require install date when moving to or past "Assign to Sub-Contractor"
      const targetStepIndex = INSTALL_STEPS.indexOf(targetStep);
      const assignToSubContractorIndex = INSTALL_STEPS.indexOf("Assign to Sub-Contractor");
      if (targetStepIndex >= assignToSubContractorIndex && !draggedLead.installDate) {
        toast({
          title: "Install Date Required",
          description: "Please click on the job card and set an install date before moving to 'Assign to Sub-Contractor' or beyond.",
          variant: "destructive",
        });
        return;
      }

      let newOrder: number;
      if (overCardId) {
        const overIndex = targetColumnLeads.findIndex((l) => l.id === overCardId);
        newOrder = overIndex >= 0 ? overIndex : targetColumnLeads.length;
      } else {
        newOrder = targetColumnLeads.length;
      }

      setOptimisticUpdates((prev) => ({
        ...prev,
        [activeLeadId]: { installStep: targetStep, installOrder: newOrder },
      }));

      updateLeadMutation.mutate({
        id: activeLeadId,
        data: { installStep: targetStep, installOrder: newOrder },
      });
    }
  };

  const openEditDialog = (lead: Lead) => {
    setEditingLead(lead);
    const installDateValue = lead.installDate
      ? (typeof lead.installDate === "string" ? parseISO(lead.installDate) : lead.installDate)
      : undefined;
    const installEndDateValue = lead.installEndDate
      ? (typeof lead.installEndDate === "string" ? parseISO(lead.installEndDate) : lead.installEndDate)
      : undefined;
    setEditForm({
      installStep: lead.installStep || INSTALL_STEPS[0],
      clientIssue: lead.clientIssue || "",
      assignedEmployeeId: lead.assignedEmployeeId || "unassigned",
      installDate: installDateValue,
      installEndDate: installEndDateValue,
    });
  };

  const handleSaveEdit = () => {
    if (!editingLead) return;
    
    // Require install date when moving to or past "Assign to Sub-Contractor"
    const stepIndex = INSTALL_STEPS.indexOf(editForm.installStep as InstallStep);
    const assignToSubContractorIndex = INSTALL_STEPS.indexOf("Assign to Sub-Contractor");
    if (stepIndex >= assignToSubContractorIndex && !editForm.installDate) {
      toast({
        title: "Install Date Required",
        description: "Please set an install date before moving to 'Assign to Sub-Contractor' or beyond.",
        variant: "destructive",
      });
      return;
    }
    
    updateLeadMutation.mutate({
      id: editingLead.id,
      data: {
        installStep: editForm.installStep,
        clientIssue: editForm.clientIssue,
        assignedEmployeeId: editForm.assignedEmployeeId === "unassigned" ? null : editForm.assignedEmployeeId,
        installDate: editForm.installDate ? editForm.installDate.toISOString() : null,
        installEndDate: editForm.installEndDate ? editForm.installEndDate.toISOString() : null,
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
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <NavDropdown
                currentPageTitle="Installation Department"
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
            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px]" data-testid="button-back">
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
                data-testid="input-search"
              />
            </div>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]" data-testid="select-employee-filter">
                <SelectValue placeholder="Filter by employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {salesPeople.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "kanban" | "calendar")} className="mb-4">
          <TabsList className="grid w-full max-w-sm grid-cols-2 h-12 py-0 px-[3px] mx-auto" data-testid="tabs-view-switcher">
            <TabsTrigger value="kanban" className="min-h-[44px] pt-0 pb-0" data-testid="tab-kanban">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="calendar" className="min-h-[44px] pt-0 pb-0" data-testid="tab-calendar">
              <CalendarDays className="h-4 w-4 mr-2" />
              Calendar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            {isLoadingLeads ? (
              <HorizontalScrollContainer>
                {INSTALL_STEPS.map((step) => (
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
                <p className="text-muted-foreground text-center" data-testid="text-empty-state">
                  No installation jobs found in Won status.
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
                  {INSTALL_STEPS.map((step) => (
                    <KanbanColumn
                      key={step}
                      step={step}
                      leads={leadsByStep[step]}
                      technicians={salesPeople}
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-job">
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

            {/* Equipment Details from Proposal Builder */}
            {editingLead?.quoteDetails && (() => {
              try {
                const details = JSON.parse(editingLead.quoteDetails);
                if (details.equipment && details.equipment.length > 0) {
                  return (
                    <div className="space-y-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 uppercase tracking-wide flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Accepted Equipment
                      </h4>
                      <div className="space-y-3">
                        {details.equipment.map((item: any, idx: number) => (
                          <div key={idx} className="bg-white dark:bg-gray-900 rounded p-2 border">
                            {item.type === "custom" ? (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className="bg-green-500 text-white text-xs">
                                    <Wrench className="h-3 w-3 mr-1" />
                                    Custom Build
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">{item.tonnage}</span>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  <p>• {item.outdoor?.brand} {item.outdoor?.name} {item.outdoor?.model && <span className="font-mono">({item.outdoor.model})</span>}</p>
                                  <p>• {item.coil?.brand} {item.coil?.name} {item.coil?.model && <span className="font-mono">({item.coil.model})</span>}</p>
                                  <p>• {item.indoor?.brand} {item.indoor?.name} {item.indoor?.model && <span className="font-mono">({item.indoor.model})</span>}</p>
                                  <p>• {item.thermostat?.brand} {item.thermostat?.name} {item.thermostat?.model && <span className="font-mono">({item.thermostat.model})</span>}</p>
                                </div>
                                <p className="text-sm font-medium text-primary mt-1">
                                  ${item.priceLow?.toLocaleString()} - ${item.priceHigh?.toLocaleString()}
                                </p>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{item.packageLevel}</Badge>
                                  <span className="text-xs text-muted-foreground">{item.tonnage}</span>
                                </div>
                                <p className="font-medium text-sm mt-1">{item.unitTypeName} ({item.tier})</p>
                                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                  <p>• {item.outdoor?.brand} {item.outdoor?.name} {item.outdoor?.model && <span className="font-mono">({item.outdoor.model})</span>}</p>
                                  {item.indoor?.name && <p>• {item.indoor.name} {item.indoor?.model && <span className="font-mono">({item.indoor.model})</span>}</p>}
                                  {item.thermostat?.name && <p>• {item.thermostat.name} {item.thermostat?.model && <span className="font-mono">({item.thermostat.model})</span>}</p>}
                                </div>
                                <p className="text-sm font-medium text-primary mt-1">
                                  ${item.totalPrice?.toLocaleString()}
                                  {item.monthlyPayment > 0 && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      (${item.monthlyPayment?.toLocaleString()}/mo)
                                    </span>
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {details.pricing && (
                        <div className="pt-2 border-t border-green-200 dark:border-green-700">
                          {details.hasCustomBuilds ? (
                            <>
                              <p className="text-sm font-bold text-green-800 dark:text-green-200">
                                Total: ${details.pricing.totalLow?.toLocaleString()} - ${details.pricing.totalHigh?.toLocaleString()}
                              </p>
                              <p className="text-xs text-green-700 dark:text-green-300">
                                Monthly: ${details.pricing.monthlyLow?.toLocaleString()} - ${details.pricing.monthlyHigh?.toLocaleString()}/mo
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-bold text-green-800 dark:text-green-200">
                                Total: ${details.pricing.totalHigh?.toLocaleString()}
                              </p>
                              <p className="text-xs text-green-700 dark:text-green-300">
                                Monthly: ${details.pricing.monthlyHigh?.toLocaleString()}/mo
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              } catch {
                return null;
              }
            })()}

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
                    {linkedQuote.parts && (linkedQuote.parts as any[]).length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <span className="text-muted-foreground text-xs">Parts:</span>
                        <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                          {(linkedQuote.parts as any[]).slice(0, 3).map((part: any, i: number) => (
                            <li key={i} className="truncate">{part.description}</li>
                          ))}
                          {(linkedQuote.parts as any[]).length > 3 && (
                            <li className="text-muted-foreground">+{(linkedQuote.parts as any[]).length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                    <Link href={`/quote/edit/${linkedQuote.id}`}>
                      <Button variant="outline" size="sm" className="w-full mt-2 min-h-[36px]" data-testid="button-view-quote">
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
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Edit Job</h4>
              
              <div className="space-y-2">
                <Label htmlFor="installStep">Installation Step</Label>
                <Select
                  value={editForm.installStep}
                  onValueChange={(value) => setEditForm({ ...editForm, installStep: value })}
                >
                  <SelectTrigger id="installStep" className="min-h-[44px]" data-testid="select-install-step">
                    <SelectValue placeholder="Select step" />
                  </SelectTrigger>
                  <SelectContent>
                    {INSTALL_STEPS.map((step) => (
                      <SelectItem key={step} value={step}>
                        {step}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="installDate">Installation Date(s)</Label>
                <p className="text-xs text-muted-foreground">Click a date for single day, or drag/click two dates for a range</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="installDate"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal min-h-[44px]",
                        !editForm.installDate && "text-muted-foreground"
                      )}
                      data-testid="button-install-date"
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {editForm.installDate 
                        ? editForm.installEndDate 
                          ? `${format(editForm.installDate, "MMM d")} - ${format(editForm.installEndDate, "MMM d, yyyy")}`
                          : format(editForm.installDate, "PPP")
                        : "Pick a date or range"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={editForm.installDate ? { from: editForm.installDate, to: editForm.installEndDate } : undefined}
                      onSelect={(range) => {
                        if (range) {
                          setEditForm({ 
                            ...editForm, 
                            installDate: range.from, 
                            installEndDate: range.to 
                          });
                        } else {
                          setEditForm({ 
                            ...editForm, 
                            installDate: undefined, 
                            installEndDate: undefined 
                          });
                        }
                      }}
                      numberOfMonths={1}
                      initialFocus
                    />
                    {editForm.installEndDate && (
                      <div className="p-2 border-t">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full text-xs"
                          onClick={() => setEditForm({ ...editForm, installEndDate: undefined })}
                        >
                          Clear end date (single day)
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedEmployee">Assigned Employee</Label>
                <Select
                  value={editForm.assignedEmployeeId}
                  onValueChange={(value) => setEditForm({ ...editForm, assignedEmployeeId: value })}
                >
                  <SelectTrigger id="assignedEmployee" className="min-h-[44px]" data-testid="select-assigned-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {salesPeople.map((tech) => (
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
                  placeholder="Add notes about this job..."
                  rows={3}
                  className="min-h-[80px]"
                  data-testid="textarea-notes"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingLead(null)} className="min-h-[44px]" data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="min-h-[44px]" data-testid="button-save">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
