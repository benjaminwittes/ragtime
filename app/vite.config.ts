import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
export default defineConfig({
  // Deploy mount point. GitHub Pages serves the project site under the
  // `/ragtime/` subpath, so assets and the SPA router (via BASE_URL, see
  // src/lib/routing.ts) resolve there. The custom-domain move to
  // ragtime.lawfaremedia.org (served at origin root) is a one-line flip to
  // `/` plus a CNAME + the Worker's APP_BASE_URL — no router changes.
  // Overridable at build time with VITE_BASE for that future cutover.
  base: process.env.VITE_BASE ?? '/ragtime/',
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
