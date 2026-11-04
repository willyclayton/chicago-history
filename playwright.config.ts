import { defineConfig } from "@playwright/test";

// Set PW_CHROMIUM to use a specific Chromium binary; otherwise Playwright uses its own.
const executablePath = process.env.PW_CHROMIUM;

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4173/",
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
