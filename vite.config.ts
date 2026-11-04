/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
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

// Relative base so the build works at a domain root or a subpath (GitHub Pages).
export default defineConfig({
  base: "./",
  plugins: [react(), geojson()],
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
