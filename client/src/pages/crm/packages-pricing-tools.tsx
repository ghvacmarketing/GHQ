import { useEffect, useMemo, useRef, useState } from "react";
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
  ArrowLeftRight, Boxes, Check, Download, Eye, FileSpreadsheet, Loader2, Pencil, Plus,
  Search, Upload, X,
} from "lucide-react";
import { format } from "date-fns";
import { FINANCING_LABEL, monthlyFinancing } from "@/lib/financing";
import { setGibbsPageContext } from "@/lib/gibbs-page-context";

/** Package pricing revamp — the tools UNDER the hand-curated packages:
 *  - Equipment catalog: every supplier model + cost (brands are pure data)
 *  - Price-file wizard: supplier flat file → reviewed four-bucket diff
 *  - Cost drift: live component cost vs the snapshot behind each package's
 *    price — warnings only, prices never change themselves
 *  - Live preview: the package exactly as the proposal builder shows it */

// Whole dollars stay clean ($3,075); anything with cents always shows both
// decimals ($5,223.40 — never $5,223.4).
const usd = (cents: number | null | undefined) =>
  cents == null
    ? "—"
    : cents % 100 === 0
      ? `$${(cents / 100).toLocaleString("en-US")}`
      : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type CatalogModel = {
  id: string; brand: string; model: string; description: string | null; category: string | null;
  costCents: number; isDiscontinued: boolean | null; supersededByModel: string | null; lastSeenAt: string | null;
};

// ─────────────────────────── Equipment catalog ───────────────────────────

export function EquipmentCatalogCard() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ brand: "", model: "", description: "", cost: "" });

  const [visibleCount, setVisibleCount] = useState(100);

  // One fetch, filter in the browser — refetching 1,300+ rows on every
  // keystroke (and rendering them all) is what made this card feel slow.
  const { data, isLoading } = useQuery<{ models: CatalogModel[]; brands: string[] }>({
    queryKey: ["/api/crm/equipment-catalog"],
  });
  const models = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.models || []).filter(
      (m) =>
        (brandFilter === "all" || m.brand === brandFilter) &&
        (!q ||
          m.model.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          (m.description || "").toLowerCase().includes(q)),
    );
  }, [data, search, brandFilter]);

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
        <CardTitle>Equipment Catalog</CardTitle>
        <CardDescription>
          Every supplier model and its current cost — the layer your packages are priced against.
          Costs update through supplier price files, never by hand here. New brands live here as
          plain rows: no development needed, ever.
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
            {(data?.models || []).length === 0
              ? "No models yet — upload a supplier price file or add models by hand."
              : "Nothing matches that search."}
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
                {models.slice(0, visibleCount).map((m) => (
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
                    <TableCell className="text-right tabular-nums" data-testid={`catalog-cost-${m.id}`}>
                      {usd(m.costCents)}
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
            {models.length > visibleCount && (
              <div className="border-t border-slate-100 bg-slate-50/60 py-2 text-center">
                <button
                  onClick={() => setVisibleCount((c) => c + 300)}
                  className="text-xs font-medium text-[#711419] hover:underline"
                  data-testid="catalog-show-more"
                >
                  Show more — {(models.length - visibleCount).toLocaleString()} remaining
                </button>
              </div>
            )}
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
  // The original File, kept so apply can archive it byte-for-byte.
  const rawFileRef = useRef<File | null>(null);
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

  const { data: history = [] } = useQuery<Array<{ id: string; filename: string | null; supplier: string | null; rowCount: number; summary: any; createdAt: string; hasFile?: boolean }>>({
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
    rawFileRef.current = null;
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
      rawFileRef.current = f;
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
      // Archive the original upload with the import (base64; capped at 20MB).
      let fileBase64: string | undefined;
      let fileMime: string | undefined;
      const raw = rawFileRef.current;
      if (raw && raw.size <= 20 * 1024 * 1024) {
        const bytes = new Uint8Array(await raw.arrayBuffer());
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
        }
        fileBase64 = btoa(bin);
        fileMime = raw.type || "application/octet-stream";
      }
      const body = {
        filename: fileName,
        supplier,
        rowCount: rows.length,
        priceUpdates: preview.priceChanges.filter((c) => !skipPrice.has(c.id)).map((c) => ({ id: c.id, newCostCents: c.newCostCents })),
        addModels: preview.newModels.filter((n) => addNew.has(`${n.brand}|${n.model}`)),
        discontinueIds: Array.from(discontinue),
        successions: preview.successions.filter((s) => confirmSucc.has(s.fromId)).map((s) => ({ fromId: s.fromId, toModel: s.toModel, toCostCents: s.toCostCents })),
        fileBase64,
        fileMime,
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

  // Register what's on screen so Gibbs knows where the user is in the wizard.
  useEffect(() => {
    setGibbsPageContext(
      fileName
        ? `Package Pricing Management (Settings) — Price File Update tab. Supplier file loaded: "${fileName}" (${rows.length} rows, supplier ${supplier})${preview ? `; reviewing the diff: ${preview.totals.priceChanges} price changes, ${preview.totals.newModels} new models, ${preview.totals.missing} missing, ${preview.totals.successions} successions suggested` : "; mapping columns"}.`
        : "Package Pricing Management (Settings) — Price File Update tab. No supplier file uploaded yet.",
    );
  }, [fileName, rows.length, supplier, preview]);
  useEffect(() => () => setGibbsPageContext(null), []);

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
            {/* What this file would change, at a glance — plain numbers, no chips */}
            <div className="grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-5">
              {[
                { n: preview.totals.priceChanges, label: "Price changes" },
                { n: preview.totals.newModels, label: "New models" },
                { n: preview.totals.missing, label: "Missing" },
                { n: preview.totals.successions, label: "Successions" },
                { n: preview.totals.unchanged, label: "Unchanged" },
              ].map((s) => (
                <div key={s.label} className="px-3 py-2.5 text-center">
                  <p className={`text-xl font-bold tabular-nums ${s.n > 0 ? "text-slate-900" : "text-slate-300"}`}>{s.n.toLocaleString()}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>

            {preview.successions.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-[#711419]/25">
                <div className="border-b border-[#711419]/15 bg-[#711419]/[0.04] px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#711419]">
                    <ArrowLeftRight className="h-3.5 w-3.5" /> Model successions — confirm each swap
                  </p>
                </div>
                <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
                  {preview.successions.map((s) => (
                    <label key={s.fromId} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50">
                      <Checkbox checked={confirmSucc.has(s.fromId)} onCheckedChange={() => toggle(confirmSucc, setConfirmSucc, s.fromId)} data-testid={`succ-${s.fromId}`} />
                      <span className="font-mono text-xs text-slate-500">{s.fromModel}</span>
                      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="font-mono text-xs font-semibold">{s.toModel}</span>
                      <span className="ml-auto tabular-nums text-xs text-slate-500">{usd(s.oldCostCents)} → {usd(s.toCostCents)}</span>
                      <span className="w-16 text-right text-[11px] tabular-nums text-slate-400">{Math.round(s.confidence * 100)}% match</span>
                    </label>
                  ))}
                </div>
                <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                  Confirming swaps the model number inside every package that uses it — names, images, and your prices stay exactly as built.
                </p>
              </div>
            )}

            {preview.priceChanges.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <Checkbox
                    checked={skipPrice.size === 0 ? true : skipPrice.size === preview.priceChanges.length ? false : "indeterminate"}
                    onCheckedChange={() => setSkipPrice(skipPrice.size === 0 ? new Set(preview.priceChanges.map((c) => c.id)) : new Set())}
                    data-testid="price-select-all"
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Price changes</p>
                  <p className="ml-auto text-xs tabular-nums text-slate-400">
                    {(preview.priceChanges.length - skipPrice.size).toLocaleString()} of {preview.priceChanges.length.toLocaleString()} will be repriced
                  </p>
                </div>
                <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                  {preview.priceChanges.map((c) => {
                    const delta = c.newCostCents - c.oldCostCents;
                    const pct = c.oldCostCents > 0 ? Math.round((delta / c.oldCostCents) * 1000) / 10 : 0;
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50">
                        <Checkbox checked={!skipPrice.has(c.id)} onCheckedChange={() => toggle(skipPrice, setSkipPrice, c.id)} data-testid={`price-${c.id}`} />
                        <span className="font-mono text-xs font-medium">{c.model}</span>
                        <span className="ml-auto tabular-nums text-xs text-slate-400">{usd(c.oldCostCents)}</span>
                        <span className="text-xs text-slate-300">→</span>
                        <span className="w-20 text-right tabular-nums text-xs font-semibold text-slate-800">{usd(c.newCostCents)}</span>
                        <span className={`w-28 text-right tabular-nums text-[11px] font-medium ${delta > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {delta > 0 ? "+" : "−"}{usd(Math.abs(delta))} ({delta > 0 ? "+" : "−"}{Math.abs(pct)}%)
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {preview.newModels.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <Checkbox
                    checked={addNew.size === preview.newModels.length ? true : addNew.size > 0 ? "indeterminate" : false}
                    onCheckedChange={() => setAddNew(addNew.size === preview.newModels.length ? new Set() : new Set(preview.newModels.map((n) => `${n.brand}|${n.model}`)))}
                    data-testid="new-select-all"
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">New models</p>
                  <p className="ml-auto text-xs tabular-nums text-slate-400">
                    {addNew.size.toLocaleString()} of {preview.newModels.length.toLocaleString()} will be added
                  </p>
                </div>
                <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {preview.newModels.map((n) => {
                    const key = `${n.brand}|${n.model}`;
                    return (
                      <label key={key} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50">
                        <Checkbox checked={addNew.has(key)} onCheckedChange={() => toggle(addNew, setAddNew, key)} data-testid={`new-${n.model}`} />
                        <span className="shrink-0 font-mono text-xs font-medium">{n.model}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{n.description || ""}</span>
                        <span className="shrink-0 tabular-nums text-xs text-slate-600">{usd(n.costCents)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {preview.missingModels.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-amber-200">
                <div className="flex items-center gap-2.5 border-b border-amber-200 bg-amber-50/60 px-3 py-2">
                  <Checkbox
                    checked={discontinue.size === preview.missingModels.length ? true : discontinue.size > 0 ? "indeterminate" : false}
                    onCheckedChange={() => setDiscontinue(discontinue.size === preview.missingModels.length ? new Set() : new Set(preview.missingModels.map((m) => m.id)))}
                    data-testid="miss-select-all"
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">In your catalog, not in this file</p>
                  <p className="ml-auto text-xs tabular-nums text-amber-600/80">
                    {discontinue.size.toLocaleString()} of {preview.missingModels.length.toLocaleString()} will be marked discontinued
                  </p>
                </div>
                <div className="max-h-56 divide-y divide-amber-100/70 overflow-y-auto">
                  {preview.missingModels.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-amber-50/50">
                      <Checkbox checked={discontinue.has(m.id)} onCheckedChange={() => toggle(discontinue, setDiscontinue, m.id)} data-testid={`miss-${m.id}`} />
                      <span className="font-mono text-xs font-medium">{m.model}</span>
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
            Applied: {String(applied.priced)} repriced · {String(applied.added)} added · {String(applied.discontinued)} discontinued · {String(applied.successions)} successions ({String(applied.packagesTouched)} package component swaps). See Package Equipment on the Equipment Catalog tab, and Cost Drift under Packages &amp; Pricing.
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
                  {h.hasFile && (
                    <a
                      href={`/api/crm/pricebook-import/${h.id}/file`}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#711419]"
                      title="Download the exact file that was uploaded"
                      data-testid={`import-download-${h.id}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
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
  totalInvestment: number; monthlyPayment: number | null; currentComponentCostCents: number; costBasisCents: number | null;
  costBasisAt: string | null; driftCents: number | null; matchedCount: number; unmatchedModels: string[];
  parts: Array<{ slot: string; name: string | null; model: string; costCents: number | null }>;
};

// ─────────────────────────── Job cost model ───────────────────────────

type CostModel = {
  laborHours: number;
  laborRatePerHour: number;
  laborHoursByUnitType: Record<string, number>;
  materialsPctOfEquipment: number;
  commissionPctOfPrice: number;
  buydownPctOfPrice: number;
  overheadPctOfPrice: number;
  targetMarginPct: number;
};

/** Six shop-level numbers — not a per-package spreadsheet. Controlled by
 *  CostsAndCatalogTab so edits preview LIVE in the Package Equipment
 *  breakdowns above before they're saved. Estimates only: nothing here
 *  ever changes a price. */
export function JobCostModelCard({ packages, model, dirty, onChange, onSaved }: {
  packages: any[] | undefined;
  model: CostModel | null;
  dirty: boolean;
  onChange: (m: CostModel) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const unitTypes = useMemo(
    () => Array.from(new Set((packages || []).map((p: any) => p.unitType).filter(Boolean))).sort() as string[],
    [packages],
  );

  const save = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/crm/cost-model", model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/cost-model"] });
      onSaved();
      toast({ title: "Cost model saved", description: "These numbers now drive every estimate — including Gibbs'." });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save the cost model", variant: "destructive" }),
  });

  const set = (patch: Partial<CostModel>) => { if (model) onChange({ ...model, ...patch }); };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Cost Model</CardTitle>
        <CardDescription>
          The shop-level numbers behind the cost breakdowns above. Change one and the cards update
          instantly as a preview — Save makes it stick for everyone, including Gibbs. Estimates only:
          nothing here ever changes a price.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!model ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ["laborHours", "Install labor — crew hours", "hrs"],
                ["laborRatePerHour", "Loaded labor rate", "$/hr"],
                ["materialsPctOfEquipment", "Materials & misc", "% of equipment"],
                ["commissionPctOfPrice", "Sales commission", "% of price"],
                ["buydownPctOfPrice", "Financing buydown (dealer fee)", "% of price"],
                ["overheadPctOfPrice", "Overhead", "% of price"],
                ["targetMarginPct", "Target profit margin", "% of price"],
              ] as Array<[keyof CostModel, string, string]>).map(([key, label, unit]) => (
                <div key={key}>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">{label}</p>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" min="0" step="0.5"
                      value={String(model[key] as number)}
                      onChange={(e) => set({ [key]: parseFloat(e.target.value) || 0 } as Partial<CostModel>)}
                      className="h-9 w-24"
                      data-testid={`costmodel-${key}`}
                    />
                    <span className="text-[11px] text-slate-400">{unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {unitTypes.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                  Crew hours by system type <span className="text-slate-400">(blank = {model.laborHours} hrs default)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {unitTypes.map((u) => (
                    <div key={u} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5">
                      <span className="text-xs font-medium text-slate-600">{u}</span>
                      <Input
                        type="number" min="0" step="0.5"
                        value={model.laborHoursByUnitType[u] ?? ""}
                        placeholder={String(model.laborHours)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          const map = { ...model.laborHoursByUnitType };
                          if (Number.isFinite(v) && v > 0) map[u] = v;
                          else delete map[u];
                          set({ laborHoursByUnitType: map });
                        }}
                        className="h-8 w-20"
                        data-testid={`costmodel-hours-${u}`}
                      />
                      <span className="text-[10px] text-slate-400">hrs</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || !dirty}
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="costmodel-save"
              >
                {save.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save cost model"}
              </Button>
              {dirty && <span className="text-xs font-medium text-amber-600">Previewing above — save to keep.</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The whole Costs & Catalog tab: package equipment (with drift + pricing
 *  baked in), the live-preview cost model beneath it, and the raw catalog.
 *  Owns the cost-model draft so edits preview instantly in the cards. */
export function CostsAndCatalogTab({ packages }: { packages: any[] | undefined }) {
  const { data: savedModel } = useQuery<CostModel>({ queryKey: ["/api/crm/cost-model"] });
  const [draft, setDraft] = useState<CostModel | null>(null);
  const model = draft ?? savedModel ?? null;
  return (
    <div className="space-y-6">
      <PackageEquipmentCard packages={packages} costModel={model} />
      <JobCostModelCard packages={packages} model={model} dirty={!!draft} onChange={setDraft} onSaved={() => setDraft(null)} />
      <EquipmentCatalogCard />
    </div>
  );
}

// ─────────────────────────── Package equipment map ───────────────────────────

/** The connective view: every proposal-builder package, the exact models
 *  inside it, what each costs from the catalog TODAY — with cost drift and
 *  repricing baked in. Middle column = the package (equipment images +
 *  financing math); right rail = the cost breakdown alone. */
export function PackageEquipmentCard({ packages, costModel }: { packages: any[] | undefined; costModel: CostModel | null }) {
  const { toast } = useToast();
  const [previewPkg, setPreviewPkg] = useState<any | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [unitFilter, setUnitFilter] = useState("all");
  const [pkgSearch, setPkgSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [monthlyInput, setMonthlyInput] = useState("");
  const [fixOpen, setFixOpen] = useState(false);
  const [fixFilter, setFixFilter] = useState("");
  const [slotEdit, setSlotEdit] = useState<(typeof SLOT_DEFS)[number] | null>(null);
  const { data: drift = [], isLoading } = useQuery<DriftRow[]>({
    queryKey: ["/api/crm/pricebook-drift"],
  });
  const byId = useMemo(() => new Map((packages || []).map((p: any) => [p.id, p])), [packages]);

  const rebaseline = useMutation({
    mutationFn: async ({ id, totalInvestmentCents, monthlyPaymentCents }: { id: string; totalInvestmentCents?: number; monthlyPaymentCents?: number }) =>
      apiRequest("POST", `/api/crm/pricebook-drift/${id}/rebaseline`, { totalInvestmentCents, monthlyPaymentCents }),
    onSuccess: () => {
      setPricingOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/packages"] });
      toast({ title: "Package updated" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't update the package", variant: "destructive" }),
  });

  const LEVEL_ORDER: Record<string, number> = { Best: 0, Better: 1, Good: 2, Budget: 3 };
  const sorted = useMemo(
    () =>
      [...drift].sort(
        (a, b) =>
          a.unitType.localeCompare(b.unitType) ||
          a.tier.localeCompare(b.tier) ||
          (parseFloat(a.tonnage) || 0) - (parseFloat(b.tonnage) || 0) ||
          (LEVEL_ORDER[a.packageLevel] ?? 9) - (LEVEL_ORDER[b.packageLevel] ?? 9),
      ),
    [drift],
  );
  const unitTypes = useMemo(() => Array.from(new Set(sorted.map((d) => d.unitType))), [sorted]);
  const shown = useMemo(() => {
    const q = pkgSearch.trim().toLowerCase();
    return sorted.filter(
      (d) =>
        (unitFilter === "all" || d.unitType === unitFilter) &&
        (!q ||
          `${d.unitType} ${d.tier} ${d.tonnage} ${d.packageLevel}`.toLowerCase().includes(q) ||
          d.parts.some((pt) => pt.model.toLowerCase().includes(q) || (pt.name || "").toLowerCase().includes(q))),
    );
  }, [sorted, unitFilter, pkgSearch]);
  const groups = useMemo(() => {
    const m = new Map<string, DriftRow[]>();
    for (const d of shown) {
      if (!m.has(d.unitType)) m.set(d.unitType, []);
      m.get(d.unitType)!.push(d);
    }
    return Array.from(m.entries());
  }, [shown]);
  const selected = shown.find((d) => d.id === selectedId) || shown[0] || null;
  const selPkg = selected ? byId.get(selected.id) : null;
  const unbaselined = drift.filter((d) => d.costBasisCents == null && d.matchedCount > 0);
  const drifted = !!selected && selected.driftCents != null && Math.abs(selected.driftCents) >= 100;
  const unmatchedDistinct = useMemo(() => {
    const s = new Set<string>();
    for (const d of drift) for (const m of d.unmatchedModels) s.add(m.toLowerCase());
    return s.size;
  }, [drift]);

  const slotImage = (slot: string) =>
    slot === "Outdoor" ? selPkg?.outdoorImageUrl :
    slot === "Coil" ? selPkg?.coilImageUrl :
    slot === "Indoor heat" ? selPkg?.furnaceImageUrl :
    selPkg?.thermostatImageUrl;

  const equipPct = selected && selected.totalInvestment > 0
    ? Math.min(100, Math.round((selected.currentComponentCostCents / selected.totalInvestment) * 100))
    : 0;

  // Full estimated waterfall from the Job Cost Model. Mirrors the server math
  // in Gibbs' package_economics tool — keep the two in step.
  const econ = useMemo(() => {
    if (!selected || !costModel) return null;
    const price = selected.totalInvestment;
    const equip = selected.currentComponentCostCents;
    const hours = Number(costModel.laborHoursByUnitType?.[selected.unitType] ?? costModel.laborHours) || 0;
    const labor = Math.round(hours * costModel.laborRatePerHour * 100);
    const materials = Math.round((equip * costModel.materialsPctOfEquipment) / 100);
    const commission = Math.round((price * costModel.commissionPctOfPrice) / 100);
    const buydown = Math.round((price * costModel.buydownPctOfPrice) / 100);
    const overhead = Math.round((price * costModel.overheadPctOfPrice) / 100);
    const profit = price - equip - labor - materials - commission - buydown - overhead;
    const marginPct = price > 0 ? Math.round((profit / price) * 1000) / 10 : 0;
    const denom = 1 - (costModel.commissionPctOfPrice + costModel.buydownPctOfPrice + costModel.overheadPctOfPrice + costModel.targetMarginPct) / 100;
    const suggested = denom > 0.05 ? Math.round((equip + labor + materials) / denom) : null;
    const segs = [
      { label: "Equipment", cents: equip, color: "#711419" },
      { label: "Labor", cents: labor, color: "#475569" },
      { label: "Materials", cents: materials, color: "#94a3b8" },
      { label: "Commission", cents: commission, color: "#b45309" },
      { label: "Buydown", cents: buydown, color: "#0369a1" },
      { label: "Overhead", cents: overhead, color: "#cbd5e1" },
    ];
    return { price, hours, labor, materials, commission, buydown, overhead, profit, marginPct, suggested, segs };
  }, [selected, costModel]);

  // Register what's on screen so Gibbs can resolve "this package".
  useEffect(() => {
    if (!selected) {
      setGibbsPageContext("Package Pricing Management (Settings) — Costs & Catalog tab. No package selected yet.");
      return;
    }
    const partsLine = selected.parts.map((pt) => `${pt.slot}: ${pt.model}${pt.costCents == null ? " (not in catalog)" : ""}`).join("; ");
    const econLine = econ && costModel
      ? ` Estimated: equipment ${usd(selected.currentComponentCostCents)}, labor ${usd(econ.labor)}, profit ${usd(econ.profit)} (${econ.marginPct}% margin vs ${costModel.targetMarginPct}% target).`
      : "";
    const driftLine = selected.driftCents != null && Math.abs(selected.driftCents) >= 100
      ? ` Equipment cost drift since last priced: ${selected.driftCents > 0 ? "+" : "-"}${usd(Math.abs(selected.driftCents))}.`
      : "";
    setGibbsPageContext(
      `Package Pricing Management (Settings) — Costs & Catalog tab, Package Equipment. Selected package: ${selected.unitType} ${selected.tier} ${selected.tonnage}T ${selected.packageLevel}, price ${usd(selected.totalInvestment)}. Components — ${partsLine}.${econLine}${driftLine} ${unmatchedDistinct} distinct unmatched model string(s) across all packages (the Fix Matches workbench handles them).`,
    );
  }, [selected, econ, costModel, unmatchedDistinct]);
  useEffect(() => () => setGibbsPageContext(null), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Package Equipment</CardTitle>
        <CardDescription>
          Every package your proposal builder can quote — the equipment inside it, the financing story,
          and the full cost breakdown, costed live from the catalog below. Cost drift shows here the
          moment a supplier file moves a price, and repricing happens right on the breakdown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            No active packages in the proposal builder yet.
          </p>
        ) : (
          <>
            {unbaselined.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 text-sm text-blue-800">
                <span>{unbaselined.length} package{unbaselined.length === 1 ? " has" : "s have"} matched costs but no baseline yet.</span>
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
            <div className="flex flex-wrap items-center gap-2">
              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger className="h-9 w-44" data-testid="pkgequip-unit-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All system types</SelectItem>
                  {unitTypes.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              {unmatchedDistinct > 0 && (
                <Button
                  size="sm" variant="outline"
                  className="h-9 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  onClick={() => { setFixFilter(""); setFixOpen(true); }}
                  data-testid="pkgequip-fixmatches"
                >
                  Fix matches ({unmatchedDistinct})
                </Button>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={pkgSearch} onChange={(e) => setPkgSearch(e.target.value)} placeholder="Search package or model" className="h-9 w-60 pl-8" data-testid="pkgequip-search" />
              </div>
              <span className="ml-auto text-xs text-slate-400">{shown.length} package{shown.length === 1 ? "" : "s"}</span>
            </div>

            <div className="flex gap-4 max-lg:flex-col lg:min-h-[560px]">
              {/* Package list — stretches level with the tallest column */}
              <div className="w-64 shrink-0 max-lg:w-full lg:relative">
                <div className="overflow-y-auto rounded-lg border border-slate-200 max-lg:max-h-72 lg:absolute lg:inset-0">
                  {groups.map(([unit, rows]) => (
                    <div key={unit}>
                      <p className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{unit}</p>
                      {rows.map((d) => {
                        const active = selected?.id === d.id;
                        const rowDrift = d.driftCents != null && Math.abs(d.driftCents) >= 100;
                        return (
                          <button
                            key={d.id}
                            onClick={() => { setSelectedId(d.id); setPricingOpen(false); }}
                            className={`block w-full border-b border-slate-100 border-l-2 px-3 py-2 text-left transition-colors ${
                              active ? "border-l-[#711419] bg-[#711419]/[0.04]" : "border-l-transparent hover:bg-slate-50"
                            }`}
                            data-testid={`pkgequip-item-${d.id}`}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={`truncate text-sm ${active ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                                {d.tier} · {d.tonnage}T · {d.packageLevel}
                              </span>
                              <span className="shrink-0 tabular-nums text-xs text-slate-500">{usd(d.totalInvestment)}</span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                              {d.matchedCount > 0 ? <>Equipment {usd(d.currentComponentCostCents)}</> : "No catalog match yet"}
                              {rowDrift && (
                                <span className={`font-medium tabular-nums ${d.driftCents! > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                  {d.driftCents! > 0 ? "+" : "−"}{usd(Math.abs(d.driftCents!))}
                                </span>
                              )}
                              {d.unmatchedModels.length > 0 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title={`${d.unmatchedModels.length} component(s) not in catalog`} />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {shown.length === 0 && (
                    <p className="px-3 py-8 text-center text-sm text-slate-400">No packages match.</p>
                  )}
                </div>
              </div>

              {selected ? (
                <>
                  {/* The package itself + its financing story */}
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="space-y-4 rounded-lg border border-slate-200 p-4" data-testid={`pkgequip-detail-${selected.id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {selected.unitType}
                            <button
                              onClick={() => { setPreviewPkg(selPkg || selected); setPreviewOpen(true); }}
                              className="rounded p-0.5 text-slate-300 transition-colors hover:text-[#711419]"
                              title="Preview as the proposal builder shows it"
                              data-testid={`pkgequip-preview-${selected.id}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </p>
                          <p className="text-lg font-bold text-slate-900">{selected.tier} · {selected.tonnage} Ton · {selected.packageLevel}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Your price</p>
                          <p className="text-2xl font-bold tabular-nums text-[#711419]">{usd(selected.totalInvestment)}</p>
                          {selected.monthlyPayment != null && selected.monthlyPayment > 0 && (
                            <p className="text-xs tabular-nums text-slate-500">as low as {usd(selected.monthlyPayment)}/mo</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {SLOT_DEFS.map((def) => {
                          const part = selected.parts.find((pt) => pt.slot === def.label);
                          if (!part) {
                            return (
                              <button
                                key={def.key}
                                onClick={() => setSlotEdit(def)}
                                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-2.5 text-xs text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600"
                                data-testid={`pkgequip-addslot-${def.key}`}
                              >
                                <Plus className="h-3.5 w-3.5" /> Add {def.label.toLowerCase()}
                              </button>
                            );
                          }
                          const img = slotImage(part.slot);
                          return (
                            <div key={def.key} className="group relative flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                              <button
                                onClick={() => setSlotEdit(def)}
                                className="absolute right-1.5 top-1.5 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                                title={`Edit the ${def.label.toLowerCase()} card`}
                                data-testid={`pkgequip-editslot-${def.key}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                                {img ? <img src={img} alt={part.slot} className="h-12 w-12 object-contain" /> : <Boxes className="h-5 w-5 text-slate-300" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{part.slot}</p>
                                <p className="truncate text-sm font-medium text-slate-800">{part.name || part.model}</p>
                                {part.name && part.name !== part.model && (
                                  <p className="truncate font-mono text-[11px] text-slate-400">{part.model}</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                {part.costCents != null ? (
                                  <p className="tabular-nums text-sm font-semibold text-slate-800">{usd(part.costCents)}</p>
                                ) : (
                                  <button
                                    onClick={() => { setFixFilter(part.model); setFixOpen(true); }}
                                    className="text-[11px] font-medium text-amber-600 hover:underline"
                                    title="Fix this model's catalog match"
                                  >
                                    not in catalog
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {selPkg?.accessoryModels && (
                        <p className="text-xs text-slate-500">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Accessories</span>{" "}
                          {selPkg.accessoryModels}
                        </p>
                      )}
                    </div>

                    {selected.totalInvestment > 0 && (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <p className="border-b border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Financing math</p>
                        <div className="divide-y divide-slate-100 px-3.5 text-sm">
                          {selected.monthlyPayment != null && selected.monthlyPayment > 0 ? (
                            <>
                              <div className="flex items-baseline justify-between gap-3 py-2.5">
                                <span className="text-slate-600">"As low as" on the package card</span>
                                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{usd(selected.monthlyPayment)}/mo</span>
                              </div>
                              <div className="flex items-baseline justify-between gap-3 py-2.5">
                                <span className="text-slate-600">What that works out to</span>
                                <span className="shrink-0 tabular-nums text-slate-700">
                                  {((selected.monthlyPayment / selected.totalInvestment) * 100).toFixed(2)}%/mo of price
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="py-2.5 text-slate-500">No monthly payment stored on this package.</div>
                          )}
                          <div className="py-2.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-slate-600">GreenSky estimate</span>
                              <span className="shrink-0 tabular-nums text-slate-700">${monthlyFinancing(selected.totalInvestment / 100).toLocaleString()}/mo</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400">{FINANCING_LABEL} · what quotes &amp; proposals show</p>
                          </div>
                          {selected.monthlyPayment != null && selected.monthlyPayment > 0 && monthlyFinancing(selected.totalInvestment / 100) > 0 &&
                            Math.abs(selected.monthlyPayment / 100 - monthlyFinancing(selected.totalInvestment / 100)) > monthlyFinancing(selected.totalInvestment / 100) * 0.05 && (
                            <div className="py-2.5">
                              <p className="text-[11px] text-amber-600">
                                The stored monthly is more than 5% off the GreenSky estimate customers see on quotes — worth aligning next time you reprice.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right rail — the cost breakdown, drift + repricing included */}
                  <div className="w-80 shrink-0 max-lg:w-full">
                    {selected.matchedCount > 0 && econ && costModel ? (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <p className="border-b border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cost breakdown — estimate</p>
                        <div className="divide-y divide-slate-100 px-3.5 text-sm">
                          <div className="flex items-baseline justify-between gap-3 py-2.5">
                            <span className="text-slate-600">Your price</span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{usd(econ.price)}</span>
                          </div>
                          {selected.costBasisCents != null ? (
                            drifted && (
                              <div className="py-2.5">
                                <div className="flex items-baseline justify-between gap-3">
                                  <span className="text-slate-600">Equipment drift since priced</span>
                                  <span className={`shrink-0 font-semibold tabular-nums ${selected.driftCents! > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                    {selected.driftCents! > 0 ? "+" : "−"}{usd(Math.abs(selected.driftCents!))}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[11px] text-slate-400">Components cost {usd(selected.costBasisCents)} when this price was set.</p>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center justify-between gap-3 py-2.5">
                              <span className="text-[11px] text-slate-400">No cost baseline yet.</span>
                              <button
                                onClick={() => rebaseline.mutate({ id: selected.id })}
                                className="text-[11px] font-medium text-[#711419] hover:underline"
                                data-testid={`pkgequip-baseline-${selected.id}`}
                              >
                                Baseline at today's costs
                              </button>
                            </div>
                          )}
                          {[
                            { label: "Equipment", sub: `live from catalog · ${equipPct}%`, cents: selected.currentComponentCostCents },
                            { label: "Labor", sub: `${econ.hours} hrs × $${costModel.laborRatePerHour}/hr`, cents: econ.labor },
                            { label: "Materials & misc", sub: `${costModel.materialsPctOfEquipment}% of equipment`, cents: econ.materials },
                            { label: "Commission", sub: `${costModel.commissionPctOfPrice}% of price`, cents: econ.commission },
                            { label: "Financing buydown", sub: `${costModel.buydownPctOfPrice}% of price`, cents: econ.buydown },
                            { label: "Overhead", sub: `${costModel.overheadPctOfPrice}% of price`, cents: econ.overhead },
                          ].map((r) => (
                            <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
                              <span className="min-w-0">
                                <span className="text-slate-600">{r.label}</span>
                                <span className="ml-1.5 text-[10px] text-slate-400">{r.sub}</span>
                              </span>
                              <span className="shrink-0 tabular-nums text-slate-700">− {usd(r.cents)}</span>
                            </div>
                          ))}
                          <div className="py-2.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium text-slate-800">Estimated profit</span>
                              <span className={`shrink-0 font-semibold tabular-nums ${econ.profit < 0 ? "text-red-600" : econ.marginPct >= costModel.targetMarginPct ? "text-emerald-700" : "text-amber-600"}`}>
                                {usd(econ.profit)}<span className="ml-1.5 text-[11px] font-normal">({econ.marginPct}%)</span>
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              Target {costModel.targetMarginPct}% · {econ.marginPct >= costModel.targetMarginPct ? "on target" : `${(costModel.targetMarginPct - econ.marginPct).toFixed(1)}% below target`}
                            </p>
                            <div className="mt-2 flex h-2.5 overflow-hidden bg-emerald-300">
                              {econ.segs.map((s) => (
                                <div key={s.label} style={{ width: `${Math.max(0, (s.cents / Math.max(econ.price, econ.price - econ.profit)) * 100)}%`, background: s.color }} title={`${s.label} ${usd(s.cents)}`} />
                              ))}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                              {econ.segs.map((s) => (
                                <span key={s.label} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} /> {s.label}</span>
                              ))}
                              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Profit</span>
                            </div>
                            {selected.unmatchedModels.length > 0 && (
                              <p className="mt-1.5 text-[11px] text-amber-600">
                                {selected.unmatchedModels.length} component{selected.unmatchedModels.length === 1 ? " is" : "s are"} not in the catalog yet — equipment is understated and profit overstated.
                              </p>
                            )}
                          </div>
                          {econ.suggested != null && (
                            <div className="py-2.5">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="text-slate-600">Suggested at {costModel.targetMarginPct}% margin</span>
                                <span className="shrink-0 font-medium tabular-nums text-slate-800">{usd(econ.suggested)}</span>
                              </div>
                              <p className={`mt-0.5 text-[11px] ${econ.price >= econ.suggested ? "text-emerald-700" : "text-amber-600"}`}>
                                {econ.price >= econ.suggested
                                  ? `Your price sits ${usd(econ.price - econ.suggested)} above the suggested price.`
                                  : `Your price sits ${usd(econ.suggested - econ.price)} below the suggested price.`}
                              </p>
                            </div>
                          )}
                          <div className="py-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm" variant="outline" className="h-8"
                                onClick={() => { setPriceInput(((selected.totalInvestment || 0) / 100).toFixed(0)); setMonthlyInput(""); setPricingOpen(true); }}
                                data-testid={`pkgequip-setprice-${selected.id}`}
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Set price…
                              </Button>
                              {drifted && (
                                <Button
                                  size="sm" variant="ghost" className="h-8 text-slate-500"
                                  onClick={() => rebaseline.mutate({ id: selected.id })}
                                  disabled={rebaseline.isPending}
                                  title="Keep the current price; accept today's costs as the new baseline"
                                  data-testid={`pkgequip-keep-${selected.id}`}
                                >
                                  Keep price
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                        The cost breakdown appears once this package's models match the Equipment Catalog below.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="flex-1 rounded-lg border border-dashed border-slate-300 py-16 text-center text-sm text-slate-400">
                  Pick a package to see its breakdown.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Set price — its own dialog so repricing never shifts the rail layout */}
      <Dialog open={pricingOpen} onOpenChange={(o) => { if (!o) setPricingOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set price{selected ? ` — ${selected.tier} · ${selected.tonnage}T · ${selected.packageLevel}` : ""}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[11px] font-medium text-slate-500">Total investment ($)</p>
                <Input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} type="number" min="0" className="h-9" autoFocus data-testid={`pkgequip-price-input-${selected.id}`} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-slate-500">Monthly — "as low as" ($/mo)</p>
                <Input value={monthlyInput} onChange={(e) => setMonthlyInput(e.target.value)} type="number" min="0" placeholder="Leave blank to keep current" className="h-9" data-testid={`pkgequip-monthly-input-${selected.id}`} />
                {parseFloat(priceInput) > 0 && (
                  <button
                    type="button"
                    onClick={() => setMonthlyInput(String(monthlyFinancing(parseFloat(priceInput))))}
                    className="mt-1 text-[11px] font-medium text-slate-400 hover:text-[#711419]"
                    data-testid={`pkgequip-suggest-${selected.id}`}
                  >
                    suggest ${monthlyFinancing(parseFloat(priceInput)).toLocaleString()}/mo ({FINANCING_LABEL})
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">Saving also re-baselines today's component costs, so drift starts fresh.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPricingOpen(false)}>Cancel</Button>
                <Button
                  className="bg-[#711419] hover:bg-[#8a1a1f]"
                  disabled={rebaseline.isPending || !(parseFloat(priceInput) > 0)}
                  onClick={() => rebaseline.mutate({
                    id: selected.id,
                    totalInvestmentCents: Math.round(parseFloat(priceInput) * 100),
                    monthlyPaymentCents: monthlyInput ? Math.round(parseFloat(monthlyInput) * 100) : undefined,
                  })}
                  data-testid={`pkgequip-saveprice-${selected.id}`}
                >
                  {rebaseline.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save price"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* previewPkg stays set through the close animation so the card doesn't
          blank out mid-exit */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) setPreviewOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Proposal preview</DialogTitle>
          </DialogHeader>
          {previewPkg && <PackagePreviewCard pkg={previewPkg} />}
        </DialogContent>
      </Dialog>

      <FixMatchesDialog open={fixOpen} onClose={() => setFixOpen(false)} initialFilter={fixFilter} />

      {slotEdit && selected && (
        <SlotEditDialog
          key={`${selected.id}-${slotEdit.key}`}
          slot={slotEdit}
          pkg={selPkg || selected}
          packageId={selected.id}
          onClose={() => setSlotEdit(null)}
        />
      )}
    </Card>
  );
}

// ─────────────────────────── Per-slot card editor ───────────────────────────

const SLOT_DEFS = [
  { key: "outdoor", label: "Outdoor", modelField: "outdoorModel", nameField: "outdoorName", imageField: "outdoorImageUrl" },
  { key: "coil", label: "Coil", modelField: "coilModel", nameField: "coilName", imageField: "coilImageUrl" },
  { key: "indoorHeat", label: "Indoor heat", modelField: "indoorHeatModel", nameField: "indoorHeatName", imageField: "furnaceImageUrl" },
  { key: "thermostat", label: "Thermostat", modelField: "thermostatModel", nameField: "thermostatName", imageField: "thermostatImageUrl" },
] as const;

/** Edit one equipment card on one package: the model number, the description
 *  shown on proposals, and the image. Prices never change here. */
function SlotEditDialog({ slot, pkg, packageId, onClose }: {
  slot: (typeof SLOT_DEFS)[number];
  pkg: any;
  packageId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [model, setModel] = useState(String(pkg?.[slot.modelField] || ""));
  const [name, setName] = useState(String(pkg?.[slot.nameField] || ""));
  const [imageUrl, setImageUrl] = useState(String(pkg?.[slot.imageField] || ""));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const r = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await r.json();
      const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error("Upload failed");
      setImageUrl(objectPath);
    } catch (e: any) {
      toast({ title: e?.message || "Couldn't upload that image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/pricebook/packages/${packageId}/slots`, {
        [slot.modelField]: model,
        [slot.nameField]: name,
        [slot.imageField]: imageUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/package-unmatched-models"] });
      toast({ title: `${slot.label} card updated` });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save the card", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {slot.label.toLowerCase()} card</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">Model number</p>
            <Input value={model} onChange={(e) => setModel(e.target.value)} className="h-9 font-mono text-sm" placeholder="e.g. 4TWX8036A1000A" data-testid="slotedit-model" />
            <p className="mt-1 text-[10px] text-slate-400">Costing comes from matching this against the Equipment Catalog.</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">Description <span className="text-slate-400">(what proposals show)</span></p>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" placeholder="e.g. XV18 Variable Speed Heat Pump" data-testid="slotedit-name" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">Image</p>
            <div className="flex items-center gap-2.5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                {imageUrl ? <img src={imageUrl} alt="" className="h-14 w-14 object-contain" /> : <Boxes className="h-5 w-5 text-slate-300" />}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
                data-testid="slotedit-file"
              />
              <Button size="sm" variant="outline" className="h-8" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid="slotedit-upload">
                {uploading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading…</> : imageUrl ? "Replace image" : "Upload image"}
              </Button>
              {imageUrl && (
                <Button size="sm" variant="ghost" className="h-8 text-slate-500" onClick={() => setImageUrl("")} data-testid="slotedit-removeimg">
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Changes what this card shows here and on proposals — the package price never moves.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={save.isPending || uploading}
              onClick={() => save.mutate()}
              data-testid="slotedit-save"
            >
              {save.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save card"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── Fix matches workbench ───────────────────────────

type UnmatchedRow = {
  fromModel: string; count: number; slots: string[]; samplePackages: string[];
  suggestions: Array<{ id: string; brand: string; model: string; description: string | null; costCents: number; score: number }>;
};
type FixChoice = { include: boolean; kind: "map" | "clear" | "add" | "skip" | "search"; toModel?: string; addBrand?: string; addCost?: string; search?: string };

/** Every unmatched model string, one clear decision per row — map it to a
 *  catalog model, add it to the catalog, clear junk, or skip. One Apply
 *  runs the whole batch. Names, images, and prices never change. */
function FixMatchesDialog({ open, onClose, initialFilter }: { open: boolean; onClose: () => void; initialFilter: string }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [choices, setChoices] = useState<Record<string, FixChoice>>({});
  const { data: rows = [], isLoading } = useQuery<UnmatchedRow[]>({
    queryKey: ["/api/crm/package-unmatched-models"],
    enabled: open,
  });
  const { data: catalogData } = useQuery<{ models: CatalogModel[]; brands: string[] }>({
    queryKey: ["/api/crm/equipment-catalog"],
    enabled: open,
  });
  const catalog = catalogData?.models || [];

  useEffect(() => { if (open) setFilter(initialFilter); }, [open, initialFilter]);

  // Default decisions: a confident suggestion arrives pre-checked; a weaker
  // one is pre-picked but unchecked; no suggestion starts at Skip.
  useEffect(() => {
    if (rows.length === 0) return;
    setChoices((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const k = r.fromModel.toLowerCase();
        if (next[k]) continue;
        const top = r.suggestions[0];
        if (top && top.score >= 0.75) next[k] = { include: true, kind: "map", toModel: top.model };
        else if (top) next[k] = { include: false, kind: "map", toModel: top.model };
        else next[k] = { include: false, kind: "skip" };
      }
      return next;
    });
  }, [rows]);

  const setChoice = (key: string, patch: Partial<FixChoice>) =>
    setChoices((p) => ({ ...p, [key]: { ...(p[key] || { include: false, kind: "skip" as const }), ...patch } }));

  const shownRows = rows.filter((r) => !filter.trim() || r.fromModel.toLowerCase().includes(filter.trim().toLowerCase()));

  const rowValid = (r: UnmatchedRow, c: FixChoice | undefined): boolean => {
    if (!c || !c.include) return false;
    if (c.kind === "map") return !!c.toModel;
    if (c.kind === "clear") return true;
    if (c.kind === "add") return !!(c.addBrand || "").trim() && parseFloat(c.addCost || "") > 0;
    return false;
  };
  const selected = rows.filter((r) => rowValid(r, choices[r.fromModel.toLowerCase()]));
  const kindOf = (r: UnmatchedRow) => choices[r.fromModel.toLowerCase()]?.kind;
  const counts = {
    map: selected.filter((r) => kindOf(r) === "map").length,
    clear: selected.filter((r) => kindOf(r) === "clear").length,
    add: selected.filter((r) => kindOf(r) === "add").length,
  };

  const applyFixes = useMutation({
    mutationFn: async () => {
      // Adds first — a model added under the exact same string matches
      // every package automatically, no remap needed.
      for (const r of selected) {
        const c = choices[r.fromModel.toLowerCase()];
        if (c.kind === "add") {
          await apiRequest("POST", "/api/crm/equipment-catalog", {
            brand: (c.addBrand || "").trim(),
            model: r.fromModel,
            costCents: Math.round(parseFloat(c.addCost || "0") * 100),
          });
        }
      }
      const mappings = selected
        .map((r) => ({ r, c: choices[r.fromModel.toLowerCase()] }))
        .filter(({ c }) => c.kind === "map" || c.kind === "clear")
        .map(({ r, c }) => (c.kind === "clear" ? { fromModel: r.fromModel, clear: true } : { fromModel: r.fromModel, toModel: c.toModel }));
      if (mappings.length > 0) {
        const res = await apiRequest("POST", "/api/crm/package-model-remap", { mappings });
        return res.json();
      }
      return null;
    },
    onSuccess: () => {
      setChoices({});
      queryClient.invalidateQueries({ queryKey: ["/api/crm/package-unmatched-models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/equipment-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/packages"] });
      toast({ title: "Matches fixed", description: "Those packages now cost their equipment from the catalog." });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't apply the fixes", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fix unmatched models</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-slate-500">
          Each row is a model your packages reference that the catalog doesn't know. Pick what to do —
          the fix applies to every package using it. Names, images, and prices never change.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter models" className="h-9 pl-8" data-testid="fixmatches-filter" />
          </div>
          <span className="text-xs tabular-nums text-slate-400">{shownRows.length} of {rows.length}</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
            Everything matches — every package model is in the catalog.
          </p>
        ) : (
          <div className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {shownRows.map((r) => {
              const key = r.fromModel.toLowerCase();
              const c = choices[key] || { include: false, kind: "skip" as const };
              const selectValue = c.kind === "map" && c.toModel ? `map:${c.toModel}` : c.kind;
              const searchTerm = (c.search || "").trim().toLowerCase();
              const searchResults = searchTerm
                ? catalog.filter((m) => !m.isDiscontinued && (m.model.toLowerCase().includes(searchTerm) || (m.description || "").toLowerCase().includes(searchTerm))).slice(0, 8)
                : [];
              const mapTarget = c.kind === "map" && c.toModel ? catalog.find((m) => m.model === c.toModel) : null;
              return (
                <div key={key} className="px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Checkbox
                      checked={c.include}
                      disabled={c.kind === "skip" || c.kind === "search"}
                      onCheckedChange={() => setChoice(key, { include: !c.include })}
                      data-testid={`fixmatch-check-${r.fromModel}`}
                    />
                    <span className="font-mono text-xs font-medium">{r.fromModel}</span>
                    <span className="text-[11px] text-slate-400" title={r.samplePackages.join(", ")}>
                      {r.count} package{r.count === 1 ? "" : "s"} · {r.slots.join(", ")}
                    </span>
                    <div className="ml-auto w-72 max-sm:w-full">
                      <Select
                        value={selectValue}
                        onValueChange={(v) => {
                          if (v.startsWith("map:")) setChoice(key, { kind: "map", toModel: v.slice(4), include: true });
                          else if (v === "clear") setChoice(key, { kind: "clear", include: true });
                          else if (v === "add") setChoice(key, { kind: "add", include: true });
                          else if (v === "search") setChoice(key, { kind: "search", include: false });
                          else setChoice(key, { kind: "skip", include: false });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid={`fixmatch-select-${r.fromModel}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {r.suggestions.map((s) => (
                            <SelectItem key={s.model} value={`map:${s.model}`}>
                              {s.model} · {Math.round(s.score * 100)}% match
                            </SelectItem>
                          ))}
                          <SelectItem value="search">Search the catalog…</SelectItem>
                          <SelectItem value="add">Add to catalog as a new model…</SelectItem>
                          <SelectItem value="clear">Remove from packages (not equipment)</SelectItem>
                          <SelectItem value="skip">Skip for now</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {mapTarget && (
                    <p className="ml-7 mt-1 text-[11px] text-slate-400">
                      → {mapTarget.brand}{mapTarget.description ? ` · ${mapTarget.description}` : ""} · {usd(mapTarget.costCents)}
                    </p>
                  )}
                  {c.kind === "search" && (
                    <div className="ml-7 mt-2 space-y-1">
                      <Input
                        value={c.search || ""}
                        onChange={(e) => setChoice(key, { search: e.target.value })}
                        placeholder="Type a model number or description"
                        className="h-8 text-xs"
                        autoFocus
                        data-testid={`fixmatch-search-${r.fromModel}`}
                      />
                      {searchResults.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setChoice(key, { kind: "map", toModel: m.model, include: true })}
                          className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
                        >
                          <span className="shrink-0 font-mono font-medium">{m.model}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-400">{m.brand}{m.description ? ` · ${m.description}` : ""}</span>
                          <span className="shrink-0 tabular-nums text-slate-500">{usd(m.costCents)}</span>
                        </button>
                      ))}
                      {searchTerm && searchResults.length === 0 && (
                        <p className="px-2 py-1 text-[11px] text-slate-400">Nothing in the catalog matches — try "Add to catalog" instead.</p>
                      )}
                    </div>
                  )}
                  {c.kind === "add" && (
                    <div className="ml-7 mt-2 flex flex-wrap items-center gap-2">
                      <Input value={c.addBrand || ""} onChange={(e) => setChoice(key, { addBrand: e.target.value })} placeholder="Brand (e.g. ecobee)" className="h-8 w-40 text-xs" data-testid={`fixmatch-addbrand-${r.fromModel}`} />
                      <Input value={c.addCost || ""} onChange={(e) => setChoice(key, { addCost: e.target.value })} type="number" min="0" step="0.01" placeholder="Cost $" className="h-8 w-28 text-xs" data-testid={`fixmatch-addcost-${r.fromModel}`} />
                      <span className="text-[11px] text-slate-400">adds "{r.fromModel}" to the catalog — its packages match automatically</span>
                    </div>
                  )}
                </div>
              );
            })}
            {shownRows.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-slate-400">No unmatched models match that filter.</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs tabular-nums text-slate-500">
            {counts.map} map{counts.map === 1 ? "" : "s"} · {counts.add} add{counts.add === 1 ? "" : "s"} · {counts.clear} clear{counts.clear === 1 ? "" : "s"} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={applyFixes.isPending || selected.length === 0}
              onClick={() => applyFixes.mutate()}
              data-testid="fixmatches-apply"
            >
              {applyFixes.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying…</> : `Apply ${selected.length} fix${selected.length === 1 ? "" : "es"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
