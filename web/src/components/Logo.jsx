/**
 * HQ𝕏 Logo — 4-point sparkle star, rotated ~45deg.
 * Thin elongated spikes with a rounded center. Color via className (currentColor).
 */
export function LogoIcon({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      style={{ transform: 'scaleX(-1)' }}
    >
      <g transform="translate(256,256) rotate(-45)">
        {/* Vertical spike — long */}
        <path d="M0,-250 C12,-80 30,-30 30,0 C30,30 12,80 0,250 C-12,80 -30,30 -30,0 C-30,-30 -12,-80 0,-250Z" />
        {/* Horizontal spike — shorter */}
        <path d="M-180,0 C-60,-12 -25,-25 0,-25 C25,-25 60,-12 180,0 C60,12 25,25 0,25 C-25,25 -60,12 -180,0Z" />
      </g>
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
