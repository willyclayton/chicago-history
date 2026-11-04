import { WIDE_QUERY } from "./media";
import { useStore } from "../state/store";
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

export const useWide = () => useMedia(WIDE_QUERY);

export const usePrefersDark = () => useMedia("(prefers-color-scheme: dark)");

/** Whether the page is currently dark, from the theme toggle or the system setting. */
export function useDark(): boolean {
  const sys = usePrefersDark();
  const theme = useStore((s) => s.theme);
  return theme === "dark" || (theme === "auto" && sys);
}
