/**
 * Data access for the story's photos and history, shared by the story card (main bundle)
 * and the lazily loaded media UI and viewer. Kept tiny on purpose.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { hasHistory, loadHistory, type SiteHistory } from "../../data/history";
import { loadMedia, loadMediaIndex, mediaUrl, type MediaImage, type MediaIndex, type MediaKind } from "../../data/media";

/** `?mediaDemo` in the URL swaps generated placeholder photos in for a few sites. Never otherwise. */
export const isMediaDemo = () => {
  try {
    return new URLSearchParams(location.search).has("mediaDemo");
  } catch {
    return false;
  }
};

const mediaCache = new Map<string, MediaImage[]>();
const mediaPending = new Map<string, Promise<MediaImage[]>>();
let indexReady: MediaIndex | null = null;
let demoMod: typeof import("./demoMedia") | null = null;
const byYear = (items: MediaImage[]) => items.slice().sort((a, b) => a.year - b.year);

/** Fetch the photo index once the page is idle, so opening a story shows its photos at once. */
export function prefetchMedia() {
  if (typeof window === "undefined") return;
  const go = () => {
    loadMediaIndex()
      .then((i) => (indexReady = i))
      .catch(() => {});
    if (isMediaDemo()) import("./demoMedia").then((m) => (demoMod = m));
  };
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 2500);
}

/** A site's photos, oldest first. Under `?mediaDemo`, demo items for the demo sites. */
export function getMedia(siteId: string): Promise<MediaImage[]> {
  let p = mediaPending.get(siteId);
  if (!p) {
    const real = () =>
      loadMedia(siteId).then((items) => {
        loadMediaIndex().then((i) => (indexReady = i));
        return items;
      });
    const load = isMediaDemo()
      ? import("./demoMedia").then((m) => {
          demoMod = m;
          return m.demoMedia(siteId) ?? real();
        })
      : real();
    p = load
      .catch(() => [] as MediaImage[])
      .then((items) => {
        mediaCache.set(siteId, items);
        return items;
      });
    mediaPending.set(siteId, p);
  }
  return p;
}

/** Photos for a site if they can be had without waiting (cached, or the index is already in). */
export function peekMedia(siteId: string): MediaImage[] | null {
  const hit = mediaCache.get(siteId);
  if (hit) return hit;
  let items: MediaImage[] | null = null;
  if (isMediaDemo()) {
    if (!demoMod) return null;
    items = demoMod.demoMedia(siteId);
  }
  if (!items && indexReady) items = byYear(indexReady[siteId] ?? []);
  if (items) mediaCache.set(siteId, items);
  return items;
}

/** null while loading, then the site's photos (often an empty list). */
export function useSiteMedia(siteId: string): MediaImage[] | null {
  const [state, setState] = useState<{ id: string; items: MediaImage[] | null }>(() => ({ id: siteId, items: peekMedia(siteId) }));
  useEffect(() => {
    let live = true;
    const hit = peekMedia(siteId);
    if (hit) setState({ id: siteId, items: hit });
    else getMedia(siteId).then((items) => live && setState({ id: siteId, items }));
    return () => {
      live = false;
    };
  }, [siteId]);
  return state.id === siteId ? state.items : peekMedia(siteId);
}

const histCache = new Map<string, SiteHistory | null>();

/** The site's researched chronology, or null (none written yet, or still loading). */
export function useSiteHistory(siteId: string): SiteHistory | null {
  const [state, setState] = useState<{ id: string; h: SiteHistory | null }>(() => ({ id: siteId, h: histCache.get(siteId) ?? null }));
  useEffect(() => {
    if (!hasHistory(siteId) || histCache.has(siteId)) {
      setState({ id: siteId, h: histCache.get(siteId) ?? null });
      return;
    }
    let live = true;
    loadHistory(siteId)
      .catch(() => null)
      .then((h) => {
        histCache.set(siteId, h);
        if (live) setState({ id: siteId, h });
      });
    return () => {
      live = false;
    };
  }, [siteId]);
  return state.id === siteId ? state.h : histCache.get(siteId) ?? null;
}

/** A media path from media.generated.json, or a data:/http URL as-is. */
export const srcOf = (path: string) => (/^(data:|https?:|blob:)/.test(path) ? path : mediaUrl(path));

export const yearLabel = (m: Pick<MediaImage, "year" | "approx">) => `${m.approx ? "c. " : ""}${m.year}`;

export const isDemoImage = (m: MediaImage) => m.archive === "Demo";

/* ---------- graphic photos: blurred until someone chooses to look ---------- */

/** Photos the archive pipeline flagged as graphic (bodies, violence). */
export const isSensitive = (m: MediaImage) => !!(m as MediaImage & { sensitive?: boolean }).sensitive;

const revealed = new Set<string>();
const revealSubs = new Set<() => void>();
let revealVersion = 0;

/** Show these graphic photos, everywhere they appear, for the rest of the visit. */
export function reveal(...ids: string[]) {
  ids.forEach((id) => revealed.add(id));
  revealVersion++;
  revealSubs.forEach((f) => f());
}

/** Whether a photo should be shown blurred behind a "tap to view" cover. */
export const veiled = (m: MediaImage | null | undefined) => !!m && isSensitive(m) && !revealed.has(m.id);

/** Re-render when a graphic photo is revealed; returns `veiled`. */
export function useVeil() {
  useSyncExternalStore(
    (cb) => {
      revealSubs.add(cb);
      return () => {
        revealSubs.delete(cb);
      };
    },
    () => revealVersion,
    () => revealVersion,
  );
  return veiled;
}

export const KIND_LABEL: Record<MediaKind, string> = {
  event: "The event",
  aftermath: "Aftermath",
  place: "The place",
  construction: "Construction",
  people: "People",
  newspaper: "In the news",
  map: "Map",
  today: "Today",
};
