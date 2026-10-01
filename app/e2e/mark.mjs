/**
 * The mark as the cursor: an answer that arrives while the reader watches is painted in behind
 * the five-line mark, and one restored from storage is just shown.
 *
 * Samples the page while the brush runs and holds it to what the design promised: the answer's
 * box never changes size (nothing reflows), the glyph keeps one height per line (it cannot
 * wobble), every letter is ink at the end, the mark is left behind as the signature, the page
 * follows the brush, and a reload does not paint again.
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

// The answer arrives: sample until the brush is gone.
await page.waitForSelector('.brush[data-painting]', { timeout: 20000 })
const samples = []
const t0 = Date.now()
let shot = 0
while (Date.now() - t0 < 15000) {
  const s = await page.evaluate(() => {
    const b = document.querySelector('.brush')
    if (!b) return null
    const g = b.querySelector('.brush-glyph')
    const letters = [...b.querySelectorAll('[data-c]')]
    let hidden = 0
    let teal = 0
    let ink = 0
    for (const l of letters) {
      const o = parseFloat(l.style.opacity)
      if (o < 0.02) hidden++
      else if (l.style.color) teal++
      else ink++
    }
    const m = g && /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(g.style.transform)
    return {
      painting: b.hasAttribute('data-painting'),
      h: b.getBoundingClientRect().height,
      gx: m ? +m[1] : null,
      gy: m ? +m[2] : null,
      glyphOpacity: g ? +g.style.opacity : null,
      hidden,
      teal,
      ink,
      n: letters.length,
      scrollY: window.scrollY,
      glyphBottom: g ? g.getBoundingClientRect().bottom : null,
      vh: window.innerHeight,
      sigHidden: getComputedStyle(b.querySelector('.mark-sig')).visibility === 'hidden',
    }
  })
  if (!s) break
  samples.push(s)
  if (samples.length === 6 + shot * 12 && shot < 2) {
    await page.screenshot({ path: `${SHOTS}/mark-2-painting-${shot}-${tag}.png` })
    shot++
  }
  if (!s.painting) break
  await page.waitForTimeout(80)
}
const painted = samples.filter((s) => s.painting)
check('the brush ran', painted.length > 5, `${painted.length} samples`)
const heights = new Set(samples.map((s) => Math.round(s.h * 10)))
check('nothing reflows: the answer keeps one height', heights.size === 1, [...heights].map((h) => h / 10).join(', '))
check('the signature is hidden while the brush paints', painted.every((s) => s.sigHidden))
const ys = painted.map((s) => s.gy).filter((y) => y !== null)
const distinct = [...new Set(ys.map((y) => Math.round(y * 100) / 100))]
check('the glyph keeps one height per line', distinct.length <= Math.ceil(painted[0].n / 28) + 3, `${distinct.length} heights over ${painted[0].n} letters`)
const mono = painted.every((s, i) => i === 0 || s.hidden <= painted[i - 1].hidden)
check('a letter that has appeared never goes back', mono)
const startedHidden = painted[0].hidden / painted[0].n
check('the answer starts hidden', startedHidden > 0.8, `${Math.round(startedHidden * 100)}% hidden at first sample`)
const sawTeal = painted.some((s) => s.teal > 0)
check('letters wear the mark colour on the way in', sawTeal)
check('the glyph stays in view (the page follows the brush when it must)', painted.every((s) => s.glyphBottom === null || s.glyphBottom <= s.vh + 2), `scroll ${painted[0].scrollY} → ${painted.at(-1).scrollY}`)

await page.waitForSelector('.brush:not([data-painting])', { timeout: 10000 })
const end = await page.evaluate(() => {
  const b = document.querySelector('.brush')
  const letters = [...b.querySelectorAll('[data-c]')]
  const sig = b.querySelector('.mark-sig')
  const r = sig.getBoundingClientRect()
  const tail = sig.closest('.mark-tail')
  return {
    allInk: letters.every((l) => l.style.opacity === '1' && l.style.color === ''),
    sigVisible: getComputedStyle(sig).visibility === 'visible' && r.width > 0,
    canvasGone: !b.querySelector('.brush-glyph'),
    text: b.textContent.replace(/\s+/g, ' ').trim(),
    tailWord: tail ? tail.textContent : null,
    sigTop: r.top,
    tailTop: tail ? tail.getBoundingClientRect().top : null,
  }
})
check('every letter ends as ink', end.allInk)
check('the mark is left as the signature', end.sigVisible && end.canvasGone)
check('the text is whole', end.text.includes('Three opinions are on point') && end.text.endsWith('removal-power') === false && end.text.includes('Lawfare'), end.text.slice(0, 80))
check('the glyph is held with the last word', end.tailWord && end.tailWord.length > 0 && Math.abs(end.sigTop - end.tailTop) < 30, JSON.stringify({ w: end.tailWord }))
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
