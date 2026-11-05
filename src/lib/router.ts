/**
 * App navigation on the browser's history, so Back works like in a native app.
 *
 * Three levels, each with its own URL:
 *   0  the site list          (no hash)
 *   1  a story                #<site-id>
 *   2  the photo viewer       #<site-id>/photo/<n>   (n counts from 1)
 *
 * The URL follows the store: going a level deeper pushes a history entry, staying on a
 * level (stepping between sites, swiping photos) replaces it, and coming back up goes
 * back through our own entries, so the stack never grows. Back and Forward drive the
 * store the other way. Each entry remembers the levels below it (history.state.ctm),
 * which survives reloads, so the router never goes back past the app.
 */
import { SITE_BY_ID } from "../data";
import { actions, getState, subscribe, type State } from "../state/store";
import { isWide } from "../ui/media";
import { haptic } from "./haptics";
import { setHashWriter } from "./hash";

export interface Route {
  id: string | null;
  /** Photo index (0-based) when the viewer is open. */
  photo: number | null;
}

const validSite = (id: string) => Object.prototype.hasOwnProperty.call(SITE_BY_ID, id);

export function parseRoute(hash: string, valid: (id: string) => boolean = validSite): Route {
  let h = "";
  try {
    h = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return { id: null, photo: null };
  }
  const [id, part, n] = h.split("/");
  if (!id || !valid(id)) return { id: null, photo: null };
  const photo = part === "photo" && /^\d{1,4}$/.test(n ?? "") && Number(n) >= 1 ? Number(n) - 1 : null;
  return { id, photo };
}

export function formatRoute(r: Route): string {
  if (!r.id) return "";
  return "#" + encodeURIComponent(r.id) + (r.photo == null ? "" : `/photo/${r.photo + 1}`);
}

export const routeLevel = (r: Route) => (!r.id ? 0 : r.photo == null ? 1 : 2);

export function routeOf(s: Pick<State, "selectedId" | "viewer">): Route {
  if (s.viewer) return { id: s.viewer.siteId, photo: s.viewer.index };
  return { id: s.selectedId, photo: null };
}

/** Show a route in the store. */
export function applyRoute(r: Route) {
  const s = getState();
  if (!r.id) {
    if (s.viewer) actions.closeViewer();
    if (s.selectedId) actions.clear();
    return;
  }
  if (s.selectedId !== r.id) {
    actions.stop();
    actions.select(r.id, { pan: true, sheet: isWide() || s.sheet !== "peek" ? undefined : "half" });
  }
  const v = getState().viewer;
  if (r.photo != null) {
    if (!v || v.siteId !== r.id) actions.openViewer(r.id, r.photo);
    else if (v.index !== r.photo) actions.setViewerIndex(r.photo);
  } else if (v) actions.closeViewer();
}

type Entry = { ctm?: unknown } | null;
const chainOf = (st: Entry): number[] | null => {
  const c = st && typeof st === "object" ? st.ctm : null;
  return Array.isArray(c) && c.length > 0 && c.every((x) => x === 0 || x === 1 || x === 2) ? (c as number[]) : null;
};

/** Start the router: read the URL into the store, then keep the two in step. Returns a stop function. */
export function startRouter(): () => void {
  if (typeof history === "undefined" || typeof location === "undefined") return () => {};
  try {
    history.scrollRestoration = "manual";
  } catch {
    /* read-only in some embeds */
  }
  setHashWriter(() => {}); // the router writes the URL from the store instead

  let applying = false;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const here = () => location.pathname + location.search + location.hash;
  const urlFor = (r: Route) => location.pathname + location.search + formatRoute(r);
  const write = (kind: "push" | "replace", r: Route, chain: number[]) => {
    const prev = history.state && typeof history.state === "object" && kind === "replace" ? history.state : {};
    try {
      if (kind === "push") history.pushState({ ctm: chain }, "", urlFor(r));
      else history.replaceState({ ...prev, ctm: chain }, "", urlFor(r));
    } catch {
      /* sandboxed frames; Safari's rate limit */
    }
  };

  /** Go back `n` of our own entries; the popstate that follows reconciles again. */
  const back = (n: number) => {
    pending = setTimeout(() => {
      // the browser ignored us (some embeds do): just make this entry right
      pending = null;
      const r = routeOf(getState());
      write("replace", r, [routeLevel(r)]);
    }, 1500);
    history.go(-n);
  };

  /** Store -> URL. */
  const sync = () => {
    if (applying || pending) return;
    const r = routeOf(getState());
    const d = routeLevel(r);
    const chain = chainOf(history.state) ?? [routeLevel(parseRoute(location.hash))];
    const c = chain[chain.length - 1];
    if (d > c) {
      write("push", r, [...chain, d]);
      if (!getState().playing) haptic(d === 2 ? 10 : 8);
    } else if (d === c) {
      if (urlFor(r) !== here() || !chainOf(history.state)) write("replace", r, chain);
    } else {
      let j = chain.length - 1;
      while (j >= 0 && chain[j] > d) j--;
      if (j >= 0 && chain[j] === d) back(chain.length - 1 - j);
      else if (j >= 0) write("replace", r, [...chain.slice(0, -1), d]);
      else if (chain.length > 1) back(chain.length - 1);
      else write("replace", r, [d]);
    }
  };

  /** URL -> store, then make the entry's URL and levels match what is shown. */
  const show = (r: Route) => {
    applying = true;
    try {
      applyRoute(r);
    } finally {
      applying = false;
    }
    const now = routeOf(getState());
    const d = routeLevel(now);
    const chain = chainOf(history.state);
    const next = chain ? (chain[chain.length - 1] === d ? chain : [...chain.slice(0, -1), d]) : [d];
    if (!chain || next !== chain || urlFor(now) !== here()) write("replace", now, next);
  };

  const onPop = () => {
    if (pending) {
      clearTimeout(pending);
      pending = null;
      sync();
      return;
    }
    show(parseRoute(location.hash));
  };

  // first load
  const start = parseRoute(location.hash);
  if (!chainOf(history.state) && routeLevel(start) === 2) {
    // a shared photo link: put its story underneath, so Back closes the photo first
    show({ id: start.id, photo: null });
    applying = true;
    try {
      applyRoute(start);
    } finally {
      applying = false;
    }
    write("push", start, [1, 2]);
  } else show(start);

  const unsub = subscribe(sync);
  addEventListener("popstate", onPop);
  return () => {
    unsub();
    removeEventListener("popstate", onPop);
    if (pending) clearTimeout(pending);
    setHashWriter(null);
  };
}
