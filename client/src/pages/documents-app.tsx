import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FolderOpen, Folder, FolderPlus, Upload, Search, Star, Trash2, ChevronRight,
  MoreHorizontal, Download, Pencil, FolderInput, RotateCcw, X, Loader2, Grid3X3,
  FileText, FileSpreadsheet, FileImage, FileArchive, FileAudio, FileVideo, File as FileIcon,
  ArrowLeft, HardDrive,
} from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { CrmUser, DocFolder, DocFile } from "@shared/schema";

const MAROON = "#711419";

function prettySize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileVisual(name: string, mime?: string | null): { Icon: typeof FileText; color: string } {
  const m = (mime || "").toLowerCase();
  const ext = (name.split(".").pop() || "").toLowerCase();
  const has = (a: string[]) => a.includes(ext);
  if (m.startsWith("image/") || has(["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"])) return { Icon: FileImage, color: "text-violet-500" };
  if (m === "application/pdf" || ext === "pdf") return { Icon: FileText, color: "text-red-500" };
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv" || has(["xls", "xlsx", "csv"])) return { Icon: FileSpreadsheet, color: "text-green-600" };
  if (m.includes("word") || has(["doc", "docx", "rtf"])) return { Icon: FileText, color: "text-blue-600" };
  if (m.startsWith("audio/") || has(["mp3", "wav", "m4a"])) return { Icon: FileAudio, color: "text-pink-500" };
  if (m.startsWith("video/") || has(["mp4", "mov", "webm"])) return { Icon: FileVideo, color: "text-indigo-500" };
  if (m.includes("zip") || has(["zip", "rar", "7z"])) return { Icon: FileArchive, color: "text-amber-600" };
  return { Icon: FileIcon, color: "text-slate-400" };
}

type ViewKey = "drive" | "starred" | "trash";

export default function DocumentsApp() {
  usePageTitle("Documents");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [view, setView] = useState<ViewKey>("drive");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<DocFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<DocFile | null>(null);
  const [moveDest, setMoveDest] = useState<string>("root");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  const { data: folders = [] } = useQuery<DocFolder[]>({
    queryKey: ["/api/docs/folders"],
    enabled: !!currentUser,
  });

  const searching = search.trim().length > 0;
  const filesUrl = searching
    ? `/api/docs/files?view=search&q=${encodeURIComponent(search.trim())}`
    : view === "drive"
      ? `/api/docs/files?view=folder${folderId ? `&folderId=${folderId}` : ""}`
      : `/api/docs/files?view=${view}`;
  const { data: files = [], isLoading: filesLoading } = useQuery<DocFile[]>({
    queryKey: ["/api/docs/files", filesUrl],
    queryFn: async () => {
      const res = await fetch(filesUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load files");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const childFolders = useMemo(
    () => (searching || view !== "drive" ? [] : folders.filter((f) => (f.parentId || null) === folderId)),
    [folders, folderId, view, searching],
  );

  const breadcrumbs = useMemo(() => {
    const chain: DocFolder[] = [];
    let cur = folderId ? folders.find((f) => f.id === folderId) : undefined;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
    }
    return chain;
  }, [folders, folderId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/docs/files"] });
    queryClient.invalidateQueries({ queryKey: ["/api/docs/folders"] });
  };
  const onError = (e: any) => toast({ variant: "destructive", title: e?.message || "Something went wrong" });

  const createFolder = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/docs/folders", { name: newFolderName, parentId: folderId }),
    onSuccess: () => { invalidate(); setNewFolderOpen(false); setNewFolderName(""); },
    onError,
  });
  const patchFile = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest("PATCH", `/api/docs/files/${id}`, body),
    onSuccess: invalidate,
    onError,
  });
  const patchFolder = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest("PATCH", `/api/docs/folders/${id}`, body),
    onSuccess: invalidate,
    onError,
  });
  const deleteFolder = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/docs/folders/${id}`),
    onSuccess: invalidate,
    onError,
  });
  const deleteFileForever = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/docs/files/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Deleted forever" }); },
    onError,
  });

  const uploadFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name, size: file.size, contentType: file.type,
        });
        const { uploadURL, objectPath } = await presignRes.json();
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        const fileUrl = objectPath.startsWith("/objects") ? objectPath : `/objects/${objectPath}`;
        await apiRequest("POST", "/api/docs/files", {
          name: file.name, url: fileUrl, objectPath,
          contentType: file.type || "application/octet-stream", size: file.size, folderId,
        });
      }
      invalidate();
      toast({ title: `${list.length} file${list.length > 1 ? "s" : ""} uploaded` });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const download = async (f: DocFile) => {
    try {
      const res = await fetch(f.url, { credentials: "include" });
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(href);
    } catch {
      window.open(f.url, "_blank");
    }
  };

  if (authLoading || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="h-7 w-7 animate-spin text-[#711419]" />
      </div>
    );
  }

  const NAV: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
    { key: "drive", label: "Drive", icon: <HardDrive className="h-4 w-4" /> },
    { key: "starred", label: "Starred", icon: <Star className="h-4 w-4" /> },
    { key: "trash", label: "Trash", icon: <Trash2 className="h-4 w-4" /> },
  ];

  const isImage = (f: DocFile) => (f.contentType || "").startsWith("image/");
  const isPdf = (f: DocFile) => f.contentType === "application/pdf";

  return (
    <div className="flex h-screen flex-col bg-[#f5f5f7]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white/80 px-4 py-2.5 backdrop-blur">
        <button
          onClick={() => navigate("/")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title="Back to apps"
          data-testid="button-back-apps"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-sky-500 to-blue-700">
          <FolderOpen className="h-4 w-4 text-white" />
        </span>
        <span className="font-display text-[15px] font-semibold text-slate-900">Documents</span>

        <div className="relative mx-auto w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); if (!e.target.value.trim()) setSearch(""); }}
            onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
            placeholder="Search files…"
            className="h-9 rounded-full border-transparent bg-slate-100 pl-9 text-sm focus-visible:bg-white"
            data-testid="input-doc-search"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setSearchInput(""); }}
              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-300 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} data-testid="input-doc-upload" />
        <Button
          size="sm"
          variant="outline"
          className="h-9 rounded-lg"
          onClick={() => { setNewFolderName(""); setNewFolderOpen(true); }}
          disabled={view !== "drive" || searching}
          data-testid="button-new-folder"
        >
          <FolderPlus className="mr-1.5 h-4 w-4" /> Folder
        </Button>
        <Button
          size="sm"
          className="h-9 rounded-lg bg-[#711419] hover:bg-[#8a1a1f]"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload"
        >
          {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
          Upload
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-black/[0.06] bg-white/60 p-3 sm:flex">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => { setView(n.key); setFolderId(null); setSearch(""); setSearchInput(""); }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                view === n.key && !searching ? "bg-[#711419]/10 text-[#711419]" : "text-slate-600 hover:bg-slate-100"
              }`}
              data-testid={`docs-nav-${n.key}`}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </aside>

        {/* Main */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto p-4 ${dragOver ? "bg-sky-50" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (view === "drive" && !searching) uploadFiles(e.dataTransfer.files); }}
          data-testid="docs-main"
        >
          {/* Breadcrumbs */}
          {view === "drive" && !searching && (
            <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
              <button
                onClick={() => setFolderId(null)}
                className={`rounded px-1.5 py-0.5 ${folderId ? "text-slate-500 hover:bg-slate-100" : "font-semibold text-slate-900"}`}
                data-testid="crumb-root"
              >
                Drive
              </button>
              {breadcrumbs.map((b, i) => (
                <span key={b.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  <button
                    onClick={() => setFolderId(b.id)}
                    className={`rounded px-1.5 py-0.5 ${i === breadcrumbs.length - 1 ? "font-semibold text-slate-900" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            </div>
          )}
          {searching && <p className="mb-3 text-sm text-slate-500">Results for “{search.trim()}”</p>}
          {view === "trash" && !searching && <p className="mb-3 text-sm text-slate-500">Items in Trash can be restored or deleted forever.</p>}

          {/* Folders */}
          {childFolders.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {childFolders.map((f) => (
                <div key={f.id} className="group flex items-center gap-2.5 rounded-lg border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow" data-testid={`folder-${f.id}`}>
                  <button onClick={() => setFolderId(f.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <Folder className="h-5 w-5 shrink-0 fill-sky-100 text-sky-500" />
                    <span className="truncate text-sm font-medium text-slate-800">{f.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100" data-testid={`folder-menu-${f.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRenameTarget({ kind: "folder", id: f.id, name: f.name })}>
                        <Pencil className="mr-2 h-4 w-4" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => deleteFolder.mutate(f.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}

          {/* Files */}
          {filesLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
            </div>
          ) : files.length === 0 && childFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 py-20 text-center">
              <Grid3X3 className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {view === "trash" ? "Trash is empty" : view === "starred" ? "Nothing starred yet" : "This folder is empty"}
              </p>
              {view === "drive" && !searching && (
                <p className="mt-1 text-xs text-slate-400">Drag files here or use Upload.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {files.map((f) => {
                const { Icon, color } = fileVisual(f.name, f.contentType);
                return (
                  <div key={f.id} className="group overflow-hidden rounded-lg border border-black/[0.06] bg-white shadow-sm transition-shadow hover:shadow-md" data-testid={`file-${f.id}`}>
                    <button
                      onClick={() => (isImage(f) || isPdf(f) ? setPreview(f) : download(f))}
                      className="flex h-28 w-full items-center justify-center overflow-hidden bg-slate-50"
                    >
                      {isImage(f) ? (
                        <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Icon className={`h-10 w-10 ${color}`} />
                      )}
                    </button>
                    <div className="flex items-center gap-1.5 px-2.5 py-2">
                      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-slate-800" title={f.name}>{f.name}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {prettySize(f.size)}{f.updatedAt ? ` · ${format(new Date(f.updatedAt), "MMM d")}` : ""}
                        </p>
                      </div>
                      {f.starred && view !== "trash" && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100" data-testid={`file-menu-${f.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {view === "trash" ? (
                            <>
                              <DropdownMenuItem onClick={() => patchFile.mutate({ id: f.id, trashed: false })}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Restore
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => deleteFileForever.mutate(f.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete forever
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => download(f)}>
                                <Download className="mr-2 h-4 w-4" /> Download
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRenameTarget({ kind: "file", id: f.id, name: f.name })}>
                                <Pencil className="mr-2 h-4 w-4" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setMoveTarget(f); setMoveDest(f.folderId || "root"); }}>
                                <FolderInput className="mr-2 h-4 w-4" /> Move
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => patchFile.mutate({ id: f.id, starred: !f.starred })}>
                                <Star className="mr-2 h-4 w-4" /> {f.starred ? "Unstar" : "Star"}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => patchFile.mutate({ id: f.id, trashed: true })}>
                                <Trash2 className="mr-2 h-4 w-4" /> Move to trash
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Preview */}
      {preview && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/90 backdrop-blur-sm" onClick={() => setPreview(null)} data-testid="doc-preview">
          <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{preview.name}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => download(preview)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10" title="Download">
                <Download className="h-5 w-5" />
              </button>
              <button onClick={() => setPreview(null)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            {isImage(preview) ? (
              <img src={preview.url} alt={preview.name} className="max-h-full max-w-full rounded-lg object-contain" />
            ) : (
              <iframe src={preview.url} title={preview.name} className="h-full w-full max-w-4xl rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}

      {/* New folder */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && createFolder.mutate()}
            placeholder="Folder name"
            data-testid="input-new-folder"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={!newFolderName.trim() || createFolder.isPending} onClick={() => createFolder.mutate()} data-testid="confirm-new-folder">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename</DialogTitle></DialogHeader>
          <Input
            autoFocus
            value={renameTarget?.name || ""}
            onChange={(e) => setRenameTarget((p) => (p ? { ...p, name: e.target.value } : p))}
            data-testid="input-rename"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={!renameTarget?.name.trim()}
              onClick={() => {
                if (!renameTarget) return;
                const done = { onSuccess: () => setRenameTarget(null) };
                if (renameTarget.kind === "file") patchFile.mutate({ id: renameTarget.id, name: renameTarget.name }, done);
                else patchFolder.mutate({ id: renameTarget.id, name: renameTarget.name }, done);
              }}
              data-testid="confirm-rename"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog open={!!moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Move “{moveTarget?.name}”</DialogTitle></DialogHeader>
          <Select value={moveDest} onValueChange={setMoveDest}>
            <SelectTrigger data-testid="select-move-dest"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Drive (top level)</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              onClick={() => {
                if (!moveTarget) return;
                patchFile.mutate(
                  { id: moveTarget.id, folderId: moveDest === "root" ? null : moveDest },
                  { onSuccess: () => setMoveTarget(null) },
                );
              }}
              data-testid="confirm-move"
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
