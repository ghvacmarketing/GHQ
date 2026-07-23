import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSmoothLoading } from "@/hooks/use-smooth-loading";
import { format } from "date-fns";
import {
  FolderOpen, Folder, FolderPlus, Upload, Search, Star, Trash2, ChevronRight,
  ChevronDown, MoreHorizontal, Download, Pencil, FolderInput, RotateCcw, X,
  Loader2, Grid3X3, FileText, FileSpreadsheet, FileImage, FileArchive,
  FileAudio, FileVideo, File as FileIcon, ArrowLeft, HardDrive, FolderTree,
  BookOpen, Scale, GraduationCap, LayoutTemplate, Users, BadgeDollarSign,
  HardHat, Server, Truck, Handshake, Archive, Settings, LayoutGrid, List,
  ArrowUpRight,
} from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopBar } from "@/components/app-topbar";
import { AppLoader } from "@/components/app-loader";
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
import type { CrmUser, DocFolder, DocFile, DocCategoryKey } from "@shared/schema";
import { DOC_CATEGORIES } from "@shared/schema";

function prettySize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

const CATEGORY_ICONS: Record<DocCategoryKey, typeof BookOpen> = {
  sops: BookOpen,
  policies: Scale,
  training: GraduationCap,
  templates: LayoutTemplate,
  hr: Users,
  sales: BadgeDollarSign,
  safety: HardHat,
  system: Server,
  vendor: Truck,
  subcontractor: Handshake,
};

type TabKey = "drive" | "library" | DocCategoryKey | "archived" | "settings";
type ViewMode = "card" | "list";

const CATEGORY_KEYS = DOC_CATEGORIES.map((c) => c.key) as string[];
const isCategoryTab = (t: TabKey): t is DocCategoryKey => CATEGORY_KEYS.includes(t);
const tabLabel = (t: TabKey): string => {
  if (t === "drive") return "Drive";
  if (t === "library") return "Library";
  if (t === "archived") return "Archived";
  if (t === "settings") return "Settings";
  return DOC_CATEGORIES.find((c) => c.key === t)?.label ?? t;
};

export default function DocumentsApp() {
  usePageTitle("Documents");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>("drive");
  const [browseId, setBrowseId] = useState<string | null>(null); // null = current tab's root
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem("docsViewMode") as ViewMode) || "card",
  );
  const [starOnly, setStarOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // Personal order of the big category tiles on the Drive root (drag to arrange)
  const [catOrder, setCatOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("docsDriveCatOrder") || "[]");
    } catch {
      return [];
    }
  });
  const [dragCat, setDragCat] = useState<string | null>(null);
  const orderedCategories = useMemo(() => {
    const known = DOC_CATEGORIES.map((c) => c.key) as string[];
    const kept = catOrder.filter((k) => known.includes(k));
    return [...kept, ...known.filter((k) => !kept.includes(k))].map(
      (k) => DOC_CATEGORIES.find((c) => c.key === k)!,
    );
  }, [catOrder]);

  // FLIP: capture tile positions before a reorder, then ease each tile from its
  // old spot to the new one so the grid visibly makes room while dragging.
  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const prevTileRects = useRef(new Map<string, DOMRect>());
  const moveCatBefore = (dragKey: string, overKey: string) => {
    if (dragKey === overKey) return;
    const keys = orderedCategories.map((c) => c.key as string);
    const next = keys.filter((k) => k !== dragKey);
    next.splice(next.indexOf(overKey), 0, dragKey);
    if (next.every((k, i) => k === keys[i])) return;
    tileRefs.current.forEach((el, key) => prevTileRects.current.set(key, el.getBoundingClientRect()));
    setCatOrder(next);
    localStorage.setItem("docsDriveCatOrder", JSON.stringify(next));
  };
  useLayoutEffect(() => {
    if (prevTileRects.current.size === 0) return;
    tileRefs.current.forEach((el, key) => {
      const prev = prevTileRects.current.get(key);
      if (!prev) return;
      const now = el.getBoundingClientRect();
      const dx = prev.left - now.left;
      const dy = prev.top - now.top;
      if (dx || dy) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    });
    prevTileRects.current.clear();
  }, [orderedCategories]);

  const setMode = (m: ViewMode) => { setViewMode(m); localStorage.setItem("docsViewMode", m); };
  const switchTab = (t: TabKey) => {
    setTab(t); setBrowseId(null); setStarOnly(false); setSearch(""); setSearchInput("");
  };

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
  const { data: categoryRoots } = useQuery<Record<string, string>>({
    queryKey: ["/api/docs/category-roots"],
    enabled: !!currentUser,
  });

  const isBrowse = tab === "drive" || tab === "library" || isCategoryTab(tab);
  const rootId = isCategoryTab(tab) ? categoryRoots?.[tab] ?? null : null;
  const rootReady = !isCategoryTab(tab) || !!rootId;
  const folderId = browseId ?? rootId; // effective current folder (null = drive root)

  const searching = search.trim().length > 0;
  const filesUrl = searching
    ? `/api/docs/files?view=search&q=${encodeURIComponent(search.trim())}`
    : tab === "archived"
      ? "/api/docs/files?view=trash"
      : starOnly && tab === "drive"
        ? "/api/docs/files?view=starred"
        : `/api/docs/files?view=folder${folderId ? `&folderId=${folderId}` : ""}`;
  const { data: files = [], isLoading: filesLoadingRaw } = useQuery<DocFile[]>({
    queryKey: ["/api/docs/files", filesUrl],
    queryFn: async () => {
      const res = await fetch(filesUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load files");
      return res.json();
    },
    enabled: !!currentUser && (tab !== "settings") && rootReady,
  });
  const filesLoading = useSmoothLoading(filesLoadingRaw);

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, DocFolder[]>();
    for (const f of folders) {
      const key = f.parentId || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [folders]);

  const childFolders = useMemo(() => {
    if (!isBrowse || searching || starOnly) return [];
    const kids = foldersByParent.get(folderId ?? null) ?? [];
    // Category roots only surface in Library and their own tabs, not the Drive root
    if (tab === "drive" && !folderId) return kids.filter((f) => !f.category);
    return kids;
  }, [foldersByParent, folderId, tab, isBrowse, searching, starOnly]);

  // Chain from the current folder up to (but excluding) the tab's root folder
  const breadcrumbs = useMemo(() => {
    const chain: DocFolder[] = [];
    let cur = folderId ? folders.find((f) => f.id === folderId) : undefined;
    while (cur && cur.id !== rootId) {
      chain.unshift(cur);
      cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
    }
    return chain;
  }, [folders, folderId, rootId]);

  const folderPath = (f: DocFolder): string => {
    const names: string[] = [f.name];
    let cur = f.parentId ? folders.find((x) => x.id === f.parentId) : undefined;
    let guard = 0;
    while (cur && guard++ < 20) {
      names.unshift(cur.name);
      cur = cur.parentId ? folders.find((x) => x.id === cur!.parentId) : undefined;
    }
    return names.join(" / ");
  };

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

  const loaderHold = useSmoothLoading(authLoading, 0, 600);
  if (loaderHold || !currentUser) {
    return (
      <AppLoader />
    );
  }

  const isImage = (f: DocFile) => (f.contentType || "").startsWith("image/");
  const isPdf = (f: DocFile) => f.contentType === "application/pdf";
  const canUpload = isBrowse && !searching && !starOnly && rootReady;
  const showCatTiles = tab === "drive" && !folderId && !searching && !starOnly;

  const openFolder = (id: string | null) => { setBrowseId(id); setStarOnly(false); };

  const fileMenu = (f: DocFile) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100" data-testid={`file-menu-${f.id}`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {tab === "archived" ? (
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
              <Archive className="mr-2 h-4 w-4" /> Archive
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const folderMenu = (f: DocFolder) =>
    f.category ? null : (
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
    );

  const contentArea = (
    <>
      {/* Breadcrumbs + view controls */}
      {isBrowse && !searching && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          {!starOnly && (
            <>
              <button
                onClick={() => openFolder(null)}
                className={`rounded px-1.5 py-0.5 ${breadcrumbs.length ? "text-slate-500 hover:bg-slate-100" : "font-semibold text-slate-900"}`}
                data-testid="crumb-root"
              >
                {tabLabel(tab)}
              </button>
              {breadcrumbs.map((b, i) => (
                <span key={b.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  <button
                    onClick={() => openFolder(b.id)}
                    className={`rounded px-1.5 py-0.5 ${i === breadcrumbs.length - 1 ? "font-semibold text-slate-900" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            </>
          )}
          {starOnly && <span className="px-1.5 font-semibold text-slate-900">Starred — all folders</span>}
          <div className="ml-auto flex items-center gap-1">
            {tab === "drive" && (
              <button
                onClick={() => setStarOnly((v) => !v)}
                className={`flex h-7 items-center gap-1 rounded-[4px] border px-2 text-xs font-medium ${
                  starOnly ? "border-amber-400 bg-amber-50 text-amber-600" : "border-slate-300/70 bg-white text-slate-500 hover:text-slate-800"
                }`}
                data-testid="toggle-starred"
              >
                <Star className={`h-3.5 w-3.5 ${starOnly ? "fill-amber-400 text-amber-400" : ""}`} /> Starred
              </button>
            )}
            <div className="flex overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              <button
                onClick={() => setMode("card")}
                className={`flex h-7 w-8 items-center justify-center ${viewMode === "card" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}
                title="Card view"
                data-testid="view-card"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setMode("list")}
                className={`flex h-7 w-8 items-center justify-center ${viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}
                title="List view"
                data-testid="view-list"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
      {searching && <p className="mb-3 text-sm text-slate-500">Results for “{search.trim()}”</p>}
      {tab === "archived" && !searching && (
        <p className="mb-3 text-sm text-slate-500">Archived files can be restored or deleted forever.</p>
      )}

      {/* Drive root: big category tiles, drag to arrange a personal layout */}
      {showCatTiles && (
        <div className="mb-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Categories — drag to arrange
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {orderedCategories.map((c) => {
              const Icon = CATEGORY_ICONS[c.key];
              const isDragging = dragCat === c.key;
              return (
                <div
                  key={c.key}
                  ref={(el) => {
                    if (el) tileRefs.current.set(c.key, el);
                    else tileRefs.current.delete(c.key);
                  }}
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); setDragCat(c.key); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => setDragCat(null)}
                  onDragOver={(e) => {
                    if (!dragCat) return;
                    e.preventDefault(); e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    moveCatBefore(dragCat, c.key);
                  }}
                  onDrop={(e) => { if (dragCat) { e.preventDefault(); e.stopPropagation(); setDragCat(null); } }}
                  onClick={() => switchTab(c.key)}
                  className={`group flex cursor-grab flex-col rounded-[4px] border bg-white p-4 transition-[border-color,box-shadow,opacity,transform] duration-200 active:cursor-grabbing ${
                    isDragging
                      ? "scale-[0.98] border-dashed border-slate-400 bg-slate-50 opacity-40"
                      : "border-slate-300/70 hover:border-slate-900"
                  }`}
                  data-testid={`drive-cat-${c.key}`}
                >
                  <div className="flex items-start justify-between">
                    <Icon className="h-7 w-7 text-[#711419]" strokeWidth={1.5} />
                    <ArrowUpRight className="h-4 w-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.75} />
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-slate-900">{c.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Category folder</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!filesLoading && files.length === 0 && childFolders.length === 0 && !showCatTiles ? (
        <div className="flex flex-col items-center justify-center rounded-[4px] border border-dashed border-slate-300 py-20 text-center">
          <Grid3X3 className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            {tab === "archived" ? "Nothing archived" : starOnly ? "Nothing starred yet" : searching ? "No results" : "This folder is empty"}
          </p>
          {canUpload && <p className="mt-1 text-xs text-slate-400">Drag files here or use Upload.</p>}
        </div>
      ) : filesLoading ? (
        viewMode === "card" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-40 rounded-[4px]" />)}
          </div>
        ) : (
          <div className="space-y-1.5">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 rounded-[4px]" />)}</div>
        )
      ) : childFolders.length === 0 && files.length === 0 ? null : viewMode === "card" ? (
        <>
          {childFolders.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {childFolders.map((f) => {
                const CatIcon = f.category ? CATEGORY_ICONS[f.category as DocCategoryKey] : null;
                return (
                  <div key={f.id} className="group flex items-center gap-2.5 rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5 transition-colors hover:border-slate-900" data-testid={`folder-${f.id}`}>
                    <button onClick={() => openFolder(f.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      {CatIcon
                        ? <CatIcon className="h-5 w-5 shrink-0 text-[#711419]" strokeWidth={1.75} />
                        : <Folder className="h-5 w-5 shrink-0 fill-sky-100 text-sky-500" />}
                      <span className="truncate text-sm font-medium text-slate-800">{f.name}</span>
                    </button>
                    {folderMenu(f)}
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {files.map((f) => {
              const { Icon, color } = fileVisual(f.name, f.contentType);
              return (
                <div key={f.id} className="group overflow-hidden rounded-[4px] border border-slate-300/70 bg-white transition-colors hover:border-slate-900" data-testid={`file-${f.id}`}>
                  <button
                    onClick={() => (isImage(f) || isPdf(f) ? setPreview(f) : download(f))}
                    className="flex h-28 w-full items-center justify-center overflow-hidden bg-slate-50"
                  >
                    {isImage(f) ? (
                      <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Icon className={`h-10 w-10 ${color}`} strokeWidth={1.5} />
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
                    {f.starred && tab !== "archived" && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                    {fileMenu(f)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* List view — folders then files as rows */
        <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
          <div className="grid grid-cols-[1fr_90px_110px_60px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Name</span><span>Size</span><span>Modified</span><span />
          </div>
          {childFolders.map((f) => {
            const CatIcon = f.category ? CATEGORY_ICONS[f.category as DocCategoryKey] : null;
            return (
              <div key={f.id} className="group grid grid-cols-[1fr_90px_110px_60px] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50" data-testid={`folder-row-${f.id}`}>
                <button onClick={() => openFolder(f.id)} className="flex min-w-0 items-center gap-2.5 text-left">
                  {CatIcon
                    ? <CatIcon className="h-4 w-4 shrink-0 text-[#711419]" strokeWidth={1.75} />
                    : <Folder className="h-4 w-4 shrink-0 fill-sky-100 text-sky-500" />}
                  <span className="truncate text-sm font-medium text-slate-800">{f.name}</span>
                </button>
                <span className="text-xs text-slate-400">—</span>
                <span className="text-xs text-slate-400">{f.updatedAt ? format(new Date(f.updatedAt), "MMM d, yyyy") : ""}</span>
                <span className="flex justify-end">{folderMenu(f)}</span>
              </div>
            );
          })}
          {files.map((f) => {
            const { Icon, color } = fileVisual(f.name, f.contentType);
            return (
              <div key={f.id} className="group grid grid-cols-[1fr_90px_110px_60px] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50" data-testid={`file-row-${f.id}`}>
                <button
                  onClick={() => (isImage(f) || isPdf(f) ? setPreview(f) : download(f))}
                  className="flex min-w-0 items-center gap-2.5 text-left"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                  <span className="truncate text-sm text-slate-800" title={f.name}>{f.name}</span>
                  {f.starred && tab !== "archived" && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                </button>
                <span className="text-xs text-slate-500">{prettySize(f.size) || "—"}</span>
                <span className="text-xs text-slate-500">{f.updatedAt ? format(new Date(f.updatedAt), "MMM d, yyyy") : ""}</span>
                <span className="flex justify-end">{fileMenu(f)}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen bg-[#f5f5f7]">
        {/* Sidebar — shared CRM-style dark collapsible panel */}
        <AppSidebar
          appKey="docs"
          header={{ title: "Documents", subtitle: "Command Center", onHome: () => navigate("/") }}
          activeKey={searching ? "" : tab}
          onSelect={(k) => switchTab(k as TabKey)}
          groups={[
            {
              items: [
                { key: "drive", label: "Drive", icon: HardDrive },
                { key: "library", label: "Library", icon: FolderTree },
              ],
            },
            {
              label: "Categories",
              items: DOC_CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: CATEGORY_ICONS[c.key] })),
            },
            {
              items: [
                { key: "archived", label: "Archived", icon: Archive },
                { key: "settings", label: "Settings", icon: Settings },
              ],
            },
          ]}
        />

      <div className="flex min-h-0 flex-1 flex-col">
      <AppTopBar
        currentUser={currentUser}
        center={
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
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* Library folder tree */}
        {tab === "library" && !searching && (
          <div className="hidden w-60 shrink-0 overflow-y-auto border-r border-black/[0.06] bg-white/40 p-2 md:block" data-testid="library-tree">
            <button
              onClick={() => openFolder(null)}
              className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm ${
                folderId === null ? "bg-[#711419]/10 font-semibold text-[#711419]" : "text-slate-700 hover:bg-slate-100"
              }`}
              data-testid="tree-root"
            >
              <HardDrive className="h-4 w-4 shrink-0 text-slate-400" /> Drive
            </button>
            {(foldersByParent.get(null) ?? []).map((f) => (
              <TreeNode
                key={f.id}
                folder={f}
                depth={0}
                selectedId={folderId}
                onSelect={(id) => openFolder(id)}
                foldersByParent={foldersByParent}
                expanded={expanded}
                onToggle={(id) =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}

        {/* Main */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto p-4 ${dragOver ? "bg-sky-50" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (canUpload && e.dataTransfer.types.includes("Files")) uploadFiles(e.dataTransfer.files); }}
          data-testid="docs-main"
        >
          {/* Toolbar — folder/upload actions (search lives in the top bar) */}
          <div className="mb-3 flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} data-testid="input-doc-upload" />
            <div className="ml-auto flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-lg"
                onClick={() => { setNewFolderName(""); setNewFolderOpen(true); }}
                disabled={!canUpload}
                data-testid="button-new-folder"
              >
                <FolderPlus className="mr-1.5 h-4 w-4" /> Folder
              </Button>
              <Button
                size="sm"
                className="h-9 rounded-lg bg-[#711419] hover:bg-[#8a1a1f]"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !canUpload}
                data-testid="button-upload"
              >
                {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                Upload
              </Button>
            </div>
          </div>

          {/* Mobile tab strip */}
          <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1 sm:hidden">
            {(["drive", "library", ...CATEGORY_KEYS, "archived", "settings"] as TabKey[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`shrink-0 rounded-[4px] px-3 py-1.5 text-xs font-medium ${
                  tab === t ? "bg-[#711419] text-white" : "border border-slate-300/70 bg-white text-slate-600"
                }`}
              >
                {tabLabel(t)}
              </button>
            ))}
          </div>

          {tab === "settings" ? <DocsSettings viewMode={viewMode} setMode={setMode} /> : contentArea}
        </main>
      </div>
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
                <SelectItem key={f.id} value={f.id}>{folderPath(f)}</SelectItem>
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


function TreeNode({
  folder, depth, selectedId, onSelect, foldersByParent, expanded, onToggle,
}: {
  folder: DocFolder;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  foldersByParent: Map<string | null, DocFolder[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const children = foldersByParent.get(folder.id) ?? [];
  const isOpen = expanded.has(folder.id);
  const CatIcon = folder.category ? CATEGORY_ICONS[folder.category as DocCategoryKey] : null;
  return (
    <div>
      <div
        className={`flex items-center rounded-[4px] ${selectedId === folder.id ? "bg-[#711419]/10" : "hover:bg-slate-100"}`}
        style={{ paddingLeft: depth * 14 }}
      >
        <button
          onClick={() => onToggle(folder.id)}
          className={`flex h-6 w-5 shrink-0 items-center justify-center text-slate-400 ${children.length === 0 ? "invisible" : ""}`}
          data-testid={`tree-toggle-${folder.id}`}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onSelect(folder.id)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1.5 text-left text-[13px] ${
            selectedId === folder.id ? "font-semibold text-[#711419]" : "text-slate-700"
          }`}
          data-testid={`tree-node-${folder.id}`}
        >
          {CatIcon
            ? <CatIcon className="h-3.5 w-3.5 shrink-0 text-[#711419]" strokeWidth={1.75} />
            : <Folder className="h-3.5 w-3.5 shrink-0 fill-sky-100 text-sky-500" />}
          <span className="truncate">{folder.name}</span>
        </button>
      </div>
      {isOpen && children.map((c) => (
        <TreeNode
          key={c.id}
          folder={c}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          foldersByParent={foldersByParent}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function DocsSettings({ viewMode, setMode }: { viewMode: ViewMode; setMode: (m: ViewMode) => void }) {
  const { data: stats } = useQuery<{ files: number; folders: number; totalSize: number; archived: number }>({
    queryKey: ["/api/docs/stats"],
  });
  const tiles = [
    { label: "Files", value: stats ? stats.files.toLocaleString() : "—" },
    { label: "Folders", value: stats ? stats.folders.toLocaleString() : "—" },
    { label: "Storage used", value: stats ? prettySize(stats.totalSize) || "0 B" : "—" },
    { label: "Archived", value: stats ? stats.archived.toLocaleString() : "—" },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-lg font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">Storage overview and preferences for the Documents app.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[4px] border border-slate-300/70 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900" data-testid={`docs-stat-${t.label.toLowerCase().replace(/\s+/g, "-")}`}>{t.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Default view</p>
        <p className="mt-0.5 text-xs text-slate-500">How folder contents are shown in Drive, Library, and category tabs.</p>
        <Select value={viewMode} onValueChange={(v) => setMode(v as ViewMode)}>
          <SelectTrigger className="mt-2 w-40" data-testid="select-default-view">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="card">Card view</SelectItem>
            <SelectItem value="list">List view</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Category tabs</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Each category tab (SOPs, Policies, Training, …) is backed by a protected folder — files uploaded in a tab
          live in its folder, and everything is also reachable from the Library tree. Category folders can't be
          renamed or deleted.
        </p>
      </div>
    </div>
  );
}
