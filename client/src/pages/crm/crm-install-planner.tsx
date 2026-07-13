import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  startOfMonth, startOfWeek,
} from "date-fns";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const STATUS_CHIP: Record<Block["status"], string> = {
  tentative: "border border-dashed border-amber-400 bg-amber-100 text-amber-800",
  sold: "bg-emerald-600 text-white border border-emerald-600",
  lost: "bg-slate-100 text-slate-400 line-through border border-slate-200",
};

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

  // Blocks active on a given day (inclusive range).
  const blocksOn = (dayStr: string) =>
    blocks.filter((b) => b.status !== "lost" && b.startDate <= dayStr && b.endDate >= dayStr);

  // ── Dialog / form ──
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(iso(new Date()), iso(new Date())));
  const [custSearch, setCustSearch] = useState("");

  const openCreate = (dayStr: string) => {
    setForm(emptyForm(dayStr, dayStr));
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
              <p className="text-sm text-muted-foreground">Pencil in tentative installs before they're sold.</p>
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
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-dashed border-amber-400 bg-amber-100" /> Tentative</span>
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
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayStr = iso(day);
              const inMonth = isSameMonth(day, month);
              const dayBlocks = blocksOn(dayStr);
              const over = crewsPerDay != null && dayBlocks.length > crewsPerDay;
              return (
                <div
                  key={dayStr}
                  className={cn(
                    "min-h-[104px] border-b border-r border-border p-1.5 last:border-r-0 transition-colors hover:bg-muted/30",
                    !inMonth && "bg-muted/20",
                  )}
                  onClick={() => openCreate(dayStr)}
                  data-testid={`day-${dayStr}`}
                >
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday(day) ? "bg-[#711419] text-white" : inMonth ? "text-foreground" : "text-muted-foreground/50",
                    )}>
                      {format(day, "d")}
                    </span>
                    {crewsPerDay != null && dayBlocks.length > 0 && (
                      <span className={cn("rounded px-1 text-[10px] font-semibold tabular-nums", over ? "bg-red-100 text-red-600" : "text-muted-foreground")}>
                        {dayBlocks.length}/{crewsPerDay}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayBlocks.slice(0, 4).map((b) => (
                      <button
                        key={b.id}
                        onClick={(e) => { e.stopPropagation(); openEdit(b); }}
                        className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium", STATUS_CHIP[b.status])}
                        title={`${b.title}${b.customerName ? ` · ${b.customerName}` : ""}`}
                        data-testid={`block-${b.id}`}
                      >
                        {b.title}
                      </button>
                    ))}
                    {dayBlocks.length > 4 && (
                      <span className="px-1 text-[10px] text-muted-foreground">+{dayBlocks.length - 4} more</span>
                    )}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))} data-testid="input-block-start" />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} data-testid="input-block-end" />
              </div>
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
    </CrmLayout>
  );
}
