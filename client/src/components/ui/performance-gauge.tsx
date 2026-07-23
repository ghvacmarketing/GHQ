interface PerformanceGaugeProps {
  sold: number;
  quoted: number;
  goal: number;
  goalTarget?: number;
  size?: number;
  label?: string;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Brand palette
const COLOR_SOLD = "#711419"; // maroon — booked
const COLOR_QUOTED = "#e8704f"; // coral — in pipeline
const COLOR_TRACK = "#ece9e8"; // muted stone — remaining
const COLOR_INK = "#1c1917"; // goal marker

/**
 * Industrial linear performance meter (replaces the old semicircle speedometer):
 * a flat segmented track — sold, then pipeline — with tick marks and an inked
 * goal marker. Same props as before so all call sites keep working.
 */
export function PerformanceGauge({ sold, quoted, goal, goalTarget, label }: PerformanceGaugeProps) {
  const actualGoal = goalTarget ?? goal;
  const potential = quoted > 0 ? quoted : sold;
  const isPipelineEmpty = quoted === 0 && sold === 0;
  const scale = Math.max(actualGoal, sold + quoted, 1);

  const soldPct = Math.min((sold / scale) * 100, 100);
  const quotedPct = Math.min((quoted / scale) * 100, 100 - soldPct);
  const goalPct = isPipelineEmpty ? 50 : Math.min((actualGoal / scale) * 100, 100);
  const pctOfGoal = actualGoal > 0 ? Math.round((sold / actualGoal) * 100) : 0;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-end justify-between">
        <div className="flex items-center gap-3 text-[11px]">
          {label && <span className="mr-1 text-sm font-medium text-foreground">{label}</span>}
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: COLOR_SOLD }} />
            <span className="text-muted-foreground">Sold</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: COLOR_QUOTED }} />
            <span className="text-muted-foreground">Quoted</span>
          </span>
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-foreground">
          {pctOfGoal}% <span className="font-normal text-muted-foreground">of goal</span>
        </span>
      </div>

      {/* Meter track */}
      <div className="relative pt-4">
        {/* Goal marker + tag */}
        <div
          className="absolute top-0 z-10 -translate-x-1/2 text-[8px] font-semibold uppercase tracking-wider"
          style={{ left: `${goalPct}%`, color: COLOR_INK }}
        >
          Goal
        </div>
        <div className="relative h-5 w-full overflow-hidden rounded-[3px]" style={{ backgroundColor: COLOR_TRACK }}>
          {soldPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
              style={{ width: `${soldPct}%`, backgroundColor: COLOR_SOLD }}
            />
          )}
          {quotedPct > 0 && (
            <div
              className="absolute inset-y-0 transition-[width,left] duration-500 ease-out"
              style={{ left: `${soldPct}%`, width: `${quotedPct}%`, backgroundColor: COLOR_QUOTED }}
            />
          )}
          {/* Quarter tick marks */}
          {[25, 50, 75].map((t) => (
            <div key={t} className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${t}%` }} />
          ))}
        </div>
        <div
          className="absolute z-10 w-[2px] -translate-x-1/2"
          style={{ left: `${goalPct}%`, top: 12, bottom: -3, backgroundColor: COLOR_INK }}
        />
      </div>

      <div className="mt-2.5 flex w-full justify-between">
        <div>
          <p className="text-base font-semibold leading-tight tabular-nums text-foreground">{formatCurrency(sold)}</p>
          <p className="text-[11px] text-muted-foreground">Sold</p>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold leading-tight tabular-nums" style={{ color: COLOR_SOLD }}>{formatCurrency(actualGoal)}</p>
          <p className="text-[11px] text-muted-foreground">Goal</p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold leading-tight tabular-nums text-foreground">{formatCurrency(potential)}</p>
          <p className="text-[11px] text-muted-foreground">Pipeline</p>
        </div>
      </div>
    </div>
  );
}
