export const WIDE_QUERY = "(min-width: 761px)";
export const isWide = () => matchMedia(WIDE_QUERY).matches;
export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isTouch = () => matchMedia("(hover: none)").matches;
