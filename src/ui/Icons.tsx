const s = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
type P = React.SVGProps<SVGSVGElement>;

export const SearchIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const PlayIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor" /></svg>
);
export const PauseIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><rect x="5.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /><rect x="14" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /></svg>
);
export const ChevronLeft = (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><path d="m15 18-6-6 6-6" /></svg>;
export const ChevronRight = (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><path d="m9 18 6-6-6-6" /></svg>;
export const CloseIcon = (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const ShareIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
);
export const ShuffleIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
);
export const MoonIcon = (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></svg>;
export const SunIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const FitIcon = (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>;
export const KeyboardIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>
);
export const StreetIcon = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p} {...s}><circle cx="12" cy="5" r="2.5" /><path d="M12 8v7M9 21l3-6 3 6M8 12h8" /></svg>
);
