import { useEffect, useRef, useState } from "react";
import { MobileSpinner } from "@/components/mobile/mobile-spinner";
import { isNativeApp, useKeyboardInset } from "@/lib/native";
import { compressImage } from "@/lib/compress-image";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isToday } from "date-fns";
import MobileShell from "./mobile-shell";
import { InboxSwitcher } from "@/components/mobile/inbox-switcher";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Loader2, Mail, MailOpen, Monitor, PenSquare, Plus, Search, Send, X,
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
  const [searchActive, setSearchActive] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyPhotos, setReplyPhotos] = useState<Array<{ dataBase64: string; mimeType: string; filename: string; preview: string }>>([]);
  const replyAttachRef = useRef<HTMLInputElement | null>(null);
  const kbInset = useKeyboardInset();
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

  const { data: chatConvos } = useQuery<Array<{ unreadInboundCount?: number | null }>>({
    queryKey: ["/api/mobile/messaging/conversations", "count"],
    queryFn: async () => {
      const res = await fetch("/api/mobile/messaging/conversations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });
  const chatUnread = (chatConvos ?? []).reduce((n, c) => n + (c.unreadInboundCount || 0), 0);
  const mailUnread = inbox?.threads?.filter((t) => t.isUnread).length ?? 0;

  const sendMutation = useMutation({
    // Server expects to: string[] — a plain string silently means "no
    // recipients" on that end.
    mutationFn: async (payload: {
      to: string[];
      subject: string;
      html: string;
      threadRowId?: string;
      attachments?: Array<{ filename: string; mimeType: string; contentBase64: string }>;
    }) => apiRequest("POST", "/api/crm/mail/send", payload),
    onSuccess: () => {
      setReplyText("");
      setReplyPhotos([]);
      setCompose({ to: "", subject: "", body: "" });
      setComposeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads"] });
      if (openThreadId) queryClient.invalidateQueries({ queryKey: ["/api/crm/mail/threads", openThreadId] });
      toast({ title: "Email sent" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't send the email", variant: "destructive" }),
  });

  // Floating-search overlay: bar docked at the bottom rides the keyboard
  // with easing (same pattern as Jobs/Photos/Customers/Messages).
  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!searchActive) return;
    const setInset = (px: number) => {
      const el = searchBarRef.current;
      if (el) el.style.paddingBottom = px > 0 ? `${px + 10}px` : "calc(env(safe-area-inset-bottom) + 12px)";
    };
    setInset(0);
    const focusT = setTimeout(() => searchInputRef.current?.focus(), 60);

    let removeNative: (() => void) | null = null;
    if (isNativeApp()) {
      import("@capacitor/keyboard").then(({ Keyboard }) => {
        const subs: any[] = [];
        Keyboard.addListener("keyboardWillShow", (info: any) => setInset(info?.keyboardHeight || 0)).then((h) => subs.push(h));
        Keyboard.addListener("keyboardWillHide", () => setInset(0)).then((h) => subs.push(h));
        removeNative = () => subs.forEach((h) => h?.remove?.());
      }).catch(() => {});
    }
    const vv = window.visualViewport;
    const update = () => setInset(Math.max(0, window.innerHeight - (vv?.height || window.innerHeight) - (vv?.offsetTop || 0)));
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      clearTimeout(focusT);
      removeNative?.();
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [searchActive]);

  const closeSearch = () => {
    searchInputRef.current?.blur();
    setSearchClosing(true);
    setTimeout(() => {
      setSearchActive(false);
      setSearchClosing(false);
      setSearch("");
    }, 190);
  };

  const openThread = inbox?.threads?.find((t) => t.id === openThreadId) || threadDetail?.thread;
  const replyTo = (() => {
    const lastInbound = [...(threadDetail?.messages || [])].reverse().find((m) => m.direction === "inbound");
    return lastInbound?.fromEmail || openThread?.participants?.[0] || "";
  })();

  const handleReply = () => {
    if ((!replyText.trim() && replyPhotos.length === 0) || !replyTo || !openThreadId) return;
    sendMutation.mutate({
      to: [replyTo],
      subject: openThread?.subject?.startsWith("Re:") ? openThread.subject : `Re: ${openThread?.subject || ""}`,
      html: `<p>${sanitizeHtml(replyText || "See attached.").replace(/\n/g, "<br/>")}</p>`,
      threadRowId: openThreadId,
      attachments: replyPhotos.length > 0
        ? replyPhotos.map((p) => ({ filename: p.filename, mimeType: p.mimeType, contentBase64: p.dataBase64 }))
        : undefined,
    });
  };

  const pickReplyPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = 3 - replyPhotos.length;
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        const c = await compressImage(f);
        setReplyPhotos((prev) => (prev.length >= 3 ? prev : [...prev, c]));
      } catch {
        toast({ title: "Couldn't read that photo", variant: "destructive" });
      }
    }
  };

  const renderThread = (t: MailThread, fromSearch = false) => (
    <button
      key={t.id}
      onClick={() => {
        if (fromSearch) closeSearch();
        setOpenThreadId(t.id);
      }}
      className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-50"
      data-testid={`mail-thread-${t.id}`}
    >
      <span className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t.isUnread ? "bg-[#711419] text-white" : "bg-slate-200 text-slate-600"}`}>
        {t.isUnread ? <Mail style={{ height: 18, width: 18 }} /> : <MailOpen style={{ height: 18, width: 18 }} />}
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
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className={`min-w-0 truncate text-sm ${t.isUnread ? "font-semibold text-slate-800" : "text-slate-600"}`}>
            {t.subject || "(no subject)"}
          </span>
          {t.isUnread && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#711419]" aria-label="Unread" />
          )}
        </span>
        {t.snippet && <span className="mt-0.5 block truncate text-xs text-slate-400">{t.snippet}</span>}
      </span>
    </button>
  );

  return (
    <MobileShell>
      {/* ── Inbox — tabs at the very top, compose pinned right ── */}
      <div className="p-4 space-y-3" data-testid="mobile-mail-page">
        <div className="flex items-center gap-2">
          <InboxSwitcher active="mail" mailCount={mailUnread} chatCount={chatUnread} />
          <button
            onClick={() => setComposeOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-slate-600 transition-transform active:scale-95"
            aria-label="New email"
            data-testid="menu-mail-compose"
          >
            <PenSquare className="h-4 w-4" />
          </button>
        </div>

        <div className="-mx-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <MobileSpinner fullHeight={false} />
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
              {inbox.threads.map((t) => renderThread(t))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              <Mail className="mx-auto mb-3 h-16 w-16 text-slate-300" />
              <p className="text-lg font-medium">Inbox zero</p>
              <p className="text-sm">Nothing in your inbox right now.</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating search pill — sits above the nav, left of the "+" */}
      {!searchActive && !openThreadId && (
        <button
          onClick={() => setSearchActive(true)}
          className="fixed left-4 right-[84px] z-40 flex h-12 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
          data-testid="mail-search-pill"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-[16px] text-slate-400">Search mail</span>
        </button>
      )}

      {/* Fullscreen mail search — input docked above the keyboard */}
      {searchActive && (
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-slate-50 ${
            searchClosing
              ? "animate-out fade-out slide-out-to-bottom-2 duration-200 fill-mode-forwards"
              : "animate-in fade-in slide-in-from-bottom-2 duration-200"
          }`}
          data-testid="mail-search-overlay"
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${!inbox?.threads || inbox.threads.length === 0 ? "flex flex-col justify-end" : ""}`}
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            {isLoading || isRefetching ? (
              <div className="flex items-center justify-center pb-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : inbox?.threads && inbox.threads.length > 0 ? (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
                {inbox.threads.map((t) => renderThread(t, true))}
              </div>
            ) : (
              <p className="pb-6 text-center text-sm text-slate-400">
                {search.trim() ? `No mail matches “${search.trim()}”.` : "Type a name, address, or subject."}
              </p>
            )}
          </div>
          <div
            ref={searchBarRef}
            className="flex items-center gap-2 px-4 pt-2"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
              transition: "padding-bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search mail"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="input-mail-search"
              />
            </div>
            <button
              onClick={closeSearch}
              className="liquid-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 shadow-sm transition-transform active:scale-90"
              aria-label="Close search"
              data-testid="mail-search-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Thread reader — edge swipe-back closes it like a pushed panel ── */}
      {openThreadId && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-slate-50 animate-in slide-in-from-right duration-200"
          data-testid="mail-thread-view"
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t.clientX < 28) (e.currentTarget as any)._swipe = { x: t.clientX, y: t.clientY };
          }}
          onTouchMove={(e) => {
            const st = (e.currentTarget as any)._swipe;
            if (!st) return;
            const t = e.touches[0];
            if (t.clientX - st.x > 70 && Math.abs(t.clientY - st.y) < 60) {
              (e.currentTarget as any)._swipe = null;
              setOpenThreadId(null);
            }
          }}
          onTouchEnd={(e) => { (e.currentTarget as any)._swipe = null; }}
        >
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

          {/* Reply composer — same box as Gibbs: textarea on top, "+" attach
              on the left below, round send on the right */}
          <div
            className="border-t bg-white px-3 pt-2"
            style={{ paddingBottom: kbInset > 0 ? "10px" : "calc(env(safe-area-inset-bottom) + 10px)" }}
          >
            <div className="rounded-2xl border border-slate-300/70 bg-white p-3 shadow-sm">
              {replyPhotos.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {replyPhotos.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p.preview} alt="" className="h-14 w-14 rounded-[4px] border border-slate-300 object-cover" />
                      <button
                        onClick={() => setReplyPhotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-white"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                placeholder={replyTo ? `Reply to ${replyTo}` : "Reply"}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={1}
                className="max-h-32 min-h-[28px] w-full resize-none overflow-y-auto bg-transparent text-[16px] leading-6 text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="mail-reply-input"
              />
              <div className="mt-1.5 flex items-center gap-0.5">
                <input
                  ref={replyAttachRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    pickReplyPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => replyAttachRef.current?.click()}
                  disabled={replyPhotos.length >= 3 || sendMutation.isPending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-all active:scale-95 active:bg-slate-100 disabled:opacity-40"
                  aria-label="Attach photos"
                  data-testid="mail-reply-attach"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleReply}
                  disabled={(!replyText.trim() && replyPhotos.length === 0) || !replyTo || sendMutation.isPending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#711419] text-white transition-all duration-150 ease-out active:scale-90 disabled:bg-slate-200 disabled:text-slate-400"
                  data-testid="mail-reply-send"
                >
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          {/* Keyboard spacer — composer glides above the keys */}
          <div
            className="shrink-0 bg-white"
            style={{ height: kbInset, transition: "height 0.25s cubic-bezier(0.32, 0.72, 0, 1)" }}
          />
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
                  to: [compose.to.trim()],
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
