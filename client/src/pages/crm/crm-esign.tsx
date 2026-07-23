import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { PageHeader, StatCard, SectionCard, EmptyState, FilterBar } from "@/components/crm/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import {
  PenLine, Plus, FileText, Loader2, Trash2, Upload, CheckCircle2, Send,
  Download, Clock, Users, DollarSign,
  FileUp,
} from "lucide-react";
import { format } from "date-fns";
import type { CrmUser, SignatureDocument } from "@shared/schema";

type DocWithCounts = SignatureDocument & { recipientCount: number; signedCount: number };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-300",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300",
  voided: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Out for signature",
  completed: "Completed",
  voided: "Voided",
};

export default function CrmEsign() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  const { data: docs = [], isLoading } = useQuery<DocWithCounts[]>({
    queryKey: ["/api/crm/signature-documents"],
    enabled: !!currentUser,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { uploadFile, isUploading } = useUpload();

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!pendingFile) throw new Error("Please choose a PDF file");
      const uploaded = await uploadFile(pendingFile);
      if (!uploaded) throw new Error("File upload failed");
      const res = await apiRequest("POST", "/api/crm/signature-documents", {
        title: title.trim() || pendingFile.name.replace(/\.pdf$/i, ""),
        originalObjectPath: uploaded.objectPath,
        message: message.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (doc: SignatureDocument) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents"] });
      setDialogOpen(false);
      setTitle(""); setMessage(""); setPendingFile(null);
      navigate(`/crm/esign/${doc.id}`);
    },
    onError: (e: Error) => toast({ title: "Could not create document", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/signature-documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents"] });
      setDeleteId(null);
      toast({ title: "Document deleted" });
    },
    onError: (e: Error) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  // Repair tool: re-upload a document's original PDF (for files stranded in the
  // old storage) — completed docs get re-flattened with the stored signatures.
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const restoreMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const uploaded = await uploadFile(file);
      if (!uploaded) throw new Error("File upload failed");
      const res = await apiRequest("POST", `/api/crm/signature-documents/${id}/restore-original`, {
        objectPath: uploaded.objectPath,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/signature-documents"] });
      toast({ title: "Document restored", description: "The PDF was re-attached and the signed copy rebuilt." });
    },
    onError: (e: Error) => toast({ title: "Restore failed", description: e.message, variant: "destructive" }),
  });
  const handleRestorePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (restoreInputRef.current) restoreInputRef.current.value = "";
    if (!f || !restoreTargetId) return;
    if (f.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Please choose a PDF file.", variant: "destructive" });
      return;
    }
    restoreMutation.mutate({ id: restoreTargetId, file: f });
    setRestoreTargetId(null);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Please choose a PDF file.", variant: "destructive" });
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 25MB.", variant: "destructive" });
      return;
    }
    setPendingFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
  };

  const stats = useMemo(() => {
    return {
      total: docs.length,
      draft: docs.filter((d) => d.status === "draft").length,
      sent: docs.filter((d) => d.status === "sent").length,
      completed: docs.filter((d) => d.status === "completed").length,
    };
  }, [docs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q));
  }, [docs, search]);

  if (!currentUser) return null;

  const busy = isUploading || createMutation.isPending;

  const statCards = [
    { label: "Total", value: stats.total, icon: FileText },
    { label: "Draft", value: stats.draft, icon: PenLine },
    { label: "Out for signature", value: stats.sent, icon: Send },
    { label: "Completed", value: stats.completed, icon: CheckCircle2 },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="w-full space-y-6">
        <PageHeader
          title="Signatures"
          description="Upload a PDF, place fields, and send it for e-signature."
          actions={
            <Button onClick={() => setDialogOpen(true)} data-testid="button-new-document">
              <Plus className="mr-2 h-4 w-4" /> New Document
            </Button>
          }
        />

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} />
          ))}
        </div>

        {/* Search */}
        {docs.length > 0 && (
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search documents…"
            className="max-w-md"
          />
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-lg" />)}
          </div>
        ) : docs.length === 0 ? (
          <SectionCard noBodyPadding>
            <EmptyState
              icon={PenLine}
              title="No documents yet"
              message="Create your first signature document to get started."
              action={
                <Button onClick={() => setDialogOpen(true)} data-testid="button-new-document-empty">
                  <Plus className="mr-2 h-4 w-4" /> New Document
                </Button>
              }
            />
          </SectionCard>
        ) : filtered.length === 0 ? (
          <SectionCard noBodyPadding>
            <EmptyState icon={FileText} title="No matches" message={`No documents match "${search}".`} />
          </SectionCard>
        ) : (
          <SectionCard title="Documents" description={`${filtered.length} of ${docs.length}`} noBodyPadding>
            <ul className="divide-y divide-border">
              {filtered.map((doc) => {
                const pct = doc.recipientCount > 0 ? Math.round((doc.signedCount / doc.recipientCount) * 100) : 0;
                return (
                  <li key={doc.id}>
                    <div
                      className="group flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted"
                      onClick={() => navigate(`/crm/esign/${doc.id}`)}
                      data-testid={`card-document-${doc.id}`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-foreground" data-testid={`text-title-${doc.id}`}>{doc.title}</span>
                          <StatusDot pill={STATUS_STYLES[doc.status] || STATUS_STYLES.draft}>
                            {doc.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {doc.status === "sent" && <Send className="mr-1 h-3 w-3" />}
                            {STATUS_LABELS[doc.status] || doc.status}
                          </StatusDot>
                          {doc.depositEnabled && (doc.depositAmountCents ?? 0) > 0 && (
                            <StatusDot
                              pill={doc.depositPaidAt
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-300"}
                              data-testid={`badge-deposit-${doc.id}`}
                            >
                              <DollarSign className="mr-0.5 h-3 w-3" />
                              {doc.depositPaidAt
                                ? `Deposit paid $${((doc.depositAmountCents ?? 0) / 100).toFixed(2)}`
                                : `Deposit due $${((doc.depositAmountCents ?? 0) / 100).toFixed(2)}`}
                            </StatusDot>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {doc.recipientCount > 0 ? `${doc.signedCount}/${doc.recipientCount} signed` : "No recipients"}
                          </span>
                          {doc.createdAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {format(new Date(doc.createdAt), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                        {doc.status === "sent" && doc.recipientCount > 0 && (
                          <div className="mt-2 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                      {doc.status === "completed" && doc.signedObjectPath && (
                        <Button
                          variant="outline" size="sm" className="shrink-0"
                          onClick={(e) => { e.stopPropagation(); window.open(doc.signedObjectPath!, "_blank"); }}
                          data-testid={`button-download-${doc.id}`}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-slate-900"
                        title="Restore PDF — re-upload the original if this document won't load"
                        onClick={(e) => { e.stopPropagation(); setRestoreTargetId(doc.id); restoreInputRef.current?.click(); }}
                        data-testid={`button-restore-${doc.id}`}
                      >
                        <FileUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(doc.id); }}
                        data-testid={`button-delete-${doc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        )}
      </div>

      <input ref={restoreInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleRestorePick} data-testid="input-restore-pdf" />

      {/* New document dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!busy) setDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New signature document</DialogTitle>
            <DialogDescription>Upload a PDF to prepare it for signing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>PDF file</Label>
              <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFilePick} data-testid="input-pdf-file" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1.5 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {pendingFile ? pendingFile.name : "Click to choose a PDF"}
                </span>
                <span className="text-xs text-muted-foreground">Max 25MB</span>
              </button>
            </div>
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Service Agreement" className="mt-1.5" data-testid="input-doc-title" />
            </div>
            <div>
              <Label htmlFor="doc-message">Message to signers (optional)</Label>
              <Textarea id="doc-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please review and sign at your earliest convenience." className="mt-1.5" data-testid="input-doc-message" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={busy || !pendingFile} data-testid="button-create-document">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploading ? "Uploading…" : "Create & Prepare"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the document, its recipients, and fields. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
