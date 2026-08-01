import { useEffect, useMemo, useRef, useState } from "react";
import { MobileSpinner } from "@/components/mobile/mobile-spinner";
import { useQuery, useMutation } from "@tanstack/react-query";
import badgeMessaging from "@/assets/badge-messaging.png";
import badgeContactKnown from "@/assets/badge-contact-known.png";
import badgeContactUnknown from "@/assets/badge-contact-unknown.png";
import {
  MessageSquare, Search, Send, Loader2, ArrowLeft, User, Plus, X, RefreshCw, Phone,
} from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import MobileShell from "./mobile-shell";
import { MoreIcon } from "@/components/crm/more-icon";
import { InboxSwitcher } from "@/components/mobile/inbox-switcher";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isNativeApp } from "@/lib/native";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Floating-search overlay: bar docked at the bottom rides the keyboard
  // with easing (same pattern as Jobs/Photos/Customers).
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
      setSearchQuery("");
    }, 190);
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
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      return apiRequest("POST", `/api/mobile/messaging/conversations/${conversationId}/messages`, { body });
    },
    onSuccess: () => {
      setMessageText("");
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

  const syncMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/crm/messaging/sync-textline"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/messaging/conversations"] });
      toast({ title: "Synced", description: "Conversations updated from Textline" });
    },
    onError: () => {
      toast({ title: "Sync failed", description: "Could not sync with Textline", variant: "destructive" });
    },
  });

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversationId) return;
    sendMessageMutation.mutate({ conversationId: selectedConversationId, body: messageText.trim() });
  };

  // Stick to the newest message like a real chat app
  const messages = conversationDetail?.messages || [];
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, selectedConversationId]);

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);
  const displayName =
    conversationDetail?.customer?.name ||
    selectedConversation?.customer?.name ||
    conversationDetail?.conversation?.customerName ||
    selectedConversation?.customerName ||
    selectedConversation?.phoneNumber ||
    "Unknown Contact";
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

  const renderConversation = (conversation: ConversationWithCustomer, fromSearch = false) => (
    <button
      key={conversation.id}
      onClick={() => {
        if (fromSearch) closeSearch();
        setSelectedConversationId(conversation.id);
      }}
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
          <p className="truncate text-sm text-slate-500">
            {conversation.customer?.name || conversation.customerName
              ? conversation.phoneNumber || conversation.customerPhone || "No phone"
              : "Not in the CRM yet"}
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
      {/* ── Conversation list — minimal chrome: title, search, 4-dot menu ── */}
      <div className="p-4 space-y-3" data-testid="mobile-messages">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inbox</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
                aria-label="Message actions"
                data-testid="messages-actions"
              >
                <MoreIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowNewConversation(true)} data-testid="menu-new-conversation">
                <Plus className="mr-2 h-4 w-4" /> New message
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="menu-sync-messages">
                <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} /> Sync from Textline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <InboxSwitcher active="chat" mailCount={mailUnread} chatCount={chatUnread} />

        <div className="-mx-4">
          {loadingConversations ? (
            <div className="flex justify-center py-8">
              <MobileSpinner fullHeight={false} />
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
          className="fixed left-4 right-[84px] z-40 flex h-12 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
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
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            {loadingConversations ? (
              <div className="flex items-center justify-center pb-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : conversations && conversations.length > 0 ? (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm">
                {conversations.map((conversation) => renderConversation(conversation, true))}
              </div>
            ) : (
              <p className="pb-6 text-center text-sm text-slate-400">
                {searchQuery.trim() ? `No conversations match “${searchQuery.trim()}”.` : "Type a name or number."}
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

      {/* ── Open thread — fullscreen chat layer (WhatsApp style) ── */}
      {selectedConversationId && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-[#efeae2] animate-in slide-in-from-right duration-200"
          data-testid="mobile-conversation-detail"
        >
          <div
            className="flex items-center gap-2 border-b border-black/5 bg-white px-2 py-2 shadow-sm"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
          >
            <button
              onClick={() => setSelectedConversationId(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
              data-testid="button-back-to-list"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <img
              src={(conversationDetail?.conversation?.customerId || selectedConversation?.customerId || selectedConversation?.customer) ? badgeContactKnown : badgeContactUnknown}
              alt=""
              className="h-10 w-10 shrink-0 select-none"
              draggable={false}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">{displayName}</p>
              {displayPhone && <p className="truncate text-xs text-slate-500">{displayPhone}</p>}
            </div>
            {displayPhone && (
              <a
                href={`tel:${displayPhone}`}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[#711419] active:bg-slate-100"
                aria-label="Call"
                data-testid="button-call-contact"
              >
                <Phone className="h-5 w-5" />
              </a>
            )}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {loadingDetail && messages.length === 0 ? (
              <div className="flex justify-center py-8">
                <MobileSpinner fullHeight={false} />
              </div>
            ) : timeline.length > 0 ? (
              <div className="space-y-1.5">
                {timeline.map((entry) =>
                  entry.kind === "chip" ? (
                    <div key={entry.key} className="flex justify-center py-2">
                      <span className="rounded-md bg-white/85 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
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
                            : "rounded-bl-[4px] bg-white text-slate-900"
                        }`}
                        data-testid={`message-${entry.m.id}`}
                      >
                        <p className="whitespace-pre-wrap break-words pb-1 pr-12 text-[15px] leading-snug">{entry.m.body}</p>
                        <span
                          className={`absolute bottom-1 right-2.5 text-[10px] ${
                            entry.m.direction === "outbound" ? "text-white/60" : "text-slate-400"
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
              <div className="py-8 text-center text-slate-500">
                <img src={badgeMessaging} alt="" className="mx-auto mb-2 h-12 w-12 select-none opacity-80" draggable={false} />
                <p>No messages yet — say hello.</p>
              </div>
            )}
          </div>

          <div
            className="flex items-end gap-2 px-3 pt-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
          >
            <div className="flex min-h-[44px] min-w-0 flex-1 items-center rounded-3xl bg-white px-4 shadow-sm">
              <textarea
                placeholder="Message"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={1}
                className="max-h-28 w-full resize-none bg-transparent py-3 text-[16px] leading-5 text-slate-900 outline-none placeholder:text-slate-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                data-testid="input-message"
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || sendMessageMutation.isPending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#711419] text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
              data-testid="button-send-message"
            >
              {sendMessageMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      {/* ── New conversation — fullscreen picker ── */}
      {showNewConversation && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white animate-in slide-in-from-bottom duration-200" data-testid="mobile-new-conversation">
          <div
            className="flex items-center gap-3 border-b bg-white p-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
          >
            <Button variant="ghost" size="icon" onClick={() => setShowNewConversation(false)} data-testid="button-close-new-conversation">
              <X className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold">New Message</h2>
          </div>
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                autoFocus
                placeholder="Search contacts..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="pl-10"
                data-testid="input-contact-search"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {loadingContacts ? (
              <div className="flex justify-center py-8">
                <MobileSpinner fullHeight={false} />
              </div>
            ) : contacts && contacts.length > 0 ? (
              <div className="divide-y">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => startConversationMutation.mutate({ customerId: contact.id })}
                    className="flex w-full items-center gap-3 p-4 text-left active:bg-slate-50"
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
            ) : contactSearch.length >= 2 ? (
              <div className="py-8 text-center text-slate-500">
                <User className="mx-auto mb-2 h-12 w-12 text-slate-300" />
                <p>No contacts found</p>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500">
                <Search className="mx-auto mb-2 h-12 w-12 text-slate-300" />
                <p>Type at least 2 characters to search</p>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </MobileShell>
  );
}
