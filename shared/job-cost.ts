// Shared Job Cost Model types + override resolution — the single source of
// truth for the Package Equipment breakdown rail (client), Gibbs'
// package_economics tool (server), and the /api/crm/cost-model endpoint.
//
// Layering, weakest to strongest:
//   1. shop-wide numbers (labor rate, percents, default crew hours)
//   2. crew hours by system type (legacy laborHoursByUnitType — hours only)
//   3. costing override groups: named sets of numbers applied to chosen
//      system types and/or specific packages. A group that lists the package
//      directly beats a group that only lists its system type.
// Estimates only — nothing here ever changes a price.

export interface JobCostFields {
  laborHours: number;
  laborRatePerHour: number;
  materialsPctOfEquipment: number;
  commissionPctOfPrice: number;
  buydownPctOfPrice: number;
  overheadPctOfPrice: number;
  targetMarginPct: number;
}

export interface JobCostOverrideGroup {
  id: string;
  name: string;
  /** System types this group covers (e.g. ["GP"]). */
  unitTypes: string[];
  /** Specific package ids this group covers — beats a unitTypes match. */
  packageIds: string[];
  /** Only the fields present here override; everything else inherits. */
  values: Partial<JobCostFields>;
}

export interface JobCostModel extends JobCostFields {
  laborHoursByUnitType: Record<string, number>;
  overrides: JobCostOverrideGroup[];
}

export const JOB_COST_FIELD_META: Array<{
  key: keyof JobCostFields;
  label: string;
  unit: string;
  max: number;
}> = [
  { key: "laborHours", label: "Crew hours", unit: "hrs", max: 500 },
  { key: "laborRatePerHour", label: "Labor rate", unit: "$/hr", max: 10000 },
  { key: "materialsPctOfEquipment", label: "Materials & misc", unit: "% of equipment", max: 100 },
  { key: "commissionPctOfPrice", label: "Commission", unit: "% of price", max: 100 },
  { key: "buydownPctOfPrice", label: "Financing buydown", unit: "% of price", max: 100 },
  { key: "overheadPctOfPrice", label: "Overhead", unit: "% of price", max: 100 },
  { key: "targetMarginPct", label: "Target margin", unit: "% of price", max: 95 },
];

/** Human-readable value for a field, e.g. "$95/hr", "18 hrs", "12%". */
export function formatJobCostValue(key: keyof JobCostFields, value: number): string {
  if (key === "laborRatePerHour") return `$${value}/hr`;
  if (key === "laborHours") return `${value} hrs`;
  return `${value}%`;
}

export interface ResolvedJobCost {
  effective: JobCostFields;
  /** The override group that applied, or null when on shop defaults. */
  group: { id: string; name: string } | null;
  /** Exactly what the group changed vs what the package would use without it. */
  changes: Array<{
    key: keyof JobCostFields;
    label: string;
    unit: string;
    value: number;
    defaultValue: number;
  }>;
}

/** Resolve the numbers a specific package actually uses. */
export function resolveJobCost(
  model: JobCostModel,
  target: { packageId?: string | null; unitType?: string | null },
): ResolvedJobCost {
  const typeHours =
    target.unitType != null ? model.laborHoursByUnitType?.[target.unitType] : undefined;
  const base: JobCostFields = {
    laborHours: Number(typeHours ?? model.laborHours) || 0,
    laborRatePerHour: Number(model.laborRatePerHour) || 0,
    materialsPctOfEquipment: Number(model.materialsPctOfEquipment) || 0,
    commissionPctOfPrice: Number(model.commissionPctOfPrice) || 0,
    buydownPctOfPrice: Number(model.buydownPctOfPrice) || 0,
    overheadPctOfPrice: Number(model.overheadPctOfPrice) || 0,
    targetMarginPct: Number(model.targetMarginPct) || 0,
  };
  const groups = Array.isArray(model.overrides) ? model.overrides : [];
  const byPackage = target.packageId
    ? groups.find((g) => Array.isArray(g.packageIds) && g.packageIds.includes(target.packageId!))
    : undefined;
  const byType = target.unitType
    ? groups.find((g) => Array.isArray(g.unitTypes) && g.unitTypes.includes(target.unitType!))
    : undefined;
  const group = byPackage ?? byType;
  if (!group) return { effective: base, group: null, changes: [] };

  const effective = { ...base };
  const changes: ResolvedJobCost["changes"] = [];
  for (const meta of JOB_COST_FIELD_META) {
    const raw = group.values?.[meta.key];
    const v = Number(raw);
    if (raw == null || !Number.isFinite(v)) continue;
    effective[meta.key] = v;
    if (v !== base[meta.key]) {
      changes.push({ key: meta.key, label: meta.label, unit: meta.unit, value: v, defaultValue: base[meta.key] });
    }
  }
  return { effective, group: { id: group.id, name: group.name }, changes };
}
