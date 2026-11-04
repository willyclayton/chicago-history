/* Chicago Time Map service worker. Hand-written; registered only in production builds
 * (src/lib/sw.ts). At build time vite.config.ts fills in VERSION (a hash of the build)
 * and SHELL (the files to precache), so every deploy installs a fresh worker.
 *
 *  - Page (index.html): network first, revalidated (no HTTP cache), cached copy offline.
 *  - assets/ (content-hashed JS/CSS): cache first, in a cache shared across versions so
 *    a page opened before a deploy can still lazy-load its own chunks.
 *  - media/ photos: cache first, capped. Their URLs carry ?v=<hash>, so they never go stale.
 *  - Map tiles, glyphs and fonts: stale-while-revalidate, capped.
 */
const VERSION = "dev"; // @build:version
const SHELL = []; // @build:shell

const SHELL_CACHE = "ctm-shell-" + VERSION;
const ASSETS = "ctm-assets";
const MEDIA = "ctm-media";
const TILES = "ctm-tiles";
const FONTS = "ctm-fonts";
const LIMIT = { [ASSETS]: 160, [MEDIA]: 300, [TILES]: 600, [FONTS]: 40 };
const HOUR = 3600e3;
const DAY = 24 * HOUR;

const scope = new URL(self.registration.scope);
const here = (p) => new URL(p, scope).href;
const INDEX = here("./");
const isHashed = (url) => url.startsWith(here("assets/"));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const assets = await caches.open(ASSETS);
      await Promise.all(
        SHELL.map(async (p) => {
          const url = here(p);
          if (isHashed(url)) {
            if (await assets.match(url)) return;
            // content-hashed, so the HTTP cache (likely holding it already) is safe to use
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.status + " " + url);
            await assets.put(url, res);
          } else {
            const res = await fetch(url, { cache: "no-cache" });
            if (!res.ok) throw new Error(res.status + " " + url);
            await shell.put(url, await clean(res));
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
      for (const key of await caches.keys()) {
        if (key.startsWith("ctm-shell-") && key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "version") event.source?.postMessage({ version: VERSION });
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === scope.origin) {
    if (!url.pathname.startsWith(scope.pathname)) return;
    const rest = url.pathname.slice(scope.pathname.length);
    if (req.mode === "navigate") {
      if (rest === "" || rest === "index.html") event.respondWith(page(event));
      return;
    }
    if (rest.startsWith("assets/")) return event.respondWith(cacheFirst(event, ASSETS));
    if (rest.startsWith("media/")) return event.respondWith(cacheFirst(event, MEDIA));
    if (rest === "sw.js") return;
    return event.respondWith(shellFirst(req));
  }
  if (url.hostname === "tiles.openfreemap.org") {
    // tile and glyph URLs are versioned; the TileJSON that names the version is not
    return event.respondWith(swr(event, TILES, url.pathname.endsWith(".pbf") ? 7 * DAY : HOUR));
  }
  if (url.hostname === "fonts.googleapis.com") return event.respondWith(swr(event, FONTS, DAY));
  if (url.hostname === "fonts.gstatic.com") return event.respondWith(cacheFirst(event, FONTS));
});

/** A response without the "redirected" flag, which a navigation must not be answered with. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

const cacheable = (res) => res && res.ok && (res.type === "basic" || res.type === "cors" || res.type === "default");

async function page(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(INDEX);
  const net = fetch(event.request.url, { cache: "no-cache", credentials: "same-origin" }).then(async (res) => {
    const c = await clean(res);
    if (cacheable(c)) await cache.put(INDEX, c.clone());
    return c;
  });
  event.waitUntil(net.catch(() => {}));
  try {
    if (!cached) return await net;
    // a slow network shouldn't keep the app from opening
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error("slow")), 4000))]);
  } catch {
    return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirst(event, name) {
  const req = event.request;
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) event.waitUntil(cache.put(req, res.clone()).then(() => trim(name)).catch(() => {}));
  return res;
}

async function shellFirst(req) {
  const hit = await caches.match(req, { cacheName: SHELL_CACHE });
  return hit || fetch(req);
}

/** Serve the cached copy at once; refetch it in the background once it is older than `maxAge`. */
async function swr(event, name, maxAge) {
  const req = event.request;
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const refresh = () =>
    // its own request: the page may abort the original (MapLibre cancels tiles it no longer needs)
    fetch(new Request(req.url, { mode: "cors", credentials: "omit" })).then(async (res) => {
      if (cacheable(res)) {
        const headers = new Headers(res.headers);
        headers.set("sw-fetched", String(Date.now()));
        const copy = new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers });
        await cache.put(req, copy);
        trim(name);
      }
      return res;
    });
  if (hit) {
    const age = Date.now() - Number(hit.headers.get("sw-fetched") || 0);
    if (age > maxAge) event.waitUntil(refresh().catch(() => {}));
    return hit;
  }
  return refresh().catch(() => fetch(req));
}

const trimming = new Set();
async function trim(name) {
  if (trimming.has(name)) return;
  trimming.add(name);
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    // oldest first
    for (let i = 0; i < keys.length - LIMIT[name]; i++) await cache.delete(keys[i]);
  } finally {
    trimming.delete(name);
  }
}
