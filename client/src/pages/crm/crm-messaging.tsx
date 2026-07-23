import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Search,
  Send,
  Clock,
  Check,
  CheckCheck,
  MoreVertical,
  X,
  Archive,
  BellOff,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Plus,
  User,
  Trash2,
  PanelRight,
  Phone,
  CircleUserRound,
  ImagePlus,
} from "lucide-react";
import type {
  CrmMessagingConversation,
  CrmMessagingMessage,
  CrmMessagingConversationTag,
  CrmCustomer,
  CrmUser,
} from "@shared/schema";
import { format, isSameDay } from "date-fns";
import { CrmLayout } from "@/components/crm/crm-layout";
import { CommsSwitcher } from "@/components/crm/comms-switcher";
import { MessagingCustomerPanel } from "@/components/crm/messaging-customer-panel";
import { cn } from "@/lib/utils";

type ConversationWithCustomer = CrmMessagingConversation & {
  customer?: CrmCustomer | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: string | null;
  lastMessageAuthorName?: string | null;
};

type MessageWithAuthor = CrmMessagingMessage & {
  authorName?: string | null;
};

type ConversationDetail = {
  conversation: CrmMessagingConversation;
  messages: MessageWithAuthor[];
  tags: CrmMessagingConversationTag[];
  customer?: CrmCustomer | null;
};

const messageStatusIcons: Record<string, JSX.Element> = {
  queued: <Clock className="h-3 w-3 opacity-70" />,
  sent: <Check className="h-3 w-3 opacity-70" />,
  delivered: <CheckCheck className="h-3 w-3 opacity-70" />,
  read: <CheckCheck className="h-3 w-3" />,
  failed: <X className="h-3 w-3 text-red-300" />,
};

type FilterTab = "open" | "unread" | "all" | "resolved";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "unread", label: "Unread" },
  { value: "all", label: "All" },
  { value: "resolved", label: "Resolved" },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatMessageTime(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return format(d, "h:mm a");
  } else if (diffDays < 7) {
    return format(d, "EEE h:mm a");
  } else {
    return format(d, "MMM d");
  }
}

type CustomerSearchResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export default function CrmMessaging() {
  usePageTitle("Messaging");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("open");
  const [messageText, setMessageText] = useState("");
  const [showMobileThread, setShowMobileThread] = useState(false);
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("crm_msg_context_collapsed") === "1"
  );
  useEffect(() => {
    localStorage.setItem("crm_msg_context_collapsed", contextCollapsed ? "1" : "0");
  }, [contextCollapsed]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending image attachment for the composer (uploaded to object storage,
  // then sent with the next message as an MMS).
  type PendingAttachment = { id: string; url: string; filename: string; mimeType: string };
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);

  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [newMessagePhone, setNewMessagePhone] = useState("");
  const [newMessageBody, setNewMessageBody] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Server-side status filter (unread is derived client-side over the open set)
  const serverStatus = filterTab === "resolved" ? "resolved" : filterTab === "all" ? "" : "open";

  const { data: conversations, isLoading: loadingConversations } = useQuery<ConversationWithCustomer[]>({
    queryKey: ["/api/crm/messaging/conversations", { status: serverStatus, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serverStatus) params.set("status", serverStatus);
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/crm/messaging/conversations?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    staleTime: 3000,
    refetchInterval: 5000,
  });

  const visibleConversations = useMemo(() => {
    if (!conversations) return [];
    if (filterTab === "unread") {
      return conversations.filter((c) => (c.unreadInboundCount || 0) > 0);
    }
    return conversations;
  }, [conversations, filterTab]);

  const totalUnread = useMemo(
    () => (conversations || []).reduce((sum, c) => sum + (c.unreadInboundCount || 0), 0),
    [conversations]
  );

  const { data: conversationDetail, isLoading: loadingDetail } = useQuery<ConversationDetail>({
    queryKey: ["/api/crm/messaging/conversations", selectedConversationId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/messaging/conversations/${selectedConversationId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!selectedConversationId,
    staleTime: 3000,
    refetchInterval: 6000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ body, attachments }: { body: string; attachments?: PendingAttachment[] }) => {
      const res = await apiRequest("POST", `/api/crm/messaging/conversations/${selectedConversationId}/messages`, {
        body,
        channel: attachments && attachments.length > 0 ? "mms" : "sms",
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setMessageText("");
      setAttachment(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations"] });
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const updateConversationMutation = useMutation({
    mutationFn: async (updates: Partial<CrmMessagingConversation>) => {
      const res = await apiRequest("PATCH", `/api/crm/messaging/conversations/${selectedConversationId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations", selectedConversationId] });
    },
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const deleteConversationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/messaging/conversations/${selectedConversationId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Conversation deleted" });
      setSelectedConversationId(null);
      setShowMobileThread(false);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations"] });
    },
    onError: () => {
      toast({ title: "Failed to delete conversation", variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      await apiRequest("POST", `/api/crm/messaging/conversations/${conversationId}/read`);
    },
    // Clear the unread badge instantly (optimistic), before the server responds.
    onMutate: async (conversationId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/messaging/conversations"] });
      queryClient.setQueriesData<ConversationWithCustomer[]>(
        { queryKey: ["/api/crm/messaging/conversations"] },
        (old) =>
          old?.map((c) =>
            c.id === conversationId ? { ...c, unreadInboundCount: 0, unreadCount: 0 } : c,
          ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/unread-count"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations"] });
    },
  });

  const syncTextlineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/messaging/sync-textline");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations"] });
    },
    onError: () => {
      console.log("Textline sync failed");
    },
  });

  const { data: customerSearchResults } = useQuery<CustomerSearchResult[]>({
    queryKey: ["/api/crm/messaging/customers/search", customerSearch],
    queryFn: async () => {
      if (!customerSearch || customerSearch.length < 2) return [];
      const res = await fetch(`/api/crm/messaging/customers/search?q=${encodeURIComponent(customerSearch)}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: customerSearch.length >= 2 && newMessageOpen,
  });

  const startConversationMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; message: string; customerId?: string; customerName?: string }) => {
      const res = await apiRequest("POST", "/api/crm/messaging/start-conversation", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Message sent successfully" });
      setNewMessageOpen(false);
      setNewMessagePhone("");
      setNewMessageBody("");
      setCustomerSearch("");
      setSelectedCustomer(null);
      syncTextlineMutation.mutate();
      if (data.conversationId) {
        setSelectedConversationId(data.conversationId);
        setShowMobileThread(true);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleStartNewConversation = () => {
    const phone = selectedCustomer?.phone || newMessagePhone;
    if (!phone?.trim() || !newMessageBody.trim()) {
      toast({ title: "Phone number and message are required", variant: "destructive" });
      return;
    }
    startConversationMutation.mutate({
      phoneNumber: phone,
      message: newMessageBody,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
    });
  };

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer);
    setNewMessagePhone(customer.phone || "");
    setCustomerSearch("");
  };

  const handleClearSelectedCustomer = () => {
    setSelectedCustomer(null);
    setNewMessagePhone("");
  };

  // Auto-sync with Textline on page load
  useEffect(() => {
    syncTextlineMutation.mutate();
  }, []);

  // Fallback: also mark read when a conversation is opened programmatically
  // (e.g. deep-link or after creating one), not just via a list click.
  useEffect(() => {
    const conv = conversationDetail?.conversation;
    if (conv?.id && (conv.unreadInboundCount || 0) > 0) {
      markReadMutation.mutate(conv.id);
    }
  }, [conversationDetail?.conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationDetail?.messages]);

  const handleSendMessage = () => {
    if (!selectedConversationId) return;
    if (!messageText.trim() && !attachment) return;
    sendMessageMutation.mutate({
      body: messageText.trim(),
      attachments: attachment ? [attachment] : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Upload a chosen image to object storage via the presigned-URL flow, then
  // stage it on the composer so the next send goes out as an MMS.
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only images can be sent", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image is too large", description: "Please keep images under 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const reqRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await reqRes.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("upload failed");
      setAttachment({ id: crypto.randomUUID(), url: objectPath, filename: file.name, mimeType: file.type });
    } catch {
      toast({ title: "Couldn't upload image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);

  const headerName =
    conversationDetail?.customer?.name ||
    conversationDetail?.conversation?.customerName ||
    selectedConversation?.customerName ||
    "Unknown Contact";
  const headerPhone =
    conversationDetail?.customer?.phone ||
    conversationDetail?.conversation?.phoneNumber ||
    selectedConversation?.phoneNumber ||
    "";

  const handleAddCustomer = () => {
    const phone = conversationDetail?.conversation?.phoneNumber || selectedConversation?.phoneNumber || "";
    const name = conversationDetail?.conversation?.customerName || selectedConversation?.customerName || "";
    const params = new URLSearchParams();
    if (phone) params.set("phone", phone);
    if (name) params.set("name", name);
    navigate(`/crm/accounts/new?${params.toString()}`);
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const contextPanel = selectedConversationId ? (
    <MessagingCustomerPanel
      conversationId={selectedConversationId}
      phoneNumber={headerPhone}
      fallbackName={headerName}
      onAddCustomer={handleAddCustomer}
    />
  ) : null;

  const messagingContent = (
    <div className="flex h-full flex-col overflow-hidden">
      <CommsSwitcher active="messages" />
    <div className="min-h-0 flex-1 flex overflow-hidden bg-muted/30">
      {/* ───────────── Conversation list ───────────── */}
      <div
        className={cn(
          "w-full lg:w-[400px] border-r border-slate-200/80 bg-white flex-shrink-0 flex flex-col",
          showMobileThread ? "hidden lg:flex" : "flex"
        )}
      >
        {/* Header — mirrors Mail's pane header */}
        <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
          <div className="min-w-0 leading-tight">
            <div className="font-display text-lg font-semibold text-slate-900">Messages</div>
            <div className="truncate text-[11px] text-slate-400">{currentUser?.name}</div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNewMessageOpen(true)}
            className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            data-testid="button-new-message"
            title="New message"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search conversations…"
              className="h-9 rounded-lg border-slate-200 bg-slate-50 pl-9 text-sm focus-visible:bg-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        {/* Filter tabs — segmented control (matches Mail) */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilterTab(tab.value)}
                className={cn(
                  "flex-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
                  filterTab === tab.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
                data-testid={`filter-tab-${tab.value}`}
              >
                {tab.label}
                {tab.value === "unread" && totalUnread > 0 && (
                  <span className="ml-1 text-[#711419]">{totalUnread}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingConversations ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm font-medium">{searchQuery ? "No matches" : "No conversations"}</p>
              <p className="text-xs">
                {searchQuery
                  ? `Nothing found for "${searchQuery}".`
                  : filterTab === "unread"
                    ? "You're all caught up."
                    : "Start a new message to begin."}
              </p>
            </div>
          ) : (
            <div className="p-2">
              {searchQuery && (
                <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {visibleConversations.length} result{visibleConversations.length === 1 ? "" : "s"} for “{searchQuery}”
                </p>
              )}
              {visibleConversations.map((conv) => {
                const hasUnread = (conv.unreadInboundCount || 0) > 0;
                const isActive = selectedConversationId === conv.id;
                const name = conv.customer?.name || conv.customerName || "Unknown";
                const outPrefix =
                  conv.lastMessageDirection === "outbound"
                    ? `${conv.lastMessageAuthorName || "You"}: `
                    : "";
                const preview = conv.lastMessagePreview
                  ? `${outPrefix}${conv.lastMessagePreview}`
                  : conv.phoneNumber || conv.customer?.phone || "";
                return (
                  <button
                    key={conv.id}
                    className={cn(
                      "group mb-0.5 w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-[#711419]/[0.07]" : "hover:bg-slate-100"
                    )}
                    onClick={() => {
                      setSelectedConversationId(conv.id);
                      setShowMobileThread(true);
                      // Mark read the instant it's clicked, don't wait for the
                      // thread (which does a slow Textline pull) to load.
                      if ((conv.unreadInboundCount || 0) > 0) {
                        markReadMutation.mutate(conv.id);
                      }
                    }}
                    data-testid={`conversation-item-${conv.id}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none",
                          hasUnread ? "bg-[#711419] text-white" : "bg-slate-200 text-slate-600"
                        )}
                      >
                        {/[a-zA-Z]/.test(name) ? getInitials(name) : (name.replace(/\D/g, "").slice(0, 2) || "#")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "flex min-w-0 items-center gap-1.5 truncate text-sm text-foreground",
                              hasUnread ? "font-semibold" : "font-medium"
                            )}
                          >
                            {hasUnread && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-[2px] bg-primary"
                                data-testid={`badge-unread-count-${conv.id}`}
                              />
                            )}
                            <span className="truncate">{name}</span>
                          </span>
                          <span
                            className={cn(
                              "text-xs shrink-0",
                              hasUnread ? "text-primary font-medium" : "text-muted-foreground"
                            )}
                          >
                            {formatMessageTime(conv.lastMessageAt)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "text-xs truncate mt-0.5",
                            hasUnread ? "text-foreground/80 font-medium" : "text-muted-foreground"
                          )}
                        >
                          {preview}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ───────────── Thread ───────────── */}
      <div className={cn("flex-1 flex flex-col bg-background min-w-0", !showMobileThread ? "hidden lg:flex" : "flex")}>
        {!selectedConversationId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                <MessageSquare className="h-7 w-7 text-muted-foreground/50" />
              </span>
              <p className="font-medium text-foreground">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to view messages.</p>
            </div>
          </div>
        ) : loadingDetail ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden h-8 w-8 p-0 shrink-0"
                  onClick={() => setShowMobileThread(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <h2 className="font-semibold text-foreground text-sm truncate">{headerName}</h2>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Phone className="h-3 w-3" /> {headerPhone || "No phone"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Context toggle — collapses the rail on lg+, opens a drawer below lg */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 lg:hidden"
                  onClick={() => setContextSheetOpen(true)}
                  title="Customer details"
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "open" })}>
                      <MessageSquare className="h-4 w-4 mr-2" /> Reopen
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "resolved" })}>
                      <Check className="h-4 w-4 mr-2" /> Resolve
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "snoozed" })}>
                      <BellOff className="h-4 w-4 mr-2" /> Snooze
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "archived" })}>
                      <Archive className="h-4 w-4 mr-2" /> Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hidden lg:inline-flex"
                  onClick={() => setContextCollapsed((v) => !v)}
                  title={contextCollapsed ? "Show customer details" : "Hide customer details"}
                  data-testid="button-toggle-context"
                >
                  <PanelRight className={cn("h-4 w-4 transition-colors", !contextCollapsed && "text-primary")} />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
              <div className="space-y-1">
                {conversationDetail?.messages?.map((msg, idx) => {
                  const prev = conversationDetail.messages[idx - 1];
                  const showDateDivider =
                    !prev || !isSameDay(new Date(prev.sentAt || prev.createdAt || 0), new Date(msg.sentAt || msg.createdAt || 0));
                  if (msg.direction === "system") {
                    return (
                      <div key={msg.id} className="flex justify-center py-2">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs italic text-muted-foreground">
                          {msg.body}
                        </span>
                      </div>
                    );
                  }
                  const outbound = msg.direction === "outbound";
                  const attachments = ((msg.attachments as any[] | undefined) || []).filter((a) => a && a.url);
                  const hasBody = !!(msg.body && String(msg.body).trim());
                  // Skip "ghost" messages that carry neither text nor attachments
                  // (e.g. empty/duplicate rows) so they don't render as a blank bubble.
                  if (!hasBody && attachments.length === 0) return null;
                  const isImage = (a: any) =>
                    (a.contentType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.url || "");
                  return (
                    <div key={msg.id}>
                      {showDateDivider && (
                        <div className="flex justify-center py-3">
                          <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                            {(msg.sentAt || msg.createdAt) && format(new Date(msg.sentAt || msg.createdAt!), "EEEE, MMMM d")}
                          </span>
                        </div>
                      )}
                      <div className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
                        {/* Only the text is boxed */}
                        <div
                          className={cn(
                            "max-w-[75%] rounded-lg px-3.5 py-2",
                            outbound
                              ? "bg-[#c0607a] text-white rounded-br-sm shadow-sm"
                              : "bg-muted text-foreground rounded-bl-sm"
                          )}
                          data-testid={`message-${msg.id}`}
                        >
                          {attachments.length > 0 && (
                            <div className="mb-1 space-y-1">
                              {attachments.map((a, i) =>
                                isImage(a) ? (
                                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
                                    <img src={a.url} alt={a.filename || "attachment"} className="max-h-60 rounded-lg" />
                                  </a>
                                ) : (
                                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block text-sm underline">
                                    {a.filename || "Attachment"}
                                  </a>
                                ),
                              )}
                            </div>
                          )}
                          {hasBody && (
                            <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{msg.body}</p>
                          )}
                        </div>
                        {/* Sender · time · status sit below the bubble, outside the box */}
                        <div
                          className={cn(
                            "flex items-center gap-1 mt-1 px-1 text-[11px] text-muted-foreground",
                            outbound ? "justify-end" : "justify-start"
                          )}
                        >
                          {outbound && msg.authorName && <span className="mr-0.5">{msg.authorName} ·</span>}
                          <span>{formatMessageTime(msg.sentAt || msg.createdAt)}</span>
                          {outbound && messageStatusIcons[msg.status || "sent"]}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="p-3 border-t border-border bg-card">
              {/* Staged image preview */}
              {attachment && (
                <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-1.5 pr-2">
                  <img src={attachment.url} alt={attachment.filename} className="h-12 w-12 rounded-md object-cover" />
                  <span className="max-w-[160px] truncate text-xs text-muted-foreground">{attachment.filename}</span>
                  <button
                    onClick={() => setAttachment(null)}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remove image"
                    data-testid="button-remove-attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelected}
                  data-testid="input-attachment-file"
                />
                <Button
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || sendMessageMutation.isPending}
                  className="h-[42px] w-[42px] p-0 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  title="Attach image"
                  data-testid="button-attach-image"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                </Button>
                <Textarea
                  placeholder="Type a message…"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="resize-none text-sm min-h-[42px] max-h-32 rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0"
                  data-testid="input-message-text"
                />
                <Button
                  variant="ghost"
                  onClick={handleSendMessage}
                  disabled={(!messageText.trim() && !attachment) || sendMessageMutation.isPending}
                  className="h-[42px] w-[42px] p-0 shrink-0 rounded-lg text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Customer context rail (lg+, collapsible with the same smooth slide as the sidebar) ── */}
      {selectedConversationId && (
        <div
          className={cn(
            "hidden lg:block flex-shrink-0 overflow-hidden bg-card transition-[width] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            contextCollapsed ? "lg:w-0 border-l-0" : "lg:w-80 xl:w-96 border-l border-border"
          )}
        >
          {/* Fixed-width inner so the content clips/slides cleanly instead of reflowing */}
          <div className="h-full w-80 xl:w-96">{contextPanel}</div>
        </div>
      )}
    </div>
    </div>
  );

  const newMessageDialog = (
    <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            New Message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 rounded-md">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(selectedCustomer.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelectedCustomer}
                className="h-8 w-8 p-0"
                data-testid="button-clear-customer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Customer or Enter Phone</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or enter phone number…"
                  className="pl-8"
                  value={customerSearch || newMessagePhone}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^[\d\s()+\-]*$/.test(val)) {
                      setNewMessagePhone(val);
                      setCustomerSearch("");
                    } else {
                      setCustomerSearch(val);
                      setNewMessagePhone("");
                    }
                  }}
                  data-testid="input-customer-search"
                />
              </div>
              {customerSearchResults && customerSearchResults.length > 0 && (
                <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
                  {customerSearchResults.map((customer) => (
                    <button
                      key={customer.id}
                      className="w-full text-left p-2 hover:bg-muted flex items-center gap-2 border-b border-border last:border-b-0"
                      onClick={() => handleSelectCustomer(customer)}
                      data-testid={`customer-option-${customer.id}`}
                    >
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {newMessagePhone && !selectedCustomer && (
                <p className="text-xs text-muted-foreground">Sending to: {newMessagePhone}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              placeholder="Type your message…"
              value={newMessageBody}
              onChange={(e) => setNewMessageBody(e.target.value)}
              rows={3}
              className="resize-none"
              data-testid="input-new-message-body"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setNewMessageOpen(false);
              setNewMessagePhone("");
              setNewMessageBody("");
              setCustomerSearch("");
              setSelectedCustomer(null);
            }}
            data-testid="button-cancel-new-message"
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartNewConversation}
            disabled={
              startConversationMutation.isPending ||
              (!selectedCustomer?.phone && !newMessagePhone.trim()) ||
              !newMessageBody.trim()
            }
            data-testid="button-send-new-message"
          >
            {startConversationMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const deleteConfirmDialog = (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this conversation? This will permanently remove all messages and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteConversationMutation.mutate()}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteConversationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Context drawer for screens below lg (where the rail is hidden)
  const contextDrawer = (
    <Sheet open={contextSheetOpen} onOpenChange={setContextSheetOpen}>
      <SheetContent side="right" className="w-full max-w-sm p-0">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <CircleUserRound className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Customer details</span>
        </div>
        <div className="h-[calc(100%-3.5rem)]">{contextPanel}</div>
      </SheetContent>
    </Sheet>
  );

  return (
    <CrmLayout currentUser={currentUser} disableScroll hideGlobalSearch flush>
      {messagingContent}
      {newMessageDialog}
      {deleteConfirmDialog}
      {contextDrawer}
    </CrmLayout>
  );
}
