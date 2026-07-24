import { cn } from "@/lib/utils";

/**
 * GHQ's house "more" glyph — three squared marks in place of the generic
 * three dots, matching the squares-not-dots industrial language. On hover of
 * the surrounding button (or the glyph itself) the squares twist 45° into
 * diamonds in a quick stagger — the micro-animation lives in index.css
 * (.ghq-more). Drop-in replacement for MoreVertical / MoreHorizontal.
 */
export function MoreIcon({
  direction = "v",
  className,
}: {
  direction?: "v" | "h";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "ghq-more inline-flex items-center justify-center gap-[3px]",
        direction === "v" ? "flex-col" : "flex-row",
        className,
      )}
    >
      <span className="ghq-more-sq" />
      <span className="ghq-more-sq" />
      <span className="ghq-more-sq" />
    </span>
  );
}
