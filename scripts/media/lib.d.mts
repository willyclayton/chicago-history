// Types for lib.mjs (used by tests/media-build.test.ts).
import type { MediaCandidate } from "../../src/data/media";

export declare const USER_AGENT: string;
export declare const COMMONS_API: string;
export declare const COMMONS_THUMB_WIDTH: number;
export declare const COMMONS_BATCH: number;
export declare const COMMONS_MAX_URL: number;
export declare const LOC_ORIGIN: string;

export type DropCode =
  | "invalid"
  | "duplicate"
  | "unknown-site"
  | "license"
  | "missing"
  | "redirect"
  | "not-image"
  | "too-large"
  | "offline"
  | "api-error"
  | "download"
  | "image";

export interface ArchiveRecord {
  url: string;
  width: number;
  height: number;
  mime: string;
  sha1?: string;
  size?: number;
  license: string;
  licenseUrl?: string;
  credit: string;
  sourceUrl: string;
  archive: string;
}

export type Result = { ok: true; record: ArchiveRecord } | { ok: false; code: DropCode; detail: string };

export interface CommonsRecord {
  title: string;
  fetchedAt: number;
  page?: unknown;
  redirect?: string;
}

export interface LocRef {
  kind: "item" | "resource";
  id: string;
}

export interface ImageCandidate {
  url: string;
  width: number;
  height: number;
  mime: string;
}

export declare function stripHtml(s: unknown): string;
export declare function normalizeCommonsRef(ref: unknown): string | null;
export declare function normalizeLocRef(ref: unknown): LocRef | null;
export declare function locItemUrl(id: string): string;
export declare function locJsonUrl(r: LocRef): string;
export declare function refKey(c: Partial<MediaCandidate> | null | undefined): string | null;
export declare function isAllowedLicense(text: unknown): boolean;
export declare function licenseLabel(text: unknown): string;
export declare function commonsApiUrl(titles: string[], width?: number, cont?: Record<string, unknown> | null): string;
export declare function commonsBatches(titles: string[], size?: number, maxUrl?: number): string[][];
export declare function parseCommonsPage(page: unknown): Result;
export declare function commonsRecords(json: unknown, titles: string[], fetchedAt?: number): Map<string, CommonsRecord>;
export declare function commonsResult(rec: CommonsRecord | undefined): Result;
export declare function parseCommonsResponse(json: unknown, titles: string[]): Map<string, Result>;
export declare function mergeCommonsPages<T extends object>(a: T, b: unknown): T;
export declare function locImageCandidates(json: unknown): ImageCandidate[];
export declare function pickLocImage(json: unknown): ImageCandidate | null;
export declare function locItemIdFromResource(json: unknown): string | null;
export declare function trimLocJson(json: unknown): unknown;
export declare function parseLocItem(json: unknown, id: string): Result;
export declare function isRetryableStatus(status: number): boolean;
export declare function netErrorCode(err: unknown): string | null;
export declare function isUnreachable(code: string | null): boolean;
export declare function retryDelayMs(attempt: number, retryAfter?: string | null, now?: number, cap?: number): number;
export declare class HttpError extends Error {
  status: number | string;
  url: string;
  constructor(status: number | string, url: string);
}
export declare class NetError extends Error {
  code: string;
  url: string;
  constructor(code: string, url: string, cause?: unknown);
}
export declare function createLimiter(n: number): <T>(fn: () => T | Promise<T>) => Promise<T>;
export declare function sortByYear<T extends { year: number }>(items: T[]): T[];
export declare const DROP_LABELS: Record<DropCode, string>;
export declare function summarize(kept: number, drops: { code: string }[]): string;
export declare function validCandidate(c: unknown): boolean;
