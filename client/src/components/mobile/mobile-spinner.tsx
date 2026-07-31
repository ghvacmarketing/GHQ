import redLogoUrl from "@assets/redlogo.webp";

/** The house loader — the GHQ mark inside a spinning maroon arc, identical
 *  to the app launcher / welcome screen loader, sized for mobile sections.
 *  Every mobile loading state uses this so the whole app feels like one
 *  surface. */
export function MobileSpinner({ fullHeight = true }: { fullHeight?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${fullHeight ? "h-full min-h-[40vh]" : "py-8"}`} data-testid="mobile-spinner">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-slate-200 border-t-[#711419]" />
        <img src={redLogoUrl} alt="" className="h-7 w-7 rounded-md object-contain" />
      </div>
    </div>
  );
}
