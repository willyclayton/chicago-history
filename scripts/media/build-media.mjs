#!/usr/bin/env node
// Build the verified photo set: node scripts/media/build-media.mjs [--offline] [--refresh] [--only=fire,valentine]
//
// Reads src/data/media-manifest/*.json, checks each candidate's license with its archive
// (Wikimedia Commons or the Library of Congress), downloads and resizes what's allowed
// into public/media/<site-id>/, and writes src/data/media.generated.json.
// Caches API answers and downloads in .media-cache/. Always exits 0: an unreachable
// archive or a bad candidate only drops photos, it never fails the build.
import { appendFileSync } from "node:fs";
import { buildMedia } from "./pipeline.mjs";
import { DROP_LABELS } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

if (flag("help")) {
  console.log("usage: node scripts/media/build-media.mjs [--offline] [--refresh] [--only=site,site]");
  process.exit(0);
}

const gha = !!process.env.GITHUB_ACTIONS;
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

try {
  const r = await buildMedia({
    offline: flag("offline") || process.env.MEDIA_OFFLINE === "1",
    refresh: flag("refresh"),
    only: value("only")?.split(",").filter(Boolean) ?? null,
    apiTtlMs: process.env.MEDIA_API_TTL_DAYS ? Number(process.env.MEDIA_API_TTL_DAYS) * 86_400_000 : undefined,
  });
  const sites = Object.keys(r.index).length;
  const line = `media: ${r.summary} (${sites} sites, ${r.report?.seconds ?? "?"}s)`;
  console.log("\n" + line);
  for (const w of r.warnings ?? []) console.log(`media: warning: ${w}`);

  if (gha) {
    console.log(`::notice title=Photos::${esc(line)}`);
    for (const w of r.warnings ?? []) console.log(`::warning title=Photos::${esc(w)}`);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `changed=${r.changed ? "true" : "false"}\nkept=${r.kept}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
      const md = [
        `### Photos`,
        ``,
        `**${line.replace(/^media: /, "")}**`,
        ``,
        ...(r.warnings?.length ? [...r.warnings.map((w) => `- ⚠️ ${w}`), ``] : []),
        `<details><summary>Photos per site</summary>`,
        ``,
        Object.entries(r.index)
          .map(([k, v]) => `${k} ${v.length}`)
          .join(" · ") || "none",
        ``,
        `</details>`,
        ``,
        ...(r.drops.length
          ? [`<details><summary>Dropped (${r.drops.length})</summary>`, ``, `| Site | Ref | Why |`, `| --- | --- | --- |`, ...r.drops.map((d) => `| ${cell(d.siteId)} | ${cell(d.ref)} | ${cell(DROP_LABELS[d.code] ?? d.code)}${d.detail ? ": " + cell(d.detail) : ""} |`), ``, `</details>`]
          : []),
      ].join("\n");
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
    }
  }
} catch (e) {
  // buildMedia never rejects; this is only for a crash in the reporting above
  console.log(`media: ${e?.stack ?? e}`);
}
process.exit(0);
