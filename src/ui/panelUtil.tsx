import type { ComponentChildren } from "preact";
import { SITES } from "../data";
import { norm } from "../lib/filters";
import type { Site } from "../types";

/* ---------- search highlighting ---------- */

/** Character ranges in `text` that match the (already normalized) query. */
export function matchRanges(text: string, q: string): [number, number][] {
  if (!q) return [];
  let n = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = norm(text[i]);
    n += c;
    for (let k = 0; k < c.length; k++) map.push(i);
  }
  const out: [number, number][] = [];
  let i = n.indexOf(q);
  while (i >= 0 && q.length) {
    out.push([map[i], map[i + q.length - 1] + 1]);
    i = n.indexOf(q, i + q.length);
  }
  return out;
}

/** Text with the query wrapped in <mark>. */
export function Hl({ text, q }: { text: string; q: string }) {
  const r = matchRanges(text, q);
  if (!r.length) return <>{text}</>;
  const parts: ComponentChildren[] = [];
  let at = 0;
  r.forEach(([a, b], k) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(<mark key={k}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** A short excerpt around the first match in a longer field, when the title doesn't match. */
export function snippet(site: Site, q: string): { text: string; field: string } | null {
  if (!q || matchRanges(site.title, q).length) return null;
  const fields: [string, string][] = [
    [site.story, "Story"],
    [site.today, "Today"],
    [site.address, "Where"],
  ];
  for (const [text, field] of fields) {
    const r = matchRanges(text, q)[0];
    if (!r) continue;
    if (text.length < 70) return { text, field };
    let a = Math.max(0, r[0] - 28);
    let b = Math.min(text.length, r[1] + 42);
    if (a > 0) a = text.indexOf(" ", a) + 1 || a;
    if (b < text.length) b = text.lastIndexOf(" ", b) > r[1] ? text.lastIndexOf(" ", b) : b;
    return { text: (a > 0 ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : ""), field };
  }
  return null;
}

/* ---------- "did you mean" ---------- */

let vocab: string[] | null = null;
function words(): string[] {
  if (!vocab) {
    const set = new Set<string>();
    for (const s of SITES) {
      for (const w of norm([s.title, s.short, s.address, s.today].join(" ")).split(/[^a-z0-9]+/)) if (w.length >= 3) set.add(w);
    }
    vocab = [...set];
  }
  return vocab;
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** The closest word in the site texts to a query that found nothing, if it's a near miss. */
export function didYouMean(q: string): string | null {
  if (q.length < 3 || q.includes(" ")) return null;
  const max = q.length > 6 ? 2 : 1;
  let best: string | null = null;
  let bestD = max + 1;
  for (const w of words()) {
    if (Math.abs(w.length - q.length) > max) continue;
    const d = lev(q, w);
    if (d < bestD) [best, bestD] = [w, d];
  }
  return best;
}

/* ---------- recently viewed (per browser) ---------- */

const RECENT_KEY = "ctm-recent";
let recent: string[] | null = null;

export function getRecent(): string[] {
  if (recent) return recent;
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    recent = Array.isArray(v) ? v.filter((id) => SITES.some((s) => s.id === id)) : [];
  } catch {
    recent = [];
  }
  return recent!;
}

export function pushRecent(id: string) {
  recent = [id, ...getRecent().filter((x) => x !== id)].slice(0, 6);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* storage unavailable */
  }
}

/** A small counter in storage, for hints that show only the first few times. */
export function bumpCount(key: string): number {
  try {
    const n = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(n));
    return n;
  } catch {
    return 99;
  }
}

/* ---------- geography and time ---------- */

/** Distance in miles. */
export function miles(a: Site, b: Site): number {
  const R = 3958.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtMiles = (m: number) => (m < 0.1 ? "Next door" : `${m < 10 ? m.toFixed(1) : Math.round(m)} mi away`);

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "12 years later", "3 years earlier", "Same year". */
export function relYears(from: number, to: number): string {
  const d = to - from;
  if (d === 0) return "Same year";
  return `${plural(Math.abs(d), "year")} ${d > 0 ? "later" : "earlier"}`;
}
