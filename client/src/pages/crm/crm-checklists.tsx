import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle,
  Type,
  Hash,
  List,
  Camera,
  Flag,
  Unlink,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import {
  checklistQuestionTypeEnum,
  checklistVisitTypeEnum,
  type CrmUser,
  type ServiceCallChecklist,
  type ChecklistQuestion,
  type ChecklistPhotoStep,
  type ChecklistQuestionType,
  type ChecklistVisitType,
  type WorkOrderSubtype,
} from "@shared/schema";

type ChecklistWithQuestions = ServiceCallChecklist & {
  questions: ChecklistQuestion[];
  photoSteps?: ChecklistPhotoStep[];
};

const VISIT_TYPE_LABELS: Record<ChecklistVisitType, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  SALES: "Sales",
  MAINTENANCE: "Maintenance",
};

const QUESTION_TYPE_LABELS: Record<ChecklistQuestionType, string> = {
  yes_no: "Yes/No",
  text: "Text",
  number: "Number",
  select: "Select",
};

const QUESTION_TYPE_ICONS: Record<ChecklistQuestionType, React.ReactNode> = {
  yes_no: <CheckCircle className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
  number: <Hash className="h-3.5 w-3.5" />,
  select: <List className="h-3.5 w-3.5" />,
};

const MAROON = "#711419";

type XY = { x: number; y: number };

export default function CrmChecklists() {
  usePageTitle("Checklist Canvas");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Canvas flow selection: type → subtype → checklist
  const [visitType, setVisitType] = useState<ChecklistVisitType | "">("");
  const [subtype, setSubtype] = useState("");
  const [checklistId, setChecklistId] = useState("");

  // Dialogs
  const [showCreateChecklist, setShowCreateChecklist] = useState(false);
  const [showEditChecklist, setShowEditChecklist] = useState(false);
  const [showDeleteChecklist, setShowDeleteChecklist] = useState(false);
  const [checklistForm, setChecklistForm] = useState({ name: "", description: "", isActive: true });

  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<ChecklistQuestion | null>(null);
  const [deletingStep, setDeletingStep] = useState<ChecklistQuestion | null>(null);
  const [stepForm, setStepForm] = useState({
    question: "",
    questionType: "yes_no" as ChecklistQuestionType,
    isRequired: false,
    options: "",
    helpText: "",
  });

  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<ChecklistPhotoStep | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<ChecklistPhotoStep | null>(null);
  const [photoForm, setPhotoForm] = useState({ label: "", instructions: "", isRequired: true });

  // Link-drag state (drawing an arrow from a photo step to a checklist step)
  const [dragLink, setDragLink] = useState<{ photoId: string; from: XY; to: XY } | null>(null);
  const [hoverStepId, setHoverStepId] = useState<string | null>(null);

  // Canvas geometry
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef(new Map<string, HTMLDivElement>());
  const photoRefs = useRef(new Map<string, HTMLDivElement>());
  const [layoutTick, setLayoutTick] = useState(0);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: checklists = [] } = useQuery<ChecklistWithQuestions[]>({
    queryKey: ["/api/crm/checklists"],
    enabled: !!currentUser,
  });

  const { data: workOrderSubtypes = [] } = useQuery<WorkOrderSubtype[]>({
    queryKey: ["/api/crm/work-order-subtypes", { activeOnly: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/crm/work-order-subtypes?activeOnly=true");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const subtypesForVisitType = useMemo(
    () =>
      workOrderSubtypes
        .filter((s) => s.visitType === visitType)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [workOrderSubtypes, visitType],
  );

  const comboChecklists = useMemo(
    () =>
      checklists.filter(
        (c) => ((c as any).visitType || "SERVICE") === visitType && c.serviceType === subtype,
      ),
    [checklists, visitType, subtype],
  );

  const checklist = useMemo(
    () => checklists.find((c) => c.id === checklistId) ?? null,
    [checklists, checklistId],
  );

  const steps = useMemo(
    () => (checklist ? [...checklist.questions].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [checklist],
  );
  const photoSteps = useMemo(
    () => (checklist?.photoSteps ? [...checklist.photoSteps].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [checklist],
  );
  const stepNumberById = useMemo(() => {
    const m = new Map<string, number>();
    steps.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [steps]);

  // Auto-select the first checklist when the type/subtype combo changes
  useEffect(() => {
    if (!visitType || !subtype) {
      setChecklistId("");
      return;
    }
    if (!comboChecklists.some((c) => c.id === checklistId)) {
      setChecklistId(comboChecklists[0]?.id ?? "");
    }
  }, [visitType, subtype, comboChecklists, checklistId]);

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  // Recompute arrow geometry whenever layout can have changed
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLayoutTick((t) => t + 1));
    ro.observe(el);
    const onResize = () => setLayoutTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [checklist?.id]);

  // ----- mutations -----
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/crm/checklists"] });
  const onError = (error: any) =>
    toast({ title: error?.message || "Something went wrong", variant: "destructive" });

  const createChecklist = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/checklists", {
        name: checklistForm.name,
        description: checklistForm.description || null,
        visitType,
        serviceType: subtype,
        isActive: true,
      });
      return res.json();
    },
    onSuccess: (created: ServiceCallChecklist) => {
      invalidate();
      setShowCreateChecklist(false);
      setChecklistId(created.id);
      toast({ title: "Checklist created" });
    },
    onError,
  });

  const updateChecklist = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/crm/checklists/${checklistId}`, {
        name: checklistForm.name,
        description: checklistForm.description || null,
        isActive: checklistForm.isActive,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowEditChecklist(false);
      toast({ title: "Checklist updated" });
    },
    onError,
  });

  const deleteChecklist = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/crm/checklists/${checklistId}`),
    onSuccess: () => {
      invalidate();
      setShowDeleteChecklist(false);
      setChecklistId("");
      toast({ title: "Checklist deleted" });
    },
    onError,
  });

  const saveStep = useMutation({
    mutationFn: async () => {
      const data = {
        question: stepForm.question,
        questionType: stepForm.questionType,
        isRequired: stepForm.isRequired,
        helpText: stepForm.helpText || null,
        options:
          stepForm.questionType === "select" && stepForm.options
            ? stepForm.options.split(",").map((o) => o.trim()).filter(Boolean)
            : null,
        ...(editingStep ? {} : { sortOrder: (steps[steps.length - 1]?.sortOrder ?? 0) + 1 }),
      };
      if (editingStep) {
        return apiRequest("PUT", `/api/crm/checklists/questions/${editingStep.id}`, data);
      }
      return apiRequest("POST", `/api/crm/checklists/${checklistId}/questions`, data);
    },
    onSuccess: () => {
      invalidate();
      setStepDialogOpen(false);
      setEditingStep(null);
    },
    onError,
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/checklists/questions/${id}`),
    onSuccess: () => {
      invalidate();
      setDeletingStep(null);
    },
    onError,
  });

  const moveStep = useMutation({
    mutationFn: async ({ a, b }: { a: ChecklistQuestion; b: ChecklistQuestion }) => {
      await apiRequest("PUT", `/api/crm/checklists/questions/${a.id}`, { sortOrder: b.sortOrder });
      await apiRequest("PUT", `/api/crm/checklists/questions/${b.id}`, { sortOrder: a.sortOrder });
    },
    onSuccess: invalidate,
    onError,
  });

  const savePhoto = useMutation({
    mutationFn: async () => {
      const data = {
        label: photoForm.label,
        instructions: photoForm.instructions || null,
        isRequired: photoForm.isRequired,
        ...(editingPhoto ? {} : { sortOrder: (photoSteps[photoSteps.length - 1]?.sortOrder ?? 0) + 1 }),
      };
      if (editingPhoto) {
        return apiRequest("PUT", `/api/crm/checklists/photo-steps/${editingPhoto.id}`, data);
      }
      return apiRequest("POST", `/api/crm/checklists/${checklistId}/photo-steps`, data);
    },
    onSuccess: () => {
      invalidate();
      setPhotoDialogOpen(false);
      setEditingPhoto(null);
    },
    onError,
  });

  const deletePhoto = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/checklists/photo-steps/${id}`),
    onSuccess: () => {
      invalidate();
      setDeletingPhoto(null);
    },
    onError,
  });

  const setPhotoLink = useMutation({
    mutationFn: async ({ photoId, questionId }: { photoId: string; questionId: string | null }) =>
      apiRequest("PUT", `/api/crm/checklists/photo-steps/${photoId}`, { linkedQuestionId: questionId }),
    onSuccess: invalidate,
    onError,
  });

  // ----- link-drag (arrow drawing) -----
  const contentPoint = (clientX: number, clientY: number): XY => {
    const rect = contentRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startLinkDrag = (photoId: string, e: React.PointerEvent) => {
    if (!contentRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = contentPoint(e.clientX, e.clientY);
    setDragLink({ photoId, from: p, to: p });
  };

  const moveLinkDrag = (e: React.PointerEvent) => {
    if (!dragLink || !contentRef.current) return;
    setDragLink({ ...dragLink, to: contentPoint(e.clientX, e.clientY) });
    let hover: string | null = null;
    for (const [id, el] of Array.from(stepRefs.current.entries())) {
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top && e.clientY <= r.bottom) {
        hover = id;
        break;
      }
    }
    setHoverStepId(hover);
  };

  const endLinkDrag = () => {
    if (dragLink && hoverStepId) {
      setPhotoLink.mutate({ photoId: dragLink.photoId, questionId: hoverStepId });
    }
    setDragLink(null);
    setHoverStepId(null);
  };

  // Arrow endpoints for saved links, in canvas-content coordinates
  const links = useMemo(() => {
    void layoutTick; // geometry depends on rendered layout
    const content = contentRef.current;
    if (!content) return [] as Array<{ photoId: string; stepId: string; from: XY; to: XY }>;
    const cRect = content.getBoundingClientRect();
    const out: Array<{ photoId: string; stepId: string; from: XY; to: XY }> = [];
    for (const ps of photoSteps) {
      if (!ps.linkedQuestionId) continue;
      const photoEl = photoRefs.current.get(ps.id);
      const stepEl = stepRefs.current.get(ps.linkedQuestionId);
      if (!photoEl || !stepEl) continue;
      const pRect = photoEl.getBoundingClientRect();
      const sRect = stepEl.getBoundingClientRect();
      out.push({
        photoId: ps.id,
        stepId: ps.linkedQuestionId,
        from: { x: pRect.left - cRect.left, y: pRect.top - cRect.top + pRect.height / 2 },
        to: { x: sRect.right - cRect.left, y: sRect.top - cRect.top + sRect.height / 2 },
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoSteps, steps, layoutTick, checklist?.id]);

  const curve = (from: XY, to: XY) => {
    const dx = Math.max(48, Math.abs(from.x - to.x) * 0.45);
    return `M ${from.x} ${from.y} C ${from.x - dx} ${from.y}, ${to.x + dx} ${to.y}, ${to.x + 6} ${to.y}`;
  };

  // ----- dialog openers -----
  const openNewChecklist = () => {
    const subtypeLabel = subtype.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    setChecklistForm({ name: `${subtypeLabel} Checklist`, description: "", isActive: true });
    setShowCreateChecklist(true);
  };

  const openEditChecklist = () => {
    if (!checklist) return;
    setChecklistForm({
      name: checklist.name,
      description: checklist.description || "",
      isActive: checklist.isActive,
    });
    setShowEditChecklist(true);
  };

  const openNewStep = () => {
    setEditingStep(null);
    setStepForm({ question: "", questionType: "yes_no", isRequired: false, options: "", helpText: "" });
    setStepDialogOpen(true);
  };

  const openEditStep = (q: ChecklistQuestion) => {
    setEditingStep(q);
    setStepForm({
      question: q.question,
      questionType: q.questionType,
      isRequired: q.isRequired,
      options: q.options?.join(", ") || "",
      helpText: q.helpText || "",
    });
    setStepDialogOpen(true);
  };

  const openNewPhoto = () => {
    setEditingPhoto(null);
    setPhotoForm({ label: "", instructions: "", isRequired: true });
    setPhotoDialogOpen(true);
  };

  const openEditPhoto = (ps: ChecklistPhotoStep) => {
    setEditingPhoto(ps);
    setPhotoForm({ label: ps.label, instructions: ps.instructions || "", isRequired: ps.isRequired });
    setPhotoDialogOpen(true);
  };

  if (authLoading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-auth">
        <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
      </div>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="flex h-[calc(100vh-4rem)] flex-col lg:h-screen">
        {/* Toolbar: the flow selection (type → subtype → checklist) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back-to-settings"
          >
            <ChevronDown className="mr-1 h-4 w-4 rotate-90" />
            Settings
          </Button>
          <div className="mr-2 hidden h-5 w-px bg-slate-200 sm:block" />
          <ClipboardList className="h-4 w-4 text-[#711419]" />
          <span className="mr-3 text-sm font-semibold text-slate-900">Checklist Canvas</span>

          <Select value={visitType} onValueChange={(v) => { setVisitType(v as ChecklistVisitType); setSubtype(""); }}>
            <SelectTrigger className="h-9 w-[150px] text-sm" data-testid="select-visit-type">
              <SelectValue placeholder="Work order type" />
            </SelectTrigger>
            <SelectContent>
              {checklistVisitTypeEnum.map((type) => (
                <SelectItem key={type} value={type}>{VISIT_TYPE_LABELS[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ChevronRight className="h-4 w-4 text-slate-300" />

          <Select value={subtype} onValueChange={setSubtype} disabled={!visitType}>
            <SelectTrigger className="h-9 w-[170px] text-sm" data-testid="select-subtype">
              <SelectValue placeholder="Subtype" />
            </SelectTrigger>
            <SelectContent>
              {subtypesForVisitType.length > 0 ? (
                subtypesForVisitType.map((s) => (
                  <SelectItem key={s.id} value={s.subtype}>{s.subtype}</SelectItem>
                ))
              ) : (
                <SelectItem value="Other">Other</SelectItem>
              )}
            </SelectContent>
          </Select>

          {visitType && subtype && (
            <>
              <ChevronRight className="h-4 w-4 text-slate-300" />
              <Select
                value={checklistId || "__none__"}
                onValueChange={(v) => (v === "__new__" ? openNewChecklist() : setChecklistId(v))}
              >
                <SelectTrigger className="h-9 w-[210px] text-sm" data-testid="select-checklist">
                  <SelectValue placeholder="Checklist" />
                </SelectTrigger>
                <SelectContent>
                  {comboChecklists.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{!c.isActive ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                  {comboChecklists.length === 0 && (
                    <SelectItem value="__none__" disabled>No checklists yet</SelectItem>
                  )}
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-1.5 text-[#711419]"><Plus className="h-3.5 w-3.5" /> New checklist…</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {checklist && (
            <div className="ml-auto flex items-center gap-1.5">
              {!checklist.isActive && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Inactive</span>
              )}
              <Button variant="outline" size="sm" className="h-8" onClick={openEditChecklist} data-testid="button-edit-checklist">
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowDeleteChecklist(true)}
                data-testid="button-delete-checklist"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div
          className="relative flex-1 overflow-auto bg-slate-50"
          style={{
            backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          data-testid="checklist-canvas"
        >
          {!visitType || !subtype ? (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 px-10 py-8 text-center backdrop-blur-sm">
                <ClipboardList className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Start your flow</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Pick a work order type and subtype above to open its checklist canvas.
                </p>
              </div>
            </div>
          ) : !checklist ? (
            <div className="flex h-full items-center justify-center">
              <button
                onClick={openNewChecklist}
                className="rounded-2xl border-2 border-dashed border-[#711419]/40 bg-white/70 px-10 py-8 text-center backdrop-blur-sm transition-colors hover:border-[#711419] hover:bg-white"
                data-testid="button-create-first-checklist"
              >
                <Plus className="mx-auto mb-3 h-8 w-8 text-[#711419]" />
                <p className="text-sm font-semibold text-slate-900">
                  Create the {VISIT_TYPE_LABELS[visitType as ChecklistVisitType]} · {subtype} checklist
                </p>
                <p className="mt-1 text-xs text-muted-foreground">A blank canvas — add steps and photo steps.</p>
              </button>
            </div>
          ) : (
            <div
              ref={contentRef}
              className={`relative flex min-h-full w-max min-w-full items-start gap-28 px-12 py-10 ${dragLink ? "select-none" : ""}`}
              onPointerMove={moveLinkDrag}
              onPointerUp={endLinkDrag}
              onPointerCancel={endLinkDrag}
            >
              {/* Arrows (photo step → checklist step) */}
              <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full">
                <defs>
                  <marker id="arrowhead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                    <path d="M 0 0 L 8 4.5 L 0 9 z" fill={MAROON} />
                  </marker>
                  <marker id="arrowhead-live" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                    <path d="M 0 0 L 8 4.5 L 0 9 z" fill="#b45309" />
                  </marker>
                </defs>
                {links.map((l) => (
                  <path
                    key={`${l.photoId}-${l.stepId}`}
                    d={curve(l.from, l.to)}
                    fill="none"
                    stroke={MAROON}
                    strokeWidth={2}
                    strokeOpacity={0.55}
                    markerEnd="url(#arrowhead)"
                  />
                ))}
                {dragLink && (
                  <path
                    d={curve(dragLink.from, dragLink.to)}
                    fill="none"
                    stroke="#b45309"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    markerEnd="url(#arrowhead-live)"
                  />
                )}
              </svg>

              {/* Main flow: the checklist steps */}
              <div className="relative z-10 flex w-[380px] shrink-0 flex-col items-center">
                <div className="flex items-center gap-2 rounded-full bg-[#711419] px-5 py-2 text-sm font-semibold text-white shadow-md" data-testid="flow-start-node">
                  <Flag className="h-4 w-4" />
                  {VISIT_TYPE_LABELS[visitType as ChecklistVisitType]} · {subtype}
                </div>

                {steps.map((q, i) => (
                  <div key={q.id} className="flex w-full flex-col items-center">
                    <div className="h-7 w-px bg-slate-300" />
                    <div
                      ref={(el) => { if (el) stepRefs.current.set(q.id, el); else stepRefs.current.delete(q.id); }}
                      className={`group w-full rounded-xl border bg-white p-4 shadow-sm transition-all ${
                        hoverStepId === q.id
                          ? "border-amber-500 ring-2 ring-amber-400/60"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      data-testid={`step-node-${q.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#711419] text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug text-slate-900">{q.question}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
                              {QUESTION_TYPE_ICONS[q.questionType]}
                              {QUESTION_TYPE_LABELS[q.questionType]}
                            </span>
                            {q.isRequired && (
                              <span className="rounded-md bg-[#711419]/10 px-1.5 py-0.5 font-semibold text-[#711419]">Required</span>
                            )}
                            {q.questionType === "select" && q.options && <span>{q.options.length} options</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            className="rounded p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            disabled={i === 0}
                            onClick={() => moveStep.mutate({ a: q, b: steps[i - 1] })}
                            data-testid={`step-up-${q.id}`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            disabled={i === steps.length - 1}
                            onClick={() => moveStep.mutate({ a: q, b: steps[i + 1] })}
                            data-testid={`step-down-${q.id}`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            className="rounded p-1 text-slate-400 hover:text-slate-800"
                            onClick={() => openEditStep(q)}
                            data-testid={`step-edit-${q.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-slate-400 hover:text-red-600"
                            onClick={() => setDeletingStep(q)}
                            data-testid={`step-delete-${q.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="h-7 w-px bg-slate-300" />
                <button
                  onClick={openNewStep}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 py-3.5 text-sm font-medium text-slate-500 transition-colors hover:border-[#711419] hover:text-[#711419]"
                  data-testid="button-add-step"
                >
                  <Plus className="h-4 w-4" /> Add step
                </button>
              </div>

              {/* Photo lane: required image steps */}
              <div className="relative z-10 flex w-[300px] shrink-0 flex-col gap-3 pt-1">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Camera className="h-4 w-4 text-[#711419]" /> Photo steps
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Drag a card's <span className="font-semibold">●</span> handle onto a step to require that photo there.
                  </p>
                </div>

                {photoSteps.map((ps) => (
                  <div
                    key={ps.id}
                    ref={(el) => { if (el) photoRefs.current.set(ps.id, el); else photoRefs.current.delete(ps.id); }}
                    className="group relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-colors hover:border-slate-300"
                    data-testid={`photo-node-${ps.id}`}
                  >
                    {/* Link handle */}
                    <button
                      onPointerDown={(e) => startLinkDrag(ps.id, e)}
                      className="absolute -left-2.5 top-1/2 z-20 h-5 w-5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-white bg-[#711419] shadow transition-transform hover:scale-125"
                      style={{ touchAction: "none" }}
                      title="Drag onto a step to link"
                      data-testid={`photo-handle-${ps.id}`}
                    />
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#711419]/10 text-[#711419]">
                        <Camera className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-slate-900">{ps.label}</p>
                        {ps.instructions && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{ps.instructions}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {ps.isRequired && (
                            <span className="rounded-md bg-[#711419]/10 px-1.5 py-0.5 font-semibold text-[#711419]">Required</span>
                          )}
                          {ps.linkedQuestionId && stepNumberById.has(ps.linkedQuestionId) ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                              → Step {stepNumberById.get(ps.linkedQuestionId)}
                              <button
                                onClick={() => setPhotoLink.mutate({ photoId: ps.id, questionId: null })}
                                className="ml-0.5 text-amber-500 hover:text-amber-800"
                                title="Unlink"
                                data-testid={`photo-unlink-${ps.id}`}
                              >
                                <Unlink className="h-3 w-3" />
                              </button>
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500">Whole visit</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="rounded p-1 text-slate-400 hover:text-slate-800"
                          onClick={() => openEditPhoto(ps)}
                          data-testid={`photo-edit-${ps.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-slate-400 hover:text-red-600"
                          onClick={() => setDeletingPhoto(ps)}
                          data-testid={`photo-delete-${ps.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={openNewPhoto}
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-[#711419] hover:text-[#711419]"
                  data-testid="button-add-photo-step"
                >
                  <Camera className="h-4 w-4" /> Add photo step
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create checklist */}
      <Dialog open={showCreateChecklist} onOpenChange={setShowCreateChecklist}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New checklist</DialogTitle>
            <DialogDescription>
              For {visitType ? VISIT_TYPE_LABELS[visitType as ChecklistVisitType] : ""} · {subtype}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={checklistForm.name}
                onChange={(e) => setChecklistForm({ ...checklistForm, name: e.target.value })}
                data-testid="input-checklist-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={checklistForm.description}
                onChange={(e) => setChecklistForm({ ...checklistForm, description: e.target.value })}
                data-testid="input-checklist-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateChecklist(false)}>Cancel</Button>
            <Button
              onClick={() => createChecklist.mutate()}
              disabled={!checklistForm.name || createChecklist.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-save-checklist"
            >
              {createChecklist.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit checklist */}
      <Dialog open={showEditChecklist} onOpenChange={setShowEditChecklist}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={checklistForm.name}
                onChange={(e) => setChecklistForm({ ...checklistForm, name: e.target.value })}
                data-testid="input-edit-checklist-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={checklistForm.description}
                onChange={(e) => setChecklistForm({ ...checklistForm, description: e.target.value })}
                data-testid="input-edit-checklist-description"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={checklistForm.isActive}
                onCheckedChange={(checked) => setChecklistForm({ ...checklistForm, isActive: checked as boolean })}
                data-testid="checkbox-checklist-active"
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditChecklist(false)}>Cancel</Button>
            <Button
              onClick={() => updateChecklist.mutate()}
              disabled={!checklistForm.name || updateChecklist.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-update-checklist"
            >
              {updateChecklist.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step dialog */}
      <Dialog open={stepDialogOpen} onOpenChange={(o) => { setStepDialogOpen(o); if (!o) setEditingStep(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStep ? "Edit step" : "Add step"}</DialogTitle>
            <DialogDescription>
              {editingStep ? "Update this checklist step." : "A new step at the end of the flow."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Step / question</Label>
              <Input
                placeholder="e.g., Check capacitor"
                value={stepForm.question}
                onChange={(e) => setStepForm({ ...stepForm, question: e.target.value })}
                data-testid="input-question-text"
              />
            </div>
            <div className="space-y-2">
              <Label>Answer type</Label>
              <Select
                value={stepForm.questionType}
                onValueChange={(v) => setStepForm({ ...stepForm, questionType: v as ChecklistQuestionType })}
              >
                <SelectTrigger data-testid="select-question-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {checklistQuestionTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        {QUESTION_TYPE_ICONS[type]}
                        {QUESTION_TYPE_LABELS[type]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {stepForm.questionType === "select" && (
              <div className="space-y-2">
                <Label>Options (comma-separated)</Label>
                <Input
                  placeholder="Option 1, Option 2, Option 3"
                  value={stepForm.options}
                  onChange={(e) => setStepForm({ ...stepForm, options: e.target.value })}
                  data-testid="input-question-options"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Help text (optional)</Label>
              <Input
                placeholder="Guidance shown to the tech…"
                value={stepForm.helpText}
                onChange={(e) => setStepForm({ ...stepForm, helpText: e.target.value })}
                data-testid="input-question-help-text"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="step-required"
                checked={stepForm.isRequired}
                onCheckedChange={(checked) => setStepForm({ ...stepForm, isRequired: checked as boolean })}
                data-testid="checkbox-question-required"
              />
              <Label htmlFor="step-required">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStepDialogOpen(false); setEditingStep(null); }}>Cancel</Button>
            <Button
              onClick={() => saveStep.mutate()}
              disabled={!stepForm.question || saveStep.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-save-question"
            >
              {saveStep.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingStep ? "Save" : "Add step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo step dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={(o) => { setPhotoDialogOpen(o); if (!o) setEditingPhoto(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPhoto ? "Edit photo step" : "Add photo step"}</DialogTitle>
            <DialogDescription>
              A photo the tech must capture. Link it to a step by dragging its handle on the canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>What to photograph</Label>
              <Input
                placeholder="e.g., Capacitor reading"
                value={photoForm.label}
                onChange={(e) => setPhotoForm({ ...photoForm, label: e.target.value })}
                data-testid="input-photo-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions (optional)</Label>
              <Textarea
                placeholder="Angle, what should be visible…"
                value={photoForm.instructions}
                onChange={(e) => setPhotoForm({ ...photoForm, instructions: e.target.value })}
                data-testid="input-photo-instructions"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="photo-required"
                checked={photoForm.isRequired}
                onCheckedChange={(checked) => setPhotoForm({ ...photoForm, isRequired: checked as boolean })}
                data-testid="checkbox-photo-required"
              />
              <Label htmlFor="photo-required">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPhotoDialogOpen(false); setEditingPhoto(null); }}>Cancel</Button>
            <Button
              onClick={() => savePhoto.mutate()}
              disabled={!photoForm.label || savePhoto.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-save-photo-step"
            >
              {savePhoto.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPhoto ? "Save" : "Add photo step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirms */}
      <AlertDialog open={showDeleteChecklist} onOpenChange={setShowDeleteChecklist}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{checklist?.name}", all its steps, and its photo steps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteChecklist.mutate()}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-checklist"
            >
              {deleteChecklist.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingStep} onOpenChange={(o) => !o && setDeletingStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete step?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingStep?.question}" will be removed. Photo steps linked to it become whole-visit photos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingStep && deleteStep.mutate(deletingStep.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-question"
            >
              {deleteStep.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingPhoto} onOpenChange={(o) => !o && setDeletingPhoto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete photo step?</AlertDialogTitle>
            <AlertDialogDescription>"{deletingPhoto?.label}" will be removed from this checklist.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPhoto && deletePhoto.mutate(deletingPhoto.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-photo"
            >
              {deletePhoto.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
