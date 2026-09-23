/**
 * The seam between two features that were each driven alone.
 *
 * In-app citations and the conversation list are independent until a reader holds several
 * conversations and follows a citation out of one of them. Then one question decides
 * whether the pair works: which conversation does Back come back to? `open()` commits
 * `current` before the navigation, so the answer should be "the one you were in" — and a
 * wrong answer here hands a reader somebody else's thread, silently, with nothing on
 * screen to say so.
 *
 * Also checks what a reader would never forgive being wrong: that a half-typed question
 * survives the round trip, and that merely *opening* an old conversation does not restamp
 * how recent it looks.
 *
 *   node e2e/cross.mjs                 # a phone
 *   E2E_W=1440 node e2e/cross.mjs      # and the desktop width
 */
import { launch, ctxWith, log, SHOTS, EXPLORER, BASE, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const W = Number(process.env.E2E_W || PHONE.width)
const viewport = W >= 700 ? { ...DESKTOP, width: W } : { ...PHONE, width: W }
const board = scoreboard(`cross @ ${W}`)
const { check } = board

/** What is on the screen, in the terms these checks are written in. */
async function snap(page) {
  return page.evaluate(() => {
    const answers = [...document.querySelectorAll('.answer')].map((a) => a.textContent.trim())
    const trailBtn = [...document.querySelectorAll('header button')].find((b) => b.getAttribute('aria-controls') === 'trail')
    return {
      path: location.pathname,
      onExplorer: !!document.querySelector('.explorer'),
      turns: document.querySelectorAll('.conversation .turn').length,
      // Each stubbed answer carries its own mark, which is how "whose conversation is this"
      // is answered without depending on a title the two share.
      mark: (answers.join(' ').match(/MARK-[A-Z]/) || [null])[0],
      draft: (document.querySelector('.composer textarea') || {}).value ?? null,
      trailReads: trailBtn ? trailBtn.innerText.trim() : null,
      bandHeight: [...document.querySelectorAll('header')].reduce((a, h) => a + Math.round(h.getBoundingClientRect().height), 0),
    }
  })
}

async function settled(page, ms = 30000) {
  const t0 = Date.now()
  for (;;) {
    const working = await page.evaluate(() => !!document.querySelector('.working'))
    const s = await snap(page)
    if (!working && s.turns > 0) return s
    if (Date.now() - t0 > ms) return { timedOut: true, ...s }
    await page.waitForTimeout(250)
  }
}

async function ask(page, text) {
  await page.fill('.composer textarea', text)
  await page.click('.composer button.primary')
  await settled(page)
  const btn = await page.$('button:has-text("Research")')
  if (btn) {
    await btn.click()
    await settled(page)
  }
  return snap(page)
}

/**
 * A row in the panel is the innermost thing holding a Forget button: they are neither `li`
 * nor `role=listitem`, and only the open one carries `aria-current`, so "which is open" is
 * read from the words the row itself prints.
 */
async function rowsOf(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    if (!sheet) return []
    const all = [...sheet.querySelectorAll('*')].filter((e) =>
      [...e.querySelectorAll('button')].some((b) => /^Forget$/.test(b.textContent.trim())),
    )
    return all
      .filter((e) => !all.some((o) => o !== e && e.contains(o)))
      .map((r) => ({ current: /open now/.test(r.textContent), text: r.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) }))
  })
}

async function openPanel(page) {
  await page.click('button:has-text("Start over")')
  await page.waitForTimeout(350)
}

const readIndex = () => JSON.parse(localStorage.getItem('ragtime_explorer_conversations_v1') || 'null')

const browser = await launch()
const ctx = await ctxWith(browser, { viewport })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 160))
})

log(`— ${W}×${viewport.height} —`)

// ── One conversation, then a second, each with its own mark ──────────────────
await page.goto(EXPLORER, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.evaluate(() => {
  localStorage.setItem('__rt_turn', '0')
  localStorage.setItem('__rt_mark', 'A')
})
let s = await ask(page, 'Who may the President remove?')
check('an answer carrying its own mark', s.mark === 'MARK-A', s)

await openPanel(page)
await page.click('button:has-text("New conversation")')
await page.waitForTimeout(400)
await page.evaluate(() => {
  localStorage.setItem('__rt_turn', '0')
  localStorage.setItem('__rt_mark', 'B')
})
s = await ask(page, 'And what did the courts say?')
check('a second conversation, distinct from the first', s.mark === 'MARK-B', s)

// ── A draft typed but not sent, then a citation followed out of B ────────────
await page.fill('.composer textarea', 'a half-typed follow-up')
const before = await snap(page)
const link = await page.$('.answer a[href*="/corpus/olc/"]')
check('the citation is an in-app link with a real href', !!link, before)

if (link) {
  await link.click()
  await page.waitForTimeout(900)
  const away = await snap(page)
  check('following it leaves the Explorer for the document', away.path.includes('/corpus/olc/') && !away.onExplorer, away)
  await page.screenshot({ path: `${SHOTS}/cross-${W}-document.png` })

  await page.goBack()
  await page.waitForTimeout(900)
  const back = await snap(page)
  check('Back returns to the Explorer', back.onExplorer && back.path.endsWith('/explorer'), back)
  check('Back returns to the conversation you were in, not the other one', back.mark === 'MARK-B', back)
  check('its turns come back', back.turns === before.turns, { was: before.turns, now: back.turns })
  check('the half-typed question survives the round trip', back.draft === 'a half-typed follow-up', { draft: back.draft })
  await page.screenshot({ path: `${SHOTS}/cross-${W}-back.png` })
}

// ── Switch to the other one, and do it again from there ──────────────────────
await openPanel(page)
const rows = await rowsOf(page)
log('  panel rows:', JSON.stringify(rows))
check('the panel lists both conversations', rows.length >= 2, rows)
check('exactly one row reads "open now"', rows.filter((r) => r.current).length === 1, rows)
await page.screenshot({ path: `${SHOTS}/cross-${W}-panel.png` })

const beforeOpen = await page.evaluate(readIndex)

const opened = await page.evaluate(() => {
  const sheet = document.querySelector('[role="dialog"]')
  if (!sheet) return null
  const all = [...sheet.querySelectorAll('*')].filter((e) =>
    [...e.querySelectorAll('button')].some((b) => /^Forget$/.test(b.textContent.trim())),
  )
  const rows = all.filter((e) => !all.some((o) => o !== e && e.contains(o)))
  const row = rows.find((r) => !/open now/.test(r.textContent))
  if (!row) return null
  const btn = [...row.querySelectorAll('button')].find((b) => !/^Forget$/.test(b.textContent.trim()))
  if (!btn) return null
  btn.click()
  return btn.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)
})
log('  opened row:', JSON.stringify(opened))
await page.waitForTimeout(700)
const nowA = await snap(page)
check('opening the other row shows the other conversation', nowA.mark === 'MARK-A', nowA)

if (nowA.mark === 'MARK-A') {
  const linkA = await page.$('.answer a[href*="/corpus/olc/"]')
  if (linkA) {
    await linkA.click()
    await page.waitForTimeout(900)
    await page.goBack()
    await page.waitForTimeout(900)
    const backA = await snap(page)
    check('Back follows the conversation you switched to, not the one that was current before', backA.mark === 'MARK-A', backA)
  }
}

// ── And the other way back in ───────────────────────────────────────────────
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const reloaded = await snap(page)
check('a reload agrees with Back about which conversation is open', reloaded.mark === 'MARK-A', reloaded)

const afterOpen = await page.evaluate(readIndex)
const clock = (ix, cid) => ix?.items?.find((i) => i.cid === cid)?.workedAt ?? null
for (const item of beforeOpen?.items ?? []) {
  check(
    `a conversation keeps its own clock when it is merely opened (${item.cid})`,
    clock(beforeOpen, item.cid) === clock(afterOpen, item.cid),
    { was: clock(beforeOpen, item.cid), now: clock(afterOpen, item.cid) },
  )
}

check('no page errors', pageErrors.length === 0, pageErrors)

const failed = board.report()
await browser.close()
process.exit(failed ? 1 : 0)
