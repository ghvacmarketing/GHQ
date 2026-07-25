import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import {
  AI_ACTION_LABELS,
  type AiChatMessage,
  type AiConversationSummary,
  type AiProposedAction,
  type AiSpace,
  compressImageForAi,
  createAiSpace,
  deleteAiConversation,
  deleteAiSpace,
  fetchAiConversation,
  fetchLatestAiConversation,
  dismissAiAction,
  formatConversationWhen,
  moveAiConversation,
} from "@/lib/ai-conversations";
import {
  Check,
  Folder,
  FolderInput,
  ImagePlus,
  Loader2,
  MessagesSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The desktop GHQ assistant — a full-size ChatGPT-style modal: conversation
 *  history lives in a left sidebar grouped by date section (Today, Yesterday,
 *  Previous 7 days, Older), the active thread fills the main pane. Same brain
 *  and hard safeguards as everywhere else: the model only PROPOSES whitelisted
 *  actions, nothing runs until Approve, and the server re-validates every
 *  proposal. Threads persist server-side and are shared with the mobile app.
 *  Opened from anywhere via the "ghq-open-ai" window event (openGlobalAI). */

interface HelpResponse {
  answer: string;
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
  proposedAction?: AiProposedAction | null;
  conversationId?: string;
  messageId?: string;
  /** One spoken message can carry several creation requests — each extra
   *  action arrives as its own approval card with its own message id. */
  extraActions?: Array<{ messageId?: string; proposedAction?: AiProposedAction | null }>;
}

const STARTERS = [
  "What's on the schedule today?",
  "Which invoices are unpaid?",
  "Create a work order",
  "Add a task for tomorrow",
];

/** Strip any markdown that slips through so the chat never shows raw
 *  asterisks or hash signs. */
function cleanAnswer(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");
}

/** ChatGPT-style date sections for the sidebar. */
function groupConversations(list: AiConversationSummary[]): { label: string; items: AiConversationSummary[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const oneDay = 24 * 60 * 60 * 1000;
  const groups: Record<string, AiConversationSummary[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };
  for (const c of list) {
    const t = c.updatedAt ? startOfDay(new Date(c.updatedAt)) : 0;
    if (t >= today) groups.Today.push(c);
    else if (t >= today - oneDay) groups.Yesterday.push(c);
    else if (t >= today - 7 * oneDay) groups["Previous 7 days"].push(c);
    else groups.Older.push(c);
  }
  return Object.entries(groups)
    .map(([label, items]) => ({ label, items }))
    .filter((g) => g.items.length > 0);
}

export default function AiAssistantModal() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSpace, setActiveSpace] = useState<string | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Long questions (typed or dictated) wrap onto new lines: grow the box up
  // to ~5 lines, then scroll inside it instead of running off screen.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const pickImages = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 4)) {
      try {
        const url = await compressImageForAi(file);
        setAttachments((prev) => (prev.length >= 4 ? prev : [...prev, url]));
      } catch {
        // unreadable file — skip it silently
      }
    }
  };

  // Anything in the CRM opens the assistant by dispatching "ghq-open-ai".
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("ghq-open-ai", onOpen);
    return () => window.removeEventListener("ghq-open-ai", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 60);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // Resume the most recent stored thread the first time the modal opens.
  useEffect(() => {
    if (!open || hydrated) return;
    setHydrated(true);
    fetchLatestAiConversation().then((latest) => {
      if (latest) {
        setConversationId(latest.id);
        setMessages((prev) => (prev.length === 0 ? latest.messages : prev));
      }
    });
  }, [open, hydrated]);

  const { data: conversations = [] } = useQuery<AiConversationSummary[]>({
    queryKey: ["/api/crm/ai/conversations"],
    enabled: open,
  });

  const { data: spaces = [] } = useQuery<AiSpace[]>({
    queryKey: ["/api/crm/ai/spaces"],
    enabled: open,
  });

  const addSpace = () => {
    const name = newSpaceName.trim();
    setNewSpaceName("");
    setNewSpaceOpen(false);
    if (!name) return;
    createAiSpace(name).then((created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/spaces"] });
      if (created) setActiveSpace(created.id);
    });
  };

  const removeSpace = (id: string) => {
    deleteAiSpace(id).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
      if (activeSpace === id) setActiveSpace(null);
    });
  };

  // A chat lives in exactly one space (or none) — moving it replaces the old
  // assignment.
  const moveConversation = (id: string, spaceId: string | null) => {
    moveAiConversation(id, spaceId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
    });
  };

  const sendQuestion = (raw: string) => {
    const photos = attachments;
    const question = raw.trim() || (photos.length > 0 ? "Take a look at this photo." : "");
    if (question.length < 3 || pending) return;
    const historyForApi = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question, attachments: photos.length > 0 ? photos : undefined }]);
    setInput("");
    setAttachments([]);
    setPending(true);
    apiRequest("POST", "/api/crm/help", {
      question,
      conversationHistory: historyForApi,
      conversationId,
      images: photos.length > 0 ? photos : undefined,
      // A brand-new chat is filed into whichever space is selected
      spaceId: conversationId ? undefined : activeSpace ?? undefined,
    })
      .then(async (r) => {
        const data = (await r.json()) as HelpResponse;
        if (data.conversationId) setConversationId(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
        const extras = (data.extraActions || []).filter((e) => e.proposedAction);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            relatedTopics: data.relatedTopics,
            proposedAction: data.proposedAction || null,
            actionState: data.proposedAction ? ("pending" as const) : undefined,
            messageId: data.messageId,
          },
          ...extras.map((e) => ({
            role: "assistant" as const,
            content: "",
            proposedAction: e.proposedAction || null,
            actionState: "pending" as const,
            messageId: e.messageId,
          })),
        ]);
      })
      .catch((e: any) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: e?.message || "Something went wrong reaching the AI. Try again in a moment." },
        ]);
      })
      .finally(() => setPending(false));
  };

  // Voice input — live transcript where Web Speech works, record-then-
  // transcribe elsewhere. Spoken asks auto-send when the mic is tapped off.
  const {
    supported: voiceSupported,
    listening,
    processing: transcribing,
    start: startVoice,
    stop: stopVoice,
    cancel: cancelVoice,
  } = useVoiceDictation({
    onTranscript: setInput,
    onFinal: (spoken) => {
      if (spoken.length >= 3) sendQuestion(spoken);
      else if (spoken) setInput(spoken);
    },
    onError: (message) => {
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    },
  });

  useEffect(() => {
    if (!open) cancelVoice();
  }, [open, cancelVoice]);

  const openConversation = (id: string) => {
    fetchAiConversation(id).then((loaded) => {
      if (loaded) {
        setConversationId(loaded.id);
        setMessages(loaded.messages);
      }
    });
  };

  const removeConversation = (id: string) => {
    deleteAiConversation(id).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
      if (id === conversationId) {
        setConversationId(null);
        setMessages([]);
      }
    });
  };

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    setInput("");
    inputRef.current?.focus();
  };

  const runProposedAction = (index: number, extraParams?: Record<string, unknown>) => {
    const msg = messages[index];
    if (!msg?.proposedAction || msg.actionState === "executing" || msg.actionState === "done") return;
    setMessages((prev) => prev.map((m, j) => (
      j === index
        ? {
            ...m,
            // Keep picked candidates (customer, tech) on the stored params so a
            // second candidate round doesn't lose the first pick.
            proposedAction: m.proposedAction && extraParams
              ? { ...m.proposedAction, params: { ...m.proposedAction.params, ...extraParams } }
              : m.proposedAction,
            actionState: "executing" as const,
            actionError: null,
            actionCandidates: null,
          }
        : m
    )));
    fetch("/api/crm/ai/execute-action", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: msg.proposedAction.type,
        params: { ...msg.proposedAction.params, ...extraParams },
        messageId: msg.messageId,
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({} as any));
        if (!r.ok) {
          // Ambiguous customer or technician → the server sends candidates
          // plus which param the pick should fill.
          if (Array.isArray(data.candidates) && data.candidates.length > 0) {
            setMessages((prev) => prev.map((m, j) => (
              j === index
                ? { ...m, actionState: "choose" as const, actionError: data.message || "Which one did you mean?", actionCandidates: data.candidates, actionCandidateParam: data.candidateParam || "customerId" }
                : m
            )));
          } else {
            setMessages((prev) => prev.map((m, j) => (
              j === index ? { ...m, actionState: "error" as const, actionError: data.message || "Couldn't complete the action." } : m
            )));
          }
          return;
        }
        setMessages((prev) => prev.map((m, j) => (
          j === index
            ? { ...m, actionState: "done" as const, actionResult: { label: data.label || "Created", url: data.url || "/crm/dashboard" } }
            : m
        )));
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      })
      .catch((e: any) => {
        setMessages((prev) => prev.map((m, j) => (
          j === index ? { ...m, actionState: "error" as const, actionError: e?.message || "Couldn't complete the action." } : m
        )));
      });
  };

  const dismissProposedAction = (index: number) => {
    dismissAiAction(messages[index]?.messageId);
    setMessages((prev) => prev.map((m, j) => (j === index ? { ...m, actionState: "dismissed" as const } : m)));
  };

  // Candidate pick. For sends (text/email) the pick goes BACK to the approval
  // card with the chosen customer locked in — nothing sends until the user
  // approves again. Creates (task/work order) run right after the pick.
  const pickCandidate = (index: number, cand: { id: string; name: string }) => {
    const msg = messages[index];
    const param = msg?.actionCandidateParam || "customerId";
    const isSend = msg?.proposedAction?.type === "send_sms" || msg?.proposedAction?.type === "send_email";
    if (isSend && param === "customerId") {
      setMessages((prev) => prev.map((m, j) => (
        j === index
          ? {
              ...m,
              proposedAction: m.proposedAction
                ? { ...m.proposedAction, params: { ...m.proposedAction.params, customerId: cand.id, customerName: cand.name } }
                : m.proposedAction,
              actionState: "pending" as const,
              actionError: null,
              actionCandidates: null,
            }
          : m
      )));
      return;
    }
    runProposedAction(index, { [param]: cand.id });
  };

  if (!open) return null;

  const visibleConversations = activeSpace
    ? conversations.filter((c) => c.spaceId === activeSpace)
    : conversations;
  const grouped = groupConversations(visibleConversations);
  const activeConvo = conversations.find((c) => c.id === conversationId);
  const activeTitle = activeConvo?.title;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[2px]" data-testid="ai-assistant-modal">
      {/* Backdrop click closes; clicks inside the panel don't bubble out */}
      <div className="absolute inset-0" onClick={() => setOpen(false)} />
      <div className="relative flex h-[min(780px,92vh)] w-[min(1150px,96vw)] overflow-hidden rounded-xl bg-white shadow-2xl">

        {/* ── Sidebar: grouped conversation history. Always mounted; width
            animates for a smooth ease-out collapse. Inner wrapper stays w-64
            so content doesn't squish during the slide. ── */}
        <aside
          className={`flex shrink-0 flex-col overflow-hidden border-slate-200 bg-slate-50 transition-[width] duration-300 ease-in-out ${
            sidebarOpen ? "w-64 border-r" : "w-0"
          }`}
          data-testid="ai-sidebar"
        >
          <div className="flex h-full w-64 shrink-0 flex-col">
            <div className="flex items-center justify-between px-3 pb-2 pt-3">
              <div>
                <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.14em] text-slate-400">GHQ Intelligence</p>
                <p className="text-sm font-semibold leading-tight text-slate-800">Gibbs</p>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
                aria-label="Hide history"
                data-testid="ai-toggle-sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            {/* Spaces — named groups of conversations. New chats are filed
                into whichever space is selected. */}
            <div className="px-2 pb-1">
              <div className="flex items-center justify-between px-2 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Spaces</p>
                <button
                  onClick={() => setNewSpaceOpen((v) => !v)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-[#711419]"
                  aria-label="New space"
                  data-testid="ai-new-space"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {newSpaceOpen && (
                <input
                  autoFocus
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSpace();
                    if (e.key === "Escape") {
                      setNewSpaceOpen(false);
                      setNewSpaceName("");
                    }
                  }}
                  placeholder="Name it, press Enter"
                  className="mb-1 w-full rounded-md border border-[#711419]/40 bg-white px-2 py-1.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  data-testid="ai-new-space-input"
                />
              )}
              <button
                onClick={() => setActiveSpace(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                  activeSpace === null ? "bg-[#711419]/10 font-semibold text-[#711419]" : "font-medium text-slate-600 hover:bg-slate-200/60"
                }`}
                data-testid="ai-space-all"
              >
                <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
                All chats
              </button>
              {spaces.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                    activeSpace === s.id ? "bg-[#711419]/10" : "hover:bg-slate-200/60"
                  }`}
                >
                  <button
                    onClick={() => setActiveSpace(s.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] ${
                      activeSpace === s.id ? "font-semibold text-[#711419]" : "font-medium text-slate-600"
                    }`}
                    data-testid={`ai-space-${s.id}`}
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </button>
                  <button
                    onClick={() => removeSpace(s.id)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 opacity-0 transition-all hover:text-red-600 group-hover:opacity-100"
                    aria-label="Delete space"
                    data-testid={`ai-space-delete-${s.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mx-3 my-1 border-t border-slate-200" />

            {/* Chats — the + starts a new chat (filed into the selected space) */}
            <div className="flex items-center justify-between px-4 pb-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Chats</p>
              <button
                onClick={newChat}
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-[#711419]"
                aria-label="New chat"
                data-testid="ai-new-chat"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {grouped.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-slate-400">
                  {activeSpace
                    ? "No chats in this space yet — start one and it'll be filed here."
                    : "No conversations yet — ask something and it'll be saved here."}
                </p>
              ) : (
                grouped.map((group) => (
                  <div key={group.label} className="mb-2">
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group.label}
                    </p>
                    {group.items.map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                          c.id === conversationId ? "bg-[#711419]/10" : "hover:bg-slate-200/60"
                        }`}
                      >
                        <button
                          onClick={() => openConversation(c.id)}
                          className="min-w-0 flex-1 text-left"
                          data-testid={`ai-conversation-${c.id}`}
                        >
                          <p className={`truncate text-[13px] ${c.id === conversationId ? "font-semibold text-[#711419]" : "font-medium text-slate-700"}`}>
                            {c.title || "Conversation"}
                          </p>
                          <p className="text-[11px] text-slate-400">{formatConversationWhen(c.updatedAt)}</p>
                        </button>
                        {/* Move to a space — a chat lives in exactly one */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-all hover:text-[#711419] group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-[#711419]"
                              aria-label="Move to space"
                              data-testid={`ai-conversation-move-${c.id}`}
                            >
                              <FolderInput className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => moveConversation(c.id, null)}>
                              <MessagesSquare className="mr-2 h-3.5 w-3.5" />
                              No space
                              {!c.spaceId && <Check className="ml-auto h-3.5 w-3.5 text-[#711419]" />}
                            </DropdownMenuItem>
                            {spaces.map((s) => (
                              <DropdownMenuItem key={s.id} onClick={() => moveConversation(c.id, s.id)}>
                                <Folder className="mr-2 h-3.5 w-3.5" />
                                <span className="truncate">{s.name}</span>
                                {c.spaceId === s.id && <Check className="ml-auto h-3.5 w-3.5 text-[#711419]" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                          onClick={() => removeConversation(c.id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-all hover:text-red-600 group-hover:opacity-100"
                          aria-label="Delete conversation"
                          data-testid={`ai-conversation-delete-${c.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* ── Main pane: active thread ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2.5">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Show history"
                data-testid="ai-open-sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
              {activeTitle || (messages.length > 0 ? "Conversation" : "New chat")}
            </p>
            <button
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close assistant"
              data-testid="ai-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Thread */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {messages.length === 0 && !pending ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#711419]/10 text-[#711419]">
                  <Sparkles className="h-7 w-7" />
                </span>
                <h2 className="text-xl font-semibold text-slate-800">Gibbs here — what can I get done?</h2>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
                  I know how GHQ works and can see live data — schedules, agreements, invoices, quotes.
                  Anything I set up waits for your approval.
                </p>
                <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendQuestion(s)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:border-[#711419]/50 hover:text-[#711419]"
                      data-testid={`ai-starter-${s.slice(0, 10)}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4 pb-2">
                {messages.map((msg, i) => {
                  if (msg.role === "user") {
                    return (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-[80%] space-y-1.5">
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {msg.attachments.map((src, j) => (
                                <img
                                  key={j}
                                  src={src}
                                  alt="Attached photo"
                                  className="max-h-44 cursor-pointer rounded-lg border border-slate-200 object-cover"
                                  onClick={() => window.open(src, "_blank")}
                                />
                              ))}
                            </div>
                          )}
                          {msg.content.trim() !== "" && (
                            <div className="rounded-lg rounded-tr-sm bg-[#711419] px-4 py-2.5 text-sm leading-relaxed text-white">
                              {msg.content}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#711419] to-[#e8704f]">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        {msg.content.trim() !== "" && (
                          <div className="whitespace-pre-wrap rounded-lg rounded-tl-sm bg-slate-100 p-4 text-sm leading-relaxed text-slate-800">
                            {cleanAnswer(msg.content)}
                          </div>
                        )}
                        {msg.proposedAction && msg.actionState !== "dismissed" && (
                          <div className="rounded-lg border border-[#711419]/25 bg-[#711419]/[0.03] p-3" data-testid={`ai-action-card-${i}`}>
                            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#711419]">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {AI_ACTION_LABELS[msg.proposedAction.type] || "Action"} — needs your approval
                            </p>
                            <p className="mt-1.5 text-sm text-slate-800">{msg.proposedAction.summary}</p>
                            <div className="mt-1.5 space-y-0.5">
                              {Object.entries(msg.proposedAction.params).filter(([k]) => k !== "customerId").map(([k, v]) => (
                                <p key={k} className="text-xs text-slate-500">
                                  <span className="font-semibold capitalize text-slate-600">{k.replace(/([A-Z])/g, " $1").toLowerCase()}:</span>{" "}
                                  {String(v)}
                                </p>
                              ))}
                            </div>
                            {(msg.actionState === "pending" || msg.actionState === "error") && (
                              <>
                                {msg.actionState === "error" && (
                                  <p className="mt-2 text-xs font-medium text-red-600">{msg.actionError}</p>
                                )}
                                <div className="mt-2.5 flex gap-2">
                                  <button
                                    onClick={() => runProposedAction(i)}
                                    className="rounded-md bg-[#711419] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8a1a1f]"
                                    data-testid={`ai-action-approve-${i}`}
                                  >
                                    {msg.actionState === "error" ? "Try again" : "Approve & run"}
                                  </button>
                                  <button
                                    onClick={() => dismissProposedAction(i)}
                                    className="rounded-md border border-slate-300/70 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                    data-testid={`ai-action-dismiss-${i}`}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </>
                            )}
                            {msg.actionState === "choose" && msg.actionCandidates && (
                              <div className="mt-2.5 space-y-1.5">
                                <p className="text-xs font-medium text-slate-700">{msg.actionError}</p>
                                {msg.actionCandidates.map((cand) => (
                                  <button
                                    key={cand.id}
                                    onClick={() => pickCandidate(i, cand)}
                                    className="block w-full rounded-md border border-slate-300/70 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 transition-colors hover:border-[#711419] hover:text-[#711419]"
                                    data-testid={`ai-candidate-${cand.id}`}
                                  >
                                    {cand.name}
                                  </button>
                                ))}
                                <button
                                  onClick={() => dismissProposedAction(i)}
                                  className="mt-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                                >
                                  None of these — cancel
                                </button>
                              </div>
                            )}
                            {msg.actionState === "executing" && (
                              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running with your approval...
                              </p>
                            )}
                            {msg.actionState === "done" && msg.actionResult && (
                              <div className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                                <span>Done — {msg.actionResult.label}</span>
                                <button
                                  onClick={() => {
                                    navigate(msg.actionResult!.url);
                                    setOpen(false);
                                  }}
                                  className="text-[#711419] hover:underline"
                                  data-testid={`ai-action-open-${i}`}
                                >
                                  Open it
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {msg.relatedTopics && msg.relatedTopics.length > 0 && i === messages.length - 1 && !pending && (
                          <div className="flex flex-wrap gap-2 pl-1">
                            {msg.relatedTopics.map((topic, j) => (
                              <button
                                key={j}
                                onClick={() => sendQuestion(topic)}
                                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-[#711419] hover:text-[#711419]"
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
                {pending && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#711419] to-[#e8704f]">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg rounded-tl-sm bg-slate-100 px-4 py-3.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#711419] [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#711419] [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#711419] [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-slate-200 px-4 py-3">
            {(listening || transcribing) && (
              <p className="mb-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#711419]">
                {transcribing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Got it — writing that down...
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#711419] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#711419]" />
                    </span>
                    Listening — click the mic again when you're done
                  </>
                )}
              </p>
            )}
            {/* One unified bar: photos, typing, voice, and send live together */}
            <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white px-2 py-1.5">
              {attachments.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-2 px-1 pt-1">
                  {attachments.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
                      <button
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-red-600"
                        aria-label="Remove photo"
                        data-testid={`ai-attachment-remove-${i}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    pickImages(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= 4 || pending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#711419] disabled:opacity-40"
                  aria-label="Attach photos"
                  title="Attach photos (up to 4)"
                  data-testid="ai-attach"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendQuestion(input);
                    }
                  }}
                  placeholder={listening ? "Listening..." : transcribing ? "Transcribing..." : "Ask about the business, or tell me what to create..."}
                  className="max-h-40 min-h-[36px] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-sm leading-5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:outline-none"
                  data-testid="ai-input"
                />
                {voiceSupported && (
                  <button
                    onClick={listening ? stopVoice : startVoice}
                    disabled={transcribing}
                    className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      listening
                        ? "bg-[#711419] text-white"
                        : "text-slate-400 hover:bg-slate-100 hover:text-[#711419]"
                    }`}
                    aria-label={listening ? "Stop listening" : "Speak your question"}
                    data-testid="ai-mic"
                  >
                    {listening && <span className="absolute inset-0 animate-ping rounded-lg border border-[#711419]" />}
                    {transcribing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                  </button>
                )}
                <button
                  onClick={() => sendQuestion(input)}
                  disabled={(input.trim().length < 3 && attachments.length === 0) || pending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#711419] text-white transition-colors hover:bg-[#8a1a1f] disabled:opacity-40"
                  aria-label="Send"
                  data-testid="ai-send"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-slate-400">
              Conversations are saved to your account and shared with the mobile app.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
