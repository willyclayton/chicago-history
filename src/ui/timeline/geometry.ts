import { CENSUS, ERAS, MAX_YEAR, MIN_YEAR } from "../../data";

export const SPAN = MAX_YEAR - MIN_YEAR;
/** Position of a year along the rail, 0..1. */
export const frac = (y: number) => (y - MIN_YEAR) / SPAN;
export const pct = (y: number) => frac(y) * 100;
export const yearAt = (f: number) => Math.round(MIN_YEAR + Math.min(1, Math.max(0, f)) * SPAN);

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const roman = (n: number) => ROMAN[n - 1] ?? String(n);

/** Era bands from pale lake blue to deep flag red, left to right. */
export const eraColor = (i: number) =>
  `color-mix(in srgb, var(--red) ${Math.round(8 + (i / Math.max(1, ERAS.length - 1)) * 72)}%, var(--lake))`;

/** Population at a year, linearly between census counts; 0 before the first. */
export function popAt(year: number): number {
  if (!CENSUS.length || year < CENSUS[0].year) return 0;
  for (let i = CENSUS.length - 1; i >= 0; i--) {
    const c = CENSUS[i];
    if (year >= c.year) {
      const n = CENSUS[i + 1];
      if (!n) return c.population;
      return c.population + ((n.population - c.population) * (year - c.year)) / (n.year - c.year);
    }
  }
  return 0;
}

export function compactPop(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return n ? String(Math.round(n)) : "";
}

/** Population area for an SVG with viewBox 0 0 1000 100 (stretched to the rail). */
export const POP_PATH = (() => {
  if (!CENSUS.length) return { area: "", line: "" };
  const max = Math.max(...CENSUS.map((c) => c.population));
  const pts: [number, number][] = [];
  const first = CENSUS[0].year;
  pts.push([frac(first - 6) * 1000, 100]);
  for (const c of CENSUS) pts.push([frac(c.year) * 1000, 100 - (c.population / max) * 92]);
  pts.push([1000, pts[pts.length - 1][1]]);
  const f = (n: number) => n.toFixed(1);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");
  return { line, area: `${line}L1000 100L${f(pts[0][0])} 100Z` };
})();

