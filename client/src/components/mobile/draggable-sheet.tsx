import { useEffect, useRef, useState, type ReactNode } from "react";
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
  keepHeight = false,
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
  /** Don't grow to full height when the keyboard opens — the sheet keeps
   *  its natural size and only the content scrolls above the keys. */
  keepHeight?: boolean;
}) {
  // Resting transition — the drag handlers swap transitions in and out and
  // must restore THIS one so keyboard padding keeps animating afterwards.
  const BASE_TRANSITION = "padding-bottom 0.2s ease-out";
  const keyboardInset = useKeyboardInset();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; engaged: boolean; eligible: boolean } | null>(null);
  const scrollable = tall || full;

  // Exits are driven MANUALLY, never by Radix's animate-out. The landing
  // handler pins animation:none (iOS caret fix), which made Radix unmount
  // instantly on programmatic closes; restoring the animation re-armed the
  // ENTRANCE keyframes for a frame — the sheet rebounded up from the bottom
  // before the close committed. Instead: slide the sheet down (and fade the
  // scrim) with inline transitions, then flip the mirrored open state once
  // it's off-screen — Radix unmounts an already-invisible sheet.
  const [radixOpen, setRadixOpen] = useState(open);
  useEffect(() => {
    if (open) {
      const el = sheetRef.current;
      if (el) {
        // Re-opening mid-close: clear the exit styles so the entrance plays
        el.style.transition = "";
        el.style.transform = "";
      }
      setRadixOpen(true);
      return;
    }
    const el = sheetRef.current;
    if (!el) {
      setRadixOpen(false);
      return;
    }
    const overlay = el.previousElementSibling as HTMLElement | null;
    if (overlay) {
      overlay.style.transition = "opacity 0.26s ease-in";
      overlay.style.opacity = "0";
    }
    // A drag-dismiss already slid it off-screen; otherwise glide it down now
    const already = /translateY\(100%\)/.test(el.style.transform);
    if (!already) {
      el.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "translateY(100%)";
    }
    const t = window.setTimeout(() => setRadixOpen(false), already ? 40 : 280);
    return () => window.clearTimeout(t);
  }, [open]);

  /** Nearest scrollable ancestor of a touch, up to the sheet itself — the
   *  tall-sheet content wrap or any fixed-height list a child renders. */
  const scrollerAt = (node: Node | null): HTMLElement | null => {
    let el = node instanceof HTMLElement ? node : null;
    while (el && el !== sheetRef.current) {
      if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
      el = el.parentElement;
    }
    return null;
  };

  /** The Radix overlay renders as the sheet's previous sibling. */
  const overlayOf = () => (sheetRef.current?.previousElementSibling as HTMLElement | null);

  const dismissAnimated = () => {
    const el = sheetRef.current;
    if (!el) return onOpenChange(false);
    // The page lightens WITH the slide-down (continuing whatever dimming
    // level the drag already tracked to).
    const overlay = overlayOf();
    if (overlay) {
      overlay.style.transition = "opacity 0.24s ease-in";
      overlay.style.opacity = "0";
    }
    el.style.transition = "transform 0.22s ease-in";
    el.style.transform = "translateY(100%)";
    // Leave the sheet translated off-screen: clearing the transform here made
    // it snap back up for the length of Radix's exit animation — the glitchy
    // "bounce" on close. The node mounts fresh on the next open anyway.
    setTimeout(() => onOpenChange(false), 200);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // A second finger mid-drag must not hijack or wipe the gesture
    if (drag.current) return;
    // Portaled children (option sheets opened from inside this one) bubble
    // through the REACT tree even though they live outside this sheet's DOM —
    // a drag there must never move this sheet.
    if (!sheetRef.current?.contains(e.target as Node)) return;
    // Inside scrolled-down content the gesture belongs to the scroller.
    const scroller = scrollerAt(e.target as Node);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: false, eligible: !scroller || scroller.scrollTop <= 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const st = drag.current;
    const el = sheetRef.current;
    if (!st || st.id !== e.pointerId || !el) return;
    const dy = e.clientY - st.y;
    const dx = Math.abs(e.clientX - st.x);
    if (!st.engaged) {
      if (!st.eligible) return;
      if (dy > 12 && dy > dx * 1.2) {
        st.engaged = true;
        el.style.transition = "none";
        el.setPointerCapture?.(e.pointerId);
        // Typing mid-drag (customer/address search): drop the caret and
        // keyboard the moment the sheet starts moving — a focused input
        // inside a translating layer draws its cursor all over the place.
        (document.activeElement as HTMLElement | null)?.blur?.();
      } else if (dy < -10 || dx > 16) {
        // Clearly a scroll-up or horizontal move — never becomes a sheet drag
        st.eligible = false;
        return;
      }
    }
    if (st.engaged) {
      const dyc = Math.max(0, dy);
      el.style.transform = `translateY(${dyc}px)`;
      // The backdrop lightens in step with the finger — drag down and the
      // page brightens, pull back up and it darkens again.
      const ov = overlayOf();
      if (ov) {
        ov.style.transition = "none";
        ov.style.opacity = String(Math.max(0, 1 - dyc / (el.clientHeight || window.innerHeight)));
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const st = drag.current;
    if (!st || st.id !== e.pointerId) return; // only the tracked finger ends it
    drag.current = null;
    const el = sheetRef.current;
    if (!st.engaged || !el) return;
    const dy = e.clientY - st.y;
    if (dy > 90) {
      dismissAnimated();
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateY(0)";
      const ov = overlayOf();
      if (ov) {
        ov.style.transition = "opacity 0.25s ease-out";
        ov.style.opacity = "1";
      }
      setTimeout(() => {
        if (el) el.style.transition = BASE_TRANSITION;
        if (ov) {
          ov.style.transition = "";
          ov.style.opacity = "";
        }
      }, 260);
    }
  };

  // WebKit hands an eligible drag to the NATIVE scroller the moment tall-
  // sheet content moves — pointercancel fires and the sheet drag dies before
  // it can engage. Claim the gesture (preventDefault) while the sheet owns
  // it so dragging down from a scroller's top rides the sheet instead of
  // rubber-banding.
  useEffect(() => {
    if (!radixOpen) return;
    const el = sheetRef.current;
    if (!el) return;
    const guard = (e: TouchEvent) => {
      const st = drag.current;
      if (!st) return;
      if (st.engaged) {
        e.preventDefault();
        return;
      }
      if (!st.eligible || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dy = t.clientY - st.y;
      const dx = Math.abs(t.clientX - st.x);
      if (dy > 0 && dy >= dx) e.preventDefault();
    };
    el.addEventListener("touchmove", guard, { passive: false });
    return () => el.removeEventListener("touchmove", guard);
  }, [radixOpen]);

  // Mid-gesture HANDOFF (the Gibbs-thread feel): a drag born deep in a
  // scrolled list scrolls natively — but the moment the list hits its top
  // with the finger still pulling down, the SHEET takes over from right
  // there, fresh baseline, no lift-and-regrab. Pointer events are already
  // dead by then (the native scroll cancels them), so this tracker rides
  // raw touch events in parallel with the pointer path above.
  useEffect(() => {
    if (!radixOpen) return;
    const el = sheetRef.current;
    if (!el) return;
    let st: { id: number; y: number; scroller: HTMLElement; engaged: boolean } | null = null;
    const tracked = (list: TouchList, id: number) => {
      for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    };
    const onStart = (e: TouchEvent) => {
      if (st || e.touches.length !== 1) return;
      const t = e.touches[0];
      const sc = scrollerAt(e.target as Node);
      // Only the handoff case — a touch born INSIDE a scrolled-down list.
      // (Top-of-list touches are the pointer path's job.)
      if (!sc || sc.scrollTop <= 0) return;
      st = { id: t.identifier, y: t.clientY, scroller: sc, engaged: false };
    };
    const onMove = (e: TouchEvent) => {
      if (!st) return;
      const t = tracked(e.touches, st.id);
      if (!t) return;
      if (!st.engaged) {
        if (st.scroller.scrollTop > 0) {
          // Still scrolling — keep the baseline fresh so the takeover
          // measures from the top-arrival, not the whole drag.
          st.y = t.clientY;
          return;
        }
        if (t.clientY - st.y > 6) {
          st.engaged = true;
          st.y = t.clientY;
          el.style.transition = "none";
          (document.activeElement as HTMLElement | null)?.blur?.();
        } else {
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      const dyc = Math.max(0, t.clientY - st.y);
      el.style.transform = `translateY(${dyc}px)`;
      // The list must not rubber-band underneath the ride
      st.scroller.scrollTop = 0;
      const ov = overlayOf();
      if (ov) {
        ov.style.transition = "none";
        ov.style.opacity = String(Math.max(0, 1 - dyc / (el.clientHeight || window.innerHeight)));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!st) return;
      const t = tracked(e.changedTouches, st.id);
      if (!t) return; // only the tracked finger ends it
      const ended = st;
      st = null;
      if (!ended.engaged) return;
      if (t.clientY - ended.y > 90) {
        dismissAnimated();
      } else {
        el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
        el.style.transform = "translateY(0)";
        const ov = overlayOf();
        if (ov) {
          ov.style.transition = "opacity 0.25s ease-out";
          ov.style.opacity = "1";
        }
        setTimeout(() => {
          el.style.transition = BASE_TRANSITION;
          const o = overlayOf();
          if (o) {
            o.style.transition = "";
            o.style.opacity = "";
          }
        }, 260);
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radixOpen]);

  return (
    <Sheet
      open={radixOpen}
      onOpenChange={(o) => {
        // Radix-internal closes (scrim tap, Esc) route through the parent's
        // state, which loops back through the mirrored-open effect above —
        // same manual slide-down as every other close path. (Restoring the
        // animation here re-armed the ENTRANCE keyframes and flashed.)
        onOpenChange(o);
      }}
    >
      <SheetContent
        ref={sheetRef}
        side="bottom"
        // Radix auto-focuses the first focusable child on open — which
        // painted the first tile (e.g. "New Task" in the create sheet) as
        // highlighted/pressed. Sheets that need focus set it themselves.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onAnimationEnd={(e) => {
          // Once the slide-in lands, drop the (fill-mode-forwards) animation
          // entirely. iOS draws text carets at the wrong spot inside layers
          // that still carry a transform animation — inputs in sheets typed
          // with a teleporting cursor until this.
          if (e.target === sheetRef.current && open && sheetRef.current) {
            sheetRef.current.style.animation = "none";
          }
        }}
        overlayClassName={nested ? "z-[95] bg-black/40 duration-150" : "z-[85]"}
        className={`${nested ? "z-[100] shadow-[0_-8px_32px_rgba(0,0,0,0.3)]" : "z-[90]"} rounded-t-3xl border-t-0 px-5 pt-0 [&>button]:hidden ${glass ? "bg-white/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/60" : ""} ${
          full
            ? "flex h-[calc(100dvh-env(safe-area-inset-top)-10px)] flex-col"
            : tall
              ? "flex max-h-[90vh] flex-col"
              : ""
        }`}
        style={{
          // The keyboard PADS the sheet instead of translating it: the sheet
          // stays anchored to the screen bottom (so the keyboard sits on the
          // white sheet body, not on a strip of dimmed backdrop) and only the
          // content lifts. Full sheets already cover the screen — their
          // content pads itself instead.
          paddingBottom:
            !full && keyboardInset > 0 ? `${keyboardInset + 12}px` : "calc(24px + env(safe-area-inset-bottom))",
          // While the keyboard is up, a scrollable sheet goes FULL height —
          // otherwise the max-h cap left a slice of the keyboard padding
          // poking out as an empty white "container" above the keys.
          // keepHeight opts out: the sheet holds its size over the keys.
          ...(!full && scrollable && keyboardInset > 0 && !keepHeight
            ? { height: "calc(100dvh - env(safe-area-inset-top) - 10px)", maxHeight: "none" }
            : {}),
          // No padding animation while closing — the keyboard drops at the
          // same moment and the shrink fought the slide-out (visible jolt).
          transition: open ? BASE_TRANSITION : undefined,
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
          <div className="-mx-5 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5">
            {children}
          </div>
        ) : (
          children
        )}
      </SheetContent>
    </Sheet>
  );
}
