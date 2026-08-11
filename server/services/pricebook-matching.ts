import { db } from "../db";
import { equipmentModels, pricebookPackages } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

/** Model-matching for the proposal-builder packages ↔ equipment catalog.
 *  Shared by the Fix Matches workbench (routes.ts) and Gibbs' tools
 *  (crmHelpAI.ts) so both always agree on what's unmatched and how a
 *  remap behaves. Remaps ONLY touch the model strings on packages —
 *  names, images, and prices are never changed. */

// Trane price files mark models with a trailing * (revision wildcard).
export const normModel = (m: string) => m.trim().toUpperCase().replace(/\*+$/, "");

// Shared-prefix similarity — same heuristic the price-file wizard uses
// for succession suggestions. Pure + deterministic; suggestions only.
export const modelSimilarity = (a: string, b: string): number => {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!x || !y) return 0;
  let prefix = 0;
  while (prefix < Math.min(x.length, y.length) && x[prefix] === y[prefix]) prefix++;
  const longer = Math.max(x.length, y.length);
  const lengthPenalty = Math.abs(x.length - y.length) / longer;
  return Math.max(0, prefix / longer - lengthPenalty * 0.2);
};

export type UnmatchedPackageModel = {
  fromModel: string;
  count: number;
  slots: string[];
  samplePackages: string[];
  suggestions: Array<{ id: string; brand: string; model: string; description: string | null; costCents: number; score: number }>;
};

/** Every distinct model string referenced by an active package that does NOT
 *  match the catalog (exact-normalized or ≥8-char prefix either way), with
 *  usage counts and scored catalog suggestions. */
export async function computeUnmatchedPackageModels(): Promise<UnmatchedPackageModel[]> {
  const [packages, catalog] = await Promise.all([
    db.select().from(pricebookPackages).where(eq(pricebookPackages.isActive, true)),
    db.select().from(equipmentModels),
  ]);
  const normed = catalog.map((c) => ({ c, n: normModel(c.model) }));
  const exact = new Set(normed.map((x) => x.n).filter(Boolean));
  const matchesCatalog = (m: string): boolean => {
    const n = normModel(m);
    if (!n) return true;
    if (exact.has(n)) return true;
    for (const { n: cn } of normed) {
      if (!cn) continue;
      const shorter = cn.length < n.length ? cn : n;
      const longer = cn.length < n.length ? n : cn;
      if (shorter.length >= 8 && longer.startsWith(shorter)) return true;
    }
    return false;
  };

  const agg = new Map<string, { fromModel: string; count: number; slots: Set<string>; samplePackages: string[] }>();
  for (const p of packages) {
    const parts = [
      { slot: "Outdoor", model: p.outdoorModel },
      { slot: "Coil", model: p.coilModel },
      { slot: "Indoor heat", model: p.indoorHeatModel },
      { slot: "Thermostat", model: p.thermostatModel },
    ];
    for (const part of parts) {
      const m = (part.model || "").trim();
      if (!m || matchesCatalog(m)) continue;
      const key = m.toLowerCase();
      if (!agg.has(key)) agg.set(key, { fromModel: m, count: 0, slots: new Set(), samplePackages: [] });
      const a = agg.get(key)!;
      a.count++;
      a.slots.add(part.slot);
      if (a.samplePackages.length < 5) a.samplePackages.push(`${p.unitType} ${p.tier} ${p.tonnage}T ${p.packageLevel}`);
    }
  }

  const activeCatalog = catalog.filter((c) => !c.isDiscontinued);
  return Array.from(agg.values())
    .sort((a, b) => b.count - a.count)
    .map((a) => ({
      fromModel: a.fromModel,
      count: a.count,
      slots: Array.from(a.slots),
      samplePackages: a.samplePackages,
      suggestions: activeCatalog
        .map((c) => ({ c, score: modelSimilarity(a.fromModel, c.model) }))
        .filter((x) => x.score >= 0.4)
        .sort((x, y) => y.score - x.score)
        .slice(0, 3)
        .map((x) => ({
          id: x.c.id,
          brand: x.c.brand,
          model: x.c.model,
          description: x.c.description,
          costCents: x.c.costCents,
          score: Math.round(x.score * 100) / 100,
        })),
    }));
}

export type RemapMapping = { fromModel: string; toModel?: string | null; clear?: boolean; packageId?: string | null };
export type RemapSummary = {
  results: Array<{ fromModel: string; action: "mapped" | "cleared" | "skipped"; toModel?: string; packagesTouched: number; reason?: string }>;
  packagesTouched: number;
};

/** Apply model remaps: swap an old model string for a catalog model (or NULL
 *  it out for junk placeholders) across every package slot that carries it —
 *  optionally scoped to a single package. toModel must exist in the catalog;
 *  the catalog's exact spelling is what gets written. */
export async function applyModelRemaps(mappings: RemapMapping[]): Promise<RemapSummary> {
  const catalog = await db.select().from(equipmentModels);
  const results: RemapSummary["results"] = [];
  let totalTouched = 0;
  for (const m of (mappings || []).slice(0, 100)) {
    const from = String(m?.fromModel || "").trim();
    if (!from) continue;
    const low = from.toLowerCase();
    const scope = m.packageId ? sql` AND id = ${String(m.packageId)}` : sql``;

    if (m.clear) {
      const res = await db.execute(sql`
        UPDATE pricebook_packages SET
          outdoor_model = CASE WHEN lower(outdoor_model) = ${low} THEN NULL ELSE outdoor_model END,
          coil_model = CASE WHEN lower(coil_model) = ${low} THEN NULL ELSE coil_model END,
          indoor_heat_model = CASE WHEN lower(indoor_heat_model) = ${low} THEN NULL ELSE indoor_heat_model END,
          thermostat_model = CASE WHEN lower(thermostat_model) = ${low} THEN NULL ELSE thermostat_model END,
          updated_at = now()
        WHERE (lower(outdoor_model) = ${low} OR lower(coil_model) = ${low} OR lower(indoor_heat_model) = ${low} OR lower(thermostat_model) = ${low})${scope}
      `);
      const touched = Number((res as any)?.rowCount || 0);
      totalTouched += touched;
      results.push({ fromModel: from, action: "cleared", packagesTouched: touched });
      continue;
    }

    const toRaw = String(m.toModel || "").trim();
    if (!toRaw) {
      results.push({ fromModel: from, action: "skipped", packagesTouched: 0, reason: "no target model and not a clear" });
      continue;
    }
    const target =
      catalog.find((c) => c.model.toLowerCase() === toRaw.toLowerCase()) ||
      catalog.find((c) => normModel(c.model) === normModel(toRaw));
    if (!target) {
      results.push({ fromModel: from, action: "skipped", packagesTouched: 0, reason: `"${toRaw}" is not in the catalog` });
      continue;
    }
    const to = target.model;
    const res = await db.execute(sql`
      UPDATE pricebook_packages SET
        outdoor_model = CASE WHEN lower(outdoor_model) = ${low} THEN ${to} ELSE outdoor_model END,
        coil_model = CASE WHEN lower(coil_model) = ${low} THEN ${to} ELSE coil_model END,
        indoor_heat_model = CASE WHEN lower(indoor_heat_model) = ${low} THEN ${to} ELSE indoor_heat_model END,
        thermostat_model = CASE WHEN lower(thermostat_model) = ${low} THEN ${to} ELSE thermostat_model END,
        updated_at = now()
      WHERE (lower(outdoor_model) = ${low} OR lower(coil_model) = ${low} OR lower(indoor_heat_model) = ${low} OR lower(thermostat_model) = ${low})${scope}
    `);
    const touched = Number((res as any)?.rowCount || 0);
    totalTouched += touched;
    results.push({ fromModel: from, action: "mapped", toModel: to, packagesTouched: touched });
  }
  return { results, packagesTouched: totalTouched };
}
