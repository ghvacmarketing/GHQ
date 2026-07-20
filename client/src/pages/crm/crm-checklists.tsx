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
  Camera,
  GripVertical,
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
  yes_no: <CheckCircle className="h-3 w-3" />,
  text: <Type className="h-3 w-3" />,
  number: <Hash className="h-3 w-3" />,
  select: <List className="h-3 w-3" />,
};

const MAROON = "#711419";
const FLOW_W = 280;
const PHOTO_W = 220;
const WORLD_W_MIN = 3200;
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
  });

  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<ChecklistPhotoStep | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<ChecklistPhotoStep | null>(null);
  const [photoForm, setPhotoForm] = useState({ label: "", instructions: "", isRequired: true });

  // Canvas state
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [flowPos, setFlowPos] = useState<XY>(DEFAULT_FLOW);
  const [photoPos, setPhotoPos] = useState<Record<string, XY>>({});
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [reorder, setReorder] = useState<{ id: string; ghostY: number; gap: number; h: number } | null>(null);
  const [dragLink, setDragLink] = useState<{ stepId: string; from: XY; to: XY } | null>(null);
  const [hoverPhotoId, setHoverPhotoId] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const flowBlockRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef(new Map<string, HTMLDivElement>());
  const photoRefs = useRef(new Map<string, HTMLDivElement>());
  const stepGeom = useRef(new Map<string, { top: number; h: number }>());
  const photoGeom = useRef(new Map<string, { w: number; h: number }>());
  const dragRef = useRef<DragState | null>(null);
  const flowPosRef = useRef(flowPos);
  flowPosRef.current = flowPos;
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
  const stepNumberById = useMemo(() => {
    const m = new Map<string, number>();
    orderedSteps.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [orderedSteps]);

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
        return;
      }
    } catch {}
    setFlowPos(DEFAULT_FLOW);
    setPhotoPos({});
  }, [checklistId]);

  // Persist layout
  useEffect(() => {
    if (!checklistId) return;
    try {
      localStorage.setItem(`checklist-canvas:${checklistId}`, JSON.stringify({ flow: flowPos, photos: photoPos }));
    } catch {}
  }, [flowPos, photoPos, checklistId]);

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
      vp.scrollTo({
        left: Math.max(0, flowPosRef.current.x - (vp.clientWidth - FLOW_W) / 2 + 120),
        top: Math.max(0, flowPosRef.current.y - 70),
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
  useLayoutEffect(() => {
    const flowEl = flowBlockRef.current;
    if (!flowEl) return;
    const fRect = flowEl.getBoundingClientRect();
    stepGeom.current.clear();
    for (const [id, el] of Array.from(stepRefs.current.entries())) {
      const r = el.getBoundingClientRect();
      stepGeom.current.set(id, { top: r.top - fRect.top, h: r.height });
    }
    photoGeom.current.clear();
    for (const [id, el] of Array.from(photoRefs.current.entries())) {
      photoGeom.current.set(id, { w: el.offsetWidth, h: el.offsetHeight });
    }
    setArrowTick((t) => t + 1);
  }, [orderedSteps, photoSteps, checklist?.id, reorder !== null]);

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
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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
    const grabY = el ? e.clientY - el.getBoundingClientRect().top : h / 2;
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

  const computeGap = (clientY: number, draggedId: string) => {
    const centers: number[] = [];
    for (const q of orderedSteps) {
      if (q.id === draggedId) continue;
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
          setReorder({ id: st.id, ghostY: worldPoint(e).y - st.grabY, gap: computeGap(e.clientY, st.id), h: st.h });
        }
        break;
      }
      case "reorder": {
        setReorder((prev) =>
          prev ? { ...prev, ghostY: worldPoint(e).y - st.grabY, gap: computeGap(e.clientY, st.id) } : prev,
        );
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
          const rest = orderedSteps.filter((s) => s.id !== reorder.id).map((s) => s.id);
          rest.splice(reorder.gap, 0, reorder.id);
          setLocalOrder(rest);
          reorderSteps.mutate(rest);
        }
        setReorder(null);
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
    const move = (e: PointerEvent) => { if (dragRef.current && dragRef.current.kind !== "pan") moveRef.current(e); };
    const up = () => { if (dragRef.current && dragRef.current.kind !== "pan") upRef.current(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // ----- arrows -----
  const arrows = useMemo(() => {
    void arrowTick;
    const out: Array<{ id: string; from: XY; to: XY }> = [];
    for (const ps of photoSteps) {
      if (!ps.linkedQuestionId) continue;
      const sg = stepGeom.current.get(ps.linkedQuestionId);
      const pp = photoPos[ps.id];
      const pg = photoGeom.current.get(ps.id);
      if (!sg || !pp || !pg) continue;
      out.push({
        id: ps.id,
        from: { x: flowPos.x + FLOW_W + 3, y: flowPos.y + sg.top + sg.h / 2 },
        to: { x: pp.x - 3, y: pp.y + pg.h / 2 },
      });
    }
    return out;
  }, [photoSteps, photoPos, flowPos, arrowTick]);

  const curve = (a: XY, b: XY) => {
    const dx = Math.max(48, Math.abs(b.x - a.x) * 0.45);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x - 6} ${b.y}`;
  };

  const worldSize = useMemo(() => {
    let w = WORLD_W_MIN;
    let h = Math.max(1600, flowPos.y + orderedSteps.length * 150 + 600);
    for (const pos of Object.values(photoPos)) {
      w = Math.max(w, pos.x + PHOTO_W + 400);
      h = Math.max(h, pos.y + 400);
    }
    w = Math.max(w, flowPos.x + FLOW_W + 800);
    return { w, h };
  }, [flowPos, photoPos, orderedSteps.length]);

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

  const renderStepCard = (q: ChecklistQuestion, number: number, ghost = false) => (
    <div
      ref={ghost ? undefined : (el) => { if (el) stepRefs.current.set(q.id, el); else stepRefs.current.delete(q.id); }}
      onPointerDown={ghost ? undefined : (e) => startStepDrag(q, e)}
      className={`group relative w-full cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-colors ${
        ghost
          ? "rotate-1 border-[#711419]/50 shadow-xl"
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
          className="absolute -right-2 top-1/2 z-20 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-white bg-[#711419] shadow transition-transform hover:scale-125"
          style={{ touchAction: "none" }}
          title="Drag onto a photo step to require it here"
          data-testid={`step-handle-${q.id}`}
        />
      )}
    </div>
  );

  // Chain rendering (with a gap placeholder while reordering)
  const chainSteps = reorder ? orderedSteps.filter((s) => s.id !== reorder.id) : orderedSteps;
  const chainItems: React.ReactNode[] = [];
  chainSteps.forEach((q, i) => {
    if (reorder && reorder.gap === i) {
      chainItems.push(
        <div key="gap" className="flex w-full flex-col items-center">
          <div className="h-6 w-px bg-slate-300" />
          <div style={{ height: reorder.h }} className="w-full rounded-lg border-2 border-dashed border-[#711419]/40 bg-[#711419]/5" />
        </div>,
      );
    }
    const number = reorder ? (i >= reorder.gap ? i + 2 : i + 1) : i + 1;
    chainItems.push(
      <div key={q.id} className="flex w-full flex-col items-center">
        <div className="h-6 w-px bg-slate-300" />
        {renderStepCard(q, number)}
      </div>,
    );
  });
  if (reorder && reorder.gap >= chainSteps.length) {
    chainItems.push(
      <div key="gap" className="flex w-full flex-col items-center">
        <div className="h-6 w-px bg-slate-300" />
        <div style={{ height: reorder.h }} className="w-full rounded-lg border-2 border-dashed border-[#711419]/40 bg-[#711419]/5" />
      </div>,
    );
  }
  const draggedStep = reorder ? orderedSteps.find((s) => s.id === reorder.id) : null;

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
        <div className="relative min-h-0 flex-1">
          {!visitType || !subtype ? (
            <div
              className="flex h-full items-center justify-center bg-slate-50"
              style={{ backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)", backgroundSize: "22px 22px" }}
            >
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 px-10 py-8 text-center backdrop-blur-sm">
                <ClipboardList className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Start your flow</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Pick a work order type and subtype above to open its checklist canvas.
                </p>
              </div>
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
            <>
              <div
                ref={viewportRef}
                className="h-full w-full overflow-auto overscroll-contain bg-slate-50"
                style={{ cursor: panning ? "grabbing" : spaceHeld ? "grab" : undefined }}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                onPointerCancel={onCanvasPointerUp}
                data-testid="checklist-canvas"
              >
                <div
                  ref={worldRef}
                  className="relative select-none"
                  style={{
                    width: worldSize.w,
                    height: worldSize.h,
                    backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                  }}
                >
                  {/* Arrows (step → photo) */}
                  <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full">
                    <defs>
                      <marker id="arrowhead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                        <path d="M 0 0 L 8 4.5 L 0 9 z" fill={MAROON} />
                      </marker>
                      <marker id="arrowhead-live" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                        <path d="M 0 0 L 8 4.5 L 0 9 z" fill="#b45309" />
                      </marker>
                    </defs>
                    {arrows.map((l) => (
                      <path
                        key={l.id}
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
                      onClick={openNewStep}
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
                      {renderStepCard(draggedStep, reorder.gap + 1, true)}
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

              {/* Floating canvas controls */}
              <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-start justify-between px-4">
                <span className="pointer-events-auto rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur">
                  Hold <kbd className="rounded bg-slate-100 px-1 font-semibold">Space</kbd> + drag to pan · click a card to edit · drag a step's ● onto a photo
                </span>
                <Button
                  size="sm"
                  onClick={openNewPhoto}
                  className="pointer-events-auto h-8 bg-[#711419] shadow-md hover:bg-[#8a1a1f]"
                  data-testid="button-add-photo-step"
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" /> Add photo step
                </Button>
              </div>
            </>
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
