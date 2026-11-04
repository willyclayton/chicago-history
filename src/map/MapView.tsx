import { useEffect, useRef, useState } from "react";
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MlMap,
  SymbolLayerSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { CATEGORIES, CATEGORY_NAME, MAX_YEAR, OVERLAYS, SITES, SITE_BY_ID } from "../data";
import { burnVisible, isRecent } from "../lib/filters";
import { actions, getState, matches, subscribe, useStore, type State } from "../state/store";
import type { CategoryId, Site } from "../types";
import { basemapLayers, basemapStyle, FONT_BOLD, FONT_ITALIC, type MapTokens } from "./styles/basemap";
import { hatchPattern, starSdf, STAR_PIXEL_RATIO } from "./starIcon";
import { getMapUi, subscribeMapUi } from "./mapUi";
import { isTouch, isWide, prefersReducedMotion } from "../ui/media";
import { sheetHeight } from "../ui/sheet";
import { CloseIcon, FitIcon, MinusIcon, PlusIcon, TargetIcon } from "../ui/Icons";

export const START_CENTER: [number, number] = [-87.638, 41.887];
export const START_ZOOM = 13;
const SELECT_ZOOM = 15;
const STAR_RADIUS = 8; // CSS px, matches the prototype's marker
const FADE_MS = 260;
const BURST_MS = 900;
/** Below this zoom, stars that would sit on top of each other merge into numbered clusters. */
const CLUSTER_BELOW = 12;
/** Stars closer than this (in screen px at the clustering zoom) merge. */
const CLUSTER_PX = 30;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function readTokens(): MapTokens {
  return {
    land: css("--land"),
    lake: css("--lake"),
    river: css("--river"),
    street: css("--street"),
    artery: css("--artery"),
    made: css("--made"),
    building: css("--building"),
    label: css("--label"),
    labelHalo: css("--label-halo"),
    lakeLabel: css("--lakelabel"),
    ink: css("--ink"),
    muted: css("--muted"),
    line: css("--line"),
  };
}

function categoryColor(): ExpressionSpecification {
  const pairs = CATEGORIES.flatMap((c) => [c.id, css(`--c-${c.id}`)]);
  return ["match", ["get", "cat"], ...pairs, css("--ink")] as unknown as ExpressionSpecification;
}

const siteFeatures: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: SITES.map((s) => ({
    type: "Feature",
    id: s.id,
    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    properties: { id: s.id, year: s.year, cat: s.category, flag: !!s.flagStar, short: s.short, title: s.title },
  })),
};

const ALL_BOUNDS: LngLatBoundsLike = [
  [Math.min(...SITES.map((s) => s.lng)), Math.min(...SITES.map((s) => s.lat))],
  [Math.max(...SITES.map((s) => s.lng)), Math.max(...SITES.map((s) => s.lat))],
];

const idIn = (ids: Iterable<string>): ExpressionSpecification => ["in", ["get", "id"], ["literal", [...ids]]];
const NONE: FilterSpecification = ["==", ["get", "id"], ""];

/**
 * Map padding that keeps pins clear of the floating panel, the timeline dock and (on
 * phones) the bottom sheet at the height it is heading to.
 */
function padding() {
  const app = document.querySelector(".app")?.getBoundingClientRect();
  const dock = document.querySelector(".dock")?.getBoundingClientRect();
  const panel = document.getElementById("panel")?.getBoundingClientRect();
  if (!app) return { top: 40, left: 40, right: 40, bottom: 40 };
  if (isWide()) {
    return {
      top: 40,
      left: (panel ? panel.right - app.left : 0) + 40,
      right: 70,
      bottom: (dock ? app.bottom - dock.top : 0) + 40,
    };
  }
  return {
    top: (dock ? dock.bottom - app.top : 0) + 36,
    left: 30,
    right: 56,
    bottom: sheetHeight(getState().sheet) + 30,
  };
}

function inView(map: MlMap, lng: number, lat: number) {
  const p = map.project([lng, lat]);
  const el = map.getContainer();
  const pad = padding();
  return p.x > pad.left && p.x < el.clientWidth - pad.right && p.y > pad.top && p.y < el.clientHeight - pad.bottom;
}

/** Which sites are drawn at a given state. */
function visibleIds(s: State) {
  const out = new Set<string>();
  for (const site of SITES) if (site.year <= s.year && matches(site, s)) out.add(site.id);
  return out;
}

/** First sentence of the story, trimmed to a one-line hook for the hover card. */
function hook(site: Site) {
  const first = site.story.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? site.story;
  return first.length > 120 ? first.slice(0, 117).replace(/\s+\S*$/, "") + "…" : first;
}

// ---------- clustering ----------

interface Cluster {
  key: string;
  ids: string[];
  lng: number;
  lat: number;
  cat: CategoryId;
  from: number;
  to: number;
  bounds: [[number, number], [number, number]];
}

/** Web-mercator world pixels at zoom z (512px tiles, as MapLibre uses). */
function worldPx(lng: number, lat: number, z: number): [number, number] {
  const size = 512 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
}

/** Drawn radius of a cluster badge (plus its halo) for n sites; a lone star counts as 9px. */
const clusterRadius = (n: number) => (n < 2 ? 9 : 5 + (n <= 8 ? 13 + ((n - 2) * 3) / 6 : Math.min(21, 16 + ((n - 8) * 5) / 16)));

/**
 * Deterministic agglomerative clustering of the visible sites at a zoom level: the closest
 * pair of stars (under CLUSTER_PX apart) or of badges (touching) merges first, until nothing
 * overlaps. The selected site is never folded into a cluster.
 */
function computeClusters(ids: Set<string>, z: number, keepOut: string | null): Cluster[] {
  if (z >= CLUSTER_BELOW) return [];
  const groups = SITES.filter((s) => ids.has(s.id) && s.id !== keepOut).map((s) => {
    const [x, y] = worldPx(s.lng, s.lat, z);
    return { x, y, sites: [s] };
  });
  for (;;) {
    let best = -1, bi = 0, bj = 0;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i], b = groups[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const reach =
          a.sites.length === 1 && b.sites.length === 1
            ? CLUSTER_PX
            : clusterRadius(a.sites.length) + clusterRadius(b.sites.length) + 2;
        const slack = reach - d;
        if (slack > 0 && slack > best) [best, bi, bj] = [slack, i, j];
      }
    if (best < 0) break;
    const a = groups[bi], b = groups[bj];
    const na = a.sites.length, nb = b.sites.length;
    a.x = (a.x * na + b.x * nb) / (na + nb);
    a.y = (a.y * na + b.y * nb) / (na + nb);
    a.sites.push(...b.sites);
    groups.splice(bj, 1);
  }
  for (const g of groups) g.sites.sort((a, b) => Number(!!b.flagStar) - Number(!!a.flagStar) || a.year - b.year);
  return groups
    .filter((g) => g.sites.length > 1)
    .map((g) => {
      const n = g.sites.length;
      const tally = new Map<CategoryId, number>();
      for (const s of g.sites) tally.set(s.category, (tally.get(s.category) ?? 0) + 1);
      const cat = [...tally].sort((a, b) => b[1] - a[1])[0][0];
      const lngs = g.sites.map((s) => s.lng), lats = g.sites.map((s) => s.lat);
      return {
        key: g.sites.map((s) => s.id).join("|"),
        ids: g.sites.map((s) => s.id),
        lng: lngs.reduce((a, b) => a + b, 0) / n,
        lat: lats.reduce((a, b) => a + b, 0) / n,
        cat,
        from: Math.min(...g.sites.map((s) => s.year)),
        to: Math.max(...g.sites.map((s) => s.year)),
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
      };
    });
}

// ---------- module-level hooks for the map's own chrome ----------

let mapInstance: MlMap | null = null;

/**
 * Fit bounds into the space the panel and dock leave free. MapLibre adds fitBounds'
 * padding on top of the map's own (set by earlier camera moves), so only the difference
 * is passed.
 */
function fitTo(map: MlMap, bounds: LngLatBoundsLike, o: { maxZoom: number; minZoom?: number; duration?: number }) {
  const want = padding();
  const p0 = map.getPadding();
  const cam = map.cameraForBounds(bounds, {
    maxZoom: o.maxZoom,
    padding: {
      top: want.top - (p0.top ?? 0),
      bottom: want.bottom - (p0.bottom ?? 0),
      left: want.left - (p0.left ?? 0),
      right: want.right - (p0.right ?? 0),
    },
  });
  if (!cam) return;
  const opts = { center: cam.center, zoom: Math.min(o.maxZoom, Math.max(o.minZoom ?? 0, cam.zoom ?? map.getZoom())) };
  if (prefersReducedMotion()) map.jumpTo(opts);
  else map.easeTo({ ...opts, duration: o.duration ?? 900, easing: (t) => 1 - Math.pow(1 - t, 3) });
}

/** Gently bring a site into view if it is hidden behind the panel, dock or screen edge. */
export function peekSite(id: string) {
  const site = SITE_BY_ID[id];
  const map = mapInstance;
  if (!site || !map || inView(map, site.lng, site.lat)) return;
  const opts = { center: [site.lng, site.lat] as [number, number], padding: padding() };
  if (prefersReducedMotion()) map.jumpTo(opts);
  else map.easeTo({ ...opts, duration: 500 });
}

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [failHidden, setFailHidden] = useState(false);
  const selectedId = useStore((s) => s.selectedId);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    // MapLibre is the bulk of the JavaScript, so it loads as its own chunk after the UI is up.
    import("maplibre-gl")
      .then((mod) => {
        const maplibregl = mod.default ?? mod;
        if (!cancelled && el.current) cleanup = init(maplibregl, el.current);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  function init(maplibregl: typeof import("maplibre-gl"), container: HTMLDivElement) {
    const reduce = prefersReducedMotion();
    const map = new maplibregl.Map({
      container,
      style: basemapStyle(readTokens()),
      center: START_CENTER,
      zoom: START_ZOOM,
      minZoom: 9,
      maxZoom: 18.5,
      maxBounds: [
        [-88.6, 41.35],
        [-86.9, 42.35],
      ],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: reduce ? 0 : 200,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    mapRef.current = map;
    mapInstance = map;
    (window as unknown as { __map?: MlMap }).__map = map;

    // frame downtown in the space the panel and dock leave free
    map.jumpTo({ center: START_CENTER, zoom: isWide() ? START_ZOOM : START_ZOOM - 0.6, padding: padding() });

    map.on("error", (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? "");
      console.warn("[map]", msg);
      if (/tiles\.openfreemap|planet|Failed to fetch|NetworkError|AJAXError/i.test(msg)) setFailed(true);
    });

    // --- live state -> map ---
    let shown = new Set<string>(); // ids currently in the layer filter
    const opacity = new Map<string, number>(); // per-feature fade value
    let clustered = new Set<string>(); // ids folded into a cluster at the current zoom
    let clusters: Cluster[] = [];
    let clusterZoom = -1;
    const bursts = new Map<string, number>(); // id -> start time of its "just appeared" ring
    let fadeRaf = 0;
    let animRaf = 0;
    let recent: string[] = [];
    let burnShown = false;
    let hoverCluster = -1; // index into clusters of the cluster under the pointer
    let ready = false;

    const setFeatureOpacity = (id: string, o: number) => {
      opacity.set(id, o);
      map.setFeatureState({ source: "sites", id }, { o });
    };
    const clickable = (id: string) => (opacity.get(id) ?? 0) >= 0.5 && !clustered.has(id);

    /** Marker opacity: the fade value, hidden while clustered, dimmed when the legend previews another theme. */
    const fadeExpr = (): ExpressionSpecification => {
      const base: ExpressionSpecification = [
        "*",
        ["coalesce", ["feature-state", "o"], 0],
        ["case", ["boolean", ["feature-state", "c"], false], 0, 1],
      ];
      const focus = getMapUi().focusCat;
      return focus ? ["*", base, ["case", ["==", ["get", "cat"], focus], 1, 0.18]] : base;
    };

    const applyFilters = () => {
      const s = getState();
      const sel = s.selectedId;
      const selVisible = sel != null && shown.has(sel);
      map.setFilter("sites", ["all", idIn(shown), ["!=", ["get", "id"], sel ?? ""]]);
      map.setFilter("sites-sel", ["all", idIn(shown), ["==", ["get", "id"], sel ?? ""]]);
      map.setFilter("site-flagring", ["all", idIn(shown), ["==", ["get", "flag"], true]]);
      map.setFilter("site-halo", selVisible ? ["==", ["get", "id"], sel!] : NONE);
      map.setFilter("site-glow", selVisible ? ["==", ["get", "id"], sel!] : NONE);
      map.setFilter("site-pulse", idIn(recent.filter((id) => !clustered.has(id))));
      startAnim();
    };

    // --- clusters ---
    const updateClusters = (force = false) => {
      const z = Math.floor(map.getZoom() * 2) / 2;
      if (!force && z === clusterZoom) return;
      clusterZoom = z;
      const target = visibleIds(getState());
      clusters = computeClusters(target, z, getState().selectedId);
      const next = new Set(clusters.flatMap((c) => c.ids));
      for (const id of clustered) if (!next.has(id)) map.setFeatureState({ source: "sites", id }, { c: false });
      for (const id of next) if (!clustered.has(id)) map.setFeatureState({ source: "sites", id }, { c: true });
      clustered = next;
      (map.getSource("clusters") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: clusters.map((c, i) => ({
          type: "Feature",
          id: i,
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
          properties: { i, count: c.ids.length, cat: c.cat },
        })),
      });
      map.setFilter("site-pulse", idIn(recent.filter((id) => !clustered.has(id))));
    };

    const fadeTo = (target: Set<string>, burst: boolean) => {
      cancelAnimationFrame(fadeRaf);
      const sel = getState().selectedId;
      const leaving = [...shown].filter((id) => !target.has(id));
      if (sel && target.has(sel)) setFeatureOpacity(sel, 1); // the selected site never fades in
      const entering = [...target].filter((id) => (opacity.get(id) ?? 0) < 1);
      if (reduce) {
        target.forEach((id) => setFeatureOpacity(id, 1));
        leaving.forEach((id) => setFeatureOpacity(id, 0));
        shown = new Set(target);
        applyFilters();
        return;
      }
      if (burst) {
        const now = performance.now();
        // a ring bursts out of each star that the passing years bring onto the map
        for (const id of entering) if (!shown.has(id) && !clustered.has(id)) bursts.set(id, now);
      }
      entering.forEach((id) => setFeatureOpacity(id, opacity.get(id) ?? 0));
      shown = new Set([...target, ...leaving]);
      applyFilters();
      const start = performance.now();
      const from = new Map([...entering, ...leaving].map((id) => [id, opacity.get(id) ?? 0]));
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / FADE_MS);
        const e = 1 - Math.pow(1 - k, 3);
        for (const id of entering) setFeatureOpacity(id, from.get(id)! + (1 - from.get(id)!) * e);
        for (const id of leaving) setFeatureOpacity(id, from.get(id)! * (1 - e));
        if (k < 1) fadeRaf = requestAnimationFrame(tick);
        else {
          shown = new Set(target);
          applyFilters();
        }
      };
      fadeRaf = requestAnimationFrame(tick);
    };

    /**
     * One animation loop for the recent-site pulse, the selected site's breathing glow and
     * the "just appeared" bursts. It stops itself when there is nothing to animate.
     */
    const startAnim = () => {
      if (!ready) return;
      const s = getState();
      const glowOn = s.selectedId != null && shown.has(s.selectedId);
      if (reduce) {
        map.setPaintProperty("site-pulse", "circle-radius", 11);
        map.setPaintProperty("site-pulse", "circle-stroke-opacity", 0.6);
        map.setPaintProperty("site-glow", "circle-radius", 24);
        map.setPaintProperty("site-glow", "circle-opacity", 0.32);
        return;
      }
      if (animRaf) return;
      const loop = (now: number) => {
        animRaf = 0;
        const st = getState();
        const pulsing = recent.length > 0;
        const glowing = st.selectedId != null && shown.has(st.selectedId);
        if (pulsing) {
          const k = (now % 2200) / 2200;
          const e = 1 - Math.pow(1 - k, 2);
          map.setPaintProperty("site-pulse", "circle-radius", 11 * (0.7 + e));
          map.setPaintProperty("site-pulse", "circle-stroke-opacity", 0.6 * (1 - e));
        }
        if (glowing) {
          const b = (1 - Math.cos(((now % 2600) / 2600) * Math.PI * 2)) / 2; // 0..1..0
          map.setPaintProperty("site-glow", "circle-radius", 21 + 5 * b);
          map.setPaintProperty("site-glow", "circle-opacity", 0.22 + 0.16 * b);
        }
        if (bursts.size) {
          for (const [id, t0] of bursts) {
            const k = (now - t0) / BURST_MS;
            if (k >= 1) {
              bursts.delete(id);
              map.setFeatureState({ source: "sites", id }, { b: 1 });
            } else map.setFeatureState({ source: "sites", id }, { b: 1 - Math.pow(1 - Math.max(0, k), 3) });
          }
          map.setFilter("site-burst", idIn(bursts.keys()));
        }
        if (pulsing || glowing || bursts.size) animRaf = requestAnimationFrame(loop);
      };
      if (recent.length || glowOn || bursts.size) animRaf = requestAnimationFrame(loop);
    };

    // --- hover card, anchored to the marker and kept clear of the panel, dock and edges ---
    let tipFor = "";
    const placeTip = () => {
      const tip = tipRef.current;
      if (!tip) return;
      const s = getState();
      const site = s.hoverId ? SITE_BY_ID[s.hoverId] : null;
      const cl = !site && hoverCluster >= 0 ? clusters[hoverCluster] : null;
      if (cl) {
        fillClusterTip(tip, cl);
        position(tip, cl.lng, cl.lat, 20);
        return;
      }
      if (!site || site.year > s.year || !matches(site, s) || (isTouch() && s.hoverId === s.selectedId)) {
        tip.classList.remove("on");
        tipFor = "";
        return;
      }
      const key = `${site.id}|${s.selectedId === site.id}`;
      if (tipFor !== key) {
        tipFor = key;
        tip.classList.remove("cluster");
        tip.style.setProperty("--cc", `var(--c-${site.category})`);
        tip.replaceChildren();
        const k = document.createElement("div");
        k.className = "k";
        const yr = document.createElement("b");
        yr.textContent = String(site.year);
        k.append(yr, CATEGORY_NAME[site.category]);
        if (site.flagStar) {
          const f = document.createElement("span");
          f.className = "flag";
          f.textContent = "Flag star";
          k.append(f);
        }
        const t = document.createElement("div");
        t.className = "t";
        t.textContent = site.title;
        const h = document.createElement("p");
        h.textContent = hook(site);
        const small = document.createElement("small");
        small.textContent =
          site.id === s.selectedId ? `Reading now · ${site.date}` : `${site.date} · ${isTouch() ? "Tap" : "Click"} to read`;
        tip.append(k, t, h, small);
      }
      const big = site.id === s.selectedId ? 26 : 18;
      position(tip, site.lng, site.lat, clustered.has(site.id) ? 22 : big);
    };

    const fillClusterTip = (tip: HTMLElement, cl: Cluster) => {
      const key = `cluster|${cl.key}`;
      if (tipFor === key) return;
      tipFor = key;
      tip.classList.add("cluster");
      tip.style.setProperty("--cc", `var(--c-${cl.cat})`);
      tip.replaceChildren();
      const k = document.createElement("div");
      k.className = "k";
      const yr = document.createElement("b");
      yr.textContent = cl.from === cl.to ? String(cl.from) : `${cl.from}–${cl.to}`;
      k.append(yr);
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = `${cl.ids.length} sites here`;
      const p = document.createElement("p");
      const names = cl.ids.slice(0, 3).map((id) => SITE_BY_ID[id].short);
      p.textContent = names.join(", ") + (cl.ids.length > 3 ? ` and ${cl.ids.length - 3} more` : "");
      const small = document.createElement("small");
      small.textContent = `${isTouch() ? "Tap" : "Click"} to zoom in`;
      tip.append(k, t, p, small);
    };

    const position = (tip: HTMLElement, lng: number, lat: number, gap: number) => {
      const p = map.project([lng, lat]);
      const W = container.clientWidth, H = container.clientHeight;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      const app = document.querySelector(".app")?.getBoundingClientRect();
      const panel = document.getElementById("panel")?.getBoundingClientRect();
      const dock = document.querySelector(".dock")?.getBoundingClientRect();
      const ox = app?.left ?? 0, oy = app?.top ?? 0;
      let minX = 8, minY = 8, maxY = H - 8;
      if (isWide()) {
        if (panel) minX = Math.max(minX, panel.right - ox + 10);
        if (dock) maxY = Math.min(maxY, dock.top - oy - 8);
      } else {
        if (dock) minY = Math.max(minY, dock.bottom - oy + 8);
        maxY = Math.min(maxY, H - sheetHeight(getState().sheet) - 8);
      }
      const maxX = W - 8 - w;
      const x = Math.round(Math.max(minX, Math.min(maxX, p.x - w / 2)));
      let y = Math.round(p.y - gap - h);
      let below = false;
      if (y < minY && p.y + gap + h <= maxY) {
        y = Math.round(p.y + gap);
        below = true;
      }
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.style.setProperty("--ax", `${Math.max(14, Math.min(w - 14, p.x - x))}px`);
      tip.classList.toggle("below", below);
      tip.classList.add("on");
    };
    map.on("move", () => placeTip());

    let last: State | null = null;
    const sync = () => {
      if (!ready) return;
      const s = getState();
      const filterChanged =
        !last || last.year !== s.year || last.cats !== s.cats || last.query !== s.query || last.selectedId !== s.selectedId;
      if (filterChanged) {
        const target = visibleIds(s);
        updateClusters(true);
        const same = target.size === shown.size && [...target].every((id) => shown.has(id));
        if (!same) fadeTo(target, !!last && s.year > last.year && last.cats === s.cats && last.query === s.query);
        else applyFilters();

        const nextRecent = SITES.filter((x) => target.has(x.id) && isRecent(x, s.year, MAX_YEAR)).map((x) => x.id);
        if (nextRecent.join() !== recent.join()) {
          recent = nextRecent;
          map.setFilter("site-pulse", idIn(recent.filter((id) => !clustered.has(id))));
          startAnim();
        }
        syncBurn();
      }
      if (!last || last.selectedId !== s.selectedId) {
        const sel = s.selectedId ?? "";
        map.setPaintProperty("site-flagring", "circle-radius", ["case", ["==", ["get", "id"], sel], 19.5, 13]);
        startAnim();
      }
      if (!last || last.hoverId !== s.hoverId || last.year !== s.year || last.cats !== s.cats || last.query !== s.query) {
        const h = s.hoverId && s.hoverId !== s.selectedId && visibleIds(s).has(s.hoverId) ? s.hoverId : "";
        map.setFilter("site-hover", ["==", ["get", "id"], h]);
        if (s.hoverId) hoverCluster = -1;
        placeTip();
      }
      if (!last || last.showShoreline !== s.showShoreline)
        for (const id of ["shore-1830s", "shore-label"])
          map.setLayoutProperty(id, "visibility", s.showShoreline ? "visible" : "none");
      if (s.camera && (!last || last.camera?.seq !== s.camera.seq)) {
        const site = SITE_BY_ID[s.camera.id];
        const force = s.camera.force;
        // wait a frame so the story card has rendered and can be measured
        requestAnimationFrame(() => {
          if (!site) return;
          if (!force && inView(map, site.lng, site.lat)) return;
          flyToSite(site);
        });
      }
      last = s;
    };

    /** A calm camera: a short glide for nearby sites, an arc only for long hops. */
    const flyToSite = (site: Site) => {
      const opts = {
        center: [site.lng, site.lat] as [number, number],
        zoom: Math.max(map.getZoom(), SELECT_ZOOM),
        padding: padding(),
      };
      if (prefersReducedMotion()) return map.jumpTo(opts);
      const p = map.project(opts.center);
      const W = container.clientWidth, H = container.clientHeight;
      const near = Math.hypot(p.x - W / 2, p.y - H / 2) < Math.max(W, H) * 1.2 && opts.zoom - map.getZoom() < 2.5;
      if (near) map.easeTo({ ...opts, duration: 700, easing: (t) => 1 - Math.pow(1 - t, 3) });
      else map.flyTo({ ...opts, speed: 1.4, curve: 1.42, maxDuration: 1800 });
    };

    /** The 1871 burn area fades in when the slider reaches the fire (or the fire is selected). */
    const syncBurn = () => {
      const s = getState();
      const burn = OVERLAYS.features.find((f) => f.properties?.id === "burn-1871")?.properties ?? {};
      const show =
        getMapUi().burnPinned || burnVisible(s.year, s.selectedId, burn.showFrom ?? 1871, burn.showTo ?? 1874);
      if (show === burnShown) return;
      burnShown = show;
      const layers = ["burn-tint", "burn-fill", "burn-line", "burn-label"];
      for (const id of layers) map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
      if (!show) return;
      const props: [string, string, number][] = [
        ["burn-tint", "fill-opacity", 1],
        ["burn-fill", "fill-opacity", 1],
        ["burn-line", "line-opacity", 1],
        ["burn-label", "text-opacity", 1],
      ];
      for (const [id, p] of props) map.setPaintProperty(id, p, 0);
      requestAnimationFrame(() => {
        for (const [id, p, v] of props) map.setPaintProperty(id, p, v);
      });
    };

    const addOverlays = () => {
      const t = readTokens();
      const red = css("--red");
      const panel = css("--panel");
      const star = starSdf(STAR_RADIUS);
      if (!map.hasImage("star")) map.addImage("star", star, { sdf: true, pixelRatio: STAR_PIXEL_RATIO });
      const hatch = hatchPattern(red);
      if (hatch && !map.hasImage("hatch")) map.addImage("hatch", hatch, { pixelRatio: STAR_PIXEL_RATIO });

      map.addSource("overlays", { type: "geojson", data: OVERLAYS });
      map.addSource("sites", { type: "geojson", data: siteFeatures, promoteId: "id" });
      map.addSource("clusters", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      const reveal = { duration: reduce ? 0 : 900, delay: 0 };
      const burnF: FilterSpecification = ["==", ["get", "id"], "burn-1871"];
      map.addLayer({
        id: "burn-tint",
        type: "fill",
        source: "overlays",
        filter: burnF,
        layout: { visibility: "none" },
        paint: { "fill-color": css("--burn"), "fill-opacity": 1, "fill-opacity-transition": reveal },
      });
      map.addLayer({
        id: "burn-fill",
        type: "fill",
        source: "overlays",
        filter: burnF,
        layout: { visibility: "none" },
        paint: hatch
          ? { "fill-pattern": "hatch", "fill-opacity": 1, "fill-opacity-transition": reveal }
          : { "fill-color": css("--burn"), "fill-opacity": 1, "fill-opacity-transition": reveal },
      });
      map.addLayer({
        id: "burn-line",
        type: "line",
        source: "overlays",
        filter: burnF,
        layout: { visibility: "none", "line-join": "round" },
        paint: {
          "line-color": red,
          "line-width": 1.6,
          "line-dasharray": [4, 2],
          "line-opacity": 1,
          "line-opacity-transition": reveal,
        },
      });
      map.addLayer({
        id: "shore-1830s",
        type: "line",
        source: "overlays",
        filter: ["==", ["get", "id"], "shore-1830s"],
        layout: { "line-cap": "round" },
        paint: { "line-color": t.river, "line-width": 1.6, "line-dasharray": [2, 2.5], "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "shore-label",
        type: "symbol",
        source: "overlays",
        minzoom: 12.5,
        filter: ["==", ["get", "id"], "shore-1830s"],
        layout: {
          "symbol-placement": "line",
          "text-field": "1830s shoreline",
          "text-font": FONT_ITALIC,
          "text-size": 11,
          "text-letter-spacing": 0.08,
          "text-offset": [0, -0.9],
          "symbol-spacing": 420,
        },
        paint: { "text-color": t.lakeLabel, "text-halo-color": t.land, "text-halo-width": 1.6 },
      });
      map.addLayer({
        id: "burn-label",
        type: "symbol",
        source: "overlays",
        minzoom: 12,
        filter: burnF,
        layout: {
          visibility: "none",
          "text-field": "BURNED IN 1871",
          "text-font": FONT_BOLD,
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10.5, 16, 14],
          "text-letter-spacing": 0.22,
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": red,
          "text-halo-color": t.land,
          "text-halo-width": 2,
          "text-opacity": 1,
          "text-opacity-transition": reveal,
        },
      });

      const fade = fadeExpr();
      const cc = categoryColor();
      map.addLayer({
        id: "site-hover",
        type: "circle",
        source: "sites",
        filter: NONE,
        paint: {
          "circle-radius": 16,
          "circle-color": cc,
          "circle-opacity": 0.18,
          "circle-stroke-color": cc,
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0.8,
        },
      });
      // the selected site: a soft breathing glow in its category color ...
      map.addLayer({
        id: "site-glow",
        type: "circle",
        source: "sites",
        filter: NONE,
        paint: { "circle-radius": 22, "circle-color": cc, "circle-opacity": 0.3, "circle-blur": 0.85 },
      });
      // ... and a medallion behind the star
      map.addLayer({
        id: "site-halo",
        type: "circle",
        source: "sites",
        filter: NONE,
        paint: {
          "circle-radius": ["case", ["get", "flag"], 16.5, 15.5],
          "circle-color": panel,
          "circle-opacity": 0.94,
          "circle-stroke-color": cc,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "site-burst",
        type: "circle",
        source: "sites",
        filter: NONE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["coalesce", ["feature-state", "b"], 1], 0, 6, 1, 30],
          "circle-color": cc,
          "circle-opacity": ["interpolate", ["linear"], ["coalesce", ["feature-state", "b"], 1], 0, 0.28, 1, 0],
          "circle-stroke-color": cc,
          "circle-stroke-width": ["interpolate", ["linear"], ["coalesce", ["feature-state", "b"], 1], 0, 3, 1, 0.5],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["coalesce", ["feature-state", "b"], 1], 0, 0.9, 1, 0],
        },
      });
      map.addLayer({
        id: "site-pulse",
        type: "circle",
        source: "sites",
        filter: idIn([]),
        paint: {
          "circle-radius": 11,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": cc,
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.6,
        },
      });
      map.addLayer({
        id: "site-flagring",
        type: "circle",
        source: "sites",
        filter: idIn([]),
        paint: {
          "circle-radius": 13,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": red,
          "circle-stroke-width": 1.6,
          "circle-stroke-opacity": fade,
        },
      });

      // numbered clusters at city zoom
      const clusterR: ExpressionSpecification = ["interpolate", ["linear"], ["get", "count"], 2, 13, 8, 16, 24, 21];
      map.addLayer({
        id: "cluster-halo",
        type: "circle",
        source: "clusters",
        paint: {
          "circle-radius": ["+", clusterR, 5],
          "circle-color": cc,
          "circle-opacity": 0.28,
          "circle-stroke-color": cc,
          "circle-stroke-width": 1,
          "circle-stroke-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "cluster",
        type: "circle",
        source: "clusters",
        paint: {
          "circle-radius": clusterR,
          "circle-color": t.ink,
          "circle-stroke-color": panel,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "clusters",
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-font": FONT_BOLD,
          "text-size": 12.5,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": panel },
      });

      const symbolLayout = {
        "icon-image": "star",
        "icon-allow-overlap": true,
        "icon-padding": 0,
        "text-font": FONT_BOLD,
        "text-size": 12.5,
        "text-anchor": "left",
        "text-offset": ["case", ["get", "flag"], ["literal", [1.45, 0]], ["literal", [1.15, 0]]],
        "text-optional": true,
        "text-padding": 2,
        "text-max-width": 12,
      } as SymbolLayerSpecification["layout"];
      const symbolPaint = (sel: boolean) => ({
        "icon-color": cc,
        "icon-halo-color": panel,
        "icon-halo-width": sel ? 1.2 : 1.6,
        "icon-halo-blur": 0,
        "icon-opacity": sel ? 1 : fade,
        "text-color": t.ink,
        "text-halo-color": t.land,
        "text-halo-width": 2,
        "text-opacity": sel ? 1 : fade,
      });
      map.addLayer({
        id: "sites",
        type: "symbol",
        source: "sites",
        filter: idIn([]),
        layout: {
          ...symbolLayout,
          // smaller stars when zoomed out, so the city view is less crowded
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["case", ["get", "flag"], 0.95, 0.8],
            13,
            ["case", ["get", "flag"], 9 / 8, 1],
          ],
          // labels from zoom 14 up
          "text-field": ["step", ["zoom"], "", 14, ["get", "short"]],
          // flag stars first, then earlier years
          "symbol-sort-key": ["case", ["get", "flag"], 0, ["-", ["get", "year"], 1700]],
        },
        paint: symbolPaint(false),
      });
      // The selected site sits in its own top layer, so it draws on top and its label is placed first.
      map.addLayer({
        id: "sites-sel",
        type: "symbol",
        source: "sites",
        filter: idIn([]),
        layout: {
          ...symbolLayout,
          "icon-size": ["case", ["get", "flag"], 1.3, 1.2],
          "text-field": ["get", "short"],
          "text-size": 14,
          "text-offset": ["literal", [1.75, 0]] as ExpressionSpecification,
        },
        paint: symbolPaint(true),
      });

      for (const layer of ["sites", "sites-sel"]) {
        map.on("click", layer, (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id || (layer === "sites" && !clickable(id))) return;
          actions.stop();
          const sheet = getState().sheet;
          actions.select(id, { sheet: sheet === "full" ? "half" : sheet });
        });
        map.on("mousemove", layer, (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id || (layer === "sites" && !clickable(id))) return;
          map.getCanvas().style.cursor = "pointer";
          hoverCluster = -1;
          actions.hover(id);
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          actions.hover(null);
        });
      }
      map.on("click", "cluster", (e) => {
        const i = e.features?.[0]?.properties?.i as number | undefined;
        const cl = i != null ? clusters[i] : undefined;
        if (!cl) return;
        actions.stop();
        hoverCluster = -1;
        placeTip();
        fitTo(map, cl.bounds, { maxZoom: 16, minZoom: Math.max(CLUSTER_BELOW + 0.2, map.getZoom() + 1.5), duration: 750 });
      });
      map.on("mousemove", "cluster", (e) => {
        const i = e.features?.[0]?.properties?.i as number | undefined;
        if (i == null || i === hoverCluster) return;
        map.getCanvas().style.cursor = "pointer";
        hoverCluster = i;
        if (getState().hoverId) actions.hover(null);
        placeTip();
      });
      map.on("mouseleave", "cluster", () => {
        map.getCanvas().style.cursor = "";
        hoverCluster = -1;
        placeTip();
      });
      map.on("zoom", () => {
        const before = clusterZoom;
        updateClusters();
        if (before !== clusterZoom) {
          hoverCluster = -1;
          applyFilters();
        }
      });
    };

    const recolor = () => {
      const t = readTokens();
      for (const layer of basemapLayers(t)) {
        for (const [k, v] of Object.entries(layer.paint ?? {})) map.setPaintProperty(layer.id, k, v);
      }
      const red = css("--red");
      const panel = css("--panel");
      const cc = categoryColor();
      map.setPaintProperty("shore-1830s", "line-color", t.river);
      map.setPaintProperty("shore-label", "text-color", t.lakeLabel);
      map.setPaintProperty("shore-label", "text-halo-color", t.land);
      map.setPaintProperty("burn-line", "line-color", red);
      map.setPaintProperty("burn-tint", "fill-color", css("--burn"));
      map.setPaintProperty("burn-label", "text-color", red);
      map.setPaintProperty("burn-label", "text-halo-color", t.land);
      const hatch = hatchPattern(red);
      if (hatch) map.updateImage("hatch", hatch);
      map.setPaintProperty("site-halo", "circle-color", panel);
      map.setPaintProperty("site-halo", "circle-stroke-color", cc);
      map.setPaintProperty("site-glow", "circle-color", cc);
      map.setPaintProperty("site-burst", "circle-color", cc);
      map.setPaintProperty("site-burst", "circle-stroke-color", cc);
      map.setPaintProperty("site-pulse", "circle-stroke-color", cc);
      map.setPaintProperty("site-hover", "circle-color", cc);
      map.setPaintProperty("site-hover", "circle-stroke-color", cc);
      map.setPaintProperty("site-flagring", "circle-stroke-color", red);
      map.setPaintProperty("cluster-halo", "circle-color", cc);
      map.setPaintProperty("cluster-halo", "circle-stroke-color", cc);
      map.setPaintProperty("cluster", "circle-color", t.ink);
      map.setPaintProperty("cluster", "circle-stroke-color", panel);
      map.setPaintProperty("cluster-count", "text-color", panel);
      for (const layer of ["sites", "sites-sel"]) {
        map.setPaintProperty(layer, "icon-color", cc);
        map.setPaintProperty(layer, "icon-halo-color", panel);
        map.setPaintProperty(layer, "text-color", t.ink);
        map.setPaintProperty(layer, "text-halo-color", t.land);
      }
    };

    const onMapUi = () => {
      if (!ready) return;
      const fade = fadeExpr();
      map.setPaintProperty("sites", "icon-opacity", fade);
      map.setPaintProperty("sites", "text-opacity", fade);
      map.setPaintProperty("site-flagring", "circle-stroke-opacity", fade);
      const focus = getMapUi().focusCat;
      const dim = (v: number): ExpressionSpecification | number =>
        focus ? ["case", ["==", ["get", "cat"], focus], v, v * 0.25] : v;
      map.setPaintProperty("cluster-halo", "circle-opacity", dim(0.28));
      syncBurn();
    };

    map.once("style.load", () => {
      addOverlays();
      ready = true;
      sync();
    });

    const unsub = subscribe(sync);
    const unsubUi = subscribeMapUi(onMapUi);
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => ready && recolor();
    scheme.addEventListener("change", onScheme);
    const themeObs = new MutationObserver(onScheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      unsub();
      unsubUi();
      scheme.removeEventListener("change", onScheme);
      themeObs.disconnect();
      cancelAnimationFrame(fadeRaf);
      cancelAnimationFrame(animRaf);
      map.remove();
      mapRef.current = null;
      if (mapInstance === map) mapInstance = null;
    };
  }

  const zoom = (dir: 1 | -1) => {
    const m = mapRef.current;
    if (!m) return;
    if (dir > 0) m.zoomIn({ animate: !prefersReducedMotion() });
    else m.zoomOut({ animate: !prefersReducedMotion() });
  };
  const fitAll = () => mapRef.current && fitTo(mapRef.current, ALL_BOUNDS, { maxZoom: 14 });
  const focusSelected = () => {
    const id = getState().selectedId;
    if (id) actions.select(id, { pan: true, sheet: getState().sheet === "full" ? "half" : undefined });
  };

  return (
    <>
      <div id="map" ref={el} role="region" aria-label="Map of Chicago with historic sites" />
      {failed && !failHidden && (
        <div className="mapfail glass" role="status">
          <span>The street map couldn't load. Sites, the timeline and stories still work.</span>
          <button type="button" aria-label="Dismiss" onClick={() => setFailHidden(true)}>
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="maptip" ref={tipRef} aria-hidden="true" />
      <div className="mapctl" role="toolbar" aria-label="Map controls" aria-orientation="vertical">
        <div className="grp">
          <button className="iconbtn" type="button" aria-label="Zoom in" data-tip="Zoom in" onClick={() => zoom(1)}>
            <PlusIcon />
          </button>
          <button className="iconbtn" type="button" aria-label="Zoom out" data-tip="Zoom out" onClick={() => zoom(-1)}>
            <MinusIcon />
          </button>
        </div>
        <div className="grp">
          <button className="iconbtn" type="button" aria-label="Show the whole city" data-tip="Whole city" onClick={fitAll}>
            <FitIcon />
          </button>
          {selectedId && (
            <button
              className="iconbtn appear"
              type="button"
              aria-label="Center the map on the open site"
              data-tip="Back to this site"
              onClick={focusSelected}
            >
              <TargetIcon />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
