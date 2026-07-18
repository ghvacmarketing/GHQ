import { useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

/**
 * Mobile sub-page chrome: slides in like an iOS push, floating back arrow
 * top-left, and swipe-right (from the left half) drags the page and goes back.
 */
export function SubPage({ backTo = "/mobile", children }: { backTo?: string; children: ReactNode }) {
  const [, navigate] = useLocation();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const goBackAnimated = () => {
    const el = pageRef.current;
    if (el) {
      el.style.transition = "transform 0.22s ease-in";
      el.style.transform = "translateX(100%)";
      setTimeout(() => navigate(backTo), 200);
    } else {
      navigate(backTo);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, active: t.clientX < 28 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const st = swipe.current;
    if (!st?.active || !pageRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - st.x;
    const dy = Math.abs(t.clientY - st.y);
    // Content stays put while the finger moves; crossing the threshold
    // commits the back navigation with the whole-page slide.
    if (dx > 90 && dx > dy * 1.5) {
      swipe.current = null;
      goBackAnimated();
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const st = swipe.current;
    swipe.current = null;
    const el = pageRef.current;
    if (!st?.active || !el) return;
    const dx = e.changedTouches[0].clientX - st.x;
    if (dx > 90) goBackAnimated();
  };

  return (
    <>
      <button
        onClick={goBackAnimated}
        className="absolute left-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-900/10 bg-white/85 text-slate-700 shadow-[0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur-xl transition-transform active:scale-95"
        style={{ top: "calc(10px + env(safe-area-inset-top))" }}
        data-testid="button-back"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div
        ref={pageRef}
        className="page-slide-in h-full bg-slate-50"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </>
  );
}
