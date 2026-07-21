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
  CornerUpLeft, Link2, ArrowLeft, AlertTriangle, Download,
  FileText, FileSpreadsheet, FileImage, FileArchive, FileAudio, FileVideo, File as FileIconLucide,
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

// Pick a file-type icon + color from the mime type / extension so attachments
// read at a glance (image, spreadsheet, PDF, doc, zip, audio, video…).
function fileMeta(name: string, mime?: string): { Icon: typeof FileText; color: string; kind: string } {
  const m = (mime || "").toLowerCase();
  const ext = (name.split(".").pop() || "").toLowerCase();
  const has = (arr: string[]) => arr.includes(ext);
  if (m.startsWith("image/") || has(["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg"])) return { Icon: FileImage, color: "text-violet-500", kind: "Image" };
  if (m === "application/pdf" || ext === "pdf") return { Icon: FileText, color: "text-red-500", kind: "PDF" };
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv" || has(["xls", "xlsx", "csv", "numbers"])) return { Icon: FileSpreadsheet, color: "text-green-600", kind: "Spreadsheet" };
  if (m.includes("word") || m.includes("officedocument.wordprocessing") || has(["doc", "docx", "rtf", "odt", "pages"])) return { Icon: FileText, color: "text-blue-600", kind: "Document" };
  if (m.includes("presentation") || m.includes("powerpoint") || has(["ppt", "pptx", "key"])) return { Icon: FileText, color: "text-orange-500", kind: "Slides" };
  if (m.startsWith("audio/") || has(["mp3", "wav", "m4a", "aac", "ogg"])) return { Icon: FileAudio, color: "text-pink-500", kind: "Audio" };
  if (m.startsWith("video/") || has(["mp4", "mov", "avi", "mkv", "webm"])) return { Icon: FileVideo, color: "text-indigo-500", kind: "Video" };
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || has(["zip", "rar", "7z", "tar", "gz"])) return { Icon: FileArchive, color: "text-amber-600", kind: "Archive" };
  if (m.includes("json") || m.includes("xml") || m.startsWith("text/") || has(["txt", "json", "xml", "html", "md"])) return { Icon: FileText, color: "text-slate-500", kind: "Text" };
  return { Icon: FileIconLucide, color: "text-slate-400", kind: "File" };
}
function FileTypeIcon({ name, mime, className }: { name: string; mime?: string; className?: string }) {
  const { Icon, color } = fileMeta(name, mime);
  return <Icon className={`${className || "h-3.5 w-3.5"} ${color}`} />;
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
  const [viewer, setViewer] = useState<{ url: string; name: string; mimeType: string } | null>(null);
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
                              {/* Inline previews for images — open the in-app viewer */}
                              {m.attachments!.some((a) => a.attachmentId && a.mimeType?.startsWith("image/")) && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                  {m.attachments!.filter((a) => a.attachmentId && a.mimeType?.startsWith("image/")).map((a, i) => {
                                    const url = `/api/crm/mail/messages/${m.gmailMessageId}/attachments/${a.attachmentId}`;
                                    return (
                                      <button key={i} onClick={() => setViewer({ url, name: a.filename, mimeType: a.mimeType })} title={a.filename} className="overflow-hidden rounded-lg border border-slate-200">
                                        <img src={url} alt={a.filename} className="max-h-48 object-cover transition-transform hover:scale-[1.02]" />
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {/* Chips — images/PDFs open the in-app viewer; other files download */}
                              <div className="flex flex-wrap gap-2">
                                {m.attachments!.map((a, i) => {
                                  const url = a.attachmentId ? `/api/crm/mail/messages/${m.gmailMessageId}/attachments/${a.attachmentId}` : null;
                                  const viewable = !!a.mimeType && (a.mimeType.startsWith("image/") || a.mimeType === "application/pdf");
                                  const inner = (
                                    <>
                                      <FileTypeIcon name={a.filename} mime={a.mimeType} className="h-4 w-4" />
                                      <span className="max-w-[200px] truncate">{a.filename}</span>
                                      {a.size ? <span className="text-slate-400">{prettySize(a.size)}</span> : null}
                                    </>
                                  );
                                  const cls = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 transition-colors hover:border-[#711419]/40 hover:bg-white";
                                  if (!url) {
                                    return <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500">{inner}</span>;
                                  }
                                  return viewable ? (
                                    <button key={i} onClick={() => setViewer({ url, name: a.filename, mimeType: a.mimeType })} className={cls} data-testid={`attachment-${m.id}-${i}`}>{inner}</button>
                                  ) : (
                                    <a key={i} href={url} download={a.filename} className={cls} data-testid={`attachment-${m.id}-${i}`}>{inner}</a>
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
                            <FileTypeIcon name={f.filename} mime={f.mimeType} className="h-3.5 w-3.5" />
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

      {viewer && <AttachmentViewer item={viewer} onClose={() => setViewer(null)} />}
    </CrmLayout>
  );
}

type Recipient = { email: string; name?: string | null; customerId?: string; saveToCustomer?: boolean };
type RecipientResult = { type: "customer" | "contact"; customerId?: string; name: string | null; email: string | null };

// Gmail/Outlook-style recipient field: chips + live autocomplete over CRM
// customers and people you've corresponded with. Picking a customer with no
// email on file prompts to enter one (and optionally save it to their profile).
function RecipientField({ recipients, onChange, testid }: { recipients: Recipient[]; onChange: (r: Recipient[]) => void; testid?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecipientResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ id: string; name: string | null } | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [saveToProfile, setSaveToProfile] = useState(true);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/crm/mail/recipients?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const data = await res.json();
        if (!cancelled) { setResults(data.results || []); setOpen(true); }
      } catch { /* ignore */ }
    }, 160);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const add = (r: Recipient) => {
    if (!recipients.some((x) => x.email.toLowerCase() === r.email.toLowerCase())) onChange([...recipients, r]);
    setQuery(""); setResults([]); setOpen(false); setPending(null); setPendingEmail("");
  };
  const commitTyped = () => {
    const v = query.trim().replace(/[,;]$/, "");
    if (v.includes("@")) add({ email: v });
  };
  const confirmPending = () => {
    if (!pending || !pendingEmail.includes("@")) return;
    add({ email: pendingEmail.trim(), name: pending.name, customerId: pending.id, saveToCustomer: saveToProfile });
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {recipients.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-[#711419]/[0.08] py-1 pl-2.5 pr-1.5 text-xs font-medium text-[#711419]" title={r.email}>
            {r.name || r.email}
            <button onClick={() => onChange(recipients.filter((_, j) => j !== i))} className="text-[#711419]/60 hover:text-[#711419]"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "," || e.key === ";") && query.trim().includes("@")) { e.preventDefault(); commitTyped(); }
            else if (e.key === "Backspace" && !query && recipients.length) onChange(recipients.slice(0, -1));
          }}
          onBlur={() => { setTimeout(() => setOpen(false), 160); commitTyped(); }}
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder={recipients.length ? "" : "Type a name, customer, or email…"}
          className="min-w-[180px] flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
          data-testid={testid}
        />
      </div>

      {open && results.length > 0 && !pending && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {results.map((r, i) => (
            <button key={i} onMouseDown={(e) => { e.preventDefault(); r.email ? add({ email: r.email, name: r.name, customerId: r.type === "customer" ? r.customerId : undefined }) : (r.customerId && (setPending({ id: r.customerId, name: r.name }), setPendingEmail(""), setSaveToProfile(true))); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50" data-testid={`recipient-option-${i}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${r.type === "customer" ? "bg-[#711419]/10 text-[#711419]" : "bg-slate-200 text-slate-600"}`}>
                {initials(r.name || r.email || "?")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{r.name || r.email}</span>
                <span className="block truncate text-xs text-slate-400">{r.email || "No email on file — tap to add one"}</span>
              </span>
              {r.type === "customer" && <span className="shrink-0 rounded-full bg-[#711419]/10 px-2 py-0.5 text-[10px] font-semibold text-[#711419]">Customer</span>}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs text-slate-500">No email on file for <span className="font-semibold text-slate-700">{pending.name}</span>. Enter one:</p>
          <input
            autoFocus
            value={pendingEmail}
            onChange={(e) => setPendingEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && pendingEmail.includes("@")) confirmPending(); }}
            placeholder="customer@example.com"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#711419]/40"
            data-testid="recipient-new-email"
          />
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={saveToProfile} onChange={(e) => setSaveToProfile(e.target.checked)} className="h-3.5 w-3.5 accent-[#711419]" />
            Save this email to {pending.name}'s profile
          </label>
          <div className="mt-2.5 flex justify-end gap-2">
            <button onClick={() => setPending(null)} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100">Cancel</button>
            <button onClick={confirmPending} disabled={!pendingEmail.includes("@")} className="rounded-lg bg-[#711419] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40" data-testid="recipient-add-email">Add</button>
          </div>
        </div>
      )}
    </div>
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
  const [toR, setToR] = useState<Recipient[]>([]);
  const [ccR, setCcR] = useState<Recipient[]>([]);
  const [bccR, setBccR] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<OutAttachment[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setToR([]); setCcR([]); setBccR([]); setShowCc(false); setShowBcc(false); setSubject(""); setBody(""); setFiles([]);
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

  const submit = async () => {
    const to = toR.map((r) => r.email);
    if (to.length === 0) { toast({ variant: "destructive", title: "Add a recipient" }); return; }
    if (!body.trim() && files.length === 0) { toast({ variant: "destructive", title: "Write a message" }); return; }
    // Save any new customer emails to their profiles first (best-effort)
    for (const r of [...toR, ...ccR, ...bccR].filter((x) => x.saveToCustomer && x.customerId)) {
      try { await apiRequest("POST", "/api/crm/mail/save-customer-email", { customerId: r.customerId, email: r.email }); } catch { /* non-fatal */ }
    }
    onSend({
      to,
      cc: ccR.map((r) => r.email),
      bcc: bccR.map((r) => r.email),
      subject: subject.trim() || "(no subject)",
      html: body.replace(/\n/g, "<br>"),
      attachments: files,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#711419]/10"><PenSquare className="h-4 w-4 text-[#711419]" /></span>
            New message
          </DialogTitle>
        </DialogHeader>
        <div className="divide-y divide-slate-100">
          <div className="flex items-start gap-3 px-5 py-2.5">
            <label className="w-12 shrink-0 pt-1.5 text-sm text-slate-500">To</label>
            <div className="min-w-0 flex-1"><RecipientField recipients={toR} onChange={setToR} testid="compose-to" /></div>
            <div className="flex shrink-0 gap-2 pt-1.5 text-xs font-medium text-slate-400">
              {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-slate-700">Cc</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-slate-700">Bcc</button>}
            </div>
          </div>
          {showCc && (
            <div className="flex items-start gap-3 px-5 py-2.5">
              <label className="w-12 shrink-0 pt-1.5 text-sm text-slate-500">Cc</label>
              <div className="min-w-0 flex-1"><RecipientField recipients={ccR} onChange={setCcR} testid="compose-cc" /></div>
              <button onClick={() => { setShowCc(false); setCcR([]); }} className="shrink-0 pt-1.5 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          )}
          {showBcc && (
            <div className="flex items-start gap-3 px-5 py-2.5">
              <label className="w-12 shrink-0 pt-1.5 text-sm text-slate-500">Bcc</label>
              <div className="min-w-0 flex-1"><RecipientField recipients={bccR} onChange={setBccR} testid="compose-bcc" /></div>
              <button onClick={() => { setShowBcc(false); setBccR([]); }} className="shrink-0 pt-1.5 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-center gap-3 px-5 py-2.5">
            <label className="w-12 shrink-0 text-sm text-slate-500">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="flex-1 border-0 px-0 text-sm shadow-none focus-visible:ring-0" data-testid="compose-subject" />
          </div>
          <AutoTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="Write your message…"
            minHeight={220}
            maxHeight={420}
            className="resize-none overflow-y-auto rounded-none border-0 px-5 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0"
            testid="compose-body"
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-5 py-2.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                  <FileTypeIcon name={f.filename} mime={f.mimeType} className="h-4 w-4" />
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
        <DialogFooter className="flex items-center border-t border-slate-100 bg-slate-50/60 px-5 py-3 sm:justify-between">
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="compose-file-input" />
          <button onClick={() => fileInput.current?.click()} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 hover:text-slate-800" title="Attach files" data-testid="compose-attach">
            <Paperclip className="h-4 w-4" />
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-lg text-slate-600" onClick={onClose}>Discard</Button>
            <Button className="rounded-lg bg-[#711419] px-5 hover:bg-[#8a1a1f]" disabled={sending} onClick={submit} data-testid="compose-send">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// In-app popup for viewing an email attachment (image or PDF) without leaving
// the CRM. Close via the X, clicking the backdrop, or Escape.
function AttachmentViewer({ item, onClose }: { item: { url: string; name: string; mimeType: string }; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isImage = item.mimeType?.startsWith("image/");
  const isPdf = item.mimeType === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      data-testid="attachment-viewer"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
        <div className="flex items-center gap-1">
          <a
            href={item.url}
            download={item.name}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
            title="Download"
            data-testid="viewer-download"
          >
            <Download className="h-5 w-5" />
          </a>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
            title="Close"
            data-testid="viewer-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img src={item.url} alt={item.name} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : isPdf ? (
          <iframe src={item.url} title={item.name} className="h-full w-full max-w-4xl rounded-lg bg-white" />
        ) : (
          <div className="rounded-xl bg-white p-8 text-center">
            <FileTypeIcon name={item.name} mime={item.mimeType} className="mx-auto mb-3 h-12 w-12" />
            <p className="text-sm font-medium text-slate-700">{fileMeta(item.name, item.mimeType).kind}</p>
            <p className="text-xs text-slate-500">This file type can't be previewed here.</p>
            <a href={item.url} download={item.name} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#711419] px-4 py-2 text-sm font-medium text-white">
              <Download className="h-4 w-4" /> Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
