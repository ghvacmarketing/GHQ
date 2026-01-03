interface PerformanceGaugeProps {
  sold: number;
  quoted: number;
  goal: number;
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

export function PerformanceGauge({ sold, quoted, goal, size = 180 }: PerformanceGaugeProps) {
  const potential = goal;
  const missed = Math.max(0, goal - sold - quoted);
  
  const soldPercent = potential > 0 ? Math.min((sold / potential) * 100, 100) : 0;
  const quotedPercent = potential > 0 ? Math.min((quoted / potential) * 100, 100 - soldPercent) : 0;
  const missedPercent = potential > 0 ? (missed / potential) * 100 : 0;
  
  const soldAngle = Math.min((soldPercent / 100) * 180, 180);
  const quotedAngle = Math.min((quotedPercent / 100) * 180, 180 - soldAngle);
  
  const radius = 70;
  const strokeWidth = 20;
  const centerX = 90;
  const centerY = 85;
  
  const polarToCartesian = (angle: number) => {
    const radians = ((180 - angle) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(radians),
      y: centerY - radius * Math.sin(radians),
    };
  };
  
  const createArc = (startAngle: number, endAngle: number) => {
    if (endAngle <= startAngle) return "";
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const largeArc = endAngle - startAngle > 90 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };
  
  const needleAngle = Math.min(soldPercent, 100);
  const needleRadians = ((180 - (needleAngle / 100) * 180) * Math.PI) / 180;
  const needleLength = radius - 15;
  const needleX = centerX + needleLength * Math.cos(needleRadians);
  const needleY = centerY - needleLength * Math.sin(needleRadians);

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="flex items-center justify-center gap-4 text-xs mb-2">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
          <span className="text-slate-600">Sold</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="text-slate-600">Quoted</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          <span className="text-slate-600">Missed</span>
        </div>
      </div>
      
      <svg width={size} height={size * 0.6} viewBox="0 0 180 110">
        <path
          d={createArc(0, 180)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {quotedPercent > 0 && (
          <path
            d={createArc(soldAngle, soldAngle + quotedAngle)}
            fill="none"
            stroke="#4ade80"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        
        {soldPercent > 0 && (
          <path
            d={createArc(0, soldAngle)}
            fill="none"
            stroke="#334155"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        
        {/* Goal marker tick at 100% (right end) */}
        <line
          x1={centerX + (radius - strokeWidth/2 - 2)}
          y1={centerY}
          x2={centerX + (radius + strokeWidth/2 + 2)}
          y2={centerY}
          stroke="#dc2626"
          strokeWidth={3}
          strokeLinecap="round"
        />
        
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
          <p className="text-lg font-bold text-red-600">{formatCurrency(goal)}</p>
          <p className="text-xs text-slate-500">Goal</p>
        </div>
      </div>
    </div>
  );
}
