/// <reference types="vitest" />
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";

// Treat .geojson files as JSON modules.
function geojson(): Plugin {
  return {
    name: "geojson",
    transform(code, id) {
      if (id.endsWith(".geojson")) return { code: `export default ${code};`, map: null };
    },
  };
}

/** Lazy chunks left out of the precache: fetched (and then cached) only when used. */
const NOT_PRECACHED = [/\/src\/data\/history\//, /\/src\/ui\/media\/demoMedia/];

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

/**
 * Production only:
 *  - fills public/sw.js's VERSION (a hash of this build) and SHELL (the files to
 *    precache: the page, its JS and CSS, the lazy map and viewer chunks, the photo index,
 *    the manifest and icons), so each deploy ships a new worker;
 *  - adds a low-priority modulepreload for the MapLibre chunk, so the map's code
 *    downloads alongside the UI without competing with it.
 */
function appShell(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "ctm-app-shell",
    apply: "build",
    configResolved(c) {
      config = c;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const map = Object.values(ctx.bundle ?? {}).find((f) => f.type === "chunk" && f.isDynamicEntry && f.name === "maplibre-gl");
        if (!map) return;
        return [{ tag: "link", attrs: { rel: "modulepreload", href: config.base + map.fileName, fetchpriority: "low" }, injectTo: "head" }];
      },
    },
    async writeBundle(opts, bundle) {
      const outDir = opts.dir ?? config.build.outDir;
      const built = Object.values(bundle)
        .filter((f) => f.fileName !== "index.html" && !f.fileName.endsWith(".map"))
        .filter((f) => !(f.type === "chunk" && NOT_PRECACHED.some((re) => re.test(f.facadeModuleId ?? ""))))
        .map((f) => f.fileName);
      const pub = (await listFiles(config.publicDir)).filter((f) => f !== "sw.js" && !f.startsWith("media/") && !f.startsWith("."));
      const shell = ["./", ...[...built, ...pub].sort()];
      const html = await readFile(path.join(outDir, "index.html"), "utf8");
      const template = await readFile(path.join(config.publicDir, "sw.js"), "utf8");
      const version = createHash("sha256").update(shell.join("\n")).update(html).update(template).digest("hex").slice(0, 12);
      const sw = template
        .replace(/^const VERSION = .*\/\/ @build:version$/m, `const VERSION = ${JSON.stringify(version)};`)
        .replace(/^const SHELL = .*\/\/ @build:shell$/m, `const SHELL = ${JSON.stringify(shell)};`);
      if (sw.includes("@build:")) this.error("public/sw.js is missing its VERSION or SHELL marker");
      await writeFile(path.join(outDir, "sw.js"), sw);
    },
  };
}

// Relative base so the build works at a domain root or a subpath (GitHub Pages).
export default defineConfig({
  base: "./",
  plugins: [react(), geojson(), appShell()],
  // Same React API at a fraction of the size, to keep first-load JS under 300 KB gzip
  // (MapLibre alone is ~276 KB). Remove this alias to build with React itself.
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom/client": "preact/compat/client",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
    },
  },
  build: { target: "es2020", chunkSizeWarningLimit: 1200 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
