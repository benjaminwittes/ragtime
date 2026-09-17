#!/usr/bin/env node
/**
 * Does the policy this box serves actually cover the pages this box serves?
 *
 * The content policy was derived by reading the SPA, and the SPA is not the only
 * document deployed: `deploy-app.yml` copies the legacy single-file app to
 * /legacy.html, which loads a script from a CDN, keeps its whole program in one
 * inline <script>, uses inline `onerror=` handlers and pulls a logo from a third
 * party. None of that is visible from /, so a policy tested on / only looks clean
 * and breaks the other page the moment the report-only header is promoted.
 *
 * This asks the question per path: fetch the page, read the policy the server sent
 * *for that path*, work out what the page actually needs, and print what the policy
 * would refuse. No browser and no dependencies — the answer is in the bytes.
 *
 *   node deploy/check-csp.mjs https://ragtime-app.lawfaremedia.org
 *
 * Exit 0 when every page is covered, 1 when something is not. It reads the
 * report-only header when present and the enforced one otherwise, because the
 * report-only header is the policy being proposed for promotion, and that is the
 * thing worth checking before it becomes enforced.
 */

const base = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '')
const PAGES = ['/', '/legacy.html']

/** Split a policy header into { directive: [source, ...] }. */
function parsePolicy(header) {
  const out = {}
  for (const part of (header || '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) out[name.toLowerCase()] = sources
  }
  return out
}

/** The sources a directive really falls back to — CSP's own fallback chain. */
function effective(policy, directive) {
  if (policy[directive]) return policy[directive]
  if (directive === 'script-src' || directive === 'style-src' || directive === 'img-src' ||
      directive === 'font-src' || directive === 'connect-src' || directive === 'frame-src') {
    return policy['default-src'] || null
  }
  return null
}

function allowsOrigin(sources, url) {
  if (!sources) return true // no directive and no default-src: nothing to refuse
  const origin = new URL(url).origin
  return sources.some((s) => s === '*' || s === origin || s === origin + '/' ||
    (s.startsWith('https://') && origin === s.replace(/\/+$/, '')))
}

/** What the document needs, read off its own bytes. */
function needsOf(html) {
  const need = []
  const add = (directive, what, detail) => need.push({ directive, what, detail })

  // External scripts and stylesheets, by origin.
  for (const m of html.matchAll(/<script[^>]*\ssrc=["'](https?:\/\/[^"']+)["']/gi))
    add('script-src', m[1], 'external script')
  for (const m of html.matchAll(/<link[^>]*\srel=["']stylesheet["'][^>]*\shref=["'](https?:\/\/[^"']+)["']/gi))
    add('style-src', m[1], 'external stylesheet')
  for (const m of html.matchAll(/<img[^>]*\ssrc=["'](https?:\/\/[^"']+)["']/gi))
    add('img-src', m[1], 'external image')
  for (const m of html.matchAll(/@import\s+url\(["']?(https?:\/\/[^"')]+)["']?\)/gi))
    add('style-src', m[1], 'css @import')

  // Inline script: a <script> with no src, and inline event handlers.
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/gi)].length
  if (inlineScripts) add('script-src', "'unsafe-inline'", `${inlineScripts} inline <script>`)
  const handlers = [...html.matchAll(/\son(?:error|click|load|submit)=["']/gi)].length
  if (handlers) add('script-src', "'unsafe-inline'", `${handlers} inline event handler(s)`)

  return need
}

let failed = 0
for (const path of PAGES) {
  const url = base + path
  let res, html
  try {
    res = await fetch(url, { redirect: 'follow' })
    html = await res.text()
  } catch (err) {
    console.log(`FAIL ${path} — could not fetch: ${err.message}`)
    failed++
    continue
  }

  const reportOnly = res.headers.get('content-security-policy-report-only')
  const enforced = res.headers.get('content-security-policy')
  const header = reportOnly || enforced
  const which = reportOnly ? 'report-only' : 'enforced'

  if (!header) {
    console.log(`FAIL ${path} — HTTP ${res.status}, no content policy at all`)
    failed++
    continue
  }

  const policy = parsePolicy(header)
  const problems = []
  for (const { directive, what, detail } of needsOf(html)) {
    const sources = effective(policy, directive)
    const ok = what.startsWith("'")
      ? (sources || []).includes(what)
      : allowsOrigin(sources, what)
    if (!ok) problems.push(`${directive} refuses ${what}  (${detail})`)
  }

  const seen = new Set()
  const unique = problems.filter((p) => !seen.has(p) && seen.add(p))
  if (unique.length) {
    failed++
    console.log(`FAIL ${path} — HTTP ${res.status}, ${which} policy, ${unique.length} not covered`)
    for (const p of unique) console.log(`       ${p}`)
  } else {
    console.log(`ok   ${path} — HTTP ${res.status}, ${which} policy covers this page`)
  }

  if (!policy['report-uri'] && !policy['report-to'] && !res.headers.get('reporting-endpoints'))
    console.log(`       note: nothing collects violations for this path — no report-uri, no report-to, no Reporting-Endpoints`)
}

console.log(failed ? `\n${failed} page(s) would break if this policy were enforced.` : '\nEvery page is covered by the policy served for its own path.')
process.exit(failed ? 1 : 0)
