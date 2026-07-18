import { useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

/**
 * Mobile sub-page chrome: slides in like an iOS push; floating back arrow;
 * iOS-style edge swipe-back where the whole page follows the finger and
 * either commits (slide out + navigate) or springs back on release.
 *
 * Pointer events + `touch-action: pan-y` make the horizontal gesture ours
 * while vertical scrolling stays native — no passive-listener fights, no
 * content shearing (the page moves as one unit).
 */
export function SubPage({ backTo = "/mobile", children }: { backTo?: string; children: ReactNode }) {
  const [, navigate] = useLocation();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; engaged: boolean; active: boolean } | null>(null);

  const animateOut = () => {
    const el = pageRef.current;
    if (!el) return navigate(backTo);
    el.style.transition = "transform 0.2s ease-in";
    el.style.transform = "translateX(100%)";
    setTimeout(() => navigate(backTo), 190);
  };

  const springBack = () => {
    const el = pageRef.current;
    if (!el) return;
    el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
    el.style.transform = "translateX(0)";
    setTimeout(() => { if (el) el.style.transition = ""; }, 290);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Edge-start only, so normal taps/scrolls in content never move the page
    if (e.clientX > 32) { drag.current = null; return; }
    drag.current = { x: e.clientX, y: e.clientY, engaged: false, active: true };
    pageRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = drag.current;
    const el = pageRef.current;
    if (!st?.active || !el) return;
    const dx = e.clientX - st.x;
    const dy = Math.abs(e.clientY - st.y);
    if (!st.engaged) {
      if (dx > 8 && dx > dy) {
        st.engaged = true;
        el.style.transition = "none";
      } else if (dy > 14) {
        // Vertical intent — hand the gesture back to scrolling
        st.active = false;
        return;
      }
    }
    if (st.engaged) {
      el.style.transform = `translateX(${Math.max(0, dx)}px)`;
    }
  };

  const finish = (e: React.PointerEvent) => {
    const st = drag.current;
    drag.current = null;
    if (!st?.engaged) return;
    const dx = e.clientX - st.x;
    if (dx > Math.min(140, window.innerWidth * 0.33)) {
      animateOut();
    } else {
      springBack();
    }
  };

  return (
    <div
      ref={pageRef}
      className="page-slide-in relative h-full bg-slate-50"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <button
        onClick={animateOut}
        className="absolute left-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-900/10 bg-white/85 text-slate-700 shadow-[0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur-xl transition-transform active:scale-95"
        style={{ top: "calc(10px + env(safe-area-inset-top))" }}
        data-testid="button-back"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      {children}
    </div>
  );
}
