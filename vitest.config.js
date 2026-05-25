import { defineConfig } from "vitest/config";

// Node environment: the Worker's money-path functions rely on Web-standard
// globals (crypto.subtle, fetch/Request/Response, atob, TextEncoder) that Node
// 20+ exposes globally — no miniflare/workerd needed for these unit + handler
// tests. Tests live next to the Worker under worker/*.test.js.
export default defineConfig({
  test: {
    environment: "node",
    include: ["worker/**/*.test.js"],
    clearMocks: true
  }
});
