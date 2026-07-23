import { cn } from "@/lib/utils";

// Static map so Tailwind's scanner sees every dot class it needs to emit.
const DOT_COLORS: Record<string, string> = {
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  lime: "bg-lime-500",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  fuchsia: "bg-fuchsia-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  slate: "bg-slate-400",
  gray: "bg-gray-400",
  zinc: "bg-zinc-400",
  neutral: "bg-neutral-400",
  stone: "bg-stone-400",
};

/**
 * Derive a dot color from legacy pill classes ("bg-green-100 text-green-700
 * border-green-200" → "bg-green-500") so existing status config maps keep
 * working unchanged.
 */
export function statusDotColor(pillClasses?: string | null): string {
  const match = pillClasses?.match(/(?:bg|text|border)-([a-z]+)-\d+/);
  return (match && DOT_COLORS[match[1]]) || "bg-slate-400";
}

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Legacy pill className to derive the dot color from */
  pill?: string | null;
  /** Explicit dot color class (wins over pill) */
  color?: string;
  children: React.ReactNode;
}

/**
 * House status style: a small colored dot followed by plain text.
 * Replaces the old colored-pill badges for statuses.
 */
export function StatusDot({ pill, color, children, className, ...props }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground",
        className,
      )}
      {...props}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-[2px]", color || statusDotColor(pill))} />
      {children}
    </span>
  );
}
