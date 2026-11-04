import type { Detent } from "../state/store";

/** Phone bottom-sheet heights, in px. */
export function sheetHeight(d: Detent): number {
  const h = window.innerHeight;
  if (d === "peek") return 178;
  if (d === "half") return Math.round(h * 0.5);
  return h - 100;
}

export function nearestDetent(px: number, velocity: number): Detent {
  // a quick flick moves one detent in the flick direction
  const order: Detent[] = ["peek", "half", "full"];
  const hs = order.map(sheetHeight);
  let i = hs.reduce((best, v, k) => (Math.abs(v - px) < Math.abs(hs[best] - px) ? k : best), 0);
  if (Math.abs(velocity) > 0.5) {
    const dir = velocity > 0 ? 1 : -1; // positive = growing
    const above = hs.findIndex((v) => v > px + 1);
    const below = hs.map((v, k) => [v, k] as const).filter(([v]) => v < px - 1).pop()?.[1];
    i = dir > 0 ? (above < 0 ? 2 : above) : (below ?? 0);
  }
  return order[i];
}
