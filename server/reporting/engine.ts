/**
 * GHQ reporting engine — turns a declarative report spec into one SQL query.
 *
 * Safety model: field keys resolve to whitelisted SQL expressions from the
 * source registry; filter/sort/group inputs that don't resolve are rejected.
 * User-supplied VALUES are always bound as parameters, never concatenated.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { getSource, type ReportSource } from "./sources";

export type FilterOp = "eq" | "neq" | "contains" | "gte" | "lte";
export type AggFn = "sum" | "avg" | "count" | "min" | "max";
export type TimeBucket = "day" | "week" | "month";

export interface ReportSpec {
  source: string;
  /** plain columns (detail mode) — ignored when groupBy is set */
  columns?: string[];
  filters?: { field: string; op: FilterOp; value: string | number }[];
  /** group rows by these fields (aggregate mode) */
  groupBy?: string[];
  /** when grouping by a date field, bucket it */
  timeBucket?: TimeBucket;
  /** measures for aggregate mode */
  measures?: { field: string; fn: AggFn; label?: string }[];
  sort?: { key: string; dir: "asc" | "desc" };
  dateField?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  limit?: number;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: string;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

const AGGS: Record<AggFn, (expr: string) => string> = {
  sum: (e) => `SUM(${e})`,
  avg: (e) => `AVG(${e})`,
  count: (e) => `COUNT(${e})`,
  min: (e) => `MIN(${e})`,
  max: (e) => `MAX(${e})`,
};

function fieldExpr(src: ReportSource, key: string): string {
  const f = src.fields[key];
  if (!f) throw new Error(`Unknown field "${key}" for source "${src.key}"`);
  return f.sql;
}

function bucketExpr(expr: string, bucket: TimeBucket): string {
  return `date_trunc('${bucket}', ${expr})`;
}

export async function runReport(spec: ReportSpec): Promise<ReportResult> {
  const src = getSource(spec.source);
  if (!src) throw new Error(`Unknown data source "${spec.source}"`);

  const grouped = (spec.groupBy?.length ?? 0) > 0;
  const limit = Math.min(Math.max(spec.limit ?? 500, 1), 2000);

  // ── SELECT list ──
  const selectParts: string[] = [];
  const columns: ReportColumn[] = [];

  if (grouped) {
    for (const g of spec.groupBy!) {
      const f = src.fields[g];
      const raw = fieldExpr(src, g);
      const expr = f.type === "date" && spec.timeBucket ? bucketExpr(raw, spec.timeBucket) : raw;
      selectParts.push(`${expr} AS "${g}"`);
      columns.push({ key: g, label: f.label, type: f.type });
    }
    const measures = spec.measures?.length
      ? spec.measures
      : [{ field: spec.groupBy![0], fn: "count" as AggFn, label: "Count" }];
    for (const m of measures) {
      const f = src.fields[m.field];
      if (!f) throw new Error(`Unknown measure field "${m.field}"`);
      if (!(m.fn in AGGS)) throw new Error(`Unknown aggregation "${m.fn}"`);
      const alias = `${m.fn}_${m.field}`;
      selectParts.push(`${AGGS[m.fn](fieldExpr(src, m.field))} AS "${alias}"`);
      columns.push({
        key: alias,
        label: m.label || `${m.fn === "count" ? "Count" : m.fn.toUpperCase()} ${m.fn === "count" ? "" : f.label}`.trim(),
        type: m.fn === "count" ? "number" : f.type === "currency" ? "currency" : "number",
      });
    }
  } else {
    const cols = spec.columns?.length ? spec.columns : Object.keys(src.fields).slice(0, 8);
    for (const c of cols) {
      const f = src.fields[c];
      selectParts.push(`${fieldExpr(src, c)} AS "${c}"`);
      columns.push({ key: c, label: f?.label ?? c, type: f?.type ?? "string" });
    }
  }

  // ── WHERE ──
  const conditions: SQL[] = [];
  const dateFieldKey = spec.dateField || src.defaultDateField;
  const dateExpr = fieldExpr(src, dateFieldKey);
  if (spec.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(spec.dateFrom)) {
    conditions.push(sql`${sql.raw(dateExpr)} >= ${spec.dateFrom}::date`);
  }
  if (spec.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(spec.dateTo)) {
    conditions.push(sql`${sql.raw(dateExpr)} < ${spec.dateTo}::date + interval '1 day'`);
  }
  for (const flt of spec.filters ?? []) {
    const expr = sql.raw(fieldExpr(src, flt.field));
    const v = flt.value;
    if (flt.op === "eq") conditions.push(sql`${expr}::text = ${String(v)}`);
    else if (flt.op === "neq") conditions.push(sql`${expr}::text <> ${String(v)}`);
    else if (flt.op === "contains") conditions.push(sql`${expr}::text ILIKE ${"%" + String(v) + "%"}`);
    else if (flt.op === "gte") conditions.push(sql`${expr} >= ${v}`);
    else if (flt.op === "lte") conditions.push(sql`${expr} <= ${v}`);
    else throw new Error(`Unknown filter op "${flt.op}"`);
  }

  // ── ORDER BY (only whitelisted keys / generated aliases) ──
  let orderSql = "";
  const validSortKeys = new Set(columns.map((c) => c.key));
  if (spec.sort && validSortKeys.has(spec.sort.key)) {
    orderSql = ` ORDER BY "${spec.sort.key}" ${spec.sort.dir === "asc" ? "ASC" : "DESC"} NULLS LAST`;
  } else if (grouped) {
    orderSql = ` ORDER BY "${columns[columns.length - 1].key}" DESC NULLS LAST`;
  } else {
    const dateCol = columns.find((c) => c.type === "date");
    if (dateCol) orderSql = ` ORDER BY "${dateCol.key}" DESC NULLS LAST`;
  }

  const groupSql = grouped
    ? ` GROUP BY ${spec.groupBy!.map((_, i) => i + 1).join(", ")}`
    : "";

  let query = sql`SELECT ${sql.raw(selectParts.join(", "))} FROM ${sql.raw(src.from)}`;
  if (conditions.length > 0) {
    let where = conditions[0];
    for (let i = 1; i < conditions.length; i++) where = sql`${where} AND ${conditions[i]}`;
    query = sql`${query} WHERE ${where}`;
  }
  query = sql`${query}${sql.raw(groupSql)}${sql.raw(orderSql)} LIMIT ${sql.raw(String(limit))}`;

  const result: any = await db.execute(query);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return { columns, rows, rowCount: rows.length };
}
