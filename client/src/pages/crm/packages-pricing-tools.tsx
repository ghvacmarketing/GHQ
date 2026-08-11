import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeftRight, Boxes, Check, Eye, FileSpreadsheet, Loader2, Pencil, Plus,
  Search, TrendingDown, TrendingUp, Upload, X,
} from "lucide-react";
import { format } from "date-fns";

/** Package pricing revamp — the tools UNDER the hand-curated packages:
 *  - Equipment catalog: every supplier model + cost (brands are pure data)
 *  - Price-file wizard: supplier flat file → reviewed four-bucket diff
 *  - Cost drift: live component cost vs the snapshot behind each package's
 *    price — warnings only, prices never change themselves
 *  - Live preview: the package exactly as the proposal builder shows it */

const usd = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type CatalogModel = {
  id: string; brand: string; model: string; description: string | null; category: string | null;
  costCents: number; isDiscontinued: boolean | null; supersededByModel: string | null; lastSeenAt: string | null;
};

// ─────────────────────────── Equipment catalog ───────────────────────────

export function EquipmentCatalogCard() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ brand: "", model: "", description: "", cost: "" });

  const { data, isLoading } = useQuery<{ models: CatalogModel[]; brands: string[] }>({
    queryKey: ["/api/crm/equipment-catalog", search],
    queryFn: async () => {
      const res = await fetch(`/api/crm/equipment-catalog?search=${encodeURIComponent(search)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load the catalog");
      return res.json();
    },
    placeholderData: (prev) => prev,
  });
  const models = (data?.models || []).filter((m) => brandFilter === "all" || m.brand === brandFilter);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/crm/equipment-catalog"] });

  const patchModel = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest("PATCH", `/api/crm/equipment-catalog/${id}`, body),
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] }); },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save", variant: "destructive" }),
  });

  const addModel = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/crm/equipment-catalog", {
        brand: newRow.brand.trim(),
        model: newRow.model.trim(),
        description: newRow.description.trim() || undefined,
        costCents: Math.round(parseFloat(newRow.cost) * 100),
      }),
    onSuccess: () => {
      setAdding(false);
      setNewRow({ brand: "", model: "", description: "", cost: "" });
      invalidate();
      toast({ title: "Model added" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't add the model", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" /> Equipment Catalog</CardTitle>
        <CardDescription>
          Every supplier model and its current cost — the layer your packages are priced against.
          New brands live here as plain rows: no development needed, ever.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search model, brand, description" className="h-9 w-72 pl-8" data-testid="catalog-search" />
          </div>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="h-9 w-40" data-testid="catalog-brand-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {(data?.brands || []).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} data-testid="catalog-add-toggle">
            <Plus className="mr-1 h-4 w-4" /> Add model
          </Button>
          <span className="ml-auto text-xs text-slate-400">{models.length} model{models.length === 1 ? "" : "s"}</span>
        </div>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Input value={newRow.brand} onChange={(e) => setNewRow((r) => ({ ...r, brand: e.target.value }))} placeholder="Brand (e.g. Trane)" className="h-9 w-36" data-testid="catalog-new-brand" />
            <Input value={newRow.model} onChange={(e) => setNewRow((r) => ({ ...r, model: e.target.value }))} placeholder="Model number" className="h-9 w-44" data-testid="catalog-new-model" />
            <Input value={newRow.description} onChange={(e) => setNewRow((r) => ({ ...r, description: e.target.value }))} placeholder="Description (optional)" className="h-9 w-56" data-testid="catalog-new-desc" />
            <Input value={newRow.cost} onChange={(e) => setNewRow((r) => ({ ...r, cost: e.target.value }))} type="number" min="0" step="0.01" placeholder="Cost $" className="h-9 w-28" data-testid="catalog-new-cost" />
            <Button size="sm" disabled={!newRow.brand.trim() || !newRow.model.trim() || !parseFloat(newRow.cost) || addModel.isPending} onClick={() => addModel.mutate()} data-testid="catalog-new-save">
              {addModel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : models.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            No models yet — upload a supplier price file or add models by hand.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.id} className={m.isDiscontinued ? "opacity-55" : undefined}>
                    <TableCell className="font-medium">{m.brand}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.model}
                      {m.isDiscontinued && (
                        <Badge variant="outline" className="ml-2 border-red-200 bg-red-50 text-[10px] text-red-600">
                          {m.supersededByModel ? `→ ${m.supersededByModel}` : "Discontinued"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-sm text-slate-500">{m.description || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editingId === m.id ? (
                        <span className="inline-flex items-center gap-1">
                          <Input
                            autoFocus
                            value={editCost}
                            onChange={(e) => setEditCost(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && parseFloat(editCost) >= 0) {
                                patchModel.mutate({ id: m.id, costCents: Math.round(parseFloat(editCost) * 100) });
                                setEditingId(null);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            type="number" min="0" step="0.01" className="h-8 w-24 text-right"
                            data-testid={`catalog-cost-input-${m.id}`}
                          />
                          <button onClick={() => { if (parseFloat(editCost) >= 0) { patchModel.mutate({ id: m.id, costCents: Math.round(parseFloat(editCost) * 100) }); } setEditingId(null); }} className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                            <Check className="h-4 w-4" />
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => { setEditingId(m.id); setEditCost((m.costCents / 100).toFixed(2)); }}
                          className="group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-slate-100"
                          data-testid={`catalog-cost-${m.id}`}
                        >
                          {usd(m.costCents)}
                          <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => patchModel.mutate({ id: m.id, isDiscontinued: !m.isDiscontinued })}
                        className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
                        data-testid={`catalog-toggle-${m.id}`}
                      >
                        {m.isDiscontinued ? "Restore" : "Retire"}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── Price-file wizard ───────────────────────────

type ParsedRow = Record<string, string | number>;
type Preview = {
  totals: { rows: number; priceChanges: number; unchanged: number; newModels: number; missing: number; successions: number };
  priceChanges: Array<{ id: string; brand: string; model: string; oldCostCents: number; newCostCents: number }>;
  newModels: Array<{ brand: string; model: string; costCents: number; description: string | null }>;
  missingModels: Array<{ id: string; brand: string; model: string; costCents: number }>;
  successions: Array<{ fromId: string; fromModel: string; brand: string; toModel: string; toCostCents: number; oldCostCents: number; confidence: number }>;
};

export function PriceFileWizardCard() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [supplier, setSupplier] = useState("Trane");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [map, setMap] = useState<{ brand: string; model: string; cost: string; description: string }>({ brand: "", model: "", cost: "", description: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<Record<string, number> | null>(null);
  // Review decisions
  const [skipPrice, setSkipPrice] = useState<Set<string>>(new Set());
  const [addNew, setAddNew] = useState<Set<string>>(new Set());
  const [discontinue, setDiscontinue] = useState<Set<string>>(new Set());
  const [confirmSucc, setConfirmSucc] = useState<Set<string>>(new Set());

  const { data: history = [] } = useQuery<Array<{ id: string; filename: string | null; supplier: string | null; rowCount: number; summary: any; createdAt: string }>>({
    queryKey: ["/api/crm/pricebook-import/history"],
  });

  const guessMap = (hdrs: string[]) => {
    const find = (...needles: string[]) => hdrs.find((h) => needles.some((n) => h.toLowerCase().includes(n))) || "";
    return {
      brand: find("brand", "manufacturer", "make"),
      model: find("model", "part", "sku", "item"),
      cost: find("cost", "net", "price", "amount"),
      // "name" alone is a trap — "Price List Name" is metadata, not a description
      description: find("desc", "product"),
    };
  };

  const resetFile = () => {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMap({ brand: "", model: "", cost: "", description: "" });
    setPreview(null);
    setApplied(null);
  };

  const onFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Supplier files often carry blank/title rows above the real headers
      // (Trane's has an empty first row) — find the first row that actually
      // looks like headers before building objects.
      const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
      const headerIdx = raw.findIndex(
        (r) => Array.isArray(r) && r.filter((c) => String(c).trim() !== "").length >= 2 && r.some((c) => /[a-z]/i.test(String(c))),
      );
      if (headerIdx < 0 || raw.length <= headerIdx + 1) {
        toast({ title: "That file has no usable rows", variant: "destructive" });
        return;
      }
      const hdrs = raw[headerIdx].map((h: any, i: number) => String(h).trim() || `Column ${i + 1}`);
      const json: ParsedRow[] = raw.slice(headerIdx + 1)
        .filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ""))
        .map((r) => Object.fromEntries(hdrs.map((h: string, i: number) => [h, r[i] ?? ""])));
      if (json.length === 0) { toast({ title: "That file has no rows", variant: "destructive" }); return; }
      setFileName(f.name);
      setHeaders(hdrs);
      setRows(json);
      setMap(guessMap(hdrs));
      setPreview(null);
      setApplied(null);
    } catch {
      toast({ title: "Couldn't read that file", description: "CSV or Excel (.xlsx) files work.", variant: "destructive" });
    }
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const body = {
        supplier,
        rows: rows.map((r) => ({
          brand: map.brand ? String(r[map.brand] ?? "") : supplier,
          model: String(r[map.model] ?? ""),
          cost: parseFloat(String(r[map.cost] ?? "").replace(/[$,]/g, "")),
          description: map.description ? String(r[map.description] ?? "") : "",
        })),
      };
      const res = await apiRequest("POST", "/api/crm/pricebook-import/preview", body);
      return res.json();
    },
    onSuccess: (p: Preview) => {
      setPreview(p);
      setSkipPrice(new Set());
      setAddNew(new Set(p.newModels.map((n) => `${n.brand}|${n.model}`)));
      setDiscontinue(new Set());
      setConfirmSucc(new Set(p.successions.filter((s) => s.confidence >= 0.75).map((s) => s.fromId)));
    },
    onError: (e: any) => toast({ title: e?.message || "Preview failed", variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Nothing to apply");
      const body = {
        filename: fileName,
        supplier,
        rowCount: rows.length,
        priceUpdates: preview.priceChanges.filter((c) => !skipPrice.has(c.id)).map((c) => ({ id: c.id, newCostCents: c.newCostCents })),
        addModels: preview.newModels.filter((n) => addNew.has(`${n.brand}|${n.model}`)),
        discontinueIds: Array.from(discontinue),
        successions: preview.successions.filter((s) => confirmSucc.has(s.fromId)).map((s) => ({ fromId: s.fromId, toModel: s.toModel, toCostCents: s.toCostCents })),
      };
      const res = await apiRequest("POST", "/api/crm/pricebook-import/apply", body);
      return res.json();
    },
    onSuccess: (r: any) => {
      setApplied(r);
      setPreview(null);
      setRows([]);
      setHeaders([]);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/equipment-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-import/history"] });
      toast({ title: "Price file applied", description: "The catalog is updated — check cost drift on your packages." });
    },
    onError: (e: any) => toast({ title: e?.message || "Apply failed", variant: "destructive" }),
  });

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setter(n);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Supplier Price File</CardTitle>
        <CardDescription>
          Drop the flat file Trane (or any brand) sends — brand, model, cost. Nothing changes until you
          review the diff: price moves, new models, discontinued models, and suggested model successions.
          Your packages' prices and layouts are never touched by an upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} data-testid="pricefile-input" />

        {/* Step 1 — pick the file. A proper drop-zone card when empty; a
            compact file bar with an X once one's loaded. */}
        {!fileName ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 py-10 transition-colors hover:border-[#711419]/40 hover:bg-[#711419]/[0.03]"
            data-testid="pricefile-upload"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
              <Upload className="h-5 w-5 text-[#711419]" />
            </span>
            <span className="text-sm font-semibold text-slate-700">Upload the supplier price file</span>
            <span className="text-xs text-slate-400">CSV or Excel — title rows and blank rows are handled automatically</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#711419]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{fileName}</p>
              <p className="text-xs text-slate-400">{rows.length.toLocaleString()} rows read</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Supplier</span>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Trane" className="h-8 w-28" data-testid="pricefile-supplier" />
            </div>
            <button
              onClick={resetFile}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Remove file"
              title="Start over with a different file"
              data-testid="pricefile-clear"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2 — map the columns, with a live read of the first rows so
            it's obvious the file is being understood correctly. */}
        {headers.length > 0 && !preview && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Which column is which?</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {([["model", "Model *"], ["cost", "Cost *"], ["brand", "Brand"], ["description", "Description"]] as const).map(([key, label]) => (
                <div key={key}>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">{label}</p>
                  <Select value={map[key] || "__none"} onValueChange={(v) => setMap((m) => ({ ...m, [key]: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="h-9 bg-white" data-testid={`pricefile-map-${key}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{key === "brand" ? `Use "${supplier}" for all` : "Not in file"}</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {map.model && map.cost && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Reading it as — first {Math.min(5, rows.length)} of {rows.length.toLocaleString()}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Brand</TableHead>
                      <TableHead className="h-8">Model</TableHead>
                      <TableHead className="h-8 text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="py-1.5 text-sm">{map.brand ? String(r[map.brand] ?? "") : supplier}</TableCell>
                        <TableCell className="py-1.5 font-mono text-xs">{String(r[map.model] ?? "")}</TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums text-sm">
                          ${parseFloat(String(r[map.cost] ?? "").replace(/[$,]/g, "")).toLocaleString("en-US", { minimumFractionDigits: 2 }) || "?"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button disabled={!map.model || !map.cost || previewMutation.isPending} onClick={() => previewMutation.mutate()} className="bg-[#711419] hover:bg-[#8a1a1f]" data-testid="pricefile-preview">
              {previewMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Comparing…</> : "Looks right — compare against catalog"}
            </Button>
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">{preview.totals.priceChanges} price changes</Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{preview.totals.newModels} new</Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{preview.totals.missing} missing</Badge>
              <Badge variant="outline" className="border-[#711419]/30 bg-[#711419]/5 text-[#711419]">{preview.totals.successions} successions suggested</Badge>
              <Badge variant="outline" className="text-slate-500">{preview.totals.unchanged} unchanged</Badge>
            </div>

            {preview.successions.length > 0 && (
              <div className="rounded-lg border border-[#711419]/25 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#711419]">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Model successions — confirm each swap
                </p>
                <div className="space-y-1.5">
                  {preview.successions.map((s) => (
                    <label key={s.fromId} className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-sm hover:bg-slate-50">
                      <Checkbox checked={confirmSucc.has(s.fromId)} onCheckedChange={() => toggle(confirmSucc, setConfirmSucc, s.fromId)} data-testid={`succ-${s.fromId}`} />
                      <span className="font-mono text-xs">{s.fromModel}</span>
                      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="font-mono text-xs font-semibold">{s.toModel}</span>
                      <span className="tabular-nums text-xs text-slate-500">{usd(s.oldCostCents)} → {usd(s.toCostCents)}</span>
                      <Badge variant="outline" className="ml-auto text-[10px] text-slate-500">{Math.round(s.confidence * 100)}% match</Badge>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Confirming swaps the model number inside every package that uses it — names, images, and your prices stay exactly as built.
                </p>
              </div>
            )}

            {preview.priceChanges.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Price changes (unchecked = skip)</p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {preview.priceChanges.map((c) => {
                    const up = c.newCostCents > c.oldCostCents;
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                        <Checkbox checked={!skipPrice.has(c.id)} onCheckedChange={() => toggle(skipPrice, setSkipPrice, c.id)} data-testid={`price-${c.id}`} />
                        <span className="font-mono text-xs">{c.model}</span>
                        <span className="ml-auto flex items-center gap-1 tabular-nums text-xs">
                          {usd(c.oldCostCents)} → <span className={up ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>{usd(c.newCostCents)}</span>
                          {up ? <TrendingUp className="h-3.5 w-3.5 text-red-500" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {preview.newModels.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New models (checked = add to catalog)</p>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {preview.newModels.map((n) => {
                    const key = `${n.brand}|${n.model}`;
                    return (
                      <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                        <Checkbox checked={addNew.has(key)} onCheckedChange={() => toggle(addNew, setAddNew, key)} data-testid={`new-${n.model}`} />
                        <span className="font-mono text-xs">{n.model}</span>
                        {n.description && <span className="truncate text-xs text-slate-400">{n.description}</span>}
                        <span className="ml-auto tabular-nums text-xs text-slate-600">{usd(n.costCents)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {preview.missingModels.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">In your catalog, not in this file (checked = mark discontinued)</p>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {preview.missingModels.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-0.5 text-sm hover:bg-amber-100/40">
                      <Checkbox checked={discontinue.has(m.id)} onCheckedChange={() => toggle(discontinue, setDiscontinue, m.id)} data-testid={`miss-${m.id}`} />
                      <span className="font-mono text-xs">{m.model}</span>
                      <span className="ml-auto tabular-nums text-xs text-slate-500">{usd(m.costCents)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending} className="bg-[#711419] hover:bg-[#8a1a1f]" data-testid="pricefile-apply">
                {applyMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying…</> : "Apply reviewed changes"}
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} data-testid="pricefile-cancel"><X className="mr-1 h-4 w-4" /> Back</Button>
            </div>
          </div>
        )}

        {applied && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-800" data-testid="pricefile-result">
            Applied: {String(applied.priced)} repriced · {String(applied.added)} added · {String(applied.discontinued)} discontinued · {String(applied.successions)} successions ({String(applied.packagesTouched)} package component swaps). Check cost drift below.
          </div>
        )}

        {history.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Import history</p>
            <div className="space-y-1">
              {history.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200/80 px-2.5 py-1.5 text-xs text-slate-600">
                  <span className="font-medium">{h.supplier || "—"}</span>
                  <span className="truncate text-slate-400">{h.filename || "manual"}</span>
                  <span className="ml-auto tabular-nums text-slate-400">{h.createdAt ? format(new Date(h.createdAt), "MMM d, yyyy h:mm a") : ""}</span>
                  {h.summary && (
                    <span className="tabular-nums text-slate-500">
                      {h.summary.priced ?? 0}↺ · {h.summary.added ?? 0}+ · {h.summary.successions ?? 0}⇄
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── Cost drift + live preview ───────────────────────────

type DriftRow = {
  id: string; unitType: string; tier: string; tonnage: string; packageLevel: string;
  totalInvestment: number; currentComponentCostCents: number; costBasisCents: number | null;
  costBasisAt: string | null; driftCents: number | null; matchedCount: number; unmatchedModels: string[];
};

export function CostDriftCard({ packages }: { packages: any[] | undefined }) {
  const { toast } = useToast();
  const [previewPkg, setPreviewPkg] = useState<any | null>(null);
  const [pricingId, setPricingId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [monthlyInput, setMonthlyInput] = useState("");

  const { data: drift = [], isLoading } = useQuery<DriftRow[]>({
    queryKey: ["/api/crm/pricebook-drift"],
  });
  const byId = useMemo(() => new Map((packages || []).map((p: any) => [p.id, p])), [packages]);

  const rebaseline = useMutation({
    mutationFn: async ({ id, totalInvestmentCents, monthlyPaymentCents }: { id: string; totalInvestmentCents?: number; monthlyPaymentCents?: number }) =>
      apiRequest("POST", `/api/crm/pricebook-drift/${id}/rebaseline`, { totalInvestmentCents, monthlyPaymentCents }),
    onSuccess: () => {
      setPricingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/packages"] });
      toast({ title: "Package updated" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't update", variant: "destructive" }),
  });

  const flagged = drift.filter((d) => d.driftCents != null && Math.abs(d.driftCents) >= 100);
  const unbaselined = drift.filter((d) => d.costBasisCents == null && d.matchedCount > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Cost Drift</CardTitle>
        <CardDescription>
          Live component cost (from the catalog) vs the snapshot behind each package's price.
          Prices never change themselves — this tells you when to look. Set a baseline once and every
          future price file lights up exactly the packages it affects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : drift.every((d) => d.matchedCount === 0) ? (
          <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
            No package components match the catalog yet — upload a supplier price file first, and the
            models on your packages link up automatically by model number.
          </p>
        ) : (
          <>
            {unbaselined.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 text-sm text-blue-800">
                <span>{unbaselined.length} package{unbaselined.length === 1 ? "" : "s"} have matched costs but no baseline yet.</span>
                <Button
                  size="sm" variant="outline" className="h-7 border-blue-300 text-blue-700"
                  onClick={() => unbaselined.forEach((d) => rebaseline.mutate({ id: d.id }))}
                  disabled={rebaseline.isPending}
                  data-testid="drift-baseline-all"
                >
                  Baseline all at today's costs
                </Button>
              </div>
            )}
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Package</TableHead>
                    <TableHead className="text-right">Your price</TableHead>
                    <TableHead className="text-right">Component cost</TableHead>
                    <TableHead className="text-right">Drift</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drift.filter((d) => d.matchedCount > 0).map((d) => {
                    const drifted = d.driftCents != null && Math.abs(d.driftCents) >= 100;
                    return (
                      <TableRow key={d.id} className={drifted ? "bg-red-50/40" : undefined}>
                        <TableCell>
                          <span className="font-medium">{d.unitType} {d.tier}</span>{" "}
                          <span className="text-slate-500">{d.tonnage}T · {d.packageLevel}</span>
                          {d.unmatchedModels.length > 0 && (
                            <span className="ml-2 text-[10px] text-amber-600" title={d.unmatchedModels.join(", ")}>
                              {d.unmatchedModels.length} unmatched
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pricingId === d.id ? (
                            <span className="inline-flex items-center gap-1">
                              <Input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} type="number" min="0" placeholder="Total $" className="h-8 w-24 text-right" data-testid={`drift-price-${d.id}`} />
                              <Input value={monthlyInput} onChange={(e) => setMonthlyInput(e.target.value)} type="number" min="0" placeholder="Mo $" className="h-8 w-20 text-right" data-testid={`drift-monthly-${d.id}`} />
                              <button
                                onClick={() => rebaseline.mutate({
                                  id: d.id,
                                  totalInvestmentCents: priceInput ? Math.round(parseFloat(priceInput) * 100) : undefined,
                                  monthlyPaymentCents: monthlyInput ? Math.round(parseFloat(monthlyInput) * 100) : undefined,
                                })}
                                className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </span>
                          ) : (
                            usd(d.totalInvestment)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">
                          {usd(d.currentComponentCostCents)}
                          {d.costBasisCents != null && <span className="block text-[10px] text-slate-400">was {usd(d.costBasisCents)}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.driftCents == null ? (
                            <span className="text-[11px] text-slate-400">no baseline</span>
                          ) : Math.abs(d.driftCents) < 100 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className={d.driftCents > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                              {d.driftCents > 0 ? "+" : ""}{usd(d.driftCents)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setPreviewPkg(byId.get(d.id) || d)}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Preview as the proposal builder shows it"
                              data-testid={`drift-preview-${d.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => { setPricingId(pricingId === d.id ? null : d.id); setPriceInput(((d.totalInvestment || 0) / 100).toFixed(0)); setMonthlyInput(""); }}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Set a new price (re-baselines cost)"
                              data-testid={`drift-setprice-${d.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {drifted && (
                              <button
                                onClick={() => rebaseline.mutate({ id: d.id })}
                                className="rounded px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                                title="Keep the current price; accept today's costs as the new baseline"
                                data-testid={`drift-ack-${d.id}`}
                              >
                                Keep price
                              </button>
                            )}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      {/* Live preview — the package card the way the proposal builder renders it */}
      <Dialog open={!!previewPkg} onOpenChange={(o) => { if (!o) setPreviewPkg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Proposal preview</DialogTitle>
          </DialogHeader>
          {previewPkg && <PackagePreviewCard pkg={previewPkg} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Faithful stand-in for the proposal builder's package card: level ribbon,
 *  equipment images, component names, investment + monthly. */
export function PackagePreviewCard({ pkg }: { pkg: any }) {
  const imgs = [
    { url: pkg.outdoorImageUrl, label: pkg.outdoorName || pkg.outdoorModel },
    { url: pkg.coilImageUrl, label: pkg.coilName || pkg.coilModel },
    { url: pkg.furnaceImageUrl, label: pkg.indoorHeatName || pkg.indoorHeatModel },
    { url: pkg.thermostatImageUrl, label: pkg.thermostatName || pkg.thermostatModel },
  ].filter((i) => i.url);
  const components = [
    pkg.outdoorName || pkg.outdoorModel,
    pkg.coilName || pkg.coilModel,
    pkg.indoorHeatName || pkg.indoorHeatModel,
    pkg.thermostatName || pkg.thermostatModel,
  ].filter(Boolean);
  return (
    <div className="overflow-hidden rounded-xl border-2 border-[#711419]/20 bg-white shadow-md" data-testid="package-preview-card">
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: "#711419" }}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{pkg.unitType} · {pkg.tier} · {pkg.tonnage}T</p>
          <p className="text-lg font-bold">{pkg.packageLevel} Package</p>
        </div>
        <Badge className="bg-white/15 text-white hover:bg-white/15">{pkg.packageLevel}</Badge>
      </div>
      {imgs.length > 0 && (
        <div className="flex items-center justify-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          {imgs.map((i, idx) => (
            <img key={idx} src={i.url} alt={i.label || ""} className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain" />
          ))}
        </div>
      )}
      <div className="space-y-1.5 px-4 py-3">
        {components.map((c, i) => (
          <p key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#711419]" /> {c}
          </p>
        ))}
        {pkg.accessoryModels && (
          <p className="flex items-start gap-2 text-sm text-slate-500">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" /> {pkg.accessoryModels}
          </p>
        )}
      </div>
      <div className="flex items-end justify-between border-t border-slate-100 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total investment</p>
          <p className="text-2xl font-bold tabular-nums text-[#711419]">{usd(pkg.totalInvestment)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">As low as</p>
          <p className="text-lg font-semibold tabular-nums text-slate-800">{usd(pkg.monthlyPayment)}/mo</p>
        </div>
      </div>
    </div>
  );
}
