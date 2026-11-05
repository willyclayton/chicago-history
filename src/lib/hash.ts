/**
 * The URL hash: `#<site-id>` for a story, `#<site-id>/photo/<n>` for the photo viewer.
 * In the app the router (src/lib/router.ts) owns the URL and keeps the back stack; these
 * helpers are the fallback the store uses when no router is running (tests, embeds).
 */

/** The site id at the start of the hash, if it is a valid one. */
export function readHash(valid: (id: string) => boolean): string | null {
  let h = "";
  try {
    h = decodeURIComponent(location.hash.slice(1));
  } catch {
    return null;
  }
  const id = h.split("/")[0];
  return id && valid(id) ? id : null;
}

type Writer = (id: string | null) => void;
let writer: Writer | null = null;

/** Hand URL writing to someone else (the router), or back with null. */
export function setHashWriter(w: Writer | null) {
  writer = w;
}

export function writeHash(id: string | null) {
  if (writer) return writer(id);
  try {
    const url = location.pathname + location.search + (id ? "#" + id : "");
    history.replaceState(history.state, "", url);
  } catch {
    /* sandboxed frames can refuse replaceState; no location outside a browser */
  }
}
