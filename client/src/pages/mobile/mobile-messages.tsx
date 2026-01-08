import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  MessageSquare, Search, Send, Loader2, ArrowLeft, User, Phone, Plus, X, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import MobileShell from "./mobile-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CrmMessagingConversation, CrmMessagingMessage, CrmCustomer } from "@shared/schema";

interface ConversationWithCustomer extends CrmMessagingConversation {
  customerPhone?: string | null;
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

export default function MobileMessages() {
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

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
  });

  const { data: conversationDetail, isLoading: loadingDetail } = useQuery<ConversationDetailResponse>({
    queryKey: ["/api/mobile/messaging/conversations", selectedConversationId],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/messaging/conversations/${selectedConversationId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedConversationId,
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

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversationId) return;
    sendMessageMutation.mutate({ conversationId: selectedConversationId, body: messageText.trim() });
  };

  const handleStartConversation = (customerId: string) => {
    startConversationMutation.mutate({ customerId });
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/crm/messaging/sync-textline");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/messaging/conversations"] });
      toast({ title: "Synced", description: "Conversations updated from Textline" });
    },
    onError: () => {
      toast({ title: "Sync failed", description: "Could not sync with Textline", variant: "destructive" });
    },
  });

  if (showNewConversation) {
    return (
      <MobileShell>
        <div className="flex flex-col h-full" data-testid="mobile-new-conversation">
          <div className="flex items-center gap-3 p-4 border-b bg-white">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowNewConversation(false)}
              data-testid="button-close-new-conversation"
            >
              <X className="h-5 w-5" />
            </Button>
            <h2 className="font-semibold text-lg">New Message</h2>
          </div>
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
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
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : contacts && contacts.length > 0 ? (
              <div className="divide-y">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleStartConversation(contact.id)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 text-left"
                    data-testid={`contact-${contact.id}`}
                    disabled={startConversationMutation.isPending}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#711419] flex items-center justify-center text-white font-semibold">
                      {contact.customerName?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{contact.customerName}</p>
                      <p className="text-sm text-slate-500 truncate">{contact.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : contactSearch.length >= 2 ? (
              <div className="text-center py-8 text-slate-500">
                <User className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No contacts found</p>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Search className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>Type at least 2 characters to search</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </MobileShell>
    );
  }

  if (selectedConversationId) {
    return (
      <MobileShell>
        <div className="flex flex-col h-full" data-testid="mobile-conversation-detail">
          <div className="flex items-center gap-3 p-4 border-b bg-white">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSelectedConversationId(null)}
              data-testid="button-back-to-list"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate">
                {conversationDetail?.customer?.name || conversationDetail?.conversation?.customerName || "Unknown"}
              </p>
              <p className="text-sm text-slate-500 truncate">
                {conversationDetail?.customer?.phone || conversationDetail?.conversation?.phoneNumber || "No phone"}
              </p>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {loadingDetail ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : conversationDetail?.messages && conversationDetail.messages.length > 0 ? (
              <div className="space-y-3">
                {conversationDetail.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        message.direction === "outbound"
                          ? "bg-[#711419] text-white"
                          : "bg-slate-100 text-slate-800"
                      }`}
                      data-testid={`message-${message.id}`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      <p className={`text-xs mt-1 ${
                        message.direction === "outbound" ? "text-white/70" : "text-slate-400"
                      }`}>
                        {message.sentAt ? format(new Date(message.sentAt), "h:mm a") : "Sending..."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No messages yet</p>
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t bg-white">
            <div className="flex gap-2">
              <Textarea
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="min-h-[44px] max-h-32 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                data-testid="input-message"
              />
              <Button
                size="icon"
                className="h-11 w-11 bg-[#711419] hover:bg-[#8a1a1f]"
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sendMessageMutation.isPending}
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
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="flex flex-col h-full" data-testid="mobile-messages">
        <div className="p-4 border-b bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[#711419]" />
              Messages
            </h1>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-messages"
              >
                <RefreshCw className={`h-5 w-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setShowNewConversation(true)}
                data-testid="button-new-conversation"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingConversations ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : conversations && conversations.length > 0 ? (
            <div className="divide-y">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 text-left"
                  data-testid={`conversation-${conversation.id}`}
                >
                  <div className="w-12 h-12 rounded-full bg-[#711419] flex items-center justify-center text-white font-semibold">
                    {conversation.customerName?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-800 truncate">
                        {conversation.customerName || "Unknown"}
                      </p>
                      {conversation.lastMessageAt && (
                        <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                          {format(new Date(conversation.lastMessageAt), "MMM d")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 truncate">
                      {conversation.phoneNumber || conversation.customerPhone || "No phone"}
                    </p>
                  </div>
                  {conversation.unreadInboundCount && conversation.unreadInboundCount > 0 && (
                    <div className="w-5 h-5 rounded-full bg-[#711419] text-white text-xs flex items-center justify-center">
                      {conversation.unreadInboundCount}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <MessageSquare className="h-16 w-16 mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium mb-1">No conversations yet</p>
              <p className="text-sm">Tap the + button to start a new message</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </MobileShell>
  );
}
