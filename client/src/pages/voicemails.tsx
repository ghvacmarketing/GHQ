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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, GripVertical, Phone, Calendar, Play, Pause } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { Voicemail } from "@shared/schema";

const VOICEMAIL_STATUSES = ["NEW", "UNRESOLVED", "RESOLVED"] as const;
type VoicemailStatus = typeof VOICEMAIL_STATUSES[number];

const COLUMN_PREFIX = "column-";

function getColumnId(status: VoicemailStatus): string {
  return `${COLUMN_PREFIX}${status}`;
}

function getStatusFromColumnId(columnId: string): VoicemailStatus | null {
  if (columnId.startsWith(COLUMN_PREFIX)) {
    const status = columnId.slice(COLUMN_PREFIX.length) as VoicemailStatus;
    if (VOICEMAIL_STATUSES.includes(status)) {
      return status;
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
        data-testid="voicemail-kanban-board"
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

interface VoicemailCardProps {
  voicemail: Voicemail;
  isDragging?: boolean;
}

function VoicemailCard({ voicemail, isDragging }: VoicemailCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id: voicemail.id,
    data: {
      type: "card",
      voicemail,
      status: voicemail.status || "NEW",
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!voicemail.mp3Filename) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(`/uploads/${voicemail.mp3Filename}`);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const formattedDate = voicemail.receivedAt 
    ? format(typeof voicemail.receivedAt === "string" ? parseISO(voicemail.receivedAt) : voicemail.receivedAt, "MMM d, yyyy h:mm a")
    : null;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="mb-2 hover:shadow-md transition-shadow bg-white touch-manipulation"
      data-testid={`card-voicemail-${voicemail.id}`}
      data-no-drag
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            data-testid={`voicemail-drag-handle-${voicemail.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" data-testid={`text-voicemail-title-${voicemail.id}`}>
              {voicemail.title || "Untitled Voicemail"}
            </h4>
            {voicemail.caller && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{voicemail.caller}</span>
              </div>
            )}
            {formattedDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{formattedDate}</span>
              </div>
            )}
            {voicemail.mp3Filename && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePlayPause}
                  className="min-h-[36px] text-xs"
                  data-testid={`button-play-voicemail-${voicemail.id}`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3 w-3 mr-1" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      Play
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface KanbanColumnProps {
  status: VoicemailStatus;
  voicemails: Voicemail[];
}

function KanbanColumn({ status, voicemails }: KanbanColumnProps) {
  const columnId = getColumnId(status);
  
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: {
      type: "column",
      status,
    }
  });

  const statusLabels: Record<VoicemailStatus, string> = {
    NEW: "New",
    UNRESOLVED: "Unresolved",
    RESOLVED: "Resolved",
  };

  const statusColors: Record<VoicemailStatus, string> = {
    NEW: "bg-blue-50",
    UNRESOLVED: "bg-yellow-50",
    RESOLVED: "bg-green-50",
  };

  return (
    <div className="flex-shrink-0 w-72 sm:w-80 snap-start sm:snap-center">
      <Card className={`h-full ${statusColors[status]} transition-colors ${isOver ? 'ring-2 ring-primary ring-opacity-50' : ''}`}>
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold truncate" data-testid={`voicemail-column-title-${status}`}>
              {statusLabels[status]}
            </CardTitle>
            <Badge variant="outline" className="ml-2 flex-shrink-0" data-testid={`voicemail-column-count-${status}`}>
              {voicemails.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          <ScrollArea className="h-[calc(100vh-280px)] pr-2">
            <div ref={setNodeRef} className="min-h-[100px]">
              <SortableContext items={voicemails.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                {voicemails.map((voicemail) => (
                  <VoicemailCard
                    key={voicemail.id}
                    voicemail={voicemail}
                  />
                ))}
              </SortableContext>
              {voicemails.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8" data-testid={`voicemail-column-empty-${status}`}>
                  No voicemails
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Voicemails() {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { status?: string }>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const { data: voicemails = [], isLoading } = useQuery<Voicemail[]>({
    queryKey: ["/api/voicemails"],
  });

  const clearOptimisticUpdate = useCallback((id: string) => {
    setOptimisticUpdates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateVoicemailMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { status: string } }) => {
      const res = await apiRequest("PATCH", `/api/voicemails/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      clearOptimisticUpdate(variables.id);
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
    },
    onError: (error, variables) => {
      clearOptimisticUpdate(variables.id);
      toast({
        title: "Error",
        description: "Failed to update voicemail status",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
    },
  });

  const voicemailsByStatus = useMemo(() => {
    const map: Record<VoicemailStatus, Voicemail[]> = {
      NEW: [],
      UNRESOLVED: [],
      RESOLVED: [],
    };

    voicemails.forEach((vm) => {
      const optimistic = optimisticUpdates[vm.id];
      const effectiveStatus = (optimistic?.status || vm.status || "NEW") as VoicemailStatus;
      if (VOICEMAIL_STATUSES.includes(effectiveStatus)) {
        map[effectiveStatus].push(vm);
      } else {
        map.NEW.push(vm);
      }
    });

    return map;
  }, [voicemails, optimisticUpdates]);

  const activeVoicemail = useMemo(() => {
    if (!activeId) return null;
    return voicemails.find((vm) => vm.id === activeId) || null;
  }, [activeId, voicemails]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeVm = voicemails.find((vm) => vm.id === active.id);
    if (!activeVm) return;

    let targetStatus: VoicemailStatus | null = null;

    if (String(over.id).startsWith(COLUMN_PREFIX)) {
      targetStatus = getStatusFromColumnId(String(over.id));
    } else {
      const overVm = voicemails.find((vm) => vm.id === over.id);
      if (overVm) {
        targetStatus = (overVm.status || "NEW") as VoicemailStatus;
      }
    }

    if (!targetStatus) return;

    const currentStatus = (activeVm.status || "NEW") as VoicemailStatus;
    if (currentStatus === targetStatus) return;

    setOptimisticUpdates((prev) => ({
      ...prev,
      [activeVm.id]: { status: targetStatus },
    }));

    updateVoicemailMutation.mutate({
      id: activeVm.id,
      data: { status: targetStatus },
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <Link href="/">
              <Button variant="ghost" size="icon" className="flex-shrink-0 min-h-[44px] min-w-[44px]" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <NavDropdown 
                currentPageTitle="Voicemails"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Voicemails", path: "/voicemails" },
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
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading voicemails...</div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <HorizontalScrollContainer isDraggingCard={!!activeId}>
              {VOICEMAIL_STATUSES.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  voicemails={voicemailsByStatus[status]}
                />
              ))}
            </HorizontalScrollContainer>
            <DragOverlay>
              {activeVoicemail && (
                <VoicemailCard voicemail={activeVoicemail} isDragging />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
}
