import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { Search, Calendar, HelpCircle, Plus, Clock, User, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import CrmLayout from "@/components/crm/crm-layout";

import {
  START_HOUR,
  END_HOUR,
  INTERVAL_MINUTES,
  TOTAL_SLOTS,
  QUEUE_STAGES,
  QUEUE_STAGE_CONFIG,
  TECH_COLORS,
  buildTimeSlots,
  dateToSlotIndex,
  slotIndexToTime,
  calculateDurationSlots,
  type QueueStage,
} from "./constants";
import type { EnrichedWorkOrder, Technician, DragPayload } from "./types";

const timeSlots = buildTimeSlots();
const SLOT_WIDTH = 60;
const TIMELINE_WIDTH = TOTAL_SLOTS * SLOT_WIDTH;

const TECH_ROW_HEIGHT = 56;
const TECH_LABEL_WIDTH = 176;

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function getPropertyAddress(property: any): string {
  if (!property) return "";
  const parts = [property.address1, property.city, property.state].filter(Boolean);
  return parts.join(", ");
}

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  scheduled: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  dispatched: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  en_route: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  on_site: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  completed: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  cancelled: { bg: "bg-red-50", border: "border-red-200", text: "text-red-500" },
};

export default function DispatchBoardV2() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery<EnrichedWorkOrder[]>({
    queryKey: ["/api/crm/work-orders/list", { date: format(selectedDate, "yyyy-MM-dd") }],
    queryFn: async () => {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const res = await fetch(`/api/crm/work-orders/list?date=${dateStr}`);
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return res.json();
    },
  });

  const { data: techniciansData } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const technicians: Technician[] = useMemo(() => {
    if (!techniciansData) return [];
    return techniciansData
      .filter((emp: any) => emp.role === "technician" || emp.role === "Employee")
      .map((emp: any, idx: number) => ({
        id: emp.id,
        name: emp.name || emp.username || "Unknown",
        initials: getInitials(emp.name || emp.username || "U"),
        color: TECH_COLORS[idx % TECH_COLORS.length],
      }));
  }, [techniciansData]);

  const workOrders = useMemo(() => {
    let orders = workOrdersData || [];
    if (searchQuery.trim()) {
      const search = searchQuery.toLowerCase();
      orders = orders.filter(wo =>
        wo.title?.toLowerCase().includes(search) ||
        wo.description?.toLowerCase().includes(search) ||
        wo.customer?.name?.toLowerCase().includes(search) ||
        wo.workOrderNumber?.toLowerCase().includes(search)
      );
    }
    return orders;
  }, [workOrdersData, searchQuery]);

  const queueColumns = useMemo(() => {
    const columns: Record<QueueStage, EnrichedWorkOrder[]> = {
      NeedsScheduling: [],
      ReadyToDispatch: [],
      WaitingOnParts: [],
      NeedsApproval: [],
      OnHold: [],
    };

    workOrders.forEach(wo => {
      if (wo.assignedTechId && wo.scheduledStart) return;

      if (wo.dispatchQueueStage === "WaitingOnParts") {
        columns.WaitingOnParts.push(wo);
      } else if (wo.dispatchQueueStage === "NeedsApproval") {
        columns.NeedsApproval.push(wo);
      } else if (wo.dispatchQueueStage === "OnHold") {
        columns.OnHold.push(wo);
      } else if (!wo.scheduledStart) {
        columns.NeedsScheduling.push(wo);
      } else if (!wo.assignedTechId) {
        columns.ReadyToDispatch.push(wo);
      }
    });

    return columns;
  }, [workOrders]);

  const assignedWorkOrders = useMemo(() => {
    return workOrders.filter(wo => wo.assignedTechId && wo.scheduledStart);
  }, [workOrders]);

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<EnrichedWorkOrder> }) => {
      const res = await apiRequest("PATCH", `/api/crm/work-orders/${data.id}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const workOrderId = active.id as string;
    const overId = over.id as string;

    if (overId.startsWith("tech-slot::")) {
      const parts = overId.replace("tech-slot::", "").split("::");
      const techId = parts[0];
      const slotIndex = parseInt(parts[1], 10);

      const scheduledStart = slotIndexToTime(slotIndex, selectedDate);
      const scheduledEnd = new Date(scheduledStart);
      scheduledEnd.setHours(scheduledEnd.getHours() + 1);

      updateWorkOrderMutation.mutate({
        id: workOrderId,
        updates: {
          assignedTechId: techId,
          scheduledStart: scheduledStart.toISOString(),
          scheduledEnd: scheduledEnd.toISOString(),
          dispatchQueueStage: null,
        },
      });

      toast({
        title: "Work order scheduled",
        description: `Assigned to technician at ${format(scheduledStart, "h:mm a")}`,
      });
    }
  };

  const activeWorkOrder = useMemo(() => {
    if (!activeId) return null;
    return workOrders.find(wo => wo.id === activeId) || null;
  }, [activeId, workOrders]);

  const totalUnassigned = QUEUE_STAGES.reduce((sum, stage) => sum + queueColumns[stage].length, 0);

  return (
    <CrmLayout>
      <div className="flex flex-col h-full" data-testid="dispatch-board-v2">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900" data-testid="text-page-title">Dispatch Board</h1>
            <p className="text-sm text-slate-500">Daily Schedule - {workOrders.length} work orders</p>
          </div>

          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search work orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200"
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-date-picker">
                  <Calendar className="h-4 w-4" />
                  {format(selectedDate, "EEE, MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Dialog open={legendOpen} onOpenChange={setLegendOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-legend">
                  <HelpCircle className="h-4 w-4" />
                  Legend
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Status Legend</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  {Object.entries(statusColors).map(([status, colors]) => (
                    <div key={status} className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded ${colors.bg} border ${colors.border}`} />
                      <span className="capitalize">{status.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <Button className="gap-2 bg-[#711419] hover:bg-[#5a1014]" data-testid="button-new-work-order">
              <Plus className="h-4 w-4" />
              New Work Order
            </Button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="border-b bg-white">
              <div className="px-4 py-3">
                <h2 className="text-lg font-semibold text-slate-800">
                  Unassigned Queue ({totalUnassigned})
                </h2>
              </div>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-5 gap-4">
                  {QUEUE_STAGES.map((stage) => (
                    <QueueColumnComponent
                      key={stage}
                      stage={stage}
                      workOrders={queueColumns[stage]}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden bg-white">
              <div className="px-4 py-3 border-b">
                <h2 className="text-lg font-semibold text-slate-800">
                  Technician Schedule ({assignedWorkOrders.length})
                </h2>
              </div>

              {workOrdersLoading ? (
                <div className="p-4 space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <ScrollArea className="h-[calc(100%-48px)]">
                  <div className="min-w-max">
                    <div className="flex border-b border-slate-200 sticky top-0 bg-white z-10">
                      <div
                        className="flex-shrink-0 p-2 border-r border-slate-200 text-sm font-medium text-slate-700"
                        style={{ width: TECH_LABEL_WIDTH }}
                      >
                        Technicians
                      </div>
                      <div className="flex">
                        {timeSlots.map((slot, idx) => (
                          <div
                            key={idx}
                            className={`text-center py-2 text-xs font-medium border-r ${slot.label ? "text-slate-600 border-slate-300" : "text-slate-400 border-slate-100"}`}
                            style={{ width: 60 }}
                          >
                            {slot.label || ""}
                          </div>
                        ))}
                        <div
                          className="text-center py-2 text-xs text-slate-600 font-medium"
                          style={{ width: 30 }}
                        >
                          8pm
                        </div>
                      </div>
                    </div>

                    {technicians.map((tech) => (
                      <TechnicianRowComponent
                        key={tech.id}
                        tech={tech}
                        workOrders={assignedWorkOrders.filter(wo => wo.assignedTechId === tech.id)}
                        selectedDate={selectedDate}
                      />
                    ))}

                    {technicians.length === 0 && (
                      <div className="p-8 text-center text-slate-500">
                        No technicians available
                      </div>
                    )}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeWorkOrder && <WorkOrderCardOverlay workOrder={activeWorkOrder} />}
          </DragOverlay>
        </DndContext>
      </div>
    </CrmLayout>
  );
}

function QueueColumnComponent({ stage, workOrders }: { stage: QueueStage; workOrders: EnrichedWorkOrder[] }) {
  const config = QUEUE_STAGE_CONFIG[stage];

  return (
    <div className={`rounded-lg border ${config.color} p-3`} data-testid={`queue-column-${stage}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-medium text-slate-800 text-sm">{config.label}</h3>
          {config.description && (
            <p className="text-xs text-slate-500">{config.description}</p>
          )}
        </div>
        <Badge variant="secondary" className="text-xs">{workOrders.length}</Badge>
      </div>

      <div className="space-y-2 max-h-40 overflow-y-auto">
        {workOrders.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">No work orders</p>
        ) : (
          workOrders.map((wo) => (
            <QueueCard key={wo.id} workOrder={wo} />
          ))
        )}
      </div>
    </div>
  );
}

import { useDraggable, useDroppable } from "@dnd-kit/core";

function QueueCard({ workOrder }: { workOrder: EnrichedWorkOrder }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workOrder.id,
    data: { type: "queue", workOrder },
  });

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-white rounded border border-slate-200 p-2 cursor-grab active:cursor-grabbing shadow-sm hover:shadow"
      data-testid={`queue-card-${workOrder.id}`}
    >
      <p className="font-medium text-xs text-slate-900 truncate">
        WO-{workOrder.workOrderNumber}
      </p>
      <p className="text-xs text-slate-600 truncate">
        {workOrder.customer?.name || "—"}
      </p>
      {workOrder.scheduledStart && (
        <p className="text-xs text-slate-400 mt-1">
          <Clock className="inline h-3 w-3 mr-1" />
          {format(new Date(workOrder.scheduledStart), "h:mm a")}
        </p>
      )}
    </div>
  );
}

function TechnicianRowComponent({
  tech,
  workOrders,
  selectedDate,
}: {
  tech: Technician;
  workOrders: EnrichedWorkOrder[];
  selectedDate: Date;
}) {
  return (
    <div className="flex border-b border-slate-100" style={{ height: TECH_ROW_HEIGHT }}>
      <div
        className="flex-shrink-0 flex items-center gap-2 p-2 border-r border-slate-200 bg-slate-50"
        style={{ width: TECH_LABEL_WIDTH }}
      >
        <div className={`w-8 h-8 rounded-full ${tech.color} text-white flex items-center justify-center text-xs font-medium`}>
          {tech.initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{tech.name}</p>
          <p className="text-xs text-slate-500">{workOrders.length} work orders</p>
        </div>
      </div>

      <div className="relative" style={{ width: TIMELINE_WIDTH + 30 }}>
        {timeSlots.map((slot, idx) => (
          <TimeSlotDropZone
            key={idx}
            techId={tech.id}
            slotIndex={idx}
            isHourMark={slot.minute === 0}
          />
        ))}

        {workOrders.map((wo) => {
          if (!wo.scheduledStart) return null;
          const startDate = new Date(wo.scheduledStart);
          const endDate = wo.scheduledEnd ? new Date(wo.scheduledEnd) : null;
          const slotIndex = dateToSlotIndex(startDate);
          const durationSlots = calculateDurationSlots(startDate, endDate);

          if (slotIndex < 0 || slotIndex >= TOTAL_SLOTS) return null;

          const leftPx = slotIndex * SLOT_WIDTH;
          const widthPx = durationSlots * SLOT_WIDTH;

          return (
            <ScheduledWorkOrderCard
              key={wo.id}
              workOrder={wo}
              leftPx={leftPx}
              widthPx={widthPx}
            />
          );
        })}
      </div>
    </div>
  );
}

function TimeSlotDropZone({ techId, slotIndex, isHourMark }: { techId: string; slotIndex: number; isHourMark: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `tech-slot::${techId}::${slotIndex}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`absolute top-0 bottom-0 border-r ${isHourMark ? "border-slate-300" : "border-slate-100"} ${isOver ? "bg-blue-100" : ""}`}
      style={{
        left: slotIndex * SLOT_WIDTH,
        width: SLOT_WIDTH,
      }}
    />
  );
}

function ScheduledWorkOrderCard({
  workOrder,
  leftPx,
  widthPx,
}: {
  workOrder: EnrichedWorkOrder;
  leftPx: number;
  widthPx: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workOrder.id,
    data: { type: "grid", workOrder },
  });

  const statusStyle = statusColors[workOrder.status] || statusColors.scheduled;

  const style: React.CSSProperties = {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: leftPx,
    width: widthPx,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 50 : 10,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`${statusStyle.bg} border ${statusStyle.border} rounded px-2 py-1 cursor-grab active:cursor-grabbing overflow-hidden`}
      data-testid={`scheduled-card-${workOrder.id}`}
    >
      <p className={`text-xs font-medium ${statusStyle.text} truncate`}>
        WO-{workOrder.workOrderNumber}
      </p>
      <p className="text-xs text-slate-600 truncate">
        {workOrder.customer?.name || workOrder.title || "—"}
      </p>
    </div>
  );
}

function WorkOrderCardOverlay({ workOrder }: { workOrder: EnrichedWorkOrder }) {
  const statusStyle = statusColors[workOrder.status] || statusColors.scheduled;

  return (
    <div className={`${statusStyle.bg} border ${statusStyle.border} rounded-lg p-3 shadow-lg min-w-48`}>
      <p className={`font-medium ${statusStyle.text}`}>WO-{workOrder.workOrderNumber}</p>
      <p className="text-sm text-slate-600">{workOrder.customer?.name || "—"}</p>
      {workOrder.title && <p className="text-xs text-slate-500 mt-1">{workOrder.title}</p>}
    </div>
  );
}
