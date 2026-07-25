import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { ArrowUpRight, CheckCircle2, Folder, ImagePlus, Loader2, MessagesSquare, Mic, PanelLeftOpen, Plus, RotateCcw, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { TypewriterText } from "@/components/crm/typewriter-text";
import type { CrmUser } from "@shared/schema";
import {
  AI_ACTION_LABELS,
  type AiChatMessage as ChatMessage,
  type AiConversationSummary,
  type AiSpace,
  compressImageForAi,
  createAiSpace,
  deleteAiConversation,
  deleteAiSpace,
  dismissAiAction,
  fetchAiConversation,
  fetchLatestAiConversation,
  formatConversationWhen,
  groupAiConversations,
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSpace, setActiveSpace] = useState<string | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  // Index of the just-arrived answer — the only message that types itself in.
  const [freshIndex, setFreshIndex] = useState<number | null>(null);
  // Approval cards and topic chips wait until the fresh answer finishes
  // typing — Gibbs shouldn't drop a card mid-sentence.
  const [typedOut, setTypedOut] = useState(true);
  // Live message count — voice sends go through callbacks that can hold a
  // stale `messages`, so the answer's landing index must come from here, not
  // the closure (a wrong freshIndex strands the approval cards unrevealed).
  const messagesLenRef = useRef(0);
  useEffect(() => {
    messagesLenRef.current = messages.length;
  }, [messages]);
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

  // ChatGPT-style panel gesture: swipe right anywhere on the chat to drag the
  // panel in (the chat page slides over with your finger), swipe left on the
  // panel or scrim to push it back. Direction-locked so vertical scrolling in
  // the message list is untouched.
  const panelRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const hDragRef = useRef<{ x: number; y: number; locked: boolean; opening: boolean; p: number; lastX: number; lastT: number; vx: number } | null>(null);
  const suppressClickRef = useRef(false);

  const applyPanelProgress = (p: number, animate: boolean) => {
    const w = panelRef.current?.offsetWidth || 300;
    const move = animate ? "transform 0.28s cubic-bezier(0.32, 0.72, 0.35, 1)" : "none";
    if (panelRef.current) {
      panelRef.current.style.transition = move;
      panelRef.current.style.transform = `translateX(${(p - 1) * w}px)`;
    }
    if (mainRef.current) {
      // Parallax: the chat drifts a third of the panel's travel, so the
      // panel clearly overlaps it instead of shoving it off screen.
      mainRef.current.style.transition = move;
      mainRef.current.style.transform = `translateX(${p * w * (1 / 3)}px)`;
    }
    if (scrimRef.current) {
      scrimRef.current.style.transition = animate ? "opacity 0.28s ease-out" : "none";
      scrimRef.current.style.opacity = String(p);
    }
  };

  const clearPanelDragStyles = () => {
    for (const el of [panelRef.current, mainRef.current, scrimRef.current]) {
      if (!el) continue;
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "";
    }
  };

  const onHStart = (e: React.PointerEvent, opening: boolean) => {
    if ((e.target as HTMLElement).closest("[data-vdrag], textarea, input")) return;
    hDragRef.current = { x: e.clientX, y: e.clientY, locked: false, opening, p: opening ? 0 : 1, lastX: e.clientX, lastT: performance.now(), vx: 0 };
  };
  const onHMove = (e: React.PointerEvent) => {
    const st = hDragRef.current;
    if (!st) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.locked) {
      // Wait until the gesture is clearly horizontal; bail if it heads the
      // wrong way so taps and vertical scrolls stay untouched.
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (st.opening ? dx < 0 : dx > 0) {
        hDragRef.current = null;
        return;
      }
      st.locked = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // capture can fail if the pointer is already gone — drag still works
      }
    }
    const w = panelRef.current?.offsetWidth || 300;
    const p = Math.min(1, Math.max(0, (st.opening ? dx : w + dx) / w));
    const now = performance.now();
    st.vx = (e.clientX - st.lastX) / Math.max(1, now - st.lastT);
    st.lastX = e.clientX;
    st.lastT = now;
    st.p = p;
    applyPanelProgress(p, false);
  };
  const onHEnd = () => {
    const st = hDragRef.current;
    hDragRef.current = null;
    if (!st?.locked) return;
    // The finger moved — the release must not also count as a tap on
    // whatever row it happens to land on.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 200);
    const target = Math.abs(st.vx) > 0.35 ? st.vx > 0 : st.p > 0.5;
    applyPanelProgress(target ? 1 : 0, true);
    setPanelOpen(target);
    window.setTimeout(clearPanelDragStyles, 340);
  };
  const guardClick = (e: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // iOS keyboard hangover: focusing the composer can scroll the whole PWA up
  // to keep the input visible, and after the keyboard closes the window stays
  // scrolled — fixed elements ride along and a white band shows under the
  // sheet. Snap the window back whenever the keyboard leaves or focus drops.
  useEffect(() => {
    if (!open) return;
    const snapBack = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const doc = document.documentElement;
      if (doc.scrollTop !== 0) doc.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    };
    const vv = window.visualViewport;
    const onVvResize = () => {
      // Act only once the keyboard is (mostly) gone — never fight it open
      if (!vv || vv.height >= window.innerHeight * 0.8) snapBack();
    };
    vv?.addEventListener("resize", onVvResize);
    window.addEventListener("focusout", snapBack);
    return () => {
      vv?.removeEventListener("resize", onVvResize);
      window.removeEventListener("focusout", snapBack);
    };
  }, [open]);

  // Freeze the app behind the sheet — otherwise scroll gestures inside Gibbs
  // chain through and drag the page underneath (iOS PWAs especially).
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const y = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const html = document.documentElement;
    const prevOverscroll = { html: html.style.overscrollBehavior, body: body.style.overscrollBehavior };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    // Kill the document-level rubber band so swiping past the sheet's edges
    // can't bounce the whole view and flash the page behind it.
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overscrollBehavior = prevOverscroll.html;
      body.style.overscrollBehavior = prevOverscroll.body;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, [open]);

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
    enabled: open && panelOpen,
  });

  const { data: spaces = [] } = useQuery<AiSpace[]>({
    queryKey: ["/api/crm/ai/spaces"],
    queryFn: async () => {
      const res = await fetch("/api/crm/ai/spaces", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && panelOpen,
  });

  const addSpace = () => {
    const nameVal = newSpaceName.trim();
    setNewSpaceName("");
    setNewSpaceOpen(false);
    if (!nameVal) return;
    createAiSpace(nameVal).then((created) => {
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

  const startNewChat = () => {
    setMessages([]);
    setInput("");
    setConversationId(null);
    setFreshIndex(null);
    setPanelOpen(false);
  };

  const openConversationFromPanel = (id: string) => {
    setFreshIndex(null);
    fetchAiConversation(id).then((loaded) => {
      if (loaded) {
        setConversationId(loaded.id);
        setMessages(loaded.messages);
        setPanelOpen(false);
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
    // Where the answer will land — that message, and only it, animates in.
    const assistantIndex = messages.length + 1;
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
        const data = await r.json();
        if (data.conversationId) setConversationId(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
        setFreshIndex(messagesLenRef.current);
        // Hold approval cards until the answer finishes typing. The reveal is
        // guaranteed by a timer sized to the typewriter's duration — the
        // animation's onComplete also fires it, but must never be the only
        // path (a missed callback would strand the cards forever).
        const answerText = String(data.answer ?? "").trim();
        setTypedOut(!answerText);
        if (answerText) {
          const steps = Math.ceil(answerText.length / Math.max(2, Math.ceil(answerText.length / 150)));
          window.setTimeout(() => setTypedOut(true), steps * 16 + 400);
        }
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

  const visibleConversations = activeSpace
    ? pastConversations.filter((c) => c.spaceId === activeSpace)
    : pastConversations;
  const groupedConversations = groupAiConversations(visibleConversations);

  return (
    <div className="fixed inset-0 z-[70]" data-testid="assistant-overlay">
      {/* Backdrop — tap to dismiss; touch-action none so swipes here can't
          scroll the app behind the sheet. Bleeds past the viewport so an iOS
          rubber-band bounce never exposes bare page behind it. */}
      <div className="absolute inset-x-0 -bottom-40 -top-40 bg-black/50 backdrop-blur-[2px]" style={{ touchAction: "none" }} onClick={onClose} />
      {/* Bleed guard — a bounce lifts the whole view, including fixed
          elements; this dark strip sits just below the viewport so what
          slides up from under the sheet is sheet-colored, never white. */}
      <div className="absolute inset-x-0 -bottom-40 h-40 bg-slate-950" aria-hidden="true" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl bg-slate-950 shadow-[0_-12px_48px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom duration-300"
        style={{ top: "calc(44px + env(safe-area-inset-top))" }}
      >
        {/* Chat page — drifts right (about a third of the panel width) as
            the panel slides in ON TOP of it, so the panel overlaps the chat
            without pushing it off screen. Swipe right anywhere here to pull
            the panel in. */}
        <div
          ref={mainRef}
          className={cn(
            "relative flex min-h-0 flex-1 flex-col transition-transform duration-300 ease-out",
            panelOpen ? "translate-x-[min(28.6%,113px)]" : "translate-x-0",
          )}
          style={{ touchAction: "pan-y" }}
          onPointerDown={(e) => onHStart(e, true)}
          onPointerMove={onHMove}
          onPointerUp={onHEnd}
          onPointerCancel={onHEnd}
          onClickCapture={guardClick}
        >
        {/* Drag handle — swipe down anywhere on the handle/header to dismiss */}
        <div
          className="flex shrink-0 justify-center pt-2"
          style={{ touchAction: "none" }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          data-vdrag=""
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
          data-vdrag=""
        >
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setPanelOpen(true)}
              className="flex h-8 w-8 items-center justify-center text-slate-400 transition-colors active:text-slate-200"
              aria-label="History and spaces"
              data-testid="assistant-panel-open"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">GHQ Intelligence</p>
              <h1 className="text-sm font-semibold leading-tight text-slate-100">Gibbs</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                onClick={startNewChat}
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

        {/* Conversation — overflow-x-hidden is load-bearing: overflow-y-auto
            alone lets one long unbroken string (a URL, an address) widen the
            pane and drag the whole chat sideways off screen */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4">
          {messages.length === 0 && !pending ? (
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
            <div className="mx-auto w-full max-w-2xl space-y-4 pb-2">
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
                          <div className="break-words rounded-[4px] rounded-br-[1px] bg-[#711419] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                // Everything under the fresh answer holds until it's done
                // typing; older messages render their cards instantly.
                const revealed = freshIndex === null || i < freshIndex || typedOut;
                return (
                  <div key={i} className="space-y-2">
                    {msg.content.trim() !== "" && (
                      <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-[4px] rounded-tl-[1px] border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm leading-relaxed text-slate-200">
                        <TypewriterText
                          text={stripMarkdown(msg.content)}
                          animate={i === freshIndex}
                          onProgress={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                          onComplete={
                            i === freshIndex
                              ? () => {
                                  setTypedOut(true);
                                  requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
                                }
                              : undefined
                          }
                        />
                      </div>
                    )}
                    {revealed && msg.proposedAction && msg.actionState !== "dismissed" && (
                      <div className="max-w-[92%] animate-in fade-in slide-in-from-bottom-2 break-words rounded-[4px] border border-[#711419]/50 bg-[#711419]/10 p-3 duration-300" data-testid={`assistant-action-card-${i}`}>
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
                          <div className="mt-2.5 animate-in fade-in slide-in-from-bottom-1 space-y-2 duration-300">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Done
                            </p>
                            <button
                              onClick={() => { onClose(); navigate(msg.actionResult!.url); }}
                              className="flex w-full items-center justify-between gap-2 rounded-[4px] border border-slate-700 bg-slate-900 px-3 py-2.5 text-left transition-all active:scale-[0.98] active:border-[#711419]"
                              data-testid={`assistant-action-open-${i}`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-100">{msg.actionResult.label}</span>
                                <span className="block text-[11px] text-slate-500">Tap to see what Gibbs set up</span>
                              </span>
                              <ArrowUpRight className="h-4 w-4 shrink-0 text-[#e8b4b8]" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {revealed && msg.relatedTopics && msg.relatedTopics.length > 0 && i === messages.length - 1 && !pending && (
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
          {/* Same centered column as the thread so the bar lines up with the
              messages on wide screens */}
          <div className="mx-auto w-full max-w-2xl">
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
          {/* One unified strip — photos, typing, voice, and send all live in
              a single bar, same as the desktop composer */}
          <div className="flex items-end gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1.5">
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-all active:scale-95 active:text-slate-200 disabled:opacity-40"
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
              className="max-h-32 min-h-[36px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-[6px] text-[16px] leading-6 text-slate-100 placeholder:text-slate-600 focus:outline-none"
              data-testid="assistant-input"
            />
            {supportsVoice && (
              <button
                onClick={listening ? stopVoice : startVoice}
                disabled={transcribing}
                className={cn(
                  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all active:scale-95",
                  listening ? "bg-[#711419] text-white" : "text-slate-400 active:text-slate-200",
                )}
                aria-label={listening ? "Stop listening" : "Speak to the assistant"}
                data-testid="assistant-mic"
              >
                {listening && <span className="absolute inset-0 animate-ping rounded-lg border border-[#711419]" />}
                {transcribing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={() => sendQuestion(input)}
              disabled={(input.trim().length < 3 && attachments.length === 0) || pending}
              className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#711419] text-white transition-all duration-150 ease-out active:scale-90 disabled:opacity-30"
              aria-label="Send"
              data-testid="assistant-send"
            >
              {pending ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 transition-transform duration-200 ease-out group-active:-translate-y-0.5 group-active:translate-x-0.5" />
              )}
            </button>
          </div>
          </div>
        </div>
        </div>

        {/* Side panel — history + Spaces. A layer that slides in OVER the
            chat: swipe right on the chat to pull it in, swipe left (or tap
            the dimmed chat) to push it away. */}
        <div
          ref={scrimRef}
          className={cn(
            "absolute inset-0 z-20 bg-black/60 transition-opacity duration-300",
            panelOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          style={{ touchAction: "none" }}
          onClick={() => {
            if (suppressClickRef.current) return;
            setPanelOpen(false);
          }}
          onPointerDown={(e) => onHStart(e, false)}
          onPointerMove={onHMove}
          onPointerUp={onHEnd}
          onPointerCancel={onHEnd}
        />
        <aside
          ref={panelRef}
          className={cn(
            "absolute inset-y-0 left-0 z-30 flex w-[86%] max-w-[340px] flex-col border-r border-slate-800 bg-slate-950 shadow-[24px_0_56px_rgba(0,0,0,0.75)] transition-transform duration-300 ease-out",
            panelOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{ touchAction: "pan-y" }}
          onPointerDown={(e) => onHStart(e, false)}
          onPointerMove={onHMove}
          onPointerUp={onHEnd}
          onPointerCancel={onHEnd}
          onClickCapture={guardClick}
          data-testid="assistant-panel"
        >
          <div className="shrink-0 border-b border-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">GHQ Intelligence</p>
            <p className="text-sm font-semibold leading-tight text-slate-100">Gibbs</p>
          </div>

          {/* Spaces */}
          <div className="shrink-0 px-3 pt-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Spaces</p>
              <button
                onClick={() => setNewSpaceOpen((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-500 transition-colors active:text-[#e8b4b8]"
                aria-label="New space"
                data-testid="assistant-new-space"
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
                className="mb-1.5 w-full rounded-[4px] border border-[#711419]/60 bg-slate-900 px-2.5 py-2 text-[13px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
                data-testid="assistant-new-space-input"
              />
            )}
            <button
              onClick={() => setActiveSpace(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-[13px] transition-colors",
                activeSpace === null ? "bg-[#711419]/15 font-semibold text-[#e8b4b8]" : "font-medium text-slate-400 active:bg-slate-900",
              )}
              data-testid="assistant-space-all"
            >
              <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
              All chats
            </button>
            {spaces.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-1 rounded-[4px] px-2 transition-colors",
                  activeSpace === s.id ? "bg-[#711419]/15" : "",
                )}
              >
                <button
                  onClick={() => setActiveSpace(s.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-[13px]",
                    activeSpace === s.id ? "font-semibold text-[#e8b4b8]" : "font-medium text-slate-400",
                  )}
                  data-testid={`assistant-space-${s.id}`}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.name}</span>
                </button>
                <button
                  onClick={() => removeSpace(s.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-slate-600 transition-colors active:text-red-400"
                  aria-label="Delete space"
                  data-testid={`assistant-space-delete-${s.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mx-3 my-2 shrink-0 border-t border-slate-800" />

          {/* Chats */}
          <div className="mb-1 flex shrink-0 items-center justify-between px-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Chats</p>
            <button
              onClick={startNewChat}
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-500 transition-colors active:text-[#e8b4b8]"
              aria-label="New chat"
              data-testid="assistant-panel-new-chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
            {groupedConversations.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-600">
                {activeSpace
                  ? "No chats in this space yet — start one and it'll be filed here."
                  : "No conversations yet — ask something and it'll be saved here."}
              </p>
            ) : (
              groupedConversations.map((group) => (
                <div key={group.label} className="mb-2">
                  <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                    {group.label}
                  </p>
                  {group.items.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "flex items-center gap-1 rounded-[4px] px-2 py-1.5",
                        c.id === conversationId ? "bg-[#711419]/15" : "",
                      )}
                    >
                      <button
                        onClick={() => openConversationFromPanel(c.id)}
                        className="min-w-0 flex-1 text-left"
                        data-testid={`assistant-conversation-${c.id}`}
                      >
                        <p className={cn("truncate text-[13px]", c.id === conversationId ? "font-semibold text-[#e8b4b8]" : "font-medium text-slate-300")}>
                          {c.title || "Conversation"}
                        </p>
                        <p className="text-[11px] text-slate-600">{formatConversationWhen(c.updatedAt)}</p>
                      </button>
                      <button
                        onClick={() => removeConversation(c.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-slate-600 transition-colors active:text-red-400"
                        aria-label="Delete conversation"
                        data-testid={`assistant-conversation-delete-${c.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
