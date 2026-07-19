import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Filter, SignalHigh, SignalLow, SignalMedium,
} from "lucide-react";

export type PlannerBlock = {
  id: string;
  title: string;
  status: "tentative" | "sold" | "lost";
  startDate: string; // yyyy-MM-dd
  endDate: string;
  customerId: string | null;
  customerName: string | null;
  quoteId: string | null;
  projectId: string | null;
  crewId: string | null;
  estimatedValue: string | null;
  confidence: "high" | "medium" | "low" | null;
  notes: string | null;
};

export type Crew = { id: string; name: string };

type Zoom = "day" | "week";
type GroupBy = "crew" | "status" | "confidence";
type DragMode = "move" | "resize-start" | "resize-end";

type Proposal = { startDate: string; endDate: string; crewId: string | null };
type DragState = {
  mode: DragMode;
  id: string;
  block: PlannerBlock;
  grabOffset: number;
  origin: Proposal;
  proposed: Proposal;
  moved: boolean;
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const durationDays = (start: string, end: string) =>
  differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
const overlaps = (aS: string, aE: string, bS: string, bE: string) => aS <= bE && aE >= bS;

// Geometry (px). Day widths are fixed per zoom level and never change mid-drag.
const DAY_W: Record<Zoom, number> = { day: 40, week: 12 };
const ROW_H = 44;
const BAR_H = 32;
const GROUP_H = 32;
const EMPTY_ROW_H = 36;
const EDGE_ZONE = 64;       // autoscroll trigger distance from the viewport edges
const EDGE_DELAY_MS = 220;  // hover delay before autoscroll kicks in

const CONF_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

function confIcon(c: PlannerBlock["confidence"], cls = "h-3 w-3 shrink-0") {
  switch (c) {
    case "high": return <SignalHigh className={cls} />;
    case "medium": return <SignalMedium className={cls} />;
    case "low": return <SignalLow className={cls} />;
    default: return <Clock className={cls} />;
  }
}

// Bars combine fill + border style + icon so status never relies on color alone.
// Confidence-less tentatives ("holds") get the neutral striped treatment.
function barVisual(b: PlannerBlock, conflict: boolean): { cls: string; style: CSSProperties } {
  let cls: string;
  let style: CSSProperties = {};
  if (b.status === "sold") {
    cls = "bg-emerald-600 text-white border border-emerald-600";
  } else {
    switch (b.confidence) {
      case "high": cls = "bg-emerald-100 text-emerald-800 border border-dashed border-emerald-500"; break;
      case "medium": cls = "bg-amber-100 text-amber-800 border border-dashed border-amber-500"; break;
      case "low": cls = "bg-rose-100 text-rose-700 border border-dashed border-rose-500"; break;
      default:
        cls = "bg-slate-100 text-slate-600 border border-dashed border-slate-400";
        style = { backgroundImage: "repeating-linear-gradient(135deg, rgba(100,116,139,0.12) 0 5px, transparent 5px 11px)" };
    }
  }
  if (conflict) cls = cn(cls, "ring-2 ring-red-500/70");
  return { cls, style };
}

type Props = {
  blocks: PlannerBlock[];
  crews: Crew[];
  crewsPerDay: number | null;
  rangeStart: string; // week-aligned yyyy-MM-dd
  days: number;       // total rendered day columns
  rangeWeeks: number;
  onRangeWeeksChange: (w: number) => void;
  onExtend: () => void; // append weeks while drag-autoscrolling past the right end
  todayStr: string;
  todayNonce: number; // bump to re-scroll to today
  onEdit: (b: PlannerBlock) => void;
  onCreate: (startDate: string, crewId: string | null) => void;
  onCommit: (id: string, next: Proposal, prev: Proposal) => void;
};

export function InstallTimeline({
  blocks, crews, crewsPerDay, rangeStart, days, rangeWeeks, onRangeWeeksChange,
  onExtend, todayStr, todayNonce, onEdit, onCreate, onCommit,
}: Props) {
  const [zoom, setZoom] = useState<Zoom>(() => (localStorage.getItem("ip.zoom") === "week" ? "week" : "day"));
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const g = localStorage.getItem("ip.groupBy");
    return g === "status" || g === "confidence" ? g : "crew";
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [leftW, setLeftW] = useState<number>(() => {
    const n = parseInt(localStorage.getItem("ip.leftW") || "", 10);
    return Number.isFinite(n) ? Math.min(480, Math.max(140, n)) : 260;
  });

  // Filters: an empty set means "no filter" for that dimension.
  const [fStatus, setFStatus] = useState<Set<string>>(new Set());
  const [fConf, setFConf] = useState<Set<string>>(new Set());
  const [fCrew, setFCrew] = useState<Set<string>>(new Set());
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const justDraggedRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 700));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dayW = DAY_W[zoom];
  const effLeftW = narrow ? Math.min(leftW, 150) : leftW;
  const rangeStartDate = useMemo(() => parseISO(rangeStart), [rangeStart]);
  const geomRef = useRef({ dayW, days, leftW: effLeftW });
  geomRef.current = { dayW, days, leftW: effLeftW };
  const groupByRef = useRef(groupBy);
  groupByRef.current = groupBy;

  useEffect(() => localStorage.setItem("ip.zoom", zoom), [zoom]);
  useEffect(() => localStorage.setItem("ip.groupBy", groupBy), [groupBy]);
  useEffect(() => localStorage.setItem("ip.leftW", String(leftW)), [leftW]);

  const dayIdx = (dateStr: string) => differenceInCalendarDays(parseISO(dateStr), rangeStartDate);
  const idxDate = (i: number) => iso(addDays(rangeStartDate, i));
  const todayIdx = dayIdx(todayStr);

  // Scroll so today sits right after the sticky panel (on mount and via Today).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, todayIdx * dayW - dayW), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayNonce, zoom]);

  const crewName = useMemo(() => {
    const m = new Map(crews.map((c) => [c.id, c.name]));
    return (id: string | null) => (id == null ? "Unassigned" : m.get(id) ?? "Unknown crew");
  }, [crews]);

  const live = useMemo(() => blocks.filter((b) => b.status !== "lost"), [blocks]);

  const filtered = useMemo(() => live.filter((b) =>
    (fStatus.size === 0 || fStatus.has(b.status)) &&
    (fConf.size === 0 || fConf.has(b.confidence ?? "none")) &&
    (fCrew.size === 0 || fCrew.has(b.crewId ?? "none")) &&
    (!fFrom || b.endDate >= fFrom) &&
    (!fTo || b.startDate <= fTo)
  ), [live, fStatus, fConf, fCrew, fFrom, fTo]);

  const filterCount =
    (fStatus.size ? 1 : 0) + (fConf.size ? 1 : 0) + (fCrew.size ? 1 : 0) + (fFrom || fTo ? 1 : 0);

  // Same-crew overlaps (for the red conflict treatment on existing bars).
  const conflictIds = useMemo(() => {
    const out = new Set<string>();
    const byCrew = new Map<string, PlannerBlock[]>();
    for (const b of live) {
      if (!b.crewId) continue;
      const arr = byCrew.get(b.crewId) || [];
      arr.push(b);
      byCrew.set(b.crewId, arr);
    }
    byCrew.forEach((arr) => {
      arr.sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (let i = 0; i < arr.length; i++)
        for (let j = i + 1; j < arr.length && arr[j].startDate <= arr[i].endDate; j++) {
          out.add(arr[i].id);
          out.add(arr[j].id);
        }
    });
    return out;
  }, [live]);

  // Company-wide installs per rendered day, vs the crews/day capacity setting.
  const dayCounts = useMemo(() => {
    const counts = new Array(days).fill(0);
    for (const b of live) {
      const s = Math.max(0, dayIdx(b.startDate));
      const e = Math.min(days - 1, dayIdx(b.endDate));
      for (let i = s; i <= e; i++) counts[i]++;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, rangeStart, days]);

  type Group = { key: string; label: string; crewId: string | null; hasCrewTarget: boolean; blocks: PlannerBlock[] };
  const groups: Group[] = useMemo(() => {
    const sortBlocks = (arr: PlannerBlock[]) => arr.sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (groupBy === "crew") {
      const known = new Set(crews.map((c) => c.id));
      const gs: Group[] = crews.map((c) => ({
        key: `crew:${c.id}`, label: c.name, crewId: c.id, hasCrewTarget: true,
        blocks: sortBlocks(filtered.filter((b) => b.crewId === c.id)),
      }));
      const orphanIds = Array.from(new Set(filtered.filter((b) => b.crewId && !known.has(b.crewId)).map((b) => b.crewId!)));
      for (const id of orphanIds) gs.push({
        key: `crew:${id}`, label: "Unknown crew", crewId: id, hasCrewTarget: true,
        blocks: sortBlocks(filtered.filter((b) => b.crewId === id)),
      });
      gs.push({
        key: "crew:none", label: "Unassigned", crewId: null, hasCrewTarget: true,
        blocks: sortBlocks(filtered.filter((b) => !b.crewId)),
      });
      return gs;
    }
    if (groupBy === "status") {
      return (["tentative", "sold"] as const).map((s) => ({
        key: `status:${s}`, label: s === "tentative" ? "Tentative" : "Sold", crewId: null, hasCrewTarget: false,
        blocks: sortBlocks(filtered.filter((b) => b.status === s)),
      }));
    }
    return (["high", "medium", "low", "none"] as const).map((c) => ({
      key: `conf:${c}`, label: c === "none" ? "No confidence set" : `${CONF_LABEL[c]} confidence`, crewId: null, hasCrewTarget: false,
      blocks: sortBlocks(filtered.filter((b) => (b.confidence ?? "none") === c)),
    }));
  }, [groupBy, crews, filtered]);

  // ── Drag & resize ──

  const proposalFor = (d: DragState, pointerDayIdx: number, crewId: string | null): Proposal => {
    const { block } = d;
    const dur = durationDays(block.startDate, block.endDate) - 1;
    let start = d.proposed.startDate;
    let end = d.proposed.endDate;
    if (d.mode === "move") {
      let s = addDays(rangeStartDate, pointerDayIdx - d.grabOffset);
      if (iso(s) < todayStr) s = parseISO(todayStr); // no planning in the past
      start = iso(s);
      end = iso(addDays(s, dur));
    } else if (d.mode === "resize-start") {
      let s = idxDate(pointerDayIdx);
      if (s < todayStr) s = todayStr;
      start = s > block.endDate ? block.endDate : s;
      end = block.endDate;
    } else {
      const e = idxDate(pointerDayIdx);
      start = block.startDate;
      end = e < block.startDate ? block.startDate : e;
    }
    return { startDate: start, endDate: end, crewId };
  };

  const recomputeProposal = (x: number, y: number) => {
    const el = scrollRef.current;
    const d = dragRef.current;
    if (!el || !d) return;
    const g = geomRef.current;
    const rect = el.getBoundingClientRect();
    const contentX = x - rect.left + el.scrollLeft;
    const idx = Math.max(0, Math.min(g.days - 1, Math.floor((contentX - g.leftW) / g.dayW)));

    let crewId = d.proposed.crewId;
    if (d.mode === "move" && groupByRef.current === "crew") {
      const hit = document.elementFromPoint(x, y)?.closest("[data-crewgroup]") as HTMLElement | null;
      if (hit) crewId = hit.dataset.crewid || null;
    }
    const next = proposalFor(d, idx, crewId);
    if (next.startDate !== d.proposed.startDate || next.endDate !== d.proposed.endDate || next.crewId !== d.proposed.crewId) {
      setDrag({ ...d, proposed: next, moved: true });
    }
  };

  const beginDrag = (b: PlannerBlock, mode: DragMode, x: number, y: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const contentX = x - rect.left + el.scrollLeft;
    const idx = Math.floor((contentX - geomRef.current.leftW) / geomRef.current.dayW);
    const origin: Proposal = { startDate: b.startDate, endDate: b.endDate, crewId: b.crewId };
    pointerRef.current = { x, y };
    setDrag({
      mode, id: b.id, block: b,
      grabOffset: idx - dayIdx(b.startDate),
      origin, proposed: origin, moved: false,
    });
  };

  const onBarPointerDown = (e: ReactPointerEvent, b: PlannerBlock, mode: DragMode) => {
    if (b.status === "sold") return; // sold installs live on the project schedule
    if (e.pointerType !== "touch" && e.button !== 0) return;
    e.stopPropagation();
    const { clientX, clientY } = e;
    if (e.pointerType === "touch") {
      // Long-press before dragging so a stray touch doesn't grab the bar.
      const timer = window.setTimeout(() => {
        cleanup();
        beginDrag(b, mode, clientX, clientY);
      }, 350);
      const cancelIfMoved = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - clientX) > 8 || Math.abs(ev.clientY - clientY) > 8) cleanup();
      };
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener("pointermove", cancelIfMoved);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
      };
      window.addEventListener("pointermove", cancelIfMoved);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    } else {
      e.preventDefault();
      beginDrag(b, mode, clientX, clientY);
    }
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      recomputeProposal(e.clientX, e.clientY);
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !d.moved) return;
      const { origin, proposed } = d;
      if (origin.startDate === proposed.startDate && origin.endDate === proposed.endDate && origin.crewId === proposed.crewId) return;
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      onCommit(d.id, proposed, origin);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrag(null); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  // Edge autoscroll: short hover delay, then speed ramps toward the edge.
  // The drag survives new dates scrolling into view; near the right end we
  // ask the parent to append more weeks (columns keep their fixed width).
  const extendAtRef = useRef(0);
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    let edgeSince = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const el = scrollRef.current;
      const p = pointerRef.current;
      if (!el || !p) return;
      const rect = el.getBoundingClientRect();
      const innerLeft = rect.left + geomRef.current.leftW;
      let dx = 0;
      const dl = p.x - innerLeft;
      const dr = rect.right - p.x;
      if (dl < EDGE_ZONE) dx = -(4 + 20 * (1 - Math.max(0, dl) / EDGE_ZONE));
      else if (dr < EDGE_ZONE) dx = 4 + 20 * (1 - Math.max(0, dr) / EDGE_ZONE);
      let dy = 0;
      const dt = p.y - rect.top;
      const db = rect.bottom - p.y;
      if (dt < 48) dy = -(3 + 10 * (1 - Math.max(0, dt) / 48));
      else if (db < 48) dy = 3 + 10 * (1 - Math.max(0, db) / 48);
      if (dx === 0 && dy === 0) { edgeSince = 0; return; }
      if (!edgeSince) { edgeSince = t; return; }
      if (t - edgeSince < EDGE_DELAY_MS) return;
      el.scrollLeft += dx;
      el.scrollTop += dy;
      if (dx > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 * geomRef.current.dayW && t - extendAtRef.current > 600) {
        extendAtRef.current = t;
        onExtend();
      }
      recomputeProposal(p.x, p.y);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  // Validate the in-flight proposal against crew overlaps and daily capacity.
  const validation = useMemo(() => {
    if (!drag?.moved) return null;
    const { proposed, id } = drag;
    if (proposed.crewId) {
      const clashes = live.filter((b) =>
        b.id !== id && b.crewId === proposed.crewId && overlaps(b.startDate, b.endDate, proposed.startDate, proposed.endDate));
      if (clashes.length > 0) {
        const day = clashes.reduce((min, b) => {
          const s = b.startDate > proposed.startDate ? b.startDate : proposed.startDate;
          return s < min ? s : min;
        }, "9999-12-31");
        return {
          level: "error" as const,
          message: `${crewName(proposed.crewId)} already has ${clashes.length === 1 ? "an install" : `${clashes.length} installs`} on ${format(parseISO(day), "MMM d")}.`,
        };
      }
    }
    if (crewsPerDay != null) {
      const span = Math.min(120, durationDays(proposed.startDate, proposed.endDate));
      for (let i = 0; i < span; i++) {
        const d = iso(addDays(parseISO(proposed.startDate), i));
        const total = live.filter((b) => b.id !== id && b.startDate <= d && b.endDate >= d).length + 1;
        if (total > crewsPerDay) {
          return { level: "warn" as const, message: `Over capacity on ${format(parseISO(d), "MMM d")} (${total}/${crewsPerDay} crews).` };
        }
      }
    }
    return { level: "ok" as const, message: proposed.crewId ? `${crewName(proposed.crewId)} is available.` : "Dates available." };
  }, [drag, live, crewsPerDay, crewName]);

  // ── Left panel resize ──
  const onResizeLeftDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftW;
    const onMove = (ev: PointerEvent) => setLeftW(Math.min(480, Math.max(140, startW + ev.clientX - startX)));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ── Header building ──
  const dayCells = useMemo(() => Array.from({ length: days }, (_, i) => {
    const d = addDays(rangeStartDate, i);
    const s = iso(d);
    const dow = d.getDay();
    return { i, date: d, iso: s, weekend: dow === 0 || dow === 6, today: s === todayStr, past: s < todayStr };
  }), [rangeStartDate, days, todayStr]);

  const monthSegs = useMemo(() => {
    const segs: { label: string; days: number }[] = [];
    for (const c of dayCells) {
      const label = format(c.date, "MMMM yyyy");
      if (segs.length && segs[segs.length - 1].label === label) segs[segs.length - 1].days++;
      else segs.push({ label, days: 1 });
    }
    return segs;
  }, [dayCells]);

  const weekCells = useMemo(() => {
    const out: { i: number; label: string }[] = [];
    for (let i = 0; i < days; i += 7) out.push({ i, label: format(addDays(rangeStartDate, i), "MMM d") });
    return out;
  }, [rangeStartDate, days]);

  const showCapacity = zoom === "day" && crewsPerDay != null;
  const timelineW = days * dayW;

  // Day-grid background: column separators + weekend tint (Sun col 0, Sat col 6
  // of each week — rangeStart is week-aligned).
  const rowBg: CSSProperties = zoom === "day"
    ? {
        backgroundImage: [
          `repeating-linear-gradient(to right, hsl(var(--border) / 0.55) 0 1px, transparent 1px ${dayW}px)`,
          `repeating-linear-gradient(to right, hsl(var(--muted) / 0.55) 0 ${dayW}px, transparent ${dayW}px ${6 * dayW}px, hsl(var(--muted) / 0.55) ${6 * dayW}px ${7 * dayW}px)`,
        ].join(", "),
      }
    : { backgroundImage: `repeating-linear-gradient(to right, hsl(var(--border) / 0.55) 0 1px, transparent 1px ${7 * dayW}px)` };

  const barGeom = (b: Proposal) => {
    const s = Math.max(0, dayIdx(b.startDate));
    const e = Math.min(days - 1, dayIdx(b.endDate));
    return {
      left: effLeftW + s * dayW + 2,
      width: Math.max(dayW - 4, (e - s + 1) * dayW - 4),
      clipStart: dayIdx(b.startDate) < 0,
      clipEnd: dayIdx(b.endDate) > days - 1,
      offscreen: e < 0 || s > days - 1,
    };
  };

  const ghostLevelCls = validation?.level === "error"
    ? "border-red-500 bg-red-500/20"
    : validation?.level === "warn"
      ? "border-amber-500 bg-amber-500/20"
      : "border-emerald-500 bg-emerald-500/20";

  const toggleSet = (set: Set<string>, v: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    update(next);
  };

  const emptyRowCreate = (e: ReactMouseEvent, crewId: string | null) => {
    const el = scrollRef.current;
    if (!el || justDraggedRef.current) return;
    const rect = el.getBoundingClientRect();
    const idx = Math.floor((e.clientX - rect.left + el.scrollLeft - effLeftW) / dayW);
    if (idx < 0 || idx > days - 1) return;
    const d = idxDate(idx);
    if (d < todayStr) return;
    onCreate(d, crewId);
  };

  const proposedDur = drag ? durationDays(drag.proposed.startDate, drag.proposed.endDate) : 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <div className="flex items-center overflow-hidden rounded-md border">
          {[2, 4, 8].map((w) => (
            <button
              key={w}
              onClick={() => onRangeWeeksChange(w)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium transition-colors",
                rangeWeeks === w ? "bg-[#711419] text-white" : "text-muted-foreground hover:bg-muted",
              )}
              data-testid={`range-${w}w`}
            >
              {w} wk
            </button>
          ))}
        </div>
        <div className="flex items-center overflow-hidden rounded-md border">
          {(["day", "week"] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                zoom === z ? "bg-[#711419] text-white" : "text-muted-foreground hover:bg-muted",
              )}
              data-testid={`zoom-${z}`}
            >
              {z}
            </button>
          ))}
        </div>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="h-7 w-[150px] text-xs" data-testid="select-groupby">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="crew">Group: Crew</SelectItem>
            <SelectItem value="status">Group: Install status</SelectItem>
            <SelectItem value="confidence">Group: Confidence</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" data-testid="button-filters">
              <Filter className="h-3.5 w-3.5" /> Filters
              {filterCount > 0 && (
                <Badge className="h-4 min-w-4 rounded-full bg-[#711419] px-1 text-[10px] leading-none hover:bg-[#711419]">{filterCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3 text-sm">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Status</p>
              {[["tentative", "Tentative (holds)"], ["sold", "Sold"]].map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 py-0.5 text-xs">
                  <Checkbox checked={fStatus.has(v)} onCheckedChange={() => toggleSet(fStatus, v, setFStatus)} /> {label}
                </label>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Confidence</p>
              {[["high", "High"], ["medium", "Medium"], ["low", "Low"], ["none", "Not set"]].map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 py-0.5 text-xs">
                  <Checkbox checked={fConf.has(v)} onCheckedChange={() => toggleSet(fConf, v, setFConf)} /> {label}
                </label>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Crew</p>
              <div className="max-h-32 overflow-y-auto">
                {[...crews.map((c) => [c.id, c.name] as const), ["none", "Unassigned"] as const].map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 py-0.5 text-xs">
                    <Checkbox checked={fCrew.has(v)} onCheckedChange={() => toggleSet(fCrew, v, setFCrew)} /> {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Date range</p>
              <div className="flex items-center gap-1.5">
                <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="h-7 text-xs" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="h-7 text-xs" />
              </div>
            </div>
            {filterCount > 0 && (
              <Button
                variant="ghost" size="sm" className="h-7 w-full text-xs"
                onClick={() => { setFStatus(new Set()); setFConf(new Set()); setFCrew(new Set()); setFFrom(""); setFTo(""); }}
              >
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          Drag bars to reschedule · drag between crews to reassign · drag edges to resize
        </span>
      </div>

      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className={cn("relative min-h-0 flex-1 select-none overflow-auto overscroll-contain", drag && "cursor-grabbing")}
        data-testid="timeline-scroll"
      >
        <div className="relative" style={{ width: effLeftW + timelineW, minWidth: "100%" }}>
          {/* Today marker + past shading (under the sticky header/panel) */}
          {todayIdx >= 0 && todayIdx < days && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-[#711419]/70 bg-[#711419]/[0.04]"
              style={{ left: effLeftW + todayIdx * dayW, width: dayW }}
            />
          )}
          {todayIdx > 0 && (
            <div
              className="pointer-events-none absolute inset-y-0 z-[5] bg-muted/40"
              style={{ left: effLeftW, width: Math.min(todayIdx, days) * dayW }}
            />
          )}

          {/* Sticky two-level date header */}
          <div className="sticky top-0 z-30 flex border-b border-border bg-card">
            <div
              className="sticky left-0 z-40 flex shrink-0 flex-col justify-end border-r border-border bg-card px-2 pb-1"
              style={{ width: effLeftW }}
            >
              <div className="flex items-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">Install</span>
                {!narrow && (
                  <>
                    <span className="w-[74px] shrink-0">Crew</span>
                    <span className="w-[46px] shrink-0">Conf</span>
                    <span className="w-[34px] shrink-0">Dur</span>
                    <span className="w-[44px] shrink-0">Status</span>
                  </>
                )}
              </div>
              {!narrow && (
                <div
                  onPointerDown={onResizeLeftDown}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-[#711419]/30"
                  title="Drag to resize"
                  data-testid="left-panel-resize"
                />
              )}
            </div>
            <div className="shrink-0" style={{ width: timelineW }}>
              <div className="flex h-6 border-b border-border/60">
                {monthSegs.map((seg, i) => (
                  <div key={i} className="flex items-center overflow-hidden border-r border-border/60 last:border-r-0" style={{ width: seg.days * dayW }}>
                    <span className="sticky truncate px-2 text-[11px] font-semibold text-foreground" style={{ left: effLeftW }}>
                      {seg.label}
                    </span>
                  </div>
                ))}
              </div>
              {zoom === "day" ? (
                <div className="flex">
                  {dayCells.map((c) => (
                    <div
                      key={c.iso}
                      className={cn(
                        "flex h-9 flex-col items-center justify-center border-r border-border/40 last:border-r-0",
                        c.weekend && "bg-muted/50",
                        c.today && "bg-[#711419]/10",
                      )}
                      style={{ width: dayW }}
                    >
                      <span className="text-[9px] uppercase leading-3 text-muted-foreground">{format(c.date, "EEE")}</span>
                      <span className={cn("text-[11px] font-medium leading-3", c.today ? "font-bold text-[#711419]" : c.past ? "text-muted-foreground/60" : "text-foreground")}>
                        {format(c.date, "d")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex">
                  {weekCells.map((w) => (
                    <div key={w.i} className="flex h-9 items-center border-r border-border/40 px-1.5 text-[10px] font-medium text-muted-foreground last:border-r-0" style={{ width: 7 * dayW }}>
                      {w.label}
                    </div>
                  ))}
                </div>
              )}
              {showCapacity && (
                <div className="flex border-t border-border/60">
                  {dayCells.map((c) => {
                    const n = dayCounts[c.i];
                    const over = n > (crewsPerDay ?? Infinity);
                    return (
                      <div key={c.iso} className={cn("flex h-4 items-center justify-center text-[9px] tabular-nums", over ? "bg-red-100 font-semibold text-red-600" : n > 0 ? "text-muted-foreground" : "text-transparent")} style={{ width: dayW }}>
                        {n}/{crewsPerDay}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Crew groups */}
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            const groupConflicts = g.blocks.some((b) => conflictIds.has(b.id));
            const dragTargetsGroup = drag?.moved && groupBy === "crew" && drag.proposed.crewId === g.crewId;
            const ghost = drag && dragTargetsGroup && !isCollapsed ? barGeom(drag.proposed) : null;
            const draggedIdx = drag ? g.blocks.findIndex((b) => b.id === drag.id) : -1;
            const ghostTop = draggedIdx >= 0 ? draggedIdx * ROW_H + (ROW_H - BAR_H) / 2 : g.blocks.length * ROW_H + (EMPTY_ROW_H - BAR_H) / 2;
            return (
              <section key={g.key} {...(g.hasCrewTarget ? { "data-crewgroup": g.key, "data-crewid": g.crewId ?? "" } : {})}>
                <div className="flex border-b border-border" style={{ height: GROUP_H }}>
                  <button
                    onClick={() => {
                      const next = new Set(collapsed);
                      next.has(g.key) ? next.delete(g.key) : next.add(g.key);
                      setCollapsed(next);
                    }}
                    className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border bg-muted/70 px-2 text-left backdrop-blur"
                    style={{ width: effLeftW }}
                    data-testid={`group-${g.key}`}
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                    <span className="truncate text-xs font-semibold text-foreground">{g.label}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{g.blocks.length}</span>
                    {groupConflicts && <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />}
                  </button>
                  <div className="shrink-0 bg-muted/40" style={{ width: timelineW }} />
                </div>

                {!isCollapsed && (
                  <div className="relative">
                    {g.blocks.map((b) => {
                      const geo = barGeom(b);
                      const conflict = conflictIds.has(b.id);
                      const { cls, style } = barVisual(b, conflict);
                      const isDragged = drag?.id === b.id;
                      const movable = b.status !== "sold";
                      const dur = durationDays(b.startDate, b.endDate);
                      return (
                        <div key={b.id} className="flex border-b border-border/60" style={{ height: ROW_H }}>
                          <button
                            onClick={() => onEdit(b)}
                            className="sticky left-0 z-20 flex shrink-0 items-center border-r border-border bg-card px-2 text-left hover:bg-muted/40"
                            style={{ width: effLeftW }}
                            data-testid={`row-${b.id}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-foreground">{b.title}</span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {narrow ? crewName(b.crewId) : b.customerName || "—"}
                              </span>
                            </span>
                            {!narrow && (
                              <>
                                <span className="w-[74px] shrink-0 truncate text-[11px] text-muted-foreground">{crewName(b.crewId)}</span>
                                <span className="flex w-[46px] shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                                  {b.status !== "sold" && confIcon(b.confidence)}
                                  {b.status !== "sold" && (b.confidence ? CONF_LABEL[b.confidence].slice(0, 3) : "Hold")}
                                </span>
                                <span className="w-[34px] shrink-0 text-[11px] tabular-nums text-muted-foreground">{dur}d</span>
                                <span className="w-[44px] shrink-0">
                                  <span className={cn(
                                    "inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold uppercase",
                                    b.status === "sold" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                                  )}>
                                    {b.status === "sold" ? "Sold" : "Tent"}
                                  </span>
                                </span>
                              </>
                            )}
                          </button>

                          {/* Date track */}
                          <div className="relative shrink-0" style={{ width: timelineW, ...rowBg }}>
                            {!geo.offscreen && (
                              <HoverCard openDelay={300} closeDelay={80}>
                                <HoverCardTrigger asChild>
                                  <div
                                    onClick={() => { if (!justDraggedRef.current) onEdit(b); }}
                                    onPointerDown={(e) => onBarPointerDown(e, b, "move")}
                                    className={cn(
                                      "group absolute flex items-center gap-1 overflow-hidden px-1.5 text-[11px] font-medium shadow-sm",
                                      !geo.clipStart && "rounded-l-md",
                                      !geo.clipEnd && "rounded-r-md",
                                      cls,
                                      isDragged && "opacity-40 saturate-50",
                                      drag && "pointer-events-none",
                                      !drag && (movable ? "cursor-grab active:cursor-grabbing hover:brightness-95" : "cursor-pointer"),
                                    )}
                                    style={{
                                      ...style,
                                      left: geo.left - effLeftW,
                                      width: geo.width,
                                      top: (ROW_H - BAR_H) / 2,
                                      height: BAR_H,
                                      touchAction: movable ? "none" : undefined,
                                    }}
                                    data-testid={`bar-${b.id}`}
                                  >
                                    {conflict ? (
                                      <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                                    ) : b.status === "sold" ? (
                                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                                    ) : (
                                      confIcon(b.confidence)
                                    )}
                                    {geo.width > 56 && <span className="min-w-0 truncate">{b.title}</span>}
                                    {geo.width > 110 && <span className="ml-auto shrink-0 text-[10px] tabular-nums opacity-70">{dur}d</span>}
                                    {movable && !geo.clipStart && (
                                      <span
                                        onPointerDown={(e) => onBarPointerDown(e, b, "resize-start")}
                                        className="absolute inset-y-0 left-0 w-3 cursor-ew-resize touch-none"
                                        data-testid={`bar-resize-start-${b.id}`}
                                      >
                                        <span className="absolute inset-y-[6px] left-[3px] w-[3px] rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-50" />
                                      </span>
                                    )}
                                    {movable && !geo.clipEnd && (
                                      <span
                                        onPointerDown={(e) => onBarPointerDown(e, b, "resize-end")}
                                        className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none"
                                        data-testid={`bar-resize-end-${b.id}`}
                                      >
                                        <span className="absolute inset-y-[6px] right-[3px] w-[3px] rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-50" />
                                      </span>
                                    )}
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent side="top" align="start" className="w-72 text-sm">
                                  <p className="font-semibold">{b.title}</p>
                                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                                    {b.customerName && <p>Customer: <span className="text-foreground">{b.customerName}</span></p>}
                                    <p>Crew: <span className="text-foreground">{crewName(b.crewId)}</span></p>
                                    <p>
                                      Dates: <span className="text-foreground">
                                        {format(parseISO(b.startDate), "EEE, MMM d")} – {format(parseISO(b.endDate), "EEE, MMM d")} ({dur}d)
                                      </span>
                                    </p>
                                    <p>Status: <span className="text-foreground">{b.status === "sold" ? "Sold" : b.confidence ? `Tentative · ${CONF_LABEL[b.confidence]} confidence` : "Tentative hold"}</span></p>
                                    {b.estimatedValue && <p>Est. value: <span className="text-foreground">${Number(b.estimatedValue).toLocaleString()}</span></p>}
                                    {conflict && <p className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-3 w-3" /> Overlaps another install for this crew.</p>}
                                    {b.notes && <p className="line-clamp-3 border-t border-border pt-1">{b.notes}</p>}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Empty drop/create strip at the bottom of every group */}
                    <div className="flex border-b border-border/60" style={{ height: EMPTY_ROW_H }}>
                      <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-card" style={{ width: effLeftW }} />
                      <div
                        className="relative shrink-0 cursor-pointer transition-colors hover:bg-muted/30"
                        style={{ width: timelineW, ...rowBg }}
                        onClick={(e) => emptyRowCreate(e, g.crewId)}
                        title={g.hasCrewTarget ? `Click a day to add a hold for ${g.label}` : "Click a day to add a hold"}
                        data-testid={`empty-row-${g.key}`}
                      />
                    </div>

                    {/* Ghost bar at the proposed destination */}
                    {ghost && !ghost.offscreen && (
                      <div
                        className={cn("pointer-events-none absolute z-10 rounded-md border-2 border-dashed", ghostLevelCls)}
                        style={{ left: ghost.left, width: ghost.width, top: ghostTop, height: BAR_H }}
                        data-testid="ghost-bar"
                      />
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {filtered.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No installs in this range{filterCount > 0 ? " match the filters" : ""}.
            </div>
          )}
        </div>
      </div>

      {/* In-flight proposal chip */}
      {drag?.moved && (
        <div
          className="pointer-events-none absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1 rounded-lg bg-[#711419] px-3.5 py-2 text-white shadow-xl"
          data-testid="drag-chip"
        >
          <span className="text-xs font-semibold">
            {format(parseISO(drag.proposed.startDate), "EEE, MMM d")} – {format(parseISO(drag.proposed.endDate), "MMM d")}
            {" · "}{proposedDur}d
            {groupBy === "crew" && <> · {crewName(drag.proposed.crewId)}</>}
          </span>
          {validation && (
            <span className={cn(
              "flex items-center gap-1 text-[11px]",
              validation.level === "error" ? "text-red-200" : validation.level === "warn" ? "text-amber-200" : "text-emerald-200",
            )}>
              {validation.level === "ok" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {validation.message}
            </span>
          )}
          <span className="text-[10px] text-white/60">Esc to cancel</span>
        </div>
      )}
    </div>
  );
}
