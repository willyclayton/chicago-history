import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CATEGORY_NAME, ERAS, MAX_YEAR, ORDERED, SITE_BY_ID } from "../data";
import { eraOf } from "../lib/eras";
import { mapsLink, streetViewEmbed, streetViewLink } from "../lib/links";
import { actions, getState, matches, useStore } from "../state/store";
import type { Site, Source } from "../types";
import { ArrowUpRight, ChevronLeft, ChevronRight, CloseIcon, PhotoIcon, PinIcon, ShareIcon, ShuffleIcon, StarIcon, StreetIcon } from "./Icons";
import { isTouch, prefersReducedMotion } from "./media";
import { prefetchMedia, useSiteHistory, useSiteMedia } from "./media/source";
import { bumpCount, fmtMiles, miles, plural, pushRecent, relYears } from "./panelUtil";
import { rememberSelection } from "./SiteList";
import { useWide } from "./useMedia";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY;

// The photo stage, strip and chronology are one lazy chunk, loaded only for sites that have them.
const loadMediaUI = () => import("./media/StoryMedia");
const ThenNow = lazy(() => loadMediaUI().then((m) => ({ default: m.ThenNow })));
const PhotoStrip = lazy(() => loadMediaUI().then((m) => ({ default: m.PhotoStrip })));
const Facts = lazy(() => loadMediaUI().then((m) => ({ default: m.Facts })));
const Moments = lazy(() => loadMediaUI().then((m) => ({ default: m.Moments })));
prefetchMedia();

type DragProps = Record<string, (e: React.PointerEvent) => void>;

interface Related {
  site: Site;
  note: string;
}

/** Up to three nearby sites, and up to three from the same theme closest in time. */
function related(site: Site): { nearby: Related[]; theme: Related[] } {
  const others = ORDERED.filter((s) => s.id !== site.id);
  const nearby = others
    .map((s) => ({ site: s, d: miles(site, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ site: s, d }) => ({ site: s, note: fmtMiles(d) }));
  const taken = new Set(nearby.map((r) => r.site.id));
  const theme = others
    .filter((s) => s.category === site.category && !taken.has(s.id))
    .sort((a, b) => Math.abs(a.year - site.year) - Math.abs(b.year - site.year))
    .slice(0, 3)
    .sort((a, b) => a.year - b.year)
    .map((s) => ({ site: s, note: relYears(site.year, s.year) }));
  return { nearby, theme };
}

export function StoryView({ anim, dragProps }: { anim: string; dragProps: DragProps }) {
  const selectedId = useStore((s) => s.selectedId)!;
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const sheet = useStore((s) => s.sheet);
  const wide = useWide();
  const site = SITE_BY_ID[selectedId];
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [hint, setHint] = useState(false);
  const media = useSiteMedia(selectedId);
  const history = useSiteHistory(selectedId);
  // the photo the header stage rests on (index into media), and requests to jump it to Street View
  const [active, setActive] = useState(-1);
  const [liveReq, setLiveReq] = useState(0);

  useEffect(() => {
    rememberSelection(selectedId);
    pushRecent(selectedId);
  }, [selectedId]);

  // a one-time hint that the header swipes through time (touch only, first two stories)
  useEffect(() => {
    if (wide || !isTouch() || bumpCount("ctm-swipehint") > 2) return;
    setHint(true);
    const t = setTimeout(() => setHint(false), 4200);
    return () => clearTimeout(t);
  }, []);

  // reading progress, written straight to a CSS variable so scrolling never re-renders
  useEffect(() => {
    const el = ref.current;
    const bar = barRef.current;
    if (!el || !bar) return;
    const on = () => {
      const max = el.scrollHeight - el.clientHeight;
      bar.style.setProperty("--read", String(max > 4 ? Math.min(1, el.scrollTop / max) : 0));
      bar.classList.toggle("scrolled", el.scrollTop > 8);
      // once the header has scrolled away, the bar names the site
      const h = heroRef.current;
      bar.classList.toggle("titled", !!h && el.scrollTop > h.offsetTop + h.offsetHeight - bar.offsetHeight - 8);
    };
    on();
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);

  const vis = ORDERED.filter((s) => matches(s, { cats, query }) || s.id === site.id);
  const i = vis.indexOf(site);
  const prev = vis[i - 1];
  const next = vis[i + 1];
  const era = eraOf(site.year, ERAS);
  const ago = MAX_YEAR - site.year;
  // Street View loads only once the story is actually open (desktop, or the sheet raised)
  const open = wide || sheet !== "peek";
  const svUrl = streetViewEmbed(site, KEY);
  const hasMedia = !!media && media.length > 0;
  // with photos, Street View is the last stop of the header's time scrubber instead of a second embed
  const liveInHero = hasMedia && !!svUrl;
  const embed = open && !liveInHero ? svUrl : null;
  const svShown = !!embed || liveInHero;
  const lookAround = () => {
    setLiveReq((n) => n + 1);
    ref.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const sources = mergeSources(site.sources, history?.sources);
  const rel = related(site);
  const go = (id: string) => {
    actions.stop();
    actions.select(id, { pan: true, setYear: true });
  };

  // horizontal swipe on the header steps between sites; the header follows the finger
  const swipe = useRef<{ x: number; y: number; id: number; on: boolean } | null>(null);
  const setX = (x: number, settle = false) => {
    const h = heroRef.current;
    if (!h) return;
    h.classList.toggle("settle", settle);
    h.style.setProperty("--sx", `${x}px`);
  };
  const onSwipeStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,[data-noswipe]")) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      s.on = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setHint(false);
    }
    const target = dx < 0 ? next : prev;
    // rubber-band when there's nowhere to go
    setX(target ? dx * 0.75 : dx * 0.22);
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.on) {
      const t = dx < 0 ? next : prev;
      if (t && Math.abs(dx) > 56) {
        setX(dx < 0 ? -40 : 40, true);
        go(t.id);
      } else setX(0, true);
    } else if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && !wide && getState().sheet === "peek") {
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
      <div ref={barRef} className="story-bar" {...(wide ? {} : dragProps)}>
        <button className="back" type="button" onClick={() => actions.clear()} aria-label="Back to all sites">
          <ChevronLeft className="i" width={20} height={20} />
          <span>All sites</span>
        </button>
        <span className="bar-title" aria-hidden="true">
          <b>{site.year}</b> {site.short}
        </span>
        <div className="acts">
          <span className="pos" aria-label={`Site ${i + 1} of ${vis.length}`}>
            <b>{i + 1}</b> / {vis.length}
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
        <span className="read" aria-hidden="true" />
      </div>

      <header
        ref={heroRef}
        className={"hero" + (hasMedia ? " has-media" : "")}
        onPointerDown={onSwipeStart}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeEnd}
        onPointerCancel={() => {
          swipe.current = null;
          setX(0, true);
        }}
      >
        {hasMedia && (
          <Suspense fallback={<div className="tn-skel" aria-hidden="true" />}>
            <ThenNow site={site} items={media} open={open} embed={svUrl} liveReq={liveReq} onActive={setActive} />
          </Suspense>
        )}
        <div className="hero-in">
          <div className="kicker">
            <span className="kyear">{site.year}</span>
            <span className="cat">
              <span className="dot" />
              {CATEGORY_NAME[site.category]}
            </span>
            {site.flagStar && (
              <span className="flagchip" title="One of the four events behind the stars on the Chicago flag">
                <StarIcon /> City flag star
              </span>
            )}
            {hasMedia && (
              <span className="kphotos">
                <PhotoIcon /> {media.length}
                <span className="sr-only"> photos</span>
              </span>
            )}
          </div>
          <div className="bigyear" aria-hidden="true">
            {site.year}
          </div>
          <h2>{site.title}</h2>
          <div className="date">
            {site.date !== String(site.year) && <span>{site.date}</span>}
            <span className="ago">{ago === 0 ? "This year" : `${plural(ago, "year")} ago`}</span>
          </div>
          <div className="eraline">
            <span className="flagrule" aria-hidden="true">
              <i />
              <i />
            </span>
            <span>{era.name}</span>
            <span className="muted">
              {era.from}–{Math.min(era.to, MAX_YEAR)}
            </span>
          </div>
        </div>
        {!wide && (prev || next) && (
          <div className={"swipehint" + (hint ? " on" : "")} aria-hidden="true">
            <span>{prev ? `‹ ${prev.year}` : ""}</span>
            <b>Swipe to move through time</b>
            <span>{next ? `${next.year} ›` : ""}</span>
          </div>
        )}
      </header>

      <div className="story-body">
        {hasMedia && media.length > 1 && (
          <Suspense fallback={null}>
            <PhotoStrip site={site} items={media} active={active} />
          </Suspense>
        )}
        <p className="lede">{site.story}</p>

        {history && (history.facts?.length || history.moments.length) ? (
          <Suspense fallback={null}>
            {history.facts && history.facts.length > 0 && <Facts facts={history.facts} />}
            <Moments site={site} moments={history.moments} items={media ?? []} />
          </Suspense>
        ) : null}

        <section className="today" aria-labelledby="todayH">
          <h3 id="todayH" className="sec">
            On this spot today
          </h3>
          {liveInHero ? (
            <button type="button" className="sv svlink svjump" onClick={lookAround}>
              <span className="svbadge">
                <StreetIcon className="i" />
              </span>
              <b>Look around this spot today</b>
              <span>Street View, at the end of the photo timeline above</span>
            </button>
          ) : embed ? (
            <div className="sv">
              <iframe
                title={`Street View of ${site.title} today`}
                src={embed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          ) : site.streetView === false ? null : (
            <a className="sv svlink" href={streetViewLink(site)} target="_blank" rel="noopener">
              <span className="svbadge">
                <StreetIcon className="i" />
              </span>
              <b>See this spot today in Street View ↗</b>
              <span>Opens Google Street View</span>
            </a>
          )}
          <dl className="facts">
            <div>
              <dt>Today</dt>
              <dd>{site.today}</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                <PinIcon className="pin" /> {site.address}
              </dd>
            </div>
          </dl>
          {site.streetView === false && <p className="svnote">No Street View here: this spot is out in the lake.</p>}
          <div className={"actions" + (svShown || site.streetView === false ? "" : " one")}>
            {(svShown || site.streetView === false) && (
              <a className="primary" href={streetViewLink(site)} target="_blank" rel="noopener">
                {svShown ? "Open in Street View" : "Street View"} <ArrowUpRight className="i" />
              </a>
            )}
            <a href={mapsLink(site)} target="_blank" rel="noopener">
              {svShown || site.streetView === false ? "Maps" : "Open in Google Maps"} <ArrowUpRight className="i" />
            </a>
          </div>
        </section>

        {sources.length > 0 && (
          <section className="sources">
            <h3 className="sec">Sources</h3>
            <ul>
              {sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noopener">
                    {src.title}
                  </a>
                  <small>{host(src.url)}</small>
                </li>
              ))}
            </ul>
            {history?.checked && (
              <details className="checked">
                <summary>Fact-checked {fmtDate(history.checked.date)}</summary>
                {history.checked.notes && <p>{history.checked.notes}</p>}
              </details>
            )}
          </section>
        )}

        <RelatedGroup title="Nearby" items={rel.nearby} go={go} />
        <RelatedGroup title={`More ${CATEGORY_NAME[site.category].toLowerCase()}`} items={rel.theme} go={go} />
      </div>

      <nav className="pager" aria-label="Previous and next site">
        {prev ? (
          <button
            type="button"
            onClick={() => go(prev.id)}
            aria-label={`Previous: ${prev.year} ${prev.title}`}
            style={{ ["--cc" as string]: `var(--c-${prev.category})` }}
          >
            <ChevronLeft className="chev" />
            <span>
              <small>Earlier · {prev.year}</small>
              <b>{prev.short}</b>
            </span>
          </button>
        ) : (
          <span className="ph" />
        )}
        {next ? (
          <button
            type="button"
            className="next"
            onClick={() => go(next.id)}
            aria-label={`Next: ${next.year} ${next.title}`}
            style={{ ["--cc" as string]: `var(--c-${next.category})` }}
          >
            <span>
              <small>Later · {next.year}</small>
              <b>{next.short}</b>
            </span>
            <ChevronRight className="chev" />
          </button>
        ) : (
          <span className="ph" />
        )}
      </nav>
    </div>
  );
}

/** The site's own sources plus the research pass's, without repeats. */
function mergeSources(a: Source[], b: Source[] | undefined): Source[] {
  const seen = new Set<string>();
  return [...a, ...(b ?? [])].filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RelatedGroup({ title, items, go }: { title: string; items: Related[]; go: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <section className="related">
      <h3 className="sec">{title}</h3>
      <ul>
        {items.map(({ site: s, note }) => (
          <li key={s.id}>
            <button
              type="button"
              style={{ ["--cc" as string]: `var(--c-${s.category})` }}
              onClick={() => go(s.id)}
              onMouseEnter={() => actions.hover(s.id)}
              onMouseLeave={() => getState().hoverId === s.id && actions.hover(null)}
              onFocus={() => actions.hover(s.id)}
              onBlur={() => getState().hoverId === s.id && actions.hover(null)}
              aria-label={`${s.title}, ${s.year}, ${note}`}
            >
              <span className="ry">{s.year}</span>
              <span className="rt">
                <b>{s.title}</b>
                <small>
                  <span className="dot" />
                  {note}
                </small>
              </span>
              <ChevronRight className="chev" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
