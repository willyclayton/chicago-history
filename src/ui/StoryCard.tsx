import { useEffect, useRef } from "react";
import { CATEGORY_NAME, ERAS, ORDERED, SITE_BY_ID } from "../data";
import { eraOf } from "../lib/eras";
import { mapsLink, streetViewEmbed, streetViewLink } from "../lib/links";
import { actions, matches, useStore } from "../state/store";
import { ChevronLeft, CloseIcon, ShareIcon, ShuffleIcon, StreetIcon } from "./Icons";
import { rememberSelection } from "./SiteList";
import { useWide } from "./useMedia";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY;

type DragProps = Record<string, (e: React.PointerEvent) => void>;

export function StoryView({ anim, dragProps }: { anim: string; dragProps: DragProps }) {
  const selectedId = useStore((s) => s.selectedId)!;
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const sheet = useStore((s) => s.sheet);
  const wide = useWide();
  const site = SITE_BY_ID[selectedId];
  const ref = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    rememberSelection(selectedId);
  }, [selectedId]);

  const vis = ORDERED.filter((s) => matches(s, { cats, query }) || s.id === site.id);
  const i = vis.indexOf(site);
  const prev = vis[i - 1];
  const next = vis[i + 1];
  // Street View loads only once the story is actually open (desktop, or the sheet raised)
  const open = wide || sheet !== "peek";
  const embed = open ? streetViewEmbed(site, KEY) : null;
  const go = (id: string) => {
    actions.stop();
    actions.select(id, { pan: true, setYear: true });
  };

  // horizontal swipe on the header steps between sites
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const t = dx < 0 ? next : prev;
      if (t) go(t.id);
    } else if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && !wide && sheet === "peek") {
      actions.setSheet("half");
    }
  };

  const share = async () => {
    const url = location.href;
    const data = { title: `${site.title} · Chicago Time Map`, text: `${site.year}: ${site.title}`, url };
    try {
      if (navigator.share && !wide) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        actions.toast("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div
      ref={ref}
      className={"view story " + anim}
      aria-live="polite"
      id="card"
      style={{ ["--cc" as string]: `var(--c-${site.category})` }}
    >
      <div className="story-bar" {...(wide ? {} : dragProps)}>
        <button ref={backRef} className="back" type="button" onClick={() => actions.clear()} aria-label="Back to all sites">
          <ChevronLeft className="i" width={20} height={20} />
          Sites
        </button>
        <div className="acts">
          <span className="pos" aria-label={`Site ${i + 1} of ${vis.length}`}>
            {i + 1} / {vis.length}
          </span>
          <button className="iconbtn" type="button" aria-label="Random site" title="Random site (R)" onClick={() => actions.random()}>
            <ShuffleIcon />
          </button>
          <button className="iconbtn" type="button" aria-label="Share this site" title="Share" onClick={share}>
            <ShareIcon />
          </button>
          <button className="iconbtn" type="button" aria-label="Close story" title="Close (Esc)" onClick={() => actions.clear()}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <header className="hero" onPointerDown={onSwipeStart} onPointerUp={onSwipeEnd} onPointerCancel={() => (swipe.current = null)}>
        <div className="bigyear" aria-hidden="true">
          {site.year}
        </div>
        <div className="kicker">
          <span className="yr">{site.year}</span>
          <span>{CATEGORY_NAME[site.category]}</span>
          {site.flagStar && <span className="flagchip">✶ City flag star</span>}
        </div>
        <h2>{site.title}</h2>
        <div className="date">
          {site.date} · {eraOf(site.year, ERAS).name}
        </div>
      </header>

      <div className="story-body">
        <p>{site.story}</p>
        {embed ? (
          <div className="sv">
            <iframe
              title={`Street View of ${site.title} today`}
              src={embed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        ) : site.streetView === false ? (
          <p className="svnote">No Street View here: this spot is out in the lake.</p>
        ) : (
          <a className="sv svlink" href={streetViewLink(site)} target="_blank" rel="noopener">
            <StreetIcon className="i" width={28} height={28} />
            <b>See this spot today in Street View ↗</b>
            <span>{site.today}</span>
          </a>
        )}
        <dl className="facts">
          <dt>Where</dt>
          <dd>{site.address}</dd>
          <dt>Today</dt>
          <dd>{site.today}</dd>
          {site.sources.length > 0 && (
            <>
              <dt>Sources</dt>
              <dd>
                {site.sources.map((src, k) => (
                  <span key={src.url}>
                    {k > 0 && " · "}
                    <a href={src.url} target="_blank" rel="noopener">
                      {src.title}
                    </a>
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
        <div className="actions" style={embed || site.streetView === false ? undefined : { gridTemplateColumns: "1fr" }}>
          {(embed || site.streetView === false) && (
            <a className="primary" href={streetViewLink(site)} target="_blank" rel="noopener">
              {embed ? "Open in Street View ↗" : "Street View ↗"}
            </a>
          )}
          <a href={mapsLink(site)} target="_blank" rel="noopener">
            {embed || site.streetView === false ? "Maps ↗" : "Open in Google Maps ↗"}
          </a>
        </div>
      </div>

      <nav className="pager" aria-label="Previous and next site">
        {prev ? (
          <button type="button" onClick={() => go(prev.id)} aria-label={`Previous: ${prev.year} ${prev.title}`}>
            <small>← {prev.year}</small>
            <b>{prev.short}</b>
          </button>
        ) : (
          <span className="ph" />
        )}
        {next ? (
          <button type="button" className="next" onClick={() => go(next.id)} aria-label={`Next: ${next.year} ${next.title}`}>
            <small>{next.year} →</small>
            <b>{next.short}</b>
          </button>
        ) : (
          <span className="ph" />
        )}
      </nav>
    </div>
  );
}
