import { getState, type Detent } from "../state/store";

/** Phone bottom-sheet heights, in px. A story's peek is a little taller to fit its title. */
export function sheetHeight(d: Detent): number {
  const h = window.innerHeight;
  if (d === "peek") return getState().selectedId ? 206 : 178;
  if (d === "half") return Math.round(h * 0.52);
  return h - 140; // leaves the timeline dock at the top of the screen in view
}

/**
 * Height for a raw drag position: free between peek and full, with rubber-band
 * resistance past either end so the sheet feels like it has weight.
 */
export function rubberBand(px: number): number {
  const lo = sheetHeight("peek");
  const hi = sheetHeight("full");
  const band = (over: number) => (over * 0.5) / (1 + over / 160);
  if (px > hi) return hi + band(px - hi);
  if (px < lo) return lo - band(lo - px);
  return px;
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
