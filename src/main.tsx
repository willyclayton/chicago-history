import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Base tokens and layout first, so each area's own stylesheet (imported by its
// component) loads after it and can override at equal specificity.
import "./theme.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
