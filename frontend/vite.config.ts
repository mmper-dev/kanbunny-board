// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // SPA mode: prerender a static shell and boot the app on the client only. The app has no
    // backend of its own — data comes from src/api (mock today, a Python service later), so
    // nothing needs to run on a server at request time. See _docs/specs.md §3.2.
    spa: { enabled: true },
  },
  vite: {
    server: {
      // The browser calls /api on its own origin and Vite forwards it to FastAPI. Because the
      // page and the request share an origin, CORS never comes into it during development.
      proxy: {
        "/api": {
          target: process.env["VITE_API_PROXY_TARGET"] ?? "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
  },
});
