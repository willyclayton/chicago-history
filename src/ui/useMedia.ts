import { useSyncExternalStore } from "react";

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

export const useWide = () => useMedia("(min-width: 1001px)");
