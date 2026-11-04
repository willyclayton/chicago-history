import { useSyncExternalStore } from "react";
import type { CategoryId } from "../types";

/**
 * Small UI state shared by the map and its own chrome (legend, marker list) that the
 * rest of the app doesn't need: which theme the legend is previewing, and whether the
 * 1871 burn area is pinned on regardless of the slider year.
 */
export interface MapUiState {
  /** Category being previewed from the legend: other markers dim. */
  focusCat: CategoryId | null;
  /** Keep the 1871 burn area on at every year. */
  burnPinned: boolean;
}

let state: MapUiState = { focusCat: null, burnPinned: false };
const listeners = new Set<() => void>();

export const getMapUi = () => state;
export function setMapUi(patch: Partial<MapUiState>) {
  const next = { ...state, ...patch };
  if (next.focusCat === state.focusCat && next.burnPinned === state.burnPinned) return;
  state = next;
  listeners.forEach((l) => l());
}
export function subscribeMapUi(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function useMapUi<T>(pick: (s: MapUiState) => T): T {
  return useSyncExternalStore(subscribeMapUi, () => pick(state), () => pick(state));
}
