import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Unit tests for the app's pure logic.
 *
 * Deliberately standalone rather than merged with `vite.config.ts`: the React
 * and Tailwind plugins buy nothing for tests of plain functions, and leaving
 * them out keeps the run fast and free of the CSS pipeline.
 *
 * ── Cross-repo caveat, read before adding tests ──────────────────────────────
 * `ragtime-worker/vitest.config.js` globs `app/src/lib/**\/*.test.ts` into its
 * OWN suite, so every test file here is also executed by that repo's runner —
 * which has no alias resolution and hardcodes `environment: "node"`. The alias
 * below therefore works here but NOT there. Until that glob is narrowed, a test
 * under `src/lib/` must avoid `@/` *value* imports and `import.meta.env` at
 * module scope, or it will go red in a repo you are not looking at.
 * (`import type { X } from '@/...'` is fine — esbuild erases it.)
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
