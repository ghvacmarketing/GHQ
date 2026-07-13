import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  addDays, addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek,
} from "date-fns";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Plus, CalendarRange, Loader2, Trash2, CheckCircle2, X, DollarSign,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";

type Block = {
  id: string;
  title: string;
  status: "tentative" | "sold" | "lost";
  startDate: string; // yyyy-MM-dd
  endDate: string;
  customerId: string | null;
  customerName: string | null;
  quoteId: string | null;
  projectId: string | null;
  estimatedValue: string | null;
  confidence: "high" | "medium" | "low" | null;
  notes: string | null;
};

type CustomerHit = { id: string; name: string };

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const rangeLabel = (start: string, end: string) => {
  if (!start) return "Pick dates";
  const s = parseISO(start);
  if (start === end) return format(s, "EEE, MMM d, yyyy");
  const e = parseISO(end);
  return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
};

// Live move/resize of a block by dragging it (or its edge) across the grid.
type Interact = {
  mode: "move" | "resize-start" | "resize-end";
  blockId: string;
  grabDay: string;
  origStart: string;
  origEnd: string;
  hover: string;
};

function previewRange(it: Interact): { start: string; end: string } {
  if (it.mode === "move") {
    const delta = differenceInCalendarDays(parseISO(it.hover), parseISO(it.grabDay));
    return { start: iso(addDays(parseISO(it.origStart), delta)), end: iso(addDays(parseISO(it.origEnd), delta)) };
  }
  if (it.mode === "resize-start") {
    return { start: it.hover <= it.origEnd ? it.hover : it.origEnd, end: it.origEnd };
  }
  return { start: it.origStart, end: it.hover >= it.origStart ? it.hover : it.origStart };
}

// Bar color: sold reads as solid/confirmed; tentative is colored by confidence
// (green = high, amber = medium, red = low, grey = unset) with a dashed edge.
function barClass(b: { status: Block["status"]; confidence: Block["confidence"] }): string {
  if (b.status === "sold") return "bg-emerald-600 text-white border border-emerald-600";
  switch (b.confidence) {
    case "high": return "bg-emerald-100 text-emerald-800 border border-dashed border-emerald-400";
    case "medium": return "bg-amber-100 text-amber-800 border border-dashed border-amber-400";
    case "low": return "bg-rose-100 text-rose-700 border border-dashed border-rose-400";
    default: return "bg-slate-100 text-slate-600 border border-dashed border-slate-300";
  }
}

// Month-grid bar layout constants (px).
const HEADER_H = 22;   // date-number strip height
const BAR_H = 18;      // one bar's height
const LANE_GAP = 3;    // gap between stacked bars
const MAX_LANES = 3;   // visible lanes before overflow ("+N more")
const OVERFLOW_H = 14;

type FormState = {
  id: string | null;
  title: string;
  startDate: string;
  endDate: string;
  customerId: string;
  customerName: string;
  estimatedValue: string;
  confidence: "" | "high" | "medium" | "low";
  notes: string;
  status: Block["status"];
  projectId: string | null;
};

const emptyForm = (start: string, end: string): FormState => ({
  id: null, title: "", startDate: start, endDate: end, customerId: "", customerName: "",
  estimatedValue: "", confidence: "", notes: "", status: "tentative", projectId: null,
});

export default function CrmInstallPlanner() {
  usePageTitle("Install Planner");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const from = iso(gridStart);
  const to = iso(gridEnd);

  const { data, isLoading } = useQuery<{ blocks: Block[]; crewsPerDay: number | null }>({
    queryKey: ["/api/crm/install-planner", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/crm/install-planner?from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load planner");
      return res.json();
    },
    enabled: !!currentUser,
  });
  const blocks = data?.blocks || [];
  const crewsPerDay = data?.crewsPerDay ?? null;

  // Move / resize interaction (drag a block or its edge across day cells).
  const [interact, setInteract] = useState<Interact | null>(null);
  const interactRef = useRef<Interact | null>(null);
  const blocksRef = useRef<Block[]>([]);
  useEffect(() => { interactRef.current = interact; }, [interact]);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // ── Dialog / form ──
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(iso(new Date()), iso(new Date())));
  const [custSearch, setCustSearch] = useState("");
  const [dayList, setDayList] = useState<string | null>(null); // "see all" popup for a crowded day

  const openCreate = (start: string, end?: string) => {
    setForm(emptyForm(start, end ?? start));
    setCustSearch("");
    setOpen(true);
  };
  const openEdit = (b: Block) => {
    setForm({
      id: b.id, title: b.title, startDate: b.startDate, endDate: b.endDate,
      customerId: b.customerId || "", customerName: b.customerName || "",
      estimatedValue: b.estimatedValue || "", confidence: b.confidence || "",
      notes: b.notes || "", status: b.status, projectId: b.projectId,
    });
    setCustSearch("");
    setOpen(true);
  };

  // Drag across day cells to select a range, then open the create dialog.
  const [dragRange, setDragRange] = useState<{ anchor: string; current: string } | null>(null);
  const dragRef = useRef<{ anchor: string; current: string } | null>(null);
  useEffect(() => { dragRef.current = dragRange; }, [dragRange]);
  useEffect(() => {
    const onUp = () => {
      // Finish a create-drag.
      const d = dragRef.current;
      if (d) {
        const lo = d.anchor <= d.current ? d.anchor : d.current;
        const hi = d.anchor <= d.current ? d.current : d.anchor;
        setDragRange(null);
        openCreate(lo, hi);
        return;
      }
      // Finish a move/resize (or treat a no-move grab as an edit click).
      const it = interactRef.current;
      if (it) {
        setInteract(null);
        if (it.mode === "move" && it.hover === it.grabDay) {
          const b = blocksRef.current.find((x) => x.id === it.blockId);
          if (b) openEdit(b);
          return;
        }
        const pr = previewRange(it);
        if (pr.start !== it.origStart || pr.end !== it.origEnd) {
          apiRequest("PATCH", `/api/crm/install-planner/${it.blockId}`, { startDate: pr.start, endDate: pr.end })
            .then(() => queryClient.invalidateQueries({ queryKey: ["/api/crm/install-planner"] }))
            .catch(() => {
              queryClient.invalidateQueries({ queryKey: ["/api/crm/install-planner"] });
              toast({ title: "Couldn't reschedule", variant: "destructive" });
            });
        }
      }
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const inDrag = (dayStr: string) => {
    if (!dragRange) return false;
    const lo = dragRange.anchor <= dragRange.current ? dragRange.anchor : dragRange.current;
    const hi = dragRange.anchor <= dragRange.current ? dragRange.current : dragRange.anchor;
    return dayStr >= lo && dayStr <= hi;
  };

  const { data: custData } = useQuery<{ customers: CustomerHit[] }>({
    queryKey: ["/api/crm/customers/merged", "planner", custSearch],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/merged?search=${encodeURIComponent(custSearch)}&limit=8`, { credentials: "include" });
      if (!res.ok) throw new Error("search failed");
      return res.json();
    },
    enabled: custSearch.trim().length >= 2,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/crm/install-planner"] });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        customerId: form.customerId || null,
        estimatedValue: form.estimatedValue || null,
        confidence: form.confidence || null,
        notes: form.notes || null,
      };
      const res = form.id
        ? await apiRequest("PATCH", `/api/crm/install-planner/${form.id}`, payload)
        : await apiRequest("POST", `/api/crm/install-planner`, payload);
      return res.json();
    },
    onSuccess: () => { invalidate(); setOpen(false); },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/crm/install-planner/${form.id}`),
    onSuccess: () => { invalidate(); setOpen(false); toast({ title: "Removed" }); },
  });

  const sell = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/crm/install-planner/${form.id}/sell`, {})).json(),
    onSuccess: (r: any) => {
      invalidate();
      setOpen(false);
      toast({
        title: "Sold — project created",
        description: "The tentative hold is now a scheduled project.",
        action: r?.project?.id ? (
          <Button size="sm" variant="outline" onClick={() => navigate(`/crm/projects/${r.project.id}`)}>Open</Button>
        ) : undefined,
      });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't convert", variant: "destructive" }),
  });

  const saveCrews = useMutation({
    mutationFn: async (val: string) => (await apiRequest("PUT", `/api/crm/install-planner/settings`, { crewsPerDay: val })).json(),
    onSuccess: () => invalidate(),
  });

  const [crewsInput, setCrewsInput] = useState<string>("");
  useEffect(() => { setCrewsInput(crewsPerDay != null ? String(crewsPerDay) : ""); }, [crewsPerDay]);

  // Split the 42-day grid into weeks and pack each week's bars into lanes.
  const weeks = useMemo(() => {
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const effRange = (b: Block) => {
    const it = interact && interact.blockId === b.id ? interact : null;
    return it ? previewRange(it) : { start: b.startDate, end: b.endDate };
  };

  const layoutWeek = (weekDays: Date[]) => {
    const wStart = iso(weekDays[0]);
    const wEnd = iso(weekDays[6]);
    const items = blocks
      .filter((b) => b.status !== "lost")
      .map((b) => ({ b, r: effRange(b) }))
      .filter(({ r }) => r.start <= wEnd && r.end >= wStart)
      .map(({ b, r }) => {
        const cs = r.start < wStart ? wStart : r.start;
        const ce = r.end > wEnd ? wEnd : r.end;
        return {
          block: b,
          colStart: Math.max(0, Math.min(6, differenceInCalendarDays(parseISO(cs), weekDays[0]))),
          colEnd: Math.max(0, Math.min(6, differenceInCalendarDays(parseISO(ce), weekDays[0]))),
          realStart: r.start >= wStart,
          realEnd: r.end <= wEnd,
          lane: 0,
        };
      })
      .sort((a, b) => a.colStart - b.colStart || (b.colEnd - b.colStart) - (a.colEnd - a.colStart));
    const laneEnds: number[] = [];
    for (const it of items) {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] >= it.colStart) lane++;
      it.lane = lane;
      laneEnds[lane] = it.colEnd;
    }
    const dayCounts = Array(7).fill(0);
    const overflowByCol = Array(7).fill(0);
    for (const it of items) {
      for (let c = it.colStart; c <= it.colEnd; c++) {
        dayCounts[c]++;
        if (it.lane >= MAX_LANES) overflowByCol[c]++;
      }
    }
    return {
      visible: items.filter((it) => it.lane < MAX_LANES),
      overflowByCol,
      dayCounts,
      laneCount: Math.min(MAX_LANES, laneEnds.length),
    };
  };

  // All blocks active on a given day (uncapped) — for the "see all" popup.
  const dayListBlocks = dayList
    ? blocks.filter((b) => b.status !== "lost" && b.startDate <= dayList && b.endDate >= dayList)
    : [];

  if (!currentUser) return null;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="w-full space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#711419]/10">
              <CalendarRange className="h-5 w-5 text-[#711419]" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Install Planner</h1>
              <p className="text-sm text-muted-foreground">Drag across days to block out a tentative install before it's sold.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
              <Label className="text-[11px] text-muted-foreground">Crews/day</Label>
              <Input
                value={crewsInput}
                onChange={(e) => setCrewsInput(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={() => { if (crewsInput !== (crewsPerDay != null ? String(crewsPerDay) : "")) saveCrews.mutate(crewsInput); }}
                placeholder="—"
                className="h-7 w-12 px-1.5 text-center text-sm"
                data-testid="input-crews-per-day"
              />
            </div>
            <Button onClick={() => openCreate(iso(new Date()))} data-testid="button-new-block">
              <Plus className="mr-1.5 h-4 w-4" /> New tentative install
            </Button>
          </div>
        </div>

        {/* Month nav + legend */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => addMonths(m, -1))} data-testid="button-prev-month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => addMonths(m, 1))} data-testid="button-next-month">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="ml-2 text-sm font-semibold text-foreground">{format(month, "MMMM yyyy")}</h2>
            {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="text-muted-foreground/70">Confidence:</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-dashed border-emerald-400 bg-emerald-100" /> High</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-dashed border-amber-400 bg-amber-100" /> Medium</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-dashed border-rose-400 bg-rose-100" /> Low</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-emerald-600" /> Sold</span>
          </div>
        </div>

        {/* Calendar */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center">{d}</div>
            ))}
          </div>
          <div>
            {weeks.map((weekDays, wi) => {
              const { visible, overflowByCol, dayCounts, laneCount } = layoutWeek(weekDays);
              const lanesH = Math.max(1, laneCount) * (BAR_H + LANE_GAP);
              const hasOverflow = overflowByCol.some((n) => n > 0);
              const weekH = Math.max(96, HEADER_H + lanesH + (hasOverflow ? OVERFLOW_H : 0) + 6);
              const dragging = !!interact || !!dragRange;
              return (
                <div key={wi} className="relative border-b border-border last:border-b-0" style={{ minHeight: weekH }}>
                  {/* Day columns: numbers, capacity, interaction surface */}
                  <div className="absolute inset-0 grid h-full grid-cols-7">
                    {weekDays.map((day, ci) => {
                      const dayStr = iso(day);
                      const inMonth = isSameMonth(day, month);
                      const over = crewsPerDay != null && dayCounts[ci] > crewsPerDay;
                      return (
                        <div
                          key={dayStr}
                          className={cn(
                            "relative cursor-pointer select-none border-r border-border transition-colors last:border-r-0",
                            !inMonth && "bg-muted/20",
                            inDrag(dayStr) ? "bg-[#711419]/10 ring-1 ring-inset ring-[#711419]/40" : "hover:bg-muted/30",
                          )}
                          onMouseDown={(e) => { e.preventDefault(); setDragRange({ anchor: dayStr, current: dayStr }); }}
                          onMouseEnter={() => {
                            setDragRange((r) => (r ? { ...r, current: dayStr } : r));
                            setInteract((it) => (it ? { ...it, hover: dayStr } : it));
                          }}
                          data-testid={`day-${dayStr}`}
                        >
                          <div className="flex items-center justify-between px-1.5 pt-1">
                            <span className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                              isToday(day) ? "bg-[#711419] text-white" : inMonth ? "text-foreground" : "text-muted-foreground/50",
                            )}>
                              {format(day, "d")}
                            </span>
                            {crewsPerDay != null && dayCounts[ci] > 0 && (
                              <span className={cn("rounded px-1 text-[10px] font-semibold tabular-nums", over ? "bg-red-100 text-red-600" : "text-muted-foreground")}>
                                {dayCounts[ci]}/{crewsPerDay}
                              </span>
                            )}
                          </div>
                          {overflowByCol[ci] > 0 && (
                            <button
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); setDayList(dayStr); }}
                              className="absolute inset-x-1 text-left text-[10px] font-medium text-[#711419] hover:underline"
                              style={{ top: HEADER_H + laneCount * (BAR_H + LANE_GAP) }}
                              data-testid={`more-${dayStr}`}
                            >
                              +{overflowByCol[ci]} more
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Continuous spanning bars */}
                  <div className="pointer-events-none absolute inset-x-0" style={{ top: HEADER_H }}>
                    {visible.map((it) => {
                      const b = it.block;
                      const activeIt = interact && interact.blockId === b.id;
                      return (
                        <div
                          key={`${b.id}-${wi}`}
                          className="absolute"
                          style={{ left: `${(it.colStart / 7) * 100}%`, width: `${((it.colEnd - it.colStart + 1) / 7) * 100}%`, top: it.lane * (BAR_H + LANE_GAP), height: BAR_H }}
                        >
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation(); e.preventDefault();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const colW = rect.width / (it.colEnd - it.colStart + 1);
                              const grabCol = Math.min(it.colEnd, it.colStart + Math.max(0, Math.floor((e.clientX - rect.left) / colW)));
                              const grabDay = iso(weekDays[grabCol]);
                              setInteract({ mode: "move", blockId: b.id, grabDay, origStart: b.startDate, origEnd: b.endDate, hover: grabDay });
                            }}
                            className={cn(
                              "group absolute inset-y-0 flex items-center overflow-hidden text-[11px] font-medium",
                              barClass(b),
                              it.realStart ? "rounded-l-md" : "rounded-l-none",
                              it.realEnd ? "rounded-r-md" : "rounded-r-none",
                              dragging ? "pointer-events-none" : "pointer-events-auto cursor-grab active:cursor-grabbing",
                              activeIt && "opacity-70 ring-2 ring-[#711419]",
                            )}
                            style={{ left: it.realStart ? 2 : 0, right: it.realEnd ? 2 : 0, paddingLeft: it.realStart ? 8 : 4, paddingRight: it.realEnd ? 8 : 4 }}
                            title={`${b.title}${b.customerName ? ` · ${b.customerName}` : ""} — drag to move, drag edge to resize`}
                            data-testid={`block-${b.id}`}
                          >
                            {it.realStart && (
                              <span
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setInteract({ mode: "resize-start", blockId: b.id, grabDay: iso(weekDays[it.colStart]), origStart: b.startDate, origEnd: b.endDate, hover: b.startDate }); }}
                                className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-black/10 opacity-0 group-hover:opacity-100"
                              />
                            )}
                            <span className="truncate">{b.title}</span>
                            {it.realEnd && (
                              <span
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setInteract({ mode: "resize-end", blockId: b.id, grabDay: iso(weekDays[it.colEnd]), origStart: b.startDate, origEnd: b.endDate, hover: b.endDate }); }}
                                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-black/10 opacity-0 group-hover:opacity-100"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {form.id ? "Edit tentative install" : "New tentative install"}
              {form.status === "sold" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Sold</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Install name</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Johnson — Furnace + AC" data-testid="input-block-title" />
            </div>
            <div>
              <Label className="text-xs">Dates</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="mt-1 w-full justify-start font-normal" data-testid="button-block-dates">
                    <CalendarRange className="mr-2 h-4 w-4 text-muted-foreground" />
                    {rangeLabel(form.startDate, form.endDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="z-[60] w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    numberOfMonths={1}
                    defaultMonth={form.startDate ? parseISO(form.startDate) : new Date()}
                    selected={{ from: parseISO(form.startDate), to: parseISO(form.endDate) }}
                    onSelect={(r: any) => {
                      if (r?.from) {
                        setForm((f) => ({ ...f, startDate: iso(r.from), endDate: iso(r.to ?? r.from) }));
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs">Customer (optional)</Label>
              {form.customerId ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className="truncate">{form.customerName || "Selected customer"}</span>
                  <button className="text-xs text-[#711419]" onClick={() => setForm((f) => ({ ...f, customerId: "", customerName: "" }))}>Change</button>
                </div>
              ) : (
                <>
                  <Input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customers…" />
                  {custData?.customers && custData.customers.length > 0 && (
                    <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border">
                      {custData.customers.map((c) => (
                        <button key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setForm((f) => ({ ...f, customerId: c.id, customerName: c.name })); setCustSearch(""); }}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Est. value ($)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={form.estimatedValue} onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value.replace(/[^0-9.]/g, "") }))} placeholder="0" className="pl-7" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Confidence</Label>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {(["high", "medium", "low"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, confidence: f.confidence === c ? "" : c }))}
                      className={cn("rounded-md border px-1 py-1 text-[11px] font-medium capitalize", form.confidence === c ? "border-[#711419] bg-[#711419]/10 text-[#711419]" : "border-slate-200 text-slate-600 hover:border-slate-300")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Scope, access notes, etc." />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              {form.id && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => remove.mutate()} disabled={remove.isPending} data-testid="button-delete-block">
                  <Trash2 className="mr-1.5 h-4 w-4" /> Remove
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}><X className="mr-1.5 h-4 w-4" /> Close</Button>
              {form.id && form.status !== "sold" && (
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => sell.mutate()} disabled={sell.isPending} data-testid="button-sell-block">
                  {sell.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />} Mark sold
                </Button>
              )}
              <Button className="bg-[#711419] hover:bg-[#5a1014]" onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()} data-testid="button-save-block">
                {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "See all" — every hold on a crowded day */}
      <Dialog open={!!dayList} onOpenChange={(o) => !o && setDayList(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dayList ? format(parseISO(dayList), "EEEE, MMM d, yyyy") : ""}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {dayListBlocks.map((b) => (
              <button
                key={b.id}
                onClick={() => { setDayList(null); openEdit(b); }}
                className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm", barClass(b))}
                data-testid={`daylist-${b.id}`}
              >
                <span className="flex-1 truncate font-medium">{b.title}</span>
                {b.customerName && <span className="truncate text-xs opacity-80">{b.customerName}</span>}
                {b.status === "sold" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
            {dayListBlocks.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
