import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { MarketingChrome } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft, Users, Send, Reply, CheckCircle2, AlertTriangle, Mail,
  MessageSquare, ListTodo, Pause, Play, Pencil, Trash2, Ban, Clock,
  Sparkles, ExternalLink,
} from "lucide-react";
import { useState } from "react";
import {
  CAMPAIGN_STATUS_LABELS, describeFilters, describeStepDelay,
  type CampaignStep, type CampaignAudience, type CampaignStatus,
} from "@shared/campaigns";
import type { CrmUser, CrmCampaign } from "@shared/schema";

const STEP_META: Record<string, { label: string; icon: any; color: string }> = {
  email: { label: "Email", icon: Mail, color: "#0ea5e9" },
  sms: { label: "Text", icon: MessageSquare, color: "#16a34a" },
  task: { label: "Task", icon: ListTodo, color: "#7c3aed" },
};

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-100 text-sky-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-violet-100 text-violet-700",
  archived: "bg-muted text-muted-foreground",
};

interface CampaignDetail {
  campaign: CrmCampaign;
  enrollmentCounts: Record<string, number>;
  stepStats: { stepIndex: number; status: string; n: number }[];
  recentSends: {
    id: string; customerId: string; stepIndex: number; channel: string;
    status: string; detail: string | null; sentAt: string; customerName: string | null;
  }[];
  recentReplies: {
    customerId: string; customerName: string | null; replyChannel: string | null;
    repliedAt: string; conversationId: string | null;
  }[];
}

function ago(d: string | Date | null | undefined): string {
  if (!d) return "";
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return ""; }
}

export default function CrmCampaignDetail() {
  const params = useParams();
  const id = params.id!;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data, isLoading } = useQuery<CampaignDetail>({
    queryKey: [`/api/crm/campaigns/${id}`],
    enabled: !!currentUser,
    refetchInterval: (q) =>
      ["active", "scheduled"].includes((q.state.data as CampaignDetail | undefined)?.campaign.status || "") ? 30_000 : false,
  });

  const campaign = data?.campaign;
  usePageTitle(campaign?.name || "Campaign");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/crm/campaigns/${id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/campaigns"] });
  };

  const setStatus = useMutation({
    mutationFn: (status: "paused" | "active") => apiRequest("PATCH", `/api/crm/campaigns/${id}`, { status }),
    onSuccess: (_r, status) => { refresh(); toast({ title: status === "paused" ? "Campaign paused" : "Campaign resumed" }); },
    onError: () => toast({ title: "Couldn't update campaign", variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: () => apiRequest("POST", `/api/crm/campaigns/${id}/cancel`),
    onSuccess: () => { refresh(); toast({ title: "Campaign cancelled", description: "Remaining sends were stopped." }); },
    onError: () => toast({ title: "Couldn't cancel campaign", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/crm/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/campaigns"] });
      toast({ title: "Campaign deleted" });
      navigate("/marketing/campaigns");
    },
    onError: () => toast({ title: "Couldn't delete campaign", variant: "destructive" }),
  });

  if (isLoading || !campaign) {
    return (
      <MarketingChrome currentUser={currentUser ?? undefined}>
        <div className="mx-auto w-full max-w-6xl space-y-4 py-2">
          <Skeleton className="h-10 rounded-xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </MarketingChrome>
    );
  }

  const steps = (campaign.steps as CampaignStep[]) || [];
  const audience = campaign.audience as CampaignAudience;
  const counts = data!.enrollmentCounts;
  const inFlight = counts["active"] || 0;
  const replyRate = campaign.totalSent > 0 ? Math.round(((campaign.totalReplied || 0) / Math.max(1, campaign.audienceCount)) * 100) : 0;
  const editable = ["draft", "scheduled", "paused"].includes(campaign.status);

  const statFor = (i: number) => {
    const rows = data!.stepStats.filter((s) => s.stepIndex === i);
    const get = (st: string) => rows.find((r) => r.status === st)?.n || 0;
    return { sent: get("sent"), failed: get("failed"), skipped: get("skipped") };
  };

  return (
    <MarketingChrome currentUser={currentUser ?? undefined}>
      <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={() => navigate("/marketing/campaigns")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-xl font-semibold tracking-tight text-foreground">{campaign.name}</h1>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[campaign.status])}>
                {CAMPAIGN_STATUS_LABELS[campaign.status]}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {campaign.status === "scheduled" && campaign.startAt
                ? `Starts ${format(new Date(campaign.startAt), "MMM d, h:mm a")}`
                : campaign.launchedAt
                  ? `Launched ${ago(campaign.launchedAt)}`
                  : `Created ${ago(campaign.createdAt)}`}
              {campaign.lastSendAt ? ` · last send ${ago(campaign.lastSendAt)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {campaign.status === "active" || campaign.status === "scheduled" ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setStatus.mutate("paused")} disabled={setStatus.isPending}>
                  <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-600" onClick={() => setConfirmCancel(true)}>
                  <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancel
                </Button>
              </>
            ) : campaign.status === "paused" ? (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/marketing/campaigns/${id}/edit`)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" className="bg-[#711419] hover:bg-[#5a1014]" onClick={() => setStatus.mutate("active")} disabled={setStatus.isPending}>
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Resume
                </Button>
              </>
            ) : campaign.status === "draft" ? (
              <>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-600" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
                <Button size="sm" className="bg-[#711419] hover:bg-[#5a1014]" onClick={() => navigate(`/marketing/campaigns/${id}/edit`)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Continue editing
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Audience", value: campaign.audienceCount, icon: Users, color: "#711419" },
            { label: "In sequence", value: inFlight, icon: Clock, color: "#d97706" },
            { label: "Sends", value: campaign.totalSent, icon: Send, color: "#0ea5e9" },
            { label: "Replies", value: campaign.totalReplied, icon: Reply, color: "#16a34a", hint: campaign.audienceCount ? `${replyRate}%` : undefined },
            { label: "Finished", value: (counts["completed"] || 0) + (counts["replied"] || 0), icon: CheckCircle2, color: "#7c3aed" },
          ].map((s) => (
            <Card key={s.label} className="rounded-xl">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${s.color}15`, color: s.color }}>
                  <s.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-lg font-semibold leading-none tabular-nums text-foreground">
                    {s.value}{s.hint && <span className="ml-1 text-xs font-normal text-muted-foreground">({s.hint})</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr,380px]">
          <div className="min-w-0 space-y-4">
            {/* Step funnel */}
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground">Sequence performance</p>
                <div className="mt-4 space-y-3">
                  {steps.map((s, i) => {
                    const M = STEP_META[s.type] || STEP_META.task;
                    const st = statFor(i);
                    const denom = Math.max(1, campaign.audienceCount);
                    return (
                      <div key={s.id || i} className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${M.color}15`, color: M.color }}>
                          <M.icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-xs font-medium text-foreground">
                              Step {i + 1} · {s.type === "email" ? s.subject || "Email" : s.type === "sms" ? "Text message" : s.title || "Task"}
                            </p>
                            <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {st.sent} sent{st.skipped ? ` · ${st.skipped} skipped` : ""}{st.failed ? ` · ${st.failed} failed` : ""}
                            </p>
                          </div>
                          <div className="mt-1.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-l-full bg-[#711419]" style={{ width: `${Math.min(100, (st.sent / denom) * 100)}%` }} />
                            {st.failed > 0 && <div className="h-full bg-red-400" style={{ width: `${Math.min(100, (st.failed / denom) * 100)}%` }} />}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {i === 0 && !s.delay ? "At launch" : describeStepDelay(s)}
                            {s.onlyIf === "no_reply" ? " · only if no reply" : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Activity */}
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground">Recent activity</p>
                {data!.recentSends.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">Nothing sent yet.</p>
                ) : (
                  <div className="mt-2 divide-y">
                    {data!.recentSends.map((s) => {
                      const M = STEP_META[s.channel] || STEP_META.task;
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 py-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${M.color}15`, color: M.color }}>
                            <M.icon className="h-3 w-3" />
                          </span>
                          <p className="min-w-0 flex-1 truncate text-xs text-foreground">
                            <button className="font-medium hover:underline" onClick={() => navigate(`/crm/customers/${s.customerId}`)}>
                              {s.customerName || "Unknown"}
                            </button>
                            <span className="text-muted-foreground"> · step {s.stepIndex + 1} {M.label.toLowerCase()}</span>
                            {s.status !== "sent" && (
                              <span className={cn("ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium", s.status === "failed" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>
                                {s.status}{s.detail ? ` — ${s.detail}` : ""}
                              </span>
                            )}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{ago(s.sentAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {/* Replies */}
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Reply className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-semibold text-foreground">Replies</p>
                </div>
                {data!.recentReplies.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">No replies yet — they'll show up here the moment someone responds.</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {data!.recentReplies.map((r, i) => (
                      <button
                        key={i}
                        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-muted/60"
                        onClick={() =>
                          r.replyChannel === "sms" && r.conversationId
                            ? navigate(`/crm/messaging?conversation=${r.conversationId}`)
                            : navigate(`/crm/customers/${r.customerId}`)
                        }
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-700">
                          {r.replyChannel === "sms" ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{r.customerName || "Unknown"}</p>
                          <p className="text-[11px] text-muted-foreground">by {r.replyChannel === "sms" ? "text" : "email"} · {ago(r.repliedAt)}</p>
                        </div>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enrollment breakdown */}
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground">Enrollment status</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    ["active", "In sequence", "bg-amber-100 text-amber-700"],
                    ["completed", "Completed", "bg-violet-100 text-violet-700"],
                    ["replied", "Replied", "bg-green-100 text-green-700"],
                    ["stopped", "Stopped", "bg-muted text-muted-foreground"],
                    ["skipped", "No contact info", "bg-muted text-muted-foreground"],
                    ["failed", "Failed", "bg-red-100 text-red-700"],
                  ].map(([key, label, cls]) =>
                    counts[key] ? (
                      <span key={key} className={cn("rounded-lg px-2 py-1 text-[11px] font-medium", cls)}>
                        {counts[key]} {label}
                      </span>
                    ) : null,
                  )}
                  {Object.keys(counts).length === 0 && (
                    <p className="text-xs text-muted-foreground">No one enrolled yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Audience definition */}
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#711419]" />
                  <p className="text-sm font-semibold text-foreground">Audience</p>
                </div>
                <div className="mt-3 space-y-2">
                  {(audience?.segments || []).map((s, i) => (
                    <div key={s.id || i} className="flex flex-wrap items-center gap-1.5">
                      {i > 0 && <span className="text-[10px] font-semibold uppercase text-muted-foreground">or</span>}
                      {describeFilters(s.filters).map((d, j) => (
                        <span key={j} className="rounded-lg bg-[#711419]/10 px-2 py-0.5 text-[11px] font-medium text-[#711419]">{d}</span>
                      ))}
                    </div>
                  ))}
                  {(audience?.excludeContactedWithinDays ?? 0) > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Skipped anyone contacted within {audience.excludeContactedWithinDays} days of launch.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {campaign.totalFailed > 0 && (
              <Card className="rounded-2xl border-red-200">
                <CardContent className="flex items-start gap-2 p-4 text-xs text-red-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {campaign.totalFailed} send{campaign.totalFailed === 1 ? "" : "s"} failed — see Recent activity for details.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Cancel confirmation */}
        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel this campaign?</DialogTitle>
              <DialogDescription>
                {inFlight} contact{inFlight === 1 ? "" : "s"} still in the sequence will stop receiving steps. This can't be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep running</Button>
              <Button variant="destructive" onClick={() => { setConfirmCancel(false); cancel.mutate(); }}>
                Cancel campaign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this campaign?</DialogTitle>
              <DialogDescription>
                The campaign and its send history will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button variant="destructive" onClick={() => { setConfirmDelete(false); remove.mutate(); }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MarketingChrome>
  );
}
