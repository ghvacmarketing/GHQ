import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { History, ImagePlus, Loader2, Mic, RotateCcw, Send, ShieldCheck, Trash2, X } from "lucide-react";
import type { CrmUser } from "@shared/schema";
import {
  AI_ACTION_LABELS,
  type AiChatMessage as ChatMessage,
  type AiConversationSummary,
  compressImageForAi,
  deleteAiConversation,
  dismissAiAction,
  fetchAiConversation,
  fetchLatestAiConversation,
  formatConversationWhen,
} from "@/lib/ai-conversations";

/** The mobile GHQ assistant — an immersive dark-industrial popup that slides
 *  up over whatever screen you're on (not a page of its own). Same brain and
 *  the same hard safeguards as the desktop Ask AI: the model can only PROPOSE
 *  whitelisted actions; nothing runs until the user taps Approve, and the
 *  server re-validates every proposal. Voice input rides on Web Speech where
 *  it works and record-then-transcribe on iOS PWAs (spoken asks auto-send).
 *  Conversations persist server-side and are shared with desktop Ask AI. */

const STARTERS = [
  "What's on the schedule today?",
  "Who hasn't paid yet?",
  "Create a work order",
  "Add a task for tomorrow",
];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");
}

export default function AssistantOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Long questions (typed or dictated) wrap onto new lines: grow the box up
  // to ~4 lines, then scroll inside it instead of running off screen.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickImages = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 4)) {
      try {
        const url = await compressImageForAi(file);
        setAttachments((prev) => (prev.length >= 4 ? prev : [...prev, url]));
      } catch {
        // unreadable file — skip it
      }
    }
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; dy: number; active: boolean } | null>(null);

  // Swipe down on the handle/header to dismiss — live drag follow, commit
  // past ~110px, spring back otherwise (same feel as DraggableSheet).
  const onDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { y: e.clientY, dy: 0, active: true };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    const el = sheetRef.current;
    if (!st?.active || !el) return;
    st.dy = Math.max(0, e.clientY - st.y);
    el.style.transition = "none";
    el.style.transform = `translateY(${st.dy}px)`;
  };
  const onDragEnd = () => {
    const st = dragRef.current;
    const el = sheetRef.current;
    dragRef.current = null;
    if (!st || !el) return;
    if (st.dy > 110) {
      el.style.transition = "transform 0.25s ease-in";
      el.style.transform = "translateY(100%)";
      setTimeout(() => {
        onClose();
        el.style.transition = "";
        el.style.transform = "";
      }, 240);
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateY(0)";
      setTimeout(() => {
        if (el) el.style.transition = "";
      }, 260);
    }
  };

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 1000,
    enabled: open,
  });
  const firstName = currentUser?.name?.trim().split(/\s+/)[0];

  // Resume the most recent stored thread the first time the sheet opens —
  // conversations survive app restarts and are shared with desktop Ask AI.
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

  const { data: pastConversations = [] } = useQuery<AiConversationSummary[]>({
    queryKey: ["/api/crm/ai/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/crm/ai/conversations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && historyOpen,
  });

  // Voice capture — Web Speech API where it works, record-then-transcribe on
  // iOS home-screen PWAs (where that API exists but the OS won't service it).
  // Either way YOU control how long the mic listens; stopping it sends.
  const {
    supported: supportsVoice,
    listening,
    processing: transcribing,
    start: startVoice,
    stop: stopVoice,
    cancel: cancelVoice,
  } = useVoiceDictation({
    onTranscript: setInput,
    onFinal: (spoken) => {
      if (spoken.length >= 3) sendQuestion(spoken);
      else if (!spoken) setInput("");
    },
    onError: (message) => {
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // While dictating, keep the box scrolled to the newest words so you can
  // watch the transcript grow instead of staring at the first few.
  useEffect(() => {
    if (listening && composerRef.current) {
      composerRef.current.scrollTop = composerRef.current.scrollHeight;
    }
  }, [input, listening]);

  // Kill any live capture when the sheet closes (the hook cleans up on
  // unmount by itself).
  useEffect(() => {
    if (!open) cancelVoice();
  }, [open, cancelVoice]);

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
    })
      .then(async (r) => {
        const data = await r.json();
        if (data.conversationId) setConversationId(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
        // One spoken message can carry several creation requests — each extra
        // action renders as its own approval card.
        const extras = (Array.isArray(data.extraActions) ? data.extraActions : []).filter((e: any) => e.proposedAction);
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
          ...extras.map((e: any) => ({
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
          // Ambiguous customer name → the server sends candidates; let the
          // user pick the right one instead of guessing.
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
            ? { ...m, actionState: "done" as const, actionResult: { label: data.label || "Created", url: data.url || "/mobile" } }
            : m
        )));
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/work-orders"] });
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

  return (
    <div className="fixed inset-0 z-[70]" data-testid="assistant-overlay">
      {/* Backdrop — tap to dismiss */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl bg-slate-950 shadow-[0_-12px_48px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom duration-300"
        style={{ top: "calc(44px + env(safe-area-inset-top))" }}
      >
        {/* Drag handle — swipe down anywhere on the handle/header to dismiss */}
        <div
          className="flex shrink-0 justify-center pt-2"
          style={{ touchAction: "none" }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          data-testid="assistant-drag-handle"
        >
          <span className="h-1 w-10 rounded-full bg-slate-700" />
        </div>
        {/* Header — the assistant's identity strip */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 pb-3.5 pt-2"
          style={{ touchAction: "none" }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">GHQ Intelligence</p>
            <h1 className="text-sm font-semibold leading-tight text-slate-100">Gibbs</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-[4px] border transition-colors active:bg-slate-800",
                historyOpen ? "border-[#711419] text-[#e8b4b8]" : "border-slate-800 text-slate-400",
              )}
              aria-label="Past conversations"
              data-testid="assistant-history"
            >
              <History className="h-4 w-4" />
            </button>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setInput(""); setConversationId(null); setHistoryOpen(false); }}
                className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-slate-800 text-slate-400 transition-colors active:bg-slate-800"
                aria-label="New conversation"
                data-testid="assistant-new-conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-slate-800 text-slate-400 transition-colors active:bg-slate-800"
              aria-label="Close assistant"
              data-testid="assistant-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Conversation */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {historyOpen ? (
            <div className="space-y-2" data-testid="assistant-history-list">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Past conversations</p>
              {pastConversations.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Nothing saved yet — ask something and it'll show up here.
                </p>
              ) : (
                pastConversations.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center gap-2 rounded-[4px] border px-3 py-2.5",
                      c.id === conversationId ? "border-[#711419]/60 bg-[#711419]/10" : "border-slate-800 bg-slate-900",
                    )}
                  >
                    <button
                      onClick={() => {
                        fetchAiConversation(c.id).then((loaded) => {
                          if (loaded) {
                            setConversationId(loaded.id);
                            setMessages(loaded.messages);
                            setHistoryOpen(false);
                          }
                        });
                      }}
                      className="min-w-0 flex-1 text-left"
                      data-testid={`assistant-conversation-${c.id}`}
                    >
                      <p className="truncate text-sm font-medium text-slate-200">{c.title || "Conversation"}</p>
                      <p className="text-xs text-slate-500">{formatConversationWhen(c.updatedAt)}</p>
                    </button>
                    <button
                      onClick={() => {
                        deleteAiConversation(c.id).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
                          if (c.id === conversationId) {
                            setConversationId(null);
                            setMessages([]);
                          }
                        });
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-slate-500 transition-colors active:text-red-400"
                      aria-label="Delete conversation"
                      data-testid={`assistant-conversation-delete-${c.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : messages.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" className="h-10 w-10 rotate-45 text-[#711419]">
                <rect x="2.6" y="2.6" width="4.2" height="4.2" rx="1.4" />
                <rect x="9.2" y="2.6" width="4.2" height="4.2" rx="1.4" />
                <rect x="2.6" y="9.2" width="4.2" height="4.2" rx="1.4" />
                <rect x="9.2" y="9.2" width="4.2" height="4.2" rx="1.4" />
              </svg>
              <h2 className="mt-4 text-lg font-semibold text-slate-100">
                {firstName ? `Gibbs here — what can I get done, ${firstName}?` : "Gibbs here — what can I get done?"}
              </h2>
              <p className="mt-1 max-w-[260px] text-sm text-slate-500">
                Ask about the business, or tell me what to create. Anything I set up waits for your approval.
              </p>
              <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendQuestion(s)}
                    className="rounded-[4px] border border-slate-800 bg-slate-900 px-4 py-3 text-left text-sm font-medium text-slate-300 transition-all active:scale-[0.98] active:border-[#711419]/60"
                    data-testid={`assistant-starter-${s.slice(0, 10)}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {supportsVoice && (
                <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-600">
                  <Mic className="h-3.5 w-3.5" /> Or tap the mic and just say it
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {messages.map((msg, i) => {
                if (msg.role === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] space-y-1.5">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {msg.attachments.map((src, j) => (
                              <img key={j} src={src} alt="Attached photo" className="max-h-40 rounded-[4px] border border-slate-800 object-cover" />
                            ))}
                          </div>
                        )}
                        {msg.content.trim() !== "" && (
                          <div className="rounded-[4px] rounded-br-[1px] bg-[#711419] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="space-y-2">
                    {msg.content.trim() !== "" && (
                      <div className="max-w-[92%] whitespace-pre-wrap rounded-[4px] rounded-tl-[1px] border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm leading-relaxed text-slate-200">
                        {stripMarkdown(msg.content)}
                      </div>
                    )}
                    {msg.proposedAction && msg.actionState !== "dismissed" && (
                      <div className="max-w-[92%] rounded-[4px] border border-[#711419]/50 bg-[#711419]/10 p-3" data-testid={`assistant-action-card-${i}`}>
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#e8b4b8]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {AI_ACTION_LABELS[msg.proposedAction.type] || "Action"} — needs your approval
                        </p>
                        <p className="mt-1.5 text-sm text-slate-200">{msg.proposedAction.summary}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {Object.entries(msg.proposedAction.params).filter(([k]) => k !== "customerId").map(([k, v]) => (
                            <p key={k} className="text-xs text-slate-400">
                              <span className="font-semibold capitalize text-slate-300">{k.replace(/([A-Z])/g, " $1").toLowerCase()}:</span>{" "}
                              {String(v)}
                            </p>
                          ))}
                        </div>
                        {(msg.actionState === "pending" || msg.actionState === "error") && (
                          <>
                            {msg.actionState === "error" && (
                              <p className="mt-2 text-xs font-medium text-red-400">{msg.actionError}</p>
                            )}
                            <div className="mt-2.5 flex gap-2">
                              <button
                                onClick={() => runProposedAction(i)}
                                className="rounded-[3px] bg-[#711419] px-3.5 py-2 text-xs font-semibold text-white transition-transform active:scale-95"
                                data-testid={`assistant-action-approve-${i}`}
                              >
                                {msg.actionState === "error" ? "Try again" : "Approve & run"}
                              </button>
                              <button
                                onClick={() => dismissProposedAction(i)}
                                className="rounded-[3px] border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-400 transition-transform active:scale-95"
                                data-testid={`assistant-action-dismiss-${i}`}
                              >
                                Dismiss
                              </button>
                            </div>
                          </>
                        )}
                        {msg.actionState === "choose" && msg.actionCandidates && (
                          <div className="mt-2.5 space-y-1.5">
                            <p className="text-xs font-medium text-slate-300">{msg.actionError}</p>
                            {msg.actionCandidates.map((cand) => (
                              <button
                                key={cand.id}
                                onClick={() => pickCandidate(i, cand)}
                                className="block w-full rounded-[3px] border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm font-medium text-slate-200 transition-all active:scale-[0.98] active:border-[#711419]"
                                data-testid={`assistant-candidate-${cand.id}`}
                              >
                                {cand.name}
                              </button>
                            ))}
                            <button
                              onClick={() => dismissProposedAction(i)}
                              className="mt-1 text-xs font-semibold text-slate-500"
                            >
                              None of these — cancel
                            </button>
                          </div>
                        )}
                        {msg.actionState === "executing" && (
                          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running with your approval...
                          </p>
                        )}
                        {msg.actionState === "done" && msg.actionResult && (
                          <div className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-emerald-400">
                            <span>Done — {msg.actionResult.label}</span>
                            <button
                              onClick={() => { onClose(); navigate(msg.actionResult!.url); }}
                              className="text-[#e8b4b8] underline underline-offset-2"
                              data-testid={`assistant-action-open-${i}`}
                            >
                              Open it
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {msg.relatedTopics && msg.relatedTopics.length > 0 && i === messages.length - 1 && !pending && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.relatedTopics.map((topic, j) => (
                          <button
                            key={j}
                            onClick={() => sendQuestion(topic)}
                            className="rounded-[3px] border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors active:border-[#711419]/60 active:text-slate-200"
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {pending && (
                <div className="flex max-w-[92%] items-center gap-1.5 rounded-[4px] rounded-tl-[1px] border border-slate-800 bg-slate-900 px-3.5 py-3.5">
                  <span className="h-[5px] w-[5px] animate-pulse rounded-[1px] bg-[#e8b4b8] [animation-delay:0ms]" />
                  <span className="h-[5px] w-[5px] animate-pulse rounded-[1px] bg-[#e8b4b8] [animation-delay:200ms]" />
                  <span className="h-[5px] w-[5px] animate-pulse rounded-[1px] bg-[#e8b4b8] [animation-delay:400ms]" />
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-3 pt-2.5 backdrop-blur-xl"
          style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}
        >
          {listening && (
            <p className="mb-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#e8b4b8]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#711419] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#711419]" />
              </span>
              Listening — tap the mic again when you're done
            </p>
          )}
          {transcribing && (
            <p className="mb-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#e8b4b8]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Got it — writing that down...
            </p>
          )}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt="" className="h-14 w-14 rounded-[4px] border border-slate-700 object-cover" />
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-slate-800 bg-slate-900 text-slate-400 transition-all active:scale-95 disabled:opacity-40"
              aria-label="Attach photos"
              data-testid="assistant-attach"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <textarea
              ref={composerRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendQuestion(input);
                }
              }}
              placeholder={listening ? "Listening..." : transcribing ? "Transcribing..." : "Ask or tell me what to do..."}
              className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto rounded-[4px] border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm leading-5 text-slate-100 placeholder:text-slate-600 focus:outline-none"
              data-testid="assistant-input"
            />
            {supportsVoice && (
              <button
                onClick={listening ? stopVoice : startVoice}
                disabled={transcribing}
                className={cn(
                  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border transition-all active:scale-95",
                  listening
                    ? "border-[#711419] bg-[#711419] text-white"
                    : "border-slate-800 bg-slate-900 text-slate-400",
                )}
                aria-label={listening ? "Stop listening" : "Speak to the assistant"}
                data-testid="assistant-mic"
              >
                {listening && <span className="absolute inset-0 animate-ping rounded-[4px] border border-[#711419]" />}
                {transcribing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={() => sendQuestion(input)}
              disabled={(input.trim().length < 3 && attachments.length === 0) || pending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] bg-[#711419] text-white transition-all active:scale-95 disabled:opacity-40"
              aria-label="Send"
              data-testid="assistant-send"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
