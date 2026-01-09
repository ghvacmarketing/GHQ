interface PerformanceGaugeProps {
  sold: number;
  quoted: number;
  goal: number;
  goalTarget?: number;
  size?: number;
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

export function PerformanceGauge({ sold, quoted, goal, goalTarget, size = 180 }: PerformanceGaugeProps) {
  const actualGoal = goalTarget ?? goal;
  
  const potential = quoted > 0 ? quoted : sold;
  const isPipelineEmpty = quoted === 0 && sold === 0;
  const scale = Math.max(actualGoal, sold + quoted, 1);
  
  const soldPercent = scale > 0 ? Math.min((sold / scale) * 100, 100) : 0;
  const quotedPercent = scale > 0 ? Math.min((quoted / scale) * 100, 100 - soldPercent) : 0;
  
  const radius = 70;
  const strokeWidth = 20;
  const centerX = 90;
  const centerY = 85;
  
  // Calculate arc path for a semicircle (left to right, 180 degrees)
  const arcLength = Math.PI * radius; // Half circumference
  
  // Calculate dash lengths for each segment
  const soldLength = (soldPercent / 100) * arcLength;
  const quotedLength = (quotedPercent / 100) * arcLength;
  const missedLength = arcLength - soldLength - quotedLength;
  
  // Create semicircle arc path (from left to right)
  const arcPath = `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`;
  
  // Goal marker position
  const showGoalMarker = actualGoal > 0;
  const goalMarkerPercent = isPipelineEmpty ? 50 : Math.min((actualGoal / scale) * 100, 100);
  const goalMarkerAngle = (goalMarkerPercent / 100) * 180;
  const goalMarkerRadians = ((180 - goalMarkerAngle) * Math.PI) / 180;
  const goalMarkerInnerX = centerX + (radius - strokeWidth/2 - 2) * Math.cos(goalMarkerRadians);
  const goalMarkerInnerY = centerY - (radius - strokeWidth/2 - 2) * Math.sin(goalMarkerRadians);
  const goalMarkerOuterX = centerX + (radius + strokeWidth/2 + 2) * Math.cos(goalMarkerRadians);
  const goalMarkerOuterY = centerY - (radius + strokeWidth/2 + 2) * Math.sin(goalMarkerRadians);
  
  // Needle position
  const needleAngle = Math.min(soldPercent, 100);
  const needleRadians = ((180 - (needleAngle / 100) * 180) * Math.PI) / 180;
  const needleLength = radius - 15;
  const needleX = centerX + needleLength * Math.cos(needleRadians);
  const needleY = centerY - needleLength * Math.sin(needleRadians);

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="flex items-center justify-center gap-4 text-xs mb-2">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-700" />
          <span className="text-slate-600">Sold</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-green-300" />
          <span className="text-slate-600">Quoted</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          <span className="text-slate-600">Missed</span>
        </div>
      </div>
      
      <svg width={size} height={size * 0.6} viewBox="0 0 180 110">
        {/* Background arc (missed/remaining) - full semicircle */}
        <path
          d={arcPath}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* Quoted arc (light green) - layered on top, starts after sold */}
        {(soldLength + quotedLength) > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke="#86efac"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${soldLength + quotedLength} ${arcLength}`}
          />
        )}
        
        {/* Sold arc (dark green) - on top, covers sold portion */}
        {soldLength > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke="#166534"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${soldLength} ${arcLength}`}
          />
        )}
        
        {/* Goal marker (red line) */}
        {showGoalMarker && (
          <line
            x1={goalMarkerInnerX}
            y1={goalMarkerInnerY}
            x2={goalMarkerOuterX}
            y2={goalMarkerOuterY}
            stroke="#dc2626"
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
        
        {/* Needle */}
        <line
          x1={centerX}
          y1={centerY}
          x2={needleX}
          y2={needleY}
          stroke="#1e293b"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={centerX} cy={centerY} r={6} fill="#1e293b" />
      </svg>
      
      <div className="flex justify-between w-full px-2 -mt-2">
        <div className="text-center">
          <p className="text-lg font-bold text-slate-900">{formatCurrency(sold)}</p>
          <p className="text-xs text-slate-500">Sold</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-600">{formatCurrency(actualGoal)}</p>
          <p className="text-xs text-slate-500">Goal</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-900">{formatCurrency(potential)}</p>
          <p className="text-xs text-slate-500">Potential</p>
        </div>
      </div>
    </div>
  );
}
