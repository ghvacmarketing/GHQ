import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Clock, Square, Loader2, AlertCircle, CheckCircle, Briefcase, Plus,
  Car, Warehouse, GraduationCap, Users, Coffee, MoreHorizontal, Wrench,
} from "lucide-react";
import { format, formatDistanceToNow, startOfWeek, endOfWeek, subWeeks, startOfMonth } from "date-fns";
import MobileShell from "./mobile-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** What a block of time was for — mirrors the server whitelist. */
const TIME_CATEGORIES: { key: string; label: string; icon: typeof Clock }[] = [
  { key: "job", label: "Job site", icon: Wrench },
  { key: "drive", label: "Drive", icon: Car },
  { key: "shop", label: "Shop", icon: Warehouse },
  { key: "training", label: "Training", icon: GraduationCap },
  { key: "meeting", label: "Meeting", icon: Users },
  { key: "break", label: "Break", icon: Coffee },
  { key: "other", label: "Other", icon: MoreHorizontal },
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

  const getElapsedTime = () => {
    if (!currentEntry?.entry?.clockInAt) return null;
    return formatDistanceToNow(new Date(currentEntry.entry.clockInAt), { includeSeconds: true });
  };

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-time">
        {/* Clock | Timesheet — same pill switcher as everywhere else */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(["clock", "timesheet"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all ${
                  view === v ? "bg-white text-[#711419] shadow-sm" : "text-slate-500"
                }`}
                data-testid={`time-view-${v}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === "clock" ? (
          <>
            <Card className="rounded-[4px] border-slate-300/70 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#711419]" />
                  Time Clock
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingCurrent ? (
                  <div className="flex justify-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#711419]" />
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className={`text-sm font-medium px-3 py-1 rounded-[3px] inline-flex items-center gap-1.5 ${
                      isClockedIn ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {isClockedIn ? (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Clocked in — {categoryMeta(currentEntry?.entry?.category).label}
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4" />
                          Not Clocked In
                        </>
                      )}
                    </div>

                    {isClockedIn && currentEntry?.entry && (
                      <div className="space-y-1">
                        <p className="text-3xl font-bold text-slate-800" data-testid="elapsed-time">
                          {getElapsedTime()}
                        </p>
                        <p className="text-sm text-slate-500">
                          Started: {format(new Date(currentEntry.entry.clockInAt), "h:mm a")}
                        </p>
                      </div>
                    )}

                    {!isClockedIn && (
                      <p className="text-sm text-slate-500">Pick what you're starting below.</p>
                    )}

                    {isClockedIn && (
                      <Button
                        size="lg"
                        className="w-full h-16 text-lg font-semibold rounded-[4px] bg-red-600 hover:bg-red-700"
                        onClick={() => setShowClockOutDialog(true)}
                        disabled={isLoading}
                        data-testid="button-clock-out"
                      >
                        {isLoading ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <>
                            <Square className="h-6 w-6 mr-2" />
                            Clock Out
                          </>
                        )}
                      </Button>
                    )}

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

            {/* Tap a card to clock straight in to that kind of time */}
            {!loadingCurrent && !isClockedIn && (
              <div className="space-y-2" data-testid="clock-in-cards">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Clock in to</h3>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_CATEGORIES.slice(0, 3).map((c) => {
                    const Icon = c.icon;
                    const starting = clockInMutation.isPending && clockInMutation.variables === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => clockInMutation.mutate(c.key)}
                        disabled={isLoading}
                        className="flex flex-col items-center gap-2 rounded-[4px] border border-slate-300/70 bg-white px-2 py-4 transition-all active:scale-[0.97] disabled:opacity-60"
                        data-testid={`clock-in-${c.key}`}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-[#711419]/20 bg-[#711419]/5 text-[#711419]">
                          {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_CATEGORIES.slice(3).map((c) => {
                    const Icon = c.icon;
                    const starting = clockInMutation.isPending && clockInMutation.variables === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => clockInMutation.mutate(c.key)}
                        disabled={isLoading}
                        className="flex flex-col items-center gap-1.5 rounded-[4px] border border-slate-300/70 bg-white px-1 py-3 transition-all active:scale-[0.97] disabled:opacity-60"
                        data-testid={`clock-in-${c.key}`}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-slate-300/70 bg-slate-100 text-slate-600">
                          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        </span>
                        <span className="text-[11px] font-medium text-slate-600">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <TimesheetView />
        )}
      </div>

      {/* Clock-out dialog */}
      <Dialog open={showClockOutDialog} onOpenChange={(open) => {
        if (!clockOutMutation.isPending) setShowClockOutDialog(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>What did you work on today?</DialogTitle>
            <DialogDescription>
              A summary of your work is required before you can clock out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="work-notes">Work summary</Label>
            <Textarea
              id="work-notes"
              placeholder="e.g. AC tune-up at Smith residence, replaced capacitor; furnace inspection on Main St..."
              value={workNotes}
              onChange={(e) => setWorkNotes(e.target.value)}
              rows={5}
              autoFocus
              data-testid="textarea-work-notes"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowClockOutDialog(false)}
              disabled={clockOutMutation.isPending}
              data-testid="button-cancel-clock-out"
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => clockOutMutation.mutate(workNotes.trim())}
              disabled={clockOutMutation.isPending || !workNotes.trim()}
              data-testid="button-confirm-clock-out"
            >
              {clockOutMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Clock Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  const Icon = c.icon;
                  const active = mCategory === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setMCategory(c.key)}
                      className={`flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-[#711419] bg-[#711419]/[0.06] text-[#711419]"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      data-testid={`manual-category-${c.key}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
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
function TimesheetView() {
  const today = new Date();
  const [preset, setPreset] = useState<"this-week" | "last-week" | "this-month" | "custom">("this-week");
  const [customFrom, setCustomFrom] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(today, "yyyy-MM-dd"));

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

  const days = useMemo(() => {
    const map = new Map<string, { label: string; entries: EntryWithCategory[]; minutes: number }>();
    for (const e of data?.entries ?? []) {
      const key = format(new Date(e.clockInAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, { label: format(new Date(e.clockInAt), "EEEE, MMM d"), entries: [], minutes: 0 });
      const day = map.get(key)!;
      day.entries.push(e);
      day.minutes += e.durationMinutes ?? 0;
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
  }, [data]);

  return (
    <div className="space-y-4" data-testid="timesheet-view">
      {/* Range */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["this-week", "This week"],
          ["last-week", "Last week"],
          ["this-month", "This month"],
          ["custom", "Custom"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`rounded-[3px] border px-3 py-1.5 text-xs font-medium transition-colors ${
              preset === key ? "border-[#711419] bg-[#711419]/[0.06] text-[#711419]" : "border-slate-200 bg-white text-slate-600"
            }`}
            data-testid={`timesheet-range-${key}`}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} data-testid="timesheet-from" />
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} data-testid="timesheet-to" />
        </div>
      )}

      {/* Totals */}
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4" data-testid="timesheet-totals">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#711419]">Total</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{formatDuration(data?.totalMinutes ?? 0)}</p>
        </div>
        {data && Object.keys(data.byCategory).length > 0 && (
          <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2.5">
            {Object.entries(data.byCategory)
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

      {/* Days */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#711419]" />
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
