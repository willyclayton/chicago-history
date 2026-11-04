import type { Era } from "../types";

export function eraOf(year: number, eras: Era[]): Era {
  return eras.find((e) => year >= e.from && year <= e.to) ?? eras[eras.length - 1];
}
