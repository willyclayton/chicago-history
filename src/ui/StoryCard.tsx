import { useEffect, useRef } from "react";
import { CATEGORY_NAME, ERAS, ORDERED, SITE_BY_ID } from "../data";
import { eraOf } from "../lib/eras";
import { mapsLink, streetViewEmbed, streetViewLink } from "../lib/links";
import { actions, matches, useStore } from "../state/store";
import { useWide } from "./useMedia";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY;

export function StoryCard() {
  const selectedId = useStore((s) => s.selectedId);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const open = useStore((s) => s.cardOpen);
  const hidden = useStore((s) => s.cardHidden);
  const wide = useWide();
  const ref = useRef<HTMLElement>(null);
  const site = selectedId ? SITE_BY_ID[selectedId] : null;

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [selectedId]);

  if (!site) return <article className="card min" id="card" aria-live="polite" />;

  const vis = ORDERED.filter((s) => matches(s, { cats, query }) || s.id === site.id);
  const i = vis.indexOf(site);
  const prev = vis[i - 1];
  const next = vis[i + 1];
  const expanded = wide || open;
  const embed = expanded ? streetViewEmbed(site, KEY) : null;
  const go = (id: string) => {
    actions.stop();
    actions.select(id, { pan: true, open, setYear: true });
  };

  return (
    <article
      ref={ref}
      className={"card" + (open ? " open" : "") + (hidden ? " min" : "")}
      id="card"
      aria-live="polite"
      aria-label={`Story: ${site.title}`}
      style={{ ["--cc" as string]: `var(--c-${site.category})` }}
    >
      <div className="head">
        <div className="kicker">
          <span className="yr">{site.year}</span>
          <span>{CATEGORY_NAME[site.category]}</span>
          {site.flagStar && <span className="flagchip">✶ City flag star</span>}
        </div>
        <button className="closecard" type="button" aria-label="Close story" onClick={() => actions.hideCard()}>
          ✕
        </button>
      </div>
      <h2 onClick={() => !wide && actions.setCardOpen(!open)}>{site.title}</h2>
      <div className="date">
        {site.date} · {eraOf(site.year, ERAS).name}
      </div>
      <div className="body">
        <p>{site.story}</p>
        <dl>
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
                    <a className="src" href={src.url} target="_blank" rel="noopener">
                      {src.title}
                    </a>
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
        {embed ? (
          <div className="sv">
            <iframe
              key={site.id}
              title={`Street View of ${site.title} today`}
              src={embed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        ) : site.streetView === false ? (
          <p className="svnote">No Street View here: this spot is out in the lake.</p>
        ) : null}
      </div>
      <div className="actions">
        <a className="primary" href={streetViewLink(site)} target="_blank" rel="noopener">
          {embed ? "Open in Street View ↗" : "Street View ↗"}
        </a>
        <a href={mapsLink(site)} target="_blank" rel="noopener">
          Maps ↗
        </a>
        <button className="more" type="button" aria-expanded={open} onClick={() => actions.setCardOpen(!open)}>
          {open ? "Less" : "Read story"}
        </button>
      </div>
      <div className="nav">
        {prev ? (
          <button type="button" onClick={() => go(prev.id)}>
            ← {prev.year} {prev.short}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button type="button" onClick={() => go(next.id)}>
            {next.year} {next.short} →
          </button>
        )}
      </div>
    </article>
  );
}
