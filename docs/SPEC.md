# Chicago Time Map: Build Spec

Owner: Will Clayton · Written 2026-11-03 · Status: ready to build

## 1. What we're building

A web app that shows Chicago history on a real map of the city. A timeline slider runs from 1780 to the current year. Pins appear as their year comes up. Tapping a pin opens the story of what happened there, and Street View of the spot today.

There is already a working prototype, `prototype.html`, in this folder. It's a single HTML file with a hand-drawn SVG map. Open it in a browser to see the target look and behavior. This build keeps that UI and fixes the two things a sandboxed artifact couldn't do:

1. **A real basemap.** Real streets, zoom levels and labels instead of the approximate hand-drawn grid.
2. **Embedded Street View.** The panorama shows inside the story card instead of opening a new tab.

**Done means:** all 67 sites from Appendix B load from a data file, every feature in sections 5 to 9 works on desktop and phone in light and dark mode, the acceptance checklist (section 12) passes, and the site deploys as a static build.

## 2. Files in this handoff

| File | What it is |
| --- | --- |
| `SPEC.md` | This document |
| `prototype.html` | Working reference build. The source of truth for layout, colors, type and interactions. Port its CSS tokens directly. |

Appendix B holds the full dataset as JSON. Copy it into `src/data/` as described in section 4. Don't retype it.

## 3. Scope

**v1 (build this)**
- Real vector basemap (MapLibre), restyled to match the prototype palette, in light and dark versions
- 67 sites with star markers colored by category, plus labels that hide on collision
- Timeline: slider, era bands, colored event ticks, previous and next event buttons, Play
- Theme filter chips, text search, and a site list grouped by era
- Story card with embedded Street View, a Google Maps link, and previous/next navigation
- Historical overlays: the 1871 burn area and the 1830s shoreline
- Deep links to each site (`/#fire`)
- Data validation tests

**Later (don't build yet; keep the code open to them)**
- Historical photos per site (blocked on image licensing, see section 13)
- Historical map overlays, such as georeferenced Sanborn or 1868 maps, as raster layers tied to years
- More layers: neighborhood boundaries over time, L lines by opening year
- User-suggested sites

**Out of scope:** accounts, a backend, a CMS, and native apps.

## 4. Stack and structure

- **Vite + React + TypeScript.** Static build, no server.
- **MapLibre GL JS** for the map. Use free vector tiles that need no key (for example OpenFreeMap). If one provider can't supply both a light and a dark style, use MapTiler or Stadia with a key. Restyle the layers to the prototype tokens either way: muted land, light-blue lake, quiet streets, red accents.
- **Google Maps Embed API, Street View mode**, for the panorama iframe. It needs an API key restricted by HTTP referrer. Check Google's current pricing page before launch; at time of writing the Embed API is listed as no-charge.
- **Fonts:** Big Shoulders Display (display) and Libre Franklin (body), from Google Fonts with the fallback stacks used in the prototype.
- **Tests:** Vitest for data and logic, plus one Playwright smoke test.
- **State:** plain React state or a tiny store such as Zustand. No Redux.

```
src/
  data/
    sites.json         # Appendix B "sites"
    categories.json    # Appendix B "cats"
    eras.json          # Appendix B "eras"
    census.json        # Appendix B "census"
    overlays.geojson   # Appendix B "geojson"
  map/
    MapView.tsx        # MapLibre setup, layers, fly-to
    styles/            # light.json, dark.json (restyled basemap)
    starIcon.ts        # SDF six-point star so icon-color can vary by category
  ui/
    Timeline.tsx  Chips.tsx  SiteList.tsx  StoryCard.tsx  Legend.tsx
  state/store.ts       # year, selectedId, activeCategories, query, playing
  lib/
    filters.ts  census.ts  eras.ts  hash.ts
  theme.css            # tokens copied from prototype.html :root blocks
tests/
  data.test.ts  filters.test.ts  smoke.spec.ts
```

`.env`: `VITE_GOOGLE_MAPS_EMBED_KEY=...`. If the key is missing, the card shows the Street View link instead of the iframe.

## 5. Data model

```ts
type CategoryId = "growth" | "dark" | "rights" | "building" | "culture" | "play" | "fairs";

interface Site {
  id: string;          // unique slug, also the URL hash
  year: number;        // year the pin appears on the timeline (start year of a span)
  date: string;        // display date, e.g. "Oct 8 to 10, 1871" or "1893 to 1915"
  title: string;
  short: string;       // map label, ideally 16 characters or fewer
  category: CategoryId;
  lat: number;
  lng: number;
  address: string;     // "Where" line
  story: string;       // 2 to 4 sentences, plain text
  today: string;       // what is at the spot now
  flagStar?: boolean;  // one of the four events behind the stars on the city flag
  streetView?: boolean;// false = no panorama (e.g. a site in the lake); default true
  svHeading?: number;  // optional camera heading for the panorama
  svPitch?: number;
  sources: { title: string; url: string }[]; // filled in by the data pass in section 11
}
```

- **Categories:** seven, each with a light-mode and a dark-mode color (Appendix B `cats`). Category color is the only color on a marker. Red is the brand accent and also the "Disasters & crime" color, so don't reuse red for UI chrome on markers.
- **Eras:** seven named ranges covering 1780 to the present (Appendix B `eras`). The last era's `to` is the current year.
- **Census:** decennial city population, 1840 to 2020. Show the latest count at or before the slider year. Before 1840 show "Before the first census count."
- **Overlays:** the burn polygon is visible when 1871 ≤ year ≤ 1874, or whenever the Great Chicago Fire is selected. The 1830s shoreline is a dashed line, always on, toggleable in the legend.

## 6. Map

- **Start view:** downtown, centered near the river forks (41.887, -87.638), at about zoom 13. A "Whole city" button fits the bounds of all sites.
- **Markers:** a MapLibre symbol layer with an SDF six-point star (the Chicago flag star), `icon-color` from the category. Flag-star sites get an extra thin red ring. The selected site gets a larger icon, a dark outline and a soft halo.
- **Labels:** the `short` field, in the display font, at zoom 14 and above (always shown for the selected site). Use `text-optional: true` so icons stay when labels collide. Priority goes to the selected site, then flag stars, then earlier years.
- **Visibility:** a filter expression shows a site only if `year <= sliderYear`, its category is active, and it matches the search. Animate opacity in and out; respect reduced motion.
- **Recent pulse:** sites from the 10 years before the slider year get a pulsing ring in their category color. It's off when the slider is at the current year, and static under `prefers-reduced-motion`.
- **Selecting a site:** fly to it at zoom 15 or more, with padding so the story card doesn't cover the pin: right padding of the card width on desktop, bottom padding of the sheet height on phone. If the pin is already visible and not covered, don't move the map.
- **Controls:** zoom in, zoom out, whole city, and a legend (collapsed by default, with a "Map key" summary).
- **Legend entries:** category colors, flag star ring, recent pulse, burned in 1871, and the 1830s shoreline.

## 7. Timeline

- Year readout in the large display face, era name in the accent color, and the census line.
- Slider from 1780 to the current year, step 1. Era bands under the track, from pale to deep red over time.
- **Event ticks** above the track, one per site, colored by category. A tick dims when its site is later than the slider, fades when filtered out, and gets an outline when its site is selected.
- **‹ / › buttons and ← / → keys** step to the previous or next site within the current filter, set the year to that site's year, and select it.
- **Play:** starts at 1780, or at the current slider year if mid-way. It moves one year every 55 ms and pauses 520 ms on any year with a matching site, selecting it. It stops at the end, or on any manual slider, list, step or marker interaction.
- Tick labels: 1780, 1850, 1900, 1950, and the current year.

## 8. Browse: filters, search, list

- **Chips:** "All themes" plus seven category chips, each with a color dot and a count.
  - With all on, tapping a category shows only that category.
  - After that, taps add or remove categories.
  - If none are left, reset to all.
  - "All themes" resets.
- **Search:** case- and accent-insensitive substring match over title, short, address, story, today, date, year and category name. Instant, with no submit.
- **List:** sites grouped under era headers (name and year range), sorted by year and then title. Each row shows the year, a category dot, the title, and the date and category.
  - Rows later than the slider year are dimmed but still clickable; clicking one jumps the year.
  - Hide era headers with no matching rows.
  - Empty state: "No sites match. Try another search or turn more themes on."
  - Clicking a row selects the site. On phone, it also scrolls the map into view.
- **Counter on the map:** "N of M sites by YEAR".

## 9. Story card and Street View

- **Contents, in order:**
  1. Kicker: year, category name, and a "City flag star" chip when relevant
  2. Title in the display face, uppercase
  3. Date and era
  4. Story
  5. Where / Today rows
  6. Street View
  7. Actions
  8. Previous / next links (within the current filter)
- **Street View:** an iframe at `https://www.google.com/maps/embed/v1/streetview?key=KEY&location=LAT,LNG` (add `&heading=` and `&pitch=` when set), with a 16:10 aspect ratio and lazy loading.
  - Skip the iframe when `streetView === false` or there's no key.
  - Always show an "Open in Street View ↗" link: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=LAT,LNG`.
  - Also show a "Maps ↗" link: `https://www.google.com/maps/search/?api=1&query=LAT,LNG`.
- **Desktop (wider than 1000px):** the card floats at the top right of the map, 370px wide, and scrolls internally.
- **Phone:** a bottom sheet. Collapsed, it shows the kicker, title, date and buttons. "Read story" expands it to the story and Street View. A ✕ hides it, and Escape also hides it.
- The card's accent color comes from the site's category.

## 10. Layout, look, accessibility

- **Layout:** header, then the timeline bar, then the chips, then a two-column stage: a 320px browse panel on the left and the map filling the rest.
  - The stage height is `clamp(560px, 100dvh - 250px, 980px)`.
  - At 1000px and below the stage stacks with the map first (about 74dvh). The chips become one horizontally scrolling row.
- **Theme:** copy the token blocks from `prototype.html`. Follow `prefers-color-scheme`, with matching light and dark basemap styles. No hard-coded colors outside the tokens.
- **Accessibility:**
  - Every control is reachable by keyboard with a visible focus ring.
  - Markers have accessible names ("Great Chicago Fire, Oct 8 to 10, 1871") through a hidden, focusable list or MapLibre's keyboard handling.
  - The card is an `aria-live="polite"` region.
  - Turn off pulses and fly-to animation under reduced motion.
- **Deep links:** `#<site-id>` selects that site on load, sets the year if needed and flies to it. Update the hash with `replaceState` on select and react to `hashchange`.
- **Performance:** first load under 300 KB of JS (gzip) excluding map tiles. Load Street View only when the card is open.

## 11. Data accuracy pass (do this before launch)

The stories, dates and coordinates were written from general knowledge, not checked against sources. Treat them as a draft.

- For every site, confirm the year, date string, numbers and address against at least one reliable source: the Encyclopedia of Chicago (encyclopedia.chicagohistory.org), the City of Chicago Landmarks database, the National Park Service, or museum and institution pages. Add each source to `sources`.
- Geocode every address and fix lat/lng. Several pins are approximate on purpose: Two-Mile Crib (in the lake), I&M Canal origin, Wolf Point, City Cemetery, Fort Dearborn, Camp Douglas, Regal Theater and Disco Demolition.
- Numbers to double-check with care:
  - Fire: deaths, buildings, area
  - Iroquois: "at least 602"
  - Eastland: 844
  - 1919 riot: 38 killed, 500+ injured
  - Haymarket casualties
  - Cubs rally crowd: city estimate of 5 million, flagged as disputed
- Where sources disagree, use the more conservative figure and say "estimated" in the story. Don't present a disputed number as fact.
- Keep each story at 2 to 4 sentences of plain, neutral language.

## 12. Acceptance checklist

- [ ] `npm run build` produces a static site; `npm test` passes
- [ ] Data tests: ids unique and slug-safe; years between 1780 and the current year; coordinates inside the Chicago bounding box (41.64 to 42.03 N, -87.94 to -87.52 W); every category valid; `short` is 18 characters or fewer; every site has at least one source after the section 11 pass
- [ ] Slider at 1850 shows only sites with year ≤ 1850; the counter matches
- [ ] Burn overlay shows from 1871 to 1874 and when the fire is selected; hidden otherwise
- [ ] Chip logic matches section 8, including the none-left reset
- [ ] Searching "capone" finds the Massacre and the Green Mill; "pullman" finds Pullman and Glessner House
- [ ] ‹ › and arrow keys step through the filtered sites in year order
- [ ] Play runs 1780 to the current year, pausing on events, and stops on any interaction
- [ ] `/#valentine` opens the Massacre card, with the year set and the map centered on the pin
- [ ] Street View iframe loads for land sites; Two-Mile Crib shows the link only
- [ ] At 390px wide: no horizontal page scroll; the bottom sheet collapses and expands; the chips scroll
- [ ] Light and dark both readable, including basemap labels
- [ ] Keyboard-only run-through works: tab to search, pick a list row, read the card, step next

## 13. Open questions for Will

- **Hosting:** a subpath of willyclayton.com, or its own domain on Vercel, Netlify or GitHub Pages?
- **Google API key:** OK to create one in your Google Cloud account and restrict it to the production domain?
- **Photos:** worth adding historical photos later? That needs public-domain or licensed images (for example the Library of Congress or Chicago Public Library collections) with credits.
- **Sites:** any you want added or cut before the data pass?

## Appendix A: Site index

| Year | Site | Category | Flag star | Address |
| --- | --- | --- | --- | --- |
| 1784 | Point du Sable's trading post | Growth & industry |  | North bank at the river mouth, near 401 N. Michigan Ave |
| 1803 | Fort Dearborn | Growth & industry | yes | Michigan Ave and Wacker Dr, south bank of the river |
| 1830 | Wolf Point | Growth & industry |  | Where the North and South Branches meet |
| 1843 | City Cemetery | Growth & industry |  | Lakefront north of North Ave |
| 1848 | Illinois & Michigan Canal | Growth & industry |  | South Branch at Bridgeport (approximate) |
| 1856 | Old St. Patrick's Church | Architecture |  | 700 W. Adams St |
| 1860 | Graceland Cemetery | Architecture |  | 4001 N. Clark St |
| 1860 | The Wigwam | Politics & protest |  | Lake St and Wacker Dr (then Market St) |
| 1862 | Camp Douglas | Disasters & crime |  | 31st St to 33rd St at Cottage Grove Ave |
| 1865 | Union Stock Yards | Growth & industry |  | Exchange Ave and Peoria St |
| 1867 | Two-Mile Crib | Growth & industry |  | Lake Michigan, about 2 miles off Chicago Ave |
| 1868 | Lincoln Park Zoo | Sports & fun |  | 2001 N. Clark St |
| 1869 | Chicago Water Tower | Architecture |  | 806 N. Michigan Ave |
| 1871 | Great Chicago Fire | Disasters & crime | yes | O'Leary barn, 137 DeKoven St (now 558 W.) |
| 1880 | Pullman | Politics & protest |  | Hotel Florence, 111th St and Forrestville Ave |
| 1885 | Home Insurance Building | Architecture |  | LaSalle St and Adams St |
| 1886 | Haymarket Affair | Politics & protest |  | Desplaines St near Randolph St |
| 1887 | Glessner House | Architecture |  | 1800 S. Prairie Ave |
| 1889 | Auditorium Building | Architecture |  | 50 E. Ida B. Wells Dr |
| 1889 | Hull House | Politics & protest |  | 800 S. Halsted St |
| 1893 | Art Institute of Chicago | Arts & culture |  | 111 S. Michigan Ave |
| 1893 | West Side Grounds | Sports & fun |  | Polk St and Wood St |
| 1893 | World's Columbian Exposition | Fairs & science | yes | Jackson Park |
| 1900 | River reversed | Growth & industry |  | Mouth of the Chicago River |
| 1903 | Iroquois Theater fire | Disasters & crime |  | 24 W. Randolph St |
| 1904 | Riverview Park | Sports & fun |  | Western Ave and Belmont Ave |
| 1905 | Chicago Defender | Arts & culture |  | 3435 S. Indiana Ave (offices from 1920s) |
| 1907 | Essanay Studios | Arts & culture |  | 1345 W. Argyle St |
| 1907 | Green Mill | Arts & culture |  | 4802 N. Broadway |
| 1908 | Garfield Park Conservatory | Architecture |  | 300 N. Central Park Ave |
| 1910 | Robie House | Architecture |  | 5757 S. Woodlawn Ave |
| 1912 | Chinatown | Growth & industry |  | Wentworth Ave and Cermak Rd |
| 1912 | Maxwell Street Market | Arts & culture |  | Maxwell St and Halsted St |
| 1914 | Wrigley Field | Sports & fun |  | 1060 W. Addison St |
| 1915 | Eastland disaster | Disasters & crime |  | South bank between Clark and LaSalle |
| 1916 | Navy Pier | Sports & fun |  | 600 E. Grand Ave |
| 1919 | 1919 race riot | Politics & protest |  | 29th Street beach |
| 1924 | Soldier Field | Sports & fun |  | 1410 Museum Campus Dr |
| 1925 | Tribune Tower | Architecture |  | 435 N. Michigan Ave |
| 1925 | Union Station | Growth & industry |  | 225 S. Canal St |
| 1927 | Buckingham Fountain | Sports & fun |  | Grant Park at Congress Plaza |
| 1927 | Midway Airport | Growth & industry |  | 5700 S. Cicero Ave |
| 1928 | Regal Theater | Arts & culture |  | 47th St and King Dr (then South Parkway) |
| 1929 | Chicago Stadium | Sports & fun |  | 1800 W. Madison St |
| 1929 | St. Valentine's Day Massacre | Disasters & crime |  | 2122 N. Clark St |
| 1930 | Adler Planetarium | Fairs & science |  | 1300 S. DuSable Lake Shore Dr |
| 1930 | Merchandise Mart | Architecture |  | 222 W. Merchandise Mart Plaza |
| 1933 | Century of Progress | Fairs & science | yes | Northerly Island and the lakefront |
| 1934 | Biograph Theater | Disasters & crime |  | 2433 N. Lincoln Ave |
| 1942 | Chicago Pile-1 | Fairs & science |  | Ellis Ave near 57th St, University of Chicago |
| 1955 | Emmett Till's funeral | Politics & protest |  | Roberts Temple Church of God in Christ, 4021 S. State St |
| 1957 | Chess Records | Arts & culture |  | 2120 S. Michigan Ave |
| 1959 | The Second City | Arts & culture |  | 1842 N. Wells St (first stage) |
| 1961 | DuSable Museum | Arts & culture |  | 740 E. 56th Pl, Washington Park |
| 1964 | Marina City | Architecture |  | 300 N. State St |
| 1966 | King's Marquette Park march | Politics & protest |  | Marquette Park |
| 1967 | The Chicago Picasso | Arts & culture |  | Daley Plaza, 50 W. Washington St |
| 1968 | 1968 convention protests | Politics & protest |  | Michigan Ave at Balbo, by the Conrad Hilton |
| 1969 | John Hancock Center | Architecture |  | 875 N. Michigan Ave |
| 1973 | Sears Tower | Architecture |  | 233 S. Wacker Dr |
| 1977 | The Warehouse | Arts & culture |  | 206 S. Jefferson St |
| 1979 | Disco Demolition Night | Sports & fun |  | Old Comiskey Park, 35th St and Shields Ave |
| 1990 | Harpo Studios | Arts & culture |  | 1058 W. Washington Blvd |
| 1992 | Chicago Flood | Disasters & crime |  | Kinzie St bridge over the North Branch |
| 1995 | Paseo Boricua | Arts & culture |  | Division St at Western Ave |
| 2004 | Millennium Park | Arts & culture |  | Michigan Ave between Randolph and Monroe |
| 2016 | Cubs World Series rally | Sports & fun |  | Hutchinson Field, Grant Park |

## Appendix B: Data

This was generated from the prototype's data, so it matches `prototype.html` exactly. Split it into the files listed in section 4. `sources` is empty until the section 11 pass.

### Sites → `src/data/sites.json`

```json
[
  {
    "id": "dusable",
    "year": 1784,
    "date": "c. 1780s",
    "title": "Point du Sable's trading post",
    "short": "Du Sable",
    "category": "growth",
    "lat": 41.8893,
    "lng": -87.624,
    "address": "North bank at the river mouth, near 401 N. Michigan Ave",
    "story": "Jean Baptiste Point du Sable, a Black trader of likely Haitian and French descent, built a farm and trading post on the north bank of the river in the 1780s. He is counted as Chicago's first permanent non-Native settler. He and his Potawatomi wife, Kitihawa, ran the post until he sold it in 1800.",
    "today": "Pioneer Court, beside the DuSable Bridge",
    "sources": []
  },
  {
    "id": "fortdearborn",
    "year": 1803,
    "date": "1803 to 1857",
    "title": "Fort Dearborn",
    "short": "Fort Dearborn",
    "category": "growth",
    "lat": 41.8874,
    "lng": -87.6243,
    "address": "Michigan Ave and Wacker Dr, south bank of the river",
    "story": "The U.S. Army built Fort Dearborn here in 1803. In August 1812, during the War of 1812, the garrison and settlers evacuated and were attacked by Potawatomi warriors along the lakeshore near today's 18th St and Prairie Ave, and the fort was burned. It was rebuilt in 1816 and taken apart over the following decades; the last building was gone by 1857.",
    "today": "Brass markers in the sidewalk outline the fort's footprint",
    "flagStar": true,
    "sources": []
  },
  {
    "id": "wolfpoint",
    "year": 1830,
    "date": "1830s",
    "title": "Wolf Point",
    "short": "Wolf Point",
    "category": "growth",
    "lat": 41.8869,
    "lng": -87.6378,
    "address": "Where the North and South Branches meet",
    "story": "In the late 1820s and early 1830s, the land where the river's branches meet held Chicago's first taverns and store and some of its first church services. Chicago was incorporated as a town in 1833 with a few hundred residents, then as a city in 1837.",
    "today": "Wolf Point towers and the Riverwalk",
    "sources": []
  },
  {
    "id": "cemetery",
    "year": 1843,
    "date": "1843 to 1860s",
    "title": "City Cemetery",
    "short": "Cemetery",
    "category": "growth",
    "lat": 41.9132,
    "lng": -87.6338,
    "address": "Lakefront north of North Ave",
    "story": "The city buried its dead on the lakefront north of town starting in 1843. Fear that graves this close to the lake were spreading disease led the city to move burials away in the 1860s and turn the land into Lincoln Park. Not every grave was moved, and remains still turn up during construction.",
    "today": "The 1858 Couch family tomb, behind the Chicago History Museum",
    "sources": []
  },
  {
    "id": "canal",
    "year": 1848,
    "date": "April 1848",
    "title": "Illinois & Michigan Canal",
    "short": "I&M Canal",
    "category": "growth",
    "lat": 41.8435,
    "lng": -87.665,
    "address": "South Branch at Bridgeport (approximate)",
    "story": "The 96-mile canal ran from the South Branch at Bridgeport to the Illinois River, linking the Great Lakes to the Mississippi. It made Chicago the country's shipping hub, and many of the Irish laborers who dug it settled in Bridgeport.",
    "today": "Canal Origins Park area in Bridgeport",
    "sources": []
  },
  {
    "id": "stpats",
    "year": 1856,
    "date": "1856",
    "title": "Old St. Patrick's Church",
    "short": "Old St. Pat's",
    "category": "building",
    "lat": 41.879,
    "lng": -87.6445,
    "address": "700 W. Adams St",
    "story": "Built by Irish immigrants and dedicated in 1856, the church sat just west of the path of the 1871 fire and came through untouched. It is often called the oldest public building in the city.",
    "today": "Still an active parish, known for its block party",
    "sources": []
  },
  {
    "id": "graceland",
    "year": 1860,
    "date": "1860",
    "title": "Graceland Cemetery",
    "short": "Graceland",
    "category": "building",
    "lat": 41.955,
    "lng": -87.662,
    "address": "4001 N. Clark St",
    "story": "A rural garden cemetery when it opened, Graceland became the resting place of the people who built Chicago: Daniel Burnham, Louis Sullivan, Mies van der Rohe, Potter and Bertha Palmer, detective Allan Pinkerton and boxer Jack Johnson.",
    "today": "Open to visitors; Lorado Taft's Eternal Silence statue is a landmark",
    "sources": []
  },
  {
    "id": "wigwam",
    "year": 1860,
    "date": "May 18, 1860",
    "title": "The Wigwam",
    "short": "Wigwam",
    "category": "rights",
    "lat": 41.8857,
    "lng": -87.6372,
    "address": "Lake St and Wacker Dr (then Market St)",
    "story": "Republicans held their national convention in a temporary wooden hall called the Wigwam and nominated Abraham Lincoln for president on the third ballot. Chicago has hosted more major party conventions than any other city.",
    "today": "An office building; a plaque marks the site",
    "sources": []
  },
  {
    "id": "campdouglas",
    "year": 1862,
    "date": "1862 to 1865",
    "title": "Camp Douglas",
    "short": "Camp Douglas",
    "category": "dark",
    "lat": 41.836,
    "lng": -87.614,
    "address": "31st St to 33rd St at Cottage Grove Ave",
    "story": "Opened as a Union training camp, it became one of the largest prison camps for captured Confederate soldiers. Crowding, disease and cold winters killed thousands of prisoners before the war ended.",
    "today": "Homes and a park in Bronzeville; a historical marker",
    "sources": []
  },
  {
    "id": "stockyards",
    "year": 1865,
    "date": "Dec 25, 1865",
    "title": "Union Stock Yards",
    "short": "Stock Yards",
    "category": "growth",
    "lat": 41.82,
    "lng": -87.6487,
    "address": "Exchange Ave and Peoria St",
    "story": "The Union Stock Yards opened on Christmas Day 1865 and made Chicago the meatpacking capital of the world, the city Carl Sandburg called \"Hog Butcher for the World.\" Upton Sinclair's 1906 novel The Jungle exposed conditions in the packinghouses. The yards closed in 1971.",
    "today": "The limestone Union Stock Yard Gate still stands",
    "sources": []
  },
  {
    "id": "crib",
    "year": 1867,
    "date": "1867",
    "title": "Two-Mile Crib",
    "short": "Two-Mile Crib",
    "category": "growth",
    "lat": 41.8975,
    "lng": -87.5835,
    "address": "Lake Michigan, about 2 miles off Chicago Ave",
    "story": "Engineer Ellis Chesbrough ran a tunnel two miles under the lake bed to an intake crib, so the city could draw clean water far from the sewage flowing out of the river. The Water Tower on Michigan Ave was built to go with it.",
    "today": "The crib still stands offshore, visible from the lakefront (location approximate)",
    "streetView": false,
    "sources": []
  },
  {
    "id": "zoo",
    "year": 1868,
    "date": "1868",
    "title": "Lincoln Park Zoo",
    "short": "Zoo",
    "category": "play",
    "lat": 41.9211,
    "lng": -87.634,
    "address": "2001 N. Clark St",
    "story": "The zoo started with a gift of two pairs of swans from New York's Central Park. It is one of the oldest zoos in North America and has always been free.",
    "today": "Lincoln Park Zoo, still free",
    "sources": []
  },
  {
    "id": "watertower",
    "year": 1869,
    "date": "1869",
    "title": "Chicago Water Tower",
    "short": "Water Tower",
    "category": "building",
    "lat": 41.8972,
    "lng": -87.6243,
    "address": "806 N. Michigan Ave",
    "story": "The limestone tower hid a standpipe for the city's new waterworks, which drew water from an intake crib two miles out in the lake. Two years later it was one of the few structures in the burned district to survive the Great Fire.",
    "today": "Water Tower, now a free city art gallery",
    "sources": []
  },
  {
    "id": "fire",
    "year": 1871,
    "date": "Oct 8 to 10, 1871",
    "title": "Great Chicago Fire",
    "short": "Fire starts",
    "category": "dark",
    "lat": 41.869,
    "lng": -87.6418,
    "address": "O'Leary barn, 137 DeKoven St (now 558 W.)",
    "story": "The fire started in or near the O'Leary family barn on the night of Oct 8. A dry summer and a strong southwest wind pushed it across the river twice. It burned about 3.3 square miles and roughly 17,500 buildings; about 300 people died and some 100,000 lost their homes. The story of Mrs. O'Leary's cow was made up by a reporter, who later admitted it.",
    "today": "The Chicago Fire Academy, with a bronze Pillar of Fire sculpture",
    "flagStar": true,
    "sources": []
  },
  {
    "id": "pullman",
    "year": 1880,
    "date": "1880; strike 1894",
    "title": "Pullman",
    "short": "Pullman",
    "category": "rights",
    "lat": 41.6918,
    "lng": -87.6094,
    "address": "Hotel Florence, 111th St and Forrestville Ave",
    "story": "Railroad car maker George Pullman built a company town for his workers starting in 1880, with housing, shops and churches he controlled. When he cut wages in 1894 without lowering rents, workers struck. The boycott spread to railroads across the country until federal troops broke it.",
    "today": "Pullman National Monument (designated 2015)",
    "sources": []
  },
  {
    "id": "homeins",
    "year": 1885,
    "date": "1885",
    "title": "Home Insurance Building",
    "short": "First skyscraper",
    "category": "building",
    "lat": 41.8796,
    "lng": -87.6323,
    "address": "LaSalle St and Adams St",
    "story": "William Le Baron Jenney's 10-story office building carried its weight on a metal frame instead of thick masonry walls, and it is often called the first skyscraper. It was torn down in 1931.",
    "today": "The Field Building (135 S. LaSalle)",
    "sources": []
  },
  {
    "id": "haymarket",
    "year": 1886,
    "date": "May 4, 1886",
    "title": "Haymarket Affair",
    "short": "Haymarket",
    "category": "rights",
    "lat": 41.8846,
    "lng": -87.6443,
    "address": "Desplaines St near Randolph St",
    "story": "At a rally for the eight-hour workday, someone threw a bomb as police moved in to break up the crowd. Seven officers and at least four civilians died from the blast and the gunfire that followed. Eight anarchists were convicted in a trial widely seen as unfair, and four were hanged. The event is why much of the world marks May Day as a workers' holiday.",
    "today": "The Haymarket Memorial sculpture",
    "sources": []
  },
  {
    "id": "glessner",
    "year": 1887,
    "date": "1887",
    "title": "Glessner House",
    "short": "Glessner House",
    "category": "building",
    "lat": 41.8577,
    "lng": -87.6215,
    "address": "1800 S. Prairie Ave",
    "story": "H.H. Richardson designed this fortress-like granite home on Prairie Avenue, the city's millionaires' row, where Marshall Field and George Pullman also lived. Its plain street wall and sunny inner courtyard broke with Victorian fashion.",
    "today": "Glessner House museum",
    "sources": []
  },
  {
    "id": "auditorium",
    "year": 1889,
    "date": "Dec 1889",
    "title": "Auditorium Building",
    "short": "Auditorium",
    "category": "building",
    "lat": 41.876,
    "lng": -87.6253,
    "address": "50 E. Ida B. Wells Dr",
    "story": "Adler and Sullivan's combined theater, hotel and office block was the tallest building in Chicago when it opened. Its theater was praised for its acoustics, which engineer Dankmar Adler tuned himself.",
    "today": "Roosevelt University and the Auditorium Theatre",
    "sources": []
  },
  {
    "id": "hullhouse",
    "year": 1889,
    "date": "Sept 18, 1889",
    "title": "Hull House",
    "short": "Hull House",
    "category": "rights",
    "lat": 41.8717,
    "lng": -87.6476,
    "address": "800 S. Halsted St",
    "story": "Jane Addams and Ellen Gates Starr opened a settlement house in an old mansion to serve the neighborhood's immigrant families, with classes, a kindergarten, a gym and public baths. Addams won the Nobel Peace Prize in 1931.",
    "today": "Jane Addams Hull-House Museum, on the UIC campus",
    "sources": []
  },
  {
    "id": "artinst",
    "year": 1893,
    "date": "1893",
    "title": "Art Institute of Chicago",
    "short": "Art Institute",
    "category": "culture",
    "lat": 41.8796,
    "lng": -87.6237,
    "address": "111 S. Michigan Ave",
    "story": "The building went up on the lakefront for meetings tied to the 1893 world's fair, and the Art Institute moved in when the fair ended. The bronze lions out front arrived in 1894.",
    "today": "Art Institute of Chicago, with the Modern Wing added in 2009",
    "sources": []
  },
  {
    "id": "westside",
    "year": 1893,
    "date": "1893 to 1915",
    "title": "West Side Grounds",
    "short": "West Side Grounds",
    "category": "play",
    "lat": 41.8711,
    "lng": -87.6727,
    "address": "Polk St and Wood St",
    "story": "Before Wrigley Field, the Cubs played here. It was their home when they won the World Series in 1907 and 1908, their last title for 108 years.",
    "today": "The University of Illinois medical campus; a plaque marks the site",
    "sources": []
  },
  {
    "id": "expo",
    "year": 1893,
    "date": "May to Oct 1893",
    "title": "World's Columbian Exposition",
    "short": "White City",
    "category": "fairs",
    "lat": 41.788,
    "lng": -87.581,
    "address": "Jackson Park",
    "story": "Chicago beat New York to host the world's fair for the 400th anniversary of Columbus's voyage. Daniel Burnham's \"White City\" of plaster palaces drew about 27 million visits and introduced the Ferris wheel.",
    "today": "Jackson Park; the Palace of Fine Arts is now the Museum of Science and Industry",
    "flagStar": true,
    "sources": []
  },
  {
    "id": "reversal",
    "year": 1900,
    "date": "Jan 1900",
    "title": "River reversed",
    "short": "River reversed",
    "category": "growth",
    "lat": 41.8888,
    "lng": -87.611,
    "address": "Mouth of the Chicago River",
    "story": "Sewage from the river was fouling the lake the city drank from. Engineers dug the Sanitary and Ship Canal and made the river flow backward, away from the lake and toward the Mississippi. St. Louis sued; Chicago won.",
    "today": "The Chicago Harbor Lock, built in 1938, controls flow at the mouth",
    "sources": []
  },
  {
    "id": "iroquois",
    "year": 1903,
    "date": "Dec 30, 1903",
    "title": "Iroquois Theater fire",
    "short": "Iroquois fire",
    "category": "dark",
    "lat": 41.8847,
    "lng": -87.6288,
    "address": "24 W. Randolph St",
    "story": "During a packed holiday matinee, a stage light set a curtain on fire. Locked, hidden and inward-opening exits trapped the audience, and at least 602 people died, many of them children. It remains the deadliest single-building fire in U.S. history and led to panic bars and outward-opening exit doors.",
    "today": "The James M. Nederlander Theatre",
    "sources": []
  },
  {
    "id": "riverview",
    "year": 1904,
    "date": "1904 to 1967",
    "title": "Riverview Park",
    "short": "Riverview",
    "category": "play",
    "lat": 41.944,
    "lng": -87.688,
    "address": "Western Ave and Belmont Ave",
    "story": "For six decades this amusement park on the North Branch promised Chicagoans they could laugh their troubles away. It was famous for wooden coasters like the Bobs. It closed for good after the 1967 season.",
    "today": "Shopping center, offices and a small park",
    "sources": []
  },
  {
    "id": "defender",
    "year": 1905,
    "date": "1905",
    "title": "Chicago Defender",
    "short": "Defender",
    "category": "culture",
    "lat": 41.8298,
    "lng": -87.6229,
    "address": "3435 S. Indiana Ave (offices from 1920s)",
    "story": "Robert S. Abbott started the Defender in his landlady's kitchen. It became the most influential Black newspaper in the country, and Pullman porters carried copies south. Its calls to leave the Jim Crow South helped drive the Great Migration to Chicago.",
    "today": "The former Defender building, a city landmark",
    "sources": []
  },
  {
    "id": "essanay",
    "year": 1907,
    "date": "1907 to 1917",
    "title": "Essanay Studios",
    "short": "Essanay",
    "category": "culture",
    "lat": 41.9733,
    "lng": -87.6615,
    "address": "1345 W. Argyle St",
    "story": "Before Hollywood, Chicago was a movie capital. Essanay cranked out silent films here, gave Gloria Swanson an early start, and signed Charlie Chaplin, who made His New Job at the studio in 1915.",
    "today": "St. Augustine College; the studio's terra cotta logo is still over the door",
    "sources": []
  },
  {
    "id": "greenmill",
    "year": 1907,
    "date": "1907",
    "title": "Green Mill",
    "short": "Green Mill",
    "category": "culture",
    "lat": 41.969,
    "lng": -87.6597,
    "address": "4802 N. Broadway",
    "story": "The Uptown bar opened in 1907. In the Prohibition years, Capone gunman \"Machine Gun\" Jack McGurn had a stake in it. In 1986 it became home to Marc Smith's Uptown Poetry Slam, which spread the poetry slam around the world.",
    "today": "Still a jazz club, and the slam still runs on Sunday nights",
    "sources": []
  },
  {
    "id": "conservatory",
    "year": 1908,
    "date": "1908",
    "title": "Garfield Park Conservatory",
    "short": "Conservatory",
    "category": "building",
    "lat": 41.8863,
    "lng": -87.7173,
    "address": "300 N. Central Park Ave",
    "story": "Landscape architect Jens Jensen designed the glass houses to look like a haystack rising from the prairie. It is one of the largest conservatories in the country.",
    "today": "Garfield Park Conservatory, free",
    "sources": []
  },
  {
    "id": "robie",
    "year": 1910,
    "date": "1910",
    "title": "Robie House",
    "short": "Robie House",
    "category": "building",
    "lat": 41.7897,
    "lng": -87.596,
    "address": "5757 S. Woodlawn Ave",
    "story": "Frank Lloyd Wright's long, low brick house with its cantilevered roofs is the classic example of his Prairie style. It is part of a UNESCO World Heritage listing of his buildings.",
    "today": "Frederick C. Robie House museum",
    "sources": []
  },
  {
    "id": "chinatown",
    "year": 1912,
    "date": "c. 1912",
    "title": "Chinatown",
    "short": "Chinatown",
    "category": "growth",
    "lat": 41.8526,
    "lng": -87.632,
    "address": "Wentworth Ave and Cermak Rd",
    "story": "Rising rents pushed Chicago's Chinese community out of the Loop around Clark and Van Buren, and many businesses relocated to Wentworth Ave. The On Leong building went up in 1928, and the Chinatown Gate in 1975.",
    "today": "Chinatown, with its gate over Wentworth Ave",
    "sources": []
  },
  {
    "id": "maxwell",
    "year": 1912,
    "date": "1912 to 1994",
    "title": "Maxwell Street Market",
    "short": "Maxwell St",
    "category": "culture",
    "lat": 41.8647,
    "lng": -87.647,
    "address": "Maxwell St and Halsted St",
    "story": "The open-air market served waves of immigrants, first Jewish, then Black and Mexican families. Blues players plugged in on the sidewalk, which helped shape the electric Chicago blues sound. It is also home of the Maxwell Street Polish.",
    "today": "UIC housing; the market moved to Desplaines St",
    "sources": []
  },
  {
    "id": "wrigley",
    "year": 1914,
    "date": "Apr 23, 1914",
    "title": "Wrigley Field",
    "short": "Wrigley",
    "category": "play",
    "lat": 41.9484,
    "lng": -87.6553,
    "address": "1060 W. Addison St",
    "story": "The park opened as Weeghman Park for the Chicago Whales of the short-lived Federal League. The Cubs moved in for 1916, and it took the Wrigley name in 1926. Lights arrived in 1988.",
    "today": "Home of the Cubs, MLB's second-oldest ballpark",
    "sources": []
  },
  {
    "id": "eastland",
    "year": 1915,
    "date": "July 24, 1915",
    "title": "Eastland disaster",
    "short": "Eastland",
    "category": "dark",
    "lat": 41.8871,
    "lng": -87.6319,
    "address": "South bank between Clark and LaSalle",
    "story": "The excursion steamer Eastland, packed with Western Electric workers and their families heading to a company picnic, rolled onto its side while still tied to the dock. 844 passengers and crew died, only feet from shore.",
    "today": "A marker on the Riverwalk by the Clark St bridge",
    "sources": []
  },
  {
    "id": "navypier",
    "year": 1916,
    "date": "1916",
    "title": "Navy Pier",
    "short": "Navy Pier",
    "category": "play",
    "lat": 41.8917,
    "lng": -87.605,
    "address": "600 E. Grand Ave",
    "story": "Opened as Municipal Pier, built from Burnham's 1909 Plan of Chicago for freight, passenger ships and public recreation. It was renamed in 1927 for Navy veterans of World War I, trained sailors in World War II, and later held a university campus.",
    "today": "Navy Pier",
    "sources": []
  },
  {
    "id": "riot1919",
    "year": 1919,
    "date": "July 27, 1919",
    "title": "1919 race riot",
    "short": "1919 riot",
    "category": "rights",
    "lat": 41.8433,
    "lng": -87.6085,
    "address": "29th Street beach",
    "story": "Eugene Williams, a Black teenager, drifted on a raft across an unofficial color line at the 29th Street beach. White men threw rocks, and he drowned. When police would not arrest the man witnesses named, a week of violence followed: 38 people were killed and more than 500 injured.",
    "today": "A historical marker near the beach",
    "sources": []
  },
  {
    "id": "soldier",
    "year": 1924,
    "date": "1924",
    "title": "Soldier Field",
    "short": "Soldier Field",
    "category": "play",
    "lat": 41.8623,
    "lng": -87.6167,
    "address": "1410 Museum Campus Dr",
    "story": "The colonnaded stadium opened in 1924 as a memorial to World War I soldiers. About 100,000 people watched the 1927 Dempsey and Tunney \"long count\" fight here, and Martin Luther King Jr. led a Chicago Freedom Movement rally on its field in July 1966. The Bears moved in in 1971.",
    "today": "Home of the Bears",
    "sources": []
  },
  {
    "id": "tribune",
    "year": 1925,
    "date": "1925",
    "title": "Tribune Tower",
    "short": "Tribune Tower",
    "category": "building",
    "lat": 41.8904,
    "lng": -87.6234,
    "address": "435 N. Michigan Ave",
    "story": "The neo-Gothic tower won a famous 1922 design contest. Tribune correspondents brought back fragments of famous buildings and sites, from the Great Wall to Westminster Abbey, which are set into its walls at street level.",
    "today": "Condos; the stones are still in the walls",
    "sources": []
  },
  {
    "id": "union",
    "year": 1925,
    "date": "1925",
    "title": "Union Station",
    "short": "Union Station",
    "category": "growth",
    "lat": 41.8787,
    "lng": -87.6403,
    "address": "225 S. Canal St",
    "story": "Ten years in the making, the station opened in 1925 with a skylit Great Hall. Chicago was the country's rail hub, and most long-distance trips across the U.S. changed trains here. The baby carriage shootout in The Untouchables was filmed on its stairs.",
    "today": "Amtrak and Metra's main Chicago station",
    "sources": []
  },
  {
    "id": "buckingham",
    "year": 1927,
    "date": "Aug 1927",
    "title": "Buckingham Fountain",
    "short": "Buckingham",
    "category": "play",
    "lat": 41.8758,
    "lng": -87.6189,
    "address": "Grant Park at Congress Plaza",
    "story": "Kate Buckingham gave the fountain in memory of her brother Clarence. It was modeled on the Latona Fountain at Versailles but built about twice as large, and its four sea horses stand for the states that border Lake Michigan.",
    "today": "Runs from spring to fall, with water shows every hour",
    "sources": []
  },
  {
    "id": "midway",
    "year": 1927,
    "date": "1927",
    "title": "Midway Airport",
    "short": "Midway",
    "category": "growth",
    "lat": 41.7868,
    "lng": -87.7522,
    "address": "5700 S. Cicero Ave",
    "story": "Opened as Chicago Municipal Airport, it was among the busiest airports in the world through the 1930s, 40s and 50s. It was renamed in 1949 for the Battle of Midway, and lost most of its traffic once O'Hare opened for jets.",
    "today": "Chicago Midway International Airport",
    "sources": []
  },
  {
    "id": "regal",
    "year": 1928,
    "date": "1928 to 1973",
    "title": "Regal Theater",
    "short": "Regal",
    "category": "culture",
    "lat": 41.8094,
    "lng": -87.6166,
    "address": "47th St and King Dr (then South Parkway)",
    "story": "The ornate Bronzeville movie palace was a top stop for Black performers: Duke Ellington, Ella Fitzgerald, Nat King Cole and later the Jackson 5 played its stage. It was torn down in 1973.",
    "today": "Shops and a cultural center on 47th St",
    "sources": []
  },
  {
    "id": "stadium",
    "year": 1929,
    "date": "1929 to 1994",
    "title": "Chicago Stadium",
    "short": "Chicago Stadium",
    "category": "play",
    "lat": 41.8815,
    "lng": -87.6715,
    "address": "1800 W. Madison St",
    "story": "The Madhouse on Madison held both parties' 1932 conventions; Franklin Roosevelt flew in to accept his nomination in person, a first. The Blackhawks and the Michael Jordan Bulls played here until the United Center opened across the street in 1994.",
    "today": "A parking lot north of the United Center",
    "sources": []
  },
  {
    "id": "valentine",
    "year": 1929,
    "date": "Feb 14, 1929",
    "title": "St. Valentine's Day Massacre",
    "short": "Massacre",
    "category": "dark",
    "lat": 41.9217,
    "lng": -87.6403,
    "address": "2122 N. Clark St",
    "story": "Seven men tied to Bugs Moran's North Side gang were lined up against the wall of a garage and shot by gunmen dressed as police. Al Capone's outfit was widely blamed, but no one was convicted. The garage was torn down in 1967.",
    "today": "A fenced lawn next to a senior residence; no marker",
    "sources": []
  },
  {
    "id": "adler",
    "year": 1930,
    "date": "May 1930",
    "title": "Adler Planetarium",
    "short": "Adler",
    "category": "fairs",
    "lat": 41.8663,
    "lng": -87.6068,
    "address": "1300 S. DuSable Lake Shore Dr",
    "story": "Max Adler, a Sears executive, gave the city the first planetarium in the Western Hemisphere. It sits at the tip of fill built for the lakefront, with one of the best skyline views in town.",
    "today": "Adler Planetarium",
    "sources": []
  },
  {
    "id": "mart",
    "year": 1930,
    "date": "1930",
    "title": "Merchandise Mart",
    "short": "Merch Mart",
    "category": "building",
    "lat": 41.8885,
    "lng": -87.6354,
    "address": "222 W. Merchandise Mart Plaza",
    "story": "Built by Marshall Field & Co. as a wholesale market, it had more floor space than any building in the world until the Pentagon. Joseph Kennedy bought it in 1945, and his family owned it for half a century.",
    "today": "Offices and showrooms; Art on the Mart lights up its river wall at night",
    "sources": []
  },
  {
    "id": "progress",
    "year": 1933,
    "date": "1933 to 1934",
    "title": "Century of Progress",
    "short": "Century of Progress",
    "category": "fairs",
    "lat": 41.86,
    "lng": -87.6085,
    "address": "Northerly Island and the lakefront",
    "story": "Chicago's second world's fair marked 100 years since the town's founding. It was built on new lakefront fill, including Northerly Island, in the depths of the Depression, and was popular enough to reopen for a second summer.",
    "today": "Northerly Island park",
    "flagStar": true,
    "sources": []
  },
  {
    "id": "biograph",
    "year": 1934,
    "date": "July 22, 1934",
    "title": "Biograph Theater",
    "short": "Dillinger",
    "category": "dark",
    "lat": 41.9266,
    "lng": -87.6493,
    "address": "2433 N. Lincoln Ave",
    "story": "FBI agents shot bank robber John Dillinger, then \"Public Enemy No. 1,\" in the alley beside the Biograph after he walked out of a movie. One of the two women with him had tipped off the agents.",
    "today": "The Biograph Theater building still stands",
    "sources": []
  },
  {
    "id": "pile1",
    "year": 1942,
    "date": "Dec 2, 1942",
    "title": "Chicago Pile-1",
    "short": "Chicago Pile-1",
    "category": "fairs",
    "lat": 41.7925,
    "lng": -87.6013,
    "address": "Ellis Ave near 57th St, University of Chicago",
    "story": "Under the stands of the old Stagg Field, Enrico Fermi's team ran the first controlled, self-sustaining nuclear chain reaction in a stack of graphite blocks and uranium. It was a key step for the Manhattan Project.",
    "today": "Henry Moore's Nuclear Energy sculpture",
    "sources": []
  },
  {
    "id": "till",
    "year": 1955,
    "date": "Sept 1955",
    "title": "Emmett Till's funeral",
    "short": "Till funeral",
    "category": "rights",
    "lat": 41.8232,
    "lng": -87.6263,
    "address": "Roberts Temple Church of God in Christ, 4021 S. State St",
    "story": "Emmett Till, a 14-year-old from Chicago, was murdered while visiting family in Mississippi. His mother, Mamie Till-Mobley, insisted on an open casket so the world could see what was done to him. Tens of thousands came, and photos in Jet magazine helped spark the civil rights movement.",
    "today": "Roberts Temple, part of a national monument since 2023",
    "sources": []
  },
  {
    "id": "chess",
    "year": 1957,
    "date": "1957 to 1967",
    "title": "Chess Records",
    "short": "Chess Records",
    "category": "culture",
    "lat": 41.8537,
    "lng": -87.624,
    "address": "2120 S. Michigan Ave",
    "story": "Leonard and Phil Chess ran their label here on what was called Record Row. Muddy Waters, Howlin' Wolf, Chuck Berry and Etta James recorded in the building, and the Rolling Stones cut a session here in 1964.",
    "today": "Willie Dixon's Blues Heaven Foundation",
    "sources": []
  },
  {
    "id": "secondcity",
    "year": 1959,
    "date": "Dec 1959",
    "title": "The Second City",
    "short": "Second City",
    "category": "culture",
    "lat": 41.9152,
    "lng": -87.6347,
    "address": "1842 N. Wells St (first stage)",
    "story": "An improv theater named after a sneering New Yorker magazine profile of Chicago opened in a former Chinese laundry. Its stage trained a long line of comics, including Bill Murray, Gilda Radner, Stephen Colbert, Tina Fey and Steve Carell.",
    "today": "The Second City, now a few blocks south at 1616 N. Wells",
    "sources": []
  },
  {
    "id": "dusablemuseum",
    "year": 1961,
    "date": "1961",
    "title": "DuSable Museum",
    "short": "DuSable Museum",
    "category": "culture",
    "lat": 41.7917,
    "lng": -87.6075,
    "address": "740 E. 56th Pl, Washington Park",
    "story": "Artist and teacher Margaret Burroughs and others founded a museum of Black history in her home. It moved into a former park building in Washington Park in 1973.",
    "today": "DuSable Black History Museum and Education Center",
    "sources": []
  },
  {
    "id": "marina",
    "year": 1964,
    "date": "1964",
    "title": "Marina City",
    "short": "Marina City",
    "category": "building",
    "lat": 41.8879,
    "lng": -87.6286,
    "address": "300 N. State St",
    "story": "Bertrand Goldberg's twin round towers, nicknamed the corncobs, put apartments over spiral parking ramps and a boat marina. It was a bet that people would live downtown again.",
    "today": "Apartments, a hotel and House of Blues",
    "sources": []
  },
  {
    "id": "mlk",
    "year": 1966,
    "date": "Aug 5, 1966",
    "title": "King's Marquette Park march",
    "short": "MLK march",
    "category": "rights",
    "lat": 41.7705,
    "lng": -87.7,
    "address": "Marquette Park",
    "story": "Martin Luther King Jr. moved into a North Lawndale apartment in 1966 to push for open housing. During a march through Marquette Park, a crowd of white residents threw rocks and bottles, and King was hit in the head. He said afterward that he had never seen such hostility, even in the South.",
    "today": "Marquette Park, with a 2016 memorial to the march",
    "sources": []
  },
  {
    "id": "picasso",
    "year": 1967,
    "date": "Aug 15, 1967",
    "title": "The Chicago Picasso",
    "short": "Picasso",
    "category": "culture",
    "lat": 41.8839,
    "lng": -87.6299,
    "address": "Daley Plaza, 50 W. Washington St",
    "story": "Pablo Picasso designed the 50-foot Cor-Ten steel sculpture for the new Civic Center plaza and gave the design to the city. Chicagoans have argued ever since about whether it's a woman, a baboon or an Afghan hound.",
    "today": "Daley Plaza",
    "sources": []
  },
  {
    "id": "dnc68",
    "year": 1968,
    "date": "Aug 28, 1968",
    "title": "1968 convention protests",
    "short": "1968 DNC",
    "category": "rights",
    "lat": 41.8726,
    "lng": -87.6243,
    "address": "Michigan Ave at Balbo, by the Conrad Hilton",
    "story": "While the Democratic National Convention met at the International Amphitheatre, thousands of antiwar protesters gathered in Grant Park. On Aug 28, police and demonstrators clashed in front of the Conrad Hilton on live TV. A federal study commission later described the police response as a \"police riot.\"",
    "today": "Hilton Chicago, 720 S. Michigan Ave",
    "sources": []
  },
  {
    "id": "hancock",
    "year": 1969,
    "date": "1969",
    "title": "John Hancock Center",
    "short": "Hancock",
    "category": "building",
    "lat": 41.8988,
    "lng": -87.6229,
    "address": "875 N. Michigan Ave",
    "story": "The same SOM team behind Sears Tower, Bruce Graham and Fazlur Khan, gave this 100-story tower its exterior X-braces, which let it use far less steel. It mixed apartments, offices and shops in one building.",
    "today": "875 North Michigan Avenue and the 360 Chicago observation deck",
    "sources": []
  },
  {
    "id": "sears",
    "year": 1973,
    "date": "1973",
    "title": "Sears Tower",
    "short": "Sears Tower",
    "category": "building",
    "lat": 41.8789,
    "lng": -87.6359,
    "address": "233 S. Wacker Dr",
    "story": "At 1,450 feet and 108 stories, Sears Tower became the world's tallest building and kept the title until 1998. Bruce Graham and engineer Fazlur Khan of SOM designed its bundled-tube frame. It was renamed Willis Tower in 2009.",
    "today": "Willis Tower and the Skydeck",
    "sources": []
  },
  {
    "id": "warehouse",
    "year": 1977,
    "date": "1977 to 1982",
    "title": "The Warehouse",
    "short": "The Warehouse",
    "category": "culture",
    "lat": 41.8792,
    "lng": -87.6427,
    "address": "206 S. Jefferson St",
    "story": "DJ Frankie Knuckles played all-night sets at this members-only club in a three-story factory building. Record stores started labeling the music people heard there \"house,\" and the name stuck worldwide.",
    "today": "An office building",
    "sources": []
  },
  {
    "id": "disco",
    "year": 1979,
    "date": "July 12, 1979",
    "title": "Disco Demolition Night",
    "short": "Disco Demolition",
    "category": "play",
    "lat": 41.8318,
    "lng": -87.6347,
    "address": "Old Comiskey Park, 35th St and Shields Ave",
    "story": "Between games of a White Sox doubleheader, radio DJ Steve Dahl blew up a crate of disco records in center field. Thousands of fans stormed the field, and the Sox had to forfeit the second game.",
    "today": "A parking lot north of today's ballpark, with old home plate marked",
    "sources": []
  },
  {
    "id": "harpo",
    "year": 1990,
    "date": "1990 to 2015",
    "title": "Harpo Studios",
    "short": "Harpo",
    "category": "culture",
    "lat": 41.8829,
    "lng": -87.6538,
    "address": "1058 W. Washington Blvd",
    "story": "Oprah Winfrey bought a West Loop warehouse and taped The Oprah Winfrey Show here until its last episode in 2011. Her move helped kick off the West Loop's turn from meatpacking to restaurants and offices.",
    "today": "McDonald's global headquarters",
    "sources": []
  },
  {
    "id": "flood",
    "year": 1992,
    "date": "Apr 13, 1992",
    "title": "Chicago Flood",
    "short": "Chicago Flood",
    "category": "dark",
    "lat": 41.8892,
    "lng": -87.6388,
    "address": "Kinzie St bridge over the North Branch",
    "story": "Pilings driven near the bridge had cracked a forgotten 1900s freight tunnel under the river. River water poured into the tunnel network and flooded Loop basements, shutting down much of downtown for days. Damage was estimated in the billions.",
    "today": "The Kinzie St bridge; the tunnels are sealed",
    "sources": []
  },
  {
    "id": "paseo",
    "year": 1995,
    "date": "1995",
    "title": "Paseo Boricua",
    "short": "Paseo Boricua",
    "category": "culture",
    "lat": 41.903,
    "lng": -87.6868,
    "address": "Division St at Western Ave",
    "story": "Two giant steel Puerto Rican flags arch over Division St, marking the heart of Chicago's Puerto Rican community between Western and California avenues.",
    "today": "The flags still stand over Division St",
    "sources": []
  },
  {
    "id": "millennium",
    "year": 2004,
    "date": "July 2004",
    "title": "Millennium Park",
    "short": "The Bean",
    "category": "culture",
    "lat": 41.8827,
    "lng": -87.6233,
    "address": "Michigan Ave between Randolph and Monroe",
    "story": "Built over Illinois Central rail yards and parking lots, Millennium Park opened four years late and far over budget. Anish Kapoor's Cloud Gate, known as the Bean, was finished in 2006.",
    "today": "Millennium Park",
    "sources": []
  },
  {
    "id": "cubs16",
    "year": 2016,
    "date": "Nov 4, 2016",
    "title": "Cubs World Series rally",
    "short": "Cubs rally",
    "category": "play",
    "lat": 41.8716,
    "lng": -87.6207,
    "address": "Hutchinson Field, Grant Park",
    "story": "Two days after the Cubs won Game 7 in Cleveland and ended a 108-year title drought, the parade ran from Wrigley Field to a rally in Grant Park. The city estimated the crowd at 5 million, a number crowd experts have questioned.",
    "today": "Hutchinson Field, Grant Park",
    "sources": []
  }
]
```

### Categories → `src/data/categories.json`

```json
[
  {
    "id": "growth",
    "name": "Growth & industry",
    "colorLight": "#9C7410",
    "colorDark": "#E2B34C"
  },
  {
    "id": "dark",
    "name": "Disasters & crime",
    "colorLight": "#D7172F",
    "colorDark": "#FF5466"
  },
  {
    "id": "rights",
    "name": "Politics & protest",
    "colorLight": "#7646C2",
    "colorDark": "#AD8BF2"
  },
  {
    "id": "building",
    "name": "Architecture",
    "colorLight": "#0F7F6E",
    "colorDark": "#3CC4AE"
  },
  {
    "id": "culture",
    "name": "Arts & culture",
    "colorLight": "#D9650A",
    "colorDark": "#FF9C4A"
  },
  {
    "id": "play",
    "name": "Sports & fun",
    "colorLight": "#2160C4",
    "colorDark": "#72A4FF"
  },
  {
    "id": "fairs",
    "name": "Fairs & science",
    "colorLight": "#4F8519",
    "colorDark": "#9BCB5E"
  }
]
```

### Eras → `src/data/eras.json`

```json
[
  {
    "from": 1780,
    "to": 1836,
    "name": "Frontier outpost"
  },
  {
    "from": 1837,
    "to": 1870,
    "name": "Boomtown"
  },
  {
    "from": 1871,
    "to": 1892,
    "name": "Fire and rebuilding"
  },
  {
    "from": 1893,
    "to": 1919,
    "name": "Industrial giant"
  },
  {
    "from": 1920,
    "to": 1945,
    "name": "Gangland and Depression"
  },
  {
    "from": 1946,
    "to": 1979,
    "name": "Postwar city"
  },
  {
    "from": 1980,
    "to": 2026,
    "name": "Global city"
  }
]
```

### Census (City of Chicago, decennial) → `src/data/census.json`

```json
[
  {
    "year": 1840,
    "population": 4470
  },
  {
    "year": 1850,
    "population": 29963
  },
  {
    "year": 1860,
    "population": 112172
  },
  {
    "year": 1870,
    "population": 298977
  },
  {
    "year": 1880,
    "population": 503185
  },
  {
    "year": 1890,
    "population": 1099850
  },
  {
    "year": 1900,
    "population": 1698575
  },
  {
    "year": 1910,
    "population": 2185283
  },
  {
    "year": 1920,
    "population": 2701705
  },
  {
    "year": 1930,
    "population": 3376438
  },
  {
    "year": 1940,
    "population": 3396808
  },
  {
    "year": 1950,
    "population": 3620962
  },
  {
    "year": 1960,
    "population": 3550404
  },
  {
    "year": 1970,
    "population": 3366957
  },
  {
    "year": 1980,
    "population": 3005072
  },
  {
    "year": 1990,
    "population": 2783726
  },
  {
    "year": 2000,
    "population": 2896016
  },
  {
    "year": 2010,
    "population": 2695598
  },
  {
    "year": 2020,
    "population": 2746388
  }
]
```

### Overlays (approximate) → `src/data/overlays.geojson`

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "burn-1871",
        "name": "Area burned in 1871 (approximate)",
        "showFrom": 1871,
        "showTo": 1874
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -87.6422,
              41.869
            ],
            [
              -87.6392,
              41.8722
            ],
            [
              -87.6383,
              41.876
            ],
            [
              -87.6386,
              41.88
            ],
            [
              -87.6388,
              41.884
            ],
            [
              -87.6382,
              41.8868
            ],
            [
              -87.64,
              41.89
            ],
            [
              -87.6443,
              41.896
            ],
            [
              -87.6478,
              41.903
            ],
            [
              -87.6532,
              41.909
            ],
            [
              -87.652,
              41.915
            ],
            [
              -87.65,
              41.9253
            ],
            [
              -87.6355,
              41.9253
            ],
            [
              -87.632,
              41.918
            ],
            [
              -87.629,
              41.91
            ],
            [
              -87.626,
              41.903
            ],
            [
              -87.6235,
              41.896
            ],
            [
              -87.6205,
              41.8888
            ],
            [
              -87.6236,
              41.8855
            ],
            [
              -87.6242,
              41.88
            ],
            [
              -87.6244,
              41.874
            ],
            [
              -87.629,
              41.872
            ],
            [
              -87.635,
              41.87
            ],
            [
              -87.6422,
              41.869
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "shore-1830s",
        "name": "Lake shoreline in the 1830s (approximate)"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [
            -87.658,
            41.985
          ],
          [
            -87.6545,
            41.975
          ],
          [
            -87.6495,
            41.965
          ],
          [
            -87.646,
            41.96
          ],
          [
            -87.644,
            41.948
          ],
          [
            -87.641,
            41.94
          ],
          [
            -87.6385,
            41.932
          ],
          [
            -87.6355,
            41.925
          ],
          [
            -87.6315,
            41.917
          ],
          [
            -87.629,
            41.91
          ],
          [
            -87.626,
            41.903
          ],
          [
            -87.6245,
            41.8995
          ],
          [
            -87.6222,
            41.894
          ],
          [
            -87.6205,
            41.8888
          ],
          [
            -87.6236,
            41.8855
          ],
          [
            -87.6242,
            41.88
          ],
          [
            -87.6243,
            41.874
          ],
          [
            -87.624,
            41.868
          ],
          [
            -87.6225,
            41.862
          ],
          [
            -87.62,
            41.856
          ],
          [
            -87.617,
            41.85
          ],
          [
            -87.615,
            41.846
          ],
          [
            -87.611,
            41.838
          ],
          [
            -87.607,
            41.83
          ],
          [
            -87.6015,
            41.822
          ],
          [
            -87.594,
            41.814
          ],
          [
            -87.588,
            41.806
          ],
          [
            -87.583,
            41.798
          ],
          [
            -87.579,
            41.792
          ],
          [
            -87.577,
            41.786
          ],
          [
            -87.574,
            41.78
          ],
          [
            -87.5722,
            41.776
          ],
          [
            -87.568,
            41.77
          ],
          [
            -87.564,
            41.765
          ],
          [
            -87.558,
            41.76
          ],
          [
            -87.551,
            41.755
          ],
          [
            -87.546,
            41.748
          ],
          [
            -87.54,
            41.74
          ],
          [
            -87.534,
            41.733
          ],
          [
            -87.5265,
            41.729
          ],
          [
            -87.501,
            41.7
          ]
        ]
      }
    }
  ]
}
```
