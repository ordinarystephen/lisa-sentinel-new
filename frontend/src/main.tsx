/**
 * Entry point. Mounts <App /> on #root and pulls in Tailwind + tokens.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/index.css";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Could not find #root element");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
