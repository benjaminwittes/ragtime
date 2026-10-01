/**
 * The mark as the cursor: an answer is written in behind the five-line mark while it
 * arrives, and one restored from storage is just shown.
 *
 * Samples the page while the brush runs and holds it to what the design promises now: the
 * words are on the page before the turn has finished, the answer's box is never taller
 * than what has been written (no blank the size of the whole answer), the brush is done
 * within a moment of the last word arriving, nothing that has appeared goes back, the text
 * itself is untouched, the mark is left behind as the signature, the page follows the
 * brush, and a reload does not paint again.
 *
 *   node e2e/mark.mjs                    # phone width
 *   E2E_W=1440 node e2e/mark.mjs         # desktop
 */
import { launch, ctxWith, installStub, settle, log, SHOTS, EXPLORER, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const browser = await launch()
const wide = process.env.E2E_W === '1440'
const view = wide ? DESKTOP : PHONE
const tag = wide ? 'desktop' : '390'
const results = scoreboard ? scoreboard() : null
const fails = []
const check = (name, ok, detail = '') => {
  log(ok ? 'ok  ' : 'FAIL', name, detail)
  if (!ok) fails.push(name)
}

const ctx = await browser.newContext({
  viewport: view,
  deviceScaleFactor: 2,
  hasTouch: !wide,
  isMobile: !wide,
})
await ctx.addInitScript(() => {
  window.localStorage.setItem('ragtime_beta_access_v1', '1')
  window.localStorage.setItem('ragtime_demo_pw', 'stub-not-a-real-password')
})
await ctx.addInitScript(`(${installStub.toString()})()`)
await ctx.addInitScript(() => window.localStorage.setItem('__rt_scenario', 'research'))
const page = await ctx.newPage()
page.on('pageerror', (e) => log('PAGE ERROR', e.message))

await page.goto(EXPLORER, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  window.localStorage.setItem('__rt_scenario', 'research')
  window.localStorage.setItem('__rt_turn', '0')
})
await page.fill('.composer textarea', 'Which OLC opinions discuss removing the head of an independent agency without cause?')
await page.click('.composer button.primary')
await settle(page)
await page.click('button.primary:has-text("Research")')

// While research runs, the mark breathes where the dot was.
await page.waitForSelector('.working canvas.mark', { timeout: 8000 })
check('the working indicator is the mark', true)
await page.screenshot({ path: `${SHOTS}/mark-1-working-${tag}.png` })

// The answer arrives: sample until the brush is gone. The turn says something before its
// tool calls too, and that is written and then folded into its steps; the samples that
// count here are the ones of the answer itself.
await page.waitForFunction(() => document.querySelector('.brush')?.textContent.includes('Three opinions'), null, { timeout: 20000 })
const samples = []
const t0 = Date.now()
let shot = 0
while (Date.now() - t0 < 15000) {
  const s = await page.evaluate(() => {
    const b = document.querySelector('.brush')
    if (!b) return null
    const inner = b.querySelector('.brush-page')
    const g = b.querySelector('.brush-glyph')
    const m = g && /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(g.style.transform)
    const sig = b.querySelector('.mark-sig')
    return {
      at: performance.now(),
      painting: b.hasAttribute('data-painting'),
      // Every word is down and the mark is making its flourish.
      signing: b.getAttribute('data-painting') === 'signing',
      // The turn is over once what belongs under a finished answer is there.
      turnOver: !!document.querySelector('.answer .cost-line'),
      h: b.getBoundingClientRect().height,
      full: inner.scrollHeight,
      chars: inner.textContent.length,
      gx: m ? +m[1] : null,
      gy: m ? +m[2] : null,
      wrapped: b.querySelectorAll('[data-c]').length,
      masked: !!inner.style.getPropertyValue('mask-image') || !!inner.style.getPropertyValue('-webkit-mask-image'),
      glyphBottom: g ? g.getBoundingClientRect().bottom : null,
      vh: window.innerHeight,
      sigHidden: sig ? getComputedStyle(sig).visibility === 'hidden' : null,
    }
  })
  if (!s) break
  samples.push(s)
  if (samples.length === 3 + shot * 5 && shot < 2) {
    await page.screenshot({ path: `${SHOTS}/mark-2-painting-${shot}-${tag}.png` })
    shot++
  }
  if (!s.painting) break
  await page.waitForTimeout(30)
}
const painted = samples.filter((s) => s.painting)
check('the brush ran', painted.length > 3, `${painted.length} samples`)
const early = painted.filter((s) => !s.turnOver)
check('the answer is being written before the turn has finished', early.length > 0 && early.some((s) => s.h > 10 && s.chars > 20), `${early.length} samples while the turn ran`)
const last = samples.at(-1)
check('its box is never the size of the whole answer before the answer is written: it grows', painted[0].h < last.h * 0.7, `${Math.round(painted[0].h)}px at first, ${Math.round(last.h)}px at the end`)
check('and is never taller than what has been laid out', samples.every((s) => s.h <= s.full + 6))
const grows = painted.every((s, i) => i === 0 || s.h >= painted[i - 1].h - 1)
check('what has been written never goes back', grows, painted.map((s) => Math.round(s.h)).join(' '))
const over = samples.find((s) => s.turnOver)
const written = samples.find((s) => s.signing || !s.painting)
check('every word is down within a moment of the last one arriving', !!over && !!written && written.at - over.at < 700, over && written ? `${Math.round(written.at - over.at)}ms after the turn ended` : 'never finished')
const first = painted[0]
check('and the whole answer is written in about as long as it took to arrive', !!written && written.at - first.at < 1600, written ? `${Math.round(written.at - first.at)}ms from its first word to its last` : '')
check('the text is not taken apart: no letter is wrapped, the page stays the app\u2019s own', samples.every((s) => s.wrapped === 0))
check('what is not yet written is masked, not laid out blank', painted.some((s) => s.masked))
check('the signature is hidden while the brush writes', painted.every((s) => s.sigHidden !== false))
const ys = painted.map((s) => s.gy).filter((y) => y !== null)
const distinct = [...new Set(ys.map((y) => Math.round(y)))]
check('the glyph sits on a line: it takes a few heights, not one per sample', distinct.length <= 14, `${distinct.length} heights over ${painted.length} samples`)
check('the glyph stays in view (the page follows the brush when it must)', painted.every((s) => s.glyphBottom === null || s.glyphBottom <= s.vh + 2))

await page.waitForSelector('.brush:not([data-painting])', { timeout: 10000 })
const end = await page.evaluate(() => {
  const b = document.querySelector('.brush')
  const inner = b.querySelector('.brush-page')
  const sig = b.querySelector('.mark-sig')
  const r = sig.getBoundingClientRect()
  const tail = sig.closest('.mark-tail')
  return {
    clean: !inner.style.maxHeight && !inner.style.overflow && !inner.style.getPropertyValue('mask-image') && !inner.style.getPropertyValue('-webkit-mask-image'),
    whole: Math.abs(b.getBoundingClientRect().height - inner.scrollHeight) < 2,
    sigVisible: getComputedStyle(sig).visibility === 'visible' && r.width > 0,
    canvasGone: !b.querySelector('.brush-glyph') && !b.querySelector('.brush-wash'),
    text: b.textContent.replace(/\s+/g, ' ').trim(),
    tailWord: tail ? tail.textContent : null,
    sigTop: r.top,
    tailTop: tail ? tail.getBoundingClientRect().top : null,
    under: !!document.querySelector('.answer .cost-line'),
  }
})
check('when it is done nothing of the brush is left on the answer', end.clean && end.whole, JSON.stringify({ clean: end.clean, whole: end.whole }))
check('the mark is left as the signature', end.sigVisible && end.canvasGone)
check('the text is whole', end.text.includes('Three opinions are on point') && end.text.endsWith('removal-power') === false && end.text.includes('Lawfare'), end.text.slice(0, 80))
check('the glyph is held with the last word', end.tailWord && end.tailWord.length > 0 && Math.abs(end.sigTop - end.tailTop) < 30, JSON.stringify({ w: end.tailWord }))
check('the cost and the sources are under the finished answer', end.under)
await page.screenshot({ path: `${SHOTS}/mark-3-signature-${tag}.png` })

// A reload restores the conversation; the answer is shown, not painted.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const restored = await page.evaluate(() => ({
  brush: !!document.querySelector('.brush'),
  letters: document.querySelectorAll('[data-c]').length,
  sig: !!document.querySelector('.answer .mark-sig'),
  answer: !!document.querySelector('.answer'),
}))
check('a restored answer is shown, not painted', restored.answer && !restored.brush && restored.letters === 0, JSON.stringify(restored))
check('a restored answer still carries the signature', restored.sig)
await page.screenshot({ path: `${SHOTS}/mark-4-restored-${tag}.png` })

await ctx.close()
await browser.close()
if (results?.report) results.report()
if (fails.length) {
  log('FAILED:', fails.join('; '))
  process.exit(1)
}
log('all passed')
