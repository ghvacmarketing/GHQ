import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, Download, ImageIcon, ImagePlus, Loader2, MapPin, Trash2, X } from "lucide-react";
import { getLocalStartOfDay, getLocalEndOfDay, toLocalTime } from "@/lib/timezone";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MobileShell from "./mobile-shell";
import { PhotoViewer } from "@/components/mobile/photo-viewer";
import type { CrmUser, CrmWorkOrder, CrmCustomer, CustomerFile } from "@shared/schema";

type WorkOrderWithDetails = CrmWorkOrder & { customer?: CrmCustomer | null };

export default function MobilePhotos() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const todayStart = getLocalStartOfDay(new Date()).toISOString();
  const todayEnd = getLocalEndOfDay(new Date()).toISOString();
  const { data: workOrders, isLoading: jobsLoading } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders", "photos", todayStart],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: todayStart, dateTo: todayEnd });
      if (currentUser && ["tech", "sales"].includes(currentUser.role)) {
        params.set("techId", currentUser.id);
      }
      const res = await fetch(`/api/crm/work-orders?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load jobs");
      const data = await res.json();
      return data.workOrders || [];
    },
    enabled: !!currentUser,
  });

  const jobs = useMemo(
    () => (workOrders || []).filter((wo) => wo.customerId).sort((a, b) => {
      const at = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
      const bt = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
      return at - bt;
    }),
    [workOrders],
  );
  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0] || null;
  const customerId = selectedJob?.customerId || null;

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

  // Long-press a tile (iOS context-menu style): the photo zooms up with
  // Download / Delete beneath it. The native browser callout is suppressed.
  const [actionSheet, setActionSheet] = useState<CustomerFile | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const startPress = (p: CustomerFile, e: React.PointerEvent) => {
    if (!isSupervisorPlus) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 600);
      navigator.vibrate?.(10);
      setActionSheet(p);
    }, 450);
  };
  const cancelPress = () => {
    window.clearTimeout(pressTimer.current);
    pressStart.current = null;
  };
  const movePress = (e: React.PointerEvent) => {
    const s = pressStart.current;
    if (s && (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10)) cancelPress();
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
    if (!customerId || !selectedJob) throw new Error("no job");
    const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
      name: file.name,
      size: file.size,
      contentType: file.type,
    });
    const { uploadURL, objectPath } = await presignRes.json();
    await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    const fileUrl = objectPath.startsWith("/objects") ? objectPath : `/objects/${objectPath}`;
    await apiRequest("POST", `/api/crm/customers/${customerId}/files`, {
      name: `WO-${selectedJob.workOrderNumber ?? ""} ${file.name}`.trim(),
      url: fileUrl,
      objectPath,
      contentType: file.type,
      size: file.size,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "files"] });
  };

  const handleUpload = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0 || !customerId || !selectedJob) return;
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
          name: `WO-${selectedJob.workOrderNumber ?? ""} ${file.name}`.trim(),
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
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Photos</h2>
          <p className="text-sm text-slate-500">Job site photos — saved to the customer's file record.</p>
        </div>

        {/* Job picker */}
        {jobsLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            No jobs today — photos attach to a scheduled job's customer.
          </div>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {jobs.map((job) => {
              const active = selectedJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`shrink-0 rounded-2xl border px-3.5 py-2 text-left transition-all active:scale-95 ${
                    active ? "border-[#711419] bg-[#711419] text-white shadow-md" : "border-slate-200 bg-white text-slate-700"
                  }`}
                  data-testid={`photo-job-${job.id}`}
                >
                  <p className="text-xs font-semibold">
                    {job.scheduledStart ? format(toLocalTime(job.scheduledStart), "h:mm a") : "Unscheduled"}
                  </p>
                  <p className={`flex items-center gap-1 text-[11px] ${active ? "text-white/80" : "text-slate-500"}`}>
                    <MapPin className="h-3 w-3" />
                    {job.customer?.name || job.title || "Job"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Capture / library */}
        {selectedJob && (
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
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#711419] py-3.5 font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-take-photo"
              >
                <Camera className="h-5 w-5" />
                Take Photo
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-semibold text-slate-700 shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-add-from-library"
                aria-label="Add from library"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </button>
            </div>
          </>
        )}

        {/* Photo grid */}
        {customerId && (
          filesLoading ? (
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl" />
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-300">
              <ImageIcon className="h-10 w-10" />
              <p className="text-sm text-slate-400">No photos yet for {selectedJob?.customer?.name || "this customer"}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2" data-testid="photo-grid">
              {photos.map((p) => (
                <div key={p.id} className="relative overflow-hidden rounded-xl">
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
                    className="block w-full select-none"
                    style={{ WebkitTouchCallout: "none" }}
                    data-testid={`photo-${p.id}`}
                  >
                    <img
                      src={p.url}
                      alt={p.name}
                      loading="lazy"
                      draggable={false}
                      className="pointer-events-none aspect-square w-full select-none object-cover transition-transform active:scale-95"
                      style={{ WebkitTouchCallout: "none" }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Long-press action sheet: zoomed photo + Download / Delete */}
      {actionSheet && (
        <div
          className="fixed inset-0 z-[65] flex flex-col items-center justify-center bg-black/40 p-8 backdrop-blur-md"
          onClick={() => setActionSheet(null)}
          data-testid="photo-action-sheet"
        >
          <img
            src={actionSheet.url}
            alt={actionSheet.name}
            draggable={false}
            className="max-h-[55vh] max-w-full select-none rounded-2xl object-contain shadow-2xl animate-ios-pop"
            style={{ WebkitTouchCallout: "none" }}
            onContextMenu={(e) => e.preventDefault()}
          />
          {/* iOS-material menu: translucent, heavily blurred, hairline separator */}
          <div
            className="mt-3 w-60 origin-top animate-ios-pop overflow-hidden rounded-2xl bg-white/70 shadow-2xl backdrop-blur-xl"
            style={{ animationDelay: "50ms" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { downloadPhoto(actionSheet); setActionSheet(null); }}
              className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-slate-900 active:bg-black/5"
              data-testid="action-download"
            >
              Download <Download className="h-4 w-4 text-slate-600" />
            </button>
            <div className="h-px bg-slate-400/25" />
            <button
              onClick={() => { setConfirmDelete(actionSheet); setActionSheet(null); }}
              className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-red-600 active:bg-black/5"
              data-testid="action-delete"
            >
              Delete <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation (supervisor+) */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl">
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
              Auto-saves to {selectedJob?.customer?.name || "the customer"}
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
