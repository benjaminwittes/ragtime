/**
 * Whether the bar keeps to one row on the Explorer, in every state its trail control can
 * be in.
 *
 * "The band" was the Explorer's own header, a second `<header>` under the site's. It is
 * gone: the site now has one bar (`SiteBar.tsx`), and what was left of the band, the trail
 * control, is rendered into that bar's slot. So there is no band to measure, and what this
 * file protects is the thing the band's one row was for: the row the trail control sits in
 * does not wrap when the control has something to say.
 *
 * At 390 the row runs out, and the control that goes hot is the one carrying a number,
 * so the states where it has something to say were the states where it did not fit, and
 * it wrapped onto a second row at exactly the wrong moment. The labels are short below
 * `sm` for that reason; this is what holds them short. The row is tighter now than the
 * band was, because it also carries the lockup and the site's own controls.
 *
 * `--candidates` measures wordings in the live control, which is how to decide whether a
 * new one fits without shipping it to a phone first.
 *
 * The check holds at a phone and at a desk. Between them it does not, by design: around
 * 640 the bar wraps on purpose once a conversation puts controls in the slot (see the
 * slot's comment in `SiteBar.tsx`), so `E2E_W=640` fails here and is not a defect.
 *
 *   node e2e/band.mjs                    # a phone, every state
 *   E2E_W=1440 node e2e/band.mjs         # the full wording, at the width that has room
 *   node e2e/band.mjs --candidates       # measure wordings before choosing one
 */
import { launch, ctxWith, log, SHOTS, EXPLORER, PHONE, scoreboard, rowShape } from './harness.mjs'

const W = Number(process.env.E2E_W || PHONE.width)
const CANDIDATES_MODE = process.argv.includes('--candidates')

/**
 * One finished turn, carrying the cost event the band's label is computed from.
 *
 * Returned as script *source* with the conversation inlined, not as a closure: an init
 * script is serialised and run in the page, so a function closing over a variable here
 * arrives there with that variable undefined and silently seeds nothing.
 */
function seedOf({ spend, demoCalls, demoQuota }) {
  const blob = JSON.stringify({
    v: 1,
    turns: [{
      index: 1, phase: 'research', prompt: 'test', promptKind: 'ask', narration: [], answer: 'an answer',
      question: null, brief: null, rounds: [], handoffs: [],
      costs: [{ type: 'cost', turn_cents: 1, conversation_cents: spend, conversation_spend: spend, steps: 1, step_cap: 12, demo_calls: demoCalls, demo_quota: demoQuota }],
      error: null, stop: 'end_turn', calls: 1, startedAt: 1, endedAt: 2, running: false, lastEvent: null, buffer: '',
    }],
    brief: null, proposed: null, pinned: [], messages: [{ role: 'user', content: 'x' }], envelope: 'e',
    savedAt: Date.now(), workedAt: Date.now(),
  })
  return `window.localStorage.setItem('ragtime_explorer_conversation_v1', ${JSON.stringify(blob)})`
}

const STATES = [
  { name: 'at rest', state: { spend: 1, demoCalls: 2, demoQuota: 1500 } },
  // No cap, so spend alone leaves the control quiet however high it runs.
  { name: 'a costly conversation', state: { spend: 212, demoCalls: 2, demoQuota: 1500 } },
  { name: 'allowance filling', state: { spend: 1, demoCalls: 1300, demoQuota: 1500 } },
]

/**
 * The fourth state needs a refusal to reach, so its wording is forced into the live
 * control and the row re-measured. Forcing text into a rendered button measures the
 * layout, which is the only thing this file asks about.
 */
const FORCED = 'Used up'

/** The trail control, wherever it is drawn. Run in the page. */
const trailControl = () => document.querySelector('button[aria-controls="trail"]')

/**
 * The row that control sits in: the bar's one wrapping row, found from the control rather
 * than by counting headers, which is what broke when the band's header went. Run in the
 * page, so it repeats the selector rather than calling `trailControl`.
 */
const trailRow = () => {
  const trail = document.querySelector('button[aria-controls="trail"]')
  return trail ? trail.closest('header')?.firstElementChild ?? null : null
}

/** What the control reads and how wide it is, then whether its row is one row. */
async function measure(page) {
  const trail = await page.evaluate((src) => {
    const el = new Function('return (' + src + ')')()()
    return el ? { reads: el.innerText.trim(), trailWidth: Math.round(el.getBoundingClientRect().width), inBar: !!el.closest('header') } : null
  }, trailControl.toString())
  return { ...(trail ?? { reads: null, trailWidth: null, inBar: false }), row: await rowShape(page, trailRow) }
}

/** Put a wording into the live control, in both of the spans it keeps one in. */
async function force(page, label) {
  await page.evaluate(([src, text]) => {
    const el = new Function('return (' + src + ')')()()
    if (!el) return
    for (const sp of el.querySelectorAll('span')) sp.textContent = text
    void el.offsetHeight
  }, [trailControl.toString(), label])
}

const browser = await launch()

if (CANDIDATES_MODE) {
  const CANDIDATES = process.env.E2E_LABELS
    ? process.env.E2E_LABELS.split(',')
    : ['Trail', '87% used', '54/60', 'Used up', 'None left', 'No calls', 'No calls left', 'Out of calls', 'Allowance used up']
  const ctx = await ctxWith(browser, { viewport: { width: W, height: 844 }, seed: seedOf(STATES[0].state) })
  const page = await ctx.newPage()
  await page.goto(EXPLORER, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const rows = []
  for (const label of CANDIDATES) {
    await force(page, label)
    rows.push({ label, ...(await measure(page)) })
  }
  const pad = (s, n) => String(s).padEnd(n)
  log(`candidate wordings at ${W}:`)
  log('  ' + pad('label', 22) + pad('width', 8) + pad('row', 7) + pad('lines', 7) + 'one row')
  for (const r of rows) log('  ' + pad(JSON.stringify(r.label), 22) + pad(r.trailWidth, 8) + pad(r.row?.height, 7) + pad(r.row?.lines, 7) + (r.row?.oneRow ? 'yes' : 'NO'))
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

  const real = await measure(page)
  board.check(`${s.name}: the trail control is in the bar`, real.inBar, real)
  board.check(`${s.name}: one row (reads ${JSON.stringify(real.reads)}, ${real.trailWidth}px)`, !!real.row && real.row.oneRow, real)

  // Before the wording is forced, so the picture is of what a reader would see.
  await page.screenshot({ path: `${SHOTS}/band-${W}-${s.name.replace(/\W+/g, '-')}.png` })

  await force(page, FORCED)
  const forced = await measure(page)
  board.check(`${s.name} + a spent allowance: one row (${forced.trailWidth}px)`, forced.reads === FORCED && !!forced.row && forced.row.oneRow, forced)

  await page.screenshot({ path: `${SHOTS}/band-${W}-${s.name.replace(/\W+/g, '-')}-forced.png` })
  await ctx.close()
}

const failed = board.report()
await browser.close()
process.exit(failed ? 1 : 0)
