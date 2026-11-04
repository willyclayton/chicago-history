import { CATEGORIES, SITES } from "../data";
import { actions, useStore } from "../state/store";

const COUNTS = Object.fromEntries(CATEGORIES.map((c) => [c.id, SITES.filter((s) => s.category === c.id).length]));

export function Chips() {
  const cats = useStore((s) => s.cats);
  const all = cats.size === CATEGORIES.length;
  return (
    <nav className="chips" id="chips" aria-label="Filter by theme">
      <button
        className="chip"
        type="button"
        data-cat="all"
        aria-pressed={all}
        style={{ ["--cc" as string]: "var(--ink)" }}
        onClick={() => actions.tapCategory("all")}
      >
        <span className="dot" />
        All themes
      </button>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          className="chip"
          type="button"
          data-cat={c.id}
          aria-pressed={cats.has(c.id)}
          style={{ ["--cc" as string]: `var(--c-${c.id})` }}
          onClick={() => actions.tapCategory(c.id)}
        >
          <span className="dot" />
          {c.name}
          <span className="n">{COUNTS[c.id]}</span>
        </button>
      ))}
    </nav>
  );
}
