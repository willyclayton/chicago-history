export function readHash(valid: (id: string) => boolean): string | null {
  const h = decodeURIComponent(location.hash.slice(1));
  return h && valid(h) ? h : null;
}

export function writeHash(id: string | null) {
  try {
    const url = location.pathname + location.search + (id ? "#" + id : "");
    history.replaceState(null, "", url);
  } catch {
    /* sandboxed frames can refuse replaceState */
  }
}
