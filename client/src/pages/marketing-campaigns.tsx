import { usePageTitle } from "@/hooks/use-page-title";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { MarketingChrome } from "@/components/marketing-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Plus, ArrowRight, MoreVertical, Pencil, Trash2, Clock, Send, AlertTriangle,
  MessageSquare, Mail, ListTodo, Megaphone, Users, Reply, Pause, Play, Ban, Eye,
} from "lucide-react";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/crm/ui-kit";
import { CAMPAIGN_STATUS_LABELS, type CampaignStep, type CampaignStatus } from "@shared/campaigns";
import type { CrmUser, CrmCampaign } from "@shared/schema";

const STEP_META: Record<string, { icon: any; color: string }> = {
  email: { icon: Mail, color: "#0ea5e9" },
  sms: { icon: MessageSquare, color: "#16a34a" },
  task: { icon: ListTodo, color: "#7c3aed" },
};

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-100 text-sky-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-violet-100 text-violet-700",
  archived: "bg-muted text-muted-foreground",
};

function ago(d: string | Date | null | undefined): string {
  if (!d) return "";
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return ""; }
}

export default function MarketingCampaigns() {
  usePageTitle("Marketing — Campaigns");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: campaigns = [], isLoading } = useQuery<CrmCampaign[]>({
    queryKey: ["/api/crm/campaigns"],
    enabled: !!currentUser,
    refetchInterval: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/crm/campaigns"] });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "paused" | "active" }) =>
      apiRequest("PATCH", `/api/crm/campaigns/${id}`, { status }),
    onSuccess: (_r, v) => { refresh(); toast({ title: v.status === "paused" ? "Campaign paused" : "Campaign resumed" }); },
    onError: () => toast({ title: "Couldn't update campaign", variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/crm/campaigns/${id}/cancel`),
    onSuccess: () => { refresh(); toast({ title: "Campaign cancelled" }); },
    onError: () => toast({ title: "Couldn't cancel campaign", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/campaigns/${id}`),
    onSuccess: () => { refresh(); toast({ title: "Campaign deleted" }); },
    onError: () => toast({ title: "Couldn't delete campaign", description: "Cancel it first if it's still running.", variant: "destructive" }),
  });

  const running = campaigns.filter((c) => ["active", "scheduled"].includes(c.status)).length;
  const totalSends = campaigns.reduce((s, c) => s + (c.totalSent || 0), 0);
  const totalReplies = campaigns.reduce((s, c) => s + (c.totalReplied || 0), 0);

  return (
    <MarketingChrome currentUser={currentUser ?? undefined}>
      <div className="w-full space-y-5 pb-10">
        <PageHeader
          title="Campaigns"
          description="Timed email + text sequences to an audience — they stop the moment someone replies."
          actions={
            <Button onClick={() => navigate("/marketing/campaigns/new")} className="bg-[#711419] hover:bg-[#5a1014]">
              <Plus className="mr-1.5 h-4 w-4" /> New campaign
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Campaigns", value: campaigns.length, icon: Megaphone, color: "#711419" },
            { label: "Running", value: running, icon: Play, color: "#16a34a" },
            { label: "Sends", value: totalSends, icon: Send, color: "#0ea5e9" },
            { label: "Replies", value: totalReplies, icon: Reply, color: "#7c3aed" },
          ].map((s) => (
            <Card key={s.label} className="rounded-xl">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${s.color}15`, color: s.color }}>
                  <s.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-lg font-semibold leading-none tabular-nums text-foreground">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#711419] to-[#a31d24] text-white shadow-lg">
                <Megaphone className="h-7 w-7" />
              </span>
              <h3 className="text-lg font-semibold text-foreground">Launch your first campaign</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Pick a template, choose an audience straight from your CRM, and send a timed email + text
                sequence that stops automatically when someone replies.
              </p>
              <Button onClick={() => navigate("/marketing/campaigns/new")} className="mt-5 bg-[#711419] hover:bg-[#5a1014]">
                <Plus className="mr-1.5 h-4 w-4" /> New campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {campaigns.map((c) => {
              const steps = (c.steps as CampaignStep[]) || [];
              const open = () =>
                navigate(c.status === "draft" ? `/marketing/campaigns/${c.id}/edit` : `/marketing/campaigns/${c.id}`);
              return (
                <Card key={c.id} className="group cursor-pointer rounded-2xl transition-shadow hover:shadow-md" onClick={open}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold text-foreground">{c.name}</h3>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[c.status])}>
                            {CAMPAIGN_STATUS_LABELS[c.status]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.status === "draft"
                            ? `Draft · created ${ago(c.createdAt)}`
                            : `${c.audienceCount} enrolled · ${c.totalSent} sent · ${c.totalReplied} repl${c.totalReplied === 1 ? "y" : "ies"}`}
                        </p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={open}>
                              {c.status === "draft" ? <><Pencil className="mr-2 h-4 w-4" /> Continue editing</> : <><Eye className="mr-2 h-4 w-4" /> View</>}
                            </DropdownMenuItem>
                            {["active", "scheduled"].includes(c.status) && (
                              <DropdownMenuItem onClick={() => setStatus.mutate({ id: c.id, status: "paused" })}>
                                <Pause className="mr-2 h-4 w-4" /> Pause
                              </DropdownMenuItem>
                            )}
                            {c.status === "paused" && (
                              <DropdownMenuItem onClick={() => setStatus.mutate({ id: c.id, status: "active" })}>
                                <Play className="mr-2 h-4 w-4" /> Resume
                              </DropdownMenuItem>
                            )}
                            {["active", "scheduled", "paused"].includes(c.status) && (
                              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => cancel.mutate(c.id)}>
                                <Ban className="mr-2 h-4 w-4" /> Cancel campaign
                              </DropdownMenuItem>
                            )}
                            {["draft", "completed", "archived"].includes(c.status) && (
                              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => remove.mutate(c.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Sequence preview */}
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#711419]/10 px-2.5 py-1 text-xs font-medium text-[#711419]">
                        <Users className="h-3.5 w-3.5" /> {c.audienceCount || "—"}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {steps.map((s, i) => {
                        const M = STEP_META[s.type] || STEP_META.task;
                        return (
                          <span key={s.id || i} className="flex items-center gap-1.5">
                            {i > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {s.delay ? `${s.delay}${s.delayUnit[0]}` : "→"}
                              </span>
                            )}
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-md"
                              style={{ background: `${M.color}15`, color: M.color }}
                            >
                              <M.icon className="h-3.5 w-3.5" />
                            </span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Meta */}
                    <div className="mt-3 flex items-center gap-4 border-t pt-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {c.status === "scheduled" && c.startAt
                          ? `starts ${new Date(c.startAt).toLocaleDateString()}`
                          : c.lastSendAt
                            ? `last send ${ago(c.lastSendAt)}`
                            : c.launchedAt
                              ? `launched ${ago(c.launchedAt)}`
                              : `created ${ago(c.createdAt)}`}
                      </span>
                      {(c.totalFailed || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> {c.totalFailed} failed
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1">
                        <Reply className="h-3.5 w-3.5" /> {c.totalReplied || 0} replies
                      </span>
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
