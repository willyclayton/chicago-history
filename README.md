# Chicago Time Map

Chicago history on a real map of the city. Drag the timeline from 1780 to today, filter by theme, search, and tap a star to read what happened there, with Street View of the spot today.

Built from [`docs/SPEC.md`](docs/SPEC.md) (v1 scope) and the reference [`docs/prototype.html`](docs/prototype.html).

## Using it

- **Map-first layout.** One panel switches between the site list and a site's story, with a back button. On phones it's a bottom sheet: drag it, flick it, or tap the handle to move between peek, half and full.
- **Timeline dock.** Play (with 1×/2×/4× speed and a progress ring), drag the star along a population curve (it settles on events), click an era to jump to it, hover a tick to preview a site, and use Next, which names the next event.
- **Linked previews.** Hovering a list row, a timeline tick or a star highlights the same site everywhere and shows a tooltip on the map.
- **Story.** Swipe the header left or right to step through time, shuffle to a random site, share the link, and open Street View. Your place in the list is kept when you come back.
- **Keyboard:** `/` search (Enter opens the top result, ↓ moves into the list), `Space` play/pause, `←` `→` previous/next site, `R` random, `T` light/dark, `Esc` back, `?` shortcuts.
- **Map:** clusters with counts when zoomed out (click to zoom in), a hover card that stays clear of the panels, a glowing ring on the open site, and a Map key whose theme rows filter the map and whose switches show the 1830s shoreline and the 1871 burn area.
- **List extras:** match highlighting with excerpts, "did you mean" suggestions, recently viewed sites, era progress and a line marking the slider year, plus nearby and same-theme cards at the end of each story.
- A one-time tip points new visitors to Play (skip it with `?nocoach`). The light/dark choice is remembered.

## Run it

```sh
npm install
npm run dev          # local dev server
npm test             # Vitest: data validation + filter/timeline/store logic
npm run test:smoke   # Playwright smoke test (builds and serves dist/)
npm run build        # static site in dist/
```

Copy `.env.example` to `.env` and set `VITE_GOOGLE_MAPS_EMBED_KEY` to embed Street View in the story card. Without a key the card shows the "Street View ↗" link instead of the panorama. Restrict the key by HTTP referrer to the production domain.

## Deploy

`.github/workflows/deploy.yml` runs the tests, builds, and publishes `dist/` to GitHub Pages. The build uses a relative base path, so it also works on any static host (Netlify, Vercel, a subpath of another site). For the embedded Street View in production, add a `VITE_GOOGLE_MAPS_EMBED_KEY` repository secret.

## Layout

```
src/
  data/        sites.json, categories.json, eras.json, census.json, overlays.geojson (SPEC Appendix B)
  map/         MapView.tsx (MapLibre layers, fly-to, pulse, fades), starIcon.ts (SDF flag star), styles/basemap.ts
  ui/          Panel (sidebar / bottom sheet), SiteList, StoryCard, Timeline dock, Chips, Legend, Overlays (help, toast), MarkerList
  state/       store.ts: year, selection, categories, query, playback
  lib/         filters.ts, census.ts, eras.ts, hash.ts, links.ts
  theme.css    tokens and layout ported from the prototype
tests/         data.test.ts, filters.test.ts, smoke.spec.ts
```

## Notes and deviations from the spec

- **Basemap:** OpenFreeMap vector tiles (no key), restyled at runtime from the CSS tokens, so the light and dark map always match the page theme and switch live.
- **Bundle size:** MapLibre alone is about 276 KB gzip, so React is aliased to `preact/compat` (same API) and MapLibre loads as a separate chunk right after the UI. The first-load JS is about 32 KB gzip; the map chunk is about 285 KB. Remove the alias in `vite.config.ts` to build with React itself.
- **Marker labels** use Noto Sans Bold from the tile server's glyphs. MapLibre can only draw text from glyph PBFs, so the display face (Big Shoulders) is used everywhere except on the map.
- **Data accuracy pass (SPEC §11) is not done yet.** `sources` is empty for every site. The "every site has a source" test is a launch gate: run `REQUIRE_SOURCES=1 npm test` to enforce it.
- Fixed one data issue the tests caught: the Century of Progress map label was 19 characters (limit 18); it is now "Century Progress".
