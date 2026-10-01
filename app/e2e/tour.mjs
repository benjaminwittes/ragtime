/**
 * The guided tour, walked from the first step to the last at a desk and on a phone.
 *
 * `npm test` holds the words and the arithmetic (`src/tour/steps.test.ts`). This holds
 * what only a page can say: whether each step finds the control it names, whether the
 * ring is round that control and not beside it, whether the card is on the screen at
 * every step — the collections list is taller than any window, and the bar's controls
 * are hard against the right edge on a phone — and whether a tour started on a spoke
 * gets itself to the hub and carries on.
 *
 * Nothing here spends and nothing here files anything: the tour makes no request at all.
 *
 *   node e2e/tour.mjs
 *   E2E_BASE=http://localhost:5175/ragtime node e2e/tour.mjs
 */
import { launch, ctxWith, log, SHOTS, BASE, EXPLORER, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const board = scoreboard('tour')

const CARD = '[data-tour="card"]'
const RING = '[data-tour="ring"]'
const SCRIM = '[data-tour="scrim"]'

/**
 * The steps, by name, with what each points at. Spelled out here rather than imported
 * from `src/tour/steps.ts` on purpose: a driver that read the selectors from the code
 * under test would pass whatever they were changed to.
 */
const WALK = [
  { id: 'welcome', target: null },
  { id: 'search', target: '#hub-ask form' },
  { id: 'modes', target: '[role="tablist"][aria-label="What the box does"]' },
  { id: 'collections', target: '#corpora' },
  { id: 'access', target: 'button[aria-label="Configure AI access"]' },
  { id: 'docs', target: 'button[aria-label="Open documentation overlay"]' },
  { id: 'feedback', target: '[data-feedback="open"]' },
  { id: 'claude', target: null },
]

/** The card visible and placed for the named step. */
async function onStep(page, id) {
  await page.waitForFunction(
    ([sel, step]) => {
      const card = document.querySelector(sel)
      return card?.getAttribute('data-tour-step') === step && getComputedStyle(card).opacity === '1'
    },
    [CARD, id],
    { timeout: 5000 },
  )
  // Two frames more: the ring is re-read from its target every frame, and the frame the
  // card became visible on may be the one before a scroll it asked for has landed.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

/** The same, as a check: a step that never arrives is a failure with a name, not a stack. */
async function arrives(page, id, what) {
  try {
    await onStep(page, id)
    return board.check(what, true)
  } catch {
    return board.check(what, false, await page.locator(CARD).getAttribute('data-tour-step').catch(() => null))
  }
}

/** Where the card, the ring and the step's target are, in the window's coordinates. */
async function measure(page, target) {
  return page.evaluate(
    ([cardSel, ringSel, scrimSel, targetSel]) => {
      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
      }
      return {
        card: box(document.querySelector(cardSel)),
        ring: box(document.querySelector(ringSel)),
        scrim: !!document.querySelector(scrimSel),
        target: targetSel ? box(document.querySelector(targetSel)) : null,
        window: { width: window.innerWidth, height: window.innerHeight },
        counter: document.querySelector(cardSel)?.querySelector('span.font-mono')?.textContent ?? '',
      }
    },
    [CARD, RING, SCRIM, target],
  )
}

/** The ring stands 4px off its target on every side; a pixel of slack for rounding. */
function ringIsRound(m) {
  if (!m.ring || !m.target) return false
  const off = 4
  const near = (a, b) => Math.abs(a - b) <= 1.5
  return (
    near(m.ring.top, m.target.top - off) &&
    near(m.ring.left, m.target.left - off) &&
    near(m.ring.width, m.target.width + off * 2) &&
    near(m.ring.height, m.target.height + off * 2)
  )
}

function cardIsOnScreen(m) {
  const c = m.card
  return !!c && c.top >= 0 && c.left >= 0 && c.right <= m.window.width && c.bottom <= m.window.height
}

const browser = await launch()

// ── The whole walk, at both widths ────────────────────────────────────────────────────
for (const viewport of [DESKTOP, PHONE]) {
  const w = viewport.width
  log(`— the walk, ${w} —`)
  const ctx = await ctxWith(browser, { viewport })
  const page = await ctx.newPage()
  await page.goto(BASE + '/?tour=1', { waitUntil: 'networkidle' })

  for (const [i, step] of WALK.entries()) {
    try {
      await onStep(page, step.id)
    } catch {
      board.check(`${step.id}: the step arrives`, false, await page.locator(CARD).getAttribute('data-tour-step').catch(() => null))
      break
    }
    const m = await measure(page, step.target)
    board.check(`${step.id}: counts ${i + 1} of ${WALK.length}`, m.counter === `${i + 1} of ${WALK.length}`, m.counter)
    board.check(`${step.id}: the card is wholly on screen`, cardIsOnScreen(m), { card: m.card, window: m.window })
    if (step.target) {
      board.check(`${step.id}: its target is on the page`, m.target !== null && m.target.width > 0)
      board.check(`${step.id}: the ring is round the target`, ringIsRound(m), { ring: m.ring, target: m.target })
      board.check(`${step.id}: the target's top is on screen`, m.target !== null && m.target.top >= 0 && m.target.top < m.window.height, m.target)
    } else {
      board.check(`${step.id}: nothing to point at, so no ring and the whole page dims`, m.ring === null && m.scrim)
    }
    await page.screenshot({ path: `${SHOTS}/tour-${w}-${i + 1}-${step.id}.png` })
    if (i < WALK.length - 1) await page.click(`${CARD} button:has-text("Next")`)
  }

  // The last step's button is Done, its link is a real address, and ending tidies up.
  const href = await page.locator(`${CARD} a`).getAttribute('href').catch(() => null)
  board.check('the last step links to the docs entry by its address', typeof href === 'string' && href.endsWith('/?docs=connecting-claude'), href)
  board.check('the address still carries the request while the tour runs', page.url().includes('tour=1'), page.url())
  await page.click(`${CARD} button:has-text("Done")`)
  board.check('Done ends the tour', (await page.locator(CARD).count()) === 0)
  board.check('and takes the request out of the address', !page.url().includes('tour='), page.url())
  await page.reload({ waitUntil: 'networkidle' })
  board.check('so a reload does not start it again', (await page.locator(CARD).count()) === 0)
  await ctx.close()
}

// ── Back, the arrow keys, Escape, and the page staying usable ─────────────────────────
{
  log('— moving about —')
  const ctx = await ctxWith(browser, { viewport: DESKTOP })
  const page = await ctx.newPage()
  await page.goto(BASE + '/?tour=1', { waitUntil: 'networkidle' })
  await onStep(page, 'welcome')
  board.check('the first step has no Back', (await page.locator(`${CARD} button:has-text("Back")`).count()) === 0)
  await page.keyboard.press('Enter')
  await arrives(page, 'search', 'Enter moves on: the card’s button has the focus')
  await page.keyboard.press('ArrowRight')
  await arrives(page, 'modes', 'the right arrow moves on')
  await page.keyboard.press('ArrowLeft')
  await arrives(page, 'search', 'the left arrow goes back')
  await page.click(`${CARD} button:has-text("Back")`)
  await arrives(page, 'welcome', 'and so does Back')

  // The page under the tour still works: the box can be typed in, and typing an arrow
  // there moves the caret rather than the tour.
  await page.click(`${CARD} button:has-text("Next")`)
  await onStep(page, 'search')
  await page.click('#hub-ask input')
  await page.keyboard.type('habeas')
  await page.keyboard.press('ArrowLeft')
  board.check('the box under the ring takes typing', (await page.locator('#hub-ask input').inputValue()) === 'habeas')
  board.check('and an arrow typed there does not move the tour', (await page.locator(CARD).getAttribute('data-tour-step')) === 'search')
  await page.locator('#hub-ask input').fill('')

  // A sheet opened over the tour owns the keyboard; the tour is there when it closes.
  await page.click(`${CARD} strong`)
  await page.keyboard.press('?')
  await page.waitForSelector('[data-slot="sheet-content"]')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-slot="sheet-content"]', { state: 'detached' })
  board.check('Escape with the docs open closes the docs, not the tour', (await page.locator(CARD).getAttribute('data-tour-step')) === 'search')

  await page.click(`${CARD} strong`)
  await page.keyboard.press('Escape')
  board.check('Escape ends the tour', (await page.locator(CARD).count()) === 0)
  board.check('and takes the request out of the address', !page.url().includes('tour='), page.url())
  await ctx.close()
}

// ── Started from a spoke: the second step is on the hub, and the tour gets itself there ─
{
  log('— from a spoke —')
  const ctx = await ctxWith(browser, { viewport: DESKTOP })
  const page = await ctx.newPage()
  await page.goto(BASE + '/corpus/olc?tour=1', { waitUntil: 'networkidle' })
  await onStep(page, 'welcome')
  board.check('the tour starts on the page the link named', new URL(page.url()).pathname.endsWith('/corpus/olc'))
  await page.click(`${CARD} button:has-text("Next")`)
  try {
    await onStep(page, 'search')
    const m = await measure(page, '#hub-ask form')
    board.check('the next step is on the hub', new URL(page.url()).pathname.replace(/\/$/, '').endsWith('/ragtime') || new URL(page.url()).pathname === '/', page.url())
    board.check('and it found the box there', ringIsRound(m), { ring: m.ring, target: m.target })
  } catch {
    board.check('the step after the route change arrives', false, page.url())
  }
  await page.screenshot({ path: `${SHOTS}/tour-from-spoke.png` })
  await ctx.close()
}

// ── The hub's own way in, and a link pushed into the address without a reload ─────────
{
  log('— the other ways in —')
  const ctx = await ctxWith(browser, { viewport: PHONE })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  board.check('no tour until it is asked for', (await page.locator(CARD).count()) === 0)
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  board.check('the hub’s link does not make the page scroll sideways', !wide)
  await page.click('[data-tour="start"]')
  await arrives(page, 'welcome', '“Take the tour” on the hub starts it')
  await page.click(`${CARD} button[aria-label="End the tour"]`)
  board.check('× ends it', (await page.locator(CARD).count()) === 0)

  // What an in-app link does: pushState, then the popstate the router listens for.
  await page.evaluate(() => {
    history.pushState(null, '', location.pathname + '?tour=1')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await arrives(page, 'welcome', 'an in-app link carrying ?tour starts it without a reload')
  await page.click(`${CARD} button:has-text("Next")`)
  await onStep(page, 'search')
  await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate')))
  await page.waitForTimeout(200)
  board.check('and does not send a running tour back to the start', (await page.locator(CARD).getAttribute('data-tour-step')) === 'search')
  await ctx.close()
}

// ── The Explorer: the tour may be up, and Send is still Send ──────────────────────────
for (const viewport of [PHONE, DESKTOP]) {
  log(`— explorer, ${viewport.width} —`)
  const ctx = await ctxWith(browser, { viewport })
  const page = await ctx.newPage()
  const sendIsOnTop = () =>
    page.evaluate(() => {
      const send = document.querySelector('.composer button.primary')
      if (!send) return 'no send button'
      const r = send.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return send.contains(top) ? 'send' : top?.outerHTML.slice(0, 80)
    })

  await page.goto(EXPLORER, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  board.check('no tour on the Explorer unless asked for', (await page.locator(CARD).count()) === 0)

  await page.goto(EXPLORER + '?tour=1', { waitUntil: 'networkidle' })
  await onStep(page, 'welcome')
  const m = await measure(page, null)
  board.check('the tour’s first card is on screen there', cardIsOnScreen(m), { card: m.card, window: m.window })
  const onSend = await sendIsOnTop()
  board.check('nothing sits on top of Send while the tour is up', onSend === 'send', onSend)
  await page.screenshot({ path: `${SHOTS}/tour-explorer-${viewport.width}.png` })
  await ctx.close()
}

await browser.close()
process.exit(board.report() === 0 ? 0 : 1)
