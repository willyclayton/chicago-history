/**
 * Historical and present-day photos per site.
 *
 * Pipeline:
 *  1. src/data/media-manifest/<site-id>.json — curated candidates (MediaCandidate[]),
 *     each pointing at a specific archive record (a Wikimedia Commons file or a Library
 *     of Congress item) plus our editorial fields (year, caption, kind).
 *  2. scripts/media/build-media.mjs (runs in CI, where the archives are reachable) asks
 *     each archive's API for the license and the image, drops anything that is not
 *     public domain or openly licensed, resizes what's left into public/media/<site-id>/,
 *     and writes src/data/media.generated.json (Record<siteId, MediaImage[]>).
 *  3. The app reads only media.generated.json, so nothing is shown that the archive
 *     didn't confirm.
 */

export type MediaKind =
  | "event" // the event itself, as it happened
  | "aftermath" // right after
  | "place" // the building or site in its era
  | "construction"
  | "people"
  | "newspaper" // front pages, news photos of the coverage
  | "map"
  | "today"; // a recent photo of the spot

/** An entry in src/data/media-manifest/<site-id>.json */
export interface MediaCandidate {
  source: "commons" | "loc";
  /** Commons: the exact file title, "File:Iroquois Theater fire 1903.jpg".
   *  LOC: the item URL, "https://www.loc.gov/item/2016823114/" (or pictures/item). */
  ref: string;
  /** Year the photo was taken (best estimate). */
  year: number;
  approx?: boolean;
  /** Our caption: what you're looking at, one sentence. */
  caption: string;
  kind: MediaKind;
  /** Images that show the same view (e.g. the same facade) share a key, so the
   *  then-and-now scrubber can blend them. */
  sameView?: string;
  /** Where the candidate was found and anything to double-check. Not shown. */
  note?: string;
}

/** A verified, downloaded image, as written to media.generated.json. */
export interface MediaImage {
  id: string; // `${siteId}-${n}`
  siteId: string;
  /** Paths relative to the site root (no leading slash), e.g. "media/valentine/1-1280.jpg". */
  src: string;
  thumb: string;
  width: number;
  height: number;
  year: number;
  approx?: boolean;
  caption: string;
  kind: MediaKind;
  sameView?: string;
  /** Photographer or publisher, as the archive gives it. */
  credit: string;
  /** "Public domain", "No known restrictions", "CC BY-SA 4.0", ... */
  license: string;
  licenseUrl?: string;
  /** The archive record page. */
  sourceUrl: string;
  /** Archive name for the credit line: "Wikimedia Commons", "Library of Congress". */
  archive: string;
}

export type MediaIndex = Record<string, MediaImage[]>;

let index: Promise<MediaIndex> | null = null;

/** All verified media, loaded once on first use (kept out of the first-load bundle). */
export function loadMediaIndex(): Promise<MediaIndex> {
  index ??= import("./media.generated.json").then((m) => (m.default ?? m) as MediaIndex);
  return index;
}

export async function loadMedia(siteId: string): Promise<MediaImage[]> {
  const all = await loadMediaIndex();
  return (all[siteId] ?? []).slice().sort((a, b) => a.year - b.year);
}

/** Resolve a media path against the deployed base URL. */
export const mediaUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
