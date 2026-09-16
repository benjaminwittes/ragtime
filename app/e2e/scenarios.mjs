/**
 * The Explorer through a whole turn, in each of the shapes a turn can take.
 *
 * This is the widest of the drivers and the one to run first: it asks, accepts a brief,
 * researches, opens the trail and reloads, under six scripted streams — an ordinary
 * conversation, one that lands near its cap, one near the daily allowance, one that is
 * taken away mid-stream, one the worker refuses outright, and one whose tool results carry
 * a shape this build has never heard of. The last two are the ones that used to white-screen.
 *
 *   node e2e/scenarios.mjs                       # all of them
 *   node e2e/scenarios.mjs hot,quota             # a couple
 */
import { launch, ctxWith, conversation, installStub, state, settle, log, SHOTS, EXPLORER, PHONE, scoreboard } from './harness.mjs'

const browser = await launch()
const only = process.argv[2] || 'research,hot,hotpool,interrupt,quota,baddetail'
const URL = EXPLORER

async function run(scenario) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  await ctx.addInitScript(() => {
    window.localStorage.setItem('ragtime_beta_access_v1', '1')
    // A demo password the stubbed turn never checks — it is only here so `useAuth()`
    // resolves a credential and the composer opens.
    window.localStorage.setItem('ragtime_demo_pw', 'stub-not-a-real-password')
  })
  await ctx.addInitScript(`(${installStub.toString()})()`)
  await ctx.addInitScript(([s]) => window.localStorage.setItem('__rt_scenario', s), [scenario])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log(scenario, 'PAGE ERROR', e.message))

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(([s]) => {
    window.localStorage.setItem('__rt_scenario', s)
    window.localStorage.setItem('__rt_turn', '0')
  }, [scenario])

  await page.fill('.composer textarea', 'Which OLC opinions discuss removing the head of an independent agency without cause?')
  await page.click('.composer button.primary')

  if (scenario === 'quota') {
    await page.waitForTimeout(1200)
    const s = await state(page)
    log('quota · after refusal', JSON.stringify(s))
    await page.screenshot({ path: `${SHOTS}/q1-quota-390.png` })
    await ctx.close()
    return
  }

  await page.waitForTimeout(900)
  log(scenario, '· orient running', JSON.stringify(await state(page)))
  const orientDone = await settle(page)
  log(scenario, '· orient settled', JSON.stringify(orientDone))
  await page.screenshot({ path: `${SHOTS}/${scenario}-1-orient-390.png` })

  // Accept the proposed brief — the research turn is the one with a trail worth reading.
  await page.click('button.primary:has-text("Research")')

  if (scenario === 'interrupt') {
    await page.waitForTimeout(3500)
    const mid = await state(page)
    log('interrupt · running before the page goes', JSON.stringify(mid))
    await page.screenshot({ path: `${SHOTS}/i1-running-390.png` })
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await page.waitForTimeout(300)
    log('interrupt · blob written on pagehide', JSON.stringify(await page.evaluate(() => {
      const raw = window.localStorage.getItem('ragtime_explorer_conversation_v1')
      if (!raw) return null
      const s = JSON.parse(raw)
      return { turns: s.turns.length, running: s.turns.map((t) => t.running), messages: s.messages.length, envelope: !!s.envelope, bytes: raw.length }
    })))
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const after = await state(page)
    log('interrupt · after reload', JSON.stringify(after))
    await page.screenshot({ path: `${SHOTS}/i2-interrupted-390.png` })
    if (after.trail) {
      await page.click('header button[aria-controls="trail"]')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${SHOTS}/i3-interrupted-trail-390.png` })
      log('interrupt · trail', JSON.stringify(await page.evaluate(() => ({
        text: (document.querySelector('#trail') || {}).textContent?.trim().slice(0, 500) ?? null,
        conversationVisible: !!document.querySelector('.conversation'),
      }))))
    }
    await ctx.close()
    return
  }

  await page.waitForTimeout(1200)
  log(scenario, '· research running', JSON.stringify(await state(page)))
  await page.screenshot({ path: `${SHOTS}/${scenario}-2-running-390.png` })
  const done = await settle(page)
  log(scenario, '· research settled', JSON.stringify(done))
  await page.screenshot({ path: `${SHOTS}/${scenario}-3-answer-390.png` })

  // The trail.
  await page.click('header button[aria-controls="trail"]')
  await page.waitForTimeout(400)
  log(scenario, '· trail open', JSON.stringify(await page.evaluate(() => ({
    meter: (document.querySelector('.meter') || {}).textContent?.trim().slice(0, 200) ?? null,
    allowance: (document.querySelector('.allowance') || {}).textContent?.trim().slice(0, 200) ?? null,
    trail: (document.querySelector('#trail') || {}).textContent?.trim().slice(0, 600) ?? null,
    conversationHidden: !document.querySelector('.conversation') || document.querySelector('.conversation').getBoundingClientRect().height === 0,
  }))))
  await page.screenshot({ path: `${SHOTS}/${scenario}-4-trail-390.png` })

  // And a reload, to see the conversation come back.
  await page.click('header button[aria-controls="trail"]')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  log(scenario, '· after reload', JSON.stringify(await state(page)))
  await page.screenshot({ path: `${SHOTS}/${scenario}-5-restored-390.png` })
  await ctx.close()
}

for (const s of only.split(',')) {
  log('=== scenario', s, '===')
  await run(s.trim())
}
await browser.close()
log('done')
