import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, X, ArrowLeft, Save, Send, Trash2, ChevronUp, ChevronDown,
  Heading1, AlignLeft, MousePointerClick, Image as ImageIcon, ListOrdered,
  Minus, MoveVertical, Users, Filter as FilterIcon, Loader2, Mail, CheckCircle2,
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
type Template = { id: string; name: string; subject: string | null; design: Design; updated_at: string; createdByName?: string | null };
type Audience = { id: string; name: string; filters: { field: string; op: string; value: string }[]; count?: number | null };
type Campaign = {
  id: string; name: string; subject: string | null; status: string;
  template_id: string; audience_id: string; templateName?: string; audienceName?: string;
  recipient_count: number; sent_count: number; failed_count: number; sent_at: string | null; created_at: string;
};

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
  const [editing, setEditing] = useState<Template | "new" | null>(null);

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/marketing/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/marketing/templates"] }),
  });

  if (editing) {
    return (
      <TemplateBuilder
        template={editing === "new" ? null : editing}
        onClose={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ["/api/marketing/templates"] }); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Templates</h1>
          <p className="mt-0.5 text-sm text-slate-500">Reusable emails with merge fields — built visually.</p>
        </div>
        <Button className="bg-[#711419] hover:bg-[#8a1a1f]" onClick={() => setEditing("new")} data-testid="template-new">
          <Plus className="mr-1.5 h-4 w-4" /> New template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-[4px]" />)}</div>
      ) : templates.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-16 text-center">
          <Mail className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No templates yet</p>
          <p className="mt-0.5 text-xs text-slate-400">Build your first email — it takes a minute.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="group flex flex-col rounded-[4px] border border-slate-300/70 bg-white p-4 transition-colors hover:border-slate-900" data-testid={`template-${t.id}`}>
              <button onClick={() => setEditing(t)} className="flex-1 text-left">
                <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{t.subject || "No subject yet"}</p>
                <p className="mt-2 text-[11px] text-slate-400">
                  {t.design?.blocks?.length ?? 0} blocks · {format(new Date(t.updated_at), "MMM d, h:mm a")}
                </p>
              </button>
              <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => deleteTemplate.mutate(t.id)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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

  const setStyles = (patch: Partial<Design["styles"]>) => setDesign((d) => ({ ...d, styles: { ...d.styles, ...patch } }));
  const setBlockProps = (id: string, patch: Record<string, any>) =>
    setDesign((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...patch } } : b)) }));
  const addBlock = (type: Block["type"]) => {
    const def = BLOCK_DEFS.find((x) => x.type === type)!;
    const block = { id: uid(), type, props: { ...def.defaults } };
    setDesign((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedId(block.id);
  };
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
                  onClick={() => addBlock(d.type)}
                  className="flex items-center gap-1.5 rounded-[4px] border border-white/10 bg-white/5 px-2 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
                  data-testid={`insert-${d.type}`}
                >
                  <Icon className="h-3.5 w-3.5 text-[#e8704f]" /> {d.label}
                </button>
              );
            })}
          </div>

          <p className="mb-1.5 mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Layers</p>
          <div className="space-y-0.5">
            {design.blocks.map((b, i) => {
              const def = BLOCK_DEFS.find((x) => x.type === b.type)!;
              const Icon = def.icon;
              const label = b.props.text || b.props.items || def.label;
              return (
                <div
                  key={b.id}
                  className={`group flex items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-xs ${selectedId === b.id ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}
                >
                  <button onClick={() => setSelectedId(b.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    <Icon className="h-3 w-3 shrink-0 text-slate-500" />
                    <span className="truncate">{String(label).slice(0, 26)}</span>
                  </button>
                  <button onClick={() => moveBlock(b.id, -1)} disabled={i === 0} className="hidden rounded p-0.5 text-slate-500 hover:text-white disabled:opacity-30 group-hover:block"><ChevronUp className="h-3 w-3" /></button>
                  <button onClick={() => moveBlock(b.id, 1)} disabled={i === design.blocks.length - 1} className="hidden rounded p-0.5 text-slate-500 hover:text-white disabled:opacity-30 group-hover:block"><ChevronDown className="h-3 w-3" /></button>
                  <button onClick={() => removeBlock(b.id)} className="hidden rounded p-0.5 text-slate-500 hover:text-red-400 group-hover:block"><Trash2 className="h-3 w-3" /></button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div
          className="min-w-0 flex-1 overflow-y-auto p-8"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
          onClick={() => setSelectedId(null)}
        >
          <div
            className="mx-auto overflow-hidden rounded-lg shadow-2xl"
            style={{ width: st.width || 600, maxWidth: "100%", background: st.contentBg }}
            onClick={(e) => e.stopPropagation()}
            data-testid="builder-canvas"
          >
            <div className="py-3" style={{ background: st.contentBg }}>
              {design.blocks.map((b) => (
                <div key={b.id} onClick={() => setSelectedId(b.id)}>{renderBlock(b)}</div>
              ))}
              {design.blocks.length === 0 && (
                <p className="py-16 text-center text-sm text-slate-400">Add blocks from the left panel.</p>
              )}
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

const AUDIENCE_FIELDS = [
  { key: "customerType", label: "Customer type", kind: "select", options: ["Residential", "Commercial", "Property Manager"] },
  { key: "customerStatus", label: "Status", kind: "select", options: ["customer", "prospect"] },
  { key: "leadSource", label: "Lead source contains", kind: "text" },
  { key: "city", label: "City contains", kind: "text" },
  { key: "hasAgreement", label: "Has active agreement", kind: "select", options: ["yes", "no"] },
  { key: "createdAfter", label: "Created after", kind: "date" },
  { key: "createdBefore", label: "Created before", kind: "date" },
] as const;

export function AudiencesTab() {
  const { toast } = useToast();
  const { data: audiences = [] } = useQuery<Audience[]>({ queryKey: ["/api/marketing/audiences"] });
  const [filters, setFilters] = useState<{ field: string; op: string; value: string }[]>([]);
  const [name, setName] = useState("");

  const { data: preview, isFetching: previewing } = useQuery<{ count: number; sample: { name: string; email: string }[] }>({
    queryKey: ["/api/marketing/audiences/preview", filters],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/audiences/preview", { filters });
      return res.json();
    },
  });

  const saveAudience = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/marketing/audiences", { name, filters }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/audiences"] });
      setName("");
      toast({ title: "Audience saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });
  const deleteAudience = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/marketing/audiences/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/marketing/audiences"] }),
  });

  const fieldDef = (key: string) => AUDIENCE_FIELDS.find((f) => f.key === key);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Audiences</h1>
        <p className="mt-0.5 text-sm text-slate-500">Saved customer segments straight from the CRM — always up to date.</p>
      </div>

      {/* Builder */}
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <FilterIcon className="h-3.5 w-3.5" /> Build a segment
          </p>
          <button
            onClick={() => setFilters((p) => [...p, { field: "customerType", op: "eq", value: "Residential" }])}
            className="flex items-center gap-1 text-xs font-medium text-[#711419] hover:underline"
            data-testid="audience-add-filter"
          >
            <Plus className="h-3.5 w-3.5" /> Add filter
          </button>
        </div>

        {filters.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">No filters — every customer with an email address.</p>
        ) : (
          <div className="space-y-1.5">
            {filters.map((flt, i) => {
              const def = fieldDef(flt.field);
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <Select value={flt.field} onValueChange={(v) => {
                    const d = fieldDef(v);
                    setFilters((p) => p.map((x, j) => (j === i ? { field: v, op: "eq", value: d?.kind === "select" ? (d.options?.[0] ?? "") : "" } : x)));
                  }}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {def?.kind === "select" ? (
                    <Select value={flt.value} onValueChange={(v) => setFilters((p) => p.map((x, j) => (j === i ? { ...x, value: v } : x)))}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {def.options!.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : def?.kind === "date" ? (
                    <div className="flex-1">
                      <DatePickerField value={flt.value} onChange={(v) => setFilters((p) => p.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
                    </div>
                  ) : (
                    <Input value={flt.value} onChange={(e) => setFilters((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-9 flex-1" placeholder="Value" />
                  )}
                  <button onClick={() => setFilters((p) => p.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* Live preview */}
        <div className="mt-3 rounded-[4px] bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">
            {previewing ? "Counting…" : `${preview?.count ?? 0} customers match`}
            <span className="ml-1.5 text-xs font-normal text-slate-400">(with email addresses)</span>
          </p>
          {preview?.sample && preview.sample.length > 0 && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
              {preview.sample.map((s) => s.name).join(", ")}
              {preview.count > preview.sample.length ? "…" : ""}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Audience name (e.g. Residential w/o agreement)" className="h-9 flex-1" data-testid="audience-name" />
          <Button className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={!name.trim() || saveAudience.isPending} onClick={() => saveAudience.mutate()} data-testid="audience-save">
            <Save className="mr-1.5 h-4 w-4" /> Save audience
          </Button>
        </div>
      </div>

      {/* Saved audiences */}
      {audiences.length > 0 && (
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
          {audiences.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-slate-50" data-testid={`audience-${a.id}`}>
              <Users className="h-4 w-4 shrink-0 text-[#711419]" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                <p className="text-[11px] text-slate-400">
                  {(a.filters || []).length === 0 ? "All customers with email" : (a.filters || []).map((f) => `${fieldDef(f.field)?.label ?? f.field}: ${f.value}`).join(" · ")}
                </p>
              </div>
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

// ════════════════════════ CAMPAIGNS ════════════════════════

const CAMPAIGN_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600" },
  sending: { label: "Sending…", cls: "bg-amber-50 text-amber-700" },
  sent: { label: "Sent", cls: "bg-green-50 text-green-700" },
};

export function CampaignsTab() {
  const { toast } = useToast();
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/marketing/campaigns"],
    refetchInterval: (q) => ((q.state.data as Campaign[] | undefined)?.some((c) => c.status === "sending") ? 4000 : false),
  });
  const { data: templates = [] } = useQuery<Template[]>({ queryKey: ["/api/marketing/templates"] });
  const { data: audiences = [] } = useQuery<Audience[]>({ queryKey: ["/api/marketing/audiences"] });

  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cTemplate, setCTemplate] = useState("");
  const [cAudience, setCAudience] = useState("");
  const [cSubject, setCSubject] = useState("");
  const [confirmSend, setConfirmSend] = useState<Campaign | null>(null);

  const createCampaign = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/marketing/campaigns", { name: cName, templateId: cTemplate, audienceId: cAudience, subject: cSubject || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
      setCreateOpen(false);
      setCName(""); setCTemplate(""); setCAudience(""); setCSubject("");
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't create campaign", variant: "destructive" }),
  });
  const sendCampaign = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/marketing/campaigns/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
      setConfirmSend(null);
      toast({ title: "Campaign is sending", description: "Delivery runs in the background — status updates live." });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't send", variant: "destructive" }),
  });
  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/marketing/campaigns/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Campaigns</h1>
          <p className="mt-0.5 text-sm text-slate-500">A template × an audience — sent through Resend with live status.</p>
        </div>
        <Button className="bg-[#711419] hover:bg-[#8a1a1f]" onClick={() => setCreateOpen(true)} data-testid="campaign-new">
          <Plus className="mr-1.5 h-4 w-4" /> New campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-16 text-center">
          <Send className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No campaigns yet</p>
          <p className="mt-0.5 text-xs text-slate-400">Build a template and an audience first, then launch here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
          {campaigns.map((c) => {
            const stt = CAMPAIGN_STATUS[c.status] || CAMPAIGN_STATUS.draft;
            return (
              <div key={c.id} className="group flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50" data-testid={`campaign-${c.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                    <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase ${stt.cls}`}>{stt.label}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {c.templateName || "template"} → {c.audienceName || "audience"}
                    {c.status === "sent" && c.sent_at ? ` · sent ${format(new Date(c.sent_at), "MMM d, h:mm a")}` : ""}
                  </p>
                </div>
                {(c.status === "sent" || c.status === "sending") && (
                  <span className="shrink-0 text-xs tabular-nums text-slate-500" data-testid={`campaign-stats-${c.id}`}>
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-green-600" />
                    {c.sent_count}/{c.recipient_count}
                    {c.failed_count > 0 && <span className="ml-1 text-red-600">({c.failed_count} failed)</span>}
                  </span>
                )}
                {c.status === "draft" && (
                  <>
                    <Button size="sm" className="h-8 shrink-0 bg-[#711419] hover:bg-[#8a1a1f]" onClick={() => setConfirmSend(c)} data-testid={`campaign-send-${c.id}`}>
                      <Send className="mr-1.5 h-3.5 w-3.5" /> Send now
                    </Button>
                    <button onClick={() => deleteCampaign.mutate(c.id)} className="rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New campaign</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Campaign name" data-testid="campaign-name" />
            <Select value={cTemplate} onValueChange={setCTemplate}>
              <SelectTrigger data-testid="campaign-template"><SelectValue placeholder="Choose a template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cAudience} onValueChange={setCAudience}>
              <SelectTrigger data-testid="campaign-audience"><SelectValue placeholder="Choose an audience" /></SelectTrigger>
              <SelectContent>
                {audiences.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.count != null ? ` (${a.count})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={cSubject} onChange={(e) => setCSubject(e.target.value)} placeholder="Subject override (optional — uses the template's)" data-testid="campaign-subject" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={!cName.trim() || !cTemplate || !cAudience || createCampaign.isPending} onClick={() => createCampaign.mutate()} data-testid="campaign-create">
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm send */}
      <Dialog open={!!confirmSend} onOpenChange={(o) => !o && setConfirmSend(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Send “{confirmSend?.name}”?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            This emails everyone in <span className="font-semibold">{confirmSend?.audienceName}</span> right now. There's no undo once it starts.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(null)}>Cancel</Button>
            <Button className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={sendCampaign.isPending} onClick={() => confirmSend && sendCampaign.mutate(confirmSend.id)} data-testid="campaign-confirm-send">
              {sendCampaign.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Send campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
