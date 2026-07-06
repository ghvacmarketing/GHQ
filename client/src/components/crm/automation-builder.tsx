import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Zap, Filter, Play, Clock, ShieldCheck, Plus, Trash2, X, Loader2,
  CheckCircle2, CalendarClock, DollarSign, Send, AlertTriangle, FileText,
  ThumbsUp, UserPlus, Sparkles, Trophy, XCircle, CalendarX,
  MessageSquare, Mail, Star, ListTodo, Tag, Bell,
} from "lucide-react";
import {
  AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS, CONDITION_FIELDS, CONDITION_OPERATORS,
  DELAY_UNITS, DEFAULT_TIMING, DEFAULT_SAFEGUARDS,
  type AutomationCondition, type AutomationAction, type AutomationTiming,
  type AutomationSafeguards, type AutomationTriggerType, type AutomationActionType,
} from "@shared/automation";
import type { AutomationCampaign } from "@shared/schema";

const ICONS: Record<string, any> = {
  CheckCircle2, CalendarClock, DollarSign, Send, AlertTriangle, FileText, ThumbsUp,
  UserPlus, Sparkles, Trophy, XCircle, CalendarX, MessageSquare, Mail, Star, ListTodo, Tag, Bell,
};
function Icon({ name, className }: { name?: string; className?: string }) {
  const C = name ? ICONS[name] : null;
  return C ? <C className={className} /> : null;
}

function StepShell({
  n, title, subtitle, icon: IconC, accent, children, last,
}: {
  n: number; title: string; subtitle: string; icon: any; accent: string;
  children: React.ReactNode; last?: boolean;
}) {
  return (
    <div className="relative pl-14">
      {/* connecting flow line */}
      {!last && <span className="absolute left-[26px] top-12 bottom-[-28px] w-px bg-gradient-to-b from-border to-transparent" />}
      <span
        className="absolute left-0 top-0 flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white shadow-lg"
        style={{ background: accent }}
      >
        <IconC className="h-6 w-6" />
      </span>
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {n}</span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function AutomationBuilder({
  open, onClose, existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: AutomationCampaign | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [trigger, setTrigger] = useState<AutomationTriggerType | null>(
    (existing?.trigger as any)?.type ?? null,
  );
  const [conditions, setConditions] = useState<AutomationCondition[]>(
    (existing?.conditions as AutomationCondition[]) ?? [],
  );
  const [actions, setActions] = useState<AutomationAction[]>(
    (existing?.actions as AutomationAction[]) ?? [],
  );
  const [timing, setTiming] = useState<AutomationTiming>(
    (existing?.timing as AutomationTiming) ?? DEFAULT_TIMING,
  );
  const [safeguards, setSafeguards] = useState<AutomationSafeguards>(
    (existing?.safeguards as AutomationSafeguards) ?? DEFAULT_SAFEGUARDS,
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        isActive: existing?.isActive ?? false,
        trigger: { type: trigger },
        conditions,
        actions,
        timing,
        safeguards,
      };
      if (existing) return (await apiRequest("PATCH", `/api/crm/automations/${existing.id}`, payload)).json();
      return (await apiRequest("POST", "/api/crm/automations", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/automations"] });
      toast({ title: existing ? "Automation updated" : "Automation created" });
      onClose();
    },
    onError: () => toast({ title: "Couldn't save automation", variant: "destructive" }),
  });

  const canSave = name.trim() && trigger && actions.length > 0;

  const addCondition = () =>
    setConditions((c) => [...c, { field: CONDITION_FIELDS[0].value, operator: "equals", value: "" }]);
  const setCondition = (i: number, patch: Partial<AutomationCondition>) =>
    setConditions((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeCondition = (i: number) => setConditions((c) => c.filter((_, idx) => idx !== i));

  const toggleAction = (type: AutomationActionType) =>
    setActions((a) =>
      a.some((x) => x.type === type) ? a.filter((x) => x.type !== type) : [...a, { type, config: {} }],
    );
  const setActionConfig = (type: AutomationActionType, key: string, val: string) =>
    setActions((a) => a.map((x) => (x.type === type ? { ...x, config: { ...x.config, [key]: val } } : x)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="relative overflow-hidden border-b bg-gradient-to-br from-[#711419] to-[#3b0a0d] px-6 py-5 text-white">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{existing ? "Edit automation" : "New automation"}</h2>
              <p className="text-xs text-white/70">Trigger → conditions → actions → timing → safeguards</p>
            </div>
          </div>
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          {/* Name */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Automation name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Post-service review request" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Short description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this do?" className="mt-1" />
            </div>
          </div>

          <div className="space-y-7">
            {/* Trigger */}
            <StepShell n={1} title="When this happens" subtitle="Pick the CRM event that starts this automation." icon={Zap} accent="linear-gradient(135deg,#711419,#a31d24)">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AUTOMATION_TRIGGERS.map((t) => {
                  const active = trigger === t.value;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setTrigger(t.value)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                        active ? "border-[#711419] bg-[#711419]/5 ring-1 ring-[#711419]" : "hover:border-foreground/20 hover:bg-muted/50",
                      )}
                    >
                      <Icon name={t.icon} className={cn("h-4 w-4", active ? "text-[#711419]" : "text-muted-foreground")} />
                      <span className="text-xs font-medium leading-tight text-foreground">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </StepShell>

            {/* Conditions */}
            <StepShell n={2} title="If these are true" subtitle="Optional filters — only run for matching records." icon={Filter} accent="linear-gradient(135deg,#0369a1,#0ea5e9)">
              {conditions.length === 0 && (
                <p className="mb-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">No conditions — runs for every matching trigger.</p>
              )}
              <div className="space-y-2">
                {conditions.map((c, i) => {
                  const field = CONDITION_FIELDS.find((f) => f.value === c.field);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
                      <Select value={c.field} onValueChange={(v) => setCondition(i, { field: v })}>
                        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={c.operator} onValueChange={(v) => setCondition(i, { operator: v as any })}>
                        <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CONDITION_OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {!["is_empty", "is_not_empty"].includes(c.operator) && (
                        field?.options ? (
                          <Select value={c.value || ""} onValueChange={(v) => setCondition(i, { value: v })}>
                            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="value" /></SelectTrigger>
                            <SelectContent>{field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input value={c.value || ""} onChange={(e) => setCondition(i, { value: e.target.value })} placeholder="value" className="h-8 w-[140px] text-xs" />
                        )
                      )}
                      <button onClick={() => removeCondition(i)} className="ml-auto rounded p-1 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" onClick={addCondition} className="mt-2 h-8 text-xs"><Plus className="mr-1 h-3.5 w-3.5" /> Add condition</Button>
            </StepShell>

            {/* Actions */}
            <StepShell n={3} title="Do this" subtitle="Choose one or more actions to run." icon={Play} accent="linear-gradient(135deg,#15803d,#22c55e)">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AUTOMATION_ACTIONS.map((a) => {
                  const active = actions.some((x) => x.type === a.value);
                  return (
                    <button
                      key={a.value}
                      onClick={() => toggleAction(a.value)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                        active ? "border-green-600 bg-green-50 ring-1 ring-green-600" : "hover:border-foreground/20 hover:bg-muted/50",
                      )}
                    >
                      <Icon name={a.icon} className={cn("h-4 w-4", active ? "text-green-700" : "text-muted-foreground")} />
                      <span className="text-xs font-medium leading-tight text-foreground">{a.label}</span>
                    </button>
                  );
                })}
              </div>
              {/* Per-action config */}
              <div className="mt-3 space-y-3">
                {actions.map((a) => (
                  <div key={a.type} className="rounded-lg border bg-muted/30 p-3">
                    <p className="mb-2 text-xs font-semibold text-foreground">{AUTOMATION_ACTIONS.find((x) => x.value === a.type)?.label}</p>
                    {a.type === "send_sms" && (
                      <Textarea value={a.config?.template || ""} onChange={(e) => setActionConfig("send_sms", "template", e.target.value)} placeholder="Message… use {name}, {reviewLink}" className="text-xs" rows={2} />
                    )}
                    {a.type === "send_email" && (
                      <div className="space-y-2">
                        <Input value={a.config?.subject || ""} onChange={(e) => setActionConfig("send_email", "subject", e.target.value)} placeholder="Email subject" className="h-8 text-xs" />
                        <Textarea value={a.config?.body || ""} onChange={(e) => setActionConfig("send_email", "body", e.target.value)} placeholder="Email body…" className="text-xs" rows={3} />
                      </div>
                    )}
                    {a.type === "create_task" && (
                      <Input value={a.config?.title || ""} onChange={(e) => setActionConfig("create_task", "title", e.target.value)} placeholder="Task title" className="h-8 text-xs" />
                    )}
                    {a.type === "add_tag" && (
                      <Input value={a.config?.tag || ""} onChange={(e) => setActionConfig("add_tag", "tag", e.target.value)} placeholder="Tag to add" className="h-8 text-xs" />
                    )}
                    {a.type === "notify_team" && (
                      <Input value={a.config?.message || ""} onChange={(e) => setActionConfig("notify_team", "message", e.target.value)} placeholder="Notification message" className="h-8 text-xs" />
                    )}
                    {a.type === "review_request" && (
                      <p className="text-xs text-muted-foreground">Sends your configured Google review request. No extra setup needed.</p>
                    )}
                  </div>
                ))}
              </div>
            </StepShell>

            {/* Timing */}
            <StepShell n={4} title="Timing" subtitle="How long to wait, and when it's OK to send." icon={Clock} accent="linear-gradient(135deg,#7c3aed,#a855f7)">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Wait</span>
                <Input type="number" min={0} value={timing.delay} onChange={(e) => setTiming({ ...timing, delay: Math.max(0, Number(e.target.value)) })} className="h-8 w-20 text-sm" />
                <Select value={timing.delayUnit} onValueChange={(v) => setTiming({ ...timing, delayUnit: v as any })}>
                  <SelectTrigger className="h-8 w-[110px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{DELAY_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">after the trigger.</span>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <Switch checked={timing.businessHoursOnly} onCheckedChange={(v) => setTiming({ ...timing, businessHoursOnly: v })} />
                Only send during business hours
              </label>
            </StepShell>

            {/* Safeguards */}
            <StepShell n={5} title="Safeguards" subtitle="Protect customers from being over-messaged." icon={ShieldCheck} accent="linear-gradient(135deg,#b45309,#f59e0b)" last>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Cooldown per customer (days)</Label>
                  <Input type="number" min={0} value={safeguards.cooldownDays} onChange={(e) => setSafeguards({ ...safeguards, cooldownDays: Math.max(0, Number(e.target.value)) })} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Max sends per customer / month</Label>
                  <Input type="number" min={0} value={safeguards.maxPerCustomerPerMonth} onChange={(e) => setSafeguards({ ...safeguards, maxPerCustomerPerMonth: Math.max(0, Number(e.target.value)) })} className="mt-1 h-8 text-sm" />
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <Switch checked={safeguards.quietHours} onCheckedChange={(v) => setSafeguards({ ...safeguards, quietHours: v })} />
                Never send during quiet hours (9pm–8am)
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <Switch checked={safeguards.requireActiveCustomer} onCheckedChange={(v) => setSafeguards({ ...safeguards, requireActiveCustomer: v })} />
                Only active customers (skip prospects &amp; archived)
              </label>
            </StepShell>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {!canSave ? "Add a name, a trigger, and at least one action to save." : "Ready to save. Turn it on from the list."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending} className="bg-[#711419] hover:bg-[#5a1014]">
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {existing ? "Save changes" : "Create automation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
