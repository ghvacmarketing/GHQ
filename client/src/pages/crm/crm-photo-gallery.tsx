import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isAfter, isBefore, startOfDay, subDays } from "date-fns";
import { User, ImageIcon, Download, Trash2, LayoutGrid, List, ZoomIn, ZoomOut, X, Check, Loader2 } from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser } from "@shared/schema";

type FeedPhoto = {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  createdAt: string | null;
  customerId: string | null;
  customerName: string | null;
  uploadedByName: string | null;
};

// Static class maps so Tailwind's JIT sees every variant
const GRID_CLASSES: Record<number, string> = {
  0: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
  1: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  2: "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8",
};
const SMALLEST = 2;
const LARGEST = 0;

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

// Fetch as a blob so the browser saves the file instead of navigating to it;
// falls back to opening in a new tab if the image host blocks the fetch.
async function downloadPhoto(p: FeedPhoto) {
  try {
    const res = await fetch(p.url, { credentials: "include" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = p.name || "photo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch {
    window.open(p.url, "_blank");
  }
}

export default function CrmPhotoGallery() {
  usePageTitle("Photo Gallery");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [lightbox, setLightbox] = useState<FeedPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FeedPhoto | null>(null);

  // Multi-select: hover any photo to reveal its select circle; having at
  // least one selection is what shows the bulk-action bar (Google Photos
  // style — no separate mode toggle).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  // View controls
  const [view, setView] = useState<"grid" | "list">("grid");
  const [size, setSize] = useState(SMALLEST); // 0 = large … 2 = small (default: smallest)
  const [customerFilter, setCustomerFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const deletePhoto = useMutation({
    mutationFn: async (p: FeedPhoto) => {
      if (!p.customerId) throw new Error("This photo isn't linked to a customer and can't be deleted here.");
      return apiRequest("DELETE", `/api/crm/customers/${p.customerId}/files/${p.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/photos/feed"] });
      setConfirmDelete(null);
      setLightbox(null);
      toast({ title: "Photo deleted" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't delete the photo", variant: "destructive" }),
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: photos, isLoading } = useQuery<FeedPhoto[]>({
    queryKey: ["/api/crm/photos/feed"],
    refetchInterval: 10 * 1000, // near real-time monitoring
    enabled: !!currentUser,
  });

  // Filter options derived from the loaded feed
  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of photos ?? []) {
      if (p.customerId && p.customerName) map.set(p.customerId, p.customerName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [photos]);

  const userOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of photos ?? []) {
      if (p.uploadedByName) names.add(p.uploadedByName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [photos]);

  const filtered = useMemo(() => {
    let list = photos ?? [];
    if (customerFilter !== "all") list = list.filter((p) => p.customerId === customerFilter);
    if (userFilter !== "all") list = list.filter((p) => p.uploadedByName === userFilter);

    let from: Date | null = null;
    let to: Date | null = null;
    const today = startOfDay(new Date());
    if (datePreset === "today") from = today;
    else if (datePreset === "7d") from = subDays(today, 7);
    else if (datePreset === "30d") from = subDays(today, 30);
    else if (datePreset === "custom") {
      if (dateFrom) from = startOfDay(new Date(`${dateFrom}T00:00:00`));
      if (dateTo) to = startOfDay(new Date(`${dateTo}T00:00:00`));
    }
    if (from) list = list.filter((p) => p.createdAt && !isBefore(new Date(p.createdAt), from!));
    if (to) list = list.filter((p) => p.createdAt && !isAfter(new Date(p.createdAt), new Date(to!.getTime() + 24 * 60 * 60 * 1000 - 1)));

    return list;
  }, [photos, customerFilter, userFilter, datePreset, dateFrom, dateTo]);

  const filtersActive =
    customerFilter !== "all" || userFilter !== "all" || datePreset !== "all";

  const clearFilters = () => {
    setCustomerFilter("all");
    setUserFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  };

  // ── Multi-select + bulk actions ──
  const selectedItems = useMemo(() => (photos ?? []).filter((p) => selected.has(p.id)), [photos, selected]);
  const deletableCount = selectedItems.filter((p) => p.customerId).length;
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const selectAllFiltered = () => setSelected(new Set(filtered.map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());
  const selectionActive = selected.size > 0;

  const bulkDownload = async () => {
    setBulkDownloading(true);
    try {
      for (const p of filtered.filter((x) => selected.has(x.id))) {
        await downloadPhoto(p);
        await new Promise((r) => setTimeout(r, 350)); // stagger so the browser doesn't block
      }
    } finally {
      setBulkDownloading(false);
    }
  };

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const items = selectedItems.filter((p) => p.customerId);
      let ok = 0, fail = 0;
      for (const p of items) {
        try {
          await apiRequest("DELETE", `/api/crm/customers/${p.customerId}/files/${p.id}`);
          ok++;
        } catch {
          fail++;
        }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/photos/feed"] });
      setConfirmBulkDelete(false);
      clearSelection();
      toast({ title: `${ok} photo${ok !== 1 ? "s" : ""} deleted${fail ? `, ${fail} failed` : ""}` });
    },
    onError: (e: any) => toast({ title: e?.message || "Bulk delete failed", variant: "destructive" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  // Escape closes the lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (authLoading || !currentUser) return null;

  const photoActions = (p: FeedPhoto) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); downloadPhoto(p); }}
        className="rounded-md bg-black/55 p-1.5 text-white hover:bg-black/80"
        title="Download"
        data-testid={`download-photo-${p.id}`}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}
        className="rounded-md bg-black/55 p-1.5 text-white hover:bg-red-600"
        title="Delete"
        data-testid={`delete-photo-${p.id}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              Photo Gallery
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every job-site photo as it comes in — refreshes automatically.
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-[2px] bg-green-500" />
            Live
          </span>
        </div>

        {/* Toolbar: filters on the left, size + view controls on the right */}
        <div className="flex flex-wrap items-center gap-2" data-testid="gallery-toolbar">
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="h-9 w-[170px] bg-white text-sm" data-testid="filter-customer">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {customerOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-9 w-[150px] bg-white text-sm" data-testid="filter-user">
              <SelectValue placeholder="Taken by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {userOptions.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="h-9 w-[140px] bg-white text-sm" data-testid="filter-date">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any date</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom range…</SelectItem>
            </SelectContent>
          </Select>

          {datePreset === "custom" && (
            <div className="flex items-center gap-1.5" data-testid="filter-date-range">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                aria-label="To date"
              />
            </div>
          )}

          {filtersActive && (
            <button
              onClick={clearFilters}
              className="flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              data-testid="clear-filters"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground" data-testid="photo-count">
              {filtersActive && photos ? `${filtered.length} of ${photos.length}` : `${filtered.length}`} photos
            </span>

            {view === "grid" && (
              <div className="flex items-center rounded-md border border-input bg-white">
                <button
                  onClick={() => setSize((s) => Math.min(SMALLEST, s + 1))}
                  disabled={size === SMALLEST}
                  className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-foreground disabled:opacity-35"
                  title="Smaller thumbnails"
                  data-testid="size-smaller"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSize((s) => Math.max(LARGEST, s - 1))}
                  disabled={size === LARGEST}
                  className="flex h-9 w-9 items-center justify-center border-l border-input text-slate-600 hover:text-foreground disabled:opacity-35"
                  title="Larger thumbnails"
                  data-testid="size-larger"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-center rounded-md border border-input bg-white">
              <button
                onClick={() => setView("grid")}
                className={`flex h-9 w-9 items-center justify-center ${view === "grid" ? "bg-[#711419] text-white" : "text-slate-600 hover:text-foreground"} rounded-l-md`}
                title="Grid view"
                data-testid="view-grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`flex h-9 w-9 items-center justify-center border-l border-input ${view === "list" ? "bg-[#711419] text-white" : "text-slate-600 hover:text-foreground"} rounded-r-md`}
                title="List view"
                data-testid="view-list"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {selectionActive && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#711419]/25 bg-[#711419]/[0.06] px-3 py-2" data-testid="selection-bar">
            <button onClick={clearSelection} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800" title="Clear selection" data-testid="selection-clear-x">
              <X className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-800">{selected.size} selected</span>
            <button onClick={selectAllFiltered} className="text-xs font-medium text-[#711419] hover:underline">Select all {filtered.length}</button>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={selected.size === 0 || bulkDownloading} onClick={bulkDownload} data-testid="bulk-download">
                {bulkDownloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                Download{selected.size ? ` (${selected.size})` : ""}
              </Button>
              <Button size="sm" variant="destructive" disabled={deletableCount === 0} onClick={() => setConfirmBulkDelete(true)} data-testid="bulk-delete">
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete{deletableCount ? ` (${deletableCount})` : ""}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className={GRID_CLASSES[1]}>
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
            <ImageIcon className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              {filtersActive ? "No photos match these filters" : "No photos yet"}
            </p>
            <p className="text-xs text-slate-400">
              {filtersActive
                ? "Try widening the date range or clearing a filter."
                : "Photos taken in the field will appear here in real time."}
            </p>
          </div>
        ) : view === "list" ? (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm" data-testid="photo-feed-list">
            {filtered.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center gap-3 p-2.5 ${selected.has(p.id) ? "bg-[#711419]/[0.06]" : ""}`}
                data-testid={`feed-row-${p.id}`}
              >
                <button
                  onClick={() => toggleSelect(p.id)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-opacity ${
                    selected.has(p.id)
                      ? "border-[#711419] bg-[#711419] text-white opacity-100"
                      : `border-slate-300 text-transparent hover:text-slate-300 ${selectionActive ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`
                  }`}
                  aria-label="Select photo"
                  data-testid={`select-row-${p.id}`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => (selectionActive ? toggleSelect(p.id) : setLightbox(p))} className="shrink-0 overflow-hidden rounded-lg">
                  <img src={p.url} alt={p.name} loading="lazy" className="h-14 w-14 object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => (selectionActive ? toggleSelect(p.id) : setLightbox(p))}
                    className="block max-w-full truncate text-left text-sm font-semibold text-foreground hover:underline"
                    title={p.name}
                  >
                    {p.name}
                  </button>
                  <p className="flex flex-wrap items-center gap-x-1.5 truncate text-xs text-muted-foreground">
                    {p.customerName && (
                      <>
                        <Link href={`/crm/customers/${p.customerId}`} className="text-[#711419] hover:underline">
                          {p.customerName}
                        </Link>
                        <span>·</span>
                      </>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {p.uploadedByName || "Unknown"}
                    </span>
                    {p.createdAt && (
                      <>
                        <span>·</span>
                        <span>{format(new Date(p.createdAt), "EEE, MMM d · h:mm a")}</span>
                      </>
                    )}
                  </p>
                </div>
                {!selectionActive && <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">{photoActions(p)}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className={GRID_CLASSES[size]} data-testid="photo-feed">
            {filtered.map((p) => (
              <div
                key={p.id}
                className={`group relative overflow-hidden rounded-lg border bg-card shadow-sm ${selected.has(p.id) ? "border-[#711419] ring-2 ring-[#711419]" : "border-border"}`}
                data-testid={`feed-photo-${p.id}`}
              >
                <button onClick={() => (selectionActive ? toggleSelect(p.id) : setLightbox(p))} className="block w-full overflow-hidden">
                  <img
                    src={p.url}
                    alt={p.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </button>
                <button
                  onClick={() => toggleSelect(p.id)}
                  className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow transition-opacity ${
                    selected.has(p.id)
                      ? "border-white bg-[#711419] text-white opacity-100"
                      : `border-white bg-black/35 text-white/70 hover:text-white ${selectionActive ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`
                  }`}
                  aria-label="Select photo"
                  data-testid={`select-photo-${p.id}`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                {!selectionActive && (
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    {photoActions(p)}
                  </div>
                )}
                <div className={size === SMALLEST ? "space-y-0.5 p-1.5" : "space-y-0.5 p-2.5"}>
                  <p className={`truncate font-semibold text-foreground ${size === SMALLEST ? "text-[10px]" : "text-xs"}`} title={p.name}>{p.name}</p>
                  {p.customerName && (
                    <Link
                      href={`/crm/customers/${p.customerId}`}
                      className={`block truncate text-[#711419] hover:underline ${size === SMALLEST ? "text-[10px]" : "text-xs"}`}
                    >
                      {p.customerName}
                    </Link>
                  )}
                  <p className={`flex items-center gap-1 truncate text-muted-foreground ${size === SMALLEST ? "text-[9px]" : "text-[11px]"}`}>
                    <User className="h-3 w-3 shrink-0" />
                    {p.uploadedByName || "Unknown"}
                    {p.createdAt && <> · {format(new Date(p.createdAt), "MMM d, h:mm a")}</>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-6"
          onClick={() => setLightbox(null)}
          data-testid="gallery-lightbox"
        >
          <img src={lightbox.url} alt={lightbox.name} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
          <div className="mt-3 text-center text-sm text-white/80">
            <p className="font-semibold text-white">{lightbox.name}</p>
            <p>
              {lightbox.customerName && `${lightbox.customerName} · `}
              {lightbox.uploadedByName || "Unknown"}
              {lightbox.createdAt && ` · ${format(new Date(lightbox.createdAt), "EEE, MMM d yyyy · h:mm a")}`}
            </p>
          </div>
          <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="secondary" size="sm" onClick={() => downloadPhoto(lightbox)} data-testid="lightbox-download">
              <Download className="mr-1.5 h-4 w-4" /> Download
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(lightbox)} data-testid="lightbox-delete">
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirmDelete?.name}” will be removed from the customer's files. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deletePhoto.isPending}
              onClick={() => confirmDelete && deletePhoto.mutate(confirmDelete)}
              data-testid="confirm-delete-photo"
            >
              {deletePhoto.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={(o) => !o && setConfirmBulkDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletableCount} photo{deletableCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletableCount} selected photo{deletableCount !== 1 ? "s" : ""} will be removed from the customers' files. This can't be undone.
              {selected.size > deletableCount ? ` (${selected.size - deletableCount} not linked to a customer will be skipped.)` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={bulkDelete.isPending || deletableCount === 0}
              onClick={() => bulkDelete.mutate()}
              data-testid="confirm-bulk-delete"
            >
              {bulkDelete.isPending ? "Deleting…" : `Delete ${deletableCount}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
