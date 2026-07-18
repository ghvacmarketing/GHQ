import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Plus, Trash2, Send, Save, PenTool, Type, Calendar, UserSquare, Hash, CheckCircle2, Copy, DollarSign,
} from "lucide-react";
import type { CrmUser, SignatureDocument, SignatureRecipient, SignatureField } from "@shared/schema";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type DocDetail = SignatureDocument & { recipients: SignatureRecipient[]; fields: SignatureField[] };

type WorkingField = {
  id: string;
  recipientId: string;
  page: number;
  type: string;
  x: number; y: number; width: number; height: number;
  required: boolean;
};

const FIELD_TYPES = [
  { type: "signature", label: "Signature", icon: PenTool, w: 0.24, h: 0.06 },
  { type: "initials", label: "Initials", icon: Hash, w: 0.12, h: 0.05 },
  { type: "name", label: "Full Name", icon: UserSquare, w: 0.22, h: 0.04 },
  { type: "date", label: "Date", icon: Calendar, w: 0.16, h: 0.04 },
  { type: "text", label: "Text", icon: Type, w: 0.22, h: 0.04 },
  // Placed from the Deposit section (not the field palette). Renders as a
  // "Pay $X" button on the signing page.
  { type: "payment", label: "Payment", icon: DollarSign, w: 0.26, h: 0.055 },
];

export default function CrmEsignEditor() {
  const [, params] = useRoute("/crm/esign/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const docId = params?.id;

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  const { data: doc, isLoading } = useQuery<DocDetail>({
    queryKey: ["/api/crm/signature-documents", docId],
    enabled: !!currentUser && !!docId,
  });

  const isDraft = doc?.status === "draft";

  // Local field + recipient state
  const [fields, setFields] = useState<WorkingField[]>([]);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>("signature");
  const [dirty, setDirty] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(700);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number; page: number } | null>(null);
  const seededRef = useRef<string | null>(null);

  // Seed local state from server
  useEffect(() => {
    if (!doc) return;
    // Seed the editable state (fields + deposit form) only ONCE per document.
    // Otherwise a refetch — e.g. after saving the deposit or adding a recipient —
    // re-runs this effect and wipes unsaved field placements the user is mid-edit.
    if (seededRef.current !== doc.id) {
      seededRef.current = doc.id;
      setFields(doc.fields.map((f) => ({
        id: f.id, recipientId: f.recipientId, page: f.page, type: f.type,
        x: f.x, y: f.y, width: f.width, height: f.height, required: f.required,
      })));
      setDirty(false);
      // Seed the deposit amount from the saved document
      setDepAmount(doc.depositAmountCents ? (doc.depositAmountCents / 100).toString() : "");
    }
    if (doc.recipients.length && !activeRecipientId) {
      setActiveRecipientId(doc.recipients[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Responsive page width
  useEffect(() => {
    const measure = () => {
      const w = containerRef.current?.clientWidth ?? 700;
      setPageWidth(Math.min(820, Math.max(320, w - 32)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [doc]);

  const recipientById = useMemo(() => {
    const m = new Map<string, SignatureRecipient>();
    doc?.recipients.forEach((r) => m.set(r.id, r));
    return m;
  }, [doc]);

  // ---- Recipient mutations ----
  const [recipName, setRecipName] = useState("");
  const [recipEmail, setRecipEmail] = useState("");

  // ---- Deposit / payment request (simple: just an amount) ----
  const [depAmount, setDepAmount] = useState("");
  const depositAmountNum = parseFloat(depAmount || "0") || 0;

  const saveDeposit = useMutation({
    mutationFn: async () => {
      const body = depositAmountNum > 0
        ? { enabled: true, mode: "amount", amountDollars: depositAmountNum }
        : { enabled: false };
      const res = await apiRequest("PUT", `/api/crm/signature-documents/${docId}/deposit`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents", docId] });
      toast({ title: depositAmountNum > 0 ? "Amount saved — now place the Pay button" : "Deposit removed" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save deposit", variant: "destructive" }),
  });

  const addRecipient = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/signature-documents/${docId}/recipients`, {
        name: recipName.trim(), email: recipEmail.trim(),
      });
      return res.json();
    },
    onSuccess: (r: SignatureRecipient) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents", docId] });
      setRecipName(""); setRecipEmail("");
      setActiveRecipientId(r.id);
    },
    onError: (e: Error) => toast({ title: "Could not add recipient", description: e.message, variant: "destructive" }),
  });

  const removeRecipient = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/signature-documents/${docId}/recipients/${id}`),
    onSuccess: (_d, id) => {
      setFields((prev) => prev.filter((f) => f.recipientId !== id));
      if (activeRecipientId === id) setActiveRecipientId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents", docId] });
    },
    onError: (e: Error) => toast({ title: "Could not remove recipient", description: e.message, variant: "destructive" }),
  });

  // ---- Field persistence ----
  const saveFields = useMutation({
    mutationFn: async () => {
      const payload = fields.map((f) => ({
        recipientId: f.recipientId, page: f.page, type: f.type,
        x: f.x, y: f.y, width: f.width, height: f.height, required: f.required,
      }));
      const res = await apiRequest("PUT", `/api/crm/signature-documents/${docId}/fields`, { fields: payload });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents", docId] });
      setDirty(false);
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Could not save fields", description: e.message, variant: "destructive" }),
  });

  const [sendOpen, setSendOpen] = useState(false);
  const [sendResults, setSendResults] = useState<Array<{ email: string; emailed: boolean; url: string }> | null>(null);

  const sendDoc = useMutation({
    mutationFn: async () => {
      if (dirty) {
        const payload = fields.map((f) => ({
          recipientId: f.recipientId, page: f.page, type: f.type,
          x: f.x, y: f.y, width: f.width, height: f.height, required: f.required,
        }));
        await apiRequest("PUT", `/api/crm/signature-documents/${docId}/fields`, { fields: payload });
      }
      const res = await apiRequest("POST", `/api/crm/signature-documents/${docId}/send`, {});
      return res.json();
    },
    onSuccess: (data: { recipients: Array<{ email: string; emailed: boolean; url: string }> }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents", docId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents"] });
      setSendResults(data.recipients);
      setDirty(false);
    },
    onError: (e: Error) => toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  // ---- Field placement / drag ----
  const placeField = (pageNum: number, e: React.MouseEvent) => {
    if (!isDraft) return;
    if (!activeRecipientId) {
      toast({ title: "Select a recipient first", description: "Choose who this field is for, then click to place it." });
      return;
    }
    // Ignore clicks that originated on an existing field (drag handled separately)
    if ((e.target as HTMLElement).closest("[data-field-box]")) return;
    const wrap = pageRefs.current[pageNum];
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const def = FIELD_TYPES.find((t) => t.type === activeTool)!;
    let x = (e.clientX - rect.left) / rect.width - def.w / 2;
    let y = (e.clientY - rect.top) / rect.height - def.h / 2;
    x = Math.max(0, Math.min(1 - def.w, x));
    y = Math.max(0, Math.min(1 - def.h, y));
    const newField: WorkingField = {
      id: (crypto as any).randomUUID ? crypto.randomUUID() : `tmp-${Date.now()}-${Math.random()}`,
      recipientId: activeRecipientId, page: pageNum, type: activeTool,
      x, y, width: def.w, height: def.h, required: activeTool !== "payment",
    };
    setFields((prev) => [...prev, newField]);
    setDirty(true);
  };

  const onFieldPointerDown = (fieldId: string, pageNum: number, e: React.PointerEvent) => {
    if (!isDraft) return;
    e.stopPropagation();
    const wrap = pageRefs.current[pageNum];
    const f = fields.find((x) => x.id === fieldId);
    if (!wrap || !f) return;
    const rect = wrap.getBoundingClientRect();
    dragState.current = {
      id: fieldId, page: pageNum,
      offsetX: (e.clientX - rect.left) / rect.width - f.x,
      offsetY: (e.clientY - rect.top) / rect.height - f.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onFieldPointerMove = (e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds) return;
    const wrap = pageRefs.current[ds.page];
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setFields((prev) => prev.map((f) => {
      if (f.id !== ds.id) return f;
      let x = (e.clientX - rect.left) / rect.width - ds.offsetX;
      let y = (e.clientY - rect.top) / rect.height - ds.offsetY;
      x = Math.max(0, Math.min(1 - f.width, x));
      y = Math.max(0, Math.min(1 - f.height, y));
      return { ...f, x, y };
    }));
    setDirty(true);
  };

  const onFieldPointerUp = () => { dragState.current = null; };

  const deleteField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setDirty(true);
  };

  // Documents stream via the public /objects path; use originalObjectPath directly.
  const pdfUrl = doc?.originalObjectPath || "";

  const copyLink = (url: string) => {
    navigator.clipboard?.writeText(url);
    toast({ title: "Link copied" });
  };

  if (!currentUser) return null;

  if (isLoading || !doc) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </CrmLayout>
    );
  }

  const fieldsByRecipient = new Map<string, number>();
  fields.forEach((f) => fieldsByRecipient.set(f.recipientId, (fieldsByRecipient.get(f.recipientId) || 0) + 1));

  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";

  return (
    <CrmLayout currentUser={currentUser} disableScroll>
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 bg-white">
          <Button variant="ghost" size="icon" className="text-slate-600 hover:text-slate-900" onClick={() => navigate("/crm/esign")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-slate-900 truncate" data-testid="text-doc-title">{doc.title}</h1>
              <StatusDot
                pill={doc.status === "draft" ? "bg-slate-100 text-slate-700 border-slate-200" : doc.status === "sent" ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-green-100 text-green-700 border-green-200"}
              >
                {doc.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {doc.status === "sent" && <Send className="mr-1 h-3 w-3" />}
                {doc.status === "draft" ? "Draft" : doc.status === "sent" ? "Out for signature" : doc.status === "completed" ? "Completed" : doc.status}
              </StatusDot>
            </div>
            <p className="text-xs text-slate-500">
              {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} · {doc.recipients.length} recipient{doc.recipients.length === 1 ? "" : "s"} · {fields.length} field{fields.length === 1 ? "" : "s"}
            </p>
          </div>
          {isDraft && (
            <>
              {dirty && <span className="hidden sm:inline text-xs text-amber-600 font-medium">Unsaved changes</span>}
              <Button variant="outline" onClick={() => saveFields.mutate()} disabled={saveFields.isPending || !dirty} data-testid="button-save">
                {saveFields.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button className="bg-[#711419] hover:bg-[#5a1014]" onClick={() => { setSendResults(null); setSendOpen(true); }} data-testid="button-open-send">
                <Send className="mr-2 h-4 w-4" /> Send
              </Button>
            </>
          )}
          {doc.status === "completed" && doc.signedObjectPath && (
            <Button variant="outline" onClick={() => window.open(doc.signedObjectPath!, "_blank")} data-testid="button-download-signed">
              <Save className="mr-2 h-4 w-4" /> Download Signed PDF
            </Button>
          )}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-72 border-r border-slate-200 overflow-y-auto p-4 space-y-6 bg-slate-50/70 shrink-0 hidden md:block">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recipients</h3>
                <span className="text-xs text-slate-400">{doc.recipients.length}</span>
              </div>
              <div className="space-y-2">
                {doc.recipients.map((r) => {
                  const active = activeRecipientId === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`rounded-lg border bg-white p-2.5 cursor-pointer transition-all ${active ? "border-transparent ring-2 shadow-sm" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}
                      style={active ? { ["--tw-ring-color" as any]: r.color } : {}}
                      onClick={() => setActiveRecipientId(r.id)}
                      data-testid={`recipient-${r.id}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: r.color }}
                        >
                          {initials(r.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                          <div className="text-xs text-slate-500 truncate">{r.email}</div>
                        </div>
                        {isDraft ? (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-slate-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); removeRecipient.mutate(r.id); }} data-testid={`button-remove-recipient-${r.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] capitalize">{r.status}</Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 pl-[42px] text-[11px] text-slate-500">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: (fieldsByRecipient.get(r.id) || 0) > 0 ? r.color : "#cbd5e1" }}
                        />
                        {fieldsByRecipient.get(r.id) || 0} field{(fieldsByRecipient.get(r.id) || 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                  );
                })}
                {doc.recipients.length === 0 && (
                  <p className="text-xs text-slate-400 rounded-lg border border-dashed border-slate-300 p-3 text-center">No recipients yet.</p>
                )}
              </div>

              {isDraft && (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
                  <p className="text-[11px] font-medium text-slate-600">Add a recipient</p>
                  <Input placeholder="Name" value={recipName} onChange={(e) => setRecipName(e.target.value)} className="h-9" data-testid="input-recipient-name" />
                  <Input placeholder="Email" type="email" value={recipEmail} onChange={(e) => setRecipEmail(e.target.value)} className="h-9" data-testid="input-recipient-email" />
                  <Button
                    size="sm" className="w-full bg-[#711419] hover:bg-[#5a1014]"
                    disabled={!recipName.trim() || !recipEmail.trim() || addRecipient.isPending}
                    onClick={() => addRecipient.mutate()}
                    data-testid="button-add-recipient"
                  >
                    {addRecipient.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                    Add recipient
                  </Button>
                </div>
              )}
            </div>

            {isDraft && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Fields</h3>
                {!activeRecipientId ? (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-2">
                    Select a recipient above first, then choose a field and click on the document.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mb-2">
                    Placing fields for{" "}
                    <span className="font-medium" style={{ color: recipientById.get(activeRecipientId)?.color }}>
                      {recipientById.get(activeRecipientId)?.name}
                    </span>. Click the document to drop it.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_TYPES.filter((ft) => ft.type !== "payment").map((ft) => {
                    const Icon = ft.icon;
                    const selected = activeTool === ft.type;
                    return (
                      <button
                        key={ft.type}
                        className={`flex items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-all disabled:opacity-50 ${selected ? "border-[#711419] bg-[#711419]/10 text-[#711419] shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                        onClick={() => setActiveTool(ft.type)}
                        disabled={!activeRecipientId}
                        data-testid={`tool-${ft.type}`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {ft.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Deposit / payment — enter an amount, then drop a Pay button on the doc */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Payment</h3>
              {doc.depositPaidAt ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs font-medium text-green-700">
                  ${((doc.depositAmountCents || 0) / 100).toFixed(2)} paid.
                </div>
              ) : (
                <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
                  <div>
                    <Label className="text-[11px] text-slate-500">Payment amount ($)</Label>
                    <Input
                      inputMode="decimal"
                      value={depAmount}
                      onChange={(e) => setDepAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0.00"
                      className="h-9"
                      data-testid="input-deposit-amount"
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={saveDeposit.isPending}
                    onClick={() => saveDeposit.mutate()}
                    data-testid="button-save-deposit"
                  >
                    {saveDeposit.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                    Save amount
                  </Button>

                  {isDraft && depositAmountNum > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeRecipientId) {
                            toast({ title: "Select a recipient first" });
                            return;
                          }
                          setActiveTool("payment");
                        }}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-all ${activeTool === "payment" ? "border-[#711419] bg-[#711419]/10 text-[#711419] shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                        data-testid="tool-payment"
                      >
                        <DollarSign className="h-3.5 w-3.5" /> Place Pay button
                      </button>
                      <p className="text-[11px] text-slate-500">
                        {activeTool === "payment"
                          ? "Click the document to drop the Pay button, then drag to position it."
                          : `Customer pays $${depositAmountNum.toFixed(2)}. Click above, then click the doc to place it.`}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* PDF canvas */}
          <div ref={containerRef} className="flex-1 overflow-auto bg-slate-100 p-4">
            <Document
              file={pdfUrl}
              loading={<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
              error={<p className="text-center text-sm text-red-600 py-10">Could not load the PDF.</p>}
            >
              {Array.from(new Array(doc.pageCount), (_, idx) => {
                const pageNum = idx + 1;
                const pageFields = fields.filter((f) => f.page === pageNum);
                return (
                  <div key={pageNum} className="mx-auto mb-6 w-fit">
                    <div className="mb-1.5 text-center text-[11px] font-medium text-slate-400">Page {pageNum} of {doc.pageCount}</div>
                    <div
                      ref={(el) => { pageRefs.current[pageNum] = el; }}
                      className="relative rounded-md overflow-hidden shadow-md ring-1 ring-slate-200 bg-white"
                      style={{ cursor: isDraft && activeRecipientId ? "crosshair" : "default" }}
                      onClick={(e) => placeField(pageNum, e)}
                    >
                      <Page pageNumber={pageNum} width={pageWidth} renderAnnotationLayer={false} renderTextLayer={false} />
                      {pageFields.map((f) => {
                        const r = recipientById.get(f.recipientId);
                        const color = r?.color || "#711419";
                        const ft = FIELD_TYPES.find((t) => t.type === f.type);
                        const Icon = ft?.icon || Type;
                        const isPayment = f.type === "payment";
                        return (
                          <div
                            key={f.id}
                            data-field-box
                            onPointerDown={(e) => onFieldPointerDown(f.id, pageNum, e)}
                            onPointerMove={onFieldPointerMove}
                            onPointerUp={onFieldPointerUp}
                            className="absolute flex items-center justify-center rounded-sm group select-none"
                            style={{
                              left: `${f.x * 100}%`, top: `${f.y * 100}%`,
                              width: `${f.width * 100}%`, height: `${f.height * 100}%`,
                              backgroundColor: isPayment ? "#711419" : `${color}22`,
                              border: isPayment ? "none" : `1.5px solid ${color}`,
                              color: isPayment ? "#ffffff" : color,
                              borderRadius: isPayment ? "6px" : undefined,
                              cursor: isDraft ? "move" : "default",
                            }}
                            data-testid={`field-${f.id}`}
                          >
                            <span className="flex items-center gap-1 text-[10px] font-semibold truncate px-1 pointer-events-none">
                              <Icon className="h-3 w-3 shrink-0" /> {isPayment ? `Pay $${depositAmountNum.toFixed(2)}` : ft?.label}
                            </span>
                            {isDraft && (
                              <button
                                className="absolute -right-2 -top-2 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white group-hover:flex"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); deleteField(f.id); }}
                                data-testid={`button-delete-field-${f.id}`}
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Document>
          </div>
        </div>
      </div>

      {/* Send dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sendResults ? "Document sent" : "Send for signing"}</DialogTitle>
            <DialogDescription>
              {sendResults
                ? "Recipients have been emailed a secure signing link. You can also copy links below."
                : `This will email signing links to ${doc.recipients.length} recipient(s). The document will be locked from further edits.`}
            </DialogDescription>
          </DialogHeader>

          {sendResults ? (
            <div className="space-y-2">
              {sendResults.map((r) => (
                <div key={r.email} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.email}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {r.emailed ? <><CheckCircle2 className="h-3 w-3 text-green-600" /> Emailed</> : "Email not sent — share link manually"}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => copyLink(r.url)} data-testid={`button-copy-link-${r.email}`}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy link
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            {sendResults ? (
              <Button onClick={() => setSendOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
                <Button className="bg-[#711419] hover:bg-[#5a1014]" onClick={() => sendDoc.mutate()} disabled={sendDoc.isPending} data-testid="button-confirm-send">
                  {sendDoc.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send now
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
