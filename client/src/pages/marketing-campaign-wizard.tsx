import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { MarketingChrome } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Loader2, Mail, MessageSquare,
  ListTodo, Sun, RotateCcw, ShieldCheck, Star, Gift, Megaphone, PenLine,
  Users, Sparkles, ChevronUp, ChevronDown, AlertTriangle, Clock, Send,
  Reply, X, CalendarClock, Ban, Info,
} from "lucide-react";
import {
  CAMPAIGN_TEMPLATES, CAMPAIGN_DELAY_UNITS, CAMPAIGN_MERGE_FIELDS, MAX_CAMPAIGN_STEPS,
  defaultAudience, defaultCampaignSettings, emptyFilters, describeFilters, describeStepDelay,
  campaignChannelNeeds, campaignTemplate,
  type CampaignStep, type CampaignAudience, type CampaignSettings, type AudienceSegment,
  type CampaignStepType, type CampaignTemplate,
} from "@shared/campaigns";
import type { CrmUser, CrmCampaign } from "@shared/schema";

const MAROON = "#711419";

const TEMPLATE_ICONS: Record<string, any> = { Sun, RotateCcw, ShieldCheck, Star, Gift, Megaphone, PenLine };

const STEP_META: Record<CampaignStepType, { label: string; icon: any; color: string }> = {
  email: { label: "Email", icon: Mail, color: "#0ea5e9" },
  sms: { label: "Text message", icon: MessageSquare, color: "#16a34a" },
  task: { label: "Internal task", icon: ListTodo, color: "#7c3aed" },
};

const WIZARD_STEPS = ["Template", "Audience", "Sequence", "Review & launch"];

interface CampaignMeta {
  tags: string[];
  cities: { city: string; count: number }[];
  leadSources: string[];
  customerCounts: { customers: number; prospects: number };
  channels: {
    smsConfigured: boolean;
    smsKillSwitch: boolean;
    emailKillSwitch: boolean;
    gmailConnected: boolean;
    gmailAddress: string | null;
    resendConfigured: boolean;
  };
}

interface AudiencePreview {
  total: number;
  sendable: number;
  missingEmail: number;
  missingPhone: number;
  sample: {
    id: string; name: string; email: string | null; phone: string | null;
    customerType: string | null; customerStatus: string | null; tags: string[]; city: string | null;
  }[];
}

const genId = () => Math.random().toString(36).slice(2, 9);

function withIds(steps: Omit<CampaignStep, "id">[]): CampaignStep[] {
  return steps.map((s) => ({ ...s, id: genId() }));
}

/** Content problems that should block launch. */
function stepContentErrors(steps: CampaignStep[]): string[] {
  const errors: string[] = [];
  steps.forEach((s, i) => {
    const n = `Step ${i + 1}`;
    if (s.type === "email" && !s.subject?.trim()) errors.push(`${n}: email needs a subject`);
    if ((s.type === "email" || s.type === "sms") && !s.body?.trim()) errors.push(`${n}: message is empty`);
    if (s.type === "task" && !s.title?.trim()) errors.push(`${n}: task needs a title`);
  });
  return errors;
}

// ────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ────────────────────────────────────────────────────────────────────────────

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[#711419] bg-[#711419] text-white"
          : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/^[^a-zA-Z0-9]+/, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function Stepper({ current, maxVisited, onGo }: { current: number; maxVisited: number; onGo: (i: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {WIZARD_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= maxVisited;
        return (
          <div key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onGo(i)}
              className={cn("flex items-center gap-2", reachable ? "cursor-pointer" : "cursor-default")}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  done && "border-[#711419] bg-[#711419] text-white",
                  active && "border-[#711419] bg-[#711419]/5 text-[#711419]",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:block",
                  active ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={cn("h-px flex-1", done ? "bg-[#711419]" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function stepPreviewChips(steps: Omit<CampaignStep, "id">[]) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {steps.length === 0 && <span className="text-[11px] text-muted-foreground">Build your own sequence</span>}
      {steps.map((s, i) => {
        const M = STEP_META[s.type];
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {s.delay ? `${s.delay}${s.delayUnit[0]}` : "→"}
              </span>
            )}
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md"
              style={{ background: `${M.color}18`, color: M.color }}
            >
              <M.icon className="h-3 w-3" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Wizard page
// ────────────────────────────────────────────────────────────────────────────

export default function CrmCampaignWizard() {
  const params = useParams();
  const editId = params.id;
  usePageTitle(editId ? "Edit campaign" : "New campaign");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: meta } = useQuery<CampaignMeta>({
    queryKey: ["/api/crm/campaigns/meta"],
    enabled: !!currentUser,
  });

  // Wizard state
  const [step, setStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [audience, setAudience] = useState<CampaignAudience>(defaultAudience);
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [settings, setSettings] = useState<CampaignSettings>(defaultCampaignSettings);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const goTo = (i: number) => {
    setStep(i);
    setMaxVisited((m) => Math.max(m, i));
    window.scrollTo({ top: 0 });
  };

  // Edit mode: hydrate once from the existing draft
  const { data: editData, isLoading: editLoading } = useQuery<{ campaign: CrmCampaign }>({
    queryKey: [`/api/crm/campaigns/${editId}`],
    enabled: !!currentUser && !!editId,
  });
  const hydrated = useRef(false);
  useEffect(() => {
    const c = editData?.campaign;
    if (!c || hydrated.current) return;
    hydrated.current = true;
    if (!["draft", "scheduled", "paused"].includes(c.status)) {
      navigate(`/marketing/campaigns/${c.id}`);
      return;
    }
    setCampaignId(c.id);
    setName(c.name);
    setTemplateKey(c.templateKey ?? null);
    setAudience((c.audience as CampaignAudience) || defaultAudience());
    setSteps((c.steps as CampaignStep[]) || []);
    setSettings((c.settings as CampaignSettings) || defaultCampaignSettings());
    setMaxVisited(3);
  }, [editData, navigate]);

  // Live audience preview (debounced)
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewKey = JSON.stringify({ audience, types: steps.map((s) => s.type) });
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", "/api/crm/campaigns/preview-audience", { audience, steps });
        const data = await res.json();
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, !!currentUser]);

  // Persistence
  const payload = () => ({
    name: name.trim() || "Untitled campaign",
    description: null,
    templateKey,
    audience,
    steps,
    settings,
  });

  const saveDraft = useMutation({
    mutationFn: async (): Promise<CrmCampaign> => {
      if (campaignId) {
        return (await apiRequest("PATCH", `/api/crm/campaigns/${campaignId}`, payload())).json();
      }
      return (await apiRequest("POST", "/api/crm/campaigns", { ...payload(), status: "draft" })).json();
    },
    onSuccess: (c) => {
      setCampaignId(c.id);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/crm/campaigns/${c.id}`] });
      toast({ title: "Draft saved" });
    },
    onError: () => toast({ title: "Couldn't save draft", variant: "destructive" }),
  });

  const launch = useMutation({
    mutationFn: async () => {
      let id = campaignId;
      if (id) {
        await apiRequest("PATCH", `/api/crm/campaigns/${id}`, payload());
      } else {
        const created = await (await apiRequest("POST", "/api/crm/campaigns", { ...payload(), status: "draft" })).json();
        id = created.id as string;
        setCampaignId(id);
      }
      const res = await (await apiRequest("POST", `/api/crm/campaigns/${id}/launch`)).json();
      return { id: id!, ...res };
    },
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/crm/campaigns/${r.id}`] });
      toast({
        title: settings.schedule.startMode === "scheduled" ? "Campaign scheduled" : "Campaign launched",
        description: `${r.enrolled} contact${r.enrolled === 1 ? "" : "s"} enrolled${r.skipped ? `, ${r.skipped} skipped (no contact info)` : ""}.`,
      });
      navigate(`/marketing/campaigns/${r.id}`);
    },
    onError: (e: any) => toast({ title: "Couldn't launch campaign", description: e?.message, variant: "destructive" }),
  });

  const testSend = useMutation({
    mutationFn: async (s: CampaignStep) =>
      (await apiRequest("POST", "/api/crm/campaigns/test-step", { step: s })).json(),
    onSuccess: (r: any) =>
      r.ok
        ? toast({ title: "Test email sent", description: "Check your inbox." })
        : toast({ title: "Test send failed", description: r.result, variant: "destructive" }),
    onError: () => toast({ title: "Test send failed", variant: "destructive" }),
  });

  // Template selection
  const applyTemplate = (t: CampaignTemplate) => {
    setTemplateKey(t.key);
    setSteps(withIds(t.steps));
    setAudience((a) => ({
      ...a,
      segments: [{ id: a.segments[0]?.id || genId(), name: "Segment 1", filters: { ...emptyFilters(), ...t.suggestedFilters } }],
    }));
    if (t.reply) setSettings((s) => ({ ...s, reply: { ...s.reply, ...t.reply } }));
    const prevDefault = campaignTemplate(templateKey)?.name;
    if (!name.trim() || name === prevDefault) setName(t.key === "scratch" ? "" : t.name);
    goTo(1);
  };

  // Sequence helpers
  const updateStep = (id: string, patch: Partial<CampaignStep>) =>
    setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStep = (id: string) => setSteps((all) => all.filter((s) => s.id !== id));
  const moveStep = (id: string, dir: -1 | 1) =>
    setSteps((all) => {
      const i = all.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= all.length) return all;
      const next = [...all];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addStep = (type: CampaignStepType) =>
    setSteps((all) => [
      ...all,
      {
        id: genId(),
        type,
        delay: all.length === 0 ? 0 : 2,
        delayUnit: "days",
        onlyIf: all.length === 0 ? "always" : "no_reply",
        subject: "",
        body: "",
        title: type === "task" ? "Follow up by phone" : "",
      },
    ]);

  // Validation / launch checks
  const { needsEmail, needsPhone } = campaignChannelNeeds(steps);
  const contentErrors = stepContentErrors(steps);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (steps.length === 0) blockers.push("The sequence has no steps yet.");
  blockers.push(...contentErrors);
  if (preview && preview.total === 0) blockers.push("The audience is empty — loosen the filters.");
  if (needsEmail && meta && !meta.channels.gmailConnected && !meta.channels.resendConfigured) {
    blockers.push("No email sender is set up. Connect Gmail on the Mail page (or configure Resend).");
  }
  if (needsPhone && meta && !meta.channels.smsConfigured) {
    blockers.push("Texting isn't configured (Textline API key missing) — text steps would fail.");
  }
  if (settings.schedule.startMode === "scheduled" && !settings.schedule.startAt) {
    blockers.push("Pick a start date and time, or switch to \"Start now\".");
  }
  if (preview && needsEmail && preview.missingEmail > 0) {
    warnings.push(`${preview.missingEmail} contact${preview.missingEmail === 1 ? " has" : "s have"} no email address — email steps will be skipped for them.`);
  }
  if (preview && needsPhone && preview.missingPhone > 0) {
    warnings.push(`${preview.missingPhone} contact${preview.missingPhone === 1 ? " has" : "s have"} no phone number — text steps will be skipped for them.`);
  }
  if (needsEmail && meta?.channels.emailKillSwitch) warnings.push("Automated email is switched off in Settings → Automated messages — email steps will fail until it's re-enabled.");
  if (needsPhone && meta?.channels.smsKillSwitch) warnings.push("Automated texting is switched off in Settings → Automated messages — text steps will fail until it's re-enabled.");
  if (needsEmail && meta && !meta.channels.gmailConnected && meta.channels.resendConfigured) {
    warnings.push("Gmail isn't connected — emails will send from the shared Resend address, and email replies won't be detected.");
  }

  // A paused campaign has already launched — the wizard edits it in place and
  // saving returns to the detail page (resume happens there).
  const pausedEdit = !!editId && editData?.campaign.status === "paused";

  const canContinue =
    step === 0 ||
    (step === 1 && (preview?.total ?? 0) > 0) ||
    (step === 2 && steps.length > 0 && contentErrors.length === 0) ||
    step === 3;

  const stepHint =
    step === 0
      ? "Pick a starting point — everything is editable after."
      : step === 1
        ? preview
          ? `${preview.total} contact${preview.total === 1 ? "" : "s"} match`
          : "Matching contacts from your CRM…"
        : step === 2
          ? contentErrors[0] || `${steps.length} step${steps.length === 1 ? "" : "s"} in the sequence`
          : blockers[0] || "Everything checks out — ready to launch.";

  if (editId && editLoading) {
    return (
      <MarketingChrome currentUser={currentUser ?? undefined}>
        <div className="mx-auto w-full max-w-3xl space-y-4 py-6">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </MarketingChrome>
    );
  }

  return (
    <MarketingChrome currentUser={currentUser ?? undefined}>
      <div className="mx-auto w-full max-w-6xl pb-28">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={() => navigate("/marketing/campaigns")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled campaign"
              className="h-9 max-w-md border-transparent px-2 font-display text-lg font-semibold tracking-tight shadow-none hover:border-border focus-visible:border-input"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>
            {saveDraft.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save draft
          </Button>
        </div>

        <div className="mb-6"><Stepper current={step} maxVisited={maxVisited} onGo={goTo} /></div>

        {/* ── Step 1: Template ─────────────────────────────────────────── */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Start with a template</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Proven sequences with copy ready to go — pick one and make it yours, or start blank.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPAIGN_TEMPLATES.map((t) => {
                const TIcon = TEMPLATE_ICONS[t.icon] || Megaphone;
                const active = templateKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className={cn(
                      "group rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                      active ? "border-[#711419] ring-1 ring-[#711419]" : "border-border",
                    )}
                  >
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: `${t.accent}15`, color: t.accent }}
                    >
                      <TIcon className="h-5 w-5" />
                    </span>
                    <p className="mt-3 font-semibold text-foreground">{t.name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.tagline}</p>
                    {stepPreviewChips(t.steps)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Audience ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid gap-5 lg:grid-cols-[1fr,360px]">
            <div className="min-w-0 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Who should get this?</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Build one or more audiences from your CRM — they're combined and de-duplicated automatically.
                </p>
              </div>

              {audience.segments.map((seg, si) => (
                <SegmentEditor
                  key={seg.id}
                  segment={seg}
                  index={si}
                  meta={meta}
                  removable={audience.segments.length > 1}
                  onChange={(patch) =>
                    setAudience((a) => ({
                      ...a,
                      segments: a.segments.map((s) => (s.id === seg.id ? { ...s, ...patch } : s)),
                    }))
                  }
                  onRemove={() =>
                    setAudience((a) => ({ ...a, segments: a.segments.filter((s) => s.id !== seg.id) }))
                  }
                />
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setAudience((a) => ({
                    ...a,
                    segments: [...a.segments, { id: genId(), name: `Segment ${a.segments.length + 1}`, filters: emptyFilters() }],
                  }))
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add another audience
              </Button>

              <Card className="rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-foreground">Protections</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Skip anyone another campaign contacted in the last</span>
                    <Input
                      type="number"
                      min={0}
                      value={audience.excludeContactedWithinDays}
                      onChange={(e) =>
                        setAudience((a) => ({ ...a, excludeContactedWithinDays: Math.max(0, Number(e.target.value)) }))
                      }
                      className="h-8 w-20"
                    />
                    <span className="text-muted-foreground">days (0 = off)</span>
                  </div>
                  {audience.excludeCustomerIds.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Ban className="h-3.5 w-3.5" />
                      {audience.excludeCustomerIds.length} contact{audience.excludeCustomerIds.length === 1 ? "" : "s"} manually excluded
                      <button
                        className="font-medium text-[#711419] hover:underline"
                        onClick={() => setAudience((a) => ({ ...a, excludeCustomerIds: [] }))}
                      >
                        Undo all
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <AudiencePreviewRail
              preview={preview}
              loading={previewLoading}
              needsEmail={needsEmail}
              needsPhone={needsPhone}
              onExclude={(id) =>
                setAudience((a) => ({ ...a, excludeCustomerIds: [...a.excludeCustomerIds, id] }))
              }
            />
          </div>
        )}

        {/* ── Step 3: Sequence ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="grid gap-5 lg:grid-cols-[1fr,340px]">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">Build the sequence</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Steps run in order with a wait between each. A reply can stop everything — you decide below.
              </p>

              {/* Reply behavior */}
              <Card className="mt-4 rounded-2xl border-[#711419]/30 bg-[#711419]/[0.03]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#711419]/10 text-[#711419]">
                      <Reply className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">When someone replies</p>
                      <p className="text-xs text-muted-foreground">Replies are detected from texts and synced Gmail email.</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {[
                      { key: "stopSequence" as const, label: "Stop the sequence", desc: "No more sends to them" },
                      { key: "notifyTeam" as const, label: "Notify the team", desc: "In-app notification" },
                      { key: "createFollowUp" as const, label: "Create follow-up", desc: "Task on the customer" },
                    ].map((o) => (
                      <label key={o.key} className="flex cursor-pointer items-start gap-2 rounded-lg border bg-card p-2.5">
                        <Switch
                          checked={settings.reply[o.key]}
                          onCheckedChange={(v) =>
                            setSettings((s) => ({ ...s, reply: { ...s.reply, [o.key]: v } }))
                          }
                        />
                        <span>
                          <span className="block text-xs font-medium text-foreground">{o.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{o.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <div className="mt-5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#711419] text-white">
                    <Sparkles className="h-3 w-3" />
                  </span>
                  Campaign launches
                </div>

                {steps.map((s, i) => (
                  <StepEditor
                    key={s.id}
                    step={s}
                    index={i}
                    count={steps.length}
                    onChange={(patch) => updateStep(s.id, patch)}
                    onRemove={() => removeStep(s.id)}
                    onMove={(dir) => moveStep(s.id, dir)}
                    onTest={() => testSend.mutate(s)}
                    testing={testSend.isPending}
                  />
                ))}

                {/* Add step */}
                <div className="ml-3 border-l-2 border-dashed border-border pl-6 pt-4">
                  {steps.length < MAX_CAMPAIGN_STEPS ? (
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(STEP_META) as CampaignStepType[]).map((t) => {
                        const M = STEP_META[t];
                        return (
                          <Button key={t} variant="outline" size="sm" onClick={() => addStep(t)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            <M.icon className="mr-1.5 h-3.5 w-3.5" style={{ color: M.color }} />
                            {M.label}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Maximum of {MAX_CAMPAIGN_STEPS} steps reached.</p>
                  )}
                </div>
              </div>
            </div>

            <SequenceRail steps={steps} meta={meta} needsEmail={needsEmail} needsPhone={needsPhone} />
          </div>
        )}

        {/* ── Step 4: Review & launch ──────────────────────────────────── */}
        {step === 3 && (
          <ReviewStep
            name={name}
            audience={audience}
            steps={steps}
            settings={settings}
            setSettings={setSettings}
            preview={preview}
            meta={meta}
            blockers={blockers}
            warnings={warnings}
          />
        )}

        {/* Sticky footer */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{stepHint}</p>
            <div className="flex shrink-0 items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" onClick={() => goTo(step - 1)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
              )}
              {step < 3 ? (
                <Button
                  onClick={() => goTo(step + 1)}
                  disabled={!canContinue}
                  className="bg-[#711419] hover:bg-[#5a1014]"
                >
                  Continue <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : pausedEdit ? (
                <Button
                  onClick={() =>
                    saveDraft.mutate(undefined, {
                      onSuccess: () => navigate(`/marketing/campaigns/${campaignId}`),
                    })
                  }
                  disabled={contentErrors.length > 0 || saveDraft.isPending}
                  className="bg-[#711419] hover:bg-[#5a1014]"
                >
                  {saveDraft.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              ) : (
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={blockers.length > 0 || launch.isPending}
                  className="bg-[#711419] hover:bg-[#5a1014]"
                >
                  {launch.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {settings.schedule.startMode === "scheduled" ? "Schedule campaign" : "Launch campaign"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Launch confirmation */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {settings.schedule.startMode === "scheduled" ? "Schedule this campaign?" : "Launch this campaign?"}
              </DialogTitle>
              <DialogDescription>
                {preview?.total ?? 0} contact{(preview?.total ?? 0) === 1 ? "" : "s"} will be enrolled in{" "}
                <span className="font-medium text-foreground">{name.trim() || "Untitled campaign"}</span>
                {settings.schedule.startMode === "scheduled" && settings.schedule.startAt
                  ? ` and sending starts ${new Date(settings.schedule.startAt).toLocaleString()}.`
                  : " and the first step starts sending within a minute."}
              </DialogDescription>
            </DialogHeader>
            {warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                {warnings.map((w, i) => <p key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</p>)}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button
                className="bg-[#711419] hover:bg-[#5a1014]"
                disabled={launch.isPending}
                onClick={() => { setConfirmOpen(false); launch.mutate(); }}
              >
                {settings.schedule.startMode === "scheduled" ? "Schedule it" : "Launch now"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MarketingChrome>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Audience pieces
// ────────────────────────────────────────────────────────────────────────────

function SegmentEditor({
  segment, index, meta, removable, onChange, onRemove,
}: {
  segment: AudienceSegment;
  index: number;
  meta: CampaignMeta | undefined;
  removable: boolean;
  onChange: (patch: Partial<AudienceSegment>) => void;
  onRemove: () => void;
}) {
  const f = segment.filters;
  const setF = (patch: Partial<typeof f>) => onChange({ filters: { ...f, ...patch } });
  const toggle = (key: "customerStatus" | "customerType" | "tags" | "cities" | "leadSources", value: string) => {
    const list = f[key];
    setF({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } as any);
  };
  const [zipInput, setZipInput] = useState("");

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#711419]/10 text-[11px] font-semibold text-[#711419]">
              {index + 1}
            </span>
            <Input
              value={segment.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="h-7 max-w-[200px] border-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus-visible:border-input"
            />
          </div>
          {removable && (
            <button onClick={onRemove} className="text-muted-foreground hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {index > 0 && (
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            OR — also include
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FieldRow label="Customer status">
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip active={f.customerStatus.includes("customer")} onClick={() => toggle("customerStatus", "customer")}>
                Customers{meta ? ` · ${meta.customerCounts.customers}` : ""}
              </ToggleChip>
              <ToggleChip active={f.customerStatus.includes("prospect")} onClick={() => toggle("customerStatus", "prospect")}>
                Leads{meta ? ` · ${meta.customerCounts.prospects}` : ""}
              </ToggleChip>
            </div>
          </FieldRow>

          <FieldRow label="Customer type">
            <div className="flex flex-wrap gap-1.5">
              {[
                ["residential", "Residential"],
                ["commercial", "Commercial"],
                ["property_manager", "Property Manager"],
              ].map(([v, l]) => (
                <ToggleChip key={v} active={f.customerType.includes(v)} onClick={() => toggle("customerType", v)}>
                  {l}
                </ToggleChip>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Service agreement">
            <Select value={f.hasAgreement} onValueChange={(v) => setF({ hasAgreement: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Doesn't matter</SelectItem>
                <SelectItem value="yes">Has an active agreement</SelectItem>
                <SelectItem value="no">No active agreement</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Protection plan">
            <Select value={f.protectionPlan} onValueChange={(v) => setF({ protectionPlan: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Doesn't matter</SelectItem>
                <SelectItem value="yes">On a plan</SelectItem>
                <SelectItem value="no">Not on a plan</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Service history">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-28 shrink-0">Serviced within</span>
                <Input type="number" min={0} placeholder="—" className="h-7 w-20 text-xs"
                  value={f.lastJobWithinDays ?? ""}
                  onChange={(e) => setF({ lastJobWithinDays: e.target.value ? Math.max(1, Number(e.target.value)) : null })} />
                <span>days</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-28 shrink-0">Not serviced in</span>
                <Input type="number" min={0} placeholder="—" className="h-7 w-20 text-xs"
                  value={f.lastJobOlderThanDays ?? ""}
                  onChange={(e) => setF({ lastJobOlderThanDays: e.target.value ? Math.max(1, Number(e.target.value)) : null })} />
                <span>days</span>
              </div>
            </div>
          </FieldRow>

          <FieldRow label="Lifetime revenue">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>At least $</span>
              <Input type="number" min={0} placeholder="—" className="h-7 w-24 text-xs"
                value={f.minLifetimeRevenue ?? ""}
                onChange={(e) => setF({ minLifetimeRevenue: e.target.value ? Math.max(0, Number(e.target.value)) : null })} />
              <span>in paid invoices</span>
            </div>
          </FieldRow>
        </div>

        {meta && meta.tags.length > 0 && (
          <div className="mt-4">
            <FieldRow label="Tags (any of)">
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                {meta.tags.map((t) => (
                  <ToggleChip key={t} active={f.tags.includes(t)} onClick={() => toggle("tags", t)}>{t}</ToggleChip>
                ))}
              </div>
            </FieldRow>
          </div>
        )}

        {meta && meta.cities.length > 0 && (
          <div className="mt-4">
            <FieldRow label="City">
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                {meta.cities.map((c) => (
                  <ToggleChip key={c.city} active={f.cities.includes(c.city)} onClick={() => toggle("cities", c.city)}>
                    {c.city} · {c.count}
                  </ToggleChip>
                ))}
              </div>
            </FieldRow>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FieldRow label="ZIP codes" hint="Press Enter to add">
            <div className="flex flex-wrap items-center gap-1.5">
              {f.zips.map((z) => (
                <span key={z} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {z}
                  <button onClick={() => setF({ zips: f.zips.filter((x) => x !== z) })}><X className="h-3 w-3" /></button>
                </span>
              ))}
              <Input
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && zipInput.trim()) {
                    e.preventDefault();
                    if (!f.zips.includes(zipInput.trim())) setF({ zips: [...f.zips, zipInput.trim()] });
                    setZipInput("");
                  }
                }}
                placeholder="e.g. 30310"
                className="h-7 w-24 text-xs"
              />
            </div>
          </FieldRow>

          {meta && meta.leadSources.length > 0 && (
            <FieldRow label="Lead source (any of)">
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                {meta.leadSources.map((s) => (
                  <ToggleChip key={s} active={f.leadSources.includes(s)} onClick={() => toggle("leadSources", s)}>{s}</ToggleChip>
                ))}
              </div>
            </FieldRow>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
          {describeFilters(f).map((d, i) => (
            <span key={i} className="rounded-lg bg-[#711419]/10 px-2 py-0.5 text-[11px] font-medium text-[#711419]">{d}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AudiencePreviewRail({
  preview, loading, needsEmail, needsPhone, onExclude,
}: {
  preview: AudiencePreview | null;
  loading: boolean;
  needsEmail: boolean;
  needsPhone: boolean;
  onExclude: (id: string) => void;
}) {
  return (
    <div className="lg:sticky lg:top-20 lg:self-start">
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#711419]/10 text-[#711419]">
              <Users className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-foreground">Live audience</p>
            {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {preview ? preview.total : "—"}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">matching contacts</span>
          </p>

          {preview && (needsEmail || needsPhone) && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {needsEmail && preview.missingEmail > 0 && (
                <p className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> {preview.missingEmail} without an email
                </p>
              )}
              {needsPhone && preview.missingPhone > 0 && (
                <p className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> {preview.missingPhone} without a phone
                </p>
              )}
            </div>
          )}

          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sample</p>
            {!preview && loading && (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
            )}
            {preview && preview.sample.length === 0 && (
              <p className="text-xs text-muted-foreground">No one matches yet — loosen the filters.</p>
            )}
            <div className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
              {preview?.sample.map((c) => (
                <div key={c.id} className="group flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-muted/60">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#711419] text-[10px] font-semibold leading-none text-white">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{c.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.email || c.phone || "no contact info"}{c.city ? ` · ${c.city}` : ""}
                    </p>
                  </div>
                  <button
                    title="Exclude from campaign"
                    onClick={() => onExclude(c.id)}
                    className="hidden text-muted-foreground hover:text-red-600 group-hover:block"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sequence pieces
// ────────────────────────────────────────────────────────────────────────────

function StepEditor({
  step, index, count, onChange, onRemove, onMove, onTest, testing,
}: {
  step: CampaignStep;
  index: number;
  count: number;
  onChange: (patch: Partial<CampaignStep>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const M = STEP_META[step.type];
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const insertToken = (token: string) => {
    const el = bodyRef.current;
    const body = step.body || "";
    if (!el) { onChange({ body: body + token }); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    onChange({ body: body.slice(0, start) + token + body.slice(end) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };
  const smsLen = step.type === "sms" ? (step.body || "").length : 0;

  return (
    <div className="ml-3 border-l-2 border-border pl-6">
      {/* Wait connector */}
      <div className="flex items-center gap-2 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {index === 0 ? "Send" : "Then wait"}
        </span>
        <Input
          type="number"
          min={0}
          value={step.delay}
          onChange={(e) => onChange({ delay: Math.max(0, Number(e.target.value)) })}
          className="h-7 w-16 text-xs"
        />
        <Select value={step.delayUnit} onValueChange={(v) => onChange({ delayUnit: v as any })}>
          <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CAMPAIGN_DELAY_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{index === 0 ? "after launch" : "after the previous step"}</span>
      </div>

      {/* Card */}
      <div className="relative rounded-2xl border bg-card shadow-sm">
        <span
          className="absolute -left-[31px] top-5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background"
          style={{ background: M.color }}
        >
          <M.icon className="h-2.5 w-2.5 text-white" />
        </span>
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Step {index + 1} · {M.label}</span>
            {index > 0 && (
              <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  checked={step.onlyIf === "no_reply"}
                  onCheckedChange={(v) => onChange({ onlyIf: v ? "no_reply" : "always" })}
                />
                Only if no reply yet
              </label>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === 0} onClick={() => onMove(-1)}>
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-2.5 p-4">
          {step.type === "email" && (
            <Input
              value={step.subject || ""}
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="Subject line"
              className="h-9 text-sm"
            />
          )}
          {step.type === "task" && (
            <Input
              value={step.title || ""}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Task title (e.g. Call to follow up)"
              className="h-9 text-sm"
            />
          )}
          <Textarea
            ref={bodyRef}
            value={step.body || ""}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder={
              step.type === "email" ? "Write the email…" :
              step.type === "sms" ? "Write the text message…" : "Notes for whoever picks this up (optional)"
            }
            rows={step.type === "email" ? 6 : 3}
            className="text-sm"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Insert:</span>
            {CAMPAIGN_MERGE_FIELDS.map((m) => (
              <button
                key={m.token}
                type="button"
                onClick={() => insertToken(m.token)}
                className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground hover:bg-[#711419]/10 hover:text-[#711419]"
              >
                {m.token}
              </button>
            ))}
            {step.type === "sms" && (
              <span className={cn("ml-auto text-[11px] tabular-nums", smsLen > 320 ? "text-amber-600" : "text-muted-foreground")}>
                {smsLen} chars · {Math.max(1, Math.ceil(smsLen / 160))} segment{Math.ceil(smsLen / 160) > 1 ? "s" : ""}
              </span>
            )}
            {step.type === "email" && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={onTest} disabled={testing}>
                {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                Send test to me
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SequenceRail({
  steps, meta, needsEmail, needsPhone,
}: {
  steps: CampaignStep[];
  meta: CampaignMeta | undefined;
  needsEmail: boolean;
  needsPhone: boolean;
}) {
  const totalMs = steps.reduce((ms, s, i) => (i === 0 ? ms : ms + (s.delay || 0) * ({ minutes: 6e4, hours: 36e5, days: 864e5 } as any)[s.delayUnit]), 0);
  const days = Math.round(totalMs / 864e5 * 10) / 10;
  return (
    <div className="lg:sticky lg:top-20 lg:self-start">
      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Sequence summary</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {steps.length === 0
                ? "No steps yet."
                : `${steps.length} step${steps.length === 1 ? "" : "s"}${days > 0 ? ` over about ${days} day${days === 1 ? "" : "s"}` : " — all at launch"}.`}
            </p>
          </div>
          <div className="space-y-1.5">
            {steps.map((s, i) => {
              const M = STEP_META[s.type];
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: `${M.color}18`, color: M.color }}>
                    <M.icon className="h-3 w-3" />
                  </span>
                  <span className="truncate text-foreground">
                    {s.type === "email" ? (s.subject || "Email") : s.type === "sms" ? "Text" : (s.title || "Task")}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{i === 0 && !s.delay ? "at launch" : describeStepDelay(s).toLowerCase()}</span>
                </div>
              );
            })}
          </div>

          {meta && (needsEmail || needsPhone) && (
            <div className="space-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
              {needsEmail && (
                <p className="flex items-start gap-1.5">
                  <Mail className="mt-0.5 h-3 w-3 shrink-0" />
                  {meta.channels.gmailConnected
                    ? <>Emails send from <span className="font-medium text-foreground">{meta.channels.gmailAddress}</span> — replies land in your Mail inbox.</>
                    : meta.channels.resendConfigured
                      ? "Emails send from the shared company address (Gmail not connected)."
                      : <span className="text-red-600">No email sender configured — connect Gmail on the Mail page.</span>}
                </p>
              )}
              {needsPhone && (
                <p className="flex items-start gap-1.5">
                  <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                  {meta.channels.smsConfigured
                    ? "Texts send through your business texting line; replies appear in Messaging."
                    : <span className="text-red-600">Texting isn't configured.</span>}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Review
// ────────────────────────────────────────────────────────────────────────────

function ReviewStep({
  name, audience, steps, settings, setSettings, preview, meta, blockers, warnings,
}: {
  name: string;
  audience: CampaignAudience;
  steps: CampaignStep[];
  settings: CampaignSettings;
  setSettings: React.Dispatch<React.SetStateAction<CampaignSettings>>;
  preview: AudiencePreview | null;
  meta: CampaignMeta | undefined;
  blockers: string[];
  warnings: string[];
}) {
  const replyBits = [
    settings.reply.stopSequence && "stop the sequence",
    settings.reply.notifyTeam && "notify the team",
    settings.reply.createFollowUp && "create a follow-up",
  ].filter(Boolean).join(", ");

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Review & launch</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">One last look at everything before it goes out.</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Audience */}
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#711419]" />
              <p className="text-sm font-semibold">Audience</p>
              <span className="ml-auto text-2xl font-semibold tabular-nums">{preview?.total ?? "—"}</span>
            </div>
            <div className="mt-3 space-y-2">
              {audience.segments.map((s, i) => (
                <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                  {i > 0 && <span className="text-[10px] font-semibold uppercase text-muted-foreground">or</span>}
                  {describeFilters(s.filters).map((d, j) => (
                    <span key={j} className="rounded-lg bg-[#711419]/10 px-2 py-0.5 text-[11px] font-medium text-[#711419]">{d}</span>
                  ))}
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {audience.excludeContactedWithinDays > 0 && `Skipping anyone contacted in the last ${audience.excludeContactedWithinDays} days. `}
                {audience.excludeCustomerIds.length > 0 && `${audience.excludeCustomerIds.length} manually excluded.`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sequence */}
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#711419]" />
              <p className="text-sm font-semibold">Sequence</p>
            </div>
            <div className="mt-3 space-y-1.5">
              {steps.map((s, i) => {
                const M = STEP_META[s.type];
                return (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: `${M.color}18`, color: M.color }}>
                      <M.icon className="h-3 w-3" />
                    </span>
                    <span className="truncate">{s.type === "email" ? s.subject || "Email" : s.type === "sms" ? "Text message" : s.title || "Task"}</span>
                    {s.onlyIf === "no_reply" && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">if no reply</span>}
                    <span className="ml-auto shrink-0 text-muted-foreground">{i === 0 && !s.delay ? "at launch" : `+${s.delay} ${s.delayUnit}`}</span>
                  </div>
                );
              })}
              <p className="border-t pt-2 text-[11px] text-muted-foreground">
                On reply: {replyBits || "keep sending (nothing configured)"}.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[#711419]" />
              <p className="text-sm font-semibold">Schedule & safeguards</p>
            </div>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["now", "scheduled"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, schedule: { ...s.schedule, startMode: mode } }))}
                    className={cn(
                      "rounded-lg border p-2.5 text-left text-xs font-medium transition-colors",
                      settings.schedule.startMode === mode
                        ? "border-[#711419] bg-[#711419]/5 text-[#711419]"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    {mode === "now" ? "Start now" : "Schedule for later"}
                  </button>
                ))}
              </div>
              {settings.schedule.startMode === "scheduled" && (
                <Input
                  type="datetime-local"
                  value={settings.schedule.startAt ? format(new Date(settings.schedule.startAt), "yyyy-MM-dd'T'HH:mm") : ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      schedule: { ...s.schedule, startAt: e.target.value ? new Date(e.target.value).toISOString() : null },
                    }))
                  }
                  className="h-9 text-sm"
                />
              )}
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={settings.schedule.quietHours}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, schedule: { ...s.schedule, quietHours: v } }))}
                />
                Hold sends during quiet hours (9pm–8am)
              </label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Label className="text-xs">Daily send cap</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.schedule.dailySendCap}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, schedule: { ...s.schedule, dailySendCap: Math.max(0, Number(e.target.value)) } }))
                  }
                  className="h-7 w-24 text-xs"
                />
                <span>per day (0 = unlimited)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checks */}
        <Card className={cn("rounded-2xl", blockers.length > 0 ? "border-red-200" : warnings.length > 0 ? "border-amber-200" : "border-green-200")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {blockers.length > 0
                ? <AlertTriangle className="h-4 w-4 text-red-600" />
                : warnings.length > 0
                  ? <AlertTriangle className="h-4 w-4 text-amber-600" />
                  : <Check className="h-4 w-4 text-green-600" />}
              <p className="text-sm font-semibold">Pre-flight checks</p>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              {blockers.map((b, i) => (
                <p key={`b${i}`} className="flex gap-1.5 text-red-700"><X className="mt-0.5 h-3 w-3 shrink-0" />{b}</p>
              ))}
              {warnings.map((w, i) => (
                <p key={`w${i}`} className="flex gap-1.5 text-amber-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</p>
              ))}
              {blockers.length === 0 && warnings.length === 0 && (
                <p className="flex gap-1.5 text-green-700"><Check className="mt-0.5 h-3 w-3 shrink-0" />Everything looks good.</p>
              )}
              <p className="flex gap-1.5 border-t pt-2 text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Sends go out through the campaign engine within a minute of coming due. You can pause or cancel any time.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
