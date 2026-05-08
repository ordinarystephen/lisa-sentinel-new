import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// why: API requests in dev go through Vite's proxy so the SPA can call
// `api/...` (relative) and reach the Flask process running separately on
// port 5000. In production the Flask SPA route serves the build directly,
// so the proxy is dev-only.
//
// `base: "./"` — emit relative asset paths in index.html so the build
// survives Domino's `/proxy/<port>/` prefix. Absolute `/assets/...` paths
// would resolve against the origin and miss the proxy.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
});
