/**
 * Whether the band keeps to one row, in every state its trail control can be in.
 *
 * At 390 the row runs out, and the control that goes hot is the one carrying a number —
 * so the states where the band has something to say were the states where it did not fit,
 * and it wrapped onto a second row at exactly the wrong moment. The labels are short below
 * `sm` for that reason; this is what holds them short.
 *
 * The band's budget for that control was found by widening its label until the row wrapped:
 * somewhere between 74 and 85px. `--candidates` re-runs that measurement, which is how to
 * decide whether a new wording fits without shipping it to a phone first.
 *
 *   node e2e/band.mjs                    # a phone, every state
 *   E2E_W=1440 node e2e/band.mjs         # the full wording, at the width that has room
 *   node e2e/band.mjs --candidates       # measure wordings before choosing one
 */
import { launch, ctxWith, log, SHOTS, EXPLORER, PHONE, scoreboard } from './harness.mjs'

const W = Number(process.env.E2E_W || PHONE.width)
const CANDIDATES_MODE = process.argv.includes('--candidates')

/**
 * One finished turn, carrying the cost event the band's label is computed from.
 *
 * Returned as script *source* with the conversation inlined, not as a closure: an init
 * script is serialised and run in the page, so a function closing over a variable here
 * arrives there with that variable undefined and silently seeds nothing.
 */
function seedOf({ spend, cap, ipCalls, ipCap }) {
  const blob = JSON.stringify({
    v: 1,
    turns: [{
      index: 1, phase: 'research', prompt: 'test', promptKind: 'ask', narration: [], answer: 'an answer',
      question: null, brief: null, rounds: [], handoffs: [],
      costs: [{ type: 'cost', turn_cents: 1, conversation_cents: spend, conversation_spend: spend, cap_cents: cap, steps: 1, step_cap: 12, ip_calls: ipCalls, ip_cap: ipCap }],
      error: null, stop: 'end_turn', calls: 1, startedAt: 1, endedAt: 2, running: false, lastEvent: null, buffer: '',
    }],
    brief: null, proposed: null, pinned: [], messages: [{ role: 'user', content: 'x' }], envelope: 'e',
    savedAt: Date.now(), workedAt: Date.now(),
  })
  return `window.localStorage.setItem('ragtime_explorer_conversation_v1', ${JSON.stringify(blob)})`
}

const STATES = [
  { name: 'at rest', state: { spend: 1, cap: 25, ipCalls: 2, ipCap: 60 } },
  { name: 'conversation near its cap', state: { spend: 21, cap: 25, ipCalls: 2, ipCap: 60 } },
  { name: 'allowance filling', state: { spend: 1, cap: 25, ipCalls: 54, ipCap: 60 } },
]

/**
 * The fourth state needs a refusal to reach, so its wording is forced into the live
 * control and the row re-measured. Forcing text into a rendered button measures the
 * layout, which is the only thing this file asks about.
 */
const FORCED = 'Used up'

/** Band height is the signal: one row is ~53px on a phone, and a wrap costs ~36 more. */
const ONE_ROW_MAX = 60

function measure() {
  const band = document.querySelectorAll('header')[1]
  const row = band.firstElementChild
  const trail = [...row.querySelectorAll('button')].find((b) => b.getAttribute('aria-controls') === 'trail')
  return {
    reads: trail ? trail.innerText.trim() : null,
    trailWidth: trail ? Math.round(trail.getBoundingClientRect().width) : null,
    bandHeight: Math.round(band.getBoundingClientRect().height),
  }
}

const browser = await launch()

if (CANDIDATES_MODE) {
  const CANDIDATES = process.env.E2E_LABELS
    ? process.env.E2E_LABELS.split(',')
    : ['Trail', '21/25¢', '54/60', 'Used up', 'None left', 'No calls', 'No calls left', 'Out of calls', 'Allowance used up']
  const ctx = await ctxWith(browser, { viewport: { width: W, height: 844 }, seed: seedOf(STATES[0].state) })
  const page = await ctx.newPage()
  await page.goto(EXPLORER, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const rows = await page.evaluate(
    ([cands, src]) => {
      const band = document.querySelectorAll('header')[1]
      const trail = [...band.querySelectorAll('button')].find((b) => b.getAttribute('aria-controls') === 'trail')
      const fn = new Function('return (' + src + ')')()
      return cands.map((c) => {
        for (const s of trail.querySelectorAll('span')) s.textContent = c
        void band.offsetHeight
        return { label: c, ...fn() }
      })
    },
    [CANDIDATES, measure.toString()],
  )
  const pad = (s, n) => String(s).padEnd(n)
  log(`candidate wordings at ${W}:`)
  log('  ' + pad('label', 22) + pad('width', 8) + pad('band', 7) + 'one row')
  for (const r of rows) log('  ' + pad(JSON.stringify(r.label), 22) + pad(r.trailWidth, 8) + pad(r.bandHeight, 7) + (r.bandHeight <= ONE_ROW_MAX ? 'yes' : 'NO'))
  await browser.close()
  process.exit(0)
}

const board = scoreboard(`band @ ${W}`)
log(`— ${W} —`)
for (const s of STATES) {
  const ctx = await ctxWith(browser, { viewport: { width: W, height: 844 }, seed: seedOf(s.state) })
  const page = await ctx.newPage()
  await page.goto(EXPLORER, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  const real = await page.evaluate(measure)
  board.check(`${s.name}: one row (reads ${JSON.stringify(real.reads)}, ${real.trailWidth}px)`, real.bandHeight <= ONE_ROW_MAX, real)

  const forced = await page.evaluate(
    ([label, src]) => {
      const band = document.querySelectorAll('header')[1]
      const trail = [...band.querySelectorAll('button')].find((b) => b.getAttribute('aria-controls') === 'trail')
      if (!trail) return { error: 'no trail control' }
      for (const sp of trail.querySelectorAll('span')) sp.textContent = label
      void band.offsetHeight
      return new Function('return (' + src + ')')()()
    },
    [FORCED, measure.toString()],
  )
  board.check(`${s.name} + a spent allowance: one row (${forced.trailWidth}px)`, forced.bandHeight <= ONE_ROW_MAX, forced)

  await page.screenshot({ path: `${SHOTS}/band-${W}-${s.name.replace(/\W+/g, '-')}.png` })
  await ctx.close()
}

const failed = board.report()
await browser.close()
process.exit(failed ? 1 : 0)
