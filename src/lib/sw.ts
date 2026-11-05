/**
 * Service worker registration (production builds only; the worker is public/sw.js).
 * When a new version takes over an open page, `useUpdateReady()` turns true so the app
 * can offer a reload. The old page keeps working meanwhile: its chunks stay cached.
 */
import { useSyncExternalStore } from "react";

let updateReady = false;
const subs = new Set<() => void>();

export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  let controlled = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    // the first install takes control quietly; later ones are updates
    if (controlled && !updateReady) {
      updateReady = true;
      subs.forEach((f) => f());
    }
    controlled = true;
  });
  const start = () => {
    const base = import.meta.env.BASE_URL;
    sw.register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        // an app left open for days still hears about new versions
        let last = Date.now();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible" || Date.now() - last < 30 * 60_000) return;
          last = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch(() => {
        /* private mode, blocked storage: the app works without it */
      });
  };
  if (document.readyState === "complete") start();
  else addEventListener("load", start, { once: true });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => updateReady,
    () => false,
  );
}
