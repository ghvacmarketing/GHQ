import { useEffect, useRef, useState } from "react";
import { X, Pen, MoveUpRight, Type, Undo2, Check, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Tool = "pen" | "arrow" | "text" | null;
type Op =
  | { kind: "pen"; color: string; width: number; points: { x: number; y: number }[] }
  | { kind: "arrow"; color: string; width: number; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "text"; color: string; size: number; at: { x: number; y: number }; text: string };

const COLORS = ["#ef4444", "#facc15", "#ffffff"];

/**
 * Fullscreen photo viewer + markup editor (CompanyCam-style): draw, arrows,
 * and text over the photo, then save the annotated copy back to the
 * customer's files. All drawing happens in natural-image coordinates so the
 * saved file is full resolution.
 */
export function PhotoViewer({
  src,
  name,
  customerId,
  onClose,
  onSaved,
}: {
  src: string;
  name: string;
  customerId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const opsRef = useRef<Op[]>([]);
  const draftRef = useRef<Op | null>(null);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState<Tool>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  // Load the image into an offscreen element; canvas = natural size
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      setReady(true);
      redraw();
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const lineWidth = () => Math.max(4, (imgRef.current?.naturalWidth || 1000) / 160);
  const fontSize = () => Math.max(24, (imgRef.current?.naturalWidth || 1000) / 22);

  const drawOp = (ctx: CanvasRenderingContext2D, op: Op) => {
    ctx.strokeStyle = op.kind === "text" ? "transparent" : op.color;
    ctx.fillStyle = op.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (op.kind === "pen") {
      ctx.lineWidth = op.width;
      ctx.beginPath();
      op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    } else if (op.kind === "arrow") {
      ctx.lineWidth = op.width;
      const { from, to } = op;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      // arrowhead
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = op.width * 4;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.font = `bold ${op.size}px system-ui, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = op.size / 5;
      ctx.fillText(op.text, op.at.x, op.at.y);
      ctx.shadowBlur = 0;
    }
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    for (const op of opsRef.current) drawOp(ctx, op);
    if (draftRef.current) drawOp(ctx, draftRef.current);
  };

  const toImageCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!tool) return;
    e.preventDefault();
    const at = toImageCoords(e);
    if (tool === "text") {
      const text = window.prompt("Label text:");
      if (text?.trim()) {
        opsRef.current.push({ kind: "text", color, size: fontSize(), at, text: text.trim() });
        setDirty(true);
        redraw();
      }
      return;
    }
    drawingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    draftRef.current =
      tool === "pen"
        ? { kind: "pen", color, width: lineWidth(), points: [at] }
        : { kind: "arrow", color, width: lineWidth(), from: at, to: at };
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !draftRef.current) return;
    e.preventDefault();
    const at = toImageCoords(e);
    if (draftRef.current.kind === "pen") draftRef.current.points.push(at);
    else if (draftRef.current.kind === "arrow") draftRef.current.to = at;
    redraw();
  };

  const onPointerUp = () => {
    if (!drawingRef.current || !draftRef.current) return;
    drawingRef.current = false;
    opsRef.current.push(draftRef.current);
    draftRef.current = null;
    setDirty(true);
    redraw();
  };

  const undo = () => {
    opsRef.current.pop();
    setDirty(opsRef.current.length > 0);
    redraw();
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !customerId) return;
    setSaving(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.9),
      );
      const fileName = `annotated-${name.replace(/\.[a-z]+$/i, "")}.jpg`;
      const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: fileName,
        size: blob.size,
        contentType: "image/jpeg",
      });
      const { uploadURL, objectPath } = await presignRes.json();
      await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      const fileUrl = objectPath.startsWith("/objects") ? objectPath : `/objects/${objectPath}`;
      await apiRequest("POST", `/api/crm/customers/${customerId}/files`, {
        name: fileName,
        url: fileUrl,
        objectPath,
        contentType: "image/jpeg",
        size: blob.size,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      console.error("Annotation save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const toolBtn = (t: Exclude<Tool, null>, Icon: typeof Pen, testid: string) => (
    <button
      onClick={() => setTool(tool === t ? null : t)}
      className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all active:scale-90 ${
        tool === t ? "bg-white text-slate-900" : "bg-white/15 text-white"
      }`}
      data-testid={testid}
    >
      <Icon className="h-5 w-5" />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" data-testid="photo-viewer">
      {/* Close — top left */}
      <button
        onClick={onClose}
        className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-transform active:scale-90"
        style={{ top: "calc(12px + env(safe-area-inset-top))" }}
        data-testid="button-close-viewer"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Canvas (image + annotations) */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
        {!ready && <Loader2 className="h-8 w-8 animate-spin text-white/60" />}
        <canvas
          ref={canvasRef}
          className={`max-h-full max-w-full object-contain ${ready ? "" : "hidden"} ${tool ? "cursor-crosshair" : ""}`}
          style={{ touchAction: tool ? "none" : "auto" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* Bottom toolbar — CompanyCam-style tray */}
      <div
        className="shrink-0 bg-gradient-to-t from-black via-black/95 to-black/60 px-4 pt-3"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {toolBtn("pen", Pen, "tool-pen")}
            {toolBtn("arrow", MoveUpRight, "tool-arrow")}
            {toolBtn("text", Type, "tool-text")}
            <button
              onClick={undo}
              disabled={!dirty}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white transition-all active:scale-90 disabled:opacity-30"
              data-testid="tool-undo"
            >
              <Undo2 className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition-transform active:scale-90 ${
                  color === c ? "scale-110 border-white" : "border-white/30"
                }`}
                style={{ backgroundColor: c }}
                data-testid={`color-${c}`}
                aria-label={`Color ${c}`}
              />
            ))}
            <button
              onClick={save}
              disabled={!dirty || saving || !customerId}
              className="ml-2 flex h-11 items-center gap-1.5 rounded-2xl bg-[#711419] px-4 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-40"
              data-testid="button-save-annotation"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
        {tool === "text" && (
          <p className="mt-2 text-center text-xs text-white/60">Tap the photo where you want the label.</p>
        )}
      </div>
    </div>
  );
}
