import { useSyncExternalStore } from "react";
import { CATEGORIES, CATEGORY_NAME, MAX_YEAR, MIN_YEAR, ORDERED, SITE_BY_ID } from "../data";
import { makeMatcher, norm, stepTarget, toggleCategory, type Filter } from "../lib/filters";
import { writeHash } from "../lib/hash";
import type { CategoryId, Site } from "../types";

export interface CameraRequest {
  id: string;
  /** Always move, even if the pin is already in view. */
  force: boolean;
  seq: number;
}

export type Detent = "peek" | "half" | "full";
export type ThemeMode = "auto" | "light" | "dark";

export interface State {
  year: number;
  selectedId: string | null;
  cats: ReadonlySet<CategoryId>;
  /** Raw text in the search box. */
  queryRaw: string;
  /** Normalized query used for matching. */
  query: string;
  playing: boolean;
  /** Playback speed multiplier. */
  speed: 1 | 2 | 4;
  /** Phone bottom sheet height. */
  sheet: Detent;
  /** Site previewed by hovering a marker, list row or timeline tick. */
  hoverId: string | null;
  helpOpen: boolean;
  /** Full-screen photo viewer: which site's media, and which image. */
  viewer: { siteId: string; index: number } | null;
  theme: ThemeMode;
  toast: { text: string; seq: number } | null;
  showShoreline: boolean;
  camera: CameraRequest | null;
}

const ALL_CATS = CATEGORIES.map((c) => c.id);

let state: State = {
  year: MAX_YEAR,
  selectedId: null,
  cats: new Set(ALL_CATS),
  queryRaw: "",
  query: "",
  playing: false,
  speed: 1,
  sheet: "peek",
  hoverId: null,
  helpOpen: false,
  viewer: null,
  theme: "auto",
  toast: null,
  showShoreline: true,
  camera: null,
};

const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const getState = () => state;
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state), () => pick(state));
}

const matcher = makeMatcher(CATEGORY_NAME);
export const matches = (site: Site, f: Filter = state) => matcher(site, f);
export const filtered = (f: Filter = state) => ORDERED.filter((s) => matcher(s, f));

let cameraSeq = 0;

export interface SelectOptions {
  /** Always fly to the site. */
  pan?: boolean;
  /** Never move the map. */
  noPan?: boolean;
  /** Phone sheet height to show the story at (default: keep it, at least "peek"). */
  sheet?: Detent;
  /** Set the slider to the site's year even if it is already visible. */
  setYear?: boolean;
}

export const actions = {
  setYear(year: number) {
    set({ year: Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(year))) });
  },

  select(id: string, o: SelectOptions = {}) {
    const site = SITE_BY_ID[id];
    if (!site) return;
    const patch: Partial<State> = { selectedId: id };
    if (o.sheet) patch.sheet = o.sheet;
    if (!state.cats.has(site.category)) patch.cats = new Set([...state.cats, site.category]);
    if (o.setYear || site.year > state.year) patch.year = site.year;
    if (!o.noPan) patch.camera = { id, force: !!o.pan, seq: ++cameraSeq };
    set(patch);
    writeHash(id);
  },

  tapCategory(c: CategoryId | "all") {
    set({ cats: toggleCategory(state.cats, c, ALL_CATS) });
  },

  setQuery(raw: string) {
    set({ queryRaw: raw, query: norm(raw.trim()) });
  },

  step(dir: 1 | -1) {
    const t = stepTarget(filtered(), state.selectedId, state.year, dir);
    if (t) actions.select(t.id, { pan: true, setYear: true });
  },

  /** Back to the list. */
  clear() {
    if (state.selectedId == null) return;
    set({ selectedId: null });
    writeHash(null);
  },
  random() {
    const pool = filtered().filter((s) => s.id !== state.selectedId);
    const t = pool[Math.floor(Math.random() * pool.length)];
    if (t) actions.select(t.id, { pan: true, setYear: true, sheet: state.sheet === "full" ? "full" : "half" });
  },
  setSheet(sheet: Detent) {
    set({ sheet });
  },
  hover(id: string | null) {
    if (state.hoverId !== id) set({ hoverId: id });
  },
  openViewer(siteId: string, index = 0) {
    set({ viewer: { siteId, index } });
  },
  setViewerIndex(index: number) {
    if (state.viewer) set({ viewer: { ...state.viewer, index } });
  },
  closeViewer() {
    if (state.viewer) set({ viewer: null });
  },
  setHelp(helpOpen: boolean) {
    set({ helpOpen });
  },
  setTheme(theme: ThemeMode) {
    set({ theme });
  },
  setSpeed(speed: 1 | 2 | 4) {
    set({ speed });
  },
  toast(text: string) {
    set({ toast: { text, seq: (state.toast?.seq ?? 0) + 1 } });
  },
  setShoreline(v: boolean) {
    set({ showShoreline: v });
  },

  play() {
    if (playTimer) return;
    let y = state.year >= MAX_YEAR ? MIN_YEAR : state.year;
    actions.setYear(y);
    set({ playing: true });
    const tick = () => {
      y++;
      if (y > MAX_YEAR) return actions.stop();
      actions.setYear(y);
      const hits = ORDERED.filter((s) => s.year === y && matches(s));
      const hit = hits[hits.length - 1];
      if (hit) actions.select(hit.id);
      playTimer = setTimeout(tick, (hit ? PLAY_PAUSE_MS : PLAY_STEP_MS) / state.speed);
    };
    playTimer = setTimeout(tick, PLAY_STEP_MS / state.speed);
  },
  stop() {
    if (playTimer) clearTimeout(playTimer);
    playTimer = null;
    if (state.playing) set({ playing: false });
  },
  togglePlay() {
    if (playTimer) actions.stop();
    else actions.play();
  },
};

export const PLAY_STEP_MS = 55;
export const PLAY_PAUSE_MS = 520;
let playTimer: ReturnType<typeof setTimeout> | null = null;

/** Test hook: reset to the initial state. */
export function __reset() {
  actions.stop();
  state = {
    ...state,
    year: MAX_YEAR,
    selectedId: null,
    cats: new Set(ALL_CATS),
    queryRaw: "",
    query: "",
    sheet: "peek",
    hoverId: null,
    speed: 1,
    camera: null,
  };
}
