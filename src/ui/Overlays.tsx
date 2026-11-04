import { useEffect, useRef } from "react";
import { actions, useStore } from "../state/store";
import { CloseIcon } from "./Icons";

const KEYS: [string[], string][] = [
  [["/"], "Search"],
  [["Space"], "Play or pause the timeline"],
  [["←", "→"], "Previous or next site"],
  [["R"], "Random site"],
  [["T"], "Light or dark mode"],
  [["Esc"], "Back to the list"],
  [["?"], "This list"],
];

export function Help() {
  const open = useStore((s) => s.helpOpen);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) close.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && actions.setHelp(false)}>
      <div className="help" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
        <h2 id="helpTitle">
          Shortcuts
          <button ref={close} className="iconbtn" type="button" aria-label="Close" onClick={() => actions.setHelp(false)}>
            <CloseIcon />
          </button>
        </h2>
        <dl>
          {KEYS.map(([k, d]) => (
            <div key={d} style={{ display: "contents" }}>
              <dt>
                {k.map((x) => (
                  <span className="kbd" key={x}>
                    {x}
                  </span>
                ))}
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
        <p>On a phone: drag the sheet up and down, and swipe a story's header left or right to move through time.</p>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.seq}>
      {toast.text}
    </div>
  );
}
