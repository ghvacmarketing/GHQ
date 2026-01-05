import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Phone,
  Mail,
  User,
  Clock,
  Check,
  CheckCheck,
  MoreVertical,
  Tag,
  UserPlus,
  X,
  Archive,
  Bell,
  BellOff,
  Loader2,
  Plus,
  Filter,
  ArrowLeft,
} from "lucide-react";
import type {
  CrmMessagingConversation,
  CrmMessagingMessage,
  CrmMessagingConversationTag,
  CrmCustomer,
  CrmUser,
} from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
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
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [messageText, setMessageText] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [showMobileThread, setShowMobileThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: conversations, isLoading: loadingConversations } = useQuery<ConversationWithCustomer[]>({
    queryKey: ["/api/crm/messaging/conversations", { status: statusFilter, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
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

  const { data: crmUsers } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
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

  const addTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      const res = await apiRequest("POST", `/api/crm/messaging/conversations/${selectedConversationId}/tags`, { tag });
      return res.json();
    },
    onSuccess: () => {
      setNewTagInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/messaging/conversations", selectedConversationId] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      await apiRequest("DELETE", `/api/crm/messaging/conversations/${selectedConversationId}/tags/${encodeURIComponent(tag)}`);
    },
    onSuccess: () => {
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

  return (
    <CrmLayout currentUser={currentUser} disableScroll>
      <div className="h-full flex overflow-hidden">
        <div className={`w-full md:w-80 lg:w-96 border-r bg-white flex flex-col ${showMobileThread ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-[#d3b07d]" />
                Messages
              </h1>
              <Button size="sm" variant="outline" data-testid="button-new-conversation">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search conversations..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-conversations"
              />
            </div>
            <div className="flex gap-2">
              {["open", "snoozed", "resolved", "all"].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={statusFilter === status ? "default" : "outline"}
                  className={statusFilter === status ? "bg-[#d3b07d] hover:bg-[#c4a06e]" : ""}
                  onClick={() => setStatusFilter(status)}
                  data-testid={`filter-status-${status}`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loadingConversations ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3 p-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations?.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>No conversations found</p>
              </div>
            ) : (
              <div>
                {conversations?.map((conv) => (
                  <button
                    key={conv.id}
                    className={`w-full text-left p-4 border-b hover:bg-slate-50 transition-colors ${
                      selectedConversationId === conv.id ? "bg-[#faf6ef] border-l-4 border-l-[#d3b07d]" : ""
                    }`}
                    onClick={() => {
                      setSelectedConversationId(conv.id);
                      setShowMobileThread(true);
                    }}
                    data-testid={`conversation-item-${conv.id}`}
                  >
                    <div className="flex gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-[#d3b07d] text-white text-sm">
                          {conv.customer ? getInitials(conv.customer.name) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900 truncate">
                            {conv.customer?.name || "Unknown Contact"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatMessageTime(conv.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-slate-500 truncate flex-1">
                            {conv.subject || "No subject"}
                          </p>
                          {(conv.unreadInboundCount ?? 0) > 0 && (
                            <Badge className="bg-[#d3b07d] text-white text-xs">
                              {conv.unreadInboundCount}
                            </Badge>
                          )}
                        </div>
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
                <MessageSquare className="h-16 w-16 mx-auto mb-4 text-slate-200" />
                <p className="text-lg">Select a conversation to view messages</p>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#d3b07d]" />
            </div>
          ) : (
            <>
              <div className="p-4 border-b flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden"
                    onClick={() => setShowMobileThread(false)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-[#d3b07d] text-white">
                      {conversationDetail?.customer ? getInitials(conversationDetail.customer.name) : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      {conversationDetail?.customer?.name || "Unknown Contact"}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {conversationDetail?.customer?.phone || "No phone"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[conversationDetail?.conversation?.status || "open"]}>
                    {conversationDetail?.conversation?.status || "open"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => updateConversationMutation.mutate({ status: "resolved" })}>
                        <Check className="h-4 w-4 mr-2" /> Mark Resolved
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
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {conversationDetail?.messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          msg.direction === "outbound"
                            ? "bg-[#d3b07d] text-white"
                            : msg.direction === "system"
                            ? "bg-slate-100 text-slate-600 text-sm italic text-center w-full max-w-none"
                            : "bg-slate-100 text-slate-900"
                        }`}
                        data-testid={`message-${msg.id}`}
                      >
                        <p className="whitespace-pre-wrap">{msg.body}</p>
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

              <div className="p-4 border-t bg-white">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    className="resize-none"
                    data-testid="input-message-text"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || sendMessageMutation.isPending}
                    className="bg-[#d3b07d] hover:bg-[#c4a06e] self-end"
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

        <div className="hidden lg:flex w-80 border-l bg-white flex-col">
          {selectedConversationId && conversationDetail ? (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                <div className="text-center">
                  <Avatar className="h-16 w-16 mx-auto mb-3">
                    <AvatarFallback className="bg-[#d3b07d] text-white text-xl">
                      {conversationDetail.customer ? getInitials(conversationDetail.customer.name) : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="font-semibold text-lg text-slate-900">
                    {conversationDetail.customer?.name || "Unknown Contact"}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {conversationDetail.customer?.companyName || ""}
                  </p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700 flex items-center gap-2">
                    <User className="h-4 w-4" /> Contact Info
                  </h4>
                  {conversationDetail.customer?.phone && (
                    <a
                      href={`tel:${conversationDetail.customer.phone}`}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#d3b07d]"
                    >
                      <Phone className="h-4 w-4" />
                      {conversationDetail.customer.phone}
                    </a>
                  )}
                  {conversationDetail.customer?.email && (
                    <a
                      href={`mailto:${conversationDetail.customer.email}`}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#d3b07d]"
                    >
                      <Mail className="h-4 w-4" />
                      {conversationDetail.customer.email}
                    </a>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700 flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Assigned To
                  </h4>
                  <Select
                    value={conversationDetail.conversation.assignedToId || ""}
                    onValueChange={(value) => updateConversationMutation.mutate({ assignedToId: value || null })}
                  >
                    <SelectTrigger data-testid="select-assigned-to">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {crmUsers?.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700 flex items-center gap-2">
                    <Tag className="h-4 w-4" /> Tags
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {conversationDetail.tags?.map((t) => (
                      <Badge key={t.id} variant="secondary" className="gap-1">
                        {t.tag}
                        <button
                          onClick={() => removeTagMutation.mutate(t.tag)}
                          className="hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add tag..."
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTagInput.trim()) {
                          addTagMutation.mutate(newTagInput.trim());
                        }
                      }}
                      data-testid="input-new-tag"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (newTagInput.trim()) {
                          addTagMutation.mutate(newTagInput.trim());
                        }
                      }}
                      disabled={!newTagInput.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-slate-700">Quick Actions</h4>
                  <div className="space-y-2">
                    {conversationDetail.customer?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => window.open(`/crm/customers/${conversationDetail.customer?.id}`, "_blank")}
                        data-testid="button-view-customer"
                      >
                        <User className="h-4 w-4 mr-2" /> View Customer Profile
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <p className="text-sm">Select a conversation to view details</p>
            </div>
          )}
        </div>
      </div>
    </CrmLayout>
  );
}
