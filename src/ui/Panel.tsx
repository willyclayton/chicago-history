import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { actions, getState, useStore, type Detent } from "../state/store";
import { Chips } from "./Chips";
import { KeyboardIcon, MoonIcon, SearchIcon, SunIcon } from "./Icons";
import { ListView } from "./SiteList";
import { StoryView } from "./StoryCard";
import { nearestDetent, sheetHeight } from "./sheet";
import { useDark, useWide } from "./useMedia";

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
  const prevSel = useRef<string | null>(selectedId);
  const dir = selectedId && !prevSel.current ? "enter" : !selectedId && prevSel.current ? "back" : selectedId ? "enter" : "";
  useEffect(() => {
    prevSel.current = selectedId;
  }, [selectedId]);

  // keep the --sheet-h variable in sync for the map chrome that sits above the sheet
  useLayoutEffect(() => {
    const apply = () => {
      const app = document.querySelector<HTMLElement>(".app");
      if (app) app.style.setProperty("--sheet-h", `${sheetHeight(getState().sheet)}px`);
    };
    apply();
    addEventListener("resize", apply);
    return () => removeEventListener("resize", apply);
  }, [sheet]);

  // drag to resize (phone)
  const drag = useRef<{ y: number; h: number; t: number; lastY: number; lastT: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (wide) return;
    const t = e.target as HTMLElement;
    if (t.closest("input,a,.chip,.iconbtn,.back,.clear")) return;
    drag.current = { y: e.clientY, h: sheetHeight(getState().sheet), t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    const h = Math.max(120, Math.min(innerHeight - 60, d.h - dy));
    ref.current.style.height = `${h}px`;
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
    const v = -(e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT); // px/ms, + = growing
    ref.current.style.height = "";
    actions.setSheet(nearestDetent(h, v));
  };
  const dragProps = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  return (
    <section
      ref={ref}
      id="panel"
      className={["panel glass", !wide && sheet, dragging && "dragging", selectedId ? "is-story" : "is-list"].filter(Boolean).join(" ")}
      aria-label={selectedId ? "Story" : "Browse sites"}
    >
      {!wide && (
        <button className="handle" type="button" aria-label={`Resize panel (now ${sheet})`} {...dragProps} />
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
      <button type="button" className="title" onClick={() => actions.clear()} title="Back to all sites">
        <span className="star" aria-hidden="true">
          ✶
        </span>
        Chicago Time Map
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
  const wide = useWide();
  return (
    <div className="search" role="search">
      <SearchIcon />
      <input
        type="search"
        id="q"
        placeholder="Search places, people, streets"
        autoComplete="off"
        spellCheck={false}
        aria-label="Search sites"
        aria-controls="list"
        value={raw}
        onFocus={() => !wide && getState().sheet !== "full" && actions.setSheet("full")}
        onChange={(e) => actions.setQuery(e.target.value)}
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
          <button className="clear" type="button" aria-label="Clear search" onClick={() => actions.setQuery("")}>
            ✕
          </button>
        ) : (
          wide && <span className="kbd" aria-hidden="true">/</span>
        )}
      </span>
    </div>
  );
}
