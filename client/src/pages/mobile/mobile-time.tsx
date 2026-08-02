import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Clock, Square, Loader2, Briefcase, Plus,
  Car, Warehouse, GraduationCap, Users, Coffee, MoreHorizontal, Wrench,
  ListFilter,
} from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { SheetSelect } from "@/components/mobile/sheet-select";
import { DateRangeSheet } from "@/components/mobile/date-range-calendar";
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth } from "date-fns";
import MobileShell from "./mobile-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CrmTimeEntry } from "@shared/schema";
import badgeJob from "@/assets/badge-time-job.png";
import badgeDrive from "@/assets/badge-time-drive.png";
import badgeShop from "@/assets/badge-time-shop.png";
import badgeTraining from "@/assets/badge-time-training.png";
import badgeMeeting from "@/assets/badge-time-meeting.png";
import badgeBreak from "@/assets/badge-time-break.png";
import badgeOther from "@/assets/badge-other.png";

/** What a block of time was for — mirrors the server whitelist. The metallic
 *  badge (`img`) carries the big touch targets; the lucide icon stays for
 *  tiny chip contexts where a photo badge would turn to mud. */
const TIME_CATEGORIES: { key: string; label: string; icon: typeof Clock; img: string }[] = [
  { key: "job", label: "Job site", icon: Wrench, img: badgeJob },
  { key: "drive", label: "Drive", icon: Car, img: badgeDrive },
  { key: "shop", label: "Shop", icon: Warehouse, img: badgeShop },
  { key: "training", label: "Training", icon: GraduationCap, img: badgeTraining },
  { key: "meeting", label: "Meeting", icon: Users, img: badgeMeeting },
  { key: "break", label: "Break", icon: Coffee, img: badgeBreak },
  { key: "other", label: "Other", icon: MoreHorizontal, img: badgeOther },
];
const categoryMeta = (key: string | null | undefined) =>
  TIME_CATEGORIES.find((c) => c.key === (key || "job")) || TIME_CATEGORIES[0];

type EntryWithCategory = CrmTimeEntry & { category?: string | null };

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "--";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export default function MobileTime() {
  const { toast } = useToast();
  const [view, setView] = useState<"clock" | "timesheet">("clock");
  const [showClockOutDialog, setShowClockOutDialog] = useState(false);
  const [workNotes, setWorkNotes] = useState("");

  // Timesheet filters — lifted here so the filter sheet can drive them
  const [filterOpen, setFilterOpen] = useState(false);
  const [tsPreset, setTsPreset] = useState<"this-week" | "last-week" | "this-month" | "custom">("this-week");
  const [tsFrom, setTsFrom] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [tsTo, setTsTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tsCat, setTsCat] = useState<string>("all");
  const [tsDatesOpen, setTsDatesOpen] = useState(false);

  // Manual entry dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [mCategory, setMCategory] = useState("job");
  const [mDate, setMDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [mStart, setMStart] = useState("08:00");
  const [mEnd, setMEnd] = useState("09:00");
  const [mNotes, setMNotes] = useState("");

  const { data: currentEntry, isLoading: loadingCurrent } = useQuery<{ entry: EntryWithCategory | null }>({
    queryKey: ["/api/mobile/time/current"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 30000,
  });

  const invalidateTime = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/mobile/time/current"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mobile/time/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mobile/time/timesheet"] });
  };

  const clockInMutation = useMutation({
    mutationFn: async (category: string) => apiRequest("POST", "/api/mobile/time/clock-in", { category }),
    onSuccess: (_data, category) => {
      invalidateTime();
      toast({ title: "Clocked In", description: `Tracking ${categoryMeta(category).label.toLowerCase()} time.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to clock in", variant: "destructive" });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async (notes: string) => apiRequest("POST", "/api/mobile/time/clock-out", { notes }),
    onSuccess: () => {
      invalidateTime();
      toast({ title: "Clocked Out", description: "Time entry has been saved." });
      setShowClockOutDialog(false);
      setWorkNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to clock out", variant: "destructive" });
    },
  });

  const manualMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/mobile/time/manual", {
        category: mCategory,
        clockInAt: `${mDate}T${mStart}:00`,
        clockOutAt: `${mDate}T${mEnd}:00`,
        notes: mNotes,
      }),
    onSuccess: () => {
      invalidateTime();
      toast({ title: "Time added", description: `${categoryMeta(mCategory).label} time recorded.` });
      setManualOpen(false);
      setMNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add time", variant: "destructive" });
    },
  });

  const isClockedIn = !!currentEntry?.entry;
  const isLoading = loadingCurrent || clockInMutation.isPending || clockOutMutation.isPending;

  // Live ticking clock — the card should read like a real time clock, not a
  // frozen snapshot from whenever the page last rendered.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isClockedIn) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isClockedIn]);
  const getElapsedTime = () => {
    if (!currentEntry?.entry?.clockInAt) return "0:00:00";
    const secs = Math.max(0, Math.floor((nowTick - new Date(currentEntry.entry.clockInAt).getTime()) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Today's finished total for the clock card
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayTotal } = useQuery<{ totalMinutes: number }>({
    queryKey: ["/api/mobile/time/timesheet", "today-total", todayStr],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/time/timesheet?from=${todayStr}&to=${todayStr}`, { credentials: "include" });
      if (!res.ok) return { totalMinutes: 0 };
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  // Quick pauses don't need a work summary — only real work does.
  const NO_SUMMARY_CATEGORIES = ["training", "meeting", "break", "other"];
  const handleClockOut = () => {
    const cat = currentEntry?.entry?.category || "job";
    if (NO_SUMMARY_CATEGORIES.includes(cat)) clockOutMutation.mutate("");
    else setShowClockOutDialog(true);
  };

  const filtersActive = tsCat !== "all" || tsPreset !== "this-week";

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-time">
        {/* Clock | Timesheet switcher — full width */}
        <div className="flex w-full items-center gap-1 rounded-lg bg-slate-200/70 p-1">
          {(["clock", "timesheet"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium capitalize transition-all ${
                view === v ? "bg-white text-[#711419] shadow-sm" : "text-slate-500"
              }`}
              data-testid={`time-view-${v}`}
            >
              {v}
            </button>
          ))}
        </div>

        {view === "clock" ? (
          <>
            <Card className="rounded-[4px] border-slate-300/70 shadow-none">
              <CardContent className="pt-6">
                {loadingCurrent ? (
                  /* Mirrors the loaded card: status line, big timer, totals */
                  <div className="space-y-4 text-center">
                    <div className="mx-auto h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="space-y-1">
                      <div className="mx-auto h-9 w-40 animate-pulse rounded bg-slate-200" />
                      <div className="mx-auto h-4 w-36 animate-pulse rounded bg-slate-100" />
                    </div>
                    <div className="mx-auto h-4 w-44 animate-pulse rounded bg-slate-100" />
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <p className={`text-sm font-medium ${isClockedIn ? "text-green-700" : "text-slate-500"}`} data-testid="clock-status">
                      {isClockedIn
                        ? `Clocked in — ${categoryMeta(currentEntry?.entry?.category).label}`
                        : "Not clocked in"}
                    </p>

                    <div className="space-y-1">
                      <p className="text-4xl font-bold tabular-nums text-slate-900" data-testid="elapsed-time">
                        {getElapsedTime()}
                      </p>
                      <p className="text-sm text-slate-500" data-testid="total-today">
                        Total today: <span className="font-semibold text-slate-700">{formatDuration(todayTotal?.totalMinutes ?? 0)}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => setManualOpen(true)}
                      className="mx-auto flex items-center gap-1.5 text-sm font-medium text-[#711419]"
                      data-testid="button-add-manual-time"
                    >
                      <Plus className="h-4 w-4" /> Add time manually
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* The category cards never leave: while clocked in, the active
                one lights up and the rest lock until you clock out. */}
            {!loadingCurrent && (
              <div className="space-y-2" data-testid="clock-in-cards">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {isClockedIn ? "Clocked in to" : "Clock in to"}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_CATEGORIES.slice(0, 3).map((c) => {
                    const starting = clockInMutation.isPending && clockInMutation.variables === c.key;
                    const active = isClockedIn && (currentEntry?.entry?.category || "job") === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => {
                          if (isLoading) return;
                          if (isClockedIn) {
                            if (!active) {
                              toast({ title: "You're already clocked in", description: `Clock out of ${categoryMeta(currentEntry?.entry?.category).label.toLowerCase()} before starting something else.` });
                            }
                            return;
                          }
                          clockInMutation.mutate(c.key);
                        }}
                        className={`flex flex-col items-center gap-2 rounded-[4px] border border-slate-300/70 bg-white px-2 py-4 transition-all active:scale-[0.97] ${
                          isClockedIn && !active ? "opacity-40" : ""
                        }`}
                        data-testid={`clock-in-${c.key}`}
                      >
                        {starting ? (
                          <span className="flex h-11 w-11 items-center justify-center text-[#711419]">
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </span>
                        ) : (
                          <img src={c.img} alt="" className="h-11 w-11 select-none" draggable={false} />
                        )}
                        <span className="text-sm font-semibold text-slate-800">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_CATEGORIES.slice(3).map((c) => {
                    const starting = clockInMutation.isPending && clockInMutation.variables === c.key;
                    const active = isClockedIn && (currentEntry?.entry?.category || "job") === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => {
                          if (isLoading) return;
                          if (isClockedIn) {
                            if (!active) {
                              toast({ title: "You're already clocked in", description: `Clock out of ${categoryMeta(currentEntry?.entry?.category).label.toLowerCase()} before starting something else.` });
                            }
                            return;
                          }
                          clockInMutation.mutate(c.key);
                        }}
                        className={`flex flex-col items-center gap-1.5 rounded-[4px] border border-slate-300/70 bg-white px-1 py-3 transition-all active:scale-[0.97] ${
                          isClockedIn && !active ? "opacity-40" : ""
                        }`}
                        data-testid={`clock-in-${c.key}`}
                      >
                        {starting ? (
                          <span className="flex h-9 w-9 items-center justify-center text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </span>
                        ) : (
                          <img src={c.img} alt="" className="h-9 w-9 select-none" draggable={false} />
                        )}
                        <span className="text-[11px] font-medium text-slate-600">{c.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Clock Out lives below the cards — the one action available
                    while a category is running */}
                {isClockedIn && (
                  <Button
                    size="lg"
                    className="mt-2 h-14 w-full rounded-[4px] bg-red-600 text-lg font-semibold hover:bg-red-700"
                    onClick={handleClockOut}
                    disabled={isLoading}
                    data-testid="button-clock-out"
                  >
                    {isLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Square className="mr-2 h-5 w-5" />
                        Clock Out
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <TimesheetView
            preset={tsPreset}
            customFrom={tsFrom}
            customTo={tsTo}
            catFilter={tsCat}
            filtersActive={filtersActive}
            onOpenFilters={() => setFilterOpen(true)}
          />
        )}
      </div>

      {/* Timesheet filters — dropdown rows; each opens its own option sheet */}
      <DraggableSheet tall open={filterOpen} onOpenChange={setFilterOpen} title="Filter timesheet" testid="sheet-timesheet-filter">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          {filtersActive && (
            <button
              onClick={() => { setTsPreset("this-week"); setTsCat("all"); setTsFrom(""); setTsTo(""); }}
              className="text-sm font-semibold text-[#711419]"
              data-testid="timesheet-filter-clear"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="mt-2 min-h-[45vh] divide-y divide-slate-200/80 pb-2">
          <SheetSelect
            label="Date range"
            value={tsPreset}
            onChange={(k) => {
              setTsPreset(k as typeof tsPreset);
              // Picking "Custom range" goes straight to the calendar
              if (k === "custom") setTsDatesOpen(true);
            }}
            options={[
              { key: "this-week", label: "This week" },
              { key: "last-week", label: "Last week" },
              { key: "this-month", label: "This month" },
              { key: "custom", label: "Custom range" },
            ]}
            testid="timesheet-range"
          />
          {tsPreset === "custom" && (
            <DateRangeSheet
              label="Dates"
              from={tsFrom}
              to={tsTo}
              onChange={(f, t) => { setTsFrom(f); setTsTo(t); }}
              open={tsDatesOpen}
              onOpenChange={setTsDatesOpen}
              testid="timesheet-filter-calendar"
            />
          )}
          <SheetSelect
            label="Category"
            value={tsCat}
            onChange={setTsCat}
            options={[
              { key: "all", label: "All" },
              ...TIME_CATEGORIES.map((c) => ({ key: c.key, label: c.label, img: c.img })),
            ]}
            testid="timesheet-cat"
          />
        </div>
      </DraggableSheet>

      {/* Clock-out dialog */}
      {/* Clock-out summary — bottom sheet */}
      <DraggableSheet
        open={showClockOutDialog}
        onOpenChange={(open) => { if (!clockOutMutation.isPending) setShowClockOutDialog(open); }}
        title="What did you work on today?"
        testid="sheet-clock-out"
      >
        <h2 className="text-lg font-semibold text-slate-900">What did you work on today?</h2>
        <p className="mt-0.5 text-sm text-slate-500">A quick summary is required before you clock out.</p>
        <div className="mt-4 space-y-3 pb-2">
          <Textarea
            id="work-notes"
            placeholder="e.g. AC tune-up at Smith residence, replaced capacitor; furnace inspection on Main St..."
            value={workNotes}
            onChange={(e) => setWorkNotes(e.target.value)}
            rows={4}
            data-testid="textarea-work-notes"
          />
          <Button
            className="h-12 w-full rounded-[4px] bg-red-600 text-base font-semibold hover:bg-red-700"
            onClick={() => clockOutMutation.mutate(workNotes.trim())}
            disabled={clockOutMutation.isPending || !workNotes.trim()}
            data-testid="button-confirm-clock-out"
          >
            {clockOutMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Square className="mr-2 h-4 w-4" />
            )}
            Clock Out
          </Button>
        </div>
      </DraggableSheet>

      {/* Manual time dialog */}
      <Dialog open={manualOpen} onOpenChange={(open) => {
        if (!manualMutation.isPending) setManualOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add time manually</DialogTitle>
            <DialogDescription>Record a block of time that wasn't captured with the clock.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">What was it for?</Label>
              <div className="flex flex-wrap gap-1.5">
                {TIME_CATEGORIES.map((c) => {
                  const active = mCategory === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setMCategory(c.key)}
                      className={`flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-[#711419] bg-[#711419]/[0.06] text-[#711419]"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      data-testid={`manual-category-${c.key}`}
                    >
                      <img src={c.img} alt="" className="h-5 w-5 select-none" draggable={false} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="manual-date" className="mb-1.5 block">Date</Label>
              <Input id="manual-date" type="date" value={mDate} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setMDate(e.target.value)} data-testid="manual-date" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="manual-start" className="mb-1.5 block">Start</Label>
                <Input id="manual-start" type="time" value={mStart} onChange={(e) => setMStart(e.target.value)} data-testid="manual-start" />
              </div>
              <div>
                <Label htmlFor="manual-end" className="mb-1.5 block">End</Label>
                <Input id="manual-end" type="time" value={mEnd} onChange={(e) => setMEnd(e.target.value)} data-testid="manual-end" />
              </div>
            </div>
            <div>
              <Label htmlFor="manual-notes" className="mb-1.5 block">Notes (optional)</Label>
              <Textarea id="manual-notes" rows={2} value={mNotes} onChange={(e) => setMNotes(e.target.value)} placeholder="e.g. Supply run to Ferguson" data-testid="manual-notes" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setManualOpen(false)} disabled={manualMutation.isPending}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              onClick={() => manualMutation.mutate()}
              disabled={manualMutation.isPending || !mDate || !mStart || !mEnd}
              data-testid="button-save-manual-time"
            >
              {manualMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileShell>
  );
}

function TimeEntryRow({ entry }: { entry: EntryWithCategory }) {
  const meta = categoryMeta(entry.category);
  const Icon = meta.icon;
  return (
    <div
      className="flex items-center justify-between rounded-[4px] border border-slate-200 bg-white p-3"
      data-testid={`time-entry-${entry.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
          {entry.workOrderId && (
            <span className="flex items-center gap-1 rounded-[3px] bg-[#711419]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#711419]">
              <Briefcase className="h-3 w-3" /> Job
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {format(new Date(entry.clockInAt), "EEE, MMM d")}
          <span className="ml-1.5 font-normal text-slate-500">
            {format(new Date(entry.clockInAt), "h:mm a")}
            {entry.clockOutAt && <> – {format(new Date(entry.clockOutAt), "h:mm a")}</>}
          </span>
        </p>
        {entry.notes && <p className="mt-0.5 truncate text-xs text-slate-500">{entry.notes}</p>}
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${entry.clockOutAt ? "text-slate-900" : "text-green-600"}`}>
        {entry.clockOutAt ? formatDuration(entry.durationMinutes) : "Active"}
      </span>
    </div>
  );
}

/** The timesheet: pick a range, see every entry with its label, grouped by
 *  day with per-day and per-category totals. */
function TimesheetView({
  preset, customFrom, customTo, catFilter, filtersActive, onOpenFilters,
}: {
  preset: "this-week" | "last-week" | "this-month" | "custom";
  customFrom: string;
  customTo: string;
  catFilter: string;
  filtersActive: boolean;
  onOpenFilters: () => void;
}) {
  const today = new Date();

  const range = useMemo(() => {
    if (preset === "this-week") {
      return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
    }
    if (preset === "last-week") {
      const lw = subWeeks(today, 1);
      return {
        from: format(startOfWeek(lw, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        to: format(endOfWeek(lw, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    }
    if (preset === "this-month") {
      return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
    }
    return { from: customFrom, to: customTo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo]);

  const { data, isLoading } = useQuery<{ entries: EntryWithCategory[]; totalMinutes: number; byCategory: Record<string, number> }>({
    queryKey: ["/api/mobile/time/timesheet", range.from, range.to],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/time/timesheet?from=${range.from}&to=${range.to}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load timesheet");
      return res.json();
    },
  });

  // Category filter applies client-side; totals recompute from what's shown
  const shownEntries = useMemo(
    () => (data?.entries ?? []).filter((e) => catFilter === "all" || (e.category || "job") === catFilter),
    [data, catFilter],
  );
  const totals = useMemo(() => {
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const e of shownEntries) {
      const mins = e.durationMinutes ?? 0;
      total += mins;
      const cat = e.category || "job";
      byCategory[cat] = (byCategory[cat] || 0) + mins;
    }
    return { total, byCategory };
  }, [shownEntries]);

  const days = useMemo(() => {
    const map = new Map<string, { label: string; entries: EntryWithCategory[]; minutes: number }>();
    for (const e of shownEntries) {
      const key = format(new Date(e.clockInAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, { label: format(new Date(e.clockInAt), "EEEE, MMM d"), entries: [], minutes: 0 });
      const day = map.get(key)!;
      day.entries.push(e);
      day.minutes += e.durationMinutes ?? 0;
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
  }, [shownEntries]);

  return (
    <div className="space-y-4" data-testid="timesheet-view">
      {/* Filters pill left, read-back caption right — same as job history */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onOpenFilters}
          className="relative flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
          aria-label="Filter timesheet"
          data-testid="timesheet-filter-open"
        >
          <ListFilter className="h-4 w-4" />
          Filters
          {filtersActive && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#711419]" />}
        </button>
        <p className="text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
          {{ "this-week": "This week", "last-week": "Last week", "this-month": "This month", custom: `${customFrom} → ${customTo}` }[preset]}
          {catFilter !== "all" && ` · ${categoryMeta(catFilter).label}`}
        </p>
      </div>

      {/* Totals */}
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4" data-testid="timesheet-totals">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#711419]">Total</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{formatDuration(totals.total)}</p>
        </div>
        {Object.keys(totals.byCategory).length > 0 && (
          <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2.5">
            {Object.entries(totals.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, mins]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{categoryMeta(cat).label}</span>
                  <span className="font-medium tabular-nums text-slate-900">{formatDuration(mins)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Days — skeleton mirrors a day group: header row + entry rows */}
      {isLoading ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-12 animate-pulse rounded bg-slate-200" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-[4px] border border-slate-200 bg-white p-3">
              <div className="space-y-2">
                <div className="h-3.5 w-20 animate-pulse rounded bg-slate-200" />
                <div className="h-3.5 w-40 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-4 w-12 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-400">
          No time recorded in this range.
        </div>
      ) : (
        days.map((day) => (
          <div key={day.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{day.label}</h3>
              <span className="text-xs font-semibold tabular-nums text-slate-600">{formatDuration(day.minutes)}</span>
            </div>
            {day.entries.map((entry) => (
              <TimeEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
