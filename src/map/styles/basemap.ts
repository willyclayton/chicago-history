import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from "maplibre-gl";

/**
 * A restyled OpenFreeMap (OpenMapTiles schema) basemap, built from the CSS tokens so the
 * light and dark versions always match the page theme: muted land, light-blue lake, quiet
 * streets. Site markers and overlays are added on top by MapView.
 */
export interface MapTokens {
  land: string;
  lake: string;
  river: string;
  street: string;
  artery: string;
  made: string;
  building: string;
  label: string;
  labelHalo: string;
  lakeLabel: string;
  ink: string;
  muted: string;
  line: string;
}

export const TILE_SOURCE = "https://tiles.openfreemap.org/planet";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const FONT_REGULAR = ["Noto Sans Regular"];
export const FONT_BOLD = ["Noto Sans Bold"];
export const FONT_ITALIC = ["Noto Sans Italic"];

const MAJOR: ExpressionSpecification = ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false];
const MID: ExpressionSpecification = ["match", ["get", "class"], ["secondary", "tertiary"], true, false];
const MINOR: ExpressionSpecification = ["match", ["get", "class"], ["minor", "service", "street", "residential"], true, false];

export function basemapLayers(t: MapTokens): LayerSpecification[] {
  const src = { source: "omt" } as const;
  return [
    { id: "bg", type: "background", paint: { "background-color": t.land } },
    {
      id: "park",
      type: "fill",
      ...src,
      "source-layer": "park",
      paint: { "fill-color": t.made, "fill-opacity": 0.9 },
    },
    {
      id: "landcover-green",
      type: "fill",
      ...src,
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["grass", "wood", "farmland"], true, false],
      paint: { "fill-color": t.made, "fill-opacity": 0.7 },
    },
    {
      id: "landuse-green",
      type: "fill",
      ...src,
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["cemetery", "stadium", "pitch", "park", "playground"], true, false],
      paint: { "fill-color": t.made, "fill-opacity": 0.75 },
    },
    {
      id: "waterway",
      type: "line",
      ...src,
      "source-layer": "waterway",
      paint: {
        "line-color": t.river,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 9, 0.6, 14, 2.5, 18, 8],
      },
    },
    {
      id: "water",
      type: "fill",
      ...src,
      "source-layer": "water",
      paint: { "fill-color": t.lake },
    },
    {
      // a crisp, faint shoreline so the lake edge (Chicago's defining border) reads clearly
      id: "water-shore",
      type: "line",
      ...src,
      "source-layer": "water",
      paint: {
        "line-color": t.river,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 14, 1.2, 18, 2],
        "line-opacity": 0.45,
      },
    },
    {
      id: "river-water",
      type: "fill",
      ...src,
      "source-layer": "water",
      filter: ["==", ["get", "class"], "river"],
      paint: { "fill-color": t.river, "fill-opacity": 0.55 },
    },
    {
      id: "building",
      type: "fill",
      ...src,
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-color": t.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.8] },
    },
    {
      id: "aeroway",
      type: "line",
      ...src,
      "source-layer": "aeroway",
      filter: ["match", ["get", "class"], ["runway", "taxiway"], true, false],
      paint: { "line-color": t.artery, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 16, 14] },
    },
    {
      id: "rail",
      type: "line",
      ...src,
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["==", ["get", "class"], "rail"],
      paint: { "line-color": t.artery, "line-width": 1, "line-dasharray": [3, 2], "line-opacity": 0.7 },
    },
    {
      id: "road-minor",
      type: "line",
      ...src,
      "source-layer": "transportation",
      minzoom: 12,
      filter: MINOR,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": t.street,
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 0.4, 15, 2.5, 18, 12],
      },
    },
    {
      id: "road-mid",
      type: "line",
      ...src,
      "source-layer": "transportation",
      minzoom: 10,
      filter: MID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": t.street,
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 10, 0.6, 15, 4, 18, 16],
      },
    },
    {
      id: "road-major-case",
      type: "line",
      ...src,
      "source-layer": "transportation",
      filter: MAJOR,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": t.artery,
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 9, 0.8, 15, 6, 18, 22],
      },
    },
    {
      id: "road-major",
      type: "line",
      ...src,
      "source-layer": "transportation",
      minzoom: 13,
      filter: MAJOR,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": t.street,
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 13, 1, 15, 3.6, 18, 18],
      },
    },
    {
      id: "boundary",
      type: "line",
      ...src,
      "source-layer": "boundary",
      filter: ["match", ["get", "admin_level"], [6, 8], true, false],
      maxzoom: 13,
      paint: { "line-color": t.line, "line-width": 1, "line-dasharray": [2, 2] },
    },
    {
      id: "water-name",
      type: "symbol",
      ...src,
      "source-layer": "water_name",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": FONT_ITALIC,
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 14, 15],
        "text-letter-spacing": 0.25,
        "text-transform": "uppercase",
      },
      paint: { "text-color": t.lakeLabel },
    },
    {
      id: "water-name-line",
      type: "symbol",
      ...src,
      "source-layer": "water_name",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": FONT_ITALIC,
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 14, 15],
        "text-letter-spacing": 0.25,
        "symbol-placement": "line",
        "text-transform": "uppercase",
      },
      paint: { "text-color": t.lakeLabel },
    },
    {
      id: "road-name",
      type: "symbol",
      ...src,
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9.5, 17, 12],
        "symbol-placement": "line",
        "text-letter-spacing": 0.04,
        "text-max-angle": 30,
      },
      paint: { "text-color": t.label, "text-halo-color": t.labelHalo, "text-halo-width": 1.4 },
    },
    {
      id: "poi-park",
      type: "symbol",
      ...src,
      "source-layer": "poi",
      minzoom: 14,
      filter: ["match", ["get", "class"], ["park", "cemetery", "stadium"], true, false],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_ITALIC,
        "text-size": 11,
        "text-max-width": 8,
      },
      paint: { "text-color": t.muted, "text-halo-color": t.labelHalo, "text-halo-width": 1.2, "text-opacity": 0.85 },
    },
    {
      id: "place-hood",
      type: "symbol",
      ...src,
      "source-layer": "place",
      minzoom: 11,
      filter: ["match", ["get", "class"], ["neighbourhood", "suburb", "quarter"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 12],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.16,
        "text-max-width": 8,
      },
      paint: { "text-color": t.ink, "text-opacity": 0.5, "text-halo-color": t.labelHalo, "text-halo-width": 1.2 },
    },
    {
      id: "place-city",
      type: "symbol",
      ...src,
      "source-layer": "place",
      maxzoom: 12,
      filter: ["match", ["get", "class"], ["city", "town"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 12, 15],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
      },
      paint: { "text-color": t.muted, "text-halo-color": t.labelHalo, "text-halo-width": 1.4 },
    },
  ];
}

export function basemapStyle(t: MapTokens): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: {
        type: "vector",
        url: TILE_SOURCE,
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      },
    },
    layers: basemapLayers(t),
  };
}
