/**
 * The feedback control, on every surface it now sits on.
 *
 * `npm test` covers what a note says on the wire (`src/feedback/point.test.ts`). This
 * covers what reading cannot: whether the button is in the bar on each route, whether a
 * second one turns up once the bar has scrolled away, whether pointing swallows the click
 * it takes, and — the defect this widget shipped with in its first life — whether it sits
 * on top of the Explorer's Send.
 *
 * **Nothing here files a report.** `POST …/problem-reports` is answered by the route below
 * and never reaches the worker; what the page tried to send is kept and checked.
 *
 *   node e2e/feedback.mjs
 *   E2E_BASE=http://localhost:5175/ragtime node e2e/feedback.mjs
 */
import { launch, ctxWith, log, SHOTS, BASE, EXPLORER, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const board = scoreboard('feedback')

/** A context whose report route is answered here, with the status a case asks for. */
async function ctxAnswering(browser, viewport, status = 201) {
  const ctx = await ctxWith(browser, { viewport })
  const sent = []
  await ctx.route('**/problem-reports', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } })
    }
    sent.push(JSON.parse(route.request().postData() || '{}'))
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(status === 201 ? { filed: true, report_id: 'stub' } : { error: { code: 'rate_limited' } }),
    })
  })
  return { ctx, sent }
}

const PANEL = '[data-feedback="panel"]'
const IN_BAR = '[data-feedback="open"]'
const AFLOAT = '[data-feedback="afloat"]'

const browser = await launch()

// ── The hub, at a desk: open, refuse an empty note, send a real one ───────────────────
{
  log('— hub, desktop —')
  const { ctx, sent } = await ctxAnswering(browser, DESKTOP)
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })

  board.check('the bar carries the button, with its word', (await page.locator(IN_BAR).innerText()).trim() === 'Feedback')
  board.check('no panel until it is asked for', (await page.locator(PANEL).count()) === 0)

  await page.click(IN_BAR)
  board.check('the button opens the panel', await page.locator(PANEL).isVisible())
  board.check('the note field has the focus', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'))

  await page.click(`${PANEL} button:has-text("Send")`)
  board.check('an empty note is refused in words', (await page.locator(`${PANEL} [role="alert"]`).innerText()).includes('few words'))
  board.check('and nothing was sent', sent.length === 0, sent)

  await page.fill(`${PANEL} textarea`, 'The collection count looks low.')
  await page.screenshot({ path: `${SHOTS}/feedback-hub-open.png` })
  await page.click(`${PANEL} button:has-text("Send")`)
  await page.waitForSelector(`${PANEL} [role="status"]`)
  board.check('the reader is thanked', (await page.locator(`${PANEL} [role="status"]`).innerText()).includes('Thank you'))
  board.check('one report went, in the route’s three words', sent.length === 1 && sent[0].summary === 'Site feedback: The collection count looks low.' && sent[0].observed === 'The collection count looks low.' && typeof sent[0].expected === 'string', sent)
  board.check('it says which page, and names this client', sent[0]?.detail?.startsWith('Page: /\nSurface: ragtime') && sent[0]?.client?.name === 'ragtime-web', sent[0])
  await page.screenshot({ path: `${SHOTS}/feedback-hub-sent.png` })

  // Escape closes it from inside; the button opens it again.
  await page.click(`${PANEL} button:has-text("Send another")`)
  await page.keyboard.press('Escape')
  board.check('Escape closes the panel from inside it', (await page.locator(PANEL).count()) === 0)
  await ctx.close()
}

// ── Pointing: the click is taken, not passed on ───────────────────────────────────────
{
  log('— pointing —')
  const { ctx, sent } = await ctxAnswering(browser, DESKTOP)
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.click(IN_BAR)
  await page.click(`${PANEL} button:has-text("Point at something")`)
  const before = page.url()
  // The Explorer link is the hardest thing in the bar to point at without leaving.
  await page.click('header a:has-text("Explorer")')
  await page.waitForTimeout(200)
  board.check('pointing at a link does not follow it', page.url() === before, page.url())
  board.check('the panel names what was pointed at', (await page.locator(`${PANEL} [title]`).count()) === 1)
  await page.fill(`${PANEL} textarea`, 'This link is easy to miss.')
  await page.screenshot({ path: `${SHOTS}/feedback-pointed.png` })
  await page.click(`${PANEL} button:has-text("Send")`)
  await page.waitForSelector(`${PANEL} [role="status"]`)
  board.check('the report carries the element and what it says', /Pointed at: .+\nIt says: Explorer/.test(sent[0]?.detail ?? ''), sent[0])
  await ctx.close()
}

// ── Scrolled: the bar has gone, so a second button has come ───────────────────────────
{
  log('— scrolled —')
  const { ctx } = await ctxAnswering(browser, DESKTOP)
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  board.check('no second button while the bar is on screen', (await page.locator(AFLOAT).count()) === 0)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(300)
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 200)
  if (scrolls) {
    board.check('a second button appears once the bar has scrolled away', await page.locator(AFLOAT).isVisible())
    await page.screenshot({ path: `${SHOTS}/feedback-afloat.png` })
    await page.click(AFLOAT)
    board.check('and it opens the same panel', await page.locator(PANEL).isVisible())
    const box = await page.locator(PANEL).boundingBox()
    board.check('which is on screen', box !== null && box.y >= 0 && box.y < 100, box)
  } else {
    log('  skip  the hub does not scroll at this size; nothing to check')
  }
  await ctx.close()
}

// ── A link that asks for the panel ────────────────────────────────────────────────────
{
  log('— ?feedback=1 —')
  const { ctx, sent } = await ctxAnswering(browser, DESKTOP)
  const page = await ctx.newPage()
  await page.goto(BASE + '/?feedback=1', { waitUntil: 'networkidle' })
  board.check('the panel is open on arrival', await page.locator(PANEL).isVisible())
  await page.fill(`${PANEL} textarea`, 'Opened from a link.')
  await page.click(`${PANEL} button:has-text("Send")`)
  await page.waitForSelector(`${PANEL} [role="status"]`)
  board.check('and the page it reports is the page, not the link', sent[0]?.detail?.startsWith('Page: /\n'), sent[0])
  await ctx.close()
}

// ── Too many: its own sentence ────────────────────────────────────────────────────────
{
  log('— 429 —')
  const { ctx } = await ctxAnswering(browser, DESKTOP, 429)
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.click(IN_BAR)
  await page.fill(`${PANEL} textarea`, 'One more.')
  await page.click(`${PANEL} button:has-text("Send")`)
  await page.waitForSelector(`${PANEL} [role="alert"]`)
  board.check('a refusal for volume says so', (await page.locator(`${PANEL} [role="alert"]`).innerText()).includes('Too many'))
  board.check('and keeps what was written', (await page.locator(`${PANEL} textarea`).inputValue()) === 'One more.')
  await ctx.close()
}

// ── The Explorer, on a phone: the button is there and Send is still Send ──────────────
for (const viewport of [PHONE, DESKTOP]) {
  log(`— explorer, ${viewport.width} —`)
  const { ctx } = await ctxAnswering(browser, viewport)
  const page = await ctx.newPage()
  await page.goto(EXPLORER, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  board.check('the bar carries the button', await page.locator(IN_BAR).isVisible())
  board.check('no second button: this bar never leaves', (await page.locator(AFLOAT).count()) === 0)
  const onSend = await page.evaluate(() => {
    const send = document.querySelector('.composer button.primary')
    if (!send) return 'no send button'
    const r = send.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return send.contains(top) ? 'send' : top?.outerHTML.slice(0, 80)
  })
  board.check('nothing sits on top of Send', onSend === 'send', onSend)
  await page.click(IN_BAR)
  const fits = await page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect()
    return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
  }, PANEL)
  board.check('the open panel fits the window', fits)
  await page.screenshot({ path: `${SHOTS}/feedback-explorer-${viewport.width}.png` })
  await ctx.close()
}

// ── A spoke, on a phone: the bar still holds one more control ─────────────────────────
{
  log('— a spoke, phone —')
  const { ctx } = await ctxAnswering(browser, PHONE)
  const page = await ctx.newPage()
  await page.goto(BASE + '/corpus/olc', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  board.check('the bar carries the button', await page.locator(IN_BAR).isVisible())
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  board.check('and the page does not scroll sideways for it', !wide)
  await page.screenshot({ path: `${SHOTS}/feedback-spoke-390.png` })
  await ctx.close()
}

await browser.close()
process.exit(board.report() === 0 ? 0 : 1)
