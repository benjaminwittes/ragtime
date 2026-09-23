/**
 * The pages this branch changed without being about them.
 *
 * The Explorer is a new route and could only break itself. The rest of this branch is not
 * additive: `AppLink` became one owner for in-app navigation and the masthead and
 * `BackToHubLink` were rewritten onto it, the worker client and its types moved to the
 * package, and the two band controls now abbreviate below `sm` — in every spoke header, not
 * only the Explorer's. So the hub and all eleven spokes render code that moved, and none of
 * them has been driven.
 *
 * What is checked on each: that it renders at all, that the masthead is there and its link
 * home is in-app rather than a full page load, that the header keeps to one row on a phone,
 * and that nothing is thrown. Corpus data comes from the live worker, so a spoke that needs
 * a credential to *search* still renders its shell, which is what changed here.
 *
 *   node e2e/spokes.mjs                 # a phone
 *   E2E_W=1440 node e2e/spokes.mjs      # and wider
 */
import { launch, ctxWith, log, SHOTS, BASE, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const W = Number(process.env.E2E_W || PHONE.width)
const viewport = W >= 700 ? { ...DESKTOP, width: W } : { ...PHONE, width: W }

const SPOKES = [
  'litigation', 'olc', 'usc', 'cfr', 'frus', 'commentary',
  'presidential', 'fr', 'congress', 'fbi', 'sanctions',
]

/** One row of these controls is 28px; a wrap makes it roughly twice that. */
const ONE_ROW_MAX = 44

function read() {
  const headers = [...document.querySelectorAll('header')]
  const masthead = headers[0] || null
  return {
    headers: headers.map((h) => Math.round(h.getBoundingClientRect().height)),
    /**
     * The row the two abbreviating controls sit in — not the header's height.
     *
     * A spoke's second header carries the whole search form, its filters and the corpus
     * description, so it is 300–500px tall by design and says nothing about whether
     * anything wrapped. What this branch changed is that "AI access" and "? Docs" shorten
     * below `sm`, so the question is whether the row *those* live in is still one row:
     * their nearest shared ancestor, and whether its children share a top edge.
     */
    controlRow: (() => {
      const btns = [...document.querySelectorAll('header button')]
      const access = btns.find((b) => /access/i.test(b.getAttribute('aria-label') || b.innerText))
      const docs = btns.find((b) => /documentation|docs/i.test(b.getAttribute('aria-label') || b.innerText))
      if (!access || !docs) return null
      let row = access.parentElement
      while (row && !row.contains(docs)) row = row.parentElement
      if (!row) return null
      const kids = [...row.children].map((c) => Math.round(c.getBoundingClientRect().y))
      // Clustered with a tolerance rather than compared exactly: controls on the same row
      // sit a pixel or two apart because they are different heights centred against each
      // other, and counting distinct tops calls that a wrap. A wrap moves things by the
      // height of a control, which is ~28px here.
      const tops = [...kids].sort((a, b) => a - b)
      const rows = tops.reduce((n, y, i) => (i === 0 || y - tops[i - 1] > 8 ? n + 1 : n), 0)
      return { rows, height: Math.round(row.getBoundingClientRect().height), kids }
    })(),
    // A real href, so cmd-click still opens a tab, and no `target` so a plain click
    // navigates in place. That pair is what AppLink exists to guarantee.
    mastheadHome: (() => {
      const a = masthead && masthead.querySelector('a[href]')
      return a ? { href: a.getAttribute('href'), target: a.getAttribute('target') } : null
    })(),
    hasAccess: [...document.querySelectorAll('header button')].some((b) => /access/i.test(b.getAttribute('aria-label') || b.innerText)),
    hasDocs: [...document.querySelectorAll('header button')].some((b) => /documentation|docs/i.test(b.getAttribute('aria-label') || b.innerText)),
    /** A white screen is the failure this whole sweep is for. */
    bodyText: document.body.innerText.trim().length,
    heading: (document.querySelector('h1, h2') || {}).innerText?.trim().slice(0, 60) ?? null,
  }
}

const board = scoreboard(`spokes @ ${W}`)
const browser = await launch()
const ctx = await ctxWith(browser, { viewport })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

log(`— ${W} —`)

for (const where of ['', ...SPOKES.map((s) => `/corpus/${s}`)]) {
  const url = BASE + (where || '/')
  const before = errors.length
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const r = await page.evaluate(read)
  const name = where || 'hub'

  board.check(`${name}: renders something`, r.bodyText > 200, { chars: r.bodyText, heading: r.heading })
  board.check(`${name}: the masthead links home in-app (href, no target)`, !!r.mastheadHome && !!r.mastheadHome.href && !r.mastheadHome.target, r.mastheadHome)
  board.check(`${name}: the access and docs controls are present`, r.hasAccess && r.hasDocs, { access: r.hasAccess, docs: r.hasDocs })
  /**
   * Height, not the tops of the children: inside one 28px row the controls sit up to 24px
   * apart because some are icons centred against text, and a wrap is the thing that makes
   * the row itself twice as tall (28 → ~64). Measuring the container is what tells the two
   * apart; measuring the children calls every centred icon a wrap.
   */
  board.check(
    `${name}: their row stays one row${r.controlRow ? ` (${r.controlRow.height}px)` : ''}`,
    !!r.controlRow && r.controlRow.height <= ONE_ROW_MAX,
    r.controlRow,
  )
  board.check(`${name}: threw nothing`, errors.length === before, errors.slice(before))
}

// And that the masthead actually navigates rather than reloading — the AppLink rewrite.
await page.goto(BASE + '/corpus/olc', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.evaluate(() => {
  window.__rtStillHere = true
})
const home = await page.$('header a[href]')
if (home) {
  await home.click()
  await page.waitForTimeout(900)
  const survived = await page.evaluate(() => ({ still: !!window.__rtStillHere, path: location.pathname }))
  board.check('the masthead navigates in place rather than reloading the document', survived.still === true, survived)
  board.check('and it lands on the hub', /\/ragtime\/?$/.test(survived.path), survived)
}

await page.screenshot({ path: `${SHOTS}/spokes-${W}-last.png` })
const failed = board.report()
await browser.close()
process.exit(failed ? 1 : 0)
