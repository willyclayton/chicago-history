import { MIN_YEAR } from "../../data";
import { CloseIcon, PlayIcon } from "../Icons";
import { useWide } from "../useMedia";
import { FlagStar, ScrubGlyph, TapGlyph } from "./glyphs";

interface Props {
  onPlay: () => void;
  onClose: () => void;
}

/** First-visit tip: the three gestures that unlock the app, in one glance. */
export function Coach({ onPlay, onClose }: Props) {
  const wide = useWide();
  const steps = [
    { icon: <PlayIcon />, title: "Play", text: "Watch the city grow, year by year" },
    { icon: <ScrubGlyph />, title: "Drag the star", text: "Scrub to any year. Ticks are events" },
    { icon: wide ? <FlagStar /> : <TapGlyph />, title: wide ? "Click a star" : "Tap a star", text: "Open the story of that spot" },
  ];
  return (
    <div className="tl-coach" role="dialog" aria-labelledby="coachTitle" aria-describedby="coachSteps">
      <button type="button" className="x" aria-label="Close tip" onClick={onClose}>
        <CloseIcon />
      </button>
      <p className="kick">Welcome</p>
      <h2 id="coachTitle">
        {Math.round((new Date().getFullYear() - MIN_YEAR) / 10) * 10} years of Chicago, three moves
      </h2>
      <ol id="coachSteps">
        {steps.map((s, i) => (
          <li key={s.title} style={{ "--i": i } as React.CSSProperties}>
            <span className="ico">{s.icon}</span>
            <b>{s.title}</b>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="go" onClick={onPlay}>
          <PlayIcon /> Play from {MIN_YEAR}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          I'll explore
        </button>
      </div>
    </div>
  );
}
