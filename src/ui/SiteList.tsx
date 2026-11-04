import { CATEGORY_NAME, ERAS, MAX_YEAR, ORDERED, SITES } from "../data";
import { actions, filtered, useStore } from "../state/store";
import { isWide, prefersReducedMotion } from "./media";

export function SiteList() {
  const year = useStore((s) => s.year);
  const selectedId = useStore((s) => s.selectedId);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const queryRaw = useStore((s) => s.queryRaw);
  const visible = filtered({ cats, query });
  const visibleIds = new Set(visible.map((s) => s.id));

  const pick = (id: string) => {
    actions.stop();
    actions.select(id, { pan: true, open: true });
    if (!isWide())
      document.getElementById("mapwrap")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  };

  return (
    <aside className="browse" aria-label="Browse sites">
      <div className="browse-head">
        <h2>
          Sites{" "}
          <span id="listCount">
            {visible.length} of {SITES.length}
          </span>
        </h2>
        <input
          type="search"
          id="q"
          placeholder="Search places, people, streets"
          autoComplete="off"
          aria-label="Search sites"
          value={queryRaw}
          onChange={(e) => actions.setQuery(e.target.value)}
        />
      </div>
      <div className="listwrap">
        <ol className="list" id="list">
          {ERAS.map((era) => {
            const rows = ORDERED.filter((s) => s.year >= era.from && s.year <= era.to && visibleIds.has(s.id));
            if (!rows.length) return null;
            return [
              <li className="eh" key={"era-" + era.from}>
                {era.name}
                <b>
                  {era.from}–{Math.min(era.to, MAX_YEAR)}
                </b>
              </li>,
              ...rows.map((s) => (
                <li key={s.id} data-row={s.id}>
                  <button
                    type="button"
                    data-id={s.id}
                    className={[s.year > year && "later", s.id === selectedId && "sel"].filter(Boolean).join(" ") || undefined}
                    aria-current={s.id === selectedId ? "true" : undefined}
                    style={{ ["--cc" as string]: `var(--c-${s.category})` }}
                    onClick={() => pick(s.id)}
                  >
                    <span className="y">{s.year}</span>
                    <span className="d" />
                    <span className="t">
                      {s.title}
                      <small>
                        {s.date} · {CATEGORY_NAME[s.category]}
                      </small>
                    </span>
                  </button>
                </li>
              )),
            ];
          })}
          {visible.length === 0 && (
            <li className="empty" id="empty">
              No sites match. Try another search or turn more themes on.
            </li>
          )}
        </ol>
      </div>
    </aside>
  );
}
