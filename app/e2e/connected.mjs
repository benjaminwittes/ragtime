/**
 * Google Books, the one source connected to RAGtime, as a reader meets it in the Explorer.
 *
 * It used to be invisible: a brief could name only corpora, so a reader never saw that a
 * question about a quotation would read Google Books, and a round that did read it looked
 * like any other. Now the brief card lists it under "Connected to RAGtime" (removable,
 * never among the corpora), the trail labels the round "Google Books" with its disclosure,
 * and the answer links the Google volume out while the catalogue record stays in-app.
 *
 *   node e2e/connected.mjs                 # a phone
 *   E2E_W=1440 node e2e/connected.mjs      # and the desktop width
 */
import { launch, ctxWith, settle, log, SHOTS, EXPLORER, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const W = Number(process.env.E2E_W || PHONE.width)
const viewport = W >= 700 ? { ...DESKTOP, width: W } : { ...PHONE, width: W }
const board = scoreboard(`connected @ ${W}`)
const { check } = board

const browser = await launch()
const ctx = await ctxWith(browser, { viewport, scenario: 'googlebooks' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(EXPLORER, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  window.localStorage.setItem('__rt_scenario', 'googlebooks')
  window.localStorage.setItem('__rt_turn', '0')
})
await page.fill('.composer textarea', "Where does 'the law is a ass' come from?")
await page.click('.composer button.primary')
await settle(page)

// 1. The proposed brief: Google Books in its own row, labelled, and not a corpus chip.
const card = async () => page.evaluate(() => (document.querySelector('.brief') || {}).textContent ?? '')
let t = await card()
check('brief card has a "Connected to RAGtime" row', /Connected to RAGtime/.test(t), t.slice(0, 300))
check('Google Books reads as a connected source, snippets only', t.includes('Google Books — connected source, snippets only'))
check('the card says RAGtime does not hold it', /RAGtime does not hold it/.test(t))
check('Google Books is not offered as a corpus to add', await page.locator('select.chip-add option', { hasText: 'Google Books' }).count() === 0)
check('the brief JSON carries connected', /"connected":\s*\[\s*"google_books"\s*\]/.test(await page.evaluate(() => (document.querySelector('.brief-json pre') || {}).textContent ?? '')))
await page.screenshot({ path: `${SHOTS}/connected-1-brief-${W}.png` })

// 2. Removable, and back again: only what the worker offered can be re-added.
await page.click('.brief button[aria-label="Remove Google Books"]')
t = await card()
check('removing Google Books leaves it re-addable', /\+ Google Books/.test(t))
check('the JSON drops connected when it is removed', !/"connected"/.test(await page.evaluate(() => (document.querySelector('.brief-json pre') || {}).textContent ?? '')))
await page.click('.brief button.chip-choice:has-text("Google Books")')
check('re-adding puts it back', (await card()).includes('Google Books — connected source, snippets only'))

// 3. Research, then the trail.
await page.click('button.primary:has-text("Research")')
await settle(page)
const answer = await page.evaluate(() => [...document.querySelectorAll('.answer a')].map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent })))
const gbLink = answer.find((a) => (a.href || '').startsWith('https://books.google.com/'))
check('the Google volume is an external link that opens a new tab', !!gbLink && gbLink.target === '_blank', answer)
check('the catalogue citation stays in-app, on the books spoke', answer.some((a) => /\/corpus\/books\/8812$/.test(a.href || '') && a.target !== '_blank'), answer)

await page.click('header button[aria-controls="trail"]')
await page.waitForTimeout(400)
const trail = await page.evaluate(() => (document.querySelector('#trail') || {}).textContent ?? '')
check('the trail names the round Google Books', /Google Books/.test(trail))
check('the trail labels it connected to RAGtime, not held', /connected to RAGtime, not held by it/.test(trail), trail.slice(0, 400))
check('the trail shows the disclosure', trail.includes('When I use Google Books I am limited'))
await page.screenshot({ path: `${SHOTS}/connected-2-trail-${W}.png` })

check('no page errors', errors.length === 0, errors)
log('screenshots in', SHOTS)
await ctx.close()
await browser.close()
process.exit(board.report() ? 1 : 0)
