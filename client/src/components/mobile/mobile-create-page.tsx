import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2, X } from "lucide-react";
import { useKeyboardInset } from "@/lib/native";
import badgeGibbs from "@/assets/badge-gibbs.png";

const AssistantOverlay = lazy(() => import("@/components/mobile/assistant-overlay"));
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const doExit = (fromDy = 0) => {
    // Slide the sheet down with an eased glide — it closes like it opened.
    const el = rootRef.current;
    if (el) {
      const h = el.clientHeight || window.innerHeight;
      const startP = Math.max(0, Math.min(1, fromDy / h));
      const dur = Math.round(300 * (1 - startP)) + 40;
      el.style.animation = "none";
      el.style.transition = `transform ${dur}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${dur}ms ease-out`;
      el.style.transform = "translateY(100%)";
      el.style.opacity = "0.6";
      setTimeout(leave, dur - 20);
      return;
    }
    setClosing(true);
    setTimeout(leave, 190);
  };

  const handleClose = () => {
    if (dirty) setConfirmOpen(true);
    else doExit();
  };

  // True bottom sheet: hold and drag DOWN from anywhere to dismiss — not
  // just the handle. A drag inside the form only counts when the form is
  // scrolled to its top and the motion is clearly vertical-down, so plain
  // scrolling can't be mistaken for a pull-down.
  const drag = useRef<{ x: number; y: number; engaged: boolean; eligible: boolean } | null>(null);
  const onSheetPointerDown = (e: React.PointerEvent) => {
    const wrap = scrollRef.current;
    const inScroll = !!wrap && wrap.contains(e.target as Node);
    drag.current = { x: e.clientX, y: e.clientY, engaged: false, eligible: !inScroll || wrap!.scrollTop <= 0 };
  };
  const onSheetPointerMove = (e: React.PointerEvent) => {
    const st = drag.current;
    const el = rootRef.current;
    if (!st || !el) return;
    const dy = e.clientY - st.y;
    const dx = Math.abs(e.clientX - st.x);
    if (!st.engaged) {
      if (!st.eligible) return;
      if (dy > 14 && dy > dx * 1.3) {
        st.engaged = true;
        el.style.animation = "none";
        el.style.transition = "none";
        el.setPointerCapture?.(e.pointerId);
      } else if (dy < -10 || dx > 16) {
        st.eligible = false;
        return;
      }
    }
    if (st.engaged) el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };
  const onSheetPointerUp = (e: React.PointerEvent) => {
    const st = drag.current;
    drag.current = null;
    const el = rootRef.current;
    if (!st?.engaged || !el) return;
    const dy = e.clientY - st.y;
    if (dy > 120) {
      if (dirty) {
        // Don't silently discard a half-filled form: spring back and ask.
        el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
        el.style.transform = "translateY(0)";
        setTimeout(() => { if (el) el.style.transition = ""; }, 260);
        setConfirmOpen(true);
      } else {
        doExit(Math.max(0, dy));
      }
    } else {
      el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateY(0)";
      setTimeout(() => { if (el) el.style.transition = ""; }, 290);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-[70] flex flex-col bg-slate-50 ${closing ? "animate-out slide-out-to-bottom duration-200 fill-mode-forwards" : "animate-in slide-in-from-bottom duration-300"}`}
      onPointerDown={onSheetPointerDown}
      onPointerMove={onSheetPointerMove}
      onPointerUp={onSheetPointerUp}
      onPointerCancel={onSheetPointerUp}
      data-testid={testid}
    >
      {/* Content scrolling under the floating controls fades out into the
          top edge instead of colliding with them. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] bg-gradient-to-b from-slate-50 via-slate-50/85 to-transparent"
        style={{ height: "calc(env(safe-area-inset-top) + 64px)" }}
      />
      {/* Grab handle — top middle, like every bottom sheet */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <div className="h-1.5 w-12 rounded-full bg-slate-300" />
      </div>
      {/* Full-page sheet: slides up over everything, no backdrop, no header
          bar — just a floating X (left) and Gibbs (right) over the content. */}
      <button
        onClick={handleClose}
        className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur transition-transform active:scale-95"
        style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
        aria-label="Close"
        data-testid="create-page-close"
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
      <button
        onClick={() => setAssistantOpen(true)}
        className="absolute right-3 z-10 rounded-full shadow-md transition-transform active:scale-95"
        style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
        aria-label="Ask Gibbs for help"
        data-testid="create-page-gibbs"
      >
        <img src={badgeGibbs} alt="" className="h-10 w-10 select-none" draggable={false} />
      </button>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 60px)",
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
          <AssistantOverlay open={assistantOpen} onClose={() => setAssistantOpen(false)} />
        </Suspense>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent overlayClassName="z-[80]" className="z-[85] max-w-[calc(100vw-2rem)] rounded-[8px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't saved yet. If you leave now, everything you've entered will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="discard-cancel">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => doExit()}
              data-testid="discard-confirm"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
