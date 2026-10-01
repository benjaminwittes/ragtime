/**
 * The presenter's kit at `/demo`, and the two ways into the docs this branch added.
 *
 * `npm test` covers the sealed format (`src/demo/kit.test.ts` seals with the script and
 * opens with the page's own code). This covers what a presenter meets: the link that
 * opens it, the passphrase leaving the address bar, a wrong passphrase said in words, the
 * deck's keys, and full screen taking the slide and nothing else.
 *
 * **It never touches the kit that is committed.** The driver seals a kit of its own with
 * a passphrase of its own and serves it in place of `/kits/demo.sealed.json`, so it needs
 * no secret and proves nothing about the real one except that the page can open one.
 *
 *   node e2e/demo.mjs
 *   E2E_BASE=http://localhost:5175/ragtime node e2e/demo.mjs
 */
import { launch, ctxWith, log, SHOTS, BASE, PHONE, DESKTOP, scoreboard } from './harness.mjs'
import { seal, parseDeck } from '../scripts/seal-kit.mjs'

const board = scoreboard('demo')

const PASS = 'driver-passphrase-not-a-secret'
const KIT = {
  title: 'A demo, for the driver',
  when: 'Any day · 12:00',
  guide: [
    '# Run of show',
    '',
    'Read this first. Then open [the tour](/?tour=1) and [the docs page](/?docs=connecting-claude).',
    '',
    '| When | What | Who |',
    '|---|---|---|',
    '| 12:00 | Overview | MF |',
    '| 12:08 | Part I | MF |',
    '',
    '- [ ] Open the site',
    '- [ ] Enter the demo password',
  ].join('\n'),
  slides: parseDeck(
    [
      '# A demo',
      'Put your questions in the chat.',
      '???',
      'Say hello. **Wait** for the room.',
      '---',
      'part: Part I',
      '# Three tiers',
      '- Search, with no AI',
      '- The Explorer, with AI',
      '- The workbench',
      '---',
      '# Questions',
      '> Ask me anything.',
    ].join('\n'),
  ),
}
const SEALED = JSON.stringify(await seal(JSON.stringify(KIT), PASS))

async function ctxServing(browser, viewport) {
  const ctx = await ctxWith(browser, { viewport })
  await ctx.route('**/kits/demo.sealed.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: SEALED }),
  )
  return ctx
}

const browser = await launch()

// ── No link: the page says who it is for, and a wrong passphrase is said in words ─────
{
  log('— locked —')
  const ctx = await ctxServing(browser, DESKTOP)
  const page = await ctx.newPage()
  await page.goto(BASE + '/demo', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-demo="locked"]')
  const text = await page.locator('main').innerText()
  board.check('without a passphrase the page shows none of the kit', !text.includes('Run of show') && !text.includes(KIT.title), text.slice(0, 120))
  await page.fill('[data-demo="locked"] input', 'not the passphrase')
  await page.click('[data-demo="locked"] button[type="submit"]')
  await page.waitForSelector('[data-demo="locked"] [role="alert"]')
  board.check('a wrong passphrase is refused in words', (await page.locator('[data-demo="locked"] [role="alert"]').innerText()).includes('does not open'))
  await page.screenshot({ path: `${SHOTS}/demo-locked.png` })
  await page.fill('[data-demo="locked"] input', PASS)
  await page.click('[data-demo="locked"] button[type="submit"]')
  await page.waitForSelector('[data-demo="guide"]')
  board.check('the right one opens the guide', (await page.locator('main').innerText()).includes('Run of show'))
  await ctx.close()
}

// ── The link: opens at once, and the passphrase leaves the address bar ────────────────
{
  log('— the link —')
  const ctx = await ctxServing(browser, DESKTOP)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/demo#k=${PASS}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-demo="guide"]')
  board.check('the link opens the guide with nothing to type', (await page.locator('h1').first().innerText()) === KIT.title)
  board.check('the passphrase is gone from the address bar', !page.url().includes(PASS), page.url())
  board.check('the guide renders its table', (await page.locator('main table tr').count()) === 3)
  const hrefs = await page.locator('main article a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.target]))
  board.check('in-app links carry the mount point and open beside the guide', hrefs.every(([href, target]) => href.startsWith(new URL(page.url()).pathname.replace(/\/demo$/, '/')) && target === '_blank'), hrefs)
  await page.screenshot({ path: `${SHOTS}/demo-guide.png` })

  // A second visit, no link: the device remembers.
  await page.goto(BASE + '/demo/deck', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-demo="stage"]')
  board.check('a second visit opens without the link', (await page.locator('[data-demo="stage"] h2').innerText()) === 'A demo')

  // ── The deck ────────────────────────────────────────────────────────────────────────
  log('— the deck —')
  board.check('the notes are under the slide, not on it', (await page.locator('[data-demo="stage"]').innerText()).includes('Say hello') === false && (await page.locator('main').innerText()).includes('Say hello'))
  await page.keyboard.press('ArrowRight')
  board.check('→ moves one slide', (await page.locator('[data-demo="stage"] h2').innerText()) === 'Three tiers')
  board.check('and the slide names its part', (await page.locator('[data-demo="stage"]').innerText()).toUpperCase().includes('PART I'))
  board.check('the address remembers the slide', page.url().endsWith('#s=2'), page.url())
  await page.screenshot({ path: `${SHOTS}/demo-deck.png` })
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  board.check('Space moves too, and stops on the last slide', (await page.locator('[data-demo="stage"] h2').innerText()) === 'Questions')
  board.check('Space did not scroll the page instead', (await page.evaluate(() => window.scrollY)) === 0)
  await page.keyboard.press('Home')
  board.check('Home goes back to the title', (await page.locator('[data-demo="stage"] h2').innerText()) === 'A demo')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-demo="stage"]')
  board.check('a reload comes back to the same slide', (await page.locator('[data-demo="stage"] h2').innerText()) === 'A demo')

  const fits = await page.evaluate(() => {
    const slide = document.querySelector('[data-demo="stage"] section')
    return { over: slide.scrollHeight > slide.clientHeight + 1, ratio: +(slide.clientWidth / slide.clientHeight).toFixed(2) }
  })
  board.check('the slide is 16:9 and nothing runs off it', !fits.over && Math.abs(fits.ratio - 1.78) < 0.02, fits)

  // Full screen: the stage, and only the stage.
  await page.click('button:has-text("Present")')
  await page.waitForTimeout(400)
  const full = await page.evaluate(() => {
    const el = document.fullscreenElement
    return el ? { stage: el.getAttribute('data-demo'), text: el.innerText } : null
  })
  if (full === null) {
    log('  skip  this Chrome refused full screen from a script; press F by hand to see it')
  } else {
    board.check('Present puts the stage on the whole screen', full.stage === 'stage')
    board.check('and the notes are not on it', !full.text.includes('Say hello'))
  }
  await ctx.close()
}

// ── A phone: the guide reads, the deck fits ───────────────────────────────────────────
{
  log('— a phone —')
  const ctx = await ctxServing(browser, PHONE)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/demo/deck#k=${PASS}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-demo="stage"]')
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  board.check('the deck does not scroll sideways', !wide)
  await page.screenshot({ path: `${SHOTS}/demo-deck-390.png` })
  await ctx.close()
}

// ── The docs: a link opens a page of them, and a page links onward ────────────────────
{
  log('— ?docs= —')
  const ctx = await ctxServing(browser, DESKTOP)
  const page = await ctx.newPage()
  await page.goto(BASE + '/?docs=connecting-claude', { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="dialog"] article')
  board.check('the docs open on the page the link named', (await page.locator('[role="dialog"] article h2').first().innerText()) === 'Using RAGtime in Claude')
  const pdf = await page.locator('[role="dialog"] article a:has-text("printable PDF")').evaluate((a) => [a.getAttribute('href'), a.target])
  board.check('its PDF link carries the mount point and opens in a new tab', pdf[0].endsWith('/guides/connect-claude.pdf') && pdf[0].startsWith(new URL(BASE).pathname) && pdf[1] === '_blank', pdf)
  const served = await page.evaluate(async (href) => {
    const r = await fetch(href)
    return [r.status, r.headers.get('content-type')]
  }, pdf[0])
  board.check('and the PDF is really served there', served[0] === 200 && String(served[1]).includes('pdf'), served)
  await page.screenshot({ path: `${SHOTS}/docs-connecting-claude.png` })

  await page.goto(BASE + '/?docs=no-such-page', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  board.check('a link to a page that does not exist opens nothing', (await page.locator('[role="dialog"]').count()) === 0)
  await ctx.close()
}

await browser.close()
process.exit(board.report() === 0 ? 0 : 1)
