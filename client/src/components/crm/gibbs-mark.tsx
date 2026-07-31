/** Gibbs' brand mark — the house 4-dot glyph locked in its diamond rotation,
 *  identical to the mobile assistant's icon. Fills with currentColor so it
 *  inherits the parent's text color like any lucide icon. */
export function GibbsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" className={`rotate-45 ${className || ""}`}>
      <rect x="2.6" y="2.6" width="4.2" height="4.2" rx="1.4" />
      <rect x="9.2" y="2.6" width="4.2" height="4.2" rx="1.4" />
      <rect x="2.6" y="9.2" width="4.2" height="4.2" rx="1.4" />
      <rect x="9.2" y="9.2" width="4.2" height="4.2" rx="1.4" />
    </svg>
  );
}
