/**
 * HQ𝕏 Logo - Abstract burst icon inspired by Edel Finance style.
 * Pure SVG paths, no external font dependencies.
 */
export function LogoIcon({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 140 140"
      width={size}
      height={size}
      className={className}
    >
      <g transform="translate(70,70)" fill="currentColor">
        <path d="M0,-60 C5,-38 7,-20 0,-7 C-7,-20 -5,-38 0,-60Z" />
        <path d="M42.4,-42.4 C27,-29 15,-17 5,-5 C-2,-19 14,-34 42.4,-42.4Z" />
        <path d="M60,0 C38,5 20,7 7,0 C20,-7 38,-5 60,0Z" />
        <path d="M42.4,42.4 C29,27 17,15 5,5 C19,-2 34,14 42.4,42.4Z" />
        <path d="M0,60 C-5,38 -7,20 0,7 C7,20 5,38 0,60Z" />
        <path d="M-42.4,42.4 C-27,29 -15,17 -5,5 C2,19 -14,34 -42.4,42.4Z" />
        <path d="M-60,0 C-38,-5 -20,-7 -7,0 C-20,7 -38,5 -60,0Z" />
        <path d="M-42.4,-42.4 C-29,-27 -17,-15 -5,-5 C-19,2 -34,-14 -42.4,-42.4Z" />
        <circle cx="0" cy="0" r="5.5" />
      </g>
    </svg>
  );
}

export function LogoFull({ height = 36, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoIcon size={height} className="text-accent" />
      <span
        className="font-bold text-gradient font-mono-nums"
        style={{ fontSize: height * 0.5, lineHeight: 1 }}
      >
        {'HQ\u{1D54F}'}
      </span>
    </div>
  );
}
