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

  const doExit = () => {
    if (exitTo) navigate(exitTo);
    else window.history.back();
  };

  const handleClose = () => {
    if (dirty) setConfirmOpen(true);
    else doExit();
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid={testid}>
      {/* Sticky nav — equal side columns keep the title optically centred no
          matter how wide the save label runs. */}
      <div
        className="sticky top-0 z-40 border-b border-slate-200 bg-white"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="grid h-14 grid-cols-[4.5rem_1fr_4.5rem] items-center px-2">
          <button
            onClick={handleClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 transition-colors active:bg-slate-100"
            aria-label="Close"
            data-testid="create-page-close"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>

          <h1 className="truncate text-center text-[15px] font-semibold text-slate-900">{title}</h1>

          <div className="flex justify-end">
            {onSave && (
              <button
                onClick={onSave}
                disabled={saveDisabled || saving}
                className="flex h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-[#711419] transition-colors active:bg-[#711419]/10 disabled:text-slate-300"
                data-testid="create-page-save"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saveLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-16 pt-4">{children}</div>

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
