import { useEffect, useState } from "react";
import { CENSUS, ERAS, MAX_YEAR, MIN_YEAR, ORDERED, SITE_BY_ID } from "../data";
import { censusLine } from "../lib/census";
import { eraOf } from "../lib/eras";
import { actions, getState, matches, subscribe, useStore } from "../state/store";
import { ChevronLeft, ChevronRight, PauseIcon, PlayIcon } from "./Icons";

const pct = (y: number) => ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
const TICKS = [1780, 1850, 1900, 1950, MAX_YEAR];
const COACH_KEY = "ctm-coach-done";

function coachDone() {
  try {
    return localStorage.getItem(COACH_KEY) === "1";
  } catch {
    return false;
  }
}
function setCoachDone() {
  try {
    localStorage.setItem(COACH_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function Timeline() {
  const year = useStore((s) => s.year);
  const playing = useStore((s) => s.playing);
  const selectedId = useStore((s) => s.selectedId);
  const hoverId = useStore((s) => s.hoverId);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const speed = useStore((s) => s.speed);
  const [coach, setCoach] = useState(false);
  const f = { cats, query };
  const total = ORDERED.filter((s) => matches(s, f));
  const shown = total.filter((s) => s.year <= year).length;
  const hov = hoverId ? SITE_BY_ID[hoverId] : null;
  const era = eraOf(year, ERAS);

  // first visit: point at Play, until the timeline is used
  useEffect(() => {
    if (coachDone() || /[?&]nocoach/.test(location.search)) return;
    const t = setTimeout(() => setCoach(true), 900);
    const start = getState();
    const unsub = subscribe(() => {
      const s = getState();
      if (s.playing || s.year !== start.year) {
        setCoach(false);
        setCoachDone();
      }
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);
  const dismiss = () => {
    setCoach(false);
    setCoachDone();
  };

  return (
    <section className="dock glass" aria-label="Timeline">
      {coach && (
        <div className="coach" role="dialog" aria-label="Tip">
          <b>Watch Chicago grow</b>
          Press play to travel from 1780 to today, or drag the red dot. Tap any star to read its story.
          <div className="row">
            <button
              type="button"
              onClick={() => {
                dismiss();
                actions.play();
              }}
            >
              ▶ Play from 1780
            </button>
            <button type="button" className="ghost" onClick={dismiss}>
              Got it
            </button>
          </div>
        </div>
      )}

      <button
        className="play"
        id="play"
        type="button"
        aria-pressed={playing}
        aria-label={playing ? "Pause" : year >= MAX_YEAR ? "Play from 1780" : `Play from ${year}`}
        title={playing ? "Pause (Space)" : "Play (Space)"}
        onClick={() => {
          dismiss();
          actions.togglePlay();
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="readout">
        <div className="year" id="yearOut">
          {year}
        </div>
        <span className="era" id="eraOut">
          {era.name}
        </span>
        <span className="pop" id="popOut">
          {censusLine(year, CENSUS)}
        </span>
        <span className="count" id="countOutPhone" aria-hidden="true">
          {shown} of {total.length} sites
        </span>
      </div>

      <div className="slider">
        {hov && (
          <div className="ticktip" style={{ left: `${Math.min(88, Math.max(12, pct(hov.year)))}%` }} aria-hidden="true">
            <b>{hov.year}</b>
            {hov.title}
          </div>
        )}
        <div className="evts">
          {ORDERED.map((s) => {
            const cls = [
              !matches(s, f) && "off",
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
                style={{ left: `${pct(s.year)}%`, background: `var(--c-${s.category})` }}
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
        <div className="eras">
          {ERAS.map((e, i) => (
            <span
              key={e.from}
              title={`${e.name}, ${e.from}–${Math.min(e.to, MAX_YEAR)}`}
              onClick={() => {
                actions.stop();
                actions.setYear(e.from);
              }}
              style={{
                width: `${pct(Math.min(e.to + 1, MAX_YEAR)) - pct(e.from)}%`,
                background: `color-mix(in srgb, var(--red) ${12 + i * 14}%, var(--lake))`,
              }}
            />
          ))}
        </div>
        <input
          type="range"
          id="year"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={1}
          value={year}
          aria-label="Year"
          aria-valuetext={`${year}, ${era.name}, ${shown} sites`}
          onChange={(e) => {
            actions.stop();
            actions.setYear(+e.target.value);
          }}
        />
        <div className="ticks" aria-hidden="true">
          {TICKS.map((t) => (
            <span key={t} style={{ left: `${pct(t)}%` }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="dock-r">
        <button
          className="iconbtn"
          type="button"
          aria-label="Previous event"
          title="Previous event (←)"
          onClick={() => {
            actions.stop();
            actions.step(-1);
          }}
        >
          <ChevronLeft />
        </button>
        <button
          className="iconbtn"
          type="button"
          aria-label="Next event"
          title="Next event (→)"
          onClick={() => {
            actions.stop();
            actions.step(1);
          }}
        >
          <ChevronRight />
        </button>
        <button
          className="speed"
          type="button"
          aria-label={`Playback speed ${speed}x`}
          title="Playback speed"
          onClick={() => actions.setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1)}
        >
          {speed}×
        </button>
        <span className="count" id="countOut">
          {shown} of {total.length} sites by {year}
        </span>
      </div>
    </section>
  );
}

