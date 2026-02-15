/**
 * HQ𝕏 Logo - Abstract burst icon inspired by Edel Finance style.
 * Tilted ~15deg, organic thick petals, no outlines.
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
      <g transform="translate(70,70) rotate(-15)" fill="currentColor">
        {/* 7 organic thick petals like Edel — asymmetric, flowing */}
        {/* Top-left petal (large) */}
        <path d="M-8,-8 C-15,-30 -18,-52 -6,-62 C4,-52 8,-30 4,-8Z" />
        {/* Top-right petal */}
        <path d="M8,-6 C22,-22 40,-38 52,-30 C42,-20 24,-10 6,-2Z" />
        {/* Right petal (wide) */}
        <path d="M8,2 C28,-4 50,-6 60,4 C50,14 28,10 8,6Z" />
        {/* Bottom-right petal (large) */}
        <path d="M6,8 C18,24 30,44 24,56 C14,46 6,28 2,8Z" />
        {/* Bottom petal */}
        <path d="M-2,8 C-6,30 -12,50 -22,56 C-24,44 -14,26 -6,8Z" />
        {/* Left petal (large, flowing) */}
        <path d="M-8,-2 C-30,6 -52,10 -62,2 C-52,-8 -30,-8 -8,-6Z" />
        {/* Upper petal (narrow, accent) */}
        <path d="M2,-8 C12,-26 26,-44 36,-42 C28,-30 14,-16 4,-6Z" />
        {/* Center dot */}
        <circle cx="0" cy="0" r="5" />
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
