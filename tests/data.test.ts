import { describe, expect, it } from "vitest";
import { CATEGORIES, CENSUS, ERAS, MAX_YEAR, MIN_YEAR, OVERLAYS, SITES } from "../src/data";

const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));

describe("sites.json", () => {
  it("has all 67 sites", () => {
    expect(SITES).toHaveLength(67);
  });

  it("ids are unique and slug-safe", () => {
    const ids = SITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("years are between 1780 and the current year", () => {
    for (const s of SITES) {
      expect(Number.isInteger(s.year), s.id).toBe(true);
      expect(s.year, s.id).toBeGreaterThanOrEqual(MIN_YEAR);
      expect(s.year, s.id).toBeLessThanOrEqual(MAX_YEAR);
    }
  });

  it("coordinates are inside the Chicago bounding box", () => {
    for (const s of SITES) {
      expect(s.lat, s.id).toBeGreaterThanOrEqual(41.64);
      expect(s.lat, s.id).toBeLessThanOrEqual(42.03);
      expect(s.lng, s.id).toBeGreaterThanOrEqual(-87.94);
      expect(s.lng, s.id).toBeLessThanOrEqual(-87.52);
    }
  });

  it("every category is valid", () => {
    for (const s of SITES) expect(CAT_IDS.has(s.category), `${s.id}: ${s.category}`).toBe(true);
  });

  it("short labels are 18 characters or fewer", () => {
    for (const s of SITES) expect(s.short.length, `${s.id}: "${s.short}"`).toBeLessThanOrEqual(18);
  });

  it("required text fields are filled in", () => {
    for (const s of SITES)
      for (const k of ["title", "date", "address", "story", "today"] as const) expect(s[k].trim(), `${s.id}.${k}`).not.toBe("");
  });

  it("exactly four sites carry a city flag star", () => {
    expect(SITES.filter((s) => s.flagStar).map((s) => s.id).sort()).toEqual(
      ["expo", "fire", "fortdearborn", "progress"].sort(),
    );
  });

  // Launch gate from SPEC section 11. Sources are added during the data accuracy pass;
  // run with REQUIRE_SOURCES=1 (CI does this once the pass lands) to enforce it.
  it.runIf(process.env.REQUIRE_SOURCES === "1")("every site has at least one source", () => {
    for (const s of SITES) {
      expect(s.sources.length, s.id).toBeGreaterThan(0);
      for (const src of s.sources) expect(src.url, s.id).toMatch(/^https:\/\//);
    }
  });
});

describe("eras, census, overlays", () => {
  it("eras cover 1780 to the current year with no gaps", () => {
    expect(ERAS[0].from).toBe(MIN_YEAR);
    expect(ERAS[ERAS.length - 1].to).toBe(MAX_YEAR);
    for (let i = 1; i < ERAS.length; i++) expect(ERAS[i].from).toBe(ERAS[i - 1].to + 1);
  });

  it("census years are decennial from 1840 to 2020", () => {
    expect(CENSUS.map((c) => c.year)).toEqual(Array.from({ length: 19 }, (_, i) => 1840 + i * 10));
  });

  it("has the burn area and the 1830s shoreline", () => {
    const ids = OVERLAYS.features.map((f) => f.properties?.id);
    expect(ids).toEqual(expect.arrayContaining(["burn-1871", "shore-1830s"]));
  });
});
