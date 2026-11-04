import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES, CATEGORY_NAME, CENSUS, ERAS, MAX_YEAR, ORDERED, SITES } from "../src/data";
import { censusAt, censusLine } from "../src/lib/census";
import { eraOf } from "../src/lib/eras";
import { burnVisible, isRecent, makeMatcher, norm, stepTarget, toggleCategory } from "../src/lib/filters";
import { streetViewEmbed, streetViewLink, mapsLink } from "../src/lib/links";
import type { CategoryId } from "../src/types";

const ALL = CATEGORIES.map((c) => c.id);
const match = makeMatcher(CATEGORY_NAME);
const allCats = new Set(ALL);
const search = (q: string) => SITES.filter((s) => match(s, { cats: allCats, query: norm(q) })).map((s) => s.id);

describe("search", () => {
  it('"capone" finds the Massacre and the Green Mill', () => {
    expect(search("capone")).toEqual(expect.arrayContaining(["valentine", "greenmill"]));
  });
  it('"pullman" finds Pullman and Glessner House', () => {
    expect(search("pullman")).toEqual(expect.arrayContaining(["pullman", "glessner"]));
  });
  it("is case- and accent-insensitive", () => {
    expect(search("CAPONE")).toEqual(search("capone"));
    expect(search("Café")).toEqual(search("cafe"));
    expect(search("dusable").length).toBeGreaterThan(0);
  });
  it("matches category names and years", () => {
    expect(search("fairs & science").length).toBe(SITES.filter((s) => s.category === "fairs").length);
    expect(search("1871")).toContain("fire");
  });
  it("respects active categories", () => {
    const only = new Set<CategoryId>(["dark"]);
    const got = SITES.filter((s) => match(s, { cats: only, query: "" }));
    expect(got.every((s) => s.category === "dark")).toBe(true);
    expect(got.length).toBeGreaterThan(0);
  });
});

describe("chip logic", () => {
  it("with all on, tapping a category shows only that category", () => {
    expect([...toggleCategory(new Set(ALL), "rights", ALL)]).toEqual(["rights"]);
  });
  it("after that, taps add or remove", () => {
    let c = toggleCategory(new Set(ALL), "rights", ALL);
    c = toggleCategory(c, "play", ALL);
    expect([...c].sort()).toEqual(["play", "rights"]);
    c = toggleCategory(c, "rights", ALL);
    expect([...c]).toEqual(["play"]);
  });
  it("if none are left, reset to all", () => {
    const c = toggleCategory(new Set<CategoryId>(["play"]), "play", ALL);
    expect(c.size).toBe(ALL.length);
  });
  it('"All themes" resets', () => {
    expect(toggleCategory(new Set<CategoryId>(["play"]), "all", ALL).size).toBe(ALL.length);
  });
});

describe("timeline", () => {
  it("slider at 1850 shows only sites with year ≤ 1850", () => {
    const shown = SITES.filter((s) => s.year <= 1850);
    expect(shown.every((s) => s.year <= 1850)).toBe(true);
    expect(shown.map((s) => s.id).sort()).toEqual(["canal", "cemetery", "dusable", "fortdearborn", "wolfpoint"].sort());
  });

  it("steps through the filtered sites in year order", () => {
    const list = ORDERED;
    let sel: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const t: { id: string } = stepTarget(list, sel, 1780, 1)!;
      seen.push(t.id);
      sel = t.id;
    }
    expect(seen).toEqual(list.map((s) => s.id));
    // clamps at the end
    expect(stepTarget(list, sel, MAX_YEAR, 1)!.id).toBe(list[list.length - 1].id);
    // and steps back
    expect(stepTarget(list, sel, MAX_YEAR, -1)!.id).toBe(list[list.length - 2].id);
  });

  it("with nothing selected, steps relative to the slider year", () => {
    const next = stepTarget(ORDERED, null, 1871, 1)!;
    expect(next.year).toBeGreaterThan(1871);
    const prev = stepTarget(ORDERED, null, 1871, -1)!;
    expect(prev.year).toBeLessThan(1871);
  });

  it("steps within the current filter only", () => {
    const dark = ORDERED.filter((s) => s.category === "dark");
    const t = stepTarget(dark, "fire", 1871, 1)!;
    expect(t.category).toBe("dark");
    expect(t.year).toBeGreaterThanOrEqual(1871);
  });

  it("burn overlay shows from 1871 to 1874 and when the fire is selected", () => {
    expect(burnVisible(1870, null)).toBe(false);
    expect(burnVisible(1871, null)).toBe(true);
    expect(burnVisible(1874, "valentine")).toBe(true);
    expect(burnVisible(1875, null)).toBe(false);
    expect(burnVisible(2026, "fire")).toBe(true);
    expect(burnVisible(1700, "fire")).toBe(true);
  });

  it("recent pulse covers the 10 years before the slider and is off at the current year", () => {
    const fire = SITES.find((s) => s.id === "fire")!;
    expect(isRecent(fire, 1871, MAX_YEAR)).toBe(true);
    expect(isRecent(fire, 1881, MAX_YEAR)).toBe(true);
    expect(isRecent(fire, 1882, MAX_YEAR)).toBe(false);
    expect(isRecent(fire, 1870, MAX_YEAR)).toBe(false);
    const cubs = SITES.find((s) => s.id === "cubs")!;
    expect(isRecent(cubs, MAX_YEAR, MAX_YEAR)).toBe(false);
  });

  it("eras and census", () => {
    expect(eraOf(1871, ERAS).name).toBe("Fire and rebuilding");
    expect(eraOf(MAX_YEAR, ERAS).name).toBe("Global city");
    expect(censusAt(1839, CENSUS)).toBeNull();
    expect(censusLine(1839, CENSUS)).toBe("Before the first census count");
    expect(censusAt(1871, CENSUS)!.year).toBe(1870);
    expect(censusLine(2026, CENSUS)).toBe("2,746,388 people · 2020 census");
  });
});

describe("links", () => {
  const fire = SITES.find((s) => s.id === "fire")!;
  const crib = SITES.find((s) => s.id === "crib")!;
  it("embeds Street View only with a key and for land sites", () => {
    expect(streetViewEmbed(fire, undefined)).toBeNull();
    expect(streetViewEmbed(fire, "K")).toBe(
      `https://www.google.com/maps/embed/v1/streetview?key=K&location=${fire.lat},${fire.lng}`,
    );
    expect(streetViewEmbed(crib, "K")).toBeNull();
    expect(streetViewEmbed({ ...fire, svHeading: 90, svPitch: 5 }, "K")).toMatch(/&heading=90&pitch=5$/);
  });
  it("always has Street View and Maps links", () => {
    expect(streetViewLink(crib)).toBe(
      `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${crib.lat},${crib.lng}`,
    );
    expect(mapsLink(fire)).toBe(`https://www.google.com/maps/search/?api=1&query=${fire.lat},${fire.lng}`);
  });
});

describe("store", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    (globalThis as { location?: unknown }).location = { pathname: "/", search: "", hash: "" };
    (globalThis as { history?: unknown }).history = { replaceState() {} };
    const { __reset } = await import("../src/state/store");
    __reset();
  });

  it("selecting a later site jumps the year and turns its category on", async () => {
    const { actions, getState } = await import("../src/state/store");
    actions.setYear(1850);
    actions.tapCategory("play");
    actions.select("valentine");
    expect(getState().year).toBe(1929);
    expect(getState().cats.has("dark")).toBe(true);
  });

  it("play runs from 1780 to the current year, pausing on events, and stops on interaction", async () => {
    const { actions, getState, PLAY_PAUSE_MS, PLAY_STEP_MS } = await import("../src/state/store");
    actions.play();
    expect(getState().year).toBe(1780);
    expect(getState().playing).toBe(true);
    vi.advanceTimersByTime(PLAY_STEP_MS * 4); // 1781..1784
    expect(getState().year).toBe(1784);
    expect(getState().selectedId).toBe("dusable");
    vi.advanceTimersByTime(PLAY_PAUSE_MS - 1); // paused on the event
    expect(getState().year).toBe(1784);
    actions.stop();
    vi.advanceTimersByTime(10_000);
    expect(getState().year).toBe(1784);
    expect(getState().playing).toBe(false);

    actions.setYear(MAX_YEAR - 3);
    actions.play();
    vi.advanceTimersByTime(60_000);
    expect(getState().year).toBe(MAX_YEAR);
    expect(getState().playing).toBe(false);
  });
});
