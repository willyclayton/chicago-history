import { actions, useStore } from "../state/store";
import { starPath } from "../map/starIcon";
import { CATEGORIES } from "../data";

export function Legend() {
  const shore = useStore((s) => s.showShoreline);
  return (
    <details className="legend" id="legend">
      <summary>Map key</summary>
      <div className="items">
        {CATEGORIES.map((c) => (
          <div key={c.id}>
            <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
              <path d={starPath(7)} fill={`var(--c-${c.id})`} stroke="var(--panel)" strokeWidth="1.2" />
            </svg>
            {c.name}
          </div>
        ))}
        <div>
          <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
            <circle r="8" fill="none" stroke="var(--red)" strokeWidth="1.5" />
            <path d={starPath(5.6)} fill="var(--ink)" />
          </svg>
          Star on the city flag
        </div>
        <div>
          <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
            <circle r="7" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity=".6" />
            <circle r="3" fill="var(--ink)" />
          </svg>
          Happened in the 10 years before the slider
        </div>
        <div>
          <svg width="18" height="12" aria-hidden="true">
            <defs>
              <pattern id="hatchLg" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="1.6" height="4" fill="var(--red)" opacity=".5" />
              </pattern>
            </defs>
            <rect width="18" height="12" fill="url(#hatchLg)" stroke="var(--red)" strokeDasharray="3 2" />
          </svg>
          Burned in 1871 (shows 1871 to 1874)
        </div>
        <label>
          <input type="checkbox" checked={shore} onChange={(e) => actions.setShoreline(e.target.checked)} />
          <svg width="18" height="12" aria-hidden="true">
            <line x1="0" y1="6" x2="18" y2="6" stroke="var(--ink)" strokeDasharray="3 3" opacity=".6" />
          </svg>
          Lake shoreline in the 1830s
        </label>
      </div>
    </details>
  );
}
