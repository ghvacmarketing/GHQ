import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Create (or duplicate) a single proposal-builder package.
 *
 *  The identity is picked on a four-layer ladder that mirrors the builder's
 *  real steps — System → Tier → Size → Level. Every layer shows the values
 *  that already exist as tappable chips AND takes a brand-new typed value, so
 *  nothing is locked to a dropdown. "Create package" starts at layer 1;
 *  "Add to {section}" opens with layer 1 pre-chosen; Duplicate arrives with
 *  all four filled — everything stays editable.
 *
 *  Creates a normal pricebook_packages row via POST /api/pricebook/packages
 *  (dollars in the form, cents on the wire), so cost drift, catalog matching,
 *  costing overrides, and the slot/image editor apply with zero extra wiring.
 */

export type PackagePrefill = Partial<{
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  totalInvestmentDollars: string;
  monthlyPaymentDollars: string;
  outdoorBrand: string;
  outdoorModel: string;
  outdoorName: string;
  coilModel: string;
  coilName: string;
  indoorHeatModel: string;
  indoorHeatName: string;
  thermostatModel: string;
  thermostatName: string;
  accessoryModels: string;
  outdoorImageUrl: string;
  coilImageUrl: string;
  thermostatImageUrl: string;
  furnaceImageUrl: string;
  copiedFromId: string;
}>;

type ExistingPackage = { unitType: string; tier: string; tonnage: string; packageLevel: string };

const FINANCING_DIVISOR = 67; // matches the app-wide "price ÷ 67" monthly estimate

// Ordering that mirrors the proposal builder itself, so chips read familiarly.
const SYSTEM_ORDER = ["GP", "PHP", "SGA", "SHP", "Ducting", "Mini-Split"];
const LEVEL_ORDER = ["Best", "Better", "Good", "Budget"];
const byKnownOrder = (order: string[]) => (a: string, b: string) => {
  const ia = order.indexOf(a); const ib = order.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
};
const bySize = (a: string, b: string) => {
  if (a === "All") return 1;
  if (b === "All") return -1;
  const na = parseFloat(a); const nb = parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
};

const BLANK = {
  unitType: "", tier: "", tonnage: "", packageLevel: "",
  totalInvestmentDollars: "", monthlyPaymentDollars: "",
  outdoorBrand: "", outdoorModel: "", outdoorName: "",
  coilModel: "", coilName: "",
  indoorHeatModel: "", indoorHeatName: "",
  thermostatModel: "", thermostatName: "",
  accessoryModels: "",
};
type FormState = typeof BLANK;
type LayerKey = "unitType" | "tier" | "tonnage" | "packageLevel";

/** One rung of the identity ladder: existing values as chips + a typed new value. */
function LayerPicker({ step, label, hint, options, value, isNew, onPick, testId }: {
  step: number;
  label: string;
  hint?: string;
  options: string[];
  value: string;
  /** True when the current value doesn't exist yet at this layer. */
  isNew: boolean;
  onPick: (v: string) => void;
  testId: string;
}) {
  const [typing, setTyping] = useState(false);
  const showInput = typing || (isNew && value !== "");
  const filled = value.trim() !== "";
  return (
    <div className="relative">
      <span
        className={cn(
          "absolute -left-8 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-[4px] border text-[11px] font-semibold tabular-nums transition-colors",
          filled ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 bg-white text-slate-400",
        )}
        aria-hidden
      >
        {step}
      </span>
      <div className="flex items-baseline gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</Label>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => { setTyping(false); onPick(o === value ? "" : o); }}
            className={cn(
              "rounded-[4px] border px-2.5 py-1 text-xs font-medium transition-colors",
              o === value
                ? "border-[#711419] bg-[#711419] text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800",
            )}
            data-testid={`${testId}-chip-${o}`}
          >
            {o}
          </button>
        ))}
        {showInput ? (
          <span className="inline-flex items-center gap-1">
            <Input
              autoFocus={typing}
              value={value}
              onChange={(e) => onPick(e.target.value)}
              placeholder="Type a new one…"
              className="h-7 w-36 rounded-[4px] text-xs"
              data-testid={`${testId}-input`}
            />
            <button
              type="button"
              onClick={() => { setTyping(false); if (isNew) onPick(""); }}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Back to the existing options"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setTyping(true); onPick(""); }}
            className="rounded-[4px] border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:border-[#711419]/50 hover:text-[#711419]"
            data-testid={`${testId}-new`}
          >
            {options.length > 0 ? "New…" : "Type one…"}
          </button>
        )}
      </div>
    </div>
  );
}

export function PackageEditorDialog({ open, onOpenChange, prefill, existing, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Seeded into the form each time the dialog opens. */
  prefill: PackagePrefill | null;
  /** Current packages (raw rows are fine) — powers the chips + duplicate warning. */
  existing: ExistingPackage[];
  onCreated?: (pkg: any) => void;
}) {
  const { toast } = useToast();
  const isCopy = !!prefill?.copiedFromId;

  const [form, setForm] = useState<FormState>({ ...BLANK });
  const [equipOpen, setEquipOpen] = useState(false);

  // Re-seed whenever the dialog opens with a (possibly new) prefill.
  useEffect(() => {
    if (!open) return;
    const seeded = { ...BLANK } as Record<string, string>;
    for (const [k, v] of Object.entries(prefill ?? {})) {
      if (k in BLANK && typeof v === "string") seeded[k] = v;
    }
    setForm(seeded as FormState);
    setEquipOpen(!!(prefill?.outdoorModel || prefill?.coilModel || prefill?.indoorHeatModel || prefill?.thermostatModel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // ── Chip options per layer, scoped by the layers above (falling back to the
  // whole catalog when a scope has nothing yet — e.g. a brand-new system).
  const sel = { unitType: form.unitType.trim(), tier: form.tier.trim(), tonnage: form.tonnage.trim(), packageLevel: form.packageLevel.trim() };
  const distinct = (rows: ExistingPackage[], key: LayerKey) =>
    Array.from(new Set(rows.map((p) => String(p[key])).filter(Boolean)));
  const scoped = (keys: LayerKey[]) => {
    const rows = existing.filter((p) => keys.every((k) => !sel[k] || String(p[k]) === sel[k]));
    return rows.length > 0 ? rows : existing;
  };
  const systemOptions = useMemo(() => distinct(existing, "unitType").sort(byKnownOrder(SYSTEM_ORDER)), [existing]);
  const tierOptions = useMemo(() => distinct(scoped(["unitType"]), "tier").sort(), [existing, sel.unitType]);
  const sizeOptions = useMemo(() => distinct(scoped(["unitType", "tier"]), "tonnage").sort(bySize), [existing, sel.unitType, sel.tier]);
  const levelOptions = useMemo(() => distinct(scoped(["unitType", "tier"]), "packageLevel").sort(byKnownOrder(LEVEL_ORDER)), [existing, sel.unitType, sel.tier]);

  const totalDollars = parseFloat(form.totalInvestmentDollars);
  const monthlyEstimate = Number.isFinite(totalDollars) && totalDollars > 0 ? Math.round(totalDollars / FINANCING_DIVISOR) : null;

  const identityComplete = !!(sel.unitType && sel.tier && sel.tonnage && sel.packageLevel);
  const identityTaken = identityComplete && existing.some(
    (p) => p.unitType === sel.unitType && p.tier === sel.tier && String(p.tonnage) === sel.tonnage && p.packageLevel === sel.packageLevel,
  );
  const newUnitType = !!sel.unitType && !systemOptions.includes(sel.unitType);
  const canSubmit = identityComplete && Number.isFinite(totalDollars) && totalDollars > 0;

  const create = useMutation({
    mutationFn: async () => {
      const monthlyDollars = parseFloat(form.monthlyPaymentDollars);
      const body: Record<string, unknown> = {
        unitType: sel.unitType,
        tier: sel.tier,
        tonnage: sel.tonnage,
        packageLevel: sel.packageLevel,
        totalInvestment: Math.round(totalDollars * 100),
        monthlyPayment: Math.round((Number.isFinite(monthlyDollars) && monthlyDollars > 0 ? monthlyDollars : monthlyEstimate || 0) * 100),
        outdoorBrand: form.outdoorBrand, outdoorModel: form.outdoorModel, outdoorName: form.outdoorName,
        coilModel: form.coilModel, coilName: form.coilName,
        indoorHeatModel: form.indoorHeatModel, indoorHeatName: form.indoorHeatName,
        thermostatModel: form.thermostatModel, thermostatName: form.thermostatName,
        accessoryModels: form.accessoryModels,
        outdoorImageUrl: prefill?.outdoorImageUrl, coilImageUrl: prefill?.coilImageUrl,
        thermostatImageUrl: prefill?.thermostatImageUrl, furnaceImageUrl: prefill?.furnaceImageUrl,
        copiedFromId: prefill?.copiedFromId,
      };
      const res = await apiRequest("POST", "/api/pricebook/packages", body);
      return res.json();
    },
    onSuccess: (pkg: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] });
      toast({
        title: isCopy ? "Package duplicated" : "Package created",
        description: "It's live in the proposal builder now. Models, images, and pricing can be refined any time.",
      });
      onCreated?.(pkg);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't create the package", variant: "destructive" }),
  });

  const slotFields: Array<[label: string, modelKey: keyof FormState, nameKey: keyof FormState]> = [
    ["Outdoor", "outdoorModel", "outdoorName"],
    ["Coil", "coilModel", "coilName"],
    ["Indoor heat", "indoorHeatModel", "indoorHeatName"],
    ["Thermostat", "thermostatModel", "thermostatName"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCopy ? "Duplicate package" : "Create package"}</DialogTitle>
          <p className="text-xs text-slate-500">
            The four layers below are the builder's own steps. Tap an existing value or type a new one — a new
            value at any layer creates that section, tier, size, or level.
          </p>
        </DialogHeader>
        <div className="space-y-4">
          {/* The identity ladder — markers fill as each layer gets a value. */}
          <div className="relative space-y-4 pl-8">
            <span className="absolute bottom-2 left-[10px] top-2 w-px bg-slate-200" aria-hidden />
            <LayerPicker
              step={1} label="System" testId="pkgedit-system"
              options={systemOptions} value={form.unitType} isNew={newUnitType}
              onPick={(v) => set({ unitType: v })}
            />
            <LayerPicker
              step={2} label="Tier" testId="pkgedit-tier"
              options={tierOptions} value={form.tier}
              isNew={!!sel.tier && !tierOptions.includes(sel.tier)}
              onPick={(v) => set({ tier: v })}
            />
            <LayerPicker
              step={3} label="Size" hint="tonnage, BTU, or any denomination" testId="pkgedit-size"
              options={sizeOptions} value={form.tonnage}
              isNew={!!sel.tonnage && !sizeOptions.includes(sel.tonnage)}
              onPick={(v) => set({ tonnage: v })}
            />
            <LayerPicker
              step={4} label="Level" testId="pkgedit-level"
              options={levelOptions} value={form.packageLevel}
              isNew={!!sel.packageLevel && !levelOptions.includes(sel.packageLevel)}
              onPick={(v) => set({ packageLevel: v })}
            />
          </div>

          {identityTaken && (
            <p className="rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {sel.unitType} · {sel.tier} · {sel.tonnage} · {sel.packageLevel} already exists — the builder will
              show both side by side.
            </p>
          )}
          {newUnitType && (
            <p className="rounded-[4px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              "{sel.unitType}" is a brand-new system — it becomes its own section in the builder (reorder or
              rename it below in Builder Sections).
            </p>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Label className="text-xs">Total price ($)</Label>
              <Input inputMode="decimal" value={form.totalInvestmentDollars} onChange={(e) => set({ totalInvestmentDollars: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="12500" data-testid="pkgedit-total" />
            </div>
            <div>
              <Label className="text-xs">Monthly payment ($)</Label>
              <Input inputMode="decimal" value={form.monthlyPaymentDollars} onChange={(e) => set({ monthlyPaymentDollars: e.target.value.replace(/[^0-9.]/g, "") })} placeholder={monthlyEstimate ? String(monthlyEstimate) : "—"} data-testid="pkgedit-monthly" />
              <p className="mt-0.5 text-[11px] text-muted-foreground">Blank = price ÷ {FINANCING_DIVISOR} estimate{monthlyEstimate ? ` ($${monthlyEstimate}/mo)` : ""}.</p>
            </div>
          </div>

          <div className="rounded-[4px] border border-slate-200">
            <button type="button" onClick={() => setEquipOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left" data-testid="pkgedit-equip-toggle">
              <span className="text-sm font-medium text-slate-700">Equipment models <span className="font-normal text-slate-400">(optional)</span></span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${equipOpen ? "rotate-180" : ""}`} />
            </button>
            {equipOpen && (
              <div className="space-y-2.5 border-t border-slate-200 p-3">
                <p className="text-[11px] text-muted-foreground">
                  Add them now or later in Package Equipment (images live there too). Models that match the
                  Equipment Catalog power the live cost breakdown.
                </p>
                <div>
                  <Label className="text-xs">Outdoor brand</Label>
                  <Input value={form.outdoorBrand} onChange={(e) => set({ outdoorBrand: e.target.value })} placeholder="Trane" data-testid="pkgedit-brand" />
                </div>
                {slotFields.map(([label, modelKey, nameKey]) => (
                  <div key={label} className="grid grid-cols-2 gap-2.5">
                    <div>
                      <Label className="text-xs">{label} model</Label>
                      <Input value={form[modelKey]} onChange={(e) => set({ [modelKey]: e.target.value } as Partial<FormState>)} data-testid={`pkgedit-${modelKey}`} />
                    </div>
                    <div>
                      <Label className="text-xs">{label} description</Label>
                      <Input value={form[nameKey]} onChange={(e) => set({ [nameKey]: e.target.value } as Partial<FormState>)} data-testid={`pkgedit-${nameKey}`} />
                    </div>
                  </div>
                ))}
                <div>
                  <Label className="text-xs">Accessories</Label>
                  <Input value={form.accessoryModels} onChange={(e) => set({ accessoryModels: e.target.value })} placeholder="Surge protector, float switch…" data-testid="pkgedit-accessories" />
                </div>
                {isCopy && (prefill?.outdoorImageUrl || prefill?.coilImageUrl || prefill?.thermostatImageUrl || prefill?.furnaceImageUrl) && (
                  <p className="text-[11px] text-slate-500">Equipment images are copied from the source package.</p>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-[#711419] hover:bg-[#8a1a1f]"
            disabled={!canSubmit || create.isPending}
            onClick={() => create.mutate()}
            data-testid="pkgedit-create"
          >
            {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {isCopy ? "Create copy" : "Create package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
