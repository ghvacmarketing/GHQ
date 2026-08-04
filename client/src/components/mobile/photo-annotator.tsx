import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Loader2, Pencil, RotateCcw, Type, X } from "lucide-react";

/** CompanyCam-style photo markup: freehand pen, arrows, and text stamps in a
 *  handful of colors, drawn over the shot at full resolution. The result is
 *  flattened to a JPEG and handed back for the normal upload pipeline —
 *  nothing else in the flow changes. */

type Tool = "pen" | "arrow" | "text";
type Op =
  | { tool: "pen"; color: string; points: Array<{ x: number; y: number }> }
  | { tool: "arrow"; color: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { tool: "text"; color: string; at: { x: number; y: number }; text: string };

const COLORS = ["#ef4444", "#facc15", "#ffffff", "#3b82f6", "#22c55e", "#0f172a"];
const MAX_EDGE = 2000;

export function PhotoAnnotator({
  file,
  onDone,
  onCancel,
}: {
  file: File;
  onDone: (annotated: File) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [ops, setOps] = useState<Op[]>([]);
  const [draft, setDraft] = useState<Op | null>(null);
  // Text stamp being typed: canvas coords + the input's on-screen position.
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; left: number; top: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const srcUrl = useMemo(() => URL.createObjectURL(file), [file]);

  // Load the shot and size the canvas to it (capped so markup stays crisp
  // without producing a monster file).
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      imgRef.current = img;
      setReady(true);
    };
    img.src = srcUrl;
    return () => URL.revokeObjectURL(srcUrl);
  }, [srcUrl]);

  const lineWidth = () => Math.max(4, Math.round((canvasRef.current?.width || 1000) / 180));
  const fontSize = () => Math.max(24, Math.round((canvasRef.current?.width || 1000) / 16));

  const drawOp = (ctx: CanvasRenderingContext2D, op: Op) => {
    ctx.save();
    ctx.strokeStyle = op.color;
    ctx.fillStyle = op.color;
    ctx.lineWidth = lineWidth();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = lineWidth() * 0.9;
    if (op.tool === "pen") {
      if (op.points.length < 2) {
        const p = op.points[0];
        if (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, lineWidth() / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(op.points[0].x, op.points[0].y);
        for (const p of op.points.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    } else if (op.tool === "arrow") {
      const { from, to } = op;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = lineWidth() * 3.2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else {
      ctx.font = `700 ${fontSize()}px -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(op.text, op.at.x, op.at.y);
    }
    ctx.restore();
  };

  // Full redraw: photo + committed ops + the in-flight draft.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !ready) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const op of ops) drawOp(ctx, op);
    if (draft) drawOp(ctx, draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, draft, ready]);

  const toCanvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      screenLeft: e.clientX,
      screenTop: e.clientY,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready || saving) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toCanvasPoint(e);
    if (tool === "text") {
      // Place the input where the finger landed (relative to the wrapper so
      // it scrolls/fits with the canvas).
      const wrapRect = wrapRef.current!.getBoundingClientRect();
      setTextValue("");
      setTextDraft({ x: p.x, y: p.y, left: e.clientX - wrapRect.left, top: e.clientY - wrapRect.top });
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }
    setDraft(
      tool === "pen"
        ? { tool: "pen", color, points: [{ x: p.x, y: p.y }] }
        : { tool: "arrow", color, from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y } },
    );
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draft) return;
    e.preventDefault();
    const p = toCanvasPoint(e);
    setDraft((d) =>
      !d ? d : d.tool === "pen" ? { ...d, points: [...d.points, { x: p.x, y: p.y }] } : d.tool === "arrow" ? { ...d, to: { x: p.x, y: p.y } } : d,
    );
  };
  const onPointerUp = () => {
    if (!draft) return;
    setOps((prev) => [...prev, draft]);
    setDraft(null);
  };

  const commitText = () => {
    const t = textValue.trim();
    if (textDraft && t) {
      setOps((prev) => [...prev, { tool: "text", color, at: { x: textDraft.x, y: textDraft.y }, text: t }]);
    }
    setTextDraft(null);
    setTextValue("");
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    if (textDraft) commitText();
    setSaving(true);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setSaving(false);
          return;
        }
        const name = file.name.replace(/\.[a-z0-9]+$/i, "") || "photo";
        onDone(new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  const TOOLS: Array<{ key: Tool; label: string; icon: typeof Pencil }> = [
    { key: "pen", label: "Draw", icon: Pencil },
    { key: "arrow", label: "Arrow", icon: ArrowUpRight },
    { key: "text", label: "Text", icon: Type },
  ];

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-slate-950" data-testid="photo-annotator">
      {/* Top bar — house chrome: frosted circles, uppercase strip title */}
      <div
        className="flex items-center justify-between px-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
      >
        <button
          onClick={onCancel}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition-transform active:scale-95"
          aria-label="Cancel"
          data-testid="annotator-cancel"
        >
          <X className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Edit photo</span>
        <button
          onClick={() => setOps((prev) => prev.slice(0, -1))}
          disabled={ops.length === 0}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition-transform active:scale-95 disabled:opacity-30"
          aria-label="Undo"
          data-testid="annotator-undo"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        {!ready && <Loader2 className="h-8 w-8 animate-spin text-white/60" />}
        <canvas
          ref={canvasRef}
          className={`max-h-full max-w-full rounded-[6px] shadow-2xl ${ready ? "" : "hidden"}`}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid="annotator-canvas"
        />
        {textDraft && (
          <input
            ref={textInputRef}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
            }}
            placeholder="Type…"
            className="absolute z-10 w-44 rounded-[6px] border-2 bg-black/60 px-2 py-1.5 text-base font-bold outline-none backdrop-blur placeholder:text-white/40"
            style={{ left: Math.min(textDraft.left, (wrapRef.current?.clientWidth || 300) - 180), top: textDraft.top, color, borderColor: color }}
            data-testid="annotator-text-input"
          />
        )}
      </div>

      {/* Toolbar — industrial: squared swatches, hairline segmented tools
          with the maroon carrying the selected state, create-style Save */}
      <div className="px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)" }}>
        <div className="mb-3 flex items-center justify-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-[6px] border-2 transition-transform active:scale-90 ${
                color === c ? "scale-110 border-white" : "border-white/25"
              }`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              data-testid={`annotator-color-${c.replace("#", "")}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-[8px] border border-white/10 bg-white/10 p-1 backdrop-blur">
            {TOOLS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTool(key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[6px] py-2 text-sm font-semibold transition-colors ${
                  tool === key ? "bg-[#711419] text-white shadow-sm" : "text-white/75"
                }`}
                data-testid={`annotator-tool-${key}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={save}
            disabled={!ready || saving}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-[#711419] px-5 text-sm font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
            data-testid="annotator-save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
