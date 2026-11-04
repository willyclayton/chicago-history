import sitesJson from "./sites.json";
import categoriesJson from "./categories.json";
import erasJson from "./eras.json";
import censusJson from "./census.json";
import overlaysJson from "./overlays.geojson";
import type { Category, CensusCount, Era, Site } from "../types";

export const MIN_YEAR = 1780;
export const MAX_YEAR = new Date().getFullYear();

export const SITES = sitesJson as Site[];
export const CATEGORIES = categoriesJson as Category[];
export const CENSUS = censusJson as CensusCount[];
export const OVERLAYS = overlaysJson as GeoJSON.FeatureCollection;

/** The last era always runs to the current year. */
export const ERAS: Era[] = (erasJson as Era[]).map((e, i, all) =>
  i === all.length - 1 ? { ...e, to: Math.max(e.to, MAX_YEAR) } : e,
);

export const CATEGORY_NAME: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.name]),
);

/** Sites in timeline order: by year, then title. */
export const ORDERED: Site[] = SITES.slice().sort(
  (a, b) => a.year - b.year || a.title.localeCompare(b.title),
);

export const SITE_BY_ID: Record<string, Site> = Object.fromEntries(SITES.map((s) => [s.id, s]));
