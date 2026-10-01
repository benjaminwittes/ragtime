/**
 * The stage: `/present` drives, `/stage` shows.
 *
 * `npm test` covers the rules — what a stage believes, and from whom (`protocol.test.ts`).
 * This covers what the two people in the room meet: a presenter who goes live, moves a
 * slide, walks into the app and comes back; and a reader who arrives late, sees real text
 * and never sees the notes, the dock, a password field's contents or a forged slide.
 *
 * **It needs no secret and touches nothing shared.** The driver seals a kit of its own,
 * with a signing key of its own, and serves it in place of the committed one. By default
 * the network leg is cut (the Realtime socket is never opened), so the presenter and the
 * stage talk over the local leg alone — which is the leg a presenter's own second window
 * uses. That makes the run offline and repeatable.
 *
 *   E2E_BASE=http://localhost:5201/ragtime node e2e/stage.mjs
 *
 * `E2E_STAGE_NET=1` runs the cross-device half too: a presenter and a reader in two
 * separate browser profiles, which share nothing but the network. That opens a real
 * Realtime channel, named for the driver's own throwaway key and this dev server's host,
 * so it cannot be heard on any real stage.
 */
import { createHash } from 'node:crypto'

import { launch, ctxWith, log, SHOTS, BASE, PHONE, DESKTOP, scoreboard } from './harness.mjs'
import { seal, parseDeck, newStageKeys } from '../scripts/seal-kit.mjs'

const board = scoreboard('stage')
const NET = process.env.E2E_STAGE_NET === '1'

const PASS = 'driver-passphrase-not-a-secret'
const KEYS = await newStageKeys()
const KIT = {
  title: 'A demo, for the driver',
  when: 'Any day · 12:00',
  guide: '# Run of show',
  slides: parseDeck(
    [
      '# A demo',
      'Put your questions in the chat.',
      '???',
      'PRESENTER-ONLY: say hello and wait for the room.',
      '---',
      'part: Part I',
      '# Three tiers',
      '- Search, with no AI',
      '- The Explorer, with AI',
      '',
      'See [the hub](/).',
      '---',
      '# What we hold',
      '```figure',
      'holdings',
      '```',
      '---',
      '# Questions',
      '> Ask me anything.',
    ].join('\n'),
  ),
  stage: { key: KEYS.key },
}
const SEALED = JSON.stringify({ ...(await seal(JSON.stringify(KIT), PASS)), stage: { pub: KEYS.pub } })
const OLD_KIT = JSON.stringify(await seal(JSON.stringify({ ...KIT, stage: undefined }), PASS))

// A title that takes several lines at any width, as an opinion's can: the label under the
// ground has to hold it without growing.
const LONG_TITLE =
  'One with no length, and a title that runs on: ' +
  'Whether the Department May Decline to Produce to a Committee of the Congress the Memoranda of Its Own Attorneys Concerning the Detention, Transfer and Trial of Persons Held Outside the United States, and Related Questions of Privilege, Procedure and Practice'

// What the OLC filter answers with, for the search the driver brings on: four opinions
// whose fields differ in exactly the ways the stage is supposed to show.
const OLC = {
  ids: [1, 2, 3, 4],
  count: 4,
  generated_sql: '',
  executed_sql: '',
  display_rows: [
    { id: 1, title: 'A short one', author: 'Theodore B. Olson', date_issued: '1984-10-01', source: 'doj-published', source_url_doj: null, source_url_knight: null, page_count: 4, text_length: 9000, ocr_quality: 'clean' },
    { id: 2, title: 'The longer one', author: 'Jay S. Bybee', date_issued: '2002-08-01', source: 'doj-published', source_url_doj: null, source_url_knight: null, page_count: 50, text_length: 160000, ocr_quality: 'clean' },
    { id: 3, title: 'A released one', author: null, date_issued: '1962-03-12', source: 'knight-foia', source_url_doj: null, source_url_knight: null, page_count: 12, text_length: 30000, ocr_quality: 'degraded' },
    { id: 4, title: LONG_TITLE, author: null, date_issued: '1975-06-30', source: 'doj-published', source_url_doj: null, source_url_knight: null, page_count: null, text_length: null, ocr_quality: null },
  ],
}

/** A document on the ground. The legend draws the same forms small; those are not these. */
const CELL = '[data-terrain="cells"] .terrain-cell'

const CHANNEL =
  'stage:' +
  createHash('sha256').update(`${KEYS.pub.x}.${KEYS.pub.y}`).digest('hex').slice(0, 16) +
  ':' +
  new URL(BASE).host

async function serving(ctx, body = SEALED, { net = false } = {}) {
  await ctx.route('**/kits/demo.sealed.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body }),
  )
  // The network leg, cut: the socket is accepted and never answered, so the channel
  // never joins and nothing leaves the machine.
  if (!net) await ctx.routeWebSocket(/\/realtime\//, () => {})
  return ctx
}

// The first `main`: a mirrored page brings a `main` of its own inside the stage's.
const stageText = (page) => page.locator('main').first().innerText()
const sceneOf = (page) => page.locator('main').first().getAttribute('data-stage-scene')
async function until(page, what, test, ms = 6000) {
  const start = Date.now()
  let last
  while (Date.now() - start < ms) {
    last = await test()
    if (last) return true
    await page.waitForTimeout(100)
  }
  log('   (timed out waiting for:', what, ')')
  return false
}

const browser = await launch()

// ── Nobody presenting: the stage says so, and needs no access code ────────────────────
{
  log('— quiet —')
  // Not `ctxWith`: this reader has never entered the beta's access code.
  const ctx = await serving(await browser.newContext({ viewport: DESKTOP }))
  const page = await ctx.newPage()
  await page.goto(BASE + '/stage', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-stage="quiet"]', { timeout: 8000 })
  board.check('with nobody presenting the stage says it is quiet', (await stageText(page)).includes('Nothing is on stage'))
  board.check('and it did not ask for the access code', (await page.locator('input[aria-label="Access code"]').count()) === 0)
  board.check('the stage has no site bar of its own', (await page.locator('header').count()) === 0)
  board.check('the owl keeps the house while it is empty', (await page.locator('main svg[data-owl]').count()) === 1)
  await page.screenshot({ path: `${SHOTS}/stage-quiet.png` })
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  board.check('the rest of the site still asks for it', (await page.locator('input[aria-label="Access code"]').count()) === 1)
  await ctx.close()
}

// ── A kit sealed before the stage existed ─────────────────────────────────────────────
{
  log('— an old kit —')
  const ctx = await serving(await ctxWith(browser, { viewport: DESKTOP }), OLD_KIT)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/present#k=${PASS}`, { waitUntil: 'networkidle' })
  board.check('the console says the kit cannot present', await until(page, 'old kit', async () => (await stageText(page)).includes('sealed before the stage existed')))
  const stage = await ctx.newPage()
  await stage.goto(BASE + '/stage', { waitUntil: 'networkidle' })
  board.check('and the stage says there is none', await until(stage, 'closed', async () => (await stageText(stage)).includes('no stage here')))
  await ctx.close()
}

// ── The console is locked without the passphrase ──────────────────────────────────────
{
  log('— locked —')
  const ctx = await serving(await ctxWith(browser, { viewport: DESKTOP }))
  const page = await ctx.newPage()
  await page.goto(BASE + '/present', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-demo="locked"]')
  const text = await stageText(page)
  board.check('without the passphrase the console shows none of the kit', !text.includes('Three tiers') && !text.includes('PRESENTER-ONLY'), text.slice(0, 120))
  await ctx.close()
}

// ── A presentation ────────────────────────────────────────────────────────────────────
{
  log('— live —')
  const ctx = await serving(await ctxWith(browser, { viewport: DESKTOP }))
  const present = await ctx.newPage()
  const errors = []
  present.on('pageerror', (e) => errors.push('present: ' + e.message))
  await present.goto(`${BASE}/present#k=${PASS}`, { waitUntil: 'networkidle' })
  await present.waitForSelector('[data-present="ready"]')
  board.check('the passphrase is gone from the console’s address bar', !present.url().includes(PASS), present.url())
  board.check('the console shows the notes', (await stageText(present)).includes('PRESENTER-ONLY'))

  const stage = await ctx.newPage()
  stage.on('pageerror', (e) => errors.push('stage: ' + e.message))
  await stage.goto(BASE + '/stage', { waitUntil: 'networkidle' })
  await stage.waitForSelector('[data-stage="quiet"]', { timeout: 8000 })
  board.check('before anyone goes live the stage is quiet', true)

  await present.click('button:has-text("Go live")')
  await present.waitForSelector('[data-present="live"]')
  board.check('going live puts the first slide on stage, with no reload', await until(stage, 'slide 1', async () => (await sceneOf(stage)) === 'slide' && (await stage.locator('[data-stage="words"] h1').innerText()) === 'A demo'))
  board.check('the room is not sent the notes', !(await stage.content()).includes('PRESENTER-ONLY'))
  const set = await stage.evaluate(() => ({
    wide: document.documentElement.scrollWidth > window.innerWidth,
    title: parseFloat(getComputedStyle(document.querySelector('[data-stage="words"] h1')).fontSize),
    body: parseFloat(getComputedStyle(document.querySelector('.stage-words')).fontSize),
    slides: document.querySelectorAll('[aria-roledescription="slide"]').length,
  }))
  board.check('the words are set large in the window, not scaled into a rectangle', !set.wide && set.title >= 40 && set.body >= 17 && set.slides === 0, set)
  await stage.screenshot({ path: `${SHOTS}/stage-slide.png` })

  await present.keyboard.press('ArrowRight')
  board.check('→ on the console moves the stage', await until(stage, 'slide 2', async () => (await stage.locator('[data-stage="words"] h1').innerText()) === 'Three tiers'))
  const link = await stage.locator('[data-stage="words"] .stage-words a').evaluate((a) => [a.getAttribute('href'), a.target])
  board.check('a link on a slide is a real link, and opens beside the stage', link[0] === new URL(BASE).pathname + '/' && link[1] === '_blank', link)
  await present.screenshot({ path: `${SHOTS}/present-console.png` })

  // A reader who arrives late.
  const late = await ctx.newPage()
  await late.goto(BASE + '/stage', { waitUntil: 'networkidle' })
  board.check('a reader who arrives mid-presentation gets the slide that is up', await until(late, 'late slide', async () => (await sceneOf(late)) === 'slide' && (await late.locator('[data-stage="words"] h1').innerText()) === 'Three tiers', 4000))
  await late.close()

  // A forgery: the channel is open, so anyone can say anything on it.
  await stage.evaluate(
    ([name]) => {
      const forged = { v: 1, sid: 'x', n: 999, t: Date.now(), kind: 'state', who: 'x', since: Date.now() + 1000, scene: { kind: 'slide', at: 0, of: 1, part: '', title: 'FORGED', body: '' } }
      const ch = new BroadcastChannel(name)
      ch.postMessage({ m: { p: JSON.stringify(forged), s: btoa('x'.repeat(64)) } })
      ch.postMessage({ m: { p: JSON.stringify(forged), s: '' } })
      ch.postMessage('nonsense')
      ch.postMessage({ c: 'a', i: 0, of: 1, d: '{not json' })
      ch.close()
    },
    [CHANNEL],
  )
  await stage.waitForTimeout(700)
  board.check('a slide nobody signed is not shown', (await stage.locator('[data-stage="words"] h1').innerText()) === 'Three tiers')

  // ── A figure: named by the presenter, drawn and explored by the reader ──────────────
  log('— a figure —')
  await present.click('button:has-text("What RAGtime holds")')
  board.check('a figure goes on stage', await until(stage, 'figure', async () => (await sceneOf(stage)) === 'figure' && (await stage.locator('[data-figure="holdings"]').count()) === 1))
  const nodes = await stage.locator('[data-figure-node]').count()
  board.check('it draws the collections', nodes >= 10, nodes)
  const second = await stage.locator('[data-figure-node]').nth(3).getAttribute('data-figure-node')
  await stage.locator('[data-figure-node]').nth(3).hover()
  board.check('pointing at one, on the stage, says what it is', await until(stage, 'figure detail', async () => (await stage.locator(`[data-figure-detail="${second}"]`).count()) === 1))
  board.check('and that was the reader’s own doing: the console’s figure did not move', (await present.locator(`[data-figure-detail="${second}"]`).count()) === 0)
  await stage.screenshot({ path: `${SHOTS}/stage-figure.png` })
  await present.click('button:has-text("Back to the slide")')
  await until(stage, 'slide again', async () => (await sceneOf(stage)) === 'slide')

  await present.keyboard.press('ArrowRight')
  board.check('a slide can hold a figure too', await until(stage, 'figure in slide', async () => (await stage.locator('[data-stage="words"] [data-figure="holdings"]').count()) === 1 && (await stage.locator('[data-stage="words"] h1').innerText()) === 'What we hold'))
  await stage.screenshot({ path: `${SHOTS}/stage-slide-figure.png` })

  // ── The record, brought on ──────────────────────────────────────────────────────────
  log('— a search, brought on —')
  let asked = 0
  let release
  const held = new Promise((resolve) => (release = resolve))
  await ctx.route('**/corpus/olc/filter', async (route) => {
    asked += 1
    await held
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OLC) })
  })
  const fromStage = []
  stage.on('request', (request) => {
    if (request.url().includes('/corpus/')) fromStage.push(request.url())
  })
  await present.selectOption('[data-present="record"] select', 'olc')
  await present.fill('[data-present="record"] input', 'habeas corpus')
  await present.click('[data-present="record"] button[type="submit"]')
  board.check('the floor goes up at once, empty, with the question over it', await until(stage, 'pending', async () => (await sceneOf(stage)) === 'record' && (await stage.locator('[data-record="pending"]').count()) === 1 && (await stage.locator(CELL).count()) === 0))
  board.check('and says who is being asked', (await stage.locator('.record [role="status"]').innerText()).startsWith('Asking'))
  board.check('the owl has its lantern up while the collection has not answered', (await stage.locator('.record svg[data-owl]').getAttribute('data-lantern')) === 'searching')
  release()
  board.check('the documents grow where they stand when the collection answers', await until(stage, 'on', async () => (await stage.locator(CELL).count()) === 4))
  board.check('and lowers it when it has', (await stage.locator('.record svg[data-owl]').getAttribute('data-lantern')) !== 'searching')
  board.check('one request was made, by the presenter; the stage asked the service for nothing', asked === 1 && fromStage.length === 0, { asked, fromStage })
  // Let them finish growing: a column half-grown is not yet the height it will be.
  await stage.waitForTimeout(1800)
  const forms = await stage.locator(CELL).evaluateAll((cells) =>
    Object.fromEntries(
      cells.map((el) => {
        const box = el.getBBox()
        return [el.dataset.terrainDoc, { face: el.dataset.face, rough: 'rough' in el.dataset, film: 'film' in el.dataset, h: box.height, x: box.x + box.width / 2 }]
      }),
    ),
  )
  board.check('a longer document stands taller', forms['2'].h > forms['1'].h * 1.5, forms)
  board.check('an earlier one stands further to the left', forms['3'].x < forms['1'].x && forms['1'].x < forms['2'].x, forms)
  board.check('one released under FOIA is cracked, and a poor scan has broken strata', forms['3'].rough && forms['3'].film && !forms['1'].rough && !forms['1'].film, forms)
  board.check('one with no length on record is an outline, not a guess', forms['4'].face === 'open', forms['4'])
  const href = await stage.locator('.terrain-cell[data-terrain-doc="2"]').evaluate((a) => [a.getAttribute('href'), a.getAttribute('target')])
  board.check('each is a link to the real document', href[0].endsWith('/corpus/olc/2') && href[1] === '_blank', href)
  await stage.locator('.terrain-cell[data-terrain-doc="2"]').hover({ force: true })
  board.check('pointing at one reads its label: title, date, author, length', await until(stage, 'label', async () => {
    const label = await stage.locator('[data-record="label"]').innerText()
    return label.includes('The longer one') && label.includes('2002-08-01') && label.includes('Jay S. Bybee') && label.includes('50 pages')
  }, 3000), await stage.locator('[data-record="label"]').innerText())
  // The ground takes the height the words under it leave. A label that grew with its title
  // moved the ground from under the pointer, and the pointer was then on another column.
  const groundAt = () =>
    stage.locator('svg.terrain-ground').evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [Math.round(box.top), Math.round(box.height)]
    })
  const groundWas = await groundAt()
  await stage.locator('.terrain-cell[data-terrain-doc="4"]').hover({ force: true })
  const longRead = await until(stage, 'long label', async () => (await stage.locator('[data-record="label"]').innerText()).includes('One with no length'), 3000)
  const groundIs = await groundAt()
  board.check('a title that runs to several lines does not move the ground', longRead && groundWas[0] === groundIs[0] && groundWas[1] === groundIs[1], { longRead, groundWas, groundIs })
  // The console's own small stage is the same drawing in a box of a fixed shape, and it
  // is where the presenter points while the room watches.
  const previewAt = () =>
    present.locator('[data-present="preview"] svg.terrain-ground').evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [Math.round(box.top + window.scrollY), Math.round(box.height)]
    })
  const previewWas = await previewAt()
  await present.locator('[data-present="preview"] .terrain-cell[data-terrain-doc="4"]').hover({ force: true })
  const previewRead = await until(present, 'preview label', async () => (await present.locator('[data-present="preview"] [data-record="label"]').innerText()).includes('One with no length'), 3000)
  const previewIs = await previewAt()
  board.check('nor in the presenter’s own preview of it', previewRead && previewWas[0] === previewIs[0] && previewWas[1] === previewIs[1], { previewRead, previewWas, previewIs })
  board.check('the legend names only the forms that are on stage', await stage.locator('[data-record="legend"]').innerText().then((legend) => legend.includes('FOIA') && legend.includes('poor scan') && legend.includes('not recorded')))
  await stage.screenshot({ path: `${SHOTS}/stage-record.png` })
  // The presenter brings one forward, for the room.
  await present.locator('[data-present="preview"] .terrain-cell[data-terrain-doc="3"]').click({ force: true })
  await stage.mouse.move(4, 4)
  board.check('the presenter brings one forward, and it comes forward on the stage', await until(stage, 'forward', async () => (await stage.locator('.terrain-cell[data-terrain-doc="3"][data-active]').count()) === 1))
  board.check('and that was not a navigation: the console is still the console', (await present.locator('[data-present="live"]').count()) === 1)
  const lateToRecord = await ctx.newPage()
  await lateToRecord.goto(BASE + '/stage', { waitUntil: 'networkidle' })
  const lateGot = await until(lateToRecord, 'late record', async () => (await lateToRecord.locator(CELL).count()) === 4 && (await lateToRecord.locator('.terrain-cell[data-terrain-doc="3"][data-active]').count()) === 1, 5000)
  board.check('a reader who arrives now gets the set, and what is forward', lateGot, lateGot ? undefined : { cells: await lateToRecord.locator(CELL).count(), active: await lateToRecord.locator(CELL + '[data-active]').evaluateAll((els) => els.map((el) => el.dataset.terrainDoc)), scene: await sceneOf(lateToRecord) })
  await lateToRecord.close()
  await present.click('button:has-text("Back to the slide")')
  await until(stage, 'slide again', async () => (await sceneOf(stage)) === 'slide')

  // ── The app itself ──────────────────────────────────────────────────────────────────
  log('— the app —')
  await present.click('button:has-text("Show the app")')
  await present.waitForSelector('[data-stage="dock"]')
  board.check('leaving the console for the app keeps the presenter live, with a dock that says so', (await present.locator('[data-stage="dock"]').innerText()).includes('On stage: this page'))
  board.check('the stage shows the app', await until(stage, 'mirror', async () => (await sceneOf(stage)) === 'mirror' && (await stage.locator('[data-stage="mirror"] header').count()) === 1, 8000))
  const hubWords = (await present.locator('main h1').first().innerText()).trim().slice(0, 12)
  board.check('as real text: the hub’s own heading is on the stage', await until(stage, 'hub text', async () => (await stage.locator('[data-stage="mirror"]').innerText()).includes(hubWords)), hubWords)
  board.check('the console was never on the stage, even for a frame', !(await stage.content()).includes('PRESENTER-ONLY') && (await stage.locator('[data-stage="mirror"] [data-present]').count()) === 0)
  board.check('the presenter’s dock is not on the stage', (await stage.locator('[data-stage="mirror"] [data-stage="dock"]').count()) === 0 && !(await stage.locator('[data-stage="mirror"]').innerText()).includes('On stage: this page'))
  const targets = await stage.locator('[data-stage="mirror"] a[href]').evaluateAll((as) => as.map((a) => a.target))
  board.check('every link in it opens beside the stage', targets.length > 3 && targets.every((t) => t === '_blank'), targets.length)
  board.check('nothing in it can run', (await stage.locator('[data-stage="mirror"] script, [data-stage="mirror"] iframe').count()) === 0)

  // The owl: on the stage with the page, looking where the presenter points, and not a
  // reason to send the page again.
  board.check('the owl is on the stage with the hub', (await stage.locator('[data-stage="mirror"] svg[data-owl]').count()) === 1)
  await stage.evaluate((name) => {
    window.__frames = 0
    const ch = new BroadcastChannel(name)
    ch.onmessage = (e) => {
      try {
        if (e.data.c || JSON.parse(e.data.m.p).kind === 'frame') window.__frames += 1
      } catch {
        /* not a frame */
      }
    }
  }, CHANNEL)
  const gaze = () => stage.locator('[data-stage="mirror"] svg[data-owl]').evaluate((owl) => Number(owl.style.getPropertyValue('--owl-gaze-x')))
  await present.mouse.move(1380, 400, { steps: 12 })
  const right = await until(stage, 'gaze right', async () => (await gaze()) > 0.5, 3000)
  board.check('the room’s owl looks where the presenter points: to the right', right, right ? undefined : {
    gaze: await gaze(),
    under: await present.evaluate(() => { const el = document.elementFromPoint(1380, 400); return el ? el.tagName + ' ' + (el.closest('[data-stage-skip]') ? 'SKIPPED' : '') + String(el.className).slice(0, 50) : null }),
    dot: await stage.locator('[data-stage="pointer"]').evaluate((d) => d.style.opacity + ' ' + d.style.transform),
  })
  await present.mouse.move(40, 400, { steps: 12 })
  board.check('and to the left', await until(stage, 'gaze left', async () => (await gaze()) < -0.5, 3000), await gaze())
  await present.waitForTimeout(700)
  const sent = await stage.evaluate(() => window.__frames)
  board.check('a look is not a new picture of the page: the pointer crossed it and the page was not sent again', sent <= 1, sent)

  // The presenter types; the room reads it.
  const field = present.locator('main input[type="text"], main input[type="search"], main input:not([type])').first()
  await field.fill('emergency powers')
  board.check('what the presenter types appears on the stage', await until(stage, 'typed', async () => (await stage.locator('[data-stage="mirror"] input').evaluateAll((els) => els.some((el) => el.value === 'emergency powers')))))
  board.check('and the stage’s copy of the field cannot be typed in', await stage.locator('[data-stage="mirror"] input').first().evaluate((el) => el.readOnly))
  await stage.screenshot({ path: `${SHOTS}/stage-mirror.png` })

  // A private panel.
  await present.click('button[aria-label="Configure AI access"]')
  await present.waitForSelector('[data-slot="sheet-content"]')
  board.check('the AI access sheet, opened on stage, shows the room only that it is open', await until(stage, 'private', async () => (await stage.locator('[data-stage="mirror"]').innerText()).includes('private panel')))
  const leaked = await stage.locator('[data-stage="mirror"] [data-stage-private] input').count()
  board.check('and none of its fields', leaked === 0, leaked)
  await stage.screenshot({ path: `${SHOTS}/stage-private.png` })
  await present.keyboard.press('Escape')

  // Hold, and show again.
  await present.click('[data-stage="dock"] button:has-text("Hold the slide")')
  board.check('"Hold the slide" puts the slide back while the presenter stays in the app', await until(stage, 'held', async () => (await sceneOf(stage)) === 'slide'))
  await present.click('[data-stage="dock"] button:has-text("Show this page")')
  board.check('"Show this page" shows it again', await until(stage, 'shown', async () => (await sceneOf(stage)) === 'mirror' && (await stage.locator('[data-stage="mirror"] header').count()) === 1))

  // A reload in the middle of it.
  await present.reload({ waitUntil: 'networkidle' })
  board.check('a reload mid-presentation picks up where it was, on the page it was on', await until(present, 'dock back', async () => (await present.locator('[data-stage="dock"]').count()) === 1, 8000))
  board.check('and the stage is still showing the app', await until(stage, 'still mirror', async () => (await sceneOf(stage)) === 'mirror' && (await stage.locator('[data-stage="mirror"] header').count()) === 1, 8000))

  await present.click('[data-stage="dock"] a:has-text("Slides")')
  await present.waitForSelector('[data-present="live"]')
  board.check('back on the console, the stage is back on the slide', await until(stage, 'slide back', async () => (await sceneOf(stage)) === 'slide' && (await stage.locator('[data-stage="words"] h1').innerText()) === 'What we hold'))

  // ── A second presenter takes the stage ──────────────────────────────────────────────
  log('— a second presenter —')
  const other = await ctx.newPage()
  await other.goto(BASE + '/present', { waitUntil: 'networkidle' })
  await other.waitForSelector('[data-present="ready"]')
  board.check('a second console sees that someone is presenting', await until(other, 'other', async () => (await other.locator('[data-present="status"]').innerText()).includes('is presenting')))
  await other.keyboard.press('End')
  await other.click('button:has-text("Take the stage")')
  board.check('taking the stage moves it to the second presenter’s slide', await until(stage, 'taken', async () => (await stage.locator('[data-stage="words"] h1').innerText()) === 'Questions'))
  board.check('and the first console stops, and says who has it', await until(present, 'yielded', async () => (await present.locator('main').getAttribute('data-present')) === 'ready' && (await present.locator('[data-present="status"]').innerText()).includes('is presenting')))

  await other.click('button:has-text("Stop")')
  board.check('Stop makes the stage quiet at once', await until(stage, 'quiet', async () => (await stage.locator('[data-stage="quiet"]').count()) === 1, 3000))
  board.check('no page threw', errors.length === 0, errors)
  await ctx.close()
}

// ── A phone in the audience ───────────────────────────────────────────────────────────
{
  log('— a phone —')
  const ctx = await serving(await ctxWith(browser, { viewport: PHONE }))
  const present = await ctx.newPage()
  await present.goto(`${BASE}/present#k=${PASS}`, { waitUntil: 'networkidle' })
  await present.waitForSelector('[data-present="ready"]')
  await present.click('button:has-text("Go live")')
  const stage = await ctx.newPage()
  await stage.goto(BASE + '/stage', { waitUntil: 'networkidle' })
  await until(stage, 'slide', async () => (await sceneOf(stage)) === 'slide')
  const wide = await stage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  board.check('a slide does not scroll sideways on a phone', !wide)
  await stage.screenshot({ path: `${SHOTS}/stage-slide-390.png` })
  await ctx.close()
}

// ── Two devices: nothing shared but the network ───────────────────────────────────────
if (NET) {
  log('— two devices —')
  const a = await serving(await ctxWith(browser, { viewport: DESKTOP }), SEALED, { net: true })
  const b = await serving(await browser.newContext({ viewport: DESKTOP }), SEALED, { net: true })
  const present = await a.newPage()
  await present.goto(`${BASE}/present#k=${PASS}`, { waitUntil: 'networkidle' })
  await present.waitForSelector('[data-present="ready"]')
  const stage = await b.newPage()
  await stage.goto(BASE + '/stage', { waitUntil: 'networkidle' })
  await present.click('button:has-text("Go live")')
  board.check('a reader in another browser profile gets the slide over the network', await until(stage, 'net slide', async () => (await sceneOf(stage)) === 'slide' && (await stage.locator('[data-stage="words"] h1').innerText()) === 'A demo', 10000))
  board.check('the console counts them', await until(present, 'count', async () => (await present.locator('[data-present="status"]').innerText()).includes('1 person'), 10000))
  await present.keyboard.press('ArrowRight')
  board.check('and follows', await until(stage, 'net slide 2', async () => (await stage.locator('[data-stage="words"] h1').innerText()) === 'Three tiers', 5000))
  await present.click('button:has-text("Show the app")')
  board.check('the app crosses the network as a page', await until(stage, 'net mirror', async () => (await sceneOf(stage)) === 'mirror' && (await stage.locator('[data-stage="mirror"] header').count()) === 1, 10000))
  await stage.screenshot({ path: `${SHOTS}/stage-net-mirror.png` })
  await present.click('[data-stage="dock"] button:has-text("Stop")')
  board.check('Stop crosses it too', await until(stage, 'net quiet', async () => (await stage.locator('[data-stage="quiet"]').count()) === 1, 5000))
  await a.close()
  await b.close()
} else {
  log('— two devices: skipped (E2E_STAGE_NET=1 runs it) —')
}

await browser.close()
process.exit(board.report() === 0 ? 0 : 1)
