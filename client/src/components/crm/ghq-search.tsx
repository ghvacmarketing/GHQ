import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Users,
  ClipboardList,
  Receipt,
  FileText,
  FileCheck,
  StickyNote,
  FolderKanban,
  Loader2,
  SearchX,
  Sparkles,
  HelpCircle,
  MessageCircle,
  Send,
  RotateCcw,
  Wrench,
  X,
  MessageSquarePlus,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SearchResultItem {
  id: number;
  name?: string;
  title?: string;
  workOrderNumber?: string;
  invoiceNumber?: string;
  quoteNumber?: string;
  projectNumber?: string;
  status?: string;
  snippet?: string;
  matchField?: string;
  customerId?: number;
  customerName?: string;
}

interface CategoryResult {
  items: SearchResultItem[];
  total: number;
  hasMore: boolean;
}

interface SearchResults {
  customers: CategoryResult;
  workOrders: CategoryResult;
  invoices: CategoryResult;
  quotes: CategoryResult;
  agreements: CategoryResult;
  notes: CategoryResult;
  projects: CategoryResult;
}

interface SearchResponse {
  query: string;
  results: SearchResults;
  totalCount: number;
  aiEnhanced?: boolean;
  aiIntent?: {
    expandedTerms: string[];
    intent: string;
  } | null;
}

type CategoryKey = keyof SearchResults;

const categoryConfig: Record<CategoryKey, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  getLink: (item: SearchResultItem) => string;
  getPrimaryText: (item: SearchResultItem) => string;
  getSecondaryText: (item: SearchResultItem) => string;
  listUrl: string;
}> = {
  customers: {
    label: "Customers",
    icon: Users,
    getLink: (item) => `/crm/customers/${item.id}`,
    getPrimaryText: (item) => item.name || "Unknown",
    getSecondaryText: (item) => item.snippet || "",
    listUrl: "/crm/customers",
  },
  workOrders: {
    label: "Work Orders",
    icon: ClipboardList,
    getLink: (item) => `/crm/work-orders/${item.id}`,
    getPrimaryText: (item) => item.workOrderNumber || item.title || `WO-${item.id}`,
    getSecondaryText: (item) => [item.customerName, item.status, item.snippet].filter(Boolean).join(" • "),
    listUrl: "/crm/work-orders",
  },
  invoices: {
    label: "Invoices",
    icon: Receipt,
    getLink: (item) => `/crm/invoices/${item.id}`,
    getPrimaryText: (item) => item.invoiceNumber || `Invoice #${item.id}`,
    getSecondaryText: (item) => [item.customerName, item.status, item.snippet].filter(Boolean).join(" • "),
    listUrl: "/crm/invoices",
  },
  quotes: {
    label: "Quotes",
    icon: FileText,
    getLink: (item) => `/crm/quotes/${item.id}`,
    getPrimaryText: (item) => item.quoteNumber || item.title || `Quote #${item.id}`,
    getSecondaryText: (item) => [item.customerName, item.status, item.snippet].filter(Boolean).join(" • "),
    listUrl: "/crm/quotes",
  },
  agreements: {
    label: "Agreements",
    icon: FileCheck,
    getLink: () => `/crm/agreements`,
    getPrimaryText: (item) => item.name || item.title || `Agreement #${item.id}`,
    getSecondaryText: (item) => [item.status, item.snippet].filter(Boolean).join(" • "),
    listUrl: "/crm/agreements",
  },
  notes: {
    label: "Notes",
    icon: StickyNote,
    getLink: (item) => `/crm/customers/${item.customerId || item.id}`,
    getPrimaryText: (item) => item.customerName || "Note",
    getSecondaryText: (item) => item.snippet || "",
    listUrl: "/crm/customers",
  },
  projects: {
    label: "Projects",
    icon: FolderKanban,
    getLink: (item) => `/crm/projects/${item.id}`,
    getPrimaryText: (item) => item.projectNumber || item.name || `Project #${item.id}`,
    getSecondaryText: (item) => [item.customerName, item.status, item.snippet].filter(Boolean).join(" • "),
    listUrl: "/crm/projects",
  },
};

const categoryOrder: CategoryKey[] = [
  "customers",
  "workOrders",
  "invoices",
  "quotes",
  "agreements",
  "notes",
  "projects",
];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface HelpResponse {
  answer: string;
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
}

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  relatedTopics?: string[];
};

// Top-nav triggers dispatch these so the global search/AI/comment dialogs can be
// opened from anywhere without prop-drilling. GhqSearch listens for them.
export const openGlobalSearch = () => window.dispatchEvent(new Event("ghq-open-search"));
export const openGlobalAI = () => window.dispatchEvent(new Event("ghq-open-ai"));
export const openGlobalComment = () => window.dispatchEvent(new Event("ghq-open-comment"));

export function GhqSearch({ showFab = true }: { showFab?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [mode, setMode] = useState<"search" | "help">("search");
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<SearchResponse>({
    queryKey: [`/api/crm/ghq/search?q=${encodeURIComponent(debouncedQuery)}&ai=${aiEnabled}`],
    enabled: debouncedQuery.length >= 2 && mode === "search",
  });

  const helpMutation = useMutation({
    mutationFn: async ({ question, conversationHistory }: { question: string; conversationHistory: Array<{role: string; content: string}> }) => {
      const response = await apiRequest("POST", "/api/crm/help", { question, conversationHistory });
      return response.json() as Promise<HelpResponse>;
    },
    onSuccess: (data) => {
      setConversationMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        relatedTopics: data.relatedTopics,
      }]);
    },
    onError: (e: any) => {
      setConversationMessages(prev => [...prev, {
        role: "assistant",
        content: e?.message || "Something went wrong reaching the AI. Try again in a moment.",
      }]);
    },
  });

  const flatResults = useCallback(() => {
    if (!data?.results) return [];
    const items: { category: CategoryKey; item: SearchResultItem }[] = [];
    for (const category of categoryOrder) {
      const categoryResults = data.results[category];
      if (categoryResults?.items?.length > 0) {
        for (const item of categoryResults.items) {
          items.push({ category, item });
        }
      }
    }
    return items;
  }, [data]);

  const allResults = flatResults();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Auto-scroll to bottom whenever a new message is added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationMessages]);

  const handleAskHelp = () => {
    const question = searchQuery.trim();
    if (question.length < 3) return;

    // Capture history BEFORE appending the new user message
    const historyForApi = conversationMessages.map(m => ({ role: m.role, content: m.content }));

    // Optimistically add the user bubble
    setConversationMessages(prev => [...prev, { role: "user", content: question }]);
    setSearchQuery("");

    helpMutation.mutate({ question, conversationHistory: historyForApi });
  };

  const handleNewConversation = () => {
    setConversationMessages([]);
    setSearchQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === "help") {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleAskHelp();
        }
        return;
      }

      if (allResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = allResults[selectedIndex];
        if (selected) {
          const config = categoryConfig[selected.category];
          const link = config.getLink(selected.item);
          navigate(link);
          setOpen(false);
        }
      }
    },
    [allResults, selectedIndex, navigate, mode, handleAskHelp]
  );

  const handleResultClick = (category: CategoryKey, item: SearchResultItem) => {
    const config = categoryConfig[category];
    const link = config.getLink(item);
    navigate(link);
    setOpen(false);
  };

  const renderResults = () => {
    if (searchQuery.length < 2) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Search className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">Type at least 2 characters to search</p>
          <p className="text-xs mt-1 opacity-70">Press Cmd+K to open search anytime</p>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          <p className="text-sm">Searching...</p>
        </div>
      );
    }

    if (!data || data.totalCount === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <SearchX className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">No results found for "{searchQuery}"</p>
          <p className="text-xs mt-1 opacity-70">Try different keywords</p>
        </div>
      );
    }

    let currentFlatIndex = 0;

    const handleViewAll = (listUrl: string) => {
      const searchParam = encodeURIComponent(debouncedQuery);
      navigate(`${listUrl}?search=${searchParam}`);
      setOpen(false);
    };

    return (
      <div ref={resultsRef} className="space-y-4">
        {data.aiEnhanced && data.aiIntent && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg border border-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs text-primary">
              AI-enhanced: {data.aiIntent.intent}
            </span>
          </div>
        )}
        {categoryOrder.map((categoryKey) => {
          const categoryData = data.results[categoryKey];
          if (!categoryData || categoryData.items.length === 0) return null;

          const config = categoryConfig[categoryKey];
          const Icon = config.icon;
          const startIndex = currentFlatIndex;

          return (
            <div key={categoryKey}>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {config.label}
                  </span>
                  <span className="text-xs opacity-70">{categoryData.total}</span>
                </div>
                {categoryData.hasMore && (
                  <button
                    onClick={() => handleViewAll(config.listUrl)}
                    className="text-xs text-primary hover:text-primary/80 font-medium"
                    data-testid={`view-all-${categoryKey}`}
                  >
                    View all {categoryData.total}
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {categoryData.items.map((item, idx) => {
                  const flatIndex = startIndex + idx;
                  const isSelected = flatIndex === selectedIndex;
                  currentFlatIndex++;

                  return (
                    <div
                      key={`${categoryKey}-${item.id}`}
                      className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent"
                      }`}
                      onClick={() => handleResultClick(categoryKey, item)}
                      data-testid={`search-result-${categoryKey}-${item.id}`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0 opacity-70" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {config.getPrimaryText(item)}
                        </p>
                        <p className={`text-xs truncate ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {config.getSecondaryText(item)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderHelpResults = () => {
    if (conversationMessages.length === 0 && !helpMutation.isPending) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </span>
          <p className="text-sm">Ask a question about the CRM</p>
          <p className="text-xs mt-1 opacity-70">e.g., "What does auto pay mean for invoices?"</p>
        </div>
      );
    }

    return (
      <div className="p-4 space-y-4">
        {conversationMessages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-sm px-4 py-2 max-w-[85%] text-sm">
                  {msg.content}
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#e8704f] flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="bg-muted rounded-lg rounded-tl-sm p-4 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
                {msg.relatedTopics && msg.relatedTopics.length > 0 && (
                  <div className="flex flex-wrap gap-2 pl-1">
                    <span className="text-xs text-muted-foreground self-center">Ask about:</span>
                    {msg.relatedTopics.map((topic, j) => (
                      <button
                        key={j}
                        onClick={() => {
                          setSearchQuery(topic);
                          setTimeout(() => inputRef.current?.focus(), 0);
                        }}
                        className="text-xs px-2 py-1 rounded-md bg-muted text-primary hover:bg-accent transition-colors border border-border"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator while waiting for response */}
        {helpMutation.isPending && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#e8704f] flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="bg-muted rounded-lg rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    );
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);

  // Allow the top nav (or anything) to open these dialogs via window events.
  useEffect(() => {
    const onSearch = () => { setOpen(true); setMode("search"); };
    const onAi = () => { setOpen(true); setMode("help"); };
    const onComment = () => setCommentOpen(true);
    window.addEventListener("ghq-open-search", onSearch);
    window.addEventListener("ghq-open-ai", onAi);
    window.addEventListener("ghq-open-comment", onComment);
    return () => {
      window.removeEventListener("ghq-open-search", onSearch);
      window.removeEventListener("ghq-open-ai", onAi);
      window.removeEventListener("ghq-open-comment", onComment);
    };
  }, []);

  return (
    <>
      {showFab && (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-center gap-3 lg:hidden">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`w-14 h-14 rounded-full bg-[#711419] text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#711419] focus:ring-offset-2 ${menuOpen ? "rotate-90" : ""}`}
          data-testid="button-ghq-tools"
          aria-label="Open tools menu"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
        </button>
        {menuOpen && (
          <div className="flex flex-col gap-2 mb-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={() => { setMenuOpen(false); setCommentOpen(true); }}
              className="w-12 h-12 rounded-full bg-card text-foreground border border-border shadow-lg flex items-center justify-center hover:bg-accent transition-colors"
              title="Leave a Comment"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
            <button
              onClick={() => { setMenuOpen(false); setOpen(true); setMode("search"); }}
              className="w-12 h-12 rounded-full bg-card text-foreground border border-border shadow-lg flex items-center justify-center hover:bg-accent transition-colors"
              title="Search & AI"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
      )}

      {commentOpen && <TaggedCommentComposer onClose={() => setCommentOpen(false)} />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl p-0 bg-popover text-popover-foreground border-border overflow-hidden"
          data-testid="dialog-ghq-search"
          onKeyDown={handleKeyDown}
        >
          {/* Search and AI are separate experiences, each opened from its own top-nav
              button. The header just reflects the active one (no tab switching). */}
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {mode === "search" ? (
                <>
                  <Search className="h-4 w-4 text-primary" />
                  Search the CRM
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-primary" />
                  Ask AI
                </>
              )}
            </div>
          </div>

          <div className="p-4 border-b border-border">
            <div className="relative">
              {mode === "search" ? (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              ) : (
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
              )}
              <Input
                ref={inputRef}
                type="text"
                placeholder={
                  mode === "search"
                    ? "Search customers, work orders, invoices..."
                    : conversationMessages.length > 0
                    ? "Ask a follow-up question..."
                    : "Ask about CRM features..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-20 h-12"
                data-testid="input-ghq-search"
              />
              {mode === "help" && searchQuery.trim().length >= 3 && (
                <button
                  onClick={handleAskHelp}
                  disabled={helpMutation.isPending}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-md flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  Ask
                </button>
              )}
              {mode === "search" && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd>
                </div>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-[60vh]">
            <div className="p-2">
              {mode === "search" ? renderResults() : renderHelpResults()}
            </div>
          </ScrollArea>

          <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
            {mode === "search" && (
              <>
                <button
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
                    aiEnabled
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                  data-testid="toggle-ai-search"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>AI {aiEnabled ? "On" : "Off"}</span>
                </button>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded">↓</kbd>
                  <span className="ml-1">navigate</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded">Enter</kbd>
                  <span className="ml-1">select</span>
                </div>
              </>
            )}
            {mode === "help" && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-3 w-3" />
                  <span>AI-powered CRM help</span>
                </div>
                {conversationMessages.length > 0 && (
                  <button
                    onClick={handleNewConversation}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors ml-2"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>New conversation</span>
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">⌘</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded">K</kbd>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaggedCommentComposer({ onClose }: { onClose: () => void }) {
  const [body, setBody] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [location] = useLocation();

  const { data: users = [] } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ["/api/crm/users"],
  });

  const { data: currentUser } = useQuery<{ id: string } | null>({
    queryKey: ["/api/crm/auth/me"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const searchParams = window.location.search;
      const fullRoute = searchParams ? `${location}${searchParams}` : location;
      await apiRequest("POST", "/api/crm/tagged-comments", {
        body,
        pageRoute: fullRoute,
        taggedUserIds: selectedUsers,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tagged-comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
      onClose();
    },
  });

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const availableUsers = users.filter(u => u.id !== currentUser?.id);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-base font-semibold text-slate-900">Leave a Tagged Comment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Page</label>
            <div className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2 truncate">
              {location}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Comment</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your note..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#711419] focus:border-transparent resize-none"
              rows={3}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">
              Tag team members ({selectedUsers.length} selected)
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {availableUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedUsers.includes(user.id)
                      ? "bg-[#711419] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {user.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!body.trim() || selectedUsers.length === 0 || createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-[#711419] rounded-lg hover:bg-[#5a1014] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? "Sending..." : "Send Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GhqSearch;
