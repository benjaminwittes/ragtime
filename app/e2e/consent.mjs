/**
 * The connector's consent page (`/oauth/consent`): signing in on it, and approving.
 *
 * `npm test` covers the words and the rules (`src/auth/oauth-consent.test.ts`,
 * `src/auth/sign-in.test.ts`). This covers what reading cannot: that the Google button is
 * there only when the auth project offers Google, that both ways of signing in come back to
 * this page with the same authorization, that a Lawfare address is not sent a link, and
 * that Approve is offered only to a session the service will accept.
 *
 * **Nothing here reaches the auth project or the service.** Every request under
 * `…/auth/v1/` and every `…/api/balance` is answered by the routes below, so no email is
 * sent, no account is made, nothing is approved and nobody is taken to Google.
 *
 *   node e2e/consent.mjs
 *   E2E_BASE=http://localhost:5175/ragtime node e2e/consent.mjs
 */
import { launch, ctxWith, log, SHOTS, BASE, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const board = scoreboard('consent')

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}
const asJson = (status, body) => ({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

const AUTHORIZATION = 'auth-1'
const PAGE = `${BASE}/oauth/consent?authorization_id=${AUTHORIZATION}`
const CLIENT_CALLBACK = 'https://client.invalid/callback'

/**
 * A context whose auth project and service are these routes. `google` is what the
 * project's settings say; `balance` is `[status, body]` for `/api/balance`.
 */
async function ctxConsent(browser, { google, balance = null, session = false, viewport = DESKTOP }) {
  const ctx = await ctxWith(browser, { viewport })
  const seen = { settings: 0, otp: [], authorize: [], details: 0, consent: [], balance: 0, other: [] }
  if (session) await ctx.addInitScript(SEED_SESSION)
  await ctx.route('**/auth/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.endsWith('/settings')) {
      seen.settings++
      return route.fulfill(asJson(200, { external: { email: true, google } }))
    }
    if (url.pathname.endsWith('/otp')) {
      seen.otp.push({ body: JSON.parse(req.postData() || '{}'), redirect: url.searchParams.get('redirect_to') })
      return route.fulfill(asJson(200, {}))
    }
    if (url.pathname.endsWith('/authorize')) {
      seen.authorize.push(url)
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>not Google</title>' })
    }
    if (url.pathname.endsWith(`/oauth/authorizations/${AUTHORIZATION}`)) {
      seen.details++
      return route.fulfill(asJson(200, {
        authorization_id: AUTHORIZATION,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        client: { id: 'client-1', name: 'Claude', uri: '', logo_uri: '' },
        user: { id: 'u-1', email: 'reader@lawfaremedia.org' },
        scope: 'email',
      }))
    }
    if (url.pathname.endsWith(`/oauth/authorizations/${AUTHORIZATION}/consent`)) {
      const body = JSON.parse(req.postData() || '{}')
      seen.consent.push(body)
      return route.fulfill(asJson(200, { redirect_url: `${CLIENT_CALLBACK}?decision=${body.action}` }))
    }
    seen.other.push(`${req.method()} ${url.pathname}`)
    return route.fulfill(asJson(404, {}))
  })
  await ctx.route('**/api/balance', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    seen.balance++
    const [status, body] = balance ?? [500, { error: { message: 'not stubbed' } }]
    return route.fulfill(asJson(status, body))
  })
  await ctx.route(`${CLIENT_CALLBACK}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>back at the client</title>' }),
  )
  return { ctx, seen }
}

// A session as a previous visit would have left it. Its token is never checked: the
// service is the route above.
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const session = {
  access_token: `${b64u({ alg: 'ES256', typ: 'JWT' })}.${b64u({ sub: 'u-1', email: 'reader@lawfaremedia.org', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'stub-refresh',
  user: { id: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'reader@lawfaremedia.org', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
}
const SEED_SESSION = `window.localStorage.setItem('sb-aikdbjprndgksibbvcfs-auth-token', ${JSON.stringify(JSON.stringify(session))})`

const GOOGLE = '[data-sign-in="google"]'
const SEND = 'button:has-text("Send sign-in link")'
const NOTICE = '[data-google-required]'
const SENTENCE = 'Lawfare addresses sign in with Google.'
const said = (page) => page.locator('main').innerText()

const browser = await launch()

// ── Signed out, Google off: the email form, as the page first shipped ─────────────────
{
  log('— signed out, Google off —')
  const { ctx, seen } = await ctxConsent(browser, { google: false })
  const page = await ctx.newPage()
  await page.goto(PAGE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-consent="sign-in"]')
  await page.waitForTimeout(400)
  board.check('the page asked the project what it offers', seen.settings >= 1, seen)
  board.check('no Google button', (await page.locator(GOOGLE).count()) === 0)
  board.check('and no divider with nothing above it', !(await said(page)).toLowerCase().includes('or by email'))
  board.check('no Approve before signing in', (await page.locator('button:has-text("Approve")').count()) === 0)

  // The fallback: with Google off a Lawfare address is sent a link like anyone's, or
  // those people could not sign in at all.
  await page.fill('input[type="email"]', 'reader@lawfaremedia.org')
  board.check('a Lawfare address is not turned away when there is no Google to send it to', (await page.locator(NOTICE).count()) === 0)
  await page.click(SEND)
  await page.waitForSelector(':text("Check your email")')
  board.check('an email is asked for once, for that address', seen.otp.length === 1 && seen.otp[0].body.email === 'reader@lawfaremedia.org', seen.otp)
  board.check('and its link comes back to this page with the same authorization', seen.otp[0]?.redirect === PAGE, seen.otp[0])
  board.check('nothing else was asked of the auth project', seen.other.length === 0, seen.other)
  await ctx.close()
}

// ── Signed out, Google on: the button, the divider, the email form under it ───────────
for (const viewport of [DESKTOP, PHONE]) {
  log(`— signed out, Google on, ${viewport.width} —`)
  const { ctx, seen } = await ctxConsent(browser, { google: true, viewport })
  const page = await ctx.newPage()
  await page.goto(PAGE, { waitUntil: 'networkidle' })
  await page.waitForSelector(GOOGLE)
  board.check('the button is there, with its words', (await page.locator(GOOGLE).innerText()).trim() === 'Continue with Google')
  board.check('the divider says a second way follows', (await said(page)).toLowerCase().includes('or by email'))
  const order = await page.evaluate(([g, s]) => {
    const google = document.querySelector(g).getBoundingClientRect()
    const send = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(s)).getBoundingClientRect()
    return { above: google.bottom <= send.top, fits: google.left >= 0 && google.right <= window.innerWidth && google.width > 150 }
  }, [GOOGLE, 'Send sign-in link'])
  board.check('the email form is under the button', order.above, order)
  board.check('and the button fits the page', order.fits, order)
  await page.screenshot({ path: `${SHOTS}/consent-signin-${viewport.width}.png` })

  await Promise.all([page.waitForURL('**/auth/v1/authorize**'), page.click(GOOGLE)])
  const went = seen.authorize[0]
  board.check('pressing it leaves for the auth project, asking for Google', went?.searchParams.get('provider') === 'google', went?.href)
  board.check('to come back to this page with the same authorization', went?.searchParams.get('redirect_to') === PAGE, went?.href)
  board.check('no email was asked for', seen.otp.length === 0, seen.otp)
  await ctx.close()
}

// ── Signed out, Google on, a Lawfare address: no link, and the button pointed at ──────
{
  log('— a Lawfare address, Google on —')
  const { ctx, seen } = await ctxConsent(browser, { google: true })
  const page = await ctx.newPage()
  await page.goto(PAGE, { waitUntil: 'networkidle' })
  await page.waitForSelector(GOOGLE)
  await page.fill('input[type="email"]', 'Reader@LawfareMedia.org')
  await page.waitForSelector(NOTICE)
  const notice = (await page.locator(NOTICE).innerText()).trim()
  board.check('the page says the sentence', notice.startsWith(SENTENCE), notice)
  board.check('and points at the button', notice.includes('button above') && (await page.locator(`${GOOGLE}[data-pointed-at]`).count()) === 1, notice)
  board.check('the link cannot be asked for', await page.locator(SEND).isDisabled())
  await page.press('input[type="email"]', 'Enter')
  await page.waitForTimeout(300)
  board.check('and Enter does not ask for one either', seen.otp.length === 0, seen.otp)
  await page.screenshot({ path: `${SHOTS}/consent-lawfare-address.png` })

  await page.fill('input[type="email"]', 'reader@example.org')
  board.check('another address is not told this', (await page.locator(NOTICE).count()) === 0)
  board.check('and the button is no longer pointed at', (await page.locator(`${GOOGLE}[data-pointed-at]`).count()) === 0)
  await page.click(SEND)
  await page.waitForSelector(':text("Check your email")')
  board.check('and is sent its link, back to this page', seen.otp.length === 1 && seen.otp[0].redirect === PAGE, seen.otp)
  await ctx.close()
}

// ── Signed in: Approve or Deny, and who pays ──────────────────────────────────────────
for (const [name, balance, words] of [
  ['the account pays', [200, { balance_cents: 900, per_query_cap_cents: 500, ledger: [], billing: 'self' }], 'billed to your RAGtime balance.'],
  ['the organisation pays', [200, { balance_cents: 0, per_query_cap_cents: 500, ledger: [], billing: 'org', allowance: { calls_today: 17, daily_quota: 5000 } }], 'paid for by Lawfare.'],
  ['the service cannot be reached', [500, { error: { message: 'down' } }], 'or paid for by Lawfare when the account is covered.'],
]) {
  log(`— signed in, ${name} —`)
  const { ctx, seen } = await ctxConsent(browser, { google: true, session: true, balance })
  const page = await ctx.newPage()
  await page.goto(PAGE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-consent="decide"]')
  const text = await said(page)
  board.check('it says who is asking, and as whom', text.includes('Claude wants to use RAGtime as reader@lawfaremedia.org'), text)
  board.check('and where the person goes next', text.includes('claude.ai'), text)
  board.check('and who pays', text.includes(words), text)
  board.check('the service was asked about the account before Approve was offered', seen.balance >= 1, seen)
  board.check('no sign-in form', (await page.locator('input[type="email"]').count()) === 0)
  if (name === 'the account pays') await page.screenshot({ path: `${SHOTS}/consent-decide.png` })

  const approve = name !== 'the organisation pays'
  await Promise.all([page.waitForURL(`${CLIENT_CALLBACK}**`), page.click(`button:has-text("${approve ? 'Approve' : 'Deny'}")`)])
  board.check(`${approve ? 'Approve' : 'Deny'} tells the auth project so, once`, seen.consent.length === 1 && seen.consent[0].action === (approve ? 'approve' : 'deny'), seen.consent)
  board.check('and goes back to the client', page.url() === `${CLIENT_CALLBACK}?decision=${approve ? 'approve' : 'deny'}`, page.url())
  board.check('nothing unexpected was asked of the auth project', seen.other.length === 0, seen.other)
  await ctx.close()
}

// ── Signed in, but not by Google, on a Lawfare address: Google, and no Approve ────────
{
  log('— signed in, the service says google_required —')
  const refusal = [403, { error: { message: SENTENCE, code: 'google_required' } }]
  const { ctx, seen } = await ctxConsent(browser, { google: true, session: true, balance: refusal })
  const page = await ctx.newPage()
  await page.goto(PAGE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-consent="google-required"]')
  const text = await said(page)
  board.check('the page says the sentence', text.includes(SENTENCE), text)
  board.check('with the Google button', await page.locator(GOOGLE).isVisible())
  board.check('and no Approve', (await page.locator('button:has-text("Approve")').count()) === 0)
  board.check('and no raw error', !/403|google_required|Balance fetch failed/.test(text), text)
  board.check('and a way to sign out', text.includes('Sign out'), text)
  await page.screenshot({ path: `${SHOTS}/consent-google-required.png` })

  await Promise.all([page.waitForURL('**/auth/v1/authorize**'), page.click(GOOGLE)])
  const went = seen.authorize[0]
  board.check('the button leaves for Google', went?.searchParams.get('provider') === 'google', went?.href)
  board.check('to come back here with the same authorization', went?.searchParams.get('redirect_to') === PAGE, went?.href)
  board.check('nothing was approved', seen.consent.length === 0, seen.consent)
  await ctx.close()
}

// ── A failed return, and a page opened with nothing to approve ────────────────────────
{
  log('— a refusal at Google, and no authorization —')
  const { ctx } = await ctxConsent(browser, { google: true })
  const page = await ctx.newPage()
  const refused = 'error=access_denied&error_description=Call+this+number+instead'
  await page.goto(`${PAGE}&${refused}#${refused}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="alert"]')
  const alert = (await page.locator('[role="alert"]').innerText()).trim()
  board.check('a refusal at Google is said in our words', alert === 'Sign-in was cancelled or refused. Try again.', alert)
  board.check('and the authorization is still in the address', page.url() === PAGE, page.url())
  board.check('with the sign-in form still there', await page.locator(GOOGLE).isVisible())

  await page.goto(`${BASE}/oauth/consent`, { waitUntil: 'networkidle' })
  board.check('with no authorization the page says there is nothing to approve', (await said(page)).includes('nothing to approve'))
  board.check('and offers no sign-in', (await page.locator('input[type="email"]').count()) === 0)
  await ctx.close()
}

await browser.close()
process.exit(board.report() === 0 ? 0 : 1)
