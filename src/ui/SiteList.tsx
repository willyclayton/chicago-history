import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_NAME, ERAS, MAX_YEAR, ORDERED, SITE_BY_ID, SITES } from "../data";
import { norm } from "../lib/filters";
import { actions, filtered, getState, matches, useStore } from "../state/store";
import type { Site } from "../types";
import { ClockIcon, ShuffleIcon, StarIcon } from "./Icons";
import { isWide } from "./media";
import { didYouMean, getRecent, Hl, plural, snippet } from "./panelUtil";

let savedScroll = 0;
let lastSelected: string | null = null;
/** The list focuses this row when you come back to it. */
export const rememberSelection = (id: string) => (lastSelected = id);

const SUGGESTIONS = ["Fire", "Capone", "Blues", "Lake", "Skyscraper", "Cubs"];

const resetFilters = () => {
  actions.setQuery("");
  actions.tapCategory("all");
};

function pick(id: string) {
  actions.stop();
  lastSelected = id;
  actions.select(id, { pan: true, sheet: isWide() ? undefined : "half" });
}

/** Hover and focus a site to preview it on the map. */
const preview = (id: string) => ({
  onMouseEnter: () => actions.hover(id),
  onMouseLeave: () => getState().hoverId === id && actions.hover(null),
  onFocus: () => actions.hover(id),
  onBlur: () => getState().hoverId === id && actions.hover(null),
});

export function ListView({ anim }: { anim: string }) {
  const year = useStore((s) => s.year);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const queryRaw = useStore((s) => s.queryRaw);
  const hoverId = useStore((s) => s.hoverId);
  const ref = useRef<HTMLDivElement>(null);
  const [recent] = useState(getRecent);
  const visible = filtered({ cats, query });
  const visibleIds = new Set(visible.map((s) => s.id));
  const allCats = cats.size === CATEGORIES.length;
  const byYear = visible.filter((s) => s.year <= year).length;
  const scrubbed = year < MAX_YEAR;

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

  const jumpToNow = () => {
    const el = document.querySelector<HTMLElement>("#list .nowline");
    el?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const onRowKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const all = [...document.querySelectorAll<HTMLButtonElement>("#list button[data-id]")];
    const i = all.indexOf(e.currentTarget);
    const to = (k: number) => {
      e.preventDefault();
      all[Math.max(0, Math.min(all.length - 1, k))]?.focus();
    };
    if (e.key === "ArrowDown") to(i + 1);
    else if (e.key === "ArrowUp") {
      if (i === 0) {
        e.preventDefault();
        document.getElementById("q")?.focus();
      } else to(i - 1);
    } else if (e.key === "Home") to(0);
    else if (e.key === "End") to(all.length - 1);
    else if (e.key === "PageDown") to(i + 8);
    else if (e.key === "PageUp") to(i - 8);
  };

  // the timeline marker sits before the first visible site after the slider year
  const firstLater = scrubbed ? visible.find((s) => s.year > year)?.id : undefined;
  const showRecent = !query && recent.length > 0;

  return (
    <div ref={ref} className={"view list-view " + anim}>
      <div className="listhead">
        <div className="lh-count">
          <span id="listCount" aria-live="polite">
            {visible.length === SITES.length ? `${SITES.length} sites` : `${visible.length} of ${SITES.length} sites`}
          </span>
          {scrubbed && visible.length > 0 && (
            <button type="button" className="lh-now" onClick={jumpToNow} title="Scroll to the timeline year">
              {byYear} by {year}
            </button>
          )}
        </div>
        <button type="button" className="lh-btn" onClick={() => actions.random()} title="Open a random site (R)">
          <ShuffleIcon className="i" /> Surprise me
        </button>
      </div>

      {(!allCats || query) && visible.length > 0 && (
        <div className="filterbar">
          <span>
            {query ? (
              <>
                Matching “<b>{queryRaw.trim()}</b>”
              </>
            ) : null}
            {query && !allCats ? " in " : ""}
            {!allCats && (query ? plural(cats.size, "theme") : `Showing ${plural(cats.size, "theme")}`)}
          </span>
          <button type="button" onClick={resetFilters}>
            Clear
          </button>
        </div>
      )}

      {showRecent && (
        <section className="recent" aria-label="Recently viewed">
          <h3>
            <ClockIcon className="i" /> Recently viewed
          </h3>
          <div className="recent-row">
            {recent.map((id) => {
              const s = SITE_BY_ID[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="recent-card"
                  data-recent={id}
                  style={{ ["--cc" as string]: `var(--c-${s.category})` }}
                  onClick={() => pick(id)}
                  {...preview(id)}
                  aria-label={`${s.title}, ${s.year}`}
                >
                  <b>{s.year}</b>
                  <span>{s.short}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <ol className="list" id="list">
        {ERAS.map((era) => {
          const rows = ORDERED.filter((s) => s.year >= era.from && s.year <= era.to && visibleIds.has(s.id));
          if (!rows.length) return null;
          const to = Math.min(era.to, MAX_YEAR);
          const pct = Math.max(0, Math.min(1, (year - era.from + 1) / (to - era.from + 1)));
          const state = year < era.from ? "future" : year > to ? "past" : "now";
          return [
            <li className={"eh " + state} key={"era-" + era.from} style={{ ["--p" as string]: pct }}>
              <span className="eh-name">{era.name}</span>
              <span className="eh-meta">
                {state === "now" && scrubbed && <em>Timeline is here · </em>}
                {era.from}–{to}
                <span className="eh-n"> · {rows.length}</span>
              </span>
              <span className="eh-bar" aria-hidden="true" />
            </li>,
            ...rows.flatMap((s) => {
              const later = s.year > year;
              const snip = snippet(s, query);
              const row = (
                <li key={s.id} data-row={s.id} className={"row" + (later ? " later" : "")}>
                  <button
                    type="button"
                    data-id={s.id}
                    className={[later && "later", s.id === hoverId && "hov", s.id === lastSelected && "sel"].filter(Boolean).join(" ") || undefined}
                    style={{ ["--cc" as string]: `var(--c-${s.category})` }}
                    onClick={() => pick(s.id)}
                    {...preview(s.id)}
                    onKeyDown={onRowKey}
                    aria-label={`${s.title}, ${s.date}, ${CATEGORY_NAME[s.category]}${s.flagStar ? ", city flag star" : ""}${later ? ", after the slider year" : ""}`}
                  >
                    <span className="y">{s.year}</span>
                    <span className="d">{s.flagStar && <StarIcon />}</span>
                    <span className="t">
                      <span className="tt">
                        <Hl text={s.title} q={query} />
                      </span>
                      <small>
                        {s.date}
                        <span className="sep"> · </span>
                        {later ? <span className="rel">{plural(s.year - year, "yr")} after {year}</span> : CATEGORY_NAME[s.category]}
                      </small>
                      {snip && (
                        <span className="snip">
                          <i>{snip.field}</i> <Hl text={snip.text} q={query} />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
              return s.id === firstLater ? [<NowLine key="now" year={year} />, row] : [row];
            }),
          ];
        })}
        {visible.length === 0 && <Empty />}
        {visible.length > 0 && visible.length < SITES.length && (
          <li className="empty more">
            <button type="button" onClick={resetFilters}>
              Show all {SITES.length} sites
            </button>
          </li>
        )}
      </ol>
    </div>
  );
}

function NowLine({ year }: { year: number }) {
  return (
    <li className="nowline" aria-label={`Timeline is at ${year}. Sites below come later.`}>
      <span className="nl-year">{year}</span>
      <span className="nl-text">Timeline is here · later sites below</span>
    </li>
  );
}

function Empty() {
  const query = useStore((s) => s.query);
  const raw = useStore((s) => s.queryRaw).trim();
  const cats = useStore((s) => s.cats);
  const allCats = cats.size === CATEGORIES.length;
  // would the search find something with every theme on?
  const elsewhere: Site[] = !allCats ? ORDERED.filter((s) => matches(s, { cats: new Set(CATEGORIES.map((c) => c.id)), query })) : [];
  const guess = query && !elsewhere.length ? didYouMean(query) : null;
  const ideas = SUGGESTIONS.filter((w) => norm(w) !== query);
  return (
    <li className="empty" id="empty">
      <StarIcon className="empty-star" />
      <p>
        <b>No sites match{raw ? ` “${raw}”` : ""}.</b>
        <br />
        Try another search or turn more themes on.
      </p>
      {elsewhere.length > 0 && (
        <button type="button" className="primary" onClick={() => actions.tapCategory("all")}>
          Search all themes ({elsewhere.length} {elsewhere.length === 1 ? "match" : "matches"})
        </button>
      )}
      {guess && (
        <button type="button" className="primary" onClick={() => actions.setQuery(guess)}>
          Did you mean “{guess}”?
        </button>
      )}
      <div className="ideas" aria-label="Search ideas">
        {ideas.map((w) => (
          <button key={w} type="button" onClick={() => actions.setQuery(w)}>
            {w}
          </button>
        ))}
      </div>
      <button type="button" onClick={resetFilters}>
        Clear filters
      </button>
    </li>
  );
}
