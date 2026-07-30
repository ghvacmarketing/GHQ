import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, DollarSign, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { CrmUser } from "@shared/schema";

/** Settings → Usage & Costs: everything that costs money, one page.
 *  - AI (self-metered): every Gibbs token + Whisper minute, priced locally
 *  - Provider snapshots: Anthropic official cost, Render plan, Neon storage
 *  - Manual flat costs: services with no usage API (Textline, etc.)
 *  cost_micro = millionths of a dollar. */

type AiRow = { provider: string; source: string; day: string; cost_micro: string; input_tokens: string; output_tokens: string; audio_seconds: number; calls: number };
type SnapRow = { provider: string; day: string; metric: string; value: number | null; cost_micro: string };
type ManualRow = { id: string; label: string; monthly_cost_cents: number; notes: string | null };

const usd = (micro: number) => `$${(micro / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CrmSettingsCosts() {
  usePageTitle("Usage & Costs");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data, isLoading, refetch } = useQuery<{ ai: AiRow[]; snapshots: SnapRow[]; manual: ManualRow[] }>({
    queryKey: ["/api/crm/costs/summary"],
    enabled: !!currentUser,
  });

  const [newLabel, setNewLabel] = useState("");
  const [newMonthly, setNewMonthly] = useState("");
  const addManual = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/crm/costs/manual", { label: newLabel.trim(), monthlyCostCents: Math.round(parseFloat(newMonthly) * 100) }),
    onSuccess: () => {
      setNewLabel(""); setNewMonthly("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/costs/summary"] });
      toast({ title: "Cost added" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't add the cost", variant: "destructive" }),
  });
  const removeManual = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/costs/manual/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crm/costs/summary"] }),
  });
  const refreshSnapshots = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/crm/costs/refresh", {}),
    onSuccess: () => { refetch(); toast({ title: "Provider snapshots refreshed" }); },
    onError: (e: any) => toast({ title: e?.message || "Refresh failed", variant: "destructive" }),
  });

  // ── Aggregations ──
  const monthStart = useMemo(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }, []);
  const agg = useMemo(() => {
    const ai = data?.ai || [];
    const snaps = data?.snapshots || [];
    const mtd = (rows: Array<{ day: string; cost_micro: string }>) =>
      rows.filter((r) => r.day >= monthStart).reduce((s, r) => s + Number(r.cost_micro), 0);
    const gibbsRows = ai.filter((r) => r.provider === "anthropic");
    const voiceRows = ai.filter((r) => r.provider === "openai");
    const officialAnthropic = snaps.filter((s) => s.provider === "anthropic");
    const renderRows = snaps.filter((s) => s.provider === "render");
    const neonRows = snaps.filter((s) => s.provider === "neon");
    // Daily series for the 30-day bars (all AI self-metered spend)
    const byDay = new Map<string, number>();
    for (const r of ai) byDay.set(r.day, (byDay.get(r.day) || 0) + Number(r.cost_micro));
    const days: Array<{ day: string; micro: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      days.push({ day: d, micro: byDay.get(d) || 0 });
    }
    const manualMonthlyCents = (data?.manual || []).reduce((s, m) => s + m.monthly_cost_cents, 0);
    const renderLatest = renderRows[renderRows.length - 1];
    const neonToday = neonRows.filter((r) => r.day === renderLatest?.day || true).reduce((s, r) => (r.day === neonRows[neonRows.length - 1]?.day ? s + (r.value || 0) : s), 0);
    return {
      gibbsMtd: mtd(gibbsRows),
      voiceMtd: mtd(voiceRows),
      officialMtd: mtd(officialAnthropic),
      renderMonthly: renderLatest ? Number(renderLatest.value || 0) * 1_000_000 : 0,
      renderPlan: renderLatest?.metric?.replace("plan:", "") || null,
      neonGb: neonToday,
      neonMtd: mtd(neonRows),
      days,
      maxDay: Math.max(1, ...days.map((d) => d.micro)),
      gibbsCalls: gibbsRows.filter((r) => r.day >= monthStart).reduce((s, r) => s + r.calls, 0),
      voiceMinutes: voiceRows.filter((r) => r.day >= monthStart).reduce((s, r) => s + r.audio_seconds, 0) / 60,
      manualMonthlyCents,
      totalMtd: mtd(gibbsRows) + mtd(voiceRows) + mtd(renderRows) + mtd(neonRows) + manualMonthlyCents * 10_000,
    };
  }, [data, monthStart]);

  if (!currentUser) return null;
  if (!["owner", "admin"].includes(currentUser.role)) {
    return <CrmLayout currentUser={currentUser}><p className="py-20 text-center text-sm text-slate-500">Owner or admin access required.</p></CrmLayout>;
  }

  const card = "rounded-[4px] border border-slate-300/70 bg-white p-4";

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate("/crm/settings")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-slate-300/70 text-slate-500 transition-colors hover:border-[#711419] hover:text-[#711419]"
              aria-label="Back to settings"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Usage &amp; Costs</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Everything that costs money — AI, hosting, database, and flat subscriptions.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refreshSnapshots.mutate()} disabled={refreshSnapshots.isPending} data-testid="costs-refresh">
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshSnapshots.isPending ? "animate-spin" : ""}`} /> Refresh providers
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-[4px]" />)}</div>
        ) : (
          <>
            {/* Month-to-date total */}
            <div className={`${card} flex items-center justify-between`} data-testid="costs-total">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Estimated month-to-date</p>
                <p className="mt-1 font-display text-3xl font-semibold text-[#711419] tabular-nums">{usd(agg.totalMtd)}</p>
                <p className="mt-0.5 text-xs text-slate-500">Metered usage + provider snapshots + flat subscriptions</p>
              </div>
              <DollarSign className="h-10 w-10 text-[#711419]/20" />
            </div>

            {/* Provider cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className={card} data-testid="costs-gibbs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Gibbs (Anthropic) — metered</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(agg.gibbsMtd)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{agg.gibbsCalls.toLocaleString()} API calls this month</p>
                {agg.officialMtd > 0 && <p className="mt-1 text-xs text-slate-500">Official Anthropic bill MTD: <span className="font-semibold">{usd(agg.officialMtd)}</span></p>}
              </div>
              <div className={card} data-testid="costs-voice">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Voice (Whisper) — metered</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(agg.voiceMtd)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{agg.voiceMinutes.toFixed(1)} minutes transcribed this month</p>
              </div>
              <div className={card} data-testid="costs-render">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Render hosting</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{agg.renderMonthly ? `${usd(agg.renderMonthly)}/mo` : "—"}</p>
                <p className="mt-0.5 text-xs text-slate-500">{agg.renderPlan ? `Plan: ${agg.renderPlan}` : "Waiting for first snapshot (RENDER_API_KEY)"}</p>
              </div>
              <div className={card} data-testid="costs-neon">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Neon database</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{agg.neonGb ? `${agg.neonGb.toFixed(2)} GB` : "—"}</p>
                <p className="mt-0.5 text-xs text-slate-500">{agg.neonGb ? `~${usd(agg.neonMtd)} storage MTD` : "Waiting for first snapshot (NEON_API_KEY)"}</p>
              </div>
              {(data?.manual || []).map((m) => (
                <div key={m.id} className={`${card} group relative`} data-testid={`costs-manual-${m.id}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{m.label} — flat</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">${(m.monthly_cost_cents / 100).toFixed(2)}/mo</p>
                  {m.notes && <p className="mt-0.5 text-xs text-slate-500">{m.notes}</p>}
                  <button
                    onClick={() => removeManual.mutate(m.id)}
                    className="absolute right-2 top-2 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* 30-day AI spend bars */}
            <div className={card} data-testid="costs-chart">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">AI spend — last 30 days</p>
              <div className="flex h-28 items-end gap-[3px]">
                {agg.days.map((d) => (
                  <div key={d.day} className="group relative flex-1">
                    <div
                      className="w-full rounded-t-[2px] bg-[#711419]/70 transition-colors group-hover:bg-[#711419]"
                      style={{ height: `${Math.max(2, (d.micro / agg.maxDay) * 100)}%` }}
                    />
                    <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                      {d.day.slice(5)} · {usd(d.micro)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Manual flat costs */}
            <div className={card}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Add a flat monthly cost (Textline, phone lines, anything without an API)</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Service name — e.g. Textline" className="h-9 w-56" data-testid="costs-manual-label" />
                <Input value={newMonthly} onChange={(e) => setNewMonthly(e.target.value)} type="number" min="0" step="0.01" placeholder="$/month" className="h-9 w-32" data-testid="costs-manual-amount" />
                <Button size="sm" className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={!newLabel.trim() || !parseFloat(newMonthly) || addManual.isPending} onClick={() => addManual.mutate()} data-testid="costs-manual-add">
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </CrmLayout>
  );
}
