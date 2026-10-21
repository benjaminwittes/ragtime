/**
 * Reading back while the next answer comes in.
 *
 * A reader scrolled up to an earlier answer while the next was worked on, and the page
 * pulled them back to the end on every event of the turn, then again under the brush. This
 * holds the page to what it promises now: a reader who scrolls up is left where they are
 * for the rest of the turn, through the research, the painting and its end; a reader who
 * stays at the end is followed to it; and asking something takes the reader back there.
 *
 *   node e2e/follow.mjs                  # phone width
 *   E2E_W=1440 node e2e/follow.mjs       # desktop
 */
import { launch, ctxWith, conversation, log, SHOTS, EXPLORER, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const { check, report } = scoreboard('follow')
const wide = process.env.E2E_W === '1440'
const tag = wide ? 'desktop' : '390'
const browser = await launch()
const ctx = await ctxWith(browser, { viewport: wide ? DESKTOP : PHONE })
const page = await ctx.newPage()
page.on('pageerror', (e) => log('PAGE ERROR', e.message))

await page.goto(EXPLORER, { waitUntil: 'networkidle' })
const running = () => page.evaluate(() => !!document.querySelector('article.turn[data-running]') || !!document.querySelector('.brush[data-painting]'))
// The turn is over and its answer written. Every answer keeps its brush, so waiting on any
// brush that is not painting would be satisfied by the first answer's.
const done = () =>
  page.waitForFunction(() => !document.querySelector('article.turn[data-running]') && !document.querySelector('.brush[data-painting]'), null, { timeout: 20000 })

await conversation(page, 'Which OLC opinions discuss removing the head of an independent agency without cause?')
await done()

const where = () =>
  page.evaluate(() => {
    const s = document.querySelector('.explorer .left .scroll') || document.querySelector('.explorer .scroll')
    // At the end: the foot of the last turn is in view. What sits under it is padding, and
    // how much of that there is depends on the width.
    const turns = s.querySelectorAll('article.turn')
    const last = turns[turns.length - 1]
    const atEnd = !!last && last.getBoundingClientRect().bottom <= s.getBoundingClientRect().bottom + 2
    return { top: s.scrollTop, atEnd, room: s.scrollHeight - s.clientHeight }
  })
const ask = async (q) => {
  await page.fill('.composer textarea', q)
  await page.click('.composer button.primary')
}
const answered = async (q) => {
  await ask(q)
  await page.waitForSelector('article.turn[data-running]', { timeout: 8000 })
  await done()
  await page.waitForTimeout(300)
}

// 1. Stay at the end: the page follows the turn down to its end.
await answered('And which of them did a court later cite?')
const stayed = await where()
check('a reader who stays at the end is followed to it', stayed.atEnd, stayed)
// A desk is tall: give it enough of a conversation to read back through.
await answered('Which of them is still good law?')

// 2. Scroll up while the next answer is worked on: the page leaves the reader there.
await ask('Did any of them address the Federal Reserve?')
await page.waitForSelector('article.turn[data-running]', { timeout: 8000 })
await page.waitForTimeout(400)
const before = await where()
check('there is an earlier answer to scroll back to', before.room > 300, before)
await page.hover('.explorer .scroll')
await page.mouse.wheel(0, -100000)
await page.waitForTimeout(200)
const up = await where()
check('the reader got well away from the end', !up.atEnd && before.top - up.top > 300, up)

const tops = []
let sawRunning = false
let sawPainting = false
const t0 = Date.now()
while (Date.now() - t0 < 15000) {
  const busy = await running()
  if (busy) sawRunning = true
  if (await page.evaluate(() => !!document.querySelector('.brush[data-painting]'))) sawPainting = true
  tops.push((await where()).top)
  if (!busy && tops.length > 5) break
  await page.waitForTimeout(40)
}
await page.waitForTimeout(500)
tops.push((await where()).top)
await page.screenshot({ path: `${SHOTS}/follow-1-read-back-${tag}.png` })
check('the turn ran while the reader read back', sawRunning)
check('and its answer was painted in', sawPainting)
check('the page never moved the reader: through the research, the painting and its end', tops.every((t) => Math.abs(t - up.top) < 5), `left at ${up.top}, saw ${Math.min(...tops)}..${Math.max(...tops)} over ${tops.length} samples`)

// 3. A keyboard or a scrollbar is the reader too, not just a wheel: scroll up by setting it.
await ask('Which was the most recent?')
await page.waitForSelector('article.turn[data-running]', { timeout: 8000 })
await page.waitForTimeout(300)
await page.evaluate(() => {
  const s = document.querySelector('.explorer .scroll')
  s.scrollTop = Math.max(0, s.scrollTop - 400)
})
await page.waitForTimeout(100)
const held = (await where()).top
const tops2 = []
const t1 = Date.now()
while (Date.now() - t1 < 15000) {
  const busy = await running()
  tops2.push((await where()).top)
  if (!busy && tops2.length > 5) break
  await page.waitForTimeout(40)
}
await page.waitForTimeout(500)
tops2.push((await where()).top)
check('scrolling up without a wheel is left alone too', tops2.every((t) => Math.abs(t - held) < 5), `held ${held}, saw ${Math.min(...tops2)}..${Math.max(...tops2)}`)

// 4. Asking something takes the reader back to the end, to watch it answered.
await answered('Thanks. Any dissenting view inside OLC?')
const back = await where()
check('asking something takes the reader back to the end', back.atEnd, back)
await page.screenshot({ path: `${SHOTS}/follow-2-asked-${tag}.png` })

await ctx.close()
await browser.close()
process.exit(report() ? 1 : 0)
