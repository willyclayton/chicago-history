import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { formatRoute, parseRoute, routeLevel, startRouter } from "../src/lib/router";
import { __reset, actions, getState } from "../src/state/store";

/** Just enough of a browser's session history to drive the router. */
class FakeHistory {
  entries: { url: URL; state: unknown }[];
  i = 0;
  scrollRestoration = "auto";
  private pop = new Set<() => void>();
  constructor(url: string) {
    this.entries = [{ url: new URL(url, "https://example.org/app/"), state: null }];
  }
  get state() {
    return this.entries[this.i].state;
  }
  get length() {
    return this.entries.length;
  }
  get url() {
    const u = this.entries[this.i].url;
    return u.pathname + u.search + u.hash;
  }
  pushState(state: unknown, _: string, url: string) {
    this.entries = this.entries.slice(0, this.i + 1);
    this.entries.push({ url: new URL(url, this.entries[this.i].url), state: structuredClone(state) });
    this.i++;
  }
  replaceState(state: unknown, _: string, url: string) {
    this.entries[this.i] = { url: new URL(url, this.entries[this.i].url), state: structuredClone(state) };
  }
  /** Like the browser: asynchronous, then a popstate. */
  go(n: number) {
    setTimeout(() => {
      const to = Math.max(0, Math.min(this.entries.length - 1, this.i + n));
      if (to === this.i) return;
      this.i = to;
      this.pop.forEach((f) => f());
    });
  }
  back() {
    this.go(-1);
  }
  forward() {
    this.go(1);
  }
  /** Typing a new hash in the address bar: a new entry with no state, then popstate. */
  typeHash(hash: string) {
    this.pushState(null, "", hash);
    this.pop.forEach((f) => f());
  }
  install() {
    const h = this;
    const g = globalThis as unknown as Record<string, unknown>;
    g.history = h;
    g.location = {
      get pathname() {
        return h.entries[h.i].url.pathname;
      },
      get search() {
        return h.entries[h.i].url.search;
      },
      get hash() {
        return h.entries[h.i].url.hash;
      },
      get href() {
        return h.entries[h.i].url.href;
      },
    };
    g.addEventListener = (t: string, f: () => void) => t === "popstate" && h.pop.add(f);
    g.removeEventListener = (t: string, f: () => void) => t === "popstate" && h.pop.delete(f);
  }
}

const settle = () => new Promise((r) => setTimeout(r, 5));
let stop: (() => void) | null = null;
let h: FakeHistory;

function boot(url: string) {
  __reset();
  actions.closeViewer();
  h = new FakeHistory(url);
  h.install();
  stop = startRouter();
}

beforeAll(() => {
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: true }); // a wide screen
});
afterEach(() => {
  stop?.();
  stop = null;
});

describe("routes", () => {
  it("parses and formats story and photo links", () => {
    expect(parseRoute("#fire")).toEqual({ id: "fire", photo: null });
    expect(parseRoute("#fire/photo/1")).toEqual({ id: "fire", photo: 0 });
    expect(parseRoute("#fire/photo/12")).toEqual({ id: "fire", photo: 11 });
    expect(parseRoute("#fire/photo/0")).toEqual({ id: "fire", photo: null });
    expect(parseRoute("#fire/photo/x")).toEqual({ id: "fire", photo: null });
    expect(parseRoute("#nope")).toEqual({ id: null, photo: null });
    expect(parseRoute("#%E0%A4%A")).toEqual({ id: null, photo: null });
    expect(parseRoute("")).toEqual({ id: null, photo: null });
    expect(formatRoute({ id: "fire", photo: 2 })).toBe("#fire/photo/3");
    expect(formatRoute({ id: "fire", photo: null })).toBe("#fire");
    expect(formatRoute({ id: null, photo: null })).toBe("");
    expect([routeLevel({ id: null, photo: null }), routeLevel({ id: "a", photo: null }), routeLevel({ id: "a", photo: 0 })]).toEqual([0, 1, 2]);
  });
});

describe("back stack", () => {
  it("opening a story pushes, stepping replaces, closing goes back", async () => {
    boot("/app/?nocoach");
    actions.select("fire");
    expect(h.url).toBe("/app/?nocoach#fire");
    expect(h.length).toBe(2);
    actions.step(1);
    actions.step(1);
    expect(h.length).toBe(2);
    expect(h.url).toMatch(/#[a-z0-9-]+$/);
    expect(h.url).not.toMatch(/#fire$/);
    actions.clear(); // the panel's back button
    await settle();
    expect(h.i).toBe(0);
    expect(h.url).toBe("/app/?nocoach");
    expect(getState().selectedId).toBeNull();
    // the stack didn't grow: opening again reuses the slot
    actions.select("valentine");
    expect(h.length).toBe(2);
  });

  it("the browser's Back closes the story, Forward reopens it", async () => {
    boot("/app/");
    actions.select("haymarket");
    h.back();
    await settle();
    expect(getState().selectedId).toBeNull();
    h.forward();
    await settle();
    expect(getState().selectedId).toBe("haymarket");
    expect(getState().camera?.id).toBe("haymarket");
  });

  it("the photo viewer is its own entry: Back closes it first", async () => {
    boot("/app/");
    actions.select("fire");
    actions.openViewer("fire", 0);
    expect(h.url).toBe("/app/#fire/photo/1");
    expect(h.length).toBe(3);
    actions.setViewerIndex(2);
    expect(h.url).toBe("/app/#fire/photo/3");
    expect(h.length).toBe(3);
    h.back();
    await settle();
    expect(getState().viewer).toBeNull();
    expect(getState().selectedId).toBe("fire");
    expect(h.url).toBe("/app/#fire");
    h.back();
    await settle();
    expect(getState().selectedId).toBeNull();
  });

  it("closing the viewer from the UI goes back instead of piling up entries", async () => {
    boot("/app/");
    actions.select("fire");
    actions.openViewer("fire", 1);
    actions.closeViewer();
    await settle();
    expect(h.i).toBe(1);
    expect(h.url).toBe("/app/#fire");
    // viewer and story closed together: back to the list in one go
    actions.openViewer("fire", 0);
    actions.closeViewer();
    actions.clear();
    await settle();
    await settle();
    expect(h.i).toBe(0);
    expect(h.url).toBe("/app/");
    expect(getState().selectedId).toBeNull();
  });

  it("a shared story link opens it; closing doesn't go back out of the app", async () => {
    boot("/app/?nocoach#valentine");
    expect(getState().selectedId).toBe("valentine");
    expect(getState().year).toBeGreaterThanOrEqual(1929);
    actions.clear();
    await settle();
    expect(h.length).toBe(1);
    expect(h.url).toBe("/app/?nocoach");
  });

  it("a shared photo link opens the viewer over its story", async () => {
    boot("/app/#fire/photo/2");
    expect(getState().selectedId).toBe("fire");
    expect(getState().viewer).toEqual({ siteId: "fire", index: 1 });
    expect(h.length).toBe(2);
    h.back();
    await settle();
    expect(getState().viewer).toBeNull();
    expect(getState().selectedId).toBe("fire");
  });

  it("keeps its levels across a reload", async () => {
    boot("/app/");
    actions.select("fire");
    stop?.();
    // reload: same entries, fresh store
    __reset();
    stop = startRouter();
    expect(getState().selectedId).toBe("fire");
    actions.clear();
    await settle();
    expect(h.i).toBe(0);
  });

  it("follows a hash typed into the address bar and ignores invalid ones", async () => {
    boot("/app/#not-a-site");
    expect(getState().selectedId).toBeNull();
    expect(h.url).toBe("/app/");
    h.typeHash("#eastland");
    expect(getState().selectedId).toBe("eastland");
    actions.clear();
    await settle();
    expect(getState().selectedId).toBeNull();
  });
});
