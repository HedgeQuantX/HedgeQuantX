/**
 * HQX Score — Radar (Spider) Chart + Score Ring
 * 6 axes: Win Rate, Profit Factor, Consistency, Risk Management, Volume, Returns
 * All data from real Rithmic API via calculateHQXScore()
 */

function gradeColor(grade) {
  switch (grade?.toUpperCase()) {
    case 'S': return '#00e5ff';
    case 'A': return '#00e5ff';
    case 'B': return '#ffd600';
    case 'C': return '#ffd600';
    case 'D': return '#d4006a';
    case 'F': return '#d4006a';
    default: return '#8888aa';
  }
}

const RADAR_LABELS = ['Win Rate', 'Profit Factor', 'Consistency', 'Risk Mgmt', 'Volume', 'Returns'];

function polarToXY(angle, radius, cx, cy) {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function RadarChart({ breakdown, color }) {
  const cx = 100, cy = 100, maxR = 75;
  const axes = RADAR_LABELS.length;
  const angleStep = 360 / axes;
  const values = RADAR_LABELS.map((_, i) => (breakdown?.[i]?.score ?? 0) / 100);

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];
  const gridLines = rings.map((r) => {
    const pts = [];
    for (let i = 0; i < axes; i++) {
      const p = polarToXY(i * angleStep, maxR * r, cx, cy);
      pts.push(`${p.x},${p.y}`);
    }
    return pts.join(' ');
  });

  // Axis lines
  const axisEnds = Array.from({ length: axes }, (_, i) => polarToXY(i * angleStep, maxR, cx, cy));

  // Data polygon
  const dataPts = values.map((v, i) => {
    const p = polarToXY(i * angleStep, maxR * Math.max(v, 0.05), cx, cy);
    return `${p.x},${p.y}`;
  }).join(' ');

  // Labels
  const labelPts = RADAR_LABELS.map((label, i) => {
    const p = polarToXY(i * angleStep, maxR + 18, cx, cy);
    return { ...p, label };
  });

  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      {/* Grid rings */}
      {gridLines.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="#1a1a35" strokeWidth="0.5" />
      ))}
      {/* Axis lines */}
      {axisEnds.map((end, i) => (
        <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#1a1a35" strokeWidth="0.5" />
      ))}
      {/* Data polygon */}
      <polygon points={dataPts} fill={`${color}20`} stroke={color} strokeWidth="1.5" />
      {/* Data points */}
      {values.map((v, i) => {
        const p = polarToXY(i * angleStep, maxR * Math.max(v, 0.05), cx, cy);
        return <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />;
      })}
      {/* Labels */}
      {labelPts.map((p, i) => (
        <text
          key={i} x={p.x} y={p.y}
          textAnchor="middle" dominantBaseline="middle"
          fill="#8888aa" fontSize="5.5" fontFamily="Rajdhani, sans-serif" fontWeight="600"
          style={{ textTransform: 'uppercase' }}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

export default function HQXScore({ score, grade, breakdown }) {
  // No data — show empty state, no chart
  if (score == null && grade == null) {
    return (
      <div className="bg-bg-card border border-border-default rounded-lg p-5 animate-slide-up">
        <h3 className="text-sm font-medium text-text-primary mb-4">HQ𝕏 Score</h3>
        <div className="flex flex-col items-center justify-center py-8">
          <span className="text-3xl font-bold font-mono-nums text-text-dim">—</span>
          <p className="text-xs text-text-dim mt-2">No trading data available</p>
        </div>
      </div>
    );
  }

  const pct = score != null ? Math.min(Math.max(score, 0), 100) : 0;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const color = gradeColor(grade);

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-5 animate-slide-up">
      <h3 className="text-sm font-medium text-text-primary mb-4">HQ𝕏 Score</h3>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4 items-center">
        {/* Radar chart */}
        <div className="w-full max-w-[280px] mx-auto aspect-square">
          <RadarChart breakdown={breakdown} color={color} />
        </div>

        {/* Score ring */}
        <div className="flex flex-col items-center">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r={radius} fill="none" stroke="#1a1a35" strokeWidth="6" />
              <circle
                cx="45" cy="45" r={radius} fill="none"
                stroke={color} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={score != null ? strokeDashoffset : circumference}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono-nums" style={{ color }}>
                {grade ?? '—'}
              </span>
              <span className="text-[10px] text-text-muted font-mono-nums">
                {score != null ? `${score}/100` : '—'}
              </span>
            </div>
          </div>

          {/* Breakdown list */}
          {breakdown && breakdown.length > 0 && (
            <div className="mt-3 space-y-1 w-full">
              {breakdown.map((b) => (
                <div key={b.name} className="flex items-center justify-between text-[10px]">
                  <span className="text-text-muted truncate mr-2">{b.name}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1 rounded-full bg-[#1a1a35] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${b.score}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="font-mono-nums text-text-dim w-6 text-right">{Math.round(b.score)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
