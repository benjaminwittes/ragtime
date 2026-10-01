#!/usr/bin/env node
/**
 * Print `app/guides/connect-claude.html` to the PDF the site serves at
 * `/guides/connect-claude.pdf`.
 *
 * The PDF used to be a file exported by hand from somewhere else, with nothing
 * in this repository that could make it again, so a wrong step in it could not
 * be corrected here. Now the HTML beside this script's output is the source.
 *
 * Run it only when the guide changes. The output is committed, so a normal
 * build never opens a browser.
 *
 *   node app/scripts/build-guide.mjs
 *
 * It drives the Chrome already installed on the machine through
 * `playwright-core`, the way the drivers in `app/e2e/` do.
 */
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = join(HERE, '..', 'guides', 'connect-claude.html')
const OUT = join(HERE, '..', 'public', 'guides', 'connect-claude.pdf')

const require = createRequire(import.meta.url)
let pw
try {
  pw = require('playwright-core')
} catch {
  console.error('build-guide: playwright-core is not installed. Run `npm ci` at the repo root.')
  process.exit(2)
}

// Header and footer are drawn by the browser outside the page, so they cannot
// use the page's stylesheet or its fonts.
const edge = (inner) =>
  `<div style="width:100%;padding:0 0.75in;font:7pt Helvetica,Arial,sans-serif;color:#77736a;">${inner}</div>`

const browser = await pw.chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(SOURCE).href, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await mkdir(dirname(OUT), { recursive: true })
  await page.pdf({
    path: OUT,
    format: 'Letter',
    printBackground: true,
    tagged: true,
    displayHeaderFooter: true,
    headerTemplate: edge('<span class="title"></span>'),
    footerTemplate: edge(
      '<div style="text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    ),
    margin: { top: '0.85in', bottom: '0.8in', left: '0.9in', right: '0.9in' },
  })
} finally {
  await browser.close()
}
console.log('build-guide: wrote', OUT)
