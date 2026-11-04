/**
 * The story's media: the "Then & Now" stage in the header (a year scrubber that blends a
 * site's photos into each other, a wipe comparison for photos of the same view, and a
 * live Street View stop), the photo strip, the key facts and the then-to-now chronology.
 * Loaded lazily by StoryCard, only for sites that have photos or a history.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MAX_YEAR } from "../../data";
import type { Fact, Moment, MomentKind } from "../../data/history";
import type { MediaImage, MediaKind } from "../../data/media";
import { actions, getState, subscribe } from "../../state/store";
import type { Site } from "../../types";
import {
  ChangeIcon,
  ChevronRight,
  CompareIcon,
  CraneIcon,
  ExpandIcon,
  EyeIcon,
  FlagIcon,
  PauseIcon,
  PhotoIcon,
  PlayIcon,
  RubbleIcon,
  SparkIcon,
  StreetIcon,
} from "../Icons";
import { prefersReducedMotion } from "../media";
import { bumpCount, plural } from "../panelUtil";
import { KIND_LABEL, isDemoImage, isSensitive, reveal, srcOf, useVeil, yearLabel } from "./source";
import "../media.css";

/* ---------- shared bits ---------- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** Animate a number with requestAnimationFrame; returns a cancel function. */
function tween(from: number, to: number, ms: number, on: (v: number) => void, done?: () => void): () => void {
  if (ms <= 0 || from === to || prefersReducedMotion()) {
    on(to);
    done?.();
    return () => {};
  }
  let raf = 0;
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    on(from + (to - from) * ease(k));
    if (k < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Whole-image layer: portrait scans (front pages) sit on a blurred copy of themselves.
 *  A graphic photo stays blurred (`veil`) until someone chooses to see it. */
function Pic({ img, alt = "", eager, veil }: { img: MediaImage; alt?: string; eager?: boolean; veil?: boolean }) {
  const tall = img.height > img.width * 1.05;
  const src = srcOf(img.src);
  return (
    <>
      {tall && <img className={"tn-bg" + (veil ? " veiled" : "")} src={srcOf(img.thumb)} alt="" aria-hidden="true" draggable={false} />}
      <img
        className={"tn-img" + (tall ? " contain" : "") + (veil ? " veiled" : "")}
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        loading={eager ? "eager" : "lazy"}
        onError={(e) => (e.currentTarget as HTMLImageElement).classList.add("err")}
      />
    </>
  );
}

/* ---------- Then & Now stage ---------- */

/** Kinds that show what the place looked like; front pages, portraits and maps go in the strip. */
const STAGE_KINDS = new Set<MediaKind>(["event", "aftermath", "place", "construction", "today"]);

interface Stop {
  img: MediaImage | null; // null: live Street View
  full: number; // index in the full photo list (-1 for live)
  year: number;
}

/** Stop positions along the track: part even spacing, part true time, so equal years don't pile up. */
function positions(stops: Stop[]): number[] {
  const n = stops.length;
  if (n < 2) return [0.5];
  const y0 = stops[0].year;
  const span = Math.max(1, stops[n - 1].year - y0);
  return stops.map((s, i) => 0.42 * (i / (n - 1)) + 0.58 * ((s.year - y0) / span));
}

/** Year labels under the track that don't collide (first and last always). */
function trackLabels(stops: Stop[], P: number[]): number[] {
  const n = stops.length;
  const out: number[] = [0];
  for (let k = 1; k < n - 1; k++) {
    const last = out[out.length - 1];
    if (stops[k].year !== stops[last].year && P[k] - P[last] >= 0.14 && P[n - 1] - P[k] >= 0.14) out.push(k);
  }
  if (n > 1) out.push(n - 1);
  return out;
}

export interface ThenNowProps {
  site: Site;
  /** All of the site's photos, oldest first. */
  items: MediaImage[];
  /** The stage is on screen (desktop, or the phone sheet is raised): only then load Street View. */
  open: boolean;
  /** Street View embed URL for the live stop, or null. */
  embed: string | null;
  /** Bumped by the story to jump to the live stop. */
  liveReq: number;
  /** The photo (index in `items`) the stage is resting on, or -1 for Street View. */
  onActive?: (full: number) => void;
}

export function ThenNow({ site, items, open, embed, liveReq, onActive }: ThenNowProps) {
  const stops = useMemo<Stop[]>(() => {
    const all = items.map((img, full) => ({ img, full, year: img.year }));
    const pick = all.filter((s) => STAGE_KINDS.has(s.img.kind));
    const list: Stop[] = pick.length >= 2 || pick.length === all.length ? pick : all;
    if (embed) list.push({ img: null, full: -1, year: Math.max(MAX_YEAR, list[list.length - 1]?.year ?? MAX_YEAR) });
    return list;
  }, [items, embed]);
  const n = stops.length;
  const P = useMemo(() => positions(stops), [stops]);
  const labels = useMemo(() => trackLabels(stops, P), [stops, P]);
  const liveIdx = embed ? n - 1 : -1;
  const lastPhoto = embed ? n - 2 : n - 1;

  const veil = useVeil();

  // start on the photo closest to the event, never on a graphic one
  const home = useMemo(() => {
    let best = -1;
    stops.forEach((s, k) => {
      if (s.img && !isSensitive(s.img) && (best < 0 || Math.abs(s.year - site.year) < Math.abs(stops[best].year - site.year))) best = k;
    });
    return Math.max(0, best);
  }, [stops, site.year]);

  // a first-visit cue: start at today and let it bleed back to the event
  const intro = useRef<boolean | null>(null);
  if (intro.current === null)
    intro.current =
      open &&
      !prefersReducedMotion() &&
      lastPhoto >= 1 &&
      home !== lastPhoto &&
      !isSensitive(stops[lastPhoto].img!) &&
      stops[lastPhoto].year - stops[home].year >= 25 &&
      bumpCount("ctm-thennow") <= 2;
  const start = intro.current ? lastPhoto : home;

  const [t, setTState] = useState(start);
  const tRef = useRef(start);
  const setT = (v: number) => {
    tRef.current = v;
    setTState(v);
  };
  const cancelAnim = useRef<() => void>(() => {});
  const glide = (to: number, ms?: number) => {
    cancelAnim.current();
    const from = tRef.current;
    cancelAnim.current = tween(from, to, ms ?? Math.min(900, 260 + 240 * Math.abs(to - from)), setT);
  };

  const [mode, setMode] = useState<"scrub" | "wipe">("scrub");
  const [wipe, setWipeState] = useState(50);
  const wipeRef = useRef(50);
  const setWipe = (v: number) => {
    wipeRef.current = v;
    setWipeState(v);
  };
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef<ReturnType<typeof setTimeout>>();
  const [liveOn, setLiveOn] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const settled = clamp(Math.round(t), 0, n - 1);
  const resting = Math.abs(t - settled) < 0.01;
  const cur = stops[settled];
  const atLive = settled === liveIdx && resting;

  // Street View loads the first time the live stop is reached with the stage on screen
  useEffect(() => {
    if (atLive && open) setLiveOn(true);
  }, [atLive, open]);

  useEffect(() => onActive?.(cur.img ? cur.full : -1), [cur]);

  useEffect(
    () => () => {
      cancelAnim.current();
      clearTimeout(playTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!intro.current) return;
    const id = setTimeout(() => glide(home, 1700), 700);
    return () => clearTimeout(id);
  }, []);

  // the story asked for Street View ("Look around this spot today")
  useEffect(() => {
    if (!liveReq || liveIdx < 0) return;
    stopPlay();
    setMode("scrub");
    glide(liveIdx);
  }, [liveReq]);

  // follow the full-screen viewer, so closing it lands on the photo you were looking at
  useEffect(() => {
    const off = subscribe(() => {
      const v = getState().viewer;
      if (!v || v.siteId !== site.id) return;
      const k = stops.findIndex((s) => s.full === v.index);
      if (k >= 0 && Math.round(tRef.current) !== k) {
        cancelAnim.current();
        setT(k);
      }
    });
    return () => {
      off();
    };
  }, [stops, site.id]);

  /* ----- playback: then to now ----- */
  function stopPlay() {
    clearTimeout(playTimer.current);
    setPlaying(false);
  }
  function play() {
    if (playing) return stopPlay();
    setMode("scrub");
    const reduce = prefersReducedMotion();
    let k = Math.round(tRef.current);
    let wait = 250;
    if (k >= lastPhoto) {
      k = 0;
      glide(0, reduce ? 0 : 700);
      wait = reduce ? 1400 : 1100;
    }
    setPlaying(true);
    const next = () => {
      k++;
      if (k > lastPhoto) return setPlaying(false);
      glide(k, reduce ? 0 : 1200);
      playTimer.current = setTimeout(next, reduce ? 1800 : 2300);
    };
    playTimer.current = setTimeout(next, wait);
  }

  /* ----- track: tap or drag to move through time ----- */
  const posOf = (v: number) => {
    const i = clamp(Math.floor(v), 0, n - 1);
    const j = Math.min(i + 1, n - 1);
    return P[i] + (P[j] - P[i]) * (v - i);
  };
  const tAt = (clientX: number) => {
    const r = railRef.current!.getBoundingClientRect();
    const p = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
    for (let k = 0; k < n - 1; k++) if (p <= P[k + 1]) return k + clamp((p - P[k]) / Math.max(1e-6, P[k + 1] - P[k]), 0, 1);
    return n - 1;
  };
  const trackDrag = useRef<{ id: number; x: number; moved: boolean } | null>(null);
  const onTrackDown = (e: React.PointerEvent) => {
    if (e.button > 0 || n < 2) return;
    stopPlay();
    cancelAnim.current();
    setMode("scrub");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    trackDrag.current = { id: e.pointerId, x: e.clientX, moved: false };
  };
  const onTrackMove = (e: React.PointerEvent) => {
    const d = trackDrag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
    d.moved = true;
    setT(tAt(e.clientX));
  };
  const onTrackUp = (e: React.PointerEvent) => {
    const d = trackDrag.current;
    trackDrag.current = null;
    if (!d) return;
    glide(Math.round(d.moved ? tRef.current : tAt(e.clientX)));
  };
  const onTrackKey = (e: React.KeyboardEvent) => {
    const k = settled;
    const map: Record<string, number> = {
      ArrowRight: k + 1,
      ArrowUp: k + 1,
      ArrowLeft: k - 1,
      ArrowDown: k - 1,
      PageUp: k + 3,
      PageDown: k - 3,
      Home: 0,
      End: n - 1,
    };
    if (e.key in map) {
      e.preventDefault();
      e.stopPropagation(); // the app uses ← → to change sites
      stopPlay();
      setMode("scrub");
      glide(clamp(map[e.key], 0, n - 1));
    } else if (e.key === "Enter" && cur.img) {
      e.preventDefault();
      actions.openViewer(site.id, cur.full);
    }
  };

  /* ----- stage: drag sideways through time, or tap to open the photo ----- */
  const stageDrag = useRef<{ id: number; x: number; y: number; t0: number; on: boolean; lx: number; lt: number; v: number } | null>(null);
  const onStageDown = (e: React.PointerEvent) => {
    if (e.button > 0 || (e.target as HTMLElement).closest("button,a,iframe,[role=slider]")) return;
    stopPlay();
    if (mode === "wipe") {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      stageDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: 0, on: true, lx: 0, lt: 0, v: 0 };
      wipeFrom(e.clientX);
      return;
    }
    cancelAnim.current();
    stageDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: tRef.current, on: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
  };
  const wipeFrom = (clientX: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    setWipe(clamp(((clientX - r.left) / r.width) * 100, 2, 98));
  };
  const onStageMove = (e: React.PointerEvent) => {
    const d = stageDrag.current;
    if (!d || d.id !== e.pointerId) return;
    if (mode === "wipe") return wipeFrom(e.clientX);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) {
        if (Math.abs(dy) > 12) stageDrag.current = null; // a scroll, not ours
        return;
      }
      d.on = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const w = stageRef.current?.clientWidth ?? 300;
    let v = d.t0 - dx / (w * 0.55);
    if (v < 0) v = -Math.min(0.25, -v * 0.3);
    if (v > n - 1) v = n - 1 + Math.min(0.25, (v - (n - 1)) * 0.3);
    setT(v);
    const dt = e.timeStamp - d.lt;
    if (dt > 0) d.v = 0.7 * ((e.clientX - d.lx) / dt) + 0.3 * d.v;
    d.lx = e.clientX;
    d.lt = e.timeStamp;
  };
  const onStageUp = (e: React.PointerEvent) => {
    const d = stageDrag.current;
    stageDrag.current = null;
    if (!d || mode === "wipe") return;
    if (!d.on) {
      if (Math.abs(e.clientX - d.x) < 8 && Math.abs(e.clientY - d.y) < 8 && cur.img) actions.openViewer(site.id, cur.full);
      return;
    }
    const fresh = e.timeStamp - d.lt < 90;
    let to = Math.round(tRef.current);
    if (fresh && Math.abs(d.v) > 0.45) to = d.v < 0 ? Math.floor(tRef.current) + 1 : Math.ceil(tRef.current) - 1;
    glide(clamp(to, 0, n - 1));
  };
  const onStageCancel = () => {
    if (!stageDrag.current) return;
    stageDrag.current = null;
    if (mode === "scrub") glide(clamp(Math.round(tRef.current), 0, n - 1));
  };

  /* ----- wipe comparison: two photos of the same view ----- */
  const pair = useMemo(() => {
    const img = cur.img;
    if (!img?.sameView) return null;
    const group = items.filter((m) => m.sameView === img.sameView);
    if (group.length < 2) return null;
    const newest = group[group.length - 1];
    return img === newest ? { then: group[0], now: img } : { then: img, now: newest };
  }, [cur, items]);
  const shown = useRef(pair);
  if (mode === "scrub" || pair) shown.current = pair;
  const comp = mode === "wipe" ? shown.current : null;

  const toggleWipe = () => {
    stopPlay();
    if (mode === "wipe") return setMode("scrub");
    if (!pair) return;
    setMode("wipe");
    setWipe(50);
    // a quick sweep shows the divider moves
    if (!prefersReducedMotion()) {
      cancelAnim.current();
      const seq = [50, 26, 74, 50];
      let i = 0;
      const nextLeg = () => {
        if (++i >= seq.length) return;
        cancelAnim.current = tween(seq[i - 1], seq[i], 380, setWipe, nextLeg);
      };
      nextLeg();
    }
  };
  const onWipeKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 5;
    const map: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
    if (e.key in map) setWipe(clamp(wipeRef.current + map[e.key], 2, 98));
    else if (e.key === "Home") setWipe(2);
    else if (e.key === "End") setWipe(98);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  /* ----- render ----- */
  const i0 = clamp(Math.floor(t), 0, n - 1);
  const f = clamp(t - i0, 0, 1);
  const i1 = Math.min(i0 + 1, n - 1);
  const yr = (k: number) => stops[k].year;
  const year = Math.round(yr(i0) + (yr(i1) - yr(i0)) * f);
  const yearText = !resting && f > 0.02 && f < 0.98 ? String(year) : cur.img ? yearLabel(cur.img) : "Now";
  const kindText = cur.img ? KIND_LABEL[cur.img.kind] : "Street View";
  const after = cur.img ? cur.img.year - site.year : 0;
  const pos = posOf(clamp(t, 0, n - 1));
  const valueText = cur.img ? `${yearLabel(cur.img)}, ${KIND_LABEL[cur.img.kind]}: ${cur.img.caption}` : "Today, live Street View";
  const demo = cur.img ? isDemoImage(cur.img) : false;
  // graphic photos on screen right now that are still covered
  const veilIds = comp
    ? [comp.then, comp.now].filter((m) => veil(m)).map((m) => m.id)
    : resting && cur.img && veil(cur.img)
      ? [cur.img.id]
      : [];

  return (
    <div className={"tn" + (mode === "wipe" ? " wiping" : "") + (atLive ? " at-live" : "")} data-noswipe="">
      <div
        ref={stageRef}
        className="tn-stage"
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        onPointerCancel={onStageCancel}
      >
        {comp ? (
          <div className="tn-wipe" style={{ ["--w" as string]: `${wipe}%` }}>
            <div className="tn-layer">
              <Pic img={comp.now} alt={`${yearLabel(comp.now)}: ${comp.now.caption}`} eager veil={veil(comp.now)} />
            </div>
            <div className="tn-layer tn-then">
              <Pic img={comp.then} alt={`${yearLabel(comp.then)}: ${comp.then.caption}`} eager veil={veil(comp.then)} />
            </div>
            <span className="tn-wtag l">{yearLabel(comp.then)}</span>
            <span className="tn-wtag r">{yearLabel(comp.now)}</span>
            <div className="tn-wline">
              <span
                className="tn-wknob"
                role="slider"
                tabIndex={0}
                aria-label={`Compare ${yearLabel(comp.then)} with ${yearLabel(comp.now)}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(wipe)}
                aria-valuetext={`${Math.round(wipe)}% ${yearLabel(comp.then)}`}
                onKeyDown={onWipeKey}
                onPointerDown={(e) => {
                  stopPlay();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId) && wipeFrom(e.clientX)}
              >
                <i />
              </span>
            </div>
          </div>
        ) : (
          stops.map((s, k) => {
            if (k < i0 - 1 || k > i0 + 2) return null; // keep neighbours mounted so they're decoded
            const top = k === i0 ? 1 : k === i1 && f > 0.001 ? f : 0;
            const style = { zIndex: k + 1, ["--f" as string]: top.toFixed(3) };
            const cls = "tn-layer" + (top === 0 ? " off" : "") + (k === i1 && top > 0 && top < 1 ? " bleed" : "");
            if (!s.img)
              return (
                <div key="live" className={cls + " tn-live"} style={style}>
                  <div className="tn-liveph">
                    <StreetIcon />
                    <b>Live Street View</b>
                    <span>{open ? "Look around this spot today" : ""}</span>
                  </div>
                  {liveOn && embed && (
                    <iframe
                      title={`Street View of ${site.title} today`}
                      src={embed}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                      tabIndex={atLive ? 0 : -1}
                    />
                  )}
                </div>
              );
            return (
              <div key={s.img.id} className={cls} style={style}>
                <Pic img={s.img} alt={k === settled ? s.img.caption : ""} veil={veil(s.img)} />
              </div>
            );
          })
        )}

        {!comp && (
          <div className="tn-year" aria-hidden="true">
            <small>
              {kindText}
              {cur.img && after > 1 && <em> · {plural(after, "year")} later</em>}
            </small>
            <b>{yearText}</b>
          </div>
        )}
        {veilIds.length > 0 && (
          <div className="tn-veil">
            <button type="button" onClick={() => reveal(...veilIds)}>
              <EyeIcon />
              <b>Graphic historical photo</b>
              <span>Tap to view</span>
            </button>
          </div>
        )}
        {(comp ? isDemoImage(comp.then) : demo) && <span className="tn-demo">Demo image</span>}
        <div className="tn-tools">
          {(pair || comp) && (
            <button
              type="button"
              className="tn-btn"
              aria-pressed={mode === "wipe"}
              onClick={toggleWipe}
              title={comp ? "Back to the time scrubber" : "Compare then and now"}
            >
              <CompareIcon />
              <span>{comp ? "Done" : "Compare"}</span>
            </button>
          )}
          {(cur.img || comp) && (
            <button
              type="button"
              className="tn-btn icon"
              aria-label={`Open the ${plural(items.length, "photo")} full screen`}
              title="Full screen"
              onClick={() => actions.openViewer(site.id, comp ? items.indexOf(comp.then) : cur.full)}
            >
              <ExpandIcon />
            </button>
          )}
        </div>
      </div>

      {n > 1 && (
        <div className="tn-scrub">
          {lastPhoto >= 1 && (
            <button
              type="button"
              className="tn-play"
              aria-label={playing ? "Pause" : "Play from then to now"}
              title={playing ? "Pause" : "Play then to now"}
              onClick={play}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          )}
          <div
            className="tn-track"
            role="slider"
            tabIndex={0}
            aria-label="Move through time"
            aria-valuemin={1}
            aria-valuemax={n}
            aria-valuenow={settled + 1}
            aria-valuetext={valueText}
            onPointerDown={onTrackDown}
            onPointerMove={onTrackMove}
            onPointerUp={onTrackUp}
            onPointerCancel={onTrackUp}
            onKeyDown={onTrackKey}
          >
            <div ref={railRef} className="tn-rail" style={{ ["--p" as string]: pos.toFixed(4) }}>
              <span className="tn-fill" />
              {stops.map((s, k) => (
                <i
                  key={k}
                  className={"tn-stop" + (k <= t + 0.001 ? " past" : "") + (k === settled ? " on" : "") + (s.img ? "" : " live")}
                  style={{ left: `${P[k] * 100}%` }}
                />
              ))}
              <span className="tn-thumb" />
            </div>
            <div className="tn-labels" aria-hidden="true">
              {labels.map((k) => (
                <span
                  key={k}
                  className={(k === settled ? "on" : "") + (k === 0 ? " first" : k === n - 1 ? " last" : "")}
                  style={{ left: `${P[k] * 100}%` }}
                >
                  {stops[k].img ? stops[k].year : "Live"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="tn-cap">
        {comp ? (
          <>
            <p>
              <b>{yearLabel(comp.then)}</b> {comp.then.caption} <b>{yearLabel(comp.now)}</b> {comp.now.caption}
            </p>
            <Credit img={comp.then} />
          </>
        ) : cur.img ? (
          <>
            <p>{cur.img.caption}</p>
            <Credit img={cur.img} />
          </>
        ) : (
          <>
            <p>The spot today in Google Street View. Drag inside the view to look around.</p>
            <p className="tn-credit">Imagery © Google</p>
          </>
        )}
      </div>
    </div>
  );
}

function Credit({ img }: { img: MediaImage }) {
  return (
    <p className="tn-credit">
      <span>{img.credit}</span>
      <span>{img.license}</span>
      {img.sourceUrl && (
        <a href={img.sourceUrl} target="_blank" rel="noopener">
          {img.archive} ↗
        </a>
      )}
    </p>
  );
}

/* ---------- photo strip ---------- */

export function PhotoStrip({ site, items, active }: { site: Site; items: MediaImage[]; active: number }) {
  const row = useRef<HTMLUListElement>(null);
  const veil = useVeil();
  useEffect(() => {
    const ul = row.current;
    const li = active >= 0 ? (ul?.children[active] as HTMLElement | undefined) : undefined;
    if (!ul || !li) return;
    const left = li.offsetLeft - ul.clientWidth / 2 + li.offsetWidth / 2;
    ul.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);
  if (items.length < 2) return null;
  const y0 = items[0].year;
  const y1 = items[items.length - 1].year;
  return (
    <section className="pstrip" aria-labelledby="pstripH">
      <div className="pstrip-head">
        <h3 id="pstripH" className="sec">
          In pictures
        </h3>
        <button type="button" className="pstrip-all" onClick={() => actions.openViewer(site.id, Math.max(0, active))}>
          <PhotoIcon />
          {items.length} photos{y0 !== y1 ? ` · ${y0}–${y1}` : ""}
          <ChevronRight className="chev" />
        </button>
      </div>
      <ul ref={row} className="pstrip-row">
        {items.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              className={i === active ? "on" : ""}
              onClick={() => actions.openViewer(site.id, i)}
              aria-label={`Photo ${i + 1} of ${items.length}, ${yearLabel(m)}${veil(m) ? ", graphic, hidden until you choose to view it" : ""}: ${m.caption}`}
            >
              <img className={veil(m) ? "veiled" : ""} src={srcOf(m.thumb)} alt="" loading="lazy" decoding="async" draggable={false} />
              <span className="py">{yearLabel(m)}</span>
              {veil(m) ? <span className="pk warn">Graphic</span> : m.kind === "newspaper" && <span className="pk">News</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- facts ---------- */

export function Facts({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  let note = 0;
  const marks = facts.map((f) => (f.note ? ++note : 0));
  return (
    <section className="stats" aria-label="Key facts">
      <dl>
        {facts.map((f, i) => (
          <div key={i} className={f.value.length > 16 ? "long" : ""}>
            <dt>{f.label}</dt>
            <dd>
              {f.value}
              {marks[i] > 0 && (
                <>
                  <sup aria-hidden="true">{marks[i]}</sup>
                  <span className="sr-only"> ({f.note})</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {note > 0 && (
        <ol className="stat-notes" aria-hidden="true">
          {facts.filter((f) => f.note).map((f, i) => (
            <li key={i}>
              <sup>{i + 1}</sup> {f.note}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- then to now: the chronology ---------- */

const MOMENT_ICON: Record<MomentKind, (p: React.SVGProps<SVGSVGElement>) => JSX.Element> = {
  event: SparkIcon,
  built: CraneIcon,
  changed: ChangeIcon,
  demolished: RubbleIcon,
  commemorated: FlagIcon,
  today: EyeIcon,
};
const MOMENT_LABEL: Record<MomentKind, string> = {
  event: "What happened",
  built: "Built",
  changed: "Changed",
  demolished: "Torn down",
  commemorated: "Remembered",
  today: "Today",
};
const AFFINITY: Record<MomentKind, MediaKind[]> = {
  event: ["event", "aftermath", "newspaper", "people"],
  built: ["construction", "place"],
  changed: ["place", "construction"],
  demolished: ["place", "aftermath"],
  commemorated: ["place", "today"],
  today: ["today", "place"],
};

/** Pair each moment with an unused photo from about the same year (today: the newest photo of today). */
function matchPhotos(moments: Moment[], items: MediaImage[]): (number | null)[] {
  const used = new Set<number>();
  return moments.map((m) => {
    let best: number | null = null;
    let bestScore = Infinity;
    items.forEach((img, i) => {
      if (used.has(i)) return;
      const fits = AFFINITY[m.kind].includes(img.kind);
      if (m.kind === "today") {
        if (img.kind !== "today") return;
        const score = -img.year;
        if (score < bestScore) [best, bestScore] = [i, score];
        return;
      }
      const dy = Math.abs(img.year - m.year);
      if (dy > 2) return;
      const score = dy * 2 + (fits ? 0 : 1.5);
      if (score < bestScore) [best, bestScore] = [i, score];
    });
    if (best != null) used.add(best);
    return best;
  });
}

export function Moments({ site, moments, items }: { site: Site; moments: Moment[]; items: MediaImage[] }) {
  const photos = useMemo(() => matchPhotos(moments, items), [moments, items]);
  const veil = useVeil();
  if (!moments.length) return null;
  const toTimeline = (year: number) => {
    actions.setYear(year);
    actions.toast(`Timeline set to ${year}`);
  };
  return (
    <section className="moments" aria-labelledby="momH">
      <h3 id="momH" className="sec">
        Then <span aria-hidden="true">→</span>
        <span className="sr-only">to</span> now
      </h3>
      <ol className="mo-list">
        {moments.map((m, i) => {
          const prev = moments[i - 1];
          const gap = prev ? m.year - prev.year : 0;
          const sameYear = prev && prev.year === m.year;
          const Icon = MOMENT_ICON[m.kind] ?? SparkIcon;
          const ph = photos[i];
          const img = ph != null ? items[ph] : null;
          const key = m.kind === "event" && m.year === site.year;
          const isNow = m.kind === "today" && m.year >= MAX_YEAR - 1;
          return (
            <Fragment key={i}>
              {gap >= 5 && (
                <li className="mo-gap" aria-hidden="true">
                  <span>{plural(gap, "year")} later</span>
                </li>
              )}
              <li className={`mo k-${m.kind}` + (key ? " key" : "") + (sameYear ? " same" : "")}>
                {sameYear ? (
                  <span className="mo-year ghost" aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    className="mo-year"
                    onClick={() => toTimeline(m.year)}
                    title={`Show ${m.year} on the timeline`}
                    aria-label={`${m.year}: show on the timeline`}
                  >
                    {isNow ? "Now" : m.year}
                  </button>
                )}
                <span className="mo-dot" aria-hidden="true">
                  <Icon />
                </span>
                <div className="mo-body">
                  <small>
                    {m.date ?? (sameYear ? MOMENT_LABEL[m.kind] : `${MOMENT_LABEL[m.kind]}`)}
                    {sameYear && <span className="sr-only">, {m.year}</span>}
                  </small>
                  <b>{m.title}</b>
                  <p>{m.text}</p>
                </div>
                {img && ph != null && (
                  <button
                    type="button"
                    className="mo-ph"
                    onClick={() => actions.openViewer(site.id, ph)}
                    aria-label={`Open the photo from ${yearLabel(img)}${veil(img) ? " (graphic)" : ""}: ${img.caption}`}
                  >
                    <img className={veil(img) ? "veiled" : ""} src={srcOf(img.thumb)} alt="" loading="lazy" decoding="async" draggable={false} />
                    <span>{yearLabel(img)}</span>
                  </button>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}
