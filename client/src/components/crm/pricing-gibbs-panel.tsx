import { useEffect, useRef, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AI_ACTION_LABELS,
  AI_ACTION_CATEGORIES,
  AI_ACTION_CATEGORY_STYLES,
  type AiChatMessage,
  type AiConversationSummary,
  type AiHelpPayload,
  type AiSpace,
  AiStreamStartError,
  askGibbsStream,
  createAiSpace,
  dismissAiAction,
  fetchAiConversation,
} from "@/lib/ai-conversations";
import { getGibbsPageContext } from "@/lib/gibbs-page-context";
import { openGlobalAI } from "@/components/crm/ghq-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpRight, Check, Loader2, Maximize2, Plus, Send, X } from "lucide-react";
import badgeGibbs from "@/assets/badge-gibbs.png";

/** Docked Pricing Gibbs — the same brain, same approval rules, same stored
 *  threads as the top-dog Gibbs in the nav, but living ON the Package
 *  Pricing page as a side panel scoped to pricing work. Every conversation
 *  files into the shared "Pricing" space, so it all shows up in the main
 *  Gibbs modal ("reports back"). Screen context rides every ask via
 *  gibbs-page-context, so "this package" resolves. */

const PRICING_SPACE_NAME = "Pricing";

const STARTERS = [
  "What am I looking at right now?",
  "Which packages are below target margin?",
  "Clean up my unmatched package models",
  "What did the last price file change?",
];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");
}

export default function PricingGibbsPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const spaceIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The shared "Pricing" space — find it (or make it once); every panel
  // conversation files there so the main Gibbs sidebar groups them.
  const ensureSpace = async (): Promise<string | null> => {
    if (spaceIdRef.current) return spaceIdRef.current;
    try {
      const res = await fetch("/api/crm/ai/spaces", { credentials: "include" });
      if (res.ok) {
        const spaces: AiSpace[] = await res.json();
        const found = spaces.find((s) => s.name.trim().toLowerCase() === PRICING_SPACE_NAME.toLowerCase());
        if (found) {
          spaceIdRef.current = found.id;
          return found.id;
        }
      }
      const created = await createAiSpace(PRICING_SPACE_NAME);
      if (created) {
        queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/spaces"] });
        spaceIdRef.current = created.id;
        return created.id;
      }
    } catch {
      // Space filing is organizational — asking still works without it.
    }
    return null;
  };

  // Pick up where the last pricing chat left off.
  useEffect(() => {
    if (hydrated) return;
    setHydrated(true);
    (async () => {
      const spaceId = await ensureSpace();
      if (!spaceId) return;
      try {
        const res = await fetch("/api/crm/ai/conversations", { credentials: "include" });
        if (!res.ok) return;
        const list: AiConversationSummary[] = await res.json();
        const latest = (Array.isArray(list) ? list : []).find((c) => c.spaceId === spaceId);
        if (latest) {
          const loaded = await fetchAiConversation(latest.id);
          if (loaded) {
            setConversationId(loaded.id);
            setMessages(loaded.messages);
          }
        }
      } catch {
        // Fresh panel is fine.
      }
    })();
  }, [hydrated]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, streamText]);

  const send = async (raw?: string) => {
    const question = (raw ?? input).trim();
    if (!question || pending) return;
    setInput("");
    setPending(true);
    setStreamText(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    const spaceId = conversationId ? undefined : (await ensureSpace()) ?? undefined;
    const historyForApi = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const body = {
      question,
      conversationHistory: historyForApi,
      conversationId,
      mode: "general",
      spaceId,
      // "this package" resolves — the page registers what's on screen.
      pageContext: getGibbsPageContext() || undefined,
    };
    let streamedAcc = "";
    try {
      const data: AiHelpPayload = await askGibbsStream(body, (t) => {
        streamedAcc += t;
        setStreamText(streamedAcc);
      }).catch((e) => {
        if (e instanceof AiStreamStartError) {
          return apiRequest("POST", "/api/crm/help", body).then(async (r) => (await r.json()) as AiHelpPayload);
        }
        throw e;
      });
      if (data.conversationId) setConversationId(data.conversationId);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
      const main: AiChatMessage = {
        role: "assistant",
        content: stripMarkdown(data.answer || ""),
        proposedAction: data.proposedActions?.[0] ?? data.proposedAction ?? null,
        actionState: (data.proposedActions?.[0] ?? data.proposedAction) ? "pending" : undefined,
        messageId: data.messageId,
      };
      const extras: AiChatMessage[] = (data.extraActions || [])
        .filter((e) => e.proposedAction)
        .map((e) => ({
          role: "assistant" as const,
          content: "",
          proposedAction: e.proposedAction,
          actionState: "pending" as const,
          messageId: e.messageId,
        }));
      setMessages((prev) => [...prev, main, ...extras]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: e?.message || "Something went wrong — try again." }]);
    } finally {
      setPending(false);
      setStreamText(null);
      inputRef.current?.focus();
    }
  };

  const approve = (index: number) => {
    const msg = messages[index];
    if (!msg?.proposedAction || msg.actionState === "executing" || msg.actionState === "done") return;
    setMessages((prev) => prev.map((m, j) => (j === index ? { ...m, actionState: "executing" as const, actionError: null } : m)));
    fetch("/api/crm/ai/execute-action", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: msg.proposedAction.type, params: msg.proposedAction.params, messageId: msg.messageId }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({} as any));
        if (!r.ok) {
          const needsPick = Array.isArray(data.candidates) && data.candidates.length > 0;
          setMessages((prev) => prev.map((m, j) => (
            j === index
              ? { ...m, actionState: "error" as const, actionError: needsPick ? "This one needs a pick — open the full Gibbs to finish it." : data.message || "Couldn't complete the action." }
              : m
          )));
          return;
        }
        setMessages((prev) => prev.map((m, j) => (
          j === index ? { ...m, actionState: "done" as const, actionResult: { label: data.label || "Done", url: data.url || "/crm/settings/packages" } } : m
        )));
        // Pricing actions touch the catalog/packages — refresh everything on the page.
        for (const key of ["/api/crm/pricebook-drift", "/api/crm/package-unmatched-models", "/api/crm/equipment-catalog", "/api/pricebook/packages", "/api/crm/cost-model"]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      })
      .catch((e: any) => {
        setMessages((prev) => prev.map((m, j) => (
          j === index ? { ...m, actionState: "error" as const, actionError: e?.message || "Couldn't complete the action." } : m
        )));
      });
  };

  const dismiss = (index: number) => {
    const msg = messages[index];
    if (!msg?.proposedAction) return;
    setMessages((prev) => prev.map((m, j) => (j === index ? { ...m, actionState: "dismissed" as const } : m)));
    if (msg.messageId) dismissAiAction(msg.messageId);
  };

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-[65] flex w-[380px] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl duration-200 animate-in slide-in-from-right max-lg:hidden"
      data-testid="pricing-gibbs-panel"
    >
      {/* Header — who this Gibbs is */}
      <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
        <img src={badgeGibbs} alt="" className="h-7 w-7" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-slate-900">Pricing Gibbs</p>
          <p className="text-[11px] leading-tight text-slate-400">Packages, catalog &amp; price files</p>
        </div>
        <button onClick={newChat} className="rounded p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700" title="New chat" data-testid="pricing-gibbs-new">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={openGlobalAI} className="rounded p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700" title="Open in the full Gibbs — same conversation" data-testid="pricing-gibbs-expand">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700" title="Close panel" data-testid="pricing-gibbs-close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {messages.length === 0 && !pending && (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
            <img src={badgeGibbs} alt="" className="h-12 w-12 opacity-90" />
            <p className="max-w-[240px] text-xs leading-relaxed text-slate-400">
              This Gibbs lives on the pricing page — he can see what you have selected, so
              "this package" just works. Chats file into the Pricing space in the main Gibbs.
            </p>
            <div className="flex w-full flex-col gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:border-[#711419]/30 hover:bg-[#711419]/[0.03]"
                  data-testid={`pricing-gibbs-starter`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            {m.content && (
              <div className={m.role === "user" ? "ml-8 rounded-lg bg-[#711419]/[0.06] px-3 py-2" : "mr-4"}>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">{m.content}</p>
              </div>
            )}
            {m.proposedAction && m.actionState !== "superseded" && (
              <div className="mt-2 overflow-hidden rounded-lg border border-[#711419]/25">
                <div className="flex items-center gap-2 border-b border-[#711419]/15 bg-[#711419]/[0.04] px-3 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#711419]">
                    {AI_ACTION_LABELS[m.proposedAction.type] || m.proposedAction.type}
                  </span>
                  {AI_ACTION_CATEGORIES[m.proposedAction.type] && (
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${AI_ACTION_CATEGORY_STYLES[AI_ACTION_CATEGORIES[m.proposedAction.type].key]}`}>
                      {AI_ACTION_CATEGORIES[m.proposedAction.type].label}
                    </span>
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="text-xs leading-relaxed text-slate-600">{m.proposedAction.summary}</p>
                  {m.actionState === "dismissed" ? (
                    <p className="mt-1.5 text-[11px] text-slate-400 line-through">Dismissed — never ran</p>
                  ) : m.actionState === "done" ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> {m.actionResult?.label || "Done"}
                    </p>
                  ) : m.actionState === "executing" ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
                    </p>
                  ) : (
                    <>
                      {m.actionError && <p className="mt-1.5 text-[11px] text-red-600">{m.actionError}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" className="h-7 bg-[#711419] px-3 text-xs hover:bg-[#8a1a1f]" onClick={() => approve(i)} data-testid="pricing-gibbs-approve">
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500" onClick={() => dismiss(i)} data-testid="pricing-gibbs-dismiss">
                          Dismiss
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {m.proposedAction && m.actionState === "superseded" && (
              <p className="mt-1 text-[11px] text-slate-400 line-through">Replaced by a newer proposal</p>
            )}
          </div>
        ))}

        {pending && (
          <div className="mr-4">
            {streamText ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">{stripMarkdown(streamText)}</p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gibbs is thinking…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 p-2.5">
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about pricing, packages, the catalog…"
            className="h-9 text-sm"
            data-testid="pricing-gibbs-input"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0 bg-[#711419] hover:bg-[#8a1a1f]"
            disabled={pending || !input.trim()}
            onClick={() => send()}
            data-testid="pricing-gibbs-send"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
          <ArrowUpRight className="h-3 w-3" /> Same Gibbs, same approvals — chats appear in the main Gibbs under "Pricing".
        </p>
      </div>
    </div>
  );
}
