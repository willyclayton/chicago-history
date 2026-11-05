import { describe, expect, it } from "vitest";
import { MAX_YEAR, SITE_BY_ID, SITES } from "../src/data";
import type { MomentKind } from "../src/data/history";

const files = import.meta.glob("../src/data/history/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const SITE_IDS = new Set(SITES.map((s) => s.id));
const KINDS = new Set<MomentKind>(["event", "built", "changed", "demolished", "commemorated", "today"]);
const TOP_FIELDS = new Set(["id", "moments", "facts", "sources", "checked"]);
const MOMENT_FIELDS = new Set(["year", "date", "title", "text", "kind"]);
const FACT_FIELDS = new Set(["label", "value", "note"]);
const MIN_MOMENT_YEAR = 1600;

const entries = Object.entries(files).map(([path, data]) => ({
  path,
  fileId: path.replace(/^.*\/([^/]+)\.json$/, "$1"),
  data,
}));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Returns a list of problems; empty means the file matches SiteHistory. */
function problems(data: unknown): string[] {
  const out: string[] = [];
  if (!isObj(data)) return ["not an object"];
  for (const k of Object.keys(data)) if (!TOP_FIELDS.has(k)) out.push(`unknown field "${k}"`);
  if (!isText(data.id)) out.push("id must be a non-empty string");

  if (!Array.isArray(data.moments) || data.moments.length === 0) out.push("moments must be a non-empty array");
  else
    data.moments.forEach((m, i) => {
      const at = `moments[${i}]`;
      if (!isObj(m)) return out.push(`${at} is not an object`);
      for (const k of Object.keys(m)) if (!MOMENT_FIELDS.has(k)) out.push(`${at}: unknown field "${k}"`);
      if (!Number.isInteger(m.year)) out.push(`${at}: year must be an integer`);
      if ("date" in m && !isText(m.date)) out.push(`${at}: date must be a non-empty string when present`);
      if (!isText(m.title)) out.push(`${at}: title is required`);
      else if (m.title.length > 60) out.push(`${at}: title is ${m.title.length} chars (max 60)`);
      if (!isText(m.text)) out.push(`${at}: text is required`);
      if (!KINDS.has(m.kind as MomentKind)) out.push(`${at}: invalid kind "${String(m.kind)}"`);
    });

  if ("facts" in data) {
    if (!Array.isArray(data.facts)) out.push("facts must be an array");
    else
      data.facts.forEach((f, i) => {
        const at = `facts[${i}]`;
        if (!isObj(f)) return out.push(`${at} is not an object`);
        for (const k of Object.keys(f)) if (!FACT_FIELDS.has(k)) out.push(`${at}: unknown field "${k}"`);
        if (!isText(f.label)) out.push(`${at}: label is required`);
        if (!isText(f.value)) out.push(`${at}: value is required`);
        if ("note" in f && !isText(f.note)) out.push(`${at}: note must be a non-empty string when present`);
      });
  }

  if (!Array.isArray(data.sources)) out.push("sources must be an array");
  else
    data.sources.forEach((s, i) => {
      if (!isObj(s) || !isText(s.title) || !isText(s.url)) out.push(`sources[${i}] needs a title and url`);
      else if (Object.keys(s).some((k) => k !== "title" && k !== "url")) out.push(`sources[${i}]: unknown field`);
    });

  if ("checked" in data) {
    const c = data.checked;
    if (!isObj(c) || typeof c.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.date))
      out.push("checked.date must be an ISO date (YYYY-MM-DD)");
    else if (Number.isNaN(Date.parse(c.date))) out.push("checked.date is not a real date");
    if (isObj(c) && "notes" in c && typeof c.notes !== "string") out.push("checked.notes must be a string");
  }
  return out;
}

describe("history files", () => {
  it("there is at least one", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every file parses and matches the SiteHistory schema", () => {
    for (const { fileId, data } of entries) expect(problems(data), fileId).toEqual([]);
  });

  it("each id matches its filename and an existing site", () => {
    for (const { fileId, data } of entries) {
      expect((data as { id: string }).id, fileId).toBe(fileId);
      expect(SITE_IDS.has(fileId), `${fileId} is not a site id`).toBe(true);
    }
  });

  it("moments are in year order and between 1600 and the current year", () => {
    for (const { fileId, data } of entries) {
      const years = (data as { moments: { year: number }[] }).moments.map((m) => m.year);
      expect(years, `${fileId} moments out of order`).toEqual([...years].sort((a, b) => a - b));
      for (const y of years) {
        expect(y, fileId).toBeGreaterThanOrEqual(MIN_MOMENT_YEAR);
        expect(y, fileId).toBeLessThanOrEqual(MAX_YEAR);
      }
    }
  });

  it("each file cites one to four sources, all https URLs", () => {
    for (const { fileId, data } of entries) {
      const sources = (data as { sources: { url: string }[] }).sources;
      expect(sources.length, fileId).toBeGreaterThanOrEqual(1);
      expect(sources.length, fileId).toBeLessThanOrEqual(4);
      for (const s of sources) {
        expect(s.url, fileId).toMatch(/^https:\/\/[^\s]+$/);
        expect(() => new URL(s.url), `${fileId}: ${s.url}`).not.toThrow();
      }
    }
  });

  it("source URLs are not repeated within a file", () => {
    for (const { fileId, data } of entries) {
      const urls = (data as { sources: { url: string }[] }).sources.map((s) => s.url);
      expect(new Set(urls).size, fileId).toBe(urls.length);
    }
  });

  it("a 'today' moment, if present, comes last", () => {
    for (const { fileId, data } of entries) {
      const kinds = (data as { moments: { kind: string }[] }).moments.map((m) => m.kind);
      const i = kinds.indexOf("today");
      if (i !== -1) expect(i, fileId).toBe(kinds.length - 1);
    }
  });

  it("sites with a history file also carry a source in sites.json", () => {
    for (const { fileId } of entries) {
      const site = SITE_BY_ID[fileId];
      if (!site) continue; // reported by the id test above
      expect(site.sources.length, fileId).toBeGreaterThan(0);
    }
  });
});
