import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, Pencil, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isNativeApp, takeNativePhoto } from "@/lib/native";
import { PhotoAnnotator } from "./photo-annotator";

/** The house in-app camera, portable: same chrome as the Media page's
 *  (frosted chips, maroon-ringed shutter, session strip with tap-to-edit),
 *  aimed at ONE customer — every shot uploads to their files in the
 *  background the moment it's taken. Used from a job's Work tab so job-site
 *  photos land on the right customer without leaving the job. */
export function CustomerCamera({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [flash, setFlash] = useState(false);
  const [shots, setShots] = useState<Array<{ id: string; url: string; status: "uploading" | "done" | "error"; file: File; serverId?: string }>>([]);
  const replacedIds = useRef<Set<string>>(new Set());
  const [editShot, setEditShot] = useState<{ id: string; url: string; file: File; serverId?: string } | null>(null);

  // Live viewfinder — falls back to the system camera (single shot) when
  // getUserMedia is unavailable, then closes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        if (cancelled) return;
        if (isNativeApp()) {
          const shot = await takeNativePhoto();
          if (shot) await uploadOne(shot).catch(() => {});
        }
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadOne = async (file: File): Promise<string | undefined> => {
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
    return rec?.id ?? undefined;
  };

  const startShotUpload = (file: File) => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localUrl = URL.createObjectURL(file);
    setShots((prev) => [{ id: localId, url: localUrl, status: "uploading" as const, file }, ...prev]);
    uploadOne(file)
      .then((serverId) => {
        if (replacedIds.current.has(localId)) {
          replacedIds.current.delete(localId);
          if (serverId) {
            apiRequest("DELETE", `/api/crm/customers/${customerId}/files/${serverId}`).catch(() => {});
          }
          return;
        }
        setShots((prev) => prev.map((s) => (s.id === localId ? { ...s, status: "done" as const, serverId } : s)));
      })
      .catch(() => setShots((prev) => prev.map((s) => (s.id === localId ? { ...s, status: "error" as const } : s))));
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
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        startShotUpload(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85,
    );
  };

  const replaceShot = (orig: { id: string; serverId?: string }, edited: File) => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localUrl = URL.createObjectURL(edited);
    setShots((prev) => prev.map((s) => (s.id === orig.id ? { id: localId, url: localUrl, status: "uploading" as const, file: edited } : s)));
    uploadOne(edited)
      .then((serverId) => setShots((prev) => prev.map((s) => (s.id === localId ? { ...s, status: "done" as const, serverId } : s))))
      .catch(() => setShots((prev) => prev.map((s) => (s.id === localId ? { ...s, status: "error" as const } : s))));
    if (orig.serverId) {
      apiRequest("DELETE", `/api/crm/customers/${customerId}/files/${orig.serverId}`).catch(() => {});
    } else {
      replacedIds.current.add(orig.id);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" data-testid="job-camera-overlay">
      <video ref={videoRef} playsInline muted autoPlay className="min-h-0 flex-1 object-cover" />
      {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}

      <div
        className="absolute inset-x-0 flex items-center gap-2 px-3"
        style={{ top: "calc(10px + env(safe-area-inset-top))" }}
      >
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur transition-transform active:scale-95"
          data-testid="job-camera-close"
          aria-label="Close camera"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 rounded-[6px] border border-white/15 bg-black/50 px-3 py-1.5 backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Saving to</p>
          <p className="truncate text-sm font-semibold leading-tight text-white">{customerName}</p>
        </div>
        {shots.length > 0 && (
          <div className="shrink-0 rounded-[6px] border border-white/15 bg-black/50 px-3 py-1.5 text-center backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Shots</p>
            <p className="text-sm font-semibold leading-tight text-white tabular-nums">{shots.length}</p>
          </div>
        )}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black via-black/80 to-transparent pt-12"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        {shots.length > 0 && (
          <div className="flex w-full items-center gap-2 overflow-x-auto px-4 pb-0.5" data-testid="job-camera-strip">
            {shots.map((s) => (
              <button
                key={s.id}
                onClick={() => setEditShot({ id: s.id, url: s.url, file: s.file, serverId: s.serverId })}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[6px] border border-white/30 transition-transform active:scale-95"
                data-testid={`job-camera-shot-${s.id}`}
                aria-label="Edit this shot"
              >
                <img src={s.url} alt="" className="h-full w-full object-cover" />
                {s.status === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </span>
                )}
                {s.status === "error" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-red-600/60 text-[10px] font-bold text-white">!</span>
                )}
                <span className="absolute bottom-0.5 right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-black/60">
                  <Pencil className="h-3 w-3 text-white" />
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
          {shots.length > 0 ? "Tap a shot to edit · auto-saves" : "Every shot auto-saves"}
        </p>
        <div className="grid w-full grid-cols-3 items-center px-6">
          <span aria-hidden />
          <button
            onClick={capturePhoto}
            className="mx-auto flex h-[74px] w-[74px] items-center justify-center rounded-full border-[3.5px] border-white transition-transform active:scale-90"
            data-testid="job-camera-shutter"
            aria-label="Take photo"
          >
            <span className="h-[58px] w-[58px] rounded-full bg-white shadow-[inset_0_0_0_3px_#711419]" />
          </button>
          <button
            onClick={onClose}
            className="ml-auto flex h-11 items-center justify-center rounded-full bg-[#711419] px-5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
            data-testid="job-camera-done"
          >
            Done
          </button>
        </div>
      </div>

      {editShot && (
        <PhotoAnnotator
          file={editShot.file}
          onCancel={() => setEditShot(null)}
          onDone={(edited) => {
            const orig = editShot;
            setEditShot(null);
            replaceShot(orig, edited);
          }}
        />
      )}
    </div>,
    document.body,
  );
}
