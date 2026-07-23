import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { MarketingChrome, useMarketingBase } from "@/components/marketing-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Zap, Plus, ArrowRight, MoreVertical, Pencil, Trash2, Sparkles, Filter,
  Clock, ShieldCheck, CheckCircle2, CalendarClock, DollarSign, Send,
  AlertTriangle, FileText, ThumbsUp, UserPlus, Trophy, XCircle, CalendarX,
  MessageSquare, Mail, Star, ListTodo, Tag, Bell,
} from "lucide-react";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/crm/ui-kit";
import {
  AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS, triggerLabel, actionLabel,
} from "@shared/automation";
import type { CrmUser, AutomationCampaign } from "@shared/schema";

const ICONS: Record<string, any> = {
  CheckCircle2, CalendarClock, DollarSign, Send, AlertTriangle, FileText, ThumbsUp,
  UserPlus, Sparkles, Trophy, XCircle, CalendarX, MessageSquare, Mail, Star, ListTodo, Tag, Bell,
};
const triggerIcon = (type?: string) => AUTOMATION_TRIGGERS.find((t) => t.value === type)?.icon;
const actionIcon = (type?: string) => AUTOMATION_ACTIONS.find((a) => a.value === type)?.icon;
function LIcon({ name, className }: { name?: string; className?: string }) {
  const C = name ? ICONS[name] : null;
  return C ? <C className={className} /> : null;
}

export default function CrmMarketing() {
  usePageTitle("Marketing Automation");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const base = useMarketingBase();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: automations = [], isLoading } = useQuery<AutomationCampaign[]>({
    queryKey: ["/api/crm/automations"],
    enabled: !!currentUser,
  });

  const toggle = useMutation({
    mutationFn: (a: AutomationCampaign) =>
      apiRequest("PATCH", `/api/crm/automations/${a.id}`, { isActive: !a.isActive }),
    onMutate: async (a) => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/automations"] });
      queryClient.setQueryData<AutomationCampaign[]>(["/api/crm/automations"], (old) =>
        old?.map((x) => (x.id === a.id ? { ...x, isActive: !x.isActive } : x)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/crm/automations"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/automations"] });
      toast({ title: "Automation deleted" });
    },
  });

  const openNew = () => navigate(`${base}/new`);
  const openEdit = (a: AutomationCampaign) => navigate(`${base}/edit/${a.id}`);

  const activeCount = automations.filter((a) => a.isActive).length;

  return (
    <MarketingChrome currentUser={currentUser ?? undefined}>
      <div className="w-full space-y-5 pb-10">
        <PageHeader
          title="Marketing Automation"
          description="Build campaigns that run themselves — trigger, conditions, actions, timing, and safeguards."
          actions={
            <>
              <Button variant="outline" onClick={() => navigate(`${base}/messages`)}>
                <MessageSquare className="mr-1.5 h-4 w-4" /> Automated messages
              </Button>
              <Button onClick={openNew} className="bg-[#711419] hover:bg-[#5a1014]">
                <Plus className="mr-1.5 h-4 w-4" /> New automation
              </Button>
            </>
          }
        />

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Automations", value: automations.length, icon: Zap, color: "#711419" },
            { label: "Active", value: activeCount, icon: CheckCircle2, color: "#16a34a" },
            { label: "Triggered", value: automations.reduce((s, a) => s + (a.totalTriggered || 0), 0), icon: Sparkles, color: "#0ea5e9" },
            { label: "Completed", value: automations.reduce((s, a) => s + (a.totalCompleted || 0), 0), icon: Send, color: "#7c3aed" },
          ].map((s) => (
            <Card key={s.label} className="rounded-xl">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${s.color}15`, color: s.color }}>
                  <s.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-lg font-semibold leading-none text-foreground">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : automations.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#711419] to-[#a31d24] text-white shadow-lg">
                <Zap className="h-7 w-7" />
              </span>
              <h3 className="text-lg font-semibold text-foreground">Create your first automation</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Automatically text a review request after a job, follow up on unpaid invoices, welcome new customers — all hands-free.
              </p>
              <Button onClick={openNew} className="mt-5 bg-[#711419] hover:bg-[#5a1014]">
                <Plus className="mr-1.5 h-4 w-4" /> New automation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {automations.map((a) => {
              const acts = (a.actions as any[]) || [];
              const conds = (a.conditions as any[]) || [];
              const tType = (a.trigger as any)?.type;
              return (
                <Card key={a.id} className="group rounded-2xl transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold text-foreground">{a.name}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                            {a.isActive ? "Live" : "Off"}
                          </span>
                        </div>
                        {a.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.description}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch checked={!!a.isActive} onCheckedChange={() => toggle.mutate(a)} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => remove.mutate(a.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Flow summary */}
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#711419]/10 px-2.5 py-1 text-xs font-medium text-[#711419]">
                        <LIcon name={triggerIcon(tType)} className="h-3.5 w-3.5" />
                        {triggerLabel(tType)}
                      </span>
                      {conds.length > 0 && (
                        <>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">
                            <Filter className="h-3.5 w-3.5" /> {conds.length} filter{conds.length > 1 ? "s" : ""}
                          </span>
                        </>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {acts.map((ac, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          <LIcon name={actionIcon(ac.type)} className="h-3.5 w-3.5" /> {actionLabel(ac.type)}
                        </span>
                      ))}
                    </div>

                    {/* Meta */}
                    <div className="mt-3 flex items-center gap-4 border-t pt-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {(a.timing as any)?.delay ? `${(a.timing as any).delay} ${(a.timing as any).delayUnit} delay` : "Immediate"}</span>
                      <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> {(a.safeguards as any)?.cooldownDays || 0}d cooldown</span>
                      <span className="ml-auto inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> {a.totalTriggered || 0} runs</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

    </MarketingChrome>
  );
}
