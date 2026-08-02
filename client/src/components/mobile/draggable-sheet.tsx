import { useRef, type ReactNode } from "react";
import { useKeyboardInset } from "@/lib/native";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Bottom sheet with the house mobile feel: rounded top, springy drag-down
 * dismiss, no close X. A TRUE sheet — you can grab and drag it down from
 * anywhere, not just the handle. Scroll vs. pull-down is hard-disambiguated:
 * a drag inside scrollable content only becomes a sheet-drag when that
 * content is already at its top, the motion is clearly vertical-down
 * (dy > 12px and steeper than sideways), and never once it looks like a
 * scroll or horizontal swipe.
 */
export function DraggableSheet({
  open,
  onOpenChange,
  title,
  children,
  testid,
  tall = false,
  full = false,
  glass = false,
  nested = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  testid?: string;
  /** Big form sheets: cap at 90vh and scroll the content inside. */
  tall?: boolean;
  /** Entire-page sheet: fills the screen below the status bar. Implies tall. */
  full?: boolean;
  glass?: boolean;
  /** Sheet opened from INSIDE another sheet (option pickers, calendars).
   *  Stacks above the parent and brings its own lighter scrim so the parent
   *  sheet dims behind it — without this, both sheets share a z-index and the
   *  picker reads as part of the parent while the page behind goes double-dark. */
  nested?: boolean;
}) {
  const keyboardInset = useKeyboardInset();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; engaged: boolean; eligible: boolean } | null>(null);
  const scrollable = tall || full;

  const dismissAnimated = () => {
    const el = sheetRef.current;
    if (!el) return onOpenChange(false);
    el.style.transition = "transform 0.22s ease-in";
    el.style.transform = "translateY(100%)";
    setTimeout(() => {
      onOpenChange(false);
      el.style.transition = "";
      el.style.transform = "";
    }, 200);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Portaled children (option sheets opened from inside this one) bubble
    // through the REACT tree even though they live outside this sheet's DOM —
    // a drag there must never move this sheet.
    if (!sheetRef.current?.contains(e.target as Node)) { drag.current = null; return; }
    const wrap = scrollWrapRef.current;
    const inScroll = !!wrap && wrap.contains(e.target as Node);
    // Inside scrolled-down content the gesture belongs to the scroller.
    drag.current = { x: e.clientX, y: e.clientY, engaged: false, eligible: !inScroll || wrap!.scrollTop <= 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const st = drag.current;
    const el = sheetRef.current;
    if (!st || !el) return;
    const dy = e.clientY - st.y;
    const dx = Math.abs(e.clientX - st.x);
    if (!st.engaged) {
      if (!st.eligible) return;
      if (dy > 12 && dy > dx * 1.2) {
        st.engaged = true;
        el.style.transition = "none";
        el.setPointerCapture?.(e.pointerId);
      } else if (dy < -10 || dx > 16) {
        // Clearly a scroll-up or horizontal move — never becomes a sheet drag
        st.eligible = false;
        return;
      }
    }
    if (st.engaged) el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const st = drag.current;
    drag.current = null;
    const el = sheetRef.current;
    if (!st?.engaged || !el) return;
    const dy = e.clientY - st.y;
    if (dy > 90) {
      dismissAnimated();
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateY(0)";
      setTimeout(() => { if (el) el.style.transition = ""; }, 260);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheetRef}
        side="bottom"
        overlayClassName={nested ? "z-[95] bg-black/40" : "z-[85]"}
        className={`${nested ? "z-[100] shadow-[0_-8px_32px_rgba(0,0,0,0.3)]" : "z-[90]"} rounded-t-3xl border-t-0 px-5 pt-0 [&>button]:hidden ${glass ? "bg-white/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/60" : ""} ${
          full
            ? "flex h-[calc(100dvh-env(safe-area-inset-top)-10px)] flex-col"
            : tall
              ? "flex max-h-[90vh] flex-col"
              : ""
        }`}
        style={{
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          // Full sheets already cover the screen — translating them under the
          // keyboard would shove the top off; their content pads instead.
          transform: !full && keyboardInset > 0 ? `translateY(-${keyboardInset}px)` : undefined,
          transition: "transform 0.2s ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid={testid}
      >
        <div className="-mx-5 cursor-grab touch-none px-5 pb-3 pt-3 active:cursor-grabbing">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
        </div>
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {scrollable ? (
          <div ref={scrollWrapRef} className="-mx-5 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5">
            {children}
          </div>
        ) : (
          children
        )}
      </SheetContent>
    </Sheet>
  );
}
