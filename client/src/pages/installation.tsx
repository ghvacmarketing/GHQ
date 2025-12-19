import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
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
import { ArrowLeft, Search, MapPin, DollarSign, Calendar, User, StickyNote, GripVertical } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import type { Lead, Technician } from "@shared/schema";

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
  } = useSortable({ id: lead.id });

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
  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => (a.installOrder || 0) - (b.installOrder || 0));
  }, [leads]);

  return (
    <div className="flex-shrink-0 w-72 sm:w-80">
      <Card className="h-full bg-gray-50">
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
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Installation() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({ installStep: "", clientIssue: "", assignedEmployeeId: "" });
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ description: "Job updated successfully", duration: 1000 });
    },
    onError: () => {
      toast({ description: "Failed to update job", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
  });

  const installationLeads = useMemo(() => {
    return allLeads.filter((lead) => {
      if (lead.status !== "Won") return false;
      if (!lead.tags || !Array.isArray(lead.tags)) return false;
      return lead.tags.some((tag) => tag.toLowerCase() === "installation");
    });
  }, [allLeads]);

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

    const activeLead = filteredLeads.find((l) => l.id === activeLeadId);
    if (!activeLead) return;

    let targetStep: InstallStep | null = null;
    let targetLeads: Lead[] = [];

    for (const step of INSTALL_STEPS) {
      const leadsInStep = leadsByStep[step];
      if (leadsInStep.some((l) => l.id === overId)) {
        targetStep = step;
        targetLeads = leadsInStep;
        break;
      }
    }

    if (!targetStep) {
      if (INSTALL_STEPS.includes(overId as InstallStep)) {
        targetStep = overId as InstallStep;
        targetLeads = leadsByStep[targetStep];
      }
    }

    if (!targetStep) return;

    const currentStep = (activeLead.installStep as InstallStep) || INSTALL_STEPS[0];
    const sameColumn = currentStep === targetStep;

    if (sameColumn) {
      const oldIndex = targetLeads.findIndex((l) => l.id === activeLeadId);
      const newIndex = targetLeads.findIndex((l) => l.id === overId);
      
      if (oldIndex !== newIndex && newIndex !== -1) {
        const reordered = arrayMove(targetLeads, oldIndex, newIndex);
        reordered.forEach((lead, index) => {
          updateLeadMutation.mutate({
            id: lead.id,
            data: { installOrder: index },
          });
        });
      }
    } else {
      const maxOrder = Math.max(...targetLeads.map((l) => l.installOrder || 0), -1);
      updateLeadMutation.mutate({
        id: activeLeadId,
        data: { installStep: targetStep, installOrder: maxOrder + 1 },
      });
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeLeadId = active.id as string;
    const overId = over.id as string;

    if (activeLeadId === overId) return;
  };

  const openEditDialog = (lead: Lead) => {
    setEditingLead(lead);
    setEditForm({
      installStep: lead.installStep || INSTALL_STEPS[0],
      clientIssue: lead.clientIssue || "",
      assignedEmployeeId: lead.assignedEmployeeId || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingLead) return;
    updateLeadMutation.mutate({
      id: editingLead.id,
      data: {
        installStep: editForm.installStep,
        clientIssue: editForm.clientIssue,
        assignedEmployeeId: editForm.assignedEmployeeId || null,
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
                currentPageTitle="Installation"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation", path: "/installation" },
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
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoadingLeads ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {INSTALL_STEPS.map((step) => (
              <div key={step} className="flex-shrink-0 w-72 sm:w-80">
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
          </div>
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
            onDragOver={handleDragOver}
          >
            <div className="flex gap-4 overflow-x-auto pb-4" data-testid="kanban-board">
              {INSTALL_STEPS.map((step) => (
                <KanbanColumn
                  key={step}
                  step={step}
                  leads={leadsByStep[step]}
                  technicians={technicians}
                  onCardClick={openEditDialog}
                />
              ))}
            </div>
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
      </main>

      <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-edit-job">
          <DialogHeader>
            <DialogTitle>Edit Job: {editingLead?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              <Label htmlFor="assignedEmployee">Assigned Employee</Label>
              <Select
                value={editForm.assignedEmployeeId}
                onValueChange={(value) => setEditForm({ ...editForm, assignedEmployeeId: value })}
              >
                <SelectTrigger id="assignedEmployee" className="min-h-[44px]" data-testid="select-assigned-employee">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
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
                placeholder="Add notes about this job..."
                rows={4}
                className="min-h-[88px]"
                data-testid="textarea-notes"
              />
            </div>
          </div>
          <DialogFooter>
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
