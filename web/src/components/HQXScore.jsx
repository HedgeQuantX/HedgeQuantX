function gradeColor(grade) {
  switch (grade?.toUpperCase()) {
    case 'S':
      return '#00e5ff';
    case 'A':
      return '#00e5ff';
    case 'B':
      return '#ffd600';
    case 'C':
      return '#ffd600';
    case 'D':
      return '#d4006a';
    case 'F':
      return '#d4006a';
    default:
      return '#8888aa';
  }
}

export default function HQXScore({ score, grade }) {
  const pct = score != null ? Math.min(Math.max(score, 0), 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const color = gradeColor(grade);

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-6 flex flex-col items-center animate-slide-up">
      <h3 className="text-sm font-medium text-text-primary mb-4">HQ𝕏 Score</h3>
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#1a1a35"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={score != null ? strokeDashoffset : circumference}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold font-mono-nums"
            style={{ color }}
          >
            {grade ?? '—'}
          </span>
          <span className="text-xs text-text-muted font-mono-nums mt-0.5">
            {score != null ? `${score}/100` : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
