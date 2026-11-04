// The photo pipeline (see src/data/media.ts): manifest candidates -> archive APIs ->
// license allowlist -> download -> resize -> public/media + src/data/media.generated.json.
//
// buildMedia() never throws. Anything that goes wrong with one candidate drops that
// candidate (with a logged reason); an unreachable archive falls back to the cache.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as L from "./lib.mjs";

/** Bump when the resize settings change, so cached outputs are redone. */
export const PROC_VERSION = 1;
export const FULL = 1280;
export const THUMB = 480;
const JPEG_FULL = { quality: 78, progressive: true, mozjpeg: true };
const JPEG_THUMB = { quality: 72, progressive: true, mozjpeg: true };
const MAX_DOWNLOAD = 60 * 1024 * 1024;
const DAY = 86_400_000;

const sha = (s, n = 24) => createHash("sha1").update(s).digest("hex").slice(0, n);

const defaults = () => ({
  root: process.cwd(),
  manifestDir: "src/data/media-manifest",
  sitesFile: "src/data/sites.json",
  outJson: "src/data/media.generated.json",
  publicDir: "public",
  cacheDir: ".media-cache",
  fetch: globalThis.fetch,
  /** sharp's default export; loaded on demand when omitted. */
  sharp: null,
  log: (...a) => console.log(...a),
  /** Use only the cache; never touch the network. */
  offline: false,
  /** Ignore cached API answers (downloads stay cached). */
  refresh: false,
  apiTtlMs: 30 * DAY,
  concurrency: 4,
  timeBudgetMs: 20 * 60_000,
  apiTimeoutMs: 30_000,
  downloadTimeoutMs: 90_000,
  /** Minimum spacing between requests to one host (loc.gov blocks fast crawlers for an hour). */
  hostIntervalMs: { "www.loc.gov": 1100, "tile.loc.gov": 300, "commons.wikimedia.org": 250, "upload.wikimedia.org": 150 },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  /** Only these site ids (for quick local runs). */
  only: null,
});

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function writeIfChanged(file, text) {
  try {
    if ((await readFile(file, "utf8")) === text) return false;
  } catch {
    /* new file */
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return true;
}

async function listFiles(dir) {
  const out = [];
  async function walk(d) {
    let ents;
    try {
      ents = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(p);
    }
  }
  await walk(dir);
  return out;
}

/**
 * Build the media index. Resolves to { index, kept, drops, summary, unreachable, changed }.
 * Never rejects.
 */
export async function buildMedia(options = {}) {
  const o = { ...defaults(), ...options, hostIntervalMs: { ...defaults().hostIntervalMs, ...(options.hostIntervalMs ?? {}) } };
  try {
    return await run(o);
  } catch (e) {
    o.log(`media: unexpected error, kept the previous output: ${e?.stack ?? e}`);
    try {
      const out = path.resolve(o.root, o.outJson);
      if (!(await exists(out))) await writeIfChanged(out, "{}\n");
    } catch {
      /* nothing more to do */
    }
    return { index: {}, kept: 0, drops: [], summary: `failed: ${e?.message ?? e}`, unreachable: {}, changed: false, error: String(e?.message ?? e) };
  }
}

async function run(o) {
  const t0 = o.now();
  const at = (p) => path.resolve(o.root, p);
  const cache = at(o.cacheDir);
  const drops = [];
  const warnings = [];
  let changed = false;
  const drop = (e, code, detail) => {
    drops.push({ siteId: e.siteId, ref: e.c?.ref ?? String(e.c), code, detail });
    o.log(`  drop ${e.siteId} ${e.c?.ref ?? "?"}: ${L.DROP_LABELS[code] ?? code}${detail ? ` (${detail})` : ""}`);
  };

  // ---------------------------------------------------------- manifests
  const sites = await readJson(at(o.sitesFile));
  const siteIds = Array.isArray(sites) ? new Set(sites.map((s) => s.id)) : null;
  let files = [];
  try {
    files = (await readdir(at(o.manifestDir))).filter((f) => f.endsWith(".json")).sort();
  } catch {
    o.log(`media: no manifest folder at ${o.manifestDir}`);
  }
  const entries = [];
  for (const f of files) {
    const siteId = f.replace(/\.json$/, "");
    if (o.only && !o.only.includes(siteId)) continue;
    let list;
    try {
      list = JSON.parse(await readFile(path.join(at(o.manifestDir), f), "utf8"));
    } catch (e) {
      warnings.push(`${f}: not valid JSON (${e.message})`);
      o.log(`media: skipped ${f}: not valid JSON (${e.message})`);
      continue;
    }
    if (!Array.isArray(list)) {
      warnings.push(`${f}: not an array`);
      continue;
    }
    const seen = new Set();
    list.forEach((c, i) => {
      const e = { siteId, i, c };
      if (siteIds && !siteIds.has(siteId)) return drop(e, "unknown-site", f);
      if (!L.validCandidate(c)) return drop(e, "invalid", "needs source, ref, year, caption and kind");
      const key = L.refKey(c);
      if (!key) return drop(e, "invalid", `unrecognized ${c.source} ref`);
      if (seen.has(key)) return drop(e, "duplicate", "listed twice for this site");
      seen.add(key);
      e.key = key;
      entries.push(e);
    });
  }
  o.log(`media: ${entries.length} candidates in ${files.length} manifest files`);

  // ---------------------------------------------------------- network
  const unreachable = {};
  const hostLast = new Map();
  const limit = L.createLimiter(Math.max(1, Math.min(4, o.concurrency)));
  const overBudget = () => o.now() - t0 > o.timeBudgetMs;

  async function gate(host) {
    const gap = o.hostIntervalMs[host] ?? 100;
    const now = o.now();
    const at = Math.max(now, (hostLast.get(host) ?? 0) + gap);
    hostLast.set(host, at);
    if (at > now) await o.sleep(at - now);
  }

  async function request(url, { timeoutMs, accept }) {
    const host = new URL(url).host;
    for (let attempt = 1; ; attempt++) {
      if (o.offline) throw new L.NetError("OFFLINE", url);
      if (unreachable[host]) throw new L.NetError(unreachable[host], url);
      if (overBudget()) throw new L.NetError("time budget used up", url);
      await gate(host);
      let res;
      try {
        res = await o.fetch(url, {
          headers: { "User-Agent": L.USER_AGENT, "Api-User-Agent": L.USER_AGENT, Accept: accept },
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const code = L.netErrorCode(err) ?? "EFETCH";
        if (attempt >= (L.isUnreachable(code) ? 2 : 3)) {
          if (L.isUnreachable(code) && !unreachable[host]) {
            unreachable[host] = code;
            warnings.push(`${host} unreachable (${code}); used the cache`);
            o.log(`media: ${host} unreachable (${code}); using the cache for it`);
          }
          throw new L.NetError(code, url, err);
        }
        await o.sleep(L.retryDelayMs(attempt));
        continue;
      }
      if (res.ok) return res;
      if (L.isRetryableStatus(res.status) && attempt < 4) {
        const ra = res.headers.get("retry-after");
        try {
          await res.body?.cancel();
        } catch {
          /* already consumed */
        }
        if (Number(ra) > 120) {
          // a long block (loc.gov's is an hour): stop asking this host for this run
          unreachable[host] = `HTTP ${res.status}, retry after ${ra}s`;
          warnings.push(`${host} asked us to wait ${ra}s; used the cache`);
          throw new L.HttpError(res.status, url);
        }
        await o.sleep(L.retryDelayMs(attempt, ra, o.now()));
        continue;
      }
      throw new L.HttpError(res.status, url);
    }
  }

  async function getJson(url) {
    for (let attempt = 1; ; attempt++) {
      const res = await limit(() => request(url, { timeoutMs: o.apiTimeoutMs, accept: "application/json" }));
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new L.HttpError(`${res.status} with a non-JSON body`, url);
      }
      // MediaWiki asks clients to back off when its replicas lag
      if (json?.error?.code === "maxlag" && attempt < 4) {
        await o.sleep(L.retryDelayMs(attempt, res.headers.get("retry-after") ?? "5", o.now(), 30_000));
        continue;
      }
      return json;
    }
  }

  const fresh = (rec) => rec && !o.refresh && o.now() - (rec.fetchedAt ?? 0) < o.apiTtlMs;
  const failCode = (err) => (err instanceof L.NetError ? "offline" : "api-error");
  const failDetail = (err) => (err instanceof L.NetError ? `${err.code}` : err?.message ?? String(err));

  // ---------------------------------------------------------- Commons metadata
  const results = new Map(); // key -> { ok, record } | { ok:false, code, detail }
  const commonsFile = (t) => path.join(cache, "api", "commons", sha(t) + ".json");
  const commonsTitles = [...new Set(entries.filter((e) => e.c.source === "commons").map((e) => L.normalizeCommonsRef(e.c.ref)))];
  const cachedCommons = new Map();
  const toFetch = [];
  for (const t of commonsTitles) {
    const rec = await readJson(commonsFile(t));
    if (rec) cachedCommons.set(t, rec);
    if (!fresh(rec)) toFetch.push(t);
  }
  for (const batch of L.commonsBatches(toFetch)) {
    try {
      let json = await getJson(L.commonsApiUrl(batch));
      if (json?.error) throw new L.HttpError(`API error ${json.error.code}`, "commons");
      // extmetadata for 50 files can spill into continuations
      for (let i = 0; json.continue && i < 10; i++) {
        const more = await getJson(L.commonsApiUrl(batch, L.COMMONS_THUMB_WIDTH, json.continue));
        const cont = more.continue;
        json = L.mergeCommonsPages(json, more);
        json.continue = cont;
      }
      for (const [t, rec] of L.commonsRecords(json, batch, o.now())) {
        cachedCommons.set(t, rec);
        await writeIfChanged(commonsFile(t), JSON.stringify(rec) + "\n");
        changed = true;
      }
    } catch (err) {
      for (const t of batch) {
        if (!cachedCommons.has(t)) results.set(`commons:${t}`, { ok: false, code: failCode(err), detail: `Commons: ${failDetail(err)}` });
      }
      if (!(err instanceof L.NetError)) o.log(`media: Commons batch failed (${failDetail(err)}); using the cache for it`);
    }
  }
  for (const t of commonsTitles) {
    const rec = cachedCommons.get(t);
    if (rec && !results.has(`commons:${t}`)) results.set(`commons:${t}`, L.commonsResult(rec));
  }

  // ---------------------------------------------------------- LOC metadata
  const locRefs = new Map();
  for (const e of entries) if (e.c.source === "loc") locRefs.set(e.key, L.normalizeLocRef(e.c.ref));
  await Promise.all(
    [...locRefs.entries()].map(async ([key, r]) => {
      const file = path.join(cache, "api", "loc", `${r.kind}-${r.id.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
      let rec = await readJson(file);
      if (!fresh(rec)) {
        let next = null;
        try {
          let itemId = r.kind === "item" ? r.id : null;
          let json = await getJson(L.locJsonUrl(r));
          if (r.kind === "resource") {
            itemId = L.locItemIdFromResource(json);
            if (itemId) json = await getJson(L.locJsonUrl({ kind: "item", id: itemId }));
          }
          next = { ref: key, fetchedAt: o.now(), itemId: itemId ?? r.id, json: L.trimLocJson(json) };
        } catch (err) {
          if (err instanceof L.HttpError && (err.status === 404 || err.status === 410)) {
            next = { ref: key, fetchedAt: o.now(), status: err.status };
          } else if (!rec) {
            results.set(key, { ok: false, code: failCode(err), detail: `LOC: ${failDetail(err)}` });
            return;
          } // else: keep the stale answer
        }
        if (next) {
          rec = next;
          await writeIfChanged(file, JSON.stringify(rec) + "\n");
          changed = true;
        }
      }
      if (rec.status) results.set(key, { ok: false, code: "missing", detail: `LOC HTTP ${rec.status}` });
      else results.set(key, L.parseLocItem(rec.json, rec.itemId));
    }),
  );

  // ---------------------------------------------------------- download + resize
  let sharp = o.sharp;
  let sharpError = null;
  const getSharp = async () => {
    if (sharp || sharpError) return sharp;
    try {
      sharp = (await import("sharp")).default;
    } catch (e) {
      sharpError = e;
      warnings.push(`sharp failed to load (${e.message}); only cached images were used`);
      o.log(`media: sharp failed to load (${e.message}); only cached images are used`);
    }
    return sharp;
  };

  const procDir = path.join(cache, "processed");
  const dlDir = path.join(cache, "downloads");
  const ready = []; // { e, record, proc }

  const cpu = L.createLimiter(2);
  const jobs = new Map(); // pKey -> Promise<{ proc } | { code, detail }>

  /** Download (or reuse) and resize one archive image. Shared by sites that use the same file. */
  async function prepare(rec, dlKey, pKey) {
    const procMeta = path.join(procDir, pKey + ".json");
    const proc = await readJson(procMeta);
    if (proc && (await exists(path.join(procDir, `${pKey}-${FULL}.jpg`))) && (await exists(path.join(procDir, `${pKey}-${THUMB}.jpg`)))) return { proc };
    const dlFile = path.join(dlDir, dlKey);
    let buf = await readFile(dlFile).catch(() => null);
    if (!buf) {
      const got = await limit(async () => {
        const res = await request(rec.url, { timeoutMs: o.downloadTimeoutMs, accept: "image/*" });
        const type = res.headers.get("content-type") ?? "";
        const len = Number(res.headers.get("content-length") ?? 0);
        if (len > MAX_DOWNLOAD || (type && !/^image\//i.test(type) && !/octet-stream/i.test(type))) {
          await res.body?.cancel().catch(() => {});
          return len > MAX_DOWNLOAD ? { code: "too-large", detail: `${Math.round(len / 1e6)} MB` } : { code: "not-image", detail: `server sent ${type.split(";")[0]}` };
        }
        const b = Buffer.from(await res.arrayBuffer());
        if (b.length > MAX_DOWNLOAD) return { code: "too-large", detail: `${Math.round(b.length / 1e6)} MB` };
        return { buf: b };
      }).catch((err) => ({ code: err instanceof L.NetError ? "offline" : "download", detail: `${new URL(rec.url).host}: ${failDetail(err)}` }));
      if (!got.buf) return got;
      buf = got.buf;
      await mkdir(dlDir, { recursive: true });
      await writeFile(dlFile, buf);
      changed = true;
    }
    const s = await getSharp();
    if (!s) return { code: "image", detail: "sharp unavailable" };
    return cpu(async () => {
      try {
        const img = () => s(buf, { limitInputPixels: 400_000_000, failOn: "error" }).rotate();
        const fit = (n) => img().resize(n, n, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" });
        const full = await fit(FULL).jpeg(JPEG_FULL).toBuffer({ resolveWithObject: true });
        const thumb = await fit(THUMB).jpeg(JPEG_THUMB).toBuffer();
        await mkdir(procDir, { recursive: true });
        await writeFile(path.join(procDir, `${pKey}-${FULL}.jpg`), full.data);
        await writeFile(path.join(procDir, `${pKey}-${THUMB}.jpg`), thumb);
        const hash = createHash("sha256").update(full.data).update(thumb).digest("hex").slice(0, 10);
        const proc = { width: full.info.width, height: full.info.height, bytes: full.data.length, hash };
        await writeFile(procMeta, JSON.stringify(proc) + "\n");
        changed = true;
        return { proc };
      } catch (err) {
        return { code: "image", detail: String(err?.message ?? "could not decode").split("\n")[0] };
      }
    });
  }

  await Promise.all(
    entries.map(async (e) => {
      const r = results.get(e.key);
      if (!r) return drop(e, "api-error", "no answer from the archive");
      if (!r.ok) return drop(e, r.code, r.detail);
      const rec = r.record;
      if (rec.size && rec.size > MAX_DOWNLOAD && !/\/thumb\//.test(rec.url)) return drop(e, "too-large", `${Math.round(rec.size / 1e6)} MB original and no thumbnail`);
      const dlKey = rec.sha1 ? `c-${rec.sha1}-${rec.width}` : `u-${sha(rec.url, 32)}`;
      const pKey = `${dlKey}-p${PROC_VERSION}`;
      if (!jobs.has(pKey)) jobs.set(pKey, prepare(rec, dlKey, pKey));
      const got = await jobs.get(pKey);
      if (got.proc) ready.push({ e, rec, pKey, proc: got.proc });
      else drop(e, got.code, got.detail);
    }),
  );

  // ---------------------------------------------------------- write outputs
  const bySite = new Map();
  for (const x of ready) {
    if (!bySite.has(x.e.siteId)) bySite.set(x.e.siteId, []);
    bySite.get(x.e.siteId).push(x);
  }
  const index = {};
  const wanted = new Set();
  const mediaRoot = path.join(at(o.publicDir), "media");
  const outputsFile = path.join(cache, "outputs.json");
  const outputs = (await readJson(outputsFile)) ?? {};
  const nextOutputs = {};
  for (const siteId of [...bySite.keys()].sort()) {
    const items = L.sortByYear(bySite.get(siteId).map((x) => ({ ...x, year: x.e.c.year, i: x.e.i })).sort((a, b) => a.i - b.i));
    index[siteId] = [];
    let n = 0;
    for (const x of items) {
      n++;
      const c = x.e.c;
      const rel = (size) => `media/${siteId}/${n}-${size}.jpg`;
      for (const size of [FULL, THUMB]) {
        const dest = path.join(at(o.publicDir), rel(size));
        const src = path.join(procDir, `${x.pKey}-${size}.jpg`);
        wanted.add(path.resolve(dest));
        nextOutputs[rel(size)] = x.pKey;
        if (outputs[rel(size)] !== x.pKey || !(await exists(dest))) {
          await mkdir(path.dirname(dest), { recursive: true });
          await copyFile(src, dest);
        }
      }
      const img = {
        id: `${siteId}-${n}`,
        siteId,
        src: `${rel(FULL)}?v=${x.proc.hash}`,
        thumb: `${rel(THUMB)}?v=${x.proc.hash}`,
        width: x.proc.width,
        height: x.proc.height,
        year: c.year,
        ...(c.approx ? { approx: true } : {}),
        caption: c.caption.trim(),
        kind: c.kind,
        ...(c.sameView ? { sameView: c.sameView } : {}),
        credit: x.rec.credit,
        license: x.rec.license,
        ...(x.rec.licenseUrl ? { licenseUrl: x.rec.licenseUrl } : {}),
        sourceUrl: x.rec.sourceUrl,
        archive: x.rec.archive,
      };
      index[siteId].push(img);
    }
  }
  // public/media holds only what this run produced
  if (!o.only) {
    for (const f of await listFiles(mediaRoot)) if (!wanted.has(path.resolve(f))) await rm(f, { force: true });
    try {
      for (const d of await readdir(mediaRoot)) await rmdir(path.join(mediaRoot, d)).catch(() => {});
    } catch {
      /* no media folder */
    }
  }
  await mkdir(cache, { recursive: true });
  await writeIfChanged(outputsFile, JSON.stringify(o.only ? { ...outputs, ...nextOutputs } : nextOutputs) + "\n");
  const kept = ready.length;
  const summary = L.summarize(kept, drops);
  let out = index;
  if (o.only) {
    // a partial run keeps the other sites as they were
    const prev = (await readJson(at(o.outJson))) ?? {};
    for (const id of o.only) delete prev[id];
    out = Object.fromEntries(Object.entries({ ...prev, ...index }).sort(([a], [b]) => a.localeCompare(b)));
  }
  await writeIfChanged(at(o.outJson), JSON.stringify(out, null, 2) + "\n");
  const report = {
    at: new Date(o.now()).toISOString(),
    summary,
    kept,
    sites: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])),
    unreachable,
    warnings,
    drops,
    seconds: Math.round((o.now() - t0) / 100) / 10,
  };
  await writeFile(path.join(cache, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return { index: out, kept, drops, summary, unreachable, warnings, changed, report };
}
