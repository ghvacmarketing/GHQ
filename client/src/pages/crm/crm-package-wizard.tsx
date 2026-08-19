import { useEffect, useMemo, useRef, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, ChevronDown, Loader2, Package } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { cn } from "@/lib/utils";
import type { CrmUser } from "@shared/schema";

/** Create (or duplicate) a proposal-builder package — a full PAGE, not a popup.
 *
 *  Route: /crm/settings/packages/new
 *  Query params:
 *    system, tier, size, level — prefill those layers ("Add to {section}/{tier}")
 *    copy=<packageId>          — duplicate: prefill everything incl. images
 *    back=<path>               — where Cancel and Create return to
 *                                 (default: Settings → Package Pricing → Proposal Builder tab)
 *
 *  One question per screen, in the builder's own order: System → Tier → Size →
 *  Level → Price. The left rail is both progress and the record — each step
 *  shows the chosen value and clicking a step jumps back to change it. Every
 *  layer offers existing values as chips (scoped by the layers above) AND a
 *  free-text field, so nothing is locked to what exists. Same POST
 *  /api/pricebook/packages contract as always (dollars here, cents on the wire).
 */

type ApiPackageRow = {
  id: string | number;
  unitType: string;
  tier: string;
  tonnage: string;
  packageLevel: string;
  monthlyPayment: number;
  totalInvestment: number;
  outdoorBrand: string | null;
  outdoorModel: string | null;
  outdoorName: string | null;
  coilModel: string | null;
  coilName: string | null;
  indoorHeatModel: string | null;
  indoorHeatName: string | null;
  thermostatModel: string | null;
  thermostatName: string | null;
  accessoryModels: string | null;
  outdoorImageUrl: string | null;
  coilImageUrl: string | null;
  thermostatImageUrl: string | null;
  furnaceImageUrl: string | null;
};

const FINANCING_DIVISOR = 67; // matches the app-wide "price ÷ 67" monthly estimate

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

const LAYER_STEPS: Array<{ key: LayerKey; label: string; question: string; hint?: string }> = [
  { key: "unitType", label: "System", question: "Which system is this package for?" },
  { key: "tier", label: "Tier", question: "Which tier does it belong to?" },
  { key: "tonnage", label: "Size", question: "What size is it?", hint: "Tonnage, BTU, or any denomination you use" },
  { key: "packageLevel", label: "Level", question: "Where does it rank?" },
];
const PRICE_STEP = LAYER_STEPS.length;

export default function CrmPackageWizard() {
  usePageTitle("Create Package");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Query params are read once — this page is always entered fresh.
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const copyId = params.get("copy");
  const backPath = params.get("back") || "/crm/settings/packages?tab=builder";
  const goBack = () => navigate(backPath);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const { data: packagesData } = useQuery<ApiPackageRow[]>({
    queryKey: ["/api/pricebook/packages"],
    enabled: !!currentUser,
  });

  const [form, setForm] = useState<FormState>({ ...BLANK });
  const [step, setStep] = useState(0);
  const [equipOpen, setEquipOpen] = useState(false);
  const [isCopy, setIsCopy] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<ApiPackageRow | null>(null);
  const [seeded, setSeeded] = useState(false);
  // The free-text field's own buffer — typing a value that happens to match an
  // existing chip must not blank the field mid-word.
  const [typed, setTyped] = useState("");
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed once: from ?copy (needs the packages list) or from the layer params.
  useEffect(() => {
    if (seeded) return;
    if (copyId && !packagesData) return; // wait for the list before duplicating
    const seededForm = { ...BLANK } as Record<string, string>;
    if (copyId) {
      const raw = (packagesData ?? []).find((p) => String(p.id) === copyId);
      if (raw) {
        Object.assign(seededForm, {
          unitType: raw.unitType, tier: raw.tier, tonnage: String(raw.tonnage), packageLevel: raw.packageLevel,
          totalInvestmentDollars: String((raw.totalInvestment || 0) / 100),
          monthlyPaymentDollars: raw.monthlyPayment != null ? String(raw.monthlyPayment / 100) : "",
          outdoorBrand: raw.outdoorBrand || "", outdoorModel: raw.outdoorModel || "", outdoorName: raw.outdoorName || "",
          coilModel: raw.coilModel || "", coilName: raw.coilName || "",
          indoorHeatModel: raw.indoorHeatModel || "", indoorHeatName: raw.indoorHeatName || "",
          thermostatModel: raw.thermostatModel || "", thermostatName: raw.thermostatName || "",
          accessoryModels: raw.accessoryModels || "",
        });
        setCopiedFrom(raw);
        setIsCopy(true);
      } else {
        toast({ title: "Package to duplicate wasn't found", description: "Starting a blank package instead.", variant: "destructive" });
      }
    } else {
      seededForm.unitType = params.get("system") || "";
      seededForm.tier = params.get("tier") || "";
      seededForm.tonnage = params.get("size") || "";
      seededForm.packageLevel = params.get("level") || "";
    }
    setForm(seededForm as FormState);
    const firstEmpty = LAYER_STEPS.findIndex((l) => !String(seededForm[l.key] ?? "").trim());
    setStep(firstEmpty === -1 ? PRICE_STEP : firstEmpty);
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyId, packagesData, seeded]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const existing = useMemo(
    () => (packagesData ?? []).map((p) => ({ unitType: p.unitType, tier: p.tier, tonnage: String(p.tonnage), packageLevel: p.packageLevel })),
    [packagesData],
  );

  // Chip options per layer, scoped by the layers above (falling back to the
  // whole catalog when a scope has nothing yet — e.g. a brand-new system).
  const sel = { unitType: form.unitType.trim(), tier: form.tier.trim(), tonnage: form.tonnage.trim(), packageLevel: form.packageLevel.trim() };
  const distinct = (rows: typeof existing, key: LayerKey) =>
    Array.from(new Set(rows.map((p) => String(p[key])).filter(Boolean)));
  const scoped = (keys: LayerKey[]) => {
    const rows = existing.filter((p) => keys.every((k) => !sel[k] || String(p[k]) === sel[k]));
    return rows.length > 0 ? rows : existing;
  };
  const optionsFor = (key: LayerKey): string[] => {
    if (key === "unitType") return distinct(existing, "unitType").sort(byKnownOrder(SYSTEM_ORDER));
    if (key === "tier") return distinct(scoped(["unitType"]), "tier").sort();
    if (key === "tonnage") return distinct(scoped(["unitType", "tier"]), "tonnage").sort(bySize);
    return distinct(scoped(["unitType", "tier"]), "packageLevel").sort(byKnownOrder(LEVEL_ORDER));
  };

  const totalDollars = parseFloat(form.totalInvestmentDollars);
  const monthlyEstimate = Number.isFinite(totalDollars) && totalDollars > 0 ? Math.round(totalDollars / FINANCING_DIVISOR) : null;

  const identityComplete = !!(sel.unitType && sel.tier && sel.tonnage && sel.packageLevel);
  const identityTaken = identityComplete && existing.some(
    (p) => p.unitType === sel.unitType && p.tier === sel.tier && String(p.tonnage) === sel.tonnage && p.packageLevel === sel.packageLevel,
  );
  const systemOptions = useMemo(() => distinct(existing, "unitType"), [existing]);
  const newUnitType = !!sel.unitType && !systemOptions.includes(sel.unitType);
  const canSubmit = identityComplete && Number.isFinite(totalDollars) && totalDollars > 0;

  const goNext = () => setStep((s) => Math.min(s + 1, PRICE_STEP));
  const pick = (key: LayerKey, value: string) => {
    set({ [key]: value } as Partial<FormState>);
    setTyped("");
    // A beat of delay lets the selection register before the screen changes.
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(goNext, 140);
  };

  const current = step < PRICE_STEP ? LAYER_STEPS[step] : null;
  const currentValue = current ? form[current.key] : "";
  const currentOptions = current ? optionsFor(current.key) : [];

  // Arriving on a layer step: prime the text buffer with the value only when
  // it's a typed (non-chip) one, so chip picks keep the field empty.
  useEffect(() => {
    if (!seeded || !current) return;
    const v = form[current.key];
    setTyped(v.trim() && !optionsFor(current.key).includes(v.trim()) ? v : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, seeded]);

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
        outdoorImageUrl: copiedFrom?.outdoorImageUrl || undefined,
        coilImageUrl: copiedFrom?.coilImageUrl || undefined,
        thermostatImageUrl: copiedFrom?.thermostatImageUrl || undefined,
        furnaceImageUrl: copiedFrom?.furnaceImageUrl || undefined,
        copiedFromId: copiedFrom ? String(copiedFrom.id) : undefined,
      };
      const res = await apiRequest("POST", "/api/pricebook/packages", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pricebook-drift"] });
      toast({
        title: isCopy ? "Package duplicated" : "Package created",
        description: "It's live in the proposal builder now. Models, images, and pricing can be refined any time.",
      });
      goBack();
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't create the package", variant: "destructive" }),
  });

  const slotFields: Array<[label: string, modelKey: keyof FormState, nameKey: keyof FormState]> = [
    ["Outdoor", "outdoorModel", "outdoorName"],
    ["Coil", "coilModel", "coilName"],
    ["Indoor heat", "indoorHeatModel", "indoorHeatName"],
    ["Thermostat", "thermostatModel", "thermostatName"],
  ];

  if (authLoading || !currentUser) return null;
  const canCreate = ["owner", "admin", "supervisor"].includes(currentUser.role);
  if (!canCreate) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto w-full max-w-2xl py-16 text-center text-slate-500">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p>Only administrators can create packages.</p>
        </div>
      </CrmLayout>
    );
  }

  const railSteps = [
    ...LAYER_STEPS.map((l) => ({ label: l.label, value: form[l.key].trim() })),
    { label: "Price", value: Number.isFinite(totalDollars) && totalDollars > 0 ? `$${form.totalInvestmentDollars}` : "" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-3xl">
        {/* ── Page header ── */}
        <div className="mb-5 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back" data-testid="pkgwiz-exit">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {isCopy ? "Duplicate package" : "Create package"}
            </h1>
            <p className="text-sm text-slate-500">
              {isCopy && copiedFrom
                ? `Copying ${copiedFrom.unitType} · ${copiedFrom.tier} · ${copiedFrom.tonnage} · ${copiedFrom.packageLevel} — change anything, then create.`
                : "Five steps, in the proposal builder's own order. Pick what exists or type something new at any layer."}
            </p>
          </div>
        </div>

        {!seeded ? (
          <Skeleton className="h-96 w-full rounded-[4px]" />
        ) : (
          <div className="flex min-h-[480px] overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
            {/* ── Rail: progress AND the record of what's been chosen ── */}
            <nav className="hidden w-48 shrink-0 border-r border-slate-200 bg-slate-50/60 py-4 sm:block" aria-label="Steps">
              {railSteps.map((s, i) => {
                const active = i === step;
                const done = !!s.value && !active;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "relative flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors",
                      active ? "bg-white" : "hover:bg-white/60",
                    )}
                    data-testid={`pkgwiz-step-${s.label.toLowerCase()}`}
                  >
                    {active && <span className="absolute inset-y-1 left-0 w-0.5 bg-[#711419]" aria-hidden />}
                    <span
                      className={cn(
                        "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border text-[10px] font-semibold tabular-nums",
                        active
                          ? "border-[#711419] bg-[#711419] text-white"
                          : done
                            ? "border-slate-700 bg-slate-700 text-white"
                            : "border-slate-300 bg-white text-slate-400",
                      )}
                      aria-hidden
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-[11px] font-semibold uppercase tracking-wide", active ? "text-slate-900" : "text-slate-500")}>
                        {s.label}
                      </span>
                      <span className={cn("block truncate text-xs", s.value ? "text-slate-700" : "text-slate-300")}>
                        {s.value || "—"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* ── Step content ── */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Compact progress line for small screens */}
              <p className="border-b border-slate-100 px-5 py-2 text-[11px] text-slate-400 sm:hidden">
                Step {step + 1} of {PRICE_STEP + 1} · {current ? current.label : "Price"}
              </p>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                {current ? (
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{current.question}</h3>
                    {current.hint && <p className="mt-0.5 text-xs text-slate-400">{current.hint}</p>}
                    {currentOptions.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {currentOptions.map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => pick(current.key, o)}
                            className={cn(
                              "rounded-[4px] border px-4 py-2.5 text-sm font-medium transition-colors",
                              o === currentValue.trim()
                                ? "border-[#711419] bg-[#711419] text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
                            )}
                            data-testid={`pkgwiz-chip-${o}`}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-6">
                      <Label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {currentOptions.length > 0 ? "Or type a new one" : "Type one"}
                      </Label>
                      <Input
                        value={typed}
                        onChange={(e) => { setTyped(e.target.value); set({ [current.key]: e.target.value } as Partial<FormState>); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && currentValue.trim()) goNext(); }}
                        placeholder={current.key === "unitType" ? "e.g. Boiler" : ""}
                        className="mt-1 h-9 max-w-60 rounded-none border-0 border-b border-slate-300 px-0 text-sm shadow-none focus-visible:border-[#711419] focus-visible:ring-0"
                        data-testid={`pkgwiz-input-${current.key}`}
                      />
                      {typed.trim() && current.key === "unitType" && !systemOptions.includes(typed.trim()) && (
                        <p className="mt-2 text-xs text-slate-500">
                          "{typed.trim()}" becomes its own section in the builder — rename or reorder it any time
                          in Builder Sections.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Price it</h3>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {sel.unitType} · {sel.tier} · {sel.tonnage} · {sel.packageLevel}
                      </p>
                    </div>
                    {identityTaken && !isCopy && (
                      <p className="max-w-md rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        This exact package already exists — the builder will show both side by side.
                      </p>
                    )}
                    <div className="grid max-w-md grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Total price ($)</Label>
                        <Input inputMode="decimal" autoFocus value={form.totalInvestmentDollars} onChange={(e) => set({ totalInvestmentDollars: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="12500" data-testid="pkgedit-total" />
                      </div>
                      <div>
                        <Label className="text-xs">Monthly payment ($)</Label>
                        <Input inputMode="decimal" value={form.monthlyPaymentDollars} onChange={(e) => set({ monthlyPaymentDollars: e.target.value.replace(/[^0-9.]/g, "") })} placeholder={monthlyEstimate ? String(monthlyEstimate) : "—"} data-testid="pkgedit-monthly" />
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Blank = price ÷ {FINANCING_DIVISOR}{monthlyEstimate ? ` ($${monthlyEstimate}/mo)` : ""}.</p>
                      </div>
                    </div>
                    <div className="max-w-md rounded-[4px] border border-slate-200">
                      <button type="button" onClick={() => setEquipOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left" data-testid="pkgedit-equip-toggle">
                        <span className="text-sm font-medium text-slate-700">Equipment models <span className="font-normal text-slate-400">(optional)</span></span>
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${equipOpen ? "rotate-180" : ""}`} />
                      </button>
                      {equipOpen && (
                        <div className="space-y-2.5 border-t border-slate-200 p-3">
                          <p className="text-[11px] text-muted-foreground">
                            Add them now or later in Package Equipment (images live there too). Models that match
                            the Equipment Catalog power the live cost breakdown.
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
                          {isCopy && (copiedFrom?.outdoorImageUrl || copiedFrom?.coilImageUrl || copiedFrom?.thermostatImageUrl || copiedFrom?.furnaceImageUrl) && (
                            <p className="text-[11px] text-slate-500">Equipment images are copied from the source package.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className={cn(step === 0 && "invisible")}
                  data-testid="pkgwiz-back"
                >
                  Back
                </Button>
                {step < PRICE_STEP ? (
                  <Button
                    size="sm"
                    className="bg-[#711419] hover:bg-[#8a1a1f]"
                    disabled={!currentValue.trim()}
                    onClick={goNext}
                    data-testid="pkgwiz-continue"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-[#711419] hover:bg-[#8a1a1f]"
                    disabled={!canSubmit || create.isPending}
                    onClick={() => create.mutate()}
                    data-testid="pkgedit-create"
                  >
                    {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    {isCopy ? "Create copy" : "Create package"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
