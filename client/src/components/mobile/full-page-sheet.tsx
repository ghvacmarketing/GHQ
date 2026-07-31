import { ReactNode } from "react";
import { X } from "lucide-react";

/** Apple-invite-style full-page sheet: covers the screen, slides up from the
 *  bottom over a dimmed brand backdrop, rounded top with a grab handle, close
 *  X floating top-right. The create-job and create-customer flows live in
 *  these — a whole page that opens and closes like a bottom sheet. */
export function FullPageSheet({
  open,
  onClose,
  title,
  children,
  testid,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testid?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]" data-testid={testid}>
      {/* Brand-tinted backdrop */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-[#3c0d10] via-[#711419] to-[#2a0a0c] animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* The sheet — nearly full height, rounded top, grab handle */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-[0_-12px_48px_rgba(0,0,0,0.35)] animate-in slide-in-from-bottom duration-300"
        style={{ top: "calc(env(safe-area-inset-top) + 32px)" }}
      >
        <div className="relative shrink-0 pb-2 pt-3">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
          <p className="mt-2 text-center text-sm font-semibold text-slate-700">{title}</p>
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/80 text-slate-600 transition-transform active:scale-95"
            aria-label="Close"
            data-testid={testid ? `${testid}-close` : undefined}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-1"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
