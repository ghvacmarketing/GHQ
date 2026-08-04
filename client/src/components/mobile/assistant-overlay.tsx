import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GibbsActionPreview, hasGibbsPreview } from "@/components/crm/gibbs-action-preview";
import { cn } from "@/lib/utils";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { useKeyboardInset } from "@/lib/native";
import { ArrowUp, ArrowUpRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Folder, History, ImagePlus, Loader2, MessagesSquare, Mic, Pencil, Plus, Search, ShieldCheck, Sparkles, SquarePen, Trash2, Wrench, X } from "lucide-react";
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
  moveAiConversation,
  renameAiConversation,
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
  // History — a true bottom sheet stacked over the chat sheet
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  // Searching = focused OR typed: the top content folds away and the New
  // chat button morphs into an X while it's true.
  const [searchFocused, setSearchFocused] = useState(false);
  const histSearchInputRef = useRef<HTMLInputElement | null>(null);
  // Long-press context menu over the history sheet: rename / move / delete a
  // chat, or delete a space. The first view anchors directly under the held
  // row (iMessage-style); rename/move re-dock to the bottom card for the
  // keyboard's sake.
  const [chatMenu, setChatMenu] = useState<{
    convo: AiConversationSummary;
    view: "menu" | "rename" | "move";
    draft: string;
    anchor?: { top: number; bottom: number; left: number; width: number };
  } | null>(null);
  const [spaceMenu, setSpaceMenu] = useState<AiSpace | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  // Gibbs behavior mode — survives restarts; picked from the floating icon.
  const [mode, setMode] = useState<GibbsMode>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("gibbs-mode") : null;
    return saved === "conversation" || saved === "implementation" ? saved : "general";
  });
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  // Drag-to-dismiss for the mode sheet — same feel as DraggableSheet: follow
  // the finger, commit past ~90px, spring back otherwise.
  const modeSheetRef = useRef<HTMLDivElement>(null);
  const modeScrimRef = useRef<HTMLDivElement>(null);
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
    if (el) {
      el.style.transform = `translateY(${dy >= 0 ? dy : dy / 4}px)`;
      const s = modeScrimRef.current;
      if (s) {
        s.style.transition = "none";
        s.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / (el.clientHeight || window.innerHeight)));
      }
    }
  };
  const onModeDragEnd = (e: React.PointerEvent) => {
    if (modeDragY.current == null) return;
    const dy = e.clientY - modeDragY.current;
    modeDragY.current = null;
    const el = modeSheetRef.current;
    if (!el) return;
    const scrim = modeScrimRef.current;
    if (dy > 90) {
      if (scrim) {
        scrim.style.transition = "opacity 0.18s ease-in";
        scrim.style.opacity = "0";
      }
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
      if (scrim) {
        scrim.style.transition = "opacity 0.25s ease-out";
        scrim.style.opacity = "1";
      }
      setTimeout(() => {
        if (el) el.style.transition = "";
        if (scrim) {
          scrim.style.transition = "";
          scrim.style.opacity = "";
        }
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
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; dy: number; active: boolean } | null>(null);

  // Lighten the page gradually WITH the sheet's slide-down (the backdrop
  // otherwise pops away only when the component unmounts).
  const fadeBackdrop = () => {
    const b = backdropRef.current;
    if (b) {
      b.style.transition = "opacity 0.24s ease-in";
      b.style.opacity = "0";
    }
  };
  // Finger-tracked dimming: only the BLACK fades with drag progress — the
  // blur stays constant (backgroundColor, not element opacity).
  const trackBackdrop = (p: number) => {
    const b = backdropRef.current;
    if (b) {
      b.style.transition = "none";
      b.style.backgroundColor = `rgba(0,0,0,${(0.5 * Math.max(0, 1 - p)).toFixed(3)})`;
    }
  };
  const restoreBackdrop = () => {
    const b = backdropRef.current;
    if (!b) return;
    b.style.transition = "background-color 0.25s ease-out";
    b.style.backgroundColor = "rgba(0,0,0,0.5)";
    window.setTimeout(() => {
      b.style.transition = "";
      b.style.backgroundColor = "";
    }, 260);
  };

  // History sheet scrim — same finger-tracked dimming; inline styles are
  // always cleared on settle/close so the class-driven fade stays in charge.
  const histScrimRef = useRef<HTMLDivElement>(null);
  const trackHistScrim = (p: number) => {
    const s = histScrimRef.current;
    if (s) {
      s.style.transition = "none";
      s.style.opacity = String(Math.max(0, 1 - p));
    }
  };
  const restoreHistScrim = () => {
    const s = histScrimRef.current;
    if (!s) return;
    s.style.transition = "opacity 0.25s ease-out";
    s.style.opacity = "1";
    window.setTimeout(() => {
      s.style.transition = "";
      s.style.opacity = "";
    }, 260);
  };
  const fadeHistScrimOut = () => {
    const s = histScrimRef.current;
    if (s) {
      s.style.transition = "opacity 0.22s ease-in";
      s.style.opacity = "0";
    }
  };
  const clearHistScrim = () => {
    const s = histScrimRef.current;
    if (s) {
      s.style.transition = "";
      s.style.opacity = "";
    }
  };

  // The chat sheet sits shrunk (scale 0.96) beneath the history sheet —
  // dragging history down grows it back toward full size in step with the
  // finger, so the layer beneath visibly comes forward as the top one leaves.
  const trackChatScale = (p: number) => {
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `scale(${(0.93 + 0.07 * Math.min(1, Math.max(0, p))).toFixed(4)})`;
    }
  };
  const restoreChatScale = () => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)";
    el.style.transform = "scale(0.93)";
    window.setTimeout(() => {
      el.style.transition = "";
      el.style.transform = "";
    }, 260);
  };
  const releaseChatScale = () => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = "transform 0.22s ease-out";
    el.style.transform = "scale(1)";
    window.setTimeout(() => {
      el.style.transition = "";
      el.style.transform = "";
    }, 240);
  };

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
    trackBackdrop(st.dy / (el.clientHeight || window.innerHeight));
  };
  const onDragEnd = () => {
    const st = dragRef.current;
    const el = sheetRef.current;
    dragRef.current = null;
    if (!st || !el) return;
    if (st.dy > 110) {
      fadeBackdrop();
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
      restoreBackdrop();
      setTimeout(() => {
        if (el) el.style.transition = "";
      }, 260);
    }
  };

  // History sheet drag-to-dismiss — a true bottom sheet: the handle follows
  // the finger, commits past ~110px, springs back otherwise.
  const histSheetRef = useRef<HTMLDivElement>(null);
  const histScrollRef = useRef<HTMLDivElement>(null);
  const histDragY = useRef<number | null>(null);
  // Drag-dismiss leaves an inline translateY(100%) on the sheet — clearing
  // it at close raced the class flip and flashed the sheet at rest for one
  // frame. Clear it as the sheet OPENS instead, letting the class
  // transition drive the ride up.
  useEffect(() => {
    if (historyOpen) {
      const el = histSheetRef.current;
      if (el) {
        el.style.transition = "";
        el.style.transform = "";
      }
    }
  }, [historyOpen]);

  // Grab-anywhere dismiss: press ANYWHERE on the history sheet and move
  // clearly downward (steeper than sideways, list at its top) — the sheet
  // rides the finger immediately, no hold needed. Taps and scrolls are
  // untouched; a drag suppresses the click that follows it.
  const histAnyDrag = useRef<{ x: number; y: number; engaged: boolean; eligible: boolean; inScroller: boolean } | null>(null);
  const dragTapSuppress = useRef(false);
  const onHistAnyDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, [data-hist-handle]")) {
      histAnyDrag.current = null;
      return;
    }
    const sc = histScrollRef.current;
    const inScroller = !!sc && sc.contains(t);
    histAnyDrag.current = { x: e.clientX, y: e.clientY, engaged: false, eligible: !inScroller || (sc?.scrollTop ?? 0) <= 0, inScroller };
  };
  const onHistAnyMove = (e: React.PointerEvent) => {
    const st = histAnyDrag.current;
    const el = histSheetRef.current;
    if (!st || !el) return;
    if (pressRef.current?.fired) {
      // A long-press already opened the menu — the finger is theirs now
      histAnyDrag.current = null;
      return;
    }
    const dy = e.clientY - st.y;
    const dx = Math.abs(e.clientX - st.x);
    if (!st.engaged) {
      if (!st.eligible) {
        // Mid-gesture handoff — the list scrolls to its top, then the sheet
        // takes over from right here (fresh baseline, no jump)
        if (st.inScroller && dy > 0 && (histScrollRef.current?.scrollTop ?? 1) <= 0) {
          st.eligible = true;
          st.y = e.clientY;
          st.x = e.clientX;
        }
        return;
      }
      if (dy > 14 && dy > dx * 1.3) {
        st.engaged = true;
        el.style.transition = "none";
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } else if (dx > 16) {
        st.eligible = false;
        st.inScroller = false;
        return;
      } else if (dy < -10) {
        st.eligible = false;
        return;
      }
    }
    if (st.engaged) {
      const off = Math.max(0, dy);
      el.style.transform = `translateY(${off}px)`;
      const p = off / (el.clientHeight || window.innerHeight);
      trackHistScrim(p);
      trackChatScale(p);
    }
  };
  const onHistAnyEnd = (e: React.PointerEvent) => {
    const st = histAnyDrag.current;
    histAnyDrag.current = null;
    const el = histSheetRef.current;
    if (!st?.engaged || !el) return;
    dragTapSuppress.current = true;
    window.setTimeout(() => {
      dragTapSuppress.current = false;
    }, 250);
    const dy = e.clientY - st.y;
    if (dy > 110) {
      fadeHistScrimOut();
      releaseChatScale();
      el.style.transition = "transform 0.22s ease-in";
      el.style.transform = "translateY(100%)";
      setTimeout(() => {
        setHistoryOpen(false);
        clearHistScrim();
        // Inline transform stays (off-screen) — clearing it here raced the
        // class flip and flashed the sheet at rest; the open effect clears it
      }, 200);
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateY(0)";
      restoreHistScrim();
      restoreChatScale();
      setTimeout(() => {
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
        }
      }, 260);
    }
  };
  const onHistDragDown = (e: React.PointerEvent) => {
    histDragY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (histSheetRef.current) histSheetRef.current.style.transition = "none";
  };
  const onHistDragMove = (e: React.PointerEvent) => {
    if (histDragY.current == null) return;
    const dy = e.clientY - histDragY.current;
    const el = histSheetRef.current;
    if (el) {
      el.style.transform = `translateY(${dy >= 0 ? dy : dy / 4}px)`;
      const p = Math.max(0, dy) / (el.clientHeight || window.innerHeight);
      trackHistScrim(p);
      trackChatScale(p);
    }
  };
  const onHistDragEnd = (e: React.PointerEvent) => {
    if (histDragY.current == null) return;
    const dy = e.clientY - histDragY.current;
    histDragY.current = null;
    const el = histSheetRef.current;
    if (!el) return;
    if (dy > 110) {
      fadeHistScrimOut();
      releaseChatScale();
      el.style.transition = "transform 0.22s ease-in";
      el.style.transform = "translateY(100%)";
      setTimeout(() => {
        setHistoryOpen(false);
        clearHistScrim();
        // Inline transform stays (off-screen) — clearing it here raced the
        // class flip and flashed the sheet at rest; the open effect clears it
      }, 200);
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateY(0)";
      restoreHistScrim();
      restoreChatScale();
      setTimeout(() => {
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
        }
      }, 260);
    }
  };

  // Long-press (hold) on a chat row or space chip → context menu. Movement
  // cancels it so the list still scrolls; a fired hold suppresses the tap
  // that follows the release.
  const pressRef = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const startPress = (e: React.PointerEvent, fire: () => void) => {
    const x = e.clientX;
    const y = e.clientY;
    const timer = window.setTimeout(() => {
      if (pressRef.current) pressRef.current.fired = true;
      try {
        navigator.vibrate?.(10);
      } catch {
        /* no haptics — the menu opening is feedback enough */
      }
      fire();
    }, 420);
    pressRef.current = { timer, x, y, fired: false };
  };
  const movePress = (e: React.PointerEvent) => {
    const st = pressRef.current;
    if (!st || st.fired) return;
    if (Math.abs(e.clientX - st.x) > 10 || Math.abs(e.clientY - st.y) > 10) {
      window.clearTimeout(st.timer);
      pressRef.current = null;
    }
  };
  const endPress = () => {
    const st = pressRef.current;
    if (!st) return;
    window.clearTimeout(st.timer);
    if (st.fired) {
      // Keep the flag through the click that iOS fires on release
      window.setTimeout(() => {
        pressRef.current = null;
      }, 250);
    } else {
      pressRef.current = null;
    }
  };
  const pressFired = () => !!pressRef.current?.fired;

  // Grab-anywhere dismiss for the CHAT sheet — same rule as the history
  // sheet: press anywhere and move clearly downward (steeper than sideways,
  // any scroller under the finger at its top) and the sheet rides the finger
  // immediately. Inputs, the handle, and open layers are excluded; a drag
  // suppresses the click behind it.
  const chatAnyDrag = useRef<{ x: number; y: number; engaged: boolean; eligible: boolean; inScroller: boolean } | null>(null);
  const onChatAnyDown = (e: React.PointerEvent) => {
    if (historyOpen || modeSheetOpen) {
      chatAnyDrag.current = null;
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, [data-vdrag]")) {
      chatAnyDrag.current = null;
      return;
    }
    const sc = chatScrollRef.current;
    const inScroller = !!sc && sc.contains(t);
    chatAnyDrag.current = { x: e.clientX, y: e.clientY, engaged: false, eligible: !inScroller || (sc?.scrollTop ?? 0) <= 0, inScroller };
  };
  const onChatAnyMove = (e: React.PointerEvent) => {
    const st = chatAnyDrag.current;
    const el = sheetRef.current;
    if (!st || !el) return;
    const dy = e.clientY - st.y;
    const dx = Math.abs(e.clientX - st.x);
    if (!st.engaged) {
      if (!st.eligible) {
        // Mid-gesture handoff: dragging down on the thread scrolls it — the
        // moment it reaches its top, the SHEET takes over from right here
        // (fresh baseline so it doesn't jump by the scrolled distance).
        if (st.inScroller && dy > 0 && (chatScrollRef.current?.scrollTop ?? 1) <= 0) {
          st.eligible = true;
          st.y = e.clientY;
          st.x = e.clientX;
        }
        return;
      }
      if (dy > 14 && dy > dx * 1.3) {
        st.engaged = true;
        el.style.transition = "none";
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } else if (dx > 16) {
        // Clearly horizontal — never becomes a sheet drag (and no handoff)
        st.eligible = false;
        st.inScroller = false;
        return;
      } else if (dy < -10) {
        // Scrolling up — stand down, but keep the handoff alive in case the
        // finger reverses and pulls the thread past its top
        st.eligible = false;
        return;
      }
    }
    if (st.engaged) {
      const off = Math.max(0, dy);
      el.style.transform = `translateY(${off}px)`;
      trackBackdrop(off / (el.clientHeight || window.innerHeight));
    }
  };
  const onChatAnyEnd = (e: React.PointerEvent) => {
    const st = chatAnyDrag.current;
    chatAnyDrag.current = null;
    const el = sheetRef.current;
    if (!st?.engaged || !el) return;
    dragTapSuppress.current = true;
    window.setTimeout(() => {
      dragTapSuppress.current = false;
    }, 250);
    const dy = e.clientY - st.y;
    if (dy > 110) {
      fadeBackdrop();
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
      restoreBackdrop();
      setTimeout(() => {
        if (el) el.style.transition = "";
      }, 260);
    }
  };

  // Stick-to-bottom scrolling: auto-scroll only while the user is already at
  // (or near) the bottom. Scrolling up to reread never gets yanked back down
  // mid-stream; scrolling back near the bottom re-engages the follow.
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const onChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ behavior });
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

  // Keyboard rise AND fall: if the bottom of the chat is in view, the last
  // message stays PINNED right above the composer through the whole padding
  // transition — pinned every frame, both directions. On open that means
  // the thread glides up with the keys; on close it glides back down in
  // sync (without this, the shrinking padding clamped scrollTop instantly —
  // a jump — then the transition played out over a band of white space).
  // Reading earlier messages? Nothing moves either way.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = chatScrollRef.current;
    if (!el) return;
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      el.scrollTop = el.scrollHeight;
      if (t - start < 420) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
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
  // While the stored thread loads, skeleton bubbles hold the space so the
  // conversation doesn't pop in suddenly.
  const [hydrating, setHydrating] = useState(false);
  useEffect(() => {
    if (!open || hydrated || copilot) return;
    setHydrated(true);
    setHydrating(true);
    fetchLatestAiConversation()
      .then((latest) => {
        if (latest) {
          setConversationId(latest.id);
          setMessages((prev) => (prev.length === 0 ? latest.messages : prev));
        }
      })
      .finally(() => setHydrating(false));
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

  const { data: spaces = [] } = useQuery<AiSpace[]>({
    queryKey: ["/api/crm/ai/spaces"],
    queryFn: async () => {
      const res = await fetch("/api/crm/ai/spaces", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && historyOpen,
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
  };

  const openConversationFromPanel = (id: string) => {
    setHistoryOpen(false);
    setFreshIndex(null);
    stickRef.current = true;
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

  // ── Context-menu actions (long-press on a chat row) ──
  const refreshChatData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/ai/spaces"] });
  };
  const doRenameChat = () => {
    const m = chatMenu;
    const title = m?.draft.trim();
    if (!m || !title) return;
    setMenuBusy(true);
    renameAiConversation(m.convo.id, title).then(() => {
      refreshChatData();
      setMenuBusy(false);
      setChatMenu(null);
    });
  };
  const doMoveChat = (spaceId: string | null) => {
    const m = chatMenu;
    if (!m) return;
    setMenuBusy(true);
    moveAiConversation(m.convo.id, spaceId).then(() => {
      refreshChatData();
      setMenuBusy(false);
      setChatMenu(null);
    });
  };
  const doCreateSpaceAndMove = () => {
    const m = chatMenu;
    const name = m?.draft.trim();
    if (!m || !name) return;
    setMenuBusy(true);
    createAiSpace(name).then((created) => {
      if (!created) {
        setMenuBusy(false);
        return;
      }
      moveAiConversation(m.convo.id, created.id).then(() => {
        refreshChatData();
        setMenuBusy(false);
        setChatMenu(null);
        setActiveSpace(created.id);
      });
    });
  };
  const doDeleteChat = () => {
    const m = chatMenu;
    if (!m) return;
    removeConversation(m.convo.id);
    setChatMenu(null);
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
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Closing Gibbs also closes the stacked history sheet and any context
  // menus — reopening should always land on the chat.
  useEffect(() => {
    if (!open) {
      setHistoryOpen(false);
      setHistorySearch("");
      setSearchFocused(false);
      setChatMenu(null);
      setSpaceMenu(null);
      setNewSpaceOpen(false);
    }
  }, [open]);

  const sendQuestion = (raw: string) => {
    const photos = attachments;
    const question = raw.trim() || (photos.length > 0 ? "Take a look at this photo." : "");
    if (question.length < 3 || pending) return;
    const historyForApi = messages.map((m) => ({ role: m.role, content: m.content }));
    // Where the answer will land — that message, and only it, animates in.
    const assistantIndex = messages.length + 1;
    // Sending always re-engages follow-the-conversation scrolling.
    stickRef.current = true;
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

  const spaceFiltered = activeSpace ? pastConversations.filter((c) => c.spaceId === activeSpace) : pastConversations;
  const visibleConversations = historySearch.trim()
    ? spaceFiltered.filter((c) => (c.title || "Conversation").toLowerCase().includes(historySearch.trim().toLowerCase()))
    : spaceFiltered;
  const groupedConversations = groupAiConversations(visibleConversations);
  const spaceName = (id: string | null | undefined) => (id ? spaces.find((s) => s.id === id)?.name ?? null : null);
  const activeSpaceObj = activeSpace ? spaces.find((s) => s.id === activeSpace) ?? null : null;
  const spaceCounts = new Map<string, number>();
  for (const c of pastConversations) {
    if (c.spaceId) spaceCounts.set(c.spaceId, (spaceCounts.get(c.spaceId) || 0) + 1);
  }
  const searching = searchFocused || historySearch.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[120]" data-testid="assistant-overlay">
      {/* Backdrop — tap to dismiss; touch-action none so swipes here can't
          scroll the app behind the sheet. Bleeds past the viewport so an iOS
          rubber-band bounce never exposes bare page behind it. Fades in with
          the sheet and fades out with any dismiss (fadeBackdrop). */}
      <div
        ref={backdropRef}
        className="absolute inset-x-0 -bottom-40 -top-40 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-300"
        style={{ touchAction: "none" }}
        onClick={onClose}
      />
      {/* Bleed guard — a bounce lifts the whole view, including fixed
          elements; this strip sits just below the viewport so what slides up
          from under the sheet is sheet-colored, never a bare page. */}
      <div className="absolute inset-x-0 -bottom-40 h-40 bg-white" aria-hidden="true" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "absolute inset-x-0 bottom-0 flex select-none flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.28)] animate-in slide-in-from-bottom duration-300 origin-top transition-transform",
          historyOpen && "scale-[0.93]",
        )}
        // select-none sheet-wide: dragging must never pop iOS's blue text
        // selection on nearby bubbles. The composer opts back in below.
        style={{ top: "env(safe-area-inset-top)", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
        onPointerDown={onChatAnyDown}
        onPointerMove={onChatAnyMove}
        onPointerUp={onChatAnyEnd}
        onPointerCancel={onChatAnyEnd}
        onClickCapture={(e) => {
          if (dragTapSuppress.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {/* Chat page */}
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={{ touchAction: "pan-y" }}
        >
        {/* Drag handle — swipe down anywhere on the handle/header to dismiss */}
        <div
          className="relative z-10 flex shrink-0 justify-center pb-2 pt-2"
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
        {/* Chat scrolling under the floating controls fades out into the top
            edge instead of colliding with them — same as the create pages. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-20 bg-gradient-to-b from-white via-white/85 to-transparent"
          aria-hidden
        />
        {/* Floating corner controls — glassy, no header strip, so the chat
            runs all the way to the top and just blurs underneath them.
            History left, Gibbs (mode) center, new chat right. */}
        <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex items-center justify-between px-3">
          <button
            onClick={() => setHistoryOpen(true)}
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
        <div
          ref={chatScrollRef}
          onScroll={onChatScroll}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-16"
          // Room to scroll past the floating composer — messages glide
          // beneath the card instead of clipping at a white band above it.
          style={{
            paddingBottom: `${kbInset + 140}px`,
            transition: "padding-bottom 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {hydrating && messages.length === 0 ? (
            /* Skeleton thread — bubble-shaped placeholders in the same
               alternating rhythm as a real conversation: the whole set fades
               in and a light band flows left→right across each strip. */
            <div className="mx-auto w-full max-w-2xl space-y-4 pt-2 animate-in fade-in duration-300" data-testid="assistant-skeleton">
              <div className="flex justify-end">
                <div className="skeleton-shimmer h-10 w-3/5 rounded-[4px] rounded-br-[1px] bg-[#711419]/10" />
              </div>
              <div className="skeleton-shimmer h-16 w-[85%] rounded-[4px] rounded-tl-[1px] border border-slate-200/70 bg-slate-100" />
              <div className="flex justify-end">
                <div className="skeleton-shimmer h-8 w-2/5 rounded-[4px] rounded-br-[1px] bg-[#711419]/10" style={{ "--shimmer-delay": "150ms" } as React.CSSProperties} />
              </div>
              <div className="skeleton-shimmer h-24 w-[88%] rounded-[4px] rounded-tl-[1px] border border-slate-200/70 bg-slate-100" style={{ "--shimmer-delay": "150ms" } as React.CSSProperties} />
              <div className="flex justify-end">
                <div className="skeleton-shimmer h-10 w-1/2 rounded-[4px] rounded-br-[1px] bg-[#711419]/10" style={{ "--shimmer-delay": "300ms" } as React.CSSProperties} />
              </div>
              <div className="skeleton-shimmer h-14 w-[70%] rounded-[4px] rounded-tl-[1px] border border-slate-200/70 bg-slate-100" style={{ "--shimmer-delay": "300ms" } as React.CSSProperties} />
            </div>
          ) : messages.length === 0 && !pending ? (
            <div data-sheet-bg="" className="flex min-h-[calc(100%+1px)] flex-col items-center pt-[7vh] text-center">
              {/* Persona block — the badge already sits in the header, so the
                  empty state is just the name */}
              <button
                onClick={() => setHistoryOpen(true)}
                className="text-lg font-semibold tracking-tight text-slate-900 transition-opacity active:opacity-60"
                aria-label="Gibbs — history and spaces"
                data-testid="assistant-persona-pill"
              >
                Gibbs
              </button>
              <p className="mt-3 max-w-[260px] text-sm text-slate-500">
                {firstName ? `What can I get done, ${firstName}?` : "What can I get done?"} Anything I set up waits for your approval.
              </p>
              <div data-sheet-bg="" className="mt-7 flex w-full max-w-sm flex-col gap-2">
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
            <div data-sheet-bg="" className="mx-auto min-h-[calc(100%+1px)] w-full max-w-2xl space-y-4 pb-2">
              {messages.map((msg, i) => {
                if (msg.role === "user") {
                  return (
                    <div key={i} data-sheet-bg="" className="flex justify-end">
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
                  <div key={i} data-sheet-bg="" className="space-y-2">
                    {msg.content.trim() !== "" && (
                      <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-[4px] rounded-tl-[1px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-800">
                        <TypewriterText
                          text={stripMarkdown(msg.content)}
                          animate={i === freshIndex}
                          onProgress={() => scrollToBottom()}
                          onComplete={
                            i === freshIndex
                              ? () => {
                                  setTypedOut(true);
                                  requestAnimationFrame(() => scrollToBottom());
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
                      onProgress={() => scrollToBottom()}
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

        {/* Composer — the original card, now TRULY floating: absolutely
            positioned over the chat so messages glide beneath it (no white
            band above the box). Rides the keyboard via bottom padding. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3"
          style={{
            paddingBottom: kbInset > 0 ? `${kbInset + 8}px` : "calc(10px + env(safe-area-inset-bottom))",
            transition: "padding-bottom 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Same centered column as the thread so the bar lines up with the
              messages on wide screens */}
          <div className="pointer-events-auto mx-auto w-full max-w-2xl">
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
          <div className="rounded-2xl border border-slate-300/70 bg-white p-3 shadow-lg">
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
              className="max-h-32 min-h-[28px] w-full select-text resize-none overflow-y-auto bg-transparent text-[16px] leading-6 text-slate-900 outline-none [-webkit-user-select:text] placeholder:text-slate-400 focus:outline-none focus-visible:ring-0"
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
        </div>


        {/* Mode sheet — pops over everything from the floating Gibbs icon.
            Sets how Gibbs behaves; the pick persists across sessions. */}
        {modeSheetOpen && (
          <div className="absolute inset-0 z-40" data-testid="assistant-mode-sheet">
            <div ref={modeScrimRef} className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={() => setModeSheetOpen(false)} />
            <div
              ref={modeSheetRef}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-4 shadow-[0_-12px_48px_rgba(0,0,0,0.28)] animate-in slide-in-from-bottom duration-300"
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
      {/* ── History — a TRUE bottom sheet that rises over and fully covers
          the chat sheet (which shrinks beneath for depth). Drag the handle to
          dismiss. Spaces live here as a chip rail; hold a chat to rename,
          move, or delete it. The search bar stays docked at the BOTTOM with
          New chat on its right, which turns into an X while searching. ── */}
      <div className={cn("absolute inset-0 z-30", historyOpen ? "" : "pointer-events-none")}>
        <div
          ref={histScrimRef}
          className={cn("absolute inset-0 bg-black/35 transition-opacity duration-300", historyOpen ? "opacity-100" : "opacity-0")}
          style={{ touchAction: "none" }}
          onClick={() => setHistoryOpen(false)}
        />
        <div
          ref={histSheetRef}
          className={cn(
            "absolute inset-x-0 bottom-0 flex select-none flex-col rounded-t-3xl bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-out",
            historyOpen ? "translate-y-0" : "translate-y-full",
          )}
          // select-none + no callout: holding a chat row must open OUR menu,
          // never iOS text selection sweeping the whole sheet blue.
          style={{ top: "env(safe-area-inset-top)", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
          onPointerDown={onHistAnyDown}
          onPointerMove={onHistAnyMove}
          onPointerUp={onHistAnyEnd}
          onPointerCancel={onHistAnyEnd}
          onClickCapture={(e) => {
            if (dragTapSuppress.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          data-testid="assistant-history-sheet"
        >
          <div
            className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-2 active:cursor-grabbing"
            onPointerDown={onHistDragDown}
            onPointerMove={onHistDragMove}
            onPointerUp={onHistDragEnd}
            onPointerCancel={onHistDragEnd}
            data-hist-handle=""
            data-testid="assistant-history-drag-handle"
          >
            <span className="h-1 w-10 rounded-full bg-slate-300" />
          </div>
          <div
            className="grid shrink-0"
            style={{
              gridTemplateRows: searching ? "0fr" : "1fr",
              opacity: searching ? 0 : 1,
              transition: "grid-template-rows 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease",
            }}
          >
            <div className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pb-2">
            {activeSpace ? (
              <button
                onClick={() => setActiveSpace(null)}
                className="flex items-center gap-0.5 text-[13px] font-bold text-[#711419] transition-opacity active:opacity-60"
                data-testid="assistant-space-back"
              >
                <ChevronLeft className="h-4 w-4" />
                All chats
              </button>
            ) : (
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">History</p>
            )}
            <p className="text-[10px] text-slate-300">Hold a chat for options</p>
          </div>
            </div>
          </div>

          <div
            ref={histScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3"
            style={{ touchAction: "pan-y", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}
          >
            {/* Inside a space — its header; new chats file here. Folds away
                smoothly while searching. */}
            {activeSpaceObj && (
              <div
                className="grid"
                style={{
                  gridTemplateRows: searching ? "0fr" : "1fr",
                  opacity: searching ? 0 : 1,
                  transition: "grid-template-rows 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease",
                }}
              >
              <div className="overflow-hidden">
              <div data-sheet-bg="" className="mb-2 flex items-center gap-2.5 px-1.5 pt-1">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-slate-300/70 bg-slate-50 text-slate-500">
                  <Folder className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-bold text-slate-900">{activeSpaceObj.name}</span>
                  <span className="block text-xs text-slate-400">
                    {spaceFiltered.length === 1 ? "1 chat" : `${spaceFiltered.length} chats`} · new chats start in here
                  </span>
                </span>
              </div>
              </div>
              </div>
            )}

            {/* Spaces — folder rows above the chats (tap to open, hold to
                delete), with New space as the last row. Folds away smoothly
                while searching — leaving just the chats. */}
            {!activeSpace && (
              <div
                className="grid"
                style={{
                  gridTemplateRows: searching ? "0fr" : "1fr",
                  opacity: searching ? 0 : 1,
                  transition: "grid-template-rows 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease",
                }}
              >
              <div className="overflow-hidden">
              <div data-sheet-bg="" className="mb-3">
                <p className="px-1.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Spaces</p>
                {spaces.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (pressFired()) return;
                      setActiveSpace(s.id);
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => startPress(e, () => setSpaceMenu(s))}
                    onPointerMove={movePress}
                    onPointerUp={endPress}
                    onPointerCancel={endPress}
                    className="flex w-full select-none items-center gap-3 rounded-[6px] px-1.5 py-2 text-left active:bg-slate-100"
                    style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
                    data-testid={`assistant-space-${s.id}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-slate-300/70 bg-slate-50 text-slate-500">
                      <Folder className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">{s.name}</span>
                      <span className="block text-xs text-slate-400">
                        {(spaceCounts.get(s.id) || 0) === 1 ? "1 chat" : `${spaceCounts.get(s.id) || 0} chats`}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                ))}
                <button
                  onClick={() => {
                    setNewSpaceName("");
                    setNewSpaceOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-[6px] px-1.5 py-2 text-left active:bg-slate-100"
                  data-testid="assistant-space-new"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-dashed border-slate-300 text-slate-400">
                    <Plus className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[15px] font-medium text-slate-500">New space</span>
                </button>
              </div>
              </div>
              </div>
            )}

            {groupedConversations.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-slate-400">
                {historySearch.trim()
                  ? "No chats match that search."
                  : activeSpace
                    ? "Nothing in this space yet — hold any chat to move it here, or start a new one."
                    : "No conversations yet — ask something and it'll be saved here."}
              </p>
            ) : (
              <div data-sheet-bg="" className="min-h-[1px]">
                {groupedConversations.map((group) => (
                  <div key={group.label} data-sheet-bg="" className="mb-2">
                    <p className="px-1.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{group.label}</p>
                    {group.items.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          if (pressFired()) return;
                          openConversationFromPanel(c.id);
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        onPointerDown={(e) => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          startPress(e, () =>
                            setChatMenu({
                              convo: c,
                              view: "menu",
                              draft: c.title || "",
                              anchor: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
                            }),
                          );
                        }}
                        onPointerMove={movePress}
                        onPointerUp={endPress}
                        onPointerCancel={endPress}
                        className={cn(
                          "flex w-full select-none items-center gap-2 rounded-[6px] px-1.5 py-2.5 text-left active:bg-slate-100",
                          c.id === conversationId && "bg-[#711419]/[0.06]",
                        )}
                        style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
                        data-testid={`assistant-conversation-${c.id}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-[15px]", c.id === conversationId ? "font-semibold text-[#711419]" : "font-medium text-slate-800")}>
                            {c.title || "Conversation"}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-400">
                            {formatConversationWhen(c.updatedAt)}
                            {!activeSpace && spaceName(c.spaceId) ? ` · ${spaceName(c.spaceId)}` : ""}
                          </span>
                        </span>
                        {c.id === conversationId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#711419]" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Floating search — hovers over the list (no docked strip), New
              chat on its right morphing into an X while searching */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-3"
            style={{
              paddingBottom: kbInset > 0 ? `${kbInset + 10}px` : "calc(12px + env(safe-area-inset-bottom))",
              transition: "padding-bottom 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="pointer-events-auto flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-lg">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={histSearchInputRef}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={activeSpaceObj ? `Search ${activeSpaceObj.name}…` : "Search chats…"}
                className="h-full w-full min-w-0 select-text bg-transparent text-[15px] text-slate-900 outline-none [-webkit-user-select:text] placeholder:text-slate-400"
                data-testid="assistant-history-search"
              />
            </div>
            {/* New chat ⇄ X — one button, the icons crossfade/rotate as
                search engages instead of hard-swapping */}
            <button
              onClick={() => {
                if (searching) {
                  setHistorySearch("");
                  histSearchInputRef.current?.blur();
                } else {
                  startNewChat();
                  setHistoryOpen(false);
                }
              }}
              className={cn(
                "pointer-events-auto relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg transition-all duration-300 ease-out active:scale-90",
                searching ? "border border-slate-300/70 bg-white text-slate-500" : "bg-[#711419] text-white",
              )}
              aria-label={searching ? "Close search" : "New chat"}
              data-testid={searching ? "assistant-history-clear" : "assistant-history-new-chat"}
            >
              <SquarePen
                className={cn(
                  "h-5 w-5 transition-all duration-300 ease-out",
                  searching ? "rotate-90 scale-[0.4] opacity-0" : "rotate-0 scale-100 opacity-100",
                )}
              />
              <X
                className={cn(
                  "absolute h-5 w-5 transition-all duration-300 ease-out",
                  searching ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-[0.4] opacity-0",
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Context menu — long-press actions, floating iOS-style card over
          the history sheet. Renames and moves talk to the same PATCH the
          desktop uses; deletes go through the existing delete flow. ── */}
      {(chatMenu || spaceMenu || newSpaceOpen) && (
        <div className="absolute inset-0 z-40" data-testid="assistant-context-menu">
          <div
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            style={{ touchAction: "none" }}
            onClick={() => {
              if (menuBusy) return;
              setChatMenu(null);
              setSpaceMenu(null);
              setNewSpaceOpen(false);
            }}
          />
          {chatMenu?.view === "menu" && chatMenu.anchor ? (
            /* Anchored right under the held row — small, iMessage-style */
            <div
              className="absolute w-56 select-none overflow-hidden rounded-xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-150"
              style={{
                ...(chatMenu.anchor.bottom + 190 > window.innerHeight
                  ? { bottom: window.innerHeight - chatMenu.anchor.top + 6, transformOrigin: "bottom left" }
                  : { top: chatMenu.anchor.bottom + 6, transformOrigin: "top left" }),
                left: Math.min(Math.max(12, chatMenu.anchor.left + 6), window.innerWidth - 236),
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
              } as React.CSSProperties}
              data-testid="assistant-chat-menu-anchored"
            >
              <button
                onClick={() => setChatMenu({ ...chatMenu, view: "rename", draft: chatMenu.convo.title || "" })}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-medium text-slate-800 active:bg-slate-50"
                data-testid="assistant-chat-rename"
              >
                <Pencil className="h-4 w-4 text-slate-400" />
                Rename
              </button>
              <button
                onClick={() => setChatMenu({ ...chatMenu, view: "move", draft: "" })}
                className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3.5 py-2.5 text-left text-[14px] font-medium text-slate-800 active:bg-slate-50"
                data-testid="assistant-chat-move"
              >
                <Folder className="h-4 w-4 text-slate-400" />
                Move to space
              </button>
              <button
                onClick={doDeleteChat}
                className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3.5 py-2.5 text-left text-[14px] font-semibold text-red-600 active:bg-red-50"
                data-testid="assistant-chat-delete"
              >
                <Trash2 className="h-4 w-4" />
                Delete chat
              </button>
            </div>
          ) : (
          <div
            className="absolute inset-x-3 select-none overflow-hidden rounded-2xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.35)] animate-in fade-in slide-in-from-bottom-3 duration-200"
            style={{
              bottom: kbInset > 0 ? `${kbInset + 12}px` : "calc(16px + env(safe-area-inset-bottom))",
              transition: "bottom 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
            } as React.CSSProperties}
          >
            {chatMenu && (
              <>
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{chatMenu.convo.title || "Conversation"}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatConversationWhen(chatMenu.convo.updatedAt)}
                    {spaceName(chatMenu.convo.spaceId) ? ` · ${spaceName(chatMenu.convo.spaceId)}` : ""}
                  </p>
                </div>
                {chatMenu.view === "menu" && (
                  <div>
                    <button
                      onClick={() => setChatMenu({ ...chatMenu, view: "rename", draft: chatMenu.convo.title || "" })}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-slate-800 active:bg-slate-50"
                      data-testid="assistant-chat-rename"
                    >
                      <Pencil className="h-[18px] w-[18px] text-slate-400" />
                      Rename
                    </button>
                    <button
                      onClick={() => setChatMenu({ ...chatMenu, view: "move", draft: "" })}
                      className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-left text-[15px] font-medium text-slate-800 active:bg-slate-50"
                      data-testid="assistant-chat-move"
                    >
                      <Folder className="h-[18px] w-[18px] text-slate-400" />
                      Move to space
                    </button>
                    <button
                      onClick={doDeleteChat}
                      className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-left text-[15px] font-semibold text-red-600 active:bg-red-50"
                      data-testid="assistant-chat-delete"
                    >
                      <Trash2 className="h-[18px] w-[18px]" />
                      Delete chat
                    </button>
                  </div>
                )}
                {chatMenu.view === "rename" && (
                  <div className="p-4">
                    <input
                      value={chatMenu.draft}
                      onChange={(e) => setChatMenu({ ...chatMenu, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") doRenameChat();
                      }}
                      placeholder="Chat name"
                      maxLength={80}
                      className="h-11 w-full select-text rounded-[4px] border border-slate-300 bg-white px-3 text-[16px] text-slate-900 outline-none [-webkit-user-select:text] placeholder:text-slate-400 focus:border-[#711419]"
                      data-testid="assistant-chat-rename-input"
                    />
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => setChatMenu({ ...chatMenu, view: "menu" })}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={doRenameChat}
                        disabled={!chatMenu.draft.trim() || menuBusy}
                        className="flex items-center gap-1.5 rounded-full bg-[#711419] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        data-testid="assistant-chat-rename-save"
                      >
                        {menuBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save
                      </button>
                    </div>
                  </div>
                )}
                {chatMenu.view === "move" && (
                  <div className="max-h-[45vh] overflow-y-auto overscroll-contain">
                    <button
                      onClick={() => doMoveChat(null)}
                      disabled={menuBusy}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-slate-800 active:bg-slate-50"
                      data-testid="assistant-chat-move-none"
                    >
                      <span className="min-w-0 flex-1">No space</span>
                      {!chatMenu.convo.spaceId && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                    </button>
                    {spaces.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => doMoveChat(s.id)}
                        disabled={menuBusy}
                        className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-left text-[15px] font-medium text-slate-800 active:bg-slate-50"
                        data-testid={`assistant-chat-move-${s.id}`}
                      >
                        <Folder className="h-[18px] w-[18px] shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        {chatMenu.convo.spaceId === s.id && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                      </button>
                    ))}
                    <div className="flex items-center gap-2 border-t border-slate-100 p-3">
                      <input
                        value={chatMenu.draft}
                        onChange={(e) => setChatMenu({ ...chatMenu, draft: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") doCreateSpaceAndMove();
                        }}
                        placeholder="New space…"
                        maxLength={60}
                        className="h-10 min-w-0 flex-1 select-text rounded-[4px] border border-slate-300 bg-white px-3 text-[16px] text-slate-900 outline-none [-webkit-user-select:text] placeholder:text-slate-400 focus:border-[#711419]"
                        data-testid="assistant-chat-move-newspace-input"
                      />
                      <button
                        onClick={doCreateSpaceAndMove}
                        disabled={!chatMenu.draft.trim() || menuBusy}
                        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#711419] px-4 text-sm font-semibold text-white disabled:opacity-50"
                        data-testid="assistant-chat-move-newspace-create"
                      >
                        {menuBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Create
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {spaceMenu && !chatMenu && (
              <>
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-900">
                    <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                    {spaceMenu.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Chats stay when a space is deleted — they just come out unfiled.</p>
                </div>
                <button
                  onClick={() => {
                    removeSpace(spaceMenu.id);
                    setSpaceMenu(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-semibold text-red-600 active:bg-red-50"
                  data-testid="assistant-space-delete"
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                  Delete space
                </button>
              </>
            )}
            {newSpaceOpen && !chatMenu && !spaceMenu && (
              <div className="p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">New space</p>
                <input
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSpace();
                  }}
                  placeholder="e.g. Marketing ideas"
                  maxLength={60}
                  className="h-11 w-full select-text rounded-[4px] border border-slate-300 bg-white px-3 text-[16px] text-slate-900 outline-none [-webkit-user-select:text] placeholder:text-slate-400 focus:border-[#711419]"
                  data-testid="assistant-newspace-input"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setNewSpaceOpen(false)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addSpace}
                    disabled={!newSpaceName.trim()}
                    className="rounded-full bg-[#711419] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    data-testid="assistant-newspace-create"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
