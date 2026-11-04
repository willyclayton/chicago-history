// Pure helpers for the photo pipeline (scripts/media/build-media.mjs).
// No I/O here except through the functions callers pass in, so tests can drive
// everything with a mocked fetch. Contract: src/data/media.ts.

export const USER_AGENT = "ChicagoTimeMap/1.0 (https://github.com/willyclayton/chicago-history)";
export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Width asked of Commons' thumbnailer; the build then fits it into 1280px. */
export const COMMONS_THUMB_WIDTH = 1600;
export const COMMONS_BATCH = 50;
/** Keep batch URLs well under the servers' URL length limit. */
export const COMMONS_MAX_URL = 6000;
export const LOC_ORIGIN = "https://www.loc.gov";

// ---------------------------------------------------------------- text

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…" };

/** Plain text from an archive's HTML snippet (Commons' Artist and Credit fields). */
export function stripHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (s, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// ---------------------------------------------------------------- refs

/**
 * Canonical Commons title: "File:Name with spaces.jpg".
 * Accepts "File:A_b.jpg", "Image:...", "a_b.jpg" and commons.wikimedia.org/wiki/File:... URLs.
 */
export function normalizeCommonsRef(ref) {
  if (typeof ref !== "string") return null;
  let s = ref.trim();
  if (!s) return null;
  const m = s.match(/^https?:\/\/(?:commons\.(?:m\.)?wikimedia\.org|upload\.wikimedia\.org)\/(?:wiki\/)?(.+)$/i);
  if (m) {
    s = m[1].split(/[?#]/)[0];
    // upload.wikimedia.org/wikipedia/commons/a/ab/Name.jpg -> Name.jpg
    if (/^wikipedia\/commons\//i.test(s)) s = "File:" + s.split("/").pop();
    if (/^index\.php$/i.test(s)) {
      const t = new URL(ref).searchParams.get("title");
      if (!t) return null;
      s = t;
    }
  }
  try {
    if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s);
  } catch {
    /* keep it as given */
  }
  s = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:file|image)\s*:\s*/i, "");
  if (!s || /[#<>[\]{}|]/.test(s)) return null;
  return "File:" + s[0].toUpperCase() + s.slice(1);
}

/**
 * LOC record id from an item, pictures/item or resource URL (or a bare id).
 * Returns { kind: "item" | "resource", id } or null.
 */
export function normalizeLocRef(ref) {
  if (typeof ref !== "string") return null;
  const s = ref.trim();
  if (!s) return null;
  const m = s.match(/^(?:https?:)?\/\/(?:www\.)?loc\.gov\/(pictures\/item|item|resource)\/([A-Za-z0-9._-]+)\/?(?:[?#].*)?$/i);
  if (m) return { kind: m[1].toLowerCase() === "resource" ? "resource" : "item", id: m[2] };
  const h = s.match(/^(?:https?:)?\/\/hdl\.loc\.gov\/loc\.pnp\/([a-z]+)\.([A-Za-z0-9]+)\/?$/i);
  if (h) return { kind: "resource", id: `${h[1].toLowerCase()}.${h[2]}` };
  if (/^[A-Za-z0-9._-]+$/.test(s)) return { kind: /\./.test(s) ? "resource" : "item", id: s };
  return null;
}

export const locItemUrl = (id) => `${LOC_ORIGIN}/item/${id}/`;
export const locJsonUrl = (r) => `${LOC_ORIGIN}/${r.kind}/${r.id}/?fo=json`;

/** One key per archive record, for de-duplication and the cache. */
export function refKey(c) {
  if (c?.source === "commons") {
    const t = normalizeCommonsRef(c.ref);
    return t ? `commons:${t}` : null;
  }
  if (c?.source === "loc") {
    const r = normalizeLocRef(c.ref);
    return r ? `loc:${r.kind}:${r.id}` : null;
  }
  return null;
}

// ---------------------------------------------------------------- licenses

/** Lower-case, hyphens and underscores to spaces, collapsed. */
const normLicense = (s) =>
  stripHtml(s)
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ALLOWED = [
  /^public domain\b/, // "Public domain", "Public Domain Mark 1.0"
  /^pd(m)?(\s|$)/, // "PD", "PD-US", "PD-old-70", "PD-US-expired", "PDM 1.0"
  /^cc0\b/, // "CC0", "CC0 1.0"
  /^cc zero\b/,
  // "CC BY 4.0", "CC BY-SA 3.0", "CC-BY-SA-2.5", "CC BY-SA 3.0 de"; never NC or ND
  /^cc by( sa)?( \d(\.\d+)?( [a-z]{2,3})?)?$/,
  /^no known restrictions\b/, // LOC "No known restrictions on publication."
  /^no known copyright restrictions\b/, // Flickr Commons wording
  // LOC's statement for New York World-Telegram & Sun staff photos. Same meaning as
  // "no known restrictions"; remove this line to drop that collection.
  /^no copyright restriction known\b/,
];

/** Whether a license or rights statement is in the allowlist. */
export function isAllowedLicense(text) {
  const n = normLicense(text);
  if (!n) return false;
  return ALLOWED.some((re) => re.test(n));
}

/** Short display form of a rights statement: first sentence, no trailing period or URL. */
export function licenseLabel(text) {
  let s = stripHtml(text).replace(/\(?https?:\/\/\S+\)?/g, "").trim();
  // first sentence or clause, not fooled by initials ("the U.S. Government")
  const dot = s.search(/(?<!\b[A-Z])[.;](\s|$)/);
  if (dot > 0) s = s.slice(0, dot);
  return clip(s.trim(), 80);
}

// ---------------------------------------------------------------- Commons

const COMMONS_META = [
  "LicenseShortName",
  "LicenseUrl",
  "License",
  "UsageTerms",
  "Artist",
  "Credit",
  "Copyrighted",
  "NonFree",
  "AttributionRequired",
  "Restrictions",
].join("|");

export function commonsApiUrl(titles, width = COMMONS_THUMB_WIDTH, cont = null) {
  const p = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|size|mime|sha1|extmetadata",
    iiurlwidth: String(width),
    iiextmetadatafilter: COMMONS_META,
    iiextmetadatalanguage: "en",
    redirects: "1",
    maxlag: "5",
    format: "json",
    formatversion: "2",
  });
  if (cont) for (const [k, v] of Object.entries(cont)) p.set(k, String(v));
  return `${COMMONS_API}?${p}`;
}

/** Split titles into batches of at most `size`, keeping each request URL short. */
export function commonsBatches(titles, size = COMMONS_BATCH, maxUrl = COMMONS_MAX_URL) {
  const out = [];
  let cur = [];
  for (const t of titles) {
    const next = [...cur, t];
    if (cur.length && (next.length > size || commonsApiUrl(next).length > maxUrl)) {
      out.push(cur);
      cur = [t];
    } else cur = next;
  }
  if (cur.length) out.push(cur);
  return out;
}

const meta = (ext, k) => {
  const v = ext?.[k]?.value;
  return v == null ? "" : String(v);
};

const UNKNOWN = /^(unknown|anonymous|unknown author|unknown photographer|author unknown|not provided)\b/i;

/**
 * Turn one Commons page (formatversion=2) into { ok: true, record } or
 * { ok: false, code, detail }. `record` has what media.generated.json needs.
 */
export function parseCommonsPage(page) {
  if (!page || typeof page !== "object") return { ok: false, code: "missing", detail: "no page in the response" };
  if (page.invalid) return { ok: false, code: "missing", detail: `invalid title (${page.invalidreason ?? "?"})` };
  if (page.missing && !page.imageinfo) return { ok: false, code: "missing", detail: "no such file on Commons" };
  const ii = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  if (!ii) return { ok: false, code: "missing", detail: "file page without a file" };
  const mime = String(ii.mime ?? "");
  if (!/^image\//.test(mime) || /djvu/.test(mime)) return { ok: false, code: "not-image", detail: mime || "unknown type" };
  const ext = ii.extmetadata ?? {};
  if (/^true$/i.test(meta(ext, "NonFree"))) return { ok: false, code: "license", detail: "marked non-free" };
  const short = stripHtml(meta(ext, "LicenseShortName"));
  const usage = stripHtml(meta(ext, "UsageTerms"));
  const license = short || usage;
  if (!isAllowedLicense(license)) {
    return { ok: false, code: "license", detail: license ? `"${license}" is not on the allowlist` : "no license given" };
  }
  const url = ii.thumburl || ii.url;
  if (!url) return { ok: false, code: "missing", detail: "no image URL" };
  let credit = stripHtml(meta(ext, "Artist"));
  if (!credit || UNKNOWN.test(credit)) {
    // an unnamed photographer: the Credit field often names the paper or agency instead
    const c = stripHtml(meta(ext, "Credit"));
    if (c && c.length <= 100 && !/^own work\b/i.test(c) && !/^https?:\/\//i.test(c)) credit = c;
  }
  const lu = stripHtml(meta(ext, "LicenseUrl"));
  const licenseUrl = /^https?:\/\//.test(lu) ? lu : lu.startsWith("//") ? "https:" + lu : undefined;
  return {
    ok: true,
    record: {
      url: url.startsWith("//") ? "https:" + url : url,
      width: Number(ii.thumbwidth || ii.width) || 0,
      height: Number(ii.thumbheight || ii.height) || 0,
      mime,
      sha1: ii.sha1 ? String(ii.sha1) : undefined,
      size: Number(ii.size) || undefined,
      license: clip(license, 80),
      licenseUrl,
      credit: clip(credit || "Unknown", 140),
      sourceUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
      archive: "Wikimedia Commons",
    },
  };
}

/**
 * What the API said about each requested title, as cacheable records:
 * { title, fetchedAt, page } or { title, fetchedAt, redirect: "File:New name.jpg" }.
 * Follows the API's title normalization (underscores, first-letter case).
 */
export function commonsRecords(json, titles, fetchedAt = 0) {
  const q = json?.query ?? {};
  const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redir = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
  const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
  const out = new Map();
  for (const t of titles) {
    const n = norm.get(t) ?? t;
    out.set(t, redir.has(n) ? { title: t, fetchedAt, redirect: redir.get(n) } : { title: t, fetchedAt, page: pages.get(n) ?? { title: n, missing: true } });
  }
  return out;
}

/** A cached Commons record as a result. Redirects are dropped, naming the new title. */
export function commonsResult(rec) {
  if (!rec) return { ok: false, code: "missing", detail: "no answer for this title" };
  if (rec.redirect) return { ok: false, code: "redirect", detail: `renamed to "${rec.redirect}"; update the manifest` };
  return parseCommonsPage(rec.page);
}

/** Map each requested title to its result. */
export function parseCommonsResponse(json, titles) {
  const recs = commonsRecords(json, titles);
  return new Map(titles.map((t) => [t, commonsResult(recs.get(t))]));
}

/** Merge a continuation response's pages into the first one's. */
export function mergeCommonsPages(a, b) {
  const q = (a.query ??= {});
  q.normalized = [...(q.normalized ?? []), ...(b?.query?.normalized ?? [])];
  q.redirects = [...(q.redirects ?? []), ...(b?.query?.redirects ?? [])];
  const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p]));
  for (const p of b?.query?.pages ?? []) {
    const cur = byTitle.get(p.title);
    if (!cur) byTitle.set(p.title, p);
    else if (p.imageinfo && !cur.imageinfo) cur.imageinfo = p.imageinfo;
  }
  q.pages = [...byTitle.values()];
  return a;
}

// ---------------------------------------------------------------- LOC

const list = (v) => (v == null ? [] : Array.isArray(v) ? v.flat(2) : [v]);
const str = (v) => list(v).filter((x) => typeof x === "string" && x.trim());
const abs = (u) => (u.startsWith("//") ? "https:" + u : u);

/** Image URL candidates with their size, from every place the LOC JSON lists them.
 *  `scope`: "primary" (the record's first image), "rest" (its other images) or "all". */
export function locImageCandidates(json, scope = "all") {
  const out = [];
  const add = (url, width, height, mime) => {
    if (typeof url !== "string" || !url) return;
    const [base, frag = ""] = abs(url.trim()).split("#");
    const f = new URLSearchParams(frag);
    const w = Number(width ?? f.get("w")) || 0;
    const h = Number(height ?? f.get("h")) || 0;
    const type = mime || (/\.(jpe?g)(\?|$)/i.test(base) || /default\.jpg/i.test(base) ? "image/jpeg" : /\.png(\?|$)/i.test(base) ? "image/png" : /\.gif(\?|$)/i.test(base) ? "image/gif" : /\.(tiff?|jp2)(\?|$)/i.test(base) ? "image/tiff" : "");
    out.push({ url: base, width: w, height: h, mime: type });
  };
  const fromResource = (r) => {
    if (!r || typeof r !== "object") return;
    for (const f of list(r.files)) if (f && typeof f === "object") add(f.url, f.width, f.height, f.mimetype);
    if (typeof r.image === "string") add(r.image);
  };
  const item = json?.item ?? {};
  const resources = [json?.resource, ...list(json?.resources)].filter((r) => r && typeof r === "object");
  if (scope !== "rest") {
    // a resource page's own image, else the item's first resource and its listed sizes
    fromResource(resources[0]);
    for (const f of list(json?.files)) if (f && typeof f === "object") add(f.url, f.width, f.height, f.mimetype);
    for (const u of [...str(item.image_url), ...str(json?.image_url)]) add(u);
  }
  if (scope !== "primary") resources.slice(1).forEach(fromResource);
  return out;
}

const longEdge = (c) => Math.max(c.width, c.height);

function bestOf(cands) {
  const all = cands.filter((c) => /^image\/(jpeg|png|gif)$/.test(c.mime));
  if (!all.length) return null;
  const sized = all.filter((c) => longEdge(c) > 0 && longEdge(c) <= 6000);
  const atLeast = (min) => sized.filter((c) => longEdge(c) >= min).sort((a, b) => longEdge(a) - longEdge(b))[0];
  // no sizes given: resources[].image is LOC's own display image
  return atLeast(1600) ?? atLeast(1280) ?? sized.sort((a, b) => longEdge(b) - longEdge(a))[0] ?? all.find((c) => !longEdge(c)) ?? null;
}

/**
 * The largest reasonable image of the record's primary picture: the smallest JPEG/PNG/GIF
 * whose long edge is at least 1600px (else 1280px, else the biggest), ignoring TIFF/JP2
 * masters and anything huge. Multi-image records (HABS, stereographs) use their first image.
 */
export function pickLocImage(json) {
  return bestOf(locImageCandidates(json, "primary")) ?? bestOf(locImageCandidates(json, "rest"));
}

/** The image of one resource (a single picture of a multi-image item), found by its id. */
export function locResourceImage(jsons, resourceId) {
  const want = `/resource/${String(resourceId).toLowerCase()}/`;
  for (const json of jsons) {
    for (const r of [json?.resource, ...list(json?.resources)]) {
      if (r && typeof r === "object" && typeof r.url === "string" && abs(r.url).toLowerCase().includes(want)) {
        const hit = bestOf(locImageCandidates({ resources: [r] }, "primary"));
        if (hit) return hit;
      }
    }
  }
  return null;
}

/** For a resource record, the item it belongs to. */
export function locItemIdFromResource(json) {
  const item = json?.item ?? {};
  for (const u of [...str(item.id), ...str(item.url), ...str(json?.item_url)]) {
    const r = normalizeLocRef(u);
    if (r?.kind === "item") return r.id;
  }
  return null;
}

/** Keep only the fields the parser reads, so the cache stays small. */
export function trimLocJson(json) {
  const item = json?.item ?? {};
  const keep = ["id", "url", "title", "rights_advisory", "rights", "rights_information", "image_url", "contributor_names", "creator", "contributors", "created_published", "date", "original_format", "online_format"];
  const t = { item: {} };
  for (const k of keep) if (item[k] != null) t.item[k] = item[k];
  const res = (r) => ({ url: r.url, image: r.image, files: r.files });
  t.resources = list(json?.resources)
    .filter((r) => r && typeof r === "object")
    .map(res);
  if (json?.resource && typeof json.resource === "object") t.resource = res(json.resource);
  for (const k of ["image_url", "rights", "rights_advisory", "item_url", "files"]) if (json?.[k] != null) t[k] = json[k];
  return t;
}

/**
 * { ok: true, record } or { ok: false, code, detail } for an LOC item JSON.
 * For a resource ref, `res` holds the resource's own JSON: its image is used, with the item's rights.
 */
export function parseLocItem(json, id, res) {
  if (!json || typeof json !== "object" || !json.item) return { ok: false, code: "missing", detail: "no item in the LOC response" };
  const item = json.item;
  const rights = [...str(item.rights_advisory), ...str(json.rights_advisory), ...str(item.rights), ...str(json.rights), ...str(item.rights_information)].map(stripHtml);
  const statement = rights.find(Boolean) ?? "";
  if (!isAllowedLicense(statement)) {
    return { ok: false, code: "license", detail: statement ? `"${licenseLabel(statement)}" is not on the allowlist` : "no rights statement" };
  }
  const img = res ? locResourceImage([res.resource, json], res.resourceId) ?? pickLocImage(res.resource) ?? pickLocImage(json) : pickLocImage(json);
  if (!img) return { ok: false, code: "not-image", detail: "no JPEG, PNG or GIF in the record" };
  const credit = [...str(item.contributor_names), ...str(item.creator), ...str(item.contributors)].map(stripHtml).find(Boolean);
  const link = statement.match(/https?:\/\/[^\s)]+/)?.[0];
  return {
    ok: true,
    record: {
      url: img.url,
      width: img.width,
      height: img.height,
      mime: img.mime,
      license: licenseLabel(statement),
      licenseUrl: link,
      credit: clip(credit || "Library of Congress, Prints and Photographs Division", 140),
      sourceUrl: id ? locItemUrl(id) : `${LOC_ORIGIN}/resource/${res?.resourceId}/`,
      archive: "Library of Congress",
    },
  };
}

// ---------------------------------------------------------------- network

export const isRetryableStatus = (status) => status === 429 || (status >= 500 && status <= 599);

const NET_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "CERT_HAS_EXPIRED"]);

/** The error code behind a failed fetch (undici nests it in `cause`). */
export function netErrorCode(err) {
  for (let e = err, i = 0; e && i < 5; e = e.cause, i++) {
    if (e.code && NET_CODES.has(e.code)) return e.code;
    if (e.name === "TimeoutError" || e.name === "AbortError") return "ETIMEDOUT";
  }
  if (err instanceof TypeError && /fetch failed|network/i.test(err.message)) return "EFETCH";
  return null;
}

/** DNS failures and refused connections mean the host is unreachable from here; stop asking it. */
export const isUnreachable = (code) => code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNREFUSED" || code === "ENETUNREACH" || code === "EHOSTUNREACH";

/** Wait before retry `attempt` (1-based), honoring Retry-After (seconds or an HTTP date). */
export function retryDelayMs(attempt, retryAfter, now = Date.now(), cap = 60_000) {
  if (retryAfter != null && retryAfter !== "") {
    const s = Number(retryAfter);
    if (Number.isFinite(s)) return Math.min(cap, Math.max(0, s * 1000));
    const t = Date.parse(retryAfter);
    if (Number.isFinite(t)) return Math.min(cap, Math.max(0, t - now));
  }
  return Math.min(cap, 1000 * 2 ** (attempt - 1));
}

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
  }
}

export class NetError extends Error {
  constructor(code, url, cause) {
    super(`network ${code}`);
    this.code = code;
    this.url = url;
    this.cause = cause;
  }
}

/** Run at most `n` tasks at once. */
export function createLimiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, res, rej } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(res, rej)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((res, rej) => {
      queue.push({ fn, res, rej });
      next();
    });
}

// ---------------------------------------------------------------- output

/** Stable sort by year; ties keep manifest order. */
export function sortByYear(items) {
  return items
    .map((x, i) => [x, i])
    .sort((a, b) => a[0].year - b[0].year || a[1] - b[1])
    .map(([x]) => x);
}

export const DROP_LABELS = {
  invalid: "invalid manifest entry",
  duplicate: "duplicate",
  "unknown-site": "unknown site id",
  license: "license not allowed",
  missing: "missing",
  redirect: "redirect",
  "not-image": "not an image",
  "too-large": "too large",
  offline: "archive unreachable, not cached",
  "api-error": "archive error",
  download: "download failed",
  image: "unreadable image",
};

/** "kept 212, dropped 31: 12 license not allowed, 9 missing, ..." */
export function summarize(kept, drops) {
  const by = new Map();
  for (const d of drops) by.set(d.code, (by.get(d.code) ?? 0) + 1);
  const parts = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${DROP_LABELS[c] ?? c}`);
  return `kept ${kept}, dropped ${drops.length}${parts.length ? ": " + parts.join(", ") : ""}`;
}

/** Whether a manifest entry has the fields the app needs. */
export function validCandidate(c) {
  return (
    !!c &&
    typeof c === "object" &&
    (c.source === "commons" || c.source === "loc") &&
    typeof c.ref === "string" &&
    Number.isFinite(c.year) &&
    typeof c.caption === "string" &&
    c.caption.trim() !== "" &&
    typeof c.kind === "string"
  );
}
