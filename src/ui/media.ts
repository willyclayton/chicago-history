export const isWide = () => matchMedia("(min-width: 1001px)").matches;
export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
