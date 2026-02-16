/**
 * HQ𝕏 Logo — 4-point sparkle star icon.
 * Matches Flaticon sparkle_8800631 style. Color via className (currentColor).
 */
export function LogoIcon({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
    >
      <path d="M12 1C12 1 13.5 7.5 15 9C16.5 10.5 23 12 23 12C23 12 16.5 13.5 15 15C13.5 16.5 12 23 12 23C12 23 10.5 16.5 9 15C7.5 13.5 1 12 1 12C1 12 7.5 10.5 9 9C10.5 7.5 12 1 12 1Z" />
    </svg>
  );
}

export function LogoFull({ height = 36, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoIcon size={height} className="text-accent" />
      <span
        className="font-bold text-gradient"
        style={{ fontSize: height * 0.5, lineHeight: 1 }}
      >
        {'HQ\u{1D54F}'}
      </span>
    </div>
  );
}
