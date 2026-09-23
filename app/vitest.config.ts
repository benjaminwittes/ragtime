import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Unit tests for the app's pure logic.
 *
 * Deliberately standalone rather than merged with `vite.config.ts`: the React
 * and Tailwind plugins buy nothing for tests of plain functions, and leaving
 * them out keeps the run fast and free of the CSS pipeline.
 *
 * ── A cross-repo caveat that used to live here, and why it does not ──────────
 * This file carried a rule that tests under `src/lib/` must avoid `@/` value
 * imports and `import.meta.env` at module scope, because
 * `ragtime-worker/vitest.config.js` globs `app/src/lib/**\/*.test.ts` into its
 * own suite, where the alias below does not exist.
 *
 * That glob is still in the worker's config and it matches nothing. The repos
 * were split on 2026-06-26 and the worker has had no `app/` directory since:
 * checked against `origin/main`, zero tracked files under `app/`, and its three
 * workflows do a plain checkout of themselves with no second repo and no path
 * into `app/`. So the rule constrained how this repo is written to protect
 * against something that cannot happen.
 *
 * Written down rather than deleted so the next person to notice the glob does
 * not have to re-derive this. If the two repos ever share a directory again,
 * the constraint comes back with it.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The client package by its source, as vite.config.ts and tsconfig.app.json
      // resolve it. The Explorer's model tests (src/explorer/model) read it for
      // types and for `links`.
      '@lawfare/ragtime-client': fileURLToPath(new URL('../packages/client/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
