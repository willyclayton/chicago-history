import { useLayoutEffect, useRef, useState } from "react";
import { MAX_YEAR, MIN_YEAR, SITE_BY_ID, SITES } from "../data";
import { actions, filtered, getState, useStore, type Detent } from "../state/store";
import { Chips } from "./Chips";
import { FlagMark, KeyboardIcon, MoonIcon, SearchIcon, SunIcon } from "./Icons";
import { ListView } from "./SiteList";
import { StoryView } from "./StoryCard";
import { nearestDetent, rubberBand, sheetHeight } from "./sheet";
import { useDark, useWide } from "./useMedia";
import "./panel.css";

/** How the view that just mounted arrived: from the list, back to it, or along the timeline. */
function useDirection(selectedId: string | null): string {
  const prev = useRef<string | null>(selectedId);
  const dir = useRef("");
  if (prev.current !== selectedId) {
    const a = prev.current && SITE_BY_ID[prev.current];
    const b = selectedId && SITE_BY_ID[selectedId];
    dir.current = !b ? "back" : !a ? "enter" : b.year < a.year || (b.year === a.year && b.title < a.title) ? "prev" : "next";
    prev.current = selectedId;
  }
  return dir.current;
}

/**
 * One panel, two screens: the site list and a site's story. On desktop it's a floating
 * sidebar; on phones it's a bottom sheet you can drag between three heights.
 */
export function Panel() {
  const wide = useWide();
  const selectedId = useStore((s) => s.selectedId);
  const sheet = useStore((s) => s.sheet);
  const ref = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const dir = useDirection(selectedId);
  const hasSel = !!selectedId;

  const setVar = (px: number) => {
    const app = document.querySelector<HTMLElement>(".app");
    if (app) app.style.setProperty("--sheet-h", `${Math.round(px)}px`);
  };

  // keep the --sheet-h variable in sync for the map chrome that sits above the sheet
  useLayoutEffect(() => {
    const apply = () => setVar(sheetHeight(getState().sheet));
    apply();
    addEventListener("resize", apply);
    return () => removeEventListener("resize", apply);
  }, [sheet, hasSel]);

  // drag to resize (phone)
  const drag = useRef<{ y: number; h: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (wide || e.button > 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("input,a,button:not(.handle),.chips")) return;
    drag.current = { y: e.clientY, h: sheetHeight(getState().sheet), lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    const h = rubberBand(d.h - dy);
    ref.current.style.height = `${h}px`;
    setVar(h);
    const dt = Math.max(1, e.timeStamp - d.lastT);
    // smoothed velocity in px/ms, + = growing
    d.v = 0.6 * (-(e.clientY - d.lastY) / dt) + 0.4 * d.v;
    d.lastT = e.timeStamp;
    d.lastY = e.clientY;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !ref.current) return;
    setDragging(false);
    if (!d.moved) {
      // tap on the handle cycles the sheet
      if ((e.target as HTMLElement).closest(".handle")) {
        const next: Record<Detent, Detent> = { peek: "half", half: "full", full: "peek" };
        actions.setSheet(next[getState().sheet]);
      }
      return;
    }
    const h = ref.current.offsetHeight;
    // a stale velocity (finger held still before release) doesn't count as a flick
    const v = e.timeStamp - d.lastT > 80 ? 0 : d.v;
    ref.current.style.height = "";
    const to = nearestDetent(h, v);
    actions.setSheet(to);
    setVar(sheetHeight(to));
  };
  const dragProps = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  const label: Record<Detent, string> = { peek: "collapsed", half: "half height", full: "full height" };

  return (
    <section
      ref={ref}
      id="panel"
      className={["panel glass", !wide && sheet, dragging && "dragging", selectedId ? "is-story" : "is-list"].filter(Boolean).join(" ")}
      aria-label={selectedId ? "Story" : "Browse sites"}
    >
      {!wide && (
        <button
          className="handle"
          type="button"
          aria-label={`Resize panel (now ${label[sheet]})`}
          title="Drag, or tap to resize"
          {...dragProps}
        />
      )}
      {(wide || !selectedId) && (
        <div className="panel-top" {...dragProps}>
          <Brand />
          <Search />
          <Chips />
        </div>
      )}
      <div className="panel-body">
        {selectedId ? (
          <StoryView key={selectedId} anim={dir} dragProps={dragProps} />
        ) : (
          <ListView anim={dir} />
        )}
      </div>
    </section>
  );
}

function Brand() {
  const dark = useDark();
  return (
    <div className="brand">
      <button type="button" className="title" onClick={() => actions.clear()} aria-label="Chicago Time Map, all sites">
        <FlagMark className="flagmark" />
        <span className="name">
          Chicago Time Map
          <small>
            {SITES.length} places · {MIN_YEAR} to {MAX_YEAR}
          </small>
        </span>
      </button>
      <div className="tools">
        <button
          className="iconbtn"
          type="button"
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={dark ? "Light mode (T)" : "Dark mode (T)"}
          onClick={() => actions.setTheme(dark ? "light" : "dark")}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button className="iconbtn" type="button" aria-label="Keyboard shortcuts" title="Shortcuts (?)" onClick={() => actions.setHelp(true)}>
          <KeyboardIcon />
        </button>
      </div>
    </div>
  );
}

function Search() {
  const raw = useStore((s) => s.queryRaw);
  const query = useStore((s) => s.query);
  const cats = useStore((s) => s.cats);
  const wide = useWide();
  const n = query ? filtered({ cats, query }).length : 0;
  return (
    <div className={"search" + (raw ? " has" : "")} role="search">
      <SearchIcon />
      <input
        type="search"
        id="q"
        placeholder="Search places, people, streets"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-label="Search sites"
        aria-controls="list"
        value={raw}
        onFocus={() => !wide && getState().sheet !== "full" && actions.setSheet("full")}
        onInput={(e) => {
          if (getState().selectedId) actions.clear();
          actions.setQuery((e.target as HTMLInputElement).value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const first = document.querySelector<HTMLButtonElement>("#list button[data-id]");
            first?.click();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            document.querySelector<HTMLButtonElement>("#list button[data-id]")?.focus();
          } else if (e.key === "Escape") {
            if (raw) actions.setQuery("");
            else (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }
        }}
      />
      <span className="right">
        {raw ? (
          <>
            <span className={"qn" + (n ? "" : " none")} aria-hidden="true">
              {n}
            </span>
            <button
              className="clear"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                actions.setQuery("");
                document.getElementById("q")?.focus();
              }}
            >
              ✕
            </button>
          </>
        ) : (
          wide && (
            <span className="kbd" aria-hidden="true">
              /
            </span>
          )
        )}
      </span>
    </div>
  );
}
