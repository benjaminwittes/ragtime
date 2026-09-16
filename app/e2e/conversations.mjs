/**
 * More than one conversation on the device: that starting another keeps the one you were
 * having, that a conversation already on a reader's device is adopted rather than ignored,
 * and that forgetting is the only thing here that destroys.
 *
 * Reads the index and the blobs out of `localStorage` as well as the panel, because the
 * index is a cache and the blobs are the truth — a panel that looks right over a store that
 * is wrong is the failure this is watching for.
 *
 *   node e2e/conversations.mjs
 */
import { launch, ctxWith as ctxWithHarness, conversation, state, device, panel, openPanel, log, SHOTS, EXPLORER, scoreboard } from './harness.mjs'

const browser = await launch()
const URL = EXPLORER
const only = null
/** The sections below were written against a one-argument form. */
const ctxWith = (seed) => ctxWithHarness(browser, { seed })

// ─── A. Two conversations, kept ─────────────────────────────────────────────
{
  const ctx = await ctxWith(null)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => { localStorage.setItem('__rt_scenario', 'research'); localStorage.setItem('__rt_turn', '0') })

  const first = await conversation(page, 'Which OLC opinions discuss removing the head of an independent agency?')
  log('A1 · first conversation settled', JSON.stringify({ turns: first.turns, chrome: first.chrome, pageScrolls: first.pageScrolls }))
  log('A2 · panel', JSON.stringify(await openPanel(page)))
  await page.screenshot({ path: `${SHOTS}/conv-1-panel-390.png` })

  await page.click('[role="dialog"] button:has-text("New conversation")')
  await page.waitForTimeout(800)
  const fresh = await state(page)
  log('A3 · after New conversation', JSON.stringify({ turns: fresh.turns, startOver: fresh.startOver, chrome: fresh.chrome }))
  await page.screenshot({ path: `${SHOTS}/conv-2-fresh-390.png` })

  await page.evaluate(() => localStorage.setItem('__rt_turn', '0'))
  const second = await conversation(page, 'What did FRUS cables say about Chile in 1973?')
  log('A4 · second settled', JSON.stringify({ turns: second.turns }))
  log('A5 · panel with two', JSON.stringify(await openPanel(page)))
  log('A6 · device', JSON.stringify(await device(page)))
  await page.screenshot({ path: `${SHOTS}/conv-3-two-390.png` })

  // Go back to the first.
  const rows = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button.flex-1')].map((b) => b.textContent.trim().slice(0, 40)))
  log('A7 · rows', JSON.stringify(rows))
  const beforeSwitch = (await device(page)).index.current
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[role="dialog"] button.flex-1')]
    const back = bs.find((b) => !b.textContent.includes('open now'))
    back.click()
  })
  await page.waitForTimeout(1200)
  const back = await state(page)
  const dev = await device(page)
  log('A8 · reopened the other one', JSON.stringify({
    turns: back.turns, answerChars: back.answerChars,
    currentNow: dev.index.current, wasCurrent: beforeSwitch,
    switched: dev.index.current !== beforeSwitch,
    stillTwo: dev.blobs.length,
  }))
  await page.screenshot({ path: `${SHOTS}/conv-4-reopened-390.png` })

  // And a reload, to see the list survive it.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  log('A9 · after reload', JSON.stringify(await state(page)))
  log('A10 · panel after reload', JSON.stringify(await openPanel(page)))
  log('A11 · errors', JSON.stringify(errors))
  await ctx.close()
}

// ─── B. The conversation that already exists on a reader's device ───────────
{
  const legacy = {
    v: 1,
    turns: [{
      index: 0, phase: 'research', prompt: 'A conversation from before the list existed',
      promptKind: 'ask', narration: [], answer: 'The answer that must not be lost.', question: null,
      brief: null, rounds: [], handoffs: [],
      costs: [{ type: 'cost', turn_cents: 4.4, conversation_cents: 5, conversation_spend: 4.4, cap_cents: 25, steps: 2, step_cap: 12 }],
      error: null, stop: 'end_turn', calls: 3, startedAt: 1, endedAt: 2, running: false, lastEvent: null, buffer: '',
    }],
    brief: null, proposed: null, pinned: [],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    envelope: 'env_legacy', savedAt: Date.now() - 3600_000,
  }
  const ctx = await ctxWith(`window.localStorage.setItem('ragtime_explorer_conversation_v1', ${JSON.stringify(JSON.stringify(legacy))})`)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  const s = await state(page)
  log('B1 · the old conversation is on the screen', JSON.stringify({ turns: s.turns, answerChars: s.answerChars }))
  log('B2 · device after migration', JSON.stringify(await device(page)))
  log('B3 · panel', JSON.stringify(await openPanel(page)))
  log('B4 · errors', JSON.stringify(errors))
  await page.screenshot({ path: `${SHOTS}/conv-5-migrated-390.png` })
  await ctx.close()
}

// ─── C. Forgetting, which is the only thing that destroys ───────────────────
{
  const ctx = await ctxWith(null)
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => { localStorage.setItem('__rt_scenario', 'research'); localStorage.setItem('__rt_turn', '0') })
  await conversation(page, 'Something worth forgetting')
  await openPanel(page)
  await page.click('[role="dialog"] button:has-text("Forget")')
  await page.waitForTimeout(400)
  log('C1 · asked to forget', JSON.stringify(await page.evaluate(() => ({
    keep: [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.trim() === 'Keep'),
    forget: [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.trim() === 'Forget'),
  }))))
  await page.screenshot({ path: `${SHOTS}/conv-6-confirm-390.png` })
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Keep').click())
  await page.waitForTimeout(400)
  log('C2 · kept', JSON.stringify(await device(page)))
  await page.click('[role="dialog"] button:has-text("Forget")')
  await page.waitForTimeout(300)
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].filter((b) => b.textContent.trim() === 'Forget').pop().click())
  await page.waitForTimeout(900)
  log('C3 · forgotten', JSON.stringify(await device(page)))
  log('C4 · page', JSON.stringify(await state(page)))
  await ctx.close()
}

await browser.close()
log('done')
