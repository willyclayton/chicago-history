import { describe, expect, it } from "vitest";
import { SITES } from "../src/data";
import type { MediaCandidate, MediaKind } from "../src/data/media";

const files = import.meta.glob("../src/data/media-manifest/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const SITE_IDS = new Set(SITES.map((s) => s.id));
const KINDS = new Set<MediaKind>([
  "event",
  "aftermath",
  "place",
  "construction",
  "people",
  "newspaper",
  "map",
  "today",
]);
const FIELDS = new Set(["source", "ref", "year", "approx", "caption", "kind", "sensitive", "sameView", "note"]);
const CURRENT_YEAR = new Date().getFullYear();
const COMMONS_REF = /^File:[^/#?[\]{}|<>]+\.(jpe?g|png|gif|tiff?|webp|svg)$/i;
const LOC_REF = /^https:\/\/www\.loc\.gov\/(item|pictures\/item|resource)\/[A-Za-z0-9.\-_]+\/$/;

const entries = Object.entries(files).map(([path, data]) => ({
  path,
  siteId: path.replace(/^.*\/([^/]+)\.json$/, "$1"),
  data,
}));

describe("media manifest", () => {
  it("has at least one manifest file", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every filename is a site id", () => {
    for (const { siteId, path } of entries) expect(SITE_IDS.has(siteId), path).toBe(true);
  });

  it("every file is a non-empty array of valid candidates", () => {
    for (const { siteId, data } of entries) {
      expect(Array.isArray(data), siteId).toBe(true);
      const list = data as MediaCandidate[];
      expect(list.length, siteId).toBeGreaterThan(0);
      list.forEach((c, i) => {
        const at = `${siteId}[${i}] ${c?.ref}`;
        expect(typeof c, at).toBe("object");
        for (const key of Object.keys(c)) expect(FIELDS.has(key), `${at}: unknown field ${key}`).toBe(true);
        expect(["commons", "loc"], at).toContain(c.source);
        expect(typeof c.ref, at).toBe("string");
        if (c.source === "commons") {
          expect(c.ref, at).toMatch(COMMONS_REF);
          expect(c.ref, `${at}: use spaces, not underscores or %-escapes`).not.toMatch(/_|%[0-9A-F]{2}/i);
        } else {
          expect(c.ref, at).toMatch(LOC_REF);
        }
        expect(Number.isInteger(c.year), at).toBe(true);
        expect(c.year, at).toBeGreaterThanOrEqual(1600);
        expect(c.year, at).toBeLessThanOrEqual(CURRENT_YEAR);
        if (c.approx !== undefined) expect(typeof c.approx, at).toBe("boolean");
        expect(typeof c.caption, at).toBe("string");
        expect(c.caption.trim().length, at).toBeGreaterThan(0);
        expect(c.caption.length, at).toBeLessThanOrEqual(140);
        expect(KINDS.has(c.kind), `${at}: kind ${c.kind}`).toBe(true);
        if (c.sameView !== undefined) expect(c.sameView, at).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        if (c.note !== undefined) expect(typeof c.note, at).toBe("string");
      });
    }
  });

  it("candidates are ordered by year within each file", () => {
    for (const { siteId, data } of entries) {
      const years = (data as MediaCandidate[]).map((c) => c.year);
      expect(years, siteId).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it("no ref is used twice across all files", () => {
    const seen = new Map<string, string>();
    for (const { siteId, data } of entries) {
      for (const c of data as MediaCandidate[]) {
        const key = `${c.source}:${c.ref}`;
        expect(seen.get(key), `${key} in ${siteId}`).toBeUndefined();
        seen.set(key, siteId);
      }
    }
  });

  it("a sameView key is shared by at least two images of one site", () => {
    for (const { siteId, data } of entries) {
      const counts = new Map<string, number>();
      for (const c of data as MediaCandidate[]) {
        if (c.sameView) counts.set(c.sameView, (counts.get(c.sameView) ?? 0) + 1);
      }
      for (const [key, n] of counts) expect(n, `${siteId}: sameView ${key}`).toBeGreaterThanOrEqual(2);
    }
  });
});
