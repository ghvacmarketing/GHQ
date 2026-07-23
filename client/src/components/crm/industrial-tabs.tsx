import { cn } from "@/lib/utils";

export type IndustrialTab = { key: string; label: string; count?: number | string | null };

/** The house tab structure: a machined segmented cluster — hairline-bordered
 *  white cells, active cell inked slate-900. Matches the Comms switcher and
 *  Documents view toggle so tabs read the same across the platform. */
export function IndustrialTabs({
  tabs,
  activeKey,
  onSelect,
  className,
  testidPrefix = "itab",
}: {
  tabs: IndustrialTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
  testidPrefix?: string;
}) {
  return (
    <div
      className={cn(
        "scrollbar-hide flex w-fit max-w-full overflow-x-auto rounded-[4px] border border-slate-300/70 bg-white",
        className,
      )}
    >
      {tabs.map((t, i) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-medium transition-colors",
              i > 0 && "border-l border-slate-300/70",
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
            )}
            data-testid={`${testidPrefix}-${t.key}`}
          >
            {t.label}
            {t.count != null && (
              <span className={cn("text-xs tabular-nums", active ? "text-white/60" : "text-slate-400")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
