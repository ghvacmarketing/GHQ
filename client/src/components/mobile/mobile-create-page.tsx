import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2, X } from "lucide-react";
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

  const doExit = () => {
    // Slide the sheet back down before leaving — it closes like it opened
    setClosing(true);
    setTimeout(() => {
      if (exitTo) navigate(exitTo);
      else window.history.back();
    }, 190);
  };

  const handleClose = () => {
    if (dirty) setConfirmOpen(true);
    else doExit();
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col bg-slate-50 ${closing ? "animate-out slide-out-to-bottom duration-200 fill-mode-forwards" : "animate-in slide-in-from-bottom duration-300"}`}
      data-testid={testid}
    >
      {/* Grab handle — top middle, like every bottom sheet */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <div className="h-1.5 w-12 rounded-full bg-slate-300" />
      </div>
      {/* Full-page sheet: slides up over everything, no backdrop, no header
          bar — just a floating X and Save over the content. */}
      <button
        onClick={handleClose}
        className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur transition-transform active:scale-95"
        style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
        aria-label="Close"
        data-testid="create-page-close"
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
      {onSave && (
        <button
          onClick={onSave}
          disabled={saveDisabled || saving}
          className="absolute right-3 z-10 flex h-10 items-center gap-1.5 rounded-full bg-[#711419] px-4 text-[15px] font-semibold text-white shadow-md transition-transform active:scale-95 disabled:bg-slate-300"
          style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
          data-testid="create-page-save"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saveLabel}
        </button>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 60px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
        }}
      >
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {children}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-[8px]">
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
              onClick={doExit}
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
