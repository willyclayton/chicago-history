import { useEffect, useRef, useState } from "react";
import { CATEGORIES, SITES } from "../data";
import { actions, useStore } from "../state/store";
import { CheckIcon, ChevronLeft, ChevronRight } from "./Icons";

const COUNTS = Object.fromEntries(CATEGORIES.map((c) => [c.id, SITES.filter((s) => s.category === c.id).length]));

/**
 * Theme filters: one horizontally scrolling row. With every theme on, the category chips
 * are quiet outlines; once you narrow down, the chosen ones fill with their color.
 */
export function Chips() {
  const cats = useStore((s) => s.cats);
  const all = cats.size === CATEGORIES.length;
  const ref = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => {
      const l = el.scrollLeft > 4;
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
    };
    on();
    el.addEventListener("scroll", on, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(on) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", on);
      ro?.disconnect();
    };
  }, []);

  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div className={"chipwrap" + (edge.l ? " l" : "") + (edge.r ? " r" : "")}>
      <nav
        ref={ref}
        className={"chips" + (all ? " all-on" : " narrowed")}
        id="chips"
        aria-label="Filter by theme"
        onWheel={(e) => {
          const el = ref.current;
          // a mouse wheel scrolls the row sideways
          if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
            el.scrollLeft += e.deltaY;
            e.preventDefault();
          }
        }}
      >
        <button
          className="chip chip-all"
          type="button"
          data-cat="all"
          aria-pressed={all}
          onClick={() => actions.tapCategory("all")}
        >
          All themes
        </button>
        {CATEGORIES.map((c) => {
          const on = cats.has(c.id);
          return (
            <button
              key={c.id}
              className="chip"
              type="button"
              data-cat={c.id}
              aria-pressed={on}
              title={all ? `Show only ${c.name}` : on ? `Hide ${c.name}` : `Add ${c.name}`}
              style={{ ["--cc" as string]: `var(--c-${c.id})` }}
              onClick={(e) => {
                actions.tapCategory(c.id);
                (e.currentTarget as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
            >
              <span className="dot">{on && !all && <CheckIcon />}</span>
              {c.name}
              <span className="n">{COUNTS[c.id]}</span>
            </button>
          );
        })}
      </nav>
      <button type="button" className="chipnav prev" tabIndex={-1} aria-hidden="true" onClick={() => by(-1)}>
        <ChevronLeft />
      </button>
      <button type="button" className="chipnav next" tabIndex={-1} aria-hidden="true" onClick={() => by(1)}>
        <ChevronRight />
      </button>
    </div>
  );
}
