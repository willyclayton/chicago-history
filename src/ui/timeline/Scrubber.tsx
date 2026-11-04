import { useEffect, useRef, useState } from "react";
import { ERAS, MAX_YEAR, MIN_YEAR, ORDERED, SITE_BY_ID } from "../../data";
import { eraOf } from "../../lib/eras";
import type { Filter } from "../../lib/filters";
import { actions, getState, matches } from "../../state/store";
import type { Site } from "../../types";
import { FlagStar } from "./glyphs";
import { compactPop, eraColor, frac, pct, popAt, POP_PATH, SPAN, yearAt } from "./geometry";

/** Pixel radius within which a dragged thumb settles onto an event year. */
const DETENT_PX = 6;
/** Fisheye: how far (px) the tick magnifier reaches around the pointer. */
const LENS_PX = 34;

interface Props {
  year: number;
  playing: boolean;
  selectedId: string | null;
  hoverId: string | null;
  filter: Filter;
  shown: number;
  stepMs: number;
}

const clampPct = (p: number, lo = 4, hi = 96) => Math.min(hi, Math.max(lo, p));

export function Scrubber({ year, playing, selectedId, hoverId, filter, shown, stepMs }: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const [hx, setHx] = useState<number | null>(null); // mouse x over the rail, px
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [kbd, setKbd] = useState(false);
  const dragHover = useRef<string | null>(null);
  const era = eraOf(year, ERAS);

  // events at each year, within the current filter
  const atYear = new Map<number, Site[]>();
  for (const s of ORDERED) if (matches(s, filter)) atYear.set(s.year, [...(atYear.get(s.year) ?? []), s]);
  const yearEvents = atYear.get(year);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      setDragging(false);
      if (dragHover.current && getState().hoverId === dragHover.current) actions.hover(null);
      dragHover.current = null;
    };
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
    return () => {
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
    };
  }, [dragging]);

  const thumbX = frac(year) * width;
  const lensX = dragging ? thumbX : hx;

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !rail.current) return;
    const r = rail.current.getBoundingClientRect();
    setHx(Math.min(r.width, Math.max(0, e.clientX - r.left)));
  };

  const onInput = (raw: number) => {
    actions.stop();
    let y = raw;
    if (dragging && width) {
      // a small detent: settle onto a nearby event year
      const radius = Math.min(2, Math.floor(DETENT_PX / (width / SPAN)));
      let best: number | null = null;
      for (let d = 0; d <= radius && best == null; d++) {
        if (atYear.has(raw - d)) best = raw - d;
        else if (atYear.has(raw + d)) best = raw + d;
      }
      if (best != null) y = best;
      const hit = atYear.get(y);
      const id = hit ? hit[hit.length - 1].id : null;
      if (id !== dragHover.current) {
        if (id && "vibrate" in navigator) navigator.vibrate?.(6);
        dragHover.current = id;
        actions.hover(id);
      }
    }
    actions.setYear(y);
  };

  const hov = hoverId ? SITE_BY_ID[hoverId] : null;
  const showBubble = dragging || kbd;
  const ghostYear = hx != null && width ? yearAt(hx / width) : null;
  const showGhost = ghostYear != null && !dragging && !hov;
  const p = pct(year);

  return (
    <div
      className={`tl-scrub${dragging ? " dragging" : ""}${playing ? " playing" : ""}`}
      style={{ "--step": `${stepMs}ms` } as React.CSSProperties}
      onPointerMove={onMove}
      onPointerLeave={() => setHx(null)}
    >
      <input
        type="range"
        id="year"
        min={MIN_YEAR}
        max={MAX_YEAR}
        step={1}
        value={year}
        aria-label="Year"
        aria-valuetext={`${year}, ${era.name}, ${shown} sites${yearEvents ? `, ${yearEvents.map((s) => s.title).join(", ")}` : ""}`}
        onPointerDown={() => {
          setDragging(true);
          setKbd(false);
        }}
        onFocus={(e) => setKbd(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setKbd(false)}
        onKeyDown={() => setKbd(true)}
        onChange={(e) => onInput(+e.currentTarget.value)}
      />

      <div className="tl-rail" ref={rail}>
        {/* floating labels above the rail */}
        {hov && !dragging && (
          <div
            className="tl-tip"
            style={{ left: `${clampPct(pct(hov.year), 10, 90)}%`, "--cc": `var(--c-${hov.category})` } as React.CSSProperties}
            aria-hidden="true"
          >
            <i />
            <b>{hov.year}</b>
            <span>{hov.title}</span>
          </div>
        )}
        {showGhost && (
          <div className="tl-ghostlabel" style={{ left: `${clampPct((hx! / width) * 100, 5, 95)}%` }} aria-hidden="true">
            <b>{ghostYear}</b>
            {popAt(ghostYear!) > 0 && <span>{compactPop(popAt(ghostYear!))} people</span>}
          </div>
        )}
        {showBubble && (
          <div className="tl-bubble" style={{ left: `${clampPct(p, 8, 92)}%` }} aria-hidden="true">
            <b>{year}</b>
            <span>{yearEvents ? yearEvents[yearEvents.length - 1].title : era.name}</span>
          </div>
        )}

        <div className="evts">
          {ORDERED.map((s) => {
            const x = frac(s.year) * width;
            const m = lensX == null ? 0 : Math.exp(-Math.pow((x - lensX) / LENS_PX, 2));
            const cls = [
              !matches(s, filter) && "off",
              s.year > year && "later",
              s.id === selectedId && "sel",
              s.id === hoverId && "hov",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <i
                key={s.id}
                data-id={s.id}
                className={cls || undefined}
                style={{ left: `${pct(s.year)}%`, "--cc": `var(--c-${s.category})`, "--m": m.toFixed(3) } as React.CSSProperties}
                onMouseEnter={() => actions.hover(s.id)}
                onMouseLeave={() => getState().hoverId === s.id && actions.hover(null)}
                onClick={() => {
                  actions.stop();
                  actions.select(s.id, { pan: true, setYear: true });
                }}
              />
            );
          })}
        </div>

        <div className="tl-track" aria-hidden="true">
          <svg className="tl-pop" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path className="area" d={POP_PATH.area} />
            <path className="line" d={POP_PATH.line} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="tl-bands">
            {ERAS.map((e, i) => (
              <span
                key={e.from}
                className={e === era ? "cur" : undefined}
                style={{
                  left: `${pct(e.from)}%`,
                  width: `${pct(Math.min(e.to + 1, MAX_YEAR)) - pct(e.from)}%`,
                  background: eraColor(i),
                }}
              />
            ))}
          </div>
          <div className="tl-future" style={{ left: `${p}%` }} />
          {showGhost && <div className="tl-ghost" style={{ left: `${hx}px` }} />}
        </div>

        <div className="tl-thumb" style={{ left: `${p}%` }} aria-hidden="true">
          <FlagStar />
        </div>
      </div>

      <div className="tl-eras">
        {ERAS.map((e, i) => {
          const cur = e === era;
          const w = pct(Math.min(e.to + 1, MAX_YEAR)) - pct(e.from);
          return (
            <button
              key={e.from}
              type="button"
              className={cur ? "cur" : undefined}
              aria-current={cur ? "true" : undefined}
              aria-label={`Jump to chapter ${i + 1}, ${e.name}, ${e.from}`}
              title={`${e.name}, ${e.from}–${Math.min(e.to, MAX_YEAR)}`}
              style={{ left: `${pct(e.from)}%`, width: `${w}%`, "--ec": eraColor(i) } as React.CSSProperties}
              onClick={() => {
                actions.stop();
                actions.setYear(e.from);
              }}
            >
              <b>{e.from}</b>
              <span className="full">{e.name}</span>
              <span className="short">{e.name.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
