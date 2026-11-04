import { ORDERED } from "../data";
import { peekSite } from "../map/MapView";
import { actions, matches, useStore } from "../state/store";

/**
 * Keyboard and screen reader access to the markers currently on the map. Tabbing onto a
 * marker previews it on the map (ring and hover card) and nudges it into view.
 */
export function MarkerList() {
  const year = useStore((s) => s.year);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const shown = ORDERED.filter((s) => s.year <= year && matches(s, { cats, query }));
  return (
    <ul className="mklist" aria-label="Sites on the map">
      {shown.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            aria-label={`${s.title}, ${s.date}`}
            style={{ "--cc": `var(--c-${s.category})` } as React.CSSProperties}
            onFocus={() => {
              actions.hover(s.id);
              peekSite(s.id);
            }}
            onBlur={() => actions.hover(null)}
            onClick={() => {
              actions.stop();
              actions.select(s.id, { pan: true });
            }}
          >
            <span className="dot" aria-hidden="true" />
            {s.title}, {s.date}
            <span className="hint" aria-hidden="true">
              {i + 1} of {shown.length} · Enter opens
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
