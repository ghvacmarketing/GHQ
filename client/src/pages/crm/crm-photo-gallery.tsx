import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { User, ImageIcon, Download, Trash2 } from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-5">
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
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Live
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : !photos || photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
            <ImageIcon className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No photos yet</p>
            <p className="text-xs text-slate-400">Photos taken in the field will appear here in real time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="photo-feed">
            {photos.map((p) => (
              <div key={p.id} className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid={`feed-photo-${p.id}`}>
                <button onClick={() => setLightbox(p)} className="block w-full overflow-hidden">
                  <img
                    src={p.url}
                    alt={p.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </button>
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className="truncate text-xs font-semibold text-foreground" title={p.name}>{p.name}</p>
                  {p.customerName && (
                    <Link href={`/crm/customers/${p.customerId}`} className="block truncate text-xs text-[#711419] hover:underline">
                      {p.customerName}
                    </Link>
                  )}
                  <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
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
    </CrmLayout>
  );
}
