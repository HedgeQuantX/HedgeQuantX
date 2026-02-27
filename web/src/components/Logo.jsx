/**
 * HQ𝕏 Logo — 4-point sparkle star, rotated ~45deg.
 * Thin elongated spikes with a rounded center. Color via className (currentColor).
 * Glow + shimmer effect for brilliance.
 */
export function LogoIcon({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={{ transform: 'scaleX(-1)', filter: 'drop-shadow(0 0 8px currentColor) drop-shadow(0 0 24px currentColor)' }}
    >
      <defs>
        {/* Shimmer sweep animation */}
        <linearGradient id="star-shimmer" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0">
            <animate attributeName="offset" values="-0.3;1.3" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="15%" stopColor="white" stopOpacity="0.5">
            <animate attributeName="offset" values="-0.15;1.45" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="30%" stopColor="white" stopOpacity="0">
            <animate attributeName="offset" values="0;1.6" dur="3s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <g transform="translate(256,256) rotate(-45)">
        {/* Main star shape */}
        <path d="M0,-250 C12,-80 30,-30 30,0 C30,30 12,80 0,250 C-12,80 -30,30 -30,0 C-30,-30 -12,-80 0,-250Z" fill="currentColor" />
        <path d="M-180,0 C-60,-12 -25,-25 0,-25 C25,-25 60,-12 180,0 C60,12 25,25 0,25 C-25,25 -60,12 -180,0Z" fill="currentColor" />
        {/* Shimmer overlay on vertical spike */}
        <path d="M0,-250 C12,-80 30,-30 30,0 C30,30 12,80 0,250 C-12,80 -30,30 -30,0 C-30,-30 -12,-80 0,-250Z" fill="url(#star-shimmer)" />
        {/* Shimmer overlay on horizontal spike */}
        <path d="M-180,0 C-60,-12 -25,-25 0,-25 C25,-25 60,-12 180,0 C60,12 25,25 0,25 C-25,25 -60,12 -180,0Z" fill="url(#star-shimmer)" />
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
