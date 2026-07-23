import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, Download, ImageIcon, ImagePlus, Loader2, Search, Trash2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MobileShell from "./mobile-shell";
import { PhotoViewer } from "@/components/mobile/photo-viewer";
import type { CrmUser, CustomerFile } from "@shared/schema";

export default function MobilePhotos() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  // The customer photos get attached to — always chosen via search.
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; name: string; phone?: string | null } | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const activeCustomer = pickedCustomer;
  const customerId = activeCustomer?.id || null;

  // Search ANY customer to attach photos to (mobile-friendly, tech-accessible).
  const { data: searchResults = [], isFetching: searching } = useQuery<Array<{ id: string; name: string; phone?: string | null }>>({
    queryKey: ["/api/mobile/customers", customerSearch],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/customers?search=${encodeURIComponent(customerSearch.trim())}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchActive && customerSearch.trim().length >= 2,
  });

  const chooseCustomer = (c: { id: string; name: string; phone?: string | null }) => {
    setPickedCustomer({ id: c.id, name: c.name, phone: c.phone ?? null });
    setSearchActive(false);
    setCustomerSearch("");
    searchInputRef.current?.blur();
  };
  const cancelSearch = () => {
    setSearchActive(false);
    setCustomerSearch("");
    searchInputRef.current?.blur();
  };

  // Recent company-wide photos for the horizontal gallery strip. Tapping one
  // jumps to the customer it's attached to.
  type FeedPhoto = {
    id: string; url: string; name: string; createdAt: string | null;
    customerId: string | null; customerName: string | null; uploadedByName: string | null;
  };
  const { data: recentPhotos = [] } = useQuery<FeedPhoto[]>({
    queryKey: ["/api/mobile/photos/feed"],
    queryFn: async () => {
      const res = await fetch("/api/mobile/photos/feed", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser,
    refetchInterval: 30 * 1000,
  });

  // Customers with recent photo activity — bigger rail above the photo strip
  const recentCustomers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; latest: FeedPhoto }>();
    for (const rp of recentPhotos) {
      if (!rp.customerId) continue;
      const cur = map.get(rp.customerId);
      if (cur) {
        cur.count++;
      } else {
        map.set(rp.customerId, { id: rp.customerId, name: rp.customerName || "Customer", count: 1, latest: rp });
      }
    }
    return Array.from(map.values()).slice(0, 10);
  }, [recentPhotos]);

  const { data: files, isLoading: filesLoading } = useQuery<CustomerFile[]>({
    queryKey: ["/api/crm/customers", customerId, "files"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/files`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load photos");
      return res.json();
    },
    enabled: !!customerId,
  });
  const photos = (files || []).filter((f) => f.contentType?.startsWith("image/"));

  // Supervisor+ can pull photos down or remove bad shots from the record.
  const isSupervisorPlus = !!currentUser && ["supervisor", "admin", "owner"].includes(currentUser.role);
  const [confirmDelete, setConfirmDelete] = useState<CustomerFile | null>(null);

  // iOS-style long-press preview: deliberate press compresses the tile, then
  // the photo lifts to a centered preview over a blurred, dimmed backdrop with
  // a Liquid Glass action surface. Driven by body.ios-preview-open so the CSS
  // transitions (not a modal fade) do the work.
  const LONG_PRESS_DELAY = 380;
  const MOVE_TOLERANCE = 12;
  const [preview, setPreview] = useState<CustomerFile | null>(null);
  const [previewW, setPreviewW] = useState<number | undefined>(undefined);
  const [actionsTop, setActionsTop] = useState<number | null>(null);
  // While set, the preview is pinned (untransitioned) at the source tile's
  // position/scale; clearing it lets the CSS transition morph it to center.
  const [morph, setMorph] = useState<string | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const lastPreviewRef = useRef<CustomerFile | null>(null);
  if (preview) lastPreviewRef.current = preview;
  const shownPreview = preview ?? lastPreviewRef.current; // keeps content during the close transition
  const pressTimer = useRef<number | undefined>(undefined);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    document.body.classList.toggle("ios-preview-open", !!preview);
    return () => document.body.classList.remove("ios-preview-open");
  }, [preview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const computeActionsTop = (nw: number, nh: number, w: number) => {
    const h = Math.min((w * (nh || 1)) / (nw || 1), window.innerHeight * 0.78);
    return Math.min(window.innerHeight / 2 + h / 2 + 14, window.innerHeight - 160);
  };

  const startPress = (p: CustomerFile, e: React.PointerEvent) => {
    if (!isSupervisorPlus) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    pressStart.current = { x: e.clientX, y: e.clientY };
    setPressedId(p.id);
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 600);
      // A tile is tiny — enlarge to a real preview, capped by the CSS max sizes.
      const w = Math.min(window.innerWidth * 0.88, 720);
      setPreviewW(w);
      // The grid thumbnail is already loaded, so its natural size lets us pin
      // the menu correctly on the very first frame (no bottom-anchor flash).
      const gridImg = target.querySelector("img");
      if (gridImg) setActionsTop(computeActionsTop(gridImg.naturalWidth, gridImg.naturalHeight, w));
      // Lift from the tile itself: start the preview at the tile's position
      // and scale, then release so it morphs smoothly to center.
      const r = target.getBoundingClientRect();
      const dx = r.left + r.width / 2 - window.innerWidth / 2;
      const dy = r.top + r.height / 2 - window.innerHeight / 2;
      setMorph(`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${r.width / w})`);
      navigator.vibrate?.(10);
      setPressedId(null);
      setPreview(p);
      requestAnimationFrame(() => requestAnimationFrame(() => setMorph(null)));
    }, LONG_PRESS_DELAY);
  };
  const cancelPress = () => {
    window.clearTimeout(pressTimer.current);
    pressStart.current = null;
    setPressedId(null);
  };
  const movePress = (e: React.PointerEvent) => {
    const s = pressStart.current;
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancelPress();
  };

  // Correct the menu position once the full-size preview has loaded (in case
  // the thumbnail's natural size differed or was unavailable).
  const placeActions = () => {
    const img = previewImgRef.current;
    if (!img || !previewW || !img.naturalWidth) return;
    setActionsTop(computeActionsTop(img.naturalWidth, img.naturalHeight, Math.min(previewW, window.innerWidth * 0.88, 720)));
  };

  const deletePhoto = useMutation({
    mutationFn: async (p: CustomerFile) =>
      apiRequest("DELETE", `/api/crm/customers/${customerId}/files/${p.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "files"] });
      setConfirmDelete(null);
      toast({ title: "Photo deleted" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't delete the photo", variant: "destructive" }),
  });

  const downloadPhoto = async (p: { url: string; name: string }) => {
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
  };

  // In-app camera: shutter → photo uploads immediately, no confirm/retake step
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  // Shots appear instantly with a local preview while uploading in the background
  const [pendingShots, setPendingShots] = useState<Array<{ id: string; url: string; status: "uploading" | "done" | "error" }>>([]);
  const [viewer, setViewer] = useState<{ src: string; name: string } | null>(null);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Attach after the overlay renders
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      // No camera permission/support — fall back to the native picker
      fileInputRef.current?.click();
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      // INSTANT: the shot shows up immediately with a local preview; the
      // upload runs in the background and the shutter never blocks.
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const localUrl = URL.createObjectURL(blob);
      setPendingShots((prev) => [{ id: localId, url: localUrl, status: "uploading" as const }, ...prev]);
      uploadOne(file)
        .then(() => setPendingShots((prev) => prev.map((ps) => (ps.id === localId ? { ...ps, status: "done" as const } : ps))))
        .catch(() => setPendingShots((prev) => prev.map((ps) => (ps.id === localId ? { ...ps, status: "error" as const } : ps))));
    }, "image/jpeg", 0.85);
  };

  // Single-file background upload used by the camera (no global blocking)
  const uploadOne = async (file: File) => {
    if (!customerId) throw new Error("no customer");
    const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
      name: file.name,
      size: file.size,
      contentType: file.type,
    });
    const { uploadURL, objectPath } = await presignRes.json();
    await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    const fileUrl = objectPath.startsWith("/objects") ? objectPath : `/objects/${objectPath}`;
    await apiRequest("POST", `/api/crm/customers/${customerId}/files`, {
      name: file.name,
      url: fileUrl,
      objectPath,
      contentType: file.type,
      size: file.size,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "files"] });
  };

  const handleUpload = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0 || !customerId) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type,
        });
        const { uploadURL, objectPath } = await presignRes.json();
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        // objectPath may already carry the /objects prefix (Neon store mode)
        const fileUrl = objectPath.startsWith("/objects") ? objectPath : `/objects/${objectPath}`;
        await apiRequest("POST", `/api/crm/customers/${customerId}/files`, {
          name: file.name,
          url: fileUrl,
          objectPath,
          contentType: file.type,
          size: file.size,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "files"] });
      toast({ title: `${list.length} photo${list.length > 1 ? "s" : ""} uploaded` });
    } catch (e) {
      console.error("Photo upload error:", e);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <MobileShell>
      <div className="p-4 space-y-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Photos</h2>
          <p className="text-sm text-slate-500">Search any customer to add photos, or browse recent shots.</p>
        </div>

        {/* iOS-style search: minimal pill; Cancel slides in on focus and the
            results panel eases in below while the page content steps aside */}
        <div className="flex items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              onFocus={() => setSearchActive(true)}
              placeholder="Search customers"
              className="h-10 w-full rounded-full bg-slate-100 pl-9 pr-9 text-[16px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:bg-slate-200/60"
              data-testid="input-customer-search"
            />
            {customerSearch && (
              <button
                onClick={() => { setCustomerSearch(""); searchInputRef.current?.focus(); }}
                className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-300 text-white"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            onClick={cancelSearch}
            className={`overflow-hidden whitespace-nowrap text-[15px] font-medium text-[#711419] transition-all duration-300 ease-out ${
              searchActive ? "ml-3 max-w-[72px] opacity-100" : "ml-0 max-w-0 opacity-0"
            }`}
            data-testid="button-cancel-search"
          >
            Cancel
          </button>
        </div>

        {/* Search results (only while searching) */}
        {searchActive && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300" data-testid="customer-search-results">
            {customerSearch.trim().length < 2 ? (
              <p className="py-8 text-center text-sm text-slate-400">Search any customer by name or phone.</p>
            ) : searching ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : searchResults.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No customers match &ldquo;{customerSearch.trim()}&rdquo;.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => chooseCustomer(c)}
                    className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left last:border-0 active:bg-slate-50"
                    data-testid={`search-customer-${c.id}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#711419]/10 text-[13px] font-semibold text-[#711419]">
                      {(c.name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{c.name}</span>
                      {c.phone && <span className="block truncate text-xs text-slate-500">{c.phone}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={searchActive ? "hidden" : "contents"}>

        {/* Active target: the customer photos will be saved to */}
        {activeCustomer ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#711419]/25 bg-[#711419]/[0.06] px-4 py-3" data-testid="photo-target">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#711419]/70">Saving photos to</p>
              <p className="truncate font-semibold text-slate-900">{activeCustomer.name}</p>
              {activeCustomer.phone && <p className="truncate text-xs text-slate-500">{activeCustomer.phone}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => { setCustomerSearch(""); setSearchActive(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-95"
                data-testid="button-change-customer"
              >
                Change
              </button>
              <button
                onClick={() => setPickedCustomer(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 active:scale-95"
                data-testid="button-clear-customer"
                aria-label="Clear customer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Capture / library */}
        {activeCustomer && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
              data-testid="input-photo-file"
            />
            <div className="flex gap-2">
              <button
                onClick={openCamera}
                disabled={uploading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#711419] py-3.5 font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-take-photo"
              >
                <Camera className="h-5 w-5" />
                Take Photo
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3.5 font-semibold text-slate-700 shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-add-from-library"
                aria-label="Add from library"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </button>
            </div>
          </>
        )}

        {/* Customers with recent photo activity — larger cards, more info */}
        {recentCustomers.length > 0 && (
          <div className="pt-1" data-testid="recent-customers">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Customers</p>
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-pl-4">
              {recentCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/mobile/customers/${c.id}`)}
                  className="w-56 shrink-0 snap-start overflow-hidden rounded-lg border border-slate-100 bg-white text-left shadow-sm transition-transform active:scale-[0.98]"
                  data-testid={`recent-customer-${c.id}`}
                >
                  <img src={c.latest.url} alt="" loading="lazy" className="h-28 w-full object-cover" />
                  <div className="px-3.5 py-2.5">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{c.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {c.count} recent photo{c.count !== 1 ? "s" : ""}
                      {c.latest.uploadedByName ? ` · ${c.latest.uploadedByName}` : ""}
                      {c.latest.createdAt ? ` · ${format(new Date(c.latest.createdAt), "MMM d")}` : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent photos across the company — tap to open who it's linked to */}
        {recentPhotos.length > 0 && (
          <div className="pt-1" data-testid="recent-photos">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent — all customers</p>
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-pl-4">
              {recentPhotos.map((rp) => (
                <button
                  key={rp.id}
                  onClick={() => rp.customerId && navigate(`/mobile/customers/${rp.customerId}`)}
                  className="w-32 shrink-0 snap-start text-left transition-transform active:scale-95"
                  data-testid={`recent-photo-${rp.id}`}
                >
                  <img
                    src={rp.url}
                    alt={rp.name}
                    loading="lazy"
                    className="aspect-square w-32 rounded-lg border border-slate-100 object-cover shadow-sm"
                  />
                  <p className="mt-2 truncate text-[12px] font-semibold text-slate-800">{rp.customerName || "No customer"}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {rp.uploadedByName || "Unknown"}
                    {rp.createdAt ? ` · ${format(new Date(rp.createdAt), "MMM d")}` : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Photo grid */}
        {customerId && (
          filesLoading ? (
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="aspect-square rounded-lg" />
              <Skeleton className="aspect-square rounded-lg" />
              <Skeleton className="aspect-square rounded-lg" />
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-300">
              <ImageIcon className="h-10 w-10" />
              <p className="text-sm text-slate-400">No photos yet for {activeCustomer?.name || "this customer"}.</p>
            </div>
          ) : (
            <div className="photo-grid-noselect grid grid-cols-3 gap-2" data-testid="photo-grid">
              {photos.map((p) => (
                <div key={p.id} className="relative overflow-hidden rounded-lg">
                  <button
                    onClick={() => {
                      if (suppressClick.current) { suppressClick.current = false; return; }
                      setViewer({ src: p.url, name: p.name });
                    }}
                    onPointerDown={(e) => startPress(p, e)}
                    onPointerMove={movePress}
                    onPointerUp={cancelPress}
                    onPointerCancel={cancelPress}
                    onPointerLeave={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`ios-press-source block w-full select-none overflow-hidden rounded-lg ${pressedId === p.id ? "is-pressed" : ""}`}
                    style={{ WebkitTouchCallout: "none" }}
                    data-testid={`photo-${p.id}`}
                  >
                    <img
                      src={p.url}
                      alt={p.name}
                      loading="lazy"
                      draggable={false}
                      className="pointer-events-none aspect-square w-full select-none rounded-lg object-cover"
                      style={{ WebkitTouchCallout: "none" }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        </div>
      </div>

      {/* iOS-style long-press preview: always mounted so the CSS transitions
          run; visibility is driven by body.ios-preview-open */}
      <div
        className="ios-preview-backdrop"
        onClick={() => setPreview(null)}
        data-testid="photo-preview-backdrop"
      />
      <img
        ref={previewImgRef}
        className="ios-preview-item"
        src={shownPreview?.url}
        alt={shownPreview?.name || ""}
        draggable={false}
        decoding="async"
        onLoad={placeActions}
        style={{
          left: "50%",
          top: "50%",
          width: previewW,
          WebkitTouchCallout: "none",
          ...(morph ? { transform: morph, transition: "none" } : {}),
        }}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="photo-preview-item"
      />
      <div
        className="ios-preview-actions liquid-glass"
        style={actionsTop != null ? { top: actionsTop, bottom: "auto" } : undefined}
        onClick={(e) => e.stopPropagation()}
        data-testid="photo-preview-actions"
      >
        <button
          onClick={() => { if (shownPreview) downloadPhoto(shownPreview); setPreview(null); }}
          className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-[16px] text-slate-900 active:bg-white/40"
          data-testid="action-download"
        >
          Download <Download className="h-5 w-5 text-slate-700" />
        </button>
        <div className="mx-2 h-px bg-slate-900/10" />
        <button
          onClick={() => { if (shownPreview) setConfirmDelete(shownPreview); setPreview(null); }}
          className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-[16px] text-red-600 active:bg-white/40"
          data-testid="action-delete"
        >
          Delete <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Delete confirmation (supervisor+) */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-lg">
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

      {/* Fullscreen viewer + markup editor */}
      {viewer && (
        <PhotoViewer
          src={viewer.src}
          name={viewer.name}
          customerId={customerId}
          onClose={() => setViewer(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "files"] })}
        />
      )}

      {/* Fullscreen in-app camera — every shutter press auto-saves to the account */}
      {cameraOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black" data-testid="camera-overlay">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="min-h-0 flex-1 object-cover"
          />
          {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}
          <button
            onClick={closeCamera}
            className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
            style={{ top: "calc(12px + env(safe-area-inset-top))" }}
            data-testid="button-close-camera"
            aria-label="Close camera"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black via-black/80 to-transparent pt-10"
            style={{ paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}
          >
            {pendingShots.length > 0 && (
              <div className="flex w-full items-center gap-2 overflow-x-auto px-4 pb-1" data-testid="camera-session-strip">
                {pendingShots.map((ps) => (
                  <div key={ps.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/25">
                    <img src={ps.url} alt="" className="h-full w-full object-cover" />
                    {ps.status === "uploading" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </span>
                    )}
                    {ps.status === "error" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-red-600/60 text-[10px] font-bold text-white">!</span>
                    )}
                  </div>
                ))}
                <span className="ml-1 shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                  {pendingShots.length} this session
                </span>
              </div>
            )}
            <p className="text-xs font-medium text-white/70">
              Auto-saves to {activeCustomer?.name || "the customer"}
            </p>
            <button
              onClick={capturePhoto}
              className="flex h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white transition-transform active:scale-90"
              data-testid="button-shutter"
              aria-label="Take photo"
            >
              <span className="h-[58px] w-[58px] rounded-full bg-white" />
            </button>
          </div>
        </div>
      )}

    </MobileShell>
  );
}
