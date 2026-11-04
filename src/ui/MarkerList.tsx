import { ORDERED } from "../data";
import { actions, matches, useStore } from "../state/store";

/** Keyboard and screen reader access to the markers currently on the map. */
export function MarkerList() {
  const year = useStore((s) => s.year);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const open = useStore((s) => s.cardOpen);
  const shown = ORDERED.filter((s) => s.year <= year && matches(s, { cats, query }));
  return (
    <ul className="mklist" aria-label="Sites on the map">
      {shown.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            aria-label={`${s.title}, ${s.date}`}
            onClick={() => {
              actions.stop();
              actions.select(s.id, { pan: true, open });
            }}
          >
            {s.title}, {s.date}
          </button>
        </li>
      ))}
    </ul>
  );
}
