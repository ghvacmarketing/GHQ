import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isToday } from "date-fns";
import MobileShell from "./mobile-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Loader2, Mail, MailOpen, Monitor, PenSquare, RefreshCw, Search, Send, X,
} from "lucide-react";

/** Mobile Mail — the CRM's Gmail inbox on the phone. Threads list + reader +
 *  reply/compose, riding the same per-user Gmail connection as desktop
 *  /crm/mail (connect there once; this page uses it). */

type MailThread = {
  id: string;
  subject: string | null;
  snippet: string | null;
  participants: string[];
  participantNames: (string | null)[];
  lastMessageAt: string | null;
  isUnread: boolean;
};

type MailMessage = {
  id: string;
  direction: "inbound" | "outbound";
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
};

const threadWho = (t: MailThread) => {
  const name = t.participantNames?.find(Boolean);
  return name || t.participants?.[0] || "Unknown";
};

const listTime = (d: string | null) => {
  if (!d) return "";
  const dt = new Date(d);
  return isToday(dt) ? format(dt, "h:mm a") : format(dt, "MMM d");
};

export default function MobileMail() {
  const { toast } = useToast();
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [compose, setCompose] = useState({ to: "", subject: "", body: "" });

  const { data: inbox, isLoading, refetch, isRefetching } = useQuery<{ connected: boolean; threads: MailThread[] }>({
    queryKey: ["/api/crm/mail/threads", search],
    queryFn: async () => {
      const params = new URLSearchParams({ folder: "inbox" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/crm/mail/threads?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load mail");
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  const { data: threadDetail, isLoading: loadingThread } = useQuery<{ thread: MailThread; messages: MailMessage[]; customer?: { name?: string } | null }>({
    queryKey: ["/api/crm/mail/threads", openThreadId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/mail/threads/${openThreadId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load the thread");
      return res.json();
    },
    enabled: !!openThreadId,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { to: string; subject: string; html: string; threadRowId?: string }) =>
      apiRequest("POST", "/api/crm/mail/send", payload),
    onSuccess: () => {
      setReplyText("");
      setCompose({ to: "", subject: "", body: "" });
      setComposeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads"] });
      if (openThreadId) queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads", openThreadId] });
      toast({ title: "Email sent" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't send the email", variant: "destructive" }),
  });

  const openThread = inbox?.threads?.find((t) => t.id === openThreadId) || threadDetail?.thread;
  const replyTo = (() => {
    const lastInbound = [...(threadDetail?.messages || [])].reverse().find((m) => m.direction === "inbound");
    return lastInbound?.fromEmail || openThread?.participants?.[0] || "";
  })();

  const handleReply = () => {
    if (!replyText.trim() || !replyTo || !openThreadId) return;
    sendMutation.mutate({
      to: replyTo,
      subject: openThread?.subject?.startsWith("Re:") ? openThread.subject : `Re: ${openThread?.subject || ""}`,
      html: `<p>${sanitizeHtml(replyText).replace(/\n/g, "<br/>")}</p>`,
      threadRowId: openThreadId,
    });
  };

  return (
    <MobileShell>
      {/* ── Inbox ── */}
      <div className="flex h-full flex-col" data-testid="mobile-mail-page">
        <div className="space-y-3 border-b bg-white p-4">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Mail className="h-5 w-5 text-[#711419]" />
              Email
            </h1>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => refetch()} disabled={isRefetching} data-testid="button-mail-refresh">
                <RefreshCw className={`h-5 w-5 ${isRefetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="icon" variant="outline" onClick={() => setComposeOpen(true)} data-testid="button-mail-compose">
                <PenSquare className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-mail-search"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#711419]" />
            </div>
          ) : inbox && !inbox.connected ? (
            <div className="px-6 py-12 text-center text-slate-500">
              <Monitor className="mx-auto mb-3 h-14 w-14 text-slate-300" />
              <p className="mb-1 text-lg font-medium text-slate-700">Gmail isn't connected yet</p>
              <p className="text-sm">
                Connect your Google account once in the desktop CRM — Mail page — and your inbox appears here.
              </p>
            </div>
          ) : inbox && inbox.threads.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {inbox.threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenThreadId(t.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-50"
                  data-testid={`mail-thread-${t.id}`}
                >
                  <span className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t.isUnread ? "bg-[#711419] text-white" : "bg-slate-200 text-slate-600"}`}>
                    {t.isUnread ? <Mail className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} /> : <MailOpen className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[15px] ${t.isUnread ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                        {threadWho(t)}
                      </span>
                      <span className={`shrink-0 text-xs ${t.isUnread ? "font-semibold text-[#711419]" : "text-slate-400"}`}>
                        {listTime(t.lastMessageAt)}
                      </span>
                    </span>
                    <span className={`mt-0.5 block truncate text-sm ${t.isUnread ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                      {t.subject || "(no subject)"}
                    </span>
                    {t.snippet && <span className="mt-0.5 block truncate text-xs text-slate-400">{t.snippet}</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              <Mail className="mx-auto mb-3 h-16 w-16 text-slate-300" />
              <p className="text-lg font-medium">Inbox zero</p>
              <p className="text-sm">Nothing in your inbox right now.</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Thread reader ── */}
      {openThreadId && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50 animate-in slide-in-from-right duration-200" data-testid="mail-thread-view">
          <div
            className="flex items-center gap-2 border-b bg-white px-2 py-2"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
          >
            <button onClick={() => setOpenThreadId(null)} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100" data-testid="mail-thread-back">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">{openThread?.subject || "(no subject)"}</p>
              <p className="truncate text-xs text-slate-500">{openThread ? threadWho(openThread) : ""}</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
            {loadingThread ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              (threadDetail?.messages || []).map((m) => (
                <div key={m.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid={`mail-message-${m.id}`}>
                  <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
                      {m.direction === "outbound" ? "You" : m.fromName || m.fromEmail || "Unknown"}
                    </p>
                    <p className="shrink-0 text-[11px] text-slate-400">
                      {(m.sentAt || m.createdAt) ? format(new Date((m.sentAt || m.createdAt)!), "MMM d, h:mm a") : ""}
                    </p>
                  </div>
                  <div className="px-3.5 py-3">
                    {m.bodyHtml ? (
                      <div
                        className="prose prose-sm max-w-none break-words text-[14px] leading-relaxed [&_img]:max-w-full"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.bodyHtml) }}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-800">
                        {m.bodyText || m.snippet || ""}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            className="flex items-end gap-2 border-t bg-white px-3 pt-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
          >
            <div className="flex min-h-[44px] min-w-0 flex-1 items-center rounded-3xl border border-slate-200 bg-slate-50 px-4">
              <textarea
                placeholder={replyTo ? `Reply to ${replyTo}` : "Reply"}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={1}
                className="max-h-28 w-full resize-none bg-transparent py-3 text-[16px] leading-5 text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="mail-reply-input"
              />
            </div>
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || !replyTo || sendMutation.isPending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#711419] text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
              data-testid="mail-reply-send"
            >
              {sendMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Compose ── */}
      {composeOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white animate-in slide-in-from-bottom duration-200" data-testid="mail-compose">
          <div
            className="flex items-center gap-3 border-b bg-white p-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            <Button variant="ghost" size="icon" onClick={() => setComposeOpen(false)} data-testid="mail-compose-close">
              <X className="h-5 w-5" />
            </Button>
            <h2 className="flex-1 text-lg font-semibold">New email</h2>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={!compose.to.trim() || !compose.subject.trim() || !compose.body.trim() || sendMutation.isPending}
              onClick={() =>
                sendMutation.mutate({
                  to: compose.to.trim(),
                  subject: compose.subject.trim(),
                  html: `<p>${sanitizeHtml(compose.body).replace(/\n/g, "<br/>")}</p>`,
                })
              }
              data-testid="mail-compose-send"
            >
              {sendMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Send
            </Button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <Input
              type="email"
              placeholder="To"
              value={compose.to}
              onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
              data-testid="mail-compose-to"
            />
            <Input
              placeholder="Subject"
              value={compose.subject}
              onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
              data-testid="mail-compose-subject"
            />
            <textarea
              placeholder="Write your email…"
              value={compose.body}
              onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
              rows={10}
              className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[16px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#711419]"
              data-testid="mail-compose-body"
            />
          </div>
        </div>
      )}
    </MobileShell>
  );
}
