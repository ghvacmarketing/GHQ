/** Minimal app-switch loader: a blank canvas with the same thin maroon sweep
 *  bar the CRM uses for route transitions — no centered spinner. */
export function AppLoader() {
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="route-loader fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden" data-testid="app-loader">
        <div className="route-loader-bar h-full w-2/5 bg-[#711419]" />
      </div>
    </div>
  );
}
