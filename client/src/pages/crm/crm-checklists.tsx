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
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle,
  Type,
  Hash,
  List,
  ListChecks,
  Camera,
  GripVertical,
  Unlink,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
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
  multi_select: "Multi-select",
};

const QUESTION_TYPE_ICONS: Record<ChecklistQuestionType, React.ReactNode> = {
  yes_no: <CheckCircle className="h-3 w-3" />,
  text: <Type className="h-3 w-3" />,
  number: <Hash className="h-3 w-3" />,
  select: <List className="h-3 w-3" />,
  multi_select: <ListChecks className="h-3 w-3" />,
};

const MAROON = "#711419";
const FLOW_W = 280;
const PHOTO_W = 220;
const WORLD_W_MIN = 6000;
const DEFAULT_FLOW: XY = { x: WORLD_W_MIN / 2 - FLOW_W / 2 - 160, y: 120 };
const DRAG_THRESHOLD = 5;

type XY = { x: number; y: number };

type DragState =
  | { kind: "pan"; sx: number; sy: number; sl: number; st: number }
  | { kind: "flow"; ox: number; oy: number }
  | { kind: "photo-pending"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: "photo"; id: string; ox: number; oy: number }
  | { kind: "step-pending"; id: string; sx: number; sy: number; grabY: number; h: number }
  | { kind: "reorder"; id: string; grabY: number; h: number }
  | { kind: "panel-pending"; id: string; sx: number; sy: number }
  | { kind: "panel"; id: string }
  | { kind: "link"; stepId: string };

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
    section: "",
  });
  const [renameSec, setRenameSec] = useState<{ old: string; name: string } | null>(null);

  // Start-flow dialog (type -> subtype -> checklist, asked when starting a flow)
  const [startOpen, setStartOpen] = useState(false);
  const [sVT, setSVT] = useState<ChecklistVisitType | "">("");
  const [sST, setSST] = useState("");
  const [sPick, setSPick] = useState("__new__");
  const [sName, setSName] = useState("");

  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<ChecklistPhotoStep | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<ChecklistPhotoStep | null>(null);
  const [photoForm, setPhotoForm] = useState({ label: "", instructions: "", isRequired: true });

  // Canvas state
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [flowPos, setFlowPos] = useState<XY>(DEFAULT_FLOW);
  const [photoPos, setPhotoPos] = useState<Record<string, XY>>({});
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [reorder, setReorder] = useState<{ id: string; ghostY: number; gap: number; h: number; sectionKey: string | null } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [layersOpen, setLayersOpen] = useState(true);
  const [panelDragId, setPanelDragId] = useState<string | null>(null);
  const [panelDrop, setPanelDrop] = useState<{ key: string | null; index: number } | null>(null);
  const [flashStepId, setFlashStepId] = useState<string | null>(null);
  // Optimistic section moves from the layers panel until the server catches up
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, string | null>>({});
  const [dragLink, setDragLink] = useState<{ stepId: string; from: XY; to: XY } | null>(null);
  const [hoverPhotoId, setHoverPhotoId] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const flowBlockRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef(new Map<string, HTMLDivElement>());
  const photoRefs = useRef(new Map<string, HTMLDivElement>());
  const stepGeom = useRef(new Map<string, { top: number; h: number }>());
  const sectionHeaderRefs = useRef(new Map<string, HTMLDivElement>());
  const panelSecRefs = useRef(new Map<string, HTMLDivElement>());
  const panelStepRefs = useRef(new Map<string, HTMLDivElement>());
  const sectionGeom = useRef(new Map<string, { top: number; h: number }>());
  const photoGeom = useRef(new Map<string, { w: number; h: number }>());
  const dragRef = useRef<DragState | null>(null);
  const flowPosRef = useRef(flowPos);
  flowPosRef.current = flowPos;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [arrowTick, setArrowTick] = useState(0);

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

  const serverSteps = useMemo(
    () => (checklist ? [...checklist.questions].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [checklist],
  );
  // Optimistic ordering after a drag-reorder, until the server catches up
  const orderedSteps = useMemo(() => {
    if (!localOrder) return serverSteps;
    const byId = new Map(serverSteps.map((s) => [s.id, s]));
    if (localOrder.length !== serverSteps.length || localOrder.some((id) => !byId.has(id))) return serverSteps;
    return localOrder.map((id) => byId.get(id)!);
  }, [serverSteps, localOrder]);

  const photoSteps = useMemo(
    () => (checklist?.photoSteps ? [...checklist.photoSteps].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [checklist],
  );
  // Steps grouped into sections (phases) by their section label, groups in
  // first-occurrence order, steps within a group in sort order.
  const effectiveSteps = useMemo(
    () =>
      orderedSteps.map((q) =>
        sectionOverrides[q.id] !== undefined ? ({ ...q, section: sectionOverrides[q.id] } as ChecklistQuestion) : q,
      ),
    [orderedSteps, sectionOverrides],
  );
  const sections = useMemo(() => {
    const out: Array<{ key: string; name: string | null; steps: ChecklistQuestion[] }> = [];
    const idx = new Map<string, number>();
    for (const q of effectiveSteps) {
      const name = q.section?.trim() || null;
      const key = name ?? "__ungrouped__";
      if (!idx.has(key)) {
        idx.set(key, out.length);
        out.push({ key, name, steps: [] });
      }
      out[idx.get(key)!].steps.push(q);
    }
    return out;
  }, [effectiveSteps]);
  const sectionNames = useMemo(() => sections.filter((x) => x.name).map((x) => x.name!), [sections]);
  const displaySteps = useMemo(() => sections.flatMap((x) => x.steps), [sections]);
  const stepById = useMemo(() => new Map(effectiveSteps.map((q) => [q.id, q])), [effectiveSteps]);
  const stepNumberById = useMemo(() => {
    const m = new Map<string, number>();
    displaySteps.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [displaySteps]);

  // Auto-select the first checklist when the type/subtype combo changes
  useEffect(() => {
    if (!visitType || !subtype) {
      setChecklistId("");
      return;
    }
    if (!checklistId && comboChecklists.length > 0) {
      setChecklistId(comboChecklists[0].id);
    }
  }, [visitType, subtype, comboChecklists, checklistId]);

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  // Load the saved canvas layout for this checklist (positions are per-device)
  useEffect(() => {
    setLocalOrder(null);
    if (!checklistId) return;
    try {
      const raw = localStorage.getItem(`checklist-canvas:${checklistId}`);
      if (raw) {
        const layout = JSON.parse(raw);
        setFlowPos(layout.flow ?? DEFAULT_FLOW);
        setPhotoPos(layout.photos ?? {});
        setZoom(layout.zoom ?? 1);
        setCollapsedSections(layout.collapsedSections ?? {});
        if (layout.layersOpen !== undefined) setLayersOpen(!!layout.layersOpen);
        setSectionOverrides({});
        return;
      }
    } catch {}
    setFlowPos(DEFAULT_FLOW);
    setPhotoPos({});
    setCollapsedSections({});
    setSectionOverrides({});
  }, [checklistId]);

  // Persist layout
  useEffect(() => {
    if (!checklistId) return;
    try {
      localStorage.setItem(`checklist-canvas:${checklistId}`, JSON.stringify({ flow: flowPos, photos: photoPos, zoom, collapsedSections, layersOpen }));
    } catch {}
  }, [flowPos, photoPos, zoom, collapsedSections, layersOpen, checklistId]);

  // Give new photo steps a default spot to the right of the flow
  useEffect(() => {
    if (photoSteps.length === 0) return;
    setPhotoPos((prev) => {
      let changed = false;
      const next = { ...prev };
      let slot = 0;
      for (const ps of photoSteps) {
        if (!next[ps.id]) {
          next[ps.id] = {
            x: flowPosRef.current.x + FLOW_W + 240,
            y: flowPosRef.current.y + 30 + slot * 120,
          };
          changed = true;
        }
        slot++;
      }
      return changed ? next : prev;
    });
  }, [photoSteps]);

  // Center the viewport on the flow when a checklist opens
  useEffect(() => {
    if (!checklistId) return;
    requestAnimationFrame(() => {
      const vp = viewportRef.current;
      if (!vp) return;
      const z = zoomRef.current;
      vp.scrollTo({
        left: Math.max(0, (flowPosRef.current.x + FLOW_W / 2 + 120) * z - vp.clientWidth / 2),
        top: Math.max(0, (flowPosRef.current.y - 70) * z),
      });
    });
  }, [checklistId]);

  // Space bar = pan mode
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName) || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Measure node geometry (arrow anchor points) after every layout change
  const measureGeom = () => {
    const flowEl = flowBlockRef.current;
    if (!flowEl) return;
    const fRect = flowEl.getBoundingClientRect();
    const z = zoomRef.current;
    stepGeom.current.clear();
    for (const [id, el] of Array.from(stepRefs.current.entries())) {
      const r = el.getBoundingClientRect();
      stepGeom.current.set(id, { top: (r.top - fRect.top) / z, h: r.height / z });
    }
    sectionGeom.current.clear();
    for (const [name, el] of Array.from(sectionHeaderRefs.current.entries())) {
      const r = el.getBoundingClientRect();
      sectionGeom.current.set(name, { top: (r.top - fRect.top) / z, h: r.height / z });
    }
    photoGeom.current.clear();
    for (const [id, el] of Array.from(photoRefs.current.entries())) {
      photoGeom.current.set(id, { w: el.offsetWidth, h: el.offsetHeight });
    }
    setArrowTick((t) => t + 1);
  };
  const measureRef = useRef(measureGeom);
  measureRef.current = measureGeom;
  useLayoutEffect(() => {
    measureRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedSteps, photoSteps, checklist?.id, reorder !== null, collapsedSections]);

  // Collapse/expand animates (grid-rows 0fr <-> 1fr); re-anchor the arrows
  // mid-animation and once it settles.
  const toggleSection = (name: string) => {
    setCollapsedSections((prev) => ({ ...prev, [name]: !prev[name] }));
    window.setTimeout(() => measureRef.current(), 160);
    window.setTimeout(() => measureRef.current(), 340);
  };

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
        section: stepForm.section.trim() || null,
        options:
          (stepForm.questionType === "select" || stepForm.questionType === "multi_select") && stepForm.options
            ? stepForm.options.split(",").map((o) => o.trim()).filter(Boolean)
            : null,
        ...(editingStep ? {} : { sortOrder: (serverSteps[serverSteps.length - 1]?.sortOrder ?? 0) + 1 }),
      };
      if (editingStep) {
        return apiRequest("PUT", `/api/crm/checklists/questions/${editingStep.id}`, data);
      }
      return apiRequest("POST", `/api/crm/checklists/${checklistId}/questions`, data);
    },
    onSuccess: () => {
      invalidate();
      setStepDialogOpen(false);
      if (editingStep) {
        setSectionOverrides((prev) => {
          const next = { ...prev };
          delete next[editingStep.id];
          return next;
        });
      }
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

  const reorderSteps = useMutation({
    mutationFn: async (orderedIds: string[]) =>
      apiRequest("POST", `/api/crm/checklists/${checklistId}/questions/reorder`, { orderedIds }),
    onSuccess: invalidate,
    onError,
  });

  const renameSection = useMutation({
    mutationFn: async () => {
      if (!renameSec) return;
      const newName = renameSec.name.trim() || null;
      const affected = orderedSteps.filter((q) => (q.section?.trim() || null) === renameSec.old);
      for (const q of affected) {
        await apiRequest("PUT", `/api/crm/checklists/questions/${q.id}`, { section: newName });
      }
    },
    onSuccess: () => {
      invalidate();
      setRenameSec(null);
      toast({ title: "Section updated" });
    },
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

  // ----- canvas pointer logic -----
  const worldPoint = (e: { clientX: number; clientY: number }): XY => {
    const r = worldRef.current!.getBoundingClientRect();
    const z = zoomRef.current;
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  };

  // Zoom about the viewport center so the content doesn't jump
  const applyZoom = (next: number) => {
    next = Math.min(1.5, Math.max(0.4, Math.round(next * 10) / 10));
    const vp = viewportRef.current;
    const cur = zoomRef.current;
    if (!vp || next === cur) return;
    const cx = vp.scrollLeft + vp.clientWidth / 2;
    const cy = vp.scrollTop + vp.clientHeight / 2;
    setZoom(next);
    requestAnimationFrame(() => {
      vp.scrollLeft = (cx / cur) * next - vp.clientWidth / 2;
      vp.scrollTop = (cy / cur) * next - vp.clientHeight / 2;
    });
  };

  const centerView = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    const z = zoomRef.current;
    const fp = flowPosRef.current;
    vp.scrollTo({
      left: Math.max(0, (fp.x + FLOW_W / 2 + 120) * z - vp.clientWidth / 2),
      top: Math.max(0, (fp.y - 70) * z),
      behavior: "smooth",
    });
  };

  const stepHandlePoint = (stepId: string): XY => {
    const sg = stepGeom.current.get(stepId);
    const fp = flowPosRef.current;
    return { x: fp.x + FLOW_W + 3, y: fp.y + (sg ? sg.top + sg.h / 2 : 0) };
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const bg = e.target === worldRef.current || e.target === viewportRef.current;
    if (!spaceHeld && !bg) return;
    const vp = viewportRef.current!;
    dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop };
    vp.setPointerCapture(e.pointerId);
    setPanning(true);
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (st?.kind !== "pan") return;
    const vp = viewportRef.current!;
    vp.scrollLeft = st.sl - (e.clientX - st.sx);
    vp.scrollTop = st.st - (e.clientY - st.sy);
  };

  const onCanvasPointerUp = () => {
    if (dragRef.current?.kind === "pan") dragRef.current = null;
    setPanning(false);
  };

  const startFlowDrag = (e: React.PointerEvent) => {
    if (spaceHeld) return;
    e.preventDefault();
    e.stopPropagation();
    const p = worldPoint(e);
    dragRef.current = { kind: "flow", ox: p.x - flowPos.x, oy: p.y - flowPos.y };
  };

  const startPhotoDrag = (ps: ChecklistPhotoStep, e: React.PointerEvent) => {
    if (spaceHeld) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    const p = worldPoint(e);
    const pos = photoPos[ps.id] ?? { x: 0, y: 0 };
    dragRef.current = { kind: "photo-pending", id: ps.id, sx: e.clientX, sy: e.clientY, ox: p.x - pos.x, oy: p.y - pos.y };
  };

  const startStepDrag = (q: ChecklistQuestion, e: React.PointerEvent) => {
    if (spaceHeld) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    const el = stepRefs.current.get(q.id);
    const h = el?.offsetHeight ?? 64;
    const grabY = el ? (e.clientY - el.getBoundingClientRect().top) / zoomRef.current : h / 2;
    dragRef.current = { kind: "step-pending", id: q.id, sx: e.clientX, sy: e.clientY, grabY, h };
  };

  const startLinkDrag = (stepId: string, e: React.PointerEvent) => {
    if (spaceHeld) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind: "link", stepId };
    const from = stepHandlePoint(stepId);
    setDragLink({ stepId, from, to: worldPoint(e) });
  };

  const scrollToStep = (id: string) => {
    const vp = viewportRef.current;
    const sr = stepRectOf(id);
    if (!vp || !sr) return;
    const z = zoomRef.current;
    vp.scrollTo({
      left: Math.max(0, (sr.x + sr.w / 2) * z - vp.clientWidth / 2),
      top: Math.max(0, (sr.y + sr.h / 2) * z - vp.clientHeight / 2),
      behavior: "smooth",
    });
    setFlashStepId(id);
    window.setTimeout(() => setFlashStepId((cur) => (cur === id ? null : cur)), 1400);
  };

  const scrollToSection = (name: string) => {
    const vp = viewportRef.current;
    const sg = sectionGeom.current.get(name);
    if (!vp || !sg) return;
    const z = zoomRef.current;
    vp.scrollTo({
      left: Math.max(0, (flowPos.x + FLOW_W / 2) * z - vp.clientWidth / 2),
      top: Math.max(0, (flowPos.y + sg.top) * z - 120),
      behavior: "smooth",
    });
  };

  const startPanelDrag = (q: ChecklistQuestion, e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = { kind: "panel-pending", id: q.id, sx: e.clientX, sy: e.clientY };
  };

  // Nearest insertion slot in the layers panel (slots exclude the dragged row)
  const computePanelDrop = (clientY: number, draggedId: string) => {
    let best: { key: string | null; index: number } | null = null;
    let bestDist = Infinity;
    for (const sec of sections) {
      const slots: Array<{ index: number; y: number }> = [];
      const headerEl = panelSecRefs.current.get(sec.key);
      if (headerEl) slots.push({ index: 0, y: headerEl.getBoundingClientRect().bottom });
      const secCollapsed = !!sec.name && !!collapsedSections[sec.name];
      let vis = 0;
      for (const q of secCollapsed ? [] : sec.steps) {
        if (q.id === draggedId) continue;
        const el = panelStepRefs.current.get(q.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (slots.length === 0 && vis === 0) slots.push({ index: 0, y: r.top });
        slots.push({ index: vis + 1, y: r.bottom });
        vis++;
      }
      for (const sl of slots) {
        const d = Math.abs(clientY - sl.y);
        if (d < bestDist) {
          bestDist = d;
          best = { key: sec.name ?? null, index: sl.index };
        }
      }
    }
    return best;
  };

  const applyPanelMove = (draggedId: string, targetKey: string | null, targetIndex: number) => {
    const dragged = stepById.get(draggedId);
    if (!dragged) return;
    const curKey = dragged.section?.trim() || null;
    const secList = sections.map((sec) => ({
      key: sec.name ?? null,
      ids: sec.steps.map((q) => q.id).filter((id) => id !== draggedId),
    }));
    const to = secList.find((x) => x.key === targetKey);
    if (!to) return;
    const idx = Math.max(0, Math.min(targetIndex, to.ids.length));
    to.ids.splice(idx, 0, draggedId);
    const flat = secList.flatMap((x) => x.ids);
    setLocalOrder(flat);
    setFlashStepId(draggedId);
    window.setTimeout(() => setFlashStepId((cur) => (cur === draggedId ? null : cur)), 1400);
    if (targetKey !== curKey) {
      setSectionOverrides((prev) => ({ ...prev, [draggedId]: targetKey }));
      apiRequest("PUT", `/api/crm/checklists/questions/${draggedId}`, { section: targetKey })
        .then(() => reorderSteps.mutate(flat))
        .catch((e: any) => onError(e));
    } else {
      reorderSteps.mutate(flat);
    }
  };

  // Reorder happens within the step's own section; moving a step to a
  // different section is done from its edit dialog or the layers panel.
  const computeGap = (clientY: number, draggedId: string) => {
    const dKey = stepById.get(draggedId)?.section?.trim() || null;
    const centers: number[] = [];
    for (const q of effectiveSteps) {
      if (q.id === draggedId) continue;
      if ((q.section?.trim() || null) !== dKey) continue;
      const el = stepRefs.current.get(q.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      centers.push(r.top + r.height / 2);
    }
    let gap = 0;
    for (const c of centers) if (clientY > c) gap++;
    return gap;
  };

  const onNodePointerMove = (e: { clientX: number; clientY: number }) => {
    const st = dragRef.current;
    if (!st) return;
    switch (st.kind) {
      case "flow": {
        const p = worldPoint(e);
        setFlowPos({ x: Math.max(0, p.x - st.ox), y: Math.max(0, p.y - st.oy) });
        break;
      }
      case "photo-pending": {
        if (Math.hypot(e.clientX - st.sx, e.clientY - st.sy) > DRAG_THRESHOLD) {
          dragRef.current = { kind: "photo", id: st.id, ox: st.ox, oy: st.oy };
        }
        break;
      }
      case "photo": {
        const p = worldPoint(e);
        setPhotoPos((prev) => ({ ...prev, [st.id]: { x: Math.max(0, p.x - st.ox), y: Math.max(0, p.y - st.oy) } }));
        break;
      }
      case "step-pending": {
        if (Math.hypot(e.clientX - st.sx, e.clientY - st.sy) > DRAG_THRESHOLD) {
          dragRef.current = { kind: "reorder", id: st.id, grabY: st.grabY, h: st.h };
          setReorder({
            id: st.id,
            ghostY: worldPoint(e).y - st.grabY,
            gap: computeGap(e.clientY, st.id),
            h: st.h,
            sectionKey: stepById.get(st.id)?.section?.trim() || null,
          });
        }
        break;
      }
      case "reorder": {
        setReorder((prev) =>
          prev ? { ...prev, ghostY: worldPoint(e).y - st.grabY, gap: computeGap(e.clientY, st.id) } : prev,
        );
        break;
      }
      case "panel-pending": {
        if (Math.hypot(e.clientX - st.sx, e.clientY - st.sy) > DRAG_THRESHOLD) {
          dragRef.current = { kind: "panel", id: st.id };
          setPanelDragId(st.id);
          setPanelDrop(computePanelDrop(e.clientY, st.id));
        }
        break;
      }
      case "panel": {
        setPanelDrop(computePanelDrop(e.clientY, st.id));
        break;
      }
      case "link": {
        setDragLink((prev) => (prev ? { ...prev, to: worldPoint(e) } : prev));
        let hover: string | null = null;
        for (const [id, el] of Array.from(photoRefs.current.entries())) {
          const r = el.getBoundingClientRect();
          if (e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) {
            hover = id;
            break;
          }
        }
        setHoverPhotoId(hover);
        break;
      }
    }
  };

  const onNodePointerUp = () => {
    const st = dragRef.current;
    dragRef.current = null;
    if (!st) return;
    switch (st.kind) {
      case "photo-pending": {
        const ps = photoSteps.find((p) => p.id === st.id);
        if (ps) openEditPhoto(ps);
        break;
      }
      case "step-pending": {
        const q = orderedSteps.find((s) => s.id === st.id);
        if (q) openEditStep(q);
        break;
      }
      case "reorder": {
        if (reorder) {
          const flat: string[] = [];
          for (const sec of sections) {
            if ((sec.name ?? null) === reorder.sectionKey) {
              const rest = sec.steps.filter((q) => q.id !== reorder.id).map((q) => q.id);
              rest.splice(reorder.gap, 0, reorder.id);
              flat.push(...rest);
            } else {
              flat.push(...sec.steps.map((q) => q.id));
            }
          }
          setLocalOrder(flat);
          reorderSteps.mutate(flat);
        }
        setReorder(null);
        break;
      }
      case "panel-pending": {
        scrollToStep(st.id);
        break;
      }
      case "panel": {
        if (panelDrop) applyPanelMove(st.id, panelDrop.key, panelDrop.index);
        setPanelDragId(null);
        setPanelDrop(null);
        break;
      }
      case "link": {
        if (dragLink && hoverPhotoId) {
          setPhotoLink.mutate({ photoId: hoverPhotoId, questionId: dragLink.stepId });
        }
        setDragLink(null);
        setHoverPhotoId(null);
        break;
      }
    }
  };

  // Node drags are tracked at window level (a reorder unmounts the dragged
  // card, which would kill element-level pointer capture mid-drag). The
  // latest-ref pattern keeps the handlers' closures current.
  const moveRef = useRef(onNodePointerMove);
  moveRef.current = onNodePointerMove;
  const upRef = useRef(onNodePointerUp);
  upRef.current = onNodePointerUp;
  useEffect(() => {
    // Coalesce moves to one state update per frame — dragging stays smooth
    let raf = 0;
    let lastEv: PointerEvent | null = null;
    const move = (e: PointerEvent) => {
      if (!dragRef.current || dragRef.current.kind === "pan") return;
      lastEv = e;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (lastEv && dragRef.current && dragRef.current.kind !== "pan") moveRef.current(lastEv);
        });
      }
    };
    const up = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (dragRef.current && dragRef.current.kind !== "pan") upRef.current();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // ----- arrows -----
  // Anchor sides adapt to where the target sits relative to the step, so
  // arrows re-route naturally as cards are dragged around the canvas.
  type Rect = { x: number; y: number; w: number; h: number };
  const anchoredPath = (step: Rect, target: Rect) => {
    const sc = { x: step.x + step.w / 2, y: step.y + step.h / 2 };
    const tc = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
    const dx = tc.x - sc.x;
    const dy = tc.y - sc.y;
    let a: XY, b: XY, da: XY, db: XY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        a = { x: step.x + step.w + 2, y: sc.y };
        b = { x: target.x - 4, y: tc.y };
        da = { x: 1, y: 0 }; db = { x: -1, y: 0 };
      } else {
        a = { x: step.x - 2, y: sc.y };
        b = { x: target.x + target.w + 4, y: tc.y };
        da = { x: -1, y: 0 }; db = { x: 1, y: 0 };
      }
    } else if (dy >= 0) {
      a = { x: sc.x, y: step.y + step.h + 2 };
      b = { x: tc.x, y: target.y - 4 };
      da = { x: 0, y: 1 }; db = { x: 0, y: -1 };
    } else {
      a = { x: sc.x, y: step.y - 2 };
      b = { x: tc.x, y: target.y + target.h + 4 };
      da = { x: 0, y: -1 }; db = { x: 0, y: 1 };
    }
    const d = Math.max(36, Math.hypot(b.x - a.x, b.y - a.y) * 0.35);
    return `M ${a.x} ${a.y} C ${a.x + da.x * d} ${a.y + da.y * d}, ${b.x + db.x * d} ${b.y + db.y * d}, ${b.x} ${b.y}`;
  };

  const stepRectOf = (stepId: string): Rect | null => {
    const secName = stepById.get(stepId)?.section?.trim() || null;
    if (secName && collapsedSections[secName]) {
      const sg = sectionGeom.current.get(secName);
      if (!sg) return null;
      return { x: flowPos.x, y: flowPos.y + sg.top, w: FLOW_W, h: sg.h };
    }
    const sg = stepGeom.current.get(stepId);
    if (!sg) return null;
    return { x: flowPos.x, y: flowPos.y + sg.top, w: FLOW_W, h: sg.h };
  };

  const arrows = useMemo(() => {
    void arrowTick;
    const out: Array<{ id: string; d: string }> = [];
    for (const ps of photoSteps) {
      if (!ps.linkedQuestionId) continue;
      const sr = stepRectOf(ps.linkedQuestionId);
      const pp = photoPos[ps.id];
      const pg = photoGeom.current.get(ps.id);
      if (!sr || !pp || !pg) continue;
      out.push({ id: ps.id, d: anchoredPath(sr, { x: pp.x, y: pp.y, w: PHOTO_W, h: pg.h }) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoSteps, photoPos, flowPos, arrowTick, collapsedSections]);

  const worldSize = useMemo(() => {
    let w = WORLD_W_MIN;
    let h = Math.max(4000, flowPos.y + orderedSteps.length * 150 + 1000);
    for (const pos of Object.values(photoPos)) {
      w = Math.max(w, pos.x + PHOTO_W + 600);
      h = Math.max(h, pos.y + 600);
    }
    w = Math.max(w, flowPos.x + FLOW_W + 1200);
    return { w, h };
  }, [flowPos, photoPos, orderedSteps.length]);

  // ----- start-flow dialog -----
  const titleCase = (v: string) =>
    v.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  const openStartFlow = () => {
    setSVT(visitType || "");
    setSST(subtype || "");
    setSPick(checklistId || "__new__");
    setSName("");
    setStartOpen(true);
  };

  const sSubtypes = useMemo(
    () =>
      workOrderSubtypes
        .filter((x) => x.visitType === sVT)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [workOrderSubtypes, sVT],
  );
  const sCombo = useMemo(
    () =>
      checklists.filter(
        (c) => ((c as any).visitType || "SERVICE") === sVT && c.serviceType === sST,
      ),
    [checklists, sVT, sST],
  );

  const startFlow = useMutation({
    mutationFn: async () => {
      if (sPick === "__new__") {
        const res = await apiRequest("POST", "/api/crm/checklists", {
          name: sName.trim() || `${titleCase(sST)} Checklist`,
          description: null,
          visitType: sVT,
          serviceType: sST,
          isActive: true,
        });
        return res.json() as Promise<ServiceCallChecklist>;
      }
      return null;
    },
    onSuccess: (created) => {
      invalidate();
      setVisitType(sVT as ChecklistVisitType);
      setSubtype(sST);
      setChecklistId(created ? created.id : sPick);
      setStartOpen(false);
      if (created) toast({ title: "Checklist created" });
    },
    onError,
  });

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

  const openNewStep = (section = "") => {
    setEditingStep(null);
    setStepForm({ question: "", questionType: "yes_no", isRequired: false, options: "", helpText: "", section });
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
      section: q.section || "",
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

  const renderStepCard = (q: ChecklistQuestion, number: number, ghost = false) => (
    <div
      ref={ghost ? undefined : (el) => { if (el) stepRefs.current.set(q.id, el); else stepRefs.current.delete(q.id); }}
      onPointerDown={ghost ? undefined : (e) => startStepDrag(q, e)}
      className={`group relative w-full cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-colors ${
        ghost
          ? "rotate-1 border-[#711419]/50 shadow-xl"
          : flashStepId === q.id
            ? "border-[#711419]/60 ring-2 ring-[#711419]/35"
            : "border-slate-200 hover:border-slate-300"
      }`}
      style={{ touchAction: "none" }}
      data-testid={ghost ? undefined : `step-node-${q.id}`}
    >
      <div className="flex items-start gap-2.5 pr-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#711419] text-[10px] font-bold text-white">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug text-slate-900">{q.question}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1 py-0.5">
              {QUESTION_TYPE_ICONS[q.questionType]}
              {QUESTION_TYPE_LABELS[q.questionType]}
            </span>
            {q.isRequired && (
              <span className="rounded bg-[#711419]/10 px-1 py-0.5 font-semibold text-[#711419]">Required</span>
            )}
          </div>
        </div>
        {!ghost && (
          <button
            className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setDeletingStep(q); }}
            data-testid={`step-delete-${q.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Link handle: drag from the step onto a photo card */}
      {!ghost && (
        <button
          onPointerDown={(e) => startLinkDrag(q.id, e)}
          className={`absolute -right-2 top-1/2 z-20 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-white bg-[#711419] shadow transition-all hover:scale-125 ${
            dragLink?.stepId === q.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ touchAction: "none" }}
          title="Drag onto a photo step to require it here"
          data-testid={`step-handle-${q.id}`}
        />
      )}
    </div>
  );

  // Chain rendering: sections as collapsible phase headers, steps beneath,
  // with a gap placeholder while reordering (within the dragged section)
  const gapNode = (key: string) => (
    <div key={key} className="flex w-full flex-col items-center">
      <div className="h-6 w-px bg-slate-300" />
      <div style={{ height: reorder?.h ?? 64 }} className="w-full rounded-lg border-2 border-dashed border-[#711419]/40 bg-[#711419]/5" />
    </div>
  );
  const chainItems: React.ReactNode[] = [];
  sections.forEach((sec) => {
    const isCollapsed = !!sec.name && !!collapsedSections[sec.name];
    if (sec.name) {
      const requiredCount = sec.steps.filter((q) => q.isRequired).length;
      chainItems.push(
        <div key={`sec-${sec.key}`} className="flex w-full flex-col items-center">
          <div className="h-6 w-px bg-slate-300" />
          <div
            ref={(el) => {
              if (el) sectionHeaderRefs.current.set(sec.name!, el);
              else sectionHeaderRefs.current.delete(sec.name!);
            }}
            className={`group/sec flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 transition-colors ${
              isCollapsed ? "border-slate-300 bg-white shadow-sm" : "border-slate-300 bg-slate-100"
            }`}
            data-testid={`section-${sec.key}`}
          >
            <button
              onClick={() => toggleSection(sec.name!)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              data-testid={`section-toggle-${sec.key}`}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              />
              <span className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-600">{sec.name}</span>
              <span className="shrink-0 text-[11px] text-slate-400">
                {sec.steps.length} {sec.steps.length === 1 ? "step" : "steps"}
                {isCollapsed && requiredCount > 0 ? ` · ${requiredCount} req` : ""}
              </span>
            </button>
            <button
              onClick={() => setRenameSec({ old: sec.name!, name: sec.name! })}
              className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-slate-700 group-hover/sec:opacity-100"
              title="Rename section"
              data-testid={`section-rename-${sec.key}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => openNewStep(sec.name!)}
              className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-[#711419] group-hover/sec:opacity-100"
              title="Add step to this section"
              data-testid={`section-add-${sec.key}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>,
      );
    }
    const inReorder = !!reorder && reorder.sectionKey === (sec.name ?? null);
    const visible = inReorder ? sec.steps.filter((q) => q.id !== reorder!.id) : sec.steps;
    const stepNodes: React.ReactNode[] = [];
    visible.forEach((q, i) => {
      if (inReorder && reorder!.gap === i) stepNodes.push(gapNode(`gap-${sec.key}`));
      stepNodes.push(
        <div key={q.id} className="flex w-full flex-col items-center">
          <div className="h-6 w-px bg-slate-300" />
          {renderStepCard(q, stepNumberById.get(q.id) ?? 0)}
        </div>,
      );
    });
    if (inReorder && reorder!.gap >= visible.length) stepNodes.push(gapNode(`gap-end-${sec.key}`));
    chainItems.push(
      <div
        key={`body-${sec.key}`}
        className="grid w-full transition-[grid-template-rows,opacity] duration-300 ease-out"
        style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr", opacity: isCollapsed ? 0 : 1 }}
      >
        <div className="flex min-h-0 w-full flex-col items-center overflow-hidden">{stepNodes}</div>
      </div>,
    );
  });
  const draggedStep = reorder ? orderedSteps.find((q) => q.id === reorder.id) : null;

  return (
    <CrmLayout currentUser={currentUser} disableScroll flush>
      <div className="flex min-h-0 flex-1 flex-col">
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

          {visitType && subtype && (
            <button
              onClick={openStartFlow}
              className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 transition-colors hover:border-slate-300"
              data-testid="button-change-flow"
            >
              {VISIT_TYPE_LABELS[visitType as ChecklistVisitType]}
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              {subtype}
              <ChevronDown className="ml-1 h-3.5 w-3.5 text-slate-400" />
            </button>
          )}

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
        <div className="relative min-h-0 flex-1">
          {!visitType || !subtype ? (
            <div
              className="flex h-full items-center justify-center bg-slate-50"
              style={{ backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)", backgroundSize: "22px 22px" }}
            >
              <button
                onClick={openStartFlow}
                className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 px-10 py-8 text-center backdrop-blur-sm transition-colors hover:border-[#711419] hover:bg-white"
                data-testid="button-start-flow-canvas"
              >
                <ClipboardList className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Start flow</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Click to choose the work order type, subtype, and checklist.
                </p>
              </button>
            </div>
          ) : !checklist ? (
            <div
              className="flex h-full items-center justify-center bg-slate-50"
              style={{ backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)", backgroundSize: "22px 22px" }}
            >
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
            <div className="flex h-full min-h-0">
              {layersOpen && (
                <div className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white" data-testid="layers-panel">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Layers className="h-3.5 w-3.5 text-[#711419]" /> Layers
                    </span>
                    <button
                      onClick={() => setLayersOpen(false)}
                      className="rounded p-1 text-slate-400 hover:text-slate-700"
                      title="Hide layers"
                      data-testid="layers-collapse"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="scrollbar-hide flex-1 overflow-y-auto p-2">
                    {sections.map((sec) => {
                      const isUngroupedOnly = !sec.name && sections.length === 1;
                      const secCollapsed = !!sec.name && !!collapsedSections[sec.name];
                      const rows = panelDragId ? sec.steps.filter((q) => q.id !== panelDragId) : sec.steps;
                      const dropHere = panelDrop && panelDrop.key === (sec.name ?? null);
                      const dropLine = <div className="mx-1.5 my-0.5 h-0.5 rounded bg-[#711419]" />;
                      return (
                        <div key={sec.key} className="mb-1">
                          {!isUngroupedOnly && (
                            <div
                              ref={(el) => {
                                if (el) panelSecRefs.current.set(sec.key, el);
                                else panelSecRefs.current.delete(sec.key);
                              }}
                              className="group/lsec flex items-center gap-1 rounded-md px-1.5 py-1.5"
                              data-testid={`layers-section-${sec.key}`}
                            >
                              <button
                                onClick={() => sec.name && toggleSection(sec.name!)}
                                className="p-0.5 text-slate-400 hover:text-slate-600"
                                title={secCollapsed ? "Expand" : "Collapse"}
                              >
                                <ChevronDown className={`h-3 w-3 transition-transform ${secCollapsed ? "-rotate-90" : ""}`} />
                              </button>
                              <button
                                onClick={() => sec.name && scrollToSection(sec.name)}
                                className="min-w-0 flex-1 truncate text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800"
                              >
                                {sec.name ?? "No section"}
                              </button>
                              <span className="text-[10px] text-slate-400">{sec.steps.length}</span>
                              {sec.name && (
                                <button
                                  onClick={() => openNewStep(sec.name!)}
                                  className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-[#711419] group-hover/lsec:opacity-100"
                                  title="Add step to this section"
                                  data-testid={`layers-add-${sec.key}`}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                          <div
                            className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
                            style={{ gridTemplateRows: secCollapsed ? "0fr" : "1fr", opacity: secCollapsed ? 0 : 1 }}
                          >
                            <div className="min-h-0 overflow-hidden">
                              {rows.map((q, i) => (
                                <div key={q.id}>
                                  {dropHere && panelDrop!.index === i && dropLine}
                                  <div
                                    ref={(el) => {
                                      if (el) panelStepRefs.current.set(q.id, el);
                                      else panelStepRefs.current.delete(q.id);
                                    }}
                                    onPointerDown={(e) => startPanelDrag(q, e)}
                                    className={`flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pl-1.5 pr-1 text-[12px] transition-colors hover:bg-slate-50 ${
                                      panelDragId === q.id
                                        ? "opacity-40"
                                        : flashStepId === q.id
                                          ? "bg-[#711419]/10"
                                          : ""
                                    }`}
                                    style={{ touchAction: "none" }}
                                    data-testid={`layers-step-${q.id}`}
                                  >
                                    <GripVertical className="h-3 w-3 shrink-0 text-slate-300" />
                                    <span className="w-4 shrink-0 text-center text-[10px] font-bold text-[#711419]">
                                      {stepNumberById.get(q.id)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-slate-700">{q.question}</span>
                                    {q.isRequired && <span className="shrink-0 text-[#711419]">*</span>}
                                  </div>
                                </div>
                              ))}
                              {dropHere && panelDrop!.index >= rows.length && dropLine}
                            </div>
                          </div>
                          {secCollapsed && dropHere && dropLine}
                        </div>
                      );
                    })}
                    {orderedSteps.length === 0 && (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">No steps yet</p>
                    )}
                  </div>
                  <div className="border-t border-slate-100 p-2">
                    <button
                      onClick={() => openNewStep()}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-[#711419] hover:text-[#711419]"
                      data-testid="layers-add-step"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add step
                    </button>
                  </div>
                </div>
              )}
              <div className="relative min-h-0 flex-1">
              <div
                ref={viewportRef}
                className="h-full w-full overflow-hidden overscroll-contain bg-slate-50"
                style={{ cursor: panning ? "grabbing" : spaceHeld ? "grab" : undefined }}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                onPointerCancel={onCanvasPointerUp}
                data-testid="checklist-canvas"
              >
                <div className="mx-auto" style={{ width: worldSize.w * zoom, height: worldSize.h * zoom }}>
                <div
                  ref={worldRef}
                  className="relative select-none"
                  style={{
                    width: worldSize.w,
                    height: worldSize.h,
                    transform: `scale(${zoom})`,
                    transformOrigin: "0 0",
                    backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                  }}
                >
                  {/* Arrows (step → photo) */}
                  <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full">
                    <defs>
                      <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                        <path d="M 0 0.5 L 6 3.5 L 0 6.5 z" fill={MAROON} fillOpacity="0.55" />
                      </marker>
                      <marker id="arrowhead-live" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                        <path d="M 0 0.5 L 6 3.5 L 0 6.5 z" fill="#b45309" />
                      </marker>
                    </defs>
                    {arrows.map((l) => (
                      <path
                        key={l.id}
                        d={l.d}
                        fill="none"
                        stroke={MAROON}
                        strokeWidth={1.5}
                        strokeOpacity={0.4}
                        markerEnd="url(#arrowhead)"
                      />
                    ))}
                    {dragLink && (() => {
                      const sr = stepRectOf(dragLink.stepId);
                      return sr ? (
                        <path
                          d={anchoredPath(sr, { x: dragLink.to.x, y: dragLink.to.y, w: 0, h: 0 })}
                          fill="none"
                          stroke="#b45309"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          markerEnd="url(#arrowhead-live)"
                        />
                      ) : null;
                    })()}
                  </svg>

                  {/* Flow block: the checklist steps */}
                  <div
                    ref={flowBlockRef}
                    className="absolute z-10 flex flex-col items-center"
                    style={{ left: flowPos.x, top: flowPos.y, width: FLOW_W }}
                  >
                    <div
                      onPointerDown={startFlowDrag}
                      className="flex cursor-grab items-center gap-1.5 rounded-full bg-[#711419] px-4 py-1.5 text-xs font-semibold text-white shadow-md active:cursor-grabbing"
                      style={{ touchAction: "none" }}
                      data-testid="flow-start-node"
                    >
                      <GripVertical className="h-3.5 w-3.5 opacity-70" />
                      {VISIT_TYPE_LABELS[visitType as ChecklistVisitType]} · {subtype}
                    </div>

                    {chainItems}

                    <div className="h-6 w-px bg-slate-300" />
                    <button
                      onClick={() => openNewStep()}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 bg-white/60 py-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:border-[#711419] hover:text-[#711419]"
                      data-testid="button-add-step"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add step
                    </button>
                  </div>

                  {/* Reorder ghost */}
                  {reorder && draggedStep && (
                    <div
                      className="pointer-events-none absolute z-30"
                      style={{ left: flowPos.x, top: reorder.ghostY, width: FLOW_W }}
                    >
                      {renderStepCard(draggedStep, stepNumberById.get(draggedStep.id) ?? 0, true)}
                    </div>
                  )}

                  {/* Photo step nodes (freeform) */}
                  {photoSteps.map((ps) => {
                    const pos = photoPos[ps.id];
                    if (!pos) return null;
                    return (
                      <div
                        key={ps.id}
                        ref={(el) => { if (el) photoRefs.current.set(ps.id, el); else photoRefs.current.delete(ps.id); }}
                        onPointerDown={(e) => startPhotoDrag(ps, e)}
                        className={`group absolute z-10 cursor-pointer rounded-lg border bg-white p-2.5 shadow-sm transition-colors ${
                          hoverPhotoId === ps.id
                            ? "border-amber-500 ring-2 ring-amber-400/60"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                        style={{ left: pos.x, top: pos.y, width: PHOTO_W, touchAction: "none" }}
                        data-testid={`photo-node-${ps.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#711419]/10 text-[#711419]">
                            <Camera className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-snug text-slate-900">{ps.label}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                              {ps.isRequired && (
                                <span className="rounded bg-[#711419]/10 px-1 py-0.5 font-semibold text-[#711419]">Required</span>
                              )}
                              {ps.linkedQuestionId && stepNumberById.has(ps.linkedQuestionId) ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1 py-0.5 font-medium text-amber-700">
                                  Step {stepNumberById.get(ps.linkedQuestionId)}
                                  <button
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setPhotoLink.mutate({ photoId: ps.id, questionId: null }); }}
                                    className="text-amber-500 hover:text-amber-800"
                                    title="Unlink"
                                    data-testid={`photo-unlink-${ps.id}`}
                                  >
                                    <Unlink className="h-3 w-3" />
                                  </button>
                                </span>
                              ) : (
                                <span className="rounded bg-slate-100 px-1 py-0.5 text-slate-500">Whole visit</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setDeletingPhoto(ps); }}
                            data-testid={`photo-delete-${ps.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Hint when there are no photo steps yet */}
                  {photoSteps.length === 0 && (
                    <button
                      onClick={openNewPhoto}
                      className="absolute z-10 flex w-[220px] items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 bg-white/60 py-3 text-[13px] font-medium text-slate-500 transition-colors hover:border-[#711419] hover:text-[#711419]"
                      style={{ left: flowPos.x + FLOW_W + 240, top: flowPos.y + 30 }}
                      data-testid="button-add-first-photo"
                    >
                      <Camera className="h-3.5 w-3.5" /> Add photo step
                    </button>
                  )}
                </div>
                </div>
              </div>

              {/* Bottom canvas toolbar: zoom + center */}
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
                <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/90 px-1.5 py-1 shadow-lg backdrop-blur">
                  <button
                    onClick={() => applyZoom(zoom - 0.1)}
                    disabled={zoom <= 0.4}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35"
                    title="Zoom out"
                    data-testid="canvas-zoom-out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => applyZoom(1)}
                    className="w-11 rounded-full py-1 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                    title="Reset zoom"
                    data-testid="canvas-zoom-reset"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => applyZoom(zoom + 0.1)}
                    disabled={zoom >= 1.5}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35"
                    title="Zoom in"
                    data-testid="canvas-zoom-in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <div className="mx-1 h-5 w-px bg-slate-200" />
                  <button
                    onClick={centerView}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    title="Center on the flow"
                    data-testid="canvas-center"
                  >
                    <Crosshair className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Floating canvas controls */}
              <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-start justify-between px-4">
                <div className="flex items-center gap-2">
                  {!layersOpen && (
                    <button
                      onClick={() => setLayersOpen(true)}
                      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur transition-colors hover:text-slate-900"
                      title="Show layers"
                      data-testid="layers-expand"
                    >
                      <PanelLeftOpen className="h-4 w-4" />
                    </button>
                  )}
                  <span className="pointer-events-auto rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur">
                    Hold <kbd className="rounded bg-slate-100 px-1 font-semibold">Space</kbd> + drag to pan · click a card to edit · drag a step's ● onto a photo
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={openNewPhoto}
                  className="pointer-events-auto h-8 bg-[#711419] shadow-md hover:bg-[#8a1a1f]"
                  data-testid="button-add-photo-step"
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" /> Add photo step
                </Button>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Start flow */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start flow</DialogTitle>
            <DialogDescription>Choose what this checklist is for.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Work order type</Label>
              <Select
                value={sVT}
                onValueChange={(v) => {
                  setSVT(v as ChecklistVisitType);
                  setSST("");
                  setSPick("__new__");
                }}
              >
                <SelectTrigger data-testid="start-visit-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {checklistVisitTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>{VISIT_TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subtype</Label>
              <Select
                value={sST}
                onValueChange={(v) => {
                  setSST(v);
                  const existing = checklists.filter(
                    (c) => ((c as any).visitType || "SERVICE") === sVT && c.serviceType === v,
                  );
                  setSPick(existing[0]?.id ?? "__new__");
                  setSName("");
                }}
                disabled={!sVT}
              >
                <SelectTrigger data-testid="start-subtype">
                  <SelectValue placeholder="Select subtype" />
                </SelectTrigger>
                <SelectContent>
                  {sSubtypes.length > 0 ? (
                    sSubtypes.map((x) => (
                      <SelectItem key={x.id} value={x.subtype}>{x.subtype}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Other">Other</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {sVT && sST && (
              <div className="space-y-2">
                <Label>Checklist</Label>
                <Select value={sPick} onValueChange={setSPick}>
                  <SelectTrigger data-testid="start-checklist">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sCombo.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{!c.isActive ? " (inactive)" : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">
                      <span className="flex items-center gap-1.5 text-[#711419]">
                        <Plus className="h-3.5 w-3.5" /> New checklist
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {sVT && sST && sPick === "__new__" && (
              <div className="space-y-2">
                <Label>Checklist name</Label>
                <Input
                  placeholder={`${titleCase(sST)} Checklist`}
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  data-testid="start-checklist-name"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button
              onClick={() => startFlow.mutate()}
              disabled={!sVT || !sST || startFlow.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="start-open-canvas"
            >
              {startFlow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Open canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {(stepForm.questionType === "select" || stepForm.questionType === "multi_select") && (
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
            <div className="space-y-2">
              <Label>Section (optional)</Label>
              <Input
                list="checklist-section-names"
                placeholder="e.g., Diagnostics"
                value={stepForm.section}
                onChange={(e) => setStepForm({ ...stepForm, section: e.target.value })}
                data-testid="input-question-section"
              />
              <datalist id="checklist-section-names">
                {sectionNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Steps with the same section group into a collapsible phase on the canvas and for the tech.
              </p>
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
              A photo the tech must capture. Link it by dragging a step's handle onto this card.
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

      {/* Rename section */}
      <Dialog open={!!renameSec} onOpenChange={(o) => !o && setRenameSec(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename section</DialogTitle>
            <DialogDescription>Applies to every step in "{renameSec?.old}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Section name</Label>
            <Input
              value={renameSec?.name ?? ""}
              onChange={(e) => setRenameSec((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              data-testid="input-rename-section"
            />
            <p className="text-xs text-muted-foreground">Leave empty to ungroup these steps.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSec(null)}>Cancel</Button>
            <Button
              onClick={() => renameSection.mutate()}
              disabled={renameSection.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-rename-section"
            >
              {renameSection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
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
