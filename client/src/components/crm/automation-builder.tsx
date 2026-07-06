import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  Plus, Trash2, Loader2,
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

/** One minimalist numbered step section. */
function Step({ n, title, subtitle, children }: { n: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/70 pt-7">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground">{n}</span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="pl-10">{children}</div>
    </section>
  );
}

export function AutomationForm({
  existing, onDone, onCancel,
}: {
  existing: AutomationCampaign | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [trigger, setTrigger] = useState<AutomationTriggerType | null>((existing?.trigger as any)?.type ?? null);
  const [conditions, setConditions] = useState<AutomationCondition[]>((existing?.conditions as AutomationCondition[]) ?? []);
  const [actions, setActions] = useState<AutomationAction[]>((existing?.actions as AutomationAction[]) ?? []);
  const [timing, setTiming] = useState<AutomationTiming>((existing?.timing as AutomationTiming) ?? DEFAULT_TIMING);
  const [safeguards, setSafeguards] = useState<AutomationSafeguards>((existing?.safeguards as AutomationSafeguards) ?? DEFAULT_SAFEGUARDS);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        isActive: existing?.isActive ?? false,
        trigger: { type: trigger },
        conditions, actions, timing, safeguards,
      };
      if (existing) return (await apiRequest("PATCH", `/api/crm/automations/${existing.id}`, payload)).json();
      return (await apiRequest("POST", "/api/crm/automations", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/automations"] });
      toast({ title: existing ? "Automation updated" : "Automation created" });
      onDone();
    },
    onError: () => toast({ title: "Couldn't save automation", variant: "destructive" }),
  });

  const canSave = !!name.trim() && !!trigger && actions.length > 0;

  const addCondition = () => setConditions((c) => [...c, { field: CONDITION_FIELDS[0].value, operator: "equals", value: "" }]);
  const setCondition = (i: number, patch: Partial<AutomationCondition>) => setConditions((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeCondition = (i: number) => setConditions((c) => c.filter((_, idx) => idx !== i));
  const toggleAction = (type: AutomationActionType) =>
    setActions((a) => (a.some((x) => x.type === type) ? a.filter((x) => x.type !== type) : [...a, { type, config: {} }]));
  const setActionConfig = (type: AutomationActionType, key: string, val: string) =>
    setActions((a) => a.map((x) => (x.type === type ? { ...x, config: { ...x.config, [key]: val } } : x)));

  const pill = (active: boolean) =>
    cn("flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
      active ? "border-foreground bg-muted" : "border-border hover:bg-muted/50");

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      {/* Name */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Post-service review request" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Description (optional)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this do?" className="mt-1" />
        </div>
      </div>

      <div className="mt-6 space-y-1">
        {/* 1. Trigger */}
        <Step n={1} title="When this happens" subtitle="The CRM event that starts it.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AUTOMATION_TRIGGERS.map((t) => (
              <button key={t.value} onClick={() => setTrigger(t.value)} className={pill(trigger === t.value)}>
                <Icon name={t.icon} className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium leading-tight text-foreground">{t.label}</span>
              </button>
            ))}
          </div>
        </Step>

        {/* 2. Conditions */}
        <Step n={2} title="If these are true" subtitle="Optional — only run for matching records.">
          {conditions.length === 0 && (
            <p className="mb-3 text-xs text-muted-foreground">No conditions — runs every time the trigger fires.</p>
          )}
          <div className="space-y-2">
            {conditions.map((c, i) => {
              const field = CONDITION_FIELDS.find((f) => f.value === c.field);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select value={c.field} onValueChange={(v) => setCondition(i, { field: v })}>
                    <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={c.operator} onValueChange={(v) => setCondition(i, { operator: v as any })}>
                    <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITION_OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {!["is_empty", "is_not_empty"].includes(c.operator) && (
                    field?.options ? (
                      <Select value={c.value || ""} onValueChange={(v) => setCondition(i, { value: v })}>
                        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="value" /></SelectTrigger>
                        <SelectContent>{field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input value={c.value || ""} onChange={(e) => setCondition(i, { value: e.target.value })} placeholder="value" className="h-8 w-[130px] text-xs" />
                    )
                  )}
                  <button onClick={() => removeCondition(i)} className="ml-auto text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={addCondition} className="mt-2 h-8 px-2 text-xs"><Plus className="mr-1 h-3.5 w-3.5" /> Add condition</Button>
        </Step>

        {/* 3. Actions */}
        <Step n={3} title="Do this" subtitle="One or more actions to run.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AUTOMATION_ACTIONS.map((a) => (
              <button key={a.value} onClick={() => toggleAction(a.value)} className={pill(actions.some((x) => x.type === a.value))}>
                <Icon name={a.icon} className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium leading-tight text-foreground">{a.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {actions.map((a) => (
              <div key={a.type} className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold">{AUTOMATION_ACTIONS.find((x) => x.value === a.type)?.label}</p>
                {a.type === "send_sms" && (
                  <Textarea value={a.config?.template || ""} onChange={(e) => setActionConfig("send_sms", "template", e.target.value)} placeholder="Message… use {name}" className="text-xs" rows={2} />
                )}
                {a.type === "send_email" && (
                  <div className="space-y-2">
                    <Input value={a.config?.subject || ""} onChange={(e) => setActionConfig("send_email", "subject", e.target.value)} placeholder="Subject" className="h-8 text-xs" />
                    <Textarea value={a.config?.body || ""} onChange={(e) => setActionConfig("send_email", "body", e.target.value)} placeholder="Body…" className="text-xs" rows={3} />
                  </div>
                )}
                {a.type === "create_task" && <Input value={a.config?.title || ""} onChange={(e) => setActionConfig("create_task", "title", e.target.value)} placeholder="Task title" className="h-8 text-xs" />}
                {a.type === "add_tag" && <Input value={a.config?.tag || ""} onChange={(e) => setActionConfig("add_tag", "tag", e.target.value)} placeholder="Tag" className="h-8 text-xs" />}
                {a.type === "notify_team" && <Input value={a.config?.message || ""} onChange={(e) => setActionConfig("notify_team", "message", e.target.value)} placeholder="Notification message" className="h-8 text-xs" />}
                {a.type === "review_request" && <p className="text-xs text-muted-foreground">Sends your configured Google review request.</p>}
              </div>
            ))}
          </div>
        </Step>

        {/* 4. Timing */}
        <Step n={4} title="Timing" subtitle="How long to wait, and when it's OK to send.">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Wait</span>
            <Input type="number" min={0} value={timing.delay} onChange={(e) => setTiming({ ...timing, delay: Math.max(0, Number(e.target.value)) })} className="h-8 w-20" />
            <Select value={timing.delayUnit} onValueChange={(v) => setTiming({ ...timing, delayUnit: v as any })}>
              <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>{DELAY_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-muted-foreground">after the trigger.</span>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <Switch checked={timing.businessHoursOnly} onCheckedChange={(v) => setTiming({ ...timing, businessHoursOnly: v })} />
            Only send during business hours
          </label>
        </Step>

        {/* 5. Safeguards */}
        <Step n={5} title="Safeguards" subtitle="Protect customers from being over-messaged.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Cooldown per customer (days)</Label>
              <Input type="number" min={0} value={safeguards.cooldownDays} onChange={(e) => setSafeguards({ ...safeguards, cooldownDays: Math.max(0, Number(e.target.value)) })} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs">Max sends per customer / month</Label>
              <Input type="number" min={0} value={safeguards.maxPerCustomerPerMonth} onChange={(e) => setSafeguards({ ...safeguards, maxPerCustomerPerMonth: Math.max(0, Number(e.target.value)) })} className="mt-1 h-8" />
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
        </Step>
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {!canSave ? "Add a name, a trigger, and at least one action." : "Save, then turn it on from the list."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {existing ? "Save changes" : "Create automation"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
