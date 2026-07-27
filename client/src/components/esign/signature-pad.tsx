import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  width?: number;
  height?: number;
  penColor?: string;
  onChange?: (dataUrl: string | null) => void;
}

// Points are stored normalized (0..1) so strokes survive a resize (e.g. the
// dialog reflowing on a phone rotation) without distortion.
type Point = { x: number; y: number };

export function SignaturePad({ width = 480, height = 180, penColor = "#0a0a0a", onChange }: SignaturePadProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [size, setSize] = useState({ w: width, h: height });
  const [hasInk, setHasInk] = useState(false);

  // Fit the pad to its container so it never overflows a narrow mobile dialog.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const w = Math.max(200, Math.min(width, wrap.clientWidth || width));
      setSize({ w, h: Math.round(height * (w / width)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [width, height]);

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h } = size;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      const pts = stroke.map((p) => ({ x: p.x * w, y: p.y * h }));
      ctx.beginPath();
      if (pts.length < 3) {
        // A dot or a very short flick — draw it as-is.
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts) ctx.lineTo(p.x, p.y);
      } else {
        // Quadratic curves through segment midpoints: smooth, no corner spikes.
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      }
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.w * ratio;
    canvas.height = size.h * ratio;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    canvas.getContext("2d")?.scale(ratio, ratio);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, penColor]);

  // Map a pointer position through the canvas's rendered rect so ink lands
  // exactly under the pointer even if CSS scales the canvas.
  const toPoint = (clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const addPoint = (p: Point) => {
    const stroke = strokes.current[strokes.current.length - 1];
    const last = stroke[stroke.length - 1];
    // Drop sub-half-pixel jitter; keep everything else for fidelity.
    if (last && Math.abs(last.x - p.x) * size.w < 0.5 && Math.abs(last.y - p.y) * size.h < 0.5) return;
    stroke.push(p);
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    strokes.current.push([toPoint(e.clientX, e.clientY)]);
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (!hasInk) setHasInk(true);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    // Coalesced events carry the full high-frequency input trail between
    // React's pointermove dispatches — without them fast strokes get chopped
    // into long straight segments.
    const native = e.nativeEvent as PointerEvent;
    const events = native.getCoalescedEvents?.() ?? [];
    if (events.length > 0) {
      for (const ev of events) addPoint(toPoint(ev.clientX, ev.clientY));
    } else {
      addPoint(toPoint(e.clientX, e.clientY));
    }
    redraw();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    redraw();
    emit();
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange?.(strokes.current.length > 0 ? canvas.toDataURL("image/png") : null);
  };

  const clear = () => {
    strokes.current = [];
    redraw();
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div className="space-y-2" ref={wrapRef}>
      <div className="w-fit max-w-full rounded-md border border-dashed border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="touch-none cursor-crosshair rounded-md"
          data-testid="canvas-signature-pad"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Draw your signature above</span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk} data-testid="button-clear-signature">
          <Eraser className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
}
