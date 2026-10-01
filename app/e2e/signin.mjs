/**
 * Signing in: the Google button, the hourly email cap, and a return that brought no session.
 *
 * `npm test` covers the words (`src/auth/sign-in.test.ts`). This covers what reading
 * cannot: whether the button is there only when the auth project offers Google, whether
 * pressing it leaves for the right place, whether a refused email says something a person
 * can act on, and whether someone who followed a dead link is told so instead of landing on
 * a page that looks as though nothing happened.
 *
 * **Nothing here reaches the auth project.** Every request under `…/auth/v1/` is answered
 * by the route below, so no email is sent, no account is made and nobody is taken to
 * Google. What the page asked for is kept and checked.
 *
 *   node e2e/signin.mjs
 *   E2E_BASE=http://localhost:5175/ragtime node e2e/signin.mjs
 */
import { launch, ctxWith, log, SHOTS, BASE, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const board = scoreboard('signin')

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}
const asJson = (status, body) => ({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

/**
 * A context whose auth project is this function. `google` is what its settings say;
 * `settings` and `otp` are the statuses those two routes answer with.
 */
async function ctxAuth(browser, { google, settings = 200, otp = 200, viewport = DESKTOP }) {
  const ctx = await ctxWith(browser, { viewport })
  const seen = { settings: 0, otp: [], authorize: [], other: [] }
  await ctx.route('**/auth/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.endsWith('/settings')) {
      seen.settings++
      return route.fulfill(asJson(settings, settings === 200 ? { external: { email: true, google } } : { message: 'no' }))
    }
    if (url.pathname.endsWith('/otp')) {
      seen.otp.push({ body: JSON.parse(req.postData() || '{}'), redirect: url.searchParams.get('redirect_to') })
      return route.fulfill(
        otp === 200
          ? asJson(200, {})
          : asJson(otp, { code: otp, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }),
      )
    }
    if (url.pathname.endsWith('/authorize')) {
      seen.authorize.push(url)
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>not Google</title>' })
    }
    seen.other.push(`${req.method()} ${url.pathname}`)
    return route.fulfill(asJson(404, {}))
  })
  return { ctx, seen }
}

const SHEET = '[role="dialog"]'
const GOOGLE = `${SHEET} [data-sign-in="google"]`
const ALERT = `${SHEET} [role="alert"]`

/** Open the access sheet on the sign-in form. The harness's stub password opens it on Demo. */
async function openSignIn(page) {
  await page.click('button[aria-label="Configure AI access"]')
  await page.click(`${SHEET} [role="tab"]:has-text("Lawfare-billed")`)
  await page.waitForSelector(`${SHEET} button:has-text("Send sign-in link")`)
}

const browser = await launch()

// ── The project does not offer Google: the form is the one it always was ──────────────
{
  log('— Google off —')
  const { ctx, seen } = await ctxAuth(browser, { google: false })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await openSignIn(page)
  await page.waitForTimeout(400)
  board.check('the form asked the project what it offers', seen.settings >= 1, seen)
  board.check('no Google button', (await page.locator(GOOGLE).count()) === 0)
  board.check('the form says how the email works, where it always did', (await page.locator(`${SHEET} form`).innerText()).includes('We send a one-time sign-in link to your email'))

  await page.fill(`${SHEET} input[type="email"]`, 'reader@example.org')
  await page.click(`${SHEET} button:has-text("Send sign-in link")`)
  await page.waitForSelector(`${SHEET} :text("Check your email.")`)
  board.check('an email is asked for once, for that address', seen.otp.length === 1 && seen.otp[0].body.email === 'reader@example.org', seen.otp)
  board.check('and comes back to this page', seen.otp[0]?.redirect === new URL(BASE + '/').href, seen.otp[0])
  board.check('nothing else was asked of the auth project', seen.other.length === 0, seen.other)
  await ctx.close()
}

// ── The settings cannot be read: no button, and the email form still works ────────────
{
  log('— settings unreadable —')
  const { ctx, seen } = await ctxAuth(browser, { google: true, settings: 500 })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await openSignIn(page)
  await page.waitForTimeout(400)
  board.check('the form asked', seen.settings >= 1, seen)
  board.check('no Google button on a failed ask', (await page.locator(GOOGLE).count()) === 0)
  board.check('the email form is there', await page.locator(`${SHEET} input[type="email"]`).isVisible())
  await ctx.close()
}

// ── The project offers Google: the button, and where it goes ──────────────────────────
for (const viewport of [DESKTOP, PHONE]) {
  log(`— Google on, ${viewport.width} —`)
  const { ctx, seen } = await ctxAuth(browser, { google: true, viewport })
  const page = await ctx.newPage()
  await page.goto(BASE + '/explorer', { waitUntil: 'networkidle' })
  await openSignIn(page)
  await page.waitForSelector(GOOGLE)
  board.check('the button is there, with its words', (await page.locator(GOOGLE).innerText()).trim() === 'Continue with Google')
  board.check('the email form is still under it', await page.locator(`${SHEET} button:has-text("Send sign-in link")`).isVisible())
  const fits = await page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect()
    return r.left >= 0 && r.right <= window.innerWidth && r.width > 150
  }, GOOGLE)
  board.check('and it fits the sheet', fits)
  await page.screenshot({ path: `${SHOTS}/signin-google-${viewport.width}.png` })

  await Promise.all([page.waitForURL('**/auth/v1/authorize**'), page.click(GOOGLE)])
  const went = seen.authorize[0]
  board.check('pressing it leaves for the auth project, asking for Google', went?.searchParams.get('provider') === 'google', went?.href)
  board.check('to come back to the page it left', went?.searchParams.get('redirect_to') === new URL(BASE + '/explorer').href, went?.href)
  board.check('no email was asked for', seen.otp.length === 0, seen.otp)
  await ctx.close()
}

// ── The hourly cap: said in words, with the way round it when there is one ────────────
for (const google of [true, false]) {
  log(`— email cap, Google ${google ? 'on' : 'off'} —`)
  const { ctx } = await ctxAuth(browser, { google, otp: 429 })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await openSignIn(page)
  if (google) await page.waitForSelector(GOOGLE)
  else await page.waitForTimeout(400)
  await page.fill(`${SHEET} input[type="email"]`, 'reader@example.org')
  await page.click(`${SHEET} button:has-text("Send sign-in link")`)
  await page.waitForSelector(ALERT)
  const said = (await page.locator(ALERT).innerText()).trim()
  board.check('the refusal says what the limit is', said.includes('only a few sign-in emails an hour'), said)
  board.check(
    google ? 'and points at Google' : 'and does not point at a button that is not there',
    said.includes('Continue with Google') === google,
    said,
  )
  board.check('the address typed is kept', (await page.locator(`${SHEET} input[type="email"]`).inputValue()) === 'reader@example.org')
  if (google) await page.screenshot({ path: `${SHOTS}/signin-capped.png` })
  await ctx.close()
}

// ── A link that was already used: the page says so, once ──────────────────────────────
{
  log('— a dead link —')
  const { ctx, seen } = await ctxAuth(browser, { google: true })
  const page = await ctx.newPage()
  const dead = 'error=access_denied&error_code=otp_expired&error_description=Call+this+number+instead'
  await page.goto(`${BASE}/explorer?${dead}#${dead}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(ALERT)
  const said = (await page.locator(ALERT).innerText()).trim()
  board.check('the sheet is open on arrival, on the sign-in form', await page.locator(`${SHEET} button:has-text("Send sign-in link")`).isVisible())
  board.check('one sheet, not one per header', (await page.locator(SHEET).count()) === 1)
  board.check('it says the link is dead, in our words', said === 'That sign-in link has expired or was already used. Ask for a new one.', said)
  board.check('and not in the link’s', !(await page.locator('body').innerText()).includes('Call this number'))
  board.check('the address no longer carries the failure', page.url() === BASE + '/explorer', page.url())
  await page.screenshot({ path: `${SHOTS}/signin-dead-link.png` })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await openSignIn(page)
  board.check('opened again, the form has stopped saying it', (await page.locator(ALERT).count()) === 0)

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  board.check('and a reload does not bring the sheet back', (await page.locator(SHEET).count()) === 0)
  board.check('nothing else was asked of the auth project', seen.other.length === 0, seen.other)
  await ctx.close()
}

await browser.close()
process.exit(board.report() === 0 ? 0 : 1)
