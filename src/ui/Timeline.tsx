import { useEffect, useState } from "react";
import { CENSUS, ERAS, MAX_YEAR, MIN_YEAR } from "../data";
import { censusLine } from "../lib/census";
import { eraOf } from "../lib/eras";
import { stepTarget } from "../lib/filters";
import { actions, filtered, getState, PLAY_STEP_MS, subscribe, useStore } from "../state/store";
import type { Site } from "../types";
import { ChevronLeft, ChevronRight, PauseIcon, PlayIcon } from "./Icons";
import { Coach } from "./timeline/Coach";
import { frac, roman } from "./timeline/geometry";
import { Scrubber } from "./timeline/Scrubber";
import { useTween } from "./timeline/useTween";
import "./timeline.css";

const COACH_KEY = "ctm-coach-done";
/** Fired (on window) to show the first-visit tip again, e.g. from the help sheet. */
export const TOUR_EVENT = "ctm:tour";

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

/** Previous/next site for the step buttons, or null when there is nowhere to go. */
function stepFor(list: Site[], selectedId: string | null, year: number, dir: 1 | -1): Site | null {
  const t = stepTarget(list, selectedId, year, dir);
  if (!t || t.id === selectedId) return null;
  if (!selectedId && (dir > 0 ? t.year <= year : t.year >= year)) return null;
  return t;
}

/** Play/pause with a ring that shows how far through time we are. */
function PlayButton({ year, playing, onPress }: { year: number; playing: boolean; onPress: () => void }) {
  const C = 2 * Math.PI * 27;
  return (
    <button
      className={`tl-play${playing ? " on" : ""}`}
      id="play"
      type="button"
      aria-pressed={playing}
      aria-label={playing ? "Pause" : year >= MAX_YEAR ? `Play from ${MIN_YEAR}` : `Play from ${year}`}
      title={playing ? "Pause (Space)" : "Play (Space)"}
      onClick={onPress}
    >
      <svg className="ring" viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r="27" />
        <circle cx="30" cy="30" r="27" className="prog" strokeDasharray={C} strokeDashoffset={C * (1 - frac(year))} />
      </svg>
      <span className="core">{playing ? <PauseIcon /> : <PlayIcon />}</span>
    </button>
  );
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
  const list = filtered(f);
  const shown = list.filter((s) => s.year <= year).length;
  const era = eraOf(year, ERAS);
  const eraIdx = ERAS.indexOf(era);
  const shownYear = useTween(year, playing);
  const prev = stepFor(list, selectedId, year, -1);
  const next = stepFor(list, selectedId, year, 1);

  // first visit: teach the three moves, until the timeline is used
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let unsub: (() => void) | undefined;
    const arm = (delay: number) => {
      clearTimeout(t);
      unsub?.();
      t = setTimeout(() => setCoach(true), delay);
      const start = getState();
      unsub = subscribe(() => {
        const s = getState();
        if (s.playing || s.year !== start.year) {
          clearTimeout(t);
          setCoach(false);
          setCoachDone();
          unsub?.();
          unsub = undefined;
        }
      });
    };
    if (!coachDone() && !/[?&]nocoach/.test(location.search)) arm(900);
    const replay = () => arm(250);
    addEventListener(TOUR_EVENT, replay);
    return () => {
      clearTimeout(t);
      unsub?.();
      removeEventListener(TOUR_EVENT, replay);
    };
  }, []);
  const dismiss = () => {
    setCoach(false);
    setCoachDone();
  };

  const go = (dir: 1 | -1) => {
    dismiss();
    actions.stop();
    actions.step(dir);
  };

  return (
    <section className={`dock tl glass${playing ? " playing" : ""}`} aria-label="Timeline">
      {coach && (
        <Coach
          onClose={dismiss}
          onPlay={() => {
            dismiss();
            actions.stop();
            actions.setYear(MIN_YEAR);
            actions.play();
          }}
        />
      )}

      <div className="tl-head">
        <PlayButton
          year={year}
          playing={playing}
          onPress={() => {
            dismiss();
            actions.togglePlay();
          }}
        />

        <div className="tl-read">
          <div className="tl-year" id="yearOut" aria-live="off">
            {shownYear}
          </div>
          <div className="tl-meta">
            <div className="tl-era">
              <span className="ch" title={`Chapter ${eraIdx + 1} of ${ERAS.length}`}>
                {roman(eraIdx + 1)}
              </span>
              <span id="eraOut" key={era.name}>
                {era.name}
              </span>
            </div>
            <div className="tl-sub">
              <span className="tl-census" id="popOut">
                {censusLine(year, CENSUS)}
              </span>
              <span className="tl-count" id="countOut">
                {shown} of {list.length} sites by {year}
              </span>
              <span className="tl-count-phone" id="countOutPhone" aria-hidden="true">
                {shown} of {list.length} sites
              </span>
            </div>
          </div>
        </div>

        <div className="tl-nav">
          <button
            className="tl-step prev"
            type="button"
            disabled={!prev}
            aria-label={prev ? `Previous event: ${prev.year}, ${prev.title}` : "Previous event"}
            title="Previous event (←)"
            onClick={() => go(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            className="tl-step next"
            type="button"
            disabled={!next}
            aria-label={next ? `Next event: ${next.year}, ${next.title}` : "Next event"}
            title="Next event (→)"
            onClick={() => go(1)}
          >
            {next && (
              <span className="lbl" aria-hidden="true">
                <small>Next · {next.year}</small>
                <b>{next.title}</b>
              </span>
            )}
            <ChevronRight />
          </button>
          <button
            className="tl-speed"
            type="button"
            aria-label={`Playback speed ${speed}x`}
            title="Playback speed"
            onClick={() => actions.setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1)}
          >
            <span className="bars" aria-hidden="true" data-speed={speed}>
              <i />
              <i />
              <i />
            </span>
            {speed}×
          </button>
        </div>
      </div>

      <Scrubber
        year={year}
        playing={playing}
        selectedId={selectedId}
        hoverId={hoverId}
        filter={f}
        shown={shown}
        stepMs={Math.round(PLAY_STEP_MS / speed)}
      />
    </section>
  );
}
