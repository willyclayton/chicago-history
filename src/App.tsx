import { useEffect } from "react";
import { SITE_BY_ID } from "./data";
import { readHash } from "./lib/hash";
import { MapView } from "./map/MapView";
import { actions, getState } from "./state/store";
import { Chips } from "./ui/Chips";
import { Counter } from "./ui/Counter";
import { Legend } from "./ui/Legend";
import { MarkerList } from "./ui/MarkerList";
import { SiteList } from "./ui/SiteList";
import { StoryCard } from "./ui/StoryCard";
import { Timeline } from "./ui/Timeline";
import { isWide } from "./ui/media";

const valid = (id: string) => id in SITE_BY_ID;

export function App() {
  useEffect(() => {
    // Deep link (#fire) or the default story.
    const start = readHash(valid);
    if (start) actions.select(start, { pan: true, open: isWide() });
    else actions.select("fire", { noPan: true, open: isWide() });

    const onHash = () => {
      const id = readHash(valid);
      if (id && id !== getState().selectedId) actions.select(id, { pan: true });
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (!isWide()) actions.hideCard();
        return;
      }
      // the slider, search box and focused map keep their own arrow keys
      if (t?.closest("input,textarea,select,.maplibregl-map")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        actions.stop();
        actions.step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    addEventListener("hashchange", onHash);
    document.addEventListener("keydown", onKey);
    return () => {
      removeEventListener("hashchange", onHash);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span className="star" aria-hidden="true">
            ✶
          </span>{" "}
          Chicago Time Map
        </h1>
        <p>Drag the timeline, filter by theme, and tap a star to read what happened there. Every spot opens in Street View.</p>
      </header>

      <Timeline />
      <Chips />

      <main className="stage">
        <SiteList />
        <div className="mapwrap" id="mapwrap">
          <MapView />
          <Counter />
          <MarkerList />
          <Legend />
          <StoryCard />
        </div>
      </main>

      <footer className="foot">
        Sites are pinned at their commonly cited locations, and many original buildings are gone. The 1871 burn area and
        1830s shoreline are approximate. Death tolls and crowd sizes are historical estimates. Population figures are U.S.
        Census decennial counts for the city of Chicago. Street map ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
          OpenStreetMap
        </a>{" "}
        contributors, tiles by{" "}
        <a href="https://openfreemap.org" target="_blank" rel="noopener">
          OpenFreeMap
        </a>
        .
      </footer>
    </div>
  );
}
