/**
 * Full-screen photo viewer, shown when store.viewer is set (actions.openViewer).
 * Loaded lazily from App.tsx. Swipe or ← → to move, pinch / double-tap / wheel / + − to
 * zoom, drag to pan, swipe down or Esc to close, tap to hide the captions.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SITE_BY_ID } from "../../data";
import type { MediaImage } from "../../data/media";
import { actions, useStore } from "../../state/store";
import { ChevronLeft, ChevronRight, ClockIcon, CloseIcon, EyeIcon, ZoomInIcon, ZoomOutIcon } from "../Icons";
import { prefersReducedMotion } from "../media";
import { KIND_LABEL, getMedia, isDemoImage, peekMedia, reveal, srcOf, useVeil, veiled, yearLabel } from "./source";
import "../media.css";

export default function Viewer() {
  const viewer = useStore((s) => s.viewer);
  const siteId = viewer?.siteId ?? "";
  const [loaded, setLoaded] = useState<{ id: string; items: MediaImage[] | null }>(() => ({ id: siteId, items: peekMedia(siteId) }));
  useEffect(() => {
    if (!siteId) return;
    let live = true;
    const hit = peekMedia(siteId);
    if (hit) setLoaded({ id: siteId, items: hit });
    else getMedia(siteId).then((items) => live && setLoaded({ id: siteId, items }));
    return () => {
      live = false;
    };
  }, [siteId]);
  if (!viewer) return null;
  const items = loaded.id === siteId ? loaded.items : peekMedia(siteId);
  return <Lightbox siteId={viewer.siteId} index={viewer.index} items={items} />;
}

interface Zoom {
  s: number;
  x: number;
  y: number;
}
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
const MAX_ZOOM = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Mode = "idle" | "swipe" | "dismiss" | "pan" | "pinch";
interface Gesture {
  mode: Mode;
  x0: number;
  y0: number;
  z0: Zoom;
  moved: boolean;
  lx: number;
  ly: number;
  lt: number;
  vx: number;
  vy: number;
  d0?: number;
  m0?: { x: number; y: number };
}

function Lightbox({ siteId, index: rawIndex, items }: { siteId: string; index: number; items: MediaImage[] | null }) {
  const site = SITE_BY_ID[siteId];
  const n = items?.length ?? 0;
  const index = n ? clamp(Math.round(rawIndex) || 0, 0, n - 1) : 0;
  const cur = items?.[index] ?? null;
  const veil = useVeil();
  const covered = veil(cur);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [zoom, setZoomState] = useState<Zoom>(NO_ZOOM);
  const zoomRef = useRef(zoom);
  const setZoom = (z: Zoom) => {
    zoomRef.current = z;
    setZoomState(z);
  };
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [gesturing, setGesturing] = useState(false);
  const [bare, setBare] = useState(false);
  const [ready, setReady] = useState<Record<string, true>>({});

  // the latest values for listeners that are bound once
  const live = useRef({ index, n, cur });
  live.current = { index, n, cur };

  const go = (k: number) => {
    const { n: count, index: at } = live.current;
    if (!count) return;
    const to = clamp(k, 0, count - 1);
    if (to !== at) actions.setViewerIndex(to);
  };
  const close = () => actions.closeViewer();

  /* ----- geometry and zoom ----- */
  /** The current image's box (centre and size on screen) and the size of the picture inside it. */
  const geom = () => {
    const img = imgRef.current;
    const c = live.current.cur;
    if (!img || !c) return null;
    const slide = img.parentElement!;
    const r = slide.getBoundingClientRect();
    const cs = getComputedStyle(slide);
    const W = img.clientWidth;
    const H = img.clientHeight;
    const k = Math.min(W / c.width, H / c.height);
    return {
      cx: r.left + parseFloat(cs.paddingLeft) + W / 2,
      cy: r.top + parseFloat(cs.paddingTop) + H / 2,
      W,
      H,
      fw: c.width * k,
      fh: c.height * k,
    };
  };
  const bound = (z: Zoom): Zoom => {
    const g = geom();
    if (!g) return z;
    const mx = Math.max(0, (g.fw * z.s - g.W) / 2);
    const my = Math.max(0, (g.fh * z.s - g.H) / 2);
    return { s: z.s, x: clamp(z.x, -mx, mx), y: clamp(z.y, -my, my) };
  };
  /** Zoom to scale s keeping the screen point (clientX, clientY) still. */
  const zoomAt = (clientX: number, clientY: number, s: number): Zoom => {
    const g = geom();
    const z = zoomRef.current;
    const ns = clamp(s, 1, MAX_ZOOM);
    if (!g || ns <= 1.001 || veiled(live.current.cur)) return NO_ZOOM;
    const px = clientX - g.cx;
    const py = clientY - g.cy;
    const k = ns / z.s;
    return bound({ s: ns, x: px - (px - z.x) * k, y: py - (py - z.y) * k });
  };
  const zoomBy = (k: number) => {
    const g = geom();
    if (g) setZoom(zoomAt(g.cx, g.cy, zoomRef.current.s * k));
  };

  useEffect(() => setZoom(NO_ZOOM), [index, siteId]);

  /* ----- focus in, trap, restore; keys before the app sees them ----- */
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.key === "Tab") {
        setBare(false);
        const f = [...root.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])")].filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const a = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (a === first || !root.contains(a))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (a === last || !root.contains(a))) {
          e.preventDefault();
          first.focus();
        }
        e.stopPropagation();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // nothing below the viewer reacts to keys while it is open
      e.stopPropagation();
      const z = zoomRef.current;
      const { index: at, n: count } = live.current;
      const pan = (ddx: number, ddy: number) => setZoom(bound({ s: z.s, x: z.x + ddx, y: z.y + ddy }));
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          if (z.s > 1.01) setZoom(NO_ZOOM);
          else close();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (z.s > 1.01) pan(-90, 0);
          else go(at + 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (z.s > 1.01) pan(90, 0);
          else go(at - 1);
          break;
        case "ArrowUp":
        case "ArrowDown":
          if (z.s > 1.01) {
            e.preventDefault();
            pan(0, e.key === "ArrowUp" ? 90 : -90);
          }
          break;
        case "Home":
          e.preventDefault();
          go(0);
          break;
        case "End":
          e.preventDefault();
          go(count - 1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomBy(1.6);
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomBy(1 / 1.6);
          break;
        case "0":
          setZoom(NO_ZOOM);
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, []);

  /* ----- wheel zoom (not passive, so the page never scrolls) ----- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!live.current.cur) return;
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
      setZoom(zoomAt(e.clientX, e.clientY, zoomRef.current.s * k));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [!!cur]);

  /* ----- keep the picture clear of the captions: measure the bottom chrome ----- */
  useLayoutEffect(() => {
    const b = bottomRef.current;
    const root = rootRef.current;
    if (!b || !root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => root.style.setProperty("--vw-bottom", `${Math.ceil(b.offsetHeight)}px`));
    ro.observe(b);
    return () => ro.disconnect();
  }, [!!cur]);

  /* ----- neighbours load ahead; the film strip follows ----- */
  useEffect(() => {
    if (!items) return;
    for (const k of [index + 1, index - 1, index + 2]) {
      const m = items[k];
      if (m) {
        const im = new Image();
        im.decoding = "async";
        im.src = srcOf(m.src);
      }
    }
    const film = filmRef.current;
    const btn = film?.children[index] as HTMLElement | undefined;
    if (film && btn) film.scrollTo({ left: btn.offsetLeft - film.clientWidth / 2 + btn.offsetWidth / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [index, items]);

  /* ----- gestures ----- */
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<Gesture | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(tapTimer.current), []);

  const startOne = (x: number, y: number, t: number, moved = false): Gesture => ({
    mode: moved && zoomRef.current.s > 1.01 ? "pan" : "idle",
    x0: x,
    y0: y,
    z0: zoomRef.current,
    moved,
    lx: x,
    ly: y,
    lt: t,
    vx: 0,
    vy: 0,
  });

  const onDown = (e: React.PointerEvent) => {
    if (e.button > 0 || !cur || (e.target as HTMLElement).closest("button,a")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) gest.current = startOne(e.clientX, e.clientY, e.timeStamp);
    else if (ptrs.current.size === 2 && !veiled(cur)) {
      const [a, b] = [...ptrs.current.values()];
      gest.current = {
        ...startOne(0, 0, e.timeStamp, true),
        mode: "pinch",
        d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
        m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      setDx(0);
      setDy(0);
      setGesturing(true);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gest.current;
    if (!g) return;
    if (g.mode === "pinch") {
      if (ptrs.current.size < 2) return;
      const [a, b] = [...ptrs.current.values()];
      const geo = geom();
      if (!geo) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = clamp(g.z0.s * (d / g.d0!), 0.85, MAX_ZOOM * 1.15);
      const k = s / g.z0.s;
      const m0x = g.m0!.x - geo.cx;
      const m0y = g.m0!.y - geo.cy;
      const mx = (a.x + b.x) / 2 - geo.cx;
      const my = (a.y + b.y) / 2 - geo.cy;
      setZoom({ s, x: mx - (m0x - g.z0.x) * k, y: my - (m0y - g.z0.y) * k });
      return;
    }
    const ddx = e.clientX - g.x0;
    const ddy = e.clientY - g.y0;
    if (g.mode === "idle") {
      if (Math.hypot(ddx, ddy) < 7) return;
      g.moved = true;
      g.mode = zoomRef.current.s > 1.01 ? "pan" : Math.abs(ddx) >= Math.abs(ddy) ? "swipe" : "dismiss";
      setGesturing(true);
    }
    const dt = e.timeStamp - g.lt;
    if (dt > 0) {
      g.vx = 0.7 * ((e.clientX - g.lx) / dt) + 0.3 * g.vx;
      g.vy = 0.7 * ((e.clientY - g.ly) / dt) + 0.3 * g.vy;
    }
    g.lx = e.clientX;
    g.ly = e.clientY;
    g.lt = e.timeStamp;
    if (g.mode === "pan") setZoom(bound({ s: g.z0.s, x: g.z0.x + ddx, y: g.z0.y + ddy }));
    else if (g.mode === "swipe") {
      const edge = (index === 0 && ddx > 0) || (index === n - 1 && ddx < 0);
      setDx(edge ? ddx * 0.3 : ddx);
    } else if (g.mode === "dismiss") setDy(ddy);
  };

  const onUp = (e: React.PointerEvent, cancelled = false) => {
    if (!ptrs.current.delete(e.pointerId)) return;
    const g = gest.current;
    if (!g) return;
    if (g.mode === "pinch") {
      if (ptrs.current.size === 1) {
        const [p] = [...ptrs.current.values()];
        gest.current = startOne(p.x, p.y, e.timeStamp, true);
      } else if (ptrs.current.size === 0) {
        gest.current = null;
        setGesturing(false);
        const z = zoomRef.current;
        setZoom(z.s < 1.05 ? NO_ZOOM : bound({ ...z, s: Math.min(z.s, MAX_ZOOM) }));
      }
      return;
    }
    if (ptrs.current.size > 0) return;
    gest.current = null;
    setGesturing(false);
    const ddx = e.clientX - g.x0;
    const ddy = e.clientY - g.y0;
    const fresh = e.timeStamp - g.lt < 90;
    if (g.mode === "swipe") {
      const w = stageRef.current?.clientWidth ?? 400;
      const fling = fresh && Math.abs(g.vx) > 0.45;
      if (!cancelled && (ddx < -w * 0.18 || (fling && g.vx < 0)) && index < n - 1) go(index + 1);
      else if (!cancelled && (ddx > w * 0.18 || (fling && g.vx > 0)) && index > 0) go(index - 1);
      setDx(0);
    } else if (g.mode === "dismiss") {
      if (!cancelled && (Math.abs(ddy) > 120 || (fresh && Math.abs(g.vy) > 0.8))) close();
      else setDy(0);
    } else if (g.mode === "idle" && !cancelled) tap(e.clientX, e.clientY, e.timeStamp);
  };

  /** One tap hides or shows the captions; two quick taps zoom in or out at that point. */
  const tap = (x: number, y: number, t: number) => {
    const lt = lastTap.current;
    if (lt && t - lt.t < 320 && Math.hypot(x - lt.x, y - lt.y) < 32) {
      clearTimeout(tapTimer.current);
      lastTap.current = null;
      setZoom(zoomRef.current.s > 1.01 ? NO_ZOOM : zoomAt(x, y, 2.5));
      return;
    }
    lastTap.current = { t, x, y };
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      lastTap.current = null;
      setBare((b) => !b);
    }, 300);
  };

  /* ----- render ----- */
  const toTimeline = () => {
    if (!cur) return;
    actions.setYear(cur.year);
    actions.closeViewer();
    actions.toast(`Timeline set to ${cur.year}`);
  };
  const zoomed = zoom.s > 1.01;
  const dim = 1 - Math.min(0.85, Math.abs(dy) / 500);
  const label = `Photos of ${site?.title ?? "this place"}`;

  return (
    <div
      ref={rootRef}
      className={"vw" + (bare ? " bare" : "") + (zoomed ? " zoomed" : "") + (gesturing ? " gesturing" : "")}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{ ["--dim" as string]: dim.toFixed(3) }}
    >
      <div
        ref={stageRef}
        className="vw-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => onUp(e)}
        onPointerCancel={(e) => onUp(e, true)}
      >
        {items === null ? (
          <div className="vw-msg" aria-live="polite">
            <span className="vw-spin" aria-hidden="true" />
            <span className="sr-only">Loading photos</span>
          </div>
        ) : n === 0 ? (
          <div className="vw-msg">
            <p>No photos for this place yet.</p>
          </div>
        ) : (
          <div className="vw-track" style={{ transform: `translate3d(calc(${-index * 100}% + ${dx}px), ${dy}px, 0)` }}>
            {items.map((m, k) =>
              Math.abs(k - index) > 1 ? null : (
                <div key={m.id} className="vw-slide" style={{ left: `${k * 100}%` }} aria-hidden={k !== index}>
                  {!ready[m.id] && m.thumb !== m.src && <img className="vw-img lo" src={srcOf(m.thumb)} alt="" draggable={false} />}
                  {!ready[m.id] && <span className="vw-spin" aria-hidden="true" />}
                  <img
                    ref={k === index ? imgRef : undefined}
                    className={"vw-img" + (ready[m.id] ? " in" : "") + (veil(m) ? " veiled" : "")}
                    src={srcOf(m.src)}
                    alt={k === index ? m.caption : ""}
                    draggable={false}
                    decoding="async"
                    onLoad={() => setReady((r) => (r[m.id] ? r : { ...r, [m.id]: true }))}
                    style={k === index && zoom !== NO_ZOOM ? { transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.s})` } : undefined}
                  />
                </div>
              ),
            )}
          </div>
        )}
        {cur && covered && (
          <div className="vw-veil">
            <button type="button" onClick={() => reveal(cur.id)}>
              <EyeIcon />
              <b>Graphic historical photo</b>
              <span>It may be disturbing. Tap to view.</span>
            </button>
          </div>
        )}
        {n > 1 && (
          <>
            <button type="button" className="vw-nav prev" aria-label="Previous photo" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft />
            </button>
            <button type="button" className="vw-nav next" aria-label="Next photo" disabled={index === n - 1} onClick={() => go(index + 1)}>
              <ChevronRight />
            </button>
          </>
        )}
      </div>

      <div className="vw-top">
        <span className="vw-count" aria-hidden={!n}>
          {n ? (
            <>
              <b>{index + 1}</b> / {n}
            </>
          ) : null}
        </span>
        <span className="vw-site">{site?.title}</span>
        {cur && (
          <span className="vw-zoom">
            <button type="button" className="vw-btn" aria-label="Zoom out" title="Zoom out (−)" disabled={!zoomed} onClick={() => zoomBy(1 / 1.6)}>
              <ZoomOutIcon />
            </button>
            <button type="button" className="vw-btn" aria-label="Zoom in" title="Zoom in (+)" disabled={covered || zoom.s >= MAX_ZOOM - 0.01} onClick={() => zoomBy(1.6)}>
              <ZoomInIcon />
            </button>
          </span>
        )}
        <button ref={closeRef} type="button" className="vw-btn close" aria-label="Close photos" title="Close (Esc)" onClick={close}>
          <CloseIcon />
        </button>
      </div>

      <div ref={bottomRef} className="vw-bottom">
        {cur && (
          <div className="vw-info">
            <div className="vw-meta">
              <b className="vw-year">{yearLabel(cur)}</b>
              <span className="vw-kind">{KIND_LABEL[cur.kind]}</span>
              {isDemoImage(cur) && <span className="vw-demo">Demo image</span>}
            </div>
            <div className="vw-text">
              <p className="vw-cap">{cur.caption}</p>
              <p className="vw-credit">
                <span>{cur.credit}</span>
                {cur.licenseUrl ? (
                  <a href={cur.licenseUrl} target="_blank" rel="noopener">
                    {cur.license}
                  </a>
                ) : (
                  <span>{cur.license}</span>
                )}
                {cur.sourceUrl && (
                  <a href={cur.sourceUrl} target="_blank" rel="noopener">
                    {cur.archive} ↗
                  </a>
                )}
              </p>
            </div>
            <button type="button" className="vw-tl" onClick={toTimeline}>
              <ClockIcon />
              <span>
                Show <b>{cur.year}</b> on the timeline
              </span>
            </button>
          </div>
        )}
        {n > 1 && items && (
          <div ref={filmRef} className="vw-film" role="group" aria-label="All photos">
            {items.map((m, k) => (
              <button
                key={m.id}
                type="button"
                className={k === index ? "on" : ""}
                aria-label={`Photo ${k + 1}, ${yearLabel(m)}`}
                aria-current={k === index ? "true" : undefined}
                onClick={() => go(k)}
              >
                <img className={veil(m) ? "veiled" : ""} src={srcOf(m.thumb)} alt="" loading="lazy" decoding="async" draggable={false} />
                <span>{m.year}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {cur ? `Photo ${index + 1} of ${n}. ${yearLabel(cur)}. ${cur.caption}` : ""}
      </p>
    </div>
  );
}
