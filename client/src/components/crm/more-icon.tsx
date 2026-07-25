import { cn } from "@/lib/utils";

/**
 * GHQ's house "actions" glyph — a hand-rolled 2×2 grid of rounded squares on a
 * 16×16 viewBox, filled with currentColor so it inherits the parent's text
 * color. Hovering the wrapping button spins it into a diamond (rotate-45 +
 * slight scale, CSS in index.css); pass `open` (or the `.ghq-more-open` class)
 * to lock the diamond while a dropdown is open. The `direction` prop is kept
 * for call-site compatibility; the glyph is symmetric so it renders identically.
 */
export function MoreIcon({
  open = false,
  direction: _direction = "v",
  className,
}: {
  open?: boolean;
  direction?: "v" | "h";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="currentColor"
      className={cn("ghq-more", open && "ghq-more-open", className)}
    >
      <rect x="2.6" y="2.6" width="4.2" height="4.2" rx="1.4" />
      <rect x="9.2" y="2.6" width="4.2" height="4.2" rx="1.4" />
      <rect x="2.6" y="9.2" width="4.2" height="4.2" rx="1.4" />
      <rect x="9.2" y="9.2" width="4.2" height="4.2" rx="1.4" />
    </svg>
  );
}
