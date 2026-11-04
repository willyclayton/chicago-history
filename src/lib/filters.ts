import type { CategoryId, Site } from "../types";

/** Lowercase and strip accents, for case- and accent-insensitive matching. */
export function norm(s: string | number): string {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function searchText(site: Site, categoryName: Record<string, string>): string {
  return norm(
    [site.title, site.short, site.address, site.story, site.today, site.date, site.year, categoryName[site.category]].join(" "),
  );
}

export interface Filter {
  cats: ReadonlySet<CategoryId>;
  /** Already normalized query. */
  query: string;
}

export function makeMatcher(categoryName: Record<string, string>) {
  const cache = new Map<string, string>();
  return (site: Site, f: Filter): boolean => {
    if (!f.cats.has(site.category)) return false;
    if (!f.query) return true;
    let t = cache.get(site.id);
    if (t === undefined) cache.set(site.id, (t = searchText(site, categoryName)));
    return t.includes(f.query);
  };
}

/**
 * Chip tap logic.
 * - "all" resets to every category.
 * - With all on, tapping a category shows only that category.
 * - Otherwise taps add or remove; if none are left, reset to all.
 */
export function toggleCategory(
  current: ReadonlySet<CategoryId>,
  tapped: CategoryId | "all",
  all: readonly CategoryId[],
): Set<CategoryId> {
  if (tapped === "all") return new Set(all);
  if (current.size === all.length) return new Set([tapped]);
  const next = new Set(current);
  if (next.has(tapped)) {
    next.delete(tapped);
    if (next.size === 0) return new Set(all);
  } else next.add(tapped);
  return next;
}

/**
 * The site to step to from the current selection (or from the slider year when nothing
 * in the filtered list is selected). `ordered` must be the filtered sites in timeline order.
 */
export function stepTarget(ordered: Site[], selectedId: string | null, year: number, dir: 1 | -1): Site | null {
  if (!ordered.length) return null;
  let i = ordered.findIndex((s) => s.id === selectedId);
  if (i < 0) {
    if (dir > 0) {
      const after = ordered.findIndex((s) => s.year > year);
      i = (after < 0 ? ordered.length : after) - 1;
    } else {
      const atOrAfter = ordered.findIndex((s) => s.year >= year);
      i = atOrAfter < 0 ? ordered.length : atOrAfter;
    }
  }
  return ordered[Math.min(Math.max(i + dir, 0), ordered.length - 1)] ?? null;
}

/** The 1871 burn area shows from 1871 to 1874, or whenever the fire is selected. */
export function burnVisible(year: number, selectedId: string | null, from = 1871, to = 1874): boolean {
  return selectedId === "fire" || (year >= from && year <= to);
}

/** Sites from the 10 years before the slider year pulse; off at the current year. */
export function isRecent(site: Site, year: number, maxYear: number): boolean {
  return year < maxYear && site.year <= year && year - site.year <= 10;
}
