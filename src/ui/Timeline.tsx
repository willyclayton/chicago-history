import { CENSUS, ERAS, MAX_YEAR, MIN_YEAR, ORDERED } from "../data";
import { censusLine } from "../lib/census";
import { eraOf } from "../lib/eras";
import { actions, matches, useStore } from "../state/store";

const pct = (y: number) => ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
const TICKS = [1780, 1850, 1900, 1950, MAX_YEAR];

export function Timeline() {
  const year = useStore((s) => s.year);
  const playing = useStore((s) => s.playing);
  const selectedId = useStore((s) => s.selectedId);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);

  return (
    <section className="timebar" aria-label="Timeline">
      <div className="readout">
        <div className="year" id="yearOut" aria-live="off">
          {year}
        </div>
        <div className="yearmeta">
          <span className="era" id="eraOut">
            {eraOf(year, ERAS).name}
          </span>
          <span id="popOut">{censusLine(year, CENSUS)}</span>
        </div>
        <div className="ctrls">
          <button
            className="btn icon"
            type="button"
            aria-label="Previous event"
            onClick={() => {
              actions.stop();
              actions.step(-1);
            }}
          >
            ‹
          </button>
          <button
            className={"btn" + (playing ? " on" : "")}
            id="play"
            type="button"
            aria-pressed={playing}
            onClick={() => actions.togglePlay()}
          >
            {playing ? "❚❚" : "▶"}
            <span className="lbltxt">{playing ? "Pause" : "Play"}</span>
          </button>
          <button
            className="btn icon"
            type="button"
            aria-label="Next event"
            onClick={() => {
              actions.stop();
              actions.step(1);
            }}
          >
            ›
          </button>
        </div>
      </div>
      <div className="slider">
        <div className="evts" aria-hidden="true">
          {ORDERED.map((s) => {
            const cls = [!matches(s, { cats, query }) && "off", s.year > year && "later", s.id === selectedId && "sel"]
              .filter(Boolean)
              .join(" ");
            return (
              <i
                key={s.id}
                data-id={s.id}
                className={cls || undefined}
                style={{ left: `${pct(s.year)}%`, background: `var(--c-${s.category})` }}
              />
            );
          })}
        </div>
        <div className="eras" aria-hidden="true">
          {ERAS.map((e, i) => (
            <span
              key={e.from}
              title={e.name}
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
          aria-valuetext={`${year}, ${eraOf(year, ERAS).name}`}
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
    </section>
  );
}
