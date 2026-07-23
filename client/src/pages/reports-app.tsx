import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, startOfYear } from "date-fns";
import {
  BarChart3, Briefcase, Landmark, TrendingUp, Receipt, Users2, HardHat, Route,
  UserRound, Boxes, Wrench, Megaphone, Truck, ShieldCheck, Sparkles, Hammer,
  Printer, Download, Save, Play, Trash2, Pin, PinOff, Share2, Plus, X, Loader2,
} from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { useSmoothLoading } from "@/hooks/use-smooth-loading";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopBar } from "@/components/app-topbar";
import { AppLoader } from "@/components/app-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { CrmUser } from "@shared/schema";

// ── Types (mirror server/reporting) ─────────────────────────────────────────
type FieldMeta = { key: string; label: string; type: string; groupable: boolean; agg: string | null };
type SourceMeta = { key: string; label: string; description: string; defaultDateField: string; fields: FieldMeta[] };
type CatalogReport = { key: string; title: string; description: string; spec?: ReportSpec; comingSoon?: boolean };
type CatalogCategory = { key: string; label: string; reports: CatalogReport[] };
type ReportSpec = {
  source: string;
  columns?: string[];
  filters?: { field: string; op: string; value: string | number }[];
  groupBy?: string[];
  timeBucket?: "day" | "week" | "month";
  measures?: { field: string; fn: string; label?: string }[];
  sort?: { key: string; dir: "asc" | "desc" };
  dateField?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};
type RunResult = { columns: { key: string; label: string; type: string }[]; rows: Record<string, unknown>[]; rowCount: number };
type SavedReport = {
  id: string; name: string; spec: ReportSpec; created_by: string | null; createdByName?: string | null;
  shared: boolean; pinned: boolean; schedule_email: string | null; schedule_frequency: string | null;
};

const CATEGORY_ICONS: Record<string, typeof BarChart3> = {
  executive: Briefcase, financial: Landmark, revenue: TrendingUp, "ar-ap": Receipt,
  payroll: Users2, "job-costing": Hammer, dispatch: Route, customer: UserRound,
  inventory: Boxes, equipment: Wrench, marketing: Megaphone, fleet: Truck,
  compliance: ShieldCheck, ai: Sparkles,
};

const PERIODS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-quarter", label: "This quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "last-12", label: "Last 12 months" },
  { key: "all", label: "All time" },
] as const;

function periodRange(period: string): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  const f = (d: Date) => format(d, "yyyy-MM-dd");
  switch (period) {
    case "this-month": return { dateFrom: f(startOfMonth(now)), dateTo: f(now) };
    case "last-month": { const s = startOfMonth(subMonths(now, 1)); return { dateFrom: f(s), dateTo: f(endOfMonth(s)) }; }
    case "this-quarter": return { dateFrom: f(startOfQuarter(now)), dateTo: f(now) };
    case "ytd": return { dateFrom: f(startOfYear(now)), dateTo: f(now) };
    case "last-12": return { dateFrom: f(startOfMonth(subMonths(now, 11))), dateTo: f(now) };
    default: return {};
  }
}

function fmtCell(v: unknown, type: string): string {
  if (v == null) return "—";
  if (type === "currency") {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }) : String(v);
  }
  if (type === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? (n % 1 ? n.toFixed(1) : n.toLocaleString()) : String(v);
  }
  if (type === "date") {
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? String(v) : format(d, "MMM d, yyyy");
  }
  if (type === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function ReportsApp() {
  usePageTitle("Reports");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const loaderHold = useSmoothLoading(authLoading, 0, 600);

  const isAllowed = !!currentUser && ["owner", "admin", "supervisor"].includes(currentUser.role);

  const { data: catalog } = useQuery<{ categories: CatalogCategory[]; sources: SourceMeta[] }>({
    queryKey: ["/api/reporting/catalog"],
    enabled: isAllowed,
    staleTime: 5 * 60 * 1000,
  });
  const { data: saved = [] } = useQuery<SavedReport[]>({
    queryKey: ["/api/reporting/saved"],
    enabled: isAllowed,
  });

  const [nav, setNav] = useState<string>("executive"); // category key | "builder" | "saved"
  const [active, setActive] = useState<{ title: string; description?: string; spec: ReportSpec; savedId?: string } | null>(null);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("last-12");

  // ── Runner (shared by catalog reports, saved reports, and the builder) ──
  const runSpec = useMemo(() => {
    if (!active) return null;
    return { ...active.spec, ...periodRange(period) };
  }, [active, period]);

  const { data: result, isFetching: running, error: runError } = useQuery<RunResult>({
    queryKey: ["/api/reporting/run", runSpec],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/reporting/run", runSpec);
      return res.json();
    },
    enabled: !!runSpec && isAllowed,
  });

  const exportCsv = async () => {
    if (!runSpec || !active) return;
    const res = await fetch("/api/reporting/export.csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ spec: runSpec, filename: active.title }),
    });
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${active.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(href);
  };

  // ── Save dialog ──
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveShared, setSaveShared] = useState(true);
  const [savePinned, setSavePinned] = useState(false);
  const [saveEmail, setSaveEmail] = useState("");
  const [saveFreq, setSaveFreq] = useState("none");
  const saveMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/reporting/saved", {
        name: saveName,
        spec: runSpec,
        shared: saveShared,
        pinned: savePinned,
        scheduleEmail: saveFreq !== "none" ? saveEmail : null,
        scheduleFrequency: saveFreq !== "none" ? saveFreq : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reporting/saved"] });
      setSaveOpen(false);
      toast({ title: "Report saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });
  const patchSaved = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest("PATCH", `/api/reporting/saved/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/reporting/saved"] }),
  });
  const deleteSaved = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/reporting/saved/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/reporting/saved"] }),
  });

  // ── Custom builder state ──
  const [bSource, setBSource] = useState("invoices");
  const [bMode, setBMode] = useState<"detail" | "summary">("summary");
  const [bColumns, setBColumns] = useState<string[]>([]);
  const [bGroupBy, setBGroupBy] = useState<string>("");
  const [bBucket, setBBucket] = useState<"month" | "week" | "day">("month");
  const [bMeasureField, setBMeasureField] = useState<string>("");
  const [bMeasureFn, setBMeasureFn] = useState<string>("sum");
  const [bFilters, setBFilters] = useState<{ field: string; op: string; value: string }[]>([]);
  const srcMeta = catalog?.sources.find((s) => s.key === bSource);

  const buildSpec = (): ReportSpec | null => {
    if (!srcMeta) return null;
    if (bMode === "detail") {
      return { source: bSource, columns: bColumns.length ? bColumns : undefined, filters: bFilters.filter((f) => f.value !== "") };
    }
    if (!bGroupBy) return null;
    const groupField = srcMeta.fields.find((f) => f.key === bGroupBy);
    const measures = bMeasureField
      ? [{ field: bMeasureField, fn: bMeasureFn }]
      : [{ field: bGroupBy, fn: "count", label: "Count" }];
    return {
      source: bSource,
      groupBy: [bGroupBy],
      timeBucket: groupField?.type === "date" ? bBucket : undefined,
      measures,
      filters: bFilters.filter((f) => f.value !== ""),
    };
  };

  if (loaderHold || !currentUser) return <AppLoader />;
  if (!isAllowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f7] p-6 text-center">
        <BarChart3 className="mb-3 h-10 w-10 text-slate-300" />
        <p className="font-medium text-slate-700">Reports are limited to admins.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Back to apps</Button>
      </div>
    );
  }

  const categories = catalog?.categories ?? [];
  const activeCategory = categories.find((c) => c.key === nav);
  const numericFields = srcMeta?.fields.filter((f) => f.type === "currency" || f.type === "number") ?? [];

  const groupedChart = result && (active?.spec.groupBy?.length ?? 0) > 0 && result.columns.length >= 2;

  return (
    <div className="flex h-screen bg-[#f5f5f7]">
      <AppSidebar
        appKey="reports"
        header={{ title: "Reports", subtitle: "Command Center", onHome: () => navigate("/") }}
        activeKey={nav}
        onSelect={(k) => { setNav(k); setActive(null); }}
        groups={[
          {
            label: "Browse",
            items: categories.map((c) => ({ key: c.key, label: c.label, icon: CATEGORY_ICONS[c.key] || BarChart3 })),
          },
          {
            label: "Build",
            items: [
              { key: "builder", label: "Custom Builder", icon: Hammer },
              { key: "saved", label: "Saved Reports", icon: Save },
            ],
          },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <AppTopBar currentUser={currentUser} />
        <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto w-full max-w-5xl space-y-4">
            {/* ── Viewer (active report) ── */}
            {active ? (
              <>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <button onClick={() => setActive(null)} className="text-sm font-medium text-slate-500 hover:text-slate-900" data-testid="report-back">
                    ← {nav === "saved" ? "Saved reports" : nav === "builder" ? "Builder" : activeCategory?.label || "Reports"}
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                      <SelectTrigger className="h-9 w-40" data-testid="report-period"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PERIODS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-9" onClick={exportCsv} data-testid="report-export">
                      <Download className="mr-1.5 h-4 w-4" /> CSV
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => window.print()} data-testid="report-print">
                      <Printer className="mr-1.5 h-4 w-4" /> Print
                    </Button>
                    {!active.savedId && (
                      <Button
                        size="sm"
                        className="h-9 bg-[#711419] hover:bg-[#8a1a1f]"
                        onClick={() => { setSaveName(active.title); setSaveOpen(true); }}
                        data-testid="report-save"
                      >
                        <Save className="mr-1.5 h-4 w-4" /> Save
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-[4px] border border-slate-300/70 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Giesbrecht HVAC</p>
                  <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-slate-900">{active.title}</h1>
                  {active.description && <p className="mt-0.5 text-sm text-slate-500">{active.description}</p>}

                  {runError ? (
                    <p className="mt-6 text-sm text-red-600">{(runError as any)?.message || "This report failed to run."}</p>
                  ) : running && !result ? (
                    <div className="mt-5 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 rounded-[4px]" />)}</div>
                  ) : result ? (
                    <>
                      {/* Inline bar chart for grouped results */}
                      {groupedChart && (() => {
                        const labelCol = result.columns[0];
                        const valueCol = result.columns[result.columns.length - 1];
                        const rows = result.rows.slice(0, 12);
                        const max = Math.max(1, ...rows.map((r) => Number(r[valueCol.key]) || 0));
                        return (
                          <div className="mt-5 space-y-1.5" data-testid="report-chart">
                            {rows.map((r, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <span className="w-36 shrink-0 truncate text-xs text-slate-600">{fmtCell(r[labelCol.key], labelCol.type)}</span>
                                <div className="h-3.5 flex-1 rounded-[2px] bg-slate-100">
                                  <div className="h-full rounded-[2px] bg-[#711419]" style={{ width: `${((Number(r[valueCol.key]) || 0) / max) * 100}%` }} />
                                </div>
                                <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-900">
                                  {fmtCell(r[valueCol.key], valueCol.type)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Table */}
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full text-sm" data-testid="report-table">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                              {result.columns.map((c) => (
                                <th key={c.key} className={`py-1.5 pr-3 font-semibold ${c.type === "currency" || c.type === "number" ? "text-right" : ""}`}>
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows.map((r, i) => (
                              <tr key={i} className="border-b border-slate-100 last:border-0">
                                {result.columns.map((c) => (
                                  <td key={c.key} className={`py-1.5 pr-3 ${c.type === "currency" || c.type === "number" ? "text-right tabular-nums font-medium text-slate-900" : "text-slate-700"}`}>
                                    {fmtCell(r[c.key], c.type)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {result.rows.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No data for this period.</p>}
                        <p className="mt-3 text-[11px] text-slate-400">{result.rowCount} row{result.rowCount === 1 ? "" : "s"}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : nav === "builder" ? (
              /* ── Custom Report Builder ── */
              <div className="space-y-4">
                <div>
                  <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Custom Report Builder</h1>
                  <p className="mt-0.5 text-sm text-slate-500">Pick a data source, shape it, run it — no SQL required.</p>
                </div>

                <div className="rounded-[4px] border border-slate-300/70 bg-white p-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-500">Data source</p>
                      <Select value={bSource} onValueChange={(v) => { setBSource(v); setBColumns([]); setBGroupBy(""); setBMeasureField(""); setBFilters([]); }}>
                        <SelectTrigger data-testid="builder-source"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(catalog?.sources ?? []).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {srcMeta && <p className="mt-1 text-[11px] text-slate-400">{srcMeta.description}</p>}
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-500">Report type</p>
                      <Select value={bMode} onValueChange={(v) => setBMode(v as typeof bMode)}>
                        <SelectTrigger data-testid="builder-mode"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="summary">Summary (group & total)</SelectItem>
                          <SelectItem value="detail">Detail (row list)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {bMode === "detail" ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-500">Columns</p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {(srcMeta?.fields ?? []).map((f) => (
                          <label key={f.key} className="flex items-center gap-2 rounded-[4px] border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700">
                            <Checkbox
                              checked={bColumns.includes(f.key)}
                              onCheckedChange={(on) =>
                                setBColumns((prev) => (on ? [...prev, f.key] : prev.filter((k) => k !== f.key)))
                              }
                            />
                            {f.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-500">Group by</p>
                        <Select value={bGroupBy} onValueChange={setBGroupBy}>
                          <SelectTrigger data-testid="builder-groupby"><SelectValue placeholder="Choose a field" /></SelectTrigger>
                          <SelectContent>
                            {(srcMeta?.fields ?? []).filter((f) => f.groupable).map((f) => (
                              <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {srcMeta?.fields.find((f) => f.key === bGroupBy)?.type === "date" && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-slate-500">Bucket</p>
                          <Select value={bBucket} onValueChange={(v) => setBBucket(v as typeof bBucket)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="day">Day</SelectItem>
                              <SelectItem value="week">Week</SelectItem>
                              <SelectItem value="month">Month</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-500">Measure</p>
                        <div className="flex gap-1.5">
                          <Select value={bMeasureFn} onValueChange={setBMeasureFn}>
                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sum">Sum</SelectItem>
                              <SelectItem value="avg">Avg</SelectItem>
                              <SelectItem value="count">Count</SelectItem>
                              <SelectItem value="min">Min</SelectItem>
                              <SelectItem value="max">Max</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={bMeasureField || "__count__"} onValueChange={(v) => setBMeasureField(v === "__count__" ? "" : v)}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder="Rows" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__count__">Rows (count)</SelectItem>
                              {numericFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Filters */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-500">Filters</p>
                      <button
                        onClick={() => setBFilters((p) => [...p, { field: srcMeta?.fields[0]?.key || "", op: "eq", value: "" }])}
                        className="flex items-center gap-1 text-xs font-medium text-[#711419] hover:underline"
                        data-testid="builder-add-filter"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add filter
                      </button>
                    </div>
                    {bFilters.length === 0 ? (
                      <p className="text-[11px] text-slate-400">No filters — the date range on the report page still applies.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {bFilters.map((flt, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <Select value={flt.field} onValueChange={(v) => setBFilters((p) => p.map((x, j) => (j === i ? { ...x, field: v } : x)))}>
                              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(srcMeta?.fields ?? []).map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select value={flt.op} onValueChange={(v) => setBFilters((p) => p.map((x, j) => (j === i ? { ...x, op: v } : x)))}>
                              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="eq">is</SelectItem>
                                <SelectItem value="neq">is not</SelectItem>
                                <SelectItem value="contains">contains</SelectItem>
                                <SelectItem value="gte">≥</SelectItem>
                                <SelectItem value="lte">≤</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              value={flt.value}
                              onChange={(e) => setBFilters((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                              placeholder="Value"
                              className="h-9 flex-1"
                            />
                            <button onClick={() => setBFilters((p) => p.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-red-600">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    className="bg-[#711419] hover:bg-[#8a1a1f]"
                    disabled={bMode === "summary" && !bGroupBy}
                    onClick={() => {
                      const spec = buildSpec();
                      if (spec) setActive({ title: "Custom report", description: `${srcMeta?.label} — built just now`, spec });
                    }}
                    data-testid="builder-run"
                  >
                    <Play className="mr-1.5 h-4 w-4" /> Run report
                  </Button>
                </div>
              </div>
            ) : nav === "saved" ? (
              /* ── Saved reports ── */
              <div className="space-y-4">
                <div>
                  <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Saved Reports</h1>
                  <p className="mt-0.5 text-sm text-slate-500">Yours and everything shared across the company.</p>
                </div>
                {saved.length === 0 ? (
                  <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-16 text-center">
                    <Save className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm text-slate-500">Nothing saved yet — run any report and hit Save.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                    {saved.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-slate-50" data-testid={`saved-${r.id}`}>
                        <button
                          onClick={() => setActive({ title: r.name, spec: r.spec, savedId: r.id })}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {r.spec.source}
                            {r.createdByName ? ` · ${r.createdByName}` : ""}
                            {r.shared ? " · shared" : " · private"}
                            {r.schedule_frequency ? ` · emails ${r.schedule_frequency}` : ""}
                          </p>
                        </button>
                        <button onClick={() => patchSaved.mutate({ id: r.id, pinned: !r.pinned })} className="p-1.5 text-slate-400 hover:text-slate-900" title={r.pinned ? "Unpin" : "Pin to top"}>
                          {r.pinned ? <Pin className="h-4 w-4 text-[#711419]" /> : <PinOff className="h-4 w-4" />}
                        </button>
                        <button onClick={() => patchSaved.mutate({ id: r.id, shared: !r.shared })} className="p-1.5 text-slate-400 hover:text-slate-900" title={r.shared ? "Make private" : "Share with the org"}>
                          <Share2 className={`h-4 w-4 ${r.shared ? "text-[#711419]" : ""}`} />
                        </button>
                        <button onClick={() => deleteSaved.mutate(r.id)} className="p-1.5 text-slate-400 hover:text-red-600" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ── Category report list ── */
              <div className="space-y-4">
                <div>
                  <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">{activeCategory?.label || "Reports"}</h1>
                  <p className="mt-0.5 text-sm text-slate-500">Prebuilt reports — every one runs on the same engine as the custom builder.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(activeCategory?.reports ?? []).map((r) => (
                    <button
                      key={r.key}
                      disabled={r.comingSoon}
                      onClick={() => r.spec && setActive({ title: r.title, description: r.description, spec: r.spec })}
                      className={`flex flex-col rounded-[4px] border bg-white p-4 text-left transition-colors ${
                        r.comingSoon ? "cursor-default border-slate-200 opacity-60" : "border-slate-300/70 hover:border-slate-900"
                      }`}
                      data-testid={`report-${r.key}`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>
                      {r.comingSoon && (
                        <span className="mt-2 w-fit rounded-[3px] border border-slate-300/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Needs data source
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Save report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Report name" data-testid="save-name" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox checked={saveShared} onCheckedChange={(v) => setSaveShared(!!v)} /> Share with the whole organization
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox checked={savePinned} onCheckedChange={(v) => setSavePinned(!!v)} /> Pin to the top of Saved Reports
            </label>
            <div className="rounded-[4px] border border-slate-200 p-3">
              <p className="mb-2 text-xs font-medium text-slate-500">Email schedule</p>
              <div className="flex gap-2">
                <Select value={saveFreq} onValueChange={setSaveFreq}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Off</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={saveEmail}
                  onChange={(e) => setSaveEmail(e.target.value)}
                  placeholder="recipient@email.com"
                  disabled={saveFreq === "none"}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={!saveName.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              data-testid="save-confirm"
            >
              {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
