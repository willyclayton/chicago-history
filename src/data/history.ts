/**
 * Per-site history: a short chronology of "moments" from the event (or construction)
 * to today, plus checked facts and sources. One file per site:
 * src/data/history/<site-id>.json. Written by the research pass; every claim has a source.
 */
import type { Source } from "../types";

export type MomentKind =
  | "event" // the thing that happened
  | "built" // construction started, opened, completed
  | "changed" // renamed, remodeled, moved, reopened
  | "demolished" // torn down, burned, closed for good
  | "commemorated" // marker, landmark designation, memorial
  | "today"; // what is there now

export interface Moment {
  year: number;
  /** Display date when more precise than the year, e.g. "Feb 14, 1929". */
  date?: string;
  title: string;
  /** One or two plain sentences. */
  text: string;
  kind: MomentKind;
}

export interface Fact {
  label: string; // "Deaths"
  value: string; // "at least 602 (estimated)"
  note?: string; // why it is estimated or disputed
}

export interface SiteHistory {
  id: string;
  /** Chronological, oldest first; the last one is usually kind "today". */
  moments: Moment[];
  facts?: Fact[];
  sources: Source[];
  /** What the accuracy pass checked or corrected, and when (ISO date). */
  checked?: { date: string; notes?: string };
}

const loaders = import.meta.glob<SiteHistory>("./history/*.json", { import: "default" });

export async function loadHistory(id: string): Promise<SiteHistory | null> {
  const load = loaders[`./history/${id}.json`];
  return load ? load() : null;
}

export const hasHistory = (id: string) => `./history/${id}.json` in loaders;
