import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../state/store";
import { CloseIcon } from "./Icons";
import { FlagStar, MiniFlag, ReplayGlyph } from "./timeline/glyphs";
import { TOUR_EVENT } from "./Timeline";
import { useWide } from "./useMedia";
import "./timeline.css";

type Row = [keys: string[], what: string];

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Travel in time",
    rows: [
      [["Space"], "Play or pause"],
      [["←", "→"], "Previous or next site"],
    ],
  },
  {
    title: "Find a story",
    rows: [
      [["/"], "Search"],
      [["↑", "↓"], "Move through the list (Home and End jump)"],
      [["Enter"], "Open the highlighted site"],
      [["R"], "Random site"],
      [["Esc"], "Back to the list"],
    ],
  },
  {
    title: "View",
    rows: [
      [["T"], "Light or dark mode"],
      [["?"], "This sheet"],
    ],
  },
];

const POINTER: string[] = [
  "Drag the star on the timeline; it settles on events as it passes them",
  "Hover the timeline to read the year and population",
  "Click a tick or an era to jump there",
];
const TOUCH: string[] = [
  "Drag the star on the timeline to travel through time",
  "Drag the sheet up and down; tap the handle to resize",
  "Swipe a story's header left or right to move through time",
];

export function Help() {
  const open = useStore((s) => s.helpOpen);
  const wide = useWide();
  const close = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    close.current?.focus();
    // keep Tab inside the sheet
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !box.current) return;
      const f = box.current.querySelectorAll<HTMLElement>("button");
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);
  if (!open) return null;
  const gestures = (
    <section className="gest">
      <h3>{wide ? "With a mouse" : "With your thumb"}</h3>
      <ul>
        {(wide ? POINTER : TOUCH).map((t) => (
          <li key={t}>
            <FlagStar />
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="tl-scrim" onClick={(e) => e.target === e.currentTarget && actions.setHelp(false)}>
      <div className="tl-help" ref={box} role="dialog" aria-modal="true" aria-labelledby="helpTitle">
        <header>
          <MiniFlag className="flag" />
          <h2 id="helpTitle">Shortcuts</h2>
          <button ref={close} className="x" type="button" aria-label="Close" onClick={() => actions.setHelp(false)}>
            <CloseIcon />
          </button>
        </header>
        {!wide && gestures}
        <div className="groups">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map(([k, d]) => (
                  <div key={d} className="r">
                    <dt>
                      {k.map((x) => (
                        <kbd key={x}>{x}</kbd>
                      ))}
                    </dt>
                    <dd>{d}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        {wide && gestures}
        <footer>
          <button
            type="button"
            className="tour"
            onClick={() => {
              actions.setHelp(false);
              dispatchEvent(new Event(TOUR_EVENT));
            }}
          >
            <ReplayGlyph /> Show the welcome tip again
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [gone, setGone] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setGone(toast.seq), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  const live = toast && gone !== toast.seq;
  return (
    <div className="tl-toastzone" role="status" aria-live="polite">
      {live && (
        <div className="tl-toast" key={toast.seq}>
          <FlagStar />
          {toast.text}
        </div>
      )}
    </div>
  );
}
