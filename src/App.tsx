import { lazy, Suspense, useEffect, useState } from "react";
import { startRouter } from "./lib/router";
import { useUpdateReady } from "./lib/sw";
import { MapView } from "./map/MapView";
import { actions, getState, subscribe, useStore } from "./state/store";
import { Legend } from "./ui/Legend";
import { MarkerList } from "./ui/MarkerList";
import { Help, Toast } from "./ui/Overlays";
import { Panel } from "./ui/Panel";
import { Timeline } from "./ui/Timeline";
import { isWide } from "./ui/media";

// The photo viewer is its own chunk, loaded the first time it is needed.
const Viewer = lazy(() => import("./ui/media/Viewer"));
const THEME_KEY = "ctm-theme";

/** The theme-color metas as index.html wrote them (light and dark, by media query). */
let themeMetas: { el: HTMLMetaElement; content: string }[] | null = null;

function applyTheme() {
  const t = getState().theme;
  const root = document.documentElement;
  if (t === "auto") delete root.dataset.theme;
  else root.dataset.theme = t;
  // the browser bar and the installed app's title bar follow a forced theme too
  themeMetas ??= [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((el) => ({ el, content: el.content }));
  const bg = t === "auto" ? "" : getComputedStyle(root).getPropertyValue("--bg").trim();
  for (const m of themeMetas) m.el.content = bg || m.content;
}

/** Remove a one-shot query flag (?random from the app shortcut) so a reload doesn't repeat it. */
function takeFlag(name: string): boolean {
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has(name)) return false;
    q.delete(name);
    const s = q.toString();
    history.replaceState(history.state, "", location.pathname + (s ? "?" + s : "") + location.hash);
    return true;
  } catch {
    return false;
  }
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

    // deep links (#fire, #fire/photo/2) and the Back button
    const random = takeFlag("random");
    const stopRouter = startRouter();
    if (random && !getState().selectedId) actions.random();

    // The photo viewer handles its own keys (Escape closes it, not the story). Note whether
    // it was open when the key went down, before any handler could close it.
    let viewerAtKey = false;
    const noteViewer = () => {
      viewerAtKey = getState().viewer !== null;
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = getState();
      if (viewerAtKey || s.viewer || e.defaultPrevented) return;
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
    // iOS: a pinch on the map or the timeline zooms the map, never the page
    const noPageZoom = (e: Event) => {
      if ((e.target as Element | null)?.closest?.("#map,.dock")) e.preventDefault();
    };
    addEventListener("keydown", noteViewer, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("gesturestart", noPageZoom);
    // a handle for tests and debugging
    (window as unknown as { __ctm?: unknown }).__ctm = { getState, actions };
    return () => {
      unsubTheme();
      stopRouter();
      removeEventListener("keydown", noteViewer, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("gesturestart", noPageZoom);
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
      <UpdatePrompt />
    </div>
  );
}

/** A new version took over (service worker update): offer a reload, once. */
function UpdatePrompt() {
  const ready = useUpdateReady();
  const [gone, setGone] = useState(false);
  if (!ready || gone) return null;
  return (
    <div className="ctm-update" role="status">
      <span>Time Map was updated</span>
      <button type="button" className="go" onClick={() => location.reload()}>
        Reload
      </button>
      <button type="button" className="x" aria-label="Dismiss" onClick={() => setGone(true)}>
        ✕
      </button>
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
