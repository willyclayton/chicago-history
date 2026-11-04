import type { CensusCount } from "../types";

/** Latest decennial count at or before the given year, or null before the first census. */
export function censusAt(year: number, census: CensusCount[]): CensusCount | null {
  let best: CensusCount | null = null;
  for (const c of census) if (c.year <= year && (!best || c.year > best.year)) best = c;
  return best;
}

export function censusLine(year: number, census: CensusCount[]): string {
  const c = censusAt(year, census);
  return c
    ? `${c.population.toLocaleString("en-US")} people · ${c.year} census`
    : "Before the first census count";
}
