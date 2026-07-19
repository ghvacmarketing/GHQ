import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, User, ImageIcon } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function CrmPhotoGallery() {
  usePageTitle("Photo Gallery");
  const [, navigate] = useLocation();
  const [lightbox, setLightbox] = useState<FeedPhoto | null>(null);

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

  if (authLoading || !currentUser) return null;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Camera className="h-5 w-5 text-[#711419]" />
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
              <div key={p.id} className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid={`feed-photo-${p.id}`}>
                <button onClick={() => setLightbox(p)} className="block w-full overflow-hidden">
                  <img
                    src={p.url}
                    alt={p.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </button>
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
        </div>
      )}
    </CrmLayout>
  );
}
