import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MediaIndex } from "../src/data/media";
import {
  USER_AGENT,
  commonsApiUrl,
  commonsBatches,
  isAllowedLicense,
  licenseLabel,
  netErrorCode,
  normalizeCommonsRef,
  normalizeLocRef,
  parseCommonsResponse,
  parseLocItem,
  pickLocImage,
  refKey,
  retryDelayMs,
  sortByYear,
  stripHtml,
  summarize,
} from "../scripts/media/lib.mjs";
import { buildMedia, type BuildOptions } from "../scripts/media/pipeline.mjs";

// ------------------------------------------------------------------ fixtures

const enc = (t: string) => encodeURIComponent(t.replace(/^File:/, "").replace(/ /g, "_"));

function commonsPage(title: string, o: { license?: string; artist?: string; credit?: string; mime?: string; sha1?: string; licenseUrl?: string } = {}) {
  const name = enc(title);
  return {
    ns: 6,
    title,
    imagerepository: "local",
    imageinfo: [
      {
        size: 812_345,
        width: 2400,
        height: 1800,
        thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/1600px-${name}`,
        thumbwidth: 1600,
        thumbheight: 1200,
        url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}`,
        descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
        mime: o.mime ?? "image/jpeg",
        sha1: o.sha1 ?? `sha-${name}`.slice(0, 40),
        extmetadata: {
          LicenseShortName: { value: o.license ?? "Public domain", source: "commons-desc-page" },
          ...(o.licenseUrl ? { LicenseUrl: { value: o.licenseUrl } } : {}),
          Artist: { value: o.artist ?? '<a href="//commons.wikimedia.org/wiki/Creator:Chicago_Daily_News" title="Creator">Chicago Daily News</a>' },
          ...(o.credit ? { Credit: { value: o.credit } } : {}),
          Copyrighted: { value: "False" },
        },
      },
    ],
  };
}

const locItem = (id: string, rights: string, files: object[] = []) => ({
  item: {
    id: `http://www.loc.gov/item/${id}/`,
    title: "Fire ruins",
    rights_advisory: [rights],
    contributor_names: ["Barnum, P. B., photographer"],
    image_url: [
      `https://tile.loc.gov/storage-services/service/pnp/cph/${id}_150px.jpg#h=150&w=110`,
      `https://tile.loc.gov/storage-services/service/pnp/cph/${id}v.jpg#h=1024&w=752`,
    ],
  },
  resources: [
    {
      url: `https://www.loc.gov/resource/cph.${id}/`,
      image: `https://tile.loc.gov/storage-services/service/pnp/cph/${id}r.jpg`,
      files: [files],
    },
  ],
});

const notFound = () => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND commons.wikimedia.org"), { code: "ENOTFOUND" }) });

// ------------------------------------------------------------------ pure helpers

describe("refs", () => {
  it("normalizes Commons titles", () => {
    expect(normalizeCommonsRef("File:Iroquois_Theater_fire_1903.jpg")).toBe("File:Iroquois Theater fire 1903.jpg");
    expect(normalizeCommonsRef("iroquois.jpg")).toBe("File:Iroquois.jpg");
    expect(normalizeCommonsRef("Image:Map.png")).toBe("File:Map.png");
    expect(normalizeCommonsRef("https://commons.wikimedia.org/wiki/File:Chicago_fire_1871.jpg")).toBe("File:Chicago fire 1871.jpg");
    expect(normalizeCommonsRef("File:St_Valentine%27s_Day.jpg")).toBe("File:St Valentine's Day.jpg");
    expect(normalizeCommonsRef("File:St Valentine's Day Massacre, corpses, 1929-02-14.jpg")).toBe("File:St Valentine's Day Massacre, corpses, 1929-02-14.jpg");
    for (const bad of ["", "   ", "File:a|b.jpg", null, 42]) expect(normalizeCommonsRef(bad)).toBeNull();
  });

  it("normalizes LOC item, pictures/item and resource URLs", () => {
    expect(normalizeLocRef("https://www.loc.gov/item/99404755/")).toEqual({ kind: "item", id: "99404755" });
    expect(normalizeLocRef("https://www.loc.gov/item/99404755")).toEqual({ kind: "item", id: "99404755" });
    expect(normalizeLocRef("https://www.loc.gov/pictures/item/92508756/")).toEqual({ kind: "item", id: "92508756" });
    expect(normalizeLocRef("http://loc.gov/item/2016823114/?r=0.5,0,1")).toEqual({ kind: "item", id: "2016823114" });
    expect(normalizeLocRef("https://www.loc.gov/resource/fsa.8b29516/")).toEqual({ kind: "resource", id: "fsa.8b29516" });
    expect(normalizeLocRef("https://www.loc.gov/resource/stereo.1s12373/")).toEqual({ kind: "resource", id: "stereo.1s12373" });
    // HABS/HAER survey numbers are item ids
    expect(normalizeLocRef("https://www.loc.gov/pictures/item/il0097/")).toEqual({ kind: "item", id: "il0097" });
    expect(normalizeLocRef("https://www.loc.gov/item/il0097/")).toEqual({ kind: "item", id: "il0097" });
    expect(normalizeLocRef("https://example.com/item/1/")).toBeNull();
    expect(normalizeLocRef("")).toBeNull();
  });

  it("gives the same key to the same record however it is written", () => {
    expect(refKey({ source: "loc", ref: "https://www.loc.gov/pictures/item/123/" })).toBe(refKey({ source: "loc", ref: "https://loc.gov/item/123" }));
    expect(refKey({ source: "commons", ref: "File:A_b.jpg" })).toBe(refKey({ source: "commons", ref: "File:A b.jpg" }));
    expect(refKey({ source: "commons", ref: "" })).toBeNull();
  });
});

describe("license allowlist", () => {
  const allowed = [
    "Public domain",
    "Public Domain Mark 1.0",
    "PD-US",
    "PD-old-70",
    "PD-US-expired",
    "CC0",
    "CC0 1.0",
    "CC BY 2.0",
    "CC BY 4.0",
    "CC BY-SA 3.0",
    "CC-BY-SA-4.0",
    "CC BY-SA 3.0 de",
    "No known restrictions on publication.",
    "No known restrictions",
    "No known copyright restrictions",
    "No restrictions",
    "Attribution",
    "Copyrighted free use",
    "No copyright restriction known. Staff photographer reproduction rights transferred to Library of Congress through Instrument of Gift.",
  ];
  const rejected = [
    "CC BY-NC 2.0",
    "CC BY-NC-SA 4.0",
    "CC BY-ND 4.0",
    "CC BY-NC-ND 3.0",
    "CC BY-NC",
    "GFDL",
    "Fair use",
    "All rights reserved",
    "Publication may be restricted. For information see \"New York World-Telegram & Sun...\"",
    "Rights status not evaluated.",
    "",
    null,
  ];
  it.each(allowed)("allows %s", (l) => expect(isAllowedLicense(l)).toBe(true));
  it.each(rejected)("drops %s", (l) => expect(isAllowedLicense(l)).toBe(false));

  it("shortens rights statements for the credit line", () => {
    expect(licenseLabel("No known restrictions on publication. For information, see U.S. FSA (https://www.loc.gov/rr/print/res/071_fsab.html)")).toBe("No known restrictions on publication");
    expect(licenseLabel("CC BY-SA 4.0")).toBe("CC BY-SA 4.0");
  });
});

describe("Commons API", () => {
  it("asks for license metadata and a thumbnail, in batches that keep URLs short", () => {
    const u = new URL(commonsApiUrl(["File:A.jpg", "File:B.jpg"]));
    expect(u.searchParams.get("titles")).toBe("File:A.jpg|File:B.jpg");
    expect(u.searchParams.get("iiprop")).toContain("extmetadata");
    expect(u.searchParams.get("iiurlwidth")).toBe("1600");
    expect(u.searchParams.get("formatversion")).toBe("2");
    const titles = Array.from({ length: 120 }, (_, i) => `File:Photo ${i}.jpg`);
    const batches = commonsBatches(titles);
    expect(batches.flat()).toEqual(titles);
    expect(Math.max(...batches.map((b) => b.length))).toBeLessThanOrEqual(50);
    const long = Array.from({ length: 50 }, (_, i) => `File:${"Ä very long Chicago title ".repeat(8)}${i}.jpg`);
    for (const b of commonsBatches(long)) expect(commonsApiUrl(b).length).toBeLessThanOrEqual(6000);
  });

  it("parses records, following title normalization and dropping what doesn't qualify", () => {
    const json = {
      batchcomplete: true,
      query: {
        normalized: [{ fromencoded: false, from: "File:Fire_ruins.jpg", to: "File:Fire ruins.jpg" }],
        redirects: [{ from: "File:Old name.jpg", to: "File:New name.jpg" }],
        pages: [
          commonsPage("File:Fire ruins.jpg", { artist: '<bdi><a href="https://www.wikidata.org/wiki/Q1">Chicago&nbsp;Daily News</a></bdi>' }),
          { ns: 6, title: "File:Gone.jpg", missing: true, imagerepository: "" },
          commonsPage("File:Report.pdf", { mime: "application/pdf" }),
          commonsPage("File:Nc.jpg", { license: "CC BY-NC 2.0" }),
          commonsPage("File:Today.jpg", { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", artist: "Unknown author", credit: "Chicago Tribune" }),
          commonsPage("File:New name.jpg"),
        ],
      },
    };
    const r = parseCommonsResponse(json, ["File:Fire_ruins.jpg", "File:Gone.jpg", "File:Report.pdf", "File:Nc.jpg", "File:Today.jpg", "File:Old name.jpg"]);
    const ok = r.get("File:Fire_ruins.jpg")!;
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.record.credit).toBe("Chicago Daily News");
      expect(ok.record.license).toBe("Public domain");
      expect(ok.record.archive).toBe("Wikimedia Commons");
      expect(ok.record.url).toMatch(/\/thumb\/.*1600px-/);
      expect(ok.record.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
    expect(r.get("File:Gone.jpg")).toMatchObject({ ok: false, code: "missing" });
    expect(r.get("File:Report.pdf")).toMatchObject({ ok: false, code: "not-image" });
    expect(r.get("File:Nc.jpg")).toMatchObject({ ok: false, code: "license" });
    expect(r.get("File:Old name.jpg")).toMatchObject({ ok: false, code: "redirect" });
    expect((r.get("File:Old name.jpg") as { detail: string }).detail).toContain("File:New name.jpg");
    const today = r.get("File:Today.jpg")!;
    expect(today).toMatchObject({ ok: true, record: { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", credit: "Chicago Tribune" } });
  });

  it("strips HTML and entities from archive fields", () => {
    expect(stripHtml('<span class="x">Barnes &amp; Crosby</span><br/>Chicago')).toBe("Barnes & Crosby Chicago");
    expect(stripHtml("caf&#233; &#x41;")).toBe("café A");
    expect(stripHtml(undefined)).toBe("");
  });
});

describe("LOC API", () => {
  it("reads the rights statement, creator and the largest reasonable JPEG", () => {
    const json = locItem("3c12345", "No known restrictions on publication.", [
      { mimetype: "image/gif", url: "https://tile.loc.gov/x_150px.gif", width: 110, height: 150 },
      { mimetype: "image/jpeg", url: "https://tile.loc.gov/xr.jpg", width: 470, height: 640 },
      { mimetype: "image/jpeg", url: "https://tile.loc.gov/iiif/full/pct:50/0/default.jpg", width: 1300, height: 1800 },
      { mimetype: "image/jpeg", url: "https://tile.loc.gov/iiif/full/pct:100/0/default.jpg", width: 2600, height: 3600 },
      { mimetype: "image/tiff", url: "https://tile.loc.gov/x.tif", width: 5200, height: 7200 },
    ]);
    const r = parseLocItem(json, "3c12345");
    expect(r).toMatchObject({
      ok: true,
      record: {
        url: "https://tile.loc.gov/iiif/full/pct:50/0/default.jpg",
        license: "No known restrictions on publication",
        credit: "Barnum, P. B., photographer",
        sourceUrl: "https://www.loc.gov/item/3c12345/",
        archive: "Library of Congress",
      },
    });
  });

  it("uses a multi-image record's first picture, or the resource that was asked for", () => {
    const habs = {
      item: { rights_advisory: "No known restrictions on images made by the U.S. Government; images copied from other sources may be restricted." },
      resources: [
        { url: "https://www.loc.gov/resource/hhh.il0097.photos/?sp=1", files: [[{ mimetype: "image/jpeg", url: "https://tile.loc.gov/p1.jpg", width: 1700, height: 1300 }]] },
        { url: "https://www.loc.gov/resource/hhh.il0097.photos/?sp=2", files: [[{ mimetype: "image/jpeg", url: "https://tile.loc.gov/p2.jpg", width: 2000, height: 1600 }]] },
      ],
    };
    expect(pickLocImage(habs)?.url).toBe("https://tile.loc.gov/p1.jpg");
    expect(parseLocItem(habs, "il0097")).toMatchObject({ ok: true, record: { url: "https://tile.loc.gov/p1.jpg", license: "No known restrictions on images made by the U.S. Government" } });

    const item = locItem("2017650123", "No known restrictions on publication.");
    item.resources.push({
      url: "https://www.loc.gov/resource/stereo.1s12373/",
      image: "https://tile.loc.gov/stereo/1s12373r.jpg",
      files: [[{ mimetype: "image/jpeg", url: "https://tile.loc.gov/stereo/1s12373v.jpg", width: 1024, height: 520 }] as object[]],
    });
    const r = parseLocItem(item, "2017650123", { resource: { item: {} }, resourceId: "stereo.1s12373" });
    expect(r).toMatchObject({ ok: true, record: { url: "https://tile.loc.gov/stereo/1s12373v.jpg", sourceUrl: "https://www.loc.gov/item/2017650123/" } });
    const orphan = parseLocItem({ item: { rights_advisory: "No known restrictions on publication." }, resource: { url: "https://www.loc.gov/resource/stereo.1s1/", image: "https://tile.loc.gov/x.jpg" } }, null, { resource: {}, resourceId: "stereo.1s1" });
    expect(orphan).toMatchObject({ ok: true, record: { url: "https://tile.loc.gov/x.jpg", sourceUrl: "https://www.loc.gov/resource/stereo.1s1/" } });
  });

  it("falls back to image_url sizes, then the resource image", () => {
    expect(pickLocImage(locItem("1", "x"))?.url).toBe("https://tile.loc.gov/storage-services/service/pnp/cph/1v.jpg");
    expect(pickLocImage({ item: {}, resources: [{ image: "//tile.loc.gov/a/b.jpg" }] })?.url).toBe("https://tile.loc.gov/a/b.jpg");
    expect(pickLocImage({ item: {}, resources: [{ files: [[{ mimetype: "image/tiff", url: "x.tif" }]] }] })).toBeNull();
  });

  it("drops restricted and unevaluated items", () => {
    expect(parseLocItem(locItem("2", "Publication may be restricted. For information see ..."), "2")).toMatchObject({ ok: false, code: "license" });
    expect(parseLocItem(locItem("3", "Rights status not evaluated."), "3")).toMatchObject({ ok: false, code: "license" });
    expect(parseLocItem({ item: { title: "no rights" } }, "4")).toMatchObject({ ok: false, code: "license" });
    expect(parseLocItem(null, "5")).toMatchObject({ ok: false, code: "missing" });
  });
});

describe("network helpers", () => {
  it("backs off, honoring Retry-After", () => {
    expect(retryDelayMs(1)).toBe(1000);
    expect(retryDelayMs(3)).toBe(4000);
    expect(retryDelayMs(2, "7")).toBe(7000);
    expect(retryDelayMs(1, "9999")).toBe(60_000);
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(retryDelayMs(1, "Wed, 04 Nov 2026 12:00:30 GMT", now)).toBe(30_000);
  });

  it("recognizes an unreachable host", () => {
    expect(netErrorCode(notFound())).toBe("ENOTFOUND");
    expect(netErrorCode(new Error("boom"))).toBeNull();
  });

  it("sorts by year, keeping manifest order for ties, and summarizes drops", () => {
    expect(sortByYear([{ year: 1900, n: 1 }, { year: 1871, n: 2 }, { year: 1900, n: 3 }]).map((x) => x.n)).toEqual([2, 1, 3]);
    expect(summarize(3, [{ code: "license" }, { code: "missing" }, { code: "license" }])).toBe("kept 3, dropped 3: 2 license not allowed, 1 missing");
  });
});

// ------------------------------------------------------------------ the whole pipeline, mocked

describe("buildMedia", () => {
  let dir: string;
  let landscape: Buffer;
  let portrait: Buffer;
  const roots: string[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ctm-media-"));
    landscape = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#806040" } }).jpeg().toBuffer();
    portrait = await sharp({ create: { width: 900, height: 1400, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer();
  });
  afterAll(async () => {
    for (const r of [dir, ...roots]) await rm(r, { recursive: true, force: true });
  });

  async function project(manifests: Record<string, unknown>) {
    const root = await mkdtemp(path.join(dir, "p-"));
    roots.push(root);
    await mkdir(path.join(root, "src/data/media-manifest"), { recursive: true });
    await writeFile(path.join(root, "src/data/sites.json"), JSON.stringify([{ id: "fire" }, { id: "valentine" }]));
    await writeFile(path.join(root, "src/data/media.generated.json"), "{}\n");
    for (const [id, m] of Object.entries(manifests)) {
      await writeFile(path.join(root, `src/data/media-manifest/${id}.json`), typeof m === "string" ? m : JSON.stringify(m));
    }
    return root;
  }

  const MANIFESTS = {
    fire: [
      { source: "commons", ref: "File:Chicago in flames.jpg", year: 1871, caption: "The fire.", kind: "event", sensitive: true },
      { source: "loc", ref: "https://www.loc.gov/pictures/item/2002712345/", year: 1871, caption: "Ruins.", kind: "aftermath" },
      { source: "commons", ref: "File:Water tower today.jpg", year: 2019, caption: "Today.", kind: "today", sameView: "tower" },
      { source: "commons", ref: "File:Nc photo.jpg", year: 1872, caption: "NC.", kind: "place" },
      { source: "commons", ref: "File:Gone.jpg", year: 1871, caption: "Missing.", kind: "event" },
      { source: "loc", ref: "https://www.loc.gov/item/2002712345", year: 1871, caption: "Same item again.", kind: "event" },
      { source: "commons", ref: "File:Bad.jpg", caption: "No year.", kind: "event" },
      { source: "commons", ref: "File:Broken.jpg", year: 1880, caption: "Not really a JPEG.", kind: "place" },
    ],
    valentine: [
      { source: "loc", ref: "https://www.loc.gov/item/99404755/", year: 1929, caption: "Garage.", kind: "event" },
      { source: "commons", ref: "File:Chicago in flames.jpg", year: 1871, caption: "Shared file.", kind: "map", approx: true },
      { source: "loc", ref: "https://www.loc.gov/resource/stereo.1s12373/", year: 1880, caption: "Stereo card.", kind: "place" },
    ],
    nosuchsite: [{ source: "commons", ref: "File:X.jpg", year: 1900, caption: "x", kind: "place" }],
  };

  /** A fake internet: Commons, LOC and their image hosts. */
  function archives(opts: { throttleOnce?: boolean } = {}) {
    const calls: string[] = [];
    const uas = new Set<string>();
    let throttled = false;
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push(url);
      uas.add(new Headers(init?.headers).get("User-Agent") ?? "");
      const u = new URL(url);
      if (u.host === "commons.wikimedia.org") {
        if (opts.throttleOnce && !throttled) {
          throttled = true;
          return new Response("slow down", { status: 429, headers: { "Retry-After": "3" } });
        }
        const titles = u.searchParams.get("titles")!.split("|");
        const pages = titles.map((t) =>
          t === "File:Gone.jpg"
            ? { ns: 6, title: t, missing: true }
            : t === "File:Nc photo.jpg"
              ? commonsPage(t, { license: "CC BY-NC-SA 2.0" })
              : t === "File:Water tower today.jpg"
                ? commonsPage(t, { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", artist: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>' })
                : commonsPage(t),
        );
        return Response.json({ batchcomplete: true, query: { pages } });
      }
      if (u.host === "www.loc.gov") {
        const [, kind, id] = u.pathname.split("/");
        if (u.searchParams.get("fo") !== "json") return new Response("html", { status: 400 });
        if (kind === "resource" && id === "stereo.1s12373")
          return Response.json({
            item: { id: "http://www.loc.gov/item/2017650123/" },
            resource: { url: "https://www.loc.gov/resource/stereo.1s12373/", files: [[{ mimetype: "image/jpeg", url: "https://tile.loc.gov/stereo/1s12373.jpg", width: 1800, height: 900 }]] },
          });
        if (id === "2017650123") return Response.json(locItem(id, "No known restrictions on publication."));
        if (id === "2002712345") return Response.json(locItem(id, "No known restrictions on publication.", [{ mimetype: "image/jpeg", url: `https://tile.loc.gov/${id}/full.jpg`, width: 900, height: 1400 }]));
        if (id === "99404755") return Response.json(locItem(id, "Publication may be restricted."));
        return new Response("not found", { status: 404 });
      }
      if (u.host === "upload.wikimedia.org") {
        if (u.pathname.includes("Broken")) return new Response("<html>oops</html>", { headers: { "content-type": "image/jpeg" } });
        return new Response(new Uint8Array(landscape), { headers: { "content-type": "image/jpeg" } });
      }
      if (u.host === "tile.loc.gov") return new Response(new Uint8Array(portrait), { headers: { "content-type": "image/png" } });
      return new Response("?", { status: 404 });
    };
    return { fetch, calls, uas };
  }

  const quiet: BuildOptions = { log: () => {}, sleep: async () => {} };
  const offline = async () => {
    throw notFound();
  };
  const readIndex = async (root: string) => JSON.parse(await readFile(path.join(root, "src/data/media.generated.json"), "utf8")) as MediaIndex;

  it("keeps only allowed, reachable images, resized, credited and ordered by year", async () => {
    const root = await project(MANIFESTS);
    const net = archives({ throttleOnce: true });
    const waits: number[] = [];
    const r = await buildMedia({ ...quiet, root, fetch: net.fetch as typeof fetch, sleep: async (ms) => void waits.push(ms) });

    expect([...net.uas]).toEqual([USER_AGENT]);
    expect(waits).toContain(3000); // honored Retry-After on the 429
    const codes = r.drops.map((d) => d.code).sort();
    expect(codes).toEqual(["duplicate", "image", "invalid", "license", "license", "missing", "unknown-site"].sort());

    const idx = await readIndex(root);
    expect(Object.keys(idx).sort()).toEqual(["fire", "valentine"]);
    expect(idx.fire.map((m) => m.year)).toEqual([1871, 1871, 2019]);
    expect(idx.fire.map((m) => m.caption)).toEqual(["The fire.", "Ruins.", "Today."]);
    expect(idx.fire.map((m) => m.sensitive)).toEqual([true, undefined, undefined]);
    const [first, ruins, today] = idx.fire;
    expect(first).toMatchObject({ id: "fire-1", siteId: "fire", kind: "event", credit: "Chicago Daily News", license: "Public domain", archive: "Wikimedia Commons", width: 1280, height: 960 });
    expect(first.src).toMatch(/^media\/fire\/1-1280\.jpg\?v=[0-9a-f]{10}$/);
    expect(first.thumb).toMatch(/^media\/fire\/1-480\.jpg\?v=[0-9a-f]{10}$/);
    expect(ruins).toMatchObject({ archive: "Library of Congress", license: "No known restrictions on publication", sourceUrl: "https://www.loc.gov/item/2002712345/", width: 823, height: 1280 });
    expect(today).toMatchObject({ credit: "Jane Doe", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", sameView: "tower" });
    expect(idx.valentine).toHaveLength(2);
    expect(idx.valentine[0]).toMatchObject({ kind: "map", approx: true, year: 1871 });
    expect(idx.valentine[0].sensitive).toBeUndefined(); // the flag belongs to the candidate, not the file
    // a resource ref: that resource's own image, the item's rights and page
    expect(idx.valentine[1]).toMatchObject({ caption: "Stereo card.", sourceUrl: "https://www.loc.gov/item/2017650123/", license: "No known restrictions on publication" });
    expect(net.calls).toContain("https://tile.loc.gov/stereo/1s12373.jpg");

    const meta = await sharp(path.join(root, "public/media/fire/1-1280.jpg")).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 1280, height: 960, isProgressive: true });
    expect(meta.exif).toBeUndefined();
    const thumb = await sharp(path.join(root, "public/media/fire/2-480.jpg")).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(480);
    expect(r.summary).toMatch(/^kept 5, dropped 7: /);
    expect(r.changed).toBe(true);

    // the same file used by two sites is downloaded once
    expect(net.calls.filter((c) => c.includes("Chicago_in_flames")).length).toBe(1);

    // a rerun is served from the cache: no network at all, same output
    const again = await buildMedia({ ...quiet, root, fetch: offline as typeof fetch });
    expect(await readIndex(root)).toEqual(idx);
    expect(again.kept).toBe(5);
    expect(again.changed).toBe(false);

    // forced refresh with the archives unreachable still uses the stale cache
    const stale = await buildMedia({ ...quiet, root, refresh: true, fetch: offline as typeof fetch });
    expect(stale.kept).toBe(5);
    expect(Object.keys(stale.unreachable)).toContain("commons.wikimedia.org");
    expect(await readIndex(root)).toEqual(idx);
  });

  it("removes images that are no longer in the manifest", async () => {
    const root = await project({ fire: MANIFESTS.fire.slice(0, 3) });
    const net = archives();
    await buildMedia({ ...quiet, root, fetch: net.fetch as typeof fetch });
    await stat(path.join(root, "public/media/fire/3-1280.jpg"));
    await writeFile(path.join(root, "src/data/media-manifest/fire.json"), JSON.stringify(MANIFESTS.fire.slice(0, 1)));
    await buildMedia({ ...quiet, root, fetch: net.fetch as typeof fetch });
    await expect(stat(path.join(root, "public/media/fire/3-1280.jpg"))).rejects.toThrow();
    expect((await readIndex(root)).fire).toHaveLength(1);
  });

  it("never throws: unreachable archives with no cache give an empty index", async () => {
    const root = await project(MANIFESTS);
    const r = await buildMedia({ ...quiet, root, fetch: offline as typeof fetch });
    expect(r.kept).toBe(0);
    expect(r.summary).toMatch(/archive unreachable, not cached/);
    expect(await readIndex(root)).toEqual({});
  });

  it("never throws on broken manifests, odd responses or a missing folder", async () => {
    const root = await project({ fire: "{ not json", valentine: { not: "an array" } });
    const r = await buildMedia({ ...quiet, root, fetch: archives().fetch as typeof fetch });
    expect(r.kept).toBe(0);
    expect(r.warnings?.length).toBe(2);

    const garbage = await project(MANIFESTS);
    const html = async () => new Response("<html>captcha</html>", { status: 200, headers: { "content-type": "text/html" } });
    const g = await buildMedia({ ...quiet, root: garbage, fetch: html as typeof fetch });
    expect(g.kept).toBe(0);
    expect(g.drops.some((d) => d.code === "api-error")).toBe(true);

    const throwing = async () => {
      throw new Error("something odd");
    };
    const t = await buildMedia({ ...quiet, root: garbage, fetch: throwing as typeof fetch, refresh: true });
    expect(t.kept).toBe(0);

    const empty = await mkdtemp(path.join(dir, "empty-"));
    roots.push(empty);
    const e = await buildMedia({ ...quiet, root: empty, fetch: offline as typeof fetch });
    expect(e.summary).toBe("kept 0, dropped 0");
    expect(JSON.parse(await readFile(path.join(empty, "src/data/media.generated.json"), "utf8"))).toEqual({});
  });
});
