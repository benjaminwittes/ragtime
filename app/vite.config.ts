import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tunePlugin } from './vite-plugin-tune.ts'

/**
 * GitHub Pages has no SPA server-side rewrite: a hard navigation to a deep
 * route (e.g. `/ragtime/corpus/litigation`) hits no matching file and is
 * served the site's `404.html`. By making `404.html` a byte-copy of the built
 * `index.html`, that fallback boots the same SPA, which then reads the real
 * pathname and renders the right route. Runs on every build so local `preview`
 * exercises the same fallback CI ships.
 */
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, 'dist')
      const indexHtml = path.join(outDir, 'index.html')
      if (fs.existsSync(indexHtml)) {
        fs.copyFileSync(indexHtml, path.join(outDir, '404.html'))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  /**
   * Is the design-tuning layer in this build?
   *
   * A `define`, not an `import.meta.env` read, and that distinction is the
   * whole point: `__RT_TUNE__` is substituted as the literal `false` in a plain
   * production build, so `if (__RT_TUNE__)` in `main.tsx` folds away and the
   * dynamic import under it is never followed — the panel, its stylesheet and
   * every knob declaration leave no chunk behind. Read through a variable the
   * bundler cannot fold, the same code ships ~18 kB of dead weight.
   *
   * On (`true`) for `vite dev`, and for a build run with VITE_TUNER=1 — the
   * branch-deploy case, where a preview is meant to be tunable in front of
   * someone. Write-to-source stays off there; there is no dev server to take it.
   */
  define: {
    __RT_TUNE__: JSON.stringify(
      command === 'serve' || process.env.VITE_TUNER === '1',
    ),
  },
  // Deploy mount point. GitHub Pages serves the project site under the
  // `/ragtime/` subpath, so assets and the SPA router (via BASE_URL, see
  // src/lib/routing.ts) resolve there. The custom-domain move to
  // ragtime.lawfaremedia.org (served at origin root) is a one-line flip to
  // `/` plus a CNAME + the Worker's APP_BASE_URL — no router changes.
  // Overridable at build time with VITE_BASE for that future cutover.
  base: process.env.VITE_BASE ?? '/ragtime/',
  // `tunePlugin` is `apply: 'serve'` — it takes the tuning panel's writes back
  // into `src/`, and exists only while the dev server does (src/tune/README.md).
  plugins: [react(), tailwindcss(), spaFallback(), tunePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // The client package is a workspace sibling whose `exports` point at its
      // build output — what an npm consumer installs. This app reads its source
      // instead, so an edit there is live here and `tsc -b` checks both in one
      // pass. The same mapping sits in tsconfig.app.json (`paths`) and in
      // vitest.config.ts; the three must agree.
      '@lawfare/ragtime-client': path.resolve(import.meta.dirname, '../packages/client/src/index.ts'),
    },
  },
}))
