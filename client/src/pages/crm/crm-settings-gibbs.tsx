import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import {
  AI_ACTION_LABELS,
  type AiChatMessage,
  type AiConversationSummary,
  fetchAiConversation,
} from "@/lib/ai-conversations";
import type { CrmUser } from "@shared/schema";
import { format } from "date-fns";

/** Settings → Gibbs: oversight for the assistant. Two views —
 *  Conversations (read any team member's chats, read-only; same data the
 *  modal's review mode uses) and Actions (every action Gibbs proposed or
 *  ran across the whole team, filterable by user). Monitoring only:
 *  approvals still happen in each person's own chat. */

type ActionRow = {
  id: string;
  createdAt: string | null;
  userId: string;
  userName: string;
  type: string;
  summary: string;
  status: string;
  resultLabel: string | null;
  resultUrl: string | null;
};

/** Curated, human-readable capability list — update when actions ship. */
const GIBBS_ACTIONS: Array<{ type: string; what: string; builder?: boolean }> = [
  { type: "create_task", what: "Add internal tasks with due dates" },
  { type: "create_work_order", what: "Book jobs — customer, schedule, tech, and the right checklist" },
  { type: "update_work_order", what: "Reschedule, reassign, or retitle an existing job" },
  { type: "delete_work_order", what: "Remove a job" },
  { type: "send_sms", what: "Text a customer — you approve the exact wording" },
  { type: "send_email", what: "Email a customer — you approve the exact wording" },
  { type: "create_customer", what: "Add a customer record" },
  { type: "update_customer", what: "Fix customer details" },
  { type: "delete_customer", what: "Remove a customer" },
  { type: "create_quote", what: "Draft quick quotes or full proposals — single or Good/Better/Best options" },
  { type: "delete_quote", what: "Remove a quote" },
  { type: "create_invoice", what: "Draft invoices — ad-hoc, from a quote, or a deposit" },
  { type: "log_call", what: "Add entries to today's call log" },
  { type: "create_lead", what: "Put a customer into the sales funnel" },
  { type: "update_lead", what: "Move funnel stages, deal values, temperature, or the salesperson" },
  { type: "create_checklist", what: "Build complete service checklist templates", builder: true },
  { type: "create_item", what: "Add price book items", builder: true },
  { type: "remap_package_models", what: "Fix package model numbers against the equipment catalog", builder: true },
];

const GIBBS_KNOWS = [
  "Customer profiles, jobs, quotes, invoices, agreements, and tasks — live",
  "Today's schedule and the dispatch board",
  "Package economics: cost, margin, and what-if scenarios",
  "Unmatched package models, with scored fix suggestions",
  "Checklist templates, the price book, and proposal packages",
  "Company documents (SOPs, policies) from the Documents app",
  "Business totals — unpaid invoices, active agreements, customer counts",
];

/** The update tracker: what shipped and what is coming. Keep honest —
 *  planned entries move up with a date when they actually land. */
const GIBBS_TIMELINE: Array<{ when: string; title: string; detail: string; planned?: boolean }> = [
  { when: "Planned", title: "Price-file digests", detail: "A plain-English summary after every supplier price file: what moved and which packages it hits.", planned: true },
  { when: "Planned", title: "Catalog adds by chat", detail: "Hand Gibbs a cost and he proposes adding the missing model to the catalog.", planned: true },
  { when: "Aug 13, 2026", title: "Sharper instincts from real usage", detail: "Never denies an ability he actually has, never claims a card that wasn't registered, and photo details (phones, emails, addresses) carry all the way into the actions he prepares." },
  { when: "Aug 12, 2026", title: "Native to Package Pricing", detail: "A dedicated side-panel Gibbs that sees your screen — plus photos, pasted straight into the chat." },
  { when: "Aug 11, 2026", title: "Package economics + model cleanup", detail: "Live cost/margin answers, what-if labor scenarios, and unmatched-model fixes in one approval card." },
  { when: "Aug 11, 2026", title: "Sales funnel + job editing", detail: "Create and move leads; edit existing work orders with checklist pinning." },
  { when: "Aug 5, 2026", title: "Builder actions", detail: "Full checklist templates and price book items — supervisor and up." },
  { when: "Aug 3, 2026", title: "Create Copilot", detail: "Gibbs fills the New Customer / New Job forms on mobile — the Create button is the approval." },
  { when: "Jul 29, 2026", title: "Never guesses the customer", detail: "Ambiguous names get a pick-first flow before anything is proposed; near-duplicates are refused." },
  { when: "Jul 24, 2026", title: "Approval-gated actions", detail: "Tasks, jobs, texts, emails, customers, quotes, invoices — every action is a card someone approves first." },
];

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  approved: { label: "Ran", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "Awaiting approval", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  dismissed: { label: "Dismissed", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  superseded: { label: "Replaced", cls: "bg-slate-100 text-slate-400 border-slate-200" },
};

export default function CrmSettingsGibbs() {
  usePageTitle("Gibbs — Settings");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"conversations" | "actions" | "abilities">("conversations");
  const [convoUser, setConvoUser] = useState<string>("");
  const [actionsUser, setActionsUser] = useState<string>("all");
  const [openConvo, setOpenConvo] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<AiChatMessage[] | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: team = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const { data: convos = [], isLoading: convosLoading } = useQuery<AiConversationSummary[]>({
    queryKey: [`/api/crm/ai/conversations?userId=${convoUser}`],
    enabled: !!currentUser && !!convoUser,
  });

  const { data: actions = [], isLoading: actionsLoading } = useQuery<ActionRow[]>({
    queryKey: [actionsUser === "all" ? "/api/crm/ai/admin/actions" : `/api/crm/ai/admin/actions?userId=${actionsUser}`],
    enabled: !!currentUser && tab === "actions",
  });

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  // Load a transcript when a conversation is picked.
  useEffect(() => {
    if (!openConvo) {
      setTranscript(null);
      return;
    }
    let alive = true;
    setTranscript(null);
    fetchAiConversation(openConvo).then((loaded) => {
      if (alive) setTranscript(loaded?.messages || []);
    });
    return () => { alive = false; };
  }, [openConvo]);

  // Switching teammate resets the open thread.
  useEffect(() => { setOpenConvo(null); }, [convoUser]);

  if (authLoading || !currentUser) return null;

  const isOwnerAdmin = currentUser.role === "owner" || currentUser.role === "admin";
  if (!isOwnerAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground mb-6">Gibbs</h1>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Only owners and admins can monitor Gibbs activity.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const activeTeam = team.filter((u: any) => u.isActive !== false);
  const openConvoTitle = convos.find((c) => c.id === openConvo)?.title || "Conversation";

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/crm/settings")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Gibbs</h1>
            <p className="text-sm text-slate-500">Every conversation and every action, across the whole team</p>
          </div>
        </div>

        <div className="mb-4 flex w-full max-w-md items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
          {([
            ["conversations", "Conversations"],
            ["actions", "Actions"],
            ["abilities", "What Gibbs can do"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
              data-testid={`gibbs-tab-${value}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "conversations" && (
          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>
                Read any team member's Gibbs chats — read-only, exactly as they happened. Approvals
                always stay with the person who owns the chat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={convoUser || "__none"} onValueChange={(v) => setConvoUser(v === "__none" ? "" : v)}>
                <SelectTrigger className="h-9 w-56" data-testid="gibbs-convo-user"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Pick a team member…</SelectItem>
                  {activeTeam.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {!convoUser ? (
                <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                  Pick a team member to see their Gibbs history.
                </p>
              ) : (
                <div className="flex gap-4 max-lg:flex-col lg:min-h-[480px]">
                  <div className="w-72 shrink-0 max-lg:w-full lg:relative">
                    <div className="overflow-y-auto rounded-lg border border-slate-200 max-lg:max-h-64 lg:absolute lg:inset-0">
                      {convosLoading ? (
                        <div className="space-y-2 p-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                      ) : convos.length === 0 ? (
                        <p className="px-3 py-8 text-center text-sm text-slate-400">No conversations yet.</p>
                      ) : (
                        convos.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setOpenConvo(c.id)}
                            className={`block w-full border-b border-slate-100 border-l-2 px-3 py-2 text-left transition-colors ${
                              openConvo === c.id ? "border-l-[#711419] bg-[#711419]/[0.04]" : "border-l-transparent hover:bg-slate-50"
                            }`}
                            data-testid={`gibbs-convo-${c.id}`}
                          >
                            <p className={`truncate text-sm ${openConvo === c.id ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                              {c.title || "Untitled chat"}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {c.updatedAt ? format(new Date(c.updatedAt), "MMM d, yyyy h:mm a") : ""}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    {!openConvo ? (
                      <p className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
                        Pick a conversation to read it.
                      </p>
                    ) : transcript === null ? (
                      <Skeleton className="h-60 w-full" />
                    ) : (
                      <div className="max-h-[560px] space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-4" data-testid="gibbs-transcript">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{openConvoTitle}</p>
                        {transcript.map((m, i) => (
                          <div key={i}>
                            {m.content && (
                              <div className={m.role === "user" ? "ml-10 rounded-lg bg-[#711419]/[0.06] px-3 py-2" : "mr-6"}>
                                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">{m.content}</p>
                              </div>
                            )}
                            {m.proposedAction && (
                              <div className="mt-1.5 rounded-lg border border-slate-200 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#711419]">
                                  {AI_ACTION_LABELS[m.proposedAction.type] || m.proposedAction.type}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-600">{m.proposedAction.summary}</p>
                                {(() => {
                                  const key = m.actionState === "done" ? "approved" : m.actionState === "dismissed" ? "dismissed" : m.actionState === "superseded" ? "superseded" : "pending";
                                  const st = STATUS_STYLES[key];
                                  return (
                                    <span className={`mt-1.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        ))}
                        {transcript.length === 0 && (
                          <p className="py-8 text-center text-sm text-slate-400">Empty conversation.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "actions" && (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>
                Everything Gibbs has proposed or run, team-wide — who asked, what it was, and how it
                ended. Nothing here executes without the owner of the chat approving it first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={actionsUser} onValueChange={setActionsUser}>
                <SelectTrigger className="h-9 w-56" data-testid="gibbs-actions-user"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Whole team</SelectItem>
                  {activeTeam.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {actionsLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : actions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                  No Gibbs actions yet{actionsUser !== "all" ? " for this person" : ""}.
                </p>
              ) : (
                <div className="max-h-[620px] overflow-auto rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">When</TableHead>
                        <TableHead className="w-36">Who</TableHead>
                        <TableHead className="w-44">Action</TableHead>
                        <TableHead>What</TableHead>
                        <TableHead className="w-40">Outcome</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actions.map((a) => {
                        const st = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="text-xs tabular-nums text-slate-500">
                              {a.createdAt ? format(new Date(a.createdAt), "MMM d, h:mm a") : "—"}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-slate-700">{a.userName}</TableCell>
                            <TableCell className="text-xs font-semibold text-[#711419]">
                              {AI_ACTION_LABELS[a.type] || a.type}
                            </TableCell>
                            <TableCell className="max-w-[380px]">
                              <p className="truncate text-xs text-slate-600" title={a.summary}>{a.summary}</p>
                              {a.resultLabel && a.status === "approved" && (
                                <p className="truncate text-[11px] text-slate-400" title={a.resultLabel}>{a.resultLabel}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                              {a.resultUrl && a.status === "approved" && (
                                <button
                                  onClick={() => navigate(a.resultUrl!)}
                                  className="ml-1.5 inline-flex items-center text-[11px] font-medium text-[#711419] hover:underline"
                                  data-testid={`gibbs-action-link-${a.id}`}
                                >
                                  View <ArrowUpRight className="h-3 w-3" />
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "abilities" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions Gibbs can take</CardTitle>
                <CardDescription>
                  Every one of these is proposed as a card and runs only after the person in the chat
                  approves it. Builder actions (amber) change company setup and take supervisor and up.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {GIBBS_ACTIONS.map((a) => (
                    <div key={a.type} className="flex items-baseline gap-2.5 border-b border-slate-100 py-2">
                      <span className={`shrink-0 text-xs font-semibold ${a.builder ? "text-amber-700" : "text-[#711419]"}`}>
                        {AI_ACTION_LABELS[a.type] || a.type}
                      </span>
                      <span className="min-w-0 flex-1 text-right text-xs text-slate-500">{a.what}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">He can also look up, live</p>
                <div className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {GIBBS_KNOWS.map((k) => (
                    <p key={k} className="border-b border-slate-100 py-1.5 text-xs text-slate-600">{k}</p>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Updates</CardTitle>
                <CardDescription>What Gibbs learned to do, and what's coming next.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {GIBBS_TIMELINE.map((t, i) => (
                    <div key={i} className="relative flex gap-4 pb-5 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.planned ? "border border-amber-400 bg-amber-50" : "bg-[#711419]"}`} />
                        {i < GIBBS_TIMELINE.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          {t.when}{t.planned && <span className="ml-1.5 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700">PLANNED</span>}
                        </p>
                        <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                        <p className="text-xs leading-relaxed text-slate-500">{t.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </CrmLayout>
  );
}
