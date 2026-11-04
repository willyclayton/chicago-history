import { useEffect, useRef } from "react";
import { CATEGORY_NAME, ERAS, MAX_YEAR, ORDERED, SITES } from "../data";
import { actions, filtered, getState, useStore } from "../state/store";
import { ChevronRight, ShuffleIcon } from "./Icons";
import { isWide } from "./media";

let savedScroll = 0;
let lastSelected: string | null = null;
/** The list focuses this row when you come back to it. */
export const rememberSelection = (id: string) => (lastSelected = id);

export function ListView({ anim }: { anim: string }) {
  const year = useStore((s) => s.year);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const hoverId = useStore((s) => s.hoverId);
  const ref = useRef<HTMLDivElement>(null);
  const visible = filtered({ cats, query });
  const visibleIds = new Set(visible.map((s) => s.id));
  const filteredOut = SITES.length - visible.length;

  // come back to where you were in the list
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = savedScroll;
    if (lastSelected && isWide()) {
      const last = document.querySelector<HTMLElement>(`#list [data-id="${lastSelected}"]`);
      last?.focus({ preventScroll: true });
      last?.scrollIntoView({ block: "nearest" });
    }
    const save = () => (savedScroll = el.scrollTop);
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [query]);

  const pick = (id: string) => {
    actions.stop();
    lastSelected = id;
    actions.select(id, { pan: true, sheet: isWide() ? undefined : "half" });
  };

  return (
    <div ref={ref} className={"view list-view " + anim}>
      <div className="listhead">
        <span id="listCount" aria-live="polite">
          {visible.length === SITES.length ? `${SITES.length} sites` : `${visible.length} of ${SITES.length} sites`}
        </span>
        <button type="button" onClick={() => actions.random()} title="Open a random site (R)">
          <ShuffleIcon className="i" /> Surprise me
        </button>
      </div>
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
                  className={[s.year > year && "later", s.id === hoverId && "hov"].filter(Boolean).join(" ") || undefined}
                  style={{ ["--cc" as string]: `var(--c-${s.category})` }}
                  onClick={() => pick(s.id)}
                  onMouseEnter={() => actions.hover(s.id)}
                  onMouseLeave={() => getState().hoverId === s.id && actions.hover(null)}
                  onFocus={() => actions.hover(s.id)}
                  onBlur={() => getState().hoverId === s.id && actions.hover(null)}
                  onKeyDown={(e) => {
                    const all = [...document.querySelectorAll<HTMLButtonElement>("#list button[data-id]")];
                    const i = all.indexOf(e.currentTarget);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      all[i + 1]?.focus();
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (i === 0) document.getElementById("q")?.focus();
                      else all[i - 1]?.focus();
                    }
                  }}
                  aria-label={`${s.title}, ${s.date}, ${CATEGORY_NAME[s.category]}${s.year > year ? ", after the slider year" : ""}`}
                >
                  <span className="y">{s.year}</span>
                  <span className="d" />
                  <span className="t">
                    {s.title}
                    <small>
                      {s.date} · {CATEGORY_NAME[s.category]}
                    </small>
                  </span>
                  <ChevronRight className="go" />
                </button>
              </li>
            )),
          ];
        })}
        {visible.length === 0 && (
          <li className="empty" id="empty">
            No sites match. Try another search or turn more themes on.
            <button
              type="button"
              onClick={() => {
                actions.setQuery("");
                actions.tapCategory("all");
              }}
            >
              Clear filters
            </button>
          </li>
        )}
        {visible.length > 0 && filteredOut > 0 && (
          <li className="empty">
            <button
              type="button"
              onClick={() => {
                actions.setQuery("");
                actions.tapCategory("all");
              }}
            >
              Show all {SITES.length} sites
            </button>
          </li>
        )}
      </ol>
    </div>
  );
}

