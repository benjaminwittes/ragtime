/**
 * Where a link in an answer goes.
 *
 * An answer is markdown a model wrote, and it mixes this site's own corpora with the open
 * web. So every anchor the Explorer renders is enumerated and asked the same question: does
 * it navigate in place, and does it carry the mark that says it leaves the site. A citation
 * opening a second tab was the behaviour before conversations persisted; the reason is gone
 * and this is what holds it gone.
 *
 *   node e2e/links.mjs
 */
import { launch, ctxWith, conversation, installStub, state, settle, log, SHOTS, EXPLORER, scoreboard } from './harness.mjs'

const browser = await launch()
const URL = EXPLORER
const only = null
/** A path into a corpus document: what an in-app citation should resolve to. */
const DEEP = '^/(ragtime/)?corpus/[a-z_]+/[^?]'


/** Every anchor inside the Explorer, and where it says it goes. */
async function anchors(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.explorer') || document.body
    return [...root.querySelectorAll('a[href]')].map((a) => ({
      text: a.textContent.trim().slice(0, 60),
      href: a.getAttribute('href'),
      target: a.getAttribute('target'),
      cls: a.className || null,
    }))
  })
}

async function runLinks() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  await ctx.addInitScript(() => {
    window.localStorage.setItem('ragtime_beta_access_v1', '1')
    window.localStorage.setItem('ragtime_demo_pw', 'stub-not-a-real-password')
  })
  await ctx.addInitScript(`(${installStub.toString()})()`)
  await ctx.addInitScript(([s]) => window.localStorage.setItem('__rt_scenario', s), ['research'])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
  let opened = 0
  ctx.on('page', () => { opened++ })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    window.localStorage.setItem('__rt_scenario', 'research')
    window.localStorage.setItem('__rt_turn', '0')
  })
  await page.fill('.composer textarea', 'Which OLC opinions discuss removing the head of an independent agency without cause?')
  await page.click('.composer button.primary')
  await settle(page)
  await page.click('button.primary:has-text("Research")')
  const done = await settle(page)
  log('answer settled', JSON.stringify({ turns: done.turns, errors: errors.length }))

  // --- 1. What the links say they do, answer + sources open ---
  await page.evaluate(() => { const d = document.querySelector('details.sources'); if (d) d.open = true })
  const answerLinks = await anchors(page)
  log('links in the answer:')
  for (const a of answerLinks) log('   ', JSON.stringify(a))

  // --- 2. The trail's links ---
  await page.click('header button[aria-controls="trail"]')
  await page.waitForTimeout(400)
  const trailLinks = await anchors(page)
  log('links in the trail:')
  for (const a of trailLinks) log('   ', JSON.stringify(a))
  await page.click('header button[aria-controls="trail"]')
  await page.waitForTimeout(300)

  const all = [...answerLinks, ...trailLinks]
  const inApp = all.filter((a) => a.href.startsWith('/') && !a.href.startsWith('//'))
  const external = all.filter((a) => !inApp.includes(a))
  log('VERDICT in-app links still carrying target=_blank:', JSON.stringify(inApp.filter((a) => a.target)))
  log('VERDICT external links WITHOUT target=_blank:', JSON.stringify(external.filter((a) => a.target !== '_blank')))
  log('counts', JSON.stringify({ inApp: inApp.length, external: external.length, externalHrefs: external.map((a) => a.href) }))

  // --- 3. Click a citation: same tab, deep link, detail sheet ---
  const before = await state(page)
  const cite = await page.evaluate((re) => {
    const rx = new RegExp(re)
    const root = document.querySelector('.explorer')
    const a = [...root.querySelectorAll('a[href]')].find((x) => rx.test(x.getAttribute('href')))
    return a ? { href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 60) } : null
  }, DEEP)
  log('citation to click', JSON.stringify(cite))
  await page.evaluate((re) => {
    const rx = new RegExp(re)
    const root = document.querySelector('.explorer')
    const a = [...root.querySelectorAll('a[href]')].find((x) => rx.test(x.getAttribute('href')))
    a.click()
  }, DEEP)
  await page.waitForTimeout(1600)
  log('after clicking a citation', JSON.stringify({
    url: page.url(),
    newTabsOpened: opened,
    explorerStillMounted: await page.evaluate(() => !!document.querySelector('.explorer')),
    sheet: await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"], [data-state="open"]')
      return el ? el.textContent.trim().slice(0, 160) : null
    }),
    heading: await page.evaluate(() => (document.querySelector('h1, h2') || {}).textContent?.trim().slice(0, 80) ?? null),
  }))
  await page.screenshot({ path: `${SHOTS}/link-1-after-citation-390.png` })

  // --- 4. Back: the conversation is still there ---
  await page.goBack({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  const after = await state(page)
  log('after Back', JSON.stringify({
    url: page.url(),
    turns: after.turns,
    answerChars: after.answerChars,
    composerDisabled: after.composerDisabled,
    matchesBefore: JSON.stringify(after.answerChars) === JSON.stringify(before.answerChars) && after.turns === before.turns,
  }))
  await page.screenshot({ path: `${SHOTS}/link-2-back-restored-390.png` })

  // --- 5. A workspace handoff carries its query through ---
  await page.click('header button[aria-controls="trail"]')
  await page.waitForTimeout(400)
  const ws = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a.handoff')].find((x) => x.getAttribute('href').includes('?'))
    if (!a) return null
    const href = a.getAttribute('href')
    a.click()
    return href
  })
  await page.waitForTimeout(1800)
  log('after a workspace handoff', JSON.stringify({ href: ws, url: page.url(), newTabsOpened: opened }))
  await page.screenshot({ path: `${SHOTS}/link-3-workspace-390.png` })

  log('page errors:', JSON.stringify(errors))
  await ctx.close()
}

await runLinks()
await browser.close()
log('done')
