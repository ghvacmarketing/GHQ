/** The house mobile loader — the Jobs section's maroon arc, used everywhere
 *  a mobile section is loading so the app feels like one surface. */
export function MobileSpinner({ fullHeight = true }: { fullHeight?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${fullHeight ? "h-full min-h-[40vh]" : "py-10"}`} data-testid="mobile-spinner">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#711419]" />
    </div>
  );
}
