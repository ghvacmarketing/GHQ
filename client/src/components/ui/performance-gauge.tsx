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
const COLOR_MISSED = "#ece9e8"; // muted stone — remaining
const COLOR_INK = "#1c1917"; // needle / marker

export function PerformanceGauge({ sold, quoted, goal, goalTarget, size = 180, label }: PerformanceGaugeProps) {
  const actualGoal = goalTarget ?? goal;

  const potential = quoted > 0 ? quoted : sold;
  const isPipelineEmpty = quoted === 0 && sold === 0;
  const scale = Math.max(actualGoal, sold + quoted, 1);

  const soldPercent = scale > 0 ? Math.min((sold / scale) * 100, 100) : 0;
  const quotedPercent = scale > 0 ? Math.min((quoted / scale) * 100, 100 - soldPercent) : 0;

  const radius = 70;
  const strokeWidth = 18;
  const centerX = 90;
  const centerY = 85;

  const arcLength = Math.PI * radius;
  const soldLength = (soldPercent / 100) * arcLength;
  const quotedLength = (quotedPercent / 100) * arcLength;

  const arcPath = `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`;

  const showGoalMarker = actualGoal > 0;
  const goalMarkerPercent = isPipelineEmpty ? 50 : Math.min((actualGoal / scale) * 100, 100);
  const goalMarkerAngle = (goalMarkerPercent / 100) * 180;
  const goalMarkerRadians = ((180 - goalMarkerAngle) * Math.PI) / 180;
  const goalMarkerInnerX = centerX + (radius - strokeWidth / 2 - 2) * Math.cos(goalMarkerRadians);
  const goalMarkerInnerY = centerY - (radius - strokeWidth / 2 - 2) * Math.sin(goalMarkerRadians);
  const goalMarkerOuterX = centerX + (radius + strokeWidth / 2 + 2) * Math.cos(goalMarkerRadians);
  const goalMarkerOuterY = centerY - (radius + strokeWidth / 2 + 2) * Math.sin(goalMarkerRadians);

  const needleAngle = Math.min(soldPercent, 100);
  const needleRadians = ((180 - (needleAngle / 100) * 180) * Math.PI) / 180;
  const needleLength = radius - 15;
  const needleX = centerX + needleLength * Math.cos(needleRadians);
  const needleY = centerY - needleLength * Math.sin(needleRadians);

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      {label && <p className="mb-1 text-sm font-medium text-foreground">{label}</p>}
      <div className="mb-2 flex items-center justify-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_SOLD }} />
          <span className="text-muted-foreground">Sold</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_QUOTED }} />
          <span className="text-muted-foreground">Quoted</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_MISSED }} />
          <span className="text-muted-foreground">Remaining</span>
        </span>
      </div>

      <svg width={size} height={size * 0.6} viewBox="0 0 180 110">
        {/* Remaining arc */}
        <path d={arcPath} fill="none" stroke={COLOR_MISSED} strokeWidth={strokeWidth} strokeLinecap="round" />

        {/* Quoted (pipeline) arc */}
        {soldLength + quotedLength > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={COLOR_QUOTED}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${soldLength + quotedLength} ${arcLength}`}
          />
        )}

        {/* Sold arc */}
        {soldLength > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={COLOR_SOLD}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${soldLength} ${arcLength}`}
          />
        )}

        {/* Goal marker */}
        {showGoalMarker && (
          <line
            x1={goalMarkerInnerX}
            y1={goalMarkerInnerY}
            x2={goalMarkerOuterX}
            y2={goalMarkerOuterY}
            stroke={COLOR_INK}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}

        {/* Needle */}
        <line x1={centerX} y1={centerY} x2={needleX} y2={needleY} stroke={COLOR_INK} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={centerX} cy={centerY} r={5} fill={COLOR_INK} />
      </svg>

      <div className="-mt-2 flex w-full justify-between px-2">
        <div className="text-center">
          <p className="text-base font-semibold tabular-nums text-foreground">{formatCurrency(sold)}</p>
          <p className="text-[11px] text-muted-foreground">Sold</p>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold tabular-nums text-primary">{formatCurrency(actualGoal)}</p>
          <p className="text-[11px] text-muted-foreground">Goal</p>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold tabular-nums text-foreground">{formatCurrency(potential)}</p>
          <p className="text-[11px] text-muted-foreground">Pipeline</p>
        </div>
      </div>
    </div>
  );
}
