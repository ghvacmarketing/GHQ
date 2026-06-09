import { useEffect, useState, useRef } from "react";
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
import { PenLine, Plus, FileText, Loader2, Trash2, Upload, CheckCircle2, Send, FileSignature } from "lucide-react";
import type { CrmUser, SignatureDocument } from "@shared/schema";

type DocWithCounts = SignatureDocument & { recipientCount: number; signedCount: number };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-700",
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

  if (!currentUser) return null;

  const busy = isUploading || createMutation.isPending;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSignature className="h-6 w-6 text-[#711419]" /> Signatures
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Upload a PDF, place fields, and send it for e-signature.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="bg-[#711419] hover:bg-[#5a0f14]" data-testid="button-new-document">
            <Plus className="mr-2 h-4 w-4" /> New Document
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : docs.length === 0 ? (
          <Card className="p-12 text-center">
            <PenLine className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 font-semibold">No documents yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create your first signature document to get started.</p>
            <Button onClick={() => setDialogOpen(true)} className="mt-4 bg-[#711419] hover:bg-[#5a0f14]" data-testid="button-new-document-empty">
              <Plus className="mr-2 h-4 w-4" /> New Document
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <Card
                key={doc.id}
                className="p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/crm/esign/${doc.id}`)}
                data-testid={`card-document-${doc.id}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#711419]/10 shrink-0">
                  <FileText className="h-5 w-5 text-[#711419]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate" data-testid={`text-title-${doc.id}`}>{doc.title}</span>
                    <Badge className={STATUS_STYLES[doc.status] || "bg-gray-100 text-gray-700"} variant="secondary">
                      {doc.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {doc.status === "sent" && <Send className="mr-1 h-3 w-3" />}
                      {doc.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} ·{" "}
                    {doc.recipientCount > 0
                      ? `${doc.signedCount}/${doc.recipientCount} signed`
                      : "No recipients yet"}
                  </div>
                </div>
                {doc.status === "completed" && doc.signedObjectPath && (
                  <Button
                    variant="outline" size="sm"
                    onClick={(e) => { e.stopPropagation(); window.open(doc.signedObjectPath!, "_blank"); }}
                    data-testid={`button-download-${doc.id}`}
                  >
                    Download
                  </Button>
                )}
                <Button
                  variant="ghost" size="icon"
                  onClick={(e) => { e.stopPropagation(); setDeleteId(doc.id); }}
                  data-testid={`button-delete-${doc.id}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </Card>
            ))}
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
              <Button type="button" variant="outline" className="w-full mt-1.5 justify-start" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {pendingFile ? pendingFile.name : "Choose a PDF…"}
              </Button>
            </div>
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Service Agreement" data-testid="input-doc-title" />
            </div>
            <div>
              <Label htmlFor="doc-message">Message to signers (optional)</Label>
              <Textarea id="doc-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please review and sign at your earliest convenience." data-testid="input-doc-message" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={busy || !pendingFile} className="bg-[#711419] hover:bg-[#5a0f14]" data-testid="button-create-document">
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
