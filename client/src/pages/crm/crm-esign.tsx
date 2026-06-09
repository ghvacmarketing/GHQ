import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  FileSignature, Search, Download, Clock, Users,
} from "lucide-react";
import { format } from "date-fns";
import type { CrmUser, SignatureDocument } from "@shared/schema";

type DocWithCounts = SignatureDocument & { recipientCount: number; signedCount: number };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  voided: "bg-red-100 text-red-700 border-red-200",
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
    { label: "Total", value: stats.total, icon: FileText, color: "text-slate-700", bg: "bg-slate-100" },
    { label: "Draft", value: stats.draft, icon: PenLine, color: "text-slate-600", bg: "bg-slate-100" },
    { label: "Out for signature", value: stats.sent, icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#711419]/10">
                <FileSignature className="h-5 w-5 text-[#711419]" />
              </span>
              Signatures
            </h1>
            <p className="text-sm text-slate-500 mt-1">Upload a PDF, place fields, and send it for e-signature.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="bg-[#711419] hover:bg-[#5a1014] shrink-0" data-testid="button-new-document">
            <Plus className="mr-2 h-4 w-4" /> New Document
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="p-4 flex items-center gap-3 border-slate-200">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.bg}`}>
                  <Icon className={`h-5 w-5 ${s.color}`} />
                </span>
                <div>
                  <div className="text-2xl font-bold text-slate-900 leading-none">{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Search */}
        {docs.length > 0 && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-white border-slate-300 focus-visible:ring-[#711419]"
              data-testid="input-search-documents"
            />
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-lg" />)}
          </div>
        ) : docs.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-slate-300">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#711419]/10">
              <PenLine className="h-7 w-7 text-[#711419]" />
            </span>
            <h3 className="mt-4 font-semibold text-slate-900">No documents yet</h3>
            <p className="text-sm text-slate-500 mt-1">Create your first signature document to get started.</p>
            <Button onClick={() => setDialogOpen(true)} className="mt-4 bg-[#711419] hover:bg-[#5a1014]" data-testid="button-new-document-empty">
              <Plus className="mr-2 h-4 w-4" /> New Document
            </Button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center border-slate-200">
            <p className="text-sm text-slate-500">No documents match "{search}".</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => {
              const pct = doc.recipientCount > 0 ? Math.round((doc.signedCount / doc.recipientCount) * 100) : 0;
              return (
                <Card
                  key={doc.id}
                  className="p-4 flex items-center gap-4 hover:shadow-md hover:border-[#711419]/30 transition-all cursor-pointer border-slate-200"
                  onClick={() => navigate(`/crm/esign/${doc.id}`)}
                  data-testid={`card-document-${doc.id}`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#711419]/10 shrink-0">
                    <FileText className="h-5 w-5 text-[#711419]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 truncate" data-testid={`text-title-${doc.id}`}>{doc.title}</span>
                      <Badge variant="outline" className={STATUS_STYLES[doc.status] || STATUS_STYLES.draft}>
                        {doc.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {doc.status === "sent" && <Send className="mr-1 h-3 w-3" />}
                        {STATUS_LABELS[doc.status] || doc.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
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
                      <div className="mt-2 h-1.5 w-full max-w-[220px] rounded-full bg-slate-100 overflow-hidden">
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
                    variant="ghost" size="icon" className="shrink-0 text-slate-400 hover:text-red-600"
                    onClick={(e) => { e.stopPropagation(); setDeleteId(doc.id); }}
                    data-testid={`button-delete-${doc.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

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
                className="mt-1.5 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-6 text-center transition-colors hover:border-[#711419]/50 hover:bg-[#711419]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#711419] focus-visible:ring-offset-2"
              >
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">
                  {pendingFile ? pendingFile.name : "Click to choose a PDF"}
                </span>
                <span className="text-xs text-slate-400">Max 25MB</span>
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
            <Button onClick={() => createMutation.mutate()} disabled={busy || !pendingFile} className="bg-[#711419] hover:bg-[#5a1014]" data-testid="button-create-document">
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
