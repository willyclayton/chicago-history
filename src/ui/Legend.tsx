import { actions, useStore } from "../state/store";
import { starPath } from "../map/starIcon";
import { setMapUi, useMapUi } from "../map/mapUi";
import { CATEGORIES, SITES } from "../data";
import { LayersIcon } from "./Icons";

const Star = ({ fill, r = 7 }: { fill: string; r?: number }) => (
  <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
    <path d={starPath(r)} fill={fill} stroke="var(--panel)" strokeWidth="1.2" />
  </svg>
);

/**
 * The map key: theme colors (which double as quick filters and preview their markers on
 * hover), what the marker rings mean, and switches for the historic overlays.
 */
export function Legend() {
  const shore = useStore((s) => s.showShoreline);
  const year = useStore((s) => s.year);
  const cats = useStore((s) => s.cats);
  const burnPinned = useMapUi((s) => s.burnPinned);
  const all = cats.size === CATEGORIES.length;
  const preview = (id: (typeof CATEGORIES)[number]["id"] | null) => setMapUi({ focusCat: id });

  return (
    <details
      className="legend glass"
      id="legend"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open) preview(null);
      }}
    >
      <summary>
        <LayersIcon className="ic" />
        Map key
        <span className="swatches" aria-hidden="true">
          {CATEGORIES.map((c) => (
            <i key={c.id} style={{ "--cc": `var(--c-${c.id})` } as React.CSSProperties} />
          ))}
        </span>
        <svg className="chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="body">
        <section>
          <h3>
            Themes
            {!all && (
              <button type="button" onClick={() => actions.tapCategory("all")}>
                Show all
              </button>
            )}
          </h3>
          <div className="rows" onMouseLeave={() => preview(null)}>
            {CATEGORIES.map((c) => {
              const n = SITES.filter((s) => s.category === c.id && s.year <= year).length;
              const on = cats.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="row"
                  aria-pressed={on}
                  title={all ? `Show only ${c.name}` : on ? `Hide ${c.name}` : `Add ${c.name}`}
                  onClick={() => actions.tapCategory(c.id)}
                  onMouseEnter={() => on && preview(c.id)}
                  onFocus={() => on && preview(c.id)}
                  onBlur={() => preview(null)}
                >
                  <Star fill={`var(--c-${c.id})`} />
                  {c.name}
                  <span className="n" aria-label={`${n} sites by ${year}`}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section>
          <h3>Markers</h3>
          <div className="rows">
            <div className="row">
              <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
                <circle r="8" fill="none" stroke="var(--red)" strokeWidth="1.5" />
                <path d={starPath(5.4)} fill="var(--ink)" />
              </svg>
              One of the four stars on the city flag
            </div>
            <div className="row">
              <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
                <circle r="7.5" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity=".55" />
                <path d={starPath(4.6)} fill="var(--ink)" />
              </svg>
              Happened in the 10 years before the slider
            </div>
            <div className="row">
              <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
                <circle r="8.2" fill="var(--ink)" />
                <text y="3.6" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--panel)" fontFamily="var(--body)">
                  5
                </text>
              </svg>
              Several sites close together: click to zoom
            </div>
          </div>
        </section>
        <section>
          <h3>Then and now</h3>
          <div className="rows">
            <button type="button" className="row" role="switch" aria-checked={shore} onClick={() => actions.setShoreline(!shore)}>
              <svg width="18" height="12" aria-hidden="true">
                <line x1="1" y1="6" x2="17" y2="6" stroke="var(--river)" strokeWidth="1.8" strokeDasharray="3 3" strokeLinecap="round" />
              </svg>
              Lake shoreline in the 1830s
              <span className="sw" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="row"
              role="switch"
              aria-checked={burnPinned}
              onClick={() => setMapUi({ burnPinned: !burnPinned })}
            >
              <svg width="18" height="12" aria-hidden="true">
                <defs>
                  <pattern id="hatchLg" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="1.6" height="4" fill="var(--red)" opacity=".55" />
                  </pattern>
                </defs>
                <rect x=".5" y=".5" width="17" height="11" fill="url(#hatchLg)" stroke="var(--red)" strokeDasharray="3 2" />
              </svg>
              Area burned in 1871
              <span className="sw" aria-hidden="true" />
            </button>
            <p className="note">The burned area also shows on its own from 1871 to 1874.</p>
          </div>
        </section>
      </div>
    </details>
  );
}
