import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/lib/sanitize-html";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import {
  Mail, Search, RefreshCw, PenSquare, Loader2, Inbox, Send, Circle, Paperclip, X, CornerUpLeft, Link2,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";

const MAROON = "#711419";

type Thread = {
  id: string;
  subject: string | null;
  snippet: string | null;
  participants: string[] | null;
  lastMessageAt: string | null;
  isUnread: boolean;
  customerId: string | null;
};
type EmailMessage = {
  id: string;
  direction: "inbound" | "outbound";
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[] | null;
  ccEmails: string[] | null;
  subject: string | null;
  snippet: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  hasAttachments: boolean;
  attachments: { filename: string; mimeType: string; size: number }[] | null;
  sentAt: string | null;
};

type Folder = "inbox" | "unread" | "sent";

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return format(d, "h:mm a");
  if (d.getFullYear() === now.getFullYear()) return format(d, "MMM d");
  return format(d, "MMM d, yyyy");
}

export default function CrmMail() {
  usePageTitle("Mail");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [folder, setFolder] = useState<Folder>("inbox");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyHtml, setReplyHtml] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: status, isLoading: statusLoading } = useQuery<{
    configured: boolean; connected: boolean; gmailAddress: string | null;
  }>({
    queryKey: ["/api/crm/gmail/status"],
    enabled: !!currentUser,
  });

  const connected = !!status?.connected;

  const { data: threadData, isLoading: threadsLoading } = useQuery<{ connected: boolean; threads: Thread[] }>({
    queryKey: ["/api/crm/mail/threads", { folder, search }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/mail/threads?folder=${folder}&search=${encodeURIComponent(search)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load mail");
      return res.json();
    },
    enabled: !!currentUser && connected,
    refetchInterval: 30000,
  });
  const threads = threadData?.threads || [];

  const { data: threadDetail, isLoading: detailLoading } = useQuery<{ thread: Thread; messages: EmailMessage[]; customer: any }>({
    queryKey: ["/api/crm/mail/threads", selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/mail/threads/${selectedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load thread");
      return res.json();
    },
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  // Show a toast after returning from the OAuth connect flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      toast({ title: "Gmail connected", description: "Your inbox will sync in a moment." });
      window.history.replaceState({}, "", window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/gmail/status"] });
      syncMutation.mutate();
    } else if (params.get("error")) {
      toast({ variant: "destructive", title: "Couldn't connect Gmail", description: params.get("error") || "" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/crm/mail/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Sync failed", description: e?.message }),
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; threadRowId?: string }) =>
      apiRequest("POST", "/api/crm/mail/send", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads", selectedId] });
      toast({ title: "Email sent" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Send failed", description: e?.message }),
  });

  const openThread = (id: string) => {
    setSelectedId(id);
    setReplyHtml("");
    // Optimistically clear unread in the list
    queryClient.setQueryData<{ connected: boolean; threads: Thread[] }>(
      ["/api/crm/mail/threads", { folder, search }],
      (prev) => (prev ? { ...prev, threads: prev.threads.map((t) => (t.id === id ? { ...t, isUnread: false } : t)) } : prev),
    );
  };

  const handleReply = () => {
    if (!threadDetail || !replyHtml.trim()) return;
    const msgs = threadDetail.messages;
    const last = msgs[msgs.length - 1];
    const me = (status?.gmailAddress || "").toLowerCase();
    // Reply to the other party (the last message's sender if it wasn't me)
    const to = last.direction === "inbound" && last.fromEmail ? [last.fromEmail] : (last.toEmails || []).filter((e) => e.toLowerCase() !== me);
    if (to.length === 0 && last.fromEmail) to.push(last.fromEmail);
    const subject = (threadDetail.thread.subject || "").replace(/^(re:\s*)+/i, "");
    sendMutation.mutate(
      { to, subject: `Re: ${subject}`, html: replyHtml.replace(/\n/g, "<br>"), threadRowId: threadDetail.thread.id },
      { onSuccess: () => setReplyHtml("") },
    );
  };

  if (authLoading || statusLoading || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
      </div>
    );
  }

  // ── Not configured / not connected states ────────────────────────────────
  if (status && !status.configured) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto max-w-lg py-20 text-center">
          <Mail className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <h1 className="text-xl font-semibold text-slate-900">Email isn't set up yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            An admin needs to enable the Gmail integration (Google Workspace) before you can send and receive email in the CRM.
          </p>
        </div>
      </CrmLayout>
    );
  }

  if (status && !connected) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto max-w-lg py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#711419]/10">
            <Mail className="h-7 w-7 text-[#711419]" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Connect your Workspace Gmail</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Send and receive email from your own <strong>@giesbrecht</strong> address, right inside the CRM. Messages
            land in your normal Gmail Sent folder and replies come back to your inbox.
          </p>
          <Button
            className="mt-6 bg-[#711419] hover:bg-[#8a1a1f]"
            onClick={() => { window.location.href = "/api/crm/gmail/connect"; }}
            data-testid="button-connect-gmail"
          >
            <Mail className="mr-2 h-4 w-4" /> Connect Gmail
          </Button>
          <p className="mt-3 text-xs text-slate-400">You'll be asked to grant access on Google's secure page.</p>
        </div>
      </CrmLayout>
    );
  }

  const FOLDERS: { key: Folder; label: string; icon: React.ReactNode }[] = [
    { key: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" /> },
    { key: "unread", label: "Unread", icon: <Circle className="h-4 w-4" /> },
    { key: "sent", label: "Sent", icon: <Send className="h-4 w-4" /> },
  ];

  return (
    <CrmLayout currentUser={currentUser} flush disableScroll hideGlobalSearch>
      <div className="flex h-full min-h-0">
        {/* Left: folders + thread list */}
        <div className="flex w-full max-w-sm shrink-0 flex-col border-r border-slate-200 bg-white lg:w-[380px]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#711419]" />
              <span className="font-semibold text-slate-900">Mail</span>
              <span className="text-xs text-slate-400">{status?.gmailAddress}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => syncMutation.mutate()}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Refresh"
                data-testid="button-sync-mail"
              >
                <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              </button>
              <Button size="sm" className="h-8 bg-[#711419] hover:bg-[#8a1a1f]" onClick={() => setComposeOpen(true)} data-testid="button-compose">
                <PenSquare className="mr-1.5 h-3.5 w-3.5" /> Compose
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
            {FOLDERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFolder(f.key); setSelectedId(null); }}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  folder === f.key ? "bg-[#711419]/10 text-[#711419]" : "text-slate-500 hover:bg-slate-50"
                }`}
                data-testid={`folder-${f.key}`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>

          <div className="border-b border-slate-100 px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
                onBlur={() => setSearch(searchInput.trim())}
                placeholder="Search mail…"
                className="h-9 bg-slate-50 pl-8 text-sm"
                data-testid="input-mail-search"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {threadsLoading ? (
              <div className="space-y-2 p-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : threads.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-muted-foreground">
                <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                Nothing here yet.
              </div>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                    selectedId === t.id ? "bg-[#711419]/5" : "hover:bg-slate-50"
                  }`}
                  data-testid={`thread-${t.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${t.isUnread ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                      {(t.participants && t.participants[0]) || "(no recipient)"}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtWhen(t.lastMessageAt)}</span>
                  </div>
                  <div className={`truncate text-sm ${t.isUnread ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                    {t.subject || "(no subject)"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {t.isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#711419]" />}
                    <span className="truncate text-xs text-slate-400">{t.snippet}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: thread detail */}
        <div className="hidden min-h-0 flex-1 flex-col bg-slate-50 lg:flex">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center text-center text-muted-foreground">
              <div>
                <Mail className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm">Select a conversation to read it.</p>
              </div>
            </div>
          ) : detailLoading || !threadDetail ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 bg-white px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">{threadDetail.thread.subject || "(no subject)"}</h2>
                {threadDetail.customer && (
                  <button
                    onClick={() => navigate(`/crm/customers/${threadDetail.customer.id}`)}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#711419] hover:underline"
                  >
                    <Link2 className="h-3 w-3" /> {threadDetail.customer.name}
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div className="mx-auto max-w-3xl space-y-4">
                  {threadDetail.messages.map((m) => (
                    <div key={m.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid={`message-${m.id}`}>
                      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 ${m.direction === "outbound" ? "bg-[#711419]/5" : "bg-slate-50"}`}>
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-slate-800">{m.fromName || m.fromEmail}</span>
                          <span className="ml-1.5 text-xs text-slate-400">{m.fromEmail}</span>
                          <div className="truncate text-xs text-slate-400">to {(m.toEmails || []).join(", ")}</div>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{m.sentAt ? format(new Date(m.sentAt), "MMM d, yyyy h:mm a") : ""}</span>
                      </div>
                      <div className="px-4 py-3">
                        {m.bodyHtml ? (
                          <div className="email-body overflow-x-auto text-sm text-slate-700 [&_a]:text-[#711419] [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.bodyHtml) }} />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm text-slate-700">{m.bodyText || m.snippet}</p>
                        )}
                        {m.hasAttachments && (m.attachments?.length ?? 0) > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                            {m.attachments!.map((a, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                                <Paperclip className="h-3 w-3" /> {a.filename}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reply box */}
              <div className="border-t border-slate-200 bg-white px-6 py-3">
                <div className="mx-auto max-w-3xl">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <CornerUpLeft className="h-3.5 w-3.5" /> Reply
                  </div>
                  <Textarea
                    value={replyHtml}
                    onChange={(e) => setReplyHtml(e.target.value)}
                    placeholder="Write your reply…"
                    rows={3}
                    className="mt-1.5 resize-none bg-white"
                    data-testid="input-reply"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      className="bg-[#711419] hover:bg-[#8a1a1f]"
                      disabled={!replyHtml.trim() || sendMutation.isPending}
                      onClick={handleReply}
                      data-testid="button-send-reply"
                    >
                      {sendMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        sending={sendMutation.isPending}
        onSend={(payload) => sendMutation.mutate(payload, { onSuccess: () => setComposeOpen(false) })}
      />
    </CrmLayout>
  );
}

function ComposeDialog({
  open, onClose, onSend, sending,
}: {
  open: boolean;
  onClose: () => void;
  sending: boolean;
  onSend: (p: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string }) => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) { setTo(""); setCc(""); setShowCc(false); setSubject(""); setBody(""); }
  }, [open]);

  const splitEmails = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

  const submit = () => {
    const toList = splitEmails(to);
    if (toList.length === 0) { toast({ variant: "destructive", title: "Add a recipient" }); return; }
    if (!body.trim()) { toast({ variant: "destructive", title: "Write a message" }); return; }
    onSend({ to: toList, cc: splitEmails(cc), subject: subject.trim() || "(no subject)", html: body.replace(/\n/g, "<br>") });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenSquare className="h-4 w-4 text-[#711419]" /> New email
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="w-12 shrink-0 text-sm text-slate-500">To</label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className="flex-1" data-testid="compose-to" />
            {!showCc && (
              <button onClick={() => setShowCc(true)} className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800">Cc</button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-2">
              <label className="w-12 shrink-0 text-sm text-slate-500">Cc</label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="flex-1" data-testid="compose-cc" />
              <button onClick={() => { setShowCc(false); setCc(""); }} className="shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="w-12 shrink-0 text-sm text-slate-500">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="flex-1" data-testid="compose-subject" />
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" rows={12} className="resize-none" data-testid="compose-body" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={sending} onClick={submit} data-testid="compose-send">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
