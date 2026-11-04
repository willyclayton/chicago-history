import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, LngLatBoundsLike, Map as MlMap, SymbolLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORIES, MAX_YEAR, OVERLAYS, SITES, SITE_BY_ID } from "../data";
import { burnVisible, isRecent } from "../lib/filters";
import { actions, getState, matches, subscribe, type State } from "../state/store";
import { basemapLayers, basemapStyle, FONT_BOLD, type MapTokens } from "./styles/basemap";
import { hatchPattern, starSdf, STAR_PIXEL_RATIO } from "./starIcon";
import { isTouch, isWide, prefersReducedMotion } from "../ui/media";
import { sheetHeight } from "../ui/sheet";
import { FitIcon } from "../ui/Icons";

export const START_CENTER: [number, number] = [-87.638, 41.887];
export const START_ZOOM = 13;
const SELECT_ZOOM = 15;
const STAR_RADIUS = 8; // CSS px, matches the prototype's marker
const FADE_MS = 260;

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

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [failed, setFailed] = useState(false);

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
    let fadeRaf = 0;
    let pulseRaf = 0;
    let recent: string[] = [];
    let ready = false;

    const setFeatureOpacity = (id: string, o: number) => {
      opacity.set(id, o);
      map.setFeatureState({ source: "sites", id }, { o });
    };

    const applyFilters = () => {
      const s = getState();
      const sel = s.selectedId;
      const selVisible = sel != null && shown.has(sel);
      map.setFilter("sites", ["all", idIn(shown), ["!=", ["get", "id"], sel ?? ""]]);
      map.setFilter("sites-sel", ["all", idIn(shown), ["==", ["get", "id"], sel ?? ""]]);
      map.setFilter("site-flagring", ["all", idIn(shown), ["==", ["get", "flag"], true]]);
      map.setFilter("site-halo", selVisible ? ["==", ["get", "id"], sel!] : ["==", ["get", "id"], ""]);
    };

    const fadeTo = (target: Set<string>) => {
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
      entering.forEach((id) => setFeatureOpacity(id, opacity.get(id) ?? 0));
      shown = new Set([...target, ...leaving]);
      applyFilters();
      const start = performance.now();
      const from = new Map([...entering, ...leaving].map((id) => [id, opacity.get(id) ?? 0]));
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / FADE_MS);
        for (const id of entering) setFeatureOpacity(id, from.get(id)! + (1 - from.get(id)!) * k);
        for (const id of leaving) setFeatureOpacity(id, from.get(id)! * (1 - k));
        if (k < 1) fadeRaf = requestAnimationFrame(tick);
        else {
          shown = new Set(target);
          applyFilters();
        }
      };
      fadeRaf = requestAnimationFrame(tick);
    };

    const runPulse = () => {
      cancelAnimationFrame(pulseRaf);
      if (!recent.length) return;
      if (reduce) {
        map.setPaintProperty("site-pulse", "circle-radius", 11);
        map.setPaintProperty("site-pulse", "circle-stroke-opacity", 0.6);
        return;
      }
      const loop = (now: number) => {
        const k = (now % 2200) / 2200;
        const e = 1 - Math.pow(1 - k, 2); // ease-out
        map.setPaintProperty("site-pulse", "circle-radius", 11 * (0.7 + e));
        map.setPaintProperty("site-pulse", "circle-stroke-opacity", 0.6 * (1 - e));
        pulseRaf = requestAnimationFrame(loop);
      };
      pulseRaf = requestAnimationFrame(loop);
    };

    // hover tooltip, anchored to the marker
    const placeTip = () => {
      const tip = tipRef.current;
      if (!tip) return;
      const s = getState();
      const site = s.hoverId ? SITE_BY_ID[s.hoverId] : null;
      if (!site || site.year > s.year || !matches(site, s) || (isTouch() && s.hoverId === s.selectedId)) {
        tip.classList.remove("on");
        return;
      }
      const p = map.project([site.lng, site.lat]);
      tip.style.left = `${p.x}px`;
      tip.style.top = `${p.y}px`;
      tip.style.setProperty("--cc", `var(--c-${site.category})`);
      tip.innerHTML = "";
      const b = document.createElement("b");
      b.textContent = String(site.year);
      const small = document.createElement("small");
      small.textContent = site.id === s.selectedId ? site.date : "Click to read the story";
      tip.append(b, site.title, small);
      tip.classList.add("on");
    };
    map.on("move", placeTip);

    let last: State | null = null;
    const sync = () => {
      if (!ready) return;
      const s = getState();
      const filterChanged =
        !last || last.year !== s.year || last.cats !== s.cats || last.query !== s.query || last.selectedId !== s.selectedId;
      if (filterChanged) {
        const target = visibleIds(s);
        const same = target.size === shown.size && [...target].every((id) => shown.has(id));
        if (!same) fadeTo(target);
        else applyFilters();

        const nextRecent = SITES.filter((x) => target.has(x.id) && isRecent(x, s.year, MAX_YEAR)).map((x) => x.id);
        if (nextRecent.join() !== recent.join()) {
          recent = nextRecent;
          map.setFilter("site-pulse", idIn(recent));
          runPulse();
        }
        const burn = OVERLAYS.features.find((f) => f.properties?.id === "burn-1871")?.properties ?? {};
        const showBurn = burnVisible(s.year, s.selectedId, burn.showFrom ?? 1871, burn.showTo ?? 1874);
        for (const id of ["burn-fill", "burn-line"]) map.setLayoutProperty(id, "visibility", showBurn ? "visible" : "none");
      }
      if (!last || last.selectedId !== s.selectedId) {
        const sel = s.selectedId ?? "";
        map.setPaintProperty("site-flagring", "circle-radius", ["case", ["==", ["get", "id"], sel], 15, 13]);
      }
      if (!last || last.hoverId !== s.hoverId || last.year !== s.year || last.cats !== s.cats || last.query !== s.query) {
        const h = s.hoverId && s.hoverId !== s.selectedId && visibleIds(s).has(s.hoverId) ? s.hoverId : "";
        map.setFilter("site-hover", ["==", ["get", "id"], h]);
        placeTip();
      }
      if (!last || last.showShoreline !== s.showShoreline)
        map.setLayoutProperty("shore-1830s", "visibility", s.showShoreline ? "visible" : "none");
      if (s.camera && (!last || last.camera?.seq !== s.camera.seq)) {
        const site = SITE_BY_ID[s.camera.id];
        const force = s.camera.force;
        // wait a frame so the story card has rendered and can be measured
        requestAnimationFrame(() => {
          if (!site) return;
          if (!force && inView(map, site.lng, site.lat)) return;
          const opts = {
            center: [site.lng, site.lat] as [number, number],
            zoom: Math.max(map.getZoom(), SELECT_ZOOM),
            padding: padding(),
          };
          if (prefersReducedMotion()) map.jumpTo(opts);
          else map.flyTo({ ...opts, speed: 1.6, curve: 1.3, maxDuration: 1600 });
        });
      }
      last = s;
    };

    const addOverlays = () => {
      const t = readTokens();
      const red = css("--red");
      const star = starSdf(STAR_RADIUS);
      if (!map.hasImage("star")) map.addImage("star", star, { sdf: true, pixelRatio: STAR_PIXEL_RATIO });
      const hatch = hatchPattern(red);
      if (hatch && !map.hasImage("hatch")) map.addImage("hatch", hatch, { pixelRatio: STAR_PIXEL_RATIO });

      map.addSource("overlays", { type: "geojson", data: OVERLAYS });
      map.addSource("sites", { type: "geojson", data: siteFeatures, promoteId: "id" });

      map.addLayer({
        id: "burn-fill",
        type: "fill",
        source: "overlays",
        filter: ["==", ["get", "id"], "burn-1871"],
        layout: { visibility: "none" },
        paint: hatch ? { "fill-pattern": "hatch" } : { "fill-color": css("--burn") },
      });
      map.addLayer({
        id: "burn-line",
        type: "line",
        source: "overlays",
        filter: ["==", ["get", "id"], "burn-1871"],
        layout: { visibility: "none" },
        paint: { "line-color": red, "line-width": 1.4, "line-dasharray": [4, 2] },
      });
      map.addLayer({
        id: "shore-1830s",
        type: "line",
        source: "overlays",
        filter: ["==", ["get", "id"], "shore-1830s"],
        paint: { "line-color": t.ink, "line-width": 1.2, "line-dasharray": [3, 3], "line-opacity": 0.4 },
      });

      const fade: ExpressionSpecification = ["coalesce", ["feature-state", "o"], 0];
      map.addLayer({
        id: "site-hover",
        type: "circle",
        source: "sites",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": 16,
          "circle-color": categoryColor(),
          "circle-opacity": 0.22,
          "circle-stroke-color": categoryColor(),
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "site-halo",
        type: "circle",
        source: "sites",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": 19,
          "circle-color": css("--red-soft"),
          "circle-stroke-color": t.ink,
          "circle-stroke-width": 1.5,
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
          "circle-stroke-color": categoryColor(),
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
        "icon-color": categoryColor(),
        "icon-halo-color": sel ? t.ink : css("--panel"),
        "icon-halo-width": sel ? 2 : 1.6,
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
          "icon-size": ["case", ["get", "flag"], 9 / 8, 1],
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
          "icon-size": ["case", ["get", "flag"], 1.45, 1.35],
          "text-field": ["get", "short"],
          "text-size": 14,
          "text-offset": ["literal", [1.6, 0]] as ExpressionSpecification,
        },
        paint: symbolPaint(true),
      });

      for (const layer of ["sites", "sites-sel"]) {
        map.on("click", layer, (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id || (opacity.get(id) ?? 0) < 0.5) return;
          actions.stop();
          const sheet = getState().sheet;
          actions.select(id, { sheet: sheet === "full" ? "half" : sheet });
        });
        map.on("mousemove", layer, (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          map.getCanvas().style.cursor = "pointer";
          if (id && (opacity.get(id) ?? 0) >= 0.5) actions.hover(id);
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          actions.hover(null);
        });
      }
    };

    const recolor = () => {
      const t = readTokens();
      for (const layer of basemapLayers(t)) {
        for (const [k, v] of Object.entries(layer.paint ?? {})) map.setPaintProperty(layer.id, k, v);
      }
      const red = css("--red");
      const cc = categoryColor();
      map.setPaintProperty("shore-1830s", "line-color", t.ink);
      map.setPaintProperty("burn-line", "line-color", red);
      const hatch = hatchPattern(red);
      if (hatch) map.updateImage("hatch", hatch);
      map.setPaintProperty("site-halo", "circle-color", css("--red-soft"));
      map.setPaintProperty("site-halo", "circle-stroke-color", t.ink);
      map.setPaintProperty("site-pulse", "circle-stroke-color", cc);
      map.setPaintProperty("site-hover", "circle-color", cc);
      map.setPaintProperty("site-hover", "circle-stroke-color", cc);
      map.setPaintProperty("site-flagring", "circle-stroke-color", red);
      for (const layer of ["sites", "sites-sel"]) {
        map.setPaintProperty(layer, "icon-color", cc);
        map.setPaintProperty(layer, "text-color", t.ink);
        map.setPaintProperty(layer, "text-halo-color", t.land);
      }
      map.setPaintProperty("sites", "icon-halo-color", css("--panel"));
      map.setPaintProperty("sites-sel", "icon-halo-color", t.ink);
    };

    map.once("style.load", () => {
      addOverlays();
      ready = true;
      sync();
    });

    const unsub = subscribe(sync);
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => ready && recolor();
    scheme.addEventListener("change", onScheme);
    const themeObs = new MutationObserver(onScheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      unsub();
      scheme.removeEventListener("change", onScheme);
      themeObs.disconnect();
      cancelAnimationFrame(fadeRaf);
      cancelAnimationFrame(pulseRaf);
      map.remove();
      mapRef.current = null;
    };
  }

  const zoom = (dir: 1 | -1) => {
    const m = mapRef.current;
    if (!m) return;
    if (dir > 0) m.zoomIn({ animate: !prefersReducedMotion() });
    else m.zoomOut({ animate: !prefersReducedMotion() });
  };
  const fitAll = () =>
    mapRef.current?.fitBounds(ALL_BOUNDS, { padding: padding(), animate: !prefersReducedMotion(), maxZoom: 14 });

  return (
    <>
      <div id="map" ref={el} role="region" aria-label="Map of Chicago with historic sites" />
      {failed && (
        <div className="mapfail glass" role="status">
          The street map couldn't load. Sites, the timeline and stories still work.
        </div>
      )}
      <div className="maptip" ref={tipRef} aria-hidden="true" />
      <div className="mapctl">
        <div className="grp">
          <button className="iconbtn" type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1)}>
            +
          </button>
          <button className="iconbtn" type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(-1)}>
            −
          </button>
        </div>
        <button className="iconbtn" type="button" aria-label="Show the whole city" title="Whole city" onClick={fitAll}>
          <FitIcon />
        </button>
      </div>
    </>
  );
}
