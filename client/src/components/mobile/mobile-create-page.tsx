import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2, X } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { useKeyboardInset } from "@/lib/native";
import { markSkipEntrance } from "@/lib/page-transitions";
import badgeGibbs from "@/assets/badge-gibbs.png";

const AssistantOverlay = lazy(() => import("@/components/mobile/assistant-overlay"));

/**
 * Full-screen shell for the mobile "create" flows (job, task, customer, quote,
 * invoice). A sticky three-slot nav bar — close on the left, title centred,
 * save on the right — sits above a scrolling form body. The bar is in normal
 * flow (not floating over the content), so nothing it covers is ever
 * unreachable. The page itself does the create + navigate-to-the-new-record;
 * this shell owns the chrome and the discard guard.
 */
export function MobileCreatePage({
  title,
  dirty,
  exitTo,
  onClose,
  onSave,
  saveLabel = "Save",
  saveDisabled,
  saving,
  assistant,
  children,
  testid,
}: {
  title: string;
  /** Whether the form holds unsaved input — gates the discard confirmation. */
  dirty: boolean;
  /** Where the X (and a confirmed discard) lands. Defaults to browser back. */
  exitTo?: string;
  /** Overlay mode: close by unmounting (parent state) instead of navigating.
   *  Takes precedence over exitTo. */
  onClose?: () => void;
  /** Submit handler for the nav's save action; omit to leave the slot empty. */
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
  /** Create-copilot context — the Gibbs button opens him anchored to THIS
   *  form (sees the draft, fills fields) instead of a generic chat. */
  assistant?: import("@/lib/ai-conversations").AiCreateCopilot;
  children: ReactNode;
  testid?: string;
}) {
  const [, navigate] = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // With Keyboard resize:"none" the webview never shrinks, so the scroll
  // body must grow by the keyboard height — that's what lets you scroll any
  // field (notes especially) up into view instead of typing blind under
  // the keyboard.
  const keyboardInset = useKeyboardInset();

  // WebKit "helps" by panning the WHOLE page when the keyboard (or the date
  // wheel) would cover a focused field — which shoves this fixed sheet off
  // screen. We do our own in-container scrolling, so undo the pan whenever
  // it happens and again when the keyboard leaves.
  useEffect(() => {
    if (keyboardInset === 0) window.scrollTo(0, 0);
  }, [keyboardInset]);

  const leave = () => {
    if (onClose) onClose();
    else if (exitTo) navigate(exitTo);
    else window.history.back();
  };
  const doExit = () => {
    // Bottom-sheet exit with the REAL page beneath: clone the sheet as a
    // static ghost, navigate immediately (destination paints under it right
    // away, entrance fade suppressed), then glide the ghost down over it.
    // Fully opaque the whole ride — it must read as a sheet, not a fade.
    const el = rootRef.current;
    if (el) {
      const ghost = el.cloneNode(true) as HTMLElement;
      // cloneNode misses live state — imprint typed values and scroll
      // positions so the ghost is pixel-identical to what was on screen.
      const srcInputs = el.querySelectorAll<HTMLInputElement>("input");
      ghost.querySelectorAll<HTMLInputElement>("input").forEach((g, i) => {
        const s = srcInputs[i];
        if (s) g.setAttribute("value", s.value);
      });
      const srcAreas = el.querySelectorAll<HTMLTextAreaElement>("textarea");
      ghost.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((g, i) => {
        const s = srcAreas[i];
        if (s) g.textContent = s.value;
      });
      ghost.style.animation = "none";
      ghost.style.transition = "transform 460ms cubic-bezier(0.5, 0.05, 0.7, 0.25)";
      ghost.style.pointerEvents = "none";
      ghost.setAttribute("aria-hidden", "true");
      document.body.appendChild(ghost);
      // Scroll positions only apply once the ghost has layout
      const srcDivs = el.querySelectorAll<HTMLElement>("div");
      const ghostDivs = ghost.querySelectorAll<HTMLElement>("div");
      srcDivs.forEach((s, i) => {
        if (s.scrollTop > 0 && ghostDivs[i]) ghostDivs[i].scrollTop = s.scrollTop;
      });
      el.style.visibility = "hidden";
      markSkipEntrance();
      leave();
      requestAnimationFrame(() => {
        ghost.style.transform = "translateY(100%)";
      });
      setTimeout(() => ghost.remove(), 480);
      return;
    }
    setClosing(true);
    setTimeout(leave, 190);
  };

  const handleClose = () => {
    if (dirty) setConfirmOpen(true);
    else doExit();
  };

  return (
    <div
      ref={rootRef}
      className={`fixed inset-x-0 bottom-0 z-[70] flex flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-[0_-12px_48px_rgba(0,0,0,0.28)] ${closing ? "animate-out slide-out-to-bottom duration-200 fill-mode-forwards" : "animate-in slide-in-from-bottom duration-300"}`}
      style={{ top: "env(safe-area-inset-top)" }}
      data-testid={testid}
    >
      {/* Content scrolling under the floating controls fades out into the
          top edge instead of colliding with them. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] bg-gradient-to-b from-slate-50 via-slate-50/85 to-transparent"
        style={{ height: "64px" }}
      />
      {/* A true-looking SHEET: rounded 24px top corners below the status
          bar, so the border shows rising in and riding down on close. No
          grab handle, no drag-to-dismiss — the X is the only way out (with
          the discard guard when the form is dirty). */}
      <button
        onClick={handleClose}
        className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur transition-transform active:scale-95"
        aria-label="Close"
        data-testid="create-page-close"
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
      <button
        onClick={() => setAssistantOpen(true)}
        className="absolute right-3 top-3 z-10 rounded-full shadow-md transition-transform active:scale-95"
        aria-label="Ask Gibbs for help"
        data-testid="create-page-gibbs"
      >
        <img src={badgeGibbs} alt="" className="h-10 w-10 select-none" draggable={false} />
      </button>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4"
        style={{
          paddingTop: "64px",
          paddingBottom: `calc(env(safe-area-inset-bottom) + 32px + ${keyboardInset}px)`,
          transition: "padding-bottom 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onFocusCapture={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
            // Wait for the keyboard (and the padding above) to land, undo any
            // whole-page pan WebKit snuck in, then bring the field to the
            // middle of what's still visible.
            setTimeout(() => {
              window.scrollTo(0, 0);
              t.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 300);
            setTimeout(() => window.scrollTo(0, 0), 650);
          }
        }}
      >
        {/* 1px over-height keeps the form scrollable even before the
            keyboard shows, so the page always moves under your thumb. */}
        <div className="min-h-[calc(100%+1px)]">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {children}
        {onSave && (
          <button
            onClick={onSave}
            disabled={saveDisabled || saving}
            className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#711419] py-3.5 text-base font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:bg-slate-300"
            data-testid="create-page-save"
          >
            {saving && <Loader2 className="h-5 w-5 animate-spin" />}
            {saveLabel}
          </button>
        )}
        </div>
      </div>

      {assistantOpen && (
        <Suspense fallback={null}>
          <AssistantOverlay open={assistantOpen} onClose={() => setAssistantOpen(false)} copilot={assistant} />
        </Suspense>
      )}

      {/* Discard confirmation — a REAL bottom sheet (drag down = keep
          editing). Portaled sheets stack above the create page fine now
          (content z-[90] beats the page's z-[70]). */}
      <DraggableSheet open={confirmOpen} onOpenChange={setConfirmOpen} title="Discard this draft?" testid="discard-sheet">
        <h2 className="text-lg font-semibold text-slate-900">Discard this draft?</h2>
        <p className="mt-1 text-sm text-slate-500">
          You haven't saved yet. If you leave now, everything you've entered will be discarded.
        </p>
        <div className="mt-5 space-y-2">
          <button
            onClick={() => { setConfirmOpen(false); doExit(); }}
            className="h-12 w-full rounded-[4px] bg-red-600 text-base font-semibold text-white transition-transform active:scale-[0.98]"
            data-testid="discard-confirm"
          >
            Discard
          </button>
          <button
            onClick={() => setConfirmOpen(false)}
            className="h-12 w-full rounded-[4px] border border-slate-300/70 bg-white text-base font-semibold text-slate-700 transition-transform active:scale-[0.98]"
            data-testid="discard-cancel"
          >
            Keep editing
          </button>
        </div>
      </DraggableSheet>
    </div>
  );
}
