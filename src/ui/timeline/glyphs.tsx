type P = React.SVGProps<SVGSVGElement>;

/** The six-point star from the Chicago flag. */
export const FlagStar = (p: P) => (
  <svg viewBox="-10 -10 20 20" aria-hidden="true" {...p}>
    <path
      fill="currentColor"
      d="M0 -9L2.16 -3.74L8.28 -4.5L4.32 0L8.28 4.5L2.16 3.74L0 9L-2.16 3.74L-8.28 4.5L-4.32 0L-8.28 -4.5L-2.16 -3.74Z"
    />
  </svg>
);

/** A miniature Chicago flag: two light-blue bars, four red stars. */
export const MiniFlag = (p: P) => (
  <svg viewBox="0 0 60 40" aria-hidden="true" {...p}>
    <rect width="60" height="40" rx="3" fill="var(--panel)" stroke="var(--line)" />
    <rect y="8" width="60" height="5" fill="var(--lake)" />
    <rect y="27" width="60" height="5" fill="var(--lake)" />
    {[12, 24, 36, 48].map((x) => (
      <path
        key={x}
        transform={`translate(${x} 20) scale(.42)`}
        fill="var(--red)"
        d="M0 -9L2.16 -3.74L8.28 -4.5L4.32 0L8.28 4.5L2.16 3.74L0 9L-2.16 3.74L-8.28 4.5L-4.32 0L-8.28 -4.5L-2.16 -3.74Z"
      />
    ))}
  </svg>
);

const st = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A scrubber: a rail with a thumb and a drag arrow. */
export const ScrubGlyph = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...st}>
    <path d="M3 15h18" />
    <circle cx="13" cy="15" r="3" fill="currentColor" />
    <path d="M9 7H17M15 5l2 2-2 2M11 5 9 7l2 2" />
  </svg>
);

export const TapGlyph = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...st}>
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1a1.5 1.5 0 0 1 3 0v1m0 0a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4.5 15a1.6 1.6 0 0 1 2.5-2l2 2" />
  </svg>
);

export const ReplayGlyph = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...st}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
