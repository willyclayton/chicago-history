import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Base tokens and layout first, so each area's own stylesheet (imported by its
// component) loads after it and can override at equal specificity.
import "./theme.css";
import { App } from "./App";
// App-shell polish (safe areas, touch behavior, update prompt), last.
import "./shell.css";
import { registerServiceWorker } from "./lib/sw";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support and instant repeat visits (production builds only).
registerServiceWorker();
