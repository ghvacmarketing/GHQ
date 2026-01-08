import { useState, useRef, useEffect } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Maximize2,
  Minimize2,
} from "lucide-react";
import type {
  CrmMessagingConversation,
  CrmMessagingMessage,
  CrmMessagingConversationTag,
  CrmCustomer,
  CrmUser,
} from "@shared/schema";
import { format } from "date-fns";
import { CrmLayout } from "@/components/crm/crm-layout";

type ConversationWithCustomer = CrmMessagingConversation & {
  customer?: CrmCustomer | null;
};

type ConversationDetail = {
  conversation: CrmMessagingConversation;
  messages: CrmMessagingMessage[];
  tags: CrmMessagingConversationTag[];
  customer?: CrmCustomer | null;
};

const statusColors: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  snoozed: "bg-yellow-100 text-yellow-700",
  resolved: "bg-blue-100 text-blue-700",
  archived: "bg-slate-100 text-slate-500",
};

const messageStatusIcons: Record<string, JSX.Element> = {
  queued: <Clock className="h-3 w-3 text-slate-400" />,
  sent: <Check className="h-3 w-3 text-slate-400" />,
  delivered: <CheckCheck className="h-3 w-3 text-slate-400" />,
  read: <CheckCheck className="h-3 w-3 text-blue-500" />,
  failed: <X className="h-3 w-3 text-red-500" />,
};

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

export default function CrmMessaging() {
  usePageTitle("Messaging");
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showMobileThread, setShowMobileThread] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: conversations, isLoading: loadingConversations } = useQuery<ConversationWithCustomer[]>({
    queryKey: ["/api/crm/messaging/conversations", { status: "open", search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", "open");
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/crm/messaging/conversations?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

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
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/crm/messaging/conversations/${selectedConversationId}/messages`, {
        body,
        channel: "sms",
      });
      return res.json();
    },
    onSuccess: () => {
      setMessageText("");
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

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/crm/messaging/conversations/${selectedConversationId}/read`);
    },
    onSuccess: () => {
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
      // Silent fail - sync happens automatically in background
      console.log("Textline sync failed");
    },
  });

  // Auto-sync with Textline on page load
  useEffect(() => {
    // Always sync on page load to get latest messages
    syncTextlineMutation.mutate();
  }, []);

  useEffect(() => {
    if (conversationDetail?.conversation?.unreadInboundCount && conversationDetail.conversation.unreadInboundCount > 0) {
      markReadMutation.mutate();
    }
  }, [conversationDetail?.conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationDetail?.messages]);

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversationId) return;
    sendMessageMutation.mutate(messageText.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#d3b07d]" />
      </div>
    );
  }

  const messagingContent = (
    <div className={`h-full flex overflow-hidden ${isFullscreen ? "fixed inset-0 z-50 bg-white" : ""}`}>
      <div className={`w-full md:w-56 lg:w-64 border-r bg-white flex-shrink-0 flex flex-col ${showMobileThread ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#d3b07d]" />
              Messages
              {syncTextlineMutation.isPending && (
                <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
              )}
            </h1>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 p-0"
              data-testid="button-toggle-fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search..."
              className="pl-8 h-8 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingConversations ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-2 p-2">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations?.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No conversations</p>
            </div>
          ) : (
            <div>
              {conversations?.map((conv) => (
                <button
                  key={conv.id}
                  className={`w-full text-left p-3 border-b hover:bg-slate-50 transition-colors ${
                    selectedConversationId === conv.id ? "bg-[#faf6ef] border-l-2 border-l-[#d3b07d]" : ""
                  }`}
                  onClick={() => {
                    setSelectedConversationId(conv.id);
                    setShowMobileThread(true);
                  }}
                  data-testid={`conversation-item-${conv.id}`}
                >
                  <div className="flex gap-2">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-[#d3b07d] text-white text-xs">
                        {getInitials(conv.customer?.name || conv.customerName || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900 truncate text-sm">
                          {conv.customer?.name || conv.customerName || "Unknown"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatMessageTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {conv.phoneNumber || conv.customer?.phone || ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className={`flex-1 flex flex-col bg-white ${!showMobileThread ? "hidden md:flex" : "flex"}`}>
        {!selectedConversationId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-200" />
              <p>Select a conversation</p>
            </div>
          </div>
        ) : loadingDetail ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#d3b07d]" />
          </div>
        ) : (
          <>
            <div className="p-3 border-b flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden h-8 w-8 p-0"
                  onClick={() => setShowMobileThread(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#d3b07d] text-white text-sm">
                    {getInitials(conversationDetail?.customer?.name || conversationDetail?.conversation?.customerName || "?")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-medium text-slate-900 text-sm">
                    {conversationDetail?.customer?.name || conversationDetail?.conversation?.customerName || "Unknown Contact"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {conversationDetail?.customer?.phone || conversationDetail?.conversation?.phoneNumber || "No phone"}
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "resolved" })}>
                    <Check className="h-4 w-4 mr-2" /> Resolve
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "snoozed" })}>
                    <BellOff className="h-4 w-4 mr-2" /> Snooze
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "archived" })}>
                    <Archive className="h-4 w-4 mr-2" /> Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <ScrollArea className="flex-1 p-3">
              <div className="space-y-3">
                {conversationDetail?.messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 ${
                        msg.direction === "outbound"
                          ? "bg-[#d3b07d] text-white"
                          : msg.direction === "system"
                          ? "bg-slate-100 text-slate-500 text-xs italic text-center w-full max-w-none"
                          : "bg-slate-100 text-slate-900"
                      }`}
                      data-testid={`message-${msg.id}`}
                    >
                      <p className="whitespace-pre-wrap text-sm">{msg.body}</p>
                      <div className={`flex items-center gap-1 mt-1 text-xs ${
                        msg.direction === "outbound" ? "text-white/70 justify-end" : "text-slate-400"
                      }`}>
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {msg.direction === "outbound" && messageStatusIcons[msg.status || "sent"]}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 border-t bg-white">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="resize-none text-sm min-h-[40px]"
                  data-testid="input-message-text"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendMessageMutation.isPending}
                  className="bg-[#d3b07d] hover:bg-[#c4a06e] h-10 w-10 p-0"
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (isFullscreen) {
    return messagingContent;
  }

  return (
    <CrmLayout currentUser={currentUser} disableScroll>
      {messagingContent}
    </CrmLayout>
  );
}
