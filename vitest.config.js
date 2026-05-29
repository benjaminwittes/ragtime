import { defineConfig } from "vitest/config";

// Node environment: the Worker's money-path functions rely on Web-standard
// globals (crypto.subtle, fetch/Request/Response, atob, TextEncoder) that Node
// 20+ exposes globally — no miniflare/workerd needed for these unit + handler
// tests. Tests live next to the Worker under worker/*.test.js.
//
// PR 4x: also include `app/src/lib/**/*.test.ts` — pure-function helpers in
// the React app (e.g., external-source-urls) that don't need a DOM. Vitest
// transpiles TS via esbuild; no extra config needed. Full React-component
// tests remain a separate concern (would need jsdom + JSX setup) and aren't
// gated by this include.
export default defineConfig({
  test: {
    environment: "node",
    include: ["worker/**/*.test.js", "app/src/lib/**/*.test.ts"],
    clearMocks: true
  }
});
