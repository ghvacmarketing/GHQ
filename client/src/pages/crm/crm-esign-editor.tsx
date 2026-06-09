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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Plus, Trash2, Send, Save, PenTool, Type, Calendar, UserSquare, Hash, CheckCircle2, Copy,
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

  // Seed local state from server
  useEffect(() => {
    if (doc) {
      setFields(doc.fields.map((f) => ({
        id: f.id, recipientId: f.recipientId, page: f.page, type: f.type,
        x: f.x, y: f.y, width: f.width, height: f.height, required: f.required,
      })));
      setDirty(false);
      if (doc.recipients.length && !activeRecipientId) {
        setActiveRecipientId(doc.recipients[0].id);
      }
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
      x, y, width: def.w, height: def.h, required: true,
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

  return (
    <CrmLayout currentUser={currentUser} disableScroll>
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b px-4 py-3 bg-background">
          <Button variant="ghost" size="icon" onClick={() => navigate("/crm/esign")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold truncate" data-testid="text-doc-title">{doc.title}</h1>
              <Badge variant="secondary" className={doc.status === "draft" ? "bg-gray-100 text-gray-700" : doc.status === "sent" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
                {doc.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}</p>
          </div>
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => saveFields.mutate()} disabled={saveFields.isPending || !dirty} data-testid="button-save">
                {saveFields.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button className="bg-[#711419] hover:bg-[#5a0f14]" onClick={() => { setSendResults(null); setSendOpen(true); }} data-testid="button-open-send">
                <Send className="mr-2 h-4 w-4" /> Send
              </Button>
            </>
          )}
          {doc.status === "completed" && doc.signedObjectPath && (
            <Button variant="outline" onClick={() => window.open(doc.signedObjectPath!, "_blank")} data-testid="button-download-signed">
              Download Signed PDF
            </Button>
          )}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-72 border-r overflow-y-auto p-4 space-y-6 bg-muted/20 shrink-0 hidden md:block">
            <div>
              <h3 className="text-sm font-semibold mb-2">Recipients</h3>
              <div className="space-y-2">
                {doc.recipients.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-md border p-2 cursor-pointer transition-colors ${activeRecipientId === r.id ? "ring-2 ring-offset-1" : "hover:bg-muted"}`}
                    style={{ borderLeft: `4px solid ${r.color}`, ...(activeRecipientId === r.id ? { ["--tw-ring-color" as any]: r.color } : {}) }}
                    onClick={() => setActiveRecipientId(r.id)}
                    data-testid={`recipient-${r.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                      </div>
                      {isDraft ? (
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); removeRecipient.mutate(r.id); }} data-testid={`button-remove-recipient-${r.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">{r.status}</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{fieldsByRecipient.get(r.id) || 0} field(s)</div>
                  </div>
                ))}
                {doc.recipients.length === 0 && <p className="text-xs text-muted-foreground">No recipients yet.</p>}
              </div>

              {isDraft && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <Input placeholder="Name" value={recipName} onChange={(e) => setRecipName(e.target.value)} data-testid="input-recipient-name" />
                  <Input placeholder="Email" type="email" value={recipEmail} onChange={(e) => setRecipEmail(e.target.value)} data-testid="input-recipient-email" />
                  <Button
                    size="sm" variant="outline" className="w-full"
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
                <h3 className="text-sm font-semibold mb-2">Fields</h3>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Pick a recipient, choose a field, then click on the document to place it.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_TYPES.map((ft) => {
                    const Icon = ft.icon;
                    return (
                      <button
                        key={ft.type}
                        className={`flex items-center gap-1.5 rounded-md border p-2 text-xs transition-colors ${activeTool === ft.type ? "border-[#711419] bg-[#711419]/10 text-[#711419]" : "hover:bg-muted"}`}
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
          </div>

          {/* PDF canvas */}
          <div ref={containerRef} className="flex-1 overflow-auto bg-muted/40 p-4">
            <Document
              file={pdfUrl}
              loading={<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
              error={<p className="text-center text-sm text-red-600 py-10">Could not load the PDF.</p>}
            >
              {Array.from(new Array(doc.pageCount), (_, idx) => {
                const pageNum = idx + 1;
                const pageFields = fields.filter((f) => f.page === pageNum);
                return (
                  <div key={pageNum} className="mx-auto mb-6 shadow-md w-fit bg-white">
                    <div
                      ref={(el) => { pageRefs.current[pageNum] = el; }}
                      className="relative"
                      style={{ cursor: isDraft && activeRecipientId ? "crosshair" : "default" }}
                      onClick={(e) => placeField(pageNum, e)}
                    >
                      <Page pageNumber={pageNum} width={pageWidth} renderAnnotationLayer={false} renderTextLayer={false} />
                      {pageFields.map((f) => {
                        const r = recipientById.get(f.recipientId);
                        const color = r?.color || "#711419";
                        const ft = FIELD_TYPES.find((t) => t.type === f.type);
                        const Icon = ft?.icon || Type;
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
                              backgroundColor: `${color}22`,
                              border: `1.5px solid ${color}`,
                              color,
                              cursor: isDraft ? "move" : "default",
                            }}
                            data-testid={`field-${f.id}`}
                          >
                            <span className="flex items-center gap-1 text-[10px] font-medium truncate px-1 pointer-events-none">
                              <Icon className="h-3 w-3 shrink-0" /> {ft?.label}
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
                <Button className="bg-[#711419] hover:bg-[#5a0f14]" onClick={() => sendDoc.mutate()} disabled={sendDoc.isPending} data-testid="button-confirm-send">
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
