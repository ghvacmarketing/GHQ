import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, Download, ImageIcon, ImagePlus, ListFilter, Loader2, Pencil, Play, Search, Trash2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isNativeApp, pickNativeLibraryPhotos, takeNativePhoto, useKeyboardInset } from "@/lib/native";
import { customerTypeBadge } from "./mobile-quote-new";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MobileShell from "./mobile-shell";
import { PhotoViewer } from "@/components/mobile/photo-viewer";
import { PhotoAnnotator } from "@/components/mobile/photo-annotator";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { SheetSelect } from "@/components/mobile/sheet-select";
import type { CrmUser, CustomerFile } from "@shared/schema";

export default function MobilePhotos() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  // The customer photos get attached to — always chosen via search.
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; name: string; phone?: string | null; customerType?: string | null } | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  // Filter-by-customer mode: the page shows ONLY that customer's media —
  // no Today's jobs, no rails — until the filter is cleared.
  const [customerOnly, setCustomerOnly] = useState(false);
  // What a search pick MEANS: "target" = save-media-to flow (sheet stays,
  // capture actions appear); "filter" = browse their media on the page.
  const searchIntent = useRef<"target" | "filter">("target");
  const [customerSearch, setCustomerSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // The picker works exactly like the address finder: the input only MOUNTS
  // once the sheet has finished sliding in (iOS births the caret against the
  // layer state at focus time — a moving sheet leaves it displaced), then
  // focuses; the results list pads its bottom above the keyboard.
  const keyboardInset = useKeyboardInset();
  const [searchSettled, setSearchSettled] = useState(false);
  useEffect(() => {
    if (!searchActive) {
      setSearchSettled(false);
      return;
    }
    const t = setTimeout(() => setSearchSettled(true), 540);
    return () => clearTimeout(t);
  }, [searchActive]);
  useEffect(() => {
    if (searchSettled) searchInputRef.current?.focus({ preventScroll: true });
  }, [searchSettled]);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Deep links from the "+" Add Photo picker: ?cid=&cname= preselects the
  // target customer; ?pick=1 opens the search overlay immediately.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get("cid");
    const cname = params.get("cname");
    if (cid) {
      setPickedCustomer({ id: cid, name: cname || "Customer", phone: null });
      // Straight to the sheet's capture step — no on-page buttons.
      setSearchActive(true);
    }
    if (params.get("pick") === "1") setSearchActive(true);
    if (cid || params.get("pick")) window.history.replaceState({}, "", "/mobile/photos");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Techs can only attach photos while ON SITE at their job — the picker
  // endpoint returns exactly that job (or nothing = blocked).
  const isTechRole = currentUser?.role === "tech";
  const { data: photoTargets } = useQuery<{ mode: string; jobs: Array<{ customerId: string; customerName: string | null }> }>({
    queryKey: ["/api/mobile/photo-targets"],
    queryFn: async () => {
      const res = await fetch("/api/mobile/photo-targets", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!currentUser && isTechRole,
    refetchInterval: 60 * 1000,
  });
  const techOnsiteJob = isTechRole ? photoTargets?.jobs?.[0] || null : null;
  const techBlocked = isTechRole && photoTargets !== undefined && !techOnsiteJob;
  useEffect(() => {
    if (techOnsiteJob && !pickedCustomer) {
      setPickedCustomer({ id: techOnsiteJob.customerId, name: techOnsiteJob.customerName || "Customer", phone: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techOnsiteJob?.customerId]);

  const activeCustomer = techBlocked ? null : pickedCustomer;
  const customerId = activeCustomer?.id || null;

  // Search ANY customer to attach photos to (mobile-friendly, tech-accessible).
  const { data: searchResults = [] } = useQuery<Array<{ id: string; name: string; phone?: string | null; customerType?: string | null; fullAddress?: string | null }>>({
    queryKey: ["/api/mobile/customers", customerSearch],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/customers?search=${encodeURIComponent(customerSearch.trim())}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchActive && customerSearch.trim().length >= 2,
    // Previous results hold while the next query runs — no loader mid-search
    placeholderData: (prev) => prev,
  });

  const chooseCustomer = (c: { id: string; name: string; phone?: string | null; customerType?: string | null }) => {
    // A different customer starts a fresh session — last session's shots
    // belong to who they were saved to.
    if (c.id !== pickedCustomer?.id) setPendingShots([]);
    setPickedCustomer({ id: c.id, name: c.name, phone: c.phone ?? null, customerType: c.customerType ?? null });
    setCustomerSearch("");
    if (searchIntent.current === "filter") {
      // Browsing, not saving: close the sheet and show ONLY their media.
      searchIntent.current = "target";
      setCustomerOnly(true);
      closeSearch();
      return;
    }
    // The sheet STAYS — search swaps for the capture actions in place;
    // only the keyboard drops.
    searchInputRef.current?.blur();
  };
  const closeSearch = () => {
    // Keyboard drops while the sheet slides away — one motion out.
    searchInputRef.current?.blur();
    setSearchActive(false);
    setCustomerSearch("");
  };

  // Today's jobs with their photo coverage — powers the required-photos
  // tracker and the missing-photos nudge. Tapping a job targets its customer
  // for capture in one tap.
  type JobPhotoStatus = {
    id: string; title: string | null; status: string; scheduledStart: string | null;
    customerId: string | null; customerName: string | null;
    requiredPhotos: number; photosToday: number;
  };
  const { data: photoStatus } = useQuery<{ jobs: JobPhotoStatus[] }>({
    queryKey: ["/api/mobile/photos/status"],
    queryFn: async () => {
      const res = await fetch("/api/mobile/photos/status", { credentials: "include" });
      if (!res.ok) return { jobs: [] };
      return res.json();
    },
    enabled: !!currentUser,
    refetchInterval: 60 * 1000,
  });
  const todayJobs = photoStatus?.jobs ?? [];
  const missingPhotoJobs = todayJobs.filter((j) => j.status === "completed" && j.photosToday === 0);

  const isVideo = (f: { contentType?: string | null }) => !!f.contentType?.startsWith("video/");
  // Kind filter (All / Photos / Videos) — the feed re-queries SERVER-side so
  // "Videos" pulls the latest 30 VIDEOS, not the videos that happen to
  // survive a shared 30-row window.
  const [mediaFilterOpen, setMediaFilterOpen] = useState(false);
  const [mediaKind, setMediaKind] = useState<"all" | "photos" | "videos">("all");
  const kindMatch = (f: { contentType?: string | null }) =>
    mediaKind === "all" || (mediaKind === "videos" ? isVideo(f) : !isVideo(f));

  // Recent company-wide photos for the horizontal gallery strip. Tapping one
  // jumps to the customer it's attached to.
  type FeedPhoto = {
    id: string; url: string; thumbUrl?: string | null; name: string; contentType?: string | null; createdAt: string | null;
    customerId: string | null; customerName: string | null; uploadedByName: string | null;
  };
  const { data: recentPhotos = [] } = useQuery<FeedPhoto[]>({
    queryKey: ["/api/mobile/photos/feed", mediaKind],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/photos/feed?kind=${mediaKind}`, { credentials: "include" });
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
  // Photos AND CompanyCam video references — videos play in a lightweight
  // fullscreen player (the annotation viewer is image-only).
  const photos = (files || []).filter(
    (f) => f.contentType?.startsWith("image/") || f.contentType?.startsWith("video/"),
  );
  const shownPhotos = photos.filter(kindMatch);

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

  const downloadPhoto = async (p: { id?: string; url: string; name: string }) => {
    // External hosts (CompanyCam CDN) block cross-origin fetches — proxy those
    const src = p.url.startsWith("http") && p.id ? `/api/crm/files/${p.id}/download` : p.url;
    try {
      const res = await fetch(src, { credentials: "include" });
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
  const [camReady, setCamReady] = useState(false);
  const [flash, setFlash] = useState(false);
  // Shots appear instantly with a local preview while uploading in the
  // background. Each keeps its File (tap-to-edit re-opens it in markup) and
  // learns its server id so an edited version can replace the original.
  const [pendingShots, setPendingShots] = useState<Array<{ id: string; url: string; status: "uploading" | "done" | "error"; file: File; serverId?: string }>>([]);
  // Originals replaced by an edit BEFORE their upload finished: delete them
  // server-side the moment their id arrives.
  const replacedIds = useRef<Set<string>>(new Set());
  // A session shot open in markup — editing is optional and per-photo, after
  // the shooting, never a forced step in it.
  const [editShot, setEditShot] = useState<{ id: string; url: string; file: File; serverId?: string } | null>(null);
  const [viewer, setViewer] = useState<{ src: string; name: string } | null>(null);
  // Fullscreen video player — separate from the annotation viewer.
  const [videoViewer, setVideoViewer] = useState<{ src: string; name: string; poster?: string | null } | null>(null);

  const openCamera = async () => {
    // OUR camera everywhere, native shell included: multi-shot with instant
    // background upload — never the system camera's per-photo Retake/Use
    // round-trip. (WKWebView supports getUserMedia; camera permission is
    // already granted to the shell.)
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
      // No in-page camera (permission/support) — system camera, then picker
      if (isNativeApp()) {
        const shot = await takeNativePhoto();
        if (shot) await handleUpload([shot]);
        return;
      }
      fileInputRef.current?.click();
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCamReady(false);
    // Land back on the sheet with the session's shots laid out — the recap
    // (and tap-to-edit) lives there, not somewhere off in the page.
    if (pendingShots.length > 0) setSearchActive(true);
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
      startShotUpload(file);
    }, "image/jpeg", 0.85);
  };

  // Background-upload one shot into the session strip; returns its local id.
  const startShotUpload = (file: File) => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localUrl = URL.createObjectURL(file);
    setPendingShots((prev) => [{ id: localId, url: localUrl, status: "uploading" as const, file }, ...prev]);
    uploadOne(file)
      .then((serverId) => {
        // Edited away while this was still in flight — remove the original
        if (replacedIds.current.has(localId)) {
          replacedIds.current.delete(localId);
          if (serverId && customerId) {
            apiRequest("DELETE", `/api/crm/customers/${customerId}/files/${serverId}`).catch(() => {});
          }
          return;
        }
        setPendingShots((prev) => prev.map((ps) => (ps.id === localId ? { ...ps, status: "done" as const, serverId } : ps)));
      })
      .catch(() => setPendingShots((prev) => prev.map((ps) => (ps.id === localId ? { ...ps, status: "error" as const } : ps))));
    return localId;
  };

  // Swap a session shot for its edited version: the edit takes the original's
  // spot in the strip and uploads; the un-edited original is deleted.
  const replaceShot = (orig: { id: string; serverId?: string }, edited: File) => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localUrl = URL.createObjectURL(edited);
    setPendingShots((prev) => prev.map((ps) => (ps.id === orig.id ? { id: localId, url: localUrl, status: "uploading" as const, file: edited } : ps)));
    uploadOne(edited)
      .then((serverId) => setPendingShots((prev) => prev.map((ps) => (ps.id === localId ? { ...ps, status: "done" as const, serverId } : ps))))
      .catch(() => setPendingShots((prev) => prev.map((ps) => (ps.id === localId ? { ...ps, status: "error" as const } : ps))));
    if (orig.serverId && customerId) {
      apiRequest("DELETE", `/api/crm/customers/${customerId}/files/${orig.serverId}`).catch(() => {});
    } else {
      replacedIds.current.add(orig.id);
    }
  };

  // Single-file background upload used by the camera (no global blocking).
  // Returns the created file record's id so an edit can replace the shot.
  const uploadOne = async (file: File): Promise<string | undefined> => {
    if (!customerId) throw new Error("no customer");
    const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
      name: file.name,
      size: file.size,
      contentType: file.type,
    });
    const { uploadURL, objectPath } = await presignRes.json();
    await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    const fileUrl = objectPath.startsWith("/objects") ? objectPath : `/objects/${objectPath}`;
    const created = await apiRequest("POST", `/api/crm/customers/${customerId}/files`, {
      name: file.name,
      url: fileUrl,
      objectPath,
      contentType: file.type,
      size: file.size,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "files"] });
    const rec = await created.json().catch(() => null);
    return rec?.id ?? rec?.file?.id ?? undefined;
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
      toast({ title: `${list.length} file${list.length > 1 ? "s" : ""} uploaded` });
    } catch (e) {
      console.error("Photo upload error:", e);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <MobileShell pullToRefresh>
      {/* min-height a hair past full so the page is always scrollable — that
          keeps the elastic pull/bounce alive even when content is short. */}
      {/* The page stays put while sheets ride over it — a TRUE bottom sheet
          reveals the real page (not a white void) when dragged shut. */}
      <div className="p-4 space-y-6" style={{ minHeight: "calc(100% + 1px)" }}>
        {/* Filters pill top left; search top right (techs don't get free
            targeting: their photos go to the job they're on site at). */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setMediaFilterOpen(true)}
            className="relative flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
            aria-label="Filter media"
            data-testid="media-filter-open"
          >
            <ListFilter className="h-4 w-4" />
            Filters
            {(mediaKind !== "all" || customerOnly) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#711419]" />}
          </button>
          {!isTechRole && (
            <button
              onClick={() => setSearchActive(true)}
              className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-slate-600 transition-transform active:scale-95"
              aria-label="Search customers"
              data-testid="button-open-search"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Customer-filter chip — everything else stands down until cleared */}
        {customerOnly && activeCustomer && (
          <div className="flex items-center gap-2 rounded-lg border border-[#711419]/25 bg-[#711419]/[0.06] px-3.5 py-2.5" data-testid="customer-filter-chip">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
              {activeCustomer.name}
              <span className="font-normal text-slate-500"> — all media</span>
            </p>
            <button
              onClick={() => {
                setCustomerOnly(false);
                setPickedCustomer(null);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 active:scale-95"
              aria-label="Clear customer filter"
              data-testid="customer-filter-clear"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Missing-photos nudge: finished jobs with zero shots on record */}
        {!customerOnly && missingPhotoJobs.length > 0 && (
          <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-3.5 py-2.5" data-testid="missing-photos-nudge">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <Camera className="h-4 w-4" />
              {missingPhotoJobs.length} finished job{missingPhotoJobs.length !== 1 ? "s" : ""} today {missingPhotoJobs.length !== 1 ? "have" : "has"} no photos
            </p>
            <p className="mt-0.5 text-xs text-amber-700">Tap the job below to add shots before it slips.</p>
          </div>
        )}

        {/* Today's jobs — photo coverage per job; tap to target that customer.
            The section never disappears: an empty card explains itself. */}
        {!customerOnly && !techBlocked && (
          <div data-testid="today-photo-jobs">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Today's jobs</p>
            {todayJobs.length === 0 ? (
              <div className="rounded-[4px] border border-dashed border-slate-300 bg-white px-6 py-8 text-center" data-testid="today-photo-jobs-empty">
                <p className="text-sm font-medium text-slate-600">No jobs on the board today</p>
              </div>
            ) : (
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {todayJobs.map((job, ji) => {
                const needsMore = job.requiredPhotos > 0 && job.photosToday < job.requiredPhotos;
                const missing = job.status === "completed" && job.photosToday === 0;
                return (
                  <button
                    key={job.id}
                    onClick={() => {
                      if (!job.customerId) return;
                      if (job.customerId !== pickedCustomer?.id) setPendingShots([]);
                      setPickedCustomer({ id: job.customerId, name: job.customerName || "Customer", phone: null });
                      // Straight into OUR camera — the tap IS the intent.
                      openCamera();
                    }}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${ji > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={`photo-job-${job.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{job.customerName || "Unknown customer"}</p>
                      <p className="truncate text-xs text-slate-500">
                        {job.title || "Job"}
                        {job.scheduledStart ? ` · ${format(new Date(job.scheduledStart), "h:mm a")}` : ""}
                      </p>
                    </div>
                    {missing ? (
                      <span className="shrink-0 rounded-[3px] bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                        No photos
                      </span>
                    ) : job.requiredPhotos > 0 ? (
                      <span
                        className={`shrink-0 rounded-[3px] px-2 py-1 text-[11px] font-bold tabular-nums ${
                          needsMore ? "bg-[#711419]/10 text-[#711419]" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {Math.min(job.photosToday, job.requiredPhotos)} of {job.requiredPhotos} photos
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-[3px] bg-slate-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
                        {job.photosToday} photo{job.photosToday !== 1 ? "s" : ""}
                      </span>
                    )}
                    <Camera className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
            )}
          </div>
        )}

        {!customerOnly && techBlocked && (
          <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-4 py-4 text-center" data-testid="tech-offsite-banner">
            <p className="text-sm font-semibold text-amber-900">You're not on site at a job</p>
            <p className="mt-1 text-xs text-amber-800">
              Photos attach to the job you're working. Open your job and tap On Site — this page unlocks automatically.
            </p>
          </div>
        )}

        {/* Library input (web fallback) — mounted unconditionally so the
            sheet's "Add from Library" can fire it in the same tap gesture. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
          data-testid="input-photo-file"
        />

        {/* Customers with recent photo activity — larger cards, more info */}
        {!customerOnly && recentCustomers.length > 0 && (
          <div className="pt-1" data-testid="recent-customers">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Customers</p>
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-pl-4 scrollbar-hide">
              {recentCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/mobile/customers/${c.id}`)}
                  className="w-56 shrink-0 snap-start overflow-hidden rounded-lg border border-slate-100 bg-white text-left shadow-sm transition-transform active:scale-[0.98]"
                  data-testid={`recent-customer-${c.id}`}
                >
                  {c.latest.contentType?.startsWith("video/") ? (
                    <span className="relative block h-28 w-full bg-slate-900">
                      {c.latest.thumbUrl && (
                        <img src={c.latest.thumbUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50">
                          <Play className="h-4 w-4 fill-white text-white" />
                        </span>
                      </span>
                    </span>
                  ) : (
                    <img src={c.latest.thumbUrl || c.latest.url} alt="" loading="lazy" className="h-28 w-full object-cover" />
                  )}
                  <div className="px-3.5 py-2.5">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{c.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {c.count} recent photo{c.count !== 1 ? "s" : ""}
                      {c.latest.uploadedByName ? ` · ${c.latest.uploadedByName}` : ""}
                      {c.latest.createdAt ? ` · ${format(new Date(c.latest.createdAt), "MMM d, h:mm a")}` : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent photos across the company — tap to open who it's linked to */}
        {!customerOnly && recentPhotos.filter(kindMatch).length > 0 && (
          <div className="pt-1" data-testid="recent-photos">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent — all customers</p>
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-pl-4 scrollbar-hide">
              {recentPhotos.filter(kindMatch).map((rp) => (
                <button
                  key={rp.id}
                  onClick={() => rp.customerId && navigate(`/mobile/customers/${rp.customerId}`)}
                  className="w-32 shrink-0 snap-start text-left transition-transform active:scale-95"
                  data-testid={`recent-photo-${rp.id}`}
                >
                  {rp.contentType?.startsWith("video/") ? (
                    <span className="relative block aspect-square w-32 overflow-hidden rounded-lg border border-slate-100 bg-slate-900 shadow-sm">
                      {rp.thumbUrl && (
                        <img src={rp.thumbUrl} alt={rp.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50">
                          <Play className="h-4 w-4 fill-white text-white" />
                        </span>
                      </span>
                    </span>
                  ) : (
                    <img
                      src={rp.thumbUrl || rp.url}
                      alt={rp.name}
                      loading="lazy"
                      className="aspect-square w-32 rounded-lg border border-slate-100 object-cover shadow-sm"
                    />
                  )}
                  <p className="mt-2 truncate text-[12px] font-semibold text-slate-800">{rp.customerName || "No customer"}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {rp.uploadedByName || "Unknown"}
                    {rp.createdAt ? ` · ${format(new Date(rp.createdAt), "MMM d, h:mm a")}` : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Photo grid */}
        {customerId && (
          filesLoading ? (
            /* Full skeleton grid in the exact tile shape — fades in, light
               band sweeping each tile with a stagger */
            <div className="grid grid-cols-3 gap-2 animate-in fade-in duration-300">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="skeleton-shimmer aspect-square rounded-lg bg-slate-200"
                  style={{ "--shimmer-delay": `${(i % 3) * 120}ms` } as React.CSSProperties}
                />
              ))}
            </div>
          ) : shownPhotos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-300">
              <ImageIcon className="h-10 w-10" />
              <p className="text-sm text-slate-400">No photos or videos yet for {activeCustomer?.name || "this customer"}.</p>
            </div>
          ) : (
            <div className="photo-grid-noselect grid grid-cols-3 gap-2" data-testid="photo-grid">
              {shownPhotos.map((p) => (
                <div key={p.id} className="relative overflow-hidden rounded-lg">
                  <button
                    onClick={() => {
                      if (suppressClick.current) { suppressClick.current = false; return; }
                      if (isVideo(p)) setVideoViewer({ src: p.url, name: p.name, poster: p.thumbUrl });
                      else setViewer({ src: p.url, name: p.name });
                    }}
                    onPointerDown={(e) => { if (!isVideo(p)) startPress(p, e); }}
                    onPointerMove={movePress}
                    onPointerUp={cancelPress}
                    onPointerCancel={cancelPress}
                    onPointerLeave={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`ios-press-source block w-full select-none overflow-hidden rounded-lg ${pressedId === p.id ? "is-pressed" : ""}`}
                    style={{ WebkitTouchCallout: "none" }}
                    data-testid={`photo-${p.id}`}
                  >
                    {isVideo(p) ? (
                      <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-slate-900">
                        {p.thumbUrl && (
                          <img
                            src={p.thumbUrl}
                            alt={p.name}
                            loading="lazy"
                            draggable={false}
                            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-80"
                            style={{ WebkitTouchCallout: "none" }}
                          />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                            <Play className="h-5 w-5 fill-white text-white" />
                          </span>
                        </span>
                      </span>
                    ) : (
                      /* Shimmer sits UNDER the image — the photo simply
                         paints over it as it loads, so tiles never pop in
                         from blank white */
                      <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-slate-200">
                        <span className="skeleton-shimmer absolute inset-0" aria-hidden />
                        <img
                          src={p.thumbUrl || p.url}
                          alt={p.name}
                          loading="lazy"
                          draggable={false}
                          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
                          style={{ WebkitTouchCallout: "none" }}
                        />
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Media filters — dropdown row; opens its own option sheet */}
      <DraggableSheet tall open={mediaFilterOpen} onOpenChange={setMediaFilterOpen} title="Filter media" testid="sheet-media-filter">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          {(mediaKind !== "all" || customerOnly) && (
            <button
              onClick={() => {
                setMediaKind("all");
                setCustomerOnly(false);
                setPickedCustomer(null);
              }}
              className="text-sm font-semibold text-[#711419]"
              data-testid="media-filter-clear"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="mt-2 min-h-[35vh] divide-y divide-slate-200/80 pb-2">
          <SheetSelect
            label="Kind"
            value={mediaKind}
            onChange={(k) => setMediaKind(k as typeof mediaKind)}
            options={[
              { key: "all", label: "All" },
              { key: "photos", label: "Photos" },
              { key: "videos", label: "Videos" },
            ]}
            testid="media-filter"
          />
          {/* Filter by CUSTOMER — search, pick, and the page shows only
              their media until cleared */}
          <button
            onClick={() => {
              setMediaFilterOpen(false);
              searchIntent.current = "filter";
              setCustomerSearch("");
              setPickedCustomer(null);
              setTimeout(() => setSearchActive(true), 120);
            }}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 py-3 text-left"
            data-testid="media-filter-customer"
          >
            <span className="text-sm font-medium text-slate-700">Customer</span>
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              {customerOnly && activeCustomer ? activeCustomer.name : "Any"}
              <Search className="h-4 w-4 text-slate-400" />
            </span>
          </button>
        </div>
      </DraggableSheet>

      {/* Customer picker — a full sheet in the create-page mold whose search
          works EXACTLY like the address finder: top pill input that mounts
          once the sheet settles, results beneath padded above the keyboard,
          customer TYPE metal badges on every row. No X — the sheet drags
          shut like every other. */}
      <DraggableSheet full open={searchActive} onOpenChange={(o) => { if (!o) closeSearch(); }} title="Save media to" testid="photos-customer-sheet">
        <div
          className="flex h-full min-h-0 flex-col"
          onPointerDown={(e) => {
            // Nothing on this sheet may steal the caret: taps on rows or
            // empty space keep the keyboard pinned to the search box —
            // clicks still fire.
            if (e.target !== searchInputRef.current) e.preventDefault();
          }}
        >
          <h2 className="text-lg font-semibold text-slate-900">Save media to…</h2>

          {activeCustomer ? (
            /* Customer chosen — the capture actions appear right here in the
               SAME sheet. Both fire inside the tap gesture so iOS opens the
               camera / library without complaint. */
            <div className="mt-3 space-y-3" data-testid="photo-target">
              <div className="flex items-center gap-3 rounded-[4px] border border-slate-300/70 bg-white px-3.5 py-3">
                {activeCustomer.customerType && (
                  <img src={customerTypeBadge(activeCustomer.customerType)} alt="" className="h-9 w-9 shrink-0 select-none" draggable={false} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{activeCustomer.name}</p>
                  {activeCustomer.phone && <p className="truncate text-xs text-slate-500">{activeCustomer.phone}</p>}
                </div>
                {!isTechRole && (
                  <button
                    onClick={() => {
                      setPickedCustomer(null);
                      setCustomerSearch("");
                      setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), 60);
                    }}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-95"
                    data-testid="button-change-customer"
                  >
                    Change
                  </button>
                )}
              </div>
              {pendingShots.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">This session</p>
                  <div className="grid grid-cols-4 gap-2" data-testid="sheet-session-shots">
                    {pendingShots.map((ps) => (
                      <button
                        key={ps.id}
                        onClick={() => setEditShot({ id: ps.id, url: ps.url, file: ps.file, serverId: ps.serverId })}
                        className="relative aspect-square overflow-hidden rounded-[6px] border border-slate-300/70 bg-slate-100 transition-transform active:scale-95"
                        data-testid={`sheet-shot-${ps.id}`}
                        aria-label="Edit this shot"
                      >
                        <img src={ps.url} alt="" className="h-full w-full object-cover" />
                        {ps.status === "uploading" && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          </span>
                        )}
                        {ps.status === "error" && (
                          <span className="absolute inset-0 flex items-center justify-center bg-red-600/60 text-[10px] font-bold text-white">!</span>
                        )}
                        <span className="absolute bottom-1 right-1 flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-black/55">
                          <Pencil className="h-3 w-3 text-white" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  closeSearch();
                  openCamera();
                }}
                disabled={uploading}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#711419] py-3.5 text-base font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-take-photo"
              >
                <Camera className="h-5 w-5" />
                Take Photo
              </button>
              <button
                onClick={async () => {
                  closeSearch();
                  // Native shell: the photo LIBRARY directly — never the iOS
                  // "Photo Library / Take Photo / Choose File" menu. Picks
                  // ride the same background pipeline as camera shots, then
                  // the sheet comes back with them laid out.
                  if (isNativeApp()) {
                    const files = await pickNativeLibraryPhotos();
                    if (files && files.length) {
                      files.forEach((f) => startShotUpload(f));
                      setSearchActive(true);
                    }
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                disabled={uploading}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-xl border border-slate-300/70 bg-white py-3.5 text-base font-semibold text-slate-700 shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-add-from-library"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                Add from Library
              </button>

              {/* Everything already on file for this customer — scrollable
                  right here in the sheet; tap to view full-screen. */}
              {photos.length > 0 && (
                <div className="pt-1">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Their media ({photos.length})
                  </p>
                  <div className="grid grid-cols-4 gap-1.5 pb-4" data-testid="sheet-customer-media">
                    {photos.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSearchActive(false);
                          if (isVideo(p)) setVideoViewer({ src: p.url, name: p.name, poster: p.thumbUrl });
                          else setViewer({ src: p.url, name: p.name });
                        }}
                        className="relative aspect-square overflow-hidden rounded-[6px] border border-slate-300/70 bg-slate-100"
                        data-testid={`sheet-media-${p.id}`}
                      >
                        {isVideo(p) ? (
                          <>
                            {p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50">
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                              </span>
                            </span>
                          </>
                        ) : (
                          <img src={p.thumbUrl || p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mt-3 flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                {searchSettled ? (
                  <input
                    ref={searchInputRef}
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name or phone"
                    className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                    data-testid="photos-search-input"
                  />
                ) : (
                  <span className="h-full w-full min-w-0 content-center text-[16px] text-slate-400">Search by name or phone</span>
                )}
              </div>

              <div
                className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
                style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : 24 }}
              >
                {customerSearch.trim().length < 2 ? (
                  <p className="pt-9 text-center text-sm text-slate-400">Start typing a customer's name or phone number.</p>
                ) : searchResults.length === 0 ? (
                  <p className="pt-9 text-center text-sm text-slate-400">No customers match &ldquo;{customerSearch.trim()}&rdquo;.</p>
                ) : (
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm" data-testid="customer-search-results">
                    {searchResults.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => chooseCustomer(c)}
                        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                        data-testid={`search-customer-${c.id}`}
                      >
                        <img
                          src={customerTypeBadge(c.customerType)}
                          alt=""
                          className="h-9 w-9 shrink-0 select-none"
                          draggable={false}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{c.name}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {[c.phone, c.fullAddress].filter(Boolean).join(" · ") || "No contact info"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DraggableSheet>

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

      {/* Markup a session shot (draw / arrows / text) — opened by tapping a
          thumb in the camera strip or the sheet grid. PORTALED to body:
          inside the shell's main, drawing strokes bubbled into the
          pull-to-refresh listener and yanked the page mid-edit. Saving
          lands you on the Save-media sheet with the session laid out. */}
      {editShot &&
        createPortal(
          <PhotoAnnotator
            file={editShot.file}
            onCancel={() => setEditShot(null)}
            onDone={(edited) => {
              const orig = editShot;
              setEditShot(null);
              replaceShot(orig, edited);
              // Done editing → the recap sheet, not back into the camera
              if (cameraOpen) closeCamera();
              else setSearchActive(true);
            }}
          />,
          document.body,
        )}

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

      {/* Fullscreen video player — CompanyCam videos stream straight from
          the CDN (nothing stored on our side) */}
      {videoViewer &&
        createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black" data-testid="video-viewer">
          <button
            onClick={() => setVideoViewer(null)}
            className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-transform active:scale-90"
            style={{ top: "calc(12px + env(safe-area-inset-top))" }}
            data-testid="button-close-video"
            aria-label="Close video"
          >
            <X className="h-5 w-5" />
          </button>
          <video
            src={videoViewer.src}
            poster={videoViewer.poster || undefined}
            controls
            autoPlay
            playsInline
            preload="auto"
            className="max-h-full w-full animate-in fade-in duration-200"
          />
        </div>,
        document.body,
      )}

      {/* Fullscreen in-app camera — house chrome: frosted industrial chips,
          uppercase micro-labels, maroon-ringed shutter. Every press saves.
          Portaled clear of the shell main (pull-to-refresh bubbling). */}
      {cameraOpen &&
        createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-black" data-testid="camera-overlay">
          {/* Hidden until real stream dimensions arrive — the object-cover
              reframe nudged the preview visibly on every open. */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={() => setCamReady(true)}
            className={`min-h-0 flex-1 object-cover transition-opacity duration-200 ${camReady ? "opacity-100" : "opacity-0"}`}
          />
          {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}

          {/* Top chrome: close · session count */}
          <div
            className="absolute inset-x-0 flex items-center justify-between gap-2 px-3"
            style={{ top: "calc(10px + env(safe-area-inset-top))" }}
          >
            <button
              onClick={closeCamera}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur transition-transform active:scale-95"
              data-testid="button-close-camera"
              aria-label="Close camera"
            >
              <X className="h-5 w-5" />
            </button>
            {pendingShots.length > 0 && (
              <div className="shrink-0 rounded-[6px] border border-white/15 bg-black/50 px-3 py-1.5 text-center backdrop-blur" data-testid="camera-shot-count">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Shots</p>
                <p className="text-sm font-semibold leading-tight text-white tabular-nums">{pendingShots.length}</p>
              </div>
            )}
          </div>

          <div
            className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black via-black/80 to-transparent pt-12"
            style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
          >
            {pendingShots.length > 0 && (
              <div className="flex w-full items-center gap-2 overflow-x-auto px-4 pb-0.5" data-testid="camera-session-strip">
                {pendingShots.map((ps) => (
                  <button
                    key={ps.id}
                    onClick={() => setEditShot({ id: ps.id, url: ps.url, file: ps.file, serverId: ps.serverId })}
                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[6px] border border-white/30 transition-transform active:scale-95"
                    data-testid={`camera-shot-${ps.id}`}
                    aria-label="Edit this shot"
                  >
                    <img src={ps.url} alt="" className="h-full w-full object-cover" />
                    {ps.status === "uploading" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </span>
                    )}
                    {ps.status === "error" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-red-600/60 text-[10px] font-bold text-white">!</span>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-black/60">
                      <Pencil className="h-3 w-3 text-white" />
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="max-w-[85%] truncate text-center text-sm font-semibold text-white" data-testid="camera-customer-name">
              {activeCustomer?.name || "Customer"}
              {pendingShots.length > 0 && <span className="font-normal text-white/50"> · tap a shot to edit</span>}
            </p>
            <div className="grid w-full grid-cols-3 items-center px-6">
              <span aria-hidden />
              <button
                onClick={capturePhoto}
                className="mx-auto flex h-[74px] w-[74px] items-center justify-center rounded-full border-[3.5px] border-white transition-transform active:scale-90"
                data-testid="button-shutter"
                aria-label="Take photo"
              >
                <span className="h-[58px] w-[58px] rounded-full bg-white shadow-[inset_0_0_0_3px_#711419]" />
              </button>
              <button
                onClick={closeCamera}
                className="ml-auto flex h-11 items-center justify-center rounded-full bg-[#711419] px-5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
                data-testid="button-camera-done"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </MobileShell>
  );
}
