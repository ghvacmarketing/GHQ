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
import { ChevronDown, Loader2 } from "lucide-react";

/** Create (or duplicate) a single proposal-builder package.
 *
 *  One dialog, two doors: the "+ Add package" tiles inside the CRM proposal
 *  builder (prefilled with the grid spot you clicked from) and the Add /
 *  Duplicate buttons in Settings → Package Pricing → Package Equipment.
 *  Creates a normal pricebook_packages row via POST /api/pricebook/packages,
 *  so cost drift, catalog matching, costing overrides, and the slot/image
 *  editor all pick it up with zero extra wiring. Prices are entered in
 *  DOLLARS here and stored as cents.
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

export function PackageEditorDialog({ open, onOpenChange, prefill, existing, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Seeded into the form each time the dialog opens. */
  prefill: PackagePrefill | null;
  /** Current packages (raw rows are fine) — powers datalists + duplicate-identity warning. */
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

  const unitTypes = useMemo(() => Array.from(new Set(existing.map((p) => p.unitType).filter(Boolean))).sort(), [existing]);
  const tiers = useMemo(() => {
    const scoped = existing.filter((p) => !form.unitType.trim() || p.unitType === form.unitType.trim());
    const pool = scoped.length > 0 ? scoped : existing;
    return Array.from(new Set(pool.map((p) => p.tier).filter(Boolean))).sort();
  }, [existing, form.unitType]);
  const levels = useMemo(() => {
    const scoped = existing.filter((p) => !form.unitType.trim() || p.unitType === form.unitType.trim());
    const pool = scoped.length > 0 ? scoped : existing;
    return Array.from(new Set(pool.map((p) => p.packageLevel).filter(Boolean))).sort();
  }, [existing, form.unitType]);

  const totalDollars = parseFloat(form.totalInvestmentDollars);
  const monthlyEstimate = Number.isFinite(totalDollars) && totalDollars > 0 ? Math.round(totalDollars / FINANCING_DIVISOR) : null;

  const identityComplete = !!(form.unitType.trim() && form.tier.trim() && form.tonnage.trim() && form.packageLevel.trim());
  const identityTaken = identityComplete && existing.some(
    (p) =>
      p.unitType === form.unitType.trim() &&
      p.tier === form.tier.trim() &&
      String(p.tonnage) === form.tonnage.trim() &&
      p.packageLevel === form.packageLevel.trim(),
  );
  const newUnitType = !!form.unitType.trim() && !unitTypes.includes(form.unitType.trim());
  const canSubmit = identityComplete && Number.isFinite(totalDollars) && totalDollars > 0;

  const create = useMutation({
    mutationFn: async () => {
      const monthlyDollars = parseFloat(form.monthlyPaymentDollars);
      const body: Record<string, unknown> = {
        unitType: form.unitType.trim(),
        tier: form.tier.trim(),
        tonnage: form.tonnage.trim(),
        packageLevel: form.packageLevel.trim(),
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
        description: "It's live in the proposal builder now. Models, images, and pricing can be refined in Settings → Package Pricing.",
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
          <DialogTitle>{isCopy ? "Duplicate package" : "New package"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div>
              <Label className="text-xs">System type</Label>
              <Input value={form.unitType} onChange={(e) => set({ unitType: e.target.value })} list="pkg-editor-unit-types" placeholder="SHP" data-testid="pkgedit-unittype" />
              <datalist id="pkg-editor-unit-types">{unitTypes.map((u) => <option key={u} value={u} />)}</datalist>
            </div>
            <div>
              <Label className="text-xs">Tier</Label>
              <Input value={form.tier} onChange={(e) => set({ tier: e.target.value })} list="pkg-editor-tiers" placeholder="Premium" data-testid="pkgedit-tier" />
              <datalist id="pkg-editor-tiers">{tiers.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <Label className="text-xs">Tonnage</Label>
              <Input value={form.tonnage} onChange={(e) => set({ tonnage: e.target.value })} placeholder="3 · 2.5 · All" data-testid="pkgedit-tonnage" />
            </div>
            <div>
              <Label className="text-xs">Level</Label>
              <Input value={form.packageLevel} onChange={(e) => set({ packageLevel: e.target.value })} list="pkg-editor-levels" placeholder="Best" data-testid="pkgedit-level" />
              <datalist id="pkg-editor-levels">{levels.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
          </div>
          {identityTaken && (
            <p className="rounded-[3px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              A package with this exact type / tier / tonnage / level already exists — the builder will show both side by side.
            </p>
          )}
          {newUnitType && (
            <p className="rounded-[3px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              "{form.unitType.trim()}" is a brand-new system type — it appears as its own section at the end of the builder's system-type step.
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

          <div className="rounded-lg border border-slate-200">
            <button type="button" onClick={() => setEquipOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left" data-testid="pkgedit-equip-toggle">
              <span className="text-sm font-medium text-slate-700">Equipment models <span className="font-normal text-slate-400">(optional)</span></span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${equipOpen ? "rotate-180" : ""}`} />
            </button>
            {equipOpen && (
              <div className="space-y-2.5 border-t border-slate-200 p-3">
                <p className="text-[11px] text-muted-foreground">
                  Add them now or later in Settings → Package Pricing (images live there too). Models that match the
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
