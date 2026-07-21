import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Mail, Search, PenSquare, Loader2, Inbox, Send, Paperclip, X,
  CornerUpLeft, Link2, ArrowLeft, AlertTriangle,
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
  gmailMessageId: string;
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
  attachments: { filename: string; mimeType: string; size: number; attachmentId?: string }[] | null;
  sentAt: string | null;
};

type Folder = "inbox" | "unread" | "sent";

type OutAttachment = { filename: string; mimeType: string; contentBase64: string; size: number };
const MAX_ATTACH_TOTAL = 20 * 1024 * 1024; // 20MB combined

async function fileToAttachment(file: File): Promise<OutAttachment> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return {
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    contentBase64: (dataUrl.split(",")[1] || ""),
    size: file.size,
  };
}
function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Textarea that grows with its content up to maxHeight, then scrolls.
function AutoTextarea({
  value, onChange, onKeyDown, placeholder, className, testid, minHeight = 44, maxHeight = 220,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  testid?: string;
  minHeight?: number;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)}px`;
  }, [value, minHeight, maxHeight]);
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={{ maxHeight }}
      className={className}
      data-testid={testid}
    />
  );
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return format(d, "h:mm a");
  if (d.getFullYear() === now.getFullYear()) return format(d, "MMM d");
  return format(d, "MMM d, yyyy");
}

// Display name for a thread row: prefer the participant's name-ish local part.
function primaryName(t: Thread): string {
  const p = (t.participants && t.participants[0]) || "";
  if (!p) return "(no recipient)";
  return p;
}

function initials(str: string): string {
  const s = (str || "").replace(/@.*/, "").replace(/[._-]+/g, " ").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function CrmMail() {
  usePageTitle("Mail");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [folder, setFolder] = useState<Folder>("inbox");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyHtml, setReplyHtml] = useState("");
  const [replyFiles, setReplyFiles] = useState<OutAttachment[]>([]);
  const replyFileInput = useRef<HTMLInputElement | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const addReplyFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added = await Promise.all(Array.from(files).map(fileToAttachment));
    setReplyFiles((prev) => {
      const next = [...prev, ...added];
      if (next.reduce((s, a) => s + a.size, 0) > MAX_ATTACH_TOTAL) {
        toast({ variant: "destructive", title: "Attachments too large", description: "Keep the total under 20 MB." });
        return prev;
      }
      return next;
    });
  };

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

  const unreadCount = useMemo(
    () => threads.reduce((n, t) => n + (t.isUnread ? 1 : 0), 0),
    [threads],
  );

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  // Near-real-time: pull from Gmail every 4s while the page is visible, and
  // immediately whenever the tab regains focus/visibility. The page otherwise
  // reads the local DB. Runs silently — errors surface in the banner.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let inFlight = false;
    const doSync = async () => {
      if (inFlight || document.hidden) return; // skip while a sync is running or tab is hidden
      inFlight = true;
      try {
        const res = await apiRequest("POST", "/api/crm/mail/sync");
        await res.json();
        if (cancelled) return;
        setSyncError(null);
        queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads"] });
        if (selectedIdRef.current) queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads", selectedIdRef.current] });
      } catch (e: any) {
        if (!cancelled) setSyncError(e?.message || "Sync failed");
      } finally {
        inFlight = false;
      }
    };
    doSync(); // immediate first pull
    const id = setInterval(doSync, 4000);
    // Sync the instant the tab comes back so returning users see new mail now
    const onVisible = () => { if (!document.hidden) doSync(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [connected]);

  // Show a toast after returning from the OAuth connect flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      toast({ title: "Gmail connected", description: "Your inbox will sync in a moment." });
      window.history.replaceState({}, "", window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/gmail/status"] });
    } else if (params.get("error")) {
      toast({ variant: "destructive", title: "Couldn't connect Gmail", description: params.get("error") || "" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (payload: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; threadRowId?: string; attachments?: OutAttachment[] }) =>
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
    setReplyFiles([]);
    // Optimistically clear unread in the list
    queryClient.setQueryData<{ connected: boolean; threads: Thread[] }>(
      ["/api/crm/mail/threads", { folder, search }],
      (prev) => (prev ? { ...prev, threads: prev.threads.map((t) => (t.id === id ? { ...t, isUnread: false } : t)) } : prev),
    );
  };

  const handleReply = () => {
    if (!threadDetail || (!replyHtml.trim() && replyFiles.length === 0)) return;
    const msgs = threadDetail.messages;
    const last = msgs[msgs.length - 1];
    const me = (status?.gmailAddress || "").toLowerCase();
    // Reply to the other party (the last message's sender if it wasn't me)
    const to = last.direction === "inbound" && last.fromEmail ? [last.fromEmail] : (last.toEmails || []).filter((e) => e.toLowerCase() !== me);
    if (to.length === 0 && last.fromEmail) to.push(last.fromEmail);
    const subject = (threadDetail.thread.subject || "").replace(/^(re:\s*)+/i, "");
    sendMutation.mutate(
      { to, subject: `Re: ${subject}`, html: (replyHtml.trim() ? replyHtml : "").replace(/\n/g, "<br>"), threadRowId: threadDetail.thread.id, attachments: replyFiles },
      { onSuccess: () => { setReplyHtml(""); setReplyFiles([]); } },
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
        <div className="mx-auto max-w-lg py-24 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Mail className="h-7 w-7 text-slate-400" />
          </div>
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
        <div className="mx-auto max-w-lg py-24 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#711419]/10">
            <Mail className="h-8 w-8 text-[#711419]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Connect your Workspace Gmail</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Send and receive email from your own address, right inside the CRM. Messages land in your normal
            Gmail Sent folder and replies come back to your inbox.
          </p>
          <Button
            className="mt-6 h-11 rounded-xl bg-[#711419] px-6 hover:bg-[#8a1a1f]"
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

  const FOLDERS: { key: Folder; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" />, badge: unreadCount || undefined },
    { key: "unread", label: "Unread", icon: <Mail className="h-4 w-4" /> },
    { key: "sent", label: "Sent", icon: <Send className="h-4 w-4" /> },
  ];

  return (
    <CrmLayout currentUser={currentUser} flush disableScroll hideGlobalSearch>
      <div className="flex h-full min-h-0 bg-slate-50">
        {/* Left: folders + thread list */}
        <div
          className={`${selectedId ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-slate-200/80 bg-white lg:w-[400px]`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#711419]/10">
                <Mail className="h-[18px] w-[18px] text-[#711419]" />
              </div>
              <div className="min-w-0 leading-tight">
                <div className="font-semibold text-slate-900">Mail</div>
                <div className="truncate text-[11px] text-slate-400">{status?.gmailAddress}</div>
              </div>
            </div>
            <Button
              size="sm"
              className="h-9 rounded-xl bg-[#711419] px-3.5 shadow-sm hover:bg-[#8a1a1f]"
              onClick={() => setComposeOpen(true)}
              data-testid="button-compose"
            >
              <PenSquare className="mr-1.5 h-4 w-4" /> Compose
            </Button>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
                onBlur={() => setSearch(searchInput.trim())}
                placeholder="Search mail…"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm focus-visible:bg-white"
                data-testid="input-mail-search"
              />
            </div>
          </div>

          {/* Folder tabs */}
          <div className="flex items-center gap-1 border-b border-slate-100 px-3 pb-2">
            {FOLDERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFolder(f.key); setSelectedId(null); }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                  folder === f.key ? "bg-[#711419]/10 text-[#711419]" : "text-slate-500 hover:bg-slate-100"
                }`}
                data-testid={`folder-${f.key}`}
              >
                {f.icon}
                {f.label}
                {f.badge ? (
                  <span className="ml-0.5 rounded-full bg-[#711419] px-1.5 text-[10px] font-semibold text-white">
                    {f.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Sync error banner */}
          {syncError && (
            <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="break-words">{syncError}</span>
                <button
                  onClick={() => { window.location.href = "/api/crm/gmail/connect"; }}
                  className="ml-1 font-semibold underline hover:no-underline"
                >
                  Reconnect
                </button>
              </div>
              <button onClick={() => setSyncError(null)} className="text-amber-500 hover:text-amber-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Thread list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threadsLoading ? (
              <div className="space-y-1 p-2">
                {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-xl" />)}
              </div>
            ) : threads.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <Inbox className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Nothing here yet</p>
                <p className="mt-1 text-xs text-slate-400">
                  {search ? "No messages match your search." : "New messages will appear here automatically."}
                </p>
              </div>
            ) : (
              <div className="p-2">
                {threads.map((t) => {
                  const name = primaryName(t);
                  const active = selectedId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      className={`group mb-0.5 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-[#711419]/[0.07]" : "hover:bg-slate-100"
                      }`}
                      data-testid={`thread-${t.id}`}
                    >
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          t.isUnread ? "bg-[#711419] text-white" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {initials(name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${t.isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                            {name}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">{fmtWhen(t.lastMessageAt)}</span>
                        </div>
                        <div className={`truncate text-[13px] ${t.isUnread ? "font-medium text-slate-800" : "text-slate-600"}`}>
                          {t.subject || "(no subject)"}
                        </div>
                        <div className="truncate text-xs text-slate-400">{t.snippet}</div>
                      </div>
                      {t.isUnread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#711419]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: thread detail */}
        <div className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-0 flex-1 flex-col bg-slate-50`}>
          {!selectedId ? (
            <div className="flex h-full items-center justify-center text-center text-muted-foreground">
              <div>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                  <Mail className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500">Select a conversation to read it</p>
              </div>
            </div>
          ) : detailLoading || !threadDetail ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-start gap-3 border-b border-slate-200/80 bg-white px-4 py-3.5 lg:px-6">
                <button
                  onClick={() => setSelectedId(null)}
                  className="mt-0.5 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
                  aria-label="Back"
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-slate-900">{threadDetail.thread.subject || "(no subject)"}</h2>
                  {threadDetail.customer && (
                    <button
                      onClick={() => navigate(`/crm/customers/${threadDetail.customer.id}`)}
                      className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-[#711419]/10 px-2 py-0.5 text-xs font-medium text-[#711419] hover:bg-[#711419]/15"
                    >
                      <Link2 className="h-3 w-3" /> {threadDetail.customer.name}
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
                <div className="mx-auto max-w-3xl space-y-3">
                  {threadDetail.messages.map((m) => {
                    const outbound = m.direction === "outbound";
                    return (
                      <div key={m.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm" data-testid={`message-${m.id}`}>
                        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${outbound ? "bg-[#711419] text-white" : "bg-slate-200 text-slate-600"}`}>
                            {initials(m.fromName || m.fromEmail || "?")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="text-sm font-semibold text-slate-800">{m.fromName || m.fromEmail}</span>
                              {m.fromName && <span className="text-xs text-slate-400">{m.fromEmail}</span>}
                            </div>
                            <div className="truncate text-xs text-slate-400">to {(m.toEmails || []).join(", ")}</div>
                          </div>
                          <span className="shrink-0 pt-0.5 text-xs text-slate-400">{m.sentAt ? format(new Date(m.sentAt), "MMM d, h:mm a") : ""}</span>
                        </div>
                        <div className="px-4 py-4">
                          {m.bodyHtml ? (
                            <div className="email-body overflow-x-auto text-sm leading-relaxed text-slate-700 [&_a]:text-[#711419] [&_a]:underline [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.bodyHtml) }} />
                          ) : (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{m.bodyText || m.snippet}</p>
                          )}
                          {m.hasAttachments && (m.attachments?.length ?? 0) > 0 && (
                            <div className="mt-4 border-t border-slate-100 pt-3">
                              {/* Inline previews for images */}
                              {m.attachments!.some((a) => a.attachmentId && a.mimeType?.startsWith("image/")) && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                  {m.attachments!.filter((a) => a.attachmentId && a.mimeType?.startsWith("image/")).map((a, i) => {
                                    const url = `/api/crm/mail/messages/${m.gmailMessageId}/attachments/${a.attachmentId}`;
                                    return (
                                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" title={a.filename}>
                                        <img src={url} alt={a.filename} className="max-h-48 rounded-lg border border-slate-200 object-cover" />
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                              {/* Chips for everything (download links when we have the id) */}
                              <div className="flex flex-wrap gap-2">
                                {m.attachments!.map((a, i) => {
                                  const url = a.attachmentId ? `/api/crm/mail/messages/${m.gmailMessageId}/attachments/${a.attachmentId}` : null;
                                  const inner = (
                                    <>
                                      <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                                      <span className="max-w-[200px] truncate">{a.filename}</span>
                                      {a.size ? <span className="text-slate-400">{prettySize(a.size)}</span> : null}
                                    </>
                                  );
                                  return url ? (
                                    <a
                                      key={i}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 transition-colors hover:border-[#711419]/40 hover:bg-white"
                                      data-testid={`attachment-${m.id}-${i}`}
                                    >
                                      {inner}
                                    </a>
                                  ) : (
                                    <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500">
                                      {inner}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reply box */}
              <div className="shrink-0 border-t border-slate-200/80 bg-white px-4 py-3 lg:px-6">
                <div className="mx-auto max-w-3xl">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center gap-1.5 px-3 pt-2 text-xs font-medium text-slate-400">
                      <CornerUpLeft className="h-3.5 w-3.5" /> Reply
                    </div>
                    <AutoTextarea
                      value={replyHtml}
                      onChange={(e) => setReplyHtml(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleReply(); }
                      }}
                      placeholder="Write your reply…"
                      minHeight={48}
                      maxHeight={220}
                      className="resize-none overflow-y-auto border-0 bg-transparent px-3 py-1.5 text-sm shadow-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      testid="input-reply"
                    />
                    {replyFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
                        {replyFiles.map((f, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                            <Paperclip className="h-3 w-3" />
                            <span className="max-w-[140px] truncate">{f.filename}</span>
                            <span className="text-slate-400">{prettySize(f.size)}</span>
                            <button onClick={() => setReplyFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 pb-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          ref={replyFileInput}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => { addReplyFiles(e.target.files); e.target.value = ""; }}
                          data-testid="reply-file-input"
                        />
                        <button
                          onClick={() => replyFileInput.current?.click()}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Attach files"
                          data-testid="reply-attach"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                        <span className="hidden text-[11px] text-slate-400 sm:inline">⌘ + Return to send</span>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 rounded-lg bg-[#711419] hover:bg-[#8a1a1f]"
                        disabled={(!replyHtml.trim() && replyFiles.length === 0) || sendMutation.isPending}
                        onClick={handleReply}
                        data-testid="button-send-reply"
                      >
                        {sendMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                        Send
                      </Button>
                    </div>
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
  onSend: (p: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; attachments?: OutAttachment[] }) => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<OutAttachment[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTo(""); setCc(""); setBcc(""); setShowCc(false); setShowBcc(false); setSubject(""); setBody(""); setFiles([]);
    }
  }, [open]);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const added = await Promise.all(Array.from(list).map(fileToAttachment));
    setFiles((prev) => {
      const next = [...prev, ...added];
      if (next.reduce((s, a) => s + a.size, 0) > MAX_ATTACH_TOTAL) {
        toast({ variant: "destructive", title: "Attachments too large", description: "Keep the total under 20 MB." });
        return prev;
      }
      return next;
    });
  };

  const splitEmails = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

  const submit = () => {
    const toList = splitEmails(to);
    if (toList.length === 0) { toast({ variant: "destructive", title: "Add a recipient" }); return; }
    if (!body.trim() && files.length === 0) { toast({ variant: "destructive", title: "Write a message" }); return; }
    onSend({
      to: toList,
      cc: splitEmails(cc),
      bcc: splitEmails(bcc),
      subject: subject.trim() || "(no subject)",
      html: body.replace(/\n/g, "<br>"),
      attachments: files,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <PenSquare className="h-4 w-4 text-[#711419]" /> New message
          </DialogTitle>
        </DialogHeader>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center gap-2 px-5 py-2.5">
            <label className="w-12 shrink-0 text-sm text-slate-500">To</label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className="flex-1 border-0 px-0 shadow-none focus-visible:ring-0" data-testid="compose-to" />
            <div className="flex shrink-0 gap-2 text-xs font-medium text-slate-400">
              {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-slate-700">Cc</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-slate-700">Bcc</button>}
            </div>
          </div>
          {showCc && (
            <div className="flex items-center gap-2 px-5 py-2.5">
              <label className="w-12 shrink-0 text-sm text-slate-500">Cc</label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="flex-1 border-0 px-0 shadow-none focus-visible:ring-0" data-testid="compose-cc" />
              <button onClick={() => { setShowCc(false); setCc(""); }} className="shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          )}
          {showBcc && (
            <div className="flex items-center gap-2 px-5 py-2.5">
              <label className="w-12 shrink-0 text-sm text-slate-500">Bcc</label>
              <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com" className="flex-1 border-0 px-0 shadow-none focus-visible:ring-0" data-testid="compose-bcc" />
              <button onClick={() => { setShowBcc(false); setBcc(""); }} className="shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-center gap-2 px-5 py-2.5">
            <label className="w-12 shrink-0 text-sm text-slate-500">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="flex-1 border-0 px-0 shadow-none focus-visible:ring-0" data-testid="compose-subject" />
          </div>
          <AutoTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="Write your message…"
            minHeight={220}
            maxHeight={420}
            className="resize-none overflow-y-auto rounded-none border-0 px-5 py-3 text-sm shadow-none focus-visible:ring-0"
            testid="compose-body"
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-5 py-2.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{f.filename}</span>
                  <span className="text-slate-400">{prettySize(f.size)}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center border-t border-slate-100 px-5 py-3.5 sm:justify-between">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            data-testid="compose-file-input"
          />
          <button
            onClick={() => fileInput.current?.click()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Attach files"
            data-testid="compose-attach"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-lg" onClick={onClose}>Cancel</Button>
            <Button className="rounded-lg bg-[#711419] hover:bg-[#8a1a1f]" disabled={sending} onClick={submit} data-testid="compose-send">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
