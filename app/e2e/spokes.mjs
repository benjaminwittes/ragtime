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
import { launch, ctxWith, log, SHOTS, BASE, PHONE, DESKTOP, scoreboard, rowShape } from './harness.mjs'

const W = Number(process.env.E2E_W || PHONE.width)
const viewport = W >= 700 ? { ...DESKTOP, width: W } : { ...PHONE, width: W }

const SPOKES = [
  'litigation', 'olc', 'usc', 'cfr', 'frus', 'commentary',
  'presidential', 'fr', 'congress', 'fbi', 'sanctions', 'books',
]

/**
 * The row the two abbreviating controls sit in: their nearest shared ancestor, which is
 * the site bar's one wrapping row now that those controls live there. Found from the
 * controls rather than named, so the check follows them if they move again. Run in the
 * page (`rowShape` in the harness says what is measured on it, and why).
 */
const controlRow = () => {
  const btns = [...document.querySelectorAll('header button')]
  const access = btns.find((b) => /access/i.test(b.getAttribute('aria-label') || b.innerText))
  const docs = btns.find((b) => /documentation|docs/i.test(b.getAttribute('aria-label') || b.innerText))
  if (!access || !docs) return null
  let row = access.parentElement
  while (row && !row.contains(docs)) row = row.parentElement
  return row
}

function read() {
  const headers = [...document.querySelectorAll('header')]
  const masthead = headers[0] || null
  return {
    headers: headers.map((h) => Math.round(h.getBoundingClientRect().height)),
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
  const row = await rowShape(page, controlRow)
  const name = where || 'hub'

  board.check(`${name}: renders something`, r.bodyText > 200, { chars: r.bodyText, heading: r.heading })
  board.check(`${name}: the masthead links home in-app (href, no target)`, !!r.mastheadHome && !!r.mastheadHome.href && !r.mastheadHome.target, r.mastheadHome)
  board.check(`${name}: the access and docs controls are present`, r.hasAccess && r.hasDocs, { access: r.hasAccess, docs: r.hasDocs })
  /**
   * The row itself, not the tops of its children: inside one row the controls sit up to
   * 24px apart because some are icons centred against text, and comparing tops calls every
   * one of those a wrap. Nor a fixed height for the row, which is what this was until the
   * bar's padding grew and thirteen rows that had not wrapped failed for being 52px. What
   * is asked is how many lines the children fall into and how tall the row is without its
   * padding.
   */
  board.check(
    `${name}: their row stays one row${row ? ` (${row.height}px, ${row.lines} line${row.lines === 1 ? '' : 's'})` : ''}`,
    !!row && row.oneRow,
    row,
  )
  board.check(`${name}: threw nothing`, errors.length === before, errors.slice(before))
}

// A collection page's results as ground: a second view of the rows the table holds, drawn
// from those rows. The search is the live worker's, like everything else here.
{
  const asked = []
  page.on('request', (request) => {
    if (request.url().includes('/corpus/olc/filter')) asked.push(request.url())
  })
  await page.goto(BASE + '/corpus/olc?q=habeas+corpus', { waitUntil: 'networkidle' })
  const offered = await page.waitForSelector('[data-results-view]', { timeout: 20000 }).then(
    () => true,
    () => false,
  )
  // No rows, no switch: the worker allows an address that is not signed in ten searches a
  // minute, so a run straight after another can be refused. What the page said is printed.
  board.check(
    'olc: a search offers the table and the terrain, and opens on the table',
    offered && (await page.getAttribute('[data-results-view]', 'data-results-view')) === 'table',
    offered ? undefined : { asked: asked.length, pageSaid: (await page.locator('body').innerText()).slice(-240) },
  )
  if (offered) {
    const rows = await page.locator('table tbody tr').count()
    const before = asked.length
    await page.click('[data-results-view] button:has-text("Terrain")')
    await page.waitForSelector('[data-results-terrain] .terrain-cell', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const columns = await page.locator('[data-terrain="cells"] .terrain-cell').count()
    board.check('olc: the terrain draws the rows the table held', columns > 0 && columns === Math.min(rows, 60), { rows, columns })
    board.check('olc: and asks the service for nothing more', asked.length === before, asked.slice(before))
    board.check('olc: it has no heading of its own, the page has said what was asked', (await page.locator('[data-results-terrain] h1').count()) === 0)
    // The first click reads the label where there is no pointer to point with; the next opens it.
    const top = page.locator('[data-terrain="cells"] .terrain-cell [data-part="top"]').last()
    const tabs = page.context().pages().length
    await top.click({ force: true })
    if ((await page.locator('[role="dialog"]').count()) === 0) await top.click({ force: true })
    await page.waitForTimeout(800)
    board.check('olc: a column opens the page’s own sheet, not another tab', (await page.locator('[role="dialog"]').count()) === 1 && page.context().pages().length === tabs)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await page.click('[data-results-view] button:has-text("Table")')
    board.check('olc: and the table comes back with its rows', (await page.locator('table tbody tr').count()) === rows && (await page.locator('[data-results-terrain]').count()) === 0)
  }
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
