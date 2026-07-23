import ghqLogo from "@assets/redlogo.webp";

/** Between-app loader: the GHQ mark gently pulsing inside a spinning maroon
 *  arc. Pages hold it on screen for a minimum beat (see useSmoothLoading with
 *  appearAfterMs=0) so it reads as a deliberate transition, never a flash. */
export function AppLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]" data-testid="app-loader">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-slate-200 border-t-[#711419]" />
        <img src={ghqLogo} alt="GHQ" className="app-loader-logo h-10 w-10 rounded-lg object-contain" />
      </div>
    </div>
  );
}
