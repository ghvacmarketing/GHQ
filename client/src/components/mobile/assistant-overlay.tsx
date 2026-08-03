import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GibbsActionPreview, hasGibbsPreview } from "@/components/crm/gibbs-action-preview";
import { cn } from "@/lib/utils";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { useKeyboardInset } from "@/lib/native";
import { ArrowUp, ArrowUpRight, Check, CheckCircle2, ChevronRight, Folder, History, ImagePlus, Loader2, MessagesSquare, Mic, Plus, ShieldCheck, Sparkles, SquarePen, Trash2, Wrench, X } from "lucide-react";
import { TypewriterText } from "@/components/crm/typewriter-text";
import type { CrmUser } from "@shared/schema";
import badgeGibbs from "@/assets/badge-gibbs.png";
import {
  AI_ACTION_LABELS,
  AiStreamStartError,
  actionLineItems,
  type AiChatMessage as ChatMessage,
  type AiConversationSummary,
  type AiSpace,
  applyActionEdits,
  askGibbsStream,
  compressImageForAi,
  createAiSpace,
  customerUpdateRows,
  editableActionFields,
  deleteAiConversation,
  deleteAiSpace,
  dismissAiAction,
  fetchAiConversation,
  fetchLatestAiConversation,
  formatConversationWhen,
  groupAiConversations,
} from "@/lib/ai-conversations";

/** The mobile GHQ assistant — a light, Notion-AI-style popup that slides
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

/** Behavior modes for Gibbs, picked from the floating Gibbs button. The mode
 *  rides every /api/crm/help call; conversation-only is also hard-enforced
 *  server-side (no proposal tool, proposals stripped). */
type GibbsMode = "general" | "conversation" | "implementation";

const GIBBS_MODES: Array<{ value: GibbsMode; label: string; description: string; icon: typeof Sparkles }> = [
  {
    value: "general",
    label: "General",
    description: "The full Gibbs — talk through anything and set things up, all in one chat.",
    icon: Sparkles,
  },
  {
    value: "conversation",
    label: "Conversation only",
    description: "Just talk — questions, advice, shop talk. Gibbs won't prepare any actions.",
    icon: MessagesSquare,
  },
  {
    value: "implementation",
    label: "Implementation only",
    description: "All business — short answers focused on preparing actions for your approval.",
    icon: Wrench,
  },
];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");
}

export default function AssistantOverlay({
  open,
  onClose,
  copilot,
}: {
  open: boolean;
  onClose: () => void;
  /** Create-copilot: Gibbs is anchored to the create form the user is on —
   *  he sees the live draft and fills fields in place (fill_form actions). */
  copilot?: import("@/lib/ai-conversations").AiCreateCopilot;
}) {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  // Live answer text while the model streams — rendered in the pending slot
  // with the word-fade so Gibbs talks as he thinks; null = dots.
  const [streamText, setStreamText] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Gibbs behavior mode — survives restarts; picked from the floating icon.
  const [mode, setMode] = useState<GibbsMode>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("gibbs-mode") : null;
    return saved === "conversation" || saved === "implementation" ? saved : "general";
  });
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  // Drag-to-dismiss for the mode sheet — same feel as DraggableSheet: follow
  // the finger, commit past ~90px, spring back otherwise.
  const modeSheetRef = useRef<HTMLDivElement>(null);
  const modeDragY = useRef<number | null>(null);
  const onModeDragDown = (e: React.PointerEvent) => {
    modeDragY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (modeSheetRef.current) modeSheetRef.current.style.transition = "none";
  };
  const onModeDragMove = (e: React.PointerEvent) => {
    if (modeDragY.current == null) return;
    const dy = e.clientY - modeDragY.current;
    const el = modeSheetRef.current;
    if (el) el.style.transform = `translateY(${dy >= 0 ? dy : dy / 4}px)`;
  };
  const onModeDragEnd = (e: React.PointerEvent) => {
    if (modeDragY.current == null) return;
    const dy = e.clientY - modeDragY.current;
    modeDragY.current = null;
    const el = modeSheetRef.current;
    if (!el) return;
    if (dy > 90) {
      el.style.transition = "transform 0.2s ease-in";
      el.style.transform = "translateY(100%)";
      setTimeout(() => {
        setModeSheetOpen(false);
        el.style.transition = "";
        el.style.transform = "";
      }, 180);
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateY(0)";
      setTimeout(() => {
        if (el) el.style.transition = "";
      }, 260);
    }
  };
  const pickMode = (m: GibbsMode) => {
    setMode(m);
    try {
      localStorage.setItem("gibbs-mode", m);
    } catch {
      // private-mode storage failure — the mode still applies this session
    }
    setModeSheetOpen(false);
  };
  const [activeSpace, setActiveSpace] = useState<string | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  // Index of the just-arrived answer — the only message that types itself in.
  const [freshIndex, setFreshIndex] = useState<number | null>(null);
  // Approval cards and topic chips wait until the fresh answer finishes
  // typing — Gibbs shouldn't drop a card mid-sentence.
  const [typedOut, setTypedOut] = useState(true);
  // Inline edit of a pending approval card (fix a typo'd name/address/message
  // without re-asking Gibbs). draft holds only the touched fields.
  const [editing, setEditing] = useState<{ index: number; draft: Record<string, string> } | null>(null);
  const saveEdit = () => {
    const cur = editing;
    if (!cur) return;
    setMessages((prev) => prev.map((m, j) => (
      j === cur.index && m.proposedAction
        ? { ...m, proposedAction: { ...m.proposedAction, params: applyActionEdits(m.proposedAction.params, cur.draft) } }
        : m
    )));
    setEditing(null);
  };
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

  // Keyboard-aware layout: the on-screen keyboard shrinks the visual viewport
  // but not the layout viewport, so a bottom-anchored sheet ends up with its
  // composer (and the last messages) hidden behind the keys. Track how much of
  // the window the keyboard covers and lift the sheet's bottom by that much.
  const [kbInsetWeb, setKbInset] = useState(0);
  // Native shell: visualViewport never changes (Keyboard resize:"none"), so
  // the shared hook's keyboardWillShow signal is the only one that fires
  // there. Web PWAs use the burst-remeasured local value. Take whichever.
  const kbInsetNative = useKeyboardInset();
  const kbInset = Math.max(kbInsetWeb, kbInsetNative);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const vv = window.visualViewport;
      // Bottom edge of what's actually visible, in layout-viewport coords —
      // anything below it is under the keyboard.
      const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const covered = Math.max(0, window.innerHeight - visibleBottom);
      // Ignore sub-keyboard-size shifts (URL bar, rotation chrome).
      setKbInset(covered > 80 ? covered : 0);
    };
    measure();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    // iOS home-screen PWAs miss or lag the viewport events around the
    // keyboard's show/hide animation — after any focus change, re-measure a
    // few times across the animation window so the inset always lands.
    let timers: number[] = [];
    const burst = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [50, 150, 300, 500, 750, 1100].map((ms) => window.setTimeout(measure, ms));
    };
    window.addEventListener("focusin", burst);
    window.addEventListener("focusout", burst);
    return () => {
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("focusin", burst);
      window.removeEventListener("focusout", burst);
      timers.forEach((t) => window.clearTimeout(t));
      setKbInset(0);
    };
  }, [open]);

  // When the keyboard claims its space, keep the newest messages in view.
  useEffect(() => {
    if (kbInset > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [kbInset]);

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
  // Copilot opens FRESH instead: yesterday's chat under a "Helping with:
  // New customer" chip would be noise.
  useEffect(() => {
    if (!open || hydrated || copilot) return;
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
    setStreamText(null);
    const body = {
      question,
      conversationHistory: historyForApi,
      conversationId,
      images: photos.length > 0 ? photos : undefined,
      // A brand-new chat is filed into whichever space is selected
      spaceId: conversationId ? undefined : activeSpace ?? undefined,
      mode,
      // Copilot: ship the live form draft with every ask.
      createContext: copilot ? { kind: copilot.kind, fields: copilot.getDraft() } : undefined,
    };
    // Stream-first: the answer paints as the model generates it. If the
    // stream can't START, fall back to the plain endpoint (identical
    // payload). Failures AFTER deltas flowed never auto-resend — the server
    // may have completed and persisted the exchange.
    let streamedAcc = "";
    askGibbsStream(body, (t) => {
      streamedAcc += t;
      setStreamText(streamedAcc);
    })
      .catch((e) => {
        if (e instanceof AiStreamStartError) {
          return apiRequest("POST", "/api/crm/help", body).then(async (r) => await r.json());
        }
        throw e;
      })
      .then((data: any) => {
        const streamed = streamedAcc.length > 0;
        if (data.conversationId) setConversationId(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
        // Copilot: fill_form actions patch the form RIGHT NOW (the page
        // shows its own undo) and never render as cards.
        if (copilot) {
          const fillActs = (
            Array.isArray(data.proposedActions) && data.proposedActions.length
              ? data.proposedActions
              : data.proposedAction
                ? [data.proposedAction]
                : []
          ).filter((a: any) => a?.type === "fill_form");
          for (const fa of fillActs) {
            try {
              copilot.applyPatch((fa.params as Record<string, unknown>) || {});
            } catch {
              /* a bad patch must never break the chat */
            }
          }
          if (data.proposedAction?.type === "fill_form") data.proposedAction = null;
        }
        const answerText = String(data.answer ?? "").trim();
        if (streamed) {
          // The user already watched the answer stream in — append it settled
          // so nothing re-animates, and reveal cards/chips immediately.
          setFreshIndex(null);
          setTypedOut(true);
        } else {
          setFreshIndex(messagesLenRef.current);
          // Hold approval cards until the answer finishes typing. The reveal
          // is guaranteed by a timer sized to the word-reveal's duration —
          // the animation's onComplete also fires it, but must never be the
          // only path (a missed callback would strand the cards forever).
          setTypedOut(!answerText);
          if (answerText) {
            const words = answerText.split(/\s+/).length;
            const base = Math.min(64, Math.max(16, 2800 / Math.max(1, words)));
            window.setTimeout(() => setTypedOut(true), Math.min(12000, words * base + 800));
          }
        }
        // One spoken message can carry several creation requests — each extra
        // action renders as its own approval card.
        const extras = (Array.isArray(data.extraActions) ? data.extraActions : []).filter((e: any) => e.proposedAction);
        // Several actions in one reply run as an ordered batch — step 2 can't
        // be approved before step 1 completes (a work order or text for a
        // customer being created needs the customer to exist first).
        const totalActions = (data.proposedAction ? 1 : 0) + extras.length;
        const batchId = totalActions > 1 ? String(data.messageId || `batch-${assistantIndex}`) : null;
        const extraStepStart = data.proposedAction ? 2 : 1;
        // Cards this reply replaced collapse immediately — leaving them live
        // would let the user approve the same work order twice.
        const superseded = new Set<string>(Array.isArray(data.supersededMessageIds) ? data.supersededMessageIds : []);
        setMessages((prev) => [
          ...prev.map((m) =>
            m.messageId && superseded.has(m.messageId) && m.actionState !== "done" && m.actionState !== "dismissed"
              ? { ...m, actionState: "superseded" as const }
              : m,
          ),
          {
            role: "assistant",
            content: data.answer,
            relatedTopics: data.relatedTopics,
            proposedAction: data.proposedAction || null,
            actionState: data.proposedAction ? ("pending" as const) : undefined,
            messageId: data.messageId,
            actionBatch: batchId && data.proposedAction ? { id: batchId, step: 1, total: totalActions } : null,
          },
          ...extras.map((e: any, k: number) => ({
            role: "assistant" as const,
            content: "",
            proposedAction: e.proposedAction || null,
            actionState: "pending" as const,
            messageId: e.messageId,
            actionBatch: batchId ? { id: batchId, step: extraStepStart + k, total: totalActions } : null,
          })),
        ]);
      })
      .catch((e: any) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: e?.message || "Something went wrong reaching the AI. Try again in a moment." },
        ]);
      })
      .finally(() => {
        setPending(false);
        setStreamText(null);
      });
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
        // Customer creates/edits must show up instantly in lists, detail
        // pages, and search — their keys come in several shapes, so match by
        // substring instead of prefix.
        queryClient.invalidateQueries({
          predicate: (q) => {
            const key = JSON.stringify(q.queryKey);
            return key.includes("/api/crm/customers") || key.includes("/api/mobile/customers") || key.includes("/api/crm/ghq/search");
          },
        });
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
  const pickCandidate = (index: number, cand: { id: string; name: string; phone?: string | null; email?: string | null }) => {
    const msg = messages[index];
    const param = msg?.actionCandidateParam || "customerId";
    const isSend = msg?.proposedAction?.type === "send_sms" || msg?.proposedAction?.type === "send_email";
    if (isSend && param === "customerId") {
      setMessages((prev) => prev.map((m, j) => (
        j === index
          ? {
              ...m,
              proposedAction: m.proposedAction
                ? {
                    ...m.proposedAction,
                    params: {
                      ...m.proposedAction.params,
                      customerId: cand.id,
                      customerName: cand.name,
                      // Show the picked recipient's actual destination on the card
                      ...(m.proposedAction.type === "send_email" ? { customerEmail: cand.email ?? undefined } : {}),
                      ...(m.proposedAction.type === "send_sms" ? { customerPhone: cand.phone ?? undefined } : {}),
                    },
                  }
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
          elements; this strip sits just below the viewport so what slides up
          from under the sheet is sheet-colored, never a bare page. */}
      <div className="absolute inset-x-0 -bottom-40 h-40 bg-white" aria-hidden="true" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.28)] animate-in slide-in-from-bottom duration-300"
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
          className="flex shrink-0 justify-center pb-2 pt-2"
          style={{ touchAction: "none" }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          data-vdrag=""
          data-testid="assistant-drag-handle"
        >
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>
        {/* Floating corner controls — glassy, no header strip, so the chat
            runs all the way to the top and just blurs underneath them.
            History left, Gibbs (mode) center, new chat right. */}
        <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex items-center justify-between px-3">
          <button
            onClick={() => setPanelOpen(true)}
            className="liquid-glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors active:bg-white/80"
            aria-label="History and spaces"
            data-testid="assistant-panel-open"
          >
            <History className="h-6 w-6" />
          </button>
          <button
            onClick={() => setModeSheetOpen(true)}
            className="pointer-events-auto rounded-full shadow-md transition-transform active:scale-95"
            aria-label="Gibbs mode"
            data-testid="assistant-mode-open"
          >
            <img src={badgeGibbs} alt="" className="h-11 w-11 select-none" draggable={false} />
          </button>
          <button
            onClick={startNewChat}
            className="liquid-glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors active:bg-white/80"
            aria-label="New conversation"
            data-testid="assistant-new-conversation"
          >
            <SquarePen className="h-6 w-6" />
          </button>
        </div>
        {/* Copilot anchor chip — Gibbs is working THIS form */}
        {copilot && (
          <div className="pointer-events-none absolute inset-x-0 top-[72px] z-10 flex justify-center">
            <span className="rounded-full bg-[#711419]/10 px-3 py-1 text-[11px] font-semibold text-[#711419]" data-testid="assistant-copilot-chip">
              Helping with: {copilot.label}
            </span>
          </div>
        )}

        {/* Conversation — overflow-x-hidden is load-bearing: overflow-y-auto
            alone lets one long unbroken string (a URL, an address) widen the
            pane and drag the whole chat sideways off screen */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-16">
          {messages.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center pt-[7vh] text-center">
              {/* Persona block — the badge already sits in the header, so the
                  empty state is just the name */}
              <button
                onClick={() => setPanelOpen(true)}
                className="text-lg font-semibold tracking-tight text-slate-900 transition-opacity active:opacity-60"
                aria-label="Gibbs — history and spaces"
                data-testid="assistant-persona-pill"
              >
                Gibbs
              </button>
              <p className="mt-3 max-w-[260px] text-sm text-slate-500">
                {firstName ? `What can I get done, ${firstName}?` : "What can I get done?"} Anything I set up waits for your approval.
              </p>
              <div className="mt-7 flex w-full max-w-sm flex-col gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendQuestion(s)}
                    className="rounded-[4px] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition-all active:scale-[0.98] active:border-[#711419]/50"
                    data-testid={`assistant-starter-${s.slice(0, 10)}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {supportsVoice && (
                <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-400">
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
                              <img key={j} src={src} alt="Attached photo" className="max-h-40 rounded-[4px] border border-slate-200 object-cover" />
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
                      <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-[4px] rounded-tl-[1px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-800">
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
                    {revealed && msg.proposedAction && msg.actionState === "superseded" && (
                      <p className="flex max-w-[92%] items-center gap-1.5 rounded-[4px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-400" data-testid={`assistant-action-superseded-${i}`}>
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate line-through">{AI_ACTION_LABELS[msg.proposedAction.type] || "Action"}: {msg.proposedAction.summary}</span>
                        <span className="shrink-0 font-semibold">Replaced below</span>
                      </p>
                    )}
                    {/* Dismissed proposals stay visible as a collapsed stub —
                        history should show what was declined, not hide it. */}
                    {revealed && msg.proposedAction && msg.actionState === "dismissed" && (
                      <p className="flex max-w-[92%] items-center gap-1.5 rounded-[4px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-400" data-testid={`assistant-action-dismissed-${i}`}>
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate line-through">{AI_ACTION_LABELS[msg.proposedAction.type] || "Action"}: {msg.proposedAction.summary}</span>
                        <span className="shrink-0 font-semibold">Dismissed</span>
                      </p>
                    )}
                    {revealed && msg.proposedAction && msg.actionState !== "dismissed" && msg.actionState !== "superseded" && (
                      <div className={`max-w-[92%] animate-in fade-in slide-in-from-bottom-2 break-words rounded-[4px] border border-[#711419]/30 bg-[#711419]/[0.05] p-3 duration-300 ${msg.actionBatch ? "relative ml-6" : ""}`} data-testid={`assistant-action-card-${i}`}>
                        {msg.actionBatch && (
                          <>
                            <span className={`absolute -left-6 top-3 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow transition-colors ${msg.actionState === "done" ? "bg-[#711419] text-white" : "border-2 border-[#711419] bg-white text-[#711419]"}`}>
                              {msg.actionState === "done" ? <Check className="h-3 w-3" /> : msg.actionBatch.step}
                            </span>
                            {msg.actionBatch.step < msg.actionBatch.total && (
                              <span className={`absolute -left-[14px] top-9 bottom-[-12px] w-0.5 rounded transition-colors ${msg.actionState === "done" ? "bg-[#711419]/60" : "bg-[#711419]/25"}`} />
                            )}
                          </>
                        )}
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#711419]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {AI_ACTION_LABELS[msg.proposedAction.type] || "Action"} —{" "}
                          {msg.actionState === "done" ? "approved & ran" : msg.actionState === "executing" ? "running" : "needs your approval"}
                        </p>
                        <p className="mt-1.5 text-sm text-slate-800">{msg.proposedAction.summary}</p>
                        {editing?.index !== i && <GibbsActionPreview action={msg.proposedAction} />}
                        {editing?.index !== i && !hasGibbsPreview(msg.proposedAction) && <div className="mt-1.5 space-y-0.5">
                          {msg.proposedAction.type === "update_customer"
                            ? customerUpdateRows(msg.proposedAction.params).map((row) => (
                                <p key={row.label} className="text-xs text-slate-500">
                                  <span className="font-semibold capitalize text-slate-700">{row.label}:</span>{" "}
                                  {row.changed ? (
                                    <>
                                      <span className="line-through opacity-60">{row.before ?? "—"}</span>
                                      <span className="mx-1 text-[#711419]">→</span>
                                      <span className="font-semibold text-slate-800">{row.after ?? "—"}</span>
                                    </>
                                  ) : (
                                    <span>{row.before ?? "—"}</span>
                                  )}
                                </p>
                              ))
                            : Object.entries(msg.proposedAction.params).filter(([k]) => k !== "customerId" && k !== "lineItems").map(([k, v]) => (
                                <p key={k} className="text-xs text-slate-500">
                                  <span className="font-semibold capitalize text-slate-700">{k.replace(/([A-Z])/g, " $1").toLowerCase()}:</span>{" "}
                                  {String(v)}
                                </p>
                              ))}
                          {(() => {
                            const li = actionLineItems(msg.proposedAction.params);
                            return li && (
                              <div className="mt-1.5 overflow-hidden rounded-[3px] border border-slate-300/70">
                                {li.rows.map((r, n) => (
                                  <p key={n} className="flex justify-between gap-2 border-b border-slate-200 px-2 py-1 text-xs text-slate-700 last:border-0">
                                    <span className="min-w-0 truncate">{r.quantity} × {r.description}</span>
                                    <span className="shrink-0 tabular-nums">${r.lineTotal.toFixed(2)}</span>
                                  </p>
                                ))}
                                <p className="flex justify-between gap-2 bg-[#711419]/10 px-2 py-1 text-xs font-bold text-[#711419]">
                                  <span>Total</span>
                                  <span className="tabular-nums">${li.total.toFixed(2)}</span>
                                </p>
                              </div>
                            );
                          })()}
                        </div>}
                        {editing?.index === i && msg.proposedAction && (
                          <div className="mt-2 space-y-2">
                            {editableActionFields(msg.proposedAction.params).map((f) => (
                              <label key={f.path} className="block">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{f.label}</span>
                                {f.multiline ? (
                                  <textarea
                                    rows={3}
                                    value={editing.draft[f.path] ?? f.value}
                                    onChange={(e) => setEditing((prev) => prev && { ...prev, draft: { ...prev.draft, [f.path]: e.target.value } })}
                                    className="mt-0.5 w-full resize-none rounded-[3px] border border-slate-300 bg-white px-2.5 py-2 text-[16px] leading-5 text-slate-900 focus:border-[#711419] focus:outline-none"
                                  />
                                ) : (
                                  <input
                                    value={editing.draft[f.path] ?? f.value}
                                    onChange={(e) => setEditing((prev) => prev && { ...prev, draft: { ...prev.draft, [f.path]: e.target.value } })}
                                    className="mt-0.5 w-full rounded-[3px] border border-slate-300 bg-white px-2.5 py-2 text-[16px] leading-5 text-slate-900 focus:border-[#711419] focus:outline-none"
                                  />
                                )}
                              </label>
                            ))}
                            <div className="flex gap-2 pt-0.5">
                              <button
                                onClick={saveEdit}
                                className="rounded-[3px] bg-[#711419] px-3.5 py-2 text-xs font-semibold text-white transition-transform active:scale-95"
                                data-testid={`assistant-action-save-edit-${i}`}
                              >
                                Save changes
                              </button>
                              <button
                                onClick={() => setEditing(null)}
                                className="rounded-[3px] border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-transform active:scale-95"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {(msg.actionState === "pending" || msg.actionState === "error") && editing?.index !== i && (() => {
                          // A later step of a batch stays locked until every
                          // earlier step is done or dismissed.
                          const waitingOn = msg.actionBatch
                            ? messages.find((m) => m.actionBatch?.id === msg.actionBatch!.id && (m.actionBatch?.step ?? 0) < msg.actionBatch!.step && m.actionState !== "done" && m.actionState !== "dismissed" && m.actionState !== "superseded")
                            : undefined;
                          return (
                            <>
                              {msg.actionState === "error" && (
                                <p className="mt-2 text-xs font-medium text-red-600">{msg.actionError}</p>
                              )}
                              <div className="mt-2.5 flex flex-wrap gap-2">
                                <button
                                  onClick={() => runProposedAction(i)}
                                  disabled={!!waitingOn}
                                  className="rounded-[3px] bg-[#711419] px-3.5 py-2 text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-40"
                                  data-testid={`assistant-action-approve-${i}`}
                                >
                                  {msg.actionState === "error" ? "Try again" : "Approve & run"}
                                </button>
                                <button
                                  onClick={() => setEditing({ index: i, draft: {} })}
                                  className="rounded-[3px] border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-transform active:scale-95"
                                  data-testid={`assistant-action-edit-${i}`}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => dismissProposedAction(i)}
                                  className="rounded-[3px] border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-transform active:scale-95"
                                  data-testid={`assistant-action-dismiss-${i}`}
                                >
                                  Dismiss
                                </button>
                              </div>
                              {waitingOn && (
                                <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                                  Locked — approve step {msg.actionBatch!.step - 1} first; this step needs it done before it can run.
                                </p>
                              )}
                            </>
                          );
                        })()}
                        {msg.actionState === "choose" && msg.actionCandidates && (
                          <div className="mt-2.5 space-y-1.5">
                            <p className="text-xs font-medium text-slate-700">{msg.actionError}</p>
                            {msg.actionCandidates.map((cand) => {
                              // For sends, show where it would actually go
                              const contact = msg.proposedAction?.type === "send_email"
                                ? cand.email || "no email on file"
                                : msg.proposedAction?.type === "send_sms"
                                  ? cand.phone || "no phone on file"
                                  : null;
                              return (
                                <button
                                  key={cand.id}
                                  onClick={() => pickCandidate(i, cand)}
                                  className="block w-full rounded-[3px] border border-slate-300 bg-white px-3 py-2 text-left transition-all active:scale-[0.98] active:border-[#711419]"
                                  data-testid={`assistant-candidate-${cand.id}`}
                                >
                                  <span className="block text-sm font-medium text-slate-800">{cand.name}</span>
                                  {contact !== null && (
                                    <span className="block text-xs text-slate-500">{contact}</span>
                                  )}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => dismissProposedAction(i)}
                              className="mt-1 text-xs font-semibold text-slate-500"
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
                          <div className="mt-2.5 animate-in fade-in slide-in-from-bottom-1 space-y-2 duration-300">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Done
                            </p>
                            <button
                              onClick={() => { onClose(); navigate(msg.actionResult!.url); }}
                              className="flex w-full items-center justify-between gap-2 rounded-[4px] border border-slate-300 bg-white px-3 py-2.5 text-left transition-all active:scale-[0.98] active:border-[#711419]"
                              data-testid={`assistant-action-open-${i}`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900">{msg.actionResult.label}</span>
                                <span className="block text-[11px] text-slate-500">Tap to see what Gibbs set up</span>
                              </span>
                              <ArrowUpRight className="h-4 w-4 shrink-0 text-[#711419]" />
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
                            className="rounded-[3px] border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors active:border-[#711419]/60 active:text-slate-900"
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
                streamText ? (
                  /* Live stream: the answer paints word by word while the
                     model is still generating. Same bubble classes as the
                     settled message so the swap on completion is seamless. */
                  <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-[4px] rounded-tl-[1px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-800">
                    <TypewriterText
                      text={stripMarkdown(streamText)}
                      animate
                      streaming
                      onProgress={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                    />
                  </div>
                ) : (
                  <div className="flex max-w-[92%] items-center gap-1.5 rounded-[4px] rounded-tl-[1px] border border-slate-200 bg-slate-50 px-3.5 py-3.5">
                    <span className="h-[5px] w-[5px] animate-pulse rounded-[1px] bg-[#711419]/70 [animation-delay:0ms]" />
                    <span className="h-[5px] w-[5px] animate-pulse rounded-[1px] bg-[#711419]/70 [animation-delay:200ms]" />
                    <span className="h-[5px] w-[5px] animate-pulse rounded-[1px] bg-[#711419]/70 [animation-delay:400ms]" />
                  </div>
                )
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Composer — Notion-style docked card: borderless textarea on top,
            controls row underneath */}
        <div
          className="shrink-0 px-3 pt-1.5"
          style={{ paddingBottom: kbInset > 0 ? "10px" : "calc(10px + env(safe-area-inset-bottom))" }}
        >
          {/* Same centered column as the thread so the bar lines up with the
              messages on wide screens */}
          <div className="mx-auto w-full max-w-2xl">
          {listening && (
            <p className="mb-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#711419]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#711419] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#711419]" />
              </span>
              Listening — tap the mic again when you're done
            </p>
          )}
          {transcribing && (
            <p className="mb-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#711419]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Got it — writing that down...
            </p>
          )}
          <div className="rounded-2xl border border-slate-300/70 bg-white p-3 shadow-sm">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt="" className="h-14 w-14 rounded-[4px] border border-slate-300 object-cover" />
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-white"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              placeholder={
                listening
                  ? "Listening..."
                  : transcribing
                    ? "Transcribing..."
                    : copilot
                      ? "Tell me the details — I'll fill the form…"
                      : "Ask Gibbs anything…"
              }
              className="max-h-32 min-h-[28px] w-full resize-none overflow-y-auto bg-transparent text-[16px] leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:outline-none focus-visible:ring-0"
              data-testid="assistant-input"
            />
            <div className="mt-1.5 flex items-center gap-0.5">
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-all active:scale-95 active:bg-slate-100 disabled:opacity-40"
                aria-label="Attach photos"
                data-testid="assistant-attach"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              {supportsVoice && (
                <button
                  onClick={listening ? stopVoice : startVoice}
                  disabled={transcribing}
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
                    listening ? "bg-[#711419] text-white" : "text-slate-500 active:bg-slate-100",
                  )}
                  aria-label={listening ? "Stop listening" : "Speak to the assistant"}
                  data-testid="assistant-mic"
                >
                  {listening && <span className="absolute inset-0 animate-ping rounded-full border border-[#711419]" />}
                  {transcribing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => sendQuestion(input)}
                disabled={(input.trim().length < 3 && attachments.length === 0) || pending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#711419] text-white transition-all duration-150 ease-out active:scale-90 disabled:bg-slate-200 disabled:text-slate-400"
                aria-label="Send"
                data-testid="assistant-send"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          </div>
        </div>

        {/* Keyboard spacer — the sheet keeps its full height (its white
            background fills the screen, never the page behind); this strip
            grows to the keyboard's height so the composer and thread glide up
            above the keys with an ease that tracks iOS's keyboard animation.
            A dedicated element, because the drag gestures overwrite inline
            transitions on the sheet and chat containers. */}
        <div
          aria-hidden="true"
          className="shrink-0"
          style={{ height: kbInset, transition: "height 0.32s cubic-bezier(0.32, 0.72, 0, 1)" }}
        />
        </div>

        {/* Side panel — history + Spaces. A layer that slides in OVER the
            chat: swipe right on the chat to pull it in, swipe left (or tap
            the dimmed chat) to push it away. */}
        <div
          ref={scrimRef}
          className={cn(
            "absolute inset-0 z-20 bg-black/30 transition-opacity duration-300",
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
            "absolute inset-y-0 left-0 z-30 flex w-[86%] max-w-[340px] flex-col border-r border-slate-200 bg-white shadow-[24px_0_56px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out",
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
          <div className="shrink-0 border-b border-slate-200 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">GHQ Intelligence</p>
            <p className="text-sm font-semibold leading-tight text-slate-900">Gibbs</p>
          </div>

          {/* Spaces */}
          <div className="shrink-0 px-3 pt-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Spaces</p>
              <button
                onClick={() => setNewSpaceOpen((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-400 transition-colors active:text-[#711419]"
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
                className="mb-1.5 w-full rounded-[4px] border border-[#711419]/50 bg-white px-2.5 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
                data-testid="assistant-new-space-input"
              />
            )}
            <button
              onClick={() => setActiveSpace(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-[13px] transition-colors",
                activeSpace === null ? "bg-[#711419]/10 font-semibold text-[#711419]" : "font-medium text-slate-600 active:bg-slate-100",
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
                  activeSpace === s.id ? "bg-[#711419]/10" : "",
                )}
              >
                <button
                  onClick={() => setActiveSpace(s.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-[13px]",
                    activeSpace === s.id ? "font-semibold text-[#711419]" : "font-medium text-slate-600",
                  )}
                  data-testid={`assistant-space-${s.id}`}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.name}</span>
                </button>
                <button
                  onClick={() => removeSpace(s.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-slate-400 transition-colors active:text-red-500"
                  aria-label="Delete space"
                  data-testid={`assistant-space-delete-${s.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mx-3 my-2 shrink-0 border-t border-slate-200" />

          {/* Chats */}
          <div className="mb-1 flex shrink-0 items-center justify-between px-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Chats</p>
            <button
              onClick={startNewChat}
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-400 transition-colors active:text-[#711419]"
              aria-label="New chat"
              data-testid="assistant-panel-new-chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
            {groupedConversations.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                {activeSpace
                  ? "No chats in this space yet — start one and it'll be filed here."
                  : "No conversations yet — ask something and it'll be saved here."}
              </p>
            ) : (
              groupedConversations.map((group) => (
                <div key={group.label} className="mb-2">
                  <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {group.label}
                  </p>
                  {group.items.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "flex items-center gap-1 rounded-[4px] px-2 py-1.5",
                        c.id === conversationId ? "bg-[#711419]/10" : "",
                      )}
                    >
                      <button
                        onClick={() => openConversationFromPanel(c.id)}
                        className="min-w-0 flex-1 text-left"
                        data-testid={`assistant-conversation-${c.id}`}
                      >
                        <p className={cn("truncate text-[13px]", c.id === conversationId ? "font-semibold text-[#711419]" : "font-medium text-slate-700")}>
                          {c.title || "Conversation"}
                        </p>
                        <p className="text-[11px] text-slate-400">{formatConversationWhen(c.updatedAt)}</p>
                      </button>
                      <button
                        onClick={() => removeConversation(c.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-slate-400 transition-colors active:text-red-500"
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

        {/* Mode sheet — pops over everything from the floating Gibbs icon.
            Sets how Gibbs behaves; the pick persists across sessions. */}
        {modeSheetOpen && (
          <div className="absolute inset-0 z-40" data-testid="assistant-mode-sheet">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModeSheetOpen(false)} />
            <div
              ref={modeSheetRef}
              className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-4 shadow-[0_-12px_48px_rgba(0,0,0,0.28)] animate-in slide-in-from-bottom duration-300"
              style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
            >
              <div
                className="-mx-4 cursor-grab touch-none px-4 pb-3 pt-3 active:cursor-grabbing"
                onPointerDown={onModeDragDown}
                onPointerMove={onModeDragMove}
                onPointerUp={onModeDragEnd}
                onPointerCancel={onModeDragEnd}
                data-testid="assistant-mode-drag-handle"
              >
                <div className="mx-auto h-1 w-10 rounded-full bg-slate-300" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Gibbs mode</p>
              <p className="mb-3 mt-0.5 text-sm font-semibold text-slate-900">How should Gibbs work right now?</p>
              <div className="space-y-2">
                {GIBBS_MODES.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => pickMode(m.value)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[4px] border p-3 text-left transition-all active:scale-[0.98]",
                        active ? "border-[#711419] bg-[#711419]/[0.05]" : "border-slate-200 bg-white",
                      )}
                      data-testid={`assistant-mode-${m.value}`}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          active ? "bg-[#711419] text-white" : "bg-slate-100 text-slate-600",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-semibold", active ? "text-[#711419]" : "text-slate-900")}>
                          {m.label}
                        </span>
                        <span className="block text-xs leading-snug text-slate-500">{m.description}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
