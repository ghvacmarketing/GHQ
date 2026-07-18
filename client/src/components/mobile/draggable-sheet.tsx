import { useRef, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Bottom sheet with the house mobile feel: rounded top, drag handle you can
 * pull down to dismiss (springs back if released early), no close X.
 */
export function DraggableSheet({
  open,
  onOpenChange,
  title,
  children,
  testid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  testid?: string;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const el = sheetRef.current;
    if (el) el.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = `translateY(${dy >= 0 ? dy : dy / 4}px)`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    const el = sheetRef.current;
    if (!el) return;
    if (dy > 90) {
      el.style.transition = "transform 0.2s ease-in";
      el.style.transform = "translateY(100%)";
      setTimeout(() => {
        onOpenChange(false);
        el.style.transition = "";
        el.style.transform = "";
      }, 180);
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
        className="rounded-t-3xl border-t-0 px-5 pt-0 [&>button]:hidden"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
        data-testid={testid}
      >
        <div
          className="-mx-5 cursor-grab touch-none px-5 pb-3 pt-3 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
        </div>
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
