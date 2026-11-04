import { lazy, Suspense, useEffect } from "react";
import { SITE_BY_ID } from "./data";
import { readHash } from "./lib/hash";
import { MapView } from "./map/MapView";
import { actions, getState, subscribe, useStore } from "./state/store";
import { Legend } from "./ui/Legend";
import { MarkerList } from "./ui/MarkerList";
import { Help, Toast } from "./ui/Overlays";
import { Panel } from "./ui/Panel";
import { Timeline } from "./ui/Timeline";
import { isWide } from "./ui/media";

const valid = (id: string) => id in SITE_BY_ID;
// The photo viewer is its own chunk, loaded the first time it is needed.
const Viewer = lazy(() => import("./ui/media/Viewer"));
const THEME_KEY = "ctm-theme";

function applyTheme() {
  const t = getState().theme;
  const root = document.documentElement;
  if (t === "auto") delete root.dataset.theme;
  else root.dataset.theme = t;
}

export function App() {
  useEffect(() => {
    // remembered theme
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === "light" || t === "dark") actions.setTheme(t);
    } catch {
      /* storage unavailable */
    }
    applyTheme();
    let lastTheme = getState().theme;
    const unsubTheme = subscribe(() => {
      const t = getState().theme;
      if (t === lastTheme) return;
      lastTheme = t;
      applyTheme();
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch {
        /* storage unavailable */
      }
    });

    // deep link (#fire)
    const start = readHash(valid);
    if (start) actions.select(start, { pan: true, sheet: isWide() ? undefined : "half" });

    const onHash = () => {
      const id = readHash(valid);
      if (id && id !== getState().selectedId) actions.select(id, { pan: true });
      else if (!id) actions.clear();
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = getState();
      if (e.key === "Escape") {
        if (s.helpOpen) actions.setHelp(false);
        else if (s.selectedId) actions.clear();
        else if (!isWide()) actions.setSheet("peek");
        return;
      }
      if (s.helpOpen) return;
      const typing = !!t?.closest("textarea,select,input:not([type=range]):not([type=checkbox])");
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        if (!isWide() && s.sheet === "peek") actions.setSheet("full");
        if (s.selectedId) actions.clear();
        requestAnimationFrame(() => document.getElementById("q")?.focus());
      } else if (e.key === "?") {
        actions.setHelp(true);
      } else if (e.key === " " && !t?.closest("button,a,summary")) {
        e.preventDefault();
        actions.togglePlay();
      } else if (e.key === "r" || e.key === "R") {
        actions.stop();
        actions.random();
      } else if (e.key === "t" || e.key === "T") {
        const dark = document.documentElement.dataset.theme
          ? document.documentElement.dataset.theme === "dark"
          : matchMedia("(prefers-color-scheme: dark)").matches;
        actions.setTheme(dark ? "light" : "dark");
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !t?.closest(".maplibregl-map,#list,input")) {
        // the slider, search box, list and focused map keep their own arrow keys
        e.preventDefault();
        actions.stop();
        actions.step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    addEventListener("hashchange", onHash);
    document.addEventListener("keydown", onKey);
    return () => {
      unsubTheme();
      removeEventListener("hashchange", onHash);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="app">
      <h1 className="sr-only">Chicago Time Map</h1>
      <MapView />
      <MarkerList />
      <Legend />
      <Timeline />
      <Panel />
      <div className="attrib">
        Sites and figures are approximate · ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
          OpenStreetMap
        </a>{" "}
        ·{" "}
        <a href="https://openfreemap.org" target="_blank" rel="noopener">
          OpenFreeMap
        </a>
      </div>
      <Toast />
      <Help />
      <ViewerMount />
    </div>
  );
}

function ViewerMount() {
  const open = useStore((s) => s.viewer !== null);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Viewer />
    </Suspense>
  );
}
