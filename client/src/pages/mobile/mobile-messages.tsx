import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import badgeMessaging from "@/assets/badge-messaging.png";
import chatBg from "@/assets/chat-bg.webp";
import badgeContactKnown from "@/assets/badge-contact-known.png";
import badgeContactUnknown from "@/assets/badge-contact-unknown.png";
import {
  MessageSquare, Search, Send, Loader2, ArrowLeft, User, Plus, X, Phone, Mic,
} from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import MobileShell from "./mobile-shell";
import { InboxSwitcher } from "@/components/mobile/inbox-switcher";
import { Input } from "@/components/ui/input";
import { useKeyboardInset } from "@/lib/native";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { compressImage } from "@/lib/compress-image";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CrmMessagingConversation, CrmMessagingMessage, CrmCustomer } from "@shared/schema";

/** Mobile Messages — WhatsApp-style. The conversation list lives in the
 *  shell; an open thread is a FULLSCREEN layer (no tab bar, no floating
 *  containers): warm chat canvas, tailed bubbles, day chips, composer pinned
 *  to the true bottom above the keyboard/safe area. */

interface ConversationWithCustomer extends CrmMessagingConversation {
  customerPhone?: string | null;
  /** Live CRM record joined (or phone-matched) server-side — its name wins
   *  over whatever snapshot customerName holds. */
  customer?: { id: string; name: string; phone: string | null } | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: string | null;
}

interface ConversationDetailResponse {
  conversation: CrmMessagingConversation;
  messages: CrmMessagingMessage[];
  customer?: Partial<CrmCustomer> | null;
}

interface CustomerSearchResult {
  id: string;
  customerName: string;
  phone: string;
  email: string;
}

const listTime = (d: string | Date) => {
  const dt = new Date(d);
  if (isToday(dt)) return format(dt, "h:mm a");
  if (isYesterday(dt)) return "Yesterday";
  return format(dt, "MMM d");
};

const dayChip = (d: Date) => {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
};

export default function MobileMessages() {
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // Uber-style: the floating search pill ducks away on scroll-down
  const pillHidden = useScrollHide();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ dataBase64: string; mimeType: string; filename: string; preview: string }>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  // Composer rides the keyboard with the same eased inset as Gibbs
  const kbInset = useKeyboardInset();

  // Voice dictation — same engine as Gibbs (Whisper on iOS)
  const dictationBase = useRef("");
  const voice = useVoiceDictation({
    onTranscript: (t) => setMessageText((dictationBase.current ? dictationBase.current + " " : "") + t),
    onFinal: (t) => { if (t) setMessageText((dictationBase.current ? dictationBase.current + " " : "") + t); },
    onError: (m) => toast({ title: m, variant: "destructive" }),
  });
  const toggleMic = () => {
    if (voice.listening) { voice.stop(); return; }
    dictationBase.current = messageText.trim();
    voice.start();
  };

  // Floating-search overlay: the bar floats free (kbInset drives its
  // bottom); this effect only times the focus with the open animation.
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!searchActive) return;
    const focusT = setTimeout(() => searchInputRef.current?.focus(), 60);
    return () => clearTimeout(focusT);
  }, [searchActive]);

  const closeSearch = () => {
    searchInputRef.current?.blur();
    setSearchClosing(true);
    setTimeout(() => {
      setSearchActive(false);
      setSearchClosing(false);
      setSearchQuery("");
    }, 190);
  };

  // ── iOS-style tracked swipe-back for the open thread: the panel follows
  // the finger and slides off on commit — same feel as leaving a job. ──
  const threadRef = useRef<HTMLDivElement | null>(null);
  const threadDrag = useRef<{ x: number; y: number; engaged: boolean; active: boolean } | null>(null);
  const closeThreadAnimated = (fromDx = 0) => {
    const el = threadRef.current;
    if (!el) return setSelectedConversationId(null);
    const w = el.clientWidth || window.innerWidth;
    const startP = Math.max(0, Math.min(1, fromDx / w));
    const dur = 200 * (1 - startP) + 40;
    el.style.animation = "none";
    el.style.transition = `transform ${dur}ms ease-in`;
    el.style.transform = "translateX(100%)";
    setTimeout(() => setSelectedConversationId(null), dur - 10);
  };
  const onThreadSwipeStart = (e: React.PointerEvent) => {
    if (e.clientX > 48) { threadDrag.current = null; return; }
    threadDrag.current = { x: e.clientX, y: e.clientY, engaged: false, active: true };
    threadRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onThreadSwipeMove = (e: React.PointerEvent) => {
    const st = threadDrag.current;
    const el = threadRef.current;
    if (!st?.active || !el) return;
    const dx = e.clientX - st.x;
    const dy = Math.abs(e.clientY - st.y);
    if (!st.engaged) {
      if (dx > 8 && dx > dy) {
        st.engaged = true;
        el.style.transition = "none";
        el.style.animation = "none";
      } else if (dy > 14) { st.active = false; return; }
    }
    if (st.engaged) el.style.transform = `translateX(${Math.max(0, dx)}px)`;
  };
  const onThreadSwipeEnd = (e: React.PointerEvent) => {
    const st = threadDrag.current;
    threadDrag.current = null;
    const el = threadRef.current;
    if (!st?.engaged || !el) return;
    const dx = e.clientX - st.x;
    if (dx > Math.min(140, window.innerWidth * 0.33)) {
      closeThreadAnimated(Math.max(0, dx));
    } else {
      el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateX(0)";
      setTimeout(() => { if (el) el.style.transition = ""; }, 290);
    }
  };

  const { data: conversations, isLoading: loadingConversations } = useQuery<ConversationWithCustomer[]>({
    queryKey: ["/api/mobile/messaging/conversations", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      const url = `/api/mobile/messaging/conversations${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
    // Search typing keeps the previous list on screen — no loader flashes
    placeholderData: (prev) => prev,
  });

  const { data: conversationDetail, isLoading: loadingDetail } = useQuery<ConversationDetailResponse>({
    queryKey: ["/api/mobile/messaging/conversations", selectedConversationId],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/messaging/conversations/${selectedConversationId}`, { credentials: "include" });
      if (!res.ok) return null as any;
      return res.json();
    },
    enabled: !!selectedConversationId,
    refetchInterval: 5000,
  });

  const { data: contacts, isLoading: loadingContacts } = useQuery<CustomerSearchResult[]>({
    queryKey: ["/api/mobile/messaging/contacts", contactSearch],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/messaging/contacts?search=${encodeURIComponent(contactSearch)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showNewConversation && contactSearch.length >= 2,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, body, attachments }: {
      conversationId: string;
      body: string;
      attachments?: Array<{ dataBase64: string; mimeType: string; filename: string }>;
    }) => {
      return apiRequest("POST", `/api/mobile/messaging/conversations/${conversationId}/messages`, { body, attachments });
    },
    onSuccess: () => {
      setMessageText("");
      setPendingPhotos([]);
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/messaging/conversations", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/messaging/conversations"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to send message", variant: "destructive" });
    },
  });

  const startConversationMutation = useMutation({
    mutationFn: async ({ customerId, initialMessage }: { customerId: string; initialMessage?: string }) => {
      return apiRequest("POST", "/api/mobile/messaging/conversations", { customerId, initialMessage });
    },
    onSuccess: (data: any) => {
      setShowNewConversation(false);
      setContactSearch("");
      setSelectedConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/messaging/conversations"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to start conversation", variant: "destructive" });
    },
  });

  const { data: mailInbox } = useQuery<{ connected: boolean; threads: Array<{ isUnread: boolean }> }>({
    queryKey: ["/api/crm/mail/threads", "count"],
    queryFn: async () => {
      const res = await fetch("/api/crm/mail/threads?folder=inbox", { credentials: "include" });
      if (!res.ok) return { connected: false, threads: [] };
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });
  const mailUnread = mailInbox?.threads?.filter((t) => t.isUnread).length ?? 0;
  const chatUnread = (conversations ?? []).reduce((n, c) => n + (c.unreadInboundCount || 0), 0);

  const handleSendMessage = () => {
    if ((!messageText.trim() && pendingPhotos.length === 0) || !selectedConversationId) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      body: messageText.trim(),
      attachments: pendingPhotos.length > 0
        ? pendingPhotos.map(({ dataBase64, mimeType, filename }) => ({ dataBase64, mimeType, filename }))
        : undefined,
    });
  };

  const pickPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = 3 - pendingPhotos.length;
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        const c = await compressImage(f);
        setPendingPhotos((prev) => (prev.length >= 3 ? prev : [...prev, c]));
      } catch {
        toast({ title: "Couldn't read that photo", variant: "destructive" });
      }
    }
  };

  // Stick to the newest message like a real chat app
  const messages = conversationDetail?.messages || [];
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, selectedConversationId]);

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);
  // Unknown numbers title as "Unknown" — the number itself sits below.
  const displayName =
    conversationDetail?.customer?.name ||
    selectedConversation?.customer?.name ||
    conversationDetail?.conversation?.customerName ||
    selectedConversation?.customerName ||
    "Unknown";
  const displayPhone =
    conversationDetail?.customer?.phone ||
    conversationDetail?.conversation?.phoneNumber ||
    selectedConversation?.phoneNumber ||
    "";

  // Messages grouped with day chips
  const timeline = useMemo(() => {
    const out: Array<{ kind: "chip"; label: string; key: string } | { kind: "msg"; m: CrmMessagingMessage }> = [];
    let lastDay: Date | null = null;
    for (const m of messages) {
      const at = m.sentAt ? new Date(m.sentAt) : null;
      if (at && (!lastDay || !isSameDay(at, lastDay))) {
        out.push({ kind: "chip", label: dayChip(at), key: `chip-${at.toDateString()}` });
        lastDay = at;
      }
      out.push({ kind: "msg", m });
    }
    return out;
  }, [messages]);

  const openConversation = (conversation: ConversationWithCustomer, fromSearch = false) => {
    if (fromSearch) closeSearch();
    setSelectedConversationId(conversation.id);
    if (conversation.unreadInboundCount) {
      // Instant read: clear the unread marks in every cached list right now,
      // then tell the server (which keeps it cleared on the next refetch).
      queryClient.setQueriesData(
        { queryKey: ["/api/mobile/messaging/conversations"], exact: false },
        (old: any) =>
          Array.isArray(old)
            ? old.map((c: any) => (c.id === conversation.id ? { ...c, unreadInboundCount: 0, unreadCount: 0 } : c))
            : old,
      );
      apiRequest("POST", `/api/crm/messaging/conversations/${conversation.id}/read`).catch(() => {});
    }
  };

  const renderConversation = (conversation: ConversationWithCustomer, fromSearch = false) => (
    <button
      key={conversation.id}
      onClick={() => openConversation(conversation, fromSearch)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
      data-testid={`conversation-${conversation.id}`}
    >
      <img
        src={(conversation.customerId || conversation.customer) ? badgeContactKnown : badgeContactUnknown}
        alt={(conversation.customerId || conversation.customer) ? "CRM customer" : "Unknown number"}
        className="h-12 w-12 shrink-0 select-none"
        draggable={false}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-[15px] text-slate-900 ${conversation.unreadInboundCount ? "font-bold" : "font-semibold"}`}>
            {conversation.customer?.name || conversation.customerName || conversation.phoneNumber || "Unknown"}
          </p>
          {conversation.lastMessageAt && (
            <span className={`shrink-0 text-xs ${conversation.unreadInboundCount ? "font-semibold text-[#711419]" : "text-slate-400"}`}>
              {listTime(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${conversation.unreadInboundCount ? "font-medium text-slate-700" : "text-slate-500"}`}>
            {conversation.lastMessagePreview
              ? `${conversation.lastMessageDirection === "outbound" ? "You: " : ""}${conversation.lastMessagePreview}`
              : "No messages yet"}
          </p>
          {!!conversation.unreadInboundCount && conversation.unreadInboundCount > 0 && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#711419]" aria-label="Unread" />
          )}
        </div>
      </div>
    </button>
  );

  return (
    <MobileShell>
      {/* ── Conversation list — tabs at the very top, compose pinned right ── */}
      <div className="p-4 space-y-3" data-testid="mobile-messages">
        <div className="flex items-center gap-2">
          <InboxSwitcher active="chat" mailCount={mailUnread} chatCount={chatUnread} />
          <button
            onClick={() => setShowNewConversation(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-slate-600 transition-transform active:scale-95"
            aria-label="New message"
            data-testid="menu-new-conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="-mx-4">
          {loadingConversations ? (
            /* Skeleton rows shaped exactly like conversations: plate + lines */
            <div className="divide-y divide-slate-100">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-[10px] bg-slate-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-12 animate-pulse rounded bg-slate-100" />
                    </div>
                    <div className="h-3.5 w-40 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations && conversations.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {conversations.map((conversation) => renderConversation(conversation))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              <img src={badgeMessaging} alt="" className="mx-auto mb-3 h-16 w-16 select-none opacity-90" draggable={false} />
              <p className="mb-1 text-lg font-medium">No conversations yet</p>
              <p className="text-sm">Use the menu to start a new message</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating search pill — sits above the nav, left of the "+" */}
      {!searchActive && !selectedConversationId && (
        <button
          onClick={() => setSearchActive(true)}
          className={`fixed left-4 right-[84px] z-40 flex h-12 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-lg transition-all duration-300 ${pillHidden ? "pointer-events-none translate-y-24 opacity-0" : "translate-y-0 opacity-100"}`}
          style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
          data-testid="messages-search-pill"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-[16px] text-slate-400">Search conversations</span>
        </button>
      )}

      {/* Fullscreen conversation search — input docked above the keyboard */}
      {searchActive && (
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-slate-50 ${
            searchClosing
              ? "animate-out fade-out slide-out-to-bottom-2 duration-200 fill-mode-forwards"
              : "animate-in fade-in slide-in-from-bottom-2 duration-200"
          }`}
          data-testid="messages-search-overlay"
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${!conversations || conversations.length === 0 ? "flex flex-col justify-end" : ""}`}
            style={{
              paddingTop: "calc(env(safe-area-inset-top) + 12px)",
              paddingBottom: `calc(env(safe-area-inset-bottom) + 84px + ${kbInset}px)`,
              transition: "padding-bottom 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {conversations && conversations.length > 0 ? (
              <div className="space-y-2 pb-2">
                {conversations.map((conversation) => (
                  <div key={conversation.id} className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
                    {renderConversation(conversation, true)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="pb-6 text-center text-sm text-slate-400">
                {searchQuery.trim() ? `No conversations match “${searchQuery.trim()}”.` : "Type a name or number."}
              </p>
            )}
          </div>
          <div
            className="absolute inset-x-0 z-10 flex items-center gap-2 px-4"
            style={{
              bottom: kbInset > 0 ? `${kbInset + 10}px` : "calc(env(safe-area-inset-bottom) + 12px)",
              transition: "bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="input-search-conversations"
              />
            </div>
            <button
              onClick={closeSearch}
              className="liquid-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 shadow-sm transition-transform active:scale-90"
              aria-label="Close search"
              data-testid="messages-search-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Open thread — fullscreen chat panel (WhatsApp style). The panel
          tracks an edge swipe and slides off, exactly like leaving a job. ── */}
      {selectedConversationId && (
        <div
          ref={threadRef}
          className="fixed inset-0 z-[60] flex flex-col bg-slate-900 shadow-[-14px_0_32px_rgba(0,0,0,0.12)] animate-in slide-in-from-right duration-200"
          style={{
            touchAction: "pan-y",
            backgroundImage: `url(${chatBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          data-testid="mobile-conversation-detail"
          onPointerDown={onThreadSwipeStart}
          onPointerMove={onThreadSwipeMove}
          onPointerUp={onThreadSwipeEnd}
          onPointerCancel={onThreadSwipeEnd}
        >
          {/* Header strip — one translucent bar holding back, name, and call */}
          <div
            className="absolute inset-x-0 top-0 z-10 border-b border-white/10 bg-slate-900/70 backdrop-blur-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center gap-2 px-2 py-2">
              <button
                onClick={() => closeThreadAnimated()}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-100 transition-colors active:bg-white/10"
                data-testid="button-back-to-list"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-tight text-white">{displayName}</p>
                {displayPhone && <p className="truncate text-xs leading-tight text-slate-300">{displayPhone}</p>}
              </div>
              {displayPhone && (
                <a
                  href={`tel:${displayPhone}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-100 transition-colors active:bg-white/10"
                  aria-label="Call"
                  data-testid="button-call-contact"
                >
                  <Phone className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
            style={{
              paddingTop: "calc(env(safe-area-inset-top) + 64px)",
              // Room to scroll past the floating composer — messages glide
              // beneath it instead of being clipped at its wrapper edge.
              paddingBottom: `calc(env(safe-area-inset-bottom) + 118px + ${kbInset}px)`,
              transition: "padding-bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {loadingDetail && messages.length === 0 ? (
              /* Bubble-shaped skeletons — the thread settles in place */
              <div className="space-y-2 py-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`animate-pulse rounded-2xl ${
                        i % 2 ? "h-10 w-44 rounded-br-[4px] bg-[#711419]/30" : "h-12 w-56 rounded-bl-[4px] bg-[#d1d3d9]/25"
                      }`}
                    />
                  </div>
                ))}
              </div>
            ) : timeline.length > 0 ? (
              <div className="space-y-1.5">
                {timeline.map((entry) =>
                  entry.kind === "chip" ? (
                    <div key={entry.key} className="flex justify-center py-2">
                      <span className="rounded-md bg-black/40 px-2.5 py-1 text-[11px] font-medium text-slate-300 shadow-sm">
                        {entry.label}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={entry.m.id}
                      className={`flex ${entry.m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`relative max-w-[82%] rounded-2xl px-3 py-1.5 shadow-sm ${
                          entry.m.direction === "outbound"
                            ? "rounded-br-[4px] bg-[#711419] text-white"
                            : "rounded-bl-[4px] bg-[#d1d3d9] text-slate-900"
                        }`}
                        data-testid={`message-${entry.m.id}`}
                      >
                        {Array.isArray((entry.m as any).attachments) && (entry.m as any).attachments.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {((entry.m as any).attachments as Array<{ url: string; mimeType?: string }>)
                              .filter((a) => a?.url && (a.mimeType || "").startsWith("image"))
                              .map((a, i) => (
                                <img key={i} src={a.url} alt="" className="max-h-64 w-full rounded-lg object-cover" loading="lazy" />
                              ))}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words pb-1 pr-12 text-[15px] leading-snug">{entry.m.body}</p>
                        <span
                          className={`absolute bottom-1 right-2.5 text-[10px] ${
                            entry.m.direction === "outbound" ? "text-white/60" : "text-slate-500"
                          }`}
                        >
                          {entry.m.sentAt ? format(new Date(entry.m.sentAt), "h:mm a") : "…"}
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-300">
                <img src={badgeMessaging} alt="" className="mx-auto mb-2 h-12 w-12 select-none" draggable={false} />
                <p>No messages yet — say hello.</p>
              </div>
            )}
          </div>

          {/* Composer — truly floating: absolutely positioned over the
              wallpaper, messages scroll beneath it. Keyboard-gray box. */}
          <div
            className="absolute inset-x-0 z-10 px-3"
            style={{
              bottom: "calc(env(safe-area-inset-bottom) + 8px)",
              // Ride the keyboard on a pure transform — compositor-only, so
              // the rise and fall stay butter-smooth.
              transform: kbInset > 0 ? `translateY(calc(-${kbInset}px + env(safe-area-inset-bottom)))` : "translateY(0)",
              transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
              willChange: "transform",
            }}
          >
            {pendingPhotos.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingPhotos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.preview} alt="" className="h-14 w-14 rounded-lg border border-white/30 object-cover shadow-md" />
                    <button
                      onClick={() => setPendingPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white shadow"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* One-line floating row: + | field | mic-or-send */}
            <div className="flex items-end gap-2">
              <input
                ref={attachInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  pickPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => attachInputRef.current?.click()}
                disabled={pendingPhotos.length >= 3 || sendMessageMutation.isPending}
                className="liquid-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 shadow-md transition-transform active:scale-95 disabled:opacity-40"
                aria-label="Attach photos"
                data-testid="message-attach"
              >
                <Plus className="h-5 w-5" />
              </button>
              <div className="flex min-h-[44px] min-w-0 flex-1 items-center rounded-full bg-[#d1d3d9] px-4 shadow-lg">
                <textarea
                  placeholder="Message"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={1}
                  className="max-h-24 w-full resize-none bg-transparent py-[11px] text-[16px] leading-[22px] text-slate-900 outline-none placeholder:text-slate-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  data-testid="input-message"
                />
              </div>
              {/* Mic when empty, send when there's something to send */}
              <button
                onClick={() => {
                  if (voice.listening) { voice.stop(); return; }
                  if (messageText.trim() || pendingPhotos.length > 0) handleSendMessage();
                  else toggleMic();
                }}
                disabled={
                  sendMessageMutation.isPending ||
                  voice.processing ||
                  (!voice.supported && !messageText.trim() && pendingPhotos.length === 0)
                }
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#711419] text-white shadow-lg transition-transform active:scale-90 disabled:opacity-50"
                aria-label={voice.listening ? "Stop dictating" : messageText.trim() || pendingPhotos.length ? "Send" : "Dictate a message"}
                data-testid="button-send-message"
              >
                {voice.listening && <span className="absolute inset-0 animate-ping rounded-full border-2 border-[#711419]" />}
                {sendMessageMutation.isPending || voice.processing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : messageText.trim() || pendingPhotos.length > 0 ? (
                  <Send className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New conversation — the same full-page sheet as creating a job ── */}
      {showNewConversation && (
        <MobileCreatePage
          title="New message"
          dirty={false}
          onClose={() => { setShowNewConversation(false); setContactSearch(""); }}
          testid="mobile-new-conversation"
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search contacts..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="pl-10"
                data-testid="input-contact-search"
              />
            </div>
            {contacts && contacts.length > 0 ? (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => startConversationMutation.mutate({ customerId: contact.id })}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50"
                    data-testid={`contact-${contact.id}`}
                    disabled={startConversationMutation.isPending}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#711419] font-semibold text-white">
                      {contact.customerName?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{contact.customerName}</p>
                      <p className="truncate text-sm text-slate-500">{contact.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : contactSearch.length >= 2 && !loadingContacts ? (
              <div className="py-8 text-center text-slate-500">
                <User className="mx-auto mb-2 h-12 w-12 text-slate-300" />
                <p>No contacts found</p>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">Type at least 2 characters to search.</p>
            )}
          </div>
        </MobileCreatePage>
      )}
    </MobileShell>
  );
}
