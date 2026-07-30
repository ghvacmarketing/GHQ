import { db } from "../db";
import { sql } from "drizzle-orm";

/** Nightly provider-usage snapshots for Settings → Usage & Costs.
 *
 *  Each provider pull writes rows into provider_usage_snapshots keyed
 *  (provider, date, metric) with UPSERT, so re-runs refresh instead of
 *  duplicating. Every pull is independent and best-effort — one provider's
 *  bad key must never block the others. cost_micro = millionths of a dollar. */

const RENDER_SERVICE_ID = "srv-d9434q4vikkc73bego5g";

async function saveSnapshot(provider: string, date: string, metric: string, value: number | null, costMicro: number, raw?: unknown) {
  await db.execute(sql`
    INSERT INTO provider_usage_snapshots (provider, snapshot_date, metric, value, cost_micro, raw)
    VALUES (${provider}, ${date}, ${metric}, ${value}, ${Math.round(costMicro)}, ${raw ? JSON.stringify(raw) : null}::jsonb)
    ON CONFLICT (provider, snapshot_date, metric)
    DO UPDATE SET value = EXCLUDED.value, cost_micro = EXCLUDED.cost_micro, raw = EXCLUDED.raw, created_at = now()
  `);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Anthropic official cost report — needs an admin/service-account key. */
async function pullAnthropic(): Promise<void> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return;
  // Last 30 days of daily costs.
  const start = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const res = await fetch(
    `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${start}T00:00:00Z&group_by[]=description&limit=31`,
    { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } },
  );
  if (!res.ok) throw new Error(`Anthropic cost_report HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  for (const bucket of data?.data || []) {
    const date = String(bucket.starting_at || "").slice(0, 10);
    if (!date) continue;
    let totalMicro = 0;
    for (const r of bucket.results || []) totalMicro += parseFloat(r.amount || "0") * 1_000_000; // amounts are USD
    await saveSnapshot("anthropic", date, "official_cost", null, totalMicro, bucket.results);
  }
}

/** Render — the service's instance plan cost (Render has no per-day usage
 *  API; we snapshot the plan's monthly rate prorated daily). */
async function pullRender(): Promise<void> {
  const key = process.env.RENDER_API_KEY;
  if (!key) return;
  const res = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Render HTTP ${res.status}`);
  const svc: any = await res.json();
  const plan = String(svc?.serviceDetails?.plan || svc?.plan || "unknown");
  // Monthly plan rates (USD) — update if Render changes pricing.
  const PLAN_RATES: Record<string, number> = { free: 0, starter: 7, standard: 25, pro: 85, "pro plus": 175, "pro max": 225, "pro ultra": 450 };
  const monthly = PLAN_RATES[plan.toLowerCase()] ?? 25;
  await saveSnapshot("render", today(), `plan:${plan}`, monthly, (monthly / 30) * 1_000_000, { plan });
}

/** Neon — project storage size (billing proxy; Neon's usage API reports
 *  consumption metrics per project). */
async function pullNeon(): Promise<void> {
  const key = process.env.NEON_API_KEY;
  if (!key) return;
  const res = await fetch("https://console.neon.tech/api/v2/projects", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}`);
  const data: any = await res.json();
  for (const p of data?.projects || []) {
    const bytes = p.synthetic_storage_size ?? 0;
    const gb = bytes / 1e9;
    // Neon Launch plan storage overage ≈ $0.75/GB-mo prorated daily; compute
    // is usually inside the plan allowance — the official invoice remains the
    // source of truth, this tracks the trend.
    await saveSnapshot("neon", today(), `storage_gb:${p.name || p.id}`, gb, (gb * 0.75 / 30) * 1_000_000, { id: p.id, name: p.name, bytes });
  }
}

export async function runCostSnapshots(): Promise<void> {
  const pulls: Array<[string, () => Promise<void>]> = [
    ["anthropic", pullAnthropic],
    ["render", pullRender],
    ["neon", pullNeon],
  ];
  for (const [name, fn] of pulls) {
    try {
      await fn();
      console.log(`[CostTracker] ${name} snapshot ok`);
    } catch (e: any) {
      console.error(`[CostTracker] ${name} snapshot failed:`, e?.message || e);
    }
  }
}

/** Boot scheduler: first run shortly after start, then daily. */
export function scheduleCostSnapshots(): void {
  setTimeout(() => runCostSnapshots(), 60_000);
  setInterval(() => runCostSnapshots(), 24 * 60 * 60 * 1000);
}
