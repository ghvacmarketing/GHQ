import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";
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
 * invoice). Replaces the old bottom-sheet dialogs with real pages: a floating
 * liquid-glass X in the top-left that confirms before discarding an in-progress
 * draft, a title/subtitle header, and a scrolling body for the form. The page
 * itself does the create + navigate-to-the-new-record; this shell only owns the
 * chrome and the discard guard.
 */
export function MobileCreatePage({
  title,
  subtitle,
  dirty,
  exitTo,
  children,
  testid,
}: {
  title: string;
  subtitle?: string;
  /** Whether the form holds unsaved input — gates the discard confirmation. */
  dirty: boolean;
  /** Where the X (and a confirmed discard) lands. Defaults to browser back. */
  exitTo?: string;
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
    <div
      className="relative min-h-screen bg-slate-50"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      data-testid={testid}
    >
      {/* Floating liquid-glass X, top-left */}
      <button
        onClick={handleClose}
        className="liquid-glass liquid-glass--interactive fixed left-4 z-50 flex h-11 w-11 items-center justify-center text-slate-800"
        style={{
          top: "calc(env(safe-area-inset-top) + 12px)",
          // Round the glass shape (base + inner-edge pseudo both read this var)
          ["--glass-radius" as string]: "9999px",
        }}
        aria-label="Discard and close"
        data-testid="create-page-close"
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>

      <div className="px-4 pb-16 pt-16">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
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
