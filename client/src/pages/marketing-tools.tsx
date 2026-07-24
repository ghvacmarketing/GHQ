import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, X, ArrowLeft, Save, Send, Trash2, ChevronUp, ChevronDown,
  Heading1, AlignLeft, MousePointerClick, Image as ImageIcon, ListOrdered,
  Minus, MoveVertical, Users, Filter as FilterIcon, Loader2, Mail, CheckCircle2,
  GripVertical, ZoomIn, ZoomOut, Maximize2, FileText, Receipt, ShieldCheck, Wrench, Briefcase,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerField } from "@/components/crm/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ── Shared types (mirror server/marketing-routes) ───────────────────────────
type Block = {
  id: string;
  type: "heading" | "paragraph" | "button" | "image" | "divider" | "spacer" | "list";
  props: Record<string, any>;
};
type Design = {
  blocks: Block[];
  styles: { font?: string; textColor?: string; accent?: string; contentBg?: string; pageBg?: string; width?: number };
};
type TemplateKind = "email" | "sms" | "script";
type Template = {
  id: string; name: string; subject: string | null; design: Design; updated_at: string;
  createdByName?: string | null; kind?: TemplateKind; body?: string | null;
};
type Audience = { id: string; name: string; filters: unknown; count?: number | null };

const uid = () => Math.random().toString(36).slice(2, 10);

const BLOCK_DEFS: { type: Block["type"]; label: string; icon: typeof Heading1; defaults: Record<string, any> }[] = [
  { type: "heading", label: "Heading", icon: Heading1, defaults: { text: "Hi {{first_name}},", level: 1 } },
  { type: "paragraph", label: "Paragraph", icon: AlignLeft, defaults: { text: "Write your message here. Use merge fields like {{first_name}} and {{company}} to personalize it." } },
  { type: "button", label: "Button", icon: MousePointerClick, defaults: { text: "Book your visit", href: "https://www.ghvac.app/book", align: "center" } },
  { type: "image", label: "Image", icon: ImageIcon, defaults: { src: "", alt: "" } },
  { type: "list", label: "List", icon: ListOrdered, defaults: { items: "First point\nSecond point" } },
  { type: "divider", label: "Divider", icon: Minus, defaults: {} },
  { type: "spacer", label: "Spacer", icon: MoveVertical, defaults: { height: 24 } },
];

const DEFAULT_DESIGN: Design = {
  blocks: [
    { id: "b1", type: "heading", props: { text: "{{company}}", level: 1, banner: true, bannerColor: "#711419" } },
    { id: "b2", type: "heading", props: { text: "Hi {{first_name}},", level: 2 } },
    { id: "b3", type: "paragraph", props: { text: "Write your message here. Use merge fields like {{company}} and {{first_name}} to personalize it for every customer." } },
    { id: "b4", type: "button", props: { text: "Book your visit", href: "https://www.ghvac.app/book", align: "center" } },
    { id: "b5", type: "divider", props: {} },
    { id: "b6", type: "paragraph", props: { text: "{{company}} · Proudly serving your area\nQuestions? Just reply to this email." } },
  ],
  styles: { textColor: "#1f2937", accent: "#711419", contentBg: "#ffffff", pageBg: "#f1f3f4", width: 600 },
};

// ════════════════════════ TEMPLATES ════════════════════════

export function TemplatesTab() {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useQuery<Template[]>({ queryKey: ["/api/marketing/templates"] });
  const [editing, setEditing] = useState<{ kind: TemplateKind; template: Template | null } | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/marketing/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/marketing/templates"] }),
  });

  const closeEditor = () => {
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["/api/marketing/templates"] });
  };

  if (editing) {
    return editing.kind === "email" ? (
      <TemplateBuilder template={editing.template} onClose={closeEditor} />
    ) : (
      <TextTemplateEditor kind={editing.kind} template={editing.template} onClose={closeEditor} />
    );
  }

  const KIND_META: Record<TemplateKind, { label: string; chip: string; blurb: string }> = {
    email: { label: "Email", chip: "bg-[#711419]/10 text-[#711419]", blurb: "Visual email built block by block" },
    sms: { label: "SMS", chip: "bg-sky-100 text-sky-700", blurb: "Short text message with merge fields" },
    script: { label: "Call script", chip: "bg-amber-100 text-amber-700", blurb: "A script the team reads on calls" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Templates</h1>
          <p className="mt-0.5 text-sm text-slate-500">Reusable emails, texts, and call scripts with merge fields.</p>
        </div>
        <Button className="bg-[#711419] hover:bg-[#8a1a1f]" onClick={() => setChooserOpen(true)} data-testid="template-new">
          <Plus className="mr-1.5 h-4 w-4" /> New template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-[4px]" />)}</div>
      ) : templates.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-16 text-center">
          <Mail className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No templates yet</p>
          <p className="mt-0.5 text-xs text-slate-400">Build your first email, text, or call script — it takes a minute.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const kind = (t.kind || "email") as TemplateKind;
            return (
              <div key={t.id} className="group flex flex-col rounded-[4px] border border-slate-300/70 bg-white p-4 transition-colors hover:border-slate-900" data-testid={`template-${t.id}`}>
                <button onClick={() => setEditing({ kind, template: t })} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{t.name}</p>
                    <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_META[kind].chip}`}>
                      {KIND_META[kind].label}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                    {kind === "email" ? (t.subject || "No subject yet") : (t.body || "Empty")}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {kind === "email" ? `${t.design?.blocks?.length ?? 0} blocks · ` : ""}
                    {format(new Date(t.updated_at), "MMM d, h:mm a")}
                  </p>
                </button>
                <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => deleteTemplate.mutate(t.id)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Type chooser */}
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>What kind of template?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(Object.keys(KIND_META) as TemplateKind[]).map((k) => (
              <button
                key={k}
                onClick={() => { setChooserOpen(false); setEditing({ kind: k, template: null }); }}
                className="flex w-full items-center gap-3 rounded-[4px] border border-slate-300/70 bg-white px-4 py-3 text-left transition-colors hover:border-slate-900"
                data-testid={`template-new-${k}`}
              >
                <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_META[k].chip}`}>
                  {KIND_META[k].label}
                </span>
                <span className="text-sm text-slate-700">{KIND_META[k].blurb}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Focused editor for SMS + call-script templates — just a name and the text,
 *  with merge fields and (for SMS) a live character/segment count. */
function TextTemplateEditor({ kind, template, onClose }: { kind: "sms" | "script"; template: Template | null; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(template?.name || (kind === "sms" ? "Untitled text" : "Untitled call script"));
  const [body, setBody] = useState(template?.body || "");
  const [savedId, setSavedId] = useState<string | null>(template?.id ?? null);

  const save = useMutation({
    mutationFn: async () => {
      if (savedId) {
        const res = await apiRequest("PATCH", `/api/marketing/templates/${savedId}`, { name, body });
        return res.json();
      }
      const res = await apiRequest("POST", "/api/marketing/templates", { name, kind, body });
      return res.json();
    },
    onSuccess: (t: Template) => { setSavedId(t.id); toast({ title: "Template saved" }); },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });

  const chars = body.length;
  const segments = chars === 0 ? 0 : Math.ceil(chars / 160);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-900" data-testid="text-template-editor">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white" data-testid="text-editor-back">
          <ArrowLeft className="h-4 w-4" /> Templates
        </button>
        <span className="h-5 w-px bg-white/15" />
        <span className="rounded-[3px] bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          {kind === "sms" ? "SMS" : "Call script"}
        </span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-64 border-transparent bg-white/10 text-sm text-white placeholder:text-slate-400 focus-visible:ring-0"
          placeholder="Template name"
          data-testid="text-editor-name"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" className="h-9 bg-[#711419] hover:bg-[#8a1a1f]" disabled={save.isPending} onClick={() => save.mutate()} data-testid="text-editor-save">
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save template
          </Button>
          <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-8">
        <div className="w-full max-w-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {kind === "sms" ? "Message" : "Script"}
          </p>
          <Textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === "sms"
              ? "Hi {{first_name}}, this is {{company}} — time to book your seasonal tune-up. Reply YES and we'll get you scheduled."
              : "Opening: Hi {{first_name}}, this is ____ from {{company}}…\n\nWhy we're calling:\n\nIf voicemail:\n\nWrap-up:"}
            className={`dark-input w-full resize-none rounded-[6px] text-[15px] leading-relaxed ${kind === "sms" ? "min-h-[180px]" : "min-h-[420px]"}`}
            data-testid="text-editor-body"
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Merge fields: {"{{first_name}}"}, {"{{name}}"}, {"{{company}}"}, {"{{email}}"}</span>
            {kind === "sms" && (
              <span className={chars > 160 ? "text-amber-400" : ""}>
                {chars} chars · {segments} segment{segments === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateBuilder({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(template?.name || "Untitled email");
  const [subject, setSubject] = useState(template?.subject || "");
  const [design, setDesign] = useState<Design>(template?.design?.blocks ? template.design : DEFAULT_DESIGN);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [savedId, setSavedId] = useState<string | null>(template?.id ?? null);

  const st = design.styles;
  const selected = design.blocks.find((b) => b.id === selectedId) || null;

  // ── Freeform canvas: space+drag pans, scroll zooms, the email is movable ──
  const canvasRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null); // null until centered on mount
  const [spaceDown, setSpaceDown] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const dragState = useRef<{ mode: "pan" | "email"; startX: number; startY: number; base: { x: number; y: number } } | null>(null);
  const [emailPos, setEmailPos] = useState({ x: 0, y: 0 });
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [layerDragIdx, setLayerDragIdx] = useState<number | null>(null);

  const centerEmail = () => {
    const el = canvasRef.current;
    if (!el) return;
    const w = st.width || 600;
    setZoom(1);
    setEmailPos({ x: 0, y: 0 });
    setPan({ x: Math.max(24, (el.clientWidth - w) / 2), y: 40 });
  };
  useEffect(() => { centerEmail(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Space toggles pan mode (ignored while typing in a field)
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) { e.preventDefault(); setSpaceDown(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Wheel zoom toward the cursor (native listener — React's is passive)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setPan((prev) => {
        if (!prev) return prev;
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setZoom((z) => {
          const next = Math.min(2.5, Math.max(0.35, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
          const k = next / z;
          setPan({ x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k });
          return next;
        });
        return prev;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const startPan = (e: React.PointerEvent) => {
    if (!pan) return;
    dragState.current = { mode: "pan", startX: e.clientX, startY: e.clientY, base: pan };
    setGrabbing(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const startEmailMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragState.current = { mode: "email", startX: e.clientX, startY: e.clientY, base: emailPos };
    setGrabbing(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "pan") setPan({ x: d.base.x + dx, y: d.base.y + dy });
    else setEmailPos({ x: d.base.x + dx / zoom, y: d.base.y + dy / zoom });
  };
  const endDrag = () => { dragState.current = null; setGrabbing(false); };

  // Palette drag → compute the insertion slot from the pointer's Y position
  const insertIndexAt = (clientY: number): number => {
    const wrap = blocksRef.current;
    if (!wrap) return design.blocks.length;
    const kids = Array.from(wrap.children) as HTMLElement[];
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return design.blocks.length;
  };

  const setStyles = (patch: Partial<Design["styles"]>) => setDesign((d) => ({ ...d, styles: { ...d.styles, ...patch } }));
  const setBlockProps = (id: string, patch: Record<string, any>) =>
    setDesign((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...patch } } : b)) }));
  const insertBlockAt = (type: Block["type"], idx: number) => {
    const def = BLOCK_DEFS.find((x) => x.type === type)!;
    const block = { id: uid(), type, props: { ...def.defaults } };
    setDesign((d) => {
      const next = [...d.blocks];
      next.splice(Math.min(idx, next.length), 0, block);
      return { ...d, blocks: next };
    });
    setSelectedId(block.id);
  };
  const addBlock = (type: Block["type"]) => insertBlockAt(type, design.blocks.length);
  const reorderBlock = (from: number, to: number) =>
    setDesign((d) => {
      if (from === to || from < 0 || to < 0 || from >= d.blocks.length || to >= d.blocks.length) return d;
      const next = [...d.blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...d, blocks: next };
    });
  const moveBlock = (id: string, dir: -1 | 1) =>
    setDesign((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.blocks.length) return d;
      const next = [...d.blocks];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, blocks: next };
    });
  const removeBlock = (id: string) => {
    setDesign((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    setSelectedId(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (savedId) {
        const res = await apiRequest("PATCH", `/api/marketing/templates/${savedId}`, { name, subject, design });
        return res.json();
      }
      const res = await apiRequest("POST", "/api/marketing/templates", { name, subject, design });
      return res.json();
    },
    onSuccess: (t: Template) => {
      setSavedId(t.id);
      toast({ title: "Template saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });

  const testSend = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/marketing/templates/${savedId}/test-send`, { to: testEmail }),
    onSuccess: () => { setTestOpen(false); toast({ title: "Test email sent", description: testEmail }); },
    onError: (e: any) => toast({ title: e?.message || "Test send failed", variant: "destructive" }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const fontCss = st.font === "serif" ? "Georgia, serif" : st.font === "mono" ? "Menlo, monospace" : "-apple-system, Segoe UI, Roboto, sans-serif";

  const renderBlock = (b: Block) => {
    const p = b.props;
    const common = "cursor-pointer transition-shadow";
    const ring = selectedId === b.id ? "ring-2 ring-[#e8704f] ring-offset-1" : "hover:ring-1 hover:ring-slate-300";
    switch (b.type) {
      case "heading": {
        const size = p.level === 2 ? 22 : p.level === 3 ? 18 : 28;
        if (p.banner) {
          return (
            <div className={`${common} ${ring} px-6 py-6 text-center`} style={{ background: p.bannerColor || st.accent }}>
              <h1 style={{ fontSize: size, color: "#fff", fontFamily: fontCss, margin: 0, lineHeight: 1.25, fontWeight: 700 }}>{p.text}</h1>
            </div>
          );
        }
        return (
          <div className={`${common} ${ring} px-8 py-2`}>
            <h1 style={{ fontSize: size, color: st.textColor, fontFamily: fontCss, margin: 0, lineHeight: 1.25, fontWeight: 700 }}>{p.text}</h1>
          </div>
        );
      }
      case "paragraph":
        return (
          <div className={`${common} ${ring} px-8 py-2`}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: st.textColor, fontFamily: fontCss, margin: 0, whiteSpace: "pre-wrap" }}>{p.text}</p>
          </div>
        );
      case "button":
        return (
          <div className={`${common} ${ring} px-8 py-4`} style={{ textAlign: p.align || "center" }}>
            <span style={{ display: "inline-block", background: p.color || st.accent, color: "#fff", fontFamily: fontCss, fontSize: 15, fontWeight: 600, padding: "12px 28px", borderRadius: 6 }}>
              {p.text}
            </span>
          </div>
        );
      case "image":
        return (
          <div className={`${common} ${ring} px-8 py-2`}>
            {p.src ? (
              <img src={p.src} alt={p.alt || ""} className="w-full rounded" />
            ) : (
              <div className="flex h-28 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">Set an image URL in the panel →</div>
            )}
          </div>
        );
      case "list":
        return (
          <div className={`${common} ${ring} px-8 py-2`}>
            <ul style={{ fontSize: 15, lineHeight: 1.6, color: st.textColor, fontFamily: fontCss, margin: 0, paddingLeft: 20 }}>
              {String(p.items || "").split("\n").filter(Boolean).map((it: string, i: number) => <li key={i}>{it}</li>)}
            </ul>
          </div>
        );
      case "divider":
        return <div className={`${common} ${ring} px-8 py-4`}><div className="border-t border-slate-200" /></div>;
      case "spacer":
        return <div className={`${common} ${ring}`} style={{ height: Number(p.height) || 24 }} />;
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-900" data-testid="template-builder">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white" data-testid="builder-back">
          <ArrowLeft className="h-4 w-4" /> Templates
        </button>
        <span className="h-5 w-px bg-white/15" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-48 border-transparent bg-white/10 text-sm text-white placeholder:text-slate-400 focus-visible:ring-0"
          placeholder="Email name"
          data-testid="builder-name"
        />
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 flex-1 border-transparent bg-white/10 text-sm text-white placeholder:text-slate-400 focus-visible:ring-0"
          placeholder="Subject line…"
          data-testid="builder-subject"
        />
        <Button size="sm" variant="outline" className="h-9 border-white/20 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white" disabled={!savedId} onClick={() => setTestOpen(true)} data-testid="builder-test">
          <Send className="mr-1.5 h-3.5 w-3.5" /> Test
        </Button>
        <Button size="sm" className="h-9 bg-[#711419] hover:bg-[#8a1a1f]" disabled={save.isPending} onClick={() => save.mutate()} data-testid="builder-save">
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save template
        </Button>
        <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Close" data-testid="builder-close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Insert + layers */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-white/10 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <Plus className="h-3.5 w-3.5" /> Insert
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {BLOCK_DEFS.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/x-ghq-block", d.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => setDropIdx(null)}
                  onClick={() => addBlock(d.type)}
                  className="flex cursor-grab items-center gap-1.5 rounded-[4px] border border-white/10 bg-white/5 px-2 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 active:cursor-grabbing"
                  title="Drag onto the email — or click to add at the end"
                  data-testid={`insert-${d.type}`}
                >
                  <Icon className="h-3.5 w-3.5 text-[#e8704f]" /> {d.label}
                </button>
              );
            })}
          </div>

          <p className="mb-1.5 mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Layers</p>
          <div className="space-y-0.5" data-testid="builder-layers">
            {design.blocks.map((b, i) => {
              const def = BLOCK_DEFS.find((x) => x.type === b.type)!;
              const Icon = def.icon;
              const label = b.props.text || b.props.items || def.label;
              return (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    setLayerDragIdx(i);
                    e.dataTransfer.setData("text/x-ghq-layer", String(i));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (layerDragIdx === null || layerDragIdx === i) return;
                    e.preventDefault();
                    reorderBlock(layerDragIdx, i);
                    setLayerDragIdx(i);
                  }}
                  onDragEnd={() => setLayerDragIdx(null)}
                  onDrop={(e) => { e.preventDefault(); setLayerDragIdx(null); }}
                  className={`group flex items-center gap-1 rounded-[4px] px-1.5 py-1.5 text-xs ${
                    layerDragIdx === i ? "bg-white/20 text-white" : selectedId === b.id ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"
                  }`}
                  data-testid={`layer-${i}`}
                >
                  <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-slate-600 group-hover:text-slate-400" />
                  <button onClick={() => setSelectedId(b.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    <Icon className="h-3 w-3 shrink-0 text-slate-500" />
                    <span className="truncate">{String(label).slice(0, 26)}</span>
                  </button>
                  <button onClick={() => removeBlock(b.id)} className="hidden rounded p-0.5 text-slate-500 hover:text-red-400 group-hover:block"><Trash2 className="h-3 w-3" /></button>
                </div>
              );
            })}
            {design.blocks.length === 0 && <p className="px-1.5 py-2 text-[11px] text-slate-500">No blocks yet.</p>}
          </div>
        </div>

        {/* Canvas — freeform: space+drag pans, scroll zooms, the email itself
            can be picked up by its handle and moved anywhere. */}
        <div
          ref={canvasRef}
          className={`relative min-w-0 flex-1 touch-none overflow-hidden ${spaceDown || grabbing ? (grabbing ? "cursor-grabbing" : "cursor-grab") : ""}`}
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
          onClick={() => { if (!spaceDown) setSelectedId(null); }}
          onPointerDown={(e) => { if (spaceDown || e.button === 1) startPan(e); }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-testid="builder-canvas-viewport"
        >
          {pan && (
            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
              <div style={{ position: "absolute", left: emailPos.x, top: emailPos.y, width: st.width || 600 }}>
                {/* Move handle for the whole email */}
                <div
                  onPointerDown={startEmailMove}
                  className="mb-1.5 flex w-fit cursor-grab items-center gap-1.5 rounded-[4px] bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-400 hover:bg-white/15 hover:text-slate-200 active:cursor-grabbing"
                  title="Drag to move the email"
                  data-testid="builder-email-handle"
                >
                  <GripVertical className="h-3 w-3" /> Email
                </div>
                <div
                  className="overflow-hidden rounded-lg shadow-2xl"
                  style={{ background: st.contentBg }}
                  onClick={(e) => { if (!spaceDown) e.stopPropagation(); }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes("text/x-ghq-block")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDropIdx(insertIndexAt(e.clientY));
                  }}
                  onDragLeave={() => setDropIdx(null)}
                  onDrop={(e) => {
                    const type = e.dataTransfer.getData("text/x-ghq-block") as Block["type"];
                    if (!type) return;
                    e.preventDefault();
                    insertBlockAt(type, dropIdx ?? design.blocks.length);
                    setDropIdx(null);
                  }}
                  data-testid="builder-canvas"
                >
                  <div ref={blocksRef} className="py-3" style={{ background: st.contentBg }}>
                    {design.blocks.map((b, i) => (
                      <div key={b.id} className="relative" onClick={() => setSelectedId(b.id)}>
                        {dropIdx === i && <div className="absolute -top-px left-4 right-4 z-10 h-0.5 rounded bg-[#e8704f]" />}
                        {renderBlock(b)}
                      </div>
                    ))}
                    {dropIdx === design.blocks.length && design.blocks.length > 0 && (
                      <div className="mx-4 h-0.5 rounded bg-[#e8704f]" />
                    )}
                    {design.blocks.length === 0 && (
                      <p className={`py-16 text-center text-sm ${dropIdx !== null ? "text-[#e8704f]" : "text-slate-400"}`}>
                        {dropIdx !== null ? "Drop it here" : "Drag blocks here from the left panel."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Zoom + hint chrome */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-between px-4">
            <p className="rounded-[4px] bg-white/5 px-2 py-1 text-[10px] text-slate-500">
              Space + drag to pan · scroll to zoom · drag the “Email” handle to move it
            </p>
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-[4px] border border-white/10 bg-slate-900/90 p-0.5">
              <button onClick={() => setZoom((z) => Math.max(0.35, z / 1.2))} className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" title="Zoom out" data-testid="builder-zoom-out">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="w-11 text-center text-[11px] tabular-nums text-slate-300">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))} className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" title="Zoom in" data-testid="builder-zoom-in">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button onClick={centerEmail} className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" title="Reset view" data-testid="builder-zoom-reset">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Design / block panel */}
        <div className="w-72 shrink-0 overflow-y-auto border-l border-white/10 p-4 text-slate-200">
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white capitalize">{selected.type}</p>
                <button onClick={() => setSelectedId(null)} className="rounded p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3 text-xs">
                {(selected.type === "heading" || selected.type === "button") && (
                  <Field label="Text"><Input value={selected.props.text || ""} onChange={(e) => setBlockProps(selected.id, { text: e.target.value })} className="dark-input" /></Field>
                )}
                {selected.type === "heading" && (
                  <>
                    <Field label="Size">
                      <Select value={String(selected.props.level || 1)} onValueChange={(v) => setBlockProps(selected.id, { level: Number(v) })}>
                        <SelectTrigger className="dark-input h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Large</SelectItem>
                          <SelectItem value="2">Medium</SelectItem>
                          <SelectItem value="3">Small</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <label className="flex items-center gap-2 text-slate-300">
                      <input type="checkbox" checked={!!selected.props.banner} onChange={(e) => setBlockProps(selected.id, { banner: e.target.checked })} className="accent-[#711419]" />
                      Banner style (full-width color)
                    </label>
                    {selected.props.banner && (
                      <Field label="Banner color"><ColorInput value={selected.props.bannerColor || st.accent || "#711419"} onChange={(v) => setBlockProps(selected.id, { bannerColor: v })} /></Field>
                    )}
                  </>
                )}
                {selected.type === "paragraph" && (
                  <Field label="Text"><Textarea value={selected.props.text || ""} onChange={(e) => setBlockProps(selected.id, { text: e.target.value })} className="dark-input min-h-[110px]" /></Field>
                )}
                {selected.type === "button" && (
                  <>
                    <Field label="Link"><Input value={selected.props.href || ""} onChange={(e) => setBlockProps(selected.id, { href: e.target.value })} className="dark-input" /></Field>
                    <Field label="Color"><ColorInput value={selected.props.color || st.accent || "#711419"} onChange={(v) => setBlockProps(selected.id, { color: v })} /></Field>
                    <Field label="Align">
                      <Select value={selected.props.align || "center"} onValueChange={(v) => setBlockProps(selected.id, { align: v })}>
                        <SelectTrigger className="dark-input h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}
                {selected.type === "image" && (
                  <>
                    <Field label="Image URL"><Input value={selected.props.src || ""} onChange={(e) => setBlockProps(selected.id, { src: e.target.value })} className="dark-input" placeholder="https://…" /></Field>
                    <Field label="Alt text"><Input value={selected.props.alt || ""} onChange={(e) => setBlockProps(selected.id, { alt: e.target.value })} className="dark-input" /></Field>
                  </>
                )}
                {selected.type === "list" && (
                  <Field label="Items (one per line)"><Textarea value={selected.props.items || ""} onChange={(e) => setBlockProps(selected.id, { items: e.target.value })} className="dark-input min-h-[90px]" /></Field>
                )}
                {selected.type === "spacer" && (
                  <Field label="Height (px)"><Input type="number" value={selected.props.height || 24} onChange={(e) => setBlockProps(selected.id, { height: Number(e.target.value) })} className="dark-input" /></Field>
                )}
                <p className="pt-1 text-[10px] leading-relaxed text-slate-500">
                  Merge fields: {"{{first_name}}"}, {"{{name}}"}, {"{{company}}"}, {"{{email}}"}
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 text-sm font-semibold text-white">Design</p>
              <p className="mb-3 text-[11px] text-slate-400">Global styles for the whole email. Select a block to style it individually.</p>
              <div className="space-y-3 text-xs">
                <Field label="Font">
                  <Select value={st.font || "sans"} onValueChange={(v) => setStyles({ font: v })}>
                    <SelectTrigger className="dark-input h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sans">Sans (system)</SelectItem>
                      <SelectItem value="serif">Serif</SelectItem>
                      <SelectItem value="mono">Mono</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Text color"><ColorInput value={st.textColor || "#1f2937"} onChange={(v) => setStyles({ textColor: v })} /></Field>
                  <Field label="Accent (buttons)"><ColorInput value={st.accent || "#711419"} onChange={(v) => setStyles({ accent: v })} /></Field>
                  <Field label="Content background"><ColorInput value={st.contentBg || "#ffffff"} onChange={(v) => setStyles({ contentBg: v })} /></Field>
                  <Field label="Page background"><ColorInput value={st.pageBg || "#f1f3f4"} onChange={(v) => setStyles({ pageBg: v })} /></Field>
                </div>
                <Field label="Content width (px)">
                  <Input type="number" value={st.width || 600} onChange={(e) => setStyles({ width: Number(e.target.value) })} className="dark-input" />
                </Field>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Test send */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Send a test</DialogTitle></DialogHeader>
          <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@email.com" data-testid="test-email" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Cancel</Button>
            <Button className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={!testEmail.trim() || testSend.isPending} onClick={() => testSend.mutate()} data-testid="test-send">
              {testSend.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-slate-400">{label}</p>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 shrink-0 cursor-pointer rounded border border-white/20 bg-transparent" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="dark-input h-8 flex-1 font-mono text-[11px]" />
    </div>
  );
}

// ════════════════════════ AUDIENCES ════════════════════════

type AudFilter = { field: string; op: string; value: string };
type AudienceDef = { record: string; include: AudFilter[]; exclude: AudFilter[] };

type AudFieldDef = { key: string; label: string; kind: "select" | "text" | "number" | "date"; options?: string[]; ops?: boolean };

const AUD_RECORDS: { key: string; label: string; icon: typeof Users; hint: string }[] = [
  { key: "customers", label: "Customers", icon: Users, hint: "Type, status, source, agreements" },
  { key: "quotes", label: "Quotes", icon: FileText, hint: "Status, value, dates" },
  { key: "invoices", label: "Invoices", icon: Receipt, hint: "Paid, unpaid, value, dates" },
  { key: "agreements", label: "Agreements", icon: ShieldCheck, hint: "Status, expiration" },
  { key: "workOrders", label: "Work Orders", icon: Wrench, hint: "Status, visit type, schedule" },
  { key: "projects", label: "Projects", icon: Briefcase, hint: "Status, type, dates" },
];

const AUD_RECORD_FIELDS: Record<string, AudFieldDef[]> = {
  customers: [
    { key: "customerType", label: "Customer type", kind: "select", options: ["residential", "commercial", "property_manager"], ops: true },
    { key: "customerStatus", label: "Status", kind: "select", options: ["customer", "prospect"], ops: true },
    { key: "leadSource", label: "Lead source contains", kind: "text" },
    { key: "city", label: "Address contains", kind: "text" },
    { key: "hasAgreement", label: "Has active agreement", kind: "select", options: ["yes", "no"] },
    { key: "protectionPlan", label: "On a protection plan", kind: "select", options: ["yes", "no"] },
    { key: "createdAfter", label: "Created after", kind: "date" },
    { key: "createdBefore", label: "Created before", kind: "date" },
  ],
  quotes: [
    { key: "status", label: "Quote status", kind: "select", options: ["draft", "sent", "viewed", "accepted", "converted", "declined", "expired"], ops: true },
    { key: "totalGte", label: "Total at least ($)", kind: "number" },
    { key: "totalLte", label: "Total at most ($)", kind: "number" },
    { key: "createdAfter", label: "Created after", kind: "date" },
    { key: "createdBefore", label: "Created before", kind: "date" },
  ],
  invoices: [
    { key: "status", label: "Invoice status", kind: "select", options: ["draft", "sent", "partial", "paid", "void"], ops: true },
    { key: "totalGte", label: "Total at least ($)", kind: "number" },
    { key: "totalLte", label: "Total at most ($)", kind: "number" },
    { key: "balanceGte", label: "Balance due at least ($)", kind: "number" },
    { key: "paidAfter", label: "Paid after", kind: "date" },
    { key: "paidBefore", label: "Paid before", kind: "date" },
    { key: "createdAfter", label: "Created after", kind: "date" },
    { key: "createdBefore", label: "Created before", kind: "date" },
  ],
  agreements: [
    { key: "status", label: "Agreement status", kind: "select", options: ["pending", "active", "grace_period", "expired", "cancelled"], ops: true },
    { key: "endingBefore", label: "Ends before", kind: "date" },
    { key: "endingAfter", label: "Ends after", kind: "date" },
    { key: "createdAfter", label: "Created after", kind: "date" },
    { key: "createdBefore", label: "Created before", kind: "date" },
  ],
  workOrders: [
    { key: "status", label: "Work order status", kind: "select", options: ["scheduled", "dispatched", "en_route", "on_site", "completed", "cancelled"], ops: true },
    { key: "visitType", label: "Visit type", kind: "select", options: ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"], ops: true },
    { key: "scheduledAfter", label: "Scheduled after", kind: "date" },
    { key: "scheduledBefore", label: "Scheduled before", kind: "date" },
    { key: "createdAfter", label: "Created after", kind: "date" },
    { key: "createdBefore", label: "Created before", kind: "date" },
  ],
  projects: [
    { key: "status", label: "Project status", kind: "select", options: ["lead", "proposal_sent", "equipment_ordered", "equipment_arrived", "in_progress", "completed", "closed", "cancelled"], ops: true },
    { key: "projectType", label: "Project type", kind: "select", options: ["INSTALL", "DUCT", "COMMERCIAL", "CRAWLSPACE", "MAJOR_REPAIR"], ops: true },
    { key: "createdAfter", label: "Created after", kind: "date" },
    { key: "createdBefore", label: "Created before", kind: "date" },
  ],
};

const prettyOption = (v: string) => v.replace(/_/g, " ");

/** One include/exclude rule list — field picker, is/is-not where it applies,
 *  value input matched to the field's kind. */
function AudRuleList({
  record, rules, onChange, accent, emptyLabel, testidPrefix,
}: {
  record: string;
  rules: AudFilter[];
  onChange: (rules: AudFilter[]) => void;
  accent: "include" | "exclude";
  emptyLabel: string;
  testidPrefix: string;
}) {
  const fields = AUD_RECORD_FIELDS[record] || [];
  const fieldDef = (key: string) => fields.find((f) => f.key === key);

  return (
    <div>
      {rules.length === 0 ? (
        <p className="py-1.5 text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="space-y-1.5">
          {rules.map((rule, i) => {
            const def = fieldDef(rule.field);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  value={rule.field}
                  onValueChange={(v) => {
                    const d = fieldDef(v);
                    onChange(rules.map((x, j) => (j === i ? { field: v, op: "eq", value: d?.kind === "select" ? (d.options?.[0] ?? "") : "" } : x)));
                  }}
                >
                  <SelectTrigger className="w-48 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {def?.ops && (
                  <Select value={rule.op} onValueChange={(v) => onChange(rules.map((x, j) => (j === i ? { ...x, op: v } : x)))}>
                    <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">is</SelectItem>
                      <SelectItem value="neq">is not</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {def?.kind === "select" ? (
                  <Select value={rule.value} onValueChange={(v) => onChange(rules.map((x, j) => (j === i ? { ...x, value: v } : x)))}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {def.options!.map((o) => <SelectItem key={o} value={o}>{prettyOption(o)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : def?.kind === "date" ? (
                  <div className="flex-1"><DatePickerField value={rule.value} onChange={(v) => onChange(rules.map((x, j) => (j === i ? { ...x, value: v } : x)))} /></div>
                ) : (
                  <Input
                    value={rule.value}
                    onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, value: def?.kind === "number" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value } : x)))}
                    inputMode={def?.kind === "number" ? "decimal" : undefined}
                    className="h-9 flex-1"
                    placeholder="Value"
                  />
                )}
                <button onClick={() => onChange(rules.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => {
          const first = fields[0];
          onChange([...rules, { field: first.key, op: "eq", value: first.kind === "select" ? (first.options?.[0] ?? "") : "" }]);
        }}
        className={`mt-2 flex items-center gap-1 text-xs font-medium hover:underline ${accent === "exclude" ? "text-red-700" : "text-[#711419]"}`}
        data-testid={`${testidPrefix}-add`}
      >
        <Plus className="h-3.5 w-3.5" /> Add {accent === "exclude" ? "exclusion" : "rule"}
      </button>
    </div>
  );
}

export function AudiencesTab() {
  const { toast } = useToast();
  const { data: audiences = [], isLoading: audiencesLoading } = useQuery<Audience[]>({ queryKey: ["/api/marketing/audiences"] });

  const [view, setView] = useState<"list" | "build">("list");
  const [record, setRecord] = useState("customers");
  const [include, setInclude] = useState<AudFilter[]>([]);
  const [exclude, setExclude] = useState<AudFilter[]>([]);
  const [name, setName] = useState("");

  const def: AudienceDef = { record, include, exclude };

  const { data: preview, isFetching: previewing } = useQuery<{ count: number; sample: { name: string; email: string }[] }>({
    queryKey: ["/api/marketing/audiences/preview", def],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/audiences/preview", def);
      return res.json();
    },
  });

  const saveAudience = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/marketing/audiences", { name, filters: def }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/audiences"] });
      setName("");
      setView("list");
      toast({ title: "Audience saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });
  const deleteAudience = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/marketing/audiences/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/marketing/audiences"] }),
  });

  const pickRecord = (key: string) => {
    if (key === record) return;
    setRecord(key);
    setInclude([]);
    setExclude([]);
  };

  const loadAudience = (a: Audience) => {
    const f = a.filters as unknown;
    if (f && !Array.isArray(f) && typeof f === "object" && "record" in (f as any)) {
      const d = f as AudienceDef;
      setRecord(d.record);
      setInclude(d.include || []);
      setExclude(d.exclude || []);
    } else {
      setRecord("customers");
      setInclude(Array.isArray(f) ? (f as AudFilter[]) : []);
      setExclude([]);
    }
    setName(a.name);
    setView("build");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startNew = () => {
    setRecord("customers");
    setInclude([]);
    setExclude([]);
    setName("");
    setView("build");
  };

  const describeAudience = (a: Audience): string => {
    const f = a.filters as unknown;
    if (f && !Array.isArray(f) && typeof f === "object" && "record" in (f as any)) {
      const d = f as AudienceDef;
      const rec = AUD_RECORDS.find((r) => r.key === d.record)?.label || d.record;
      return `${rec} · ${(d.include || []).length || "no"} rule${(d.include || []).length === 1 ? "" : "s"}${(d.exclude || []).length ? ` · ${(d.exclude || []).length} exclusion${(d.exclude || []).length === 1 ? "" : "s"}` : ""}`;
    }
    const legacy = Array.isArray(f) ? (f as AudFilter[]) : [];
    return legacy.length === 0 ? "All customers with email" : legacy.map((x) => `${x.field}: ${x.value}`).join(" · ");
  };

  const stepLabel = "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400";
  const stepNum = "flex h-5 w-5 items-center justify-center rounded-[3px] bg-slate-900 text-[10px] font-bold text-white";

  if (view === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Audiences</h1>
            <p className="mt-0.5 text-sm text-slate-500">Saved segments stay live — counts update as the CRM changes.</p>
          </div>
          <Button className="bg-[#711419] hover:bg-[#8a1a1f]" onClick={startNew} data-testid="audience-new">
            <Plus className="mr-1.5 h-4 w-4" /> New audience
          </Button>
        </div>

        {audiencesLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-[4px]" />)}</div>
        ) : audiences.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-16 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No audiences yet</p>
            <p className="mt-0.5 text-xs text-slate-400">Build your first segment — it takes a minute.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
            {audiences.map((a) => (
              <div key={a.id} className="group flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-slate-50" data-testid={`audience-${a.id}`}>
                <Users className="h-4 w-4 shrink-0 text-[#711419]" strokeWidth={1.75} />
                <button onClick={() => loadAudience(a)} className="min-w-0 flex-1 text-left" title="Open in the builder">
                  <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                  <p className="text-[11px] text-slate-400">{describeAudience(a)}</p>
                </button>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{a.count ?? "—"}</span>
                <button onClick={() => deleteAudience.mutate(a.id)} className="rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setView("list")} className="text-sm font-medium text-slate-500 hover:text-slate-900" data-testid="audience-back">
          ← Audiences
        </button>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-slate-900">
          {name ? name : "New audience"}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Start from a record, say who's in and who's out — saved segments stay live.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* ── The wizard, one page ── */}
        <div className="space-y-4">
          <div className="rounded-[4px] border border-slate-300/70 bg-white p-4">
            <p className={stepLabel}><span className={stepNum}>1</span> Start from a record</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AUD_RECORDS.map((r) => {
                const Icon = r.icon;
                const on = record === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => pickRecord(r.key)}
                    className={`rounded-[4px] border p-3 text-left transition-colors ${on ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-300/70 hover:border-slate-900"}`}
                    data-testid={`audience-record-${r.key}`}
                  >
                    <Icon className={`h-4 w-4 ${on ? "text-[#711419]" : "text-slate-400"}`} strokeWidth={1.75} />
                    <p className={`mt-1.5 text-sm font-semibold ${on ? "text-[#711419]" : "text-slate-900"}`}>{r.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{r.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[4px] border border-slate-300/70 bg-white p-4">
            <p className={stepLabel}><span className={stepNum}>2</span> Who's included</p>
            <p className="mb-2 mt-1 text-[11px] text-slate-400">
              Customers with {record === "customers" ? "these traits" : `at least one matching ${AUD_RECORDS.find((r) => r.key === record)?.label.toLowerCase().replace(/s$/, "")}`} — always limited to people with an email address.
            </p>
            <AudRuleList
              record={record}
              rules={include}
              onChange={setInclude}
              accent="include"
              emptyLabel={record === "customers" ? "Everyone with an email address." : `Anyone with a ${AUD_RECORDS.find((r) => r.key === record)?.label.toLowerCase().replace(/s$/, "")} on file.`}
              testidPrefix="audience-include"
            />
          </div>

          <div className="rounded-[4px] border border-slate-300/70 bg-white p-4">
            <p className={stepLabel}><span className={stepNum}>3</span> Who's left out</p>
            <p className="mb-2 mt-1 text-[11px] text-slate-400">Anyone matching these is removed from the audience, even if they matched above.</p>
            <AudRuleList
              record={record}
              rules={exclude}
              onChange={setExclude}
              accent="exclude"
              emptyLabel="No exclusions."
              testidPrefix="audience-exclude"
            />
          </div>

          <div className="rounded-[4px] border border-slate-300/70 bg-white p-4">
            <p className={stepLabel}><span className={stepNum}>4</span> Save for reuse</p>
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Audience name (e.g. Unsold install quotes 90d)"
                className="h-9 flex-1"
                data-testid="audience-name"
              />
              <Button
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                disabled={!name.trim() || saveAudience.isPending}
                onClick={() => saveAudience.mutate()}
                data-testid="audience-save"
              >
                <Save className="mr-1.5 h-4 w-4" /> Save audience
              </Button>
            </div>
          </div>
        </div>

        {/* ── Live preview rail ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[4px] border border-slate-300/70 bg-white p-4" data-testid="audience-preview">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Users className="h-3.5 w-3.5" /> Live preview
            </p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">
              {previewing ? <Loader2 className="h-6 w-6 animate-spin text-slate-300" /> : (preview?.count ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">customers match right now</p>
            {preview?.sample && preview.sample.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                {preview.sample.map((s, i) => (
                  <p key={i} className="truncate text-xs text-slate-600">{s.name} <span className="text-slate-300">· {s.email}</span></p>
                ))}
                {(preview.count ?? 0) > preview.sample.length && (
                  <p className="text-[11px] text-slate-400">…and {(preview.count - preview.sample.length).toLocaleString()} more</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// ════════════════════════ LEAD SOURCES ════════════════════════

type LeadSourceRow = {
  source: string;
  leads: number;
  leads30: number;
  won: number;
  lastLeadAt: string | null;
  revenue: number;
  revenue90: number;
  configId: string | null;
  monthlyCostCents: number;
  notes: string;
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function LeadSourcesTab() {
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery<LeadSourceRow[]>({
    queryKey: ["/api/marketing/lead-sources"],
  });

  // One dialog covers both flows: editing an existing source's cost/notes and
  // pre-registering a source that hasn't produced a lead yet.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExisting, setEditingExisting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCost, setFormCost] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const save = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/marketing/lead-sources", {
        name: formName,
        monthlyCostCents: Math.round((parseFloat(formCost) || 0) * 100),
        notes: formNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/lead-sources"] });
      setDialogOpen(false);
      toast({ title: "Lead source saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });

  const openEdit = (r: LeadSourceRow) => {
    setEditingExisting(true);
    setFormName(r.source);
    setFormCost(r.monthlyCostCents ? String(r.monthlyCostCents / 100) : "");
    setFormNotes(r.notes || "");
    setDialogOpen(true);
  };
  const openAdd = () => {
    setEditingExisting(false);
    setFormName("");
    setFormCost("");
    setFormNotes("");
    setDialogOpen(true);
  };

  const attributed = rows.filter((r) => r.source !== "(unattributed)");
  const unattributed = rows.find((r) => r.source === "(unattributed)");
  const totalLeads30 = attributed.reduce((s, r) => s + r.leads30, 0);
  const totalRevenue = attributed.reduce((s, r) => s + r.revenue, 0);
  const totalCostMo = attributed.reduce((s, r) => s + r.monthlyCostCents, 0) / 100;

  const kpis = [
    { label: "Sources tracked", value: String(attributed.length) },
    { label: "New leads (30d)", value: String(totalLeads30) },
    { label: "Attributed revenue", value: usd(totalRevenue) },
    { label: "Monthly spend", value: usd(totalCostMo) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Lead Sources</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Where customers come from and what each channel is worth. Sources appear automatically from the
            Lead Source field on CRM customers.
          </p>
        </div>
        <Button className="bg-[#711419] hover:bg-[#8a1a1f]" onClick={openAdd} data-testid="lead-source-add">
          <Plus className="mr-1.5 h-4 w-4" /> Track a source
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[4px] border border-slate-300/70 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {isLoading ? "—" : k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Source table */}
      <div className="overflow-x-auto rounded-[4px] border border-slate-300/70 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-2.5">Source</th>
              <th className="px-3 py-2.5 text-right">Leads</th>
              <th className="px-3 py-2.5 text-right">New (30d)</th>
              <th className="px-3 py-2.5 text-right">Customers</th>
              <th className="px-3 py-2.5 text-right">Win rate</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right">Last 90d</th>
              <th className="px-3 py-2.5 text-right">Cost / mo</th>
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [0, 1, 2, 3].map((i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3" colSpan={9}><Skeleton className="h-4 w-full" /></td>
                </tr>
              ))
            ) : attributed.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={9}>
                  No lead sources yet — set the Lead Source field on customers in the CRM and they'll show up here.
                </td>
              </tr>
            ) : (
              attributed.map((r) => {
                const winRate = r.leads > 0 ? Math.round((r.won / r.leads) * 100) : 0;
                return (
                  <tr
                    key={r.source}
                    className="group cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    onClick={() => openEdit(r)}
                    data-testid={`lead-source-row-${r.source}`}
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-slate-900">{r.source}</p>
                      {r.notes && <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{r.notes}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.leads}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.leads30}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.won}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{winRate}%</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{usd(r.revenue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{usd(r.revenue90)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {r.monthlyCostCents > 0 ? usd(r.monthlyCostCents / 100) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <ChevronDown className="h-4 w-4 -rotate-90 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </td>
                  </tr>
                );
              })
            )}
            {!isLoading && unattributed && unattributed.leads > 0 && (
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-500">Unattributed</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Customers without a lead source set</p>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{unattributed.leads}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{unattributed.leads30}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{unattributed.won}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">—</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{usd(unattributed.revenue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{usd(unattributed.revenue90)}</td>
                <td className="px-3 py-2.5 text-right text-slate-300">—</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExisting ? formName : "Track a lead source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editingExisting && (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Source name</p>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Google Ads, Referral, Yard sign"
                  className="h-9"
                  data-testid="lead-source-name"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Match the spelling used in the customer Lead Source field so stats line up.
                </p>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Monthly cost ($)</p>
              <Input
                value={formCost}
                onChange={(e) => setFormCost(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                inputMode="decimal"
                className="h-9"
                data-testid="lead-source-cost"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Notes</p>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Campaign details, account, rep contact…"
                rows={3}
                data-testid="lead-source-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={!formName.trim() || save.isPending}
              onClick={() => save.mutate()}
              data-testid="lead-source-save"
            >
              <Save className="mr-1.5 h-4 w-4" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
