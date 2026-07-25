import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Loader2, Mic, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import type { CrmUser } from "@shared/schema";

/** The mobile GHQ assistant — an immersive dark-industrial popup that slides
 *  up over whatever screen you're on (not a page of its own). Same brain and
 *  the same hard safeguards as the desktop Ask AI: the model can only PROPOSE
 *  whitelisted actions; nothing runs until the user taps Approve, and the
 *  server re-validates every proposal. Voice input rides on the Web Speech
 *  API when the device supports it (spoken asks auto-send). */

type ProposedAction = {
  type: "create_task" | "create_work_order";
  summary: string;
  params: Record<string, unknown>;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  relatedTopics?: string[];
  proposedAction?: ProposedAction | null;
  actionState?: "pending" | "executing" | "done" | "dismissed" | "error";
  actionResult?: { label: string; url: string } | null;
  actionError?: string | null;
};

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
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const SpeechRecognitionImpl =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const supportsVoice = !!SpeechRecognitionImpl;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // Kill any live recognition when the sheet closes or unmounts
  useEffect(() => {
    if (!open) {
      recognitionRef.current?.abort?.();
      setListening(false);
    }
    return () => recognitionRef.current?.abort?.();
  }, [open]);

  const sendQuestion = (raw: string) => {
    const question = raw.trim();
    if (question.length < 3 || pending) return;
    const historyForApi = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setPending(true);
    apiRequest("POST", "/api/crm/help", { question, conversationHistory: historyForApi })
      .then(async (r) => {
        const data = await r.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            relatedTopics: data.relatedTopics,
            proposedAction: data.proposedAction || null,
            actionState: data.proposedAction ? ("pending" as const) : undefined,
          },
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

  // Voice capture: YOU control how long the mic listens — continuous mode
  // keeps it open through pauses until you tap the mic again, and only then
  // does the accumulated transcript send. Interim words stream into the input
  // so you can see what it heard as you talk.
  const startVoice = () => {
    if (!SpeechRecognitionImpl || listening) return;
    const rec = new SpeechRecognitionImpl();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript || "";
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput((finalText + interim).trimStart());
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const spoken = finalText.trim();
      if (spoken.length >= 3) {
        sendQuestion(spoken);
      }
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopVoice = () => recognitionRef.current?.stop?.();

  const runProposedAction = (index: number) => {
    const msg = messages[index];
    if (!msg?.proposedAction || msg.actionState === "executing" || msg.actionState === "done") return;
    setMessages((prev) => prev.map((m, j) => (j === index ? { ...m, actionState: "executing" as const, actionError: null } : m)));
    apiRequest("POST", "/api/crm/ai/execute-action", {
      type: msg.proposedAction.type,
      params: msg.proposedAction.params,
    })
      .then(async (r) => {
        const data = await r.json();
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
    setMessages((prev) => prev.map((m, j) => (j === index ? { ...m, actionState: "dismissed" as const } : m)));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" data-testid="assistant-overlay">
      {/* Backdrop — tap to dismiss */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* Sheet */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl bg-slate-950 shadow-[0_-12px_48px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom duration-300"
        style={{ top: "calc(44px + env(safe-area-inset-top))" }}
      >
        {/* Header — the assistant's identity strip */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-[#711419]/60 bg-[#711419]/20">
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" className="h-[18px] w-[18px] rotate-45 text-[#e8b4b8]">
                <rect x="2.6" y="2.6" width="4.2" height="4.2" rx="1.4" />
                <rect x="9.2" y="2.6" width="4.2" height="4.2" rx="1.4" />
                <rect x="2.6" y="9.2" width="4.2" height="4.2" rx="1.4" />
                <rect x="9.2" y="9.2" width="4.2" height="4.2" rx="1.4" />
              </svg>
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">GHQ Intelligence</p>
              <h1 className="text-sm font-semibold leading-tight text-slate-100">Assistant</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setInput(""); }}
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
          {messages.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" className="h-10 w-10 rotate-45 text-[#711419]">
                <rect x="2.6" y="2.6" width="4.2" height="4.2" rx="1.4" />
                <rect x="9.2" y="2.6" width="4.2" height="4.2" rx="1.4" />
                <rect x="2.6" y="9.2" width="4.2" height="4.2" rx="1.4" />
                <rect x="9.2" y="9.2" width="4.2" height="4.2" rx="1.4" />
              </svg>
              <h2 className="mt-4 text-lg font-semibold text-slate-100">
                {firstName ? `What can I get done for you, ${firstName}?` : "What can I get done for you?"}
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
                      <div className="max-w-[85%] rounded-[4px] rounded-br-[1px] bg-[#711419] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="space-y-2">
                    <div className="max-w-[92%] whitespace-pre-wrap rounded-[4px] rounded-tl-[1px] border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm leading-relaxed text-slate-200">
                      {stripMarkdown(msg.content)}
                    </div>
                    {msg.proposedAction && msg.actionState !== "dismissed" && (
                      <div className="max-w-[92%] rounded-[4px] border border-[#711419]/50 bg-[#711419]/10 p-3" data-testid={`assistant-action-card-${i}`}>
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#e8b4b8]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {msg.proposedAction.type === "create_task" ? "New task" : "New work order"} — needs your approval
                        </p>
                        <p className="mt-1.5 text-sm text-slate-200">{msg.proposedAction.summary}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {Object.entries(msg.proposedAction.params).map(([k, v]) => (
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
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendQuestion(input);
                }
              }}
              placeholder={listening ? "Listening..." : "Ask or tell me what to do..."}
              className="h-11 min-w-0 flex-1 rounded-[4px] border border-slate-800 bg-slate-900 px-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
              data-testid="assistant-input"
            />
            {supportsVoice && (
              <button
                onClick={listening ? stopVoice : startVoice}
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
                <Mic className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={() => sendQuestion(input)}
              disabled={input.trim().length < 3 || pending}
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
