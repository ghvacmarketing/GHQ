import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/esign/signature-pad";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PenTool, Type, Calendar, UserSquare, Hash, CheckCircle2, AlertCircle, FileSignature } from "lucide-react";
import type { SignatureField } from "@shared/schema";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type DepositInfo = {
  enabled: boolean;
  amount: number;
  mode: string;
  percentage: number | null;
  paid: boolean;
  paidAt: string | null;
};

type SignSession = {
  document: { id: string; title: string; message: string | null; pageCount: number; status: string };
  recipient: { id: string; name: string; email: string; status: string; color: string };
  fields: SignatureField[];
  alreadySigned: boolean;
  deposit?: DepositInfo | null;
};

const ICONS: Record<string, any> = { signature: PenTool, initials: Hash, name: UserSquare, date: Calendar, text: Type };

export default function PublicSign() {
  const [, params] = useRoute("/sign/:token");
  const token = params?.token;
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<SignSession>({
    queryKey: ["/api/sign", token],
    queryFn: async () => {
      const res = await fetch(`/api/sign/${token}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "This signing link is invalid or has expired.");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [pageWidth, setPageWidth] = useState(700);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState<SignatureField | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [sigDraft, setSigDraft] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const measure = () => {
      const w = containerRef.current?.clientWidth ?? 700;
      setPageWidth(Math.min(820, Math.max(300, w - 24)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [data]);

  const fieldsByPage = useMemo(() => {
    const m = new Map<number, SignatureField[]>();
    data?.fields.forEach((f) => {
      const arr = m.get(f.page) || [];
      arr.push(f);
      m.set(f.page, arr);
    });
    return m;
  }, [data]);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sign/${token}/submit`, { values });
      return res.json();
    },
    onSuccess: () => setDone(true),
    onError: (e: Error) => toast({ title: "Could not submit", description: e.message, variant: "destructive" }),
  });

  // Deposit payment (only after signing). depositPaid is seeded from the
  // server and flipped when we return from a successful Stripe checkout.
  const [depositPaid, setDepositPaid] = useState(false);
  useEffect(() => {
    if (data?.deposit?.paid) setDepositPaid(true);
  }, [data]);

  const payDeposit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sign/${token}/payment-link`, {});
      return res.json();
    },
    onSuccess: (r: any) => {
      if (r?.paid) { setDepositPaid(true); return; }
      if (r?.paymentLinkUrl) { window.location.href = r.paymentLinkUrl; }
    },
    onError: (e: Error) => toast({ title: "Couldn't start payment", description: e.message, variant: "destructive" }),
  });

  // Returning from Stripe (?paid=1): confirm and record the deposit.
  useEffect(() => {
    if (!token) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("paid") !== "1") return;
    apiRequest("POST", `/api/sign/${token}/verify-payment`, {})
      .then((r) => r.json())
      .then((r: any) => {
        if (r?.paid) {
          setDepositPaid(true);
          toast({ title: "Deposit received", description: "Thank you — your payment was successful." });
        }
      })
      .catch(() => {});
  }, [token]);

  const openField = (f: SignatureField) => {
    if (done || data?.alreadySigned) return;
    setActiveField(f);
    if (f.type === "signature" || f.type === "initials") {
      setSigDraft(values[f.id] || null);
    } else if (f.type === "date") {
      setTextDraft(values[f.id] || new Date().toLocaleDateString());
    } else if (f.type === "name") {
      setTextDraft(values[f.id] || data?.recipient.name || "");
    } else {
      setTextDraft(values[f.id] || "");
    }
  };

  const saveField = () => {
    if (!activeField) return;
    const f = activeField;
    const val = f.type === "signature" || f.type === "initials" ? sigDraft : textDraft;
    if (val && String(val).trim()) {
      setValues((prev) => ({ ...prev, [f.id]: val as string }));
    } else {
      setValues((prev) => { const n = { ...prev }; delete n[f.id]; return n; });
    }
    setActiveField(null);
    setSigDraft(null);
    setTextDraft("");
  };

  const requiredRemaining = useMemo(() => {
    if (!data) return 0;
    return data.fields.filter((f) => f.required && !values[f.id]).length;
  }, [data, values]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-lg font-semibold">Link unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{(error as Error)?.message || "This signing link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  if (done || data.alreadySigned) {
    const dep = data.deposit;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="text-center max-w-md bg-white rounded-xl shadow-sm border p-10">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
          <h1 className="mt-4 text-xl font-semibold">Thank you, {data.recipient.name}!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your signature for <strong>{data.document.title}</strong> has been recorded.
          </p>

          {dep?.enabled && (
            <div className="mt-6 rounded-xl border bg-muted/30 p-5">
              {depositPaid ? (
                <div className="flex items-center justify-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-semibold">Deposit of ${dep.amount.toFixed(2)} paid — thank you!</span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    A deposit of{" "}
                    <span className="font-semibold text-foreground">${dep.amount.toFixed(2)}</span>
                    {dep.mode === "percent" && dep.percentage ? ` (${dep.percentage}% of the contract)` : ""} is due.
                  </p>
                  <Button
                    onClick={() => payDeposit.mutate()}
                    disabled={payDeposit.isPending}
                    className="mt-3 w-full bg-[#711419] text-white hover:bg-[#5a1014]"
                    data-testid="button-pay-deposit"
                  >
                    {payDeposit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Pay deposit of ${dep.amount.toFixed(2)}
                  </Button>
                  <p className="mt-2 text-[11px] text-muted-foreground">Secure payment powered by Stripe.</p>
                </>
              )}
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">You may now close this window.</p>
        </div>
      </div>
    );
  }

  const accent = data.recipient.color || "#711419";
  const totalRequired = data.fields.filter((f) => f.required).length;
  const completedRequired = totalRequired - requiredRemaining;
  const progressPct = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 100;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1a` }}>
              <FileSignature className="h-5 w-5" style={{ color: accent }} />
            </span>
            <div className="min-w-0">
              <h1 className="font-semibold text-slate-900 truncate">{data.document.title}</h1>
              <p className="text-xs text-slate-500">Signing as {data.recipient.name}</p>
            </div>
          </div>
          <Button
            onClick={() => submit.mutate()}
            disabled={requiredRemaining > 0 || submit.isPending}
            style={{ backgroundColor: requiredRemaining > 0 ? undefined : accent }}
            className="text-white hover:opacity-90 shrink-0"
            data-testid="button-finish"
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {requiredRemaining > 0 ? `${requiredRemaining} field${requiredRemaining === 1 ? "" : "s"} left` : "Finish & Submit"}
          </Button>
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full bg-slate-100">
          <div className="h-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: accent }} />
        </div>

        {/* Deposit notice — visible but locked until signing is complete */}
        {data.deposit?.enabled && !depositPaid && (
          <div className="border-t border-slate-100 bg-amber-50/70">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-2">
              <p className="text-xs text-amber-800">
                Deposit due: <span className="font-semibold">${data.deposit.amount.toFixed(2)}</span>
                {data.deposit.mode === "percent" && data.deposit.percentage ? ` (${data.deposit.percentage}%)` : ""}
              </p>
              <Button size="sm" variant="outline" disabled className="shrink-0 text-xs" data-testid="button-pay-locked">
                Pay after signing
              </Button>
            </div>
          </div>
        )}
      </div>

      {data.document.message && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <div className="max-w-4xl mx-auto flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{data.document.message}</span>
          </div>
        </div>
      )}

      {/* Helper banner */}
      <div className="bg-white/70 border-b border-slate-200 px-4 py-2 text-center text-xs text-slate-500">
        {requiredRemaining > 0
          ? "Click the highlighted fields below to fill them in."
          : "All required fields are complete — click Finish & Submit above."}
      </div>

      {/* PDF */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto">
          <Document
            file={`/api/sign/${token}/file`}
            loading={<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
            error={<p className="text-center text-sm text-red-600 py-10">Could not load the document.</p>}
          >
            {Array.from(new Array(data.document.pageCount), (_, idx) => {
              const pageNum = idx + 1;
              const pf = fieldsByPage.get(pageNum) || [];
              return (
                <div key={pageNum} className="mx-auto mb-6 w-fit">
                  <div className="mb-1.5 text-center text-[11px] font-medium text-slate-400">Page {pageNum} of {data.document.pageCount}</div>
                  <div ref={(el) => { pageRefs.current[pageNum] = el; }} className="relative rounded-md overflow-hidden shadow-md ring-1 ring-slate-200 bg-white">
                    <Page pageNumber={pageNum} width={pageWidth} renderAnnotationLayer={false} renderTextLayer={false} />
                    {pf.map((f) => {
                      const filled = !!values[f.id];
                      const Icon = ICONS[f.type] || Type;
                      return (
                        <button
                          key={f.id}
                          onClick={() => openField(f)}
                          className="absolute flex items-center justify-center rounded-sm overflow-hidden transition-shadow hover:shadow-md"
                          style={{
                            left: `${f.x * 100}%`, top: `${f.y * 100}%`,
                            width: `${f.width * 100}%`, height: `${f.height * 100}%`,
                            backgroundColor: filled ? "#ffffff" : `${accent}1a`,
                            border: `1.5px ${filled ? "solid" : "dashed"} ${accent}`,
                          }}
                          data-testid={`fill-field-${f.id}`}
                        >
                          {filled ? (
                            (f.type === "signature" || f.type === "initials") ? (
                              <img src={values[f.id]} alt="signature" className="h-full w-full object-contain" />
                            ) : (
                              <span className="text-[11px] px-1 truncate text-gray-900">{values[f.id]}</span>
                            )
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-medium px-1" style={{ color: accent }}>
                              <Icon className="h-3 w-3" /> {f.required ? "" : "(optional) "}Click to fill
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </Document>
        </div>
      </div>

      {/* Field input dialog */}
      <Dialog open={!!activeField} onOpenChange={(o) => { if (!o) { setActiveField(null); setSigDraft(null); setTextDraft(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activeField?.type === "signature" ? "Add your signature"
                : activeField?.type === "initials" ? "Add your initials"
                : activeField?.type === "date" ? "Enter date"
                : activeField?.type === "name" ? "Enter your full name"
                : "Enter text"}
            </DialogTitle>
          </DialogHeader>

          {activeField && (activeField.type === "signature" || activeField.type === "initials") ? (
            <SignaturePad penColor="#0a0a0a" onChange={setSigDraft} />
          ) : (
            <Input
              autoFocus
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder={activeField?.type === "date" ? "MM/DD/YYYY" : ""}
              data-testid="input-field-value"
            />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setActiveField(null); setSigDraft(null); setTextDraft(""); }}>Cancel</Button>
            <Button onClick={saveField} style={{ backgroundColor: accent }} className="text-white hover:opacity-90" data-testid="button-save-field-value">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
