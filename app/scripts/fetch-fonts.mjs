#!/usr/bin/env node
/**
 * Regenerate the self-hosted webfonts in app/src/assets/fonts/ and the
 * @font-face rules in app/src/fonts.css.
 *
 * The app used to load EB Garamond and Lato from fonts.googleapis.com at
 * runtime. Two problems with that, and neither is hypothetical: Google receives
 * a request — and so an IP address — from every visitor to a Lawfare research
 * tool, and a slow font host stalls first paint because the stylesheet is
 * render-blocking. Self-hosting removes both, and shortens the
 * Content-Security-Policy allow-list to the point where the policy can be
 * enforced rather than merely reported.
 *
 * Run it only when the font request changes. The output is committed, so a
 * normal build never touches the network.
 *
 *   node app/scripts/fetch-fonts.mjs
 *
 * SUBSETS: latin and latin-ext only, of the seven Google serves. Greek,
 * Cyrillic and Vietnamese are dropped — a US federal legal corpus does not use
 * them, and carrying them is 25 files nobody downloads. The cost is that a
 * stray Greek or Cyrillic character renders in the fallback face (Georgia, or
 * the system sans) rather than in the brand one. To change that, add the subset
 * name to SUBSETS and re-run.
 *
 * LICENCE: both families are SIL Open Font License 1.1, which permits
 * redistribution. The two licence texts are committed alongside the files as
 * app/src/assets/fonts/OFL-eb-garamond.txt and OFL-lato.txt; they are copied in
 * by hand rather than fetched here, because a licence should not be able to
 * change under you when you re-run a script.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FONT_DIR = join(HERE, '..', 'src', 'assets', 'fonts')
const CSS_OUT = join(HERE, '..', 'src', 'fonts.css')
// The PDF export prints into an about:blank window, which cannot use the app's
// stylesheet, so it needs the same faces declared with absolute URLs. Generated
// from the same parse so the two can never drift.
const TS_OUT = join(HERE, '..', 'src', 'lib', 'print-fonts.ts')

// The exact request app/index.html used to make. Keep these in step with
// --font-sans / --font-serif in app/src/index.css.
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600' +
  '&family=Lato:ital,wght@0,400;0,700;1,400&display=swap'

// Google returns woff2 only to a browser-shaped User-Agent; an unset or
// node-shaped one gets the far larger ttf, silently.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const SUBSETS = new Set(['latin', 'latin-ext'])

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function main() {
  const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Google Fonts CSS: HTTP ${res.status}`)
  const css = await res.text()

  // Each face is preceded by a `/* subset */` comment. Parse on that pairing
  // rather than on the unicode-range, which is what actually names the subset
  // but is unreadable as a filename.
  const faces = []
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(css)) !== null) {
    const [, subset, block] = m
    if (!SUBSETS.has(subset)) continue
    const get = (k) => (block.match(new RegExp(`${k}:\\s*([^;]+);`)) || [])[1]?.trim()
    faces.push({
      family: get('font-family').replace(/'/g, ''),
      style: get('font-style'),
      weight: get('font-weight'),
      url: block.match(/url\(([^)]+)\)/)[1],
      unicodeRange: get('unicode-range'),
      subset,
    })
  }
  if (!faces.length) throw new Error('parsed no faces — did the CSS format change?')

  // EB Garamond is a VARIABLE font, so Google points every weight of a given
  // style+subset at one file and lets the browser instance it. Downloading per
  // face would write the same bytes three times. Group by source URL instead:
  // one file per URL, and a file serving more than one weight is named `-var`.
  // The @font-face rules stay exactly as Google declared them, so nothing about
  // how the browser picks a face changes — only where the bytes come from.
  const byUrl = new Map()
  for (const f of faces) {
    if (!byUrl.has(f.url)) byUrl.set(f.url, [])
    byUrl.get(f.url).push(f)
  }
  for (const [url, group] of byUrl) {
    const { family, style, subset } = group[0]
    const weights = [...new Set(group.map((g) => g.weight))]
    const tag = weights.length > 1 ? 'var' : weights[0]
    const file = `${slug(family)}-${style}-${subset}-${tag}.woff2`
    for (const g of group) g.file = file
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
    await mkdir(FONT_DIR, { recursive: true })
    await writeFile(join(FONT_DIR, file), Buffer.from(await r.arrayBuffer()))
  }

  const header = `/* GENERATED by app/scripts/fetch-fonts.mjs — do not edit by hand.
 *
 * Self-hosted EB Garamond and Lato, subsets ${[...SUBSETS].join(' + ')}:
 * ${faces.length} faces over ${byUrl.size} files (EB Garamond is variable, so one file
 * serves several weights). Both families are SIL Open Font License 1.1.
 *
 * The URLs below are relative, so Vite fingerprints each file into /assets/ at
 * build time. That matters: the box serves /assets/* with
 * \`Cache-Control: public, max-age=31536000, immutable\`, which a file dropped
 * in app/public/ would not get.
 *
 * font-display: swap is kept from Google's own CSS — text paints immediately in
 * the fallback face and swaps when the webfont arrives, rather than being
 * invisible while it loads.
 */\n\n`

  const body = faces
    .map(
      (f) => `@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url('./assets/fonts/${f.file}') format('woff2');
  unicode-range: ${f.unicodeRange};
}`
    )
    .join('\n\n')

  await writeFile(CSS_OUT, header + body + '\n')

  // --- the print-window twin -------------------------------------------------
  // Vite rewrites each import to the fingerprinted /assets/ path at build time;
  // location.origin makes it absolute at run time, which the print document
  // needs because about:blank has no useful base URL of its own.
  const files = [...new Set(faces.map((f) => f.file))]
  const varName = (f) => 'f' + files.indexOf(f)
  const ts =
    `/* GENERATED by app/scripts/fetch-fonts.mjs — do not edit by hand.
 *
 * @font-face rules for the PDF export's print window. That window is opened
 * with window.open(''), so it is an about:blank document: it inherits this
 * page's Content-Security-Policy, which is why it cannot fetch Google Fonts
 * once the policy is enforced, and it inherits no base URL, which is why these
 * URLs are made absolute rather than left root-relative.
 */\n` +
    files.map((f) => `import ${varName(f)} from '../assets/fonts/${f}'`).join('\n') +
    `\n\ntype Face = {
  family: string
  style: string
  weight: string
  url: string
  range: string
}\n\nconst FACES: Face[] = [\n` +
    faces
      .map(
        (f) =>
          `  { family: '${f.family}', style: '${f.style}', weight: '${f.weight}', url: ${varName(
            f.file
          )}, range: '${f.unicodeRange}' },`
      )
      .join('\n') +
    `\n]

/** @font-face block for the print document, with origin-absolute font URLs. */
export function printFontFaceCss(): string {
  return FACES.map(
    (f) =>
      \`@font-face { font-family: '\${f.family}'; font-style: \${f.style}; font-weight: \${f.weight}; font-display: swap; src: url('\${new URL(f.url, location.origin).href}') format('woff2'); unicode-range: \${f.range}; }\`
  ).join('\\n')
}\n`
  await writeFile(TS_OUT, ts)

  console.log(`${faces.length} faces over ${files.length} files -> ${FONT_DIR}`)
  console.log(`rules -> ${CSS_OUT}`)
  console.log(`print rules -> ${TS_OUT}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
