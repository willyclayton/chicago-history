// Types for pipeline.mjs (used by tests/media-build.test.ts).
import type { MediaIndex } from "../../src/data/media";
import type { DropCode } from "./lib.mjs";

export declare const PROC_VERSION: number;
export declare const FULL: number;
export declare const THUMB: number;

export interface Drop {
  siteId: string;
  ref: string;
  code: DropCode;
  detail?: string;
}

export interface BuildOptions {
  root?: string;
  manifestDir?: string;
  sitesFile?: string;
  outJson?: string;
  publicDir?: string;
  cacheDir?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  sharp?: unknown;
  log?: (...a: unknown[]) => void;
  offline?: boolean;
  refresh?: boolean;
  apiTtlMs?: number;
  concurrency?: number;
  timeBudgetMs?: number;
  apiTimeoutMs?: number;
  downloadTimeoutMs?: number;
  hostIntervalMs?: Record<string, number>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  only?: string[] | null;
}

export interface BuildResult {
  index: MediaIndex;
  kept: number;
  drops: Drop[];
  summary: string;
  unreachable: Record<string, string>;
  warnings?: string[];
  changed: boolean;
  error?: string;
  report?: { seconds: number; [k: string]: unknown };
}

export declare function buildMedia(options?: BuildOptions): Promise<BuildResult>;
