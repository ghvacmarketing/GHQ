import { cn } from "@/lib/utils";

/**
 * GHQ's house "actions" glyph (v2) — a 2×2 cluster of small squares, nothing
 * like the generic three dots. On hover of the surrounding button the whole
 * cluster rotates a quarter turn on the house motion curve (CSS in index.css,
 * .ghq-more). The `direction` prop is kept for call-site compatibility; the
 * glyph is symmetric so it renders identically.
 */
export function MoreIcon({
  direction: _direction = "v",
  className,
}: {
  direction?: "v" | "h";
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("ghq-more", className)}>
      <span className="ghq-more-sq" />
      <span className="ghq-more-sq" />
      <span className="ghq-more-sq" />
      <span className="ghq-more-sq" />
    </span>
  );
}
